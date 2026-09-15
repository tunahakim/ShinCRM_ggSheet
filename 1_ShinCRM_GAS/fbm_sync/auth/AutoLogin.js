/** Điều phối cấu hình và request auto-login; không giữ mật khẩu bản rõ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.LOGIN_CONFIG_KEY = 'FBM_LOGIN_CONFIG_V1';
FbmSync.AUTO_LOGIN_LAST_ATTEMPT_KEY = 'FBM_AUTO_LOGIN_LAST_ATTEMPT_V1';
// Không thử dồn dập và tuyệt đối không ép logout phiên đang dùng ở máy khác.
FbmSync.AUTO_LOGIN_RETRY_MS = 30 * 60 * 1000;

FbmSync.loginConfigDefault = function () {
  return { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30, configured: false, credentialRef: '', envelope: null, public: {}, lastAttemptAt: 0, lastLoginAt: 0, nextRetryAt: 0, lastError: '' };
};

/** Chỉ đọc cấu hình đã mã hóa và loại envelope trước khi trả ra Sidebar. */
FbmSync.loginConfigRead = function () {
  var fallback = FbmSync.loginConfigDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.LOGIN_CONFIG_KEY), parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') { return fallback; }
    var retryMinutes = Number(parsed.retryMinutes);
    fallback = Object.assign(fallback, parsed, { public: parsed.public && typeof parsed.public === 'object' ? parsed.public : {}, envelope: parsed.envelope && typeof parsed.envelope === 'object' ? parsed.envelope : null, enabled: parsed.enabled !== false, autoOpenTab: parsed.autoOpenTab === true, retryEnabled: parsed.retryEnabled !== false, retryMinutes: isFinite(retryMinutes) ? Math.max(1, Math.min(1440, Math.round(retryMinutes))) : fallback.retryMinutes, configured: !!parsed.credentialRef && !!parsed.envelope });
    return fallback;
  } catch (ignore) { return fallback; }
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
  var current = FbmSync.loginConfigRead(), retryMinutes = Number(value.retryMinutes === undefined ? current.retryMinutes : value.retryMinutes);
  if (!isFinite(retryMinutes) || retryMinutes < 1 || retryMinutes > 1440) { return { ok: false, code: 'AUTO_LOGIN_RETRY_INVALID', message: 'Chu kỳ tự đăng nhập lại phải từ 1 đến 1.440 phút.' }; }
  var saved = { enabled: value.enabled !== false, autoOpenTab: value.autoOpenTab === true, retryEnabled: value.retryEnabled !== false, retryMinutes: Math.round(retryMinutes), credentialRef: ref, envelope: { version: Number(envelope.version || 1), alg: String(envelope.alg || 'AES-GCM'), iv: String(envelope.iv), ciphertext: String(envelope.ciphertext) }, public: safePublic, lastAttemptAt: Number(current.lastAttemptAt || 0), lastLoginAt: Number(current.lastLoginAt || 0), nextRetryAt: Number(current.nextRetryAt || 0), lastError: '' };
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(saved));
  return { ok: true, configured: true, enabled: saved.enabled, credentialRef: ref, public: safePublic };
};

FbmSync.loginConfigPublic = function () {
  var value = FbmSync.loginConfigRead();
  return { ok: true, enabled: value.enabled !== false, autoOpenTab: value.autoOpenTab === true, retryEnabled: value.retryEnabled !== false, retryMinutes: Number(value.retryMinutes || 30), configured: value.configured === true, public: value.public || {}, lastAttemptAt: Number(value.lastAttemptAt || 0), lastLoginAt: Number(value.lastLoginAt || 0), nextRetryAt: Number(value.nextRetryAt || 0), lastError: String(value.lastError || '') };
};

