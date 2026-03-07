/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: sheet_scout.js
 * TITLE: Smart Scout
 * ROLE: Observer
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Bắt tọa độ ô trên Sheets (mouseup/keyup).
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

console.log("🚀 CRM Extension V15.0: sheet_scout Loaded");

// [THAY ĐỔI] Chỉ lưu tọa độ, bỏ biến isControl
var lastContext = { sheet: "", row: -1, col: -1 }; 
var cachedNameBox = null;

// 3. Hàm phân tích tọa độ (Giữ nguyên logic cũ)
function parseCellReference(ref) {
    if (!ref) return null;
    var match = ref.match(/^([A-Z]+)([0-9]+)$/);
    if (!match) return null;
    
    var colStr = match[1];
    var rowNum = parseInt(match[2]);
    var colNum = 0;
    for (var i = 0; i < colStr.length; i++) {
        colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
    }
    return { row: rowNum, col: colNum };
}

// 4. Quét định kỳ (200ms) - [THAY ĐỔI LỚN: BỎ LOGIC SUY LUẬN]
setInterval(() => {
  if (document.hidden || !sidebarWindow) return;

  // A. Lấy Tên Sheet
  const tabNameEl = document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name');
  const currentSheet = tabNameEl ? (tabNameEl.innerText || tabNameEl.textContent || "").trim() : "";

  // B. Lấy Tọa độ
  if (!cachedNameBox || !cachedNameBox.isConnected) {
      cachedNameBox = document.getElementById('t-name-box') || document.querySelector('.waffle-name-box');
  }
   
  var cellRef = "";
  if (cachedNameBox) {
    cellRef = cachedNameBox.value || cachedNameBox.innerText || "";
  }

  var coord = parseCellReference(cellRef);
  if (!coord) return; // Nếu chưa click vào ô nào thì bỏ qua

  var currentRow = coord.row;
  var currentCol = coord.col;

  // C. [LOGIC MỚI] Chỉ kiểm tra xem có thay đổi vị trí không?
  // Nếu Sheet khác, HOẶC Hàng khác, HOẶC Cột khác -> Gửi tin nhắn ngay
  if (currentRow !== lastContext.row || currentCol !== lastContext.col || currentSheet !== lastContext.sheet) {
      
      // Cập nhật trạng thái cũ
      lastContext = {
          sheet: currentSheet,
          row: currentRow,
          col: currentCol
      };

      // Gửi toàn bộ thông tin về cho Sidebar tự xử lý
      // Không còn kiểm tra if (currentRow >= 4) nữa -> Gửi hết!
      sendToSidebar(currentSheet, currentRow, currentCol);
  }

}, 200);
