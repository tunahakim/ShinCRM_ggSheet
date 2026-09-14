/** Lập lịch và ghi marker; trigger không gọi FBM trực tiếp. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.BACKGROUND_SWITCH_KEY = 'FBM_SYNC_BACKGROUND_ENABLED';
FbmSync.RELAY_HOP_LIMIT = 20;
FbmSync.backgroundEnabled = function () { try { return FbmSync.props().getProperty(FbmSync.BACKGROUND_SWITCH_KEY) !== 'false'; } catch (err) { return true; } };
FbmSync.setBackgroundEnabled = function (enabled) { var value = enabled === true; FbmSync.props().setProperty(FbmSync.BACKGROUND_SWITCH_KEY, value ? 'true' : 'false'); return { ok: true, enabled: value }; };
/** Ghi thời điểm dự kiến cho heartbeat và hai đợt quét. */
FbmSync.schedule = function () {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(Date.now() + 5 * 60 * 1000));
  props.setProperty('FBM_SYNC_NEXT_CUSTOMER_SCAN', String(Date.now() + 60 * 60 * 1000));
  props.setProperty('FBM_SYNC_NEXT_ACTIVITY_SCAN', String(Date.now() + 30 * 60 * 1000));
  return { heartbeatMinutes: 5, customerMinutes: 60, activityMinutes: 30 };
};
/** Nhận quyền một lượt scheduler bằng khóa tài liệu; không giữ công việc trong RAM. */
FbmSync.schedulerClaim = function (kind, now) {
  var names = { heartbeat: ['FBM_SYNC_NEXT_HEARTBEAT', 5 * 60 * 1000], customer: ['FBM_SYNC_NEXT_CUSTOMER_SCAN', 60 * 60 * 1000], activity: ['FBM_SYNC_NEXT_ACTIVITY_SCAN', 30 * 60 * 1000] };
  var item = names[String(kind || '')], props = PropertiesService.getDocumentProperties(), at = Number(now || Date.now());
  if (!item) { return { ok: false, code: 'UNKNOWN_SCHEDULE' }; }
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; scheduler không mở kỳ mới.', status: FbmSync.statusView() }; }
  if (!FbmSync.backgroundEnabled()) { return { ok: false, code: 'BACKGROUND_DISABLED', message: 'Đồng bộ nền đang tắt.', status: FbmSync.statusView() }; }
  var due = Number(props.getProperty(item[0]) || 0);
  if (due && due > at) { return { ok: false, code: 'NOT_DUE', nextRunAt: due }; }
  var lock = FbmSync.orchestrationLock();
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
  ScriptApp.newTrigger('fbmActivityScanTrigger').timeBased().everyMinutes(30).create();
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

function fbmSyncLockResult(code, message) {
  return { ok: false, code: String(code || 'BUSY'), request: null, message: String(message || 'GAS đang xử lý một request khác; chưa cấp request FBM mới.'), status: FbmSync.statusView() };
}

/** GAS cấp request heartbeat; Extension chỉ chuyển nguyên envelope này tới tab FBM. */
function fbmSyncHeartbeatRequest(options) {
  var opt = options || {}, source = String(opt.source || 'alarm');
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: true, noop: true, code: 'SYNC_DISABLED', request: null, status: FbmSync.statusView() }; }
  if (['alarm', 'sidebar_open'].indexOf(source) >= 0 && !FbmSync.backgroundEnabled()) { return { ok: true, noop: true, code: 'BACKGROUND_DISABLED', request: null, status: FbmSync.statusView() }; }
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!lock.tryLock(waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa cấp request heartbeat mới.'); }
  try {
    var state = FbmSync.stateRead(), session = state.session || {}, cursor = state.cursor || {}, now = Date.now();
    var activePhase = FbmSync.ACTIVE_PHASES && FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
    if (state.activeRequestId && now - Number(state.lastProgressAt || 0) < 120000) {
      return fbmSyncLockResult('REQUEST_IN_FLIGHT', 'Đã có request FBM đang chờ response; không cấp request heartbeat chồng.');
    }
    if (state.runId && activePhase && cursor.kind !== 'login') {
      var resumed = FbmSync.requestForCursor(state);
      if (!resumed) { return fbmSyncLockResult('SYNC_RESUME_UNAVAILABLE', 'Phiên đồng bộ đang chạy nhưng GAS không dựng lại được request từ cursor.'); }
      return { ok: true, code: 'SYNC_RESUME_REQUEST_READY', request: FbmSync.nextEnvelope(resumed), status: FbmSync.statusView(), resumed: true };
    }
    if (Number(options && options.hop || 0) >= Number(FbmSync.RELAY_HOP_LIMIT || 20)) {
      return { ok: true, code: 'RELAY_SLICE_COMPLETE', request: null, status: FbmSync.statusView() };
    }
    // State chưa có cookie không đồng nghĩa tab FBM đã logout: request heartbeat
    // vẫn có thể lấy cookie qua capture generic do GAS chỉ dẫn.
    var missingSession = session.expired === true;
    if (cursor.kind === 'login' && state.activeRequestId && Number(state.lastProgressAt || 0) && now - Number(state.lastProgressAt) < 120000) {
      return fbmSyncLockResult('AUTO_LOGIN_IN_PROGRESS', 'Đang chờ response đăng nhập tự động; không gửi thêm request.');
    }
    if (missingSession) {
      var resumeCursor = cursor.kind === 'login' ? cursor.resumeCursor : (cursor.kind ? cursor : { kind: 'heartbeat' });
      var loginRequest = typeof FbmSync.beginAutoLogin === 'function' ? FbmSync.beginAutoLogin(state, resumeCursor, { heartbeat: true }) : null;
      if (loginRequest) { return { ok: true, code: 'AUTO_LOGIN_REQUEST_READY', request: FbmSync.nextEnvelope(loginRequest), status: FbmSync.statusView(), autoLogin: true }; }
      var loginConfig = typeof FbmSync.autoLoginCanAttempt === 'function' ? FbmSync.autoLoginCanAttempt() : { code: 'AUTO_LOGIN_NOT_CONFIGURED' }, waitingCode = loginConfig.code || 'SESSION_EXPIRED_WAITING_LOGIN';
      state.phase = 'paused';
      state.lastFailureCode = waitingCode;
      state.retryable = false;
      state.lastError = waitingCode === 'AUTO_LOGIN_THROTTLED'
        ? 'Đang chờ đủ 30 phút trước khi thử đăng nhập FBM lại.'
        : 'Chưa có điều kiện tự đăng nhập FBM; đang chờ người dùng đăng nhập thủ công hoặc cấu hình auto-login.';
      state.message = state.lastError;
      state.scheduledScan = '';
      FbmSync.stateWrite(state);
      return { ok: true, noop: true, code: waitingCode, request: null, retryAt: loginConfig.retryAt || 0, status: FbmSync.statusView() };
    }
    if (typeof FbmSync.heartbeatCustomerRequest !== 'function') { return { ok: false, code: 'HEARTBEAT_REQUEST_UNAVAILABLE', request: null, status: FbmSync.statusView() }; }
    state.cursor = { kind: 'heartbeat' };
    state.relayHop = 0;
    FbmSync.stateWrite(state);
    return { ok: true, code: 'HEARTBEAT_REQUEST_READY', request: FbmSync.nextEnvelope(FbmSync.heartbeatCustomerRequest()), status: FbmSync.statusView() };
  } finally { lock.releaseLock(); }
}
FbmSync.heartbeatRequest = fbmSyncHeartbeatRequest;

