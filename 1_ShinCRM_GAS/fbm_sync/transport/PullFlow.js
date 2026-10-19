/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên; lượt xong ngay ở bước mở vẫn kết thúc bằng bước đếm. */
/** Trả lời chung khi thao tác của người dùng gặp lượt nền đang chạy: không dừng gì, kèm `status` để Sidebar nêu bước và giờ bắt đầu trong popup hỏi. */
FbmSync.backgroundRunningResult = function () {
  return { ok: false, code: 'SYNC_BACKGROUND_RUNNING', message: 'Một lượt đồng bộ nền đang chạy.', status: FbmSync.statusView() };
};

/**
 * Nơi duy nhất đặt cờ dừng lượt nền, chỉ gọi khi người dùng chọn "Dừng đồng bộ nền" ở popup. Lượt nền dừng sau response FBM đang bay (dữ liệu đã nhận vẫn được ghi).
 * Lượt đang chạy là lượt tay, hoặc không có lượt nào, thì không đặt gì: lượt tay chỉ người dùng tự dừng bằng nút Dừng.
 */
FbmSync.stopBackground = function () {
  var current = FbmSync.stateRead();
  if (!FbmSync.runInProgress(current) || String(current.origin || '') !== 'background') { return { ok: true, code: 'SYNC_BACKGROUND_IDLE', status: FbmSync.statusView() }; }
  current.metadata = current.metadata || {};
  current.metadata.manualPending = { requestedAt: Date.now() };
  current.message = 'Đã nhận yêu cầu dừng; phiên nền sẽ dừng sau response FBM hiện tại.';
  FbmSync.stateWrite(current);
  return { ok: true, code: 'SYNC_BACKGROUND_STOPPING', status: FbmSync.statusView() };
};

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
    // Lượt nền không tự nhường: Sidebar hỏi người dùng, chỉ lệnh `stop_background` mới dừng nó.
    if (opt.manual === true && String(current.origin || '') === 'background') { return FbmSync.backgroundRunningResult(); }
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
  var state = FbmSync.stateStart('', 'checking_session', 0, {
    origin: opt.origin === 'background' ? 'background' : 'manual',
    mode: FbmSync.modeOf(opt.mode),
    scan: opt.scan === 'activity_bulk' ? 'activity_bulk' : opt.scan === 'identity_check' ? 'identity_check' : opt.scan === 'identity_probe' ? 'identity_probe' : opt.scan === 'detail' ? 'detail' : 'full'
  });
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'run', { mode: state.mode, scan: state.scan, origin: state.origin });
  }
  // Gói chụp vào state đầu lượt: đổi `Mức quét` khi lượt đang chạy chỉ áp từ lượt sau.
  state.scanPack = state.scan === 'full' ? FbmSync.scanPackOf(opt.pack) : '';
  state.identityTarget = state.scan === 'identity_check' && typeof FbmSync.identityCheckTarget === 'function' ? FbmSync.identityCheckTarget(opt.identity) : null;
  // Chụp đầu lượt như mức quét: đổi cài đặt giữa chừng chỉ áp từ lượt sau, và không phải đọc lại DocumentProperties mỗi envelope.
  state.requestGap = typeof FbmSync.requestGapMs === 'function' ? FbmSync.requestGapMs(FbmSync.syncSettingsRead()) : null;
  if (state.scan === 'activity_bulk') { state.mode = 'read'; }
  FbmSync.countTailMark(state);
  if (state.origin === 'background') { state.detailCustomerLimit = state.scan === 'detail' ? Math.max(1, Math.floor(Number(opt.detail && opt.detail.customersPerRun || FbmSync.backgroundScheduleDefault().detail.customersPerRun))) : 0; }
  // Chỉ phần kiểm tra rẻ chạy trước request FBM đầu tiên; phần đọc và hash cả hai Sheet chạy sau khi phiên FBM đã xác thực (`preflightLocalStep`).
  if (typeof FbmSync.preflightGates === 'function') {
    var gates = FbmSync.withLocalSnapshot(function () { return FbmSync.preflightGates({ mode: state.mode, origin: state.origin, scan: state.scan }); });
    var stopped = FbmSync.preflightApply(state, gates);
    if (stopped) { return stopped; }
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
  // Ô Xung đột của phiên đếm cả dòng cũ vẫn còn xung đột; số chờ quyết trên Sidebar chỉ cộng xung đột mới và trừ dòng đã tự gỡ, vì dòng cũ đã nằm trong số đếm lúc preflight.
  state.counts.conflict += Number(result.conflicts || 0) + Number(result.conflictsKept || 0);
  state.metadata.conflictCount = Math.max(0, Number(state.metadata.conflictCount || 0) + Number(result.conflicts || 0) - Number(result.conflictsCleared || 0));
  state.counts.skipped += Number(result.skipped || 0);
  if (typeof FbmSync.businessStepAdd === 'function') {
    FbmSync.businessStepAdd(state, reconcileStep, { received: count, written: Number(result.written || 0), conflict: Number(result.conflicts || 0) + Number(result.conflictsKept || 0), skipped: Number(result.skipped || 0), sheetWriteBatches: Number(result.sheetWriteBatches || 0) });
  }
  FbmSync.stateWrite(state);
  return result;
};

