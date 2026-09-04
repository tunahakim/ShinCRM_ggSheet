/**
 * Hàm dựng sheet của chặng 1.0. Nó chạy một lần để dựng bộ khung của tệp Sheet mới: bốn sheet kho và cấu hình với ba hàng tiêu đề, cộng sheet Log một hàng tiêu đề.
 *
 * Vì sao dựng bằng code chứ không gõ tay: hàng 1 là căn cứ duy nhất để code nhận cột, nên một mã gõ lệch một chữ là một lỗi không có gì bắt được cho tới lúc nạp. Sinh hàng 1 từ cùng một bảng khai mà DataSchema.gs sẽ đọc thì hai bên không có đường lệch nhau.
 *
 * Tệp này KHÔNG phải DataSchema.gs của chặng 1.1. Nó chỉ giữ danh sách mã cột và nhãn để dựng khung, không giữ kiểu dữ liệu, không giữ ràng buộc. Chặng 1.1 dựng bảng thật, và lúc đó tệp này sẽ đọc bảng thật thay vì giữ bản sao.
 */

/** ID tệp Sheet mới. Chốt cứng làm cổng chặn: chạy nhầm trên tệp đang đi bán hàng thì dừng ngay. */
var SETUP_EXPECTED_SPREADSHEET_ID = '1jEQMWMn5jRUBDGXrQxbK0hpld6gGwlAXSZpoRQm8lpI';

/** Số hàng tiêu đề của mọi sheet trừ Log, và hàng đầu tiên chứa dữ liệu. */
var SETUP_HEADER_ROWS = 3;
var SETUP_FIRST_DATA_ROW = 4;

/**
 * Bốn sheet có ba hàng tiêu đề. Mỗi cột là một cặp mã cột và nhãn tiếng Việt của hàng 2.
 * Thứ tự cột ở đây là thứ tự bày ra trên sheet; code không bao giờ đọc theo thứ tự này mà luôn tra theo mã, nên xê dịch về sau vẫn an toàn.
 */
var SETUP_SHEETS = {
  Customer: [
    ['@CUS_MA_KH', 'Mã khách'],
    ['@CUS_TEN_CTY', 'Tên công ty'],
    ['@CUS_MST', 'Mã số thuế'],
    ['@CUS_SDT', 'Điện thoại'],
    ['@CUS_EMAIL', 'Email'],
    ['@CUS_DIA_CHI', 'Địa chỉ'],
    ['@CUS_TINH_THANH', 'Tỉnh thành'],
    ['@CUS_WEBSITE', 'Website'],
    ['@CUS_NGUOI_LIEN_HE', 'Người liên hệ'],
    ['@CUS_CONG_TY_ME', 'Công ty mẹ'],
    ['@CUS_NHOM_KH', 'Nhóm khách'],
    ['@CUS_SAN_PHAM', 'Sản phẩm'],
    ['@CUS_NGUON_KH', 'Nguồn khách'],
    ['@CUS_XAC_THUC', 'Xác thực'],
    ['@CUS_NGAY_DONG_THAU', 'Ngày đóng thầu'],
    ['@CUS_GHI_CHU', 'Ghi chú'],
    ['@CUS_TIM_KIEM', 'Từ khóa tìm kiếm'],
    ['@CUS_NGAY_NHAP_LIEU', 'Ngày nhập liệu'],
    ['@CUS_CHO_PHEP_FBM', 'Cho phép đẩy FBM'],
    ['@CUS_TT_BAN_GHI', 'Tình trạng bản ghi'],
    ['@CUS_FBM_ID', 'FBM ID'],
    ['@CUS_MA_KH_FBM', 'Mã khách FBM'],
    ['@CUS_HASH_FBM', 'Dấu vân FBM'],
    ['@CUS_SYNC_TT', 'Tình trạng đồng bộ'],
    ['@CUS_SYNC_LUC', 'Đồng bộ lúc']
  ],
  Activity: [
    ['@ACT_MA_GD', 'Mã giao dịch'],
    ['@ACT_MA_KH', 'Mã khách'],
    ['@ACT_NGAY_LAM_VIEC', 'Ngày làm việc'],
    ['@ACT_CONG_VIEC', 'Công việc'],
    ['@ACT_NOI_DUNG_CV', 'Nội dung công việc'],
    ['@ACT_SAN_PHAM', 'Sản phẩm'],
    ['@ACT_NGUOI_NHAP_LIEU', 'Người nhập liệu'],
    ['@ACT_GIA_TRI_HD', 'Giá trị hợp đồng'],
    ['@ACT_UU_TIEN', 'Ưu tiên'],
    ['@ACT_HAN_XU_LY', 'Hạn xử lý'],
    ['@ACT_NGAY_NHAP_LIEU', 'Ngày nhập liệu'],
    ['@ACT_CHO_PHEP_FBM', 'Cho phép đẩy FBM'],
    ['@ACT_TT_BAN_GHI', 'Tình trạng bản ghi'],
    ['@ACT_FBM_ID', 'FBM ID'],
    ['@ACT_HASH_FBM', 'Dấu vân FBM'],
    ['@ACT_SYNC_TT', 'Tình trạng đồng bộ']
  ],
  Category: [
    ['@CAT_TINH_THANH', 'Tỉnh thành'],
    ['@CAT_TINH_THANH_FBM', 'Tỉnh thành — mã FBM'],
    ['@CAT_NHOM_KH', 'Nhóm khách'],
    ['@CAT_SAN_PHAM', 'Sản phẩm'],
    ['@CAT_SAN_PHAM_FBM', 'Sản phẩm — mã FBM'],
    ['@CAT_NGUON_KH', 'Nguồn khách'],
    ['@CAT_NGUON_KH_FBM', 'Nguồn khách — mã FBM'],
    ['@CAT_XAC_THUC', 'Xác thực'],
    ['@CAT_CHO_PHEP_FBM', 'Cho phép đẩy FBM'],
    ['@CAT_CONG_VIEC', 'Công việc'],
    ['@CAT_CONG_VIEC_FBM', 'Công việc — mã FBM'],
    ['@CAT_NGUOI_NHAP_LIEU', 'Người nhập liệu'],
    ['@CAT_UU_TIEN', 'Ưu tiên']
  ],
  Config: [
    ['@CFG_THAM_SO', 'Tham số'],
    ['@CFG_THAM_SO_GIA_TRI', 'Giá trị'],
    ['@CFG_COT_MA', 'Mã cột người dùng thêm'],
    ['@CFG_COT_KIEU', 'Kiểu'],
    ['@CFG_NGAM_DINH_MA_COT', 'Ngầm định — mã cột'],
    ['@CFG_NGAM_DINH_GIA_TRI', 'Ngầm định — giá trị'],
    ['@CFG_SORT_COL', 'Sắp xếp — mã cột'],
    ['@CFG_SORT_LEVEL', 'Sắp xếp — chiều'],
    ['@CFG_BO_DEM_LOAI', 'Bộ đếm — loại mã'],
    ['@CFG_BO_DEM_GIA_TRI', 'Bộ đếm — giá trị']
  ]
};

