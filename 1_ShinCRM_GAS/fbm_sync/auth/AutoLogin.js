/** Điều phối cấu hình và request auto-login; không giữ mật khẩu bản rõ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.LOGIN_CONFIG_KEY = 'FBM_LOGIN_CONFIG_V1';
FbmSync.AUTO_LOGIN_LAST_ATTEMPT_KEY = 'FBM_AUTO_LOGIN_LAST_ATTEMPT_V1';
// Không thử dồn dập và tuyệt đối không ép logout phiên đang dùng ở máy khác.
FbmSync.AUTO_LOGIN_RETRY_MS = 30 * 60 * 1000;

FbmSync.loginConfigDefault = function () {
  return { enabled: true, configured: false, credentialRef: '', envelope: null, public: {}, lastAttemptAt: 0, lastLoginAt: 0, lastError: '' };
};

/** Chỉ đọc cấu hình đã mã hóa và loại envelope trước khi trả ra Sidebar. */
FbmSync.loginConfigRead = function () {
  var fallback = FbmSync.loginConfigDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.LOGIN_CONFIG_KEY), parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') { return fallback; }
    return Object.assign(fallback, parsed, { public: parsed.public && typeof parsed.public === 'object' ? parsed.public : {}, envelope: parsed.envelope && typeof parsed.envelope === 'object' ? parsed.envelope : null, enabled: parsed.enabled !== false, configured: !!parsed.credentialRef && !!parsed.envelope });
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
  var current = FbmSync.loginConfigRead();
  var saved = { enabled: value.enabled !== false, credentialRef: ref, envelope: { version: Number(envelope.version || 1), alg: String(envelope.alg || 'AES-GCM'), iv: String(envelope.iv), ciphertext: String(envelope.ciphertext) }, public: safePublic, lastAttemptAt: Number(current.lastAttemptAt || 0), lastLoginAt: Number(current.lastLoginAt || 0), lastError: '' };
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(saved));
  return { ok: true, configured: true, enabled: saved.enabled, credentialRef: ref, public: safePublic };
};

FbmSync.loginConfigPublic = function () {
  var value = FbmSync.loginConfigRead();
  return { ok: true, enabled: value.enabled !== false, configured: value.configured === true, public: value.public || {}, lastAttemptAt: Number(value.lastAttemptAt || 0), lastLoginAt: Number(value.lastLoginAt || 0), lastError: String(value.lastError || '') };
};

FbmSync.loginConfigSetEnabled = function (enabled) {
  var value = FbmSync.loginConfigRead();
  value.enabled = enabled === true;
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return FbmSync.loginConfigPublic();
};

FbmSync.autoLoginCanAttempt = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED' }; }
  if (!value.enabled || !value.configured) { return { ok: false, code: 'AUTO_LOGIN_NOT_CONFIGURED' }; }
  var last = Number(value.lastAttemptAt || 0);
  if (last && at - last < FbmSync.AUTO_LOGIN_RETRY_MS) { return { ok: false, code: 'AUTO_LOGIN_THROTTLED', retryAt: last + FbmSync.AUTO_LOGIN_RETRY_MS }; }
  return { ok: true, credentialRef: value.credentialRef };
};

FbmSync.autoLoginMarkAttempt = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  value.lastAttemptAt = at;
  FbmSync.props().setProperty(FbmSync.AUTO_LOGIN_LAST_ATTEMPT_KEY, String(at));
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return at;
};

FbmSync.autoLoginMarkSuccess = function (now) {
  var at = Number(now || Date.now()), value = FbmSync.loginConfigRead();
  value.lastLoginAt = at;
  value.lastError = '';
  FbmSync.props().setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(value));
  return at;
};

FbmSync.autoLoginMarkFailure = function (message) {
  var value = FbmSync.loginConfigRead();
  value.lastError = String(message || 'Tự đăng nhập FBM thất bại.').slice(0, 240);
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
  return { url: cfg.baseUrl + '/Main/Login.aspx/Login', body: {}, meta: { kind: 'login', credentialRef: String(credentialRef || ''), testOnly: testOnly === true } };
};

FbmSync.loginTestRequest = function (credentialRef) {
  var ref = String(credentialRef || '').trim();
  if (!ref) { return { ok: false, code: 'LOGIN_CREDENTIAL_REF_INVALID', message: 'Chưa có thông tin đăng nhập để thử.' }; }
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.loginRequest(ref, true)) };
};

FbmSync.loginTestResult = function (response) {
  var success = FbmSync.protocol.assertSuccess(response);
  if (!success.ok || FbmSync.protocol.isSessionExpired(response)) { return { ok: false, code: success.code || 'LOGIN_FAILED', message: 'Đăng nhập thử không thành công; hãy kiểm tra lại thông tin FBM.' }; }
  return { ok: true, code: 'LOGIN_OK', message: 'Đăng nhập thử thành công. Thông tin chưa được ghi vào Log.' };
};

/** Đặt cursor login trước request đọc thất bại; request ghi không được tự lặp. */
FbmSync.beginAutoLogin = function (state, failedCursor, options) {
  var allowed = FbmSync.autoLoginCanAttempt();
  if (!allowed.ok) { return null; }
  var opt = options || {};
  FbmSync.autoLoginMarkAttempt();
  state.cursor = { kind: 'login', credentialRef: allowed.credentialRef, resumeCursor: Object.assign({}, failedCursor || {}), resumePhase: String(state.phase || ''), resumeEntity: String(state.entity || ''), resumeHeartbeat: opt.heartbeat === true };
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
