/**
 * Nửa "báo lỗi tới mắt người" của tài liệu 10 Phần 8: chọn kênh hiển thị theo cửa vào, và kho chờ cho những lúc không có ai ngồi trước máy.
 *
 * Vì sao không gộp vào `LogGate.gs`: hai việc có **hai luật ngược nhau**. Ghi log không được phép hỏng hay ném lỗi, còn hiển thị lỗi có thể gọi `SpreadsheetApp.getUi()` — dịch vụ không dùng được trong trigger nền. Trộn chung sẽ để lỗi của kênh hiển thị làm mất dòng log cần giữ.
 *
 * Bảng kênh theo cửa vào, đúng theo tài liệu 10 Phần 8:
 *   - Trigger nền → ghi log rồi ném lại; không dùng thông báo nhỏ của Google Sheets.
 *   - Lệnh menu → `getUi().alert()`, được phép vì chính người dùng vừa bấm.
 *   - Hàm sidebar gọi qua `google.script.run` → **ném lại** để `withFailureHandler` hiện; không lưu kho chờ.
 *   - `doPost` từ Extension → không có người, nên lưu kho chờ.
 *
 * **Luật xuyên suốt: ghi log rồi ném lại, không nuốt.** Ném lại không phải nuốt, và nó mua thêm một thứ miễn phí — email báo thực thi thất bại mà Google tự gửi.
 */

/** Khóa duy nhất của kho chờ trong `DocumentProperties`. Tài liệu 10 Phần 8. */
var ERROR_PENDING_KEY = 'LOG_PENDING';

/** Kho chờ giữ tối đa mấy phần tử mới nhất. Ngắn là cố ý: bản ghi bền vững luôn là sheet `Log`, nên mất một phần tử kho chờ không tốn gì, còn một khóa `DocumentProperties` phình quá chín kilobyte thì làm hỏng cả việc ghi. */
var ERROR_PENDING_MAX = 5;

/** Ba kênh hiển thị. Khai thành hằng để chỗ gọi không gõ chuỗi tự do — gõ sai một kênh thì lỗi biến mất không dấu vết. */
var ERROR_CHANNEL_ALERT = 'alert';
var ERROR_CHANNEL_THROW = 'throw';
var ERROR_CHANNEL_PENDING = 'pending';

/** Câu lỗi ngắn cho mắt người đọc. Lấy `message` chứ không lấy cả `stack`: `stack` thuộc sheet `Log`, nơi có chỗ và có người đi tìm nó. */
function errorMessage(err) {
  if (!err) { return 'Lỗi không rõ nguyên nhân.'; }
  if (err.message) { return String(err.message); }
  return String(err);
}

/**
 * Đẩy một câu vào kho chờ. Không bao giờ ném lỗi.
 *
 * Kho chờ là `DocumentProperties` chứ không phải sheet `Config` và cũng không phải cách đọc ngược sheet `Log`. Hai phương án đó đều bị bác ở tài liệu 10 Phần 8: `Config` là bề mặt núm vặn của người dùng nên máy ghi vào đó là làm bẩn nó và mời người ta sửa tay; còn đọc ngược `Log` thì vi phạm ràng buộc cứng rằng `Log` chỉ ghi một chiều.
 */
function errorPendingPush(message) {
  try {
    var props = PropertiesService.getDocumentProperties();
    var list = [];

    try {
      var raw = props.getProperty(ERROR_PENDING_KEY);
      var parsed = raw ? JSON.parse(raw) : [];
      if (Array.isArray(parsed)) { list = parsed; }
    } catch (khongPhaiJson) {
      list = [];
    }

    list.push(logNow() + ' — ' + message);
    while (list.length > ERROR_PENDING_MAX) { list.shift(); }

    props.setProperty(ERROR_PENDING_KEY, JSON.stringify(list));
  } catch (khongGhiDuocKhoCho) {
    console.error('errorPendingPush thất bại: ' + errorMessage(khongGhiDuocKhoCho));
  }
}

/**
 * Lấy các câu đang chờ ra và **xóa** khỏi kho. Nhả nghĩa là hiện rồi xóa.
 *
 * `loadCore` gọi hàm này lúc mở hoặc nạp lại sidebar, rồi client hiện kết quả bằng hộp thoại lớn. Không bao giờ ném lỗi: một kho chờ không đọc được không được phép làm sập lượt mở sidebar, vì lúc đó người dùng mất cả nội dung lẫn đường vào.
 */
function takePendingMessages() {
  try {
    var props = PropertiesService.getDocumentProperties();
    var raw = props.getProperty(ERROR_PENDING_KEY);
    if (!raw) { return []; }

    props.deleteProperty(ERROR_PENDING_KEY);

    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (khongDocDuocKhoCho) {
    return [];
  }
}

/**
 * Hiện một câu lên mắt người theo kênh của cửa vào. Không bao giờ ném lỗi.
 *
 * Kênh `throw` cố ý **không làm gì**: ở cửa sidebar thì chính việc ném lại lỗi là kênh hiển thị, `withFailureHandler` bên client nhận và vẽ. Hiện thêm ở phía máy chủ sẽ làm cùng một lỗi xuất hiện hai lần.
 *
 * Mỗi kênh có `try/catch` riêng vì `getUi()` chết trong trigger. Hỏng kênh thì rơi về kho chờ, và hỏng cả kho chờ thì còn `console.error` — nhưng dù hỏng tới đâu thì hàm này cũng không được phép làm mất lỗi gốc.
 */
function reportError(err, channel) {
  var message = errorMessage(err);

  if (channel === ERROR_CHANNEL_THROW) { return; }

  if (channel === ERROR_CHANNEL_ALERT) {
    try {
      SpreadsheetApp.getUi().alert('ShinCRM gặp lỗi', message, SpreadsheetApp.getUi().ButtonSet.OK);
      return;
    } catch (khongAlertDuoc) {
      errorPendingPush(message);
      return;
    }
  }

  errorPendingPush(message);
}

/** Phép nghiệm thu chạy được trên Google: đẩy một câu vào kho chờ, lấy ra, rồi kiểm kho đã sạch chưa. */
function probeErrorReport() {
  var report = [];

  errorPendingPush('Câu thử của probeErrorReport, không phải lỗi thật.');
  var lay = takePendingMessages();
  var layLai = takePendingMessages();

  report.push('Đẩy 1 câu, lấy ra được ' + lay.length + ' câu: ' + JSON.stringify(lay));
  report.push('Lấy lần hai (kho phải sạch): ' + layLai.length + ' câu');
  report.push('Kênh throw không hiện gì và không ném: ' + (reportError(new Error('không được hiện'), ERROR_CHANNEL_THROW) === undefined));
  report.push('Kho chờ sau cùng: ' + takePendingMessages().length + ' câu');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
