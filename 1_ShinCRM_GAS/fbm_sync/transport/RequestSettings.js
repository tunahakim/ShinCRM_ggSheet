/**
 * Cài đặt dựng request FBM: địa chỉ FBM, bộ cài đặt của một lát (`scriptSettings`) và phép kiểm đầu mọi hàm dựng request (`requestCfg`).
 * Hàm dựng request không tự đọc cài đặt hay phạm vi: người điều phối đọc một lần trên ô lượt của lát rồi truyền xuống; thiếu thì hàm dựng ném `FBM_REQUEST_SETTINGS_MISSING`, không lùi về tự đọc.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Địa chỉ FBM: hằng của hệ thống, không phải cài đặt người dùng; mọi request và lệnh mở trang FBM ghép từ đây. */
FbmSync.FBM_BASE_URL = 'https://fbo.com.vn:8888';
/**
 * Cài đặt dựng request của một lát: cookie, token và danh tính (mã người dùng, tên đầy đủ) lấy từ phiên trong ô lượt được truyền vào; danh tính chỉ có khi phiên đã xác minh (`sessionVerifiedIdentity`).
 * Người điều phối gọi một lần trên ô lượt đang xử lý rồi truyền xuống hàm dựng request; hàm này không tự đọc ô lượt, để request luôn dùng đúng phiên của bản ô lượt mà lát đang làm.
 */
FbmSync.scriptSettings = function (state) {
  if (!state || typeof state !== 'object') { throw FbmSync.requestSettingsMissing('scriptSettings', 'ô lượt'); }
  var session = state.session || {};
  var identity = FbmSync.sessionVerifiedIdentity(state);
  var accountSettings = settingsValues(FbmSync.SETTING_SECTIONS.account);
  return {
    cookie: String(session.cookie || ''),
    customerAuthorized: String(session.customerAuthorized || ''),
    activityAuthorized: String(session.activityAuthorized || ''),
    userId: identity.userId,
    accountName: identity.accountName,
    customerPrefix: String(accountSettings.customerPrefix || ''),
    customerCodeLength: String(accountSettings.customerCodeLength || '')
  };
};
/** Lỗi thiếu đầu vào của hàm dựng request: dừng, không gửi, không lùi về tự đọc cài đặt. */
FbmSync.requestSettingsMissing = function (builder, what) {
  var error = new Error('Hàm dựng request ' + builder + ' thiếu ' + what + '; người điều phối phải đọc và truyền vào. Đã dừng, không gửi request.');
  error.code = 'FBM_REQUEST_SETTINGS_MISSING';
  return error;
};
/** Phép kiểm chung đầu mọi hàm dựng request: `cfg` phải là kết quả `scriptSettings(state)`. */
FbmSync.requestCfg = function (cfg, builder) {
  if (!cfg || typeof cfg !== 'object' || typeof cfg.cookie !== 'string' || typeof cfg.customerAuthorized !== 'string') { throw FbmSync.requestSettingsMissing(builder, 'cài đặt (cfg)'); }
  return cfg;
};
