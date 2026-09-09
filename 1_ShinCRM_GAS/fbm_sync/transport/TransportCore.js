/** Hop dong request va retry an toan cho transport FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chỉ cho phép ghi khi caller chọn write và cờ an toàn đã bật. */
FbmSync.writeEnabled = function (mode) {
  if (mode !== 'write') { return false; }
  return FbmSync.writeAllowed();
};
/** Cờ an toàn độc lập với mode; mặc định luôn tắt. */
FbmSync.writeAllowed = function () {
  try { return PropertiesService.getDocumentProperties().getProperty('FBM_SYNC_ALLOW_WRITES') === 'true'; } catch (err) { return false; }
};
/** Bọc request nội bộ thành envelope gửi qua Extension. */
FbmSync.nextEnvelope = function (request) {
  return request ? FbmSync.protocol.request(Date.now().toString(36), request.url, request.body, request.meta) : null;
};
/** Dựng lại request đọc từ cursor; không lưu payload/cookie để retry không làm lộ bí mật. */
FbmSync.requestForCursor = function (state) {
  var cursor = state && state.cursor || {}, lookup, customerId, pageType;
  if (cursor.kind === 'authorize_customer') { return FbmSync.authorizeRequest('customer'); }
  if (cursor.kind === 'authorize_activity') { return FbmSync.authorizeRequest('activity'); }
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
  var safeKinds = ['authorize_customer', 'authorize_activity', 'lookup', 'customer_grid', 'activity_grid', 'activity_bulk_grid'], cursor = state && state.cursor || {}, limit = Number(state && state.retryLimit || 2), attempt = Number(state && state.retryCount || 0), request;
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
