/**
 * Tệp thử của chặng 1.0. Nó tồn tại để trả lời đúng một câu: đường ống clasp push, mở editor, chạy hàm, rồi clasp pull về có thông suốt không.
 * Không có nghiệp vụ nào ở đây, và tệp này sẽ bị xóa khi chặng 1.1 có tệp thật để chạy thử.
 */

/**
 * Hàm soi lỗi tạm của chặng 1.0: nó không ném lỗi mà kể lại từng bước một, để biết bước nào chết khi chạy không có người ngồi trước máy.
 * Xóa cùng lúc với cả tệp này khi chặng 1.1 có hàm thật để chạy thử.
 */
function smokeDiag() {
  var steps = [];
  var buoc = function (ten, viec) {
    try {
      steps.push(ten + ': OK — ' + viec());
    } catch (loi) {
      steps.push(ten + ': LỖI — ' + (loi && loi.message ? loi.message : String(loi)));
    }
  };

  buoc('getActiveSpreadsheet', function () {
    var a = SpreadsheetApp.getActiveSpreadsheet();
    return a === null ? 'trả về null' : 'trả về đối tượng';
  });
  buoc('getActiveSpreadsheet().getId', function () {
    return SpreadsheetApp.getActiveSpreadsheet().getId();
  });
  buoc('openById', function () {
    return SpreadsheetApp.openById(SETUP_EXPECTED_SPREADSHEET_ID).getName();
  });
  buoc('Session.getEffectiveUser', function () {
    return Session.getEffectiveUser().getEmail() || '(rỗng)';
  });

  var report = steps.join('\n');
  console.log(report);
  return report;
}
function smokeTest() {
  var file = shinOpenBook();
  var actualId = file.getId();

  var lines = [
    'ShinCRM chặng 1.0 — thử đường ống',
    'Tên tệp: ' + file.getName(),
    'ID tệp: ' + actualId,
    'Đúng tệp mới: ' + (actualId === SETUP_EXPECTED_SPREADSHEET_ID ? 'ĐÚNG' : 'SAI — dừng lại, đây không phải tệp dành cho bản mới'),
    'Múi giờ: ' + file.getSpreadsheetTimeZone(),
    'Các sheet đang có: ' + file.getSheets().map(function (sheet) { return sheet.getName(); }).join(', ')
  ];

  var report = lines.join('\n');
  console.log(report);
  return report;
}
