/** Probe DEV cho phép thử Extension đọc mã khách do công thức mảng sinh ra. Ghi bằng script nên không phát sinh trigger, bộ vẽ không chạm sheet thử. */

var FORMULA_PROBE_SHEETS = ['!TestCongThuc', 'TestCongThuc'];

function formulaProbeCreate() {
  var book = shinOpenBook();
  var customer = book.getSheetByName(ENTITY_SHEETS.customer);
  var column = selectionColumnIndex(customer, DATA_SCHEMA.customer.id.code);
  if (!column) { throw new Error('Customer thiếu cột ' + DATA_SCHEMA.customer.id.code); }
  var letter = customer.getRange(1, column).getA1Notation().replace(/\d+/g, '');
  var source = "'" + ENTITY_SHEETS.customer + "'!" + letter + SHEET_FIRST_DATA_ROW + ':' + letter;
  var formula = '=SORT(FILTER(' + source + '; ' + source + '<>""); 1; FALSE)';
  return FORMULA_PROBE_SHEETS.map(function (name) {
    if (book.getSheetByName(name)) { throw new Error('Đã có sheet ' + name + '; chạy formulaProbeRemove trước.'); }
    var sheet = book.insertSheet(name);
    sheet.getRange(1, 1).setValue('@CUS_MA_KH');
    sheet.getRange(SHEET_FIRST_DATA_ROW, 1).setFormula(formula);
    SpreadsheetApp.flush();
    return name + ': ' + formula + ' → 5 dòng đầu ' + JSON.stringify(sheet.getRange(SHEET_FIRST_DATA_ROW, 1, 5, 1).getValues());
  });
}

function formulaProbeRemove() {
  var book = shinOpenBook();
  return FORMULA_PROBE_SHEETS.map(function (name) {
    var sheet = book.getSheetByName(name);
    if (!sheet) { return name + ': không có'; }
    book.deleteSheet(sheet);
    return name + ': đã xóa';
  });
}

/** Đo từng khúc của đường trigger, lời dò Sidebar, tô tab và đọc công thức để biết chi phí nằm ở đâu trước khi sửa. Tăng revision thật trên Sheet DEV. */
function measureReloadCosts() {
  var out = [];
  var time = function (label, fn) {
    var t = Date.now();
    var result = fn();
    out.push(label + ': ' + (Date.now() - t) + ' ms');
    return result;
  };
  var book = time('shinOpenBook', function () { return shinOpenBook(); });
  var views = time('shinViewSheetNames', function () { return shinViewSheetNames(book); });
  out.push('Sheet !: ' + views.join(', '));
  time('reloadStateRead', function () { return reloadStateRead(); });
  var customer = book.getSheetByName(ENTITY_SHEETS.customer);
  var idColumn = selectionColumnIndex(customer, DATA_SCHEMA.customer.id.code);
  var firstId = customer.getRange(SHEET_FIRST_DATA_ROW, idColumn).getValue();
  time('shinReloadDecision (ghi signal một khách)', function () {
    return shinReloadDecision({ source: 'edit', surface: 'record', entity: 'customer', recordIds: [firstId] });
  });
  views.forEach(function (name) { time('renderViewSheet ' + name, function () { return renderViewSheet(name); }); });
  time('selectionProbeContext + snapshot', function () { return selectionSnapshotFromContext(selectionProbeContext()); });
  time('probeSelectionAndReload lần 1 (còn signal)', function () { return probeSelectionAndReload({}); });
  var seen = reloadStateRead().revision;
  time('probeSelectionAndReload lần 2 (đã thấy revision, không gì bẩn)', function () { return probeSelectionAndReload({ lastSeenRevision: seen }); });
  if (views.length) {
    var view = book.getSheetByName(views[0]);
    var original = view.getTabColor();
    time('setTabColor cam ' + views[0], function () { view.setTabColor('#ff9900'); SpreadsheetApp.flush(); });
    time('setTabColor trả màu ' + views[0], function () { view.setTabColor(original); SpreadsheetApp.flush(); });
    time('getTabColor', function () { return view.getTabColor(); });
    var rows = Math.max(view.getLastRow() - SHEET_FIRST_DATA_ROW + 1, 1);
    time('getFormulas ' + rows + ' dòng x ' + view.getLastColumn() + ' cột trên ' + views[0], function () {
      return view.getRange(SHEET_FIRST_DATA_ROW, 1, rows, Math.max(view.getLastColumn(), 1)).getFormulas();
    });
  }
  return out;
}

