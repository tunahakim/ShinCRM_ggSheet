/**
 * Đọc ô thô và tờ nháp của một lần gọi GAS (tầng 1 đọc/ghi Sheet, tài liệu 06 Phần 2): hàng mã, số dòng, đối tượng sheet, múi giờ, các dòng đã đọc và cột đã đọc riêng.
 *
 * Tờ nháp sống cùng bản đọc kho DocumentProperties: chỉ có khi `documentStoreActive()`; vừa cầm khóa (`documentStoreRefresh`) thì bỏ phần của các sheet, hết lần gọi (`documentStoreClear`) thì bỏ hết. Ngoài lần gọi mọi hàm đọc thẳng Sheet. Sheet nào được nhớ do `sheetPolicy` quyết.
 * Công cụ ghi ô (`SheetCellWrite`) tự quên vùng vừa ghi và đánh dấu chờ `flush`; lần đọc Sheet kế tiếp `flush` trước, để Apps Script không trả về giá trị cũ của lệnh ghi còn gộp chờ.
 * Cạm bẫy: lệnh ghi còn gọi thẳng Google (chưa qua `SheetCellWrite`) chạm sheet được nhớ mà không gọi `sheetReadCopyDrop` thì phần còn lại của lần gọi đọc giá trị cũ; test kiểm kê writer chặn việc này.
 * Hàm trả mảng thì trả bản sao, để bên gọi sửa mảng không làm bẩn tờ nháp.
 */
var SHEET_READ_COPY = { timezone: null, sheets: {}, pendingFlush: false };

function sheetReadCopyHolds(sheetName) { return sheetPolicy(sheetName).remembers; }

function sheetReadCopySlot(sheetName) {
  if (!documentStoreActive() || !sheetReadCopyHolds(sheetName)) { return null; }
  return SHEET_READ_COPY.sheets[sheetName] || (SHEET_READ_COPY.sheets[sheetName] = {});
}

/** Ngoài lần gọi không hỏi tên sheet, vì không có gì để nhớ. */
function sheetReadCopySlotOf(sheet) {
  return documentStoreActive() ? sheetReadCopySlot(sheet.getName()) : null;
}

/** Vừa cầm khóa: tiến trình khác có thể vừa ghi sheet kho trong lúc chờ. Múi giờ tệp không do writer nào đổi nên giữ. */
function sheetReadCopyRefresh() { SHEET_READ_COPY.sheets = {}; }

function sheetReadCopyClear() { SHEET_READ_COPY.timezone = null; SHEET_READ_COPY.sheets = {}; SHEET_READ_COPY.pendingFlush = false; }

/** Writer vừa chạm sheet kho (ngoài cửa ghi) gọi để lần đọc sau lấy lại từ Sheet. */
function sheetReadCopyDrop(sheetName) { delete SHEET_READ_COPY.sheets[sheetName]; }

/** Sheet kho theo tên, mở một lần cho mỗi lần gọi. */
function sheetReadSheet(sheetName) {
  var slot = sheetReadCopySlot(sheetName);
  if (slot && slot.sheet) { return slot.sheet; }
  var sheet = shinOpenBook().getSheetByName(sheetName);
  if (slot && sheet) { slot.sheet = sheet; }
  return sheet;
}

/** Mọi lệnh đọc Sheet của tầng 1 gọi ngay trước khi đọc: còn lệnh ghi chưa ép xuống thì ép một lần. */
function sheetReadCopyBeforeRead() {
  if (!SHEET_READ_COPY.pendingFlush) { return; }
  SHEET_READ_COPY.pendingFlush = false;
  SpreadsheetApp.flush();
}

/** Hàng 1 đã cắt khoảng trắng, dài đúng `getLastColumn()`. */
function sheetReadHeader(sheet) {
  var slot = sheetReadCopySlotOf(sheet);
  if (slot && slot.header) { return slot.header.slice(); }
  sheetReadCopyBeforeRead();
  var lastColumn = sheet.getLastColumn();
  var header = lastColumn < 1 ? [] : sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (cell) {
    return cell === null || cell === undefined ? '' : String(cell).trim();
  });
  if (slot) { slot.header = header; }
  return header.slice();
}

/** `getLastRow()` của sheet; chỉ có giá trị trong khóa nơi nó được đọc. */
function sheetReadLastRow(sheet) {
  var slot = sheetReadCopySlotOf(sheet);
  if (slot && slot.lastRow !== undefined) { return slot.lastRow; }
  sheetReadCopyBeforeRead();
  var lastRow = sheet.getLastRow();
  if (slot) { slot.lastRow = lastRow; }
  return lastRow;
}

