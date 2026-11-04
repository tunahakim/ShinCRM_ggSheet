/**
 * Cửa vào của Sidebar cho đồng bộ FBM: mỗi hàm là một dòng chuyển đúng một lệnh vào `FbmSync.controlDispatch`, không chứa nghiệp vụ, khóa hay lọc kết quả. Tên hàm giữ ổn định vì Sidebar gọi qua `google.script.run`.
 * Nguồn `fbm_sync` bật phạm vi riêng của đồng bộ (gom DocumentProperties, ghi vết) qua `ENTRY_POINT_SCOPES` đăng ký ở cuối tệp.
 */
function fbmCommandRun(name, command, payload) { return runEntryPoint(name, 'fbm_sync', function () { return FbmSync.controlDispatch(command, payload); }, payload); }

/** Một cửa cho mọi lệnh mở lượt Extension chở (`start`, `approve_push`, `open_conflict`); payload mang `machineId` của máy sẽ nhận lượt. Kết quả có `runId` thay phong bì: Sidebar chuyển runId cho Extension, không cầm phong bì. */
function fbmDriveCommand(command, payload) { return fbmCommandRun('fbmDriveCommand', FbmSync.driveCommandName(command), payload || {}); }
function fbmCancelSync() { return fbmCommandRun('fbmCancelSync', 'cancel', {}); }
function fbmStopBackground() { return fbmCommandRun('fbmStopBackground', 'stop_background', {}); }
function fbmResetSyncState() { return fbmCommandRun('fbmResetSyncState', 'reset_state', {}); }
function fbmRetryPushFailures() { return fbmCommandRun('fbmRetryPushFailures', 'retry_push_failures', {}); }
function fbmConfirmConflict(entity, id, choice, merged, fbmValues, shinValues, snapshot) { return fbmCommandRun('fbmConfirmConflict', 'confirm_conflict', { entity: entity, id: id, choice: choice, merged: merged, fbmValues: fbmValues, shinValues: shinValues, snapshot: snapshot }); }
function fbmGetSyncStatus() { return fbmCommandRun('fbmGetSyncStatus', 'status', {}); }
function fbmGetSyncTrace() { return fbmCommandRun('fbmGetSyncTrace', 'trace_read', {}); }
/** Lỗi phía Sidebar không gắn với một request: `runId` chỉ có khi lỗi thuộc lượt Sidebar đang tự chạy, GAS mới dừng lượt đó. */
function fbmLogSyncError(message, clientTrace, action, runId) { return fbmCommandRun('fbmLogSyncError', 'client_error', { message: message, clientTrace: clientTrace, action: action, runId: runId }); }
/** Lưu cài đặt FBM theo tên phần: `patches` là `{ tênPhần: { trường: chuỗi ô } }`, GAS kiểm và trả `problems`; `confirmLow` chỉ true khi người dùng đã xác nhận lịch nền dày. */
function fbmSaveSettings(patches, confirmLow) { return fbmCommandRun('fbmSaveSettings', 'save_settings', { patches: patches || {}, confirmLow: confirmLow === true }); }
function fbmResetSettings(section) { return fbmCommandRun('fbmResetSettings', 'reset_settings', { section: section }); }
function fbmSetMasterSwitch(enabled) { return fbmCommandRun('fbmSetMasterSwitch', 'set_master', { enabled: enabled === true }); }
function fbmSaveIdentityBinding(binding) { return fbmCommandRun('fbmSaveIdentityBinding', 'save_identity_binding', { binding: binding || {} }); }
function fbmSaveConnection(config) { return fbmCommandRun('fbmSaveConnection', 'save_credential', config || {}); }
function fbmRepairLoginUsername(input) { return fbmCommandRun('fbmRepairLoginUsername', 'repair_login_username', input || {}); }
/** Giao máy Sidebar đang mở chạy đồng bộ nền: `input` là `{ machineId, name }`, mã do Extension máy đó sinh. */
function fbmAssignBackgroundMachine(input) { return fbmCommandRun('fbmAssignBackgroundMachine', 'assign_background_machine', input || {}); }
function fbmReleaseBackgroundMachine() { return fbmCommandRun('fbmReleaseBackgroundMachine', 'release_background_machine', {}); }
function fbmGetRelayConfig() { return fbmCommandRun('fbmGetRelayConfig', 'relay_config', {}); }
function fbmRotateRelayKey() { return fbmCommandRun('fbmRotateRelayKey', 'relay_rotate_key', {}); }
function fbmLogRelaySwitchDecision(decision, fromSpreadsheetId) { return fbmCommandRun('fbmLogRelaySwitchDecision', 'relay_switch_log', { decision: decision, fromSpreadsheetId: fromSpreadsheetId }); }

/** Phạm vi riêng của đồng bộ quanh mỗi cửa vào nguồn `fbm_sync`: gom DocumentProperties một lần gọi và ghi mốc vết. Không lưu response FBM vào vết. Lúc đóng, dòng Log của request bị bỏ mà không có trả lời (phát hiện ở cửa ghi ô lượt) được ghi trước khi ghi trace. */
var ENTRY_POINT_SCOPES = typeof ENTRY_POINT_SCOPES !== 'undefined' ? ENTRY_POINT_SCOPES : {};
ENTRY_POINT_SCOPES.fbm_sync = {
  begin: function () { if (FbmSync.propertyBufferBegin()) { FbmSync.budgetCallBegin(); FbmSync.logContextNote(null); } },
  end: function () { FbmSync.requestWatchTake().forEach(function (entry) { logEvent(entry); }); FbmSync.propertyBufferEnd(); },
  boundary: function (stage, name, error) { FbmSync.traceEvent(FbmSync.callStateSeen(), stage, { operation: String(name || ''), error: error ? String(error && error.message || error) : '', stack: error && error.stack ? String(error.stack) : '' }); }
};
