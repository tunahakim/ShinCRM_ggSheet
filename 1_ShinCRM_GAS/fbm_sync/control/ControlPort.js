/** Cửa lệnh duy nhất của đồng bộ FBM: mọi kênh (Sidebar, relay nền) gửi tên lệnh và payload, cửa này tra bảng lệnh, giữ khóa, gọi người điều phối của lệnh và trả bản công khai. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Bảng lệnh. Lệnh không có trong bảng thì từ chối, không có nhánh "mặc định".
 * `lock`: chạy trong khóa điều phối. Khóa Apps Script không tái nhập nên người điều phối của lệnh không tự lấy khóa.
 * `slice`: chạy trong ranh giới lát `runSlice` (lỗi giữa lát chuyển lượt sang lỗi trước khi nhả khóa).
 * `reply`: lệnh mang kết quả FBM hoặc báo lỗi về; GAS bận mà bỏ thì bên gửi không gửi lại, nên phải ghi Log lúc bỏ.
 * `relay`: Web App relay được gọi lệnh này.
 * `drives`: lệnh mở lượt Extension phải chở; Sidebar gửi kèm mã máy Extension sẽ nhận lượt, thiếu thì từ chối trước khi chạy để không có lượt mở mà không ai nhận được.
 * `guard`: phép chặn chạy trong khóa trước người điều phối và trước ranh giới lát; nhận ô lượt cửa lệnh đọc trong khóa, không tự đọc; trả kết quả là từ chối, không ghi gì.
 */
FbmSync.COMMANDS = {
  start: { lock: true, drives: true, run: function (input) { return FbmSync.commandStart(input); } },
  continue: { lock: true, slice: true, reply: true, relay: true, guard: function (input, state) { return FbmSync.continueGuard(input, state); }, run: function (input) { return FbmSync.commandContinue(input); } },
  heartbeat: { lock: true, relay: true, run: function (input) { return fbmSyncHeartbeatRequest(input); } },
  cancel: { lock: true, run: function () { return fbmSyncCancel(); } },
  stop_background: { lock: true, run: function () { return FbmSync.stopBackground(); } },
  approve_push: { lock: true, slice: true, drives: true, run: function () { return fbmSyncApprovePush(); } },
  open_conflict: { lock: true, drives: true, run: function () { return FbmSync.openConflict(); } },
  confirm_conflict: { lock: true, run: function (input) { return FbmSync.confirmConflict(input.entity, input.id, input.choice, input.merged, input.fbmValues, input.shinValues, input.snapshot); } },
  save_settings: { lock: true, run: function (input) { return FbmSync.commandSaveSettings(input); } },
  set_master: { lock: true, run: function (input) { return FbmSync.setMasterEnabled(input.enabled === true); } },
  set_background: { lock: true, run: function (input) { return FbmSync.setBackgroundEnabled(input.enabled === true); } },
  save_identity_binding: { lock: true, run: function (input) { return FbmSync.bindingWrite(input.binding || {}); } },
  save_credential: { lock: true, run: function (input) { return FbmSync.connectionSave(input); } },
  repair_login_username: { lock: true, run: function (input) { return FbmSync.loginConfigRepairUsername(input); } },
  reset_state: { lock: true, run: function () { return FbmSync.controlResetState(); } },
  retry_push_failures: { lock: true, slice: true, run: function () { return fbmSyncRetryPushFailures(); } },
  client_error: { lock: true, reply: true, run: function (input) { FbmSync.traceImport(input.clientTrace); return { ok: true, status: FbmSync.logTransportError(input.message, input.action, input.runId) }; } },
  relay_config: { lock: true, run: function () { return FbmSync.relayConfig(false); } },
  relay_rotate_key: { lock: true, run: function () { return FbmSync.relayConfig(true); } },
  relay_switch_log: { run: function (input) { return FbmSync.relaySwitchDecisionLog(input.decision === 'switch' ? 'switch' : 'keep', input.fromSpreadsheetId); } },
  status: { run: function () { return FbmSync.statusRead(); } },
  trace_read: { run: function () { return { ok: true, trace: FbmSync.traceRead(24) }; } }
};