/** Đo tô màu tab cho năm sheet trong một lượt với một lần flush; dùng sheet tạm không có dấu ! để bộ vẽ không chạm. */
function measureTabColorBatch() {
  var book = shinOpenBook();
  var sheets = [1, 2, 3, 4, 5].map(function (i) { return book.insertSheet('__TabColorProbe' + i); });
  try {
    SpreadsheetApp.flush();
    var t = Date.now();
    sheets.forEach(function (sheet) { sheet.setTabColor('#ff9900'); });
    SpreadsheetApp.flush();
    var paint = Date.now() - t;
    t = Date.now();
    var colors = sheets.map(function (sheet) { return sheet.getTabColor(); });
    var read = Date.now() - t;
    t = Date.now();
    sheets.forEach(function (sheet) { sheet.setTabColor(null); });
    SpreadsheetApp.flush();
    return ['Tô cam 5 sheet + 1 flush: ' + paint + ' ms', 'Đọc màu 5 sheet: ' + read + ' ms (' + colors.join(',') + ')', 'Trả màu 5 sheet + 1 flush: ' + (Date.now() - t) + ' ms'];
  } finally {
    sheets.forEach(function (sheet) { book.deleteSheet(sheet); });
  }
}

/** Đo lời hỏi rẻ và lời hỏi đọc vị trí, mỗi hàm là lời gọi đầu tiên của một lượt chạy mới để tính cả phí mở bảng tính lần đầu. */
function measureProbeCheap() {
  var seen = reloadStateRead().revision;
  var t = Date.now();
  probeSelectionAndReload({ skipPosition: true, lastSeenRevision: seen, previousSelectionContext: { sheetName: ENTITY_SHEETS.customer, row: SHEET_FIRST_DATA_ROW, col: 1 }, previousCustomerId: 'CUS-DO' });
  return 'probe skipPosition: ' + (Date.now() - t) + ' ms';
}

function measureProbeFull() {
  var seen = reloadStateRead().revision;
  var t = Date.now();
  probeSelectionAndReload({ lastSeenRevision: seen, previousCustomerId: 'CUS-DO' });
  return 'probe đọc vị trí: ' + (Date.now() - t) + ' ms';
}

/** Giả một lượt sắp xếp trên Customer (onChange `OTHER`, sheet active của lượt chạy là sheet đầu) rồi đo lời hỏi nạp trọn thực thể trên dữ liệu thật. */
function measureEntitySignal() {
  var out = [];
  var active = shinOpenBook().getActiveSheet().getName();
  out.push('Sheet active: ' + active);
  shinOnChange({ changeType: 'OTHER' });
  var journal = reloadJournalRead();
  out.push('Sau OTHER: dòng sổ cuối ' + JSON.stringify(journal.entries[journal.entries.length - 1] || null) + ', revision ' + journal.rev);
  var t = Date.now();
  var probe = probeSelectionAndReload({ lastSeenRevision: journal.rev - 1, skipPosition: true, previousSelectionContext: { sheetName: active } });
  var parts = probe.payload ? probe.payload.parts : [];
  out.push('Lời hỏi: ' + (Date.now() - t) + ' ms, phần ' + JSON.stringify(parts.map(function (part) { var block = part.entity && part[part.entity]; return part.mode + (part.entity ? ' ' + part.entity : '') + (block ? ' ' + block.rows.length + ' dòng' : ''); })));
  return out;
}
