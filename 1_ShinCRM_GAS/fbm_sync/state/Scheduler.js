/** Lịch nền nghiệp vụ ở GAS: Extension hỏi theo alarm `gas_poll`, GAS chọn tiến trình đến hạn theo mốc lưu trong DocumentProperties (09/02). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.RELAY_HOP_LIMIT = 20;
FbmSync.EXTENSION_CONFIG_KEY = 'FBM_SYNC_EXTENSION_CONFIG_V1';
FbmSync.BACKGROUND_SCHEDULE_KEY = 'FBM_SYNC_BACKGROUND_SCHEDULE_V1';
FbmSync.DETAIL_CURSOR_KEY = 'FBM_SYNC_DETAIL_CURSOR_V1';
/** Mốc đến hạn của từng tiến trình nền, mỗi tiến trình đúng một khóa. */
FbmSync.SCHEDULE_MARKER_KEYS = { customerFull: 'FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_NEXT_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_NEXT_DETAIL_SCAN', heartbeat: 'FBM_SYNC_NEXT_HEARTBEAT' };
/** Cursor detail phải sống qua nhiều lượt scheduler, nhưng chỉ chứa khóa trang FBM, không chứa dữ liệu bản ghi. */
FbmSync.detailCursorRead = function () {
  try {
    var raw = FbmSync.props().getProperty(FbmSync.DETAIL_CURSOR_KEY), parsed = raw ? JSON.parse(raw) : null;
    if (!parsed || typeof parsed !== 'object' || !Array.isArray(parsed.pageValue) || parsed.pageValue.length < 4) { return null; }
    var pageIndex = Number(parsed.pageIndex);
    if (!isFinite(pageIndex) || pageIndex < 0) { return null; }
    return { pageIndex: Math.floor(pageIndex), pageValue: parsed.pageValue.slice(0, 4).map(function (value) { return String(value === null || value === undefined ? '' : value); }), pageItems: parsed.pageItems || null };
  } catch (ignore) { return null; }
};
FbmSync.detailCursorWrite = function (cursor) {
  var value = cursor || {}, pageIndex = Number(value.pageIndex), pageValue = Array.isArray(value.pageValue) ? value.pageValue.slice(0, 4) : [];
  if (!isFinite(pageIndex) || pageIndex < 0 || pageValue.length < 4) { return null; }
  var saved = { pageIndex: Math.floor(pageIndex), pageValue: pageValue.map(function (item) { return String(item === null || item === undefined ? '' : item); }), pageItems: value.pageItems || null };
  FbmSync.props().setProperty(FbmSync.DETAIL_CURSOR_KEY, JSON.stringify(saved));
  return saved;
};
FbmSync.detailCursorClear = function () {
  var props = FbmSync.props();
  if (props && typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.DETAIL_CURSOR_KEY); }
  else if (props) { props.setProperty(FbmSync.DETAIL_CURSOR_KEY, ''); }
};
/** Công tắc lịch nền chỉ có một nơi lưu là cờ `enabled` của lịch nền; không giữ cờ riêng để hai nơi không lệch nhau. */
FbmSync.backgroundEnabled = function () { return FbmSync.backgroundScheduleRead().enabled !== false; };
FbmSync.setBackgroundEnabled = function (enabled) { var saved = FbmSync.backgroundScheduleSave({ enabled: enabled === true }); return { ok: true, enabled: saved.schedule.enabled }; };
FbmSync.extensionConfigDefault = function () { return { pollMinutes: 5, runOnStartup: true }; };
FbmSync.extensionConfigRead = function () {
  var fallback = FbmSync.extensionConfigDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.EXTENSION_CONFIG_KEY), parsed = raw ? JSON.parse(raw) : {};
    if (!parsed || typeof parsed !== 'object') { return fallback; }
    var minutes = Number(parsed.pollMinutes);
    fallback.pollMinutes = isFinite(minutes) ? Math.max(1, Math.min(60, Math.round(minutes))) : fallback.pollMinutes;
    fallback.runOnStartup = parsed.runOnStartup !== false;
  } catch (ignore) {}
  return fallback;
};
FbmSync.extensionConfigSave = function (input) {
  var value = input || {}, minutes = Number(value.pollMinutes), current = FbmSync.extensionConfigRead();
  if (!isFinite(minutes) || minutes < 1 || minutes > 60) { return { ok: false, code: 'EXTENSION_POLL_INVALID', message: 'Nhịp hỏi GAS phải từ 1 đến 60 phút.' }; }
  var saved = { pollMinutes: Math.round(minutes), runOnStartup: value.runOnStartup !== false };
  FbmSync.props().setProperty(FbmSync.EXTENSION_CONFIG_KEY, JSON.stringify(saved));
  return { ok: true, pollMinutes: saved.pollMinutes, runOnStartup: saved.runOnStartup, previous: current };
};
FbmSync.backgroundScheduleDefault = function () {
  return {
    enabled: true,
    direction: 'read',
    heartbeat: { enabled: true, minutes: 5, priority: 100 },
    customerFull: { enabled: true, minutes: 60, priority: 10 },
    activityFull: { enabled: false, minutes: 8 * 60, priority: 20 },
    detail: { enabled: false, minutes: 30, priority: 30, customersPerRun: 30 }
  };
};
FbmSync.backgroundScheduleRead = function () {
  var fallback = FbmSync.backgroundScheduleDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.BACKGROUND_SCHEDULE_KEY), parsed = raw ? JSON.parse(raw) : {};
    fallback.enabled = parsed && parsed.enabled !== false;
    fallback.direction = ['read', 'push', 'write'].indexOf(String(parsed && parsed.direction || '')) >= 0 ? String(parsed.direction) : fallback.direction;
    ['customerFull', 'activityFull', 'heartbeat', 'detail'].forEach(function (kind) {
      var item = parsed && parsed[kind] || {}, minutes = Number(item.minutes);
      fallback[kind].enabled = item.enabled !== false;
      fallback[kind].minutes = isFinite(minutes) ? Math.max(1, Math.min(7 * 24 * 60, Math.round(minutes))) : fallback[kind].minutes;
      if (kind === 'detail') {
        var batch = Number(item.customersPerRun);
        fallback.detail.customersPerRun = isFinite(batch) ? Math.max(1, Math.min(50, Math.floor(batch))) : fallback.detail.customersPerRun;
      }
    });
  } catch (ignore) {}
  return fallback;
};
FbmSync.backgroundScheduleSave = function (input) {
  var current = FbmSync.backgroundScheduleRead(), value = input || {}, saved = {};
  var direction = value.direction === undefined ? current.direction : String(value.direction || '');
  if (['read', 'push', 'write'].indexOf(direction) < 0) { throw new Error('Invalid background sync direction.'); }
  var enabled = value.enabled === undefined ? current.enabled !== false : value.enabled === true;
  ['customerFull', 'activityFull', 'heartbeat', 'detail'].forEach(function (kind) {
    var item = value[kind] || {}, minutes = item.minutes === undefined ? current[kind].minutes : Number(item.minutes);
    if (!isFinite(minutes) || minutes < 1 || minutes > 7 * 24 * 60) { throw new Error('Chu kỳ ' + kind + ' phải từ 1 phút đến 7 ngày.'); }
    saved[kind] = { enabled: item.enabled === undefined ? current[kind].enabled : item.enabled === true, minutes: Math.round(minutes), priority: current[kind].priority };
    if (kind === 'detail') {
      var batch = item.customersPerRun === undefined ? current.detail.customersPerRun : Number(item.customersPerRun);
      if (!isFinite(batch) || batch < 1 || batch > 50 || Math.floor(batch) !== batch) { throw new Error('Số khách mỗi lượt vòng xoay phải là số nguyên từ 1 đến 50 (một trang khách FBM); muốn xoay nhanh hơn thì rút ngắn chu kỳ.'); }
      saved.detail.customersPerRun = Math.floor(batch);
    }
  });
  saved.enabled = enabled; saved.direction = direction;
  FbmSync.props().setProperty(FbmSync.BACKGROUND_SCHEDULE_KEY, JSON.stringify(saved));
  if (typeof FbmSync.schedule === 'function') { FbmSync.schedule(); }
  return { ok: true, schedule: saved };
};
FbmSync.extensionConfigPublic = function () {
  var value = FbmSync.extensionConfigRead();
  return { pollMinutes: value.pollMinutes, runOnStartup: value.runOnStartup === true };
};
FbmSync.backgroundSchedulePublic = function () {
  var value = FbmSync.backgroundScheduleRead();
  return { enabled: value.enabled !== false, direction: value.direction, heartbeat: value.heartbeat, customerFull: value.customerFull, activityFull: value.activityFull, detail: value.detail };
};
/** Ghi thời điểm dự kiến cho các tiến trình nghiệp vụ. */
FbmSync.schedule = function () {
  var props = FbmSync.props(), at = Date.now(), schedule = FbmSync.backgroundScheduleRead();
  Object.keys(FbmSync.SCHEDULE_MARKER_KEYS).forEach(function (kind) { props.setProperty(FbmSync.SCHEDULE_MARKER_KEYS[kind], String(at + schedule[kind].minutes * 60 * 1000)); });
  return { heartbeatMinutes: schedule.heartbeat.minutes, customerMinutes: schedule.customerFull.minutes, activityMinutes: schedule.activityFull.minutes, detailMinutes: schedule.detail.minutes, direction: schedule.direction };
};
FbmSync.ensureScheduleMarkers = function (now) {
  var props = FbmSync.props(), at = Number(now || Date.now()), schedule = FbmSync.backgroundScheduleRead();
  Object.keys(FbmSync.SCHEDULE_MARKER_KEYS).forEach(function (kind) {
    var key = FbmSync.SCHEDULE_MARKER_KEYS[kind];
    if (!Number(props.getProperty(key) || 0)) { props.setProperty(key, String(at + schedule[kind].minutes * 60 * 1000)); }
  });
};
/** Tiến trình bật và đã đến hạn, chưa chạy trong chuỗi này, theo ưu tiên: Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay, cuối cùng Giữ phiên. */
FbmSync.scheduleDueKinds = function (now, ran) {
  var props = FbmSync.props(), schedule = FbmSync.backgroundScheduleRead(), skip = ran || [];
  return Object.keys(FbmSync.SCHEDULE_MARKER_KEYS).filter(function (kind) {
    return schedule[kind].enabled && skip.indexOf(kind) < 0 && Number(props.getProperty(FbmSync.SCHEDULE_MARKER_KEYS[kind]) || 0) <= now;
  }).sort(function (a, b) { return schedule[a].priority - schedule[b].priority; });
};
/** Mốc kế tiếp = mốc cũ + đủ số chu kỳ để vượt giờ hiện tại: bám nhịp tròn, không trôi theo giờ chạy xong và không cộng dồn nợ. Mốc chưa tới (Giữ phiên chạy lúc mở Chrome) thì giữ nguyên. */
FbmSync.scheduleMarkerAdvance = function (kind, now) {
  var key = FbmSync.SCHEDULE_MARKER_KEYS[kind], cycle = FbmSync.backgroundScheduleRead()[kind].minutes * 60 * 1000, old = Number(FbmSync.props().getProperty(key) || 0), at = Number(now || Date.now());
  var next = !old ? at + cycle : old > at ? old : old + (Math.floor((at - old) / cycle) + 1) * cycle;
  FbmSync.props().setProperty(key, String(next));
  return next;
};
FbmSync.scheduleNextAt = function () {
  var props = FbmSync.props(), schedule = FbmSync.backgroundScheduleRead();
  var times = Object.keys(FbmSync.SCHEDULE_MARKER_KEYS).filter(function (kind) { return schedule[kind].enabled; }).map(function (kind) { return Number(props.getProperty(FbmSync.SCHEDULE_MARKER_KEYS[kind]) || 0); }).filter(function (at) { return at > 0; });
  return times.length ? Math.min.apply(null, times) : 0;
};
/**
 * Mở chuỗi nền của lần hỏi này: chọn tiến trình đến hạn đầu tiên, chưa dời mốc nào (mốc chỉ dời khi tiến trình chạy xong).
 * Chuỗi nằm trong state (`chain`) để lượt chuyền bị cắt lát thì lần hỏi sau chạy tiếp. Chuỗi còn sót mà không còn lượt nào chạy là chuỗi đã gãy (lỗi, lượt tay chen ngang) nên bị thay bằng chuỗi mới; tiến trình dở chạy lại vì mốc của nó chưa dời.
 */
