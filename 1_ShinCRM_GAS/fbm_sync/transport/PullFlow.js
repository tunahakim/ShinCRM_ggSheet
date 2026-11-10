/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên; lượt xong ngay ở bước mở vẫn kết thúc bằng bước đếm. */
/** Trả lời chung khi thao tác của người dùng gặp lượt nền đang chạy: không dừng gì, kèm `status` để Sidebar nêu bước và giờ bắt đầu trong popup hỏi. */
FbmSync.backgroundRunningResult = function () {
  return { ok: false, code: 'SYNC_BACKGROUND_RUNNING', message: 'Một lượt đồng bộ nền đang chạy.', status: FbmSync.statusView() };
};

FbmSync.start = function (options) { return FbmSync.runTail(FbmSync.startRun(options)); };
FbmSync.startRun = function (options) {
  // Mỗi call chỉ trả một request; ngữ cảnh nhiều bước nằm trong DocumentProperties.
  var opt = options || {};
  // Tra dãy chặng trước mọi việc: mức quét lạ ném `SYNC_UNKNOWN_SCAN` khi lượt cũ chưa bị đụng tới.
  var plan = FbmSync.runPlanOfStart(opt.scan, opt.pack);
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) {
    return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; hãy bật công tắc tổng trước khi chạy.', status: FbmSync.statusView() };
  }
  var current = FbmSync.stateRead();
  var stale = FbmSync.staleRunCheck(current, Date.now());
  if (stale) { current = FbmSync.staleRunClose(current, stale); }
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
      return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }, FbmSync.scriptSettings(current)), status: FbmSync.statusView(), resumed: true };
    }
    if (!initialRequest) { return { ok: false, code: 'SYNC_BUSY', status: FbmSync.statusView() }; }
  }
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(opt.origin === 'background' ? 'background' : 'pull'); }
  var state = FbmSync.runOpen({
    origin: opt.origin,
    mode: opt.mode,
    scan: plan.scan,
    scanPack: plan.scanPack,
    process: opt.process,
    pollAt: opt.pollAt
  });
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'run', { mode: state.mode, scan: state.scan, origin: state.origin });
  }
  // Kiểm tra liên kết đối chiếu bản nháp người dùng đang xem trên Sidebar; không gửi bản nháp thì đối chiếu liên kết đã lưu.
  state.identityTarget = state.scan === 'identity_check' ? (opt.identity && typeof opt.identity === 'object' ? FbmSync.identityNormalize(opt.identity) : FbmSync.boundIdentity()) : null;
  // Chụp đầu lượt như mức quét: đổi cài đặt giữa chừng chỉ áp từ lượt sau, và không phải đọc lại DocumentProperties mỗi envelope.
  state.requestGap = FbmSync.requestGapMs(settingsValues(FbmSync.SETTING_SECTIONS.run));
  if (state.scan === 'activity_bulk') { state.mode = 'read'; }
  // Lượt Giữ phiên chạy mode `push` nhưng đếm khách và Quét nhanh bù theo chiều lịch nền; cổng đã quyết ở `pushGateDue`.
  state.scheduleMode = state.scan === 'keepalive' ? FbmSync.modeOf(opt.scheduleMode) : '';
  state.pushGate = opt.pushGate || null;
  // Lời duyệt chỉ sống trong lượt tay do nút Chấp thuận mở; lượt nền không bao giờ mang nó nên không tự đẩy tập chạm ngưỡng.
  state.approvedFingerprint = state.origin === 'manual' ? String(opt.approvedFingerprint || '') : '';
  FbmSync.countTailMark(state);
  if (state.origin === 'background') { state.detailCustomerLimit = state.scan === 'detail' ? Math.max(1, Math.floor(opt.detail && opt.detail.customersPerRun || settingsValue(FbmSync.SETTING_SECTIONS.background, 'detailCustomersPerRun'))) : 0; }
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
    return { ok: true, request: FbmSync.sessionSystemEnvelope('identity_user_grid', null, FbmSync.scriptSettings(state)), status: FbmSync.statusView() };
  }
  state.cursor = { kind: 'authorize_customer' };
  state.message = 'Đang kiểm tra phiên FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }, FbmSync.scriptSettings(state)), status: FbmSync.statusView() };
};
/**
 * Áp một lô bản ghi vừa đọc của lớp xả đọc: chế độ ghi Sheet thì `pullPageApply` ghi rồi xóa các mục chờ xác nhận đã khớp; chế độ xem trước chỉ đếm. Sổ đếm và bước nghiệp vụ cộng vào `state` người gọi đang giữ, người gọi ghi.
 * `ctx`: `{ categoryGate, now, accountName }`; hàm đọc sổ chờ đẩy một lần rồi truyền cho `pullPageApply` qua `ctx.pending`.
 */
