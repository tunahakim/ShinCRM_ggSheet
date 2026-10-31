/**
 * Thao tác sheet `Log`: lấy hoặc dựng lại sheet, ghi một khối dòng bằng một lệnh, cắt theo trần số dòng và trần tuổi. Tài liệu 10 Phần 4 tới Phần 6 và Phần 11.
 *
 * Công cụ ghi, không biết bộ đệm hay luật che: nhận các dòng đã thành ô từ `flushLog` (`server/log/LogGate.js`). Không lấy `LockService` vì khóa của dự án không tái nhập, lời gọi log trong vùng đã khóa sẽ tự chặn chính mình.
 */

/** Khóa `DocumentProperties` chặn việc quét tuổi log quá một lần mỗi ngày dương lịch. Tài liệu 10 Phần 11. */
var LOG_CLEANUP_KEY = 'LOG_LAST_CLEANUP';

/** Số hàng nới thừa mỗi lần lưới sheet `Log` hết chỗ. Nới thừa để một lượt nới đủ cho vài trăm lượt nhả sau đó, chứ nới vừa đủ thì gần như mọi lượt nhả đều tốn thêm một lệnh gọi. */
var LOG_GRID_SLACK = 500;

/** Đếm số lệnh `setValues` mà tệp này đã gọi. Chỉ dùng cho phép nghiệm thu "một lượt chỉ tốn một lệnh ghi" — không có nó thì luật đó là lời hứa không đo được. */
var LOG_WRITE_CALLS = 0;

/** Số lệnh ghi đã tốn. Phép nghiệm thu đọc số này trước và sau một lượt để biết một lượt tốn mấy lệnh. */
function logGateWriteCount() {
  return LOG_WRITE_CALLS;
}

/**
 * Lấy sheet `Log`, **tạo lại kèm hàng tiêu đề nếu không tìm thấy**.
 *
 * Đây là ca hỏng có thật và hay xảy ra nhất: chủ dự án không phải người viết code, một lúc nào đó sẽ xóa hoặc đổi tên sheet. Tự tạo lại xóa hẳn một lớp lỗi thay vì báo cáo nó. Tài liệu 10 Phần 5.
 *
 * Cố ý không gọi `setupSheets`: hàm đó dựng lại cả năm sheet, mà ở đây chỉ thiếu một sheet không phải nguồn sự thật.
 */
function logSheet() {
  var book = shinOpenBook();
  var sheet = book.getSheetByName('Log');
  if (sheet) { return sheet; }

  sheet = sheetBookCreate('Log');
  sheetCellsWrite(sheet, 1, 1, [LOG_HEADERS]);
  sheetCellsStyle(sheet, 1, 1, 1, LOG_HEADERS.length, { bold: true, background: SHEET_LAYOUT.Log.headerColor });
  sheetFrozenRowsSet(sheet, SHEET_LAYOUT.Log.headerRows);
  console.error('Sheet Log không tồn tại nên đã dựng lại. Lịch sử log trước đó đã mất.');
  return sheet;
}

/**
 * Nới lưới sheet nếu vùng ghi sắp tới vượt quá số hàng sheet đang có.
 *
 * Vì sao phải có: `setValues` **không** tự nới sheet, và `getRange` chạm quá hàng cuối là ném lỗi ngay. Ghép với việc `flushLog` bắt mọi lỗi
 * rồi đi tiếp, cách hỏng của nó là thứ tệ nhất trong các cách hỏng — log **lặng lẽ tắt hẳn** kể từ dòng đầu tiên vượt lưới, sheet `Log` đứng
 * im ở đúng con số cũ, và không có gì ngoài một dòng trong Cloud logging nói ra. Sheet mới của Google có 1.000 hàng, nên nó tự hỏng đúng vào
 * lúc log bắt đầu có ích.
 *
 * Nới thừa `LOG_GRID_SLACK` hàng chứ không nới vừa đủ: nới vừa đủ nghĩa là gần như mọi lượt nhả sau đó đều tốn thêm một lệnh gọi.
 *
 * Phép nới thật nằm ở `SheetGrid.gs`, vì bài học về lưới hữu hạn phải nằm ở một chỗ duy nhất mà cả đường ghi log lẫn đường nạp dữ liệu đều đi qua. Còn **nới thừa bao nhiêu** thì vẫn là chính sách riêng của sheet `Log`: đây là sheet duy nhất bị ghi thêm vài dòng mỗi lượt chạy, nên nó cần đệm dày hơn các sheet khác.
 */
