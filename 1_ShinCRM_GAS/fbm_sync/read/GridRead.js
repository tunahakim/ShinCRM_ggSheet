/** Tạo request grid/completion và đổi response FBM thành record ổn định. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc cấu hình runtime; token ưu tiên state của phiên hiện tại. */
FbmSync.scriptSettings = function () {
  var currentState = {}, session = {};
  try { currentState = FbmSync.stateRead() || {}; session = currentState.session || {}; } catch (ignore) { currentState = {}; session = {}; }
  var cookie = String(session.cookie || '');
  var userId = String(session.userId || '');
  if (!userId && cookie.indexOf('FHN_CRM_App') >= 0) {
    var compact = cookie.slice(0, cookie.indexOf('FHN_CRM_App'));
    userId = compact.length > 9 ? compact.slice(4, -5) : '';
  }
  // Keep live reads narrow by default; set the property to an empty value for a full scan.
  var testProps = PropertiesService.getDocumentProperties ? PropertiesService.getDocumentProperties() : { getProperty: function () { return null; } };
  var testCustomerCode = testProps.getProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  var accountName = typeof FbmSync.bindingAccountName === 'function' ? FbmSync.bindingAccountName() : '';
  var accountSettings = typeof FbmSync.accountSettingsRead === 'function' ? FbmSync.accountSettingsRead() : {};
  testCustomerCode = testCustomerCode === null ? 'ALT00010' : String(testCustomerCode || '').trim();
  var activitySince = currentState.runId && currentState.activitySince !== undefined ? currentState.activitySince : accountSettings.activitySince;
  return {
    baseUrl: 'https://fbo.com.vn:8888',
    cookie: cookie,
    customerAuthorized: String(session.customerAuthorized || ''),
    activityAuthorized: String(session.activityAuthorized || ''),
    userId: userId,
    accountName: accountName,
    customerPrefix: String(accountSettings.customerPrefix || ''),
    customerCodeLength: String(accountSettings.customerCodeLength || ''),
    activitySince: String(activitySince || ''),
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
    // Khi GAS chưa có payload cookie, để transport generic của Extension lấy từ trang FBM theo chỉ dẫn envelope.
    cookie: cfg.cookie || '{{FBM_PAYLOAD_COOKIE}}', query: null, parameter: null, variable: ''
  };
  if (entity === 'customer' && cfg.userId) {
    payload.externalKey.push({ Name: "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('" + cfg.userId + "')) and 1", Opr: '=', Value: 1, Type: 'String', Ignore: false });
  }
  if (entity === 'customer' && cfg.testCustomerCode && opt.includeTestCustomer !== false) {
    payload.externalKey.push({ Name: 'ma_kh', Opr: '=', Value: cfg.testCustomerCode, Type: 'String', Ignore: false });
  }
  if (entity === 'customer' && payload.type === 0 && cfg.userId) {
    payload.memvars = [{ Name: 'user_id', OldValue: null, NewValue: '' }];
  }
  return { url: cfg.baseUrl + FbmSync.ENDPOINTS.grid, body: payload, meta: { kind: 'grid', entity: entity } };
};
/** Tạo request grid Customer theo cursor hiện tại. */
FbmSync.customerGridRequest = function (options) { return FbmSync.gridRequest('customer', options); };
/** Request User do GAS cấp để đọc định danh phiên; Extension chỉ chuyển envelope và response thô. */
FbmSync.identityUserRequest = function () {
  var cfg = FbmSync.scriptSettings();
  return {
    url: cfg.baseUrl + FbmSync.ENDPOINTS.grid,
    body: {
      type: 0, count: 10, language: 'v', controller: FbmSync.CONTROLLERS.user, viewId: null, childObject: false,
      lastPageIndex: -1, firstPageItem: '', lastPageItem: '', lastRowCount: 0, memvars: [], externalKey: [],
      gridPageIndex: -1, gridPageValue: null, gridRefresh: false, filter: [], sortExpression: null,
      cookie: cfg.cookie || '{{FBM_PAYLOAD_COOKIE}}', query: null, parameter: null, variable: ''
    },
    meta: { kind: 'identity_user_grid', entity: 'user' }
  };
};
/** Request Customer tối thiểu do GAS cấp để kiểm tra phiên nền; Extension không được tự dựng request này. */
FbmSync.heartbeatCustomerRequest = function () {
  var request = FbmSync.customerGridRequest({ type: 0, count: 1, gridPageIndex: -1, gridPageValue: null, gridRefresh: false, includeTestCustomer: false });
  // Heartbeat chỉ kiểm tra phiên, không lọc dữ liệu theo cấu hình quét/test và không giữ cursor quét.
  request.body.externalKey = [];
  request.body.memvars = [];
  request.body.sortExpression = null;
  request.meta.kind = 'heartbeat';
  request.meta.entity = 'customer';
  return request;
};
/** Request Customer full-scan dùng riêng cho kiểm tra liên kết Spreadsheet/FBM. */
FbmSync.identityCheckCustomerRequest = function (options) {
  var opt = Object.assign({ includeTestCustomer: false, sortExpression: 'stt_rec_kh' }, options || {});
  return FbmSync.customerGridRequest(opt);
};
/** Đổi mốc YYYY-MM-DD sang định dạng filter ngày mà grid FBM nhận. */
FbmSync.activitySinceFilterDate = function (value) {
  var match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) { return ''; }
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) { return ''; }
  return match[3] + '/' + match[2] + '/' + match[1];
};
/** Gắn bộ lọc mốc Activity vào mọi request đọc grid, trừ request chủ động lấy lịch sử. */
FbmSync.activitySinceFilters = function (options) {
  var opt = options || {}, filters = Array.isArray(opt.filter) ? opt.filter.slice() : [], cfg = FbmSync.scriptSettings();
  var since = String(cfg.activitySince || '').trim(), filterDate = FbmSync.activitySinceFilterDate(since);
  var hasEndDateFilter = filters.some(function (item) { return /^end_date\s*:/i.test(String(item || '').trim()); });
  if (filterDate && opt.includeHistory !== true && !hasEndDateFilter) { filters.push('end_date:>=' + filterDate); }
  return filters;
};
/** Tạo request Activity luôn gắn với stt_rec của Customer. */
FbmSync.activityGridRequest = function (sttRec, options) {
  var opt = Object.assign({}, options || {}, { externalKey: [{ Name: 'stt_rec', Opr: '=', Value: String(sttRec || ''), Type: 'String', Ignore: false }] });
  opt.filter = FbmSync.activitySinceFilters(opt);
  delete opt.includeHistory;
  return FbmSync.gridRequest('activity', opt);
};
/** Dựng request bulk Activity theo mốc thời gian; không gắn một Customer cụ thể. */
FbmSync.activityBulkRequest = function (options) {
  var opt = Object.assign({}, options || {});
  opt.filter = FbmSync.activitySinceFilters(opt);
  delete opt.includeHistory;
  var transport = opt.transport;
  delete opt.transport;
  var request = FbmSync.gridRequest('activity', opt);
  request.meta.kind = 'activity_bulk_grid';
  request.meta.scan = 'bulk_activity';
  if (transport && Array.isArray(transport.arrayProjections)) { request.meta.transport = transport; }
  return request;
};

