/**
 * Khung một lát đồng bộ: mọi lệnh có lát (`start`, `continue`) chạy trong `runSlice` khi đã cầm khóa điều phối; lệnh `continue` đi đúng một đường `sliceContinue`.
 * Bộ xử lý của chặng cũ trong `CURSOR_TABLE` mang `legacy: true`: chúng tự đọc và ghi ô lượt, khung không ghi thay để không có hai lần ghi đè nhau.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Ranh giới một lát đồng bộ, chạy bên trong khóa điều phối: nhả bộ gom vấn đề theo bản ghi, và nếu lát ném lỗi thì chuyển phiên sang lỗi
 * trước khi nhả khóa (nhả khóa rồi mới ghi thì một lát khác có thể chen vào giữa). Đường Sidebar và đường nền dùng chung hàm này.
 */
FbmSync.runSlice = function (work) {
  var failure = null, result;
  // Áp cờ dừng nằm trong khối bắt lỗi: state hay cờ hỏng thì lượt cũng được ghi lỗi như mọi lỗi của lát.
  try {
    result = FbmSync.stopPendingApply().stopped ? { ok: true, code: 'SYNC_STOPPED', request: null, status: FbmSync.statusView() } : FbmSync.stopBeforeIssue(work());
  } catch (error) { failure = error; throw error; } finally {
    FbmSync.recordIssuesFlush();
    if (failure) { FbmSync.controlFailRun(failure); }
  }
  return FbmSync.runLeftOpenClose(result);
};
/** Lệnh Dừng ghi cờ trong lúc lát này đang chạy: không phát request vừa dựng, đóng lượt luôn. Đọc cờ từ kho thật, một lần đọc mỗi lát có request. */
FbmSync.stopBeforeIssue = function (result) {
  if (!result || !result.request) { return result; }
  if (!FbmSync.stopPendingApply(true).stopped) { return result; }
  return Object.assign({}, result, { code: 'SYNC_STOPPED', request: null, status: FbmSync.statusView() });
};
/**
 * Lát trả lời không kèm request trong khi lượt còn ở phase đang chạy và không request nào đang chờ: không ai còn đẩy lượt đi tiếp (Extension hết việc, Sidebar không có gì để gửi).
 * Đóng lượt ngay ở đây, có Log ghi rõ lỗi thuộc GAS, thay vì để lượt treo tới lần hỏi nền sau rồi bị ghi nhầm là Extension bỏ dở.
 */
FbmSync.runLeftOpenClose = function (result) {
  if (!result || typeof result !== 'object' || result.request) { return result; }
  var state = FbmSync.stateRead();
  if (!state.runId || state.activeRequestId || FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) < 0) { return result; }
  var phase = String(state.phase || ''), cursorKind = String(state.cursor && state.cursor.kind || '');
  FbmSync.runFailCurrent('GAS trả lời hết việc trong khi lượt vẫn mở (phase ' + phase + ', cursor ' + (cursorKind || 'trống') + '); đã đóng lượt để lịch nền chạy lại ở lần hỏi sau.', 'RUN_LEFT_OPEN');
  logEvent({ source: 'fbm_sync', action: 'run_left_open', outcome: LOG_ERROR, cycleId: String(state.runId || ''), reason: 'Lỗi GAS: trả lời hết việc trong khi lượt vẫn mở (phase ' + phase + ', cursor ' + (cursorKind || 'trống') + '); đã đóng lượt.' });
  return Object.assign({}, result, { ok: false, code: 'RUN_LEFT_OPEN', status: FbmSync.statusView(), error: FbmSync.stateRead().lastError });
};

/** Ghi phiên lỗi sau exception của lát. Lỗi gốc luôn được ném lại ở chỗ gọi; ghi state hỏng thì chỉ thêm một dòng Log, không thay lỗi gốc. */
FbmSync.controlFailRun = function (error) {
  try {
    FbmSync.runFailCurrent(String(error && error.message || error), String(error && error.code || ''));
  } catch (writeError) {
    logEvent({ source: 'fbm_sync', action: 'state_fail_run', outcome: LOG_ERROR, reason: 'Không ghi được trạng thái lỗi của phiên: ' + String(writeError && writeError.message || writeError) });
  }
};

/**
 * Bảng kiểu cursor → bộ xử lý response của lát. Kiểu không có trong bảng là bước của lượt đồng bộ (`continueRun`).
 * Hàm xử lý tra tên lúc gọi chứ không giữ tham chiếu, để chỗ thay thế (test, bản vá) có hiệu lực.
 */