FbmSync.commandSpec = function (name) {
  if (!Object.prototype.hasOwnProperty.call(FbmSync.COMMANDS, name)) {
    var unknown = new Error('Lệnh đồng bộ FBM "' + name + '" không có trong bảng lệnh của GAS.');
    unknown.code = 'COMMAND_UNKNOWN';
    throw unknown;
  }
  return FbmSync.COMMANDS[name];
};
/** Cửa mở lượt của Sidebar chỉ nhận lệnh có cờ `drives`; lệnh khác đi qua cửa riêng của nó. */
FbmSync.driveCommandName = function (name) {
  if (FbmSync.commandSpec(String(name || '')).drives === true) { return String(name); }
  var rejected = new Error('Lệnh "' + String(name || '') + '" không phải lệnh mở lượt.');
  rejected.code = 'DRIVE_COMMAND_REJECTED';
  throw rejected;
};
FbmSync.relayCommandAllowed = function (name) {
  return Object.prototype.hasOwnProperty.call(FbmSync.COMMANDS, name) && FbmSync.COMMANDS[name].relay === true;
};

/**
 * `channel` do lối vào đặt (`relay` chỉ từ `relayHandle`), không lấy từ payload, nên Sidebar không tự xưng là relay được. Phong bì chỉ rời GAS qua relay: trên kênh Sidebar `nextEnvelope` giữ chỗ nhận lượt và kết quả mang `runId` thay phong bì.
 */
FbmSync.controlDispatch = function (command, payload, channel) {
  var name = String(command || ''), spec = FbmSync.commandSpec(name), via = channel === 'relay' ? 'relay' : 'sidebar', input = Object.assign({}, payload || {}, { source: via }), result;
  if (spec.drives && !String(input.machineId || '')) { return FbmSync.publicResult({ ok: false, code: 'SYNC_MACHINE_ID_REQUIRED', message: 'Sidebar chưa lấy được mã máy của Extension nên chưa mở lượt được; tải lại Sidebar rồi thử lại.' }); }
  var body = function () {
    var refused = spec.guard ? spec.guard(input, FbmSync.stateRead()) : null;
    if (refused) { return refused; }
    return spec.slice ? FbmSync.runSlice(function () { return spec.run(input); }) : spec.run(input);
  };
  var run = function () {
    FbmSync.issueContext = { channel: via, machineId: String(input.machineId || '') };
    try { return body(); } finally { FbmSync.issueContext = null; }
  };
  if (!spec.lock) { return FbmSync.publicResult(FbmSync.channelResult(run(), via)); }
  try {
    result = FbmSync.withOrchestrationLock(run);
  } catch (error) {
    if (!FbmSync.stateStorageError(error)) { throw error; }
    result = FbmSync.storageFailureResult(error);
  }
  if (result && result.code === 'BUSY' && spec.reply) { FbmSync.busyDropLog(name, input); }
  return FbmSync.publicResult(FbmSync.channelResult(result, via));
};
/** Kênh Sidebar: dấu giữ chỗ thành `runId` kèm giãn cách thử lại relay cho Extension; phong bì thật lọt ra kênh Sidebar là lỗi lập trình nên ném. */
FbmSync.channelResult = function (result, via) {
  var request = result && result.request;
  if (via === 'relay' || !request) { return result; }
  if (request.pickup !== true) {
    var leak = new Error('Phong bì FBM sắp ra kênh Sidebar; phong bì chỉ được đi qua relay.');
    leak.code = 'ENVELOPE_CHANNEL_VIOLATION';
    throw leak;
  }
  var out = Object.assign({}, result, { runId: request.runId, relayRetryMs: FbmSync.BUDGET.relayRetryMs.slice() });
  delete out.request;
  return out;
};

