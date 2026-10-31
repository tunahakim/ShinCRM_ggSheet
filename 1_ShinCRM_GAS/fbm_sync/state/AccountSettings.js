/** Cấu hình gắn với tài khoản FBM, tách khỏi tham số của phiên. Kho cũ còn khóa `activitySince` thì lần đọc đầu chuẩn hóa và ghi lại không còn khóa đó. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.ACCOUNT_SETTINGS_KEY = 'FBM_ACCOUNT_SETTINGS_V1';
FbmSync.ACCOUNT_SETTINGS_DEFAULT = { customerPrefix: '', customerCodeLength: '' };

function fbmAccountSettingsCloneDefault() {
  return {
    customerPrefix: FbmSync.ACCOUNT_SETTINGS_DEFAULT.customerPrefix,
    customerCodeLength: FbmSync.ACCOUNT_SETTINGS_DEFAULT.customerCodeLength
  };
}

function fbmAccountSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof documentProps === 'function') { return documentProps(); }
  return null;
}

function fbmAccountSettingsText(value, maxLength) {
  return String(value === null || value === undefined ? '' : value).trim().slice(0, maxLength);
}

function fbmAccountSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmAccountSettingsCloneDefault() : {};
  if (allowDefaults || source.customerPrefix !== undefined) { result.customerPrefix = fbmAccountSettingsText(source.customerPrefix, 64); }
  if (allowDefaults || source.customerCodeLength !== undefined) { result.customerCodeLength = fbmAccountSettingsText(source.customerCodeLength, 16); }
  return result;
}

function fbmAccountSettingsValidate(input) {
  var normalized = fbmAccountSettingsNormalize(input, true), prefix = normalized.customerPrefix, lengthText = normalized.customerCodeLength;
  if ((prefix && !lengthText) || (!prefix && lengthText)) {
    return { ok: false, code: 'FBM_CUSTOMER_CODE_CONFIG_INCOMPLETE', message: 'Tiền tố và độ dài mã khách FBM phải nhập đủ cả hai, hoặc để trống cả hai để tắt tạo Customer mới.' };
  }
  if (lengthText && (!/^\d+$/.test(lengthText) || Number(lengthText) < 1 || Number(lengthText) > 32)) {
    return { ok: false, code: 'FBM_CUSTOMER_CODE_LENGTH_INVALID', message: 'Độ dài mã khách FBM phải là số nguyên từ 1 đến 32.' };
  }
  return { ok: true, settings: normalized };
}

FbmSync.accountSettingsRead = function () {
  // Đọc lỗi hoặc JSON hỏng phải ném lỗi: rơi về giá trị cũ rồi ghi đè sẽ xóa âm thầm cài đặt của người dùng.
  var props = fbmAccountSettingsProps(), parsed = props ? FbmSync.documentPropertyJson(FbmSync.ACCOUNT_SETTINGS_KEY, 'cài đặt tài khoản FBM') : null;
  if (parsed) {
    var valid = fbmAccountSettingsValidate(parsed);
    if (!valid.ok) {
      var invalid = new Error('Dữ liệu cài đặt tài khoản FBM trong DocumentProperties không hợp lệ (' + FbmSync.ACCOUNT_SETTINGS_KEY + '); đã dừng để không ghi đè.');
      invalid.code = 'DOCUMENT_PROPERTY_CORRUPT'; throw invalid;
    }
    if (props && JSON.stringify(parsed) !== JSON.stringify(valid.settings)) {
      var normalizedWrite;
      if (typeof FbmSync.documentPropertySet === 'function') { normalizedWrite = FbmSync.documentPropertySet(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(valid.settings), 'account_settings'); }
      else { props.setProperty(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(valid.settings)); normalizedWrite = { ok: true }; }
      if (!normalizedWrite.ok) { throw normalizedWrite.error; }
    }
    return valid.settings;
  }
  return fbmAccountSettingsCloneDefault();
};

FbmSync.accountSettingsSave = function (input) {
  var check = fbmAccountSettingsValidate(input || {});
  if (!check.ok) { return check; }
  var props = fbmAccountSettingsProps();
  if (!props) { return { ok: false, code: 'FBM_ACCOUNT_SETTINGS_STORAGE_UNAVAILABLE', message: 'Không truy cập được DocumentProperties.' }; }
  var saved;
  if (typeof FbmSync.documentPropertySet === 'function') { saved = FbmSync.documentPropertySet(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(check.settings), 'account_settings'); }
  else { props.setProperty(FbmSync.ACCOUNT_SETTINGS_KEY, JSON.stringify(check.settings)); saved = { ok: true }; }
  if (!saved.ok) { return { ok: false, code: saved.code, message: saved.message }; }
  return { ok: true, settings: check.settings };
};

FbmSync.accountSettingsPublic = function () {
  return FbmSync.accountSettingsRead();
};
