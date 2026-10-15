/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên; lượt xong ngay ở bước mở vẫn kết thúc bằng bước đếm. */
FbmSync.start = function (options) { return FbmSync.runTail(FbmSync.startRun(options)); };
FbmSync.startRun = function (options) {
  // Mỗi call chỉ trả một request; ngữ cảnh nhiều bước nằm trong DocumentProperties.
  var opt = options || {};
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) {
    return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; hãy bật công tắc tổng trước khi chạy.', status: FbmSync.statusView() };
  }
  var current = FbmSync.stateRead();
  if (typeof FbmSync.recoverStaleRun === 'function') { current = FbmSync.recoverStaleRun(current).state; }
  // Tạm dừng là điểm dừng để người dùng chạy lại, không phải cursor đang chạy;
  // lần bấm mới phải tạo request FBM mới, tránh vẽ lại preview cũ.
  if (FbmSync.runInProgress(current)) {
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
  state.mode = FbmSync.modeOf(opt.mode);
  state.scan = opt.scan === 'activity_bulk' ? 'activity_bulk' : opt.scan === 'identity_check' ? 'identity_check' : opt.scan === 'identity_probe' ? 'identity_probe' : opt.scan === 'detail' ? 'detail' : 'full';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'run', { mode: state.mode, scan: state.scan, origin: state.origin });
    FbmSync.businessStepStart(state, 'preflight_hash', { mode: state.mode, scan: state.scan, origin: state.origin });
  }
  // Gói chụp vào state đầu lượt: đổi `Mức quét` khi lượt đang chạy chỉ áp từ lượt sau.
  state.scanPack = state.scan === 'full' ? FbmSync.scanPackOf(opt.pack) : '';
  state.identityTarget = state.scan === 'identity_check' && typeof FbmSync.identityCheckTarget === 'function' ? FbmSync.identityCheckTarget(opt.identity) : null;
  // Chụp đầu lượt như mức quét: đổi cài đặt giữa chừng chỉ áp từ lượt sau, và không phải đọc lại DocumentProperties mỗi envelope.
  state.requestGap = typeof FbmSync.requestGapMs === 'function' ? FbmSync.requestGapMs(FbmSync.syncSettingsRead()) : null;
  if (state.scan === 'activity_bulk') { state.mode = 'read'; }
  FbmSync.countTailMark(state);
  if (state.origin === 'background') { state.detailCustomerLimit = state.scan === 'detail' ? Math.max(1, Math.floor(Number(opt.detail && opt.detail.customersPerRun || FbmSync.backgroundScheduleDefault().detail.customersPerRun))) : 0; }
  if (typeof FbmSync.runPreflight === 'function') {
    var preflight = FbmSync.runPreflight({ mode: state.mode, origin: state.origin, scan: state.scan });
    state.metadata = state.metadata || {};
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
    if (FbmSync.canWriteFbm(state.mode) && Number(preflight.candidateCount || 0) > 0 && Number(preflight.candidateCount || 0) >= FbmSync.approvalThreshold()) {
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
  if (FbmSync.canWriteFbm(state.mode) && typeof FbmSync.identityPreflight === 'function') {
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
  // Category là cấu hình của người dùng; đồng bộ chỉ đọc và đối chiếu. Chiều Lấy không nạp danh mục FBM (`needsFbmLookups`).
  if (typeof FbmSync.businessStepFinish === 'function') { FbmSync.businessStepFinish(state, 'session', 'ok', {}); }
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'category', { mode: state.mode, scan: state.scan }); }
  if (!FbmSync.needsFbmLookups(state)) {
    var pullRequest = FbmSync.beginCustomerPull(state);
    if (typeof FbmSync.businessStepFinish === 'function') { FbmSync.businessStepFinish(state, 'category', 'ok', { lookups: 0, errors: Number(state.metadata && state.metadata.categoryBlocks && state.metadata.categoryBlocks.length || 0) }); }
    FbmSync.stateWrite(state);
    return pullRequest;
  }
  state.cursor = { kind: 'lookup' };
  state.message = 'Đang kiểm tra danh mục FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.lookupBatchRequest();
};