/**
 * Áp kết quả một phần kiểm tra trước phiên vào state: thêm vấn đề vào kết quả lượt, ghi Log, dừng lượt khi có lỗi chặn, chờ chấp thuận khi số bản ghi sắp đẩy chạm ngưỡng. Trả kết quả dừng lượt, hoặc `null` để chạy tiếp.
 * Chấp thuận hỏi một lần mỗi lượt: người dùng đồng ý thì lượt kiểm lại phiên và dữ liệu nhưng không hỏi lại.
 */
FbmSync.preflightApply = function (state, preflight) {
  state.metadata = state.metadata || {};
  var known = {};
  (state.metadata.preflightIssues || []).forEach(function (item) { known[item.code + '' + item.message] = true; });
  state.metadata.preflightIssues = (state.metadata.preflightIssues || []).concat((preflight.issues || []).filter(function (item) { return !known[item.code + '' + item.message]; }));
  if (typeof FbmSync.logPreflight === 'function') { FbmSync.logPreflight(preflight); }
  if (typeof preflight.conflictPending === 'number') { FbmSync.conflictPendingNote(state, preflight.conflictPending); }
  if (!preflight.ok) {
    var first = preflight.blocking[0] || {};
    state.phase = 'error'; state.entity = ''; state.cursor = {}; state.lastFailureCode = 'SYNC_PREFLIGHT_FAILED';
    state.lastError = 'Preflight thất bại: ' + String(first.message || 'Thiếu điều kiện trước phiên.');
    state.message = state.lastError;
    FbmSync.stateWrite(state);
    return { ok: false, code: 'SYNC_PREFLIGHT_FAILED', status: FbmSync.statusView(), error: state.lastError };
  }
  var count = Number(preflight.candidateCount || 0);
  if (FbmSync.canWriteFbm(state.mode) && count > 0 && count >= FbmSync.approvalThreshold() && state.metadata.approvalGranted !== true) {
    state.phase = 'awaiting_approval'; state.entity = '';
    state.cursor = { kind: 'push_approval', candidateCount: count };
    state.message = 'Có ' + count + ' bản ghi thay đổi; cần người dùng chấp thuận trước khi ghi FBM.';
    state.metadata.approvalRequired = true;
    state.metadata.approvalCount = count;
    FbmSync.stateWrite(state);
    return { ok: true, request: null, status: FbmSync.statusView(), approvalRequired: true };
  }
  return null;
};

/**
 * Phần đắt của kiểm tra trước phiên (đọc và hash cả hai Sheet, dựng ứng viên đẩy), chạy ngay sau khi phiên FBM xác thực xong và trước request dữ liệu đầu tiên. Chiều chạy không cần thì không làm gì.
 * Đặt ở đây chứ không ở đầu lượt: tab FBM treo hay phiên hỏng thì lượt dừng ở bước xác thực mà ShinCRM chưa tốn công tính; lượt nền lỗi liền nhiều lần không lặp lại việc tính.
 */
