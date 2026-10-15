/** Tạo request grid/completion và đổi response FBM thành record ổn định. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

// Một trang Customer kéo theo danh sách khách chờ quét Activity nằm trong cursor; trang nhỏ để state luôn dưới trần một DocumentProperty dù tổng số khách là bao nhiêu.
FbmSync.CUSTOMER_PAGE_ROWS = 50;

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
  var accountName = typeof FbmSync.bindingAccountName === 'function' ? FbmSync.bindingAccountName() : '';
  var accountSettings = typeof FbmSync.accountSettingsRead === 'function' ? FbmSync.accountSettingsRead() : {};
  return {
    baseUrl: 'https://fbo.com.vn:8888',
    cookie: cookie,
    customerAuthorized: String(session.customerAuthorized || ''),
    activityAuthorized: String(session.activityAuthorized || ''),
    userId: userId,
    accountName: accountName,
    customerPrefix: String(accountSettings.customerPrefix || ''),
    customerCodeLength: String(accountSettings.customerCodeLength || '')
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
    // FBM biết chiều chuyển trang nhờ so `gridPageIndex` với `lastPageIndex` (trang đang đứng); ShinCRM chỉ đi tới nên trang đang đứng luôn là trang kế trừ 1.
    viewId: null, childObject: false, lastPageIndex: opt.lastPageIndex !== undefined ? opt.lastPageIndex : (Number(opt.gridPageIndex) > 0 ? Number(opt.gridPageIndex) - 1 : -1),
    firstPageItem: opt.pageItems && opt.pageItems.firstPageItem || '', lastPageItem: opt.pageItems && opt.pageItems.lastPageItem || '', lastRowCount: Number(opt.pageItems && opt.pageItems.lastRowCount || 0), memvars: [],
    externalKey: opt.externalKey || [], gridPageIndex: opt.gridPageIndex === undefined ? -1 : opt.gridPageIndex,
    gridPageValue: opt.gridPageValue === undefined ? null : opt.gridPageValue, gridRefresh: !!opt.gridRefresh, filter: opt.filter || [],
    sortExpression: opt.sortExpression || (entity === 'customer' ? 'ngay_gd desc' : 'end_date desc, datetime0 desc, id, line_nbr'),
    // Khi GAS chưa có payload cookie, để transport generic của Extension lấy từ trang FBM theo chỉ dẫn envelope.
    cookie: cfg.cookie || '{{FBM_PAYLOAD_COOKIE}}', query: null, parameter: null, variable: ''
  };
  if (entity === 'customer' && cfg.userId) {
    payload.externalKey.push({ Name: "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('" + cfg.userId + "')) and 1", Opr: '=', Value: 1, Type: 'String', Ignore: false });
  }
  var scope = entity === 'customer' && opt.includeScope !== false && typeof FbmSync.scope === 'function' ? FbmSync.scope() : null;
  if (scope) {
    // Danh sách rỗng thành điều kiện không khớp ai, để phạm vi giới hạn không bao giờ rơi thành quét toàn bộ. Mã đã qua SCOPE_CODE_PATTERN nên không có dấu nháy.
    var inList = scope.fbm.length ? scope.fbm.map(function (code) { return "'" + code + "'"; }).join(',') : "''";
    payload.externalKey.push({ Name: 'ma_kh in (' + inList + ') and 1', Opr: '=', Value: 1, Type: 'String', Ignore: false });
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
/** Request Customer full-scan dùng riêng cho kiểm tra liên kết Spreadsheet/FBM. */
FbmSync.identityCheckCustomerRequest = function (options) {
  var opt = Object.assign({ includeScope: false, sortExpression: 'stt_rec_kh' }, options || {});
  return FbmSync.customerGridRequest(opt);
};
/** Đổi ngày YYYY-MM-DD sang định dạng filter ngày mà grid FBM nhận; ngày không hợp lệ trả rỗng. */
FbmSync.fbmFilterDate = function (value) {
  var match = String(value || '').trim().match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) { return ''; }
  var date = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  if (date.getUTCFullYear() !== Number(match[1]) || date.getUTCMonth() !== Number(match[2]) - 1 || date.getUTCDate() !== Number(match[3])) { return ''; }
  return match[3] + '/' + match[2] + '/' + match[1];
};
/** Tạo request Activity luôn gắn với stt_rec của Customer. */
FbmSync.activityGridRequest = function (sttRec, options) {
  var opt = Object.assign({}, options || {}, { externalKey: [{ Name: 'stt_rec', Opr: '=', Value: String(sttRec || ''), Type: 'String', Ignore: false }] });
  return FbmSync.gridRequest('activity', opt);
};
/** Dựng request Activity của mọi khách; không gắn một Customer cụ thể. */
FbmSync.activityBulkRequest = function (options) {
  return FbmSync.gridRequest('activity', Object.assign({}, options || {}));
};

