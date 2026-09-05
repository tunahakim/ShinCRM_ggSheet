/**
 * Hai đường nạp dữ liệu lên RAM của sidebar: `loadCore` và `loadActivityChunk`. Tài liệu 05 Phần 4, Phần 11, Phần 12.
 *
 * Tệp này biết **trình tự** và **kích cỡ**: cái gì đọc trước cái gì, gói bao nhiêu hàng, hết gói chưa, tốn bao nhiêu mili giây. Nó không tự đọc ô nào — việc đọc thuộc `EntityRead.gs`, `CategoryRead.gs`, `ConfigRead.gs`, và việc đo lưới thuộc `CellBudget.gs`. Giữ ranh giới đó vì trình tự là thứ sẽ đổi nhiều lần khi có dữ liệu thật để đo, còn phép đọc thì không.
 *
 * **Vì sao chia hai luồng.** Apps Script không có trạng thái giữa hai lần gọi, nên mỗi vòng chạm máy chủ tốn hai tới năm giây tiền đi đường, bất kể đọc một ô hay một nghìn ô. Cách duy nhất để sidebar dùng được ngay là nạp **một lần** rồi giữ hết trong một biến JavaScript. Nhưng `activity` là phần nặng nhất và không cần thiết để tra một khách, nên nó xuống luồng nền: `loadCore` trả về phần vừa đủ để vẽ và để tra cứu, `loadActivityChunk` chạy tiếp phía sau. Nhờ vậy khung hình đầu tiên tới sau vài giây thay vì vài chục giây.
 *
 * **Nạp ngược từ dòng cuối lên.** Cả hai thực thể đều đọc từ hàng cuối ngược về hàng bốn, vì bản ghi mới nhất nằm dưới cùng và đó là phần người dùng cần trước. Nên gói `activity` đầu tiên đã chứa phần lớn dữ liệu gần đây. Đây là ràng buộc cứng của tài liệu 05 Phần 4.
 *
 * **Máy chủ không trả số hàng như một phần của bản ghi.** Số hàng chỉ xuất hiện ở `rowMap`, cây cầu tọa độ trả lời câu "người dùng vừa bấm vào hàng này trên sheet, đó là khách nào". Bản ghi thì nhận dạng bằng mã, không bằng vị trí — vì vị trí đổi mỗi lần sheet được sắp lại, còn mã thì không.
 *
 * **Điều tệp này chưa làm, và cố ý chưa:** `reloadRecords`, đường nạp lại đúng mấy bản ghi bẩn. Nó cần khối trạng thái bẩn có **chiều ghi** mới có gì để nạp lại, mà chiều ghi thuộc chặng làm mới dữ liệu. Viết bây giờ là viết một hàm luôn nhận danh sách rỗng.
 *
 * **Hai dòng "nạp xong" đều là dòng vết, không phải dòng luôn ghi.** Chủ dự án chốt ngày 05/09/2026: bật debug thì ghi chi tiết, ngày thường ẩn hết. Công tắc là tham số `LOG_TRACE` ở sheet `Config`. Một lượt mở sidebar trơn để lại **không** dòng nào, vì "mọi thứ bình thường" không đáng ghi ba lần mỗi lượt; lượt nào có lỗi thì vòng đệm vết tự bung ra sheet kèm dòng lỗi, nên đúng lúc cần chẩn đoán vẫn có đủ số liệu. Dòng cảnh báo vượt trần ngân sách ô thì vẫn `logEvent` — nó không phải chuyện bình thường.
 */

/** Nguồn ghi log của mọi đường trong tệp này. Sidebar gọi qua `google.script.run` nên theo bảng ở tài liệu 10 Phần 8, nguồn là `sidebar` và kênh báo lỗi là ném lại cho `withFailureHandler`. */
var LOAD_SOURCE = 'sidebar';

