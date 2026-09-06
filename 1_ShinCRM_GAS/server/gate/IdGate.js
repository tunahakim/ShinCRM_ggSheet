/**
 * Cửa cấp mã bản ghi: đọc bộ đếm ở sheet `Config`, cấp một dải mã liền mạch, ghi bộ đếm mới. Tài liệu 06 Phần 7.
 *
 * **Cửa này không bao giờ tự lấy khóa** `[RÀNG BUỘC CỨNG]`. Nó luôn chạy bên trong khóa mà cửa ghi đang giữ. Nhờ vậy trong cả hệ chỉ có đúng một chỗ lấy khóa, và không có đường nào để một luồng tự khóa chính mình. Gọi hàm ở đây từ ngoài khóa là sai, và cái sai đó im lặng: hai người bấm Lưu cùng lúc sẽ nhận cùng một mã, rồi một bản ghi đè lên bản kia.
 *
 * Khuôn mã: tiền tố ba chữ cộng gạch ngang cộng sáu chữ số, ví dụ `CUS-000123`. Sáu chữ số là trần một triệu bản ghi mỗi thực thể — với 1.700 khách và mấy chục nghìn giao dịch thì đó là trần không bao giờ chạm tới, còn mã rộng cố định thì sắp theo phép so chữ là ra đúng thứ tự thời gian, và `store.html` đang dựa vào đúng tính chất đó để sắp lịch sử làm việc.
 */

/** Tiền tố mã của từng thực thể. Phải khớp với `fieldLogicNextCode` phía client, thứ vẽ mã xem trước lên form. */
var ID_GATE_PREFIXES = { customer: 'CUS-', activity: 'ACT-' };

/** Số chữ số của phần đuôi. Đổi con số này là đổi khuôn mã của toàn bộ dữ liệu cũ, nên nó nằm đây một mình để không ai đổi nhầm. */
var ID_GATE_DIGITS = 6;

/** Tên loại ghi ở cột `@CFG_BO_DEM_LOAI` của khối bộ đếm. Dùng chính tên thực thể, để người mở sheet ra đọc là hiểu. */
function idGateCounterKey(entity) {
  if (!ID_GATE_PREFIXES[entity]) {
    throw new Error('Không có tiền tố mã cho thực thể "' + entity + '". Có: ' + Object.keys(ID_GATE_PREFIXES).join(', ') + '.');
  }
  return entity;
}

/** Dựng một mã từ số thứ tự. */
function idGateFormat(entity, so) {
  var text = String(so);
  while (text.length < ID_GATE_DIGITS) { text = '0' + text; }
  return ID_GATE_PREFIXES[entity] + text;
}

/**
 * Nhặt phần số của một mã bất kỳ. Không có chữ số nào thì trả về 0.
 *
 * **Cố ý không đòi tiền tố đúng.** Trên sheet DEV đang có mã giả kiểu `KH000001` và `GD000001` do `SeedFake.js` sinh ra, khác hẳn khuôn `CUS-`/`ACT-` của bản thiết kế. Lưới an toàn ở dưới phải làm việc được trên cả hai, vì mục đích của nó là "đừng cấp trùng mã đã có trên sheet" — và một mã trùng thì trùng bất kể nó mang tiền tố gì.
 */
function idGateNumberOf(value) {
  var digits = String(value === null || value === undefined ? '' : value).replace(/\D/g, '');
  return digits ? Number(digits) : 0;
}

/** Số lớn nhất đang có ở cột mã của sheet. Đọc cả cột bằng một lệnh. Sheet trắng trả về 0. */
function idGateMaxOnSheet(context) {
  var soDong = context.rowCount;
  if (soDong <= 0) { return 0; }

  var cot = context.indexes[context.idAt] + 1;
  var values = context.sheet.getRange(SHEET_FIRST_DATA_ROW, cot, soDong, 1).getValues();

  var max = 0;
  for (var i = 0; i < values.length; i++) {
    var so = idGateNumberOf(values[i][0]);
    if (so > max) { max = so; }
  }
  return max;
}

/**
 * Vị trí ô bộ đếm của một thực thể trong khối bộ đếm của `Config`, cộng giá trị đang có.
 *
 * Trả về `{ row, valueColumn, current }`, và `row` bằng 0 khi chưa có dòng nào cho thực thể đó. Bên gọi tự quyết ghi vào dòng nào — hàm này chỉ đọc.
 */
