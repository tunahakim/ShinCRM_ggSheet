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
