/** Điều phối cấu hình và request auto-login; không giữ mật khẩu bản rõ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Bản đọc gộp hai kho đăng nhập (`LoginStores.js`) cho các chỗ đọc cũ; `envelope` là bản mã. */
FbmSync.loginConfigRead = function () {
  var credential = FbmSync.credentialRead(), attempt = FbmSync.loginAttemptRead();
  return Object.assign({ configured: credential.configured, credentialRef: credential.credentialRef, envelope: credential.ciphertext, public: credential.public }, attempt);
};

/** Nhận duy nhất envelope đã mã hóa từ Extension; không nhận credential bản rõ. */
FbmSync.loginConfigSave = function (input) {
  var value = input || {}, envelope = value.envelope;
  if (!envelope || typeof envelope !== 'object' || String(envelope.ciphertext || '').length < 16 || String(envelope.iv || '').length < 8) {
    return { ok: false, code: 'LOGIN_ENVELOPE_INVALID', message: 'Thông tin đăng nhập chưa được mã hóa hợp lệ.' };
  }
  var ref = String(value.credentialRef || '').trim();
  if (!ref || !/^[A-Za-z0-9_-]{8,120}$/.test(ref)) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: 'Thiếu mã tham chiếu thông tin đăng nhập.' }; }
  var publicMeta = value.public && typeof value.public === 'object' ? value.public : {};
  var safePublic = {
    usernameHint: String(publicMeta.usernameHint || '').slice(0, 80),
    database: String(publicMeta.database || '').slice(0, 80),
    unit: String(publicMeta.unit || '').slice(0, 40),
    language: String(publicMeta.language || 'v').slice(0, 8)
  };
  var attempt = FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'saved' }, Date.now(), 0);
  FbmSync.credentialWrite({ credentialRef: ref, ciphertext: envelope, public: safePublic });
  FbmSync.loginAttemptWrite(attempt);
  return { ok: true, configured: true, credentialRef: ref, public: safePublic };
};

/* Xóa credential cũ; đổi identity không được dùng lại mật khẩu A. Chính sách tự đăng nhập nằm ở cổng cài đặt nên không bị đụng tới. */
FbmSync.loginConfigClearCredential = function () {
  var attempt = FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'cleared' }, Date.now(), 0);
  FbmSync.credentialWrite(null);
  FbmSync.loginAttemptWrite(attempt);
  return FbmSync.loginConfigPublic();
};

FbmSync.loginConfigPublic = function () {
  var value = FbmSync.loginConfigRead();
  return { ok: true, configured: value.configured === true, credentialRef: value.configured ? String(value.credentialRef || '') : '', public: value.public || {}, lastAttemptAt: Number(value.lastAttemptAt || 0), lastLoginAt: Number(value.lastLoginAt || 0), nextRetryAt: Number(value.nextRetryAt || 0), lastError: String(value.lastError || '') };
};

/** Lượt người dùng bấm chạy thì không chịu chu kỳ chờ: chu kỳ chỉ để chạy nền không thử dồn dập, còn người bấm cần được thử ngay hoặc nhận hướng dẫn (chủ dự án chốt 2026-10-07). Lượt nền và heartbeat do máy tự gọi nên vẫn chịu chu kỳ. Cạm bẫy: mọi lượt chạy đều mở đầu bằng `session_probe`, nên không được loại theo loại cursor đó mà phải nhìn nguồn lượt. Mỗi lượt bấm vẫn chỉ thử một lần vì đăng nhập hỏng thì lượt kết thúc. */
FbmSync.autoLoginAttemptOptions = function (state, cursor) {
  // Probe chỉ là bước kiểm tra: việc thật là cursor nó sẽ trả về. Giữ phiên đi qua probe mà bị tính là lượt tay thì đăng nhập không chịu chu kỳ chờ.
  var target = cursor && cursor.kind === 'session_probe' ? FbmSync.sessionGateMeta(state).resumeCursor || {} : cursor;
  var kind = String(target && target.kind || '');
  return { manual: String(state && state.origin || '') === 'manual' && !!(state && state.runId) && kind !== 'heartbeat' };
};

