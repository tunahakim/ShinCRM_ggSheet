/**
 * Lượt đăng nhập FBM theo hợp đồng chặng chung (`CURSOR_TABLE.login`): mỗi bước trang Login là một request GAS dựng (`loginRequestPlan`), Extension chỉ điền ô cần mật khẩu rồi gửi; response về GAS đọc và quyết bước sau.
 * Thứ tự: trang Login (salt) → database → đơn vị → Login → trang tài khoản (giá trị kiểm khóa trang) → ghi khóa trang → về trang chủ → authorize → grid User (danh tính). Về trang chủ trước authorize để request kế tiếp đọc được mã phiên và danh tính trên tab vừa tải.
 * Chặng không ghi kho, không ghi Log trực tiếp: trả `{ patch, next | end }`. Bước kết `loginEnd` là người điều phối ghi dấu lần thử, tắt tự đăng nhập khi sai tài khoản và đóng hoặc tiếp tục lượt.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Giá trị mặc định đã đo trên FBM thật khi người dùng không lưu và FBM không trả danh sách. */
FbmSync.LOGIN_DEFAULT_CHOICES = { database: 'FHN_CRM_App', unit: 'CTY' };

/**
 * Đầu vào chặng đọc qua cổng chủ: credential (bản nháp đăng nhập thử nằm trong ô lượt, không thì kho credential). Bước danh tính cần thêm kết quả đối chiếu liên kết với danh tính vừa đọc, nên đọc ở đây từ response (cổng `identityStatus` đọc kho liên kết).
 */
FbmSync.loginInputs = function (state, rawResponse) {
  var cursor = state.cursor || {}, input = { credential: FbmSync.loginCredential(cursor) };
  if (cursor.step === 'identity') {
    input.attempt = FbmSync.loginAttemptRead();
    var identity = FbmSync.identityUser(rawResponse);
    input.identity = identity;
    if (identity.ok) {
      input.runtime = { spreadsheetId: FbmSync.currentSpreadsheetId(), userId: identity.userId, username: identity.username, accountName: identity.accountName };
      if (!FbmSync.identityDraftFilled(cursor.expectedIdentity)) { input.bound = FbmSync.identityStatus(input.runtime); }
    }
  }
  return input;
};

/** Response trang HTML hoặc lệnh Extension: chỉ xét mã HTTP, vì thân không phải JSON nghiệp vụ (trang Login bị bộ phân loại hiểu là phiên hết hạn). */
FbmSync.loginReplyHttpOk = function (reply) {
  var status = Number(reply && reply.status || 0);
  return !!reply && reply.ok !== false && status >= 200 && status < 400;
};
/** Mã kết quả lệnh Extension (`pageKeyStore`, `navigate`) nằm trong thân `{"code": ...}`. */
FbmSync.loginCommandCode = function (reply) {
  var parsed = FbmSync.protocol.parse(String(reply && reply.body || '')) || {};
  return String(parsed.code || '');
};

