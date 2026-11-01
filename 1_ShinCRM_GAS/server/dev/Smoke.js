/**
 * Phép thử đường ống: đẩy code, chạy hàm qua cửa chạy hàm rồi đọc kết quả có thông suốt không. Không có nghiệp vụ nào ở đây; chạy kèm `--push` khi chỉ cần đẩy code lên DEV.
 */

/** In ra một dòng để xác nhận đường ống chạy được, kèm phép đối chiếu ID tệp đang mở. */
function smokeTest() {
  var file = shinOpenBook();
  var actualId = file.getId();

  var lines = [
    'ShinCRM chặng 1.0 — thử đường ống',
    'Tên tệp: ' + file.getName(),
    'ID tệp: ' + actualId,
    'Múi giờ: ' + file.getSpreadsheetTimeZone(),
    'Các sheet đang có: ' + file.getSheets().map(function (sheet) { return sheet.getName(); }).join(', ')
  ];

  var report = lines.join('\n');
  console.log(report);
  return report;
}
