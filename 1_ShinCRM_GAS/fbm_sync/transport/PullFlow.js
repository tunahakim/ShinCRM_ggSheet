/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên. */
FbmSync.start = function (options) {
  // Mỗi call chỉ trả một request; ngữ cảnh nhiều bước nằm trong DocumentProperties.
  var opt = options || {};
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) {
    return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; hãy bật công tắc tổng trước khi chạy.', status: FbmSync.statusView() };
  }
  var current = FbmSync.stateRead();
  if (typeof FbmSync.recoverStaleRun === 'function') { current = FbmSync.recoverStaleRun(current).state; }
  // Tạm dừng là điểm dừng để người dùng chạy lại, không phải cursor đang chạy;
  // lần bấm mới phải tạo request FBM mới, tránh vẽ lại preview cũ.
  if (current.runId && ['idle', 'done', 'error', 'paused', 'conflict'].indexOf(current.phase) < 0) {
    if (opt.manual === true && String(current.origin || '') === 'background') {
      current.metadata = current.metadata || {};
      current.metadata.manualPending = { mode: opt.mode || 'read', requestedAt: Date.now() };
      current.message = 'Đã nhận yêu cầu thủ công; phiên nền sẽ dừng sau response FBM hiện tại.';
      FbmSync.stateWrite(current);
      return { ok: false, code: 'SYNC_BACKGROUND_STOPPING', status: FbmSync.statusView() };
    }
    if (current.activeRequestId) {
      return { ok: false, code: 'REQUEST_IN_FLIGHT', request: null, message: 'Đã có request FBM đang chờ response; không cấp request chồng.', status: FbmSync.statusView() };
    }
    var initialRequest = current.phase === 'checking_session' && current.cursor && ['authorize_customer', 'identity_user_grid'].indexOf(current.cursor.kind) >= 0;
    var recent = Date.now() - Number(current.updatedAt || 0) <= 60000;
    var resumable = recent ? FbmSync.requestForCursor(current) : null;
    if (resumable && current.cursor && current.cursor.kind !== 'push_wait') {
      var resumeProbe = typeof FbmSync.sessionGateResumeProbeRequest === 'function'
        ? FbmSync.sessionGateResumeProbeRequest(current, resumable, 'Đang probe lại phiên FBM trước khi tiếp tục cursor đã lưu...')
        : FbmSync.nextEnvelope(resumable);
      return { ok: true, request: resumeProbe, status: FbmSync.statusView(), resumed: true };
    }
    if (initialRequest && recent && current.cursor.kind === 'authorize_customer') {
      return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }), status: FbmSync.statusView(), resumed: true };
    }
    if (!initialRequest) { return { ok: false, code: 'SYNC_ALREADY_RUNNING', status: FbmSync.statusView() }; }
  }
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(opt.origin === 'background' ? 'background' : 'pull'); }
  var state = FbmSync.stateStart('', 'checking_session', 0);
  state.origin = opt.origin === 'background' ? 'background' : 'manual';
  state.mode = opt.mode === 'write' || opt.mode === 'push' ? opt.mode : opt.mode === 'check' ? 'check' : 'read';
  state.scan = opt.scan === 'activity_bulk' ? 'activity_bulk' : opt.scan === 'identity_check' ? 'identity_check' : opt.scan === 'identity_probe' ? 'identity_probe' : opt.scan === 'detail' ? 'detail' : 'full';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'run', { mode: state.mode, scan: state.scan, origin: state.origin });
    FbmSync.businessStepStart(state, 'preflight_hash', { mode: state.mode, scan: state.scan, origin: state.origin });
  }
  state.identityTarget = state.scan === 'identity_check' && typeof FbmSync.identityCheckTarget === 'function' ? FbmSync.identityCheckTarget(opt.identity) : null;
  var accountSettings = typeof FbmSync.accountSettingsRead === 'function' ? FbmSync.accountSettingsRead() : {};
  state.activitySince = String(accountSettings && accountSettings.activitySince || '').trim();
  if (state.scan === 'activity_bulk') { state.mode = 'read'; }
  if (state.origin === 'background') { state.backgroundDetail = opt.detail || null; state.detailCustomerLimit = state.scan === 'detail' ? Math.max(1, Math.min(50, Math.floor(Number(opt.detail && opt.detail.customersPerRun || 50)))) : 0; }
  if (typeof FbmSync.runPreflight === 'function') {
    var preflight = FbmSync.runPreflight({ mode: state.mode, origin: state.origin, scan: state.scan });
    state.metadata = state.metadata || {};
    state.metadata.preflight = preflight;
    state.metadata.preflightIssues = preflight.issues || [];
    if (typeof FbmSync.logPreflight === 'function') { FbmSync.logPreflight(preflight); }
    if (typeof FbmSync.businessStepFinish === 'function') {
      FbmSync.businessStepFinish(state, 'preflight_hash', preflight.ok ? 'ok' : 'error', Object.assign({}, preflight.hashSummary || {}, { candidateCount: Number(preflight.candidateCount || 0), errors: Number(preflight.blocking && preflight.blocking.length || 0), skipped: Number(preflight.warnings && preflight.warnings.length || 0), error: !preflight.ok && String(preflight.blocking[0] && preflight.blocking[0].message || '') }));
    }
    if (!preflight.ok) {
      var first = preflight.blocking[0] || {};
      state.phase = 'error'; state.entity = ''; state.cursor = {}; state.lastFailureCode = 'SYNC_PREFLIGHT_FAILED';
      state.lastError = 'Preflight thất bại: ' + String(first.message || 'Thiếu điều kiện trước phiên.');
      state.message = state.lastError;
      FbmSync.stateWrite(state);
      return { ok: false, code: 'SYNC_PREFLIGHT_FAILED', status: FbmSync.statusView(), error: state.lastError };
    }
    // A large push requires an explicit human approval before GAS gives out
    // even the first FBM request. The candidate count comes from the same
    // server-side preflight that will guard the actual push.
    if ((state.mode === 'write' || state.mode === 'push') && Number(preflight.candidateCount || 0) > 0 && Number(preflight.candidateCount || 0) >= FbmSync.approvalThreshold()) {
      state.phase = 'awaiting_approval';
      state.entity = '';
      state.cursor = { kind: 'push_approval', candidateCount: Number(preflight.candidateCount || 0) };
      state.message = 'Có ' + Number(preflight.candidateCount || 0) + ' bản ghi thay đổi; cần người dùng chấp thuận trước khi ghi FBM.';
      state.metadata.approvalRequired = true;
      state.metadata.approvalCount = Number(preflight.candidateCount || 0);
      FbmSync.stateWrite(state);
      return { ok: true, request: null, status: FbmSync.statusView(), approvalRequired: true };
    }
  }
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'session', { mode: state.mode, scan: state.scan }); }
  if (state.scan === 'identity_probe') {
    // User grid đã tự chứng minh cookie/session đọc được. Không lấy Authorized
    // chỉ để tự động điền, vì token này không được probe sử dụng.
    state.cursor = { kind: 'identity_user_grid' };
    state.message = 'Đang đọc thông tin tài khoản FBM...';
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.sessionSystemEnvelope('identity_user_grid'), status: FbmSync.statusView() };
  }
  state.cursor = { kind: 'authorize_customer' };
  state.message = 'Đang kiểm tra phiên FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }), status: FbmSync.statusView() };
};
/** Xử lý một trang pull; read/write ghi Sheet, check/push chỉ xem trước. */
FbmSync.pullRecords = function (entity, records, mode) {
  var state = FbmSync.stateRead(), count = (records || []).length;
  var pullStep = 'pull_' + String(entity || ''), reconcileStep = 'reconcile_' + String(entity || '');
  state.counts.completed += count;
  state.counts.total = Math.max(Number(state.counts.total || 0), Number(state.counts.completed || 0));
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, pullStep, { received: count }); }
  if (!FbmSync.canWriteSheet(mode)) {
    state.counts.skipped += count;
    state.message = 'Đã đọc ' + count + ' bản ghi (chế độ không ghi Sheet).';
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, reconcileStep, { received: count, skipped: count }); }
    FbmSync.stateWrite(state);
    return { ok: true, preview: true, written: 0, skipped: count };
  }
  var result = FbmSync.pullWrite(entity, records || []);
  state.counts.succeeded += Number(result.written || 0);
  state.counts.conflict += Number(result.conflicts || 0);
  state.metadata.conflictCount = Number(state.metadata.conflictCount || 0) + Number(result.conflicts || 0);
  state.counts.skipped += Number(result.skipped || 0);
  if (typeof FbmSync.businessStepAdd === 'function') {
    FbmSync.businessStepAdd(state, reconcileStep, { received: count, written: Number(result.written || 0), conflict: Number(result.conflicts || 0), skipped: Number(result.skipped || 0), sheetWriteBatches: Number(result.sheetWriteBatches || 0) });
  }
  FbmSync.stateWrite(state);
  return result;
};

