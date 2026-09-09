/** Kiểm mã danh mục FBM bằng Category của Sheet và lookup của phiên hiện tại. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Tách một ô companion dạng `MÃ. Tên # | MÃ. Tên`. */
FbmSync.parseCategoryCell = function (value) {
  return String(value === null || value === undefined ? '' : value).split('|').map(function (part) {
    var text = part.trim();
    if (!text) { return null; }
    var marked = /\s+#\s*$/.test(text);
    text = text.replace(/\s+#\s*$/, '');
    var at = text.indexOf('. ');
    return at < 0 ? { code: text, name: text, primary: marked } : { code: text.slice(0, at).trim(), name: text.slice(at + 2).trim(), primary: marked };
  }).filter(Boolean);
};

/** Đổi danh sách companion thành map giá trị Sheet -> mã FBM được chọn. */
FbmSync.categoryMapFromRows = function (rows) {
  var map = {};
  (rows || []).forEach(function (row) {
    var source = String(row.source || '').trim();
    var companion = String(row.companion || '').trim();
    if (!source || !companion) { return; }
    var values = FbmSync.parseCategoryCell(companion);
    var chosen = values.filter(function (item) { return item.primary; });
    (chosen.length ? chosen : values.slice(0, 1)).forEach(function (item) {
      map[source + '\u001f' + String(row.value || '').trim()] = item.code;
    });
  });
  return map;
};

/** Đọc cặp danh mục thật/companion một lần khi có môi trường Sheet. */
FbmSync.readCategoryGate = function () {
  if (typeof shinOpenSheet !== 'function' || typeof CATEGORY_COLUMNS === 'undefined') { return { map: {}, names: {}, valid: {}, warnings: [] }; }
  var sheet = shinOpenSheet('Category'), columns = readColumnMap('Category'), codes = CATEGORY_COLUMNS.map(function (pair) { return pair[0]; });
  var rows = sheetGridReadBlock(sheet, SHEET_FIRST_DATA_ROW, sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW), columns.lastColumn);
  var entries = [], names = {}, warnings = [];
  codes.forEach(function (source) {
    if (typeof categoryIsCompanion === 'function' && categoryIsCompanion(source)) { return; }
    var companionCode = source + (typeof CATEGORY_FBM_SUFFIX === 'undefined' ? '_FBM' : CATEGORY_FBM_SUFFIX);
    if (typeof categoryIsCompanion === 'function' && !categoryIsCompanion(companionCode)) { return; }
    var sourceAt = columnIndex(columns, source) - 1, companionAt = columnIndex(columns, companionCode) - 1;
    rows.forEach(function (row) {
      var value = String(row[sourceAt] === null || row[sourceAt] === undefined ? '' : row[sourceAt]).trim();
      var companion = String(row[companionAt] === null || row[companionAt] === undefined ? '' : row[companionAt]).trim();
      if (value && companion) { entries.push({ source: source, value: value, companion: companion }); }
    });
  });
  var map = FbmSync.categoryMapFromRows(entries), valid = {}, namesBySource = {};
  entries.forEach(function (entry) {
    if (!valid[entry.source]) { valid[entry.source] = {}; }
    if (!namesBySource[entry.source]) { namesBySource[entry.source] = {}; }
    valid[entry.source][String(entry.value || '').trim()] = true;
    FbmSync.parseCategoryCell(entry.companion).forEach(function (item) {
      names[item.code] = item.name;
      namesBySource[entry.source][item.code] = item.name;
      valid[entry.source][item.code] = true;
    });
  });
  return { map: map, names: names, namesBySource: namesBySource, valid: valid, warnings: warnings };
};

/** Đổi giá trị Sheet sang mã FBM, giữ mã đã có nếu không có companion. */
FbmSync.categoryCode = function (categoryGate, source, value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) { return ''; }
  return categoryGate && categoryGate.map && categoryGate.map[source + '\u001f' + text] || text;
};