/** Mô tả trang Customer vừa nhận để dựng con trỏ trang kế: số dòng, dòng đầu, dòng cuối và khóa trang. Kiểm tra liên kết sắp theo `stt_rec_kh` nên khóa trang chỉ có cột đó. */
FbmSync.customerPageOf = function (rows, identityOrder) {
  var list = rows || [], last = list[list.length - 1] || {};
  return { length: list.length, firstItem: FbmSync.customerPageItem(list[0]), lastItem: FbmSync.customerPageItem(last), lastValue: identityOrder ? FbmSync.gridPageValue([last.stt_rec_kh || '']) : FbmSync.customerPageValue(last) };
};

/** Chuyển cursor sang trang Customer kế tiếp; trả `false` khi đã hết trang. `total` là tổng FBM báo ở trang đầu; trang sau FBM trả 0 nên mô tả trang giữ tổng của trang trước. */
FbmSync.customerNext = function (state, page, total) {
  var cursor = state.cursor || {}, count = Number(cursor.count || 2000), length = Number(page && page.length || 0), seenAfterPage = Number(cursor.seen || 0) + length;
  var pageItems = { firstPageItem: page.firstItem, lastPageItem: page.lastItem, lastRowCount: Number(total || cursor.pageItems && cursor.pageItems.lastRowCount || 0) };
  if (!length || length < count || (total && seenAfterPage >= total)) { return false; }
  cursor.type = 1;
  cursor.pageIndex = FbmSync.gridNextPageIndex(cursor.pageIndex);
  cursor.pageItems = pageItems;
  cursor.pageValue = page.lastValue;
  cursor.seen = seenAfterPage;
  state.cursor = cursor;
  return true;
};

/** Đếm khách đã nhận trong lượt quét; tổng lấy ở trang đầu vì FBM chỉ đếm `TotalRowCount` ở trang đầu, trang sau trả 0 (Nghiên cứu FBM ch03 mục 3.3). */
FbmSync.customerScanRecord = function (state, grid, firstPage) {
  state.metadata = state.metadata || {};
  var scan = firstPage ? { total: Number(grid && grid.total || 0), seen: 0 } : (state.metadata.customerScan || { total: 0, seen: 0 });
  scan.seen = Number(scan.seen || 0) + (grid && grid.rows ? grid.rows.length : 0);
  state.metadata.customerScan = scan;
  // Mẫu số tiến trình là số khách của lượt: FBM đã lọc theo phạm vi thử nên `TotalRowCount` chính là số mã thử.
  if (firstPage) { state.progress = { done: 0, total: scan.total }; }
};

/** Tử số tiến trình: số khách đã xử lý xong (đã quét hết giao dịch, hoặc không có giao dịch để quét). */
FbmSync.progressCustomersDone = function (state, count) {
  state.progress = state.progress || { done: 0, total: 0 };
  state.progress.done = Number(state.progress.done || 0) + Number(count || 0);
};

/**
 * Kết thúc lượt đọc. Chỉ đánh "không thấy bên FBM" khi lượt đã nhận đủ số khách FBM báo ở trang đầu: lượt dừng sớm vì phân trang hỏng mà vẫn đánh thì mọi khách chưa quét tới bị đánh sai (gặp thật 2026-10-07: 1.262/1.312 khách).
 * Thiếu tổng hoặc nhận chưa đủ thì phiên kết thúc lỗi `FBM_SCAN_INCOMPLETE` để Sidebar và Log đều thấy; dữ liệu đã đọc vẫn giữ.
 */
FbmSync.finishPullRun = function (state) {
  state.cursor = {}; state.entity = '';
  if (!FbmSync.pullMarkMissing(state)) { return false; }
  state.phase = 'done';
  state.message = FbmSync.runDoneMessage(state);
  FbmSync.stateWrite(state);
  return true;
};

/**
 * Gắn cờ "không thấy bên FBM" sau phần đọc của một lượt; chiều Lấy gọi ở cuối lượt, chiều Hai chiều gọi trước khi sang đẩy, nên hai chiều không có đường bỏ sót bước này.
 * Trả false khi lượt nhận thiếu khách: phiên đã chuyển lỗi `FBM_SCAN_INCOMPLETE` và không được đi tiếp.
 */
