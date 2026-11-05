/**
 * Khung một lát đồng bộ: mọi lệnh có lát (`start`, `continue`) chạy trong `runSlice` khi đã cầm khóa điều phối; lệnh `continue` đi đúng một đường `sliceContinue`.
 * Bộ xử lý của chặng cũ trong `CURSOR_TABLE` mang `legacy: true`: chúng tự đọc và ghi ô lượt. Chặng theo hợp đồng chung chạy qua `stageRun`: nhận bản sao ô lượt, trả `{ patch, next | end }`, khung gộp patch và phát request.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Ranh giới một lát đồng bộ, chạy bên trong khóa điều phối. Lát giữ một bản ô lượt (`sliceStore`): mọi hàm trong lát đọc và sửa cùng bản đó, cuối lát ghi xuống kho một lần.
 * `state`: bản cửa lệnh đã đọc trong cùng lần cầm khóa (để kiểm lệnh), thành bản của lát; không truyền thì lát đọc ở lần `stateRead` đầu.
 * Lát ném lỗi thì chuyển lượt sang lỗi trên bản của lát rồi mới ghi, trước khi nhả khóa (nhả khóa rồi mới ghi thì một lát khác có thể chen vào giữa). Lát lồng trong lát dùng chung bản của lát ngoài.
 */
FbmSync.runSlice = function (work, state) {
  var owner = !FbmSync.sliceStore, failure = null, result;
  if (owner) { FbmSync.sliceStore = { state: state || null, dirty: false }; }
  try {
    // Áp cờ dừng nằm trong khối bắt lỗi: state hay cờ hỏng thì lượt cũng được ghi lỗi như mọi lỗi của lát.
    result = FbmSync.stopPendingApply().stopped ? { ok: true, code: 'SYNC_STOPPED', request: null, status: FbmSync.statusView() } : FbmSync.stopBeforeIssue(work());
  } catch (error) {
    failure = error;
    FbmSync.controlFailRun(error);
  }
  FbmSync.recordIssuesFlush();
  if (owner) { FbmSync.sliceClose(failure); }
  if (failure) { throw failure; }
  return FbmSync.runLeftOpenClose(result);
};
/**
 * Ghi bản của lát xuống kho. Ghi hỏng khi lát chạy êm thì đưa lượt sang lỗi trên ô lượt trong kho rồi ném; lát đã lỗi sẵn thì chỉ thêm một dòng Log, lỗi gốc vẫn là lỗi được ném.
 */
FbmSync.sliceClose = function (failure) {
  try { FbmSync.sliceStoreClose(); }
  catch (closeError) {
    FbmSync.controlFailRun(closeError);
    if (!failure) { throw closeError; }
  }
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
  conflict_refresh: { legacy: true, run: function (rawResponse) { return FbmSync.conflictOpened(rawResponse); } },
  customer_count: {
    inputs: function (state) { return FbmSync.customerCountInputs(state); },
    stage: function (ctx) { return FbmSync.customerCountStage(ctx); },
    end: function (state, end) { return FbmSync.customerCountEnd(state, end); }
  },
  run: { legacy: true, run: function (rawResponse) { return FbmSync.continueRun(rawResponse); } }
};
FbmSync.cursorTable = function (kind) {
  return Object.prototype.hasOwnProperty.call(FbmSync.CURSOR_TABLE, kind) && kind !== 'run' ? FbmSync.CURSOR_TABLE[kind] : FbmSync.CURSOR_TABLE.run;
};
/** Response về qua một cửa: qua các phép kiểm chung (`replyAdmit`) rồi cursor chọn bộ xử lý qua `cursorTable`. Bộ xử lý của từng kiểu cursor không kiểm lại. */
FbmSync.continue = function (rawResponse) {
  var state = FbmSync.stateRead(), stop = FbmSync.replyAdmit(state, FbmSync.responseRequestId(rawResponse), rawResponse);
  if (stop) { return stop; }
  var entry = FbmSync.cursorTable(String((state.cursor || {}).kind || ''));
  // Lượt nền vừa đóng thì `backgroundTail` ghi sổ tiến trình và mở tiến trình đến hạn kế; chặng cũ tự gọi trong `continueRun`.
  return entry.legacy ? entry.run(rawResponse) : FbmSync.backgroundTail(FbmSync.stageRun(entry, state, rawResponse));
};