FbmSync.loginConfigSetEnabled = function (enabled) {
  var value = FbmSync.loginConfigRead();
  value.enabled = enabled === true;
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return FbmSync.loginConfigPublic();
};
FbmSync.loginConfigPolicySave = function (input) {
  var value = input || {}, current = FbmSync.loginConfigRead(), retryMinutes = Number(value.retryMinutes === undefined ? current.retryMinutes : value.retryMinutes);
  if (!isFinite(retryMinutes) || retryMinutes < 1 || retryMinutes > 1440) { return { ok: false, code: 'AUTO_LOGIN_RETRY_INVALID', message: 'Chu kỳ tự đăng nhập lại phải từ 1 đến 1.440 phút.' }; }
  current.enabled = value.enabled === true;
  current.autoOpenTab = value.autoOpenTab === true;
  current.retryEnabled = value.retryEnabled !== false;
  current.retryMinutes = Math.round(retryMinutes);
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(current));
  return FbmSync.loginConfigPublic();
};

FbmSync.autoLoginCanAttempt = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED' }; }
  if (!value.enabled || !value.configured) { return { ok: false, code: 'AUTO_LOGIN_NOT_CONFIGURED' }; }
  if (!value.retryEnabled && value.lastAttemptAt) { return { ok: false, code: 'AUTO_LOGIN_RETRY_DISABLED' }; }
  var last = Number(value.lastAttemptAt || 0);
  var retryMs = Math.max(1, Number(value.retryMinutes || 30)) * 60 * 1000;
  if (last && at - last < retryMs) { return { ok: false, code: 'AUTO_LOGIN_THROTTLED', retryAt: last + retryMs }; }
  return { ok: true, credentialRef: value.credentialRef };
};

FbmSync.autoLoginMarkAttempt = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  value.lastAttemptAt = at;
  value.nextRetryAt = at + Math.max(1, Number(value.retryMinutes || 30)) * 60 * 1000;
  FbmSync.props().setProperty(FbmSync.AUTO_LOGIN_LAST_ATTEMPT_KEY, String(at));
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return at;
};

FbmSync.autoLoginMarkSuccess = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  value.lastLoginAt = at;
  value.nextRetryAt = 0;
  value.lastError = '';
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return at;
};

FbmSync.autoLoginMarkFailure = function (message) {
  var value = FbmSync.loginConfigRead();
  value.lastError = String(message || 'Tự đăng nhập FBM thất bại.').slice(0, 240);
  value.nextRetryAt = Number(value.lastAttemptAt || Date.now()) + Math.max(1, Number(value.retryMinutes || 30)) * 60 * 1000;
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return FbmSync.loginConfigPublic();
};

/** Nhận payload cookie do adapter login/capture trả về; không dựng request FBM. */
FbmSync.applyTransportSession = function (state, response) {
  var parsed = FbmSync.protocol.parse(response) || {}, transport = parsed._transport || {}, captured = transport.payloadCookie || transport.captures && transport.captures.payloadCookie;
  if (!captured) { return false; }
  state.session = state.session || {};
  state.session.cookie = String(captured);
  var compact = state.session.cookie.indexOf('FHN_CRM_App') >= 0 ? state.session.cookie.slice(0, state.session.cookie.indexOf('FHN_CRM_App')) : '';
  if (!state.session.userId && compact.length > 9) { state.session.userId = compact.slice(4, -5); }
  return true;
};

FbmSync.loginRequest = function (credentialRef, testOnly) {
  var cfg = FbmSync.scriptSettings();
  var login = { url: cfg.baseUrl + '/Main/Login.aspx/Login', body: {}, meta: { kind: 'login', credentialRef: String(credentialRef || ''), testOnly: testOnly === true } };
  var policy = FbmSync.loginConfigRead();
  if (policy.autoOpenTab === true) { login.meta.openFbmContext = { url: cfg.baseUrl + '/Main/zccrAccount.aspx', active: false }; }
  return login;
};