/** Kho state hỏng khi đang ghi: trả status "kẹt" kèm lối đặt lại thay vì ném, không thì người dùng không có lối thoát (FBM-044). */
FbmSync.storageFailureResult = function (error) {
  var code = String(error && error.code || ''), status;
  try { status = FbmSync.statusView(); } catch (readError) { status = FbmSync.stateStuckView(readError); return { ok: false, code: status.code, error: status.lastError, status: status }; }
  // Phiên còn đứng ở pha đang chạy nghĩa là cả bản state rút gọn cũng không ghi được: mở lối đặt lại.
  status.resetOffered = FbmSync.ACTIVE_PHASES.indexOf(String(status.phase || '')) >= 0;
  status.ok = false;
  status.phase = 'error';
  status.lastFailureCode = code;
  status.lastError = String(error && error.message || 'Không thể lưu trạng thái phiên vào DocumentProperties.');
  status.message = status.lastError;
  status.retryable = false;
  return { ok: false, code: code, error: status.lastError, status: status };
};

/**
 * Kết quả FBM hoặc báo lỗi mà GAS bận không nhận được thì mất: bên gửi không gửi lại, lượt nằm chờ tới hạn rồi mới bị đóng. Ghi Log ngay lúc bỏ, không thì Log về sau chỉ thấy "lượt bị bỏ dở" mà không biết vì sao.
 */
FbmSync.busyDropLog = function (name, input) {
  var waitSeconds = Math.round((typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000) / 1000);
  logEvent({ source: 'fbm_sync', action: 'busy_reply_dropped', outcome: LOG_ERROR, reason: 'GAS đang bận việc khác quá ' + waitSeconds + ' giây nên không nhận được ' + (name === 'client_error' ? 'lỗi Sidebar báo về: ' + String(input.message || '').slice(0, 200) : 'kết quả FBM vừa gửi về; lượt này sẽ chờ tới hạn rồi bị đóng.'), detail: { command: name, source: String(input.source || ''), hop: Number(input.hop || 0) } });
};

/**
 * Trường được phép ra khỏi GAS ở mức trên cùng của kết quả. Trường lạ là lỗi lập trình (có thể là ô lượt mang cookie lọt ra), nên ném chứ không bỏ im lặng.
 * Bên trong vẫn gỡ khóa của ô phiên theo hình dạng: object có `customerAuthorized` hoặc `activityAuthorized` mất cả ba khóa bí mật (kèm `cookie`). Không gỡ `cookie`/`authorized` ở object khác: body request FBM gửi cho Extension cần chính các khóa đó.
 */
FbmSync.PUBLIC_RESULT_FIELDS = [
  'ok', 'code', 'message', 'error', 'request', 'status', 'statusView', 'resumed', 'pending', 'noop', 'stale', 'empty', 'remaining', 'conflict',
  'binding', 'identityStatus', 'identity', 'login', 'credentialMode', 'settings', 'total', 'reset', 'missing', 'enabled', 'trace',
  'url', 'key', 'spreadsheetId', 'extension', 'masterEnabled', 'backgroundEnabled', 'configured', 'credentialRef', 'public',
  'autoOpenTab', 'retryEnabled', 'retryMinutes', 'lastAttemptAt', 'lastLoginAt', 'nextRetryAt', 'lastError', 'config', 'schedule', 'sessionVerified', 'restarted', 'probing', 'imported', 'marked', 'approvalRequired',
  'runId', 'relayRetryMs'
];
FbmSync.publicResult = function (result) {
  var value = FbmSync.transportValue(result);
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    var shape = new Error('Lệnh đồng bộ FBM trả kết quả không phải object.');
    shape.code = 'PUBLIC_RESULT_INVALID';
    throw shape;
  }
  Object.keys(value).forEach(function (key) {
    if (FbmSync.PUBLIC_RESULT_FIELDS.indexOf(key) >= 0) { return; }
    var leak = new Error('Kết quả lệnh đồng bộ FBM có trường "' + key + '" ngoài danh sách được phép ra khỏi GAS.');
    leak.code = 'PUBLIC_RESULT_FIELD_UNKNOWN';
    throw leak;
  });
  return FbmSync.publicStrip(value);
};
FbmSync.publicStrip = function (value) {
  if (Array.isArray(value)) { return value.map(FbmSync.publicStrip); }
  if (!value || typeof value !== 'object') { return value; }
  var isSession = Object.prototype.hasOwnProperty.call(value, 'customerAuthorized') || Object.prototype.hasOwnProperty.call(value, 'activityAuthorized'), out = {};
  Object.keys(value).forEach(function (key) { if (isSession && ['customerAuthorized', 'activityAuthorized', 'cookie'].indexOf(key) >= 0) { return; } out[key] = FbmSync.publicStrip(value[key]); });
  return out;
};

