/**
 * Nửa "báo lỗi tới mắt người" của tài liệu 10 Phần 8: chọn kênh hiển thị theo cửa vào, và kho chờ cho những lúc không có ai ngồi trước máy.
 *
 * Vì sao không gộp vào `LogGate.gs`: hai việc có **hai luật ngược nhau**. Ghi log không được phép hỏng hay ném lỗi, còn hiển thị lỗi có thể gọi `SpreadsheetApp.getUi()` — dịch vụ không dùng được trong trigger nền. Trộn chung sẽ để lỗi của kênh hiển thị làm mất dòng log cần giữ.
 *
 * Bảng kênh theo cửa vào, đúng theo tài liệu 10 Phần 8:
 *   - Trigger sửa ô và thêm/xóa sheet → không có người nhìn, nên lưu kho chờ; vẫn ghi log rồi ném lại. Không dùng thông báo nhỏ của Google Sheets.
 *   - Lệnh menu → `getUi().alert()`, được phép vì chính người dùng vừa bấm.
 *   - Hàm sidebar gọi qua `google.script.run` → **ném lại** để `withFailureHandler` hiện; không lưu kho chờ.
 *   - `doPost` từ Extension → không có người, nên lưu kho chờ.
 *
 * Kho chờ được lấy cả lúc mở Sidebar lẫn ở mỗi lời hỏi chọn ô và nạp lại của Sidebar đang mở, nên lỗi nền hiện ngay ở Sidebar đang mở chứ không đợi lần mở sau.
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
    var props = documentProps();
    var list;
    try {
      list = documentPropertyJson(props, ERROR_PENDING_KEY, 'kho câu báo lỗi chờ', 'array') || [];
    } catch (khoHong) {
      // Kho hỏng thì các câu cũ đã mất; bắt đầu lại và nói rõ điều đó trong chính kho. Đọc kho lỗi thì không ghi đè lên thứ chưa đọc được.
      if (khoHong.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw khoHong; }
      logEvent({ source: 'error_report', action: 'pending_push', outcome: LOG_ERROR, reason: khoHong.code, detail: { key: ERROR_PENDING_KEY } });
      list = [logNow() + ' — ' + ERROR_PENDING_LOST_MESSAGE];
    }

    // Lỗi lặp ở mỗi lần sửa ô là cùng một câu: đã có trong kho thì người dùng sẽ thấy nó, thêm nữa chỉ đẩy các lỗi khác ra khỏi năm chỗ.
    var suffix = ' — ' + message;
    if (list.some(function (item) { return String(item).slice(-suffix.length) === suffix; })) { return; }
    list.push(logNow() + suffix);
    while (list.length > ERROR_PENDING_MAX) { list.shift(); }

    props.setProperty(ERROR_PENDING_KEY, JSON.stringify(list));
  } catch (khongGhiDuocKhoCho) {
    logEvent({ source: 'error_report', action: 'pending_push', outcome: LOG_ERROR, reason: khongGhiDuocKhoCho.code || 'ERROR_PENDING_WRITE_FAILED', detail: { error: errorMessage(khongGhiDuocKhoCho), message: String(message) } });
  }
}

/** Câu thay cho các câu báo lỗi cũ khi kho câu chờ hỏng. */
var ERROR_PENDING_LOST_MESSAGE = 'Kho câu báo lỗi chờ bị hỏng nên các câu báo lỗi cũ đã mất; chi tiết các lỗi đó vẫn ở sheet Log.';

/**
 * Lấy các câu đang chờ ra và **xóa** khỏi kho. Nhả nghĩa là hiện rồi xóa.
 *
 * `loadCore` gọi hàm này lúc mở hoặc nạp lại sidebar, `probeSelectionAndReload` gọi ở mỗi lời hỏi của Sidebar đang mở; client hiện kết quả bằng hộp thoại lớn. Kho đã nằm trong bản đọc `DocumentProperties` của lời gọi nên kho rỗng không tốn lệnh nào. Không bao giờ ném lỗi: một kho chờ không đọc được không được phép làm sập lượt mở sidebar, vì lúc đó người dùng mất cả nội dung lẫn đường vào.
 */
function takePendingMessages() {
  var props = documentProps();
  var list;
  try {
    list = documentPropertyJson(props, ERROR_PENDING_KEY, 'kho câu báo lỗi chờ', 'array');
  } catch (khongDocDuocKhoCho) {
    logEvent({ source: 'error_report', action: 'pending_take', outcome: LOG_ERROR, reason: khongDocDuocKhoCho.code || 'ERROR_PENDING_READ_FAILED', detail: { key: ERROR_PENDING_KEY } });
    // Đọc kho lỗi thì để nguyên kho cho lần mở sau; kho hỏng thì xóa và nói các câu cũ đã mất.
    if (khongDocDuocKhoCho.code !== 'DOCUMENT_PROPERTY_CORRUPT') { return [errorMessage(khongDocDuocKhoCho)]; }
    list = [ERROR_PENDING_LOST_MESSAGE];
  }
  if (!list) { return []; }
  try {
    props.deleteProperty(ERROR_PENDING_KEY);
  } catch (khongXoaDuocKhoCho) {
    logEvent({ source: 'error_report', action: 'pending_take', outcome: LOG_ERROR, reason: khongXoaDuocKhoCho.code || 'ERROR_PENDING_WRITE_FAILED', detail: { error: errorMessage(khongXoaDuocKhoCho) } });
  }
  return list;
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

  documentProps().setProperty(ERROR_PENDING_KEY, '{hỏng');
  report.push('Kho hỏng, lấy ra: ' + JSON.stringify(takePendingMessages()) + ' · kho sau đó: ' + JSON.stringify(documentProps().getProperty(ERROR_PENDING_KEY)));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
