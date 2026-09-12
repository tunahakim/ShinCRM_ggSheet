/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên. */
FbmSync.start = function (options) {
  // Mỗi call chỉ trả một request; ngữ cảnh nhiều bước nằm trong DocumentProperties.
  var current = FbmSync.stateRead();
  if (typeof FbmSync.recoverStaleRun === 'function') { current = FbmSync.recoverStaleRun(current).state; }
  // Tạm dừng là điểm dừng để người dùng chạy lại, không phải cursor đang chạy;
  // lần bấm mới phải tạo request FBM mới, tránh vẽ lại preview cũ.
  if (current.runId && ['idle', 'done', 'error', 'paused', 'conflict'].indexOf(current.phase) < 0) {
    var initialAuthorize = current.phase === 'checking_session' && current.cursor && current.cursor.kind === 'authorize_customer';
    var recent = Date.now() - Number(current.updatedAt || 0) <= 60000;
    var resumable = recent ? FbmSync.requestForCursor(current) : null;
    if (resumable && current.cursor && current.cursor.kind !== 'push_wait') {
      return { ok: true, request: FbmSync.nextEnvelope(resumable), status: FbmSync.statusView(), resumed: true };
    }
    if (initialAuthorize && recent) {
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authorizeRequest('customer')), status: FbmSync.statusView(), resumed: true };
    }
    if (!initialAuthorize) { return { ok: false, code: 'SYNC_ALREADY_RUNNING', status: FbmSync.statusView() }; }
  }
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(); }
  var opt = options || {}, state = FbmSync.stateStart('', 'checking_session', 0, { preserveConflicts: current.phase === 'conflict' });
  state.mode = opt.mode === 'write' ? 'write' : 'read';
  state.scan = opt.scan === 'activity_bulk' ? 'activity_bulk' : 'full';
  if (state.scan === 'activity_bulk') { state.mode = 'read'; }
  if (state.mode === 'write' && !FbmSync.writeAllowed()) {
    state.phase = 'idle'; state.runId = ''; state.message = 'Chưa cho phép ghi thật lên FBM.'; FbmSync.stateWrite(state);
    return { ok: false, code: 'SYNC_WRITES_DISABLED', status: FbmSync.statusView() };
  }
  if (typeof FbmSync.runPreflight === 'function') {
    var preflight = FbmSync.runPreflight({ mode: state.mode, scan: state.scan });
    state.metadata = state.metadata || {};
    state.metadata.preflight = preflight;
    state.metadata.preflightIssues = preflight.issues || [];
    if (typeof FbmSync.logPreflight === 'function') { FbmSync.logPreflight(preflight); }
    if (!preflight.ok) {
      var first = preflight.blocking[0] || {};
      state.phase = 'error'; state.entity = ''; state.cursor = {}; state.lastFailureCode = 'SYNC_PREFLIGHT_FAILED';
      state.lastError = 'Preflight thất bại: ' + String(first.message || 'Thiếu điều kiện trước phiên.');
      state.message = state.lastError;
      FbmSync.stateWrite(state);
      return { ok: false, code: 'SYNC_PREFLIGHT_FAILED', status: FbmSync.statusView(), error: state.lastError };
    }
  }
  state.cursor = { kind: 'authorize_customer' };
  state.message = 'Dang kiem tra phien FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authorizeRequest('customer')), status: FbmSync.statusView() };
};
/** Xử lý một trang pull; read mode chỉ preview, write mode qua WriteGate. */
FbmSync.pullRecords = function (entity, records, mode) {
  var state = FbmSync.stateRead(), count = (records || []).length;
  state.counts.completed += count;
  state.counts.total = Math.max(Number(state.counts.total || 0), Number(state.counts.completed || 0));
  if (!FbmSync.writeEnabled(mode)) {
    state.counts.skipped += count;
    state.message = 'Da doc ' + count + ' ban ghi (che do xem truoc, chua ghi Sheet).';
    FbmSync.stateWrite(state);
    return { ok: true, preview: true, written: 0, skipped: count };
  }
  var result = FbmSync.pullWrite(entity, records || []);
  state.counts.succeeded += Number(result.written || 0);
  state.counts.conflict += Number(result.conflicts || 0);
  state.counts.skipped += Number(result.skipped || 0);
  state.counts.error += result.ok ? 0 : count;
  FbmSync.stateWrite(state);
  return result;
};

