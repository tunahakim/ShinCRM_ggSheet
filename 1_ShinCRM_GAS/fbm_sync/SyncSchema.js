/**
 * Bảng khai tám cột thuần đồng bộ của module `fbm_sync`, theo tài liệu 02 Phần 8.1 và tài liệu 03A.
 *
 * Tệp này nằm ngoài lõi có chủ ý. Cơ chế duy nhất giữ lõi khỏi ghi đè tám cột này là **lõi chỉ được truyền `DATA_SCHEMA`
 * vào cửa ghi**, và cửa ghi chỉ ghi những cột có khai trong schema mà bên gọi đưa. Nên hễ tám cột này lọt vào `DATA_SCHEMA`
 * là mỗi lần bấm Lưu form lại xóa trắng một cột mà lõi không có giá trị để điền.
 *
 * Chiều phụ thuộc chỉ có một hướng: `fbm_sync` **được** đọc `DATA_SCHEMA`, lõi **không bao giờ** đọc `SYNC_SCHEMA`.
 * Không có cơ chế nào của Apps Script chặn hộ chuyện đó — mọi tệp dùng chung một vùng tên toàn cục — nên nó là kỷ luật,
 * và tài liệu 09 Phần 13 đòi một hàm tự kiểm quét các tệp lõi tìm chuỗi `SYNC_SCHEMA`. Hàm đó thuộc giai đoạn 3.
 *
 * Vì sao dựng bảng này ngay bây giờ, khi giai đoạn 3 còn chưa tới: bộ kiểm khung sheet cần phân biệt "cột đồng bộ hợp lệ"
 * với "cột lạ ai đó chèn vào". Không có bảng này thì tám cột đang có trên sheet bị báo là cột lạ, và một bộ kiểm kêu oan
 * mỗi lần chạy là một bộ kiểm người ta sẽ thôi đọc.
 */

/**
 * Tám cột thuần đồng bộ, năm loại: mã nối, mã hiển thị, dấu vân dữ liệu, tình trạng đẩy, mốc đồng bộ.
 *
 * `Activity` cố ý chỉ có ba: không có mốc đồng bộ vì số dòng lớn gấp nhiều lần và mốc đó suy được từ lần quét,
 * không có mã hiển thị vì đường tra cứu tay bên FBM luôn đi qua hồ sơ khách.
 *
 * Thứ tự ở đây là thứ tự cột bày ra trên sheet, tiếp ngay sau phần cột của lõi.
 */
var SYNC_SCHEMA = {

  customer: {
    fbmId: { code: '@CUS_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmCustomerCode: { code: '@CUS_MA_KH_FBM', type: 'TEXT', label: 'Mã khách FBM' },
    fbmHash: { code: '@CUS_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@CUS_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' },
    syncedAt: { code: '@CUS_SYNC_LUC', type: 'DATE', label: 'Đồng bộ lúc', precision: 'minute' }
  },

  activity: {
    fbmId: { code: '@ACT_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmHash: { code: '@ACT_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@ACT_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' }
  }

};

/**
 * Trả về danh sách `[mã cột, nhãn]` của phần đồng bộ trên một sheet, theo thứ tự bày ra. Sheet không có cột đồng bộ thì trả về mảng rỗng.
 *
 * Nhận tên sheet chứ không nhận tên thực thể, để bên gọi nói cùng một thứ tiếng với `sheetCoreColumns()`.
 */
function syncColumnsForSheet(sheetName) {
  var entity = { Customer: 'customer', Activity: 'activity' }[sheetName];
  if (!entity) { return []; }

  var fields = SYNC_SCHEMA[entity];
  return Object.keys(fields).map(function (fieldName) {
    return [fields[fieldName].code, fields[fieldName].label];
  });
}
