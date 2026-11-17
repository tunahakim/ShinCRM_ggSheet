/**
 * Khung một lát đồng bộ: mọi lệnh có lát (`start`, `continue`) chạy trong `runSlice` khi đã cầm khóa điều phối; lệnh `continue` đi đúng một đường `sliceContinue`.
 * Mọi kiểu cursor trong `CURSOR_TABLE` chạy theo hợp đồng chặng chung qua `stageRun`: chặng nhận bản sao ô lượt, trả `{ patch, next | end }` hoặc `session.suspected`, khung gộp patch và phát request.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Ranh giới một lát đồng bộ, chạy bên trong khóa điều phối. Lát giữ một bản ô lượt (`sliceStore`): mọi hàm trong lát đọc và sửa cùng bản đó, cuối lát ghi xuống kho một lần.
 * `state`: bản cửa lệnh đã đọc trong cùng lần cầm khóa (để kiểm lệnh), thành bản của lát; không truyền thì lát đọc ở lần `stateRead` đầu.
 * Lát ném lỗi thì chuyển lượt sang lỗi trên bản của lát rồi mới ghi, trước khi nhả khóa (nhả khóa rồi mới ghi thì một lát khác có thể chen vào giữa). Lát lồng trong lát dùng chung bản của lát ngoài.
 */
