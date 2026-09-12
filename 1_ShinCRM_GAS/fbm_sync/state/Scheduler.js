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
/** Nhận quyền một lượt scheduler bằng khóa tài liệu; không giữ công việc trong RAM. */
FbmSync.schedulerClaim = function (kind, now) {
  var names = { heartbeat: ['FBM_SYNC_NEXT_HEARTBEAT', 5 * 60 * 1000], customer: ['FBM_SYNC_NEXT_CUSTOMER_SCAN', 60 * 60 * 1000], activity: ['FBM_SYNC_NEXT_ACTIVITY_SCAN', 8 * 60 * 60 * 1000] };
  var item = names[String(kind || '')], props = PropertiesService.getDocumentProperties(), at = Number(now || Date.now());
  if (!item) { return { ok: false, code: 'UNKNOWN_SCHEDULE' }; }
  var due = Number(props.getProperty(item[0]) || 0);
  if (due && due > at) { return { ok: false, code: 'NOT_DUE', nextRunAt: due }; }
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { return { ok: false, code: 'BUSY' }; }
  try {
    var state = FbmSync.stateRead();
    if (typeof FbmSync.recoverStaleRun === 'function') { state = FbmSync.recoverStaleRun(state).state; }
    // Phiên lỗi, đặc biệt push_wait, phải giữ nguyên nguyên nhân để người dùng xử lý;
    // scheduler không được ghi đè message hoặc biến nó thành một lượt đang chờ.
    if (state.runId && String(state.phase || '') === 'error' && ['SYNC_STALE_WRITE', 'SUPERVISOR_TIMEOUT_AT_PUSH'].indexOf(String(state.lastFailureCode || '')) >= 0) {
      return { ok: false, code: 'SYNC_ERROR_REQUIRES_MANUAL_RESTART', status: FbmSync.statusView() };
    }
    if (state.runId && ['idle', 'done', 'error'].indexOf(state.phase) < 0) { return { ok: false, code: 'SYNC_ALREADY_RUNNING', nextRunAt: due }; }
    due = Number(props.getProperty(item[0]) || 0);
    if (due && due > at) { return { ok: false, code: 'NOT_DUE', nextRunAt: due }; }
    var next = at + item[1];
    props.setProperty(item[0], String(next));
    state.scheduledScan = String(kind);
    state.nextRunAt = next;
    state.message = 'Đã nhận lượt scheduler ' + String(kind) + '; chờ Extension chuyển request.';
    FbmSync.stateWrite(state);
    return { ok: true, kind: String(kind), nextRunAt: next, status: FbmSync.statusView() };
  } finally { lock.releaseLock(); }
};
/** Cài lại ba trigger sync, xóa bản cũ cùng handler trước. */
function fbmInstallScheduler() {
  var names = ['fbmHeartbeatTrigger', 'fbmCustomerScanTrigger', 'fbmActivityScanTrigger', 'fbmSupervisorTrigger'];
  ScriptApp.getProjectTriggers().forEach(function (trigger) { if (names.indexOf(trigger.getHandlerFunction()) >= 0) { ScriptApp.deleteTrigger(trigger); } });
  ScriptApp.newTrigger('fbmHeartbeatTrigger').timeBased().everyMinutes(5).create();
  ScriptApp.newTrigger('fbmCustomerScanTrigger').timeBased().everyHours(1).create();
  ScriptApp.newTrigger('fbmActivityScanTrigger').timeBased().everyHours(8).create();
  ScriptApp.newTrigger('fbmSupervisorTrigger').timeBased().everyMinutes(1).create();
  return FbmSync.schedule();
}

/** Giám sát độc lập state; chỉ kết luận phiên treo và fail-closed, không gửi lại request ghi. */
FbmSync.supervise = function (now) {
  var state = FbmSync.stateRead(), at = Number(now || Date.now()), active = FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
  if (!active || !state.runId) { return { ok: true, monitored: false, status: FbmSync.statusView() }; }
  var last = Number(state.lastProgressAt || state.updatedAt || state.startedAt || 0), age = last ? at - last : FbmSync.STALE_RUN_MS + 1;
  if (age <= FbmSync.STALE_RUN_MS) { return { ok: true, monitored: true, stale: false, ageMs: Math.max(0, age), status: FbmSync.statusView() }; }
  var current = state, waitingWrite = current.cursor && current.cursor.kind === 'push_wait';
  current.phase = 'error';
  current.lastFailureCode = waitingWrite ? 'SUPERVISOR_TIMEOUT_AT_PUSH' : 'SUPERVISOR_TIMEOUT_AT_' + String((current.cursor && current.cursor.kind) || current.phase || 'UNKNOWN').toUpperCase();
  current.retryable = false;
  current.lastError = waitingWrite
    ? 'Phiên ghi FBM không nhận được phản hồi quá thời gian an toàn; Supervisor đã dừng và không tự ghi lại.'
    : 'Phiên đồng bộ không nhận được phản hồi quá thời gian an toàn; Supervisor đã dừng phiên.';
  current.message = current.lastError;
  if (!waitingWrite) {
    var kept = {};
    Object.keys(current.locks || {}).forEach(function (key) { if (current.locks[key] && current.locks[key].owner === 'user') { kept[key] = current.locks[key]; } });
    current.locks = kept;
  }
  FbmSync.stateWrite(current);
  if (FbmSync.traceEvent) { FbmSync.traceEvent('supervisor_timeout', { runId: current.runId, requestId: current.activeRequestId, error: current.lastError }); }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'supervisor_timeout', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', entity: current.entity || '', recordId: current.current || '', reason: current.lastError, detail: { code: current.lastFailureCode, ageMs: age, cursor: current.cursor && current.cursor.kind || '', operation: current.cursor && current.cursor.operation || '' } }); }
  return { ok: false, monitored: true, stale: true, status: FbmSync.statusView() };
};

