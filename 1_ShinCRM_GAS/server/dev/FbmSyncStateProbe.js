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
      cursorCandidateCategoryGateBytes: fbmSyncProbeJsonBytes(candidate && candidate.categoryGate),
      metadataBytes: fbmSyncProbeJsonBytes(metadata),
      metadataCategoryGateBytes: fbmSyncProbeJsonBytes(metadata && metadata.categoryGate),
      metadataPreviewBytes: fbmSyncProbeJsonBytes(metadata && metadata.preview),
      metadataConflictsBytes: fbmSyncProbeJsonBytes(metadata && metadata.conflicts),
      metadataSeenBytes: fbmSyncProbeJsonBytes(metadata && metadata.seen),
      sessionBytes: fbmSyncProbeJsonBytes(session),
      sessionLookupsBytes: fbmSyncProbeJsonBytes(session && session.lookups),
      locksBytes: fbmSyncProbeJsonBytes(state && state.locks),
      countsBytes: fbmSyncProbeJsonBytes(state && state.counts)
    }
  };
}
