/** Tạo request grid/completion và đổi response FBM thành record ổn định. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc cấu hình runtime; token ưu tiên state của phiên hiện tại. */
FbmSync.scriptSettings = function () {
  var props = PropertiesService.getScriptProperties();
  var session = {};
  try { session = FbmSync.stateRead().session || {}; } catch (ignore) { session = {}; }
  var cookie = String(props.getProperty('FBM_COOKIE') || session.cookie || '');
  var userId = String(props.getProperty('FBM_USER_ID') || session.userId || '');
  if (!userId && cookie.indexOf('FHN_CRM_App') >= 0) {
    var compact = cookie.slice(0, cookie.indexOf('FHN_CRM_App'));
    userId = compact.length > 9 ? compact.slice(4, -5) : '';
  }
  // Keep live reads narrow by default; set the property to an empty value for a full scan.
  var testCustomerCode = props.getProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  testCustomerCode = testCustomerCode === null ? 'ALT00010' : String(testCustomerCode || '').trim();
  return {
    baseUrl: String(props.getProperty('FBM_BASE_URL') || 'https://fbo.com.vn:8888'),
    cookie: cookie,
    customerAuthorized: String(session.customerAuthorized || props.getProperty('FBM_AUTH_CUSTOMER') || ''),
    activityAuthorized: String(session.activityAuthorized || props.getProperty('FBM_AUTH_ACTIVITY') || ''),
    userId: userId,
    accountName: FbmSync.configValue('FBM_ACCOUNT_NAME'),
    customerPrefix: FbmSync.configValue('FBM_MA_KH_PREFIX'),
    customerCodeLength: FbmSync.configValue('FBM_MA_KH_LENGTH'),
    activitySince: FbmSync.configValue('FBM_ACTIVITY_SINCE'),
    testCustomerCode: testCustomerCode
  };
};
/** Đổi chuỗi /Date(ms)/ của .NET, giữ nguyên giá trị khác. */
FbmSync.fbDate = function (value) {
  if (value === null || value === undefined || value === '') { return ''; }
  var match = String(value).match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  if (match) { return new Date(Number(match[1])); }
  return value;
};
/** Tạo một trang grid; type 0 lấy metadata, type 1 tiếp tục theo cursor. */
FbmSync.gridRequest = function (entity, options) {
  var cfg = FbmSync.scriptSettings();
  var opt = options || {};
  var controller = FbmSync.CONTROLLERS[entity];
  var payload = {
    type: Number(opt.type === undefined ? 0 : opt.type), count: Number(opt.count || (entity === 'customer' ? 2000 : 100)), language: 'v', controller: controller,
    viewId: null, childObject: false, lastPageIndex: opt.lastPageIndex === undefined ? -1 : opt.lastPageIndex,
    firstPageItem: opt.firstPageItem || '', lastPageItem: opt.lastPageItem || '', lastRowCount: Number(opt.lastRowCount || 0), memvars: [],
    externalKey: opt.externalKey || [], gridPageIndex: opt.gridPageIndex === undefined ? -1 : opt.gridPageIndex,
    gridPageValue: opt.gridPageValue === undefined ? null : opt.gridPageValue, gridRefresh: !!opt.gridRefresh, filter: opt.filter || [],
    sortExpression: opt.sortExpression || (entity === 'customer' ? 'ngay_gd desc' : 'end_date desc, datetime0 desc, id, line_nbr'),
    cookie: cfg.cookie, query: null, parameter: null, variable: ''
  };
  if (entity === 'customer' && cfg.userId) {
    payload.externalKey.push({ Name: "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('" + cfg.userId + "')) and 1", Opr: '=', Value: 1, Type: 'String', Ignore: false });
  }
  if (entity === 'customer' && cfg.testCustomerCode) {
    payload.externalKey.push({ Name: 'ma_kh', Opr: '=', Value: cfg.testCustomerCode, Type: 'String', Ignore: false });
  }
  if (entity === 'customer' && payload.type === 0 && cfg.userId) {
    payload.memvars = [{ Name: 'user_id', OldValue: null, NewValue: '' }];
  }
  return { url: cfg.baseUrl + FbmSync.ENDPOINTS.grid, body: payload, meta: { kind: 'grid', entity: entity } };
};
/** Tạo request grid Customer theo cursor hiện tại. */
FbmSync.customerGridRequest = function (options) { return FbmSync.gridRequest('customer', options); };
/** Tạo request Activity luôn gắn với stt_rec của Customer. */
FbmSync.activityGridRequest = function (sttRec, options) {
  var opt = Object.assign({}, options || {}, { externalKey: [{ Name: 'stt_rec', Opr: '=', Value: String(sttRec || ''), Type: 'String', Ignore: false }] });
  return FbmSync.gridRequest('activity', opt);
};
/** Lấy AliasName metadata; fallback tên field để tránh hardcode schema. */
FbmSync.gridFields = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {};
  var data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var fields = data.ViewPage && data.ViewPage.Fields ? data.ViewPage.Fields : (data.Fields || []);
  return fields.map(function (field) { return field.AliasName || field.aliasName || field.Name || field.name || ''; }).filter(Boolean);
};
/** Chuẩn hóa rows/total/fields từ các dạng response FBM. */
FbmSync.gridRows = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {};
  var data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  return { rows: Array.isArray(data.Rows) ? data.Rows : [], total: Number(data.TotalRowCount || data.totalRowCount || 0), fields: FbmSync.gridFields(response) };
};
/** Ghép từng ô theo AliasName và chuẩn hóa ngày trước khi reconcile. */
FbmSync.rowsToRecords = function (entity, response) {
  var grid = FbmSync.gridRows(response);
  var fields = grid.fields.length ? grid.fields : FbmSync.GRID_FIELDS[entity];
  return { entity: entity, total: grid.total, fields: fields, rows: grid.rows.map(function (row) {
    var record = {};
    fields.forEach(function (field, index) { record[field] = FbmSync.fbDate(row[index]); });
    return record;
  }) };
};
/** Request lấy danh mục động; không gửi mã danh mục hardcode. */
FbmSync.completionRequest = function (controller, field) {
  var cfg = FbmSync.scriptSettings();
  return { url: cfg.baseUrl + FbmSync.ENDPOINTS.completion, body: { type: 2, prefixText: '', count: 100, language: 'v', controller: controller, cookie: cfg.cookie, pageItemEnd: '', variable: null, valueField: null, textField: null, dataTable: null, keyFilter: '', keyValid: '1=1', check: false, orderField: null, lookupPageIndex: -1, lookupRefresh: false, filter: [], sortExpression: null, element: null }, meta: { kind: 'completion', field: field } };
};

/** Lấy token authorized do request bootstrap trả về. */
FbmSync.extractAuthorized = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {};
  var data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  return String(data.Authorized || data.authorized || '');
};
