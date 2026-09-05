/**
 * Bảng khai hình dáng sheet: sheet nào có mấy hàng tiêu đề, dữ liệu bắt đầu từ hàng nào, và cột nào bày ra theo thứ tự nào.
 *
 * Đây là chuyện **chỗ để**, khác với chuyện **trường** mà `DataSchema.gs` khai. Hai sheet kho không liệt kê cột ở đây:
 * cột của chúng suy ra từ `DATA_SCHEMA`, nên mã cột vẫn chỉ có đúng một chỗ. Chỉ `Category`, `Config` và `Log` liệt kê thẳng,
 * vì mã của chúng không thuộc thực thể nào nên không có schema nào sở hữu — bảng dưới đây chính là bản gốc duy nhất của chúng.
 *
 * Tám cột thuần đồng bộ cố ý không có ở đây. Chúng thuộc `fbm_sync`, và chính module đó dựng chúng. Lõi không đọc `SYNC_SCHEMA`
 * theo tài liệu 03 Phần 1, nên lõi cũng không được biết tám cột đó tên gì.
 */

/** Số hàng tiêu đề mặc định và hàng dữ liệu đầu tiên. `Log` là ngoại lệ duy nhất, khai riêng bên dưới. */
var SHEET_HEADER_ROWS = 3;
var SHEET_FIRST_DATA_ROW = 4;

/**
 * Danh mục của sheet `Category`, theo tài liệu 02 Phần 9. Bốn danh mục có cột đi kèm hậu tố `_FBM` là bốn danh mục
 * thực sự đồng bộ với FBM; sự tồn tại của cột đi kèm chính là câu trả lời cho "danh mục nào tham gia đồng bộ",
 * nên không có bảng khai thứ hai nào cho việc đó.
 */
var CATEGORY_COLUMNS = [
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
];

/** Hậu tố của cột đi kèm cho danh mục đồng bộ. Tài liệu 02 Phần 9. */
var CATEGORY_FBM_SUFFIX = '_FBM';

/**
 * Năm khối của sheet `Config`, theo tài liệu 02 Phần 10. Mỗi khối là một cặp cột đứng cạnh nhau, dữ liệu mỗi khối
 * chạy dọc độc lập nên các khối dài ngắn khác nhau không sao.
 */
var CONFIG_COLUMNS = [
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
];

/** Chín cột của sheet `Log`, theo tài liệu 10 Phần 2. Không mã `@`, một hàng tiêu đề, dữ liệu từ hàng 2. */
var LOG_HEADERS = ['Lúc', 'Nguồn', 'Việc', 'Kết quả', 'Thực thể', 'Mã bản ghi', 'Lý do', 'Kỳ', 'Chi tiết kỹ thuật'];

/**
 * Bảng hình dáng của cả năm sheet. `entity` nghĩa là cột suy ra từ `DATA_SCHEMA`; `columns` nghĩa là cột khai thẳng ở tệp này.
 * Một sheet chỉ được có một trong hai, không được có cả hai.
 */
var SHEET_LAYOUT = {
  Customer: { entity: 'customer', headerRows: SHEET_HEADER_ROWS, firstDataRow: SHEET_FIRST_DATA_ROW, headerColor: '#d9e2f3' },
  Activity: { entity: 'activity', headerRows: SHEET_HEADER_ROWS, firstDataRow: SHEET_FIRST_DATA_ROW, headerColor: '#d9e2f3' },
  Category: { columns: CATEGORY_COLUMNS, headerRows: SHEET_HEADER_ROWS, firstDataRow: SHEET_FIRST_DATA_ROW, headerColor: '#e2efd9' },
  Config: { columns: CONFIG_COLUMNS, headerRows: SHEET_HEADER_ROWS, firstDataRow: SHEET_FIRST_DATA_ROW, headerColor: '#fff2cc' },
  Log: { plainHeaders: LOG_HEADERS, headerRows: 1, firstDataRow: 2, headerColor: '#fce4d6' }
};

/**
 * Trả về danh sách `[mã cột, nhãn]` theo thứ tự bày ra trên sheet, cho phần cột mà **lõi** sở hữu.
 *
 * Sheet kho trả về cột suy từ `DATA_SCHEMA` và cố ý KHÔNG gồm tám cột thuần đồng bộ. Nên đừng dùng hàm này để kết luận
 * "sheet chỉ có đúng những cột này" — trên sheet thật còn có cột của `fbm_sync` và cột riêng của người dùng.
 */
function sheetCoreColumns(sheetName) {
  var layout = SHEET_LAYOUT[sheetName];
  if (!layout) {
    throw new Error('Không có khai hình dáng cho sheet "' + sheetName + '" trong SHEET_LAYOUT.');
  }

  if (layout.plainHeaders) {
    return layout.plainHeaders.map(function (header) { return [header, header]; });
  }

  if (layout.columns) {
    return layout.columns;
  }

  var fields = DATA_SCHEMA[layout.entity];
  if (!fields) {
    throw new Error('Sheet "' + sheetName + '" khai entity "' + layout.entity + '" nhưng DATA_SCHEMA không có thực thể đó.');
  }

  return Object.keys(fields).map(function (fieldName) {
    return [fields[fieldName].code, fields[fieldName].label];
  });
}
