/**
 * Probe DEV cho bảng tra mã cột. Tệp này cố tình nằm ngoài `server/sheet/`
 * vì nó ghi tạm một ô rồi khôi phục; không được đưa đường ghi thử vào runtime.
 */

/** Cố tình làm hỏng một mã ở hàng 1, kiểm tra lỗi rồi trả mã cũ về nguyên chỗ. */
function probeBadColumnCode() {
  var sheetName = 'Customer';
  var sheet = shinOpenSheet(sheetName);
  var cell = sheet.getRange(1, 2);
  var original = String(cell.getValue());
  var broken = '@CUS_MA_COT_SAI';
  var report = [];

  try {
    cell.setValue(broken);
    SpreadsheetApp.flush();

    try {
      readColumnMap(sheetName);
      report.push('❌ Sửa mã "' + original + '" thành "' + broken + '" mà readColumnMap vẫn chạy trót lọt. Phép chặn lệch cột KHÔNG hoạt động.');
    } catch (loiMongDoi) {
      if (String(loiMongDoi.message).indexOf(original) !== -1) {
        report.push('✅ readColumnMap ném lỗi và nêu đúng tên mã thiếu: ' + loiMongDoi.message);
      } else {
        report.push('❌ readColumnMap có ném lỗi nhưng không nêu tên mã "' + original + '": ' + loiMongDoi.message);
      }
    }
  } finally {
    cell.setValue(original);
    SpreadsheetApp.flush();
  }

  var restored = String(sheet.getRange(1, 2).getValue());
  report.push(restored === original ? '✅ Đã trả mã cũ về đúng chỗ: ' + original : '❌ CHƯA trả mã cũ về. Hàng 1 cột 2 hiện là "' + restored + '", đáng ra là "' + original + '".');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
