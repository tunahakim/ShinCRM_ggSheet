/**
 * Bảng khai loại thông báo của cổng thông báo (`server/notice/NoticeGate.js`). Tài liệu 10 Phần 8.
 *
 * Mỗi loại quyết `level` (mức độ, kênh dùng để chọn màu và thứ tự) và `clear` (cách hết). Bên phát chỉ đưa loại và phạm vi, nên không thể ghép một lỗi tự hết với cách hết "bấm ✕" hay ngược lại.
 *   - `on_success`: tự hết khi đúng việc gây ra chạy thành công lần sau.
 *   - `dismiss`: chuyện xảy ra một lần, không có việc nào chạy lại; chỉ hết khi người dùng bấm ✕.
 */
var NOTICE_TOPICS = {
  /** Một cửa vào ném lỗi. Phạm vi là tên cửa vào; `runEntryPoint` gỡ khi cửa vào đó chạy thành công. */
  entry_failure: { level: 'error', clear: 'on_success' },
  /** Bộ nhớ phụ trong DocumentProperties hỏng và đã bị xóa để tự dựng lại. Phạm vi là tên khóa. */
  memo_corrupt: { level: 'warning', clear: 'dismiss' },
  /** Chính một thông báo trong kho hỏng. Phạm vi là khóa của thông báo đó. */
  notice_corrupt: { level: 'warning', clear: 'dismiss' },
  /** Không đọc được kho thông báo. Không lưu, chỉ trả trong danh sách; lần đọc sau được thì tự mất. */
  notice_unreadable: { level: 'error', clear: 'on_success' },
  /** Cài đặt đã lưu không còn hợp lệ với dữ liệu hiện tại (ví dụ ngầm định chọn giá trị đã xóa khỏi Category); giá trị lệch bị bỏ qua. Phạm vi là tên phần cài đặt; lần kiểm sau khớp lại thì tự hết. */
  settings_stale: { level: 'warning', clear: 'on_success' },
  /** `LOG_TRACE` đang bật nên sheet Log có thể chứa dữ liệu khách nguyên văn. Tự hết khi tắt. */
  log_trace_on: { level: 'warning', clear: 'on_success' },
  /** Không cài được trigger của chủ tệp (server/entry/TriggerSetup.js). Không phạm vi; gỡ khi chủ tệp mở Sidebar và trigger đủ. */
  trigger_setup: { level: 'error', clear: 'on_success' },
  /** Bảng tra nhanh cú pháp lọc, mở từ lệnh menu. */
  filter_reference: { level: 'info', clear: 'dismiss' },
  /** Máy khác vừa tự nhận chạy nền FBM thay máy được giao im quá ngưỡng. Không phạm vi: lần nhận thay sau ghi đè lần trước; còn tới khi người dùng bấm ✕ dù mở Sidebar lúc nào, vì máy được giao im là việc cần xem lại máy đó. */
  fbm_machine_takeover: { level: 'warning', clear: 'dismiss' }
};

/** Thứ tự mức độ trong danh sách thông báo: số nhỏ đứng trước. */
var NOTICE_LEVEL_ORDER = { error: 0, warning: 1, info: 2 };
