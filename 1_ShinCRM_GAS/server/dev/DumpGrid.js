/**
 * Đo lưới của từng sheet: sheet đang có bao nhiêu hàng, bao nhiêu cột, và vùng dữ liệu đã dùng tới đâu.
 *
 * Vì sao cần một tệp riêng cho việc này: `setValues` **không** tự nới sheet. Vùng ghi chạm quá hàng cuối hoặc cột cuối là `getRange` ném lỗi
 * ngay, và cách hỏng đó rất khó nhìn thấy — cửa ghi log bắt mọi lỗi rồi đi tiếp, nên log sẽ lặng lẽ tắt hẳn kể từ dòng đầu tiên vượt lưới.
 * Một sheet mới của Google có 1.000 hàng và 26 cột, tức là hai con số đó là hạn thật, không phải hạn tưởng tượng.
 *
 * Đây là tệp chỉ dùng lúc phát triển, xóa cùng cả thư mục `dev/`. Phép đo ngân sách ô của tài liệu 00 ở chặng 1.5 là việc khác:
 * nó cần dữ liệu thật mới có nghĩa, nên nó sẽ là hàm của phần lõi chứ không phải hàm ở đây.
 */

/** In lưới của mọi sheet đang có. Chỉ đọc, không ghi gì. */
function dumpSheetGrid() {
  var file = shinOpenBook();
  var lines = ['ShinCRM — lưới các sheet', 'Tệp: ' + file.getName(), ''];
  var tongO = 0;

  file.getSheets().forEach(function (sheet) {
    var maxRows = sheet.getMaxRows();
    var maxCols = sheet.getMaxColumns();
    var khai = SHEET_LAYOUT[sheet.getName()];
    tongO += maxRows * maxCols;

    lines.push(sheet.getName() + ':');
    lines.push('  lưới ' + maxRows + ' hàng × ' + maxCols + ' cột = ' + (maxRows * maxCols) + ' ô');
    lines.push('  đã dùng tới hàng ' + sheet.getLastRow() + ', cột ' + sheet.getLastColumn() + ', đóng băng ' + sheet.getFrozenRows() + ' hàng');
    if (khai) {
      var soCotLoi = sheetCoreColumns(sheet.getName()).length;
      lines.push('  bảng khai cần ' + soCotLoi + ' cột lõi — lưới ' + (maxCols >= soCotLoi ? 'đủ chỗ' : 'THIẾU ' + (soCotLoi - maxCols) + ' cột'));
      lines.push('  còn chỗ ghi thêm ' + (maxRows - Math.max(sheet.getLastRow(), khai.headerRows)) + ' hàng trước khi phải nới lưới');
    }
  });

  lines.push('');
  lines.push('Tổng ô đang chiếm: ' + tongO + ' / 10.000.000 (hạn cứng của một tệp Sheet)');

  var text = lines.join('\n');
  console.log(text);
  return text;
}

/**
 * In hàng mã cột và vài dòng dữ liệu đầu của Customer, Activity để soi cột bị gắn nhầm nhãn.
 */
function dumpCoreSheetHead() {
  var file = shinOpenBook();
  return ['Customer', 'Activity'].map(function (name) {
    var sheet = file.getSheetByName(name);
    var layout = SHEET_LAYOUT[name];
    var lastCol = sheet.getLastColumn();
    var codes = sheet.getRange(1, 1, 1, lastCol).getValues()[0];
    var count = Math.min(6, Math.max(0, sheet.getLastRow() - layout.firstDataRow + 1));
    var data = count ? sheet.getRange(layout.firstDataRow, 1, count, lastCol).getDisplayValues() : [];
    return name + ':\n' + codes.map(function (code, i) {
      return '  ' + (i + 1) + ' ' + code + ' = ' + data.map(function (row) { return String(row[i]).slice(0, 24); }).join(' | ');
    }).join('\n');
  }).join('\n\n');
}
