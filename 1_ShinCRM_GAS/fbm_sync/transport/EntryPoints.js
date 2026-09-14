/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
/** Chá»‰ quÃ©t Customer FBM Ä‘á»ƒ kiá»ƒm tra liÃªn káº¿t, khÃ´ng ghi Sheet/FBM vÃ  khÃ´ng Ä‘á»c Activity. */
function fbmSyncStartIdentityCheck() { return FbmSync.controlDispatch('start', { mode: 'check', scan: 'identity_check', origin: 'manual', manual: true }); }
/** Chỉ lấy nhận diện từ authorize để Sidebar tự điền; không quét Customer và không ghi. */
function fbmSyncStartIdentityProbe() { return FbmSync.controlDispatch('start', { mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }); }
/** Người dùng chấp thuận phiên push lớn; chỉ sau đó mới cấp request authorize đầu tiên. */
function fbmSyncApprovePush() {
  var state = FbmSync.stateRead();
  if (String(state.phase || '') !== 'awaiting_approval' || !state.metadata || state.metadata.approvalRequired !== true) {
    return { ok: false, code: 'PUSH_APPROVAL_NOT_REQUIRED', status: FbmSync.statusView() };
  }
  state.phase = 'checking_session';
  state.entity = '';
  state.cursor = { kind: 'authorize_customer' };
  state.metadata.approvalGranted = true;
  state.message = 'Đã chấp thuận; đang kiểm tra phiên FBM...';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_batch_approved', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chấp thuận phiên có hơn 10 bản ghi thay đổi.', detail: { candidateCount: Number(state.metadata.approvalCount || 0) } }); }
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authorizeRequest('customer')), status: FbmSync.statusView() };
}
/** Khoi tao rieng pipeline bulk Activity de nghiem thu scheduler ma khong phai cho trigger 8 gio. */
function fbmSyncStartActivityBulk() { return FbmSync.start({ mode: 'read', scan: 'activity_bulk' }); }
/** Lệnh chẩn đoán chỉ đọc điều kiện local theo mode hiện đang lưu, không mở request FBM. */
function fbmSyncPreflight() { var state = FbmSync.stateRead(); return typeof FbmSync.runPreflight === 'function' ? FbmSync.runPreflight({ mode: state.mode || 'read', scan: state.scan || 'full' }) : { ok: true, issues: [] }; }
/** API nhận response Extension và trả request kế tiếp. */
function fbmSyncContinue(rawResponse) { return FbmSync.continue(rawResponse); }
/** Tính lại baseline nội bộ mà không mở phiên hoặc gọi request FBM. */
function fbmSyncRecalculateBaseline(entity) { return FbmSync.recalculateBaseline(entity || 'customer'); }
/** Đọc trạng thái liên kết an toàn; không trả bí mật phiên FBM. */
function fbmSyncIdentityStatus(runtime) { return FbmSync.identityStatus(runtime || {}); }
/** Lưu liên kết sau khi Sidebar đã cho người dùng xác nhận nhận diện từ phiên FBM. */
function fbmSyncSaveIdentityBinding(binding) { return FbmSync.bindingWrite(binding || {}); }
/** Dừng phiên lỗi; chỉ nhả khóa sync, giữ khóa user đang sửa. */
function fbmSyncCancel() {
  var state = FbmSync.stateRead(), locks = state.locks || {}, kept = {};
  Object.keys(locks).forEach(function (key) { if (locks[key] && locks[key].owner === 'user') { kept[key] = locks[key]; } });
  state.runId = ''; state.phase = 'idle'; state.entity = ''; state.cursor = {}; state.current = ''; state.scheduledScan = ''; state.activeRequestId = ''; state.deadlineAt = 0; state.locks = kept; state.message = 'Đã dừng phiên đồng bộ.'; state.lastError = '';
  return FbmSync.stateWrite(state);
}
/** Bật/tắt ghi thật; mặc định luôn tắt để bảo vệ dữ liệu FBM. */
function fbmSyncSetWriteMode(enabled) { PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_ALLOW_WRITES', enabled ? 'true' : 'false'); return { enabled: !!enabled }; }
function fbmGetLoginConfig() { return FbmSync.loginConfigPublic(); }
function fbmSaveLoginConfig(config) { return FbmSync.loginConfigSave(config || {}); }
function fbmSetAutoLogin(enabled) { return FbmSync.loginConfigSetEnabled(enabled === true); }
function fbmStartLoginTest(credentialRef) { return FbmSync.loginTestRequest(credentialRef); }
function fbmLoginTestResult(response) { return FbmSync.loginTestResult(response); }

/** Mở lại toàn bộ nhóm lỗi sau khi người dùng đã sửa nguyên nhân; không lặp request FBM tại đây. */
function fbmSyncRetryPushFailures() {
  var state = FbmSync.stateRead(), failures = state.metadata && state.metadata.pushFailures || {}, details = state.metadata && state.metadata.pushFailureDetails || {}, keys = Object.keys(failures), byEntity = { customer: [], activity: [] }, recordsByEntity = { customer: {}, activity: {} }, reset = [], missing = [];
  if (!keys.length) { return { ok: false, code: 'PUSH_FAILURES_NOT_FOUND', message: 'Không có nhóm bản ghi lỗi đẩy cần mở lại.' }; }
  ['customer', 'activity'].forEach(function (entity) {
    (FbmSync.readLocal(entity) || []).forEach(function (record) { recordsByEntity[entity][String(record && record.id || '')] = record; });
  });
  keys.forEach(function (key) {
    var split = key.indexOf(':'), entity = split < 0 ? '' : key.slice(0, split), id = split < 0 ? '' : key.slice(split + 1);
    if (!byEntity[entity] || !id) { missing.push(key); return; }
    if (!recordsByEntity[entity][id]) { missing.push(key); return; }
    byEntity[entity].push({ id: id, syncStatus: FbmSync.SYNC_STATUS.pending });
  });
  if (typeof writeGateSave !== 'function') { return { ok: false, code: 'WRITE_GATE_UNAVAILABLE', message: 'Không có cửa ghi để đặt lại trạng thái nhóm lỗi.' }; }
  ['customer', 'activity'].forEach(function (entity) {
    if (!byEntity[entity].length) { return; }
    var saved = writeGateSave({ entity: entity, records: byEntity[entity], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
    if (!saved || !saved.ok) { throw new Error('Không đặt lại được nhóm lỗi ' + entity + '.'); }
    byEntity[entity].forEach(function (record) { var key = entity + ':' + record.id; reset.push(key); delete failures[key]; delete details[key]; });
  });
  state.metadata.pushFailures = failures;
  state.metadata.pushFailureDetails = details;
  state.message = 'Đã mở lại ' + reset.length + ' bản ghi lỗi; hãy chạy lại phiên Ghi thật để gửi theo hàng đợi.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_retry_batch_enabled', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chủ động mở lại nhóm bản ghi lỗi đẩy.', detail: { total: keys.length, reset: reset.length, missing: missing.length } }); }
  return { ok: true, total: keys.length, reset: reset.length, missing: missing.length, status: FbmSync.statusView() };
}

/** Cấp relay config của đúng Spreadsheet hiện tại; không để Extension tự đoán địa chỉ GAS. */
function fbmSyncRelayConfig() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (ignore) {}
  var spreadsheetId = '';
  try { spreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
  var props = PropertiesService.getScriptProperties(), key = String(props.getProperty('FBM_SYNC_KEY') || '');
  if (!key) {
    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      key = String(props.getProperty('FBM_SYNC_KEY') || '');
      if (!key) { key = Utilities.getUuid(); props.setProperty('FBM_SYNC_KEY', key); }
    } finally { lock.releaseLock(); }
  }
  return { url: url, key: key, spreadsheetId: spreadsheetId };
}
/** Đổi khóa relay nguyên tử; Sidebar phải nhận ACK Extension trước khi coi là hoàn tất. */
function fbmSyncRotateRelayKey() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('FBM_SYNC_KEY', key);
    var url = '';
    try { url = ScriptApp.getService().getUrl() || ''; } catch (ignoreUrl) {}
    var spreadsheetId = '';
    try { spreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
    return { url: url, key: key, spreadsheetId: spreadsheetId };
  } finally { lock.releaseLock(); }
}

/** ACK không đụng state, dùng để kiểm tra Extension gọi được GAS khi Sidebar đã đóng. */
function fbmSyncRelayProbe() {
  var state = FbmSync.stateRead ? FbmSync.stateRead() : {}, session = state.session || {};
  return {
    ok: true,
    code: 'RELAY_PROBE_OK',
    serverAt: Date.now(),
    masterEnabled: typeof FbmSync.masterEnabled !== 'function' || FbmSync.masterEnabled(),
    backgroundEnabled: typeof FbmSync.backgroundEnabled !== 'function' || FbmSync.backgroundEnabled(),
    sessionExpired: session.expired === true
  };
}

/** DTO gọn cho relay nền; Sidebar vẫn nhận statusView đầy đủ qua google.script.run. */
function fbmSyncRelayCompactResult(result) {
  var value = result || {}, status = value.status || {};
  return {
    ok: value.ok !== false,
    code: String(value.code || ''),
    error: String(value.error || value.message || ''),
    httpStatus: Number(value.status || 0),
    request: value.request || null,
    imported: Number(value.imported || 0),
    missing: value.missing,
    status: {
      runId: String(status.runId || ''),
      mode: String(status.mode || ''),
      phase: String(status.phase || ''),
      direction: String(status.direction || ''),
      entity: String(status.entity || ''),
      cursor: status.cursor || {},
      counts: status.counts || {},
      current: String(status.current || ''),
      message: String(status.message || ''),
      updatedAt: Number(status.updatedAt || 0),
      lastError: String(status.lastError || ''),
      lastFailureCode: String(status.lastFailureCode || '')
    }
  };
}

/** Giới hạn số round-trip trong một lượt relay; cursor vẫn nằm ở GAS để lượt sau tiếp tục. */
function fbmSyncRelayCap(result, hop) {
  var limit = Number(FbmSync.RELAY_HOP_LIMIT || 20), value = result || {};
  if (Number(hop || 0) >= limit && value.request) {
    if (typeof FbmSync.limitRelayResult === 'function') { return FbmSync.limitRelayResult(value, hop); }
    value.request = null;
    value.code = 'RELAY_HOP_LIMIT';
    value.message = 'Đã tạm dừng sau ' + limit + ' request; cursor vẫn được giữ ở GAS.';
  }
  return value;
}

/** Cổng HTTP tùy chọn cho runner; bắt buộc khóa trước khi xử lý. */
function doPost(event) {
  try {
    var body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}, expected = String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '');
    if (!expected || body.key !== expected) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON); }
    var actualSpreadsheetId = '';
    try { actualSpreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
    if (!body.spreadsheetId || !actualSpreadsheetId || String(body.spreadsheetId) !== actualSpreadsheetId) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'spreadsheet_mismatch' })).setMimeType(ContentService.MimeType.JSON); }
    var result;
    if (body.command) {
      var commandPayload = body.payload || {};
      if (body.hop !== undefined && commandPayload.hop === undefined) { commandPayload = Object.assign({}, commandPayload, { hop: Number(body.hop || 0) }); }
      result = FbmSync.controlDispatch(String(body.command), commandPayload);
    } else if (body.kind === 'probe') {
      result = fbmSyncRelayProbe();
    } else if (body.kind === 'heartbeat_request') {
      result = fbmSyncHeartbeatRequest({ source: body.source || 'alarm', hop: Number(body.hop || 0) });
    } else if (body.kind === 'heartbeat_transport_failure') {
      result = fbmSyncHeartbeatTransportFailure({ requestId: body.requestId, code: body.code, message: body.error || body.message });
    } else if (body.kind === 'heartbeat') {
      result = fbmSyncHeartbeat(body.response, { hop: Number(body.hop || 0) });
    } else {
      result = body.response === undefined ? fbmSyncStart(body.mode) : fbmSyncContinue(body.response);
    }
    if (body.kind === 'heartbeat_request' || body.kind === 'heartbeat' || body.kind === 'heartbeat_transport_failure' || body.kind === 'background_sync') { result = fbmSyncRelayCompactResult(result); result = fbmSyncRelayCap(result, body.hop); }
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) })).setMimeType(ContentService.MimeType.JSON); }
}