/** Nhận token bootstrap và chuyển sang lookup hoặc đọc grid. */
FbmSync.authContinue = function (entity, response) {
  // Token gắn với phiên và phải lưu trước mọi request ghi.
  var auth = FbmSync.extractAuthorized(response), state = FbmSync.stateRead();
  if (!auth) { throw new Error('FBM khong tra ma authorized cho ' + entity + '.'); }
  state.session[entity === 'customer' ? 'customerAuthorized' : 'activityAuthorized'] = auth;
  if (entity === 'customer') {
    state.cursor = { kind: 'authorize_activity' };
    state.message = 'Da xac thuc Customer; dang xac thuc Activity...';
    FbmSync.stateWrite(state);
    return FbmSync.authorizeRequest('activity');
  }
  // Lookup is read-only in both modes; Category remains user-owned configuration.
  state.cursor = { kind: 'lookup', index: 0 };
  state.message = 'Dang kiem tra danh muc FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[0].controller, FbmSync.SYNC_LOOKUPS[0].key);
};

/** Tạo request trang Customer tiếp theo từ khóa cuối trang trước. */
FbmSync.customerNext = function (state, rows, total) {
  var cursor = state.cursor || {}, count = Number(cursor.count || 2000);
  if (!rows.length || rows.length < count || (total && Number(cursor.seen || 0) + rows.length >= total)) { return null; }
  var last = rows[rows.length - 1];
  cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
  cursor.pageValue = [last.ngay_gd || '', last.datetime0 || '', last.xorder || ''];
  cursor.seen = Number(cursor.seen || 0) + rows.length;
  state.cursor = cursor;
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 1, count: count, gridPageIndex: cursor.pageIndex, gridPageValue: cursor.pageValue, gridRefresh: false });
};

/** Khởi tạo cursor Activity cho danh sách Customer vừa đọc. */
FbmSync.activityForCustomers = function (state, customerContexts, customerNext, customerSeen, afterActivity) {
  var contexts = (customerContexts || []).map(function (item) { return typeof item === 'string' ? { sttRec: item, maKh: '' } : { sttRec: String(item.sttRec || item.stt_rec_kh || ''), maKh: String(item.maKh || item.ma_kh || '') }; }).filter(function (item) { return item.sttRec; });
  var customerIds = contexts.map(function (item) { return item.sttRec; });
  state.phase = 'pull_activity'; state.entity = 'activity';
  state.cursor = { kind: 'activity_grid', customerIds: customerIds, customerContexts: contexts, customerIndex: 0, pageIndex: -1, pageValue: null, count: 100, customerNext: customerNext || null, customerSeen: Number(customerSeen || 0), afterActivity: afterActivity || null };
  state.message = 'Dang doc giao dich cua khach hang...';
  FbmSync.stateWrite(state);
  return customerIds.length ? FbmSync.activityGridRequest(customerIds[0], { type: 0, count: 100, gridPageIndex: -1, gridRefresh: false }) : null;
};

/** Chuyển tiếp sau một batch Activity bổ sung mà không làm mất cursor GAS. */
FbmSync.activitySupplementNext = function (state, afterActivity) {
  var after = afterActivity || {};
  if (after.kind === 'rotation') {
    var rotation = FbmSync.activityRotationCustomerRequest();
    if (rotation) {
      state.cursor = { kind: 'activity_rotation_customer_grid', seen: Number(state.cursor && state.cursor.seen || 0), seenIds: state.cursor && state.cursor.seenIds || {} };
      state.message = 'Đang xoay 30 Customer để bắt giao dịch tạo lùi ngày...';
      FbmSync.stateWrite(state);
      return rotation;
    }
  }
  if (after.kind === 'done') { FbmSync.activityRotationSave(after.rows || []); }
  state.cursor = { kind: 'activity_supplement_done' };
  state.phase = 'done'; state.entity = ''; state.message = 'Dong bo hoan tat.'; FbmSync.stateWrite(state);
  return null;
};

