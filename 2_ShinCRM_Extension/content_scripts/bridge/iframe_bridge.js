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

// 2. [THAY ĐỔI] Hàm gửi thông tin thô sang Sidebar (Thêm col, Bỏ needReload)
function sendToSidebar(sheetName, rowNumber, colNumber) {
  if (!sidebarWindow) return;
  try {
      sidebarWindow.postMessage({
        action: 'CRM_TRIGGER',
        sheet: sheetName,
        row: rowNumber,
        col: colNumber // [MỚI] Gửi thêm cột
      }, '*');
      // console.log(`📡 Sent: ${sheetName} | R${rowNumber}:C${colNumber}`);
  } catch (err) {
      sidebarWindow = null; 
  }
}