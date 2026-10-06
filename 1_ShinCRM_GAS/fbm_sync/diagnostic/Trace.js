/** Trace hop FBM độc lập với state nghiệp vụ và sheet Log.
 * Chỉ lưu metadata đã rút gọn; không lưu cookie, mật khẩu hay body request/response.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.TRACE_KEY = 'FBM_SYNC_TRACE_V1';
FbmSync.TRACE_LIMIT = 24;
FbmSync.traceClip = function (value, limit) { return String(value || '').slice(0, Number(limit || 160)); };

FbmSync.traceContext = function (extra) {
  var state = {};
  try { state = FbmSync.stateRead ? FbmSync.stateRead() : {}; } catch (ignore) {}
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

FbmSync.traceAppend = function (events) {
  if (!Array.isArray(events) || !events.length) { return 0; }
  try {
    var props = PropertiesService.getDocumentProperties(), rows = JSON.parse(props.getProperty(FbmSync.TRACE_KEY) || '[]');
    if (!Array.isArray(rows)) { rows = []; }
    var seen = {};
    rows.forEach(function (item) { if (item && item.stage) { seen[[item.stage, item.runId, item.requestId, item.at].join('|')] = true; } });
    var added = 0;
    events.forEach(function (event) {
      if (!event || !event.stage) { return; }
      var key = [event.stage, event.runId, event.requestId, event.at].join('|');
      if (seen[key]) { return; }
      seen[key] = true; rows.push(event); added += 1;
    });
    if (added) { props.setProperty(FbmSync.TRACE_KEY, JSON.stringify(rows.slice(-FbmSync.TRACE_LIMIT))); }
    return added;
  } catch (ignore) { return 0; }
};

FbmSync.traceEvent = function (stage, extra) {
  var event = FbmSync.traceContext(extra);
  event.at = Date.now();
  event.stage = String(stage || '');
  FbmSync.traceAppend([event]);
  return event;
};

/*
 * Legacy implementation intentionally replaced above. Keep this marker close to
 * traceEvent so future edits do not reintroduce one PropertiesService write per
 * imported client event.
 */
/* FbmSync.traceEvent = function (stage, extra) {
  var event = FbmSync.traceContext(extra), props, rows;
  event.at = Date.now();
  event.stage = String(stage || '');
  try {
    props = PropertiesService.getDocumentProperties();
    rows = JSON.parse(props.getProperty(FbmSync.TRACE_KEY) || '[]');
    if (!Array.isArray(rows)) { rows = []; }
    rows.push(event);
    props.setProperty(FbmSync.TRACE_KEY, JSON.stringify(rows.slice(-FbmSync.TRACE_LIMIT)));
  } catch (ignore) {
    // Trace không được làm hỏng nghiệp vụ; execution log vẫn giữ mốc lỗi nếu có.
    try { if (typeof console !== 'undefined' && console.warn) { console.warn('FBM trace write failed: ' + event.stage); } } catch (ignoreConsole) {}
  }
  return event;
}; */

FbmSync.traceRead = function (limit) {
  var rows = [], take = Math.max(1, Math.min(Number(limit || 20), FbmSync.TRACE_LIMIT));
  try { rows = JSON.parse(PropertiesService.getDocumentProperties().getProperty(FbmSync.TRACE_KEY) || '[]'); } catch (ignore) { rows = []; }
  return Array.isArray(rows) ? rows.slice(-take) : [];
};

FbmSync.traceResponse = function (raw) {
  var value = raw, length = 0, status = 0;
  try {
    if (raw && typeof raw === 'object' && raw.body !== undefined) {
      value = raw.body;
      status = Number(raw.status || 0) || 0;
    }
    length = typeof value === 'string' ? value.length : JSON.stringify(value || null).length;
  } catch (ignore) {}
  return { httpStatus: status, responseLength: length };
};

/** Nhận trace của client/Extension nhưng chỉ giữ các field an toàn và giới hạn số lượng. */
FbmSync.traceImport = function (events, fallback) {
  if (!Array.isArray(events)) { return 0; }
  var base = fallback || {}, context = FbmSync.traceContext(base), imported = [];
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
    errors: 'lỗi', sheetWriteBatches: 'lần ghi Sheet', verified: 'bản ghi FBM đã xác nhận', pushed: 'bản ghi đã đẩy'
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
  if (typeof logTrace === 'function') {
    logTrace({ source: 'fbm_sync', action: definition.action + '_started', outcome: 'trace', cycleId: String(current.runId), entity: String(current.entity || ''), reason: 'Bắt đầu ' + definition.label + ' - Input: ' + FbmSync.businessStepInput(Object.assign({}, detail, input || {})), detail: { step: name, input: detail } });
  }
  if (typeof flushLogIfTraced === 'function') { flushLogIfTraced('fbm_sync'); }
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
  var entry = { source: 'fbm_sync', action: definition.action + '_finished', outcome: failed ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : paused || stopped ? (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn') : name === 'run' ? (typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok') : 'trace', cycleId: String(current.runId || metadata.businessRunId || ''), entity: String(current.entity || ''), reason: reason, detail: { step: name, input: step.input || {}, result: totals, durationMs: step.durationMs, phase: String(current.phase || ''), failureCode: String(current.lastFailureCode || '') } };
  if (failed || paused || stopped || name === 'run') {
    if (typeof logEvent === 'function') { logEvent(entry); }
  } else if (typeof logTrace === 'function') {
    logTrace(entry);
  }
  if (typeof flushLogIfTraced === 'function') { flushLogIfTraced('fbm_sync'); }
  return true;
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
 * (xong, lỗi, hủy, thu hồi phiên treo) đều đóng đúng một lần; `stateStart` gọi thêm cho phiên cũ bị phiên mới thay.
 */
FbmSync.businessFinishOpenSteps = function (state, phase, result) {
  var current = state || {}, steps = current.metadata && current.metadata.businessSteps || {}, terminal = String(phase || current.phase || ''), outcome = terminal === 'error' ? 'error' : terminal === 'paused' || terminal === 'conflict' ? 'paused' : 'ok', error = String(result && result.error || ''), failing = outcome === 'error' ? FbmSync.businessFailingStep(current) : '';
  Object.keys(steps).forEach(function (key) {
    if (key === 'run' || steps[key].finishedAt) { return; }
    if (outcome !== 'error') { FbmSync.businessStepFinish(current, key, outcome, { error: error }); return; }
    FbmSync.businessStepFinish(current, key, key === failing ? 'error' : 'stopped', key === failing ? { error: error } : { failedStep: failing });
  });
  if (steps.run && !steps.run.finishedAt) {
    FbmSync.businessStepFinish(current, 'run', outcome, { received: Number(current.counts && current.counts.completed || 0), written: Number(current.counts && current.counts.succeeded || 0), errors: Number(current.counts && current.counts.error || 0), conflict: Number(current.counts && current.counts.conflict || 0), skipped: Number(current.counts && current.counts.skipped || 0), error: error });
  }
  return current;
};

function fbmSyncTrace() { return FbmSync.traceRead(60); }
