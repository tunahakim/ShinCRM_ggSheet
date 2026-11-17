/**
 * Chặng phiên FBM (`CURSOR_TABLE.session`): nơi duy nhất kết luận tab FBM còn phiên sống, đúng tài khoản liên kết, hay phải đăng nhập lại.
 * Hai đường mở, cùng một công cụ `sessionGateOpen`: bước phát request gặp cursor có cổng khi phiên chưa xác minh (`issue`), hoặc chặng nhận phản hồi đáng ngờ (`suspected`). Ô lượt giữ chỗ quay về (`resume`) ngay trong cursor phiên, không có bản thứ hai.
 * Phiên sống thì trả lại đúng cursor cũ; sau phản hồi đáng ngờ chỉ request đọc được gửi lại một lần, request ghi dừng lượt. Phiên chết thì cổng tự đăng nhập quyết; chạy nền không bao giờ đăng nhập ép, mỗi lượt tự đăng nhập tối đa một lần.
 * Chặng không ghi ô lượt hay Log: trả `{ patch, next | end }`; bước kết `sessionEnd` là người điều phối đóng lượt hoặc mở lượt đăng nhập.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Cursor phiên và các ô đi kèm (phase, entity, message) để người gọi gộp vào ô lượt. `cause`: `issue` hoặc `suspected`; `replay`: request vừa đáng ngờ là request đọc gửi lại được.
 * Không lồng: cursor đang là cursor phiên thì không mở lần nữa (người gọi không bao giờ gặp, vì dòng `session` không có cổng và chặng phiên không trả phản hồi đáng ngờ).
 */
FbmSync.sessionGateOpen = function (state, cause, message, replay) {
  var current = state.cursor || {};
  if (current.kind === 'session') { var nested = new Error('Mở chặng phiên khi cursor đã là chặng phiên.'); nested.code = 'SESSION_GATE_NESTED'; throw nested; }
  var resume = { cursor: JSON.parse(JSON.stringify(current)), phase: String(state.phase || 'checking_session'), entity: String(state.entity || '') };
  return { cursor: { kind: 'session', cause: String(cause), resume: resume, replay: replay === true, probeRetried: false, pageReloaded: false }, phase: 'checking_session', entity: '', message: String(message) };
};

/** Request hỏi thử phiên: đọc grid User (danh tính người đăng nhập). Lần hỏi sau khi trang chưa hiện danh tính mang lệnh tải lại trang khách hàng. */
FbmSync.sessionProbeRequest = function (cursor, cfg) {
  var request = FbmSync.identityUserRequest(cfg);
  request.meta = Object.assign({}, request.meta || {}, { kind: 'session_probe' });
  return cursor && cursor.pageReloaded === true ? FbmSync.pageReloadAttach(request) : request;
};

/** Kết luận response hỏi thử. "Chưa xác thực" cũng là JSON có `d` nên xét trước "sống". `UNKNOWN`: lỗi khác (HTTP 5xx, thân hỏng) — xử như phiên không dùng được. */
FbmSync.sessionVerdictClassify = function (reply) {
  if (FbmSync.protocol.isUnauthenticatedResponse(reply)) { return 'EXPIRED'; }
  if (FbmSync.protocol.isLiveSessionResponse(reply)) { return 'LIVE'; }
  if (FbmSync.protocol.isSessionSuspicious(reply)) { return 'SUSPECT'; }
  return 'UNKNOWN';
};

/**
 * Đầu vào chặng đọc qua cổng chủ. Phiên sống và cursor nối lại có cổng: danh tính grid User, danh tính đang chạy và trạng thái liên kết (`identityStatus` đọc kho liên kết; kiểm liên kết đối chiếu bản nháp đã chụp nên không đọc kho).
 * Phiên không sống: đủ dữ kiện cho cổng tự đăng nhập. Lần thử luôn đọc, vì phiên sống cũng gỡ khóa lần thử.
 */