/** Nhận response heartbeat và trả một request đọc tiếp nếu scheduler đang đến hạn. */
function fbmSyncHeartbeat(rawResponse, options) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', status: FbmSync.statusView() }; }
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!lock.tryLock(waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa nhận response heartbeat.'); }
  try { return fbmSyncHeartbeatLocked(rawResponse, options || {}); } finally { lock.releaseLock(); }
}

function fbmSyncHeartbeatLocked(rawResponse, options) {
  var state = FbmSync.stateRead(), cursor = state.cursor || {}, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '', result = FbmSync.protocol.assertSuccess(rawResponse), request = null, started = null;
  // Sau heartbeat, mọi request của phiên nền dùng đúng bộ xử lý continuation chung.
  // Worker chỉ chuyển envelope nên không cần và không được biết cursor nào đang chạy.
  if (cursor.kind !== 'heartbeat') { return FbmSync.continue(rawResponse); }
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId)) {
    return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Response heartbeat không còn thuộc request đang chờ.' };
  }
  state.activeRequestId = '';
  state.deadlineAt = 0;
  state.lastProgressAt = Date.now();
  state.relayHop = Number(options && options.hop || 0) + 1;
  FbmSync.stateWrite(state);
  if (result.ok && FbmSync.protocol.hasHeartbeatData && !FbmSync.protocol.hasHeartbeatData(rawResponse)) {
    result = { ok: false, code: 'SESSION_EXPIRED', status: Number(rawResponse && rawResponse.status || 0), retryable: false, bug: { FieldName: '$SESSION', Message: 'FBM không trả dữ liệu Customer hợp lệ; phiên có thể đã hết hạn.' } };
  }
  state.session = state.session || {};
  state.session.lastHeartbeatAt = Date.now();
  if (!result.ok && result.code === 'SESSION_EXPIRED') {
    state.session.expired = true; state.session.customerAuthorized = ''; state.session.activityAuthorized = '';
    state.lastFailureCode = result.code; state.retryable = false; state.lastError = result.bug.Message; state.message = result.bug.Message;
  } else if (!result.ok) {
    state.lastFailureCode = result.code || 'HEARTBEAT_FAILED';
    state.retryable = result.retryable === true;
    state.lastError = result.bug && result.bug.Message || ('Heartbeat FBM thất bại: HTTP ' + String(result.status || 'không xác định') + '.');
    state.message = state.lastError;
    state.scheduledScan = '';
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
  state.cursor = {};
  FbmSync.stateWrite(state);
  state = FbmSync.stateRead();
  if (result.ok && Number(options && options.hop || 0) >= Number(FbmSync.RELAY_HOP_LIMIT || 20)) {
    state.relayHop = 0;
    state.message = 'Đã hết lát heartbeat an toàn; lượt sau sẽ tiếp tục từ cursor đã lưu.';
    FbmSync.stateWrite(state);
    return { ok: true, code: 'RELAY_SLICE_COMPLETE', request: null, status: FbmSync.statusView() };
  }
  if (result.ok && state.runId && ['idle', 'done', 'error'].indexOf(state.phase) < 0 && !(state.metadata && state.metadata.manualPending)) {
    request = FbmSync.requestForCursor(state);
  } else if (result.ok && state.phase === 'idle' && (state.scheduledScan === 'customer' || state.scheduledScan === 'activity') && typeof FbmSync.start === 'function') {
    started = FbmSync.start({ mode: 'read', scan: state.scheduledScan === 'activity' ? 'activity_bulk' : 'full', origin: 'background' });
    request = started && started.request ? started.request : null;
  }
  var status = FbmSync.statusView();
  if (!result.ok) { return { ok: false, code: result.code || 'HEARTBEAT_FAILED', status: result.status || 0, error: result.bug && result.bug.Message || state.lastError, request: null, statusView: status }; }
  return { ok: true, request: request ? (request.protocol ? request : FbmSync.nextEnvelope(request)) : null, status: status };
}

