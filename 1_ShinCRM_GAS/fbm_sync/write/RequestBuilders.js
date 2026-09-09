/** Builder payload theo từng entity; không gửi request xóa. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Ghép memvars; field không có trong bản ghi sửa phải giữ giá trị FBM cũ. */
FbmSync.memvars = function (names, values, oldValues) {
  return names.map(function (name) {
    var hasNew = values && Object.prototype.hasOwnProperty.call(values, name);
    var hasOld = oldValues && Object.prototype.hasOwnProperty.call(oldValues, name);
    return { Name: name, OldValue: hasOld ? oldValues[name] : null, NewValue: hasNew ? values[name] : (hasOld ? oldValues[name] : '') };
  });
};

/** Lấy giá trị theo tên FBM, ưu tiên field người dùng đã gửi rồi mới tới OldValue. */
FbmSync.fieldValue = function (record, oldValues, name, aliases, fallback) {
  var keys = [name].concat(aliases || []);
  for (var i = 0; i < keys.length; i++) {
    if (record && Object.prototype.hasOwnProperty.call(record, keys[i])) { return record[keys[i]]; }
  }
  if (oldValues && Object.prototype.hasOwnProperty.call(oldValues, name)) { return oldValues[name]; }
  return fallback;
};

/** Đổi giá trị SELECT của ShinCRM thành mã FBM từ companion Category. */
FbmSync.categoryField = function (categoryGate, source, value) {
  return FbmSync.categoryCode(categoryGate || { map: {} }, source, value);
};
/** Tạo form envelope chung cho Customer/Activity. */
FbmSync.formEnvelope = function (entity, action, values, memvars) {
  var cfg = FbmSync.scriptSettings();
  var controller = FbmSync.CONTROLLERS[entity];
  return {
    type: 1, parentType: 'Dir', firstView: false, searchMode: false, viewPage: true,
    authorized: entity === 'customer' ? cfg.customerAuthorized : cfg.activityAuthorized, action: action, actionID: null,
    values: values || [], vars: entity === 'customer' ? [{ Name: 'recordID', Type: 'String', Value: '' }, { Name: 'viewPageMode', Type: 'Boolean' }, { Name: 'viewParentController', Type: 'String', Value: '' }] : [{ Name: 'recordID', Type: 'String', Value: '' }, { Name: 'viewPageMode', Type: 'Boolean', Value: false }],
    memvars: memvars || [], language: 'v', controller: controller, viewId: null, gridController: controller, gridViewId: null, cookie: cfg.cookie
  };
};
/** Bootstrap token cho controller bằng viewPage:false. */
FbmSync.authorizeRequest = function (entity) {
  // FBM only returns a fresh token for viewPage:false + authorized:null.
  var cfg = FbmSync.scriptSettings();
  var controller = FbmSync.CONTROLLERS[entity];
  return {
    url: cfg.baseUrl + FbmSync.ENDPOINTS.dir,
    body: {
      type: 0, parentType: 'Dir', firstView: false, searchMode: false, viewPage: false,
      authorized: null, action: 'New', actionID: null, values: [], vars: FbmSync.AUTH_VARS[entity], memvars: [],
      language: 'v', controller: controller, viewId: null, gridController: controller, gridViewId: null, cookie: cfg.cookie
    },
    meta: { kind: 'authorize', entity: entity }
  };
};
/** Chuẩn hóa field Activity và tạo memvars cho New/Edit. */
FbmSync.activityValues = function (record, oldValues, categoryGate) {
  var now = new Date();
  var date = function (value) { return value instanceof Date ? '/Date(' + value.getTime() + ')/' : (value || '/Date(' + now.getTime() + ')/'); };
  var value = function (name, aliases, fallback) { return FbmSync.fieldValue(record, oldValues, name, aliases, fallback); };
  var details = value('details', ['content'], '');
  var localId = value('shinId', ['id'], '');
  if (details && localId && !FbmSync.stripActivityMarker(details).match(FbmSync.ACTIVITY_MARKER_RE)) { details = FbmSync.stripActivityMarker(details) + ' #SC-' + String(localId); }
  var values = {
    id: Number(value('id', [], 0)) || 0, event_yn: value('event_yn', [], 0), text: value('text', [], ''), ma_cv: FbmSync.categoryField(categoryGate, '@CAT_CONG_VIEC', value('ma_cv', ['taskType'], '')), assigned_name: value('assigned_name', [], ''), muc_do: value('muc_do', [], '2'),
    start_date: date(value('start_date', ['workDate'], '')), start_time: value('start_time', [], '00:00'), end_date: date(value('end_date', ['workDate'], '')), end_time: value('end_time', [], '01:00'), ngay_nhac: value('ngay_nhac', [], null), gio_nhac: value('gio_nhac', [], '00:00'), full_day: value('full_day', [], false),
    details: details, private: value('private', [], false), share_user: value('share_user', [], ''), share_group: value('share_group', [], 0), ma_nhom: value('ma_nhom', [], ''), owner: value('owner', [], FbmSync.configValue('FBM_ACCOUNT_NAME')), comment: value('comment', [], null), nguoi_sua: value('nguoi_sua', [], ''), datetime0: date(value('datetime0', [], now)), status: value('status', [], '2'), gia_bao: value('gia_bao', [], 0), gia_dt: value('gia_dt', [], 0), ma_dt: value('ma_dt', [], ''), nd_chinh_sua: value('nd_chinh_sua', [], ''), ma_sp: value('ma_sp', [], ''), ma_module: value('ma_module', [], ''), ma_kh: value('ma_kh', ['customerFbmCode'], ''), stt_rec: value('stt_rec', [], ''), type: value('type', [], '1'), user_ref: value('user_ref', [], ''), fileupload: value('fileupload', [], ''), fileticket: value('fileticket', [], ''), filekey: value('filekey', [], '')
  };
  return { values: values, memvars: FbmSync.memvars(FbmSync.ACTIVITY_MEMVARS, values, oldValues) };
};
/** Tạo request New Activity. */
FbmSync.activityCreateRequest = function (record, categoryGate) { var form = FbmSync.activityValues(record, null, categoryGate); return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('activity', 'New', [], form.memvars), meta: { kind: 'activity_create', shinId: String(FbmSync.value(record, 'shinId', FbmSync.value(record, 'id', ''))) } }; };
/** Mở form Activity để lấy OldValue trước khi sửa. */
FbmSync.activityEditOpenRequest = function (id) { return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('activity', 'Edit', [String(id)], []), meta: { kind: 'activity_edit_open', id: String(id) } }; };
/** Tạo request lưu Activity sau bước mở form. */
FbmSync.activityEditRequest = function (record, oldValues, categoryGate) { var form = FbmSync.activityValues(record, oldValues, categoryGate); return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('activity', 'Edit', [String(FbmSync.value(record, 'fbmId', FbmSync.value(record, 'id', 0)))], form.memvars), meta: { kind: 'activity_edit_save', id: String(FbmSync.value(record, 'fbmId', FbmSync.value(record, 'id', 0))) } }; };

