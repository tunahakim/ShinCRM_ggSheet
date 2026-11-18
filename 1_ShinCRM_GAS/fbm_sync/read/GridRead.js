/** Tạo request grid/completion và đổi response FBM thành record ổn định. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

// Một trang Customer kéo theo danh sách khách chờ quét Activity nằm trong cursor; trang nhỏ để state luôn dưới trần một DocumentProperty dù tổng số khách là bao nhiêu.
FbmSync.CUSTOMER_PAGE_ROWS = 50;

/** Đổi chuỗi /Date(ms)/ của .NET, giữ nguyên giá trị khác. */
FbmSync.fbDate = function (value) {
  if (value === null || value === undefined || value === '') { return ''; }
  var match = String(value).match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  if (match) { return new Date(Number(match[1])); }
  return value;
};
// Mã khách FBM (`stt_rec_kh`) đi vào câu lọc ghép tay nên chỉ nhận chữ, số, `-` và `_` (không có dấu nháy hay khoảng trắng); id giao dịch chỉ nhận chữ số.
FbmSync.STT_REC_PATTERN = /^[A-Za-z0-9_-]+$/;
FbmSync.ACTIVITY_ID_PATTERN = /^\d+$/;

(function () {
  /** Khung payload grid chung; điều kiện quyền của Customer không nằm ở đây mà ở `gridRequest`, để chỉ hàm tra không lọc quyền dựng được request khách thiếu điều kiện này. */
  function gridPayload(entity, opt, cfg) {
    return {
      type: Number(opt.type === undefined ? 0 : opt.type), count: Number(opt.count || (entity === 'customer' ? 2000 : 100)), language: 'v', controller: FbmSync.CONTROLLERS[entity],
      // FBM biết chiều chuyển trang nhờ so `gridPageIndex` với `lastPageIndex` (trang đang đứng); ShinCRM chỉ đi tới nên trang đang đứng luôn là trang kế trừ 1.
      viewId: null, childObject: false, lastPageIndex: opt.lastPageIndex !== undefined ? opt.lastPageIndex : (Number(opt.gridPageIndex) > 0 ? Number(opt.gridPageIndex) - 1 : -1),
      firstPageItem: opt.pageItems && opt.pageItems.firstPageItem || '', lastPageItem: opt.pageItems && opt.pageItems.lastPageItem || '', lastRowCount: Number(opt.pageItems && opt.pageItems.lastRowCount || 0), memvars: [],
      externalKey: (opt.externalKey || []).slice(), gridPageIndex: opt.gridPageIndex === undefined ? -1 : opt.gridPageIndex,
      gridPageValue: opt.gridPageValue === undefined ? null : opt.gridPageValue, gridRefresh: !!opt.gridRefresh, filter: opt.filter || [],
      sortExpression: opt.sortExpression || (entity === 'customer' ? 'ngay_gd desc' : 'end_date desc, datetime0 desc, id, line_nbr'),
      // Khi GAS chưa có payload cookie, để transport generic của Extension lấy từ trang FBM theo chỉ dẫn envelope.
      cookie: cfg.cookie || '{{FBM_PAYLOAD_COOKIE}}', query: null, parameter: null, variable: ''
    };
  }

  /**
   * Tạo một trang grid; type 0 lấy tiêu đề, type 1 không lấy. Mọi request lưới mang `meta.keep` (`gridKeep`) để Extension chỉ trả các cột GAS đọc: mặc định `scanFields(entity)`, bên gọi cần ít hơn thì truyền `keepFields`.
   * Trang không tiêu đề phải có `sourceFields` (tên cột gốc lấy từ một trang có tiêu đề của lượt) để tính vị trí cột.
   * Lưới khách nhận phạm vi bằng `opt.scope`: đối tượng phạm vi hoặc `null` (không giới hạn); bỏ trống là lỗi, vì đoán thì phạm vi giới hạn có thể rơi thành quét toàn bộ.
   */
  FbmSync.gridRequest = function (entity, options, cfg) {
    FbmSync.requestCfg(cfg, 'gridRequest');
    var opt = options || {}, payload = gridPayload(entity, opt, cfg);
    if (entity === 'customer' && opt.scope === undefined) { throw FbmSync.requestSettingsMissing('gridRequest', 'phạm vi khách (scope)'); }
    if (entity === 'customer') {
      // Thiếu mã người dùng mà vẫn gửi thì FBM trả mọi khách mình đọc được, kể cả khách người khác; chỉ hàm tra mã khách không lọc quyền được bỏ điều kiện này.
      if (!/^[A-Za-z0-9_-]+$/.test(String(cfg.userId || ''))) { var missingUser = new Error('phiên FBM chưa được xác minh tài khoản nên chưa có mã người dùng; không dựng request đọc khách.'); missingUser.code = 'FBM_USER_ID_MISSING'; throw missingUser; }
      payload.externalKey.push({ Name: "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('" + cfg.userId + "')) and 1", Opr: '=', Value: 1, Type: 'String', Ignore: false });
    }
    var scope = entity === 'customer' ? opt.scope : null;
    if (scope) {
      // Danh sách rỗng thành điều kiện không khớp ai, để phạm vi giới hạn không bao giờ rơi thành quét toàn bộ. Mã đã qua khuôn của trường `scopeCodes` nên không có dấu nháy.
      var inList = scope.fbm.length ? scope.fbm.map(function (code) { return "'" + code + "'"; }).join(',') : "''";
      payload.externalKey.push({ Name: 'ma_kh in (' + inList + ') and 1', Opr: '=', Value: 1, Type: 'String', Ignore: false });
    }
    if (entity === 'customer' && payload.type === 0) {
      payload.memvars = [{ Name: 'user_id', OldValue: null, NewValue: '' }];
    }
    var keep = FbmSync.gridKeep(opt.keepFields || FbmSync.scanFields(entity), payload.type === 0, opt.sourceFields);
    return { url: FbmSync.FBM_BASE_URL + FbmSync.ENDPOINTS.grid, body: payload, meta: { kind: 'grid', entity: entity, keep: keep } };
  };

  /**
   * Tra mã khách không lọc quyền (09/05 Phần 9, Nghiên cứu FBM ch16): `activity` hỏi khách đang giữ giao dịch có id này, `customer` hỏi khách này còn tồn tại không. Mỗi request một mã.
   * Không kèm điều kiện quyền và phạm vi nên Extension chỉ trả cột `stt_rec_kh` và kết quả chỉ được đọc qua `ownerLookupParse`. Mã sai định dạng thì không dựng request (trả `null`), vì mã đi thẳng vào câu SQL.
   * Lượt đã có tên cột gốc của bảng khách (`sourceFields`) thì không xin tiêu đề.
   */
  FbmSync.ownerLookupRequest = function (kind, value, sourceFields, cfg) {
    FbmSync.requestCfg(cfg, 'ownerLookupRequest');
    var text = String(value === null || value === undefined ? '' : value).trim(), key;
    if (kind === 'activity' && FbmSync.ACTIVITY_ID_PATTERN.test(text)) { key = { Name: "stt_rec_kh in (select stt_rec from sysevents where id = '" + text + "') and 1", Opr: '=', Value: 1, Type: 'String', Ignore: false }; }
    else if (kind === 'customer' && FbmSync.STT_REC_PATTERN.test(text)) { key = { Name: 'stt_rec_kh', Opr: '=', Value: text, Type: 'String', Ignore: false }; }
    else { return null; }
    var withHeader = !(Array.isArray(sourceFields) && sourceFields.length), payload = gridPayload('customer', { type: withHeader ? 0 : 1, count: 20, gridPageIndex: withHeader ? -1 : FbmSync.GRID_FIRST_PAGE_NO_HEADER, gridRefresh: false, externalKey: [key] }, cfg);
    payload.memvars = [{ Name: 'user_id', OldValue: null, NewValue: '' }];
    return { url: FbmSync.FBM_BASE_URL + FbmSync.ENDPOINTS.grid, body: payload, meta: { kind: 'owner_lookup', entity: 'customer', keep: FbmSync.gridKeep(FbmSync.OWNER_LOOKUP_FIELDS, withHeader, sourceFields) } };
  };
})();