/** Chuyển từ lookup sang grid Customer, kể cả khi lookup chỉ đọc bị lỗi. */
FbmSync.beginCustomerPull = function (state) {
  if (state.scan === 'activity_bulk') { return FbmSync.beginActivityBulkPull(state); }
  FbmSync.prepareCategoryGate(state);
  state.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 };
  state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Dang doc khach hang tu FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 0, count: 2000, gridPageIndex: -1, gridRefresh: false });
};

/** Khởi tạo quét bulk Activity; state giữ cursor và tập ID, không giữ trong Extension. */
FbmSync.beginActivityBulkPull = function (state) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  state.cursor = { kind: 'activity_bulk_grid', type: 0, pageIndex: -1, pageValue: null, count: 100, seen: 0, seenIds: {} };
  state.message = 'Đang đọc bulk giao dịch từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.activityBulkRequest({ type: 0, count: 100, gridPageIndex: -1, gridRefresh: false });
};

/** Chốt một trang bulk Activity hoặc dựng request trang kế tiếp từ composite key. */
FbmSync.activityBulkNext = function (state, grid) {
  var cursor = state.cursor || {}, rows = grid && grid.rows || [], count = Number(cursor.count || 100), total = Number(grid && grid.total || 0);
  cursor.seenIds = cursor.seenIds || {};
  rows.forEach(function (row) { var id = String(row && row.id || '').trim(); if (id) { cursor.seenIds[id] = true; } });
  cursor.seen = Number(cursor.seen || 0) + rows.length;
  if (rows.length && rows.length >= count && (!total || cursor.seen < total)) {
    var last = rows[rows.length - 1];
    cursor.type = 1; cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
    cursor.pageValue = [last.end_date || '', last.datetime0 || '', last.id || '', last.line_nbr || 0];
    state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.activityBulkRequest({ type: 1, count: count, gridPageIndex: cursor.pageIndex, gridPageValue: cursor.pageValue, gridRefresh: false });
  }
  state.metadata = state.metadata || {};
  state.metadata.activityBulkSeen = cursor.seenIds;
  state.metadata.activityBulkMissing = typeof FbmSync.activityBulkMissing === 'function'
    ? FbmSync.activityBulkMissing(FbmSync.readLocal('activity'), cursor.seenIds)
    : [];
  var catchupRequest = typeof FbmSync.activityCatchupCustomerRequest === 'function' ? FbmSync.activityCatchupCustomerRequest() : null;
  if (catchupRequest) {
    state.cursor = { kind: 'activity_catchup_customer_grid', seen: cursor.seen, seenIds: cursor.seenIds };
    state.message = 'Đang tìm Customer có giao dịch mới hơn mốc local...';
    FbmSync.stateWrite(state);
    return catchupRequest;
  }
  var rotationRequest = typeof FbmSync.activityRotationCustomerRequest === 'function' ? FbmSync.activityRotationCustomerRequest() : null;
  if (rotationRequest) {
    state.cursor = { kind: 'activity_rotation_customer_grid', seen: cursor.seen, seenIds: cursor.seenIds };
    state.message = 'Đang xoay 30 Customer để bắt giao dịch tạo lùi ngày...';
    FbmSync.stateWrite(state);
    return rotationRequest;
  }
  state.cursor = { kind: 'activity_bulk_done', seen: cursor.seen, seenIds: cursor.seenIds };
  state.message = 'Đã đọc xong bulk giao dịch FBM.';
  FbmSync.stateWrite(state);
  return null;
};