FbmSync.pullMarkMissing = function (state) {
  var customerErrors = Number(state.metadata && state.metadata.customerErrors && state.metadata.customerErrors.total || 0), fullScan = FbmSync.canWriteSheet(state.mode) && state.scan !== 'detail';
  if (fullScan) {
    var scan = state.metadata && state.metadata.customerScan || {}, total = Number(scan.total || 0), seen = Number(scan.seen || 0);
    if (seen < total || (!total && seen > 0)) {
      state.phase = 'error'; state.lastFailureCode = 'FBM_SCAN_INCOMPLETE';
      state.lastError = 'Lượt quét chỉ nhận ' + seen + '/' + (total || '?') + ' khách FBM nên không đánh dấu bản ghi "không thấy bên FBM". Dữ liệu đã đọc vẫn được ghi; báo người phụ trách kỹ thuật kiểm tra phân trang Customer.';
      state.message = state.lastError;
      FbmSync.stateWrite(state);
      return false;
    }
    FbmSync.markMissingAfterFullScan('customer', state);
    // Số khách mốc của bước đếm chỉ ghi ở đây: lượt đã đọc đủ danh sách toàn bộ khách.
    if (state.scan === 'full') { FbmSync.customerBaselineWrite(total); }
    if (state.metadata && state.metadata.activityBulk) {
      // Lớp 1 của lượt này đã gắn cờ trên toàn bộ giao dịch; gắn lại theo khách đã đọc chỉ đếm trùng cùng một bản ghi.
      FbmSync.seenStoreClear('activity');
    } else if (customerErrors) {
      // Giao dịch của khách lỗi chưa được quét; đánh "không thấy bên FBM" lúc này là đánh sai.
      if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_missing_skipped', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', cycleId: String(state.runId || ''), reason: customerErrors + ' khách lỗi khi đọc giao dịch nên lượt này không đánh dấu giao dịch "không thấy bên FBM".', detail: { customerErrors: customerErrors } }); }
    } else {
      FbmSync.markMissingAfterFullScan('activity', state);
    }
  }
  return true;
};

/** Khởi tạo cursor Activity cho danh sách Customer vừa đọc. */
FbmSync.activityForCustomers = function (state, customerContexts, customerNext, customerSeen) {
  // Không truyền danh sách khách: đọc giao dịch của mọi khách đã thấy trong lượt quét, lấy dần từ hàng đợi để cursor không phình theo số khách.
  var queued = customerContexts === null;
  var contexts = (customerContexts || []).map(function (item) { return typeof item === 'string' ? { sttRec: item, maKh: '' } : { sttRec: String(item.sttRec || item.stt_rec_kh || ''), maKh: String(item.maKh || item.ma_kh || '') }; }).filter(function (item) { return item.sttRec; });
  state.phase = 'pull_activity'; state.entity = 'activity';
  // Không còn trang khách kế thì chặng đọc khách đã xong; còn trang thì khách và giao dịch đọc xen kẽ, bước khách đóng sau.
  if (!customerNext && typeof FbmSync.businessFinishSteps === 'function') { FbmSync.businessFinishSteps(state, FbmSync.BUSINESS_PULL_STEPS.customer); }
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
    FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  }
  state.cursor = { kind: 'activity_grid', customers: contexts.map(function (item) { return item.sttRec; }), customerIndex: 0, batch: [], count: FbmSync.BUDGET.activityCustomerRows, customerNext: customerNext ? { pageIndex: customerNext.body.gridPageIndex, pageValue: customerNext.body.gridPageValue, pageItems: FbmSync.gridPageItemsOf(customerNext.body), count: customerNext.body.count } : null, customerSeen: Number(customerSeen || 0) };
  if (queued) { state.cursor.queueFrom = 0; }
  // Gói Quét nhanh, Quét kỹ chỉ đọc khách lệch giao dịch cuối rồi quét từ khách mới nhất xuống; Quét toàn bộ đọc mọi khách đã thấy.
  if (queued && state.scan === 'full' && state.scanPack !== 'all') { state.cursor.layer = 'due'; FbmSync.activityLayerProgress(state, false); }
  state.message = 'Đang đọc giao dịch của khách hàng...';
  FbmSync.activityBatchPlan(state.cursor);
  FbmSync.activityPagesWrite(state, {});
  FbmSync.stateWrite(state);
  return FbmSync.activityBatchRequest(state);
};