/** Chặng đăng nhập: đọc response của bước `cursor.step`, trả bước sau hoặc kết quả. */
FbmSync.loginStage = function (ctx) {
  var state = ctx.state, cursor = state.cursor, reply = ctx.reply || {}, credential = ctx.inputs.credential, step = String(cursor.step || ''), facts = Object.assign({}, cursor.facts || {}), body = String(reply.body || ''), logs = [];
  var go = function (nextStep, message, extra) {
    var nextCursor = Object.assign({}, cursor, { step: nextStep, facts: facts }, extra || {});
    return { patch: { cursor: nextCursor, message: message, logs: logs }, next: FbmSync.loginStepRequest(nextCursor, credential, ctx.settings) };
  };
  var stop = function (end) { return { patch: { logs: logs }, end: end }; };
  if (step === 'page') {
    if (!FbmSync.loginReplyHttpOk(reply)) { return stop({ reason: 'transport' }); }
    facts.salt = FbmSync.loginSaltExtract(body);
    if (!facts.salt) { return stop({ code: 'LOGIN_SALT_MISSING', message: 'Không đọc được mã phiên đăng nhập từ trang Login FBM.' }); }
    return go('entity', 'Đang đọc danh sách database FBM...');
  }
  if (step === 'entity' || step === 'unit') {
    if (!FbmSync.loginReplyHttpOk(reply)) { return stop({ reason: 'transport' }); }
    var kind = step === 'entity' ? 'database' : 'unit';
    facts[kind] = FbmSync.loginChoicePick(body, kind, credential.public[kind], FbmSync.LOGIN_DEFAULT_CHOICES[kind]);
    return step === 'entity' ? go('unit', 'Đang đọc đơn vị FBM...') : go('login', 'Đang đăng nhập FBM...');
  }
  if (step === 'login') {
    var success = FbmSync.protocol.assertSuccess(reply), parsed = FbmSync.protocol.parse(reply) || {}, data = parsed.d !== undefined ? parsed.d : parsed;
    var reason = FbmSync.loginReplyReason(success, data, false);
    if (reason !== 'accepted') { return stop({ reason: reason, bug: success.bug, facts: FbmSync.loginResponseFacts(reply) }); }
    FbmSync.sessionIdentityClear(state);
    var accepted = go('account', 'Đăng nhập thành công; đang mở trang tài khoản FBM...');
    accepted.patch.session = state.session;
    return accepted;
  }
  if (step === 'account') {
    var decided = FbmSync.loginReplyHttpOk(reply) ? FbmSync.loginPageKeyDecide(body) : { ok: false, code: 'LOGIN_PAGE_KEY_UNVERIFIABLE' };
    if (decided.ok) { facts.pageKey = decided.pageKey; return go('pageKey', 'Đang lưu khóa trang FBM...'); }
    logs.push({ action: 'login_page_storage', outcome: LOG_WARN, reason: 'Không kiểm được khóa trang FBM sau đăng nhập; bảng dữ liệu trên tab FBM có thể trắng.', detail: { code: decided.code } });
    return go('home', 'Đang mở trang chủ FBM...');
  }
  if (step === 'pageKey') {
    var stored = FbmSync.loginCommandCode(reply);
    delete facts.pageKey;
    // Khóa không khớp giá trị kiểm: máy chủ giữ khóa của phiên trình duyệt đang sống, tab giữ nguyên khóa đó là đúng.
    if (stored !== 'LOGIN_PAGE_KEY_STORED' && stored !== 'LOGIN_PAGE_KEY_KEPT_EXISTING') { logs.push({ action: 'login_page_storage', outcome: LOG_WARN, reason: 'Tab FBM chưa lưu khóa trang sau đăng nhập; bảng dữ liệu trên tab FBM có thể trắng.', detail: { code: stored || 'LOGIN_PAGE_KEY_UNKNOWN' } }); }
    return go('home', 'Đang mở trang chủ FBM...');
  }
  if (step === 'home') {
    var opened = FbmSync.loginCommandCode(reply);
    if (opened !== 'FBM_PAGE_OPENED') { logs.push({ action: 'login_home_open', outcome: LOG_WARN, reason: 'Đăng nhập xong nhưng chưa mở được trang chủ FBM trên tab.', detail: { code: opened || 'FBM_HOME_OPEN_FAILED' } }); }
    return go('authorize', 'Đăng nhập thành công; đang xác minh đúng tài khoản FBM...');
  }
  if (step === 'authorize') {
    var authorized = FbmSync.extractAuthorized(reply);
    if (!authorized) { return stop({ code: 'LOGIN_IDENTITY_AUTHORIZE_FAILED', message: 'FBM không trả mã xác thực để kiểm tra tài khoản sau đăng nhập.', action: 'login_identity_failure', facts: FbmSync.loginResponseFacts(reply) }); }
    state.session.customerAuthorized = authorized;
    var verified = go('identity', 'Đã xác thực phiên; đang đọc mã và tên tài khoản FBM...');
    verified.patch.session = state.session;
    return verified;
  }
  if (step === 'identity') {
    var identity = ctx.inputs.identity;
    if (!identity.ok) { return stop({ code: identity.code || 'LOGIN_IDENTITY_INCOMPLETE', message: identity.message || 'Không đọc đủ nhận diện tài khoản FBM sau đăng nhập.', action: 'login_identity_failure' }); }
    var match = FbmSync.identityMatchDecide({ expected: cursor.expectedIdentity, bound: ctx.inputs.bound, runtime: ctx.inputs.runtime, page: FbmSync.pageIdentity(reply), pageReloaded: cursor.pageReloaded === true });
    if (match.status === 'PAGE_RELOAD') { return go('identity', 'Trang FBM trên tab chưa có mã và tên người đăng nhập; đang tải lại trang khách hàng để đối chiếu.', { pageReloaded: true }); }
    if (match.status === 'PAGE_MISSING') { return stop({ code: 'FBM_PAGE_IDENTITY_MISSING', message: 'Đăng nhập xong nhưng đã tải lại trang FBM vẫn không thấy mã và tên người đăng nhập trên trang; không xác minh được tài khoản.', action: 'login_identity_page_missing' }); }
    if (match.status !== 'BOUND') { return stop({ code: 'LOGIN_IDENTITY_MISMATCH', mismatch: true, runtime: ctx.inputs.runtime, action: 'login_identity_mismatch' }); }
    // Đăng nhập xong đúng tài khoản: phiên đã xác minh, và gỡ khóa lần thử nếu đang khóa (chỉ ghi khi đang khóa).
    var verified = stop({ ok: true, identity: identity, runtime: ctx.inputs.runtime });
    verified.patch.session = FbmSync.sessionIdentityVerify(state, identity).session;
    if (FbmSync.loginAttemptLocked(ctx.inputs.attempt)) { verified.patch.loginAttempt = FbmSync.loginAttemptMark(ctx.inputs.attempt, { kind: 'success' }, ctx.now, 0); }
    return verified;
  }
  var unknown = new Error('Bước đăng nhập lạ trong ô lượt: ' + step); unknown.code = 'LOGIN_STEP_UNKNOWN'; throw unknown;
};

