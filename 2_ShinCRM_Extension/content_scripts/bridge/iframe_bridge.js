/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: iframe_bridge.js
 * TITLE: Cầu nối
 * ROLE: Bridge
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Chuyển window.postMessage từ Sidebar sang Extension.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

console.log("🚀 CRM Extension V15.0: iframe_bridge Loaded");

var sidebarWindow = null;

// 1. Lắng nghe "cú bắt tay" từ Sidebar
window.addEventListener('message', function(event) {
  if (event.data && event.data.action === 'CRM_HANDSHAKE') {
      sidebarWindow = event.source;
  }
});

// 2. Bắn ảnh chụp trạng thái sang Sidebar. Sidebar tự quyết dùng trường nào.
function sendContextToSidebar(context) {
  if (!sidebarWindow) return;
  try {
      context.action = 'CRM_CONTEXT';
      sidebarWindow.postMessage(context, '*');
  } catch (err) {
      sidebarWindow = null;
  }
}