function logEnsureRoom(sheet, endRow) {
  sheetGridEnsureRoom(sheet, endRow, LOG_GRID_SLACK);
}

/** Ghi `rows` (mỗi dòng chín ô) nối dưới dòng cuối của sheet `Log` bằng đúng một lệnh ghi, nới lưới trước nếu thiếu chỗ. */
function logSheetAppend(sheet, rows) {
  var startRow = Math.max(sheetReadLastRow(sheet) + 1, SHEET_LAYOUT.Log.firstDataRow);
  logEnsureRoom(sheet, startRow + rows.length - 1);
  sheetCellsWrite(sheet, startRow, 1, rows);
  LOG_WRITE_CALLS += 1;
}

/**
 * Trần số dòng: cắt cũ nhất trước bằng công cụ xóa dòng, kiểm mỗi lần nhả.
 *
 * Kiểm mỗi lần vì rẻ: chỉ một lệnh `getLastRow()`. Vai trò thật của trần này là lưới an toàn cho một vòng lặp lỗi chạy hoang, không phải cái cắt log trong ngày thường.
 *
 * `deleteRows` là một lệnh gọi API bất kể xóa bao nhiêu dòng. Đã đo trên sheet `Log` 5.000 dòng thật: xóa 1 dòng mất 309 ms, xóa 1.000 dòng mất 374 ms. Chi phí phẳng.
 */
function logTrimRows(sheet) {
  var firstDataRow = SHEET_LAYOUT.Log.firstDataRow;
  var excess = sheetReadLastRow(sheet) - firstDataRow + 1 - SETTINGS.LOG_MAX_ROWS;
  if (excess > 0) {
    sheetRowsDelete(sheet, logRowRange(firstDataRow, excess));
  }
}

/**
 * Trần tuổi dòng: xóa dòng cũ hơn `SETTINGS.LOG_RETENTION_DAYS` ngày, nhiều nhất một lần mỗi ngày dương lịch.
 *
 * Đây là cái thực sự cắt log trong ngày thường. Nó phải đọc cột `Lúc` nên không kiểm mỗi lần nhả; khóa ngày trong `DocumentProperties` chặn việc đó.
 *
 * Khóa ngày đặt **trước** khi quét, không phải sau. Nếu đặt sau thì một lần quét lỗi sẽ quét lại ở mọi lần nhả trong suốt cả ngày — mà một phép quét đã lỗi thì lần sau cũng lỗi đúng như thế, chỉ thêm tốn.
 *
 * Dòng nào ô `Lúc` rỗng hoặc không theo khuôn thì **dừng lại**, không xóa. Không đoán được ngày của một dòng thì không có quyền xóa nó.
 */
function logTrimAge(sheet) {
  var props = documentProps();
  var today = Utilities.formatDate(new Date(), LOG_TIMEZONE, 'yyyy-MM-dd');
  if (props.getProperty(LOG_CLEANUP_KEY) === today) { return; }
  props.setProperty(LOG_CLEANUP_KEY, today);

  var firstDataRow = SHEET_LAYOUT.Log.firstDataRow;
  var lastRow = sheetReadLastRow(sheet);
  if (lastRow < firstDataRow) { return; }

  var cutoffMs = new Date().getTime() - SETTINGS.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var cutoff = Utilities.formatDate(new Date(cutoffMs), LOG_TIMEZONE, LOG_TIME_FORMAT);
  var stamps = sheetReadColumnValues(sheet, 1, firstDataRow);
  var tooOld = 0;

  for (var i = 0; i < stamps.length; i += 1) {
    var stamp = sheetReadCellText(stamps[i]);
    if (stamp.length !== LOG_TIME_FORMAT.length || stamp >= cutoff) { break; }
    tooOld += 1;
  }

  if (tooOld > 0) {
    sheetRowsDelete(sheet, logRowRange(firstDataRow, tooOld));
  }
}

/** Danh sách `count` số dòng liền nhau từ `firstRow`, cho công cụ xóa dòng (nó gom lại thành một lệnh). */
function logRowRange(firstRow, count) {
  var rows = [];
  for (var i = 0; i < count; i++) { rows.push(firstRow + i); }
  return rows;
}