/** Câu báo lỗi đăng nhập theo mục đích lượt; cổng Log cắt ở 240 ký tự nên câu phải ngắn. */
FbmSync.loginFailMessage = function (cursor, failure, reply, retryMinutes) {
  var fix = reply ? reply.fix : '';
  if (cursor.purpose === 'force') { return 'Hủy phiên cũ rồi đăng nhập không thành công: ' + failure + fix; }
  if (cursor.purpose === 'test') { return 'Đăng nhập thử không thành công: ' + failure + fix; }
  if (cursor.manual === true) { return 'Tự đăng nhập FBM không thành công: ' + failure + fix; }
  if (reply && reply.halt) { return 'Tự đăng nhập thất bại: ' + failure + ' Máy ngừng tự đăng nhập để tránh khóa tài khoản.' + fix; }
  return 'Tự đăng nhập thất bại: ' + failure + ' Chạy nền tự thử lại sau ' + retryMinutes + ' phút.' + fix;
};

/**
 * Bước kết của lượt đăng nhập (người điều phối). Thành công: đánh dấu phiên đã xác minh (gỡ khóa lần thử), rồi đóng lượt thử/hủy phiên cũ hoặc trả lượt đồng bộ đang chờ về chỗ cũ.
 * Hỏng: chỉ ghi dấu lần thử khi credential là bản đã lưu (bản nháp chưa lưu không chứng minh gì về bản lưu) và khi FBM đã từ chối hẳn hoặc lượt do máy tự chạy; sai tài khoản ở lượt tự động thì tắt tự đăng nhập. Máy không bao giờ tự hủy phiên cũ: chỉ mở nút cho người dùng khi FBM báo còn phiên cũ.
 */
