/**
 * Hai kho đăng nhập tách theo người ghi: `FBM_CREDENTIAL_V1` (bản mã mật khẩu và phần công khai, chỉ lần lưu kết nối ghi) và `FBM_LOGIN_ATTEMPT_V1` (dấu lần thử, khóa chờ, khóa ngừng; lượt đăng nhập ghi). Tách ra để lần ghi dấu thử không bao giờ ghi lại bản credential cũ: gộp chung một khóa thì lượt đăng nhập đọc bản cũ, người dùng xóa credential giữa chừng, lượt ghi dấu thử là khôi phục credential đã xóa.
 * Không kho nào chứa mật khẩu, bản băm hay khóa giải mã: khóa nằm ở Extension, GAS chỉ giữ bản mã.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.CREDENTIAL_KEY = 'FBM_CREDENTIAL_V1';
FbmSync.LOGIN_ATTEMPT_KEY = 'FBM_LOGIN_ATTEMPT_V1';
/** Khóa đời cũ gộp cả hai kho; còn khóa này mà chưa có khóa mới thì cổng đọc ném, hàm chuyển `fbmLoginMigrate` tách và xóa. `FBM_LOGIN_CONFIG_V1` còn được hàm chuyển cài đặt cũ đọc. */
FbmSync.LOGIN_CONFIG_KEY = 'FBM_LOGIN_CONFIG_V1';
FbmSync.LOGIN_OLD_KEYS = [FbmSync.LOGIN_CONFIG_KEY, 'FBM_AUTO_LOGIN_LAST_ATTEMPT_V1'];
FbmSync.LOGIN_MIGRATOR = { name: 'fbmLoginMigrate', code: 'FBM_LOGIN_MIGRATION_PENDING' };

/** Dạng chuẩn của bản credential; thiếu ref hoặc bản mã thì là chưa cấu hình. */
FbmSync.credentialShape = function (stored) {
  var value = stored && typeof stored === 'object' ? stored : {}, cipher = value.ciphertext && typeof value.ciphertext === 'object' ? value.ciphertext : null, pub = value.public && typeof value.public === 'object' ? value.public : {};
  var ref = String(value.credentialRef || '');
  return {
    configured: !!ref && !!cipher,
    credentialRef: ref,
    ciphertext: cipher ? { version: Number(cipher.version || 1), alg: String(cipher.alg || 'AES-GCM'), iv: String(cipher.iv || ''), ciphertext: String(cipher.ciphertext || '') } : null,
    public: { usernameHint: String(pub.usernameHint || ''), database: String(pub.database || ''), unit: String(pub.unit || ''), language: String(pub.language || 'v') }
  };
};
/** Cổng đọc duy nhất của kho credential. */
FbmSync.credentialRead = function () {
  return FbmSync.credentialShape(FbmSync.mergedStoreRead(FbmSync.CREDENTIAL_KEY, 'Kho credential đăng nhập FBM', FbmSync.LOGIN_OLD_KEYS, FbmSync.LOGIN_MIGRATOR));
};
/** Cổng ghi duy nhất của kho credential. Chưa cấu hình thì ghi bản trống thay vì xóa khóa: xóa khóa là một lần gọi riêng sau `setProperties`, hỏng giữa hai lần thì liên kết đã đổi mà credential cũ còn. */
FbmSync.credentialWrite = function (credential) {
  var shaped = FbmSync.credentialShape(credential);
  return FbmSync.propertyJsonWrite(FbmSync.CREDENTIAL_KEY, shaped.configured ? { credentialRef: shaped.credentialRef, ciphertext: shaped.ciphertext, public: shaped.public } : {});
};

FbmSync.loginAttemptShape = function (stored) {
  var value = stored && typeof stored === 'object' ? stored : {};
  return { lastAttemptAt: Number(value.lastAttemptAt || 0), lastLoginAt: Number(value.lastLoginAt || 0), nextRetryAt: Number(value.nextRetryAt || 0), lastError: String(value.lastError || ''), loginHalted: value.loginHalted === true };
};
/** Cổng đọc duy nhất của kho dấu lần thử. */
FbmSync.loginAttemptRead = function () {
  return FbmSync.loginAttemptShape(FbmSync.mergedStoreRead(FbmSync.LOGIN_ATTEMPT_KEY, 'Kho dấu lần thử đăng nhập FBM', FbmSync.LOGIN_OLD_KEYS, FbmSync.LOGIN_MIGRATOR));
};
/**
 * Công cụ tính (thuần): dấu lần thử sau một sự kiện. `attempt` lúc lượt đăng nhập bắt đầu: ghi sẵn lý do đường truyền, vì lượt hỏng giữa đường không về tới bước ghi lý do mà khóa chờ đã đặt. `success`: phiên xác minh được là bằng chứng mới nhất nên gỡ mọi khóa, kể cả sai mật khẩu. `failure`: `halt` khi FBM đã từ chối mà thử lại cũng không khá hơn. `saved`: lưu mật khẩu mới thì gỡ khóa ngừng và lý do, giữ hạn thử lại. `cleared`: credential bị xóa thì bỏ cả hạn thử lại, giữ mốc giờ.
 */
/** Sổ lần thử đang khóa (lần thử sau lần thành công, đã ngừng, hoặc còn lý do lỗi): phiên chạy được thì gỡ. Thuần. */
FbmSync.loginAttemptLocked = function (attempt) {
  var value = attempt || {};
  return Number(value.lastAttemptAt || 0) > Number(value.lastLoginAt || 0) || value.loginHalted === true || !!String(value.lastError || '');
};
FbmSync.loginAttemptMark = function (current, event, now, retryMinutes) {
  var next = FbmSync.loginAttemptShape(current), at = Number(now), kind = String(event && event.kind || ''), retryMs = Number(retryMinutes) * 60 * 1000;
  if (kind === 'attempt') { next.lastAttemptAt = at; next.lastError = String(event.transportText || ''); next.nextRetryAt = at + retryMs; }
  else if (kind === 'success') { next.lastLoginAt = at; next.nextRetryAt = 0; next.lastError = ''; next.loginHalted = false; }
  else if (kind === 'failure') { next.lastError = String(event.message || 'Tự đăng nhập FBM thất bại.').slice(0, 240); if (event.halt === true) { next.loginHalted = true; } next.nextRetryAt = (next.lastAttemptAt || at) + retryMs; }
  else if (kind === 'saved') { next.lastError = ''; next.loginHalted = false; }
  else if (kind === 'cleared') { next.nextRetryAt = 0; next.lastError = ''; next.loginHalted = false; }
  else { var unknown = new Error('Sự kiện dấu lần thử đăng nhập lạ: ' + kind); unknown.code = 'LOGIN_ATTEMPT_EVENT_UNKNOWN'; throw unknown; }
  return next;
};
/** Cổng ghi duy nhất của kho dấu lần thử; không chạm kho credential. */
FbmSync.loginAttemptWrite = function (attempt) {
  return FbmSync.propertyJsonWrite(FbmSync.LOGIN_ATTEMPT_KEY, FbmSync.loginAttemptShape(attempt));
};
/** Phần công khai của credential và dấu lần thử cho Sidebar: không có bản mã. */
FbmSync.credentialPublicView = function () {
  var credential = FbmSync.credentialRead(), attempt = FbmSync.loginAttemptRead();
  return { ok: true, configured: credential.configured, credentialRef: credential.credentialRef, public: credential.public, lastAttemptAt: attempt.lastAttemptAt, lastLoginAt: attempt.lastLoginAt, nextRetryAt: attempt.nextRetryAt, lastError: attempt.lastError };
};
