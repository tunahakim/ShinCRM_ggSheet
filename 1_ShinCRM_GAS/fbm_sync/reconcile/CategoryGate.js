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

/** Đọc cặp danh mục thật/companion qua tầng 3 (`categoryReadColumns`): trong một lần gọi chỉ tốn một lần đọc Sheet; lần gọi sau đọc lại nên sửa Category có hiệu lực ngay. */
FbmSync.readCategoryGate = function () {
  if (typeof categoryReadColumns !== 'function' || typeof CATEGORY_COLUMNS === 'undefined') { return { map: {}, names: {}, valid: {}, warnings: [] }; }
  var pairs = [];
  CATEGORY_COLUMNS.forEach(function (pair) {
    var source = pair[0];
    if (typeof categoryIsCompanion === 'function' && categoryIsCompanion(source)) { return; }
    var companionCode = source + (typeof CATEGORY_FBM_SUFFIX === 'undefined' ? '_FBM' : CATEGORY_FBM_SUFFIX);
    if (typeof categoryIsCompanion === 'function' && !categoryIsCompanion(companionCode)) { return; }
    pairs.push([source, companionCode]);
  });
  var columns = categoryReadColumns([].concat.apply([], pairs));
  var entries = [], names = {}, warnings = [];
  pairs.forEach(function (pair) {
    columns[pair[0]].forEach(function (value, i) {
      var companion = columns[pair[1]][i];
      if (value && companion) { entries.push({ source: pair[0], value: value, companion: companion }); }
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

/**
 * Gate danh mục của phiên: map dựng lại từ Sheet Category (nguồn sự thật) qua bản chụp của lần gọi, mã bị chặn suy từ `metadata.categoryBlocks` của phiên.
 * Không chép map vào state: một giá trị DocumentProperties chỉ khoảng 9 KB, Category thật vượt ngưỡng đó làm phiên dừng ở bước đọc Customer (FBM-042).
 * Không nhớ bản dựng trên object state: bản nhớ sống qua lần đổi `categoryBlocks` và qua bản đọc Category khác, nên hai nơi gọi có thể xét theo hai cổng khác nhau. Trong một lần gọi Sheet Category chỉ đọc một lần nhờ bản chụp; đọc lỗi thì ném, không thành cổng rỗng.
 */
FbmSync.stateCategoryGate = function (state) {
  // Chép nông: gate đọc từ bản chụp dùng chung cho cả lần gọi, không được gắn `blocked` của phiên này lên nó.
  var gate = Object.assign({}, FbmSync.readCategoryGate());
  gate.blocked = {};
  (state && state.metadata && state.metadata.categoryBlocks || []).forEach(function (block) {
    if (block && block.source && block.code) { gate.blocked[block.source + '\u001f' + block.code] = block.reason; }
  });
  return gate;
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
  var valid = categoryGate && categoryGate.valid && categoryGate.valid[source], mapped = categoryGate && categoryGate.map && categoryGate.map[source + '\u001f' + text], codes = categoryGate && categoryGate.codesBySource && categoryGate.codesBySource[source];
  if (!valid && !mapped && !(codes && codes.indexOf(text) >= 0)) { return { ok: false, code: '', reason: 'Giá trị danh mục "' + text + '" chưa có mã FBM trong Category.' }; }
  if (valid && !valid[text]) { return { ok: false, code: '', reason: 'Giá trị danh mục "' + text + '" chưa có mã FBM trong Category.' }; }
  var code = FbmSync.categoryCode(categoryGate, source, text), blocked = categoryGate && categoryGate.blocked && categoryGate.blocked[source + '\u001f' + code];
  return blocked ? { ok: false, code: code, reason: blocked } : { ok: true, code: code };
};

/**
 * Các ô danh mục của bản ghi không qua được cổng: thiếu mã FBM trong Category, hoặc mã bị chặn vì FBM đã đổi tên/xóa. Trả `[{ source, value, result }]`, rỗng là qua.
 * Một phép kiểm cho cả hai chiều: bản ghi kéo về và bản ghi sắp đẩy xét trên cùng cổng của lần gọi, nên một mã không thể lọt chiều này mà bị chặn chiều kia. Tên trường FBM chỉ là đường dự phòng khi bản ghi chưa đổi sang tên ShinCRM.
 */
FbmSync.categoryGateCheck = function (record, entity, categoryGate) {
  var fields = entity === 'customer' ? [
    ['@CAT_TINH_THANH', FbmSync.value(record, 'province', FbmSync.value(record, 'dc_lh_tinh', ''))],
    ['@CAT_NGUON_KH', FbmSync.value(record, 'leadSource', FbmSync.value(record, 'nguon_dm', ''))]
  ] : [
    ['@CAT_CONG_VIEC', FbmSync.value(record, 'taskType', FbmSync.value(record, 'ma_cv', ''))]
  ];
  return fields.map(function (item) {
    var value = String(item[1] === null || item[1] === undefined ? '' : item[1]).trim();
    return { source: item[0], value: value, result: FbmSync.categoryValueAllowed(categoryGate, item[0], value) };
  }).filter(function (item) { return !item.result.ok; });
};