FbmSync.loginEnd = function (state, end) {
  var cursor = state.cursor || {}, auto = cursor.purpose === 'auto';
  if (end.ok) { return FbmSync.loginSucceed(state, cursor, end); }
  var reply = end.reason ? FbmSync.LOGIN_REPLIES[end.reason] : null, retryMinutes = settingsValue(FbmSync.SETTING_SECTIONS.loginPolicy, 'retryMinutes');
  var failure = end.mismatch ? 'Tài khoản FBM vừa đăng nhập không khớp liên kết đã xác nhận.' : reply ? (end.reason === 'transport' && end.bug && (end.bug.Message || end.bug.message) || reply.text) : String(end.message || '');
  var saved = FbmSync.credentialRead(), storedCredential = !cursor.draft || (saved.configured && String(saved.credentialRef) === String(cursor.draft.credentialRef || ''));
  var halt = !!(reply && reply.halt);
  if (storedCredential && (halt || auto)) { FbmSync.stagePatchApply(state, { loginAttempt: FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'failure', message: failure, halt: halt }, Date.now(), retryMinutes) }); }
  if (end.mismatch && auto) { FbmSync.autoLoginTurnOff(); }
  state.loginForceOffered = end.reason === 'oldSession' && cursor.purpose !== 'force';
  state.loginForceResume = state.loginForceOffered ? FbmSync.loginForceResumeOf(state, cursor) : null;
  var message = end.mismatch
    ? (auto ? 'Đăng nhập thành công nhưng tài khoản FBM không khớp liên kết đã xác nhận; tự động đăng nhập đã được tắt.' : 'Đăng nhập thử thành công nhưng tài khoản FBM không khớp liên kết đã xác nhận.')
    : FbmSync.loginFailMessage(cursor, failure, reply, retryMinutes);
  var code = end.code || (auto ? 'AUTO_LOGIN_FAILED' : 'LOGIN_FAILED');
  FbmSync.sessionIdentityClear(state);
  FbmSync.stagePatchApply(state, { logs: [{ action: end.action || 'login_failure', outcome: LOG_ERROR, reason: message.slice(0, 240), detail: { code: code, phase: String(state.phase || ''), response: end.facts } }] });
  FbmSync.runFail(state, code, message, { cursor: {} });
  var result ={ ok: false, code: code, request: null, error: message, message: message };
  if (end.runtime) { result.identity = end.runtime; }
  return result;
};