FbmSync.pullBatchApply = function (state, entity, records, ctx) {
  var count = (records || []).length, pullStep = 'pull_' + String(entity || ''), reconcileStep = 'reconcile_' + String(entity || '');
  state.counts.completed += count;
  state.counts.total = Math.max(Number(state.counts.total || 0), Number(state.counts.completed || 0));
  FbmSync.businessStepAdd(state, pullStep, { received: count });
  if (!FbmSync.canWriteSheet(state.mode)) {
    state.message = 'Đã đọc ' + count + ' bản ghi (chế độ không ghi Sheet).';
    FbmSync.businessStepAdd(state, reconcileStep, { received: count, skipped: count });
    return { ok: true, preview: true, written: 0, skipped: count };
  }
  var result = FbmSync.pullPageApply(entity, records || [], Object.assign({}, ctx, { pending: FbmSync.pendingPushesRead() }));
  result.pendingClears.forEach(function (item) { FbmSync.pendingPushClear(item.entity, item.id); });
  state.counts.succeeded += Number(result.written || 0);
  // Ô Xung đột của phiên đếm cả dòng cũ vẫn còn xung đột; số chờ quyết trên Sidebar chỉ cộng xung đột mới và trừ dòng đã tự gỡ, vì dòng cũ đã nằm trong số đếm lúc preflight.
  state.counts.conflict += Number(result.conflicts || 0) + Number(result.conflictsKept || 0);
  FbmSync.conflictCountShift(state, Number(result.conflicts || 0) - Number(result.conflictsCleared || 0));
  state.counts.skipped += Number(result.skipped || 0);
  if (result.identityBlocks.length) { state.metadata.identityBlocks = (Array.isArray(state.metadata.identityBlocks) ? state.metadata.identityBlocks : []).concat(result.identityBlocks); }
  FbmSync.businessStepAdd(state, reconcileStep, { received: count, written: Number(result.written || 0), conflict: Number(result.conflicts || 0) + Number(result.conflictsKept || 0), skipped: Number(result.skipped || 0), sheetWriteBatches: Number(result.sheetWriteBatches || 0) });
  return result;
};

/**
 * Áp kết quả một phần kiểm tra trước phiên vào state: thêm vấn đề vào kết quả lượt, ghi Log, dừng lượt khi có lỗi chặn. Trả kết quả dừng lượt, hoặc `null` để chạy tiếp.
 * Ngưỡng chấp thuận không xét ở đây: tập sẽ đẩy chỉ biết sau khi kéo về ghi Sheet, nên cổng chấp thuận nằm ở đầu chặng đẩy (`pushPassNext`).
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
    FbmSync.runFail(state, 'SYNC_PREFLIGHT_FAILED', 'Preflight thất bại: ' + String(first.message || 'Thiếu điều kiện trước phiên.'));
    FbmSync.stateWrite(state);
    return { ok: false, code: 'SYNC_PREFLIGHT_FAILED', status: FbmSync.statusView(), error: state.lastError };
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
  if (FbmSync.canWriteFbm(state.mode)) {
    if (!state.pushGate) { state.pushGate = FbmSync.pushGateCheck(state, options); }
    if (!state.pushGate.open) { FbmSync.stateWrite(state); return null; }
  }
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'preflight_hash', options); }
  var preflight = FbmSync.withLocalSnapshot(function () { return FbmSync.preflightLocal(options, []); });
  if (typeof FbmSync.businessStepFinish === 'function') {
    FbmSync.businessStepFinish(state, 'preflight_hash', preflight.ok ? 'ok' : 'error', Object.assign({}, preflight.hashSummary || {}, { candidateCount: Number(preflight.candidateCount || 0), errors: Number(preflight.blocking.length || 0), skipped: Number(preflight.warnings.length || 0), error: !preflight.ok && String(preflight.blocking[0] && preflight.blocking[0].message || '') }));
  }
  return FbmSync.preflightApply(state, preflight);
};

/** Quyết lượt có bỏ chặng đẩy không: đọc cổng đã lưu và dấu hiện tại rồi so (`pushGateSkip`). Chỉ lượt nền mới đọc, vì lượt tay luôn chạy chặng đẩy. */
FbmSync.pushGateCheck = function (state, options) {
  var gateLogs = [], stored = options.origin === 'background' ? FbmSync.pushGateLoad(gateLogs) : null;
  FbmSync.stagePatchApply(state, { logs: gateLogs });
  var gate = FbmSync.pushGateSkip(options, stored, stored ? FbmSync.pushGateMark() : null);
  if (!gate.open) { FbmSync.scheduleTrace('push_gate_closed', FbmSync.PUSH_GATE_CLOSED_TRACE, { scan: String(options.scan || ''), mode: String(options.mode || '') }); }
  return gate;
};

