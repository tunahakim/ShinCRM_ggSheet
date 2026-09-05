/**
 * Cửa chạy hàm lúc phát triển. Nó tồn tại vì một lý do duy nhất: cho phiên code chạy một hàm trên tệp Sheet thật khi không có ai ngồi trước máy để bấm Run.
 *
 * Vì sao không dùng Apps Script API (clasp run-function): đã thử và nó không chạy được. Script này gắn vào tệp Sheet (container-bound),
 * và với script gắn tệp thì lời gọi scripts.run trả về lỗi "reading from storage ... NOT_FOUND" trước khi chạm tới code —
 * gọi một hàm không hề tồn tại cũng ra đúng lỗi đó, nên lỗi nằm ở tầng nạp script chứ không nằm ở code. Không sửa được bằng cấu hình.
 *
 * ĐÂY LÀ TỆP CHỈ DÙNG KHI PHÁT TRIỂN. Nó mở một địa chỉ web chạy code dưới quyền chủ tệp, nên phải xóa tệp này và xóa bản triển khai
 * trước khi tệp Sheet thật mang dữ liệu khách hàng. Ba lớp chặn đang có:
 *   1. Phải có đúng thẻ bí mật trong DEV_TOKEN, không có thẻ thì hàm không chạy gì cả.
 *   2. Chỉ chạy được tên hàm nằm trong danh sách trắng dưới đây, không nhận code tự do.
 *   3. Khóa LockService để hai lời gọi không ghi chồng lên nhau.
 */

/** Danh sách trắng: tên hàm mà cửa này được phép chạy. Thêm tên vào đây là việc có ý thức, không phải việc tình cờ. */
var DEV_RUNNER_ALLOWED = ['smokeTest', 'smokeDiag', 'setupSheets', 'verifySheets'];

/**
 * Nhận lời gọi từ bên ngoài. Trả về văn bản thuần, mở đầu bằng OK hoặc LOI để phía gọi đọc được kết quả mà không phải bóc HTML.
 */
function doGet(e) {
  var params = (e && e.parameter) ? e.parameter : {};
  var reply = function (text) {
    return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.TEXT);
  };

  if (typeof DEV_TOKEN !== 'string' || DEV_TOKEN.length < 16) {
    return reply('LOI\nChưa nạp thẻ bí mật. Thiếu tệp DevToken.gs trên Google.');
  }
  if (params.token !== DEV_TOKEN) {
    return reply('LOI\nThẻ bí mật sai. Không chạy gì cả.');
  }

  var name = params.fn || '';
  if (DEV_RUNNER_ALLOWED.indexOf(name) === -1) {
    return reply('LOI\nHàm "' + name + '" không nằm trong danh sách trắng. Danh sách: ' + DEV_RUNNER_ALLOWED.join(', '));
  }

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(30000)) {
    return reply('LOI\nĐang có lượt chạy khác giữ khóa. Thử lại sau.');
  }

  try {
    var scope = (typeof globalThis !== 'undefined') ? globalThis : this;
    if (typeof scope[name] !== 'function') {
      return reply('LOI\nHàm "' + name + '" có trong danh sách trắng nhưng không tìm thấy trong code đã đẩy lên.');
    }
    var started = new Date().getTime();
    var result = scope[name]();
    var elapsed = new Date().getTime() - started;
    return reply('OK\nHàm: ' + name + '\nHết: ' + elapsed + ' ms\n\n' + (result === undefined ? '(hàm không trả về gì)' : String(result)));
  } catch (loi) {
    var chiTiet = loi && loi.stack ? loi.stack : String(loi);
    return reply('LOI\nHàm: ' + name + '\n' + chiTiet);
  } finally {
    lock.releaseLock();
  }
}