/** Đọc đích danh một giao dịch theo FBM ID, có tiêu đề cột; dùng để hỏi giao dịch đó còn hay không. */
FbmSync.activityByIdRequest = function (fbmId) {
  return FbmSync.gridRequest('activity', { type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, externalKey: [{ Name: 'id', Opr: '=', Value: String(fbmId || ''), Type: 'String', Ignore: false }] });
};

/** Dựng request đọc lại đúng bản ghi đang xử lý conflict trước khi chốt. */
FbmSync.conflictRefreshRequest = function (entity, item) {
  var target = item || {}, fbmId = String(target.fbmId || '').trim();
  if (!fbmId) { return null; }
  if (entity === 'customer') {
    // Đọc đích danh theo ID FBM; phạm vi thử đã xét lúc bản ghi vào hàng đợi. Gắn thêm lọc mã khách thử thì khách mới tạo (mã khác ALT00010) bị coi là không còn trên FBM (FBM-052).
    var customerRequest = FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, includeScope: false, externalKey: [{ Name: 'stt_rec_kh', Opr: '=', Value: fbmId, Type: 'String', Ignore: false }] });
    customerRequest.meta.kind = 'conflict_refresh_grid'; customerRequest.meta.entity = 'customer'; customerRequest.meta.conflictId = String(target.id || '');
    return customerRequest;
  }
  var activityRequest = FbmSync.activityByIdRequest(fbmId);
  activityRequest.meta.kind = 'conflict_refresh_grid'; activityRequest.meta.entity = 'activity'; activityRequest.meta.conflictId = String(target.id || '');
  return activityRequest;
};
FbmSync.FALLBACK_TIME_ZONE_OFFSET_MS = 7 * 60 * 60 * 1000;
/** Chuẩn hóa ngày Activity về khóa yyyy-MM-dd theo múi giờ dự án (Asia/Ho_Chi_Minh). */
FbmSync.activityDateKey = function (value) {
  var date = typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value;
  if (Object.prototype.toString.call(date) === '[object Date]' && !isNaN(date.getTime())) {
    if (typeof Utilities !== 'undefined' && typeof Session !== 'undefined' && Utilities.formatDate) {
      return Utilities.formatDate(date, Session.getScriptTimeZone() || 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd');
    }
    // Ngoài GAS (test offline) không có Session: tính theo giờ VN như múi giờ của dự án, không theo UTC.
    return new Date(date.getTime() + FbmSync.FALLBACK_TIME_ZONE_OFFSET_MS).toISOString().slice(0, 10);
  }
  var text = String(date || '').trim();
  var match = text.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})/);
  return match ? match[1] + '-' + ('0' + match[2]).slice(-2) + '-' + ('0' + match[3]).slice(-2) : '';
};

/**
 * Con trỏ trang kế của grid Customer (keyset): bốn giá trị sort key của dòng cuối trang, theo tài liệu Nghiên cứu FBM ch04 mục 4.10.
 * Thiếu `stt_rec_kh` thì FBM trả trang kế rỗng và lượt quét tưởng đã hết khách (gặp thật 2026-10-07: dừng ở 50/1.312 khách).
 */
FbmSync.customerPageValue = function (row) {
  var last = row || {};
  return FbmSync.gridPageValue([last.ngay_gd || '', last.datetime0 || '', last.xorder || '', last.stt_rec_kh || '']);
};

/**
 * Khóa trang gửi lại FBM phải ở dạng `/Date(ms)/` (gửi Date thành chuỗi ISO thì FBM trả trang kế rỗng) và cộng thêm lệch giờ máy chủ như giao diện FBM:
 * FBM đọc ngày gửi lên như giờ UTC, gửi nguyên ms FBM trả thì mốc lùi 7 giờ, khách cùng ngày với dòng cuối trang bị bỏ qua âm thầm và vùng khách chung một ngày (khách chưa có giao dịch) trả trang rỗng (gặp thật 2026-10-08: dừng ở 1.000/1.312).
 * So kiểu bằng `toString` vì Date tạo ở ngữ cảnh khác không qua được `instanceof`.
 */