/** Nhận token bootstrap và chuyển sang lookup hoặc đọc grid. */
FbmSync.authContinue = function (entity, response) {
  // Token gắn với phiên và phải lưu trước mọi request ghi.
  // Không đối chiếu danh tính ở đây: cổng phát request buộc mọi `authorize` đi sau bước kiểm tra phiên (grid User so với liên kết), và response xác thực không mang danh tính (Nghiên cứu FBM ch02 2.7).
  var auth = FbmSync.extractAuthorized(response), state = FbmSync.stateRead();
  if (!auth) { throw new Error('FBM không trả mã authorized cho ' + entity + '.'); }
  state.session[entity === 'customer' ? 'customerAuthorized' : 'activityAuthorized'] = auth;
  if (entity === 'customer') {
    if (state.scan === 'identity_probe') {
      state.cursor = { kind: 'identity_user_grid' }; state.phase = 'checking_session'; state.entity = '';
      state.message = 'Đã xác thực phiên; đang đọc thông tin tài khoản FBM...';
      FbmSync.stateWrite(state);
      return FbmSync.sessionSystemRequest('identity_user_grid', null, FbmSync.scriptSettings(state));
    }
    if (state.scan === 'identity_check') {
      FbmSync.identityCheckBegin(state);
      state.phase = 'pull_customer'; state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 };
      state.message = 'Đang kiểm tra liên kết Customer FBM...';
      FbmSync.stateWrite(state);
      return FbmSync.identityCheckCustomerRequest({ type: 0, count: 2000, gridPageIndex: -1, gridPageValue: null, gridRefresh: false }, FbmSync.scriptSettings(state));
    }
    state.cursor = { kind: 'authorize_activity' };
    state.message = 'Đã xác thực Customer; đang xác thực Activity...';
    FbmSync.stateWrite(state);
    return FbmSync.sessionSystemRequest('authorize', { entity: 'activity' }, FbmSync.scriptSettings(state));
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
  return FbmSync.lookupBatchRequest(FbmSync.scriptSettings(state));
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

/** Tử số tiến trình: số khách đã xử lý xong (đã quét hết giao dịch, hoặc không có giao dịch để quét). */
FbmSync.progressCustomersDone = function (state, count) {
  state.progress = state.progress || { done: 0, total: 0 };
  state.progress.done = Number(state.progress.done || 0) + Number(count || 0);
};

/** Kết thúc lượt đọc: cờ vắng mặt đã do cửa ghi gắn theo từng lô nên ở đây chỉ chốt lượt và xóa danh sách đọc của lượt. */
FbmSync.finishPullRun = function (state) {
  FbmSync.runClose(state, 'done', { message: FbmSync.runDoneMessage(state) });
  FbmSync.stateWrite(state);
  return true;
};

/** Mở chặng đọc kế của lượt; hết chặng thì chốt lượt hoặc sang chiều đẩy. Trả kết quả của `continue`. */
FbmSync.activityStagesContinue = function (state, extra) {
  var request = FbmSync.activityStageNext(state);
  FbmSync.stateWrite(state);
  if (request) { return Object.assign({ ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() }, extra || {}); }
  return FbmSync.pullFinishOrPush(state, extra);
};

/** Chuyển từ lookup sang grid Customer, kể cả khi lookup chỉ đọc bị lỗi. */
FbmSync.beginCustomerPull = function (state) {
  var categoryLogs = [];
  FbmSync.prepareCategoryGate(state, categoryLogs);
  FbmSync.stagePatchApply(state, { logs: categoryLogs });
  if (state.mode === 'push') { return FbmSync.pushStageOpen(state); }
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
  return FbmSync.scanJobRequest(state, FbmSync.scriptSettings(state), FbmSync.scope());
};

/** Sau khi đọc xong mọi chặng: chế độ hai chiều chuyển sang đẩy, chế độ lấy chốt lượt. Danh sách đọc của lượt xóa trước khi sang đẩy. */
FbmSync.pullFinishOrPush = function (state, extra) {
  var result = Object.assign({ ok: true, status: null }, extra || {});
  if (FbmSync.canWriteSheet(state.mode) && FbmSync.canWriteFbm(state.mode)) {
    FbmSync.readListClear();
    if (typeof FbmSync.businessFinishSteps === 'function') { FbmSync.businessFinishSteps(state, FbmSync.BUSINESS_PULL_STEPS.customer.concat(FbmSync.BUSINESS_PULL_STEPS.activity)); }
    result.request = FbmSync.nextEnvelope(FbmSync.pushStageOpen(state)); result.status = FbmSync.statusView();
    return result;
  }
  FbmSync.finishPullRun(state);
  result.status = FbmSync.statusView();
  return result;
};

/** Tiếp tục đúng một bước từ response Extension và lưu cursor trước khi trả về. */
/**
 * Response từ Extension lệch mã hợp đồng thì dừng phiên trước mọi xử lý: Extension khác bản có thể đọc envelope sai mà vẫn trả HTTP 200, xử lý tiếp sẽ ghi dữ liệu sai xuống Sheet.
 * Trả `null` khi khớp mã.
 */
FbmSync.contractGate = function (rawResponse) {
  var mismatch = FbmSync.protocol.contractMismatch(rawResponse);
  if (!mismatch) { return null; }
  var before = FbmSync.stateRead(), failed = FbmSync.runFailCurrent(mismatch.message, mismatch.code).failed, state = FbmSync.stateRead();
  // Heartbeat và đăng nhập nền không có phiên đồng bộ nên `runFailCurrent` bỏ qua; vẫn phải nhả request đang chờ, không thì mọi lượt sau kẹt REQUEST_IN_FLIGHT.
  if (!failed) { state.phase = 'error'; state.lastFailureCode = mismatch.code; state.retryable = false; state.lastError = mismatch.message; state.message = mismatch.message; }
  state.activeRequestId = ''; state.deadlineAt = 0;
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'extension_contract_mismatch', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(before.runId || ''), reason: mismatch.message, detail: { code: mismatch.code, expected: mismatch.expected, received: mismatch.received || '(Extension không gửi mã)' } }); }
  return { ok: false, code: mismatch.code, request: null, error: mismatch.message, status: FbmSync.statusView() };
};

