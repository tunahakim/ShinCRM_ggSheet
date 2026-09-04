/**
 * Tệp thử của chặng 1.0. Nó tồn tại để trả lời đúng một câu: đường ống clasp push, mở editor, chạy hàm, rồi clasp pull về có thông suốt không.
 * Không có nghiệp vụ nào ở đây, và tệp này sẽ bị xóa khi chặng 1.1 có tệp thật để chạy thử.
 */

/** ID của tệp Sheet mới. Chốt cứng ở đây để mọi lời gọi tự kiểm được mình đang đứng trên đúng tệp, không phải tệp đang đi bán hàng. */
var SMOKE_EXPECTED_SPREADSHEET_ID = '1jEQMWMn5jRUBDGXrQxbK0hpld6gGwlAXSZpoRQm8lpI';

/** In ra một dòng để xác nhận đường ống chạy được, kèm phép đối chiếu ID tệp đang mở. */
function smokeTest() {
  var file = SpreadsheetApp.getActiveSpreadsheet();
  var actualId = file.getId();
  var matched = actualId === SMOKE_EXPECTED_SPREADSHEET_ID;

  var lines = [
    'ShinCRM chặng 1.0 — thử đường ống',
    'Tên tệp: ' + file.getName(),
    'ID tệp: ' + actualId,
    'Đúng tệp mới: ' + (matched ? 'ĐÚNG' : 'SAI — dừng lại, đây không phải tệp dành cho bản mới'),
    'Múi giờ: ' + file.getSpreadsheetTimeZone(),
    'Các sheet đang có: ' + file.getSheets().map(function (sheet) { return sheet.getName(); }).join(', ')
  ];

  var report = lines.join('\n');
  console.log(report);
  return report;
}
