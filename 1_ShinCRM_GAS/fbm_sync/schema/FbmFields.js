/** Tên field/API và hằng số sync; file này không truy cập Sheet. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.VERSION = '1.0.0';
FbmSync.CONTROLLERS = { customer: 'zccrAccount', activity: 'zccrAccountTask' };
FbmSync.ENDPOINTS = {
  grid: '/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage',
  dir: '/AppService/FastBusiness.ReportExtenderService.asmx/GetDirViewPage',
  completion: '/FastBusiness.DataService.asmx/GetCompletionList'
};
FbmSync.PHASES = ['idle', 'checking_session', 'pull_customer', 'pull_activity', 'reconcile', 'push', 'paused', 'conflict', 'error', 'done'];
FbmSync.SYNC_STATUS = {
  notPushed: 'chưa đẩy', pending: 'chờ đối soát', pushing: 'đang đẩy', pushed: 'đã đẩy chờ xác nhận', synced: 'đã đồng bộ',
  missing: 'không thấy bên FBM', conflict: 'xung đột chờ quyết', error: 'đẩy lỗi', notApplied: 'đẩy không ăn',
  skipped: 'không đủ điều kiện đẩy', unknownCategory: 'mã danh mục lạ'
};

FbmSync.GRID_FIELDS = {
  customer: ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'ten_tt', 'website', 'ten_lv', 'ten_qmo', 'ten_dclh_tinh', 'ten_loai', 'nh_kh1', 'nh_kh2', 'nh_kh3', 'ten_cv', 'ten_nguon_dm', 'nv_tele', 'nv_kd', 'ten_sp', 'ten_module', 'ngay_gd', 'ngay_kh', 'datetime0', 'nguoi_sua', 'xorder'],
  activity: ['id', 'ten_loai', 'ten_cv', 'details', 'start_date', 'end_date', 'ten_tt', 'owner', 'nguoi_sua', 'datetime0', 'line_nbr']
};

FbmSync.CUSTOMER_MEMVARS = [
  'stt_rec_kh', 'stt_rec_kh0', 'user_ref', 'ma_kh', 'ten_kh', 'kh_me', 'ngay_tl', 'ma_so_thue', 'ong_ba', 'chuc_danh',
  'dien_thoai', 'fax', 'email', 'website', 'ma_lvkd', 'qm_ns', 'sl_kt', 'loai_kh', 'nguon_dm', 'dc_lh', 'dc_lh_tinh',
  'dc_lh_quan', 'dc_lh_qg', 'dc_gh', 'nh_kh1', 'nh_kh2', 'nh_kh3', 'ma_cv', 'ma_sp', 'ma_module', 'ma_tt',
  'status', 'controller', 'parentController', 'nv_kd', 'nv_tele', 'ngay_gd', 'ngay_kh', 'datetime0', 'nguoi_sua', 'nguoi_tim', 'id', 'ds_ma_hd'
];
FbmSync.ACTIVITY_MEMVARS = [
  'id', 'event_yn', 'text', 'ma_cv', 'assigned_name', 'muc_do', 'start_date', 'start_time', 'end_date', 'end_time',
  'ngay_nhac', 'gio_nhac', 'full_day', 'details', 'private', 'share_user', 'share_group', 'ma_nhom', 'owner', 'comment',
  'nguoi_sua', 'datetime0', 'status', 'gia_bao', 'gia_dt', 'ma_dt', 'nd_chinh_sua', 'ma_sp', 'ma_module', 'ma_kh',
  'stt_rec', 'type', 'user_ref', 'fileupload', 'fileticket', 'filekey'
];

// Row form dùng cho OldValue; ô trống trong bảng là field chỉ hiển thị hoặc chưa dùng.
FbmSync.CUSTOMER_FORM_ROW_FIELDS = [];
FbmSync.CUSTOMER_FORM_ROW_FIELDS[0] = 'stt_rec_kh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[1] = 'stt_rec_kh0'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[2] = 'user_ref'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[3] = 'ma_kh';
FbmSync.CUSTOMER_FORM_ROW_FIELDS[4] = 'ten_kh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[5] = 'kh_me'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[7] = 'ngay_tl'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[8] = 'ma_so_thue'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[9] = 'ong_ba'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[10] = 'chuc_danh';
FbmSync.CUSTOMER_FORM_ROW_FIELDS[11] = 'dien_thoai'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[12] = 'fax'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[13] = 'email'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[14] = 'website'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[15] = 'ma_lvkd'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[17] = 'qm_ns'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[19] = 'sl_kt'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[20] = 'loai_kh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[22] = 'nguon_dm';
FbmSync.CUSTOMER_FORM_ROW_FIELDS[24] = 'dc_lh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[25] = 'dc_lh_tinh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[27] = 'dc_lh_quan'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[29] = 'dc_lh_qg'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[31] = 'dc_gh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[32] = 'nh_kh1'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[33] = 'nh_kh2'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[34] = 'nh_kh3'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[35] = 'ma_sp'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[37] = 'ma_module'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[38] = 'ma_cv'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[44] = 'ghi_chu'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[45] = 'ma_tt'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[47] = 'status'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[54] = 'nv_kd'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[55] = 'nv_tele'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[56] = 'ngay_gd'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[57] = 'ngay_kh'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[58] = 'datetime0'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[59] = 'nguoi_sua'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[60] = 'nguoi_tim'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[62] = 'id'; FbmSync.CUSTOMER_FORM_ROW_FIELDS[63] = 'ds_ma_hd';
FbmSync.ACTIVITY_FORM_ROW_FIELDS = [];
FbmSync.ACTIVITY_FORM_ROW_FIELDS[0] = 'id'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[1] = 'event_yn'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[2] = 'text'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[3] = 'ma_cv'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[5] = 'assigned_name'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[7] = 'muc_do'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[8] = 'start_date'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[9] = 'start_time'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[10] = 'end_date'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[11] = 'end_time'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[12] = 'ngay_nhac'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[13] = 'gio_nhac'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[14] = 'full_day'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[15] = 'details'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[16] = 'private'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[17] = 'share_user'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[18] = 'share_group'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[19] = 'ma_nhom'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[21] = 'owner'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[22] = 'comment'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[23] = 'nguoi_sua'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[24] = 'datetime0'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[25] = 'status'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[26] = 'gia_bao'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[27] = 'gia_dt'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[28] = 'ma_dt'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[29] = 'nd_chinh_sua'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[30] = 'ma_sp'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[31] = 'ma_module'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[37] = 'stt_rec'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[38] = 'type'; FbmSync.ACTIVITY_FORM_ROW_FIELDS[39] = 'user_ref';

FbmSync.FIELD_ALIASES = {
  customer: { id: 'ma_kh', companyName: 'ten_kh', taxNumber: 'ma_so_thue', phone: 'dien_thoai', email: 'email', address: 'dc_lh', province: 'dc_lh_tinh', website: 'website', contactPerson: 'ong_ba', leadSource: 'nguon_dm', product: 'ma_sp' },
  activity: { id: 'id', customerId: 'ma_kh', workDate: 'end_date', taskType: 'ma_cv', content: 'details', createdAt: 'datetime0' }
};

/* Chỉ fingerprint field nghiệp vụ; alias hiển thị không tham gia. */
FbmSync.FINGERPRINT_FIELDS = {
  // stt_rec_kh/ma_kh là định danh FBM riêng, không được biến thành thay đổi nội dung ShinCRM.
  customer: ['ten_kh', 'ma_so_thue', 'ong_ba', 'dien_thoai', 'email', 'website', 'dc_lh', 'dc_lh_tinh', 'nguon_dm', 'ma_sp'],
  // Quan hệ với Customer là khóa nối, không phải nội dung của Activity.
  activity: ['id', 'ma_cv', 'details', 'end_date']
};

