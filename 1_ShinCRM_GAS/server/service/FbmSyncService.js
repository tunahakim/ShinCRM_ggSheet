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
/** Chuẩn hóa toàn bộ kết quả công khai trước khi qua google.script.run; không để Date lọt ra callback. */
function fbmPublicResult(result) {
  return typeof FbmSync.transportValue === 'function' ? FbmSync.transportValue(result) : result;
}
/** Bắt đầu một phiên đọc/ghi theo mode được chọn. */
function fbmStartSync(mode, clientTrace) { return runEntryPoint('fbmStartSync', 'sidebar', 'throw', function () { fbmTraceBoundary('gas_entered', 'fbmStartSync'); if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceBoundary('engine_before', 'fbmStartSync'); var result = FbmSync.controlDispatch('start', { mode: mode, origin: 'manual', manual: true }); fbmTraceBoundary('engine_after', 'fbmStartSync'); if (result && result.status) { fbmTraceBoundary('before_log', 'fbmStartSync'); FbmSync.logStatus(result.status, 'start'); fbmTraceBoundary('after_log', 'fbmStartSync'); } return fbmPublicResult(result); }); }
function fbmStartIdentityCheck() { return runEntryPoint('fbmStartIdentityCheck', 'sidebar', 'throw', function () { return fbmPublicResult(FbmSync.controlDispatch('start', { mode: 'check', scan: 'identity_check', origin: 'manual', manual: true })); }); }
function fbmStartIdentityProbe() { return runEntryPoint('fbmStartIdentityProbe', 'sidebar', 'throw', function () { return fbmPublicResult(FbmSync.controlDispatch('start', { mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true })); }); }
function fbmApprovePush() { return runEntryPoint('fbmApprovePush', 'sidebar', 'throw', function () { return fbmPublicResult(FbmSync.controlDispatch('approve_push', {})); }); }
/** Gửi response thô của Extension cho cursor hiện tại. */
function fbmContinueSync(response, clientTrace) { return runEntryPoint('fbmContinueSync', 'sidebar', 'throw', function () { if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceContinue('entered'); try { var before = FbmSync.statusView(); fbmTraceBoundary('engine_before', 'fbmContinueSync', null); var result = FbmSync.controlDispatch('continue', { response: response }); fbmTraceBoundary('engine_after', 'fbmContinueSync', null); fbmTraceContinue('returned'); if (result && FbmSync.shouldLogStatus(before, result.status)) { fbmTraceBoundary('before_log', 'fbmContinueSync'); FbmSync.logStatus(result.status, 'slice'); fbmTraceBoundary('after_log', 'fbmContinueSync'); } return fbmPublicResult(result); } catch (err) { fbmTraceContinue('failed', err); fbmTraceBoundary('gas_failed', 'fbmContinueSync', err); throw err; } }); }
/** Dừng phiên đồng bộ mà không đụng dữ liệu nghiệp vụ. */
function fbmCancelSync() { return runEntryPoint('fbmCancelSync', 'sidebar', 'throw', function () { var result = FbmSync.controlDispatch('cancel', {}); if (result && result.status) { FbmSync.logStatus(result.status, 'cancel'); } return result; }); }
/** Đọc snapshot tiến độ hiện tại; Sidebar chỉ polling khi đang chạy. */
function fbmGetSyncStatus() { return runEntryPoint('fbmGetSyncStatus', 'sidebar', 'throw', function () { var before = FbmSync.stateRead(), result = FbmSync.controlDispatch('status', {}); if (result && result.lastFailureCode === 'SYNC_STALE_RUN' && before.lastFailureCode !== result.lastFailureCode) { FbmSync.logStatus(result, 'stale_run'); } return result; }); }
/** Ghi lỗi cầu nối do Sidebar phát hiện trước khi có response FBM. */
function fbmLogSyncError(message, clientTrace) { return runEntryPoint('fbmLogSyncError', 'sidebar', 'throw', function () { if (FbmSync.traceImport) { FbmSync.traceImport(clientTrace); } fbmTraceBoundary('gas_entered', 'fbmLogSyncError'); return FbmSync.logTransportError(message); }); }
/** Đọc vết độc lập sau timeout; không tiếp tục cursor và không gửi request FBM. */
function fbmGetSyncTrace() { return runEntryPoint('fbmGetSyncTrace', 'sidebar', 'throw', function () { return { ok: true, trace: FbmSync.traceRead(24) }; }); }
/** Đọc cờ cho phép ghi; mặc định tắt để không chạm dữ liệu FBM ngoài ý muốn. */
function fbmGetWriteMode() { return runEntryPoint('fbmGetWriteMode', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('get_write_mode', {}); }); }
function fbmGetMasterSwitch() { return runEntryPoint('fbmGetMasterSwitch', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('get_master_switch', {}); }); }
function fbmGetBackgroundSwitch() { return runEntryPoint('fbmGetBackgroundSwitch', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('get_background_switch', {}); }); }
function fbmGetIdentityStatus(runtime) { return runEntryPoint('fbmGetIdentityStatus', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('identity_status', { runtime: runtime || {} }); }); }
function fbmSaveIdentityBinding(binding) { return runEntryPoint('fbmSaveIdentityBinding', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('save_identity_binding', { binding: binding || {} }); }); }
function fbmGetSyncSettings() { return runEntryPoint('fbmGetSyncSettings', 'sidebar', 'throw', function () { return fbmPublicResult({ ok: true, settings: { accountName: FbmSync.configValue('FBM_ACCOUNT_NAME'), customerPrefix: FbmSync.configValue('FBM_MA_KH_PREFIX'), customerCodeLength: FbmSync.configValue('FBM_MA_KH_LENGTH'), activitySince: FbmSync.configValue('FBM_ACTIVITY_SINCE'), approvalThreshold: FbmSync.approvalThreshold() } }); }); }
/** Đổi cờ ghi thật theo thao tác chủ động của người dùng trên Sidebar. */
function fbmSetWriteMode(enabled) { return runEntryPoint('fbmSetWriteMode', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('set_write_mode', { enabled: enabled === true }); }); }
function fbmSetMasterSwitch(enabled) { return runEntryPoint('fbmSetMasterSwitch', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('set_master_switch', { enabled: enabled === true }); }); }
function fbmSetBackgroundSwitch(enabled) { return runEntryPoint('fbmSetBackgroundSwitch', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('set_background_switch', { enabled: enabled === true }); }); }
function fbmRetryPushFailures() { return runEntryPoint('fbmRetryPushFailures', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('retry_push_failures', {}); }); }
function fbmGetRelayConfig() { return runEntryPoint('fbmGetRelayConfig', 'sidebar', 'throw', function () { return fbmSyncRelayConfig(); }); }
function fbmRotateRelayKey() { return runEntryPoint('fbmRotateRelayKey', 'sidebar', 'throw', function () { return fbmSyncRotateRelayKey(); }); }
/** Khóa record khi người dùng bắt đầu sửa. */
function fbmBeginEdit(entity, id, revision) { return runEntryPoint('fbmBeginEdit', 'sidebar', 'throw', function () { return fbmSyncEditBegin(entity, id, revision); }); }
/** Mở khóa record khi người dùng kết thúc sửa. */
function fbmEndEdit(entity, id) { return runEntryPoint('fbmEndEdit', 'sidebar', 'throw', function () { return fbmSyncEditEnd(entity, id); }); }
/** Kiểm tra revision trước khi lưu form. */
function fbmCheckSave(entity, id, revision) { return runEntryPoint('fbmCheckSave', 'sidebar', 'throw', function () { return fbmSyncSaveAllowed(entity, id, revision); }); }
function fbmResolveConflict(entity, id, choice, merged) { return runEntryPoint('fbmResolveConflict', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('resolve_conflict', { entity: entity, id: id, choice: choice, merged: merged }); }); }
function fbmPrepareConflictResolution(entity, id, choice, merged) { return runEntryPoint('fbmPrepareConflictResolution', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('prepare_conflict', { entity: entity, id: id, choice: choice, merged: merged }); }); }
function fbmConfirmConflict(entity, id, choice, merged, response) { return runEntryPoint('fbmConfirmConflict', 'sidebar', 'throw', function () { return FbmSync.controlDispatch('confirm_conflict', { entity: entity, id: id, choice: choice, merged: merged, response: response }); }); }
