/** Entry point ổn định cho Sidebar; mọi call đi qua runEntryPoint. */
/** Ghi dấu vết tối giản của callback để phân biệt lỗi trả về với lượt chạy bị kẹt; không lưu response FBM. */
function fbmTraceContinue(stage, error) {
  try {
    var state = FbmSync.stateRead(), cursor = state.cursor || {};
    state.metadata = state.metadata || {};
    state.metadata.callbackTrace = {
      name: 'fbmContinueSync',
      stage: String(stage || ''),
      at: Date.now(),
      runId: String(state.runId || ''),
      phase: String(state.phase || ''),
      entity: String(state.entity || ''),
      current: String(state.current || ''),
      cursorKind: String(cursor.kind || ''),
      operation: String(cursor.operation || ''),
      error: error ? String(error && error.message || error) : ''
    };
    FbmSync.stateWrite(state);
    if (typeof FbmSync.traceEvent === 'function') {
      FbmSync.traceEvent('gas_' + String(stage || ''), { operation: 'fbmContinueSync', error: error ? String(error && error.message || error) : '' });
    }
  } catch (ignore) {}
}
function fbmTraceBoundary(stage, name, error) {
  if (typeof FbmSync.traceEvent !== 'function') { return; }
  FbmSync.traceEvent(stage, { operation: String(name || ''), error: error ? String(error && error.message || error) : '', stack: error && error.stack ? String(error.stack) : '' });
}
/** Bắt đầu một phiên đọc/ghi theo mode được chọn. */
function fbmStartSync(mode, clientTrace) { return runEntryPoint('fbmStartSync', 'sidebar', 'throw', function () { fbmTraceBoundary('gas_entered', 'fbmStartSync'); if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceBoundary('engine_before', 'fbmStartSync'); var result = fbmSyncStart(mode); fbmTraceBoundary('engine_after', 'fbmStartSync'); if (result && result.status) { fbmTraceBoundary('before_log', 'fbmStartSync'); FbmSync.logStatus(result.status, 'start'); fbmTraceBoundary('after_log', 'fbmStartSync'); } return result; }); }
/** Gửi response thô của Extension cho cursor hiện tại. */
function fbmContinueSync(response, clientTrace) { return runEntryPoint('fbmContinueSync', 'sidebar', 'throw', function () { if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceContinue('entered'); try { var before = FbmSync.statusView(); fbmTraceBoundary('engine_before', 'fbmContinueSync', null); var result = fbmSyncContinue(response); fbmTraceBoundary('engine_after', 'fbmContinueSync', null); fbmTraceContinue('returned'); if (result && FbmSync.shouldLogStatus(before, result.status)) { fbmTraceBoundary('before_log', 'fbmContinueSync'); FbmSync.logStatus(result.status, 'slice'); fbmTraceBoundary('after_log', 'fbmContinueSync'); } return result; } catch (err) { fbmTraceContinue('failed', err); fbmTraceBoundary('gas_failed', 'fbmContinueSync', err); throw err; } }); }
/** Dừng phiên đồng bộ mà không đụng dữ liệu nghiệp vụ. */
function fbmCancelSync() { return runEntryPoint('fbmCancelSync', 'sidebar', 'throw', function () { var result = fbmSyncCancel(); if (result && result.status) { FbmSync.logStatus(result.status, 'cancel'); } return result; }); }
/** Đọc snapshot tiến độ hiện tại; Sidebar chỉ polling khi đang chạy. */
function fbmGetSyncStatus() { return runEntryPoint('fbmGetSyncStatus', 'sidebar', 'throw', function () { var before = FbmSync.stateRead(), result = fbmSyncStatus(); if (result && result.lastFailureCode === 'SYNC_STALE_RUN' && before.lastFailureCode !== result.lastFailureCode) { FbmSync.logStatus(result, 'stale_run'); } return result; }); }
/** Ghi lỗi cầu nối do Sidebar phát hiện trước khi có response FBM. */
function fbmLogSyncError(message, clientTrace) { return runEntryPoint('fbmLogSyncError', 'sidebar', 'throw', function () { if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceBoundary('gas_entered', 'fbmLogSyncError'); return FbmSync.logTransportError(message); }); }
/** Đọc cờ cho phép ghi; mặc định tắt để không chạm dữ liệu FBM ngoài ý muốn. */
function fbmGetWriteMode() { return runEntryPoint('fbmGetWriteMode', 'sidebar', 'throw', function () { return { enabled: FbmSync.writeAllowed() }; }); }
/** Đổi cờ ghi thật theo thao tác chủ động của người dùng trên Sidebar. */
function fbmSetWriteMode(enabled) { return runEntryPoint('fbmSetWriteMode', 'sidebar', 'throw', function () { return fbmSyncSetWriteMode(enabled === true); }); }
function fbmRetryPushFailures() { return runEntryPoint('fbmRetryPushFailures', 'sidebar', 'throw', function () { return fbmSyncRetryPushFailures(); }); }
function fbmGetRelayConfig() { return runEntryPoint('fbmGetRelayConfig', 'sidebar', 'throw', function () { return fbmSyncRelayConfig(); }); }
/** Khóa record khi người dùng bắt đầu sửa. */
function fbmBeginEdit(entity, id, revision) { return runEntryPoint('fbmBeginEdit', 'sidebar', 'throw', function () { return fbmSyncEditBegin(entity, id, revision); }); }
/** Mở khóa record khi người dùng kết thúc sửa. */
function fbmEndEdit(entity, id) { return runEntryPoint('fbmEndEdit', 'sidebar', 'throw', function () { return fbmSyncEditEnd(entity, id); }); }
/** Kiểm tra revision trước khi lưu form. */
function fbmCheckSave(entity, id, revision) { return runEntryPoint('fbmCheckSave', 'sidebar', 'throw', function () { return fbmSyncSaveAllowed(entity, id, revision); }); }
function fbmResolveConflict(entity, id, choice, merged) { return runEntryPoint('fbmResolveConflict', 'sidebar', 'throw', function () { return FbmSync.resolveConflict(entity, id, choice, merged); }); }