/**
 * Sổ sách chung khi response của request đang chờ về tới, trước khi chặng đọc nó: bỏ request đang chờ, ghi dấu vết vận chuyển, đánh dấu cổng phiên đã nhận response, giữ cookie Extension bắt được.
 * Sửa trên ô lượt của lát; người gọi ghi.
 */
FbmSync.replyIntake = function (state, rawResponse) {
  var cursor = state.cursor || {}, requestId = String(state.activeRequestId || ''), transportTrace = rawResponse && rawResponse.transport && rawResponse.transport.trace, meta = FbmSync.traceResponse(rawResponse);
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now();
  if (transportTrace) { FbmSync.traceImport(state, transportTrace, { runId: state.runId, requestId: requestId, phase: state.phase, operation: cursor.operation, entity: state.entity, recordId: state.current }); }
  FbmSync.traceEvent(state, 'fbm_response_received', { requestId: requestId, httpStatus: meta.httpStatus, responseLength: meta.responseLength });
  FbmSync.sessionGateResponseStarted(state);
  FbmSync.applyTransportSession(state, rawResponse);
  return state;
};

/**
 * Người điều phối một chặng theo hợp đồng chung: đọc đầu vào chặng cần qua cổng chủ của chúng (`inputs`), chạy chặng trên bản sao ô lượt (chặng không sửa được ô lượt thật), gộp patch rồi:
 * `next` thì phát request qua `nextEnvelope`; `session.suspected` thì nhường cổng phiên probe lại; `end` thì giao kết quả cho bước kết của chặng (`end`). Chặng ném lỗi thì `runSlice` đóng lượt lỗi.
 */