FbmSync.schedulerPickDue = function (now, options) {
  var at = Number(now || Date.now()), opt = options || {}, schedule = FbmSync.backgroundScheduleRead(), state = FbmSync.stateRead();
  FbmSync.ensureScheduleMarkers(at);
  if (!FbmSync.masterEnabled() || schedule.enabled === false) { return { ok: false, code: 'BACKGROUND_DISABLED' }; }
  if (state.runId && ['idle', 'done', 'error'].indexOf(String(state.phase || '')) < 0) { return { ok: false, code: 'SYNC_ALREADY_RUNNING' }; }
  if (state.scheduledScan) { return { ok: true, kind: String(state.scheduledScan), existing: true }; }
  var due = FbmSync.scheduleDueKinds(at, []);
  // Mở Chrome là tùy chọn người dùng thấy được: được một lần Giữ phiên ngay, không sinh loạt việc bù.
  if (!due.length && opt.startup === true && FbmSync.extensionConfigRead().runOnStartup !== false && schedule.heartbeat.enabled) { due = ['heartbeat']; }
  if (!due.length) {
    if (state.chain) { state.chain = null; FbmSync.stateWrite(state); }
    return { ok: false, code: 'NO_PROCESS_DUE' };
  }
  state.scheduledScan = due[0];
  state.scheduledDirection = schedule.direction;
  state.chain = { current: due[0], ran: [], direction: schedule.direction, startedAt: at };
  state.message = 'Đã chọn tiến trình nền ' + due[0] + '; chờ request heartbeat hiện tại hoàn tất.';
  FbmSync.stateWrite(state);
  return { ok: true, kind: due[0] };
};
/** Mở một tiến trình của chuỗi. Giữ phiên chỉ là request đếm mang cursor `heartbeat`; các tiến trình khác là một lượt nền thường, tự kết thúc bằng bước đếm. */
FbmSync.chainStart = function (kind) {
  var state = FbmSync.stateRead(), schedule = FbmSync.backgroundScheduleRead(), direction = state.chain && state.chain.direction || schedule.direction;
  state.chain = Object.assign({ ran: [], direction: direction }, state.chain || {}, { current: kind });
  if (kind === 'heartbeat') {
    state.scheduledScan = 'heartbeat'; state.scheduledDirection = direction; state.cursor = { kind: 'heartbeat' };
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.sessionSystemRequest('heartbeat')), status: FbmSync.statusView() };
  }
  state.scheduledScan = '';
  FbmSync.stateWrite(state);
  var options = { mode: direction, scan: kind === 'activityFull' ? 'activity_bulk' : kind === 'detail' ? 'detail' : 'full', origin: 'background' };
  if (kind === 'detail') { options.detail = schedule.detail; }
  return FbmSync.start(options);
};
/**
 * Tiến trình hiện tại của chuỗi vừa chạy xong: dời mốc của nó rồi mở tiến trình đến hạn kế tiếp chưa chạy trong chuỗi.
 * Mỗi tiến trình theo lịch chạy tối đa một lần mỗi chuỗi nên chuỗi luôn dừng dù chu kỳ ngắn hơn thời gian chạy; Quét nhanh do bước đếm gọi nằm trong lượt của tiến trình đang chạy nên không tính.
 */