function idGateCounterCell(entity) {
  var khoi = CONFIG_READ_BLOCKS.counters;
  var sheet = shinOpenSheet('Config');
  var columnMap = readColumnMap('Config').map;
  var cotLoai = columnIndex(columnMap, khoi.key);
  var cotGiaTri = columnIndex(columnMap, khoi.value);
  var firstRow = SHEET_LAYOUT.Config.firstDataRow;
  var soDong = sheet.getLastRow() - firstRow + 1;

  var ra = { row: 0, valueColumn: cotGiaTri, current: 0, sheet: sheet, firstRow: firstRow, keyColumn: cotLoai };
  if (soDong <= 0) { return ra; }

  var rong = Math.max(cotLoai, cotGiaTri) - Math.min(cotLoai, cotGiaTri) + 1;
  var values = sheet.getRange(firstRow, Math.min(cotLoai, cotGiaTri), soDong, rong).getValues();
  var lechLoai = cotLoai - Math.min(cotLoai, cotGiaTri);
  var lechGiaTri = cotGiaTri - Math.min(cotLoai, cotGiaTri);
  var can = idGateCounterKey(entity);

  for (var i = 0; i < values.length; i++) {
    if (String(values[i][lechLoai]).trim() === can) {
      ra.row = firstRow + i;
      ra.current = idGateNumberOf(values[i][lechGiaTri]);
      return ra;
    }
  }

  // Chưa có dòng nào cho thực thể này thì dòng mới đặt ngay sau dòng cuối đang có nội dung của khối.
  ra.row = 0;
  return ra;
}

/**
 * Cấp một dải mã liền mạch gồm `soLuong` mã, rồi ghi bộ đếm mới. Trả về mảng mã.
 *
 * `context` là thứ `entityReadContext(entity)` trả về, truyền vào để không phải mở lại sheet và đọc lại hàng 1.
 *
 * **Lưới an toàn**: nếu bộ đếm nhỏ hơn hoặc bằng số lớn nhất đang có trên sheet thì nhảy lên `max + 1`. Bộ đếm tụt lại là chuyện có thật — người dùng xóa dòng bằng tay, hay dán một lô dữ liệu vào sheet thô, đều làm nó tụt. Không có lưới này thì mã mới trùng mã cũ, và một mã trùng nghĩa là hai bản ghi khác nhau cùng nhận một địa chỉ: bộ nhớ giữ một cái, sheet giữ hai cái, và không có phép kiểm nào của đường nạp nhìn ra chuyện đó.
 *
 * Phép đọc cột mã chỉ chạy khi cần: sheet nghìn dòng thì mỗi lượt lưu đọc thêm một cột nghìn ô, nên đọc luôn là trả tiền cho một chuyện gần như không bao giờ xảy ra.
 */
function idGateIssue(entity, soLuong, context) {
  var can = soLuong === undefined ? 1 : soLuong;
  if (can <= 0) { return []; }

  var o = idGateCounterCell(entity);
  var batDau = o.current + 1;
  var maxSheet = idGateMaxOnSheet(context);

  if (batDau <= maxSheet) {
    logEvent({
      source: 'core', action: 'idGateIssue', outcome: LOG_WARN,
      reason: 'Bộ đếm cấp mã của "' + entity + '" tụt lại sau dữ liệu trên sheet. Nhảy lên số lớn nhất cộng một.',
      detail: { boDem: o.current, maxTrenSheet: maxSheet }
    });
    batDau = maxSheet + 1;
  }

  var ra = [];
  for (var i = 0; i < can; i++) { ra.push(idGateFormat(entity, batDau + i)); }

  var dongGhi = o.row;
  if (!dongGhi) {
    dongGhi = Math.max(o.sheet.getLastRow() + 1, o.firstRow);
    sheetGridEnsureRoom(o.sheet, dongGhi, SHEET_GRID_SLACK);
    o.sheet.getRange(dongGhi, o.keyColumn).setValue(idGateCounterKey(entity));
  }

  o.sheet.getRange(dongGhi, o.valueColumn).setValue(batDau + can - 1);
  return ra;
}

/** Phép nghiệm thu chạy được trên Google: in bộ đếm và số lớn nhất trên sheet của cả hai thực thể, **không cấp mã và không ghi gì**. */
function probeIdGate() {
  var report = [];

  ['customer', 'activity'].forEach(function (entity) {
    var context = entityReadContext(entity);
    var o = idGateCounterCell(entity);
    var maxSheet = idGateMaxOnSheet(context);
    report.push(entity + ': bộ đếm ' + o.current + (o.row ? ' (dòng ' + o.row + ')' : ' (chưa có dòng)') + ' — max trên sheet ' + maxSheet + ' — mã kế tiếp sẽ là ' + idGateFormat(entity, Math.max(o.current, maxSheet) + 1));
  });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