/** Bước bootstrap riêng của luồng tạo Customer hai bước. */
FbmSync.customerCreateAuthorizeRequest = function () { return FbmSync.authorizeRequest('customer'); };
/** Chuẩn hóa field Customer và tạo memvars cho New/Edit. */
FbmSync.customerValues = function (record, oldValues, categoryGate) {
  var value = function (name, aliases, fallback) { return FbmSync.fieldValue(record, oldValues, name, aliases, fallback); };
  var values = { stt_rec_kh: value('stt_rec_kh', ['fbmId'], ''), stt_rec_kh0: value('stt_rec_kh0', [], ''), user_ref: value('user_ref', [], ''), ma_kh: value('ma_kh', ['fbmCustomerCode'], ''), ten_kh: value('ten_kh', ['companyName'], ''), kh_me: value('kh_me', [], ''), ngay_tl: value('ngay_tl', [], null), ma_so_thue: value('ma_so_thue', ['taxNumber'], ''), ong_ba: value('ong_ba', ['contactPerson'], ''), chuc_danh: value('chuc_danh', [], ''), dien_thoai: value('dien_thoai', ['phone'], ''), fax: value('fax', [], ''), email: value('email', [], ''), website: value('website', [], ''), ma_lvkd: FbmSync.categoryField(categoryGate, '@CAT_NGANH_NGHE', value('ma_lvkd', [], '')), qm_ns: value('qm_ns', [], ''), sl_kt: value('sl_kt', [], 0), loai_kh: value('loai_kh', [], ''), nguon_dm: FbmSync.categoryField(categoryGate, '@CAT_NGUON_KH', value('nguon_dm', ['leadSource'], '')), dc_lh: value('dc_lh', ['address'], ''), dc_lh_tinh: FbmSync.categoryField(categoryGate, '@CAT_TINH_THANH', value('dc_lh_tinh', ['province'], '')), dc_lh_quan: value('dc_lh_quan', [], ''), dc_lh_qg: value('dc_lh_qg', [], 'VN'), dc_gh: value('dc_gh', [], ''), nh_kh1: value('nh_kh1', [], ''), nh_kh2: value('nh_kh2', [], ''), nh_kh3: value('nh_kh3', [], ''), ma_cv: value('ma_cv', [], ''), ma_sp: FbmSync.categoryField(categoryGate, '@CAT_SAN_PHAM', value('ma_sp', ['product'], '')), ma_module: value('ma_module', [], ''), ma_tt: value('ma_tt', [], 'CS'), status: value('status', [], '1'), controller: value('controller', [], 'zccrAccount'), parentController: value('parentController', [], ''), nv_kd: value('nv_kd', [], ''), nv_tele: value('nv_tele', [], ''), ngay_gd: value('ngay_gd', [], null), ngay_kh: value('ngay_kh', [], null), datetime0: value('datetime0', [], null), nguoi_sua: value('nguoi_sua', [], ''), nguoi_tim: value('nguoi_tim', [], ''), id: value('id', [], 0), ds_ma_hd: value('ds_ma_hd', [], '') };
  return { values: values, memvars: FbmSync.memvars(FbmSync.CUSTOMER_MEMVARS, values, oldValues) };
};
/** Tạo request lưu Customer mới sau khi có mã tự sinh. */
FbmSync.customerCreateOpenRequest = function () {
  var cfg = FbmSync.scriptSettings();
  return { url: cfg.baseUrl + FbmSync.ENDPOINTS.dir, body: {
    type: 0, parentType: 'Dir', firstView: false, searchMode: false, viewPage: true, authorized: cfg.customerAuthorized,
    action: 'New', actionID: null, values: [], vars: FbmSync.AUTH_VARS.customer, memvars: [], language: 'v',
    controller: FbmSync.CONTROLLERS.customer, viewId: null, gridController: FbmSync.CONTROLLERS.customer, gridViewId: null, cookie: cfg.cookie
  }, meta: { kind: 'customer_create_open' } };
};
FbmSync.customerCreateRequest = function (record, autoCode, sttRec, categoryGate) { var form = FbmSync.customerValues(Object.assign({}, record, { ma_kh: autoCode, stt_rec_kh: sttRec || '' }), null, categoryGate); return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('customer', 'New', [sttRec || ''], form.memvars), meta: { kind: 'customer_create_save', ma_kh: autoCode, stt_rec_kh: sttRec || '' } }; };
/** Mở form Customer để lấy OldValue trước khi sửa. */
FbmSync.customerEditOpenRequest = function (sttRec) { return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('customer', 'Edit', [String(sttRec)], []), meta: { kind: 'customer_edit_open', stt_rec_kh: String(sttRec) } }; };
/** Tạo request lưu Customer đã sửa. */
FbmSync.customerEditRequest = function (record, oldValues, categoryGate) { var id = FbmSync.value(record, 'fbmId', FbmSync.value(record, 'stt_rec_kh', '')); var form = FbmSync.customerValues(record, oldValues, categoryGate); return { url: FbmSync.scriptSettings().baseUrl + FbmSync.ENDPOINTS.dir, body: FbmSync.formEnvelope('customer', 'Edit', [String(id)], form.memvars), meta: { kind: 'customer_edit_save', stt_rec_kh: String(id) } }; };
