/**
 * Phép đo còn treo của chặng 1.1, ghi ở tài liệu 00 Phần 5 và tài liệu 10 Phần 6: chi phí thật của deleteRows trên sheet Log 5.000 dòng.
 *
 * Tài liệu 10 nói deleteRows là "một lệnh gọi API bất kể xóa bao nhiêu dòng". Đó là một phỏng đoán chưa đo. Nếu nó sai —
 * nếu chi phí tăng theo số dòng xóa — thì luật cắt cửa sổ log phải đổi, nên phải có số thật trước khi dựng LogGate.
 *
 * Cách đo theo đúng chỉ dẫn của tài liệu: 5.000 dòng giả sinh bằng MỘT lệnh setValues, không dùng vòng lặp appendRow
 * (vòng lặp appendRow tự nó ăn hết thời gian và làm sai phép đo). Đo xóa ở ba cỡ để thấy chi phí có tăng theo số dòng hay không.
 * Xóa sạch dòng giả sau khi đo — tài liệu 10 cho phép 5.000 dòng giả đúng một lần này, với điều kiện dọn sạch.
 *
 * Tệp này bị xóa sau khi số đo đã báo cho chủ dự án.
 */

/** Ba cỡ xóa để dò hình dáng chi phí: một dòng, một trăm dòng, một nghìn dòng. */
var MEASURE_DELETE_SIZES = [1, 100, 1000];

/** Số dòng dữ liệu giả dựng trước mỗi lượt đo. */
var MEASURE_TOTAL_ROWS = 5000;

/** Sinh một khối dòng giả có hình dáng giống log thật: chín cột, cột Lúc là mốc thời gian tăng dần. */
function measureBuildFakeRows(count) {
  var rows = [];
  var base = new Date().getTime() - count * 1000;
  for (var i = 0; i < count; i++) {
    rows.push([
      new Date(base + i * 1000),
      'core',
      'save',
      'ok',
      'customer',
      'KH' + (100000 + i),
      'Dòng giả để đo chi phí deleteRows',
      '',
      'dong-thu=' + i
    ]);
  }
  return rows;
}

/**
 * Xóa hết dòng dữ liệu của sheet Log, giữ lại đúng hàng tiêu đề.
 *
 * Google không cho xóa hết các hàng không cố định — sheet phải luôn còn lại ít nhất một hàng không cố định.
 * Nên chừa lại dòng 2 rồi xóa nội dung của nó, thay vì xóa cả dòng. Sau bước này getLastRow trả về 1.
 */
function measureWipeLog(sheet) {
  var last = sheet.getLastRow();
  if (last > 2) {
    sheet.deleteRows(3, last - 2);
  }
  sheet.getRange(2, 1, 1, sheet.getMaxColumns()).clearContent();
}

/**
 * Chạy phép đo và trả về báo cáo dạng văn bản. Chạy lại được nhiều lần: mỗi lượt đều dọn sạch trước và sau.
 */
function measureDeleteRows() {
  var file = shinOpenBook();
  var sheet = file.getSheetByName('Log');
  if (!sheet) {
    throw new Error('Không thấy sheet Log. Chạy setupSheets trước.');
  }

  var lines = [
    'ShinCRM chặng 1.1 — đo chi phí deleteRows trên sheet Log',
    'Tệp: ' + file.getName(),
    'Mỗi lượt: dựng ' + MEASURE_TOTAL_ROWS + ' dòng giả bằng một lệnh setValues, rồi xóa từ dòng cũ nhất.',
    ''
  ];

  measureWipeLog(sheet);
  var fakeRows = measureBuildFakeRows(MEASURE_TOTAL_ROWS);

  MEASURE_DELETE_SIZES.forEach(function (size) {
    measureWipeLog(sheet);

    var writeStart = new Date().getTime();
    sheet.getRange(2, 1, fakeRows.length, fakeRows[0].length).setValues(fakeRows);
    SpreadsheetApp.flush();
    var writeMs = new Date().getTime() - writeStart;

    var deleteStart = new Date().getTime();
    sheet.deleteRows(2, size);
    SpreadsheetApp.flush();
    var deleteMs = new Date().getTime() - deleteStart;

    lines.push('Xóa ' + size + ' dòng: ' + deleteMs + ' ms   (dựng ' + MEASURE_TOTAL_ROWS + ' dòng trước đó mất ' + writeMs + ' ms)');
  });

  measureWipeLog(sheet);
  SpreadsheetApp.flush();

  lines.push('');
  lines.push('Đã dọn sạch dòng giả. Số dòng còn lại của sheet Log: ' + sheet.getLastRow() + ' (phải bằng 1, chỉ còn hàng tiêu đề).');

  var report = lines.join('\n');
  console.log(report);
  return report;
}
