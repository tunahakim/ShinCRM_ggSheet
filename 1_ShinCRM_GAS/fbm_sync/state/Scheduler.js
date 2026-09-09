/** Lập lịch và ghi marker; trigger không gọi FBM trực tiếp. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
/** Ghi thời điểm dự kiến cho heartbeat và hai đợt quét. */
FbmSync.schedule = function () {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(Date.now() + 5 * 60 * 1000));
  props.setProperty('FBM_SYNC_NEXT_CUSTOMER_SCAN', String(Date.now() + 60 * 60 * 1000));
  props.setProperty('FBM_SYNC_NEXT_ACTIVITY_SCAN', String(Date.now() + 8 * 60 * 60 * 1000));
  return { heartbeatMinutes: 5, customerMinutes: 60, activityHours: 8 };
};
/** Cài lại ba trigger sync, xóa bản cũ cùng handler trước. */
function fbmInstallScheduler() {
  var names = ['fbmHeartbeatTrigger', 'fbmCustomerScanTrigger', 'fbmActivityScanTrigger'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) { if (names.indexOf(trigger.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(trigger); } });
  ScriptApp.newTrigger('fbmHeartbeatTrigger').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('fbmCustomerScanTrigger').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('fbmActivityScanTrigger').timeBased().everyHours(8).create();
  return FbmSync.schedule();
}

/** Nhận heartbeat từ Extension; không khởi động phiên nghiệp vụ ngoài ý muốn. */
function fbmSyncHeartbeat(rawResponse) {
  var state = FbmSync.stateRead(), result = FbmSync.protocol.assertSuccess(rawResponse);
  state.session = state.session || {};
  state.session.lastHeartbeatAt = Date.now();
  if (!result.ok && result.code === 'SESSION_EXPIRED') {
    state.session.expired = true; state.session.customerAuthorized = ''; state.session.activityAuthorized = '';
    state.lastFailureCode = result.code; state.retryable = false; state.lastError = result.bug.Message; state.message = result.bug.Message;
  } else if (result.ok) {
    state.session.expired = false;
    if (state.phase === 'idle' && !state.lastError) { state.message = 'Heartbeat FBM OK.'; }
  }
  FbmSync.stateWrite(state);
  return FbmSync.statusView();
}

function fbmHeartbeat(rawResponse) { return fbmSyncHeartbeat(rawResponse); }
/** Trigger chỉ ghi marker; Extension mới là nơi gửi request heartbeat. */
function fbmHeartbeatTrigger() { return FbmSync.statePatch({ message: 'Đến lịch heartbeat; chờ Extension chuyển request.' }); }
/** Đánh dấu đến lịch quét Customer để Sidebar/Extension tiếp tục. */
function fbmCustomerScanTrigger() { return FbmSync.statePatch({ message: 'Đến lịch quét Customer; chờ Extension chuyển request.' }); }
/** Đánh dấu đến lịch quét Activity để Sidebar/Extension tiếp tục. */
function fbmActivityScanTrigger() { return FbmSync.statePatch({ message: 'Đến lịch quét Activity; chờ Extension chuyển request.' }); }
