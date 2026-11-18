/** Trace hop FBM độc lập với state nghiệp vụ và sheet Log.
 * Chỉ lưu metadata đã rút gọn; không lưu cookie, mật khẩu hay body request/response.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.TRACE_KEY = 'FBM_SYNC_TRACE_V1';
FbmSync.TRACE_LIMIT = 24;
FbmSync.traceClip = function (value, limit) { return String(value || '').slice(0, Number(limit || 160)); };

/** Ô lượt do bên gọi truyền; `extra` đè lên. Thiếu ô lượt thì ném, để gọi sai chữ ký không thành mốc sai tên mà không ai thấy. */
FbmSync.traceContext = function (state, extra) {
  if (!state || typeof state !== 'object') { throw new Error('Ghi trace thiếu ô lượt: bên gọi truyền ô lượt trước tên mốc.'); }
  var cursor = state.cursor || {}, value = extra || {};
  return {
    runId: FbmSync.traceClip(value.runId !== undefined ? value.runId : state.runId || '', 80),
    requestId: FbmSync.traceClip(value.requestId !== undefined ? value.requestId : state.activeRequestId || '', 100),
    phase: FbmSync.traceClip(value.phase !== undefined ? value.phase : state.phase || '', 80),
    operation: FbmSync.traceClip(value.operation !== undefined ? value.operation : cursor.operation || '', 100),
    entity: FbmSync.traceClip(value.entity !== undefined ? value.entity : state.entity || cursor.entity || '', 40),
    recordId: FbmSync.traceClip(value.recordId !== undefined ? value.recordId : state.current || (cursor.candidate && cursor.candidate.id) || '', 120),
    endpoint: FbmSync.traceClip(value.endpoint || '', 180),
    code: FbmSync.traceClip(value.code || '', 80),
    httpStatus: Number(value.httpStatus || 0) || 0,
    responseLength: Number(value.responseLength || 0) || 0,
    error: FbmSync.traceClip(value.error || '', 500),
    stack: FbmSync.traceClip(value.stack || '', 1200)
  };
};

/** Trong một lần gọi qua `runEntryPoint` thì chỉ gom vào bộ nhớ, ghi một lần ở cuối (PropertyBuffer.js); ngoài đó ghi ngay. */
FbmSync.traceAppend = function (events) {
  if (!Array.isArray(events) || !events.length) { return 0; }
  if (!FbmSync.traceGathering()) { return FbmSync.traceStore(events); }
  var pending = FbmSync.propertyBuffer.tracePending, seen = {}, added = 0;
  pending.forEach(function (item) { seen[FbmSync.traceKey(item)] = true; });
  events.forEach(function (event) {
    if (!event || !event.stage || seen[FbmSync.traceKey(event)]) { return; }
    seen[FbmSync.traceKey(event)] = true; pending.push(event); added += 1;
  });
  return added;
};

/** Gộp sự kiện vào khóa trace, bỏ trùng. Trần theo số mốc và byte thật (mốc lỗi mang stack): bỏ mốc cũ nhất tới khi vừa. Ghi hỏng thì ném; Log do `runEntryPoint` ghi. */
FbmSync.traceStore = function (events) {
  if (!Array.isArray(events) || !events.length) { return 0; }
  var rows = documentMemoRead(FbmSync.props(), FbmSync.TRACE_KEY, 'nhật ký trace đồng bộ', 'array') || [], seen = {}, added = 0;
  rows.forEach(function (item) { if (item && item.stage) { seen[FbmSync.traceKey(item)] = true; } });
  events.forEach(function (event) {
    if (!event || !event.stage || seen[FbmSync.traceKey(event)]) { return; }
    seen[FbmSync.traceKey(event)] = true; rows.push(event); added += 1;
  });
  if (!added) { return 0; }
  for (rows = rows.slice(-FbmSync.TRACE_LIMIT); rows.length > 1 && FbmSync.documentPropertyBytes(JSON.stringify(rows)) > FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT;) { rows.shift(); }
  FbmSync.documentPropertySet(FbmSync.TRACE_KEY, JSON.stringify(rows), 'trace');
  return added;
};