FbmSync.gridPageValue = function (values) {
  return values.map(function (value) {
    return Object.prototype.toString.call(value) === '[object Date]' ? '/Date(' + (value.getTime() + FbmSync.FBM_SERVER_UTC_OFFSET_MS) + ')/' : value;
  });
};

/**
 * Trang thứ N có chỉ số N-1; trang đầu gửi -1 (hoặc -2 khi không lấy tiêu đề) nhưng thực chất là chỉ số 0, nên trang kế của trang đầu là 1.
 * Gửi 0 kèm khóa trang thì FBM hiểu là quay về trang 1 và trả trang rỗng (Nghiên cứu FBM ch03 mục gridPageIndex, mẫu "Lấy trang khách hàng không có tiêu đề").
 */
FbmSync.gridNextPageIndex = function (pageIndex) {
  var index = pageIndex === null || pageIndex === undefined || pageIndex === '' ? -1 : Number(pageIndex);
  return (isFinite(index) && index >= 0 ? Math.floor(index) : 0) + 1;
};

/**
 * Trang đầu không kèm tiêu đề: FBM dùng `type: 1` với `gridPageIndex: -2` (mẫu bắt từ giao diện FBM trong RequestFBM).
 * Tiêu đề nặng khoảng 22,5 KB mỗi lần trong khi dữ liệu một khách chỉ vài KB, nên mỗi lượt chỉ lấy tiêu đề một lần (09/01 Kiến trúc và giao thức).
 */
FbmSync.GRID_FIRST_PAGE_NO_HEADER = -2;
/** FBM đặt máy chủ theo giờ Việt Nam (không đổi giờ theo mùa); ngày trong `firstPageItem`/`lastPageItem` là ngày theo giờ này. */
FbmSync.FBM_SERVER_UTC_OFFSET_MS = 7 * 3600000;
/** Ngày `yyyyMMdd` theo giờ máy chủ FBM từ Date hoặc chuỗi `/Date(ms)/`; giá trị khác trả chuỗi rỗng để FBM trả trang rỗng và lượt quét báo thiếu, không đoán ngày. */
FbmSync.fbmDayKey = function (value) {
  if (value === null || value === undefined || value === '') { return ''; }
  var ms = Object.prototype.toString.call(value) === '[object Date]' ? value.getTime() : Number((String(value).match(/^\/Date\((-?\d+)/) || [])[1]);
  return isFinite(ms) ? new Date(ms + FbmSync.FBM_SERVER_UTC_OFFSET_MS).toISOString().slice(0, 10).replace(/-/g, '') : '';
};
/**
 * FBM chỉ trả trang Customer kế khi request mô tả trang đang đứng: dòng đầu, dòng cuối (ngày giao dịch + ngày tạo dạng `yyyyMMdd`, `xorder`, `stt_rec_kh`) và tổng số dòng; thiếu thì FBM trả trang rỗng.
 * Kiểm trên FBM thật 2026-10-08 bằng request bắt từ giao diện FBM.
 */
FbmSync.customerPageItems = function (rows, total) {
  var list = rows || [];
  return { firstPageItem: FbmSync.customerPageItem(list[0]), lastPageItem: FbmSync.customerPageItem(list[list.length - 1]), lastRowCount: Number(total || 0) };
};
FbmSync.customerPageItem = function (row) { var value = row || {}; return FbmSync.fbmDayKey(value.ngay_gd) + FbmSync.fbmDayKey(value.datetime0) + String(value.xorder || '') + String(value.stt_rec_kh || ''); };
/** Đọc lại mô tả trang đang đứng từ body request đã dựng, để cursor mang theo khi dựng lại request. */
FbmSync.gridPageItemsOf = function (body) {
  var value = body || {};
  return { firstPageItem: String(value.firstPageItem || ''), lastPageItem: String(value.lastPageItem || ''), lastRowCount: Number(value.lastRowCount || 0) };
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
  var required = FbmSync.scanFields(entity);
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
  // Trang không tiêu đề đọc cột theo vị trí đã lưu; số cột lệch nghĩa là FBM đã đổi cấu trúc nên dừng, không đoán, tránh ghi nhầm trường.
  if (!grid.fields.length && grid.rows.some(function (row) { return !Array.isArray(row) || row.length !== fields.length; })) {
    var shapeError = new Error('FBM trả dòng ' + entity + ' có số cột khác ' + fields.length + ' cột đã lưu từ tiêu đề; cấu trúc FBM có thể đã đổi, đã dừng để không ghi nhầm trường.');
    shapeError.code = 'FBM_GRID_SHAPE_CHANGED';
    throw shapeError;
  }
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
