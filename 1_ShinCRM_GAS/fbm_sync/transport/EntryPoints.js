/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
/** Khoi tao rieng pipeline bulk Activity de nghiem thu scheduler ma khong phai cho trigger 8 gio. */
function fbmSyncStartActivityBulk() { return FbmSync.start({ mode: 'read', scan: 'activity_bulk' }); }
/** Lệnh chẩn đoán chỉ đọc điều kiện local theo mode hiện đang lưu, không mở request FBM. */
function fbmSyncPreflight() { var state = FbmSync.stateRead(); return typeof FbmSync.runPreflight === 'function' ? FbmSync.runPreflight({ mode: state.mode || 'read', scan: state.scan || 'full' }) : { ok: true, issues: [] }; }
/** API nhận response Extension và trả request kế tiếp. */
function fbmSyncContinue(rawResponse) { return FbmSync.continue(rawResponse); }
/** Tính lại baseline nội bộ mà không mở phiên hoặc gọi request FBM. */
function fbmSyncRecalculateBaseline(entity) { return FbmSync.recalculateBaseline(entity || 'customer'); }
/** Dừng phiên lỗi; chỉ nhả khóa sync, giữ khóa user đang sửa. */
function fbmSyncCancel() {
  var state = FbmSync.stateRead(), locks = state.locks || {}, kept = {};
  Object.keys(locks).forEach(function (key) { if (locks[key] && locks[key].owner === 'user') { kept[key] = locks[key]; } });
  state.runId = ''; state.phase = 'idle'; state.entity = ''; state.cursor = {}; state.current = ''; state.scheduledScan = ''; state.locks = kept; state.message = 'Đã dừng phiên đồng bộ.'; state.lastError = '';
  return FbmSync.stateWrite(state);
}
/** Bật/tắt ghi thật; mặc định luôn tắt để bảo vệ dữ liệu FBM. */
function fbmSyncSetWriteMode(enabled) { PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_ALLOW_WRITES', enabled ? 'true' : 'false'); return { enabled: !!enabled }; }

/** Cho phép người dùng chủ động thử lại bản ghi bị chặn sau lỗi đẩy; không tự động lặp request ghi. */
function fbmSyncRetryPushFailure(entity, id) {
  var targetEntity = String(entity || '').trim(), targetId = String(id || '').trim(), state = FbmSync.stateRead();
  var key = targetEntity + ':' + targetId, failures = state.metadata && state.metadata.pushFailures || {};
  if (['customer', 'activity'].indexOf(targetEntity) < 0 || !targetId) { return { ok: false, code: 'PUSH_RETRY_TARGET_INVALID', message: 'Bản ghi thử lại không hợp lệ.' }; }
  if (!Object.prototype.hasOwnProperty.call(failures, key)) { return { ok: false, code: 'PUSH_FAILURE_NOT_FOUND', message: 'Không tìm thấy lỗi đẩy cần thử lại.' }; }
  var record = (FbmSync.readLocal(targetEntity) || []).filter(function (item) { return String(item && item.id || '') === targetId; })[0];
  if (!record) { return { ok: false, code: 'PUSH_RETRY_RECORD_NOT_FOUND', message: 'Không tìm thấy bản ghi local để thử lại.' }; }
  if (typeof writeGateSave !== 'function') { return { ok: false, code: 'WRITE_GATE_UNAVAILABLE', message: 'Không có cửa ghi để đặt lại trạng thái thử lại.' }; }
  var saved = writeGateSave({ entity: targetEntity, records: [{ id: targetId, syncStatus: FbmSync.SYNC_STATUS.pending }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { return { ok: false, code: 'PUSH_RETRY_RESET_FAILED', message: 'Không đặt lại được trạng thái bản ghi.', result: saved }; }
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  state.metadata.pushFailureDetails = state.metadata.pushFailureDetails || {};
  delete state.metadata.pushFailures[key];
  delete state.metadata.pushFailureDetails[key];
  state.message = 'Đã mở lại quyền thử đẩy ' + key + '; hãy chạy đồng bộ Ghi thật để gửi lại.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_retry_enabled', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', entity: targetEntity, recordId: targetId, reason: 'Người dùng chủ động cho phép thử lại bản ghi sau lỗi đẩy.' }); }
  return { ok: true, entity: targetEntity, id: targetId, status: FbmSync.SYNC_STATUS.pending };
}

/** Cấp relay config của đúng Spreadsheet hiện tại; không để Extension tự đoán địa chỉ GAS. */
function fbmSyncRelayConfig() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (ignore) {}
  var spreadsheetId = '';
  try { spreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
  return { url: url, key: String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || ''), spreadsheetId: spreadsheetId };
}

/** Cổng HTTP tùy chọn cho runner; bắt buộc khóa trước khi xử lý. */
function doPost(event) {
  try {
    var body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}, expected = String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '');
    if (!expected || body.key !== expected) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON); }
    var actualSpreadsheetId = '';
    try { actualSpreadsheetId = String(shinOpenBook().getId() || ''); } catch (ignoreId) {}
    if (!body.spreadsheetId || !actualSpreadsheetId || String(body.spreadsheetId) !== actualSpreadsheetId) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'spreadsheet_mismatch' })).setMimeType(ContentService.MimeType.JSON); }
    var result = body.kind === 'heartbeat' ? fbmSyncHeartbeat(body.response) : (body.response === undefined ? fbmSyncStart(body.mode) : fbmSyncContinue(body.response));
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) })).setMimeType(ContentService.MimeType.JSON); }
}