FbmSync.traceEvent = function (state, stage, extra) {
  var event = FbmSync.traceContext(state, extra);
  event.at = Date.now();
  event.stage = String(stage || '');
  FbmSync.traceAppend([event]);
  return event;
};

FbmSync.traceRead = function (limit) {
  var take = Math.max(1, Math.min(Number(limit || 20), FbmSync.TRACE_LIMIT)), rows = documentMemoRead(FbmSync.props(), FbmSync.TRACE_KEY, 'nhật ký trace đồng bộ', 'array') || [];
  // Sự kiện còn gom trong bộ nhớ của lần gọi này cũng phải hiện ở status, nếu không Sidebar thấy trace trễ một lần gọi.
  if (FbmSync.propertyBuffer && FbmSync.propertyBuffer.tracePending.length) { rows = rows.concat(FbmSync.propertyBuffer.tracePending); }
  return rows.slice(-take);
};

FbmSync.traceResponse = function (raw) {
  var value = raw, length = 0, status = 0;
  if (raw && typeof raw === 'object' && raw.body !== undefined) {
    value = raw.body;
    status = Number(raw.status || 0) || 0;
  }
  length = typeof value === 'string' ? value.length : JSON.stringify(value || null).length;
  return { httpStatus: status, responseLength: length };
};

/** Nhận `transport.trace` của Extension, chỉ giữ field an toàn, giới hạn số lượng. */
FbmSync.traceImport = function (state, events, fallback) {
  if (!Array.isArray(events)) { return 0; }
  var base = fallback || {}, context = FbmSync.traceContext(state, base), imported = [];
  events.slice(-20).forEach(function (item) {
    if (!item || !item.stage) { return; }
    imported.push(Object.assign({}, context, {
      runId: item.runId !== undefined ? FbmSync.traceClip(item.runId, 80) : context.runId,
      requestId: item.requestId !== undefined ? FbmSync.traceClip(item.requestId, 100) : context.requestId,
      phase: item.phase !== undefined ? FbmSync.traceClip(item.phase, 80) : context.phase,
      operation: item.operation !== undefined ? FbmSync.traceClip(item.operation, 100) : context.operation,
      entity: item.entity !== undefined ? FbmSync.traceClip(item.entity, 40) : context.entity,
      recordId: item.recordId !== undefined ? FbmSync.traceClip(item.recordId, 120) : context.recordId,
      endpoint: item.endpoint !== undefined ? FbmSync.traceClip(item.endpoint, 180) : context.endpoint,
      code: item.code !== undefined ? FbmSync.traceClip(item.code, 80) : context.code,
      httpStatus: Number(item.httpStatus || 0) || 0,
      responseLength: Number(item.responseLength || 0) || 0,
      error: FbmSync.traceClip(item.error || '', 500),
      stack: FbmSync.traceClip(item.stack || '', 1200),
      at: Number(item.at || 0) || Date.now(),
      stage: String(item.stage)
    }));
  });
  return FbmSync.traceAppend(imported);
};

