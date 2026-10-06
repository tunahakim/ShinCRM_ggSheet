/** Cấu hình gắn với tài khoản FBM và phạm vi dữ liệu, tách khỏi tham số của phiên. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.ACCOUNT_SETTINGS_KEY = 'FBM_ACCOUNT_SETTINGS_V1';
FbmSync.ACCOUNT_SETTINGS_DEFAULT = { customerPrefix: '', customerCodeLength: '', activitySince: '' };

function fbmAccountSettingsCloneDefault() {
  return {
    customerPrefix: FbmSync.ACCOUNT_SETTINGS_DEFAULT.customerPrefix,
    customerCodeLength: FbmSync.ACCOUNT_SETTINGS_DEFAULT.customerCodeLength,
    activitySince: FbmSync.ACCOUNT_SETTINGS_DEFAULT.activitySince
  };
}

function fbmAccountSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties) { return PropertiesService.getDocumentProperties(); }
  return null;
}

function fbmAccountSettingsText(value, maxLength) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, maxLength);
}

function fbmAccountSettingsDateValid(value) {
  var text = String(value || '').trim(), match = text.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) { return false; }
  var year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  var date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
}

function fbmAccountSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmAccountSettingsCloneDefault() : {};
  if (allowDefaults || source.customerPrefix !== undefined) { result.customerPrefix = fbmAccountSettingsText(source.customerPrefix, 64); }
  if (allowDefaults || source.customerCodeLength !== undefined) { result.customerCodeLength = fbmAccountSettingsText(source.customerCodeLength, 16); }
  if (allowDefaults || source.activitySince !== undefined) { result.activitySince = fbmAccountSettingsText(source.activitySince, 10); }
  return result;
}

function fbmAccountSettingsValidate(input) {
  var normalized = fbmAccountSettingsNormalize(input, true), prefix = normalized.customerPrefix, lengthText = normalized.customerCodeLength, since = normalized.activitySince;
  if ((prefix && !lengthText) || (!prefix && lengthText)) {
    return { ok: false, code: 'FBM_CUSTOMER_CODE_CONFIG_INCOMPLETE', message: 'Tiền tố và độ dài mã khách FBM phải nhập đủ cả hai, hoặc để trống cả hai để tắt tạo Customer mới.' };
  }
  if (lengthText && (!/^\d+$/.test(lengthText) || Number(lengthText) < 1 || Number(lengthText) > 32)) {
    return { ok: false, code: 'FBM_CUSTOMER_CODE_LENGTH_INVALID', message: 'Độ dài mã khách FBM phải là số nguyên từ 1 đến 32.' };
  }
  if (since && !fbmAccountSettingsDateValid(since)) {
    return { ok: false, code: 'FBM_ACTIVITY_SINCE_INVALID', message: 'Mốc Activity phải có ngày hợp lệ dạng YYYY-MM-DD, hoặc để trống để quét toàn bộ.' };
  }
  return { ok: true, settings: normalized };
}

function fbmAccountSettingsLegacyValue(names) {
  for (var i = 0; i < names.length; i += 1) {
    try {
      var value = typeof configGet === 'function' ? configGet(names[i], '') : '';
      if (String(value || '').trim()) { return value; }
    } catch (ignore) {}
  }
  return '';
}

function fbmAccountSettingsLegacy() {
  return fbmAccountSettingsNormalize({
    customerPrefix: fbmAccountSettingsLegacyValue(['FBM_MA_KH_PREFIX', 'FBM_MA_KH_TIEN_TO']),
    customerCodeLength: fbmAccountSettingsLegacyValue(['FBM_MA_KH_LENGTH', 'FBM_MA_KH_DO_DAI']),
    activitySince: fbmAccountSettingsLegacyValue(['FBM_ACTIVITY_SINCE', 'FBM_NGAY_MOC_HOAT_DONG'])
  }, true);
}

FbmSync.accountSettingsRead = function () {
  // Đọc lỗi hoặc JSON hỏng phải ném lỗi: rơi về giá trị cũ rồi ghi đè sẽ xóa âm thầm cài đặt của người dùng.
  var props = fbmAccountSettingsProps(), parsed = props ? FbmSync.documentPropertyJson(FbmSync.ACCOUNT_SETTINGS_KEY, 'cài đặt tài khoản FBM') : null;
  if (parsed) {
    var valid = fbmAccountSettingsValidate(parsed);
    if (!valid.ok) {
      var invalid = new Error('Dữ liệu cài đặt tài khoản FBM trong DocumentProperties không hợp lệ (' + FbmSync.ACCOUNT_SETTINGS_KEY + '); đã dừng để không ghi đè.');
      invalid.code = 'FBM_DOCUMENT_PROPERTY_CORRUPT'; throw invalid;
    }
    if (props && JSON.stringify(parsed) !== JSON.stringify(valid.settings)) {
      var normalizedWrite;
      if (typeof FbmSync.documentPropertySet === 'function') { normalizedWrite = FbmSync.documentPropertySet(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(valid.settings), 'account_settings'); }
      else { props.setProperty(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(valid.settings)); normalizedWrite = { ok: true }; }
      if (!normalizedWrite.ok) { throw normalizedWrite.error; }
    }
    return valid.settings;
  }
  var migrated = fbmAccountSettingsLegacy();
  if (props) {
    var migratedWrite;
    if (typeof FbmSync.documentPropertySet === 'function') { migratedWrite = FbmSync.documentPropertySet(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(migrated), 'account_settings_migration'); }
    else { props.setProperty(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(migrated)); migratedWrite = { ok: true }; }
    if (!migratedWrite.ok) { return migrated; }
  }
  return migrated;
};

FbmSync.accountSettingsSave = function (input) {
  var check = fbmAccountSettingsValidate(input || {});
  if (!check.ok) { return check; }
  var props = fbmAccountSettingsProps(), previous = FbmSync.accountSettingsRead();
  if (!props) { return { ok: false, code: 'FBM_ACCOUNT_SETTINGS_STORAGE_UNAVAILABLE', message: 'Không truy cập được DocumentProperties.' }; }
  var saved;
  if (typeof FbmSync.documentPropertySet === 'function') { saved = FbmSync.documentPropertySet(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(check.settings), 'account_settings'); }
  else { props.setProperty(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(check.settings)); saved = { ok: true }; }
  if (!saved.ok) { return { ok: false, code: saved.code, message: saved.message }; }
  return { ok: true, settings: check.settings, previous: previous };
};

FbmSync.accountSettingsPublic = function () {
  return FbmSync.accountSettingsRead();
};
