/** Đo kích thước DocumentProperties và các nhánh state mà không trả giá trị nhạy cảm. */
function fbmSyncProbeBytes(value) {
  var text = String(value === null || value === undefined ? '' : value);
  try { if (typeof Utilities !== 'undefined' && Utilities.newBlob) { return Utilities.newBlob(text).getBytes().length; } } catch (ignore) {}
  return text.length;
}

function fbmSyncProbeJsonBytes(value) {
  if (value === undefined || value === null) { return 0; }
  try { return fbmSyncProbeBytes(JSON.stringify(value)); } catch (ignore) { return -1; }
}

function fbmSyncStateProbe() {
  var props = PropertiesService.getDocumentProperties(), values = typeof props.getProperties === 'function' ? props.getProperties() : {}, properties = [], totalBytes = 0;
  Object.keys(values || {}).forEach(function (key) {
    var bytes = fbmSyncProbeBytes(values[key]);
    totalBytes += bytes;
    properties.push({ key: String(key), bytes: bytes });
  });
  properties.sort(function (left, right) { return right.bytes - left.bytes; });
  var stateRaw = values.FBM_SYNC_STATE_V1 || '', state = null, stateParseOk = false;
  try { state = stateRaw ? JSON.parse(stateRaw) : null; stateParseOk = !!state; } catch (ignoreState) {}
  var cursor = state && state.cursor || {}, candidate = cursor && cursor.candidate || {}, metadata = state && state.metadata || {}, session = state && state.session || {};
  var branchBytes = {};
  ['cursor', 'session', 'metadata', 'locks', 'counts'].forEach(function (key) { branchBytes[key] = fbmSyncProbeJsonBytes(state && state[key]); });
  var trace = [], traceRaw = values.FBM_SYNC_TRACE_V1 || '';
  try { trace = JSON.parse(traceRaw); } catch (ignoreTrace) { trace = []; }
  if (!Array.isArray(trace)) { trace = []; }
  var responseTrace = trace.filter(function (item) { return item && ['fetch_finished', 'fbm_response_received', 'client_extension_success'].indexOf(String(item.stage || '')) >= 0; });
  if (!responseTrace.length) { responseTrace = trace.slice(-12); }
  return {
    ok: true,
    limitBytes: 9000,
    totalDocumentPropertiesBytes: totalBytes,
    propertyCount: properties.length,
    largestProperties: properties.slice(0, 20),
    state: {
      bytes: fbmSyncProbeBytes(stateRaw),
      parseOk: stateParseOk,
      phase: state ? String(state.phase || '') : '',
      cursorKind: cursor ? String(cursor.kind || '') : '',
      cursorBytes: fbmSyncProbeJsonBytes(cursor),
      cursorCandidateBytes: fbmSyncProbeJsonBytes(candidate),
      metadataBytes: fbmSyncProbeJsonBytes(metadata),
      metadataCategoryBlocksBytes: fbmSyncProbeJsonBytes(metadata && metadata.categoryBlocks),
      metadataPreviewBytes: fbmSyncProbeJsonBytes(metadata && metadata.preview),
      metadataConflictRefreshBytes: fbmSyncProbeJsonBytes(metadata && metadata.conflictRefresh),
      metadataSeenBytes: fbmSyncProbeJsonBytes(metadata && metadata.seen),
      sessionBytes: fbmSyncProbeJsonBytes(session),
      sessionLookupsBytes: fbmSyncProbeJsonBytes(session && session.lookups),
      locksBytes: fbmSyncProbeJsonBytes(state && state.locks),
      countsBytes: fbmSyncProbeJsonBytes(state && state.counts),
      branchBytes: branchBytes
    },
    extensionResponses: responseTrace.slice(-12).map(function (item) {
      return { at: Number(item && item.at || 0) || 0, stage: String(item && item.stage || ''), operation: String(item && item.operation || ''), httpStatus: Number(item && item.httpStatus || 0) || 0, responseLength: Number(item && item.responseLength || 0) || 0 };
    })
  };
}

/** Đo từng phần của preflight trên dữ liệu thật mà không ghi gì, để biết phần nào làm lượt khởi động vượt hạn chờ của Sidebar. */
function fbmProbePreflightTiming() {
  var out = [], t = Date.now();
  function mark(label) { var now = Date.now(); out.push(label + ': ' + (now - t) + ' ms'); t = now; }
  shinCorePreflight({ mode: 'read' }); mark('shinCorePreflight');
  FbmSync.identityPreflight('read'); mark('identityPreflight');
  var c = FbmSync.readLocal('customer'); mark('readLocal customer (' + c.length + ')');
  var a = FbmSync.readLocal('activity'); mark('readLocal activity (' + a.length + ')');
  var gate = FbmSync.readCategoryGate(); mark('readCategoryGate');
  c.slice(0, 200).forEach(function (r) { FbmSync.hash(r, 'customer', gate); }); mark('hash 200 customer');
  FbmSync.pushCandidates('customer'); mark('pushCandidates customer');
  FbmSync.pushCandidates('activity'); mark('pushCandidates activity');
  FbmSync.runPreflight({ mode: 'read', origin: 'manual', scan: 'full' }); mark('runPreflight tổng');
  return out;
}