/** Hết một lớp đọc giao dịch theo khách thì sang lớp kế; gói Quét kỹ thêm lớp 1 sau cùng, lớp 1 xong mới chốt lượt hoặc sang chiều đẩy. Trả `null` khi gói không còn thao tác đọc nào. */
FbmSync.activityLayersAfter = function (state) {
  var request = FbmSync.activityLayerNext(state, state.cursor);
  if (request) { return request; }
  return state.scanPack === 'deep' ? FbmSync.beginActivityBulkPull(state) : null;
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
  if (typeof FbmSync.businessStepStart === 'function' && state.scan !== 'detail') {
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
  FbmSync.activityLayersBegin();
  if (state.scan === 'detail') { return FbmSync.activityRotationBegin(state); }
  FbmSync.scanJobOpen(state, { entity: 'customer', type: 0, pageIndex: -1, pageValue: null, pageItems: null, count: FbmSync.BUDGET.scanCustomerRows, seen: 0 });
  state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Đang đọc khách hàng từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.scanJobRequest(state);
};

/** Sau khi đọc xong khách (và giao dịch nếu có): chế độ hai chiều chuyển sang đẩy, chế độ lấy chốt lượt. */
FbmSync.pullFinishOrPush = function (state, extra) {
  var result = Object.assign({ ok: true, status: null }, extra || {});
  if (FbmSync.canWriteSheet(state.mode) && FbmSync.canWriteFbm(state.mode)) {
    if (FbmSync.stopPushOnConflicts && FbmSync.stopPushOnConflicts(state)) { result.request = null; result.status = FbmSync.statusView(); return result; }
    if (!FbmSync.pullMarkMissing(state)) { result.request = null; result.status = FbmSync.statusView(); return result; }
    if (typeof FbmSync.businessFinishSteps === 'function') { FbmSync.businessFinishSteps(state, FbmSync.BUSINESS_PULL_STEPS.customer.concat(FbmSync.BUSINESS_PULL_STEPS.activity)); }
    state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; state.entity = 'customer'; FbmSync.stateWrite(state);
    result.request = FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)); result.status = FbmSync.statusView();
    return result;
  }
  FbmSync.finishPullRun(state);
  result.status = FbmSync.statusView();
  return result;
};

/**
 * Nhận một gói Customer của việc quét: ghi qua cửa ghi, rồi mới tăng cursor (ghi lỗi thì lần sau xin lại đúng gói). Hết gói của trang thì xin trang kế đến khi đủ tổng FBM báo; hết trang thì đọc giao dịch của các khách đã thấy.
 * Gói đầu của trang lưu dòng đầu; mỗi gói lưu khóa của dòng cuối, vì trang kế cần cả hai mà gói cuối có thể không còn dòng nào.
 */
FbmSync.customerScanChunk = function (state, cursor, rawResponse) {
  var accepted = FbmSync.scanJobAccept(state, cursor, rawResponse), grid;
  if (accepted.result) { return accepted.result; }
  var chunk = accepted.chunk;
  // Gói không ghép được cột (thiếu cột, trùng cột) thì dừng phiên như gói lạ: không đoán cột theo vị trí, không ghi gì.
  try { grid = FbmSync.rowsToRecords('customer', FbmSync.protocol.parse(rawResponse)); } catch (shapeError) { return FbmSync.scanJobMismatch(state, String(shapeError && shapeError.message || shapeError)); }
  var gate = FbmSync.stateCategoryGate(state), records = grid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }).map(function (row) { return FbmSync.customerRecord(row, gate); });
  FbmSync.pullRecords('customer', records, state.mode);
  FbmSync.previewRecords('customer', records);
  state = FbmSync.stateRead(); cursor = state.cursor;
  if (state.scan === 'full' && state.scanPack !== 'all') { FbmSync.activityDueMark(state, grid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); })); }
  FbmSync.customerScanRecord(state, { total: chunk.totalRowCount, rows: grid.rows }, Number(cursor.page || 0) === 0 && chunk.index === 0);
  if (chunk.index === 0) { cursor.pageFirst = FbmSync.customerPageItem(grid.rows[0]); FbmSync.scanJobOversize(state, 'customer', chunk.oversize); }
  if (grid.rows.length) { var lastRow = grid.rows[grid.rows.length - 1]; cursor.pageLast = FbmSync.customerPageItem(lastRow); cursor.pageLastValue = FbmSync.customerPageValue(lastRow); }
  if (!FbmSync.scanJobAdvance(cursor, chunk)) {
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), imported: records.length };
  }
  var scanTotal = Number(state.metadata.customerScan && state.metadata.customerScan.total || 0);
  if (FbmSync.customerNext(state, { length: chunk.rowCount, firstItem: cursor.pageFirst || '', lastItem: cursor.pageLast || '', lastValue: cursor.pageLastValue || [] }, scanTotal)) {
    cursor.page = Number(cursor.page || 0) + 1; cursor.attempt = 0; cursor.restarts = 0;
    FbmSync.scanJobOpen(state, cursor);
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), imported: records.length };
  }
  var activityRequest = FbmSync.activityForCustomers(state, null, null, 0);
  if (!activityRequest && state.cursor.layer) { activityRequest = FbmSync.activityLayersAfter(state); state = FbmSync.stateRead(); }
  if (activityRequest) { return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView(), imported: records.length }; }
  return FbmSync.pullFinishOrPush(state, { imported: records.length });
};

