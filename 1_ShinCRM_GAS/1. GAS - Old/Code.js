/**
 * ==========================================
 * CRM BIG DATA V14.2 - SERVER SIDE (Code.gs)
 * ==========================================
 */


/**
 * CODE NÀY ĐÃ CÓ Ở INIT.GS
 * Hàm hỗ trợ nhúng nội dung từ một file HTML/JS/CSS khác vào file hiện tại.
 * (Hàm hỗ trợ nạp các file HTML con vào Sidebar chính)
 * Thường dùng để chia nhỏ các thành phần giao diện (UI) trong Google Apps Script.
 * * @param {string} filename - Tên file cần lấy nội dung (không bao gồm đuôi file .html).
 * @return {string} Nội dung văn bản thuần túy của file đó.
 */

/** 
function include(filename) {
  // 1. HtmlService.createHtmlOutputFromFile(filename): 
  //    Tạo một đối tượng Output từ file có tên tương ứng trong dự án.
  // 2. .getContent(): 
  //    Lấy toàn bộ nội dung text bên trong file đó để trả về cho trình duyệt.
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}
*/