FbmSync.chainAdvance = function () {
  for (var guard = 0; guard <= Object.keys(FbmSync.SCHEDULE_MARKER_KEYS).length; guard += 1) {
    var state = FbmSync.stateRead(), chain = state.chain, at = Date.now();
    if (!chain || !chain.current) { return null; }
    FbmSync.scheduleMarkerAdvance(chain.current, at);
    chain.ran = (chain.ran || []).concat([chain.current]); chain.current = '';
    var next = FbmSync.masterEnabled() && FbmSync.backgroundEnabled() ? FbmSync.scheduleDueKinds(at, chain.ran)[0] : '';
    state.chain = next ? chain : null; state.scheduledScan = ''; state.nextRunAt = FbmSync.scheduleNextAt();
    FbmSync.stateWrite(state);
    if (!next) { return null; }
    var started = FbmSync.chainStart(next);
    // Tiến trình xong ngay không cần request (không có gì để đọc) thì xét tiếp; dừng lỗi thì chuỗi gãy và lần hỏi sau chạy lại.
    if (started && started.request) { return started; }
    var after = FbmSync.stateRead();
    if (after.phase !== 'done' || !after.chain || after.chain.current !== next) { return started; }
  }
  return null;
};
/** Cuối mỗi lượt nền (sau bước đếm): lượt xong thì chuỗi chạy tiếp tiến trình kế. Lượt tay, lượt lỗi hay tạm dừng không đẩy chuỗi. */
FbmSync.chainTail = function (result) {
  if (!result || result.request) { return result; }
  var state = FbmSync.stateRead();
  if (state.origin !== 'background' || state.phase !== 'done' || !state.chain || !state.chain.current) { return result; }
  var next = FbmSync.chainAdvance();
  return Object.assign({}, result, { ok: true, request: next && next.request || null, status: FbmSync.statusView() });
};

