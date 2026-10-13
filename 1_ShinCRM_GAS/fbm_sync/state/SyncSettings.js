/** Kho cài đặt cấp hệ thống FBM trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SYNC_SETTINGS_KEY = 'FBM_SYNC_SETTINGS_V1';
// Chế độ thử mặc định bật: tệp mới chưa ai cấu hình thì không được quét và ghi toàn bộ khách thật.
// Hai danh sách mã thử vì hai chiều lọc theo hai loại mã: chiều lấy lọc grid FBM theo mã FBM (`ma_kh`), chiều đẩy lọc Sheet theo mã ShinCRM. Trộn chung một ô từng làm chiều lấy bỏ qua mã ShinCRM mà không báo gì.
FbmSync.SYNC_SETTINGS_DEFAULT = { approvalThreshold: 10, testMode: true, testFbmCodes: [], testShinCodes: [], requestGapMinSeconds: 0, requestGapMaxSeconds: 0 };
// Khoảng nghỉ ngẫu nhiên giữa hai request liên tiếp tới FBM, áp cho mọi lượt; mặc định 0 vì FBM chưa giới hạn tốc độ (Tài liệu 09/07 "Tham số phiên FBM").
FbmSync.REQUEST_GAP_KEYS = ['requestGapMinSeconds', 'requestGapMaxSeconds'];
FbmSync.TEST_CODE_LISTS = { testFbmCodes: 'mã khách FBM', testShinCodes: 'mã khách ShinCRM' };
// Mã thử đi thẳng vào điều kiện SQL của grid FBM, nên chỉ nhận ký tự an toàn; dấu nháy không có đường lọt vào.
FbmSync.TEST_CODE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
FbmSync.TEST_CODES_MAX = 20;

function fbmSyncSettingsCloneDefault() {
  return { approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold, testMode: FbmSync.SYNC_SETTINGS_DEFAULT.testMode, testFbmCodes: [], testShinCodes: [], requestGapMinSeconds: FbmSync.SYNC_SETTINGS_DEFAULT.requestGapMinSeconds, requestGapMaxSeconds: FbmSync.SYNC_SETTINGS_DEFAULT.requestGapMaxSeconds };
}

/** Nhận mảng hoặc chuỗi ngăn bởi dấu phẩy, khoảng trắng, xuống dòng; bỏ trùng, giữ thứ tự người dùng nhập. */
function fbmSyncTestCodesParse(raw) {
  var list = Array.isArray(raw) ? raw : String(raw === null || raw === undefined ? '' : raw).split(/[\s,;]+/), seen = {}, result = [];
  list.forEach(function (item) { var code = String(item === null || item === undefined ? '' : item).trim(); if (code && !seen[code]) { seen[code] = true; result.push(code); } });
  return result;
}

function fbmSyncSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof documentProps === 'function') { return documentProps(); }
  return null;
}

function fbmSyncSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmSyncSettingsCloneDefault() : {};
  var raw = source.approvalThreshold;
  var threshold = raw === '' || raw === null || raw === undefined ? (allowDefaults ? FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold : NaN) : Number(raw);
  if (isFinite(threshold)) { result.approvalThreshold = Math.floor(threshold); }
  if (allowDefaults || source.testMode !== undefined) { result.testMode = source.testMode === undefined ? FbmSync.SYNC_SETTINGS_DEFAULT.testMode : source.testMode !== false; }
  // Bản lưu cũ chỉ có một danh sách `testCodes`: tách theo khuôn mã ShinCRM, phần còn lại coi là mã FBM.
  if (source.testCodes !== undefined && source.testFbmCodes === undefined && source.testShinCodes === undefined) {
    source = Object.assign({}, source, FbmSync.testCodesSplit(source.testCodes));
  }
  Object.keys(FbmSync.TEST_CODE_LISTS).forEach(function (key) {
    if (allowDefaults || source[key] !== undefined) { result[key] = source[key] === undefined ? [] : fbmSyncTestCodesParse(source[key]); }
  });
  FbmSync.REQUEST_GAP_KEYS.forEach(function (key) {
    var value = source[key];
    if (value === undefined || value === null || value === '') { if (allowDefaults) { result[key] = FbmSync.SYNC_SETTINGS_DEFAULT[key]; } return; }
    result[key] = Number(value);
  });
  return result;
}

/** Tách một danh sách mã trộn thành hai danh sách theo khuôn mã khách ShinCRM. */
FbmSync.testCodesSplit = function (raw) {
  var codes = fbmSyncTestCodesParse(raw);
  return { testFbmCodes: codes.filter(function (code) { return !idGateMatches('customer', code); }), testShinCodes: codes.filter(function (code) { return idGateMatches('customer', code); }) };
};

/** Mã sai loại của một danh sách: ô mã ShinCRM chỉ nhận đúng khuôn mã khách ShinCRM; ô mã FBM không nhận mã có khuôn ShinCRM. */
function fbmSyncTestCodesWrongKind(key, codes) {
  return codes.filter(function (code) { return key === 'testShinCodes' ? !idGateMatches('customer', code) : idGateMatches('customer', code); });
}