FbmSync.runSlice = function (work, state) {
  var owner = !FbmSync.sliceStore, failure = null, result;
  if (owner) { FbmSync.sliceStore = { state: state || null, snapshot: state ? JSON.stringify(state) : '', dirty: false }; }
  try {
    // Áp cờ dừng nằm trong khối bắt lỗi: state hay cờ hỏng thì lượt cũng được ghi lỗi như mọi lỗi của lát.
    result = FbmSync.stopPendingApply().stopped ? { ok: true, code: 'SYNC_STOPPED', request: null } : FbmSync.stopBeforeIssue(work());
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
  return Object.assign({}, result, { code: 'SYNC_STOPPED', request: null });
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
  return Object.assign({}, result, { ok: false, code: 'RUN_LEFT_OPEN', error: FbmSync.stateRead().lastError });
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
 * Bảng kiểu cursor: mỗi dòng khai bộ xử lý response của lát theo hợp đồng chặng chung (`inputs` nếu chặng cần đọc kho, `stage`, `end`), hàm dựng lại request của cursor (`request(state, cfg)`) và cột `gate`: request của cursor chỉ được gửi khi phiên đã xác minh đúng tài khoản liên kết.
 * Mọi lần dựng lại request từ cursor (phát lại khi nộp lặp, Extension nhận lượt, cứu đường truyền, tiếp tục sau kiểm phiên) đi qua `cursorRequest`, nên không có kiểu cursor nào gửi được mà thiếu dòng. Kiểu không có trong bảng thì `cursorTable` ném.
 * `request` trả `null` chỉ khi cursor không được phép dựng lại (lệnh ghi FBM). `resumable: false`: lượt dừng giữa chừng ở cursor này không được nối lại khi người dùng bấm chạy (lệnh ghi có thể đã tới FBM; lượt đăng nhập không gửi lại mật khẩu). Hàm tra tên lúc gọi chứ không giữ tham chiếu, để chỗ thay thế (test, bản vá) có hiệu lực.
 */
FbmSync.CURSOR_TABLE = {
  activity_grid: {
    gate: true,
    request: function (state, cfg) { var cursor = state.cursor || {}; return FbmSync.activityBatchRequest(state, cfg, FbmSync.scope(), cursor.lookup ? FbmSync.gateLookupChunk(cursor) : null); },
    inputs: function (state) { return FbmSync.activityGridInputs(state); },
    stage: function (ctx) { return FbmSync.activityGridStage(ctx); },
    end: function (state, end) { return FbmSync.activityGridEnd(state, end); }
  },
  authorize_activity: {
    gate: true,
    request: function (state, cfg) { return FbmSync.authorizeRequest('activity', cfg); },
    stage: function (ctx) { return FbmSync.authorizeStage(ctx); },
    end: function (state, end) { return FbmSync.authorizeEnd(state, end); }
  },
  authorize_customer: {
    gate: true,
    request: function (state, cfg) { return FbmSync.authorizeRequest('customer', cfg); },
    stage: function (ctx) { return FbmSync.authorizeStage(ctx); },
    end: function (state, end) { return FbmSync.authorizeEnd(state, end); }
  },
  conflict_refresh: {
    gate: true,
    request: function (state, cfg) { var cursor = state.cursor || {}; return FbmSync.conflictRefreshRequest(cursor.entity, { id: cursor.id, fbmId: cursor.fbmId }, cfg); },
    inputs: function (state) { return FbmSync.conflictRefreshInputs(state); },
    stage: function (ctx) { return FbmSync.conflictRefreshStage(ctx); },
    end: function (state, end) { return FbmSync.conflictRefreshEnd(state, end); }
  },
  customer_count: {
    gate: true,
    request: function (state, cfg) { return FbmSync.customerCountRequest(FbmSync.scope(), cfg); },
    inputs: function (state) { return FbmSync.customerCountInputs(state); },
    stage: function (ctx) { return FbmSync.customerCountStage(ctx); },
    end: function (state, end) { return FbmSync.customerCountEnd(state, end); }
  },
  // Cursor `customer_grid` chỉ còn ở lượt kiểm tra liên kết, đọc không giới hạn phạm vi như lúc mở.
  customer_grid: {
    gate: true,
    request: function (state, cfg) { var cursor = state.cursor || {}; return FbmSync.identityCheckCustomerRequest({ type: Number(cursor.type || 0), count: Number(cursor.count || 2000), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue === undefined ? null : cursor.pageValue, pageItems: cursor.pageItems, gridRefresh: false, sourceFields: (state.metadata || {}).customerFields }, cfg); },
    stage: function (ctx) { return FbmSync.identityCheckGridStage(ctx); },
    end: function (state, end) { return FbmSync.identityCheckGridEnd(state, end); }
  },
  customer_scan: {
    gate: true,
    request: function (state, cfg) { return FbmSync.scanJobRequest(state, cfg, FbmSync.scanJobScope(state.cursor)); },
    inputs: function (state) { return FbmSync.customerScanInputs(state); },
    stage: function (ctx) { return FbmSync.customerScanStage(ctx); },
    end: function (state) { return FbmSync.customerScanEnd(state); }
  },
  // Lượt đọc danh tính để tự điền liên kết: chưa có liên kết để xác minh nên không có cổng.
  identity_user_grid: {
    gate: false,
    request: function (state, cfg) { return FbmSync.identityUserRequest(cfg); },
    inputs: function () { return FbmSync.identityUserGridInputs(); },
    stage: function (ctx) { return FbmSync.identityUserGridStage(ctx); },
    end: function (state, end) { return FbmSync.identityUserGridEnd(state, end); }
  },
  login: {
    gate: false,
    resumable: false,
    request: function (state, cfg) { return FbmSync.loginCursorRequest(state, cfg); },
    inputs: function (state, rawResponse) { return FbmSync.loginInputs(state, rawResponse); },
    stage: function (ctx) { return FbmSync.loginStage(ctx); },
    end: function (state, end) { return FbmSync.loginEnd(state, end); }
  },
  lookup: {
    gate: true,
    request: function (state, cfg) { return FbmSync.lookupBatchRequest(cfg); },
    stage: function (ctx) { return FbmSync.lookupStage(ctx); },
    end: function (state) { return FbmSync.lookupEnd(state); }
  },
  push_lookup: {
    gate: true,
    request: function (state, cfg) { return FbmSync.lookupBatchRequest(cfg); },
    inputs: function () { return FbmSync.pushInputs(); },
    stage: function (ctx) { return FbmSync.pushStage(ctx); },
    end: function (state, end) { return FbmSync.pushEnd(state, end); }
  },
  // Lệnh ghi FBM không bao giờ được dựng lại từ cursor: lần gửi đầu có thể đã tới FBM.
  push_wait: {
    gate: true,
    resumable: false,
    request: function () { return null; },
    inputs: function () { return FbmSync.pushInputs(); },
    stage: function (ctx) { return FbmSync.pushStage(ctx); },
    end: function (state, end) { return FbmSync.pushEnd(state, end); }
  },
  scan_job: {
    gate: true,
    request: function (state, cfg) { return FbmSync.scanJobRequest(state, cfg, FbmSync.scanJobScope(state.cursor)); },
    inputs: function (state) { return FbmSync.activityScanInputs(state); },
    stage: function (ctx) { return FbmSync.activityScanStage(ctx); },
    end: function (state, end) { return FbmSync.activityScanEnd(state, end); }
  },
  // Chặng phiên không có cổng: chính nó là bước xác minh.
  session: {
    gate: false,
    request: function (state, cfg) { return FbmSync.sessionProbeRequest(state.cursor, cfg); },
    inputs: function (state, rawResponse) { return FbmSync.sessionInputs(state, rawResponse); },
    stage: function (ctx) { return FbmSync.sessionStage(ctx); },
    end: function (state, end) { return FbmSync.sessionEnd(state, end); }
  }
};
FbmSync.cursorTable = function (kind) {
  if (Object.prototype.hasOwnProperty.call(FbmSync.CURSOR_TABLE, kind)) { return FbmSync.CURSOR_TABLE[kind]; }
  var unknown = new Error('Kiểu cursor "' + String(kind || '') + '" không có trong CURSOR_TABLE; đã dừng lượt thay vì đoán bước tiếp.'); unknown.code = 'CURSOR_KIND_UNKNOWN'; throw unknown;
};
/** Dựng lại request của cursor đang lưu qua dòng bảng của nó; không lưu payload hay cookie nên lần dựng lại không làm lộ bí mật. */
FbmSync.cursorRequest = function (state) {
  return FbmSync.cursorTable(String(state.cursor && state.cursor.kind || '')).request(state, FbmSync.scriptSettings(state));
};
/** Response về qua một cửa: qua các phép kiểm chung (`replyAdmit`) rồi cursor chọn bộ xử lý qua `cursorTable`. Bộ xử lý của từng kiểu cursor không kiểm lại. */
FbmSync.continue = function (rawResponse) {
  var state = FbmSync.stateRead(), stop = FbmSync.replyAdmit(state, FbmSync.responseRequestId(rawResponse), rawResponse);
  if (stop) { return stop; }
  var entry = FbmSync.cursorTable(String((state.cursor || {}).kind || ''));
  // Lượt nền vừa đóng thì `backgroundTail` ghi sổ tiến trình và mở tiến trình đến hạn kế.
  return FbmSync.backgroundTail(FbmSync.stageRun(entry, state, rawResponse));
};

/**
 * Sổ sách chung khi response của request đang chờ về tới, trước khi chặng đọc nó: bỏ request đang chờ, ghi dấu vết vận chuyển, bỏ dấu phát lại của đường truyền, giữ cookie Extension bắt được.
 * Sửa trên ô lượt của lát; người gọi ghi.
 */
FbmSync.replyIntake = function (state, rawResponse) {
  var cursor = state.cursor || {}, requestId = String(state.activeRequestId || ''), transportTrace = rawResponse && rawResponse.transport && rawResponse.transport.trace, meta = FbmSync.traceResponse(rawResponse);
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now();
  if (transportTrace) { FbmSync.traceImport(state, transportTrace, { runId: state.runId, requestId: requestId, phase: state.phase, operation: cursor.operation, entity: state.entity, recordId: state.current }); }
  FbmSync.traceEvent(state, 'fbm_response_received', { requestId: requestId, httpStatus: meta.httpStatus, responseLength: meta.responseLength });
  FbmSync.transportRetryClear(state);
  FbmSync.applyTransportSession(state, rawResponse);
  return state;
};

/**
 * Người điều phối một chặng theo hợp đồng chung: đọc đầu vào chặng cần qua cổng chủ của chúng (`inputs`), chạy chặng trên bản sao ô lượt (chặng không sửa được ô lượt thật), gộp patch rồi:
 * `next` thì phát request qua `sliceIssue`; `session.suspected` thì mở chặng phiên (`sessionSuspectRun`); `end` thì giao kết quả cho bước kết của chặng (`end`). Chặng ném lỗi thì `runSlice` đóng lượt lỗi.
 * Request gửi lại sau phản hồi đáng ngờ về bình thường thì gỡ dấu đã gửi lại, để lần đáng ngờ sau lại được gửi lại một lần; chặng phiên không gỡ vì chính nó đặt dấu.
 */
FbmSync.stageRun = function (entry, state, rawResponse) {
  var kind = String(state.cursor && state.cursor.kind || '');
  FbmSync.replyIntake(state, rawResponse);
  FbmSync.stateWrite(state);
  var inputs = entry.inputs ? entry.inputs(state, rawResponse) : {}, settings = FbmSync.scriptSettings(state), out = FbmSync.stageCall(state, function (copy) { return entry.stage({ state: copy, reply: rawResponse, inputs: inputs, settings: settings, now: Date.now() }); });
  if (out.session && out.session.suspected) { return FbmSync.sessionSuspectRun(state, out.session.suspected); }
  if (kind !== 'session' && state.metadata && state.metadata.suspectReplayed === true) { FbmSync.stagePatchApply(state, { metadata: { suspectReplayed: false } }); }
  if (out.next) { return { ok: true, request: FbmSync.sliceIssue(state, out.next) }; }
  if (!out.end) { var empty = new Error('Chặng ' + String(state.cursor && state.cursor.kind || '') + ' không trả next hay end.'); empty.code = 'STAGE_RESULT_EMPTY'; throw empty; }
  return entry.end(state, out.end);
};
/**
 * Bước phát request của lát, theo thứ tự: kênh Sidebar giữ chỗ nhận lượt (Extension nhận lượt thì phát lại từ cursor qua đúng bước này); công tắc tổng tắt thì đóng lượt như lệnh Dừng; hết ngân sách lời gọi thì tạm dừng; cổng phiên (cursor có `gate` mà phiên chưa xác minh thì mở chặng phiên, request gửi đi là request hỏi thử); rồi `requestIssue` cấp mã.
 * `state` là ô lượt người gọi đang cầm (bản của lát); bước phát ghi nó một lần ở cuối, nên người gọi không cần ghi trước khi phát. Đây là chỗ duy nhất mở chặng phiên trước khi gửi, và cổng xét theo dòng bảng của cursor đang lưu, nên request nào cũng phải có cursor (cursor trống ném `CURSOR_KIND_UNKNOWN`). `sliceIssue` nhận request chặng đã dựng; `cursorIssue` dựng từ cursor đang lưu (sau khi đổi cursor: mở lượt, nối lại, đếm khách).
 */
FbmSync.sliceIssue = function (state, request) {
  return request ? FbmSync.issueThroughGate(state, function () { return request; }) : null;
};
FbmSync.cursorIssue = function (state) {
  return FbmSync.issueThroughGate(state, FbmSync.cursorRequest);
};
FbmSync.issueThroughGate = function (state, build) {
  FbmSync.stateWrite(state);
  var envelope = FbmSync.issueEnvelope(state, build);
  // Phong bì vừa cấp ghi request đang chờ vào ô lượt; nhánh không phát (dừng, tạm dừng, chặn) tự ghi qua cổng của nó.
  if (envelope) { FbmSync.stateWrite(state); }
  return envelope;
};
FbmSync.issueEnvelope = function (state, build) {
  var sidebar = !!(FbmSync.issueContext && FbmSync.issueContext.channel === 'sidebar');
  // Cổng sẽ mở thì request gửi đi là request hỏi phiên: không dựng request nghiệp vụ (có cursor chưa đủ dữ liệu để dựng trước khi phiên được xác minh).
  var gated = !sidebar && FbmSync.cursorTable(String(state.cursor && state.cursor.kind || '')).gate && !FbmSync.sessionIdentityIsVerified(state);
  var request = gated ? null : build(state);
  if (!gated && !request) { return null; }
  if (sidebar) { return FbmSync.envelopeHold(state, request); }
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) {
    FbmSync.stopPendingApply(true);
    return null;
  }
  // Chạm trần thì tạm dừng với cursor nghiệp vụ còn nguyên (Log và Sidebar thấy đúng chỗ dừng), không mở chặng phiên chỉ để dừng.
  if (FbmSync.budgetCallExhausted()) { return FbmSync.pauseForRuntimeLimit(state); }
  if (gated) {
    FbmSync.stagePatchApply(state, FbmSync.sessionGateOpen(state, 'issue', 'Đang kiểm tra tab và tài khoản FBM...', false));
    request = FbmSync.cursorRequest(state);
  }
  return FbmSync.requestIssue(state, request, Date.now());
};
/**
 * Chạy một công cụ theo hợp đồng chung trên bản sao ô lượt (công cụ không sửa được ô lượt thật) rồi gộp patch nó trả. Công cụ ném lỗi có thể kèm `logs` đã gom (ví dụ dòng quá cỡ của gói cuối): ghi chúng rồi ném tiếp để `runSlice` đóng lượt, không để mất dòng Log nào.
 */
FbmSync.stageCall = function (state, tool) {
  var out;
  try { out = tool(JSON.parse(JSON.stringify(state))) || {}; }
  catch (stageError) { if (stageError && stageError.logs) { FbmSync.stagePatchApply(state, { logs: stageError.logs }); } throw stageError; }
  FbmSync.stagePatchApply(state, out.patch);
  return out;
};
/**
 * Gộp patch của chặng vào ô lượt của lát rồi đánh dấu ghi. `metadata` gộp nông vào metadata hiện có; `logs` là các dòng Log chặng muốn ghi, mang mã lượt khi dòng chưa có; `loginAttempt` là sổ lần thử đăng nhập mới, ghi qua cổng của nó (`loginAttemptWrite`), không vào ô lượt; trường khác thay nguyên giá trị.
 */
FbmSync.stagePatchApply = function (state, patch) {
  var value = patch || {};
  Object.keys(value).forEach(function (key) {
    if (key === 'logs') { return; }
    if (key === 'loginAttempt') { FbmSync.loginAttemptWrite(value.loginAttempt); return; }
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
  if (stale) { var closed = FbmSync.staleRunClose(state, stale); return { ok: false, code: closed.lastFailureCode, request: null, error: closed.lastError, stale: true }; }
  if (!FbmSync.requestAnswered(state, requestId)) { return FbmSync.staleReplyDrop(state, requestId, !rawResponse); }
  return rawResponse ? FbmSync.contractGate(state, rawResponse) : null;
};

/**
 * Người điều phối lệnh `continue`: nộp lặp thì phát lại request đã cấp; lỗi gửi thì qua bảng lỗi đường truyền; response thì qua `continue`. Hai cửa đều qua `replyAdmit` trước.
 * Relay chỉ nộp khi công tắc tổng còn bật. Lượt đang mở đã được đóng ở đầu lát (`runSlice` áp điều kiện dừng), nên nhánh này chỉ còn chặn response của lượt đã đóng.
 */
FbmSync.sliceContinue = function (input, state) {
  FbmSync.traceImport(state, input.clientTrace);
  if (FbmSync.submitResubmitted(state, input.response ? FbmSync.responseRequestId(input.response) : String(input.error.requestId || ''))) { return FbmSync.envelopeResubmit(state); }
  if (input.error) { return FbmSync.transportFailureRun(input.error); }
  if (input.source === 'relay' && !settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', request: null }; }
  // Lượt nền không ghi dòng Log theo pha: nhịp nền chạy vài phút một lần, ghi mỗi lần đổi pha làm trôi Log thật. Xét theo lượt chứ không theo kênh: lượt tay cũng nộp qua relay.
  var before = FbmSync.stateRead(), result = FbmSync.continue(input.response), after = FbmSync.stateRead();
  if (before.origin !== 'background' && result && FbmSync.shouldLogStatus(before, after)) { FbmSync.logStatus(after, 'slice'); }
  return result;
};

/** Kết quả hay lỗi không thuộc request đang chờ (về muộn sau khi lượt đóng, hoặc của lượt trước): bỏ, không xử lý và không phát lại request nào, kể cả lệnh ghi. */
FbmSync.staleReplyDrop = function (state, requestId, isError) {
  FbmSync.logStaleResponse(state, requestId, isError ? 'transport_failure_stale' : 'stale_response');
  var message = isError ? 'Lỗi cầu nối không còn thuộc request đang chờ.' : 'Response FBM đã cũ hoặc phiên đã bị dừng; không tiếp tục cursor.';
  return { ok: false, code: 'STALE_RESPONSE', request: null, error: message };
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
  // Lỗi khi đọc chính sách hay dựng lại request hỏng: đóng lượt an toàn, không thử tiếp.
  try { plan = FbmSync.transportRecoverPlan(state, requestId, failureCode, FbmSync.transportPolicy()); }
  catch (policyError) { return FbmSync.transportFailClosed(state, policyError); }
  if (plan === 'activity_windows' || plan === 'scan_restart') { return FbmSync.scanRecoverRun(state, plan, failureCode, failureMessage); }
  if (plan === 'replay_budget') { failureMessage = ('Đường truyền tới tab FBM chập chờn: lượt đã phát lại request ' + FbmSync.BUDGET.transportReplaysPerRun + ' lần, dừng để không gửi dồn. ' + failureMessage).slice(0, 240); }
  if (plan === 'reload_page' || plan === 'open_tab' || plan === 'replay') {
    try { recovered = FbmSync.transportReissue(state, requestId, failureCode, failureMessage, plan); }
    catch (gateError) { return FbmSync.transportFailClosed(state, gateError); }
  }
  if (recovered) { return recovered; }
  state.lastProgressAt = Date.now();
  // Ghi Log khi lượt còn mở để dòng mang nhãn lượt; đóng lượt trước thì nhãn rơi về kênh gọi.
  FbmSync.transportFailureRecord(state, failureCode, failureMessage, 'transport_failure');
  if (FbmSync.runInProgress(state)) {
    FbmSync.runFail(state, failureCode, failureMessage, { cursor: {} });
  } else {
    Object.assign(state, { activeRequestId: '', deadlineAt: 0, lastFailureCode: failureCode, retryable: false, lastError: failureMessage, message: failureMessage, cursor: {}, phase: 'error' });
  }
  FbmSync.stateWrite(state);
  return { ok: false, code: state.lastFailureCode, request: null, error: state.lastError };
};