/** Sheet Log là ngoại lệ duy nhất: một hàng tiêu đề, chín cột, không mã @, dữ liệu từ hàng 2. */
var SETUP_LOG_HEADERS = ['Lúc', 'Nguồn', 'Việc', 'Kết quả', 'Thực thể', 'Mã bản ghi', 'Lý do', 'Kỳ', 'Chi tiết kỹ thuật'];

/**
 * Dựng toàn bộ khung sheet. Chạy lại được nhiều lần: sheet đã có thì chỉ ghi lại hàng tiêu đề, không đụng dữ liệu từ hàng 4 trở xuống.
 */
function setupSheets() {
  var file = SpreadsheetApp.getActiveSpreadsheet();

  if (file.getId() !== SETUP_EXPECTED_SPREADSHEET_ID) {
    throw new Error('Dừng lại: đang chạy trên tệp "' + file.getName() + '" (ID ' + file.getId() + '), không phải tệp dành cho bản mới. Không dựng gì cả.');
  }

  var report = ['ShinCRM chặng 1.0 — dựng khung sheet', 'Tệp: ' + file.getName(), ''];

  Object.keys(SETUP_SHEETS).forEach(function (sheetName) {
    var columns = SETUP_SHEETS[sheetName];
    var sheet = file.getSheetByName(sheetName) || file.insertSheet(sheetName);

    var codes = columns.map(function (column) { return column[0]; });
    var labels = columns.map(function (column) { return column[1]; });
    var noteRow = columns.map(function () { return ''; });

    // Ghi cả ba hàng tiêu đề bằng đúng một lệnh, theo luật gộp lệnh ghi của tài liệu 06.
    sheet.getRange(1, 1, SETUP_HEADER_ROWS, columns.length).setValues([codes, labels, noteRow]);

    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground('#d9e2f3');
    sheet.getRange(2, 1, 1, columns.length).setFontWeight('bold');
    sheet.setFrozenRows(SETUP_HEADER_ROWS);

    report.push('✅ ' + sheetName + ': ' + columns.length + ' cột, ' + SETUP_HEADER_ROWS + ' hàng tiêu đề, dữ liệu từ hàng ' + SETUP_FIRST_DATA_ROW);
  });

  var logSheet = file.getSheetByName('Log') || file.insertSheet('Log');
  logSheet.getRange(1, 1, 1, SETUP_LOG_HEADERS.length).setValues([SETUP_LOG_HEADERS]);
  logSheet.getRange(1, 1, 1, SETUP_LOG_HEADERS.length).setFontWeight('bold').setBackground('#fce4d6');
  logSheet.setFrozenRows(1);
  report.push('✅ Log: ' + SETUP_LOG_HEADERS.length + ' cột, 1 hàng tiêu đề, dữ liệu từ hàng 2');

  // Sheet trắng của Google tên "Trang tính1" hoặc "Sheet1"; xóa nếu nó còn trống, vì để lại thì nó lọt vào danh sách sheet cần nạp.
  var leftovers = file.getSheets().filter(function (sheet) {
    var name = sheet.getName();
    var isKnown = SETUP_SHEETS.hasOwnProperty(name) || name === 'Log';
    return !isKnown && sheet.getLastRow() === 0;
  });
  leftovers.forEach(function (sheet) {
    report.push('🗑 Đã xóa sheet trống thừa: ' + sheet.getName());
    file.deleteSheet(sheet);
  });

  report.push('');
  report.push('Các sheet hiện có: ' + file.getSheets().map(function (sheet) { return sheet.getName(); }).join(', '));

  var text = report.join('\n');
  console.log(text);
  return text;
}