/** Tiến đúng một bước cursor và lưu state trước khi trả request kế tiếp; lượt vừa xong thì nối bước đếm (`runTail`). */
FbmSync.continueRun = function (rawResponse) { return FbmSync.backgroundTail(FbmSync.runTail(FbmSync.continueStep(rawResponse))); };
FbmSync.continueStep = function (rawResponse) {
  var state = FbmSync.stateRead();
  var cursor = state.cursor || {}, response;
  FbmSync.replyIntake(state, rawResponse);
  FbmSync.stateWrite(state);
  response = FbmSync.protocol.parse(rawResponse);
  if (typeof FbmSync.continueSessionGate === 'function') {
    var gateResponse = FbmSync.continueSessionGate(state, cursor, rawResponse);
    if (gateResponse) { return gateResponse; }
  }
  if (cursor.kind === 'session_probe' && !FbmSync.protocol.isLiveSessionResponse(rawResponse)) {
    return FbmSync.sessionGateHandleProbeFailure(state, cursor, rawResponse);
  }
  // Phân loại trên wrapper HTTP gốc; parse trước sẽ làm mất status và biến lỗi vận chuyển thành Bugs giả.
  // Probe nhận "chưa xác thực" là kết luận phiên chết, đi tiếp nhánh identity bên dưới để vào cổng đăng nhập, không phải dấu hiệu đáng ngờ cần probe nữa.
  var success = cursor.kind === 'session_probe' && FbmSync.protocol.isUnauthenticatedResponse(rawResponse) ? { ok: true } : FbmSync.protocol.assertSuccess(rawResponse);
  if (!success.ok) {
    if (success.code === 'SESSION_SUSPECTED' && cursor.kind !== 'session_probe') {
      var suspicionProbe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ; request nghiệp vụ đã dừng để probe lại phiên.');
      return suspicionProbe ? { ok: true, request: suspicionProbe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    if (typeof FbmSync.sessionGateHandleFailure === 'function') {
      var gateFailure = FbmSync.sessionGateHandleFailure(state, cursor, success);
      if (gateFailure) { return gateFailure; }
    }
    var failureReason = (success.bug && (success.bug.Message || success.bug.message)) || 'FBM trả về lỗi nghiệp vụ';
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

  // Probe User là bước hệ thống của cổng: đối chiếu đủ bốn định danh rồi
  // mới trả lại cursor nghiệp vụ ban đầu. Không gọi logic Customer tại đây.
  if (cursor.kind === 'session_probe') {
    var probedIdentity = FbmSync.identityUser(response);
    if (!probedIdentity.ok) {
      if (typeof FbmSync.protocol.isUnauthenticatedResponse === 'function' && FbmSync.protocol.isUnauthenticatedResponse(rawResponse)) {
        return FbmSync.sessionGateHandleProbeFailure(state, cursor, rawResponse);
      }
      FbmSync.sessionIdentityClear(state);
      state.phase = 'error'; state.cursor = {}; state.lastFailureCode = probedIdentity.code || 'IDENTITY_PROBE_INCOMPLETE';
      state.lastError = probedIdentity.message; state.message = probedIdentity.message; FbmSync.stateWrite(state);
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, 'session_probe_failure'); }
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    var probedRuntime = { spreadsheetId: String(FbmSync.currentSpreadsheetId ? FbmSync.currentSpreadsheetId() : ''), userId: probedIdentity.userId, username: probedIdentity.username, accountName: probedIdentity.accountName };
    // Kiểm liên kết đối chiếu bản nháp đã chụp vào `identityTarget` (người dùng đang gõ, chưa lưu); mọi lượt khác đối chiếu liên kết đã lưu.
    var checkTarget = state.scan === 'identity_check' && state.identityTarget ? state.identityTarget : null, checkReasons = checkTarget ? FbmSync.identityMismatches(checkTarget, probedRuntime) : [];
    var probedStatus = checkTarget ? { status: checkReasons.length ? 'REBIND_REQUIRED' : 'BOUND', binding: checkTarget } : typeof FbmSync.identityStatus === 'function' ? FbmSync.identityStatus(probedRuntime) : { status: 'BOUND' };
    var gridMismatch = (state.scan !== 'identity_probe' && state.scan !== 'identity_check' && probedStatus.status !== 'BOUND') || probedStatus.status === 'REBIND_REQUIRED';
    // Liên kết phải khớp cả grid User lẫn trang FBM; chưa có liên kết (đọc danh tính để tự điền) thì không có gì để so phía trang.
    var probedBinding = !gridMismatch && probedStatus.status === 'BOUND' ? probedStatus.binding : null;
    var pageCheck = probedBinding ? FbmSync.pageIdentityCheck(probedBinding, FbmSync.pageIdentity(rawResponse), cursor.pageReloaded === true) : { status: 'ok' };
    if (pageCheck.status === 'reload') { return FbmSync.pageIdentityReloadRequest(state, cursor); }
    if (gridMismatch || pageCheck.status !== 'ok') {
      var pageMissing = pageCheck.status === 'missing';
      FbmSync.sessionIdentityClear(state);
      state.phase = 'error'; state.cursor = {}; state.lastFailureCode = pageMissing ? 'FBM_PAGE_IDENTITY_MISSING' : 'SESSION_IDENTITY_MISMATCH';
      state.lastError = pageMissing ? 'Đã tải lại trang FBM nhưng vẫn không thấy mã và tên người đăng nhập trên trang; không xác minh được tài khoản nên request nghiệp vụ đã bị chặn.'
        : checkTarget ? 'Thông tin liên kết đang nhập không khớp tài khoản FBM đang mở ở: ' + FbmSync.identityMismatchLabels(gridMismatch ? checkReasons : pageCheck.reasons) + '.'
        : gridMismatch ?'Tài khoản FBM hiện tại không khớp liên kết đã xác nhận; request nghiệp vụ đã bị chặn.'
          : 'Mã hoặc tên người đăng nhập trên trang FBM không khớp liên kết đã xác nhận; request nghiệp vụ đã bị chặn.';
      state.message = state.lastError; FbmSync.stateWrite(state);
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.message, pageMissing ? 'session_probe_page_missing' : gridMismatch ? 'session_probe_mismatch' : 'session_probe_page_mismatch'); }
      return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
    }
    FbmSync.sessionVerifiedApply(state, probedIdentity);
    if (state.scan === 'identity_probe') {
      state.metadata = state.metadata || {};
      state.metadata.identityProbe = probedRuntime;
      FbmSync.runClose(state, 'done', { message: 'Đã đọc và xác minh nhận diện phiên FBM; chờ người dùng xác nhận lưu.' });
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

  // Hai bước đầu chỉ lấy authorized token cho từng controller.
  if (cursor.kind === 'authorize_customer') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('customer', response)), status: FbmSync.statusView() };
  }
  // Sau xác thực Activity lượt có thể dừng (liên kết sai, kiểm tra dữ liệu chặn): trả đúng lý do dừng chứ không trả "không có request".
  if (cursor.kind === 'authorize_activity') {
    var activityRequest = FbmSync.authContinue('activity', response), after = activityRequest ? null : FbmSync.stateRead();
    if (after && after.phase === 'error') { return { ok: false, code: after.lastFailureCode, request: null, status: FbmSync.statusView(), error: after.lastError }; }
    return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView() };
  }
  if (cursor.kind === 'identity_user_grid') {
    var identityUser = FbmSync.identityUser(response);
    if (!identityUser.ok) {
      FbmSync.runFail(state, identityUser.code, identityUser.message); FbmSync.stateWrite(state);
      return { ok: false, code: identityUser.code, status: FbmSync.statusView(), error: identityUser.message };
    }
    FbmSync.sessionIdentityRecord(state, identityUser);
    state.metadata = state.metadata || {};
    state.metadata.identityProbe = {
      spreadsheetId: String(FbmSync.currentSpreadsheetId ? FbmSync.currentSpreadsheetId() : ''),
      userId: identityUser.userId,
      username: identityUser.username,
      accountName: identityUser.accountName
    };
    FbmSync.runClose(state, 'done', { message: 'Đã đọc nhận diện phiên FBM; chờ người dùng xác nhận lưu.' });
    FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView() };
  }
  // Chế độ ghi phải nạp danh mục trước khi dựng payload ghi; chiều đẩy nạp lại giữa các lô ở chặng đẩy (`push_lookup`).
  if (cursor.kind === 'lookup') {
    if (!FbmSync.lookupBatchApply(state, rawResponse)) {
      var lookupProbe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ khi đọc danh mục; chưa đối chiếu gì, đang probe lại phiên.');
      return lookupProbe ? { ok: true, request: lookupProbe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
    }
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
  if (cursor.kind === 'customer_grid' && state.scan === 'identity_check') {
    var customerGrid = FbmSync.rowsToRecords('customer', response), eligibleCustomerRows = customerGrid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); });
    if (customerGrid.sourceFields) { state.metadata.customerFields = customerGrid.sourceFields; }
    var identityFirstPage = Number(cursor.pageIndex) < 0;
    state.metadata.customerScan = FbmSync.customerScanRecord(identityFirstPage ? null : state.metadata.customerScan, customerGrid.rows, customerGrid.total, null);
    if (identityFirstPage) { state.progress = { done: 0, total: state.metadata.customerScan.total }; }
    FbmSync.identityCheckPage(state, eligibleCustomerRows);
    FbmSync.progressCustomersDone(state, customerGrid.rows.length);
    if (FbmSync.customerNext(state, FbmSync.customerPageOf(customerGrid.rows, true), customerGrid.total)) {
      var identityCursor = state.cursor;
      FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.identityCheckCustomerRequest({ type: 1, count: identityCursor.count, gridPageIndex: identityCursor.pageIndex, gridPageValue: identityCursor.pageValue, pageItems: identityCursor.pageItems, gridRefresh: false, sourceFields: state.metadata.customerFields }, FbmSync.scriptSettings(state))), status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
    }
    FbmSync.identityCheckFinish(state);
    FbmSync.runClose(state, 'done', { message: 'Đã kiểm tra liên kết Customer FBM.' }); FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: eligibleCustomerRows.length };
  }
  state.phase = 'error'; state.lastError = 'Không nhận diện được cursor đồng bộ.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};
