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

/** Tiền tố và dấu ngăn của note ⛔ đời cũ (bộ vẽ từng báo lỗi bằng note ở hàng lọc). Chỉ còn để dọn note cũ khi chuẩn bị sheet. */
var VIEW_LEGACY_ERROR_NOTE_PREFIX = '⛔ ShinCRM:';
var VIEW_LEGACY_USER_NOTE_MARKER = '\n\nGhi chú trước đó:\n';

function viewEnsureControlColumns(sheet) {
  var header = sheetReadHeader(sheet);
  var missing = VIEW_CONTROL_COLUMNS.filter(function (column) { return header.indexOf(column.code) < 0; });
  if (!missing.length) { return []; }
  sheetColumnsInsertBefore(sheet, 1, missing.length);
  sheetCellsWrite(sheet, 1, 1, [
    missing.map(function (column) { return column.code; }),
    missing.map(function (column) { return column.label; })
  ]);
  return missing.map(function (column) { return column.code; });
}

/** Note hàng lọc mong muốn của một cột: cột sắp xếp mang hướng dẫn của nó; note ⛔ cũ trả lại phần ghi chú của người dùng; cột nguồn chưa có note mang bảng tra cú pháp lọc. */
function viewSetupFilterNote(code, current) {
  var control = VIEW_CONTROL_COLUMNS.filter(function (column) { return column.code === code; })[0];
  if (control) { return control.note; }
  var note = String(current || '');
  if (note.indexOf(VIEW_LEGACY_ERROR_NOTE_PREFIX) === 0) {
    var markerAt = note.indexOf(VIEW_LEGACY_USER_NOTE_MARKER);
    note = markerAt >= 0 ? note.slice(markerAt + VIEW_LEGACY_USER_NOTE_MARKER.length) : '';
  }
  if (!note && /^@(CUS|ACT)_/.test(code)) { return FILTER_QUICK_REFERENCE; }
  return note;
}

/** Note hàng lọc: đọc cả hàng một lệnh, ghi một lệnh cho đoạn từ cột đổi đầu tiên tới cột đổi cuối cùng; không đổi gì thì không ghi. */
function viewSetupFilterNotes(sheet, name, header) {
  var filterRow = sheetControlRow(name, 'filter');
  var current = sheetReadNotes(sheet, filterRow, 1, 1, header.length)[0] || [];
  var wanted = header.map(function (code, i) { return viewSetupFilterNote(code, current[i]); });
  var changed = wanted.map(function (note, i) { return note !== String(current[i] || '') ? i : -1; }).filter(function (i) { return i >= 0; });
  if (!changed.length) { return 0; }
  var first = changed[0];
  var last = changed[changed.length - 1];
  sheetCellsSetNotes(sheet, filterRow, first + 1, [wanted.slice(first, last + 1)]);
  return changed.length;
}

/** Chuẩn bị một sheet `!` trong khóa tài liệu: cột sắp xếp, nhãn hàng 2, note hàng lọc, khuôn chữ hàng lọc, ô kiểm dữ liệu sắp xếp, cố định hàng. Chỉ ghi ô đổi. */
function prepareViewSheet(sheetName) {
  var name = String(sheetName || '').trim();
  var sheet = name.charAt(0) === '!' ? shinOpenBook().getSheetByName(name) : null;
  if (!sheet) { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }
  return documentLockRun(function () { return viewPrepareLocked(sheet, name); });
}

function viewPrepareLocked(sheet, name) {
  var added = viewEnsureControlColumns(sheet);
  var header = sheetReadHeader(sheet);
  var headerMap = viewHeaderMap(header, name);
  var labelRow = sheetControlRow(name, 'label');
  var labels = sheetReadRows(sheet, [labelRow])[0];
  VIEW_CONTROL_COLUMNS.forEach(function (control) {
    var column = headerMap[control.code];
    if (String(labels[column - 1] || '') !== control.label) { sheetCellsWrite(sheet, labelRow, column, [[control.label]]); }
  });
  viewSetupFilterNotes(sheet, name, header);
  viewFormatFilterRowText(sheet, sheetControlRow(name, 'filter'), viewDrawnColumns(header));

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
  documentLockRun(function () {
    sheetCellsWrite(sheet, 1, 1, [
      columns.map(function (column) { return column.code; }),
      columns.map(function (column) { return column.label; })
    ]);
    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground('#d9ead3');
    sheet.getRange(2, 1, 1, columns.length).setFontWeight('bold');
    viewPrepareLocked(sheet, name);
  });
  var rendered = renderViewSheet(name);
  if (typeof file.setActiveSheet === 'function') { file.setActiveSheet(sheet); }
  return { ok: rendered.ok, sheetName: name, rows: rendered.rows, problems: rendered.problems };
}