FbmSync.preflightLocalStep = function (state) {
  var options = { mode: state.mode, origin: state.origin, scan: state.scan };
  if (typeof FbmSync.preflightLocal !== 'function' || !FbmSync.preflightNeedsLocal(options)) { return null; }
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'preflight_hash', options); }
  var preflight = FbmSync.withLocalSnapshot(function () { return FbmSync.preflightLocal(options, []); });
  if (typeof FbmSync.businessStepFinish === 'function') {
    FbmSync.businessStepFinish(state, 'preflight_hash', preflight.ok ? 'ok' : 'error', Object.assign({}, preflight.hashSummary || {}, { candidateCount: Number(preflight.candidateCount || 0), errors: Number(preflight.blocking.length || 0), skipped: Number(preflight.warnings.length || 0), error: !preflight.ok && String(preflight.blocking[0] && preflight.blocking[0].message || '') }));
  }
  return FbmSync.preflightApply(state, preflight);
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
  if (typeof FbmSync.businessStepFinish === 'function') { FbmSync.businessStepFinish(state, 'session', 'ok', {}); }
  if (FbmSync.preflightLocalStep(state)) { return null; }
  // Category là cấu hình của người dùng; đồng bộ chỉ đọc và đối chiếu. Chiều Lấy không nạp danh mục FBM (`needsFbmLookups`).
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
  var scope = firstPage && typeof FbmSync.scope === 'function' ? FbmSync.scope() : null;
  var scan = firstPage ? { total: Number(grid && grid.total || 0), seen: 0 } : (state.metadata.customerScan || { total: 0, seen: 0 });
  if (scope && (scope.fbmNew || []).length) { scan.scopeUnseen = scope.fbmNew.slice(); }
  scan.seen = Number(scan.seen || 0) + (grid && grid.rows ? grid.rows.length : 0);
  // Mã chỉ định chưa có trên Sheet: FBM lọc `ma_kh in (...)` nên mã gõ sai trả về không dòng nào mà không báo lỗi; gạch dần các mã FBM có trả để cuối danh sách biết mã nào không có.
  if ((scan.scopeUnseen || []).length && grid && grid.rows) {
    var returned = {};
    grid.rows.forEach(function (row) { returned[String(row.ma_kh || '').trim().toUpperCase()] = true; });
    scan.scopeUnseen = scan.scopeUnseen.filter(function (code) { return !returned[String(code).trim().toUpperCase()]; });
  }
  state.metadata.customerScan = scan;
  // Mẫu số tiến trình là số khách của lượt: FBM đã lọc theo phạm vi thử nên `TotalRowCount` chính là số mã thử.
  if (firstPage) { state.progress = { done: 0, total: scan.total }; }
};

/** Tử số tiến trình: số khách đã xử lý xong (đã quét hết giao dịch, hoặc không có giao dịch để quét). */
FbmSync.progressCustomersDone = function (state, count) {
  state.progress = state.progress || { done: 0, total: 0 };
  state.progress.done = Number(state.progress.done || 0) + Number(count || 0);
};

/** Kết thúc lượt đọc: cờ vắng mặt đã do cửa ghi gắn theo từng lô nên ở đây chỉ chốt lượt và xóa danh sách đọc của lượt. */
FbmSync.finishPullRun = function (state) {
  state.cursor = {}; state.entity = '';
  FbmSync.readListClear();
  state.phase = 'done';
  state.message = FbmSync.runDoneMessage(state);
  FbmSync.stateWrite(state);
  return true;
};

/**
 * Hết danh sách toàn bộ khách. Chỉ xét khách vắng khi lượt đã nhận đủ số khách FBM báo ở trang đầu: lượt dừng sớm vì phân trang hỏng mà vẫn xét thì mọi khách chưa quét tới bị coi là vắng (gặp thật 2026-10-07: 1.262/1.312 khách).
 * Thiếu tổng hoặc nhận chưa đủ thì phiên kết thúc lỗi `FBM_SCAN_INCOMPLETE` trước cửa ghi, để Sidebar và Log đều thấy; chưa có gì được ghi vì danh sách khách chỉ đánh dấu.
 */