/** Chi ghi cap buoc nghiep vu: mot cap mo/dong cho moi key trong mot runId. */
FbmSync.BUSINESS_STEPS = {
  run: { action: 'sync_session', label: 'phiên đồng bộ' },
  preflight_hash: { action: 'preflight_hash', label: 'tính hash ShinCRM' },
  session: { action: 'session', label: 'kiểm tra phiên FBM' },
  auto_login: { action: 'auto_login', label: 'đăng nhập FBM tự động' },
  category: { action: 'category', label: 'nạp và đối chiếu Category FBM' },
  pull_customer: { action: 'pull_customer', label: 'đọc Customer từ FBM' },
  reconcile_customer: { action: 'reconcile_customer', label: 'đối soát và cập nhật Customer ShinCRM' },
  pull_activity: { action: 'pull_activity', label: 'đọc Activity từ FBM' },
  reconcile_activity: { action: 'reconcile_activity', label: 'đối soát và cập nhật Activity ShinCRM' },
  push_customer: { action: 'push_customer', label: 'quét và đẩy Customer ShinCRM lên FBM' },
  push_activity: { action: 'push_activity', label: 'quét và đẩy Activity ShinCRM lên FBM' }
};
/** Gửi một dòng Log thường cho cửa lệnh ghi ở cuối lời gọi; công cụ không tự ghi Log thường. Trả `false` khi không có lời gọi nào qua cửa lệnh để người gọi chọn đường khác. */
FbmSync.callLogAdd = function (line) {
  var context = FbmSync.issueContext;
  if (!context || !context.logs) { return false; }
  context.logs.push(line);
  return true;
};
/** Bước mà dòng bắt đầu của lượt tay ghi Log thường. */
FbmSync.BUSINESS_VISIBLE_STARTS = ['run', 'session'];
/** Bước mà dòng hoàn thành ghi Log thường ở mọi lượt (các bước khác chỉ ghi dòng vết khi xong). Tự đăng nhập là sự kiện của tài khoản FBM nên phải thấy được trong Log, kể cả ở lượt nền. */
FbmSync.BUSINESS_VISIBLE_FINISHES = ['run', 'auto_login'];
/** Các bước của chiều Lấy theo đối tượng, đóng cùng nhau khi chặng của đối tượng đó xong. */
FbmSync.BUSINESS_PULL_STEPS = {
  customer: ['pull_customer', 'reconcile_customer'],
  activity: ['pull_activity', 'reconcile_activity']
};

FbmSync.businessStepDefinition = function (key) {
  return FbmSync.BUSINESS_STEPS[String(key || '')] || { action: String(key || 'business_step'), label: String(key || 'bước nghiệp vụ') };
};

FbmSync.businessStepNumbers = function (value) {
  var result = {}, source = value || {};
  Object.keys(source).forEach(function (key) {
    if (typeof source[key] === 'number' && isFinite(source[key])) { result[key] = Number(source[key]); }
  });
  return result;
};

FbmSync.businessStepSummary = function (values) {
  var labels = {
    localRecords: 'bản ghi ShinCRM', baselineComparable: 'bản ghi có baseline', changed: 'bản ghi khác baseline', unchanged: 'bản ghi giống baseline',
    newRecords: 'bản ghi chưa liên kết FBM', withoutBaseline: 'bản ghi thiếu baseline', candidateCount: 'ứng viên đẩy', received: 'bản ghi FBM đã nhận',
    written: 'bản ghi đã ghi Sheet', updated: 'bản ghi đã cập nhật', created: 'bản ghi đã tạo', lookups: 'danh mục Category đã đọc', skipped: 'bản ghi bỏ qua', conflict: 'xung đột',
    errors: 'lỗi', sheetWriteBatches: 'lần ghi Sheet', verified: 'bản ghi FBM đã xác nhận', pushed: 'bản ghi đã đẩy', missing: 'bản ghi không thấy bên FBM'
  }, source = values || [], parts = [];
  Object.keys(labels).forEach(function (key) {
    if (source[key] !== undefined) { parts.push(Number(source[key] || 0) + ' ' + labels[key]); }
  });
  return parts.length ? 'có ' + parts.join(', ') : 'không có số liệu phát sinh';
};

FbmSync.businessStepInput = function (input) {
  var source = input || {}, parts = [];
  ['mode', 'scan', 'entity', 'origin'].forEach(function (key) {
    if (source[key] !== undefined && String(source[key]) !== '') { parts.push(key + ': ' + String(source[key])); }
  });
  return parts.length ? parts.join(', ') : 'không có tham số nghiệp vụ bổ sung';
};

