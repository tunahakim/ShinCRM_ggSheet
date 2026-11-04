/**
 * Công tắc chế độ ghi log chi tiết cho **tệp DEV**, gọi được bằng `node tests/gas.js devLogTraceOn --push`. Đi qua đúng cổng lưu cài đặt mà màn Cài đặt dùng (`settingsSave`), không có đường ghi riêng.
 *
 * **Đây là công cụ giai đoạn phát triển, nằm trong `server/dev/` và bị xóa cùng cả thư mục trước khi tệp có dữ liệu thật.** Trước khi xóa thì phải chạy `devLogTraceOff`: chế độ vết ghi bí mật ra nguyên văn, và tài liệu 10 Phần 7 cấm chia sẻ tệp trong lúc nó đang bật.
 */

/** Lưu `LOG_TRACE` = `value` rồi đọc lại qua chính đường chương trình dùng. */
function devLogTraceSet(value) {
  var patch = {};
  patch[LOG_TRACE_SETTING] = value || 'off';
  var saved = settingsSave({ core_ops: patch });
  if (!saved.ok) { throw new Error('Không lưu được LOG_TRACE: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
  settingsLogTraceNotice(saved.values.core_ops[LOG_TRACE_SETTING]);
  var report = [
    'LOG_TRACE = "' + saved.values.core_ops[LOG_TRACE_SETTING] + '"',
    'Phủ nguồn "sidebar"? ' + logTraceCoversSource('sidebar'),
    'Phủ nguồn "fbm_sync"? ' + logTraceCoversSource('fbm_sync')
  ];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}

/** Bật chế độ ghi log chi tiết cho **mọi** nguồn. Chủ dự án chốt ngày 05/09/2026: giai đoạn phát triển thì ghi chi tiết, ngày thường ẩn hết. */
function devLogTraceOn() {
  return devLogTraceSet('all');
}

/** Tắt hẳn chế độ ghi log chi tiết. Phải chạy trước khi xóa `server/dev/` và trước khi tệp có dữ liệu thật. */
function devLogTraceOff() {
  return devLogTraceSet('off');
}
