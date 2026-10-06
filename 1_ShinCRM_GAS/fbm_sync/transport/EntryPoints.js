/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
/** Chỉ quét Customer FBM để kiểm tra liên kết, không ghi Sheet/FBM và không đọc Activity. */
function fbmSyncStartIdentityCheck(identity) { return FbmSync.controlDispatch('start', { mode: 'check', scan: 'identity_check', identity: identity || null, origin: 'manual', manual: true }); }
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
  if (typeof FbmSync.businessStepStart === 'function') { FbmSync.businessStepStart(state, 'session', { mode: state.mode, scan: state.scan }); }
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_batch_approved', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chấp thuận phiên có hơn 10 bản ghi thay đổi.', detail: { candidateCount: Number(state.metadata.approvalCount || 0) } }); }
  return { ok: true, request: FbmSync.sessionSystemEnvelope('authorize', { entity: 'customer' }), status: FbmSync.statusView() };
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
  var state = FbmSync.stateRead(), locks = state.locks || {}, kept = {}, failed = String(state.phase || '') === 'error';
  // Client luôn gọi hủy sau khi báo lỗi; phiên đã lỗi phải giữ nguyên lỗi để Sidebar và Log không đổi thành "Đã dừng".
  if (state.activeRequestId && !failed) {
    state.metadata = state.metadata || {};
    state.metadata.cancelPending = true;
    state.message = 'Đang chờ response FBM hiện tại để dừng an toàn; sẽ không cấp request kế tiếp.';
    state.lastError = '';
    FbmSync.stateWrite(state);
    return { ok: true, code: 'SYNC_CANCEL_PENDING', pending: true, status: FbmSync.statusView() };
  }
  Object.keys(locks).forEach(function (key) { if (locks[key] && locks[key].owner === 'user') { kept[key] = locks[key]; } });
  state.runId = ''; state.entity = ''; state.cursor = {}; state.current = ''; state.scheduledScan = ''; state.activeRequestId = ''; state.deadlineAt = 0; state.locks = kept;
  if (!failed) { state.phase = 'paused'; state.message = 'Đã dừng phiên đồng bộ; kết quả và log của lượt này vẫn được giữ để xem lại.'; state.lastError = ''; }
  return FbmSync.stateWrite(state);
}
function fbmGetLoginConfig() { return FbmSync.loginConfigPublic(); }
function fbmSaveLoginConfig(config) { return FbmSync.loginConfigSave(config || {}); }
function fbmSetAutoLogin(enabled) { return FbmSync.loginConfigSetEnabled(enabled === true); }
function fbmStartLoginTest(credentialRef, expectedIdentity) { return FbmSync.loginTestRequest(credentialRef, expectedIdentity || null); }
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
  ['customer', 'activity'].forEach(function (entity) {
    if (!byEntity[entity].length) { return; }
    FbmSync.sheetSave(entity, byEntity[entity], 'pull');
    byEntity[entity].forEach(function (record) { var key = entity + ':' + record.id; reset.push(key); delete failures[key]; delete details[key]; });
  });
  state.metadata.pushFailures = failures;
  state.metadata.pushFailureDetails = details;
  state.message = 'Đã mở lại ' + reset.length + ' bản ghi lỗi; hãy chạy lại phiên Ghi thật để gửi theo hàng đợi.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_retry_batch_enabled', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Người dùng chủ động mở lại nhóm bản ghi lỗi đẩy.', detail: { total: keys.length, reset: reset.length, missing: missing.length } }); }
  return { ok: true, total: keys.length, reset: reset.length, missing: missing.length, status: FbmSync.statusView() };
}

// ID deployment ổn định qua mỗi lần nâng revision. Không dùng getService().getUrl(),
// vì khi chạy từ Sidebar nó có thể trả URL @HEAD không phải Web App công khai.
var FBM_SYNC_RELAY_WEB_APP_URL = 'https://script.google.com/macros/s/AKfycbx0ueI_gR2zzkTUGV5lTAXty0zotK2owAd5zPy0Z0SzJkJjRa0dIvbMREAoVJm3iFrX/exec';

