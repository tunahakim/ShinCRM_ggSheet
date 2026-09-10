/** Entry point cho Sidebar, DEV runner va Web App relay. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
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

/** Cấp URL/khóa relay cho Sidebar truyền sang Extension theo đúng spreadsheet. */
function fbmSyncRelayConfig() {
  var url = '';
  try { url = ScriptApp.getService().getUrl() || ''; } catch (ignore) {}
  return { url: url, key: String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '') };
}

/** Cổng HTTP tùy chọn cho runner; bắt buộc khóa trước khi xử lý. */
function doPost(event) {
  try {
    var body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}, expected = String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '');
    if (!expected || body.key !== expected) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON); }
    var result = body.kind === 'heartbeat' ? fbmSyncHeartbeat(body.response) : (body.response === undefined ? fbmSyncStart(body.mode) : fbmSyncContinue(body.response));
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) })).setMimeType(ContentService.MimeType.JSON); }
}