FbmSync.businessStepStart = function (state, key, input) {
  var current = state || {}, metadata = current.metadata = current.metadata || {}, steps = metadata.businessSteps = metadata.businessSteps || {}, name = String(key || ''), definition = FbmSync.businessStepDefinition(name);
  if (!current.runId || steps[name] && steps[name].startedAt) { return false; }
  var detail = Object.assign({}, FbmSync.businessStepNumbers(input), { mode: String(current.mode || ''), scan: String(current.scan || ''), origin: String(current.origin || '') });
  steps[name] = { startedAt: Date.now(), input: detail, totals: {} };
  // Hủy phiên xóa runId trước khi ghi state; giữ runId riêng để dòng đóng bước vẫn cùng cycleId với dòng mở.
  metadata.businessRunId = String(current.runId);
  if (name !== 'run') { metadata.businessActiveStep = name; }
  var line = { source: 'fbm_sync', action: definition.action + '_started', outcome: 'trace', cycleId: String(current.runId), entity: String(current.entity || ''), reason: 'Bắt đầu ' + definition.label + ' - Input: ' + FbmSync.businessStepInput(Object.assign({}, detail, input || {})), detail: { step: name, input: detail } };
  // Lượt người dùng bấm thì dòng bắt đầu phiên và bắt đầu kiểm phiên là Log thường, để Sheet Log có điểm đầu của lượt; lượt nền chạy vài phút một lần nên giữ dòng vết.
  if (FbmSync.BUSINESS_VISIBLE_STARTS.indexOf(name) >= 0 && String(current.origin || '') !== 'background' && FbmSync.callLogAdd(Object.assign({}, line, { outcome: LOG_OK }))) { return true; }
  logTrace(line);
  flushLogIfTraced('fbm_sync');
  return true;
};

FbmSync.businessStepAdd = function (state, key, totals) {
  var current = state || {}, name = String(key || ''), step = current.metadata && current.metadata.businessSteps && current.metadata.businessSteps[name];
  if (!step || step.finishedAt) { return false; }
  step.totals = step.totals || {};
  Object.keys(FbmSync.businessStepNumbers(totals)).forEach(function (field) { step.totals[field] = Number(step.totals[field] || 0) + Number(totals[field] || 0); });
  if (name !== 'run') { current.metadata.businessActiveStep = name; }
  return true;
};

/** outcome: ok | error | paused | stopped. `stopped` là bước còn mở khi một bước khác lỗi; nó không tự lỗi nên không được ghi "với lỗi". */
FbmSync.businessStepFinish = function (state, key, outcome, result) {
  var current = state || {}, metadata = current.metadata || {}, step = metadata.businessSteps && metadata.businessSteps[String(key || '')], name = String(key || ''), definition = FbmSync.businessStepDefinition(name);
  if (!step || step.finishedAt) { return false; }
  var now = Date.now(), totals = Object.assign({}, step.totals || {}, FbmSync.businessStepNumbers(result)), failed = outcome === 'error', paused = outcome === 'paused', stopped = outcome === 'stopped', error = String(result && result.error || (failed ? current.lastError : '') || '');
  var visible = FbmSync.BUSINESS_VISIBLE_FINISHES.indexOf(name) >= 0;
  step.finishedAt = now;
  step.outcome = failed ? 'error' : paused ? 'paused' : stopped ? 'stopped' : 'ok';
  step.totals = totals;
  step.durationMs = Math.max(0, now - Number(step.startedAt || now));
  if (metadata.businessActiveStep === name) { metadata.businessActiveStep = ''; }
  var reason = failed
    ? 'Kết thúc ' + definition.label + ' với lỗi - Kết quả: ' + FbmSync.businessStepSummary(totals) + (error ? '. Lỗi: ' + error : '')
    : paused
      ? 'Tạm dừng ' + definition.label + ' - Kết quả: ' + FbmSync.businessStepSummary(totals) + (error ? '. Lý do: ' + error : '')
      : stopped
        ? 'Dừng ' + definition.label + ' vì lỗi ở bước ' + FbmSync.businessStepDefinition(result && result.failedStep).label + ' - Kết quả: ' + FbmSync.businessStepSummary(totals)
        : 'Hoàn thành ' + definition.label + ' - Kết quả: ' + FbmSync.businessStepSummary(totals);
  var entry = { source: 'fbm_sync', action: definition.action + '_finished', outcome: failed ? LOG_ERROR : paused || stopped ? LOG_WARN : visible ? LOG_OK : 'trace', cycleId: String(current.runId || metadata.businessRunId || ''), entity: String(current.entity || ''), reason: reason, detail: { step: name, input: step.input || {}, result: totals, durationMs: step.durationMs, phase: String(current.phase || ''), failureCode: String(current.lastFailureCode || '') } };
  if (failed || paused || stopped || visible) {
    logEvent(entry);
  } else {
    logTrace(entry);
  }
  flushLogIfTraced('fbm_sync');
  return true;
};