/** Nhận token bootstrap và chuyển sang lookup hoặc đọc grid. */
FbmSync.authContinue = function (entity, response) {
  // Token gắn với phiên và phải lưu trước mọi request ghi.
  var auth = FbmSync.extractAuthorized(response), state = FbmSync.stateRead(), identity = typeof FbmSync.extractSessionIdentity === 'function' ? FbmSync.extractSessionIdentity(response) : {};
  if (!auth) { throw new Error('FBM không trả mã authorized cho ' + entity + '.'); }
  if (identity.userId) { state.session.userId = identity.userId; }
  if (identity.accountName) { state.session.accountName = identity.accountName; }
  if ((state.mode === 'write' || state.mode === 'push') && typeof FbmSync.identityPreflight === 'function') {
    var identityCheck = FbmSync.identityStatus({ userId: state.session.userId, accountName: state.session.accountName });
    if (identityCheck.status === 'REBIND_REQUIRED') {
      state.phase = 'error'; state.lastFailureCode = 'REBIND_REQUIRED'; state.lastError = 'Liên kết tài khoản FBM không khớp; chiều ghi đã bị dừng.'; state.message = state.lastError; FbmSync.stateWrite(state);
      return null;
    }
  }
  state.session[entity === 'customer' ? 'customerAuthorized' : 'activityAuthorized'] = auth;
  if (entity === 'customer') {
    if (state.scan === 'identity_probe') {
      state.cursor = { kind: 'identity_user_grid' }; state.phase = 'checking_session'; state.entity = '';
      state.message = 'Đã xác thực phiên; đang đọc thông tin tài khoản FBM...';
      FbmSync.stateWrite(state);
      return FbmSync.sessionSystemRequest('identity_user_grid');
    }
    if (state.scan === 'identity_check') {
      FbmSync.identityCheckBegin(state);
      state.phase = 'pull_customer'; state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 };
      state.message = 'Đang kiểm tra liên kết Customer FBM...';
      FbmSync.stateWrite(state);
      return FbmSync.identityCheckCustomerRequest({ type: 0, count: 2000, gridPageIndex: -1, gridPageValue: null, gridRefresh: false });
    }
    state.cursor = { kind: 'authorize_activity' };
    state.message = 'Đã xác thực Customer; đang xác thực Activity...';
    FbmSync.stateWrite(state);
    return FbmSync.sessionSystemRequest('authorize', { entity: 'activity' });
  }
  // Lookup is read-only in both modes; Category remains user-owned configuration.
  if (typeof FbmSync.businessStepFinish === 'function') { FbmSync.businessStepFinish(state, 'session', 'ok', {}); }
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'category', { mode: state.mode, scan: state.scan }); }
  state.cursor = { kind: 'lookup', index: 0 };
  state.message = 'Đang kiểm tra danh mục FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[0].controller, FbmSync.SYNC_LOOKUPS[0].key);
};