/** Tra không lọc quyền chỉ cần cột mã khách: không giữ cột nào khác của khách có thể không thuộc quyền mình. */
FbmSync.OWNER_LOOKUP_FIELDS = ['stt_rec_kh'];
/** Đọc kết quả tra không lọc quyền: chỉ trả danh sách `stt_rec_kh`. Lỗi FBM hoặc lưới lạ trả `ok: false` để bên gọi báo lỗi, không suy ra vắng. */
FbmSync.ownerLookupParse = function (item) {
  var check = FbmSync.protocol.assertSuccess(item);
  if (!check.ok) { return { ok: false, code: String(check.code || 'FBM_ERROR'), status: Number(check.status || 0), reason: String(check.bug && (check.bug.Message || check.bug.message) || 'FBM trả lỗi khi tra mã khách') }; }
  var grid = FbmSync.gridPicked(FbmSync.protocol.parse(item), FbmSync.OWNER_LOOKUP_FIELDS);
  if (!grid.ok) { return { ok: false, code: 'FBM_GRID_SHAPE_CHANGED', status: 0, reason: 'Kết quả tra mã khách: ' + grid.reason }; }
  return { ok: true, sttRecs: grid.rows.map(function (row) { return String(row[0] || '').trim(); }).filter(Boolean), sourceFields: grid.sourceFields };
};

