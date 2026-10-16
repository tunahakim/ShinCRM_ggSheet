/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
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
/** Khởi tạo riêng pipeline bulk Activity để nghiệm thu trên DEV mà không phải chờ lịch nền đến hạn. */
function fbmSyncStartActivityBulk() { return FbmSync.start({ mode: 'read', scan: 'activity_bulk' }); }
/** Lệnh chẩn đoán chỉ đọc điều kiện local theo mode hiện đang lưu, không mở request FBM. */
function fbmSyncPreflight() { var state = FbmSync.stateRead(); return typeof FbmSync.runPreflight === 'function' ? FbmSync.runPreflight({ mode: state.mode || 'read', scan: state.scan || 'full' }) : { ok: true, issues: [] }; }
/** API nhận response Extension và trả request kế tiếp. */
function fbmSyncContinue(rawResponse) { return FbmSync.continue(rawResponse); }
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
function fbmSetAutoLogin(enabled) { return FbmSync.loginConfigSetEnabled(enabled === true); }

/** Mở lại toàn bộ nhóm lỗi sau khi người dùng đã sửa nguyên nhân; không lặp request FBM tại đây. */
function fbmSyncRetryPushFailures() {
  var state = FbmSync.stateRead(), failures = FbmSync.pushFailuresRead().hashes, keys = Object.keys(failures), byEntity = { customer: [], activity: [] }, recordsByEntity = { customer: {}, activity: {} }, reset = [], missing = [];
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
    byEntity[entity].forEach(function (record) { reset.push(entity + ':' + record.id); });
  });
  // Bản ghi không còn trên Sheet thì dấu chặn gửi lại vô nghĩa; giữ lại thì nó chiếm chỗ của cầu dao lỗi đẩy mãi mãi.
  FbmSync.pushFailuresRemove(reset.concat(missing));
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
    documentStoreWaitLock(lock, 10000);
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
  documentStoreWaitLock(lock, 10000);
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
    result = fbmSyncHeartbeatRequest({ source: body.source || 'alarm', hop: Number(body.hop || 0), extensionTrail: body.trail });
  } else if (body.kind === 'heartbeat_transport_failure') {
    result = fbmSyncHeartbeatTransportFailure({ requestId: body.requestId, code: body.code, message: body.error || body.message });
  } else if (body.kind === 'heartbeat') {
    result = fbmSyncHeartbeat(body.response, { hop: Number(body.hop || 0) });
  } else if (body.kind === 'transport_probe' && typeof fbmTransportProbeRelay === 'function') {
    // Hàm đo chỉ có khi còn thư mục server/dev; gỡ thư mục thì loại tin này rơi về nhánh từ chối bên dưới.
    result = fbmTransportProbeRelay(body);
  } else {
    result = { ok: false, code: 'RELAY_KIND_UNSUPPORTED', error: 'Relay chỉ nhận các nhịp nền do GAS quy định.', request: null };
  }
  fbmSyncRelayNoteDropped(body, result);
  if (body.kind === 'heartbeat_request' || body.kind === 'heartbeat' || body.kind === 'heartbeat_transport_failure' || body.kind === 'background_sync') { result = fbmSyncRelayCompactResult(result); }
  return result;
}

/**
 * Extension mang kết quả FBM (hoặc lỗi cầu nối) về mà GAS bận không giữ được khóa thì kết quả đó mất: Extension không gửi lại, lượt nằm chờ tới hạn rồi mới bị đóng.
 * Phải có dòng Log ngay lúc bỏ, không thì Log về sau chỉ thấy "lượt bị bỏ dở" mà không biết vì sao. GAS bận khi cấp request mới thì không ghi: chưa mất gì, nhịp sau hỏi lại.
 */
function fbmSyncRelayNoteDropped(body, result) {
  if (!result || result.code !== 'BUSY') { return; }
  var carriesReply = body.kind === 'heartbeat' || body.kind === 'heartbeat_transport_failure' || body.command === 'continue' || body.command === 'transport_failure';
  if (!carriesReply) { return; }
  var waitSeconds = Math.round((typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000) / 1000);
  logEvent({ source: 'fbm_sync', action: 'relay_busy_dropped', outcome: LOG_ERROR, reason: 'GAS đang bận việc khác quá ' + waitSeconds + ' giây nên không nhận được kết quả FBM Extension vừa gửi về; lượt này sẽ chờ tới hạn rồi bị đóng và chạy lại ở nhịp sau.', detail: { kind: String(body.kind || body.command || ''), hop: Number(body.hop || 0) } });
}
