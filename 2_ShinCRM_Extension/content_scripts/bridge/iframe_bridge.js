/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: iframe_bridge.js
 * TITLE: Cầu nối
 * ROLE: Bridge
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Nhận "cú bắt tay" từ Sidebar, đáp tiếng, rồi bắn ảnh chụp trạng thái về đúng
 * khung vừa bắt tay.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

console.log("🚀 CRM Extension V15.0: iframe_bridge Loaded");

/*
 * An ninh của cầu nối, và giới hạn còn lại.
 *
 * Sidebar chạy trong iframe có origin `*.googleusercontent.com` (Apps Script phục vụ khung từ đó), còn trang Sheets ở
 * `docs.google.com` — khác origin nên mọi tin qua lại đều phải chỉ định rõ đích. Ba chỗ chặn:
 *   1. Chỉ nhận bắt tay từ origin khớp allowlist dưới đây, không nhận từ khung lạ.
 *   2. Mỗi lần bắt tay lưu lại cả window lẫn origin, và mọi tin bắn về sau dùng đúng origin đó — bỏ hẳn `'*'`.
 *   3. Tiếng đáp `CRM_HANDSHAKE_ACK` mang đúng nonce vừa nhận; nonce do sidebar sinh ngẫu nhiên lúc boot.
 *
 * Giới hạn thật lòng: một add-on Apps Script khác cùng nằm trên trang **và biết giao thức này** vẫn đọc được tin. Rò rỉ bị
 * chặn ở mức tên sheet cộng nội dung ô đang chọn, không chặn được mức đó. Chấp nhận, vì chủ dự án là người duy nhất dùng
 * và tự quyết cài add-on nào.
 */
var SIDEBAR_ORIGIN_ALLOWLIST = [
  /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/
];

var sidebarWindow = null;
var sidebarOrigin = '';

function isAllowedSidebarOrigin(origin) {
  for (var i = 0; i < SIDEBAR_ORIGIN_ALLOWLIST.length; i++) {
    if (SIDEBAR_ORIGIN_ALLOWLIST[i].test(origin)) { return true; }
  }
  return false;
}

// 1. Bắt tay: kiểm origin, ghi nhớ đích, đáp tiếng kèm đúng nonce.
window.addEventListener('message', function (event) {
  var data = event.data;
  if (!data || data.action !== 'CRM_HANDSHAKE') { return; }
  if (!isAllowedSidebarOrigin(event.origin) || !event.source) { return; }

  sidebarWindow = event.source;
  sidebarOrigin = event.origin;

  try {
    event.source.postMessage({
      action: 'CRM_HANDSHAKE_ACK',
      nonce: data.nonce,
      at: Date.now()
    }, event.origin);
  } catch (err) {
    sidebarWindow = null;
    sidebarOrigin = '';
  }
});

// 2. Bắn ảnh chụp trạng thái sang Sidebar. Sidebar tự quyết dùng trường nào.
function sendContextToSidebar(context) {
  if (!sidebarWindow || !sidebarOrigin) return;
  try {
      context.action = 'CRM_CONTEXT';
      sidebarWindow.postMessage(context, sidebarOrigin);
  } catch (err) {
      sidebarWindow = null;
      sidebarOrigin = '';
  }
}