FbmSync.loginTestRequest = function (credentialRef) {
  var ref = String(credentialRef || '').trim();
  if (!ref) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: 'Chưa có thông tin đăng nhập để thử.' }; }
  var state = FbmSync.stateRead(), active = FbmSync.ACTIVE_PHASES && FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
  if (state.activeRequestId || (state.runId && active)) { return { ok: false, code: 'SYNC_ALREADY_RUNNING', message: 'Đang có phiên đồng bộ; chưa thể đăng nhập thử.' }; }
  state.phase = 'checking_session';
  state.entity = '';
  state.cursor = { kind: 'login', credentialRef: ref, testOnly: true, purpose: 'test' };
  state.message = 'Đang đăng nhập thử và xác minh tài khoản FBM...';
  state.lastError = '';
  state.lastFailureCode = '';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.loginRequest(ref, true)), status: FbmSync.statusView() };
};

FbmSync.loginTestResult = function (response) { return FbmSync.continue(response); };

FbmSync.loginCursorNext = function (cursor, kind) {
  var current = cursor || {};
  return {
    kind: kind,
    credentialRef: String(current.credentialRef || ''),
    purpose: String(current.purpose || (current.testOnly ? 'test' : 'auto')),
    testOnly: current.testOnly === true,
    resumeCursor: Object.assign({}, current.resumeCursor || {}),
    resumePhase: String(current.resumePhase || ''),
    resumeEntity: String(current.resumeEntity || ''),
    resumeHeartbeat: current.resumeHeartbeat === true
  };
};

/** Sau adapter login, GAS luôn authorize và đọc User trước khi tin phiên mới. */
FbmSync.loginAdapterContinue = function (state, cursor, response) {
  var success = FbmSync.protocol.assertSuccess(response), parsed = FbmSync.protocol.parse(response) || {}, data = parsed && parsed.d !== undefined ? parsed.d : parsed;
  if (!success.ok || data === false || FbmSync.protocol.isSessionExpired(response)) {
    var failure = success.bug && (success.bug.Message || success.bug.message) || 'Đăng nhập FBM thất bại.';
    if (!cursor.testOnly && FbmSync.autoLoginMarkFailure) { FbmSync.autoLoginMarkFailure(failure); }
    state.phase = 'paused'; state.cursor = {}; state.lastFailureCode = cursor.testOnly ? 'LOGIN_FAILED' : 'AUTO_LOGIN_FAILED'; state.retryable = false; state.lastError = failure;
    state.message = cursor.testOnly ? 'Đăng nhập thử không thành công; hãy kiểm tra lại thông tin FBM.' : 'Tự đăng nhập thất bại; sẽ thử lại sau 30 phút.';
    FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.message, message: state.message };
  }
  state.session = state.session || {};
  state.session.expired = false;
  state.cursor = FbmSync.loginCursorNext(cursor, 'login_identity_authorize');
  state.message = 'Đăng nhập thành công; đang xác minh đúng tài khoản FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authorizeRequest('customer')), status: FbmSync.statusView() };
};

FbmSync.loginAuthorizeContinue = function (state, cursor, response) {
  var authorized = FbmSync.extractAuthorized(response);
  if (!authorized) {
    state.phase = 'paused'; state.cursor = {}; state.lastFailureCode = 'LOGIN_IDENTITY_AUTHORIZE_FAILED'; state.lastError = 'FBM không trả mã xác thực để kiểm tra tài khoản sau đăng nhập.'; state.message = state.lastError; FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError, message: state.lastError };
  }
  state.session.customerAuthorized = authorized;
  state.cursor = FbmSync.loginCursorNext(cursor, 'login_identity_user');
  state.message = 'Đã xác thực phiên; đang đọc mã và tên tài khoản FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.identityUserRequest()), status: FbmSync.statusView() };
};

