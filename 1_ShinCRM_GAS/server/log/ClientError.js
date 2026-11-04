/**
 * Cổng chung ghi một lỗi do Sidebar tự gặp vào sheet `Log`, nguồn `sidebar`.
 *
 * Vì sao cần cổng riêng: lỗi sinh ở trình duyệt (hết hạn chờ một lời gọi, Extension vắng, thao tác hỏng phía client) thì máy chủ không ném gì, nên `runEntryPoint` không có gì để ghi. Không có cổng này thì loại lỗi đó im lặng. Mọi module cần ghi lỗi phía Sidebar (lượt nạp, đồng bộ FBM...) đi qua đây, không tự dựng dòng `logEvent` nguồn `sidebar`.
 *
 * **Không tin chuỗi client gửi.** Lý do và chi tiết bị cắt độ dài, chỉ giữ các khóa đã khai, để một chuỗi rác không làm phồng ô Log.
 */

/** Độ dài tối đa của lý do và của mỗi giá trị chi tiết. */
var CLIENT_ERROR_TEXT_MAX = 500;

/** Các khóa chi tiết nhận vào: `ham` là tên hàm máy chủ, `ms` là số ms đã chờ. Khóa lạ bị bỏ. */
var CLIENT_ERROR_DETAIL_KEYS = ['ham', 'ms'];

/** Đệm một dòng lỗi nguồn `sidebar`. Công cụ ghi, không phải cửa vào: bên gọi đang ở trong một lượt `runEntryPoint` và lượt đó nhả Log. */
function clientErrorLog(action, message, detail) {
  var nguon = detail && typeof detail === 'object' ? detail : {};
  var gon = {};
  CLIENT_ERROR_DETAIL_KEYS.forEach(function (khoa) {
    if (nguon[khoa] !== undefined && nguon[khoa] !== null) { gon[khoa] = String(nguon[khoa]).slice(0, CLIENT_ERROR_TEXT_MAX); }
  });
  logEvent({
    source: 'sidebar',
    action: String(action || 'sidebar_error').slice(0, 80),
    outcome: LOG_ERROR,
    reason: String(message || 'Sidebar gặp lỗi không rõ lý do.').slice(0, CLIENT_ERROR_TEXT_MAX),
    detail: Object.keys(gon).length ? gon : undefined
  });
}

/** Cửa vào cho Sidebar. Trả `{ ok: true }` để client biết dòng Log đã ghi, nhờ đó màn hình nói đúng là đã ghi hay chưa. */
function logClientError(action, message, detail) {
  return runEntryPoint('logClientError', 'sidebar', function () {
    clientErrorLog(action, message, detail);
    return { ok: true };
  });
}

/** Phép nghiệm thu chạy được trên Google: ghi một dòng như nhánh hết hạn chờ của `callServer` gửi lên, rồi đếm số dòng sheet `Log` nhận thêm (phải là 1). */
function probeClientError() {
  var truoc = sheetReadLastRow(logSheet());
  var kq = logClientError('client_timeout', 'Phép dò: máy chủ không phản hồi hàm loadCore sau 30000 ms.', { ham: 'loadCore', ms: 30000, khoaLa: 'phải bị bỏ' });
  var report = ['logClientError trả: ' + JSON.stringify(kq), 'Sheet Log nhận thêm ' + (sheetReadLastRow(logSheet()) - truoc) + ' dòng (phải là 1, nguồn sidebar, hành động client_timeout, chi tiết có ham và ms, không có khoaLa).'];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}