/** Lượt đồng bộ FBM vừa chặn vì còn phiên cũ (thuần): chỉ lượt đồng bộ tay tự đăng nhập giữa chừng mới có lượt để mở lại sau "Hủy phiên cũ"; lượt nền tự chạy lại theo lịch, Đăng nhập thử và kiểm tra liên kết không có gì để chạy tiếp. Trả `{ mode, pack }` hoặc `null`. */
FbmSync.loginForceResumeOf = function (state, cursor) {
  return cursor.purpose !== 'auto' || state.origin !== 'manual' || FbmSync.START_SCAN_KINDS.indexOf(String(state.scan || '')) >= 0 ? null : { mode: FbmSync.modeOf(state.mode), pack: String(state.scanPack || '') };
};
/** Đăng nhập thành công. Hủy phiên cũ xong mà lượt bị chặn là lượt đồng bộ tay không đẩy thì mở lại đúng loại đó qua `FbmSync.start` (`follows` để Sidebar chờ tiếp lượt mới); lượt đẩy không mở lại vì phải duyệt lại trên dữ liệu lúc đó. Dòng Log kết thúc lượt (`login_test_ok`, `login_force_ok`) chỉ ghi ở đây: luồng đăng nhập là chủ duy nhất của dòng kết thúc lượt đăng nhập. */
FbmSync.loginSucceed = function (state, cursor, end) {
  state.lastFailureCode = ''; state.lastError = ''; state.retryable = false;
  if (cursor.purpose !== 'auto') {
    var force = cursor.purpose === 'force', resume = force ? cursor.resume || null : null, reopen = !!resume && !FbmSync.canWriteFbm(resume.mode);
    var message = force ? 'Đã hủy phiên cũ và đăng nhập đúng tài khoản FBM đã liên kết.' + (resume && !reopen ? ' Bấm Đồng bộ lại để duyệt và đẩy dữ liệu.' : '') : 'Đăng nhập thử thành công và đúng tài khoản FBM đã liên kết.';
    FbmSync.runClose(state, 'done', { message: message });
    FbmSync.stagePatchApply(state, { logs: [{ action: force ? 'login_force_ok' : 'login_test_ok', outcome: LOG_OK, reason: message, detail: { runId: String(state.runId || '') } }] });
    if (reopen) { return FbmSync.start({ mode: resume.mode, pack: resume.pack, origin: 'manual', manual: true, follows: state.runId }, state); }
    return { ok: true, code: 'LOGIN_OK', request: null, identity: end.runtime, message: message };
  }
  FbmSync.businessStepFinish(state, 'auto_login', 'ok', {});
  var back = cursor.afterLogin || {};
  if (!back.cursor || !back.cursor.kind) {
    var lost = 'Đăng nhập lại thành công nhưng không dựng lại được request đồng bộ.';
    FbmSync.stagePatchApply(state, { logs: [{ action: 'login_resume_failure', outcome: LOG_ERROR, reason: lost, detail: { code: 'AUTO_LOGIN_RESUME_FAILED', cursor: String(back.cursor && back.cursor.kind || '') } }] });
    FbmSync.runFail(state, 'AUTO_LOGIN_RESUME_FAILED', lost, { cursor: {} });
    return { ok: false, code: state.lastFailureCode, request: null, error: state.lastError };
  }
  FbmSync.stagePatchApply(state, { cursor: back.cursor, phase: back.phase || 'checking_session', entity: back.entity || '', message: 'Đăng nhập lại thành công; đang tiếp tục phiên đồng bộ...' });
  return { ok: true, request: FbmSync.cursorIssue(state) };
};

/**
 * Request của bước `cursor.step` dựng từ ô lượt: dùng cho bước kế trong chặng và cho lần phát lại khi đường truyền hỏng. Hai bước cuối dùng request hệ thống đã có (authorize, grid User); grid User sau lần tải lại trang mang lệnh tải lại tab.
 */
FbmSync.loginStepRequest = function (cursor, credential, cfg) {
  var step = String(cursor.step || '');
  if (step === 'authorize') { return FbmSync.authorizeRequest('customer', cfg); }
  if (step === 'identity') {
    var request = FbmSync.identityUserRequest(cfg);
    return cursor.pageReloaded === true ? FbmSync.pageReloadAttach(request) : request;
  }
  return FbmSync.loginRequestPlan(step, cursor.facts || {}, credential, { force: cursor.purpose === 'force' });
};
/** Request của ô lượt đăng nhập đang lưu, cho bảng cursor dựng lại (phát lại, tiếp tục): credential lấy theo ô lượt. */
FbmSync.loginCursorRequest = function (state, cfg) {
  return FbmSync.loginStepRequest(state.cursor, FbmSync.loginCredential(state.cursor), cfg);
};
/** Ô lượt mở đầu lượt đăng nhập (bước trang Login). `fields`: `purpose` (auto, test, force), `draft` (bản mã đăng nhập thử chưa lưu), `expectedIdentity`, `manual` và chỗ quay về của lượt đồng bộ. */
FbmSync.loginCursorOpen = function (fields) {
  return Object.assign({ kind: 'login', step: 'page', facts: {} }, fields);
};
/** Credential của lượt đăng nhập: bản nháp trong ô lượt, không thì kho credential. */
FbmSync.loginCredential = function (cursor) {
  return cursor && cursor.draft ? FbmSync.credentialShape(cursor.draft) : FbmSync.credentialRead();
};