function fbmSyncLockResult(code, message) {
  return { ok: false, code: String(code || 'BUSY'), request: null, message: String(message || 'GAS đang xử lý một request khác; chưa cấp request FBM mới.'), status: FbmSync.statusView() };
}

/** GAS cấp request heartbeat; Extension chỉ chuyển nguyên envelope này tới tab FBM. */
function fbmSyncHeartbeatRequest(options) {
  var opt = options || {}, source = String(opt.source || 'alarm');
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: true, noop: true, code: 'SYNC_DISABLED', request: null, status: FbmSync.statusView() }; }
  if (['alarm', 'sidebar_open'].indexOf(source) >= 0 && !FbmSync.backgroundEnabled()) { return { ok: true, noop: true, code: 'BACKGROUND_DISABLED', request: null, status: FbmSync.statusView() }; }
  if (typeof FbmSync.identityPreflight === 'function') {
    var identity = FbmSync.identityPreflight('background');
    if (identity.blocking) { return { ok: true, noop: true, code: identity.status && identity.status.status === 'UNBOUND' ? 'FBM_IDENTITY_UNBOUND' : 'REBIND_REQUIRED', request: null, message: identity.message, status: FbmSync.statusView() }; }
  }
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!documentStoreTryLock(lock, waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa cấp request heartbeat mới.'); }
  try {
    var state = FbmSync.stateRead(), session = state.session || {}, cursor = state.cursor || {}, now = Date.now();
    var activePhase = FbmSync.ACTIVE_PHASES && FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
    if (state.activeRequestId && now < Number(state.deadlineAt || 0)) {
      return fbmSyncLockResult('REQUEST_IN_FLIGHT', 'Đã có request FBM đang chờ response; không cấp request heartbeat chồng.');
    }
    var gate = typeof FbmSync.sessionGateMeta === 'function' ? FbmSync.sessionGateMeta(state) : {}, waitingResult = typeof FbmSync.sessionGateWaitRequest === 'function' ? FbmSync.sessionGateWaitRequest(state, now) : null;
    if (waitingResult && waitingResult.handled) { return waitingResult; }
    if (state.runId && activePhase && !(typeof FbmSync.sessionGateCursorIsInternal === 'function' && FbmSync.sessionGateCursorIsInternal(state))) {
      if (gate.sliceProbePending === true && state.cursor && state.cursor.kind !== 'session_probe') {
        gate.sliceProbePending = false;
        var sliceProbe = FbmSync.sessionGateResumeProbeRequest(state, state.cursor, 'Đang probe lại phiên FBM ở đầu lát relay mới...');
        return sliceProbe ? { ok: true, code: 'SESSION_SLICE_PROBE_READY', request: sliceProbe, status: FbmSync.statusView(), probingSlice: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView() };
      }
      var resumed = FbmSync.requestForCursor(state);
      if (!resumed) { return fbmSyncLockResult('SYNC_RESUME_UNAVAILABLE', 'Phiên đồng bộ đang chạy nhưng GAS không dựng lại được request từ cursor.'); }
      return { ok: true, code: 'SYNC_RESUME_REQUEST_READY', request: FbmSync.nextEnvelope(resumed), status: FbmSync.statusView(), resumed: true };
    }
    if (Number(options && options.hop || 0) >= Number(FbmSync.RELAY_HOP_LIMIT || 20)) {
      return { ok: true, code: 'RELAY_SLICE_COMPLETE', request: null, status: FbmSync.statusView() };
    }
    // Chọn tiến trình đến hạn trước khi kiểm phiên, để nhịp hỏi kỹ thuật không tự mở việc mỗi lần.
    var picked = FbmSync.schedulerPickDue(now, { startup: source === 'startup' });
    if (!picked.ok) {
      return { ok: true, noop: true, code: picked.code || 'NO_PROCESS_DUE', request: null, status: FbmSync.statusView() };
    }
    // Đọc lại sau khi chọn: ghi bản đọc trước đó sẽ xóa mất tiến trình vừa chọn và lịch nền không bao giờ khởi động.
    state = FbmSync.stateRead();
    state.cursor = { kind: 'heartbeat' };
    state.relayHop = 0;
    FbmSync.stateWrite(state);
    var heartbeatRequest = FbmSync.sessionSystemRequest('heartbeat'), heartbeatEnvelope = FbmSync.nextEnvelope(heartbeatRequest), currentState = FbmSync.stateRead();
    return { ok: true, code: typeof FbmSync.sessionGateRequestCode === 'function' ? FbmSync.sessionGateRequestCode(heartbeatEnvelope, currentState) : 'HEARTBEAT_REQUEST_READY', request: heartbeatEnvelope, status: FbmSync.statusView() };
  } finally { lock.releaseLock(); }
}
FbmSync.heartbeatRequest = fbmSyncHeartbeatRequest;

