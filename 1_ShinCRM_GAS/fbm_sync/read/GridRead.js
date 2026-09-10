/** Tạo request grid/completion và đổi response FBM thành record ổn định. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc cấu hình runtime; token ưu tiên state của phiên hiện tại. */
FbmSync.scriptSettings = function () {
  var session = {};
  try { session = FbmSync.stateRead().session || {}; } catch (ignore) { session = {}; }
  var cookie = String(session.cookie || '');
  var userId = String(session.userId || '');
  if (!userId && cookie.indexOf('FHN_CRM_App') >= 0) {
    var compact = cookie.slice(0, cookie.indexOf('FHN_CRM_App'));
    userId = compact.length > 9 ? compact.slice(4, -5) : '';
  }
  // Keep live reads narrow by default; set the property to an empty value for a full scan.
  var testProps = PropertiesService.getDocumentProperties ? PropertiesService.getDocumentProperties() : { getProperty: function () { return null; } };
  var testCustomerCode = testProps.getProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  testCustomerCode = testCustomerCode === null ? 'ALT00010' : String(testCustomerCode || '').trim();
  return {
    baseUrl: 'https://fbo.com.vn:8888',
    cookie: cookie,
    customerAuthorized: String(session.customerAuthorized || ''),
    activityAuthorized: String(session.activityAuthorized || ''),
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
/** Dựng request bulk Activity theo mốc thời gian; không gắn một Customer cụ thể. */
FbmSync.activityBulkRequest = function (options) {
  var opt = Object.assign({}, options || {}), keys = Array.isArray(opt.externalKey) ? opt.externalKey.slice() : [], since = '';
  try { since = String(FbmSync.scriptSettings().activitySince || '').trim(); } catch (ignore) { since = ''; }
  if (since && !opt.includeHistory) { keys.push({ Name: 'end_date', Opr: '>=', Value: since, Type: 'Date', Ignore: false }); }
  delete opt.includeHistory;
  opt.externalKey = keys;
  var request = FbmSync.gridRequest('activity', opt);
  request.meta.kind = 'activity_bulk_grid';
  request.meta.scan = 'bulk_activity';
  return request;
};
/** Trả ID local vắng khỏi bulk FBM; tombstone và dòng tạm không bị chạm. */
FbmSync.activityBulkMissing = function (localRecords, seenFbmIds) {
  var seen = seenFbmIds || {}, missing = [];
  (localRecords || []).forEach(function (record) {
    var id = String(record && record.fbmId || '').trim();
    if (!id || seen[id] || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('activity', record)) { return; }
    missing.push({ id: record.id, fbmId: id, syncStatus: FbmSync.SYNC_STATUS.missing });
  });
  return missing;
};

/** Chuẩn hóa ngày Activity để lập kế hoạch quét bù Customer. */
FbmSync.activityDateKey = function (value) {
  var date = typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value;
  if (date instanceof Date && !isNaN(date.getTime())) {
    if (typeof Utilities !== 'undefined' && typeof Session !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }
    return date.getUTCFullYear() + '-' + ('0' + (date.getUTCMonth() + 1)).slice(-2) + '-' + ('0' + date.getUTCDate()).slice(-2);
  }
  var text = String(date || '').trim();
  var match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2) : '';
};

/** Tìm mốc Activity local mới nhất; không có mốc thì bỏ qua lượt quét bù. */
FbmSync.activityLocalMaxDate = function () {
  var latest = '';
  if (typeof FbmSync.readLocal !== 'function') { return latest; }
  (FbmSync.readLocal('activity') || []).forEach(function (record) {
    var key = FbmSync.activityDateKey(record && record.workDate);
    if (key && key > latest) { latest = key; }
  });
  return latest;
};

/** Lớp 2: tìm Customer có ngày giao dịch mới hơn Activity local mới nhất. */
FbmSync.activityCatchupCustomerRequest = function () {
  var maxDate = FbmSync.activityLocalMaxDate();
  if (!maxDate) { return null; }
  var request = FbmSync.customerGridRequest({
    type: 0, count: 30, gridPageIndex: -1, gridRefresh: false,
    externalKey: [{ Name: 'ngay_gd', Opr: '>', Value: maxDate, Type: 'Date', Ignore: false }]
  });
  request.meta.kind = 'activity_catchup_customer_grid';
  request.meta.activityMaxDate = maxDate;
  return request;
};

/** Đọc cursor xoay Customer từ DocumentProperties, không giữ trong Extension. */
FbmSync.activityRotationCursor = function () {
  var props = PropertiesService.getDocumentProperties(), raw = props.getProperty('FBM_SYNC_ACTIVITY_ROTATION');
  if (!raw) { return { pageIndex: -1, pageValue: null }; }
  try {
    var parsed = JSON.parse(raw);
    return { pageIndex: Number(parsed.pageIndex || -1), pageValue: parsed.pageValue || null };
  } catch (ignore) { return { pageIndex: -1, pageValue: null }; }
};

/** Lớp 3: lấy một trang 30 Customer theo cursor xoay đã lưu. */
FbmSync.activityRotationCustomerRequest = function () {
  var cursor = FbmSync.activityRotationCursor(), request = FbmSync.customerGridRequest({
    type: cursor.pageIndex < 0 ? 0 : 1, count: 30, gridPageIndex: cursor.pageIndex,
    gridPageValue: cursor.pageValue, gridRefresh: false
  });
  request.meta.kind = 'activity_rotation_customer_grid';
  return request;
};

/** Lưu vị trí trang xoay tiếp theo; hết danh sách thì quay lại trang đầu. */
FbmSync.activityRotationSave = function (rows) {
  var props = PropertiesService.getDocumentProperties(), list = rows || [];
  if (!list.length || list.length < 30) { props.setProperty('FBM_SYNC_ACTIVITY_ROTATION', JSON.stringify({ pageIndex: -1, pageValue: null })); return; }
  var last = list[list.length - 1], pageIndex = FbmSync.activityRotationCursor().pageIndex;
  props.setProperty('FBM_SYNC_ACTIVITY_ROTATION', JSON.stringify({
    pageIndex: Number(pageIndex < 0 ? 0 : pageIndex + 1),
    pageValue: [last.ngay_gd || '', last.datetime0 || '', last.xorder || '']
  }));
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
/** Kiểm metadata đủ để ghép rows; thiếu AliasName thì dừng thay vì đoán theo index. */
FbmSync.validateGridFields = function (entity, fields) {
  var required = entity === 'customer' ? ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ngay_gd', 'datetime0', 'xorder'] : ['id', 'ten_cv', 'details', 'end_date', 'owner', 'datetime0', 'line_nbr'];
  var seen = {};
  (fields || []).forEach(function (field) { if (seen[field]) { throw new Error('FBM trả AliasName trùng: ' + field); } seen[field] = true; });
  var missing = required.filter(function (field) { return !seen[field]; });
  if (missing.length) { throw new Error('FBM thiếu metadata AliasName: ' + missing.join(', ')); }
  return true;
};
/** Ghép từng ô theo AliasName và chuẩn hóa ngày trước khi reconcile. */
FbmSync.rowsToRecords = function (entity, response, knownFields) {
  var grid = FbmSync.gridRows(response);
  var fields = grid.fields.length ? grid.fields : (knownFields || []);
  FbmSync.validateGridFields(entity, fields);
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