/** Tạo request trang Customer tiếp theo từ khóa cuối trang trước. */
FbmSync.customerNext = function (state, rows, total) {
  var cursor = state.cursor || {}, count = Number(cursor.count || 2000);
  var seenAfterPage = Number(cursor.seen || 0) + rows.length;
  if (state.scan === 'detail' && !rows.length && typeof FbmSync.detailCursorClear === 'function') { FbmSync.detailCursorClear(); }
  if (state.scan === 'detail' && seenAfterPage >= Number(state.detailCustomerLimit || 50)) {
    var exhausted = !rows.length || rows.length < count || (total && seenAfterPage >= total);
    if (exhausted) {
      if (typeof FbmSync.detailCursorClear === 'function') { FbmSync.detailCursorClear(); }
    } else if (typeof FbmSync.detailCursorWrite === 'function') {
      var detailLast = rows[rows.length - 1];
      FbmSync.detailCursorWrite({
        pageIndex: Number(cursor.pageIndex || -1) + 1,
        pageValue: FbmSync.customerPageValue(detailLast)
      });
    }
    return null;
  }
  if (!rows.length || rows.length < count || (total && Number(cursor.seen || 0) + rows.length >= total)) { return null; }
  var last = rows[rows.length - 1];
  cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
  cursor.pageValue = state.scan === 'identity_check'
    ? [last.stt_rec_kh || '']
    : FbmSync.customerPageValue(last);
  cursor.seen = Number(cursor.seen || 0) + rows.length;
  state.cursor = cursor;
  FbmSync.stateWrite(state);
  return (state.scan === 'identity_check' ? FbmSync.identityCheckCustomerRequest : FbmSync.customerGridRequest)({ type: 1, count: count, gridPageIndex: cursor.pageIndex, gridPageValue: cursor.pageValue, gridRefresh: false });
};

/** Đếm khách đã nhận trong lượt quét; tổng lấy ở trang đầu vì FBM chỉ đếm `TotalRowCount` ở trang đầu, trang sau trả 0 (Nghiên cứu FBM ch03 mục 3.3). */
FbmSync.customerScanRecord = function (state, grid, firstPage) {
  state.metadata = state.metadata || {};
  var scan = firstPage ? { total: Number(grid && grid.total || 0), seen: 0 } : (state.metadata.customerScan || { total: 0, seen: 0 });
  scan.seen = Number(scan.seen || 0) + (grid && grid.rows ? grid.rows.length : 0);
  state.metadata.customerScan = scan;
};

/**
 * Kết thúc lượt đọc. Chỉ đánh "không thấy bên FBM" khi lượt đã nhận đủ số khách FBM báo ở trang đầu: lượt dừng sớm vì phân trang hỏng mà vẫn đánh thì mọi khách chưa quét tới bị đánh sai (gặp thật 2026-10-07: 1.262/1.312 khách).
 * Thiếu tổng hoặc nhận chưa đủ thì phiên kết thúc lỗi `FBM_SCAN_INCOMPLETE` để Sidebar và Log đều thấy; dữ liệu đã đọc vẫn giữ.
 */
FbmSync.finishPullRun = function (state) {
  state.cursor = {}; state.entity = '';
  if (FbmSync.canWriteSheet(state.mode) && state.scan !== 'detail') {
    var scan = state.metadata && state.metadata.customerScan || {}, total = Number(scan.total || 0), seen = Number(scan.seen || 0);
    if (seen < total || (!total && seen > 0)) {
      state.phase = 'error'; state.lastFailureCode = 'FBM_SCAN_INCOMPLETE';
      state.lastError = 'Lượt quét chỉ nhận ' + seen + '/' + (total || '?') + ' khách FBM nên không đánh dấu bản ghi "không thấy bên FBM". Dữ liệu đã đọc vẫn được ghi; báo người phụ trách kỹ thuật kiểm tra phân trang Customer.';
      state.message = state.lastError;
      FbmSync.stateWrite(state);
      return false;
    }
    FbmSync.markMissingAfterFullScan('customer', state);
    FbmSync.markMissingAfterFullScan('activity', state);
  }
  state.phase = 'done'; state.message = FbmSync.DONE_MESSAGE;
  FbmSync.stateWrite(state);
  return true;
};

