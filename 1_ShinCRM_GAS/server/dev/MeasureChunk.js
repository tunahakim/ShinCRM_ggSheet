/**
 * Đo chi phí đọc một gói giao dịch ở nhiều cỡ gói, để chốt con số `SETTINGS.CHUNK_ROWS`.
 *
 * Câu hỏi cần trả lời: chi phí một gói tăng theo số hàng, hay phần lớn là tiền cố định mỗi lệnh gọi? Tiền cố định lớn thì gói to có lợi; tiền theo hàng lớn thì cỡ gói không đổi được gì, và lúc đó chọn gói nhỏ cho nhẹ mỗi vòng.
 *
 * Đo bằng cách đọc **cùng một lượng hàng** ở các cỡ gói khác nhau, đi ngược từ hàng cuối lên đúng như đường nạp thật.
 *
 * Phần đo **không** với tới được từ đây: tiền đi đường của `google.script.run` cho mỗi gói, vì tệp này chạy ở phía máy chủ. Con số đó cộng thêm vào mỗi vòng và nó thường lớn hơn tiền đọc ô, nên kết luận phải đọc kèm điều đó.
 *
 * Tệp này bị xóa cùng cả thư mục `server/dev/` trước khi Sheet chứa dữ liệu khách thật.
 */

/**
 * Các cỡ gói đem so. Lượt đo đầu đã chạy 200/500/1.000/2.000 và cho thấy tổng thời gian gần như không đổi theo cỡ gói, nên lượt này chỉ giữ 1.000 làm mốc rồi nhảy lên đúng hai con số chủ dự án đề nghị.
 *
 * Có `10000` trong danh sách nghĩa là tổng số hàng giả phải từ 10.000 trở lên, không thì cỡ gói lớn nhất bị cắt và bảng đo mất ý nghĩa.
 */
var MEASURE_CHUNK_SIZES = [1000, 5000, 10000];

/** Số hàng giao dịch giả dựng để đo. Phải lớn hơn hoặc bằng cỡ gói lớn nhất. */
var MEASURE_CHUNK_TOTAL_ROWS = 10000;

/**
 * Sinh khối hàng giả cho sheet `Activity`, rộng đúng bằng lưới cột thật và đặt giá trị vào đúng cột theo mã `@`.
 *
 * Đặt theo `context.indexes` chứ không đặt tuần tự, vì thứ tự cột trên sheet là chuyện của hàng 1, không phải chuyện của bảng khai trường.
 */
function measureChunkBuildRows(context, count) {
  var width = context.columnMap.lastColumn;
  var rows = [];
  var moc = new Date(2026, 0, 1);

  for (var i = 0; i < count; i++) {
    var hang = new Array(width);
    for (var c = 0; c < width; c++) { hang[c] = ''; }

    var giaTri = {
      id: 'GD' + (900000 + i),
      customerId: 'KH' + (100000 + (i % 1700)),
      workDate: new Date(moc.getTime() + (i % 365) * 86400000),
      taskType: 'Gọi điện',
      content: 'Hàng giả để đo chi phí đọc gói, số thứ tự ' + i,
      product: 'Sản phẩm giả',
      enteredBy: 'Đo',
      contractValue: (i % 97) * 1000,
      priority: 'Thường',
      dueAt: new Date(moc.getTime() + (i % 365) * 86400000 + 3600000),
      createdAt: new Date(moc.getTime() + i * 1000),
      allowFbmPush: 'Chưa cho phép',
      recordStatus: i % 50 === 0 ? 'deleted' : 'active'
    };

    context.names.forEach(function (name, k) {
      hang[context.indexes[k]] = giaTri[name] === undefined ? '' : giaTri[name];
    });

    rows.push(hang);
  }

  return rows;
}

/** Xóa đúng số hàng đã ghi, tính từ hàng dữ liệu đầu. Trả về số hàng dữ liệu còn lại. */
function measureChunkWipe(sheet, count) {
  var con = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  if (con > 0) {
    sheet.deleteRows(SHEET_FIRST_DATA_ROW, Math.min(con, count));
  }
  SpreadsheetApp.flush();
  return sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
}