/** Dựng chỉ dẫn cột generic sau khi GAS đã đọc AliasName của trang đầu. */
FbmSync.activityBulkProjection = function (fields) {
  var required = ['id', 'ten_cv', 'details', 'end_date', 'owner', 'datetime0', 'line_nbr'], optional = ['ma_kh', 'ma_cv'], names = required.concat(optional), positions = [], requiredFound = 0, source = fields || [];
  names.forEach(function (name) {
    var index = source.map(function (field) { return String(field || '').toLowerCase(); }).indexOf(name);
    if (index >= 0) { positions.push(index); if (required.indexOf(name) >= 0) { requiredFound += 1; } }
  });
  if (requiredFound < required.length) { return null; }
  return { arrayProjections: [{ paths: ['d.Rows', 'd.ViewPage.Fields'], indices: positions }] };
};

/** Dựng request đọc lại đúng bản ghi đang xử lý conflict trước khi chốt. */
FbmSync.conflictRefreshRequest = function (entity, item) {
  var target = item || {}, fbmId = String(target.fbmId || '').trim();
  if (!fbmId) { return null; }
  if (entity === 'customer') {
    var customerRequest = FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, externalKey: [{ Name: 'stt_rec_kh', Opr: '=', Value: fbmId, Type: 'String', Ignore: false }] });
    customerRequest.meta.kind = 'conflict_refresh_grid'; customerRequest.meta.entity = 'customer'; customerRequest.meta.conflictId = String(target.id || '');
    return customerRequest;
  }
  var activityRequest = FbmSync.gridRequest('activity', { type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, externalKey: [{ Name: 'id', Opr: '=', Value: fbmId, Type: 'String', Ignore: false }] });
  activityRequest.meta.kind = 'conflict_refresh_grid'; activityRequest.meta.entity = 'activity'; activityRequest.meta.conflictId = String(target.id || '');
  return activityRequest;
};
/** Trả ID local vắng khỏi bulk FBM; tombstone và dòng tạm không bị chạm. */
FbmSync.activityBulkMissing = function (localRecords, seenFbmIds) {
  var seen = seenFbmIds || {}, missing = [];
  (localRecords || []).forEach(function (record) {
    var id = String(record && record.fbmId || '').trim();
    if (!id || seen[id] || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('activity', record) || (typeof FbmSync.activitySinceAllows === 'function' && !FbmSync.activitySinceAllows(record))) { return; }
    missing.push({ id: record.id, fbmId: id, syncStatus: FbmSync.SYNC_STATUS.missing });
  });
  return missing;
};