/** Tiếp tục đúng một bước từ response Extension và lưu cursor trước khi trả về. */
/**
 * Response từ Extension lệch mã hợp đồng thì dừng phiên trước mọi xử lý: Extension khác bản có thể đọc envelope sai mà vẫn trả HTTP 200, xử lý tiếp sẽ ghi dữ liệu sai xuống Sheet.
 * Trả `null` khi khớp mã.
 */
FbmSync.contractGate = function (rawResponse) {
  var mismatch = FbmSync.protocol.contractMismatch(rawResponse);
  if (!mismatch) { return null; }
  var before = FbmSync.stateRead(), failed = FbmSync.stateFailRun(mismatch.message, mismatch.code).failed, state = FbmSync.stateRead();
  // Heartbeat và đăng nhập nền không có phiên đồng bộ nên `stateFailRun` bỏ qua; vẫn phải nhả request đang chờ, không thì mọi lượt sau kẹt REQUEST_IN_FLIGHT.
  if (!failed) { state.phase = 'error'; state.lastFailureCode = mismatch.code; state.retryable = false; state.lastError = mismatch.message; state.message = mismatch.message; }
  state.activeRequestId = ''; state.deadlineAt = 0;
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'extension_contract_mismatch', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(before.runId || ''), reason: mismatch.message, detail: { code: mismatch.code, expected: mismatch.expected, received: mismatch.received || '(Extension không gửi mã)' } }); }
  return { ok: false, code: mismatch.code, request: null, error: mismatch.message, status: FbmSync.statusView() };
};