/** Khởi tạo cursor Activity cho danh sách Customer vừa đọc. */
FbmSync.activityForCustomers = function (state, customerContexts, customerNext, customerSeen, afterActivity) {
  var contexts = (customerContexts || []).map(function (item) { return typeof item === 'string' ? { sttRec: item, maKh: '' } : { sttRec: String(item.sttRec || item.stt_rec_kh || ''), maKh: String(item.maKh || item.ma_kh || '') }; }).filter(function (item) { return item.sttRec; });
  state.phase = 'pull_activity'; state.entity = 'activity';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
    FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  }
  state.cursor = { kind: 'activity_grid', customerContexts: contexts, customerIndex: 0, pageIndex: -1, pageValue: null, count: 100, customerNext: customerNext || null, customerSeen: Number(customerSeen || 0), afterActivity: afterActivity || null };
  state.message = 'Đang đọc giao dịch của khách hàng...';
  FbmSync.stateWrite(state);
  return contexts.length ? FbmSync.activityGridRequest(contexts[0].sttRec, { type: 0, count: 100, gridPageIndex: -1, gridRefresh: false }) : null;
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
  if (after.kind === 'done') { FbmSync.activityRotationSave(after.rotation || FbmSync.activityRotationNext([])); }
  state.cursor = {};
  state.phase = 'done'; state.entity = ''; state.message = FbmSync.DONE_MESSAGE; FbmSync.stateWrite(state);
  return null;
};

/** Chuyển từ lookup sang grid Customer, kể cả khi lookup chỉ đọc bị lỗi. */
FbmSync.beginCustomerPull = function (state) {
  if (state.scan === 'activity_bulk') { return FbmSync.beginActivityBulkPull(state); }
  if (state.mode === 'push') {
    FbmSync.prepareCategoryGate(state);
    state.phase = 'push'; state.entity = 'customer'; state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    state.message = 'Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...';
    FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  FbmSync.prepareCategoryGate(state);
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_customer', { mode: state.mode, scan: state.scan, entity: 'customer' });
    FbmSync.businessStepStart(state, 'reconcile_customer', { mode: state.mode, scan: state.scan, entity: 'customer' });
  }
  if (FbmSync.canWriteSheet(state.mode)) {
    state.metadata = state.metadata || {};
    state.metadata.seen = state.metadata.seen || { customer: {}, activity: {} };
    FbmSync.seenStoreBegin('customer', FbmSync.readLocal('customer'));
    FbmSync.seenStoreBegin('activity', FbmSync.readLocal('activity'));
    state.metadata.seen.customer = { initialized: true };
    state.metadata.seen.activity = { initialized: true };
  }
  var customerCount = state.scan === 'detail' ? Math.max(1, Math.min(FbmSync.CUSTOMER_PAGE_ROWS, Number(state.detailCustomerLimit || FbmSync.CUSTOMER_PAGE_ROWS))) : FbmSync.CUSTOMER_PAGE_ROWS;
  var detailCursor = state.scan === 'detail' && typeof FbmSync.detailCursorRead === 'function' ? FbmSync.detailCursorRead() : null;
  var detailPageIndex = detailCursor ? Number(detailCursor.pageIndex || 0) : -1;
  var detailPageValue = detailCursor && Array.isArray(detailCursor.pageValue) ? detailCursor.pageValue : null;
  state.cursor = { kind: 'customer_grid', type: detailPageIndex >= 0 ? 1 : 0, pageIndex: detailPageIndex, pageValue: detailPageValue, count: customerCount };
  state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Đang đọc khách hàng từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 0, count: customerCount, gridPageIndex: -1, gridRefresh: false });
};

/** Khởi tạo quét bulk Activity; tập đã thấy nằm trong bitmap phân mảnh của GAS. */
FbmSync.beginActivityBulkPull = function (state) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
    FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  }
  FbmSync.seenStoreBegin('activity_bulk', FbmSync.readLocal('activity'));
  state.cursor = { kind: 'activity_bulk_grid', type: 0, pageIndex: -1, pageValue: null, count: 100, seen: 0 };
  state.message = 'Đang đọc bulk giao dịch từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.activityBulkRequest({ type: 0, count: 100, gridPageIndex: -1, gridRefresh: false });
};

