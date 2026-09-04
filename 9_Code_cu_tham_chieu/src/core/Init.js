/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Init.gs
 * TITLE: Khởi tạo
 * ROLE: Orchestrator
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * onOpen, include(), showSidebar().
 * Chứa đường ống Injection nạp MASTER_SCHEMA vào Sidebar.
 * -------------------------------------------------------------------------
 */

/**
 * Mục đích: Tạo Menu tùy chỉnh trên thanh công cụ của Google Sheets.
 * Cách hoạt động: Kích hoạt tự động khi người dùng mở file Google Sheet. Nó tạo một Menu thả xuống và gán hàm showSidebar vào nút bấm.
 * Kết quả trả về: Không có (void).
 * Cách sử dụng: Hàm tự động chạy, không cần gọi thủ công.
 * * @param {void} Không có tham số.
 * @returns {void} Không trả về giá trị.
 */
function onOpen() {
  // Lấy đối tượng UI của Spreadsheet hiện tại
  SpreadsheetApp.getUi()
    // Tạo một menu mới trên thanh công cụ có tên "👉 CRM V14.2 Pro"
    .createMenu("👉 CRM V14.2 Pro")
    // Thêm một nút bấm vào menu, khi bấm sẽ chạy hàm "showSidebar"
    .addItem("Mở Sidebar", "showSidebar")
    // Cập nhật menu vừa tạo vào giao diện của Google Sheets
    .addToUi();
}

/**
 * Mục đích: Khởi tạo và hiển thị giao diện Sidebar trên Google Sheets, đồng thời nạp các biến môi trường (MASTER_SCHEMA).
 * Cách hoạt động: 
 * 1. Nạp file giao diện chính (Sidebar.html) dưới dạng Template.
 * 2. Thực thi (evaluate) các đoạn mã nhúng (scriptlet) bên trong file HTML để tiêm MASTER_SCHEMA.
 * 3. Xử lý chuỗi HTML để loại bỏ các ký tự lỗi tàng hình (BOM).
 * 4. Hiển thị lên UI với chiều rộng 450px.
 * Kết quả trả về: Không có (void). Chỉ thực hiện hiệu ứng phụ là mở Sidebar.
 * Cách sử dụng: Gọi trực tiếp từ Menu hoặc thông qua Google Apps Script Editor.
 * * @param {void} Không có tham số.
 * @returns {void} Không trả về giá trị.
 */
function showSidebar() {
  // Khởi tạo một đối tượng Template từ file HTML có tên 'src/ui/Sidebar'
  var template = HtmlService.createTemplateFromFile('src/ui/Sidebar'); 
  
  // Dịch template, thực thi các thẻ <?!= ... ?> (bao gồm getMasterSchema) ra chuỗi HTML thô
  var rawHtml = template.evaluate().getContent();
  
  // Dọn dẹp BOM tàng hình (\uFEFF) và khoảng trắng ở hai đầu chuỗi để chống vỡ layout
  var cleanHtml = rawHtml.replace(/^\uFEFF/, '').trim();
  
  // Đóng gói lại thành đối tượng HtmlOutput của Google Apps Script
  var htmlOutput = HtmlService.createHtmlOutput(cleanHtml)
    // Cài đặt tiêu đề hiển thị trên cùng của Sidebar
    .setTitle("CRM Local V14.2") 
    // Khóa cố định chiều rộng của Sidebar là 450px
    .setWidth(450); 
    
  // Lệnh cuối cùng: Mở Sidebar lên giao diện của người dùng
  SpreadsheetApp.getUi().showSidebar(htmlOutput);
}

/**
 * Mục đích: Nhúng nội dung văn bản thuần túy (HTML/JS/CSS) từ một file con vào file cha.
 * Cách hoạt động: 
 * 1. Mở file theo tên đường dẫn truyền vào.
 * 2. Lấy toàn bộ nội dung (text) bên trong file đó.
 * 3. Dọn dẹp ký tự tàng hình (BOM) để trả về chuỗi sạch sẽ.
 * Kết quả trả về: Chuỗi ký tự (String) chứa nội dung của file con.
 * Cách sử dụng: Đặt trong thẻ Scriptlet ở file HTML cha: <?!= include('src/ui/Styles'); ?>
 * * @param {string} filename - Đường dẫn/Tên của file cần nhúng (không kèm đuôi .html).
 * @returns {string} Nội dung văn bản của file đã được dọn dẹp.
 */
function include(filename) {
  // Tạo đối tượng Output từ file được chỉ định và lấy nội dung văn bản (text) bên trong
  var content = HtmlService.createHtmlOutputFromFile(filename).getContent();
  
  // Xóa ký tự BOM (\uFEFF) tàng hình và loại bỏ khoảng trắng thừa ở 2 đầu, sau đó trả về
  return content.replace(/^\uFEFF/, '').trim();
}