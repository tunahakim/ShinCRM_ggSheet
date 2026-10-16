/**
 * Bản đọc chung của bốn sheet kho cho một lần gọi GAS. Tài liệu 06 Phần 2 "Bản đọc Sheet của một lần gọi".
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

/** Múi giờ tệp Sheet, hỏi một lần cho mỗi lần gọi. */
function sheetReadTimezone() {
  if (documentStoreActive() && SHEET_READ_COPY.timezone) { return SHEET_READ_COPY.timezone; }
  var timezone = shinOpenBook().getSpreadsheetTimeZone();
  if (documentStoreActive()) { SHEET_READ_COPY.timezone = timezone; }
  return timezone;
}