FbmSync.autoLoginCanAttempt = function (now, options) {
  return FbmSync.autoLoginGate({ masterEnabled: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'), policy: settingsValues(FbmSync.SETTING_SECTIONS.loginPolicy), credential: FbmSync.credentialRead(), attempt: FbmSync.loginAttemptRead(), now: Number(now || Date.now()), manual: !!(options && options.manual === true) });
};

/** Lý do cổng không được tự đăng nhập, theo đúng kết quả autoLoginCanAttempt trả về.
 * Thông báo chờ phải mang lý do lần trước và giờ được thử lại: chỉ nói "đang chờ" thì người dùng bấm lại mãi mà không biết phải sửa gì (gặp thật 2026-10-07). */
FbmSync.autoLoginBlockMessage = function (code, blocked) {
  var lastError = String(FbmSync.loginConfigRead().lastError || '').trim();
  var reason = lastError ? ' Lý do lần trước: ' + lastError.replace(/[.\s]+$/, '') + '.' : '';
  var retryAt = Number(blocked && blocked.retryAt || 0), when = '';
  if (retryAt) { var at = new Date(retryAt); when = ' sau ' + ('0' + at.getHours()).slice(-2) + ':' + ('0' + at.getMinutes()).slice(-2); }
  var messages = {
    SYNC_DISABLED: 'Đồng bộ FBM đang tắt; không tự đăng nhập.',
    AUTO_LOGIN_NOT_CONFIGURED: 'Tự đăng nhập FBM đang tắt hoặc chưa được cấu hình; request đã bị chặn.',
    AUTO_LOGIN_HALTED: 'Máy đã ngừng tự đăng nhập FBM để tránh khóa tài khoản.' + reason + ' Hãy sửa thông tin ở màn Tài khoản hoặc bấm "Đăng nhập thử".',
    AUTO_LOGIN_RETRY_DISABLED: 'Lần tự đăng nhập FBM trước thất bại và đang tắt tự thử lại.' + reason + ' Hãy đăng nhập trên tab FBM hoặc bật thử lại trong Cài đặt phiên.',
    AUTO_LOGIN_THROTTLED: 'Lần tự đăng nhập FBM trước thất bại; để tránh khóa tài khoản, hệ thống chỉ tự thử lại' + (when || ' sau chu kỳ an toàn') + '.' + reason + ' Muốn kiểm tra ngay thì đăng nhập trên tab FBM hoặc bấm "Đăng nhập thử" trong cài đặt tài khoản.'
  };
  return messages[String(code || '')] || messages.AUTO_LOGIN_NOT_CONFIGURED;
};

/** Lý do đường truyền ghi sẵn lúc thử: lượt hỏng giữa đường không về tới bước ghi lý do mà khóa chờ đã đặt. FBM trả lời thì ghi đè. */
FbmSync.autoLoginMarkAttempt = function (now) {
  var at = Number(now || Date.now());
  FbmSync.loginAttemptWrite(FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'attempt', transportText: FbmSync.LOGIN_REPLIES.transport.text }, at, settingsValue(FbmSync.SETTING_SECTIONS.loginPolicy, 'retryMinutes')));
  return at;
};

FbmSync.autoLoginMarkSuccess = function (now) {
  var at = Number(now || Date.now());
  FbmSync.loginAttemptWrite(FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'success' }, at, 0));
  return at;
};

/** Bước duy nhất đánh dấu phiên đã xác minh đúng tài khoản (sau đăng nhập, đầu lượt). Phiên chạy được là bằng chứng mới nhất nên gỡ mọi khóa, kể cả sai mật khẩu (có thể đã đổi trên FBM). Chỉ ghi khi đang khóa. */
FbmSync.sessionVerifiedApply = function (state, identity) {
  FbmSync.sessionIdentityVerify(state, identity);
  var value = FbmSync.loginConfigRead();
  if (Number(value.lastAttemptAt || 0) > Number(value.lastLoginAt || 0) || value.loginHalted || String(value.lastError || '')) { FbmSync.autoLoginMarkSuccess(); }
  return state;
};