FbmSync.sessionInputs = function (state, reply) {
  var cursor = state.cursor || {}, resume = cursor.resume && cursor.resume.cursor || {}, verdict = FbmSync.sessionVerdictClassify(reply);
  var input = { verdict: verdict, gate: FbmSync.cursorTable(String(resume.kind || '')).gate, attempt: FbmSync.loginAttemptRead() };
  if (verdict === 'LIVE' && input.gate) {
    input.identity = FbmSync.identityUser(reply);
    if (input.identity.ok) {
      input.runtime = { spreadsheetId: FbmSync.currentSpreadsheetId(), userId: input.identity.userId, username: input.identity.username, accountName: input.identity.accountName };
      if (!FbmSync.sessionCheckTarget(state)) { input.bound = FbmSync.identityStatus(input.runtime); }
    }
  }
  if (verdict !== 'LIVE') { input.login = { masterEnabled: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'), policy: settingsValues(FbmSync.SETTING_SECTIONS.loginPolicy), credential: FbmSync.credentialRead() }; }
  return input;
};
/** Lượt kiểm liên kết đối chiếu bản nháp người dùng đang xem (chụp vào ô lượt lúc mở), không phải liên kết đã lưu. */
FbmSync.sessionCheckTarget = function (state) {
  return state.scan === 'identity_check' && state.identityTarget ? state.identityTarget : null;
};

/** Câu báo danh tính lệch: kiểm liên kết nêu từng trường lệch; lượt khác phân biệt lệch ở grid User hay ở trang FBM. */
FbmSync.sessionMismatchMessage = function (match, checking) {
  if (checking) { return 'Thông tin liên kết đang nhập không khớp tài khoản FBM đang mở ở: ' + FbmSync.identityMismatchLabels(match.reasons) + '.'; }
  return match.source === 'page' ? 'Mã hoặc tên người đăng nhập trên trang FBM không khớp liên kết đã xác nhận; request nghiệp vụ đã bị chặn.' : 'Tài khoản FBM hiện tại không khớp liên kết đã xác nhận; request nghiệp vụ đã bị chặn.';
};

FbmSync.SESSION_MESSAGES = {
  suspectedLive: 'FBM trả phản hồi đáng ngờ nhưng probe vẫn xác nhận phiên sống; request nghiệp vụ đã bị dừng để không gửi lại.',
  uncertain: 'Không xác minh được phiên FBM sau request đáng ngờ; request nghiệp vụ đã bị dừng.',
  afterLogin: 'Đăng nhập FBM đã hoàn tất nhưng probe phiên không đạt; đã dừng để tránh lặp đăng nhập.',
  expiredAtWrite: 'Phiên FBM không được xác minh trong lúc chờ ghi; đã chặn để tránh ghi trùng.',
  pageMissing: 'Đã tải lại trang FBM nhưng vẫn không thấy mã và tên người đăng nhập trên trang; không xác minh được tài khoản nên request nghiệp vụ đã bị chặn.'
};

/** Chặng phiên: đọc response hỏi thử, trả bước sau hoặc kết luận. */
FbmSync.sessionStage = function (ctx) {
  var state = ctx.state, cursor = state.cursor, input = ctx.inputs, resume = cursor.resume || {}, settings = ctx.settings;
  var fail = function (code, message, action, patch) {
    return { patch: Object.assign({}, patch || {}, { logs: [{ action: action, outcome: LOG_ERROR, reason: message, detail: { code: code, phase: String(state.phase || '') } }] }), end: { fail: { code: code, message: message } } };
  };
  var probeAgain = function (fields, message, code) {
    var next = Object.assign({}, cursor, fields);
    return { patch: { cursor: next, message: message, lastFailureCode: code || '' }, next: FbmSync.sessionProbeRequest(next, settings) };
  };
  if (input.verdict === 'LIVE') {
    var patch = {};
    if (input.gate) {
      var identity = input.identity, cleared = { session: FbmSync.sessionIdentityClear(state).session };
      if (!identity.ok) { return fail(identity.code || 'IDENTITY_PROBE_INCOMPLETE', identity.message, 'session_probe_failure', cleared); }
      var target = FbmSync.sessionCheckTarget(state), targetReasons = target ? FbmSync.identityMismatches(target, input.runtime) : null;
      var bound = target ? { status: targetReasons.length ? 'REBIND_REQUIRED' : 'BOUND', binding: target, reasons: targetReasons } : input.bound;
      var match = FbmSync.identityMatchDecide({ bound: bound, runtime: input.runtime, page: FbmSync.pageIdentity(ctx.reply), pageReloaded: cursor.pageReloaded === true });
      if (match.status === 'PAGE_RELOAD') { return probeAgain({ pageReloaded: true }, 'Trang FBM trên tab chưa có mã và tên người đăng nhập; đang tải lại trang khách hàng để đối chiếu.'); }
      if (match.status === 'PAGE_MISSING') { return fail('FBM_PAGE_IDENTITY_MISSING', FbmSync.SESSION_MESSAGES.pageMissing, 'session_probe_page_missing', cleared); }
      if (match.status !== 'BOUND') { return fail('SESSION_IDENTITY_MISMATCH', FbmSync.sessionMismatchMessage(match, !!target), match.source === 'page' ? 'session_probe_page_mismatch' : 'session_probe_mismatch', cleared); }
      patch.session = FbmSync.sessionIdentityVerify(state, identity).session;
      // Phiên chạy được là bằng chứng mới nhất nên gỡ mọi khóa lần thử, kể cả sai mật khẩu (có thể đã đổi trên FBM). Chỉ ghi khi đang khóa.
      if (FbmSync.loginAttemptLocked(input.attempt)) { patch.loginAttempt = FbmSync.loginAttemptMark(input.attempt, { kind: 'success' }, ctx.now, 0); }
    }
    if (cursor.cause === 'suspected') {
      var replays = Number(state.metadata && state.metadata.transportReplays || 0);
      if (cursor.replay !== true || replays >= FbmSync.BUDGET.transportReplaysPerRun) { return fail('SESSION_SUSPECTED_LIVE', FbmSync.SESSION_MESSAGES.suspectedLive, 'session_suspected_live', patch); }
      patch.metadata = { transportReplays: replays + 1, suspectReplayed: true };
      patch.logs = [{ action: 'session_suspected_replay', outcome: LOG_WARN, reason: 'FBM trả phản hồi đáng ngờ nhưng probe xác nhận phiên sống; gửi lại request đọc đúng một lần.', detail: { cursor: String(resume.cursor && resume.cursor.kind || '') } }];
    }
    Object.assign(patch, { cursor: resume.cursor, phase: resume.phase || 'checking_session', entity: resume.entity || '', lastFailureCode: '', message: 'Đã xác minh phiên FBM; đang tiếp tục...' });
    // Request nối lại dựng ở bước kết, sau khi ô lượt đã mang danh tính vừa xác minh: dựng ở đây thì cài đặt request còn là của phiên chưa xác minh (thiếu mã người dùng để lọc quyền).
    return { patch: patch, end: { resume: true } };
  }
  if (input.verdict === 'SUSPECT' && cursor.probeRetried !== true) { return probeAgain({ probeRetried: true }, 'Phản hồi FBM đáng ngờ; đang probe lại phiên đúng một lần.', 'SESSION_PROBE_RETRY'); }
  // Sau request đáng ngờ chỉ câu "chưa xác thực" rõ ràng mới kết luận phiên chết (người dùng đăng nhập nơi khác); còn lại không đủ chứng cứ để đăng nhập.
  if (cursor.cause === 'suspected' && input.verdict !== 'EXPIRED') { return fail('SESSION_PROBE_UNCERTAIN', FbmSync.SESSION_MESSAGES.uncertain, 'session_probe_failure'); }
  var cleared2 = { session: FbmSync.sessionIdentityClear(state).session };
  if (state.metadata && state.metadata.autoLoginTried === true) { return fail('SESSION_PROBE_FAILED_AFTER_LOGIN', FbmSync.SESSION_MESSAGES.afterLogin, 'session_probe_failure', cleared2); }
  if (resume.cursor && resume.cursor.kind === 'push_wait') {
    return { patch: Object.assign(cleared2, { logs: [{ action: 'session_expired_at_write', outcome: LOG_ERROR, reason: FbmSync.SESSION_MESSAGES.expiredAtWrite, detail: { code: 'SESSION_EXPIRED_AT_WRITE' } }] }), end: { pause: { code: 'SESSION_EXPIRED_AT_WRITE', message: FbmSync.SESSION_MESSAGES.expiredAtWrite, cursor: resume.cursor } } };
  }
  var manual = String(state.origin || '') === 'manual' && !!state.runId;
  var gate = FbmSync.autoLoginGate(Object.assign({ attempt: input.attempt, now: ctx.now, manual: manual }, input.login));
  if (!gate.ok) { return fail(gate.code, FbmSync.autoLoginBlockMessage(gate.code, gate, input.attempt.lastError), 'session_gate_blocked', cleared2); }
  return { patch: cleared2, end: { login: { manual: manual, afterLogin: resume } } };
};

/**
 * Bước kết của chặng phiên (người điều phối): phiên sống thì dựng lại request đang chờ từ cursor đã nối lại; lỗi thì đóng lượt lỗi; phiên hết hạn lúc chờ ghi thì tạm dừng giữ cursor ghi (người dùng kiểm tra FBM trước khi chạy lại); được tự đăng nhập thì mở lượt đăng nhập `auto` mang chỗ quay về.
 */
FbmSync.sessionEnd = function (state, end) {
  if (end.resume) {
    var request = FbmSync.cursorRequest(state);
    if (!request) { var empty = new Error('Đã xác minh phiên nhưng không dựng lại được request đang chờ.'); empty.code = 'SESSION_RESUME_FAILED'; throw empty; }
    return { ok: true, request: FbmSync.sliceIssue(state, request), status: FbmSync.statusView() };
  }
  if (end.login) { return FbmSync.autoLoginOpen(state, end.login); }
  var stop = end.fail || end.pause;
  if (end.fail) { FbmSync.runFail(state, stop.code, stop.message, { cursor: {} }); }
  else { FbmSync.runClose(state, 'paused', { code: stop.code, message: stop.message, error: stop.message, cursor: stop.cursor, keepRecords: true }); }
  FbmSync.stateWrite(state);
  return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
};

/**
 * Mở chặng phiên sau phản hồi đáng ngờ của request đang chạy (người điều phối, trigger thứ hai của `sessionGateOpen`).
 * Chỉ request đọc (`activeRequestReplay`) và chưa gửi lại lần nào kể từ lần đáng ngờ trước mới được gửi lại khi phiên còn sống; request ghi thì probe sống vẫn dừng, vì FBM có thể đã nhận lệnh ghi.
 */
FbmSync.sessionSuspectRun = function (state, message) {
  var replay = state.activeRequestReplay === true && !(state.metadata && state.metadata.suspectReplayed === true);
  FbmSync.stagePatchApply(state, FbmSync.sessionGateOpen(state, 'suspected', message, replay));
  return { ok: true, request: FbmSync.cursorIssue(state), status: FbmSync.statusView(), probing: true };
};