/**
 * Các dòng theo số dòng, giá trị thô, đủ chiều ngang hàng mã, đúng thứ tự xin. Đã có trong bản đọc thì không tốn lệnh nào; chưa có thì các dòng cách nhau không quá `SETTINGS.SHEET_READ_MERGE_GAP_ROWS` đọc chung một lệnh (đọc luôn dòng giữa và nhớ hết, vì phí mỗi dòng thừa rẻ hơn phí một lệnh). Dòng nằm ngoài lưới trả về dòng rỗng.
 */
function sheetReadRows(sheet, rowNumbers) {
  var width = sheetReadHeader(sheet).length;
  var slot = sheetReadCopySlotOf(sheet);
  var cached = slot ? (slot.rows || (slot.rows = {})) : {};
  var found = {};
  var missing = [];
  rowNumbers.forEach(function (row) {
    if (found[row]) { return; }
    if (cached[row]) { found[row] = cached[row]; return; }
    found[row] = true;
    missing.push(row);
  });
  sheetRegionsReadGroups(missing, SETTINGS.SHEET_READ_MERGE_GAP_ROWS).forEach(function (group) {
    var block = width ? sheetGridReadBlock(sheet, group[0], group[1] - group[0] + 1, width) : [];
    for (var row = group[0]; row <= group[1]; row++) {
      var values = block[row - group[0]] || sheetReadBlankRow(width);
      cached[row] = values;
      if (found[row] === true) { found[row] = values; }
    }
  });
  return rowNumbers.map(function (row) { return found[row].slice(); });
}

function sheetReadBlankRow(width) {
  var row = [];
  for (var i = 0; i < width; i++) { row.push(''); }
  return row;
}

/** Mọi dòng dữ liệu từ `firstDataRow` tới dòng cuối, qua `sheetReadRows`: lần sau trong cùng lần gọi chỉ đọc lại những dòng cửa ghi vừa đổi. */
function sheetReadDataRows(sheet, firstDataRow) {
  var rows = [];
  for (var row = firstDataRow; row <= sheetReadLastRow(sheet); row++) { rows.push(row); }
  return sheetReadRows(sheet, rows);
}

/** Giá trị thô một cột (số cột 1-based) của mọi dòng dữ liệu. Bản đọc đã có đủ các dòng thì lấy từ đó; chưa thì đọc riêng cột này một lệnh và nhớ. */
function sheetReadColumnValues(sheet, column, firstDataRow) {
  var count = Math.max(0, sheetReadLastRow(sheet) - firstDataRow + 1);
  if (!count) { return []; }
  var slot = sheetReadCopySlotOf(sheet);
  if (slot && slot.rows) {
    var values = [];
    for (var row = firstDataRow; row < firstDataRow + count; row++) {
      if (!slot.rows[row]) { values = null; break; }
      values.push(slot.rows[row][column - 1]);
    }
    if (values) { return values; }
  }
  if (slot && slot.columns && slot.columns[column]) { return slot.columns[column].slice(); }
  sheetReadCopyBeforeRead();
  var read = sheet.getRange(firstDataRow, column, count, 1).getValues().map(function (cells) { return cells[0]; });
  if (slot) { (slot.columns || (slot.columns = {}))[column] = read; }
  return read.slice();
}

/**
 * Chỉ `SheetCellWrite` gọi, ngay sau mỗi lệnh ghi: đánh dấu chờ `flush` và quên `rowCount` dòng từ `firstRow` cùng bản nhớ theo cột, để lần đọc sau lấy giá trị thật từ Sheet (và nhớ luôn); dòng khác giữ nguyên. Đụng hàng 1 thì quên hàng mã. `rowCount` là `null` khi dòng đã dịch chỗ (xóa dòng): bỏ cả phần của sheet.
 * `grew`: lệnh ghi giá trị có thể nối dài sheet nên nâng dòng cuối đã nhớ; xóa nội dung có thể làm dòng cuối co lại nên quên dòng cuối đã nhớ.
 */
function sheetReadCopyForget(sheet, firstRow, rowCount, grew) {
  SHEET_READ_COPY.pendingFlush = true;
  var slot = sheetReadCopySlotOf(sheet);
  if (!slot) { return; }
  if (rowCount === null) { sheetReadCopyDrop(sheet.getName()); return; }
  var lastRow = firstRow + rowCount - 1;
  if (slot.rows) { for (var row = firstRow; row <= lastRow; row++) { delete slot.rows[row]; } }
  delete slot.columns;
  if (firstRow <= 1) { delete slot.header; }
  if (!grew) { delete slot.lastRow; } else if (slot.lastRow !== undefined && lastRow > slot.lastRow) { slot.lastRow = lastRow; }
}

/** Múi giờ tệp Sheet, hỏi một lần cho mỗi lần gọi. */
function sheetReadTimezone() {
  if (documentStoreActive() && SHEET_READ_COPY.timezone) { return SHEET_READ_COPY.timezone; }
  var timezone = shinOpenBook().getSpreadsheetTimeZone();
  if (documentStoreActive()) { SHEET_READ_COPY.timezone = timezone; }
  return timezone;
}