FbmSync.AUTH_VARS = {
  customer: [
    { Name: 'recordID', Type: 'String', Value: '' },
    { Name: 'viewPageMode', Type: 'Boolean' },
    { Name: 'viewParentController', Type: 'String', Value: '' }
  ],
  activity: [
    { Name: 'recordID', Type: 'String', Value: '' },
    { Name: 'viewPageMode', Type: 'Boolean', Value: false }
  ]
};

/* Controller lookup là tên API; mã trả về được giữ trong state phiên. */
FbmSync.SYNC_LOOKUPS = [
  { key: '@CAT_TINH_THANH', controller: 'crProvinceCity' },
  { key: '@CAT_NGUON_KH', controller: 'crLeadSource' },
  { key: '@CAT_CONG_VIEC', controller: 'crJob' },
  { key: '@CAT_SAN_PHAM', controller: 'crdmsp' }
];

FbmSync.PUSH_ALLOW_VALUE = 'Cho phép';
FbmSync.PUSH_STOP_VALUE = 'Ngừng đồng bộ';
FbmSync.ACTIVITY_MARKER_RE = /\s+#SC-([A-Za-z0-9_-]+)\s*$/;

/** Đọc field an toàn, phân biệt null/undefined với giá trị 0 hoặc false. */
FbmSync.value = function (record, key, fallback) {
  return record && record[key] !== undefined && record[key] !== null ? record[key] : (fallback === undefined ? '' : fallback);
};

/** Mã tạm TMP- đứng ngoài mọi kỳ quét để không bị đẩy nhầm lên FBM. */
FbmSync.isTemporaryRecord = function (entity, record) {
  var keys = entity === 'customer' ? ['id', 'fbmCustomerCode', 'fbmId', 'stt_rec_kh', 'ma_kh'] : ['id', 'fbmId', 'customerFbmCode'];
  return keys.some(function (key) { return /^TMP-/i.test(String(FbmSync.value(record, key, '')).trim()); });
};

/** Đọc tham số FBM an toàn; thiếu Config thì chiều đọc vẫn hoạt động, chiều ghi tự chặn. */
FbmSync.configValue = function (name) {
  try {
    var value = typeof configGet === 'function' ? configGet(name, '') : '';
    if (value !== undefined && value !== null && String(value).trim()) { return String(value).trim(); }
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) { return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim(); }
    return '';
  } catch (ignore) { return ''; }
};