/**
 * Nạp phần lõi. Đây là lời gọi đầu tiên của mỗi lượt mở sidebar.
 *
 * Trả về `{ ok: true, blocked: false, settings, schema, config, categories, customer, activity, budget, dirty, warnings, ms }` ở đường bình thường, hoặc `{ ok: true, blocked: 'cellBudget', budget, dirty, ms }` khi vượt trần ngân sách ô.
 *
 * **Đo ngân sách ô là việc đầu tiên, trước khi đọc một ô dữ liệu nào.** Vượt trần thì dừng ngay tại đó. Phép đo không đọc ô nào nên nó gần như miễn phí, còn đọc dữ liệu trong một tệp đã quá ì là cách chắc nhất để lượt chạy chết ở giữa đường — và chết ở giữa đường thì người dùng thấy sidebar treo, không thấy nguyên nhân.
 *
 * `blocked` mang tên lý do chứ không phải `true`, để sau này còn lý do chặn thứ hai thì client không phải đoán.
 */
function loadCore() {
  return runEntryPoint('loadCore', LOAD_SOURCE, 'throw', function () {
    var batDau = Date.now();
    var book = shinOpenBook();
    var budget = cellBudgetMeasure(book);

    if (budget.exceeded) {
      logEvent({
        source: LOAD_SOURCE,
        action: 'loadCore',
        outcome: LOG_WARN,
        reason: 'Vượt trần ngân sách ô nên chặn, không đọc dữ liệu',
        detail: { total: budget.total, ceiling: budget.ceiling, sheets: budget.sheets }
      });

      return { ok: true, blocked: 'cellBudget', budget: budget, dirty: dirtyStateRead(), ms: Date.now() - batDau };
    }

    resetSettingsCache();

    var config = configReadAll();
    config.params = configParams();

    var danhMuc = categoryReadAll();
    var khach = entityReadAll('customer');
    var soGiaoDich = entityRowCount('activity');
    var ms = Date.now() - batDau;

    var warnings = danhMuc.warnings.slice();
    if (budget.warning) { warnings.push(budget.warning); }

    logTrace({
      source: LOAD_SOURCE,
      action: 'loadCore',
      outcome: LOG_OK,
      reason: 'Nạp lõi xong',
      detail: {
        khach: khach.rows.length,
        giaoDichSeNap: soGiaoDich,
        danhMuc: Object.keys(danhMuc.categories).length,
        hangTrangBoQua: khach.blankRows,
        nganSachO: budget.total + '/' + budget.ceiling,
        ms: ms
      }
    });

    return {
      ok: true,
      blocked: false,
      settings: SETTINGS,
      schema: DATA_SCHEMA,
      config: config,
      categories: danhMuc.categories,
      customer: { fields: khach.fields, rows: khach.rows, blankRows: khach.blankRows },
      rowMaps: loadRowMaps(khach),
      activity: { total: soGiaoDich, chunkRows: SETTINGS.CHUNK_ROWS },
      budget: budget,
      dirty: dirtyStateRead(),
      warnings: warnings,
      ms: ms
    };
  });
}

/**
 * Bảng tra "số hàng trên sheet → mã bản ghi", dựng từ kết quả đọc.
 *
 * Trả về object có khóa là số hàng dạng chuỗi, không phải mảng thưa. Mảng thưa đi qua `google.script.run` sẽ biến các chỗ trống thành `null` và gửi hết chúng đi: một sheet 1.000 hàng chỉ có 20 khách sẽ gửi 980 chữ `null`. Object thì chỉ gửi đúng những hàng có bản ghi. Client bung nó thành mảng thưa lúc ingest, vì hình dạng chốt của `Store.rowMaps` ở tài liệu 05 Phần 7 là mảng thưa.
 */
function loadRowMap(block) {
  var idAt = block.fields.indexOf('id');
  var map = {};

  block.rowIndexes.forEach(function (rowIndex, i) {
    map[String(rowIndex)] = block.rows[i][idAt];
  });

  return map;
}

