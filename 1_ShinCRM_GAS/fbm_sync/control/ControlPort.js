/** Cổng điều khiển trung lập với kênh của phiên đồng bộ FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/*
 * Kênh gọi (Sidebar, relay nền, bot) chỉ được gửi command + payload chuẩn.
 * Cổng này không biết DOM, tin nhắn Zalo hay google.script.run; nó chỉ gọi
 * nghiệp vụ FbmSync và trả kết quả có thể hiển thị ở bất kỳ kênh nào.
 */
FbmSync.controlDispatch = function (command, payload) {
  var input = payload || {}, name = String(command || '');
  switch (name) {
    case 'start':
      return FbmSync.start({ mode: input.mode || 'read', scan: input.scan, origin: input.origin || 'manual', manual: input.manual !== false });
    case 'continue':
      return FbmSync.limitRelayResult ? FbmSync.limitRelayResult(FbmSync.continue(input.response), input.hop) : FbmSync.continue(input.response);
    case 'transport_failure':
      return FbmSync.heartbeatTransportFailure ? FbmSync.heartbeatTransportFailure(input) : { ok: false, code: 'TRANSPORT_FAILURE_UNAVAILABLE', request: null, status: FbmSync.statusView() };
    case 'status':
      return FbmSync.statusView();
    case 'set_master_switch':
      return FbmSync.setMasterEnabled(input.enabled === true);
    case 'get_master_switch':
      return { ok: true, enabled: FbmSync.masterEnabled() };
    case 'set_background_switch':
      return FbmSync.setBackgroundEnabled(input.enabled === true);
    case 'get_background_switch':
      return { ok: true, enabled: FbmSync.backgroundEnabled() };
    case 'get_extension_config':
      return { ok: true, config: FbmSync.extensionConfigPublic ? FbmSync.extensionConfigPublic() : { pollMinutes: 5, runOnStartup: true } };
    case 'save_extension_config':
      return FbmSync.extensionConfigSave(input.config || {});
    case 'get_background_schedule':
      return { ok: true, schedule: FbmSync.backgroundSchedulePublic ? FbmSync.backgroundSchedulePublic() : {} };
    case 'save_background_schedule':
      return FbmSync.backgroundScheduleSave(input.schedule || {});
    case 'notification':
      return FbmSync.controlNotification(input.status || FbmSync.statusView());
    case 'approve_push':
      return fbmSyncApprovePush();
    case 'cancel':
      return fbmSyncCancel();
    case 'reset_state':
      return FbmSync.controlResetState();
    case 'retry_push_failures':
      return fbmSyncRetryPushFailures();
    case 'login_config':
      return FbmSync.loginConfigPublic();
    case 'save_login_config':
      return FbmSync.loginConfigSave(input.config || {});
    case 'set_auto_login':
      return FbmSync.loginConfigSetEnabled(input.enabled === true);
    case 'identity_status':
      return FbmSync.identityStatus(input.runtime || {});
    case 'save_identity_binding':
      return FbmSync.bindingWrite(input.binding || {});
    case 'save_connection':
      return FbmSync.connectionSave(input || {});
    case 'open_conflict':
      return FbmSync.openConflict();
    case 'conflict_opened':
      return FbmSync.conflictOpened(input.response);
    case 'prepare_conflict':
      return FbmSync.prepareConflictResolution(input.entity, input.id, input.choice);
    case 'confirm_conflict':
      return FbmSync.confirmConflict(input.entity, input.id, input.choice, input.merged, input.response);
    case 'transport_error':
      return FbmSync.logTransportError(input.message, input.action);
    default:
      throw new Error('SYNC_COMMAND_UNKNOWN: ' + name);
  }
};

/** Tuần tự hóa các command thay đổi state với heartbeat/alarm; command tự giữ khóa không đi qua đây. */
FbmSync.controlDispatchLocked = function (command, payload) {
  // transport_failure tự giữ orchestration lock để cả Sidebar và relay nền dùng chung
  // một handler; không bọc thêm ở đây vì Apps Script Lock không tái nhập.
  var name = String(command || ''), mutating = ['start', 'continue', 'approve_push', 'cancel', 'reset_state', 'retry_push_failures', 'set_master_switch', 'set_background_switch', 'save_extension_config', 'save_background_schedule', 'save_login_config', 'set_auto_login', 'identity_status', 'save_identity_binding', 'save_connection', 'open_conflict', 'conflict_opened', 'prepare_conflict', 'confirm_conflict'];
  if (mutating.indexOf(name) < 0) { return FbmSync.controlDispatch(name, payload); }
  try {
    return FbmSync.withOrchestrationLock(function () {
      if (['start', 'continue', 'approve_push', 'retry_push_failures'].indexOf(name) < 0) { return FbmSync.controlDispatch(name, payload); }
      return FbmSync.runSlice(function () { return FbmSync.controlDispatch(name, payload); });
    });
  } catch (error) {
    var code = String(error && error.code || '');
    if (!FbmSync.stateStorageError(error)) { throw error; }
    var status;
    try { status = FbmSync.statusView(); } catch (readError) { status = FbmSync.stateStuckView(readError); return { ok: false, code: status.code, error: status.lastError, status: status }; }
    // Phiên còn đứng ở pha đang chạy nghĩa là cả bản state rút gọn cũng không ghi được: mở lối đặt lại (FBM-044).
    status.resetOffered = FbmSync.ACTIVE_PHASES.indexOf(String(status.phase || '')) >= 0;
    status.ok = false;
    status.phase = 'error';
    status.lastFailureCode = code;
    status.lastError = String(error && error.message || 'Không thể lưu trạng thái phiên vào DocumentProperties.');
    status.message = status.lastError;
    status.retryable = false;
    return { ok: false, code: code, error: status.lastError, status: status };
  }
};

/** DTO thông báo dùng chung; adapter Sidebar/Zalo tự chọn cách trình bày và phím tắt. */
FbmSync.controlNotification = function (status) {
  var snapshot = status || {}, counts = snapshot.counts || {}, metadata = snapshot.metadata || {}, actions = [];
  if (snapshot.phase === 'awaiting_approval' && metadata.approvalRequired === true) {
    actions.push({ id: 'approve_push', label: 'Tiếp tục đồng bộ', command: 'approve_push' });
    actions.push({ id: 'cancel_sync', label: 'Dừng phiên', command: 'cancel' });
  }
  var changed = Number(metadata.approvalCount || counts.total || 0);
  var text = String(snapshot.message || snapshot.label || snapshot.phase || '');
  if (actions.length) { text = 'Cảnh báo: có ' + changed + ' bản ghi cần người dùng chấp thuận trước khi ghi.'; }
  return {
    type: actions.length ? 'sync_approval_required' : 'sync_status',
    severity: actions.length ? 'warning' : (snapshot.phase === 'error' ? 'error' : 'info'),
    text: text,
    actions: actions,
    status: {
      runId: String(snapshot.runId || ''),
      phase: String(snapshot.phase || ''),
      counts: counts,
      message: String(snapshot.message || '')
    }
  };
};
/** Đặt lại phiên kẹt rồi trả status mới; bị từ chối thì trả status hiện tại kèm lý do để Sidebar hiện đúng chỗ. */
FbmSync.controlResetState = function () {
  var reset = FbmSync.stateReset();
  if (!reset.ok) { return Object.assign({}, FbmSync.statusView(), { ok: false, code: reset.code, message: reset.message }); }
  return Object.assign({}, FbmSync.statusView(), { message: 'Đã đặt lại phiên đồng bộ. Bấm "Bắt đầu đồng bộ" để chạy lại từ đầu.' });
};
