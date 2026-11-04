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
  var props = documentProps(), values = typeof props.getProperties === 'function' ? props.getProperties() : {}, properties = [], totalBytes = 0;
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
      sessionBytes: fbmSyncProbeJsonBytes(session),
      sessionLookupsBytes: fbmSyncProbeJsonBytes(session && session.lookups),
      countsBytes: fbmSyncProbeJsonBytes(state && state.counts),
      branchBytes: branchBytes
    },
    extensionResponses: responseTrace.slice(-12).map(function (item) {
      return { at: Number(item && item.at || 0) || 0, stage: String(item && item.stage || ''), operation: String(item && item.operation || ''), httpStatus: Number(item && item.httpStatus || 0) || 0, responseLength: Number(item && item.responseLength || 0) || 0 };
    })
  };
}

/** Giao dịch trên Sheet của một khách kèm trạng thái đồng bộ, chỉ đọc, để soi vì sao giao dịch bị xóa bên FBM không bị gắn cờ. */
function fbmProbeCustomerActivities(customerId) {
  var id = String(customerId || 'CUS-020075'), customer = FbmSync.readLocal('customer').filter(function (record) { return record.id === id; })[0] || null;
  return {
    customer: customer && { id: customer.id, fbmId: customer.fbmId, fbmCustomerCode: customer.fbmCustomerCode, syncStatus: customer.syncStatus, website: customer.website, fbmHash: customer.fbmHash },
    activities: FbmSync.readLocal('activity').filter(function (record) { return record.customerId === id; }).map(function (record) {
      return { id: record.id, fbmId: record.fbmId, workDate: record.workDate, fbmHash: record.fbmHash, content: String(record.content || '').slice(0, 60), syncStatus: record.syncStatus, syncedAt: record.syncedAt, recordStatus: record.recordStatus, title: String(record.title || record.details || '').slice(0, 40) };
    })
  };
}

/** Giờ chạy xong của từng tiến trình nền, số phút còn tới hạn và các cờ quyết định lần hỏi nền có chạy hay không, kèm cổng của chặng đẩy mà Giữ phiên kế tiếp sẽ gặp. */
function fbmProbeScheduleMarkers() {
  var props = FbmSync.props(), state = FbmSync.stateRead(), now = Date.now(), markers = {}, schedule = FbmSync.scheduleShape(settingsValues(FbmSync.SETTING_SECTIONS.background));
  var stored = FbmSync.pushCleanRead(), current = FbmSync.pushCleanNow();
  var gate = { direction: settingsValue(FbmSync.SETTING_SECTIONS.background, 'direction'), stored: stored, now: current, keepalive: FbmSync.pushGateDecide({ origin: 'background', scan: 'keepalive' }, stored, current), lastRun: { scan: state.scan, mode: state.mode, scheduleMode: state.scheduleMode, pushGate: state.pushGate, message: state.message } };
  // Bản ghi chặng đẩy kế tiếp sẽ chọn, kèm mã khách FBM của khách (hoặc khách cha), để nghiệm thu chắc chỉ chạm khách thử. Đọc cả hai sheet nên tốn vài giây.
  var scan = FbmSync.localScan(), byId = {};
  scan.records('customer').forEach(function (row) { byId[String(row.id)] = String(row.fbmCustomerCode || ''); });
  gate.candidates = FbmSync.pushCandidatesAll(scan, FbmSync.pushReviewContext(state, scan)).slice(0, 20).map(function (c) { return c.entity + ':' + c.id + ':' + c.kind + ':' + (byId[String(c.entity === 'customer' ? c.id : (c.record || c.raw || {}).customerId)] || '?') + (c.hold ? ':hold=' + c.hold.code : ''); });
  Object.keys(FbmSync.SCHEDULE_DONE_KEYS).forEach(function (kind) { var done = Number(props.getProperty(FbmSync.SCHEDULE_DONE_KEYS[kind]) || 0), due = FbmSync.scheduleDueAt(kind, schedule, props); markers[kind] = { doneAt: done ? new Date(done).toISOString() : '', dueInMin: Math.round((due - now) / 60000) }; });
  return { pushGate: gate, now: new Date(now).toISOString(), master: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'), background: schedule.enabled, markers: markers, phase: state.phase, origin: state.origin, scheduledScan: state.scheduledScan, chain: state.chain, activeRequestId: state.activeRequestId, deadlineAt: state.deadlineAt ? new Date(Number(state.deadlineAt)).toISOString() : '', failureCode: state.failureCode, message: state.message, sessionExpired: state.session && state.session.expired, due: FbmSync.scheduleDueKinds(now, [], schedule), trace: (function () { try { return JSON.parse(props.getProperty('FBM_SYNC_TRACE_V1') || '[]').slice(-25).map(function (t) { return new Date(Number(t.at)).toISOString().slice(11, 19) + ' ' + t.stage + ' ' + (t.operation || '') + ' ' + (t.code || t.failureCode || ''); }); } catch (e) { return String(e); } })() };
}

/** Các dòng đang xung đột chờ quyết kèm giá trị ShinCRM, baseline và giờ đồng bộ, chỉ đọc, để soạn và đối chiếu nghiệm thu màn xung đột. */
function fbmProbeConflicts() {
  var scan = FbmSync.localScan();
  return FbmSync.conflictQueue(scan).map(function (item) {
    var record = scan.records(item.entity).filter(function (row) { return String(row.id) === item.id; })[0] || {};
    var keep = item.entity === 'customer' ? ['companyName', 'fbmCustomerCode', 'website', 'email', 'phone', 'contactName'] : ['customerId', 'workDate', 'content', 'title'];
    var out = { entity: item.entity, id: item.id, fbmId: item.fbmId, fbmHash: record.fbmHash, syncedAt: record.syncedAt };
    keep.forEach(function (field) { out[field] = record[field]; });
    return out;
  });
}

/** Đo `ScriptApp.getService().getUrl()` khi chạy trong ngữ cảnh Web App (cửa chạy hàm là một bản triển khai Web App), để biết GAS có tự biết địa chỉ bản triển khai đang chạy không. */
function fbmProbeServiceUrl() {
  var url = String(ScriptApp.getService().getUrl() || '');
  return { serviceUrl: url, stored: FbmSync.relayUrlStored(PropertiesService.getScriptProperties()), scriptId: ScriptApp.getScriptId() };
}

/** Kích thước từng khóa DocumentProperties (gộp các khóa shard theo tiền tố), để đo gói ghi gộp của đồng bộ trước khi tối ưu. */
function fbmProbePropertySizes() {
  var all = documentProps().getProperties(), groups = {}, total = 0;
  Object.keys(all).forEach(function (key) {
    var group = key.replace(/\d+$/, '#'), bytes = String(all[key]).length;
    groups[group] = groups[group] || { keys: 0, bytes: 0 };
    groups[group].keys += 1; groups[group].bytes += bytes; total += bytes;
  });
  return Object.keys(groups).sort(function (a, b) { return groups[b].bytes - groups[a].bytes; }).slice(0, 25).map(function (group) { return group + ': ' + groups[group].keys + ' khóa, ' + groups[group].bytes + ' ký tự'; }).concat(['Tổng: ' + total + ' ký tự, ' + Object.keys(all).length + ' khóa']);
}