FbmSync.customerScanEnd = function (state) {
  var scan = state.metadata && state.metadata.customerScan || {}, total = Number(scan.total || 0), seen = Number(scan.seen || 0);
  if (seen < total || (!total && seen > 0)) {
    state.phase = 'error'; state.lastFailureCode = 'FBM_SCAN_INCOMPLETE';
    state.lastError = 'Lượt quét chỉ nhận ' + seen + '/' + (total || '?') + ' khách FBM nên đã dừng trước khi đọc chi tiết và chưa ghi gì. Báo người phụ trách kỹ thuật kiểm tra phân trang Customer.';
    state.message = state.lastError;
    FbmSync.stateWrite(state);
    return { ok: false, code: 'FBM_SCAN_INCOMPLETE', request: null, status: FbmSync.statusView(), error: state.lastError };
  }
  // Số khách mốc của bước đếm chỉ ghi ở đây: lượt đã đọc đủ danh sách toàn bộ khách.
  FbmSync.customerBaselineWrite(total);
  FbmSync.scopeUnseenNote(state, scan.scopeUnseen);
  FbmSync.customerAbsentMark(state);
  return FbmSync.activityStagesContinue(state, {});
};

/** Mã khách chỉ định mà danh sách khách FBM không trả về: cảnh báo ở kết quả phiên và ghi Log, phiên vẫn chạy cho các khách còn lại. */
FbmSync.scopeUnseenNote = function (state, codes) {
  if (!(codes || []).length) { return; }
  var message = 'FBM không trả về khách nào có mã: ' + codes.join(', ') + '. Kiểm tra lại mã trong danh sách khách chỉ định (đủ ký tự, đúng tiền tố) hoặc quyền xem của tài khoản FBM.';
  state.metadata.preflightIssues = (state.metadata.preflightIssues || []).concat([{ code: 'FBM_SCOPE_CODE_NOT_ON_FBM', severity: 'warn', scope: 'fbm_sync', message: message, blocking: false }]);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'scope_code_not_on_fbm', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', cycleId: String(state.runId || ''), reason: message, detail: { codes: codes.slice() } }); }
};

/** Mở chặng đọc kế của lượt; hết chặng thì chốt lượt hoặc sang chiều đẩy. Trả kết quả của `continue`. */
FbmSync.activityStagesContinue = function (state, extra) {
  var request = FbmSync.activityStageNext(state);
  if (request) { return Object.assign({ ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() }, extra || {}); }
  return FbmSync.pullFinishOrPush(FbmSync.stateRead(), extra);
};