/** Chốt một trang bulk Activity hoặc dựng request trang kế tiếp từ composite key. */
FbmSync.activityBulkNext = function (state, grid) {
  var cursor = state.cursor || {}, rows = grid && grid.rows || [], count = Number(cursor.count || 100), total = Number(grid && grid.total || 0);
  var localActivities = FbmSync.readLocal('activity');
  FbmSync.seenStoreMark('activity_bulk', localActivities, rows);
  cursor.seen = Number(cursor.seen || 0) + rows.length;
  if (rows.length && rows.length >= count && (!total || cursor.seen < total)) {
    var last = rows[rows.length - 1];
    if (!cursor.transport && typeof FbmSync.activityBulkProjection === 'function') { cursor.transport = FbmSync.activityBulkProjection(grid.fields); }
    cursor.type = 1; cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
    cursor.pageValue = [last.end_date || '', last.datetime0 || '', last.id || '', last.line_nbr || 0];
    state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.activityBulkRequest({ type: 1, count: count, gridPageIndex: cursor.pageIndex, gridPageValue: cursor.pageValue, gridRefresh: false, transport: cursor.transport });
  }
  state.metadata = state.metadata || {};
  var missingResult = typeof FbmSync.writeActivityBulkMissing === 'function' ? FbmSync.writeActivityBulkMissing(localActivities) : { total: 0, written: 0, sample: [] };
  state.metadata.activityBulkMissing = missingResult.sample;
  state.metadata.activityBulkMissingCount = missingResult.total;
  FbmSync.seenStoreClear('activity_bulk');
  var catchupRequest = typeof FbmSync.activityCatchupCustomerRequest === 'function' ? FbmSync.activityCatchupCustomerRequest() : null;
  if (catchupRequest) {
    state.cursor = { kind: 'activity_catchup_customer_grid', seen: cursor.seen };
    state.message = 'Đang tìm Customer có giao dịch mới hơn mốc local...';
    FbmSync.stateWrite(state);
    return catchupRequest;
  }
  var rotationRequest = typeof FbmSync.activityRotationCustomerRequest === 'function' ? FbmSync.activityRotationCustomerRequest() : null;
  if (rotationRequest) {
    state.cursor = { kind: 'activity_rotation_customer_grid', seen: cursor.seen };
    state.message = 'Đang xoay 30 Customer để bắt giao dịch tạo lùi ngày...';
    FbmSync.stateWrite(state);
    return rotationRequest;
  }
  state.cursor = { kind: 'activity_bulk_done', seen: cursor.seen };
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
  var cursor = state.cursor || {}, response, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '', requestDeadlineAt = Number(state.deadlineAt || 0);
  FbmSync._sliceDeadlineAt = requestDeadlineAt;
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId)) {
    return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Response FBM đã cũ hoặc phiên đã bị dừng; không tiếp tục cursor.' };
  }
  var completedRequestId = String(state.activeRequestId);
  state.activeRequestId = '';
  state.deadlineAt = 0;
  state.lastProgressAt = Date.now();
  FbmSync.stateWrite(state);
  if (FbmSync.traceImport) {
    var transportTrace = rawResponse && rawResponse.transport && rawResponse.transport.trace;
    if (transportTrace) { FbmSync.traceImport(transportTrace, { runId: state.runId, requestId: completedRequestId, phase: state.phase, operation: cursor.operation, entity: state.entity, recordId: state.current }); }
  }
  if (FbmSync.traceEvent) {
    var responseMeta = FbmSync.traceResponse ? FbmSync.traceResponse(rawResponse) : {};
    FbmSync.traceEvent('fbm_response_received', { requestId: completedRequestId, httpStatus: responseMeta.httpStatus, responseLength: responseMeta.responseLength });
  }
  state.activeRequestId = '';
  state.lastProgressAt = Date.now();
  if (typeof FbmSync.sessionGateResponseStarted === 'function') { FbmSync.sessionGateResponseStarted(state); }
  FbmSync.stateWrite(state);
  response = FbmSync.protocol.parse(rawResponse);
  if (state.origin === 'background' && state.metadata && state.metadata.manualPending) {
    state.runId = ''; state.origin = 'manual'; state.phase = 'idle'; state.entity = ''; state.cursor = {}; state.current = ''; state.scheduledScan = '';
    state.message = 'Phiên nền đã dừng sau response hiện tại; có thể chạy phiên thủ công.';
    state.metadata.manualPending = null;
    FbmSync.stateWrite(state);
    return { ok: true, request: null, status: FbmSync.statusView(), manualReady: true };
  }
  if (FbmSync.applyTransportSession && FbmSync.applyTransportSession(state, rawResponse)) { FbmSync.stateWrite(state); }
  if (typeof FbmSync.continueSessionGate === 'function') {
    var gateResponse = FbmSync.continueSessionGate(state, cursor, rawResponse);
    if (gateResponse) { return gateResponse; }
  }
  if (cursor.kind === 'session_probe' && !FbmSync.protocol.isLiveSessionResponse(rawResponse)) {
    var probeFailure = FbmSync.sessionGateHandleProbeFailure(state, cursor, rawResponse);
    if (probeFailure && probeFailure.request) { return probeFailure; }
    return probeFailure;
  }
  // Phân loại trên wrapper HTTP gốc; parse trước sẽ làm mất status và biến lỗi vận chuyển thành Bugs giả.
  var success = FbmSync.protocol.assertSuccess(rawResponse);
  if (!success.ok) {
    if (success.code === 'SESSION_SUSPECTED' && cursor.kind !== 'push_wait' && cursor.kind !== 'session_probe') {
      var suspicionProbe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ; request nghiệp vụ đã dừng để probe lại phiên.');
      return suspicionProbe ? { ok: true, request: suspicionProbe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    if (typeof FbmSync.sessionGateHandleFailure === 'function') {
      var gateFailure = FbmSync.sessionGateHandleFailure(state, cursor, success);
      if (gateFailure) { return gateFailure; }
    }
    var failureReason = (success.bug && (success.bug.Message || success.bug.message)) || 'FBM trả về lỗi nghiệp vụ';
    if (cursor.kind === 'push_wait' && cursor.candidate) {
      if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
        return FbmSync.continueAfterPushVerificationError(state, cursor, { code: success.code, status: success.status, fieldName: success.bug && success.bug.FieldName, reason: failureReason });
      }
      if (cursor.operation === 'customer_create_save' && cursor.candidate.kind === 'create' && typeof FbmSync.customerCreateRecoveryRequest === 'function') {
        var recovery = FbmSync.customerCreateRecoveryRequest(state, cursor);
        if (recovery) { return { ok: true, request: FbmSync.nextEnvelope(recovery), status: FbmSync.statusView(), recovering: true }; }
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
    state.phase = 'error';
    state.retryable = false;
    state.lastFailureCode = String(success.code || 'FBM_ERROR');
    state.lastError = failureReason;
    state.message = 'Request FBM thất bại; đã dừng và không gửi lại tự động.';
    if (typeof FbmSync.sessionGateRecordFailure === 'function') {
      FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, 'business_request_failed');
    } else {
      FbmSync.stateWrite(state);
    }
    return { ok: false, code: String(success.code || 'FBM_ERROR'), status: FbmSync.statusView(), error: success.bug };
  }
  state.retryCount = 0;
  state.retryable = false;
  state.lastFailureCode = '';
  FbmSync.stateWrite(state);

  if (typeof FbmSync.continueSessionGate === 'function') {
    var completedGate = FbmSync.continueSessionGate(state, cursor, rawResponse);
    if (completedGate) { return completedGate; }
  }

  // Probe User là bước hệ thống của cổng: đối chiếu đủ bốn định danh rồi
  // mới trả lại cursor nghiệp vụ ban đầu. Không gọi logic Customer tại đây.
  if (cursor.kind === 'session_probe') {
    var probedIdentity = FbmSync.identityUser(response);
    if (!probedIdentity.ok) {
      if (typeof FbmSync.protocol.isUnauthenticatedSessionProbeResponse === 'function' && FbmSync.protocol.isUnauthenticatedSessionProbeResponse(rawResponse)) {
        var probeRecovery = FbmSync.sessionGateHandleProbeFailure(state, cursor, rawResponse);
        if (probeRecovery && probeRecovery.request) { return probeRecovery; }
        if (probeRecovery) { return probeRecovery; }
      }
      FbmSync.sessionIdentityClear(state);
      state.phase = 'error'; state.cursor = {}; state.lastFailureCode = probedIdentity.code || 'IDENTITY_PROBE_INCOMPLETE';
      state.lastError = probedIdentity.message; state.message = probedIdentity.message; FbmSync.stateWrite(state);
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, 'session_probe_failure'); }
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    var probedRuntime = { spreadsheetId: String(FbmSync.currentSpreadsheetId ? FbmSync.currentSpreadsheetId() : ''), userId: probedIdentity.userId, username: probedIdentity.username, accountName: probedIdentity.accountName };
    var probedStatus = typeof FbmSync.identityStatus === 'function' ? FbmSync.identityStatus(probedRuntime) : { status: 'BOUND' };
    if ((state.scan !== 'identity_probe' && state.scan !== 'identity_check' && probedStatus.status !== 'BOUND') || probedStatus.status === 'REBIND_REQUIRED') {
      FbmSync.sessionIdentityClear(state);
      state.phase = 'error'; state.cursor = {}; state.lastFailureCode = 'SESSION_IDENTITY_MISMATCH';
      state.lastError = 'Tài khoản FBM hiện tại không khớp liên kết đã xác nhận; request nghiệp vụ đã bị chặn.'; state.message = state.lastError; FbmSync.stateWrite(state);
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, 'session_probe_mismatch'); }
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    state.session.userId = probedIdentity.userId;
    state.session.accountUsername = probedIdentity.username;
    state.session.accountName = probedIdentity.accountName;
    state.session.expired = false;
    if (!String(state.session.sessionId || '')) { state.session.sessionId = FbmSync.sessionGateToken(); }
    state.session.identityVerified = true;
    state.session.identitySessionId = String(state.session.sessionId);
    state.session.identityVerifiedAt = Date.now();
    if (state.scan === 'identity_probe') {
      state.metadata = state.metadata || {};
      state.metadata.identityProbe = probedRuntime;
      state.cursor = {}; state.phase = 'done'; state.entity = '';
      state.message = 'Đã đọc và xác minh nhận diện phiên FBM; chờ người dùng xác nhận lưu.';
      FbmSync.stateWrite(state);
      return { ok: true, request: null, status: FbmSync.statusView() };
    }
    var gateMeta = FbmSync.sessionGateMeta(state), resume = gateMeta.resumeCursor && gateMeta.resumeCursor.kind ? gateMeta.resumeCursor : { kind: 'authorize_customer' };
    var waitedResume = typeof FbmSync.sessionGateResumeAfterWaitProbe === 'function' ? FbmSync.sessionGateResumeAfterWaitProbe(state) : null;
    if (waitedResume) { return waitedResume; }
    if (gateMeta.probeOnly === true) {
      gateMeta.probeOnly = false;
      state.cursor = {}; state.phase = 'error'; state.entity = '';
      state.lastFailureCode = 'SESSION_SUSPECTED_LIVE';
      state.lastError = 'FBM trả phản hồi đáng ngờ nhưng probe vẫn xác nhận phiên sống; request nghiệp vụ đã bị dừng để không gửi lại.';
      state.message = state.lastError;
      FbmSync.stateWrite(state);
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, 'session_suspected_live'); }
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    state.cursor = resume; state.phase = gateMeta.resumePhase || 'checking_session'; state.entity = gateMeta.resumeEntity || '';
    gateMeta.resumeCursor = null;
    FbmSync.stateWrite(state);
    var resumedRequest = FbmSync.requestForCursor(state);
    if (!resumedRequest) {
      state.phase = 'error'; state.lastFailureCode = 'SESSION_RESUME_FAILED'; state.lastError = 'Đã xác minh phiên nhưng không dựng lại được request đang chờ.'; state.message = state.lastError; FbmSync.stateWrite(state);
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    return { ok: true, request: FbmSync.nextEnvelope(resumedRequest), status: FbmSync.statusView(), sessionVerified: true };
  }

  if (cursor.kind === 'push_wait') {
    try {
      var pushRequest = FbmSync.continuePush(state, response);
      return { ok: true, request: FbmSync.nextEnvelope(pushRequest), status: FbmSync.statusView() };
    } catch (pushError) {
      if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
        return FbmSync.continueAfterPushVerificationError(state, cursor, pushError && pushError.message || pushError);
      }
      // Giữ nguyên object lỗi có mã để markPushError chọn đúng trạng thái (ví dụ FBM_RECORD_NOT_FOUND).
      return FbmSync.continueAfterPushError(state, cursor, pushError && pushError.code ? pushError : (pushError && pushError.message || pushError));
    }
  }

  // Hai bước đầu chỉ lấy authorized token cho từng controller.
  if (cursor.kind === 'authorize_customer') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('customer', response)), status: FbmSync.statusView() };
  }
  if (cursor.kind === 'authorize_activity') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('activity', response)), status: FbmSync.statusView() };
  }
  if (cursor.kind === 'identity_user_grid') {
    var identityUser = FbmSync.identityUser(response);
    if (!identityUser.ok) {
      state.phase = 'error'; state.entity = ''; state.cursor = {}; state.lastFailureCode = identityUser.code;
      state.lastError = identityUser.message; state.message = identityUser.message; FbmSync.stateWrite(state);
      return { ok: false, code: identityUser.code, status: FbmSync.statusView(), error: identityUser.message };
    }
    state.session.userId = identityUser.userId;
    state.session.accountName = identityUser.accountName;
    state.session.accountUsername = identityUser.username;
    state.metadata = state.metadata || {};
    state.metadata.identityProbe = {
      spreadsheetId: String(FbmSync.currentSpreadsheetId ? FbmSync.currentSpreadsheetId() : ''),
      userId: identityUser.userId,
      username: identityUser.username,
      accountName: identityUser.accountName
    };
    state.cursor = {}; state.phase = 'done'; state.entity = '';
    state.message = 'Đã đọc nhận diện phiên FBM; chờ người dùng xác nhận lưu.';
    FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView() };
  }
  // Write mode phải nạp danh mục trước khi dựng payload ghi.
  if (cursor.kind === 'lookup') {
    var lookup = FbmSync.SYNC_LOOKUPS[Number(cursor.index || 0)], lookupPairs = FbmSync.lookupPairs(response), categorySnapshot = typeof FbmSync.readCategoryGate === 'function' ? FbmSync.readCategoryGate() : { namesBySource: {} }, expectedCodes = categorySnapshot.namesBySource && categorySnapshot.namesBySource[lookup.key] || {}, compactLookup = {};
    // Chỉ giữ các mã Category đang dùng; Rows đầy đủ có thể vượt trần một DocumentProperty.
    Object.keys(expectedCodes).forEach(function (code) { if (Object.prototype.hasOwnProperty.call(lookupPairs, code)) { compactLookup[code] = lookupPairs[code]; } });
    if (!Object.keys(expectedCodes).length && Object.keys(lookupPairs).length) { compactLookup.__FBM_LOOKUP_PRESENT__ = ''; }
    state.session.lookups[lookup.key] = { pairs: compactLookup };
    var lookupIndex = Number(cursor.index || 0) + 1;
    if (lookupIndex < FbmSync.SYNC_LOOKUPS.length) {
      state.cursor.index = lookupIndex; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[lookupIndex].controller, FbmSync.SYNC_LOOKUPS[lookupIndex].key)), status: FbmSync.statusView() };
    }
    if (state.mode === 'write' || state.mode === 'push') {
      // Category is user-owned configuration; sync only reads and validates it.
      state.message = 'Đã đọc danh mục FBM; đang đối chiếu Category...';
    }
    var customerRequest = FbmSync.beginCustomerPull(state), categoryBlocks = state.metadata && state.metadata.categoryBlocks || [];
    if (typeof FbmSync.businessStepFinish === 'function') {
      FbmSync.businessStepFinish(state, 'category', 'ok', { lookups: Number(FbmSync.SYNC_LOOKUPS.length || 0), errors: Number(categoryBlocks.length || 0) });
    }
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(customerRequest), status: FbmSync.statusView() };
  }
  // Customer là grid cha; mỗi trang xong sẽ mở Activity con của trang đó.
  if (cursor.kind === 'customer_grid') {
    var customerGrid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields), categoryGate = FbmSync.stateCategoryGate(state), eligibleCustomerRows = customerGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }), customerRecords = eligibleCustomerRows.map(function (row) { return FbmSync.customerRecord(row, categoryGate); });
    state.metadata.customerFields = customerGrid.fields;
    FbmSync.customerScanRecord(state, customerGrid, Number(cursor.pageIndex) < 0);
    FbmSync.stateWrite(state);
    if (state.scan === 'identity_check') {
      FbmSync.identityCheckPage(state, eligibleCustomerRows);
      var identityNext = FbmSync.customerNext(state, customerGrid.rows, customerGrid.total);
      if (identityNext) {
        state.cursor = { kind: 'customer_grid', type: 1, pageIndex: identityNext.body.gridPageIndex, pageValue: identityNext.body.gridPageValue, count: identityNext.body.count, seen: Number(state.cursor.seen || 0) };
        FbmSync.stateWrite(state);
        return { ok: true, request: FbmSync.nextEnvelope(FbmSync.identityCheckCustomerRequest({ type: 1, count: identityNext.body.count, gridPageIndex: identityNext.body.gridPageIndex, gridPageValue: identityNext.body.gridPageValue, gridRefresh: false })), status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
      }
      FbmSync.identityCheckFinish(state);
      state.cursor = {}; state.phase = 'done'; state.entity = ''; state.message = 'Đã kiểm tra liên kết Customer FBM.'; FbmSync.stateWrite(state);
      return { ok: true, status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
    }
    FbmSync.pullRecords('customer', customerRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'customer', customerRecords);
    FbmSync.stateWrite(state);
    var customerContexts = eligibleCustomerRows.map(function (row) { return { sttRec: String(row.stt_rec_kh || '').trim(), maKh: String(row.ma_kh || '').trim() }; }).filter(function (item) { return item.sttRec; });
    var nextCustomer = FbmSync.customerNext(state, customerGrid.rows, customerGrid.total);
    var activityRequest = FbmSync.activityForCustomers(state, customerContexts, nextCustomer, state.cursor.seen);
    if (activityRequest) { return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView(), imported: customerRecords.length }; }
    if (nextCustomer) { state.cursor = { kind: 'customer_grid', type: 1, pageIndex: nextCustomer.body.gridPageIndex, pageValue: nextCustomer.body.gridPageValue, count: nextCustomer.body.count, seen: Number(state.cursor.customerSeen || 0) }; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(nextCustomer), status: FbmSync.statusView() }; }
    if (state.mode === 'write' && FbmSync.canWriteFbm(state.mode)) { if (FbmSync.stopPushOnConflicts && FbmSync.stopPushOnConflicts(state)) { return { ok: true, request: null, status: FbmSync.statusView() }; } state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView() }; }
    FbmSync.finishPullRun(state); return { ok: true, status: FbmSync.statusView() };
  }
  // Activity được quét theo từng stt_rec, rồi mới quay lại trang Customer kế.
  if (cursor.kind === 'activity_grid') {
    var activityGrid = FbmSync.rowsToRecords('activity', response, state.metadata && state.metadata.activityFields), activityGate = FbmSync.stateCategoryGate(state), parentContext = (cursor.customerContexts || [])[Number(cursor.customerIndex || 0)] || {}, activityRecords = activityGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, activityGate, parentContext); });
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
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerContexts[cursor.customerIndex].sttRec, { type: 1, count: cursor.count, gridPageIndex: state.cursor.pageIndex, gridPageValue: state.cursor.pageValue, gridRefresh: false })), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    var nextIndex = Number(cursor.customerIndex || 0) + 1;
    if (nextIndex < cursor.customerContexts.length) {
      state.cursor.customerIndex = nextIndex; state.cursor.pageIndex = -1; state.cursor.pageValue = null; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerContexts[nextIndex].sttRec, { type: 0, count: cursor.count, gridPageIndex: -1, gridRefresh: false })), status: FbmSync.statusView() };
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
    if (state.mode === 'write' && FbmSync.canWriteFbm(state.mode)) {
      if (FbmSync.stopPushOnConflicts && FbmSync.stopPushOnConflicts(state)) { return { ok: true, request: null, status: FbmSync.statusView(), imported: activityRecords.length }; }
      state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    FbmSync.finishPullRun(state);
    return { ok: true, status: FbmSync.statusView(), imported: activityRecords.length };
  }
  if (cursor.kind === 'activity_bulk_grid') {
    var bulkGrid = FbmSync.rowsToRecords('activity', response, state.metadata && state.metadata.activityFields), bulkGate = FbmSync.stateCategoryGate(state), bulkRecords = bulkGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, bulkGate); });
    state.metadata.activityFields = bulkGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('activity', bulkRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'activity', bulkRecords);
    var bulkRequest = FbmSync.activityBulkNext(state, bulkGrid);
    if (bulkRequest) { return { ok: true, request: FbmSync.nextEnvelope(bulkRequest), status: FbmSync.statusView(), imported: bulkRecords.length }; }
    state.cursor = {}; state.phase = 'done'; state.entity = ''; state.message = 'Đã đọc xong bulk giao dịch FBM.'; FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: bulkRecords.length, missing: Number(state.metadata.activityBulkMissingCount || 0) };
  }
  if (cursor.kind === 'activity_catchup_customer_grid' || cursor.kind === 'activity_rotation_customer_grid') {
    var supplementGrid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields);
    state.metadata.customerFields = supplementGrid.fields;
    FbmSync.stateWrite(state);
    var supplementContexts = supplementGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }).map(function (row) { return { sttRec: String(row.stt_rec_kh || '').trim(), maKh: String(row.ma_kh || '').trim() }; }).filter(function (item) { return item.sttRec; });
    var afterKind = cursor.kind === 'activity_catchup_customer_grid' ? { kind: 'rotation' } : { kind: 'done', rotation: FbmSync.activityRotationNext(supplementGrid.rows) };
    var supplementActivityRequest = FbmSync.activityForCustomers(state, supplementContexts, null, 0, afterKind);
    if (supplementActivityRequest) { return { ok: true, request: FbmSync.nextEnvelope(supplementActivityRequest), status: FbmSync.statusView() }; }
    var emptySupplement = FbmSync.activitySupplementNext(state, afterKind);
    return { ok: true, request: emptySupplement ? FbmSync.nextEnvelope(emptySupplement) : null, status: FbmSync.statusView() };
  }
  state.phase = 'error'; state.lastError = 'Không nhận diện được cursor đồng bộ.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};