/**
 * Đóng các bước đã xong khi luồng chuyển chặng (hết danh sách khách, sang chiều đẩy), để dòng "Hoàn thành" nằm đúng chỗ trong Log thay vì dồn về cuối phiên.
 * Vấn đề theo bản ghi của chặng vừa qua được nhả trước, nên dòng cảnh báo bản ghi luôn đứng trước dòng đóng bước của nó.
 */
FbmSync.businessFinishSteps = function (state, keys) {
  var steps = state && state.metadata && state.metadata.businessSteps || {};
  var open = (keys || []).filter(function (key) { return steps[key] && !steps[key].finishedAt; });
  if (!open.length) { return 0; }
  FbmSync.recordIssuesFlush(state);
  open.forEach(function (key) { FbmSync.businessStepFinish(state, key, 'ok', {}); });
  return open.length;
};

/** Bước đang làm khi phiên lỗi: bước được mở/cộng số gần nhất; thiếu thì lấy bước mở muộn nhất còn mở. */
FbmSync.businessFailingStep = function (state) {
  var metadata = state && state.metadata || {}, steps = metadata.businessSteps || {}, active = String(metadata.businessActiveStep || ''), latest = '';
  if (active && steps[active] && !steps[active].finishedAt) { return active; }
  Object.keys(steps).forEach(function (key) {
    if (key !== 'run' && !steps[key].finishedAt && (!latest || Number(steps[key].startedAt || 0) >= Number(steps[latest].startedAt || 0))) { latest = key; }
  });
  return latest;
};

/**
 * Đóng mọi bước còn mở khi phiên tới phase kết thúc. Chỉ `stateWrite` gọi hàm này cho phiên đang ghi, nên mọi đường kết thúc
 * (xong, lỗi, hủy, thu hồi phiên treo) đều đóng đúng một lần; `runOpen` gọi thêm cho phiên cũ bị phiên mới thay.
 */
FbmSync.businessFinishOpenSteps = function (state, phase, result) {
  // Vấn đề theo bản ghi của lát cuối nhả trước khi đóng bước, nếu không chúng rơi xuống dưới dòng "Hoàn thành phiên đồng bộ".
  FbmSync.recordIssuesFlush(state);
  var current = state || {}, steps = current.metadata && current.metadata.businessSteps || {}, terminal = String(phase || current.phase || ''), outcome = terminal === 'error' ? 'error' : terminal === 'paused' || terminal === 'conflict' ? 'paused' : 'ok', error = String(result && result.error || ''), failing = outcome === 'error' ? FbmSync.businessFailingStep(current) : '';
  Object.keys(steps).forEach(function (key) {
    if (key === 'run' || steps[key].finishedAt) { return; }
    if (outcome !== 'error') { FbmSync.businessStepFinish(current, key, outcome, { error: error }); return; }
    FbmSync.businessStepFinish(current, key, key === failing ? 'error' : 'stopped', key === failing ? { error: error } : { failedStep: failing });
  });
  if (steps.run && !steps.run.finishedAt) {
    FbmSync.businessStepFinish(current, 'run', outcome, { received: Number(current.counts && current.counts.completed || 0), written: Number(current.counts && current.counts.succeeded || 0), pushed: Number(current.counts && current.counts.pushed || 0), missing: Number(current.counts && current.counts.missingCustomer || 0) + Number(current.counts && current.counts.missingActivity || 0), errors: Number(current.counts && current.counts.error || 0), conflict: Number(current.counts && current.counts.conflict || 0), skipped: Number(current.counts && current.counts.skipped || 0), error: error });
  }
  return current;
};

