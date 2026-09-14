/** Hop dong request va retry an toan cho transport FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa tổng của module, lưu theo Spreadsheet hiện tại và mặc định tắt để fail-closed. */
FbmSync.MASTER_SWITCH_KEY = 'FBM_SYNC_ENABLED';
FbmSync.masterEnabled = function () {
  // Không phá hành vi các Spreadsheet đã có trước khi công tắc được thêm; chỉ giá trị false rõ ràng mới khóa module.
  try { return FbmSync.props().getProperty(FbmSync.MASTER_SWITCH_KEY) !== 'false'; } catch (err) { return true; }
};
FbmSync.setMasterEnabled = function (enabled) {
  var value = enabled === true;
  FbmSync.props().setProperty(FbmSync.MASTER_SWITCH_KEY, value ? 'true' : 'false');
  return { ok: true, enabled: value };
};

/** Chỉ cho phép ghi khi caller chọn write và cờ an toàn đã bật. */
FbmSync.writeEnabled = function (mode) {
  if (mode !== 'write' && mode !== 'push') { return false; }
  return FbmSync.writeAllowed();
};
/** Cờ an toàn độc lập với mode; mặc định luôn tắt. */
FbmSync.writeAllowed = function () {
  try { return PropertiesService.getDocumentProperties().getProperty('FBM_SYNC_ALLOW_WRITES') === 'true'; } catch (err) { return false; }
};
/** Chỉ trả dữ liệu JSON thuần qua google.script.run; Date phải về dạng .NET của FBM. */
if (typeof FbmSync.transportValue !== 'function') {
  FbmSync.transportValue = function (value) {
    if (value && Object.prototype.toString.call(value) === '[object Date]') { return '/Date(' + value.getTime() + ')/'; }
    if (Array.isArray(value)) { return value.map(function (item) { return FbmSync.transportValue(item); }); }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (key) { out[key] = FbmSync.transportValue(value[key]); });
      return out;
    }
    return value;
  };
}
/** Bọc request nội bộ thành envelope gửi qua Extension. */
FbmSync.nextEnvelope = function (request) {
  if (!request) { return null; }
  // Đang tắt thì không cấp request kế tiếp. Request đã gửi trước đó không thể thu hồi;
  // state được chuyển sang paused để người dùng xem và chủ động tiếp tục sau khi bật lại.
  if (!FbmSync.masterEnabled()) {
    var stopped = FbmSync.stateRead ? FbmSync.stateRead() : {};
    stopped.phase = 'paused';
    stopped.message = 'Đồng bộ đang tắt; không cấp request FBM mới. Request đang bay vẫn được giữ để không mất cursor.';
    stopped.lastError = '';
    if (FbmSync.stateWrite) { FbmSync.stateWrite(stopped); }
    return null;
  }
  var endpoint = FbmSync.protocol.validateEndpoint(request.url);
  if (!endpoint.ok) {
    if (FbmSync.traceEvent) { FbmSync.traceEvent('request_blocked', { operation: request.meta && request.meta.kind || '', endpoint: request.url, code: endpoint.code }); }
    throw new Error(endpoint.message + ' (' + endpoint.code + ')');
  }
  var id = Date.now().toString(36), state = FbmSync.stateRead ? FbmSync.stateRead() : {}, meta = Object.assign({}, request.meta || {});
  meta.trace = Object.assign({}, meta.trace || {}, { runId: String(state.runId || ''), requestId: id });
  // Extension chỉ có bộ lọc generic; GAS quyết định rõ dữ liệu phụ trợ cần lấy từ tab.
  meta.transport = Object.assign({
    captures: [{ name: 'payloadCookie', source: 'page_html', pattern: '\\\\?["\\\']cookie\\\\?\\s*[:=]\\s*\\\\?["\\\']([^\\\"\\\'\\\\]+FHN_CRM_App)["\\\']', flags: 'i', group: 1 }],
    replacements: [{ token: '{{FBM_PAYLOAD_COOKIE}}', capture: 'payloadCookie', source: 'page_html' }]
  }, meta.transport || {});
  if (FbmSync.stateWrite) {
    state.activeRequestId = id;
    state.lastProgressAt = Date.now();
    state.deadlineAt = Date.now() + 120000;
    FbmSync.stateWrite(state);
  }
  if (FbmSync.traceEvent) { FbmSync.traceEvent('response_built', { requestId: id, operation: meta.kind, entity: meta.entity, recordId: meta.id || meta.shinId || meta.stt_rec_kh }); }
  return FbmSync.protocol.request(id, request.url, FbmSync.transportValue(request.body), FbmSync.transportValue(meta));
};
/** Lấy requestId từ trace transport mà GAS đã yêu cầu Extension giữ lại. */
FbmSync.responseRequestId = function (rawResponse) {
  var value = rawResponse || {}, trace = value.trace || value.transport && value.transport.trace || value.result && value.result.transport && value.result.transport.trace || [], item;
  if (!Array.isArray(trace)) { return ''; }
  for (var i = trace.length - 1; i >= 0; i -= 1) {
    item = trace[i];
    if (item && item.requestId) { return String(item.requestId); }
  }
  return '';
};
/** Khi đạt giới hạn một lát relay, giữ cursor nhưng thu hồi reservation request chưa gửi. */
FbmSync.limitRelayResult = function (result, hop) {
  var limit = Number(FbmSync.RELAY_HOP_LIMIT || 20), value = result || {};
  if (Number(hop || 0) < limit || !value.request) { return value; }
  var state = FbmSync.stateRead();
  state.activeRequestId = '';
  state.deadlineAt = 0;
  state.relayHop = 0;
  state.message = 'Đã hết lát xử lý an toàn; lượt sau sẽ tiếp tục từ cursor đã lưu.';
  FbmSync.stateWrite(state);
  return Object.assign({}, value, { ok: true, code: 'RELAY_SLICE_COMPLETE', request: null, status: value.status || FbmSync.statusView() });
};
/** Dựng lại request đọc từ cursor; không lưu payload/cookie để retry không làm lộ bí mật. */
FbmSync.requestForCursor = function (state) {
  var cursor = state && state.cursor || {}, lookup, customerId, pageType;
  if (cursor.kind === 'login') { return FbmSync.loginRequest(cursor.credentialRef, false); }
  if (cursor.kind === 'authorize_customer') { return FbmSync.authorizeRequest('customer'); }
  if (cursor.kind === 'authorize_activity') { return FbmSync.authorizeRequest('activity'); }
  if (cursor.kind === 'identity_user_grid') { return FbmSync.identityUserRequest(); }
  if (cursor.kind === 'lookup') {
    lookup = FbmSync.SYNC_LOOKUPS[Number(cursor.index || 0)];
    return lookup ? FbmSync.completionRequest(lookup.controller, lookup.key) : null;
  }
  if (cursor.kind === 'customer_grid') {
    return FbmSync.customerGridRequest({ type: Number(cursor.type || 0), count: Number(cursor.count || 2000), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue === undefined ? null : cursor.pageValue, gridRefresh: false });
  }
  if (cursor.kind === 'activity_grid') {
    customerId = (cursor.customerIds || [])[Number(cursor.customerIndex || 0)];
    if (!customerId) { return null; }
    pageType = Number(cursor.pageIndex || -1) < 0 ? 0 : 1;
    return FbmSync.activityGridRequest(customerId, { type: pageType, count: Number(cursor.count || 100), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue === undefined ? null : cursor.pageValue, gridRefresh: false });
  }
  if (cursor.kind === 'activity_bulk_grid') {
    return FbmSync.activityBulkRequest({ type: Number(cursor.type || 0), count: Number(cursor.count || 100), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue === undefined ? null : cursor.pageValue, gridRefresh: false });
  }
  return null;
};
/** Chỉ retry request đọc; request ghi không được lặp vì phản hồi có thể đã tới FBM. */
FbmSync.retryRead = function (state, failure) {
  var safeKinds = ['authorize_customer', 'authorize_activity', 'identity_user_grid', 'lookup', 'customer_grid', 'activity_grid', 'activity_bulk_grid'], cursor = state && state.cursor || {}, limit = Number(state && state.retryLimit || 2), attempt = Number(state && state.retryCount || 0), request;
  if (!failure || failure.retryable !== true || safeKinds.indexOf(cursor.kind) < 0 || attempt >= limit) { return null; }
  request = FbmSync.requestForCursor(state);
  if (!request) { return null; }
  state.retryCount = attempt + 1;
  state.retryable = true;
  state.message = 'Lỗi tạm thời khi đọc FBM; đang thử lại lần ' + state.retryCount + '/' + limit + '...';
  FbmSync.stateWrite(state);
  return request;
};
/** Cập nhật state dùng chung cho các bước orchestration. */
FbmSync.saveStatus = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };
