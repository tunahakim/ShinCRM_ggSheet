/**
 * Cửa cấp mã bản ghi: đọc bộ đếm trong Document Properties, cấp một dải mã liền mạch, ghi bộ đếm mới. Tài liệu 06 Phần 7.
 *
 * Bộ đếm là trạng thái hệ thống, không phải núm vặn người dùng, nên không nằm trên sheet: người dùng không gõ nhầm được, và sheet `Config` bỏ đi được mà không mất bộ đếm.
 *
 * **Cửa này không bao giờ tự lấy khóa** `[RÀNG BUỘC CỨNG]`. Nó luôn chạy bên trong khóa mà cửa ghi đang giữ. Nhờ vậy trong cả hệ chỉ có đúng một chỗ lấy khóa, và không có đường nào để một luồng tự khóa chính mình. Gọi hàm ở đây từ ngoài khóa là sai, và cái sai đó im lặng: hai người bấm Lưu cùng lúc sẽ nhận cùng một mã, rồi một bản ghi đè lên bản kia.
 *
 * Khuôn mã: tiền tố ba chữ cộng gạch ngang cộng sáu chữ số, ví dụ `CUS-000123`. Sáu chữ số là trần một triệu bản ghi mỗi thực thể — với 1.700 khách và mấy chục nghìn giao dịch thì đó là trần không bao giờ chạm tới, còn mã rộng cố định thì sắp theo phép so chữ là ra đúng thứ tự thời gian, và `store.html` đang dựa vào đúng tính chất đó để sắp lịch sử làm việc.
 */

/** Tiền tố mã của từng thực thể. Phải khớp với `fieldLogicNextCode` phía client, thứ vẽ mã xem trước lên form. */
var ID_GATE_PREFIXES = { customer: 'CUS-', activity: 'ACT-' };

/** Số chữ số của phần đuôi. Đổi con số này là đổi khuôn mã của toàn bộ dữ liệu cũ, nên nó nằm đây một mình để không ai đổi nhầm. */
var ID_GATE_DIGITS = 6;

/** Khóa Document Properties giữ bộ đếm của từng thực thể. Tên giữ như dòng tham số cũ trong `Config` để bước di chuyển một lần tìm được giá trị cũ. */
var ID_GATE_COUNTER_KEYS = { customer: 'ID_COUNTER_CUSTOMER', activity: 'ID_COUNTER_ACTIVITY' };

function idGateCounterKey(entity) {
  if (!ID_GATE_PREFIXES[entity]) {
    throw new Error('Không có tiền tố mã cho thực thể "' + entity + '". Có: ' + Object.keys(ID_GATE_PREFIXES).join(', ') + '.');
  }
  return ID_GATE_COUNTER_KEYS[entity];
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
 * Giá trị bộ đếm đang lưu của một thực thể. Trả về `{ current, stored }`; `stored` sai nghĩa là Document Properties chưa có khóa này.
 *
 * Di chuyển một lần: khi chưa có khóa thì lấy số ở dòng tham số cũ cùng tên trong sheet `Config` (nếu sheet còn), để mã không bị cấp lại cho bản ghi đã xóa ở cuối sheet. Lần cấp mã đầu tiên ghi khóa, từ đó dòng cũ không còn ai đọc. Giá trị lưu không phải số nguyên không âm thì ném lỗi chứ không tự về 0, vì về 0 rồi ghi đè là xóa âm thầm bộ đếm.
 */
function idGateCounterRead(entity) {
  var key = idGateCounterKey(entity);
  var raw = PropertiesService.getDocumentProperties().getProperty(key);
  if (raw !== null) {
    if (!/^\d+$/.test(String(raw))) {
      throw new Error('Bộ đếm cấp mã ' + key + ' trong Document Properties hỏng (giá trị "' + raw + '"). Đã dừng cấp mã để không cấp trùng; báo người phụ trách kỹ thuật sửa giá trị này.');
    }
    return { current: Number(raw), stored: true };
  }
  var legacy = shinOpenBook().getSheetByName('Config') ? configParams()[key] : '';
  return { current: idGateNumberOf(legacy), stored: false };
}

/** Nhận bộ đếm từ nơi lưu đời cũ, chỉ khi kho mới chưa có khóa; kho mới đã có thì giữ nguyên để không kéo bộ đếm lùi. */
function idGateAdoptCounter(entity, value) {
  var key = idGateCounterKey(entity), props = PropertiesService.getDocumentProperties();
  if (props.getProperty(key) !== null) { return false; }
  props.setProperty(key, String(idGateNumberOf(value)));
  return true;
}

/** Bộ đếm của cả hai thực thể cho hợp đồng RAM `config.counters`, thứ client dùng để vẽ mã xem trước lên form. */
function idGateCounterValues() {
  return { customer: idGateCounterRead('customer').current, activity: idGateCounterRead('activity').current };
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

  var o = idGateCounterRead(entity);
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

  PropertiesService.getDocumentProperties().setProperty(idGateCounterKey(entity), String(batDau + can - 1));
  return ra;
}

/** Phép nghiệm thu chạy được trên Google: in bộ đếm và số lớn nhất trên sheet của cả hai thực thể, **không cấp mã và không ghi gì**. */
function probeIdGate() {
  var report = [];

  ['customer', 'activity'].forEach(function (entity) {
    var context = entityReadContext(entity);
    var o = idGateCounterRead(entity);
    var maxSheet = idGateMaxOnSheet(context);
    report.push(entity + ': bộ đếm ' + o.current + (o.stored ? '' : ' (chưa chuyển sang Document Properties, đang đọc từ Config)') + ' — max trên sheet ' + maxSheet + ' — mã kế tiếp sẽ là ' + idGateFormat(entity, Math.max(o.current, maxSheet) + 1));
  });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
