/** Kho cài đặt cấp hệ thống FBM trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SYNC_SETTINGS_KEY = 'FBM_SYNC_SETTINGS_V1';
// Phạm vi mặc định giới hạn: tệp mới chưa ai cấu hình thì không được quét và ghi toàn bộ khách thật.
// Một danh sách khách chỉ định nhận cả mã FBM lẫn mã ShinCRM; GAS đổi mã ra khách nên lượt hai chiều chạy cả hai chiều cho khách nhập bằng một loại mã (Tài liệu 09/07 "Tham số phiên FBM").
FbmSync.SYNC_SETTINGS_DEFAULT = { approvalThreshold: 10, scopeLimited: true, scopeCodes: [], requestGapMinSeconds: 0, requestGapMaxSeconds: 0 };
// Khoảng nghỉ ngẫu nhiên giữa hai request liên tiếp tới FBM, áp cho mọi lượt; mặc định 0 vì FBM chưa giới hạn tốc độ (Tài liệu 09/07 "Tham số phiên FBM").
FbmSync.REQUEST_GAP_KEYS = ['requestGapMinSeconds', 'requestGapMaxSeconds'];
// Mã đi thẳng vào điều kiện SQL của grid FBM, nên chỉ nhận ký tự an toàn; dấu nháy không có đường lọt vào.
FbmSync.SCOPE_CODE_PATTERN = /^[A-Za-z0-9._-]{1,32}$/;
FbmSync.SCOPE_CODES_MAX = 40;

function fbmSyncSettingsCloneDefault() {
  return { approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold, scopeLimited: FbmSync.SYNC_SETTINGS_DEFAULT.scopeLimited, scopeCodes: [], requestGapMinSeconds: FbmSync.SYNC_SETTINGS_DEFAULT.requestGapMinSeconds, requestGapMaxSeconds: FbmSync.SYNC_SETTINGS_DEFAULT.requestGapMaxSeconds };
}

/** Nhận mảng hoặc chuỗi ngăn bởi dấu phẩy, khoảng trắng, xuống dòng; bỏ trùng, giữ thứ tự người dùng nhập. */
function fbmSyncScopeCodesParse(raw) {
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
  var limited = source.scopeLimited;
  if (allowDefaults || limited !== undefined) { result.scopeLimited = limited === undefined ? FbmSync.SYNC_SETTINGS_DEFAULT.scopeLimited : limited !== false; }
  if (source.scopeCodes !== undefined) { result.scopeCodes = fbmSyncScopeCodesParse(source.scopeCodes); }
  else if (allowDefaults) { result.scopeCodes = []; }
  FbmSync.REQUEST_GAP_KEYS.forEach(function (key) {
    var value = source[key];
    if (value === undefined || value === null || value === '') { if (allowDefaults) { result[key] = FbmSync.SYNC_SETTINGS_DEFAULT[key]; } return; }
    result[key] = Number(value);
  });
  return result;
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
  var badCodes = normalized.scopeCodes.filter(function (code) { return !FbmSync.SCOPE_CODE_PATTERN.test(code); });
  if (badCodes.length) {
    return { ok: false, code: 'FBM_SCOPE_CODE_INVALID', field: 'scopeCodes', message: 'Danh sách khách chỉ định: mỗi mã chỉ gồm chữ không dấu, số, dấu chấm, gạch ngang hoặc gạch dưới, dài tối đa 32 ký tự. Mã sai: ' + badCodes.join(', ') + '.' };
  }
  if (normalized.scopeCodes.length > FbmSync.SCOPE_CODES_MAX) {
    return { ok: false, code: 'FBM_SCOPE_CODES_TOO_MANY', field: 'scopeCodes', message: 'Danh sách khách chỉ định tối đa ' + FbmSync.SCOPE_CODES_MAX + ' mã; muốn chạy rộng hơn thì tắt giới hạn phạm vi.' };
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
  // Gộp lên bản đang lưu: bên gọi chỉ gửi vài trường thì các trường còn lại giữ nguyên, không bị mặc định đè mất danh sách khách chỉ định.
  var previous = FbmSync.syncSettingsRead(), check = fbmSyncSettingsValidate(Object.assign({}, previous, input || {})), scopeLines = null;
  // Đổi mã ra khách chỉ khi người dùng gửi danh sách: mã ShinCRM không có trên Sheet thì từ chối, danh sách đang lưu giữ nguyên.
  if (check.ok && input && input.scopeCodes !== undefined) {
    scopeLines = FbmSync.scopeResolve(check.settings.scopeCodes).lines;
    var notFound = scopeLines.filter(function (line) { return line.status === 'not_found'; }).map(function (line) { return line.code; });
    if (notFound.length) { check = { ok: false, code: 'FBM_SCOPE_CODE_NOT_FOUND', field: 'scopeCodes', message: 'Không tìm thấy mã khách ShinCRM trên Sheet Customer: ' + notFound.join(', ') + '. Danh sách đang lưu giữ nguyên.', scopeLines: scopeLines }; }
  }
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
  return { ok: true, settings: check.settings, previous: previous, scopeLines: scopeLines };
};

/** Khoảng nghỉ gửi kèm envelope theo mili-giây; Extension chọn ngẫu nhiên trong khoảng này trước mỗi request FBM. */
FbmSync.requestGapMs = function (settings) {
  var source = settings || {};
  return { minMs: Math.round(Number(source.requestGapMinSeconds || 0) * 1000), maxMs: Math.round(Number(source.requestGapMaxSeconds || 0) * 1000) };
};

FbmSync.syncSettingsPublic = function () {
  return FbmSync.syncSettingsRead();
};

/**
 * Đổi danh sách mã ra khách: mã khớp khuôn cổng cấp mã ShinCRM tra theo mã khách, mã khác tra theo cột mã FBM, nên không mã nào mang hai nghĩa.
 * `fbm` lọc grid Customer (gồm cả mã FBM chưa có trên Sheet, tức khách mới bên FBM); `shin` lọc chiều ghi. Khách đã ghép cặp nhập mã nào cũng vào cả hai.
 * Đọc Sheet Customer qua bản chụp của lần gọi, nên gọi nhiều lần trong một lời gọi GAS không đọc lại Sheet.
 */
FbmSync.scopeResolve = function (codes) {
  var byId = {}, byFbm = {}, fbm = [], shin = [], lines = [];
  var add = function (list, value) { if (value && list.indexOf(value) < 0) { list.push(value); } };
  FbmSync.readLocal('customer').forEach(function (customer) {
    var id = String(customer.id || '').trim(), fbmCode = String(customer.fbmCustomerCode || '').trim();
    if (id) { byId[id] = customer; }
    if (fbmCode) { byFbm[fbmCode] = customer; }
  });
  (codes || []).forEach(function (code) {
    var kind = idGateMatches('customer', code) ? 'shin' : 'fbm', customer = kind === 'shin' ? byId[code] : byFbm[code];
    if (!customer) {
      if (kind === 'fbm') { add(fbm, code); }
      lines.push({ code: code, kind: kind, status: kind === 'shin' ? 'not_found' : 'fbm_new', customerId: '', fbmCode: kind === 'fbm' ? code : '' });
      return;
    }
    var customerId = String(customer.id || '').trim(), fbmCode = String(customer.fbmCustomerCode || '').trim();
    add(shin, customerId); add(fbm, fbmCode);
    lines.push({ code: code, kind: kind, status: 'matched', customerId: customerId, fbmCode: fbmCode });
  });
  return { fbm: fbm, shin: shin, lines: lines };
};

/** Phạm vi của lượt chạy: `null` khi không giới hạn (đọc và ghi toàn bộ), ngược lại `{ codes, fbm, shin, notFound }`; danh sách rỗng lọc ra rỗng chứ không rơi thành toàn bộ. */
FbmSync.scope = function () {
  var settings = FbmSync.syncSettingsRead();
  if (settings.scopeLimited === false) { return null; }
  var resolved = FbmSync.scopeResolve(settings.scopeCodes);
  return { codes: settings.scopeCodes.slice(), fbm: resolved.fbm, shin: resolved.shin, notFound: resolved.lines.filter(function (line) { return line.status === 'not_found'; }).map(function (line) { return line.code; }) };
};

/** Công tắc phạm vi đang bật hay tắt; chỉ đọc cờ, không đổi mã ra khách. */
FbmSync.scopeLimited = function () { return FbmSync.syncSettingsRead().scopeLimited !== false; };
