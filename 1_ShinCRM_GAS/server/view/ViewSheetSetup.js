/** Tạo và chuẩn bị sheet quản trị; không chứa logic lọc, sắp hay chép dữ liệu từ kho. */

var VIEW_SORT_MAX_LEVELS = 10;

var VIEW_CONTROL_COLUMNS = [
  {
    code: '@VIEW_SORT_COL',
    label: 'Sắp xếp — mã cột',
    note: 'Chọn mã cột cần sắp. Chỉ 10 hàng từ 4 đến 13 được đọc; thứ tự từ trên xuống là thứ tự ưu tiên.'
  },
  {
    code: '@VIEW_SORT_LEVEL',
    label: 'Sắp xếp — chiều',
    note: 'Chọn chiều sắp xếp cho mã cột cùng hàng. Hàng thiếu một vế được bỏ qua.'
  }
];

function viewStarterColumns() {
  return VIEW_CONTROL_COLUMNS.concat([
    DATA_SCHEMA.customer.id,
    DATA_SCHEMA.customer.companyName,
    DATA_SCHEMA.customer.contactPerson,
    DATA_SCHEMA.customer.phone,
    DATA_SCHEMA.customer.verifyStatus,
    DATA_SCHEMA.customer.note,
    DATA_SCHEMA.activity.workDate,
    DATA_SCHEMA.activity.taskType,
    DATA_SCHEMA.activity.content,
    DATA_SCHEMA.activity.priority,
    DATA_SCHEMA.activity.dueAt
  ]);
}

function viewSetupSourceCodes() {
  return ['Customer', 'Activity'].reduce(function (result, sheetName) {
    var prefix = sheetName === 'Customer' ? '@CUS_' : '@ACT_';
    return result.concat(readColumnMap(sheetName).headerRow.filter(function (code) { return code.indexOf(prefix) === 0; }));
  }, []);
}

function viewSetupHeader(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return []; }
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || '').trim(); });
}

function viewEnsureControlColumns(sheet) {
  var header = viewSetupHeader(sheet);
  var missing = VIEW_CONTROL_COLUMNS.filter(function (column) { return header.indexOf(column.code) < 0; });
  if (!missing.length) { return []; }
  sheet.insertColumnsBefore(1, missing.length);
  sheet.getRange(1, 1, 2, missing.length).setValues([
    missing.map(function (column) { return column.code; }),
    missing.map(function (column) { return column.label; })
  ]);
  return missing.map(function (column) { return column.code; });
}

function prepareViewSheet(sheetName) {
  var name = String(sheetName || '').trim();
  var sheet = shinOpenBook().getSheetByName(name);
  if (!sheet || name.charAt(0) !== '!') { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }

  var added = viewEnsureControlColumns(sheet);
  var header = viewSetupHeader(sheet);
  var headerMap = viewHeaderMap(header, name);
  VIEW_CONTROL_COLUMNS.forEach(function (control) {
    var column = headerMap[control.code];
    sheet.getRange(2, column).setValue(control.label);
    sheet.getRange(3, column).setNote(control.note);
  });
  header.forEach(function (code, index) {
    if (!/^@(CUS|ACT)_/.test(code)) { return; }
    var cell = sheet.getRange(3, index + 1);
    if (!cell.getNote()) { cell.setNote(FILTER_QUICK_REFERENCE); }
  });

  var lastSortRow = SHEET_FIRST_DATA_ROW + VIEW_SORT_MAX_LEVELS - 1;
  sheetGridEnsureRoom(sheet, lastSortRow, 0);
  if (typeof SpreadsheetApp.newDataValidation === 'function') {
    var codeRule = SpreadsheetApp.newDataValidation().requireValueInList(viewSetupSourceCodes(), true).setAllowInvalid(false).setHelpText(VIEW_CONTROL_COLUMNS[0].note).build();
    var levelRule = SpreadsheetApp.newDataValidation().requireValueInList(SORT_LEVEL_OPTIONS, true).setAllowInvalid(false).setHelpText(VIEW_CONTROL_COLUMNS[1].note).build();
    sheet.getRange(SHEET_FIRST_DATA_ROW, headerMap['@VIEW_SORT_COL'], VIEW_SORT_MAX_LEVELS, 1).setDataValidation(codeRule);
    sheet.getRange(SHEET_FIRST_DATA_ROW, headerMap['@VIEW_SORT_LEVEL'], VIEW_SORT_MAX_LEVELS, 1).setDataValidation(levelRule);
  }

  sheet.setFrozenRows(SHEET_HEADER_ROWS);
  return {
    ok: true,
    sheetName: name,
    addedColumns: added,
    sortColumn: headerMap['@VIEW_SORT_COL'],
    sortLevel: headerMap['@VIEW_SORT_LEVEL'],
    firstSortRow: SHEET_FIRST_DATA_ROW,
    lastSortRow: lastSortRow
  };
}

function createViewSheet(requestedName) {
  var raw = String(requestedName || '').trim();
  if (!raw) { throw new Error('Hãy nhập tên sheet quản trị.'); }
  var name = raw.charAt(0) === '!' ? raw : '!' + raw;
  if (name === '!') { throw new Error('Tên sheet quản trị phải có nội dung sau dấu !.'); }
  var file = shinOpenBook();
  if (file.getSheetByName(name)) { throw new Error('Đã có sheet tên "' + name + '". Hãy chọn tên khác.'); }

  var columns = viewStarterColumns();
  var sheet = file.insertSheet(name);
  sheet.getRange(1, 1, SHEET_HEADER_ROWS, columns.length).setValues([
    columns.map(function (column) { return column.code; }),
    columns.map(function (column) { return column.label; }),
    columns.map(function () { return ''; })
  ]);
  sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground('#d9ead3');
  sheet.getRange(2, 1, 1, columns.length).setFontWeight('bold');
  prepareViewSheet(name);
  var rendered = renderViewSheet(name);
  if (typeof file.setActiveSheet === 'function') { file.setActiveSheet(sheet); }
  return { ok: true, sheetName: name, rows: rendered.rows, rowMaps: rendered.rowMaps, viewMeta: rendered.viewMeta };
}
