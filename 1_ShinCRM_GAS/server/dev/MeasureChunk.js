/**
 * Đo đường nạp trên dữ liệu **đang có sẵn** trên sheet: lượt nạp lõi vẽ được khung hình đầu tiên mất bao lâu, và cỡ gói giao dịch đổi được gì.
 *
 * **Tệp này không ghi một ô nào.** Trước đây nó tự dựng hàng giả rồi tự xóa trong cùng một lượt chạy, nên mở sheet ra sau đó thì thấy trắng và không kiểm được phép đo. Việc dựng dữ liệu giả đã chuyển sang `SeedFake.gs` và dữ liệu ở lại trên sheet; tệp này chỉ đọc. Nhờ vậy nó cũng không còn đường nào chạm vào dữ liệu.
 *
 * Chạy `seedFakeData` trước, rồi chạy `measureFirstPaint` và `measureChunkRows`.
 *
 * Phần đo **không** với tới được từ đây: tiền đi đường của `google.script.run` mỗi vòng, và thời gian trình duyệt bung một gói lớn. Cả hai nằm phía sidebar nên phải mở sidebar thật mới đo được.
 *
 * Tệp này bị xóa cùng cả thư mục `server/dev/` trước khi Sheet chứa dữ liệu khách thật.
 */

/** Các cỡ gói đem so. Có `10000` trong danh sách nghĩa là sheet phải đang có từ 10.000 hàng trở lên, không thì cỡ lớn nhất bị cắt và bảng đo mất ý nghĩa. */
var MEASURE_CHUNK_SIZES = [1000, 2000, 5000, 10000];

/**
 * Đọc hết số hàng đang có bằng các gói cỡ `size`, đi ngược từ hàng cuối lên. Trả về `{ size, calls, ms, records, kb }`.
 *
 * `kb` là cỡ gói **đầu tiên** khi dựng thành chuỗi JSON, tức số byte một gói phải đi qua cầu `google.script.run`. Đo sau khi đồng hồ đã dừng, vì `JSON.stringify` không nằm trên đường đọc ô và đếm nó vào thời gian đọc là đo sai.
 */
function measureChunkOnePass(context, size) {
  var firstDataRow = SHEET_FIRST_DATA_ROW;
  var endRow = firstDataRow + context.rowCount - 1;
  var calls = 0;
  var records = 0;
  var goiDau = null;
  var batDau = Date.now();

  while (endRow >= firstDataRow) {
    var startRow = Math.max(firstDataRow, endRow - size + 1);
    var goi = entityReadRange(context, startRow, endRow - startRow + 1);
    records += goi.rows.length;
    calls += 1;
    if (!goiDau) { goiDau = goi.rows; }
    endRow = startRow - 1;
  }

  var ms = Date.now() - batDau;
  return { size: size, calls: calls, ms: ms, records: records, kb: Math.round(JSON.stringify(goiDau).length / 1024) };
}

/**
 * Bảng so cỡ gói, chỉ đọc, trên dữ liệu đang có.
 *
 * **Chặn ở đầu:** sheet rỗng thì ném lỗi. Đo cỡ gói trên sheet rỗng thì mọi cỡ đều ra một vòng không bản ghi, tức một bảng số đẹp mà không nói gì.
 */
function measureChunkRows() {
  var context = entityReadContext('activity');

  if (context.rowCount === 0) {
    throw new Error('Sheet Activity đang rỗng nên không đo được gì. Chạy seedFakeData trước.');
  }

  var lines = [
    'ShinCRM — đo cỡ gói giao dịch trên dữ liệu đang có (không ghi ô nào)',
    'Sheet Activity: ' + context.rowCount + ' hàng dữ liệu, ' + context.names.length + ' trường, lưới rộng ' + context.columnMap.lastColumn + ' cột.',
    '',
    'Cỡ gói | Số vòng | Tổng ms | ms mỗi vòng | ms mỗi 1.000 hàng | KB mỗi gói'
  ];

  MEASURE_CHUNK_SIZES.forEach(function (size) {
    var ket = measureChunkOnePass(context, size);
    lines.push(
      measureChunkPad(ket.size, 6) + ' | ' + measureChunkPad(ket.calls, 7) + ' | ' + measureChunkPad(ket.ms, 7) + ' | '
      + measureChunkPad(Math.round(ket.ms / ket.calls), 11) + ' | ' + measureChunkPad(Math.round((ket.ms / ket.records) * 1000), 17) + ' | '
      + measureChunkPad(ket.kb, 10)
      + '   (đọc ra ' + ket.records + ' bản ghi)'
    );
  });

  lines.push('');
  lines.push('Đây là tiền ĐỌC Ô phía máy chủ cộng cỡ payload mỗi gói. Tiền đi đường google.script.run không đo được từ đây và nó cộng thêm vào TỪNG vòng.');

  var report = lines.join('\n');
  console.log(report);
  return report;
}

/**
 * Đo lượt nạp lõi — tức đo đúng thứ quyết định "sidebar hiện ra sau bao lâu".
 *
 * Cần phép đo riêng cho việc này vì cỡ gói giao dịch **không** nằm trên đường vẽ khung hình đầu tiên: `loadCore` trả về khách và danh mục rồi sidebar vẽ ngay, gói giao dịch chạy nền phía sau. Đo hai thứ bằng một con số là cách chắc nhất để chọn sai cỡ gói.
 */
function measureFirstPaint() {
  var batDau = Date.now();
  var core = loadCore();
  var ms = Date.now() - batDau;

  var lines = [
    'ShinCRM — đo lượt nạp lõi, tức thời gian tới khung hình đầu tiên của sidebar',
    'Tổng loadCore: ' + ms + ' ms (máy chủ tự đo: ' + core.ms + ' ms)',
    'Bị chặn? ' + (core.blocked ? core.blocked : 'không')
  ];

  if (!core.blocked) {
    lines.push('Khách nạp về: ' + core.customer.rows.length + ' bản ghi, ' + core.customer.blankRows + ' hàng trắng bỏ qua');
    lines.push('Giao dịch sẽ nạp nền: ' + core.activity.total + ' bản ghi, cỡ gói đang dùng ' + core.activity.chunkRows + ' hàng');
    lines.push('Danh mục: ' + Object.keys(core.categories).length + ' danh mục');
    lines.push('Payload loadCore: ' + Math.round(JSON.stringify(core).length / 1024) + ' KB — đây là thứ phải đi qua mạng trước khi sidebar vẽ được gì');
    lines.push('Ngân sách ô: ' + core.budget.total + '/' + core.budget.ceiling);
    if (core.warnings.length) { lines.push('Cảnh báo: ' + core.warnings.join(' | ')); }
  }

  lines.push('');
  lines.push('Cỡ gói giao dịch KHÔNG nằm trên đường này. Đổi CHUNK_ROWS không làm con số trên đổi.');

  var report = lines.join('\n');
  console.log(report);
  return report;
}

/** Đệm chuỗi cho bảng thẳng cột. Tên mang tiền tố vì GAS chỉ có một không gian tên chung — một hàm tên `pad` ở đây là một cái bẫy đặt sẵn cho tệp viết sau. */
function measureChunkPad(value, width) {
  var s = String(value);
  while (s.length < width) { s = ' ' + s; }
  return s;
}
