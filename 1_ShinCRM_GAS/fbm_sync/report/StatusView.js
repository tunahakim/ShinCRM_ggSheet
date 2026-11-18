/** Bản xem trạng thái công khai cho Sidebar: đọc kho một lần rồi dựng thuần; mọi quyết định hiển thị (tone, nút, tiến độ, cảnh báo) nằm ở đây. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đổi phase nội bộ thành nhãn hiển thị ngắn. */
FbmSync.statusLabel = function (phase) {
  return ({ idle: 'Sẵn sàng', checking_session: 'Đang kiểm tra phiên FBM', pull_customer: 'Đang đọc khách hàng', pull_activity: 'Đang đọc giao dịch', reconcile: 'Đang đối chiếu', push: 'Đang ghi dữ liệu', paused: 'Tạm dừng', conflict: 'Có xung đột', error: 'Có lỗi', done: 'Hoàn tất' })[phase] || String(phase || '');
};
/** Nhãn hướng dữ liệu để Sidebar không phải suy diễn từ cursor nội bộ. */
FbmSync.syncDirection = function (state) {
  var phase = String(state && state.phase || ''), mode = String(state && state.mode || 'read');
  // Lượt Giữ phiên có đẩy hiện chiều của lịch nền, không theo mode `push` của lượt.
  if (state && state.scan === 'keepalive') { return FbmSync.syncDirection({ phase: 'done', mode: state.scheduleMode }); }
  if (phase === 'checking_session') { return 'Kết nối FBM'; }
  if (phase === 'push') { return 'ShinCRM → FBM'; }
  if (phase === 'done' && mode === 'write') { return 'Hai chiều'; }
  if (mode === 'push') { return 'ShinCRM → FBM'; }
  if (mode === 'check') { return 'Kiểm tra'; }
  return 'FBM → ShinCRM';
};
/** Nhãn thực thể hiện tại; dùng "Chuẩn bị phiên" khi chưa có bản ghi. */
FbmSync.syncEntityLabel = function (entity, phase) {
  if (entity === 'customer') { return 'Khách hàng'; }
  if (entity === 'activity') { return 'Giao dịch'; }
  if (phase === 'checking_session') { return 'Chuẩn bị phiên'; }
  return 'Tổng hợp';
};
/** Chỉ đưa dữ liệu render sang Sidebar; state nội bộ có lookup, cursor form và khóa vẫn ở GAS. */
FbmSync.statusMetadata = function (metadata, failureStore) {
  var data = metadata || {}, keys = ['audit', 'categoryBlocks', 'identityBlocks', 'identityProbe', 'identityCheck', 'activityBulkMissing', 'activityBulkMissingCount', 'customerErrors', 'preflightIssues'];
  var out = keys.reduce(function (result, key) {
    if (data[key] !== undefined) { result[key] = data[key]; }
    return result;
  }, {});
  // Hàng đợi xung đột nằm trên Sheet; Sidebar chỉ nhận số đếm, bản ghi cụ thể đến khi người dùng mở chế độ xung đột.
  out.conflictCount = Number(data.conflictCount || 0);
  var store = failureStore, failures = store.hashes, failureKeys = Object.keys(failures), details = store.details;
  out.pushFailureCount = failureKeys.length;
  out.pushFailures = {};
  out.pushFailureDetails = {};
  failureKeys.slice(0, 20).forEach(function (key) { out.pushFailures[key] = failures[key]; if (details[key] !== undefined) { out.pushFailureDetails[key] = details[key]; } });
  return out;
};
/** Chuyển state GAS thành các chặng hiển thị cố định; Sidebar không tự đoán từ cursor. */
FbmSync.pipelineDefinition = function (state) {
  var value = state || {}, scan = String(value.scan || 'full'), mode = String(value.mode || 'read'), cursor = value.cursor || {};
  if (scan === 'identity_probe') { return { kind: 'identity_probe', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'identity', label: 'Đọc nhận diện tài khoản' }] }; }
  if (scan === 'identity_check') { return { kind: 'identity_check', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'customer', label: 'Quét Customer' }, { id: 'reconcile', label: 'Đối chiếu liên kết' }] }; }
  if (String(cursor.kind || '') === 'login') {
    return { kind: 'login_test', steps: [{ id: 'login', label: 'Đăng nhập FBM' }, { id: 'session', label: 'Kiểm tra phiên' }, { id: 'identity', label: 'Xác minh tài khoản' }] };
  }
  if (scan === 'activity_bulk') { return { kind: 'activity_bulk', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'activity', label: 'Đọc Activity' }, { id: 'reconcile', label: 'Đối soát' }, { id: 'sheet', label: 'Cập nhật Sheet' }] }; }
  if (scan === 'detail') { return { kind: 'detail', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'activity', label: 'Đọc Activity theo vòng xoay' }, { id: 'reconcile', label: 'Đối soát' }] }; }
  if (mode === 'push') { return { kind: 'push', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'record', label: 'Kiểm tra bản ghi' }, { id: 'form', label: 'Mở form FBM' }, { id: 'write', label: 'Ghi FBM' }, { id: 'verify', label: 'Đọc xác nhận' }, { id: 'baseline', label: 'Cập nhật baseline' }] }; }
  var pull = [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'customer', label: 'Đọc Customer' }, { id: 'activity', label: 'Đọc Activity' }, { id: 'reconcile', label: 'Đối soát' }];
  if (mode !== 'check') { pull.push({ id: 'sheet', label: 'Cập nhật Sheet' }); }
  if (mode === 'write') {
    pull = pull.concat([{ id: 'record', label: 'Kiểm tra bản ghi' }, { id: 'form', label: 'Mở form FBM' }, { id: 'write', label: 'Ghi FBM' }, { id: 'verify', label: 'Đọc xác nhận' }, { id: 'baseline', label: 'Cập nhật baseline' }]);
  }
  return { kind: mode === 'check' ? 'check' : mode === 'write' ? 'write' : 'read', steps: pull };
};
/** Xác định duy nhất một chặng đang chờ/xử lý từ state đã có trên GAS. */
FbmSync.pipelineCurrentStep = function (state, definition) {
  var value = state || {}, phase = String(value.phase || ''), cursor = value.cursor || {}, kind = String(cursor.kind || ''), operation = String(cursor.operation || ''), available = {};
  (definition.steps || []).forEach(function (step) { available[step.id] = true; });
  if (phase === 'done' || phase === 'idle') { return ''; }
  if (kind === 'lookup') { return available.category ? 'category' : ''; }
  if (kind === 'login' && cursor.step === 'authorize') { return available.session ? 'session' : 'login'; }
  if (kind === 'identity_user_grid' || (kind === 'login' && cursor.step === 'identity')) { return available.identity ? 'identity' : 'session'; }
  if (kind === 'customer_grid') { return available.customer ? 'customer' : ''; }
  if (kind === 'activity_grid' || (kind === 'scan_job' && cursor.entity === 'activity')) { return available.activity ? 'activity' : ''; }
  if (kind === 'push_scan') { return available.record ? 'record' : ''; }
  if (/(?:customer|activity)_(?:create|edit)_open$/.test(kind)) { return available.form ? 'form' : ''; }
  if (kind === 'push_wait') {
    if (/verify/.test(operation)) { return available.verify ? 'verify' : 'write'; }
    return available.write ? 'write' : '';
  }
  if (phase === 'pull_customer') { return available.customer ? 'customer' : ''; }
  if (phase === 'pull_activity') { return available.activity ? 'activity' : ''; }
  if (phase === 'reconcile' || phase === 'conflict') { return available.reconcile ? 'reconcile' : ''; }
  if (phase === 'push') { return available.record ? 'record' : ''; }
  if (phase === 'checking_session') { return available.login && kind === 'login' ? 'login' : 'session'; }
  return '';
};
/** DTO tiến độ chỉ dùng để vẽ; marker hoàn tất luôn xuất phát từ state GAS cùng lượt. */
FbmSync.pipelineView = function (state) {
  var value = state || {}, phase = String(value.phase || 'idle'), definition = FbmSync.pipelineDefinition(value), current = FbmSync.pipelineCurrentStep(value, definition), currentIndex = -1;
  (definition.steps || []).forEach(function (step, index) { if (step.id === current) { currentIndex = index; } });
  var title = phase === 'idle' ? 'Pipeline sẽ chạy' : phase === 'done' ? 'Pipeline đã hoàn tất' : phase === 'error' ? 'Pipeline dừng vì lỗi' : phase === 'paused' ? 'Pipeline đã tạm dừng' : phase === 'conflict' ? 'Pipeline dừng để xử lý xung đột' : 'Pipeline đang chạy';
  return {
    kind: definition.kind,
    title: title,
    steps: (definition.steps || []).map(function (step, index) {
      var stepState = phase === 'done' ? 'done' : index < currentIndex ? 'done' : index === currentIndex ? (phase === 'error' || phase === 'conflict' ? 'error' : phase === 'paused' ? 'paused' : 'current') : 'pending';
      return { id: step.id, label: step.label, state: stepState };
    })
  };
};
/** Chữ Sidebar hiện khi status thấy lượt đã chết mà chưa ai thu hồi; status không ghi nên chỉ báo lần bấm kế sẽ đóng nó. */
FbmSync.STUCK_STATUS_MESSAGE = 'Lượt đồng bộ đang kẹt: không còn request nào chờ FBM trả lời trong hạn (Extension đã tắt, máy tắt hoặc mất mạng). Bấm Đồng bộ để đóng lượt này và chạy lại.';
FbmSync.SCOPE_NOTICE_TEXT = { on: 'Phạm vi đang giới hạn, chỉ chạy cho khách chỉ định: ', empty: 'Phạm vi đang giới hạn nhưng danh sách khách chỉ định trống nên lượt đồng bộ sẽ bị chặn. Vào Cài đặt phiên để thêm mã hoặc bỏ giới hạn.' };
/** Người đọc của status: mọi lần đọc kho cho màn đồng bộ nằm ở đây; `statusViewBuild` dựng từ đúng bản đọc này. */
FbmSync.statusInputRead = function () {
  return {
    state: FbmSync.stateRead(), now: Date.now(),
    enabled: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'),
    background: settingsValue(FbmSync.SETTING_SECTIONS.background, 'enabled'),
    run: settingsValues(FbmSync.SETTING_SECTIONS.run),
    silentMinutes: FbmSync.machineSilentMinutes(settingsValues(FbmSync.SETTING_SECTIONS.extension)),
    failures: FbmSync.pushFailuresRead(), preview: FbmSync.previewRead(), trace: FbmSync.traceRead(20),
    // Tập chờ duyệt đọc từ cổng chặng đẩy, không suy từ phase; cổng hỏng thì ném như mọi kho hỏng.
    gate: FbmSync.pushGateRead(), stopFlag: FbmSync.stopFlagRead(), machine: FbmSync.backgroundMachineRead(),
    login: FbmSync.credentialPublicView(), binding: FbmSync.bindingRead()
  };
};
/** Status cho Sidebar; chỉ cửa lệnh (`ControlPort.js`) gọi, mỗi kết quả một lần. */
FbmSync.statusView = function () { return FbmSync.statusViewBuild(FbmSync.statusInputRead()); };
/** `tone` của đèn trạng thái trên icon đồng bộ: một chỗ quyết cho status đầy đủ và bản nhẹ lúc mở Sidebar. Lượt kẹt là lỗi vì không còn ai chở lượt thì không có tin nào làm icon thôi xoay. */
FbmSync.toneOf = function (state, enabled, now) {
  var phase = String(state.phase || 'idle');
  if (enabled !== true) { return 'off'; }
  if (FbmSync.staleRunCheck(state, now)) { return 'error'; }
  if (FbmSync.ACTIVE_PHASES.indexOf(phase) >= 0) { return 'running'; }
  return phase === 'paused' || phase === 'conflict' ? 'paused' : phase === 'error' ? 'error' : 'idle';
};
/** Bản nhẹ lúc mở Sidebar: chỉ `tone` và `updatedAt` để Sidebar bỏ được bản cũ hơn tin relay về trước. Kho state hỏng thì `tone` lỗi và một dòng Log như `statusReadSafe`, không làm hỏng lượt nạp lõi. */
FbmSync.toneView = function () {
  try {
    var state = FbmSync.stateRead();
    return { tone: FbmSync.toneOf(state, settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled') === true, Date.now()), updatedAt: Number(state.updatedAt || 0) };
  } catch (error) {
    if (!FbmSync.stateStorageError(error)) { throw error; }
    FbmSync.storageFailureLog(error, FbmSync.stateStuckView(error));
    return { tone: 'error', updatedAt: 0 };
  }
};
var CORE_LOAD_PROVIDERS = typeof CORE_LOAD_PROVIDERS !== 'undefined' ? CORE_LOAD_PROVIDERS : {};
CORE_LOAD_PROVIDERS.fbm_sync = function () { return { tone: FbmSync.toneView() }; };
/** Username so được: có chữ và không phải bản che dấu `*`. */
FbmSync.usernameComparable = function (value) { var text = String(value || '').trim(); return !!text && text.indexOf('*') < 0; };
/** Kết quả kiểm liên kết thành câu cho màn Tài khoản; chỉ có khi lượt là kiểm liên kết. `lines` là các mã FBM chưa thấy (đã cắt ở `identityCheckFinish`), Sidebar vẽ nguyên dưới câu chính, không tự ghép câu từ số liệu thô. */
FbmSync.identityResultView = function (state, running) {
  if (String(state.scan || '') !== 'identity_check') { return null; }
  if (running) { return { tone: 'pending', text: 'Đang kiểm tra liên kết Customer với FBM...', lines: [] }; }
  var result = state.metadata && state.metadata.identityCheck;
  if (String(state.phase || '') !== 'done' || !result) { return { tone: 'error', text: 'Kiểm tra liên kết không thành công: ' + String(state.lastError || state.message || 'lượt dừng trước khi có kết quả.'), lines: [] }; }
  var total = Math.max(0, Number(result.total || 0)), matched = Math.max(0, Number(result.matched || 0)), missing = Math.max(0, Number(result.missing || 0));
  var lines = (result.missingSample || []).map(function (item) { return 'Chưa thấy FBM ID ' + String(item.fbmId || '') + ' · ' + String(item.code || item.id || ''); });
  return { tone: missing ? 'warning' : 'success', text: total ? 'Kiểm tra liên kết hoàn tất: ' + matched + '/' + total + ' Customer hợp lệ' + (missing ? '; không tìm thấy: ' + missing + '.' : '.') : 'Kiểm tra liên kết hoàn tất: chưa có Customer nào mang FBM_ID để đối chiếu.', lines: lines };
};
/**
 * Dựng status cho Sidebar từ dữ liệu đã đọc; thuần (không đọc kho, không đọc đồng hồ). Mọi quyết định hiển thị nằm ở đây: Sidebar đọc `tone`, `actions`, `progress`, `pipeline.visible`… chứ không chép danh sách phase hay suy từ cursor.
 * `actions.run`: `start`; `cancel` (lượt tay đang chạy); `stopping` / `stoppingBackground` (lượt tay / lượt nền đã có cờ dừng, chờ lát kế đóng). `actions.busy`: lượt tay đang chạy, mọi nút sửa và chạy khác khóa theo nó.
 * Lượt chết chưa ai thu hồi chỉ được báo (`stuck`, `warnings`), không ghi; lần `start` hoặc nhịp nền kế đóng nó.
 */
FbmSync.statusViewBuild = function (input) {
  var state = input.state, now = input.now, enabled = input.enabled === true, background = input.background === true, phase = String(state.phase || 'idle'), origin = String(state.origin || 'manual');
  var running = FbmSync.ACTIVE_PHASES.indexOf(phase) >= 0, manual = running && origin !== 'background';
  var stopping = FbmSync.stopFlagFor(state, input.stopFlag), stale = FbmSync.staleRunCheck(state, now);
  var gate = input.gate, pendingApproval = gate && gate.status === 'pending' ? { count: Number(gate.count || 0), fingerprint: String(gate.fingerprint || '') } : null;
  var metadata = FbmSync.statusMetadata(state.metadata, input.failures);
  metadata.preview = input.preview;
  if (input.trace !== undefined) { metadata.traceTail = input.trace; }
  var progress = state.progress || {}, total = Math.max(0, Number(progress.total || 0)), done = Math.min(total, Math.max(0, Number(progress.done || 0)));
  var cursor = state.cursor || {}, run = input.run || {}, login = input.login || {}, hint = String(login.public && login.public.usernameHint || '').trim(), bound = String(input.binding && input.binding.username || '').trim();
  var blocks = Array.isArray(state.metadata && state.metadata.identityBlocks) ? state.metadata.identityBlocks : [];
  var pipeline = FbmSync.pipelineView(state);
  pipeline.visible = true;
  return {
    ok: true, enabled: enabled, backgroundEnabled: background, running: running,
    tone: FbmSync.toneOf(state, enabled, now),
    actions: { run: stopping ? (origin === 'background' ? 'stoppingBackground' : 'stopping') : manual ? 'cancel' : 'start', runDisabled: !enabled || stopping, busy: manual, reset: false, forceLogin: state.loginForceOffered === true && !running, approve: !!pendingApproval && !running },
    progress: { active: running, total: total, done: done, determinate: total > 0, percent: total > 0 ? Math.min(100, Math.round(done * 100 / total)) : 0, waiting: running && String(cursor.kind || '') === 'push_wait' },
    pendingApproval: pendingApproval,
    stuck: !!stale, stuckCode: stale ? stale.code : '',
    warnings: stale ? [{ code: stale.code, level: 'warning', text: FbmSync.STUCK_STATUS_MESSAGE }] : [],
    issues: blocks.slice(0, 20).map(function (block) { return { code: 'IDENTITY_BLOCKED', level: 'warning', text: 'Khách FBM ' + String(block.fbmCustomerCode || '') + ' bị chặn khi kéo về: ' + String(block.reason || '') }; }),
    scopeNotice: run.scopeLimited === false || !Array.isArray(run.scopeCodes) ? null : { level: 'warning', text: run.scopeCodes.length ? FbmSync.SCOPE_NOTICE_TEXT.on + run.scopeCodes.join(', ') + '.' : FbmSync.SCOPE_NOTICE_TEXT.empty },
    usernameDisplay: { text: hint, unavailable: login.configured === true && !FbmSync.usernameComparable(hint) },
    usernameMismatch: FbmSync.usernameComparable(bound) && FbmSync.usernameComparable(hint) && bound !== hint,
    identityResult: FbmSync.identityResultView(state, running),
    runId: state.runId, follows: String(state.follows || ''), origin: origin, mode: state.mode, canPush: FbmSync.canWriteFbm(state.mode), scan: state.scan || 'full', scanPack: state.scanPack || '', scanLabel: state.scan === 'keepalive' ? FbmSync.KEEPALIVE_SCAN_LABEL : '', process: String(state.process || ''),
    backgroundMachine: FbmSync.machineView(input.machine, now, input.silentMinutes, enabled && background), login: login,
    phase: state.phase, label: FbmSync.statusLabel(state.phase), direction: FbmSync.syncDirection(state), entity: state.entity, entityLabel: FbmSync.syncEntityLabel(state.entity, state.phase), pipeline: pipeline,
    session: { customer: FbmSync.sessionAuthorized(state, 'customer'), activity: FbmSync.sessionAuthorized(state, 'activity'), expired: state.session.expired === true, lastHeartbeatAt: Number(state.session.lastHeartbeatAt || 0) },
    metadata: metadata, counts: state.counts, current: state.current, message: state.message, startedAt: state.startedAt, updatedAt: state.updatedAt, nextRunAt: state.nextRunAt, lastError: state.lastError, lastFailureCode: state.lastFailureCode || '', retryable: state.retryable === true,
    awaitingPickup: FbmSync.pickupHeld(state) && now < Number(state.deadlineAt || 0)
  };
};

/** Snapshot thay cho status khi kho state hỏng: lý do kèm cờ mở nút đặt lại. Không ghi Log: cửa lệnh gặp lỗi kho ghi (`storageFailureLog`). */
FbmSync.stateStuckView = function (error) {
  var reason = String(error && error.message || error || '');
  return { ok: false, code: 'SYNC_STATE_STUCK', failureCode: String(error && error.code || ''), running: false, tone: 'error', actions: { run: 'start', runDisabled: true, busy: false, reset: true, forceLogin: false, approve: false }, progress: { active: false, total: 0, done: 0, determinate: false, percent: 0, waiting: false }, pendingApproval: null, warnings: [], issues: [], scopeNotice: null, identityResult: null, pipeline: { kind: '', title: '', steps: [], visible: false }, runId: '', phase: 'error', label: 'Có lỗi', message: 'Màn đồng bộ đang kẹt: ' + reason, lastError: reason, counts: {} };
};
