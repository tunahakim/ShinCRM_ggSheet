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

function fbmSyncTrace() { return FbmSync.traceRead(60); }
