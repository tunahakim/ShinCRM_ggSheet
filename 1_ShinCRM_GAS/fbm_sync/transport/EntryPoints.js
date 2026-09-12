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