FbmSync.stageRun = function (entry, state, rawResponse) {
  FbmSync.replyIntake(state, rawResponse);
  FbmSync.stateWrite(state);
  var out = entry.stage({ state: JSON.parse(JSON.stringify(state)), reply: rawResponse, inputs: entry.inputs ? entry.inputs(state) : {}, now: Date.now() }) || {};
  FbmSync.stagePatchApply(state, out.patch);
  if (out.session && out.session.suspected) {
    var probe = FbmSync.sessionGateProbeRequest(state, state.cursor, out.session.suspected);
    return probe ? { ok: true, request: probe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
  }
  if (out.next) { return { ok: true, request: FbmSync.nextEnvelope(out.next), status: FbmSync.statusView() }; }
  if (!out.end) { var empty = new Error('Chặng ' + String(state.cursor && state.cursor.kind || '') + ' không trả next hay end.'); empty.code = 'STAGE_RESULT_EMPTY'; throw empty; }
  return entry.end(state, out.end);
};
/**
 * Gộp patch của chặng vào ô lượt của lát rồi đánh dấu ghi. `metadata` gộp nông vào metadata hiện có; `logs` là các dòng Log chặng muốn ghi, mang mã lượt khi dòng chưa có; trường khác thay nguyên giá trị.
 */
FbmSync.stagePatchApply = function (state, patch) {
  var value = patch || {};
  Object.keys(value).forEach(function (key) {
    if (key === 'logs') { return; }
    if (key === 'metadata') { state.metadata = Object.assign(state.metadata || {}, value.metadata); return; }
    state[key] = value[key];
  });
  (value.logs || []).forEach(function (line) { logEvent(Object.assign({ source: 'fbm_sync', cycleId: String(state.runId || '') }, line)); });
  return FbmSync.stateWrite(state);
};
/**
 * Phép kiểm chung của mọi kết quả và lỗi Extension nộp về, theo thứ tự: lượt quá hạn thì thu hồi; không thuộc request đang chờ thì bỏ (`staleReplyDrop`); response lệch mã hợp đồng thì dừng. Trả `null` khi được xử lý tiếp.
 * `rawResponse` bỏ trống khi nộp lỗi gửi request (không có response để so mã hợp đồng).
 */
FbmSync.replyAdmit = function (state, requestId, rawResponse) {
  var stale = FbmSync.staleRunCheck(state, Date.now());
  if (stale) { var closed = FbmSync.staleRunClose(state, stale); return { ok: false, code: closed.lastFailureCode, request: null, status: FbmSync.statusView(), error: closed.lastError, stale: true }; }
  if (!FbmSync.requestAnswered(state, requestId)) { return FbmSync.staleReplyDrop(state, requestId, !rawResponse); }
  return rawResponse ? FbmSync.contractGate(rawResponse) : null;
};

/**
 * Người điều phối lệnh `continue`: nộp lặp thì phát lại request đã cấp; lỗi gửi thì qua bảng lỗi đường truyền; response thì qua `continue`. Hai cửa đều qua `replyAdmit` trước.
 * Relay chỉ nộp khi công tắc tổng còn bật. Lượt đang mở đã được đóng ở đầu lát (`runSlice` áp điều kiện dừng), nên nhánh này chỉ còn chặn response của lượt đã đóng.
 */
FbmSync.sliceContinue = function (input, state) {
  FbmSync.traceImport(state, input.clientTrace);
  if (FbmSync.submitResubmitted(state, input.response ? FbmSync.responseRequestId(input.response) : String(input.error.requestId || ''))) { return FbmSync.envelopeResubmit(state); }
  if (input.error) { return FbmSync.transportFailureRun(input.error); }
  if (input.source === 'relay' && !settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', request: null, status: FbmSync.statusView() }; }
  // Lượt nền không ghi dòng Log theo pha: nhịp nền chạy vài phút một lần, ghi mỗi lần đổi pha làm trôi Log thật. Xét theo lượt chứ không theo kênh: lượt tay cũng nộp qua relay.
  var before = FbmSync.statusView(), result = FbmSync.continue(input.response);
  if (before.origin !== 'background' && result && FbmSync.shouldLogStatus(before, result.status)) { FbmSync.logStatus(result.status, 'slice'); }
  return result;
};

/** Kết quả hay lỗi không thuộc request đang chờ (về muộn sau khi lượt đóng, hoặc của lượt trước): bỏ, không xử lý và không phát lại request nào, kể cả lệnh ghi. */
FbmSync.staleReplyDrop = function (state, requestId, isError) {
  FbmSync.logStaleResponse(state, requestId, isError ? 'transport_failure_stale' : 'stale_response');
  var message = isError ? 'Lỗi cầu nối không còn thuộc request đang chờ.' : 'Response FBM đã cũ hoặc phiên đã bị dừng; không tiếp tục cursor.';
  return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: message };
};

/**
 * Extension không gửi được request tới tab FBM: qua `replyAdmit` (chỉ nhận lỗi của đúng request đang chờ), tra `transportRecoverPlan` rồi gọi công cụ cứu tương ứng; không cứu được thì đóng lượt lỗi với đúng mã Extension báo.
 * Giữ phiên chạy khi ô lượt chưa có mã lượt nên chưa đóng qua `runFail` được; nhánh đó đặt phase lỗi trực tiếp.
 */
FbmSync.transportFailureRun = function (payload) {
  var value = payload || {}, requestId = String(value.requestId || '');
  var state = FbmSync.stateRead(), stop = FbmSync.replyAdmit(state, requestId, null);
  if (stop) { return stop; }
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
  // Ghi Log khi lượt còn mở để dòng mang nhãn lượt; đóng lượt trước thì nhãn rơi về kênh gọi.
  FbmSync.sessionGateRecordFailure(state, failureCode, failureMessage, 'transport_failure');
  if (FbmSync.runInProgress(state)) {
    FbmSync.runFail(state, failureCode, failureMessage, { cursor: {} });
  } else {
    Object.assign(state, { activeRequestId: '', deadlineAt: 0, lastFailureCode: failureCode, retryable: false, lastError: failureMessage, message: failureMessage, cursor: {}, phase: 'error' });
  }
  FbmSync.stateWrite(state);
  return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
};
