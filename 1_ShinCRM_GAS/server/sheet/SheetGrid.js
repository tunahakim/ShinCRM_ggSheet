/**
 * Sự thật về **lưới** của một sheet, và chỉ về lưới: lưới rộng bao nhiêu, nới lưới trước khi ghi, đọc một vùng mà không đi ra ngoài lưới, và ca không có dòng dữ liệu nào.
 *
 * Tệp này ra đời từ một lỗi thật ở chặng 1.1, đáng ghi lại vì nó là loại lỗi không ai đoán trước được bằng cách đọc tài liệu Google:
 *   - Lưới của sheet là **hữu hạn**. Sheet mới dựng có 1000 hàng 26 cột.
 *   - `setValues` **không tự nới** lưới. Ghi ra ngoài lưới thì ném lỗi, không phải tự thêm hàng.
 *   - `deleteRows` **làm lưới co lại**, nên một sheet bị dọn nhiều lần sẽ hết chỗ dù trông vẫn còn trống.
 *   - `getRange` hỏi ra ngoài lưới thì ném lỗi, kể cả khi chỉ hỏi để đọc.
 *
 * Bốn điều đó cộng lại thành một cái bẫy: code chạy đúng hàng nghìn lượt rồi một hôm chết, ở đúng lúc không ai ngồi xem. Nên bài học này phải nằm ở **một chỗ duy nhất** mà mọi đường ghi và mọi đường đọc đều đi qua, chứ không nằm rải trong từng hàm gọi `getRange`.
 *
 * Tệp này không biết gì về thực thể, về bảng khai trường, về mã cột `@`. Nó chỉ biết hàng và cột. Ai biết về thực thể thì ở `EntityRead.gs`.
 */

/** Số hàng nới thừa mặc định mỗi lần hết chỗ. Nới thừa chứ không nới vừa đủ: nới vừa đủ nghĩa là gần như mọi lượt ghi sau đó đều tốn thêm một lệnh gọi mạng. */
var SHEET_GRID_SLACK = 500;

/**
 * Bảo đảm lưới của `sheet` với tới được hàng `endRow`, nới thêm nếu chưa.
 *
 * Trả về số hàng đã nới thêm, `0` nghĩa là lưới vốn đã đủ. Trả về con số chứ không trả về `undefined` để phép nghiệm thu đo được — một luật không đo được là một lời hứa.
 */
function sheetGridEnsureRoom(sheet, endRow, slack) {
  var maxRows = sheet.getMaxRows();
  if (endRow <= maxRows) { return 0; }

  var them = endRow - maxRows + (slack === undefined ? SHEET_GRID_SLACK : slack);
  sheet.insertRowsAfter(maxRows, them);
  return them;
}

/**
 * Có bao nhiêu hàng dữ liệu, tính từ `firstDataRow` xuống. Sheet chỉ có hàng tiêu đề thì trả về `0`.
 *
 * Đây là chỗ **duy nhất** trả lời câu hỏi đó, vì `getLastRow()` trả về `0` ở sheet trắng hoàn toàn và trả về `3` ở sheet đã có ba hàng tiêu đề mà chưa có dữ liệu — hai con số khác nhau cho cùng một tình huống "chưa có bản ghi nào". Phép trừ này viết lại ở mỗi hàm đọc là mỗi hàm đọc có một cơ hội trừ sai một.
 */
function sheetGridDataRowCount(sheet, firstDataRow) {
  var lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) { return 0; }
  return lastRow - firstDataRow + 1;
}

/**
 * Đọc `rowCount` hàng kể từ hàng `firstRow`, rộng `columnCount` cột, cắt gọn theo lưới thật.
 *
 * Trả về mảng rỗng thay vì ném lỗi ở mọi ca không có gì để đọc: số hàng bằng không hoặc âm, hàng đầu nằm ngoài lưới, số cột bằng không. Đây là điểm chính của hàm — **ca rỗng là ca thường xuyên**, không phải ca ngoại lệ. Sheet trắng lúc mở sidebar lần đầu, gói giao dịch cuối cùng đúng bằng số dòng còn lại, khách chưa có giao dịch nào: cả ba đều đi qua đây. Bắt bên gọi tự kiểm ba điều kiện đó là bắt ba chỗ cùng nhớ một việc.
 *
 * Cắt gọn theo lưới chứ không ném lỗi khi bên gọi hỏi quá tay, vì bên gọi tính vùng đọc từ `getLastRow()` còn lưới thì do `getMaxRows()` quyết định, và hai con số đó lệch nhau là chuyện bình thường.
 */
function sheetGridReadBlock(sheet, firstRow, rowCount, columnCount) {
  if (rowCount <= 0 || columnCount <= 0) { return []; }

  var maxRows = sheet.getMaxRows();
  if (firstRow > maxRows || firstRow < 1) { return []; }

  var rows = Math.min(rowCount, maxRows - firstRow + 1);
  var cols = Math.min(columnCount, sheet.getMaxColumns());
  if (rows <= 0 || cols <= 0) { return []; }

  return sheet.getRange(firstRow, 1, rows, cols).getValues();
}

/**
 * Phép nghiệm thu chạy được trên Google: in ra lưới của từng sheet và thử ba ca rỗng ngay trên tệp thật.
 *
 * Ba ca rỗng thử ở đây trùng với ba ca đã thử offline. Trùng là cố ý: bản mô phỏng lưới trong Node do tay người viết ra, nên nó chỉ đáng tin tới mức mà một lượt chạy trên Google xác nhận lại. Lỗi ở chặng 1.1 lọt qua đúng vì bản mô phỏng lúc đó dễ tính hơn Google.
 */
function probeSheetGrid() {
  var report = [];
  var book = shinOpenBook();

  book.getSheets().forEach(function (sheet) {
    report.push(sheet.getName() + ': lưới ' + sheet.getMaxRows() + '×' + sheet.getMaxColumns() + ', hàng cuối có dữ liệu ' + sheet.getLastRow() + ', số hàng dữ liệu tính từ hàng 4 = ' + sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW));
  });

  var sheet = shinOpenSheet('Customer');
  report.push('Ca rỗng 1 — đọc 0 hàng: ' + JSON.stringify(sheetGridReadBlock(sheet, SHEET_FIRST_DATA_ROW, 0, 5)));
  report.push('Ca rỗng 2 — hàng đầu ngoài lưới: ' + JSON.stringify(sheetGridReadBlock(sheet, sheet.getMaxRows() + 10, 5, 5)));
  report.push('Ca rỗng 3 — đọc quá tay, phải cắt gọn chứ không ném lỗi: ' + sheetGridReadBlock(sheet, sheet.getMaxRows() - 1, 500, 5).length + ' hàng đọc được thay vì 500 hàng đã hỏi');
  report.push('Nới lưới: đã đủ chỗ tới hàng 10 nên nới thêm ' + sheetGridEnsureRoom(sheet, 10) + ' hàng');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