/**
 * Kiểm lại khung vừa dựng, đọc ngược từ sheet lên chứ không tin bảng khai. Đây là phép nghiệm thu của chặng 1.0.
 */
function verifySheets() {
  var file = SpreadsheetApp.getActiveSpreadsheet();
  var problems = [];
  var lines = ['ShinCRM chặng 1.0 — nghiệm thu khung sheet', ''];

  Object.keys(SETUP_SHEETS).forEach(function (sheetName) {
    var expected = SETUP_SHEETS[sheetName].map(function (column) { return column[0]; });
    var sheet = file.getSheetByName(sheetName);

    if (!sheet) {
      problems.push('Thiếu hẳn sheet ' + sheetName);
      return;
    }

    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    var mismatched = [];
    expected.forEach(function (code, index) {
      if (actual[index] !== code) {
        mismatched.push('cột ' + (index + 1) + ' mong "' + code + '" nhưng thấy "' + actual[index] + '"');
      }
    });

    // Luật một-mã-một-cột của tài liệu 02 Phần 3: trùng mã là báo lỗi, không tự chọn một cột.
    var seen = {};
    actual.forEach(function (code) {
      if (!code) { return; }
      if (seen[code]) { mismatched.push('mã trùng: ' + code); }
      seen[code] = true;
    });

    if (sheet.getFrozenRows() !== SETUP_HEADER_ROWS) {
      mismatched.push('đóng băng ' + sheet.getFrozenRows() + ' hàng, phải là ' + SETUP_HEADER_ROWS);
    }

    if (mismatched.length) {
      problems.push(sheetName + ': ' + mismatched.join('; '));
      lines.push('❌ ' + sheetName + ' — ' + mismatched.join('; '));
    } else {
      lines.push('✅ ' + sheetName + ' — ' + expected.length + ' mã cột đúng, đóng băng ' + SETUP_HEADER_ROWS + ' hàng');
    }
  });

  var logSheet = file.getSheetByName('Log');
  if (!logSheet) {
    problems.push('Thiếu hẳn sheet Log');
    lines.push('❌ Log — không tìm thấy');
  } else {
    var logActual = logSheet.getRange(1, 1, 1, SETUP_LOG_HEADERS.length).getValues()[0];
    var logOk = SETUP_LOG_HEADERS.every(function (header, index) { return logActual[index] === header; });
    if (logOk && logSheet.getFrozenRows() === 1) {
      lines.push('✅ Log — 9 cột đúng, đóng băng 1 hàng');
    } else {
      problems.push('Log: tiêu đề hoặc số hàng đóng băng sai');
      lines.push('❌ Log — tiêu đề hoặc số hàng đóng băng sai');
    }
  }

  lines.push('');
  lines.push(problems.length ? '❌ KHÔNG ĐẠT — ' + problems.length + ' vấn đề' : '✅ ĐẠT — khung sheet đúng thiết kế');

  var text = lines.join('\n');
  console.log(text);
  return text;
}