/**
 * Khối `rowMaps` gửi cho client: khóa là **tên sheet**, giá trị là bảng tra hàng → mã khách.
 *
 * Gói theo tên sheet vì `Store.rowMaps` tra theo tên sheet, và vì chặng làm mới dữ liệu sẽ thêm các sheet quản trị vào đây — thêm một khóa, không đổi hình dạng. Nếu máy chủ gửi phẳng một bảng thì client phải tự gán tên sheet cho nó, tức tên sheet dữ liệu bị gõ cứng ở phía client, đúng thứ mà `ENTITY_SHEETS` tồn tại để tránh.
 *
 * **Chỉ sheet chứa khách có mặt ở đây.** Sheet `Activity` cố tình không có bảng tra: cầu tọa độ trả lời câu "người dùng vừa bấm vào hàng này, đó là **khách** nào", và không có đường nào bấm vào một giao dịch để mở nó. Gửi thêm một bảng không ai tra là gửi thêm một dòng payload cho mỗi giao dịch trên đường nạp nặng nhất của hệ.
 */
function loadRowMaps(khach) {
  var maps = {};
  maps[ENTITY_SHEETS.customer] = loadRowMap(khach);
  return maps;
}

/**
 * Cỡ gói dùng cho một lời gọi, đã kẹp lại trong ngưỡng an toàn.
 *
 * Client được phép **xin gói nhỏ hơn** — đó là đường lùi khi một gói cỡ chuẩn thất bại. Nó không được phép xin gói lớn hơn: một con số từ phía client đi thẳng vào `getRange` là một cái núm cho phép bên ngoài quyết định một lượt đọc lớn bao nhiêu, và cửa vào thì không tin bên gọi. Xin số vô nghĩa — chữ, số âm, số lẻ — thì im lặng dùng cỡ chuẩn, vì một lượt nạp nền không phải chỗ để dừng lại tranh luận về tham số.
 */
function loadChunkRows(requested) {
  var so = Number(requested);
  if (!isFinite(so) || so < 1) { return SETTINGS.CHUNK_ROWS; }
  return Math.min(Math.floor(so), SETTINGS.CHUNK_ROWS);
}

/**
 * Nạp một gói `activity`, đi từ hàng cuối ngược lên.
 *
 * `cursor` là `null` ở lần gọi đầu, còn các lần sau truyền lại `nextCursor` của phản hồi trước. `chunkRows` là cỡ gói client xin cho riêng lời gọi này; bỏ trống thì dùng `SETTINGS.CHUNK_ROWS`. Trả về `{ ok, fields, rows, done, nextCursor, total, chunkRows, dirty, ms }`.
 *
 * **Con trỏ mang số hàng chứ không mang số thứ tự gói.** Nếu client chỉ gửi "cho tôi gói thứ ba" thì hai gói liền nhau có thể đọc lệch nhau khi số hàng đổi giữa hai lần gọi — mà giữa hai lần gọi thì người dùng hoàn toàn có thể vừa thêm một dòng thẳng trên sheet. Số hàng cuối của gói là thứ tự nó nói ra, không phải thứ suy diễn từ trạng thái mà máy chủ không còn nhớ.
 *
 * Chính vì con trỏ mang số hàng nên đường lùi cỡ gói mới chạy được: gọi lại **đúng con trỏ cũ** với cỡ nhỏ hơn là đọc lại đúng chỗ vừa thất bại, không lệch một hàng nào.
 *
 * Gói cuối cùng — gói chạm tới hàng bốn — là chỗ ghi dòng log kết thúc. Ghi mỗi gói một dòng thì một tệp năm mươi gói để lại năm mươi dòng log cho một việc, làm loãng sheet `Log` tới mức không tìm ra thứ đáng xem; còn không ghi gì thì không ai biết lượt nạp nền đã xong hay đã chết giữa đường.
 */