/** Nhận response heartbeat và trả một request đọc tiếp nếu scheduler đang đến hạn. */
function fbmSyncHeartbeat(rawResponse, options) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', status: FbmSync.statusView() }; }
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!documentStoreTryLock(lock, waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa nhận response heartbeat.'); }
  // Đường nền tự giữ khóa nên không đi qua controlDispatchLocked; dùng chung ranh giới lát để lỗi và Log xử lý như đường Sidebar.
  try { return FbmSync.runSlice(function () { return fbmSyncHeartbeatLocked(rawResponse, options || {}); }); } finally { lock.releaseLock(); }
}

function fbmSyncHeartbeatLocked(rawResponse, options) {
  var state = FbmSync.stateRead(), cursor = state.cursor || {}, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '', result = FbmSync.protocol.assertSuccess(rawResponse), request = null, started = null;
  // Sau heartbeat, mọi request của phiên nền dùng đúng bộ xử lý continuation chung.
  // Worker chỉ chuyển envelope nên không cần và không được biết cursor nào đang chạy.
  if (cursor.kind !== 'heartbeat') { return FbmSync.continueRun(rawResponse); }
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId)) {
    return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Response heartbeat không còn thuộc request đang chờ.' };
  }
  var contractStop = FbmSync.contractGate(rawResponse);
  if (contractStop) { return contractStop; }
  // Heartbeat không được tự suy ra phiên từ shape dữ liệu. Lỗi HTTP/parse đi qua
  // continuation chung để 401/403 được probe và mọi lỗi khác fail-closed.
  if (!result.ok) { return FbmSync.continueRun(rawResponse); }
  state.activeRequestId = '';
  state.deadlineAt = 0;
  state.lastProgressAt = Date.now();
  if (typeof FbmSync.sessionGateResponseStarted === 'function') { FbmSync.sessionGateResponseStarted(state); }
  state.relayHop = Number(options && options.hop || 0) + 1;
  FbmSync.stateWrite(state);
  var countTotal = FbmSync.customerCountTotal(rawResponse);
  if ((FbmSync.protocol.hasHeartbeatData && !FbmSync.protocol.hasHeartbeatData(rawResponse)) || countTotal === null) {
    state.phase = 'error'; state.cursor = {}; state.lastFailureCode = 'HEARTBEAT_RESPONSE_INVALID'; state.lastError = 'Heartbeat FBM không trả dữ liệu Customer đúng định dạng; đã dừng để probe phiên ở lượt sau.'; state.message = state.lastError; state.retryable = false; state.scheduledScan = '';
    FbmSync.stateWrite(state);
    if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, state.lastFailureCode, state.lastError, 'heartbeat_invalid_response'); }
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
  }
  state.session = state.session || {};
  state.session.lastHeartbeatAt = Date.now();
  var heartbeatDirection = state.scheduledDirection || FbmSync.backgroundScheduleRead().direction;
  // Thân của Giữ phiên là bước đếm: lệch mốc thì Quét nhanh chạy ngay dù công tắc Quét nhanh tắt; chiều Chỉ đẩy chỉ giữ phiên (09/02 mục 8).
  // Các tiến trình khác tự kết thúc bằng bước đếm, nên ở đây request đếm chỉ mở phiên cho chúng.
  if (state.scheduledScan === 'heartbeat') {
    var recount = FbmSync.customerCountApplies(heartbeatDirection) && FbmSync.customerCountChanged(countTotal);
    state.scheduledScan = recount ? 'recount' : '';
    state.message = recount ? FbmSync.RECOUNT_MESSAGE : 'Heartbeat FBM OK.';
  }
  state.cursor = {};
  FbmSync.stateWrite(state);
  state = FbmSync.stateRead();
  if (result.ok && Number(options && options.hop || 0) >= Number(FbmSync.RELAY_HOP_LIMIT || 20)) {
    state.relayHop = 0;
    if (String(state.origin || '') === 'background' && state.runId && state.cursor && state.cursor.kind) {
      var heartbeatGate = typeof FbmSync.sessionGateMeta === 'function' ? FbmSync.sessionGateMeta(state) : {};
      heartbeatGate.sliceProbePending = true;
    }
    state.message = 'Đã hết lát heartbeat an toàn; lượt sau sẽ tiếp tục từ cursor đã lưu.';
    FbmSync.stateWrite(state);
    return { ok: true, code: 'RELAY_SLICE_COMPLETE', request: null, status: FbmSync.statusView() };
  }
  if (result.ok && state.runId && ['idle', 'done', 'error'].indexOf(state.phase) < 0 && !(state.metadata && state.metadata.manualPending)) {
    request = FbmSync.requestForCursor(state);
  } else if (result.ok && state.scheduledScan === 'recount') {
    state.scheduledScan = ''; FbmSync.stateWrite(state);
    started = FbmSync.recountStart(heartbeatDirection, 'background');
    request = started && started.request ? started.request : null;
  } else if (result.ok && state.chain && state.scheduledScan && state.scheduledScan === state.chain.current) {
    started = FbmSync.chainTail(FbmSync.chainStart(state.scheduledScan));
    request = started && started.request ? started.request : null;
  } else if (result.ok && state.chain && state.chain.current === 'heartbeat') {
    started = FbmSync.chainAdvance();
    request = started && started.request ? started.request : null;
  }
  var status = FbmSync.statusView();
  if (!result.ok) { return { ok: false, code: result.code || 'HEARTBEAT_FAILED', status: result.status || 0, error: result.bug && result.bug.Message || state.lastError, request: null, statusView: status }; }
  return { ok: true, request: request ? (request.protocol ? request : FbmSync.nextEnvelope(request)) : null, status: status };
}