/** Tiếp tục đúng một bước từ response Extension và lưu cursor trước khi trả về. */
FbmSync.continue = function (rawResponse) {
  // Tiến đúng một bước cursor và lưu state trước khi trả request kế tiếp.
  var state = FbmSync.stateRead();
  if (typeof FbmSync.recoverStaleRun === 'function') {
    var recovered = FbmSync.recoverStaleRun(state);
    if (recovered.recovered) { return { ok: false, status: FbmSync.statusView(), error: recovered.state.lastError, stale: true }; }
    state = recovered.state;
  }
  var cursor = state.cursor || {}, response;
  if (FbmSync.traceImport) {
    var transportTrace = rawResponse && rawResponse.transport && rawResponse.transport.trace;
    if (transportTrace) { FbmSync.traceImport(transportTrace, { runId: state.runId, requestId: state.activeRequestId, phase: state.phase, operation: cursor.operation, entity: state.entity, recordId: state.current }); }
  }
  if (FbmSync.traceEvent) {
    var responseMeta = FbmSync.traceResponse ? FbmSync.traceResponse(rawResponse) : {};
    FbmSync.traceEvent('fbm_response_received', { requestId: rawResponse && rawResponse.trace && rawResponse.trace.requestId || state.activeRequestId, httpStatus: responseMeta.httpStatus, responseLength: responseMeta.responseLength });
  }
  response = FbmSync.protocol.parse(rawResponse);
  if (response && response._transport && response._transport.payloadCookie) {
    state.session.cookie = String(response._transport.payloadCookie);
    var compact = state.session.cookie.indexOf('FHN_CRM_App') >= 0 ? state.session.cookie.slice(0, state.session.cookie.indexOf('FHN_CRM_App')) : '';
    if (!state.session.userId && compact.length > 9) { state.session.userId = compact.slice(4, -5); }
    FbmSync.stateWrite(state);
  }
  // Phân loại trên wrapper HTTP gốc; parse trước sẽ làm mất status và biến lỗi vận chuyển thành Bugs giả.
  var success = FbmSync.protocol.assertSuccess(rawResponse);
  if (!success.ok) {
    var retryRequest = FbmSync.retryRead(state, success);
    if (retryRequest) {
      return { ok: true, request: FbmSync.nextEnvelope(retryRequest), status: FbmSync.statusView(), retrying: true };
    }
    var failureReason = (success.bug && (success.bug.Message || success.bug.message)) || 'FBM tra ve loi nghiep vu';
    if (cursor.kind === 'push_wait' && cursor.candidate) {
      if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
        return FbmSync.continueAfterPushVerificationError(state, cursor, { code: success.code, status: success.status, fieldName: success.bug && success.bug.FieldName, reason: failureReason });
      }
      return FbmSync.continueAfterPushError(state, cursor, { code: success.code, status: success.status, fieldName: success.bug && success.bug.FieldName, reason: failureReason });
    }
    state.lastFailureCode = String(success.code || 'FBM_ERROR');
    state.retryable = success.retryable === true;
    if (success.code === 'SESSION_EXPIRED') {
      state.session.customerAuthorized = ''; state.session.activityAuthorized = '';
      state.message = 'Phiên FBM đã hết hạn; hãy đăng nhập lại trên tab FBM rồi chạy lại.';
    } else {
      state.message = failureReason;
    }
    if (cursor.kind === 'lookup') {
      var failedLookup = FbmSync.SYNC_LOOKUPS[Number(cursor.index || 0)];
      if (failedLookup) { failureReason = 'Không đọc được danh mục ' + failedLookup.key + ' (' + failedLookup.controller + '): ' + failureReason; }
      state.metadata = state.metadata || {};
      state.metadata.categoryLookupFailed = true;
      state.metadata.categoryBlocks = (state.metadata.categoryBlocks || []).concat([{ source: failedLookup ? failedLookup.key : 'Category', reason: failureReason }]);
      state.session.lookups[failedLookup ? failedLookup.key : ''] = [];
      FbmSync.beginCustomerPull(state);
      state.message = 'Không đọc được danh mục; vẫn tiếp tục chiều lấy về, chiều đẩy sẽ tạm dừng.';
      FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.customerGridRequest({ type: 0, count: 2000, gridPageIndex: -1, gridRefresh: false })), status: FbmSync.statusView() };
    }
    state.phase = 'error'; state.lastError = failureReason; FbmSync.stateWrite(state);
    return { ok: false, status: FbmSync.statusView(), error: success.bug };
  }
  state.retryCount = 0;
  state.retryable = false;
  state.lastFailureCode = '';
  FbmSync.stateWrite(state);

  if (cursor.kind === 'push_wait') {
    try {
      var pushRequest = FbmSync.continuePush(state, response);
      return { ok: true, request: FbmSync.nextEnvelope(pushRequest), status: FbmSync.statusView() };
    } catch (pushError) {
      if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
        return FbmSync.continueAfterPushVerificationError(state, cursor, pushError && pushError.message || pushError);
      }
      return FbmSync.continueAfterPushError(state, cursor, pushError && pushError.message || pushError);
    }
  }

  // Hai bước đầu chỉ lấy authorized token cho từng controller.
  if (cursor.kind === 'authorize_customer') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('customer', response)), status: FbmSync.statusView() };
  }
  if (cursor.kind === 'authorize_activity') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('activity', response)), status: FbmSync.statusView() };
  }
  // Write mode phải nạp danh mục trước khi dựng payload ghi.
  if (cursor.kind === 'lookup') {
    var lookup = FbmSync.SYNC_LOOKUPS[Number(cursor.index || 0)], lookupData = FbmSync.lookupPayload(response);
    // FBM trả `{TotalRowCount, Rows}`; giữ cả object để đối chiếu Category.
    state.session.lookups[lookup.key] = lookupData;
    var lookupIndex = Number(cursor.index || 0) + 1;
    if (lookupIndex < FbmSync.SYNC_LOOKUPS.length) {
      state.cursor.index = lookupIndex; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[lookupIndex].controller, FbmSync.SYNC_LOOKUPS[lookupIndex].key)), status: FbmSync.statusView() };
    }
    if (state.mode === 'write') {
      // Category is user-owned configuration; sync only reads and validates it.
      state.message = 'Đã đọc danh mục FBM; đang đối chiếu Category...';
      FbmSync.stateWrite(state);
    }
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.beginCustomerPull(state)), status: FbmSync.statusView() };
  }
  // Customer là grid cha; mỗi trang xong sẽ mở Activity con của trang đó.
  if (cursor.kind === 'customer_grid') {
    var customerGrid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields), categoryGate = state.metadata && state.metadata.categoryGate || {}, eligibleCustomerRows = customerGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }), customerRecords = eligibleCustomerRows.map(function (row) { return FbmSync.customerRecord(row, categoryGate); });
    state.metadata.customerFields = customerGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('customer', customerRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'customer', customerRecords);
    FbmSync.stateWrite(state);
    var customerContexts = eligibleCustomerRows.map(function (row) { return { sttRec: String(row.stt_rec_kh || '').trim(), maKh: String(row.ma_kh || '').trim() }; }).filter(function (item) { return item.sttRec; });
    var nextCustomer = FbmSync.customerNext(state, customerGrid.rows, customerGrid.total);
    var activityRequest = FbmSync.activityForCustomers(state, customerContexts, nextCustomer, state.cursor.seen);
    if (activityRequest) { return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView(), imported: customerRecords.length }; }
    if (nextCustomer) { state.cursor = { kind: 'customer_grid', type: 1, pageIndex: nextCustomer.body.gridPageIndex, pageValue: nextCustomer.body.gridPageValue, count: nextCustomer.body.count, seen: Number(state.cursor.customerSeen || 0) }; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(nextCustomer), status: FbmSync.statusView() }; }
    if (state.mode === 'write' && FbmSync.writeEnabled(state.mode)) { if (FbmSync.stopPushOnConflicts && FbmSync.stopPushOnConflicts(state)) { return { ok: true, request: null, status: FbmSync.statusView() }; } state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView() }; }
    if (state.mode === 'write') { FbmSync.markMissingAfterFullScan('customer', state); FbmSync.markMissingAfterFullScan('activity', state); }
    state.phase = 'done'; state.message = 'Dong bo hoan tat.'; FbmSync.stateWrite(state); return { ok: true, status: FbmSync.statusView() };
  }
  // Activity được quét theo từng stt_rec, rồi mới quay lại trang Customer kế.
  if (cursor.kind === 'activity_grid') {
    var activityGrid = FbmSync.rowsToRecords('activity', response, state.metadata && state.metadata.activityFields), activityGate = state.metadata && state.metadata.categoryGate || {}, parentContext = (cursor.customerContexts || [])[Number(cursor.customerIndex || 0)] || {}, activityRecords = activityGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, activityGate, parentContext); });
    state.metadata.activityFields = activityGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('activity', activityRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'activity', activityRecords);
    FbmSync.stateWrite(state);
    var hasNext = activityGrid.rows.length >= Number(cursor.count || 100) && activityGrid.rows.length > 0;
    if (hasNext) {
      var lastActivity = activityGrid.rows[activityGrid.rows.length - 1];
      state.cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
      state.cursor.pageValue = [lastActivity.end_date || '', lastActivity.datetime0 || '', lastActivity.id || '', lastActivity.line_nbr || 0];
      FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerIds[cursor.customerIndex], { type: 1, count: cursor.count, gridPageIndex: state.cursor.pageIndex, gridPageValue: state.cursor.pageValue, gridRefresh: false })), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    var nextIndex = Number(cursor.customerIndex || 0) + 1;
    if (nextIndex < cursor.customerIds.length) {
      state.cursor.customerIndex = nextIndex; state.cursor.pageIndex = -1; state.cursor.pageValue = null; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerIds[nextIndex], { type: 0, count: cursor.count, gridPageIndex: -1, gridRefresh: false })), status: FbmSync.statusView() };
    }
    if (cursor.customerNext) {
      var next = cursor.customerNext; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: next.body.gridPageIndex, pageValue: next.body.gridPageValue, count: next.body.count, seen: Number(cursor.customerSeen || 0) }; state.phase = 'pull_customer'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(next), status: FbmSync.statusView() };
    }
    if (cursor.afterActivity) {
      var supplementRequest = FbmSync.activitySupplementNext(state, cursor.afterActivity);
      if (supplementRequest) { return { ok: true, request: FbmSync.nextEnvelope(supplementRequest), status: FbmSync.statusView() }; }
      return { ok: true, status: FbmSync.statusView(), imported: activityRecords.length };
    }
    if (state.mode === 'write' && FbmSync.writeEnabled(state.mode)) {
      if (FbmSync.stopPushOnConflicts && FbmSync.stopPushOnConflicts(state)) { return { ok: true, request: null, status: FbmSync.statusView(), imported: activityRecords.length }; }
      state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    if (state.mode === 'write') { FbmSync.markMissingAfterFullScan('customer', state); FbmSync.markMissingAfterFullScan('activity', state); }
    state.phase = 'done'; state.entity = ''; state.message = 'Dong bo hoan tat.'; FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: activityRecords.length };
  }
  if (cursor.kind === 'activity_bulk_grid') {
    var bulkGrid = FbmSync.rowsToRecords('activity', response, state.metadata && state.metadata.activityFields), bulkGate = state.metadata && state.metadata.categoryGate || {}, bulkRecords = bulkGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, bulkGate); });
    state.metadata.activityFields = bulkGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('activity', bulkRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'activity', bulkRecords);
    var bulkRequest = FbmSync.activityBulkNext(state, bulkGrid);
    if (bulkRequest) { return { ok: true, request: FbmSync.nextEnvelope(bulkRequest), status: FbmSync.statusView(), imported: bulkRecords.length }; }
    state.phase = 'done'; state.entity = ''; state.message = 'Đã đọc xong bulk giao dịch FBM.'; FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: bulkRecords.length, missing: state.metadata.activityBulkMissing || [] };
  }
  if (cursor.kind === 'activity_catchup_customer_grid' || cursor.kind === 'activity_rotation_customer_grid') {
    var supplementGrid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields);
    state.metadata.customerFields = supplementGrid.fields;
    FbmSync.stateWrite(state);
    var supplementContexts = supplementGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }).map(function (row) { return { sttRec: String(row.stt_rec_kh || '').trim(), maKh: String(row.ma_kh || '').trim() }; }).filter(function (item) { return item.sttRec; });
    var afterKind = cursor.kind === 'activity_catchup_customer_grid' ? { kind: 'rotation' } : { kind: 'done', rows: supplementGrid.rows };
    var supplementActivityRequest = FbmSync.activityForCustomers(state, supplementContexts, null, 0, afterKind);
    if (supplementActivityRequest) { return { ok: true, request: FbmSync.nextEnvelope(supplementActivityRequest), status: FbmSync.statusView() }; }
    var emptySupplement = FbmSync.activitySupplementNext(state, afterKind);
    return { ok: true, request: emptySupplement ? FbmSync.nextEnvelope(emptySupplement) : null, status: FbmSync.statusView() };
  }
  state.phase = 'error'; state.lastError = 'Khong nhan dien duoc cursor dong bo.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};
