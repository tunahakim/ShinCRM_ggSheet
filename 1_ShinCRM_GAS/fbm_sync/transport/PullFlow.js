/** Dieu phoi preflight va chieu doc tu FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Trả lời chung khi thao tác của người dùng gặp lượt nền đang chạy: không dừng gì, kèm `status` để Sidebar nêu bước và giờ bắt đầu trong popup hỏi. */
FbmSync.backgroundRunningResult = function () {
  return { ok: false, code: 'SYNC_BACKGROUND_RUNNING', message: 'Một lượt đồng bộ nền đang chạy.', status: FbmSync.statusView() };
};

/** Mở lượt và trả request đầu tiên; lượt xong ngay ở bước mở vẫn kết thúc bằng bước đếm. */
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
    // Lượt vừa chạy dở (không request nào chờ) thì nối lại: luôn kiểm lại phiên trước vì lát trước có thể dừng giữa chừng. Cursor khai `resumable: false` trong bảng cursor (lệnh ghi, lượt đăng nhập) thì không nối mù.
    var kind = String(current.cursor && current.cursor.kind || ''), recent = Date.now() - Number(current.updatedAt || 0) <= 60000;
    if (!recent || !kind || FbmSync.cursorTable(kind).resumable === false) { return { ok: false, code: 'SYNC_BUSY', status: FbmSync.statusView() }; }
    // Đang ở chặng phiên thì gửi lại chính request hỏi phiên (chỉ đọc); không mở chặng phiên lồng trong chặng phiên.
    if (kind !== 'session') { FbmSync.stagePatchApply(current, FbmSync.sessionGateOpen(current, 'issue', 'Đang probe lại phiên FBM trước khi tiếp tục cursor đã lưu...', false)); }
    return { ok: true, request: FbmSync.cursorIssue(), status: FbmSync.statusView(), resumed: true };
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
    return { ok: true, request: FbmSync.cursorIssue(), status: FbmSync.statusView() };
  }
  // Xác thực Customer có cổng phiên: request đầu thực gửi là hỏi thử phiên, xác thực đi sau khi đúng tài khoản.
  state.cursor = { kind: 'authorize_customer' };
  state.message = 'Đang kiểm tra phiên FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.cursorIssue(), status: FbmSync.statusView() };
};
/**
 * Áp một lô bản ghi vừa đọc của lớp xả đọc: chế độ ghi Sheet thì `pullPageApply` ghi; chế độ xem trước chỉ đếm. Sổ đếm và bước nghiệp vụ cộng vào `state` người gọi đang giữ, người gọi ghi.
 * `ctx`: `{ categoryGate, now, accountName }`.
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
  var result = FbmSync.pullPageApply(entity, records || [], ctx);
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
  if (request) { return Object.assign({ ok: true, request: FbmSync.sliceIssue(request), status: FbmSync.statusView() }, extra || {}); }
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
    result.request = FbmSync.sliceIssue(FbmSync.pushStageOpen(state)); result.status = FbmSync.statusView();
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