FbmSync.loginIdentityContinue = function (state, cursor, response) {
  var identity = FbmSync.identityUser(response);
  if (!identity.ok) {
    state.phase = 'paused'; state.cursor = {}; state.lastFailureCode = identity.code || 'LOGIN_IDENTITY_INCOMPLETE'; state.lastError = identity.message || 'Không đọc đủ nhận diện tài khoản FBM sau đăng nhập.'; state.message = state.lastError; FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError, message: state.lastError };
  }
  var runtime = { spreadsheetId: FbmSync.currentSpreadsheetId(), userId: identity.userId, username: identity.username, accountName: identity.accountName };
  var match = FbmSync.identityStatus(runtime);
  if (match.status !== 'BOUND') {
    if (!cursor.testOnly && FbmSync.loginConfigSetEnabled) { FbmSync.loginConfigSetEnabled(false); }
    state.phase = 'paused'; state.cursor = {}; state.lastFailureCode = 'LOGIN_IDENTITY_MISMATCH'; state.lastError = cursor.testOnly
      ? 'Đăng nhập thử thành công nhưng tài khoản FBM không khớp liên kết đã xác nhận.'
      : 'Đăng nhập thành công nhưng tài khoản FBM không khớp liên kết đã xác nhận; tự động đăng nhập đã được tắt.';
    state.message = state.lastError; FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, identity: runtime, status: FbmSync.statusView(), error: state.lastError, message: state.lastError };
  }
  state.session.userId = identity.userId;
  state.session.accountUsername = identity.username;
  state.session.accountName = identity.accountName;
  state.session.expired = false;
  state.lastFailureCode = '';
  state.lastError = '';
  state.retryable = false;
  if (cursor.testOnly || cursor.purpose === 'test') {
    state.cursor = {}; state.phase = 'done'; state.message = 'Đăng nhập thử thành công và đúng tài khoản FBM đã liên kết.'; FbmSync.stateWrite(state);
    return { ok: true, code: 'LOGIN_OK', request: null, identity: runtime, status: FbmSync.statusView(), message: state.message };
  }
  if (FbmSync.autoLoginMarkSuccess) { FbmSync.autoLoginMarkSuccess(); }
  FbmSync.stateWrite(state);
  var resumed = FbmSync.loginResumeRequest(state);
  if (!resumed) {
    state.phase = 'error'; state.lastFailureCode = 'AUTO_LOGIN_RESUME_FAILED'; state.lastError = 'Đăng nhập lại thành công nhưng không dựng lại được request đồng bộ.'; state.message = state.lastError; FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
  }
  return { ok: true, code: cursor.resumeHeartbeat ? 'AUTO_LOGIN_OK' : '', request: resumed, status: FbmSync.statusView(), autoLogin: true };
};

/** Đặt cursor login trước request đọc thất bại; request ghi không được tự lặp. */
FbmSync.beginAutoLogin = function (state, failedCursor, options) {
  var allowed = FbmSync.autoLoginCanAttempt();
  if (!allowed.ok) { return null; }
  var opt = options || {};
  FbmSync.autoLoginMarkAttempt();
  state.cursor = { kind: 'login', credentialRef: allowed.credentialRef, purpose: 'auto', resumeCursor: Object.assign({}, failedCursor || {}), resumePhase: String(state.phase || ''), resumeEntity: String(state.entity || ''), resumeHeartbeat: opt.heartbeat === true };
  state.phase = 'checking_session'; state.entity = ''; state.session.expired = true; state.message = 'Phiên FBM hết hạn; đang thử đăng nhập lại tự động...'; state.lastFailureCode = 'AUTO_LOGIN_STARTED';
  FbmSync.stateWrite(state);
  return FbmSync.loginRequest(allowed.credentialRef, false);
};

FbmSync.loginResumeRequest = function (state) {
  var cursor = state && state.cursor || {}, resume = cursor.resumeCursor || {};
  state.cursor = resume; state.phase = cursor.resumePhase || 'checking_session'; state.entity = cursor.resumeEntity || '';
  state.session.expired = false; state.message = 'Đăng nhập lại thành công; đang tiếp tục phiên đồng bộ...'; state.lastFailureCode = '';
  FbmSync.stateWrite(state);
  var request = FbmSync.requestForCursor(state);
  return request ? FbmSync.nextEnvelope(request) : null;
};