/**
 * Các loại lượt mà lệnh `start` mở được. Mỗi loại gọi đúng người điều phối của nó; loại lạ thì từ chối.
 * `slice`: chạy trong ranh giới lát. Đăng nhập thử không chạy trong lát: khi lượt khác đang chạy nó từ chối mà không có request, ranh giới lát sẽ hiểu nhầm là lượt đang mở bị bỏ dở và đóng mất lượt của người khác.
 */
FbmSync.START_KINDS = {
  sync: { slice: true, run: function (input) { return FbmSync.start({ mode: input.mode, pack: input.pack, origin: 'manual', manual: true }); } },
  identity_check: { slice: true, run: function (input) { return FbmSync.start({ mode: 'check', scan: 'identity_check', identity: input.identity || null, origin: 'manual', manual: true }); } },
  identity_probe: { slice: true, run: function () { return FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true }); } },
  login_test: { run: function (input) { return FbmSync.loginTestRequest(input.credentialRef, input.identity || null); } },
  login_force: { run: function () { return FbmSync.loginForceRequest(); } }
};
FbmSync.commandStart = function (input) {
  var kind = String(input.kind || '');
  if (!Object.prototype.hasOwnProperty.call(FbmSync.START_KINDS, kind)) {
    var unknown = new Error('Loại lượt "' + kind + '" không có trong danh sách lượt mở được.');
    unknown.code = 'SYNC_START_KIND_UNKNOWN';
    throw unknown;
  }
  FbmSync.traceImport(input.clientTrace);
  var spec = FbmSync.START_KINDS[kind], run = function () { return spec.run(input); };
  var result = spec.slice ? FbmSync.runSlice(run) : run();
  if (kind === 'sync' && result && result.status) { FbmSync.logStatus(result.status, 'start'); }
  return result;
};

/**
 * Nộp kết quả của request đang chờ (`response`) hoặc lỗi không gửi được request (`error` kèm `requestId`). Lượt đọc lại xung đột và lượt nền đi chung cửa này; `FbmSync.continue` theo cursor chọn bộ xử lý.
 * Relay chỉ nộp khi công tắc tổng còn bật: tắt giữa chừng thì không xử lý tiếp, lượt tự đóng khi quá hạn.
 */