/** Kiểm giá trị có companion và mã FBM tương ứng trước khi cho phép đẩy. */
FbmSync.categoryValueAllowed = function (categoryGate, source, value) {
  var text = String(value === null || value === undefined ? '' : value).trim();
  if (!text) { return { ok: true, code: '' }; }
  var valid = categoryGate && categoryGate.valid && categoryGate.valid[source];
  if (!valid || !valid[text]) { return { ok: false, code: '', reason: 'Giá trị danh mục "' + text + '" chưa có mã FBM trong Category.' }; }
  return { ok: true, code: FbmSync.categoryCode(categoryGate, source, text) };
};

/** Chuẩn hóa response completion thành map mã -> tên. */
FbmSync.lookupPairs = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || []; }
  if (!Array.isArray(data)) { return {}; }
  var out = {};
  data.forEach(function (item) {
    if (Array.isArray(item)) { out[String(item[0] || '').trim()] = String(item[1] || '').trim(); }
    else if (item) { out[String(item.Value || item.value || item.Code || item.code || '').trim()] = String(item.Text || item.text || item.Name || item.name || '').trim(); }
  });
  return out;
};

/** Tìm các mã Sheet không còn tồn tại hoặc đã đổi tên trên FBM. */
FbmSync.validateLookupGate = function (state, categoryGate) {
  var blocked = [], session = state && state.session && state.session.lookups || {};
  (FbmSync.SYNC_LOOKUPS || []).forEach(function (lookup) {
    var fbm = session[lookup.key], pairs = FbmSync.lookupPairs(fbm);
    if (!Object.keys(pairs).length) { blocked.push({ source: lookup.key, reason: 'Không lấy được danh mục FBM.' }); return; }
    if (!categoryGate || !categoryGate.namesBySource) { return; }
    var expected = categoryGate.namesBySource[lookup.key] || {};
    Object.keys(expected).forEach(function (code) {
      if (Object.prototype.hasOwnProperty.call(pairs, code) && pairs[code] !== expected[code]) {
        blocked.push({ source: lookup.key, code: code, reason: 'Tên danh mục trên FBM khác Category: ' + pairs[code] });
      } else if (!Object.prototype.hasOwnProperty.call(pairs, code)) {
        blocked.push({ source: lookup.key, code: code, reason: 'Mã danh mục không tồn tại trên FBM.' });
      }
    });
  });
  return blocked;
};

/** Cho biết bản ghi có được phép đẩy lên FBM hay không. */
FbmSync.pushPermission = function (record, entity, customer) {
  var allow = String(FbmSync.value(record, 'allowFbmPush', '')).trim();
  var stop = String(FbmSync.PUSH_STOP_VALUE).trim();
  if (allow.toLowerCase() === stop.toLowerCase()) { return { push: false, stop: true, reason: 'Bản ghi đã chọn ngừng đồng bộ.' }; }
  if (entity === 'activity' && customer && !FbmSync.pushPermission(customer, 'customer').push) { return { push: false, reason: 'Khách hàng cha chưa cho phép đẩy.' }; }
  return { push: allow.toLowerCase() === String(FbmSync.PUSH_ALLOW_VALUE).toLowerCase(), reason: 'Chưa bật Cho phép đẩy FBM.' };
};

/** Kiểm các SELECT có ánh xạ FBM; chiều pull không gọi phép này. */
FbmSync.validatePushCategories = function (record, entity, categoryGate) {
  var fields = entity === 'customer' ? [
    ['@CAT_TINH_THANH', FbmSync.value(record, 'province', FbmSync.value(record, 'dc_lh_tinh', ''))],
    ['@CAT_NGUON_KH', FbmSync.value(record, 'leadSource', FbmSync.value(record, 'nguon_dm', ''))],
    ['@CAT_SAN_PHAM', FbmSync.value(record, 'product', FbmSync.value(record, 'ma_sp', ''))]
  ] : [
    ['@CAT_CONG_VIEC', FbmSync.value(record, 'taskType', FbmSync.value(record, 'ma_cv', ''))],
    ['@CAT_SAN_PHAM', FbmSync.value(record, 'product', FbmSync.value(record, 'ma_sp', ''))]
  ];
  return fields.map(function (item) { return { source: item[0], result: FbmSync.categoryValueAllowed(categoryGate, item[0], item[1]) }; }).filter(function (item) { return !item.result.ok; });
};
