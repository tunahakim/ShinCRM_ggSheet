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
function showSidebar() {
  // 1. Phải dùng Template để thực thi được lệnh include
  var template = HtmlService.createTemplateFromFile('1. GAS - Old/Sidebar'); 
  
  // 2. Thực thi lệnh nạp (evaluate)
  var html = template.evaluate()
    .setTitle("CRM Local V14.2") // [GIỮ NGUYÊN] Tiêu đề cũ
    .setWidth(450); // [GIỮ NGUYÊN] Width 450px
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
  var content = HtmlService.createHtmlOutputFromFile(filename).getContent();
  
  // Xóa ký tự BOM (\uFEFF) tàng hình và loại bỏ khoảng trắng/xuống dòng thừa ở 2 đầu
  return content.replace(/^\uFEFF/, '').trim();
}