/** Ghi trạng thái Activity vắng theo lô; state chỉ giữ tổng và mẫu nhỏ, không giữ toàn bộ danh sách. */
FbmSync.writeActivityBulkMissing = function (localRecords) {
  var local = localRecords || [], hasSeen = FbmSync.seenStoreReader('activity_bulk'), batchSize = typeof SETTINGS !== 'undefined' && SETTINGS.CHUNK_ROWS ? Number(SETTINGS.CHUNK_ROWS) : 2000;
  var batch = [], sample = [], total = 0, written = 0;
  function flush() {
    if (!batch.length || typeof writeGateSave !== 'function') { batch = []; return; }
    var saved = writeGateSave({ entity: 'activity', records: batch, source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
    if (!saved || !saved.ok) { throw new Error('Không ghi được trạng thái Activity vắng sau lượt bulk.'); }
    written += batch.length; batch = [];
  }
  local.forEach(function (record) {
    var fbmId = String(record && record.fbmId || '').trim();
    if (!fbmId || hasSeen(record) || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('activity', record) || (typeof FbmSync.activitySinceAllows === 'function' && !FbmSync.activitySinceAllows(record))) { return; }
    var item = { id: record.id, fbmId: fbmId, syncStatus: FbmSync.SYNC_STATUS.missing };
    total += 1; if (sample.length < 20) { sample.push(item); }
    batch.push({ id: record.id, syncStatus: FbmSync.SYNC_STATUS.missing });
    if (batch.length >= batchSize) { flush(); }
  });
  flush();
  return { total: total, written: written, sample: sample };
};

/** Chuẩn hóa ngày Activity để lập kế hoạch quét bù Customer. */
FbmSync.activityDateKey = function (value) {
  var date = typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value;
  if (Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime())) {
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
    if (!String(record && record.fbmId || '').trim()) { return; }
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
/** Đọc định danh từ dòng User theo AliasName; thiếu metadata/dòng thì fail-closed. */
FbmSync.identityUser = function (response) {
  var grid = FbmSync.gridRows(response), fields = grid.fields || [], row = grid.rows && grid.rows[0], index = {};
  fields.forEach(function (field, position) { index[String(field).toLowerCase()] = position; });
  if (!row || !fields.length) { return { ok: false, code: 'IDENTITY_PROBE_INCOMPLETE', message: 'FBM không trả metadata hoặc dòng User để nhận diện tài khoản.' }; }
  var read = function (names) {
    for (var i = 0; i < names.length; i += 1) {
      var position = index[String(names[i]).toLowerCase()];
      if (position !== undefined && row[position] !== null && row[position] !== undefined && String(row[position]).trim() !== '') { return String(FbmSync.fbDate(row[position])).trim(); }
    }
    return '';
  };
  var userId = read(['id', 'user_id', 'userid']), username = read(['name', 'user_name', 'username']), fullName = read(['ten', 'full_name', 'fullname', 'account_name']);
  if (!userId || !username || !fullName) { return { ok: false, code: 'IDENTITY_PROBE_INCOMPLETE', message: 'FBM trả dòng User nhưng thiếu mã số, mã đăng nhập hoặc tên đầy đủ.' }; }
  return { ok: true, userId: userId, username: username, accountName: fullName };
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
/** Lấy các trường nhận diện không nhạy cảm nếu response authorize có trả; không suy đoán từ payload. */
FbmSync.extractSessionIdentity = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var source = data && typeof data === 'object' ? data : {}, pick = function (names) {
    for (var i = 0; i < names.length; i += 1) { if (source[names[i]] !== undefined && source[names[i]] !== null) { return String(source[names[i]]); } }
    return '';
  };
  // `FBM_ACCOUNT_NAME` below is a possible field alias returned by FBM, never a Config parameter.
  return { userId: pick(['FBM_USER_ID', 'UserId', 'userId', 'user_id', 'userid']), accountName: pick(['FBM_ACCOUNT_NAME', 'AccountName', 'accountName', 'UserName', 'userName', 'username', 'FullName', 'fullName']) };
};
