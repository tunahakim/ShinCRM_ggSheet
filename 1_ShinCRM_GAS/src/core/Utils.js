/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: Utils.gs
 * TITLE: Tiện ích
 * ROLE: Helper
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * checkSystemOverload, findIdx, getRawDateValue.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */


// === 2. GIỮ NGUYÊN: HÀM TÌM CỘT THÔNG MINH (CORE LOGIC) ===
/**
 * Hàm này bạn viết rất tốt, tôi giữ nguyên 100% logic để đảm bảo
 * tính năng nhận diện cột (Suffix, Contains) vẫn hoạt động như cũ.
 */
function findIdx(headerRow, possibleNames) {
  if (!headerRow) return -1;
  for (var i = 0; i < possibleNames.length; i++) {
    var key = possibleNames[i].toUpperCase();
    var idx = headerRow.indexOf(possibleNames[i]); // 1. Chính xác
    if (idx > -1) return idx;
    
    idx = headerRow.findIndex(function (cell) { // 2. Khớp đuôi
      var c = String(cell).toUpperCase();
      return c.endsWith("_" + key) || c === key;
    });
    if (idx > -1) return idx;

    idx = headerRow.findIndex(function (cell) { // 3. Chứa từ khóa
      return String(cell).toUpperCase().includes(key);
    });
    if (idx > -1) return idx;
  }
  return -1;
}

// --- CÁC HÀM XỬ LÝ NGÀY THÁNG CỐT LÕI (CORE DATE ENGINE) ---

// [MỚI] Hàm hỗ trợ format ngày tháng chuẩn VN để gửi về Client
function formatDateVN(dateObj) {
  if (!dateObj || !(dateObj instanceof Date)) return "";
  return Utilities.formatDate(dateObj, "GMT+7", "dd-MM-yyyy");
}

/**
 * Chuẩn hóa ngày tháng để gửi về Sidebar hiển thị (dạng dd-mm-yyyy)
 */
function formatDateForClient(val) {
  if (!val) return "";
  if (val instanceof Date) {
    return Utilities.formatDate(val, "GMT+7", "dd-MM-yyyy");
  }
  // Nếu là chuỗi yyyy-mm-dd thì xoay lại
  var s = String(val);
  if (s.match(/^\d{4}-\d{2}-\d{2}$/)) {
    var p = s.split("-");
    return p[2] + "-" + p[1] + "-" + p[0];
  }
  return s;
}

// [MỚI] Hàm biến đổi mọi thứ (Date hoặc Text) thành số YYYYMMDD
// Hàm này bị trùng bên dưới, hàm bên dưới rõ ràng hơn!
function getRawDateValue(val) {
  if (!val) return 0;
  // Nếu là Date Object (như log bạn vừa check)
  if (val instanceof Date) {
    return val.getFullYear() * 10000 + (val.getMonth() + 1) * 100 + val.getDate();
  }
  // Nếu là Chuỗi Text (các dòng cũ nhập tay)
  var s = String(val).trim();
  if (s.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) { // Dạng dd-mm-yyyy
    var p = s.split(/[-/]/);
    return parseInt(p[2]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[0]);
  }
  if (s.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) { // Dạng yyyy-mm-dd
    var p = s.split(/[-/]/);
    return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]);
  }
  return 0; 
}

/**
 * Chuyển đổi mọi loại dữ liệu ngày tháng sang số nguyên YYYYMMDD để so sánh/lọc/sort
 * Đầu vào: Date Object, hoặc chuỗi "dd-mm-yyyy", hoặc chuỗi "yyyy-mm-dd"
 * Đầu ra: Số 20250120 (nếu lỗi trả về 0)
 */
function getRawDateValue(val) {
  if (!val) return 0;
  
  // Trường hợp 1: Là Date Object (Do Google Sheet trả về)
  if (val instanceof Date) {
    var y = val.getFullYear();
    var m = val.getMonth() + 1; // 0-11
    var d = val.getDate();
    return y * 10000 + m * 100 + d;
  }
  
  // Trường hợp 2: Là chuỗi văn bản
  var s = String(val).trim();
  
  // Dạng dd-mm-yyyy (Việt Nam)
  if (s.match(/^\d{1,2}[-/]\d{1,2}[-/]\d{4}$/)) {
    var p = s.split(/[-/]/);
    return parseInt(p[2]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[0]);
  }
  
  // Dạng yyyy-mm-dd (ISO)
  if (s.match(/^\d{4}[-/]\d{1,2}[-/]\d{1,2}$/)) {
    var p = s.split(/[-/]/);
    return parseInt(p[0]) * 10000 + parseInt(p[1]) * 100 + parseInt(p[2]);
  }
  
  return 0; // Không xác định
}


// === 6. TÍNH NĂNG AN TOÀN: KIỂM TRA QUÁ TẢI ===

function checkSystemOverload() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var totalCells = 0;
  var LIMIT = 500000; // Giới hạn an toàn (khớp với thông báo ở HTML) (mặc định là 500000 ô)

  // Quét nhanh qua tất cả các sheet
  for (var i = 0; i < sheets.length; i++) {
    var s = sheets[i];
    // Chỉ tính vùng có dữ liệu thực tế (LastRow * LastColumn)
    // Cách này rất nhẹ, không tốn tài nguyên như getValues()
    var cells = s.getLastRow() * s.getLastColumn();
    totalCells += cells;
  }

  // Nếu vượt quá giới hạn -> Trả về cảnh báo
  if (totalCells > LIMIT) {
    return { isOverload: true, count: totalCells, limit: LIMIT };
  }

  // An toàn
  return { isOverload: false };
}