FbmSync.commandContinue = function (input) {
  FbmSync.traceImport(input.clientTrace);
  if (!input.response && !input.error) { return FbmSync.envelopePickup(); }
  if (input.error) { return fbmSyncHeartbeatTransportFailure(input.error); }
  if (input.source === 'relay' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', request: null, status: FbmSync.statusView() }; }
  // Lượt nền không ghi dòng Log theo pha: nhịp nền chạy vài phút một lần, ghi mỗi lần đổi pha làm trôi Log thật. Xét theo lượt chứ không theo kênh: lượt tay cũng nộp qua relay.
  var before = FbmSync.statusView(), result = FbmSync.continue(input.response);
  if (before.origin !== 'background' && result && FbmSync.shouldLogStatus(before, result.status)) { FbmSync.logStatus(result.status, 'slice'); }
  return result;
};

/**
 * Chỉ máy đang chở lượt được nộp hay nhận lượt đó: Extension máy khác (Sheet mở ở hai máy) có runId hoặc response cũ vẫn bị chặn trước khi chạm ô lượt. Không có `continue` mang cả response lẫn lỗi rỗng ngoài lần nhận lượt, nên lần nhận sai lượt hoặc nhận lần hai bị từ chối ở đây.
 */
FbmSync.continueGuard = function (input, state) {
  var machineId = String(input.machineId || '');
  if (state.runId && String(state.driverMachineId || '') !== machineId) {
    return { ok: false, code: 'RUN_DRIVER_MISMATCH', message: 'Lượt ' + String(state.runId) + ' đang do máy khác chở; GAS không nhận kết quả từ máy này.', status: FbmSync.statusView() };
  }
  if (input.response || input.error) { return null; }
  if (!input.runId || String(input.runId) !== String(state.runId || '') || String(state.activeRequestId || '') !== FbmSync.PICKUP_PREFIX + String(state.runId || '')) {
    return { ok: false, code: 'RUN_PICKUP_REJECTED', message: 'Lượt ' + String(input.runId || '') + ' không còn chờ Extension nhận (đã được nhận, đã đóng hoặc đã có lượt khác).', status: FbmSync.statusView() };
  }
  return null;
};

/** Mỗi lần lưu chỉ một mục cài đặt; mục lạ thì từ chối. Mục `sync` kèm `master` (true/false) đổi công tắc tổng sau khi lưu cài đặt đạt, để cài đặt sai không đổi được công tắc. */
FbmSync.SETTINGS_SAVERS = {
  sync: function (value) { return FbmSync.syncSettingsSave(value); },
  account: function (value) { return FbmSync.accountSettingsSave(value); },
  extension: function (value) { return FbmSync.extensionConfigSave(value); },
  schedule: function (value) { return FbmSync.backgroundScheduleSave(value); },
  login_policy: function (value) { return FbmSync.loginConfigPolicySave(value); },
  auto_login: function (value) { return FbmSync.loginConfigSetEnabled(value === true); }
};
FbmSync.commandSaveSettings = function (input) {
  var section = String(input.section || '');
  if (!Object.prototype.hasOwnProperty.call(FbmSync.SETTINGS_SAVERS, section)) {
    var unknown = new Error('Mục cài đặt đồng bộ FBM "' + section + '" không có trong danh sách lưu được.');
    unknown.code = 'SETTINGS_SECTION_UNKNOWN';
    throw unknown;
  }
  var saved = FbmSync.SETTINGS_SAVERS[section](input.value === undefined ? {} : input.value);
  if (section !== 'sync') { return saved; }
  if (saved.ok !== false && typeof input.master === 'boolean') {
    var master = FbmSync.setMasterEnabled(input.master);
    if (!master || master.ok === false) { return master; }
  }
  return Object.assign({}, saved, { status: FbmSync.statusView() });
};

/**
 * Gói đọc của màn đồng bộ: trạng thái lượt, liên kết tài khoản, cài đặt và cấu hình đăng nhập trong một lời gọi. Không ghi gì, kể cả khi thấy lượt treo: thu hồi lượt treo là việc của lệnh mở lượt và nhịp nền.
 * Kho state hỏng thì phần trạng thái là bản "kẹt" kèm nút đặt lại, các phần khác vẫn đọc bình thường.
 */
FbmSync.statusRead = function () {
  var status;
  try { status = FbmSync.statusView(); } catch (error) { if (!FbmSync.stateStorageError(error)) { throw error; } status = FbmSync.stateStuckView(error); }
  return { ok: true, status: status, identity: FbmSync.identityStatus({}), settings: FbmSync.settingsView(), login: FbmSync.loginConfigPublic() };
};
FbmSync.settingsView = function () {
  var settings = FbmSync.syncSettingsPublic();
  settings.spreadsheetId = FbmSync.currentSpreadsheetId();
  settings.account = FbmSync.accountSettingsPublic();
  settings.extension = FbmSync.extensionConfigPublic();
  settings.background = FbmSync.backgroundSchedulePublic();
  return settings;
};

/** Đặt lại phiên kẹt rồi trả status mới; bị từ chối thì trả status hiện tại kèm lý do để Sidebar hiện đúng chỗ. */
FbmSync.controlResetState = function () {
  var reset = FbmSync.stateReset(), status = FbmSync.statusView();
  status.message = reset.ok ? 'Đã đặt lại phiên đồng bộ. Bấm "Bắt đầu đồng bộ" để chạy lại từ đầu.' : reset.message;
  return reset.ok ? { ok: true, status: status } : { ok: false, code: reset.code, message: reset.message, status: status };
};