/** Nhận heartbeat và trả một request đọc tiếp nếu scheduler đang đến hạn. */
function fbmSyncHeartbeat(rawResponse) {
  var state = FbmSync.stateRead(), result = FbmSync.protocol.assertSuccess(rawResponse), request = null, started = null;
  state.session = state.session || {};
  state.session.lastHeartbeatAt = Date.now();
  if (!result.ok && result.code === 'SESSION_EXPIRED') {
    state.session.expired = true; state.session.customerAuthorized = ''; state.session.activityAuthorized = '';
    state.lastFailureCode = result.code; state.retryable = false; state.lastError = result.bug.Message; state.message = result.bug.Message;
  } else if (result.ok) {
    state.session.expired = false;
    var total = FbmSync.heartbeatCustomerTotal(rawResponse);
    var previousTotal = state.session.customerTotal;
    if (total !== null) {
      state.session.customerTotal = total;
      if (previousTotal !== null && previousTotal !== undefined && Number(previousTotal) !== total && state.phase === 'idle') {
        state.scheduledScan = 'customer';
        state.message = 'Tổng số Customer FBM đã đổi; chuẩn bị quét lại Customer.';
      }
    }
    if (state.phase === 'idle' && !state.lastError && state.scheduledScan === 'heartbeat') { state.scheduledScan = ''; state.message = 'Heartbeat FBM OK.'; }
  }
  FbmSync.stateWrite(state);
  state = FbmSync.stateRead();
  if (result.ok && state.runId && ['idle', 'done', 'error'].indexOf(state.phase) < 0 && !(state.metadata && state.metadata.manualPending)) {
    request = FbmSync.requestForCursor(state);
  } else if (result.ok && state.phase === 'idle' && (state.scheduledScan === 'customer' || state.scheduledScan === 'activity') && typeof FbmSync.start === 'function') {
    started = FbmSync.start({ mode: 'read', scan: state.scheduledScan === 'activity' ? 'activity_bulk' : 'full', origin: 'background' });
    request = started && started.request ? started.request : null;
  }
  var status = FbmSync.statusView();
  return { ok: true, request: request ? (request.protocol ? request : FbmSync.nextEnvelope(request)) : null, status: status };
}

/** Đọc TotalRowCount của request heartbeat mà không phụ thuộc shape response. */
FbmSync.heartbeatCustomerTotal = function (rawResponse) {
  var parsed = FbmSync.protocol.parse(rawResponse) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var value = data && (data.TotalRowCount !== undefined ? data.TotalRowCount : data.totalRowCount);
  if (value === undefined || value === null || value === '') { return null; }
  var number = Number(value);
  return isFinite(number) && number >= 0 ? number : null;
};

function fbmHeartbeat(rawResponse) { return fbmSyncHeartbeat(rawResponse); }
/** Trigger chỉ ghi marker; Extension mới là nơi gửi request heartbeat. */
function fbmHeartbeatTrigger() { return FbmSync.schedulerClaim('heartbeat'); }
/** Đánh dấu đến lịch quét Customer để Sidebar/Extension tiếp tục. */
function fbmCustomerScanTrigger() { return FbmSync.schedulerClaim('customer'); }
/** Đánh dấu đến lịch quét Activity để Sidebar/Extension tiếp tục. */
function fbmActivityScanTrigger() { return FbmSync.schedulerClaim('activity'); }
/** Trigger này không gọi FBM; chỉ kiểm tra execution trước đã bỏ rơi hay chưa. */
function fbmSupervisorTrigger() {
  var run = function () { return FbmSync.supervise(); };
  return typeof runEntryPoint === 'function' ? runEntryPoint('fbmSupervisorTrigger', 'fbm_sync', 'throw', run) : run();
}