/** Tiến đúng một bước cursor và lưu state trước khi trả request kế tiếp; lượt vừa xong thì nối bước đếm (`runTail`). */
/** Giữ phiên giữa chuỗi nền về qua cổng `continue` chung của Extension như mọi response sau request đầu, nên cursor `heartbeat` phải về đúng bộ xử lý heartbeat. */
FbmSync.continue = function (rawResponse) {
  if (String((FbmSync.stateRead().cursor || {}).kind || '') === 'heartbeat') { return fbmSyncHeartbeatLocked(rawResponse, {}); }
  return FbmSync.continueRun(rawResponse);
};
FbmSync.continueRun = function (rawResponse) { return FbmSync.chainTail(FbmSync.runTail(FbmSync.continueStep(rawResponse))); };
FbmSync.continueStep = function (rawResponse) {
  var state = FbmSync.stateRead();
  if (typeof FbmSync.recoverStaleRun === 'function') {
    var recovered = FbmSync.recoverStaleRun(state);
    if (recovered.recovered) { return { ok: false, status: FbmSync.statusView(), error: recovered.state.lastError, stale: true }; }
    state = recovered.state;
  }
  var cursor = state.cursor || {}, response, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '';
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId)) {
    FbmSync.logStaleResponse(state, responseRequestId);
    return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Response FBM đã cũ hoặc phiên đã bị dừng; không tiếp tục cursor.' };
  }
  var contractStop = FbmSync.contractGate(rawResponse);
  if (contractStop) { return contractStop; }
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
  // Probe nhận "chưa xác thực" là kết luận phiên chết, đi tiếp nhánh identity bên dưới để vào cổng đăng nhập, không phải dấu hiệu đáng ngờ cần probe nữa.
  var success = cursor.kind === 'session_probe' && FbmSync.protocol.isUnauthenticatedResponse(rawResponse) ? { ok: true } : FbmSync.protocol.assertSuccess(rawResponse);
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
  state.retryable = false;
  state.lastFailureCode = '';
  FbmSync.stateWrite(state);

  if (typeof FbmSync.continueSessionGate === 'function') {
    var completedGate = FbmSync.continueSessionGate(state, cursor, rawResponse);
    if (completedGate) { return completedGate; }
  }

  if (cursor.kind === 'customer_count') { return FbmSync.customerCountContinue(state, rawResponse); }

  // Probe User là bước hệ thống của cổng: đối chiếu đủ bốn định danh rồi
  // mới trả lại cursor nghiệp vụ ban đầu. Không gọi logic Customer tại đây.
  if (cursor.kind === 'session_probe') {
    var probedIdentity = FbmSync.identityUser(response);
    if (!probedIdentity.ok) {
      if (typeof FbmSync.protocol.isUnauthenticatedResponse === 'function' && FbmSync.protocol.isUnauthenticatedResponse(rawResponse)) {
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
  // Chế độ ghi phải nạp danh mục trước khi dựng payload ghi; chiều đẩy nạp lại giữa các lô (`push_lookup`).
  if (cursor.kind === 'lookup' || cursor.kind === 'push_lookup') {
    if (!FbmSync.lookupBatchApply(state, rawResponse)) {
      var lookupProbe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ khi đọc danh mục; chưa đối chiếu gì, đang probe lại phiên.');
      return lookupProbe ? { ok: true, request: lookupProbe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    if (cursor.kind === 'push_lookup') { return FbmSync.continuePushLookup(state, cursor); }
    if (FbmSync.canWriteFbm(state.mode)) {
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
  // Danh sách toàn bộ khách đi bằng việc quét; kiểm tra liên kết vẫn đọc grid thường theo `stt_rec_kh`.
  if (cursor.kind === 'scan_job') { return cursor.entity === 'activity' ? FbmSync.activityScanChunk(state, cursor, rawResponse) : FbmSync.customerScanChunk(state, cursor, rawResponse); }
  if (cursor.kind === 'activity_recheck') { return FbmSync.activityRecheckContinue(state, cursor, rawResponse); }
  if (cursor.kind === 'customer_grid' && state.scan === 'identity_check') {
    var customerGrid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields), eligibleCustomerRows = customerGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); });
    state.metadata.customerFields = customerGrid.fields;
    FbmSync.customerScanRecord(state, customerGrid, Number(cursor.pageIndex) < 0);
    FbmSync.identityCheckPage(state, eligibleCustomerRows);
    FbmSync.progressCustomersDone(state, customerGrid.rows.length);
    if (FbmSync.customerNext(state, FbmSync.customerPageOf(customerGrid.rows, true), customerGrid.total)) {
      var identityCursor = state.cursor;
      FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.identityCheckCustomerRequest({ type: 1, count: identityCursor.count, gridPageIndex: identityCursor.pageIndex, gridPageValue: identityCursor.pageValue, pageItems: identityCursor.pageItems, gridRefresh: false })), status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
    }
    FbmSync.identityCheckFinish(state);
    state.cursor = {}; state.phase = 'done'; state.entity = ''; state.message = 'Đã kiểm tra liên kết Customer FBM.'; FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
  }
  // Activity của cả trang Customer đi theo lô; trang quét xong mới quay lại trang Customer kế.
  if (cursor.kind === 'activity_grid') {
    var batchStep = FbmSync.activityBatchContinue(state, cursor, rawResponse);
    if (!batchStep.done) { return batchStep.result; }
    state = batchStep.state;
    var imported = batchStep.imported;
    if (cursor.customerNext) {
      // Cursor chỉ giữ vị trí trang Customer kế; request dựng lại ở đây cho state gọn.
      var next = cursor.customerNext; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: next.pageIndex, pageValue: next.pageValue, pageItems: next.pageItems || null, count: next.count, seen: Number(cursor.customerSeen || 0) }; state.phase = 'pull_customer'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.customerGridRequest({ type: 1, count: next.count, gridPageIndex: next.pageIndex, gridPageValue: next.pageValue, pageItems: next.pageItems, gridRefresh: false })), status: FbmSync.statusView() };
    }
    if (state.cursor && state.cursor.layer) {
      var layerRequest = FbmSync.activityLayersAfter(state);
      if (layerRequest) { return { ok: true, request: FbmSync.nextEnvelope(layerRequest), status: FbmSync.statusView(), imported: imported }; }
      state = FbmSync.stateRead();
    }
    return FbmSync.pullFinishOrPush(state, { imported: imported });
  }
  state.phase = 'error'; state.lastError = 'Không nhận diện được cursor đồng bộ.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};
