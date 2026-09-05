/**
 * Bảng khai trường của hai thực thể dữ liệu, theo từ điển trường ở tài liệu 03 Phần 3 và Phần 4. Đây là **bản gốc duy nhất**:
 * mã cột `@` chỉ xuất hiện ở đây, và mọi chỗ khác trong hệ thống gọi tên trường chứ không viết lại mã cột.
 *
 * Tệp này chỉ có dữ liệu, không có một dòng logic nào. Nó được phép dài — chẻ một bảng khai ra nhiều tệp là mở đường cho
 * hai nửa lệch nhau trong im lặng. Phép kiểm tính hợp lệ của chính bảng này nằm ở `SchemaCheck.gs`.
 *
 * Thứ tự trường ở đây là thứ tự cột bày ra trên sheet. Code không bao giờ đọc theo thứ tự này — mọi phép đọc đi qua bảng tra
 * mã → chỉ số cột do `SheetIo.gs` dựng từ hàng 1 của sheet thật.
 *
 * TÁM CỘT THUẦN ĐỒNG BỘ CỐ Ý KHÔNG CÓ Ở ĐÂY, kể cả để hiện lên form. Chúng khai ở `SyncSchema.gs`. Lý do ở tài liệu 02 Phần 8.1
 * và tài liệu 03 Phần 3: cơ chế duy nhất giữ lõi khỏi ghi đè nhóm cột đó là lõi chỉ được truyền `DATA_SCHEMA` vào cửa ghi,
 * nên đưa một cột đồng bộ vào đây là mỗi lần bấm Lưu lại xóa trắng một cột mà lõi không có giá trị để điền.
 */

var DATA_SCHEMA = {

  customer: {
    id: { code: '@CUS_MA_KH', type: 'TEXT', label: 'Mã khách', readonly: true, searchable: true, default: 'nextCustomerCode' },
    companyName: { code: '@CUS_TEN_CTY', type: 'TEXT', label: 'Tên công ty', required: true, searchable: true },
    taxNumber: { code: '@CUS_MST', type: 'TEXT', label: 'Mã số thuế', unique: true, searchable: true, normalize: 'codeLike', validate: 'taxNumberFormat' },
    phone: { code: '@CUS_SDT', type: 'TEXT', label: 'Điện thoại', searchable: true, normalize: 'codeLike' },
    email: { code: '@CUS_EMAIL', type: 'TEXT', label: 'Email' },
    address: { code: '@CUS_DIA_CHI', type: 'TEXT', label: 'Địa chỉ' },
    province: { code: '@CUS_TINH_THANH', type: 'SELECT', label: 'Tỉnh thành', source: '@CAT_TINH_THANH' },
    website: { code: '@CUS_WEBSITE', type: 'TEXT', label: 'Website' },
    contactPerson: { code: '@CUS_NGUOI_LIEN_HE', type: 'TEXT', label: 'Người liên hệ', searchable: true },
    parentCompanyName: { code: '@CUS_CONG_TY_ME', type: 'TEXT', label: 'Công ty mẹ' },
    customerGroup: { code: '@CUS_NHOM_KH', type: 'SELECT', label: 'Nhóm khách', source: '@CAT_NHOM_KH' },
    product: { code: '@CUS_SAN_PHAM', type: 'SELECT', label: 'Sản phẩm', source: '@CAT_SAN_PHAM' },
    leadSource: { code: '@CUS_NGUON_KH', type: 'SELECT', label: 'Nguồn khách', source: '@CAT_NGUON_KH', required: true },
    verifyStatus: { code: '@CUS_XAC_THUC', type: 'SELECT', label: 'Xác thực', source: '@CAT_XAC_THUC', required: true },
    bidClosingDate: { code: '@CUS_NGAY_DONG_THAU', type: 'DATE', label: 'Ngày đóng thầu', precision: 'day' },
    note: { code: '@CUS_GHI_CHU', type: 'TEXT', label: 'Ghi chú' },
    searchAliases: { code: '@CUS_TIM_KIEM', type: 'TEXT', label: 'Từ khóa tìm kiếm', searchable: true },
    createdAt: { code: '@CUS_NGAY_NHAP_LIEU', type: 'DATE', label: 'Ngày nhập liệu', precision: 'day', readonly: true, default: 'today' },
    allowFbmPush: { code: '@CUS_CHO_PHEP_FBM', type: 'SELECT', label: 'Cho phép đẩy FBM', source: '@CAT_CHO_PHEP_FBM', required: true },
    recordStatus: { code: '@CUS_TT_BAN_GHI', type: 'SELECT', label: 'Tình trạng bản ghi', readonly: true, options: ['active', 'deleted'] }
  },

  activity: {
    id: { code: '@ACT_MA_GD', type: 'TEXT', label: 'Mã giao dịch', readonly: true, default: 'nextActivityCode' },
    customerId: { code: '@ACT_MA_KH', type: 'TEXT', label: 'Mã khách', readonly: true },
    workDate: { code: '@ACT_NGAY_LAM_VIEC', type: 'DATE', label: 'Ngày làm việc', precision: 'day', required: true, default: 'today' },
    taskType: { code: '@ACT_CONG_VIEC', type: 'SELECT', label: 'Công việc', source: '@CAT_CONG_VIEC', required: true },
    content: { code: '@ACT_NOI_DUNG_CV', type: 'TEXT', label: 'Nội dung công việc', required: true, normalize: 'newlineLf' },
    product: { code: '@ACT_SAN_PHAM', type: 'SELECT', label: 'Sản phẩm', source: '@CAT_SAN_PHAM', required: true, default: 'carryForwardProduct' },
    enteredBy: { code: '@ACT_NGUOI_NHAP_LIEU', type: 'SELECT', label: 'Người nhập liệu', source: '@CAT_NGUOI_NHAP_LIEU' },
    contractValue: { code: '@ACT_GIA_TRI_HD', type: 'NUMBER', label: 'Giá trị hợp đồng' },
    priority: { code: '@ACT_UU_TIEN', type: 'SELECT', label: 'Ưu tiên', source: '@CAT_UU_TIEN', default: 'carryForwardPriority' },
    dueAt: { code: '@ACT_HAN_XU_LY', type: 'DATE', label: 'Hạn xử lý', precision: 'minute', default: 'carryForwardDueAt' },
    createdAt: { code: '@ACT_NGAY_NHAP_LIEU', type: 'DATE', label: 'Ngày nhập liệu', precision: 'minute', readonly: true, default: 'now' },
    allowFbmPush: { code: '@ACT_CHO_PHEP_FBM', type: 'SELECT', label: 'Cho phép đẩy FBM', source: '@CAT_CHO_PHEP_FBM', required: true },
    recordStatus: { code: '@ACT_TT_BAN_GHI', type: 'SELECT', label: 'Tình trạng bản ghi', readonly: true, options: ['active', 'deleted'] }
  }

};

/** Bốn kiểu dữ liệu, không có kiểu thứ năm. Tài liệu 02 Phần 2.1. */
var DATA_TYPES = ['TEXT', 'NUMBER', 'DATE', 'SELECT'];

/** Hai độ chi tiết của mốc thời gian. Tài liệu 03 Phần 2, thuộc tính `precision`. */
var DATE_PRECISIONS = ['day', 'minute'];

/** Tên sheet chứa dữ liệu của từng thực thể. Tách khỏi bảng trường vì đây là chuyện chỗ để, không phải chuyện trường. */
var ENTITY_SHEETS = { customer: 'Customer', activity: 'Activity' };
