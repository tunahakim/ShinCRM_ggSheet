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
  var base = fallback || {}, context = FbmSync.traceContext(base), imported = [], previous = {};
  FbmSync.traceRead(FbmSync.TRACE_LIMIT).forEach(function (item) {
    if (item && item.stage) { previous[[item.stage, item.runId, item.requestId, item.at].join('|')] = true; }
  });
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
      functionName: item.functionName !== undefined ? FbmSync.traceClip(item.functionName, 160) : '',
      input: item.input !== undefined && typeof FbmSync.traceFunctionShape === 'function' ? FbmSync.traceFunctionShape(item.input, 'input', 0, []) : undefined,
      output: item.output !== undefined && typeof FbmSync.traceFunctionShape === 'function' ? FbmSync.traceFunctionShape(item.output, 'output', 0, []) : undefined,
      durationMs: Number(item.durationMs || 0) || 0,
      at: Number(item.at || 0) || Date.now(),
      stage: String(item.stage)
    }));
  });
  var added = FbmSync.traceAppend(imported);
  if (typeof logTrace === 'function') {
    imported.forEach(function (event) {
      var key = [event.stage, event.runId, event.requestId, event.at].join('|');
      if (!event.functionName || previous[key]) { return; }
      var inputText = JSON.stringify(event.input === undefined ? '[undefined]' : event.input);
      var outputText = JSON.stringify(event.output === undefined ? '[undefined]' : event.output);
      var errorText = JSON.stringify(event.error || '');
      var reason = /_started$/.test(event.stage)
        ? 'Khởi chạy hàm ' + event.functionName + ' - Input: ' + inputText
        : /_succeeded$/.test(event.stage)
          ? 'Hàm ' + event.functionName + ' đã thực thi thành công - Output: ' + outputText
          : 'Hàm ' + event.functionName + ' thực thi lỗi - Error: ' + errorText;
      logTrace({
        source: 'fbm_sync',
        action: 'client_function_' + (/^client_function_(.*)$/.exec(event.stage) || ['', event.stage])[1],
        outcome: /_failed$/.test(event.stage) ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : 'trace',
        reason: reason,
        entity: event.entity,
        recordId: event.recordId,
        detail: { function: event.functionName, input: event.input, output: event.output, error: event.error, durationMs: event.durationMs }
      });
    });
  }
  return added;
};

/*
 * Detailed function trace
 * -----------------------
 * The transport trace above answers "which hop was reached".  It is not
 * enough when a sync appears to jump back to the idle screen, because a
 * function can be entered and fail before it produces a transport hop.  When
 * LOG_TRACE covers `fbm_sync`, wrap every FbmSync method for the current GAS
 * invocation and write a pair of rows to Sheet `Log` for each call.
 *
 * The wrapper deliberately lives here instead of in each business file.  That
 * gives one contract for every function, including functions added later, and
 * keeps the business modules free of diagnostic side effects.
 */
FbmSync.FUNCTION_TRACE_MARK = '__fbmFunctionTraceWrapper';
FbmSync.FUNCTION_TRACE_SKIP = {
  traceClip: true,
  traceContext: true,
  traceAppend: true,
  traceEvent: true,
  traceRead: true,
  traceResponse: true,
  traceImport: true,
  traceFunctionShape: true,
  traceFunctionPayloadKey: true,
  traceFunctionHash: true,
  traceFunctionSummary: true,
  traceFunctionLog: true,
  functionTraceEnabled: true,
  functionTraceEnsure: true
};

FbmSync.functionTraceEnabled = function () {
  try {
    return typeof logTraceCoversSource === 'function' && logTraceCoversSource('fbm_sync');
  } catch (ignore) {
    return false;
  }
};

FbmSync.traceFunctionPayloadKey = function (key) {
  return /^(body|bodyText|payload|request|response|rawResponse|postData|contents|wire)$/i.test(String(key || ''));
};

FbmSync.traceFunctionHash = function (value) {
  var text = String(value === null || value === undefined ? '' : value), hash = 2166136261;
  for (var i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = (hash * 16777619) >>> 0;
  }
  return ('00000000' + hash.toString(16)).slice(-8);
};

/** Keep request/response bodies out of the sheet while retaining useful facts. */
FbmSync.traceFunctionSummary = function (value) {
  var result = { payload: true, type: Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value };
  if (typeof value === 'string') {
    result.length = value.length;
    result.hash = FbmSync.traceFunctionHash(value);
    return result;
  }
  if (Array.isArray(value)) {
    result.length = value.length;
    return result;
  }
  if (value && typeof value === 'object') {
    var keys = Object.keys(value);
    result.keyCount = keys.length;
    result.keys = keys.slice(0, 80);
    if (value.status !== undefined) { result.status = Number(value.status || 0) || 0; }
    if (value.ok !== undefined) { result.ok = value.ok === true; }
    if (value.code !== undefined) { result.code = String(value.code || ''); }
    if (value.url !== undefined) { result.url = String(value.url || ''); }
    if (value.method !== undefined) { result.method = String(value.method || ''); }
    return result;
  }
  return result;
};