function loadActivityChunk(cursor, chunkRows) {
  return runEntryPoint('loadActivityChunk', LOAD_SOURCE, 'throw', function () {
    var batDau = Date.now();
    var context = entityReadContext('activity');
    var firstDataRow = SHEET_FIRST_DATA_ROW;
    var lastDataRow = firstDataRow + context.rowCount - 1;
    var endRow = cursor && cursor.endRow ? cursor.endRow : lastDataRow;
    var coGoi = loadChunkRows(chunkRows);

    if (context.rowCount <= 0 || endRow < firstDataRow) {
      return { ok: true, fields: context.names, rows: [], done: true, nextCursor: null, total: context.rowCount, chunkRows: coGoi, dirty: dirtyStateRead(), ms: Date.now() - batDau };
    }

    var startRow = Math.max(firstDataRow, endRow - coGoi + 1);
    var goi = entityReadRange(context, startRow, endRow - startRow + 1);
    var done = startRow <= firstDataRow;
    var ms = Date.now() - batDau;

    if (done) {
      logTrace({
        source: LOAD_SOURCE,
        action: 'loadActivityChunk',
        outcome: LOG_OK,
        reason: 'Nạp xong toàn bộ giao dịch',
        detail: { tongHang: context.rowCount, hangTrangBoQua: goi.blankRows, coGoiCuoi: coGoi, msGoiCuoi: ms }
      });
    } else {
      logTrace({ source: LOAD_SOURCE, action: 'loadActivityChunk', outcome: LOG_OK, reason: 'Gói hàng ' + startRow + '–' + endRow, detail: { banGhi: goi.rows.length, coGoi: coGoi, ms: ms } });
    }

    return {
      ok: true,
      fields: goi.fields,
      rows: goi.rows,
      done: done,
      nextCursor: done ? null : { endRow: startRow - 1 },
      total: context.rowCount,
      chunkRows: coGoi,
      dirty: dirtyStateRead(),
      ms: ms
    };
  });
}

/**
 * Phép nghiệm thu của cả chặng, chạy được trên Google: nạp lõi rồi nạp hết các gói giao dịch, in số bản ghi từng sheet và thời gian.
 *
 * Đây là phép trả lời đúng câu hỏi của chặng này: **đường nạp có vỡ khi số bản ghi bằng không hay không.** Sheet còn trắng nên mọi con số đều là 0, và một đường nạp chỉ hỏng ở ca rỗng thì phải bắt ngay bây giờ, chứ không phải bắt vào lúc đã có một nghìn bảy trăm khách ở trong đó.
 */
function probeLoadAll() {
  var report = [];
  var batDau = Date.now();
  var core = loadCore();

  if (core.blocked) {
    report.push('CHẶN: ' + core.blocked);
    cellBudgetLines(core.budget).forEach(function (line) { report.push('  ' + line); });
    report.forEach(function (line) { Logger.log(line); });
    return report;
  }

  report.push('loadCore: ' + core.ms + ' ms');
  report.push('  customer: ' + core.customer.rows.length + ' bản ghi, ' + core.customer.fields.length + ' trường, ' + core.customer.blankRows + ' hàng trắng bỏ qua');
  Object.keys(core.rowMaps).forEach(function (name) {
    report.push('  rowMaps["' + name + '"]: ' + Object.keys(core.rowMaps[name]).length + ' hàng có bản ghi');
  });
  report.push('  categories: ' + Object.keys(core.categories).length + ' danh mục, tổng ' + Object.keys(core.categories).reduce(function (sum, code) { return sum + core.categories[code].length; }, 0) + ' giá trị');
  report.push('  config: params ' + Object.keys(core.config.params).length + ', ngầm định ' + Object.keys(core.config.defaults).length + ', bộ đếm ' + Object.keys(core.config.counters).length + ', sort ' + core.config.sort.length + ' cấp');
  report.push('  ngân sách ô: ' + core.budget.total + '/' + core.budget.ceiling);
  report.push('  activity sẽ nạp: ' + core.activity.total + ' hàng, gói ' + core.activity.chunkRows + ' hàng');

  var cursor = null;
  var soGoi = 0;
  var soBanGhi = 0;

  do {
    var goi = loadActivityChunk(cursor);
    soGoi += 1;
    soBanGhi += goi.rows.length;
    cursor = goi.nextCursor;
    if (soGoi > 1000) { throw new Error('Vòng nạp gói không dừng sau 1000 gói — con trỏ có vấn đề.'); }
  } while (cursor);

  report.push('activity: ' + soBanGhi + ' bản ghi qua ' + soGoi + ' gói');
  report.push('Tổng cả lượt: ' + (Date.now() - batDau) + ' ms');
  report.push('Trạng thái bẩn: ' + JSON.stringify(core.dirty));
  report.push('Cảnh báo: ' + (core.warnings.length ? core.warnings.join(' / ') : 'không có'));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
