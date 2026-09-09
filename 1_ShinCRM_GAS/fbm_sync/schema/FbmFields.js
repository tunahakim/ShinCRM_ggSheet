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
  pending: 'chờ đối soát', pushing: 'đang đẩy', pushed: 'đã đẩy chờ xác nhận', synced: 'đã đồng bộ',
  conflict: 'xung đột chờ quyết', error: 'đẩy lỗi', skipped: 'không đủ điều kiện đẩy',
  missing: 'không thấy bên FBM', unknownCategory: 'mã danh mục lạ', notApplied: 'không đủ điều kiện đẩy'
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

FbmSync.FIELD_ALIASES = {
  customer: { id: 'ma_kh', companyName: 'ten_kh', taxNumber: 'ma_so_thue', phone: 'dien_thoai', email: 'email', address: 'dc_lh', province: 'dc_lh_tinh', website: 'website', contactPerson: 'ong_ba', leadSource: 'nguon_dm' },
  activity: { id: 'id', customerId: 'ma_kh', workDate: 'end_date', taskType: 'ma_cv', content: 'details', createdAt: 'datetime0' }
};

/* Chỉ fingerprint field nghiệp vụ; alias hiển thị không tham gia. */
FbmSync.FINGERPRINT_FIELDS = {
  customer: ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dien_thoai', 'email', 'website', 'dc_lh', 'dc_lh_tinh', 'nguon_dm'],
  activity: ['id', 'ma_kh', 'stt_rec', 'ma_cv', 'details', 'end_date']
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

/** Đọc tham số FBM an toàn; thiếu Config thì chiều đọc vẫn hoạt động, chiều ghi tự chặn. */
FbmSync.configValue = function (name) {
  try {
    var value = typeof configGet === 'function' ? configGet(name, '') : '';
    if (value !== undefined && value !== null && String(value).trim()) { return String(value).trim(); }
    if (typeof PropertiesService !== 'undefined' && PropertiesService.getScriptProperties) { return String(PropertiesService.getScriptProperties().getProperty(name) || '').trim(); }
    return '';
  } catch (ignore) { return ''; }
};