/**
 * Phần tử đọc khách của một lô cửa ghi: lọc theo quyền như danh sách khách và theo đúng các mã của lô. Mã sai định dạng không vào câu lọc; lô không còn mã nào thì không dựng.
 * Lượt đã có tên cột gốc của bảng khách (`sourceFields`) thì không xin tiêu đề, vì tiêu đề FBM nặng hơn dữ liệu cả lô (09/01 Kiến trúc và giao thức).
 */
FbmSync.customerBatchRequest = function (sttRecs, sourceFields, scope, cfg) {
  var list = (sttRecs || []).map(function (value) { return String(value || '').trim(); }).filter(function (value) { return FbmSync.STT_REC_PATTERN.test(value); });
  if (!list.length) { return null; }
  var withHeader = !(Array.isArray(sourceFields) && sourceFields.length);
  var request = FbmSync.customerGridRequest({ type: withHeader ? 0 : 1, count: Math.max(20, list.length), gridPageIndex: withHeader ? -1 : FbmSync.GRID_FIRST_PAGE_NO_HEADER, gridRefresh: false, sourceFields: sourceFields, scope: scope, externalKey: [{ Name: 'stt_rec_kh in (' + list.map(function (value) { return "'" + value + "'"; }).join(',') + ') and 1', Opr: '=', Value: 1, Type: 'String', Ignore: false }] }, cfg);
  request.meta.kind = 'customer_batch';
  return request;
};
/** Tạo request grid Customer theo cursor hiện tại. */
FbmSync.customerGridRequest = function (options, cfg) { return FbmSync.gridRequest('customer', options, cfg); };
/** Request User do GAS cấp để đọc định danh phiên; Extension chỉ chuyển envelope và response thô. */
FbmSync.identityUserRequest = function (cfg) {
  FbmSync.requestCfg(cfg, 'identityUserRequest');
  return {
    url: FbmSync.FBM_BASE_URL + FbmSync.ENDPOINTS.grid,
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
FbmSync.identityCheckCustomerRequest = function (options, cfg) {
  var opt = Object.assign({ sortExpression: 'stt_rec_kh' }, options || {}, { scope: null });
  return FbmSync.customerGridRequest(opt, cfg);
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
FbmSync.activityGridRequest = function (sttRec, options, cfg) {
  var opt = Object.assign({}, options || {}, { externalKey: [{ Name: 'stt_rec', Opr: '=', Value: String(sttRec || ''), Type: 'String', Ignore: false }] });
  return FbmSync.gridRequest('activity', opt, cfg);
};
/** Dựng request Activity của mọi khách; không gắn một Customer cụ thể. */
FbmSync.activityBulkRequest = function (options, cfg) {
  return FbmSync.gridRequest('activity', Object.assign({}, options || {}), cfg);
};

/** Đọc đích danh một giao dịch theo FBM ID, có tiêu đề cột; dùng để hỏi giao dịch đó còn hay không. */
FbmSync.activityByIdRequest = function (fbmId, cfg) {
  return FbmSync.gridRequest('activity', { type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, externalKey: [{ Name: 'id', Opr: '=', Value: String(fbmId || ''), Type: 'String', Ignore: false }] }, cfg);
};

/** Dựng request đọc lại đúng bản ghi đang xử lý conflict trước khi chốt. */
FbmSync.conflictRefreshRequest = function (entity, item, cfg) {
  var target = item || {}, fbmId = String(target.fbmId || '').trim();
  if (!fbmId) { return null; }
  if (entity === 'customer') {
    // Đọc đích danh theo ID FBM; phạm vi thử đã xét lúc bản ghi vào hàng đợi. Gắn thêm lọc mã khách thử thì khách mới tạo (mã khác ALT00010) bị coi là không còn trên FBM (FBM-052).
    var customerRequest = FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -1, gridRefresh: false, scope: null, externalKey: [{ Name: 'stt_rec_kh', Opr: '=', Value: fbmId, Type: 'String', Ignore: false }] }, cfg);
    customerRequest.meta.kind = 'conflict_refresh_grid'; customerRequest.meta.entity = 'customer'; customerRequest.meta.conflictId = String(target.id || '');
    return customerRequest;
  }
  var activityRequest = FbmSync.activityByIdRequest(fbmId, cfg);
  activityRequest.meta.kind = 'conflict_refresh_grid'; activityRequest.meta.entity = 'activity'; activityRequest.meta.conflictId = String(target.id || '');
  return activityRequest;
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
 * Vị trí trang kế của giao dịch một khách (keyset, Nghiên cứu FBM ch05 mục 5.8): dòng đầu, dòng cuối dạng `[end_date][datetime0][id][line_nbr]` và khóa trang bốn cột đó. `previous` rỗng là trang đầu; tổng lấy ở trang đầu vì trang sau FBM trả 0.
 * Trả `null` khi trang vừa nhận có dòng cuối trùng trang trước: FBM đã bỏ qua khóa trang và trả lại cùng trang, xin tiếp sẽ lặp mãi.
 */
FbmSync.activityPageNext = function (previous, rows, total) {
  var first = rows[0] || {}, last = rows[rows.length - 1] || {};
  var item = function (row) { return FbmSync.fbmDayKey(row.end_date) + FbmSync.fbmDayKey(row.datetime0) + String(row.id || '') + String(row.line_nbr || ''); };
  var lastItem = item(last), rowCount = Number(previous ? previous.pageItems.lastRowCount : total || 0);
  if (previous && previous.pageItems.lastPageItem === lastItem) { return null; }
  return { pageIndex: FbmSync.gridNextPageIndex(previous ? previous.pageIndex : -1), pageValue: FbmSync.gridPageValue([last.end_date || '', last.datetime0 || '', last.id || '', last.line_nbr || '']), pageItems: { firstPageItem: item(first), lastPageItem: lastItem, lastRowCount: rowCount } };
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
FbmSync.customerPageItem = function (row) { var value = row || {}; return FbmSync.fbmDayKey(value.ngay_gd) + FbmSync.fbmDayKey(value.datetime0) + String(value.xorder || '') + String(value.stt_rec_kh || ''); };
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
  var shapeChanged = function (message) { var error = new Error(message + '; cấu trúc FBM có thể đã đổi, đã dừng để không ghi nhầm trường.'); error.code = 'FBM_GRID_SHAPE_CHANGED'; throw error; };
  (fields || []).forEach(function (field) { if (seen[field]) { shapeChanged('FBM trả AliasName trùng: ' + field); } seen[field] = true; });
  var missing = required.filter(function (field) { return !seen[field]; });
  if (missing.length) { shapeChanged('FBM thiếu metadata AliasName: ' + missing.join(', ')); }
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
/**
 * Lệnh cắt cột gửi Extension trong `meta.keep`. Trang có tiêu đề cắt theo tên (`fields`); trang không tiêu đề cắt theo vị trí tính từ tên cột gốc `sourceFields` (`positions`; `width` là số cột gốc để Extension phát hiện FBM đổi cấu trúc). Chỉ cần tổng thì `fields` rỗng, không cần tiêu đề.
 * Thiếu tên cột gốc, hoặc tên cột gốc không có cột cần, thì ném lỗi khi dựng request: cắt theo vị trí đoán thì ô bị dồn sang trường khác.
 */
FbmSync.gridKeep = function (names, withHeader, sourceFields) {
  var list = (names || []).map(String);
  if (!list.length || withHeader) { return { fields: list }; }
  var fail = function (code, message) { var error = new Error(message); error.code = code; throw error; };
  if (!Array.isArray(sourceFields) || !sourceFields.length) { fail('FBM_GRID_SOURCE_FIELDS_MISSING', 'Chưa có danh sách cột gốc của lưới FBM nên không dựng được trang không tiêu đề; đã dừng trước khi gửi.'); }
  var positions = list.map(function (name) { return sourceFields.indexOf(name); }), missing = list.filter(function (name, index) { return positions[index] < 0; });
  if (missing.length) { fail('FBM_GRID_SHAPE_CHANGED', 'Danh sách cột gốc của lưới FBM thiếu cột: ' + missing.join(', ') + '; cấu trúc FBM có thể đã đổi, đã dừng để không ghi nhầm trường.'); }
  return { positions: positions, width: sourceFields.length };
};
/**
 * Đọc response lưới Extension đã cắt theo `gridKeep` của đúng các cột `names`: mỗi dòng phải có đúng `names.length` ô theo thứ tự đó. Trả `ok: false` kèm lý do khi Extension báo thiếu cột (`MissingFields`), số cột lệch tiêu đề đã lưu (`ShapeMismatch`), hoặc response không ở dạng đã cắt.
 * `sourceFields` là tên cột gốc khi trang có tiêu đề, `null` khi không.
 */
FbmSync.gridPicked = function (response, names) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  if (Array.isArray(data.MissingFields) && data.MissingFields.length) { return { ok: false, reason: 'FBM không còn cột ' + data.MissingFields.join(', ') + '; cấu trúc FBM có thể đã đổi.' }; }
  if (data.ShapeMismatch) { return { ok: false, reason: 'FBM trả dòng có số cột khác ' + Number(data.ShapeMismatch.width || 0) + ' cột của tiêu đề đã lưu; cấu trúc FBM có thể đã đổi.' }; }
  if (!Array.isArray(data.Rows) || !data.Rows.every(function (row) { return Array.isArray(row) && row.length === names.length; })) { return { ok: false, reason: 'response lưới không ở dạng đã cắt ' + names.length + ' cột như GAS yêu cầu; Extension có thể đang chạy bản lệch hợp đồng.' }; }
  return { ok: true, rows: data.Rows, total: Number(data.TotalRowCount || 0), sourceFields: Array.isArray(data.SourceFields) ? data.SourceFields.map(String) : null };
};
/**
 * Đường đọc lưới duy nhất của một bảng: ghép từng ô với `scanFields(entity)` theo đúng thứ tự đã gửi Extension và chuẩn hóa ngày. Lưới lạ ném `FBM_GRID_SHAPE_CHANGED` để dừng thay vì ghi nhầm trường.
 * Trang có tiêu đề trả thêm `sourceFields` (đã kiểm đủ cột, không trùng) để bên gọi lưu cho các trang không tiêu đề của lượt.
 */
FbmSync.rowsToRecords = function (entity, response) {
  var fields = FbmSync.scanFields(entity), grid = FbmSync.gridPicked(response, fields);
  if (!grid.ok) { var shapeError = new Error('Lưới ' + entity + ': ' + grid.reason + ' Đã dừng để không ghi nhầm trường.'); shapeError.code = 'FBM_GRID_SHAPE_CHANGED'; throw shapeError; }
  if (grid.sourceFields) { FbmSync.validateGridFields(entity, grid.sourceFields); }
  return { entity: entity, total: grid.total, sourceFields: grid.sourceFields, rows: grid.rows.map(function (row) {
    var record = {};
    fields.forEach(function (field, index) { record[field] = FbmSync.fbDate(row[index]); });
    return record;
  }) };
};
/** Request lấy danh mục động; không gửi mã danh mục hardcode. */
FbmSync.completionRequest = function (controller, field, cfg) {
  FbmSync.requestCfg(cfg, 'completionRequest');
  return { url: FbmSync.FBM_BASE_URL + FbmSync.ENDPOINTS.completion, body: { type: 2, prefixText: '', count: 100, language: 'v', controller: controller, cookie: cfg.cookie, pageItemEnd: '', variable: null, valueField: null, textField: null, dataTable: null, keyFilter: '', keyValid: '1=1', check: false, orderField: null, lookupPageIndex: -1, lookupRefresh: false, filter: [], sortExpression: null, element: null }, meta: { kind: 'completion', field: field } };
};

/** Lấy token authorized do request bootstrap trả về. */
FbmSync.extractAuthorized = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {};
  var data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  return String(data.Authorized || data.authorized || '');
};
