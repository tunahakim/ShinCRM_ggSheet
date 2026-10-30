/**
 * Cửa vào của Sidebar cho đồng bộ FBM: mỗi hàm là một dòng chuyển đúng một lệnh vào `FbmSync.controlDispatch`, không chứa nghiệp vụ, khóa hay lọc kết quả. Tên hàm giữ ổn định vì Sidebar gọi qua `google.script.run`.
 * Nguồn `fbm_sync` bật phạm vi riêng của đồng bộ (gom DocumentProperties, ghi vết) qua `ENTRY_POINT_SCOPES` đăng ký ở cuối tệp.
 */
function fbmCommandRun(name, command, payload) { return runEntryPoint(name, 'fbm_sync', function () { return FbmSync.controlDispatch(command, payload); }, payload); }

function fbmStartSync(mode, clientTrace, pack) { return fbmCommandRun('fbmStartSync', 'start', { kind: 'sync', mode: mode, pack: pack, clientTrace: clientTrace }); }
function fbmStartIdentityCheck(identity) { return fbmCommandRun('fbmStartIdentityCheck', 'start', { kind: 'identity_check', identity: identity || null }); }
function fbmStartIdentityProbe() { return fbmCommandRun('fbmStartIdentityProbe', 'start', { kind: 'identity_probe' }); }
function fbmStartLoginTest(credentialRef, expectedIdentity) { return fbmCommandRun('fbmStartLoginTest', 'start', { kind: 'login_test', credentialRef: credentialRef, identity: expectedIdentity || null }); }
function fbmStartForceLogin() { return fbmCommandRun('fbmStartForceLogin', 'start', { kind: 'login_force' }); }
/** `input`: `{ response, clientTrace }` khi Extension trả kết quả request, hoặc `{ error: { requestId, code, message } }` khi không gửi được request. */
function fbmContinueSync(input) { return fbmCommandRun('fbmContinueSync', 'continue', input || {}); }
function fbmCancelSync() { return fbmCommandRun('fbmCancelSync', 'cancel', {}); }
function fbmStopBackground() { return fbmCommandRun('fbmStopBackground', 'stop_background', {}); }
function fbmResetSyncState() { return fbmCommandRun('fbmResetSyncState', 'reset_state', {}); }
function fbmApprovePush() { return fbmCommandRun('fbmApprovePush', 'approve_push', {}); }
function fbmRetryPushFailures() { return fbmCommandRun('fbmRetryPushFailures', 'retry_push_failures', {}); }
function fbmOpenConflict() { return fbmCommandRun('fbmOpenConflict', 'open_conflict', {}); }
function fbmConfirmConflict(entity, id, choice, merged, fbmValues, shinValues, snapshot) { return fbmCommandRun('fbmConfirmConflict', 'confirm_conflict', { entity: entity, id: id, choice: choice, merged: merged, fbmValues: fbmValues, shinValues: shinValues, snapshot: snapshot }); }
function fbmGetSyncStatus() { return fbmCommandRun('fbmGetSyncStatus', 'status', {}); }
function fbmGetSyncTrace() { return fbmCommandRun('fbmGetSyncTrace', 'trace_read', {}); }
/** Lỗi phía Sidebar không gắn với một request: `runId` chỉ có khi lỗi thuộc lượt Sidebar đang tự chạy, GAS mới dừng lượt đó. */
function fbmLogSyncError(message, clientTrace, action, runId) { return fbmCommandRun('fbmLogSyncError', 'client_error', { message: message, clientTrace: clientTrace, action: action, runId: runId }); }
/** Mỗi lần lưu một mục cài đặt (`sync`, `account`, `extension`, `schedule`, `login_policy`, `auto_login`); `master` là true/false chỉ khi mục `sync` kèm đổi công tắc tổng. */
function fbmSaveSettings(section, value, master) { return fbmCommandRun('fbmSaveSettings', 'save_settings', { section: section, value: value, master: master }); }
function fbmSetMasterSwitch(enabled) { return fbmCommandRun('fbmSetMasterSwitch', 'set_master', { enabled: enabled === true }); }
function fbmSaveIdentityBinding(binding) { return fbmCommandRun('fbmSaveIdentityBinding', 'save_identity_binding', { binding: binding || {} }); }
function fbmSaveConnection(config) { return fbmCommandRun('fbmSaveConnection', 'save_credential', config || {}); }
function fbmRepairLoginUsername(input) { return fbmCommandRun('fbmRepairLoginUsername', 'repair_login_username', input || {}); }
function fbmGetRelayConfig() { return fbmCommandRun('fbmGetRelayConfig', 'relay_config', {}); }
function fbmRotateRelayKey() { return fbmCommandRun('fbmRotateRelayKey', 'relay_rotate_key', {}); }
function fbmLogRelaySwitchDecision(decision, fromSpreadsheetId) { return fbmCommandRun('fbmLogRelaySwitchDecision', 'relay_switch_log', { decision: decision, fromSpreadsheetId: fromSpreadsheetId }); }

/** Phạm vi riêng của đồng bộ quanh mỗi cửa vào nguồn `fbm_sync`: gom DocumentProperties một lần gọi và ghi mốc vết. Không lưu response FBM vào vết. */
var ENTRY_POINT_SCOPES = typeof ENTRY_POINT_SCOPES !== 'undefined' ? ENTRY_POINT_SCOPES : {};
ENTRY_POINT_SCOPES.fbm_sync = {
  begin: function () { if (FbmSync.propertyBufferBegin()) { FbmSync.budgetCallBegin(); } },
  end: function () { FbmSync.propertyBufferEnd(); },
  boundary: function (stage, name, error) { FbmSync.traceEvent(stage, { operation: String(name || ''), error: error ? String(error && error.message || error) : '', stack: error && error.stack ? String(error.stack) : '' }); }
};