/** Chuyển từ lookup sang grid Customer, kể cả khi lookup chỉ đọc bị lỗi. */
FbmSync.beginCustomerPull = function (state) {
  if (state.mode === 'push') {
    FbmSync.prepareCategoryGate(state);
    state.phase = 'push'; state.entity = 'customer'; state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    state.message = 'Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...';
    FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  FbmSync.prepareCategoryGate(state);
  if (typeof FbmSync.businessStepStart === 'function' && state.scan === 'full') {
    FbmSync.businessStepStart(state, 'pull_customer', { mode: state.mode, scan: state.scan, entity: 'customer' });
    FbmSync.businessStepStart(state, 'reconcile_customer', { mode: state.mode, scan: state.scan, entity: 'customer' });
  }
  FbmSync.activityLayersBegin();
  if (state.scan === 'detail' || state.scan === 'activity_bulk') {
    var stageRequest = FbmSync.activityStageNext(state);
    if (!stageRequest) { FbmSync.finishPullRun(state); }
    return stageRequest;
  }
  FbmSync.seenStoreBegin('customer', FbmSync.readLocal('customer'));
  FbmSync.scanJobOpen(state, { entity: 'customer', type: 0, pageIndex: -1, pageValue: null, pageItems: null, count: FbmSync.BUDGET.scanCustomerRows, seen: 0 });
  state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Đang đọc khách hàng từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.scanJobRequest(state);
};

/** Sau khi đọc xong mọi chặng: chế độ hai chiều chuyển sang đẩy, chế độ lấy chốt lượt. Danh sách đọc của lượt xóa trước khi sang đẩy. */
FbmSync.pullFinishOrPush = function (state, extra) {
  var result = Object.assign({ ok: true, status: null }, extra || {});
  if (FbmSync.canWriteSheet(state.mode) && FbmSync.canWriteFbm(state.mode)) {
    FbmSync.readListClear();
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
 * Nhận một gói Customer của việc quét: chỉ đánh dấu khách vào danh sách đọc, không ghi Sheet; đánh dấu xong mới tăng cursor. Hết gói của trang thì xin trang kế đến khi đủ tổng FBM báo; hết trang thì sang cửa ghi.
 * Gói đầu của trang lưu dòng đầu; mỗi gói lưu khóa của dòng cuối, vì trang kế cần cả hai mà gói cuối có thể không còn dòng nào.
 */
FbmSync.customerScanChunk = function (state, cursor, rawResponse) {
  var accepted = FbmSync.scanJobAccept(state, cursor, rawResponse), grid;
  if (accepted.result) { return accepted.result; }
  var chunk = accepted.chunk;
  // Gói không ghép được cột (thiếu cột, trùng cột) thì dừng phiên như gói lạ: không đoán cột theo vị trí, không ghi gì.
  try { grid = FbmSync.rowsToRecords('customer', FbmSync.protocol.parse(rawResponse)); } catch (shapeError) { return FbmSync.scanJobMismatch(state, String(shapeError && shapeError.message || shapeError)); }
  var marked = FbmSync.customerScanMark(state, grid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }));
  FbmSync.customerScanRecord(state, { total: chunk.totalRowCount, rows: grid.rows }, Number(cursor.page || 0) === 0 && chunk.index === 0);
  if (chunk.index === 0) { cursor.pageFirst = FbmSync.customerPageItem(grid.rows[0]); FbmSync.scanJobOversize(state, 'customer', chunk.oversize); }
  if (grid.rows.length) { var lastRow = grid.rows[grid.rows.length - 1]; cursor.pageLast = FbmSync.customerPageItem(lastRow); cursor.pageLastValue = FbmSync.customerPageValue(lastRow); }
  if (!FbmSync.scanJobAdvance(cursor, chunk)) {
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), marked: marked };
  }
  var scanTotal = Number(state.metadata.customerScan && state.metadata.customerScan.total || 0);
  if (FbmSync.customerNext(state, { length: chunk.rowCount, firstItem: cursor.pageFirst || '', lastItem: cursor.pageLast || '', lastValue: cursor.pageLastValue || [] }, scanTotal)) {
    cursor.page = Number(cursor.page || 0) + 1; cursor.attempt = 0; cursor.restarts = 0;
    FbmSync.scanJobOpen(state, cursor);
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), marked: marked };
  }
  return FbmSync.customerScanEnd(state);
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
  if (!FbmSync.requestAnswered(state, responseRequestId)) {
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
  // Sau xác thực Activity lượt có thể dừng (liên kết sai, kiểm tra dữ liệu chặn, chờ chấp thuận): trả đúng lý do dừng chứ không trả "không có request".
  if (cursor.kind === 'authorize_activity') {
    var activityRequest = FbmSync.authContinue('activity', response), after = activityRequest ? null : FbmSync.stateRead();
    if (after && after.phase === 'error') { return { ok: false, code: after.lastFailureCode, request: null, status: FbmSync.statusView(), error: after.lastError }; }
    return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView(), approvalRequired: !!after && after.phase === 'awaiting_approval' };
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
  // Cửa ghi: một lô đọc chi tiết hoặc một lô tra mã; hết khách của chặng thì sang chặng kế.
  if (cursor.kind === 'activity_grid') {
    var batchStep = FbmSync.activityBatchContinue(state, cursor, rawResponse);
    if (!batchStep.done) { return batchStep.result; }
    return FbmSync.activityStagesContinue(batchStep.state, { imported: batchStep.imported });
  }
  state.phase = 'error'; state.lastError = 'Không nhận diện được cursor đồng bộ.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};
