/** Kho cài đặt cấp hệ thống FBM trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SYNC_SETTINGS_KEY = 'FBM_SYNC_SETTINGS_V1';
// Chế độ thử mặc định bật: tệp mới chưa ai cấu hình thì không được quét và ghi toàn bộ khách thật.
FbmSync.SYNC_SETTINGS_DEFAULT = { approvalThreshold: 10, testMode: true, testCodes: [] };
// Mã thử đi thẳng vào điều kiện SQL của grid FBM, nên chỉ nhận ký tự an toàn; dấu nháy không có đường lọt vào.
FbmSync.TEST_CODE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
FbmSync.TEST_CODES_MAX = 20;

function fbmSyncSettingsCloneDefault() {
  return { approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold, testMode: FbmSync.SYNC_SETTINGS_DEFAULT.testMode, testCodes: FbmSync.SYNC_SETTINGS_DEFAULT.testCodes.slice() };
}

/** Nhận mảng hoặc chuỗi ngăn bởi dấu phẩy, khoảng trắng, xuống dòng; bỏ trùng, giữ thứ tự người dùng nhập. */
function fbmSyncTestCodesParse(raw) {
  var list = Array.isArray(raw) ? raw : String(raw === null || raw === undefined ? '' : raw).split(/[\s,;]+/), seen = {}, result = [];
  list.forEach(function (item) { var code = String(item === null || item === undefined ? '' : item).trim(); if (code && !seen[code]) { seen[code] = true; result.push(code); } });
  return result;
}

function fbmSyncSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties) { return PropertiesService.getDocumentProperties(); }
  return null;
}

function fbmSyncSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmSyncSettingsCloneDefault() : {};
  var raw = source.approvalThreshold;
  var threshold = raw === '' || raw === null || raw === undefined ? (allowDefaults ? FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold : NaN) : Number(raw);
  if (isFinite(threshold)) { result.approvalThreshold = Math.floor(threshold); }
  if (allowDefaults || source.testMode !== undefined) { result.testMode = source.testMode === undefined ? FbmSync.SYNC_SETTINGS_DEFAULT.testMode : source.testMode !== false; }
  if (allowDefaults || source.testCodes !== undefined) { result.testCodes = source.testCodes === undefined ? FbmSync.SYNC_SETTINGS_DEFAULT.testCodes.slice() : fbmSyncTestCodesParse(source.testCodes); }
  return result;
}

function fbmSyncSettingsValidate(input) {
  var source = input && typeof input === 'object' ? input : {}, raw = source.approvalThreshold, normalized = fbmSyncSettingsNormalize(source, true), threshold = Number(normalized.approvalThreshold);
  if (raw !== undefined && raw !== null && raw !== '' && !isFinite(Number(raw))) { threshold = NaN; }
  if (!isFinite(threshold) || threshold < 0 || Math.floor(threshold) !== threshold) {
    return { ok: false, code: 'FBM_APPROVAL_THRESHOLD_INVALID', message: 'Ngưỡng yêu cầu chấp thuận phải là số nguyên không âm.' };
  }
  normalized.approvalThreshold = threshold;
  var badCodes = normalized.testCodes.filter(function (code) { return !FbmSync.TEST_CODE_PATTERN.test(code); });
  if (badCodes.length) {
    return { ok: false, code: 'FBM_TEST_CODE_INVALID', message: 'Mã thử chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới, dài tối đa 32 ký tự. Mã sai: ' + badCodes.join(', ') + '.' };
  }
  if (normalized.testCodes.length > FbmSync.TEST_CODES_MAX) {
    return { ok: false, code: 'FBM_TEST_CODES_TOO_MANY', message: 'Danh sách mã thử tối đa ' + FbmSync.TEST_CODES_MAX + ' mã; muốn chạy rộng hơn thì tắt chế độ thử.' };
  }
  return { ok: true, settings: normalized };
}