/** Thu hồi reservation khi Extension không thể gửi envelope tới tab FBM. */
function fbmSyncHeartbeatTransportFailure(payload) {
  var value = payload || {}, requestId = String(value.requestId || ''), lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!documentStoreTryLock(lock, waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa ghi nhận lỗi cầu nối.'); }
  try {
    var state = FbmSync.stateRead();
    if (!requestId || String(state.activeRequestId || '') !== requestId) {
      if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, 'STALE_RESPONSE', 'Lỗi cầu nối không còn thuộc request đang chờ.', 'transport_failure_stale'); }
      return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView(), error: 'Lỗi cầu nối không còn thuộc request đang chờ.' };
    }
    var failureCode = String(value.code || 'FBM_TRANSPORT_UNAVAILABLE'), failureMessage = String(value.message || 'Extension không gửi được request tới tab FBM.').slice(0, 240), retry;
    var scanWindows = FbmSync.ACTIVITY_WINDOW_CODES.indexOf(failureCode) >= 0 ? FbmSync.activityScanToWindows(state, failureCode, failureMessage) : null;
    if (scanWindows) { return scanWindows; }
    var scanRestart = typeof FbmSync.scanJobRestart === 'function' ? FbmSync.scanJobRestart(state, failureCode, failureMessage) : null;
    if (scanRestart) { return scanRestart; }
    try { retry = typeof FbmSync.sessionGateTransportRetry === 'function' ? FbmSync.sessionGateTransportRetry(state, requestId, failureCode, failureMessage) : null; }
    catch (gateError) { return FbmSync.sessionGateFailClosed(state, gateError); }
    if (retry) { return retry; }
    state.activeRequestId = '';
    state.deadlineAt = 0;
    state.lastProgressAt = Date.now();
    state.lastFailureCode = failureCode;
    state.retryable = false;
    state.lastError = failureMessage;
    state.message = state.lastError;
    state.cursor = {};
    state.phase = 'error';
    FbmSync.stateWrite(state);
    if (typeof FbmSync.sessionGateRecordFailure === 'function') { FbmSync.sessionGateRecordFailure(state, failureCode, failureMessage, 'transport_failure'); }
    return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError };
  } finally { lock.releaseLock(); }
}
FbmSync.heartbeatTransportFailure = fbmSyncHeartbeatTransportFailure;

