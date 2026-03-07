/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Init.gs
 * TITLE: Khởi tạo
 * ROLE: Orchestrator
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * onOpen, include(), onEdit (Debounce 3s logic).
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

// === 1. GIỮ NGUYÊN: CÁC HÀM HỆ THỐNG & MENU ===
function onOpen() {
  SpreadsheetApp.getUi()
    .createMenu("👉 CRM V14.2 Pro")
    .addItem("Mở Sidebar", "showSidebar")
    .addToUi();
}


/**
 * Đây là function showSidebar() cũ, trước khi chỉnh sửa để dùng Template.
 * Mình giữ lại đây để bạn dễ so sánh và hiểu rõ hơn về sự khác biệt giữa hai cách tạo Sidebar.
 * Cách cũ này dùng createHtmlOutputFromFile trực tiếp, không hỗ trợ include() để ghép nhiều file HTML lại với nhau.
 * 
function showSidebar() {
  var html = HtmlService.createHtmlOutputFromFile("1. GAS - Old/SidebarOld")
    .setTitle("CRM Local V14.2") // [GIỮ NGUYÊN] Tiêu đề cũ
    .setWidth(450); // [GIỮ NGUYÊN] Width 450px
  SpreadsheetApp.getUi().showSidebar(html);
}
**/

function showSidebar() {
  // 1. Đổi thành createTemplateFromFile
  var html = HtmlService.createTemplateFromFile("1. GAS - Old/SidebarOld") 
    .evaluate() // 2. BẮT BUỘC phải có dòng này để kích hoạt hàm include ghép file
    .setTitle("CRM Local V14.2") 
    .setWidth(450); 
  SpreadsheetApp.getUi().showSidebar(html);
}

/**
 * Hàm hỗ trợ nhúng nội dung từ một file HTML/JS/CSS khác vào file hiện tại.
 * (Hàm hỗ trợ nạp các file HTML con vào Sidebar chính)
 * Thường dùng để chia nhỏ các thành phần giao diện (UI) trong Google Apps Script.
 * * @param {string} filename - Tên file cần lấy nội dung (không bao gồm đuôi file .html).
 * @return {string} Nội dung văn bản thuần túy của file đó.
 */
function include(filename) {
  // 1. HtmlService.createHtmlOutputFromFile(filename): 
  //    Tạo một đối tượng Output từ file có tên tương ứng trong dự án.
  // 2. .getContent(): 
  //    Lấy toàn bộ nội dung text bên trong file đó để trả về cho trình duyệt.
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