/** Cấp relay config của đúng Spreadsheet hiện tại; không để Extension tự đoán địa chỉ GAS. */
function fbmSyncRelayConfig() {
  var url = FBM_SYNC_RELAY_WEB_APP_URL;
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
  return {
    url: url,
    key: key,
    spreadsheetId: spreadsheetId,
    extension: typeof FbmSync.extensionConfigPublic === 'function' ? FbmSync.extensionConfigPublic() : { pollMinutes: 5, runOnStartup: true },
    masterEnabled: typeof FbmSync.masterEnabled !== 'function' || FbmSync.masterEnabled(),
    backgroundEnabled: typeof FbmSync.backgroundEnabled !== 'function' || FbmSync.backgroundEnabled()
  };
}
/** Đổi khóa relay nguyên tử; Sidebar phải nhận ACK Extension trước khi coi là hoàn tất. */
function fbmSyncRotateRelayKey() {
  var lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    var key = Utilities.getUuid();
    PropertiesService.getScriptProperties().setProperty('FBM_SYNC_KEY', key);
    var url = FBM_SYNC_RELAY_WEB_APP_URL;
    var spreadsheetId = '';
    try { spreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
    return { url: url, key: key, spreadsheetId: spreadsheetId };
  } finally { lock.releaseLock(); }
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

/**
 * Cổng HTTP Extension gọi cho nhịp nền, chạy cả khi Sidebar đóng; bắt buộc khóa trước khi xử lý.
 * Phải đi qua `runEntryPoint` như mọi cửa vào: Log chỉ nằm trong bộ đệm RAM tới khi cửa vào xả, và exception phải có dòng Log cùng tin chờ hiện ở Sidebar lần mở sau (FBM-034).
 * Khóa sai thì không ghi Log: ai biết URL cũng gọi được, ghi Log ở nhánh này là cho người lạ đẩy trôi Log thật.
 */
function doPost(event) {
  var reply = function (value) { return ContentService.createTextOutput(JSON.stringify(value)).setMimeType(ContentService.MimeType.JSON); };
  try {
    var body;
    // Thông báo lỗi JSON.parse có thể trích một đoạn nội dung gửi lên (chứa khóa relay), nên thay bằng câu không mang nội dung.
    try { body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}; } catch (badJson) { return reply({ ok: false, error: 'invalid_json' }); }
    var expected = String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '');
    if (!expected || body.key !== expected) { return reply({ ok: false, error: 'unauthorized' }); }
    return reply(runEntryPoint('fbmRelay', 'fbm_sync', ERROR_CHANNEL_PENDING, function () { return fbmSyncRelayHandle(body); }));
  } catch (err) { return reply({ ok: false, error: errorMessage(err) }); }
}
/** Phần nghiệp vụ của nhịp nền sau khi đã qua khóa; lỗi ném ra để `runEntryPoint` ghi Log. */
function fbmSyncRelayHandle(body) {
  var actualSpreadsheetId = String(shinOpenBook().getId() || '');
  if (!body.spreadsheetId || String(body.spreadsheetId) !== actualSpreadsheetId) { throw new Error('Extension gửi nhịp nền cho bảng tính khác với bảng tính đang gắn script; kiểm tra lại cấu hình relay.'); }
  var result;
  if (body.command) {
    var commandPayload = body.payload || {};
    if (body.hop !== undefined && commandPayload.hop === undefined) { commandPayload = Object.assign({}, commandPayload, { hop: Number(body.hop || 0) }); }
    result = FbmSync.controlDispatchLocked(String(body.command), commandPayload);
  } else if (body.kind === 'heartbeat_request') {
    result = fbmSyncHeartbeatRequest({ source: body.source || 'alarm', hop: Number(body.hop || 0) });
  } else if (body.kind === 'heartbeat_transport_failure') {
    result = fbmSyncHeartbeatTransportFailure({ requestId: body.requestId, code: body.code, message: body.error || body.message });
  } else if (body.kind === 'heartbeat') {
    result = fbmSyncHeartbeat(body.response, { hop: Number(body.hop || 0) });
  } else {
    result = { ok: false, code: 'RELAY_KIND_UNSUPPORTED', error: 'Relay chỉ nhận các nhịp nền do GAS quy định.', request: null };
  }
  if (body.kind === 'heartbeat_request' || body.kind === 'heartbeat' || body.kind === 'heartbeat_transport_failure' || body.kind === 'background_sync') { result = fbmSyncRelayCompactResult(result); result = fbmSyncRelayCap(result, body.hop); }
  return result;
}