/**
 * Handler của các trigger hẹn giờ phía GAS ở thiết kế cũ. Nhịp nền nay chỉ do alarm `gas_poll` của Extension (09/02), GAS không cài trigger hẹn giờ nào cho đồng bộ.
 * Google không tự gỡ trigger đã cài khi code đổi, nên tên hàm phải còn: trigger sót gọi tới thì tự xóa mọi trigger cũ và ghi Log, không làm việc nghiệp vụ nào. Bỏ tên hàm thì trigger sót báo lỗi "không tìm thấy hàm" mãi.
 */
FbmSync.LEGACY_TRIGGER_HANDLERS = ['fbmHeartbeatTrigger', 'fbmCustomerScanTrigger', 'fbmActivityScanTrigger', 'fbmSupervisorTrigger'];
FbmSync.removeLegacyTriggers = function () {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (FbmSync.LEGACY_TRIGGER_HANDLERS.indexOf(handler) >= 0) { ScriptApp.deleteTrigger(trigger); removed.push(handler); }
  });
  if (removed.length && typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'legacy_trigger_removed', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Đã gỡ ' + removed.length + ' trigger hẹn giờ của thiết kế cũ (' + removed.join(', ') + '); nhịp nền chỉ còn do Extension hỏi GAS.' });
  }
  return { ok: true, removed: removed };
};
function fbmLegacyTriggerEntry(name) {
  var run = function () { return FbmSync.removeLegacyTriggers(); };
  return typeof runEntryPoint === 'function' ? runEntryPoint(name, 'fbm_sync', 'throw', run) : run();
}
function fbmHeartbeatTrigger() { return fbmLegacyTriggerEntry('fbmHeartbeatTrigger'); }
function fbmCustomerScanTrigger() { return fbmLegacyTriggerEntry('fbmCustomerScanTrigger'); }
function fbmActivityScanTrigger() { return fbmLegacyTriggerEntry('fbmActivityScanTrigger'); }
function fbmSupervisorTrigger() { return fbmLegacyTriggerEntry('fbmSupervisorTrigger'); }