/** `halt`: FBM đã trả lời từ chối mà thử lại cũng không khá hơn (sai mật khẩu, câu trả lời chưa gặp), nên ngừng tự đăng nhập tới khi lưu lại thông tin hoặc đăng nhập thử được (09/01 "Ba kết quả của một lượt đăng nhập"). */
FbmSync.autoLoginMarkFailure = function (message, halt) {
  FbmSync.loginAttemptWrite(FbmSync.loginAttemptMark(FbmSync.loginAttemptRead(), { kind: 'failure', message: message, halt: halt === true }, Date.now(), settingsValue(FbmSync.SETTING_SECTIONS.loginPolicy, 'retryMinutes')));
  return FbmSync.loginConfigPublic();
};

/** Tắt tự đăng nhập qua cổng cài đặt khi đăng nhập xong mà sai tài khoản đã liên kết; không tắt được thì ném để không lặp lại đăng nhập sai tài khoản. */
FbmSync.autoLoginTurnOff = function () {
  var patches = {};
  patches[FbmSync.SETTING_SECTIONS.loginPolicy] = { enabled: false };
  var saved = settingsSave(patches);
  if (!saved.ok) { throw new Error('Không tắt được tự đăng nhập FBM: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
};

/** Nhận payload cookie do adapter login/capture trả về; không dựng request FBM. */
FbmSync.applyTransportSession = function (state, response) {
  var parsed = FbmSync.protocol.parse(response) || {}, transport = parsed._transport || {}, captured = transport.payloadCookie || transport.captures && transport.captures.payloadCookie;
  if (!captured) { return false; }
  state.session = state.session || {};
  state.session.cookie = String(captured);
  return true;
};

/**
 * Mở lượt đăng nhập thử (hoặc hủy phiên cũ). `draft` là bản nháp kết nối Sidebar vừa mã hóa nhưng chưa lưu (`{ credentialRef, ciphertext, public }`); không có thì dùng credential đã lưu. Bản nháp chỉ nằm trong ô lượt của lượt này, không ghi vào kho credential.
 * Không có danh tính mong đợi thì so với liên kết đã lưu.
 */
FbmSync.loginTestRequest = function (draft, expectedIdentity, options) {
  var force = !!(options && options.force === true), credential = draft ? FbmSync.credentialShape(draft) : FbmSync.credentialRead();
  if (!credential.configured) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: draft ? 'Thông tin đăng nhập chưa được mã hóa hợp lệ.' : 'Chưa có thông tin đăng nhập để thử.' }; }
  var state = FbmSync.stateRead(), active = FbmSync.ACTIVE_PHASES && FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
  if (state.activeRequestId || (state.runId && active)) { return { ok: false, code: 'SYNC_BUSY', message: 'Đang có phiên đồng bộ; chưa thể đăng nhập thử.' }; }
  var cursor = FbmSync.loginCursorOpen({
    purpose: force ? 'force' : 'test',
    draft: draft ? { credentialRef: credential.credentialRef, ciphertext: credential.ciphertext, public: credential.public } : null,
    expectedIdentity: expectedIdentity && typeof expectedIdentity === 'object' ? FbmSync.identityNormalize(expectedIdentity) : FbmSync.boundIdentity()
  });
  // Đăng nhập là một lượt riêng (nhãn Tay · Đăng nhập thử / Hủy phiên cũ): mã lượt mới để Extension nhận đúng lượt và dòng Log không lẫn với lượt trước.
  FbmSync.runOpen({ origin: 'manual', phase: 'checking_session', kindLabel: force ? 'Hủy phiên cũ' : 'Đăng nhập thử', cursor: cursor, message: force ? 'Đang hủy phiên cũ, đăng nhập và xác minh tài khoản FBM...' : 'Đang đăng nhập thử và xác minh tài khoản FBM...' });
  return { ok: true, request: FbmSync.sliceIssue(FbmSync.loginStepRequest(cursor, credential)), status: FbmSync.statusView() };
};