/**
 * Đọc hết số hàng đang có bằng các gói cỡ `size`, đi ngược từ hàng cuối lên. Trả về `{ size, calls, ms, records, kb }`.
 *
 * `kb` là cỡ gói **đầu tiên** khi dựng thành chuỗi JSON, tức số byte một gói phải đi qua cầu `google.script.run`. Đo sau khi đồng hồ đã dừng, vì `JSON.stringify` không nằm trên đường đọc ô và đếm nó vào thời gian đọc là đo sai.
 */
function measureChunkOnePass(context, size) {
  var firstDataRow = SHEET_FIRST_DATA_ROW;
  var lastDataRow = firstDataRow + context.rowCount - 1;
  var endRow = lastDataRow;
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
 * Chạy phép đo và trả về báo cáo dạng văn bản. Dọn sạch hàng giả trước khi trả về.
 *
 * **Chặn cứng ở đầu:** sheet `Activity` phải đang rỗng. Không rỗng thì ném lỗi và không ghi gì — phép đo này ghi rồi xóa hàng, và một phép đo như thế không được phép chạy trên sheet có dữ liệu thật.
 */
function measureChunkRows() {
  var context = entityReadContext('activity');
  if (context.rowCount !== 0) {
    throw new Error('Sheet Activity đang có ' + context.rowCount + ' hàng dữ liệu. Phép đo này ghi rồi xóa hàng nên chỉ chạy trên sheet rỗng. Không ghi gì cả.');
  }

  var sheet = context.sheet;
  var lines = [
    'ShinCRM — đo chi phí đọc gói giao dịch để chốt CHUNK_ROWS',
    'Sheet Activity: ' + context.names.length + ' trường, lưới cột rộng ' + context.columnMap.lastColumn + ' cột',
    'Dựng ' + MEASURE_CHUNK_TOTAL_ROWS + ' hàng giả bằng một lệnh setValues, rồi đọc hết ở từng cỡ gói.',
    ''
  ];

  var rows = measureChunkBuildRows(context, MEASURE_CHUNK_TOTAL_ROWS);
  var endRow = SHEET_FIRST_DATA_ROW + rows.length - 1;
  var noiThem = sheetGridEnsureRoom(sheet, endRow);

  var ghiBatDau = Date.now();
  sheet.getRange(SHEET_FIRST_DATA_ROW, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
  lines.push('Ghi ' + rows.length + ' hàng: ' + (Date.now() - ghiBatDau) + ' ms (nới lưới thêm ' + noiThem + ' hàng)');
  lines.push('');

  var doc = entityReadContext('activity');
  lines.push('Sheet đang có ' + doc.rowCount + ' hàng dữ liệu.');
  lines.push('');
  lines.push('Cỡ gói | Số vòng | Tổng ms | ms mỗi vòng | ms mỗi 1.000 hàng | KB mỗi gói');

  MEASURE_CHUNK_SIZES.forEach(function (size) {
    var ket = measureChunkOnePass(doc, size);
    lines.push(
      measureChunkPad(ket.size, 6) + ' | ' + measureChunkPad(ket.calls, 7) + ' | ' + measureChunkPad(ket.ms, 7) + ' | '
      + measureChunkPad(Math.round(ket.ms / ket.calls), 11) + ' | ' + measureChunkPad(Math.round((ket.ms / ket.records) * 1000), 17) + ' | '
      + measureChunkPad(ket.kb, 10)
      + '   (đọc ra ' + ket.records + ' bản ghi)'
    );
  });

  var conLai = measureChunkWipe(sheet, rows.length);
  lines.push('');
  lines.push('Đã dọn hàng giả. Số hàng dữ liệu còn lại: ' + conLai + ' (phải bằng 0).');
  lines.push('Lưu ý đọc kết quả: đây là tiền ĐỌC Ô ở phía máy chủ, cộng cỡ payload mỗi gói. Tiền đi đường của google.script.run không đo được từ đây và nó cộng thêm vào từng vòng.');

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
