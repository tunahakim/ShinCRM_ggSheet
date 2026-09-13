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
      return FbmSync.continue(input.response);
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
    case 'notification':
      return FbmSync.controlNotification(input.status || FbmSync.statusView());
    case 'approve_push':
      return fbmSyncApprovePush();
    case 'cancel':
      return fbmSyncCancel();
    case 'retry_push_failures':
      return fbmSyncRetryPushFailures();
    case 'set_write_mode':
      return fbmSyncSetWriteMode(input.enabled === true);
    case 'get_write_mode':
      return { enabled: FbmSync.writeAllowed() };
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
    case 'resolve_conflict':
      return FbmSync.resolveConflict(input.entity, input.id, input.choice, input.merged);
    case 'prepare_conflict':
      return FbmSync.prepareConflictResolution(input.entity, input.id, input.choice, input.merged);
    case 'confirm_conflict':
      return FbmSync.confirmConflict(input.entity, input.id, input.choice, input.merged, input.response);
    case 'transport_error':
      return FbmSync.logTransportError(input.message, input.action);
    default:
      throw new Error('SYNC_COMMAND_UNKNOWN: ' + name);
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