/**
 * Hủy phiên cũ chỉ khi người dùng bấm nút trên Sidebar và đã xác nhận (chủ dự án chốt 2026-10-07): FBM giữ khóa đăng nhập lâu hơn phiên thật, nên "phiên cũ" thường đã chết.
 * GAS chỉ mở nút ngay sau khi FBM trả lời từ chối (`loginForceOffered`); máy không bao giờ tự gọi hàm này, kể cả chạy nền. Dùng thông tin đăng nhập đã lưu và đối chiếu đúng tài khoản đã liên kết.
 */
FbmSync.loginForceRequest = function () {
  var state = FbmSync.stateRead(), saved = FbmSync.loginConfigRead();
  if (state.loginForceOffered !== true) { return { ok: false, code: 'LOGIN_FORCE_NOT_OFFERED', message: 'Chỉ hủy phiên cũ được ngay sau khi FBM vừa từ chối đăng nhập.' }; }
  if (!saved.configured) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: 'Chưa có thông tin đăng nhập đã lưu để đăng nhập.' }; }
  logEvent({ source: 'fbm_sync', action: 'login_force_requested', outcome: typeof LOG_WARN === 'undefined' ? 'warn' : LOG_WARN, reason: 'Người dùng xác nhận hủy phiên FBM cũ để đăng nhập lại.', detail: { runId: String(state.runId || '') } });
  return FbmSync.loginTestRequest(null, null, { force: true });
};

/**
 * Bảng duy nhất đọc nghĩa câu trả lời Login của FBM (`d`, gửi `force:false`), gặp thật 2026-10-07 và 2026-11-01: `true` vào được, `false` sai tên đăng nhập hoặc mật khẩu, `"Duplicate"` còn giữ phiên cũ. Giá trị khác chưa gặp nên báo "chưa biết", không đoán theo kiểu dữ liệu.
 * Câu "Đã đăng nhập… hủy phiên làm việc trước" là chữ trang Login tự hiện sau khi nhận `"Duplicate"`, không nằm trong response.
 */
FbmSync.LOGIN_REPLIES = {
  credentials: { text: 'FBM báo sai tên đăng nhập hoặc mật khẩu.', fix: ' Hãy sửa tên đăng nhập hoặc mật khẩu ở màn Tài khoản rồi bấm chạy lại.', halt: true },
  oldSession: { text: 'FBM còn giữ phiên đăng nhập cũ của tài khoản này.', fix: ' Bấm "Hủy phiên cũ và đăng nhập" hoặc tự đăng nhập trên tab FBM rồi bấm chạy lại.', halt: false },
  unknown: { text: 'FBM từ chối đăng nhập với câu trả lời chưa gặp (mã ghi trong Log).', fix: ' Hãy đăng nhập trên tab FBM để xem FBM báo gì rồi bấm "Đăng nhập thử".', halt: true },
  transport: { text: 'Không gọi được trang đăng nhập FBM.', fix: ' Kiểm tra tab FBM rồi bấm chạy lại.', halt: false }
};
FbmSync.loginReplyReason = function (success, data, expired) {
  if (!success.ok) { return 'transport'; }
  if (data === true && !expired) { return 'accepted'; }
  if (data === false) { return 'credentials'; }
  if (data === 'Duplicate') { return 'oldSession'; }
  return 'unknown';
};