/** Thu hồi reservation khi Extension không thể gửi envelope tới tab FBM. */
function fbmSyncHeartbeatTransportFailure(payload) {
  var value = payload || {}, requestId = String(value.requestId || ''), lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!lock.tryLock(waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa ghi nhận lỗi cầu nối.'); }
  try {
    var state = FbmSync.stateRead();
    if (!requestId || String(state.activeRequestId || '') !== requestId) {
      return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Lỗi cầu nối không còn thuộc request đang chờ.' };
    }
    state.activeRequestId = '';
    state.deadlineAt = 0;
    state.lastProgressAt = Date.now();
    state.lastFailureCode = String(value.code || 'FBM_TRANSPORT_UNAVAILABLE');
    state.retryable = false;
    state.lastError = String(value.message || 'Extension không gửi được request tới tab FBM.').slice(0, 240);
    state.message = state.lastError;
    if (state.cursor && state.cursor.kind === 'heartbeat' && state.lastFailureCode === 'FBM_TRANSPORT_CAPTURE_MISSING') {
      state.session = state.session || {};
      state.session.expired = true;
    }
    if (state.cursor && state.cursor.kind === 'login') { state.phase = 'paused'; }
    FbmSync.stateWrite(state);
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
  } finally { lock.releaseLock(); }
}
FbmSync.heartbeatTransportFailure = fbmSyncHeartbeatTransportFailure;

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