FbmSync.traceFunctionShape = function (value, key, depth, seen) {
  var name = String(key || '');
  if (typeof logIsSecretKey === 'function' && logIsSecretKey(name)) {
    return typeof logMaskLabel === 'function' ? logMaskLabel(value) : '[secret]';
  }
  if (FbmSync.traceFunctionPayloadKey(name)) { return FbmSync.traceFunctionSummary(value); }
  if (value === null || value === undefined) { return value === undefined ? '[undefined]' : null; }
  if (typeof value !== 'object') { return value; }
  if (depth > 12) { return '[trace depth limit]'; }
  if (value instanceof Error || (value.name && value.message && typeof value.message === 'string')) {
    return {
      name: String(value.name || 'Error'),
      message: String(value.message || ''),
      stack: String(value.stack || '')
    };
  }
  seen = seen || [];
  if (seen.indexOf(value) >= 0) { return '[circular]'; }
  seen.push(value);
  if (Object.prototype.toString.call(value) === '[object Date]') {
    var dateValue = String(value);
    seen.pop();
    return dateValue;
  }
  if (Array.isArray(value)) {
    var arrayValue = value.map(function (item) { return FbmSync.traceFunctionShape(item, '', depth + 1, seen); });
    seen.pop();
    return arrayValue;
  }
  var output = {};
  Object.keys(value).forEach(function (itemKey) {
    output[itemKey] = FbmSync.traceFunctionShape(value[itemKey], itemKey, depth + 1, seen);
  });
  seen.pop();
  return output;
};

FbmSync.traceFunctionLog = function (stage, name, input, output, error, durationMs) {
  if (typeof logTrace !== 'function') { return; }
  try {
    var inputValue = FbmSync.traceFunctionShape(input, 'input', 0, []);
    var outputValue = output === undefined ? '[undefined]' : FbmSync.traceFunctionShape(output, 'output', 0, []);
    var detail = {
      function: String(name || ''),
      input: inputValue,
      output: stage === 'succeeded' ? outputValue : undefined,
      error: stage === 'failed' ? FbmSync.traceFunctionShape(error, 'error', 0, []) : undefined,
      durationMs: Number(durationMs || 0) || 0
    };
    var inputText = JSON.stringify(inputValue), outputText = JSON.stringify(outputValue), errorText = JSON.stringify(detail.error);
    var reason;
    if (stage === 'started') {
      reason = 'Khởi chạy hàm ' + String(name || '') + ' - Input: ' + inputText;
    } else if (stage === 'succeeded') {
      reason = 'Hàm ' + String(name || '') + ' đã thực thi thành công - Output: ' + outputText;
    } else {
      reason = 'Hàm ' + String(name || '') + ' thực thi lỗi - Error: ' + errorText;
    }
    logTrace({
      source: 'fbm_sync',
      action: 'function_' + String(stage || ''),
      outcome: stage === 'failed' ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : 'trace',
      reason: reason,
      detail: detail
    });
  } catch (ignore) {
    try { if (typeof console !== 'undefined' && console.warn) { console.warn('FBM detailed trace skipped: ' + String(ignore)); } } catch (ignoreConsole) {}
  }
};

FbmSync.functionTraceEnsure = function () {
  if (!FbmSync.functionTraceEnabled()) { return false; }
  Object.keys(FbmSync).forEach(function (key) {
    var original = FbmSync[key];
    if (typeof original !== 'function' || FbmSync.FUNCTION_TRACE_SKIP[key] || original[FbmSync.FUNCTION_TRACE_MARK]) { return; }
    var name = 'FbmSync.' + key;
    var wrapped = function () {
      var args = Array.prototype.slice.call(arguments), startedAt = Date.now();
      FbmSync.traceFunctionLog('started', name, args);
      try {
        var result = original.apply(this, arguments);
        if (result && typeof result.then === 'function') {
          return result.then(function (value) {
            FbmSync.traceFunctionLog('succeeded', name, args, value, null, Date.now() - startedAt);
            return value;
          }, function (err) {
            FbmSync.traceFunctionLog('failed', name, args, undefined, err, Date.now() - startedAt);
            throw err;
          });
        }
        FbmSync.traceFunctionLog('succeeded', name, args, result, null, Date.now() - startedAt);
        return result;
      } catch (err) {
        FbmSync.traceFunctionLog('failed', name, args, undefined, err, Date.now() - startedAt);
        throw err;
      }
    };
    wrapped[FbmSync.FUNCTION_TRACE_MARK] = true;
    wrapped.__fbmOriginal = original;
    FbmSync[key] = wrapped;
  });
  return true;
};

/* Lower-case bridge keeps the generic server entry wrapper independent from
 * the FBM namespace (the namespace belongs to the sync module boundary). */
function fbmSyncFunctionTraceEnsure() {
  return typeof FbmSync !== 'undefined' && FbmSync && typeof FbmSync.functionTraceEnsure === 'function'
    ? FbmSync.functionTraceEnsure()
    : false;
}

function fbmSyncFunctionTraceLog(stage, name, input, output, error, durationMs) {
  if (typeof FbmSync === 'undefined' || !FbmSync || typeof FbmSync.traceFunctionLog !== 'function' || !FbmSync.functionTraceEnabled()) { return; }
  FbmSync.traceFunctionLog(stage, 'GAS.' + String(name || ''), input, output, error, durationMs);
}

function fbmSyncTrace() { return FbmSync.traceRead(60); }