FbmSync.CURSOR_TABLE = {
  heartbeat: { legacy: true, run: function (rawResponse) { return fbmSyncHeartbeatLocked(rawResponse, {}); } },
  conflict_refresh: { legacy: true, run: function (rawResponse) { return FbmSync.conflictOpened(rawResponse); } },
  run: { legacy: true, run: function (rawResponse) { return FbmSync.continueRun(rawResponse); } }
};
FbmSync.cursorTable = function (kind) {
  return Object.prototype.hasOwnProperty.call(FbmSync.CURSOR_TABLE, kind) && kind !== 'run' ? FbmSync.CURSOR_TABLE[kind] : FbmSync.CURSOR_TABLE.run;
};
/** Response của request đang chờ về qua một cửa; cursor chọn bộ xử lý qua `cursorTable`. */
FbmSync.continue = function (rawResponse) {
  return FbmSync.cursorTable(String((FbmSync.stateRead().cursor || {}).kind || '')).run(rawResponse);
};

/**
 * Người điều phối lệnh `continue`: nộp lặp thì phát lại request đã cấp; lỗi gửi thì qua bảng lỗi đường truyền; response thì qua `continue`.
 * Relay chỉ nộp khi công tắc tổng còn bật: tắt giữa chừng thì không xử lý tiếp, lượt tự đóng khi quá hạn.
 */
FbmSync.sliceContinue = function (input, state) {
  FbmSync.traceImport(input.clientTrace);
  if (FbmSync.submitResubmitted(state, input.response ? FbmSync.responseRequestId(input.response) : String(input.error.requestId || ''))) { return FbmSync.envelopeResubmit(state); }
  if (input.error) { return FbmSync.transportFailureRun(input.error); }
  if (input.source === 'relay' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', request: null, status: FbmSync.statusView() }; }
  // Lượt nền không ghi dòng Log theo pha: nhịp nền chạy vài phút một lần, ghi mỗi lần đổi pha làm trôi Log thật. Xét theo lượt chứ không theo kênh: lượt tay cũng nộp qua relay.
  var before = FbmSync.statusView(), result = FbmSync.continue(input.response);
  if (before.origin !== 'background' && result && FbmSync.shouldLogStatus(before, result.status)) { FbmSync.logStatus(result.status, 'slice'); }
  return result;
};

/**
 * Extension không gửi được request tới tab FBM: chỉ nhận lỗi của đúng request đang chờ, tra `transportRecoverPlan` rồi gọi công cụ cứu tương ứng; không cứu được thì đóng lượt lỗi với đúng mã Extension báo.
 * Giữ phiên chạy khi ô lượt chưa có mã lượt nên chưa đóng qua `runFail` được; nhánh đó đặt phase lỗi trực tiếp.
 */
FbmSync.transportFailureRun = function (payload) {
  var value = payload || {}, requestId = String(value.requestId || '');
  var state = FbmSync.stateRead();
  if (!FbmSync.requestAnswered(state, requestId)) {
    FbmSync.sessionGateRecordFailure(state, 'STALE_RESPONSE', 'Lỗi cầu nối không còn thuộc request đang chờ.', 'transport_failure_stale');
    return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Lỗi cầu nối không còn thuộc request đang chờ.' };
  }
  var failureCode = String(value.code || 'FBM_TRANSPORT_UNAVAILABLE'), failureMessage = String(value.message || 'Extension không gửi được request tới tab FBM.').slice(0, 240), recovered = null, plan;
  // Lỗi khi đọc chính sách đăng nhập hay dựng lại request hỏng thuộc cổng phiên: đóng lượt an toàn, không thử tiếp.
  try { plan = FbmSync.transportRecoverPlan(state, requestId, failureCode, FbmSync.sessionGatePolicy()); }
  catch (policyError) { return FbmSync.sessionGateFailClosed(state, policyError); }
  if (plan === 'activity_windows') { recovered = FbmSync.activityScanToWindows(state, failureCode, failureMessage); }
  if (plan === 'scan_restart') { recovered = FbmSync.scanJobRestart(state, failureCode, failureMessage); }
  if (plan === 'reload_page' || plan === 'open_tab') {
    try { recovered = FbmSync.transportReissue(state, requestId, failureCode, failureMessage, plan); }
    catch (gateError) { return FbmSync.sessionGateFailClosed(state, gateError); }
  }
  if (recovered) { return recovered; }
  state.lastProgressAt = Date.now();
  if (FbmSync.runInProgress(state)) {
    FbmSync.runFail(state, failureCode, failureMessage, { cursor: {} });
  } else {
    Object.assign(state, { activeRequestId: '', deadlineAt: 0, lastFailureCode: failureCode, retryable: false, lastError: failureMessage, message: failureMessage, cursor: {}, phase: 'error' });
  }
  FbmSync.stateWrite(state);
  FbmSync.sessionGateRecordFailure(state, failureCode, failureMessage, 'transport_failure');
  return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
};