/** Dấu hiệu an toàn của response đăng nhập hoặc authorize hỏng để Log chẩn đoán được: chỉ mã HTTP, độ dài, có phải JSON và tên khóa của `d`, không bao giờ ghi giá trị. */
// Log cấm cả chữ của trường nhạy cảm, kể cả khi chỉ là tên khóa, nên tên khóa loại này không được liệt kê.
FbmSync.LOGIN_FACT_HIDDEN_KEY = /authori|cookie|pass|token|salt|key/i;
FbmSync.loginResponseFacts = function (response) {
  var meta = FbmSync.traceResponse(response), parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d !== undefined ? parsed.d : parsed;
  // `d` dạng chuỗi chỉ ghi độ dài; giá trị chỉ ghi khi là mã chữ ngắn (`dCode`), vì chuỗi dài chưa biết FBM để gì trong đó.
  var textLength = typeof data === 'string' ? data.length : undefined;
  if (typeof data === 'string') { var inner = FbmSync.protocol.parse(data); data = inner && !inner.parseError ? inner : data; }
  return {
    httpStatus: meta.httpStatus, responseLength: meta.responseLength, json: !parsed.parseError,
    dType: data === null ? 'null' : typeof data, dTextLength: textLength,
    // Mã chữ ngắn như "Duplicate" là câu trả lời của FBM, không phải bí mật; ghi lại để nhận ra câu trả lời chưa gặp.
    dCode: typeof data === 'string' && /^[A-Za-z_]{1,40}$/.test(data) ? data : undefined,
    dKeys: data && typeof data === 'object' ? Object.keys(data).filter(function (key) { return key.charAt(0) !== '_' && !FbmSync.LOGIN_FACT_HIDDEN_KEY.test(key); }).slice(0, 20).join(',') : '',
    deniedFlag: !!(data && typeof data === 'object' && data.Authorized === false)
  };
};
/** Mở lượt đăng nhập tự động thay cho request đọc vừa gặp phiên hết hạn; ô lượt giữ chỗ quay về. Request ghi không được tự lặp. */
FbmSync.beginAutoLogin = function (state, failedCursor, options) {
  var attempt = FbmSync.autoLoginAttemptOptions(state, failedCursor), allowed = FbmSync.autoLoginCanAttempt(null, attempt);
  if (!allowed.ok) { return null; }
  var opt = options || {};
  var gate = FbmSync.sessionGateMeta(state);
  gate.loginAttempted = true;
  gate.probeRetryCount = 0;
  var resumeCursor = failedCursor && failedCursor.kind === 'session_probe' && gate.resumeCursor ? gate.resumeCursor : (failedCursor || {});
  FbmSync.autoLoginMarkAttempt();
  state.cursor = FbmSync.loginCursorOpen({ purpose: 'auto', manual: attempt.manual, resumeCursor: Object.assign({}, resumeCursor), resumePhase: String(gate.resumePhase || state.phase || ''), resumeEntity: String(gate.resumeEntity || state.entity || ''), resumeHeartbeat: opt.heartbeat === true || resumeCursor.kind === 'heartbeat' });
  state.phase = 'checking_session'; state.entity = ''; state.session.expired = true; state.message = 'Phiên FBM hết hạn; đang thử đăng nhập lại tự động...'; state.lastFailureCode = 'AUTO_LOGIN_STARTED';
  FbmSync.businessStepStart(state, 'auto_login', { mode: state.mode, scan: state.scan });
  FbmSync.sessionIdentityClear(state);
  FbmSync.stateWrite(state);
  return FbmSync.loginStepRequest(state.cursor, FbmSync.credentialRead());
};

FbmSync.loginResumeRequest = function (state) {
  var cursor = state && state.cursor || {}, resume = cursor.resumeCursor || {};
  state.cursor = resume; state.phase = cursor.resumePhase || 'checking_session'; state.entity = cursor.resumeEntity || '';
  state.session.expired = false; state.message = 'Đăng nhập lại thành công; đang tiếp tục phiên đồng bộ...'; state.lastFailureCode = '';
  FbmSync.stateWrite(state);
  var request = FbmSync.cursorRequest(state);
  return request ? FbmSync.nextEnvelope(request) : null;
};
