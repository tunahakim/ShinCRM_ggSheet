/**
 * Bản đọc chung của bốn sheet kho cho một lần gọi GAS: hàng mã, số dòng, đối tượng sheet, múi giờ, các dòng đã đọc và cột đã đọc riêng. Tài liệu 06 Phần 2 "Bản đọc Sheet của một lần gọi".
 *
 * Sống cùng bản đọc kho DocumentProperties: chỉ có khi `documentStoreActive()`; vừa cầm khóa (`documentStoreRefresh`) thì bỏ phần của các sheet, hết lần gọi (`documentStoreClear`) thì bỏ hết. Ngoài lần gọi mọi hàm đọc thẳng Sheet như trước.
 * Sheet không phải sheet kho (sheet `!`, `Log`, sheet nháp) không được nhớ: người dùng sửa tay chúng tự do và không có người giữ khóa nào ghi thay họ.
 * Cạm bẫy: writer chạm sheet kho mà không gọi `sheetReadCopyDrop` thì phần còn lại của lần gọi đọc hàng mã cột hoặc số dòng cũ; test kiểm kê writer chặn việc này.
 * Hàm trả mảng thì trả bản sao, để bên gọi sửa mảng không làm bẩn bản đọc.
 */
var SHEET_READ_COPY = { timezone: null, sheets: {} };

/** Bốn sheet kho là các sheet có khai hình dáng mà không phải sheet ghi nhật ký. */
function sheetReadCopyHolds(sheetName) {
  var layout = SHEET_LAYOUT[sheetName];
  return !!layout && !layout.plainHeaders;
}

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

function sheetReadCopyClear() { SHEET_READ_COPY.timezone = null; SHEET_READ_COPY.sheets = {}; }

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

/** Hàng 1 đã cắt khoảng trắng, dài đúng `getLastColumn()`. */
function sheetReadHeader(sheet) {
  var slot = sheetReadCopySlotOf(sheet);
  if (slot && slot.header) { return slot.header.slice(); }
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
  missing.sort(function (a, b) { return a - b; });
  var groups = [];
  missing.forEach(function (row) {
    var last = groups[groups.length - 1];
    if (last && row - last[1] <= SETTINGS.SHEET_READ_MERGE_GAP_ROWS) { last[1] = row; } else { groups.push([row, row]); }
  });
  groups.forEach(function (group) {
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
  var read = sheet.getRange(firstDataRow, column, count, 1).getValues().map(function (cells) { return cells[0]; });
  if (slot) { (slot.columns || (slot.columns = {}))[column] = read; }
  return read.slice();
}

/**
 * Chỉ cửa ghi gọi, trong khóa, ngay sau khi ghi và `flush`: quên các dòng vừa ghi và bản nhớ theo cột để lần đọc lại sau đó lấy giá trị thật từ Sheet (và nhớ luôn), các dòng khác giữ nguyên. `lastRow` là dòng cuối mới khi vừa nối thêm dòng.
 */
function sheetReadCopyForgetRows(sheet, rowNumbers, lastRow) {
  var slot = sheetReadCopySlotOf(sheet);
  if (!slot) { return; }
  if (slot.rows) { rowNumbers.forEach(function (row) { delete slot.rows[row]; }); }
  delete slot.columns;
  if (lastRow !== undefined && slot.lastRow !== undefined && lastRow > slot.lastRow) { slot.lastRow = lastRow; }
}

/** Múi giờ tệp Sheet, hỏi một lần cho mỗi lần gọi. */
function sheetReadTimezone() {
  if (documentStoreActive() && SHEET_READ_COPY.timezone) { return SHEET_READ_COPY.timezone; }
  var timezone = shinOpenBook().getSpreadsheetTimeZone();
  if (documentStoreActive()) { SHEET_READ_COPY.timezone = timezone; }
  return timezone;
}
