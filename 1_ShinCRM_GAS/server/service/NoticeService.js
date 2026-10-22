/**
 * Cửa vào Sidebar của cổng thông báo. Danh sách thông báo đã đi kèm lời trả của `loadCore` và `probeSelectionAndReload`, nên ở đây chỉ có việc người dùng bấm ✕. Tài liệu 10 Phần 8.
 */

/** Bỏ một thông báo rồi trả danh sách mới để Sidebar vẽ lại ngay, không đợi lời hỏi kế tiếp. */
function shinNoticeDismiss(key) {
  return runEntryPoint('shinNoticeDismiss', 'sidebar', function () {
    return { ok: true, dismissed: noticeDismiss(key), notices: noticeList() };
  });
}