/**
 * Mọi dòng Log nguồn fbm_sync mang "lượt": ai chạy (Tay hay Nền) và tiến trình nào, để lọc Log theo Giữ phiên hay lượt bấm tay khi debug.
 * Lấy từ bản state vừa đọc hoặc ghi trong lời gọi này nên không tốn thêm lần đọc kho. Đăng ký lúc chạy vì thư mục fbm_sync nạp trước server/log.
 */
/** Ô lượt đọc hoặc ghi gần nhất của lời gọi (RAM, không đọc kho), chưa có thì ô trống; mốc trace của cửa vào lấy từ đây. */
FbmSync.callStateSeen = function () { return FbmSync._logContextState || {}; };
/** Ghi nhận ô lượt vừa đọc hoặc ghi; gặp lượt đang chạy thì nhớ nó là lượt của lời gọi này (mã và nhãn), để dòng ghi sau khi lượt đóng trong cùng lời gọi vẫn mang nhãn đó. `null` (đầu mỗi lời gọi) xóa cả hai: không giữ nhãn lượt cũ sang lời gọi khác. */
FbmSync.logContextNote = function (state) {
  FbmSync._logContextState = state || null;
  if (!state) { FbmSync._logCallRun = null; } else if (FbmSync.runInProgress(state)) { FbmSync._logCallRun = { runId: String(state.runId), label: state.runLabel || FbmSync.runLabelOf(state) }; }
  if (!FbmSync._logContextRegistered) { logRegisterContext('fbm_sync', FbmSync.logContextText); FbmSync._logContextRegistered = true; }
};
/**
 * Nhãn của dòng: dòng thuộc lượt (mang mã lượt, lượt đang chạy, hoặc lượt lời gọi này đã làm kể cả vừa đóng) lấy nhãn chốt lúc mở (`runLabel`). Chỉ lời gọi không làm cho lượt nào mới theo nơi gọi: Extension (relay) là Nền, hàm dò DEV là Dò DEV, Sidebar là Tay. Dòng ghi trong một lệnh (cửa lệnh gắn kênh và mã máy, không lấy từ payload) thêm nguồn lệnh và đuôi máy để biết lệnh đến từ đâu, máy nào gây ra dòng đó.
 * Cạm bẫy: không đoán theo nơi gọi cho dòng của lượt, vì lượt tay cũng nộp câu trả lời FBM qua relay (dòng cuối lượt Đăng nhập thử từng ghi "Nền").
 */
FbmSync.logContextText = function (entry) {
  var label = FbmSync.logContextLabel(entry), context = FbmSync.issueContext;
  if (!label || !context) { return label; }
  return label + ' · từ ' + (FbmSync.LOG_SOURCE_NAMES[context.channel] || context.channel) + (context.machineId ? ' · máy ' + String(context.machineId).slice(-6) : '');
};
/** Tên nguồn lệnh trên dòng Log: lượt (Tay/Nền) nói lượt do ai mở, nguồn nói lệnh này đến từ đâu (lượt tay vẫn nộp kết quả FBM qua relay). */
FbmSync.LOG_SOURCE_NAMES = { sidebar: 'Sidebar', relay: 'Extension', dev: 'hàm dò DEV' };
FbmSync.logContextLabel = function (entry) {
  var state = FbmSync._logContextState, run = FbmSync._logCallRun, cycleId = String(entry && entry.cycleId || '');
  if (!state) { return ''; }
  if (cycleId && cycleId === String(state.runId || '')) { return state.runLabel || FbmSync.runLabelOf(state); }
  if (run && cycleId === run.runId) { return run.label; }
  if (FbmSync.runInProgress(state)) { return state.runLabel || FbmSync.runLabelOf(state); }
  if (run) { return run.label; }
  var channel = FbmSync.issueContext ? FbmSync.issueContext.channel : '';
  return channel === 'relay' ? 'Nền' : channel === 'dev' ? 'Dò DEV' : 'Tay';
};