function fbmSyncSettingsLegacy() {
  var result = fbmSyncSettingsCloneDefault(), raw = '';
  try { raw = typeof configGet === 'function' ? configGet('FBM_SYNC_APPROVAL_THRESHOLD', '') : ''; } catch (ignore) { raw = ''; }
  var threshold = Number(raw);
  if (isFinite(threshold) && threshold >= 0) { result.approvalThreshold = Math.floor(threshold); }
  return result;
}

FbmSync.syncSettingsRead = function () {
  // Đọc lỗi hoặc JSON hỏng phải ném lỗi: rơi về giá trị cũ rồi ghi đè sẽ xóa âm thầm cài đặt của người dùng.
  var props = fbmSyncSettingsProps(), parsed = props ? FbmSync.documentPropertyJson(FbmSync.SYNC_SETTINGS_KEY, 'cài đặt đồng bộ FBM') : null;
  if (parsed) {
    var valid = fbmSyncSettingsValidate(fbmSyncSettingsNormalize(parsed, true));
    if (!valid.ok) {
      var invalid = new Error('Dữ liệu cài đặt đồng bộ FBM trong DocumentProperties không hợp lệ (' + FbmSync.SYNC_SETTINGS_KEY + '); đã dừng để không ghi đè.');
      invalid.code = 'FBM_DOCUMENT_PROPERTY_CORRUPT'; throw invalid;
    }
    // Ghi lại dạng tối giản để loại bỏ các key cài đặt cũ khỏi kho hiện tại.
    if (props && JSON.stringify(parsed) !== JSON.stringify(valid.settings)) {
      var normalizedWrite;
      if (typeof FbmSync.documentPropertySet === 'function') { normalizedWrite = FbmSync.documentPropertySet(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(valid.settings), 'sync_settings'); }
      else { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(valid.settings)); normalizedWrite = { ok: true }; }
      if (!normalizedWrite.ok) { throw normalizedWrite.error; }
    }
    return valid.settings;
  }
  var migrated = fbmSyncSettingsLegacy();
  if (props) {
    var migratedWrite;
    if (typeof FbmSync.documentPropertySet === 'function') { migratedWrite = FbmSync.documentPropertySet(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(migrated), 'sync_settings_migration'); }
    else { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(migrated)); migratedWrite = { ok: true }; }
    if (!migratedWrite.ok) { return migrated; }
  }
  return migrated;
};

FbmSync.syncSettingsSave = function (input) {
  // Gộp lên bản đang lưu: bên gọi chỉ gửi vài trường thì các trường còn lại giữ nguyên, không bị mặc định đè mất danh sách mã thử.
  var previous = FbmSync.syncSettingsRead(), check = fbmSyncSettingsValidate(Object.assign({}, previous, input || {}));
  if (!check.ok) { return check; }
  var props = fbmSyncSettingsProps();
  if (!props) { return { ok: false, code: 'FBM_SYNC_SETTINGS_STORAGE_UNAVAILABLE', message: 'Không truy cập được DocumentProperties.' }; }
  var saved;
  if (typeof FbmSync.documentPropertySet === 'function') { saved = FbmSync.documentPropertySet(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(check.settings), 'sync_settings'); }
  else { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(check.settings)); saved = { ok: true }; }
  if (!saved.ok) { return { ok: false, code: saved.code, message: saved.message }; }
  return { ok: true, settings: check.settings, previous: previous };
};

FbmSync.syncSettingsPublic = function () {
  return FbmSync.syncSettingsRead();
};

/** Phạm vi thử của lượt chạy: `null` khi tắt chế độ thử (chạy toàn bộ), ngược lại là danh sách mã — mảng rỗng nghĩa là chưa được chạy. */
FbmSync.testScopeCodes = function () {
  var settings = FbmSync.syncSettingsRead();
  return settings.testMode === false ? null : settings.testCodes.slice();
};