function fbmSyncSettingsValidate(input) {
  var source = input && typeof input === 'object' ? input : {}, raw = source.approvalThreshold, normalized = fbmSyncSettingsNormalize(source, true), threshold = Number(normalized.approvalThreshold);
  if (raw !== undefined && raw !== null && raw !== '' && !isFinite(Number(raw))) { threshold = NaN; }
  if (!isFinite(threshold) || threshold < 0 || Math.floor(threshold) !== threshold) {
    return { ok: false, code: 'FBM_APPROVAL_THRESHOLD_INVALID', message: 'Ngưỡng yêu cầu chấp thuận phải là số nguyên không âm.' };
  }
  normalized.approvalThreshold = threshold;
  var gapMin = normalized.requestGapMinSeconds, gapMax = normalized.requestGapMaxSeconds, gapCap = FbmSync.BUDGET.requestGapMaxSeconds;
  if (!isFinite(gapMin) || !isFinite(gapMax) || gapMin < 0 || gapMax < gapMin || gapMax > gapCap) {
    return { ok: false, code: 'FBM_REQUEST_GAP_INVALID', field: 'requestGap', message: 'Khoảng cách giữa hai request tới FBM: tối thiểu từ 0, tối đa không nhỏ hơn tối thiểu và không quá ' + gapCap + ' giây.' };
  }
  var keys = Object.keys(FbmSync.TEST_CODE_LISTS);
  for (var i = 0; i < keys.length; i += 1) {
    var key = keys[i], label = FbmSync.TEST_CODE_LISTS[key], codes = normalized[key];
    var badCodes = codes.filter(function (code) { return !FbmSync.TEST_CODE_PATTERN.test(code); });
    if (badCodes.length) {
      return { ok: false, code: 'FBM_TEST_CODE_INVALID', field: key, message: 'Danh sách ' + label + ': mã thử chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới, dài tối đa 32 ký tự. Mã sai: ' + badCodes.join(', ') + '.' };
    }
    var wrongKind = fbmSyncTestCodesWrongKind(key, codes);
    if (wrongKind.length) {
      var hint = key === 'testShinCodes' ? 'Mã khách ShinCRM có dạng ' + idGateFormat('customer', 1) + '; mã khác hãy nhập vào ô mã khách FBM.' : 'Đây là mã khách ShinCRM; hãy nhập vào ô mã khách ShinCRM.';
      return { ok: false, code: 'FBM_TEST_CODE_WRONG_KIND', field: key, message: 'Danh sách ' + label + ' có mã sai loại: ' + wrongKind.join(', ') + '. ' + hint };
    }
    if (codes.length > FbmSync.TEST_CODES_MAX) {
      return { ok: false, code: 'FBM_TEST_CODES_TOO_MANY', field: key, message: 'Danh sách ' + label + ' tối đa ' + FbmSync.TEST_CODES_MAX + ' mã; muốn chạy rộng hơn thì tắt chế độ thử.' };
    }
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
  if (!check.ok) {
    // Từ chối phải để lại dấu ở Log, không chỉ hiện ở Sidebar.
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'sync_settings_save', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: check.code, detail: { field: check.field || '', message: check.message } }); }
    return check;
  }
  var props = fbmSyncSettingsProps();
  if (!props) { return { ok: false, code: 'FBM_SYNC_SETTINGS_STORAGE_UNAVAILABLE', message: 'Không truy cập được DocumentProperties.' }; }
  var saved;
  if (typeof FbmSync.documentPropertySet === 'function') { saved = FbmSync.documentPropertySet(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(check.settings), 'sync_settings'); }
  else { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(check.settings)); saved = { ok: true }; }
  if (!saved.ok) { return { ok: false, code: saved.code, message: saved.message }; }
  return { ok: true, settings: check.settings, previous: previous };
};

/** Khoảng nghỉ gửi kèm envelope theo mili-giây; Extension chọn ngẫu nhiên trong khoảng này trước mỗi request FBM. */
FbmSync.requestGapMs = function (settings) {
  var source = settings || {};
  return { minMs: Math.round(Number(source.requestGapMinSeconds || 0) * 1000), maxMs: Math.round(Number(source.requestGapMaxSeconds || 0) * 1000) };
};

FbmSync.syncSettingsPublic = function () {
  return FbmSync.syncSettingsRead();
};

/** Phạm vi thử của lượt chạy: `null` khi tắt chế độ thử (chạy toàn bộ), ngược lại `{ fbm, shin }` — mảng rỗng nghĩa là chiều đó chưa được chạy. */
FbmSync.testScopeCodes = function () {
  var settings = FbmSync.syncSettingsRead();
  return settings.testMode === false ? null : { fbm: settings.testFbmCodes.slice(), shin: settings.testShinCodes.slice() };
};

/** Danh sách thử còn trống mà chế độ chạy cần: lấy cần mã FBM, đẩy cần mã ShinCRM, hai chiều cần cả hai. */
FbmSync.testScopeMissing = function (scope, mode) {
  if (!scope) { return []; }
  var missing = [];
  if (mode !== 'push' && !scope.fbm.length) { missing.push(FbmSync.TEST_CODE_LISTS.testFbmCodes); }
  if ((mode === 'write' || mode === 'push') && !scope.shin.length) { missing.push(FbmSync.TEST_CODE_LISTS.testShinCodes); }
  return missing;
};
