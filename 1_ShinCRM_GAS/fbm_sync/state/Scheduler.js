/** Lịch nền nghiệp vụ ở GAS: Extension hỏi theo alarm `gas_poll`, GAS chọn tiến trình đến hạn theo mốc lưu trong DocumentProperties (09/02). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.EXTENSION_CONFIG_KEY = 'FBM_SYNC_EXTENSION_CONFIG_V1';
FbmSync.BACKGROUND_SCHEDULE_KEY = 'FBM_SYNC_BACKGROUND_SCHEDULE_V1';
FbmSync.DETAIL_CURSOR_KEY = 'FBM_SYNC_DETAIL_CURSOR_V1';
/**
 * Giờ chạy xong gần nhất của từng tiến trình nền, mỗi tiến trình đúng một khóa. Đến hạn khi giờ hiện tại >= giờ chạy xong + chu kỳ.
 * Chỉ ghi khi tiến trình chạy hết lượt (kể cả khi vài bản ghi lỗi hay xung đột); lượt hỏng giữa chừng không ghi gì nên tiến trình vẫn quá hạn và lần Extension hỏi sau chạy lại — đó là cơ chế tự phục hồi. Chưa từng chạy xong thì đến hạn ngay.
 */
FbmSync.SCHEDULE_DONE_KEYS = { customerFull: 'FBM_SYNC_DONE_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_DONE_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_DONE_DETAIL_SCAN', heartbeat: 'FBM_SYNC_DONE_HEARTBEAT' };
/**
 * Lần thử lại của tiến trình nền vừa lỗi, mỗi tiến trình một khóa `{ failures, retryAt }`: tiến trình chưa tới `retryAt` thì không đến hạn, nên tiến trình khác trong chuỗi (nhất là Giữ phiên đứng cuối) vẫn chạy thay vì bị một tiến trình lỗi liên tục chặn mãi.
 * Khoảng chờ nhân đôi mỗi lần lỗi liền nhau, từ `SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES` tới trần `SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES`; chạy xong thì xóa khóa.
 */
FbmSync.SCHEDULE_RETRY_KEYS = { customerFull: 'FBM_SYNC_RETRY_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_RETRY_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_RETRY_DETAIL_SCAN', heartbeat: 'FBM_SYNC_RETRY_HEARTBEAT' };
/** Cursor Vòng xoay: số CUS của khách cuối cùng đã ghi xong giao dịch (09/02 "Chuỗi trong một lần hỏi" mục 7 và 9); `-1` khi chưa có, phiên bắt đầu từ khách số nhỏ nhất. Giá trị kiểu cũ (khóa trang FBM) không có `cus` nên cũng là `-1`. */
FbmSync.detailCursorRead = function () {
  var parsed = FbmSync.documentPropertyJson(FbmSync.DETAIL_CURSOR_KEY, 'cursor Vòng xoay'), cus = parsed ? Number(parsed.cus) : NaN;
  return isFinite(cus) && cus >= 0 ? Math.floor(cus) : -1;
};
FbmSync.detailCursorWrite = function (cus) {
  FbmSync.props().setProperty(FbmSync.DETAIL_CURSOR_KEY, JSON.stringify({ cus: Math.floor(Number(cus)), at: Date.now() }));
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
      fallback[kind].minutes = isFinite(minutes) ? Math.max(0, Math.min(FbmSync.SCHEDULE_MAX_MINUTES, Math.round(minutes))) : fallback[kind].minutes;
      if (kind === 'detail') {
        var batch = Number(item.customersPerRun);
        fallback.detail.customersPerRun = isFinite(batch) && batch >= 1 ? Math.floor(batch) : fallback.detail.customersPerRun;
      }
    });
  } catch (ignore) {}
  return fallback;
};
/** Trần chu kỳ lịch nền: 7 ngày, tính bằng phút. */
FbmSync.SCHEDULE_MAX_MINUTES = 7 * 24 * 60;
/** Tên tiến trình trong câu báo lỗi và câu xác nhận, đúng nhãn ở `Cài đặt phiên` (09/02 Phần 3). */
FbmSync.SCHEDULE_LABELS = { heartbeat: 'Giữ phiên FBM', customerFull: 'Quét nhanh', activityFull: 'Lấy toàn bộ giao dịch', detail: 'Vòng xoay giao dịch' };
/** Loại quét nền luôn quét đẩy dù dấu lần đẩy sạch còn khớp: lưới an toàn cho sửa Sheet mà trigger không chạy nên sổ nạp lại không tăng (chủ dự án chốt Quét nhanh 2026-10-19). Lượt tay luôn quét. */
FbmSync.PUSH_GATE_BYPASS_SCANS = ['full'];
FbmSync.PUSH_GATE_CLOSED_TRACE = 'Bỏ qua kiểm dữ liệu ShinCRM và chặng đẩy: từ lần đẩy sạch trước không có gì đổi.';
/** Dòng `Mức quét` của lượt Giữ phiên có đẩy; `Chiều chạy` lấy theo chiều lịch nền (chủ dự án chốt 2026-10-20). */
FbmSync.KEEPALIVE_SCAN_LABEL = 'Giữ phiên FBM (chỉ đẩy bản ghi vừa sửa)';
/** Kiểu quét của lượt mà mỗi tiến trình nền mở; Giữ phiên không mở lượt nào. */
FbmSync.SCHEDULE_SCANS = { customerFull: 'full', activityFull: 'activity_bulk', detail: 'detail', heartbeat: 'keepalive' };
/** Số nguyên không âm từ ô người dùng gõ. Ô trống là thiếu, không ngầm thay bằng số nào: `Number('')` bằng 0 nên phải xét chuỗi trước. Trả `{ value }` hoặc `{ reason }`. */
FbmSync.scheduleWholeNumber = function (raw, min, max, label, unit) {
  var text = raw === null || raw === undefined ? '' : String(raw).trim();
  if (text === '') { return { reason: 'Chưa nhập ' + label + '.' }; }
  var n = Number(text);
  if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) { return { reason: label.charAt(0).toUpperCase() + label.slice(1) + ' phải là số nguyên từ ' + min + (max < Infinity ? ' đến ' + max : ' trở lên') + unit + '.' }; }
  return { value: n };
};
/**
 * Lưu lịch nền. Ô sai trả `{ ok: false, invalid: [{ field, reason }] }` (cùng hình dạng cửa ghi bản ghi) để Sidebar tô đỏ đúng ô; `field` là đường dẫn trong lịch, ví dụ `heartbeat.minutes`.
 * Tiến trình khác Giữ phiên đang bật mà chu kỳ dưới `SETTINGS.FBM_SCHEDULE_LOW_MINUTES` thì trả `SCHEDULE_LOW_CONFIRM` kèm câu hỏi, chưa lưu; Sidebar hỏi người dùng rồi gửi lại với `confirmLow: true`.
 */
FbmSync.backgroundScheduleSave = function (input) {
  var current = FbmSync.backgroundScheduleRead(), value = input || {}, saved = {}, invalid = [], low = [];
  var direction = value.direction === undefined ? current.direction : String(value.direction || '');
  if (['read', 'push', 'write'].indexOf(direction) < 0) { throw new Error('Invalid background sync direction.'); }
  var enabled = value.enabled === undefined ? current.enabled !== false : value.enabled === true;
  var lowMinutes = Number(SETTINGS.FBM_SCHEDULE_LOW_MINUTES);
  ['heartbeat', 'customerFull', 'activityFull', 'detail'].forEach(function (kind) {
    var item = value[kind] || {}, label = FbmSync.SCHEDULE_LABELS[kind];
    var minutes = item.minutes === undefined ? { value: current[kind].minutes } : FbmSync.scheduleWholeNumber(item.minutes, 0, FbmSync.SCHEDULE_MAX_MINUTES, 'chu kỳ ' + label, ' phút');
    if (minutes.reason) { invalid.push({ field: kind + '.minutes', reason: minutes.reason }); }
    saved[kind] = { enabled: item.enabled === undefined ? current[kind].enabled : item.enabled === true, minutes: minutes.value, priority: current[kind].priority };
    if (!minutes.reason && kind !== 'heartbeat' && saved[kind].enabled && minutes.value < lowMinutes) { low.push(label + ' ' + minutes.value + ' phút'); }
    if (kind === 'detail') {
      var batch = item.customersPerRun === undefined ? { value: current.detail.customersPerRun } : FbmSync.scheduleWholeNumber(item.customersPerRun, 1, Infinity, 'số khách mỗi lượt vòng xoay', '');
      if (batch.reason) { invalid.push({ field: 'detail.customersPerRun', reason: batch.reason }); }
      saved.detail.customersPerRun = batch.value;
    }
  });
  if (invalid.length) { return { ok: false, code: 'SCHEDULE_INVALID', invalid: invalid, message: 'Chưa lưu lịch đồng bộ nền.' }; }
  if (low.length && value.confirmLow !== true) {
    return { ok: false, code: 'SCHEDULE_LOW_CONFIRM', message: 'Chu kỳ dưới ' + lowMinutes + ' phút sẽ chạy dày, tốn hạn mức FBM và GAS: ' + low.join(', ') + '. Vẫn lưu?' };
  }
  saved.enabled = enabled; saved.direction = direction;
  FbmSync.props().setProperty(FbmSync.BACKGROUND_SCHEDULE_KEY, JSON.stringify(saved));
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
/** Giờ đến hạn của một tiến trình; `0` là chưa từng chạy xong nên đến hạn ngay. Tiến trình đang chờ thử lại sau lỗi thì đến hạn muộn nhất là giờ thử lại. Đọc chu kỳ hiện hành nên đổi chu kỳ là có hiệu lực ngay, không cần đặt lại mốc. */
FbmSync.scheduleDueAt = function (kind, schedule, props) {
  var done = Number((props || FbmSync.props()).getProperty(FbmSync.SCHEDULE_DONE_KEYS[kind]) || 0);
  var dueAt = done ? done + (schedule || FbmSync.backgroundScheduleRead())[kind].minutes * 60 * 1000 : 0;
  return Math.max(dueAt, FbmSync.scheduleRetryRead(kind).retryAt);
};
FbmSync.scheduleRetryRead = function (kind) {
  var saved = FbmSync.documentPropertyJson(FbmSync.SCHEDULE_RETRY_KEYS[kind], 'lần thử lại của ' + FbmSync.SCHEDULE_LABELS[kind]) || {};
  return { failures: Math.max(0, Math.floor(Number(saved.failures) || 0)), retryAt: Math.max(0, Number(saved.retryAt) || 0) };
};
/** Tiến trình bật và đã đến hạn, chưa chạy trong chuỗi này, theo ưu tiên: Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay, cuối cùng Giữ phiên. */
FbmSync.scheduleDueKinds = function (now, ran) {
  var props = FbmSync.props(), schedule = FbmSync.backgroundScheduleRead(), skip = ran || [];
  return Object.keys(FbmSync.SCHEDULE_DONE_KEYS).filter(function (kind) {
    return schedule[kind].enabled && skip.indexOf(kind) < 0 && FbmSync.scheduleDueAt(kind, schedule, props) <= now;
  }).sort(function (a, b) { return schedule[a].priority - schedule[b].priority; });
};
/** Tiến trình vừa chạy hết lượt: ghi giờ chạy xong và bỏ lần thử lại sau lỗi. Chỉ đường kết thúc thành công gọi hàm này. */
FbmSync.scheduleMarkDone = function (kind, now) {
  var at = Number(now || Date.now()), props = FbmSync.props();
  props.setProperty(FbmSync.SCHEDULE_DONE_KEYS[kind], String(at));
  if (props.getProperty(FbmSync.SCHEDULE_RETRY_KEYS[kind])) { props.deleteProperty(FbmSync.SCHEDULE_RETRY_KEYS[kind]); }
  return at;
};
/** Tiến trình nền kết thúc lỗi hoặc tạm dừng: dời giờ thử lại của riêng nó và ghi Log; không ghi giờ chạy xong, nên thử lại tới hạn là chạy lại. */
FbmSync.scheduleMarkFailed = function (kind, now, code) {
  var at = Number(now || Date.now()), failures = FbmSync.scheduleRetryRead(kind).failures + 1;
  var base = Number(SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES), cap = Number(SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES);
  var minutes = Math.min(cap, base * Math.pow(2, Math.min(failures - 1, 30)));
  FbmSync.props().setProperty(FbmSync.SCHEDULE_RETRY_KEYS[kind], JSON.stringify({ failures: failures, retryAt: at + minutes * 60 * 1000 }));
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'schedule_retry_later', outcome: typeof LOG_WARN === 'undefined' ? 'warn' : LOG_WARN, reason: FbmSync.SCHEDULE_LABELS[kind] + ' chạy nền không xong' + (code ? ' (mã ' + code + ')' : '') + ', lỗi liền ' + failures + ' lần; thử lại sau ' + minutes + ' phút, các tiến trình khác vẫn chạy theo lịch.', detail: { kind: kind, failures: failures, retryMinutes: minutes } });
  }
  return { failures: failures, minutes: minutes };
};
/** Dòng vết của lịch nền: chỉ ra Sheet `Log` khi `LOG_TRACE` phủ `fbm_sync`, để biết mỗi lần Extension hỏi GAS đã quyết gì. */
FbmSync.scheduleTrace = function (action, reason, detail) {
  if (typeof logTrace === 'function') { logTrace({ source: 'fbm_sync', action: action, outcome: 'trace', reason: reason, detail: detail || {} }); }
};
/** Câu "sớm nhất là X, còn N phút" cho dòng vết lần hỏi chưa có việc. */
FbmSync.scheduleNextText = function (now) {
  var props = FbmSync.props(), schedule = FbmSync.backgroundScheduleRead(), best = '', bestAt = 0;
  Object.keys(FbmSync.SCHEDULE_DONE_KEYS).forEach(function (kind) {
    var at = FbmSync.scheduleDueAt(kind, schedule, props);
    if (schedule[kind].enabled && (!best || at < bestAt)) { best = kind; bestAt = at; }
  });
  return best ? 'sớm nhất là ' + FbmSync.SCHEDULE_LABELS[best] + ', còn ' + Math.max(0, Math.ceil((bestAt - now) / 60000)) + ' phút' : 'không có tiến trình nào đang bật';
};
FbmSync.scheduleNextAt = function () {
  var props = FbmSync.props(), schedule = FbmSync.backgroundScheduleRead();
  var times = Object.keys(FbmSync.SCHEDULE_DONE_KEYS).filter(function (kind) { return schedule[kind].enabled; }).map(function (kind) { return FbmSync.scheduleDueAt(kind, schedule, props); });
  return times.length ? Math.min.apply(null, times) : 0;
};
/**
 * Mở chuỗi nền của lần hỏi này: chọn tiến trình đến hạn đầu tiên, chưa ghi giờ chạy xong nào (chỉ ghi khi tiến trình chạy hết lượt).
 * Chuỗi nằm trong state (`chain`) để lượt chuyền bị cắt lát thì lần hỏi sau chạy tiếp. Chuỗi còn sót mà không còn lượt nào chạy là chuỗi đã gãy (lỗi, lượt tay chen ngang) nên bị thay bằng chuỗi mới; tiến trình dở chạy lại vì chưa có giờ chạy xong mới.
 */
FbmSync.schedulerPickDue = function (now, options) {
  var at = Number(now || Date.now()), opt = options || {}, schedule = FbmSync.backgroundScheduleRead(), state = FbmSync.stateRead();
  if (!FbmSync.masterEnabled() || schedule.enabled === false) { return { ok: false, code: 'BACKGROUND_DISABLED' }; }
  if (FbmSync.runInProgress(state)) {
    FbmSync.scheduleTrace('schedule_skip', 'Extension hỏi lịch nền: đang có lượt chạy, không mở thêm.', { phase: String(state.phase || '') });
    return { ok: false, code: 'SYNC_ALREADY_RUNNING' };
  }
  // Chuỗi còn sót mà lượt nền của tiến trình đang chạy dở đã kết thúc lỗi hay tạm dừng (kể cả bị bỏ dở rồi thu hồi): tiến trình đó lỗi, dời lần thử lại của riêng nó để lần hỏi này chạy các tiến trình khác. Lượt tay chen ngang không phải lỗi của tiến trình nền nên chỉ bỏ chuỗi.
  if (state.chain && state.chain.current && state.chain.current !== state.scheduledScan) {
    if (state.origin === 'background' && ['error', 'paused'].indexOf(String(state.phase || '')) >= 0) { FbmSync.scheduleMarkFailed(state.chain.current, at, state.lastFailureCode); }
    state.chain = null; FbmSync.stateWrite(state);
  }
  if (state.scheduledScan) { return { ok: true, kind: String(state.scheduledScan), existing: true }; }
  var due = FbmSync.scheduleDueKinds(at, []);
  // Mở Chrome là tùy chọn người dùng thấy được: được một lần Giữ phiên ngay, không sinh loạt việc bù.
  if (!due.length && opt.startup === true && FbmSync.extensionConfigRead().runOnStartup !== false && schedule.heartbeat.enabled) { due = ['heartbeat']; }
  if (!due.length) {
    FbmSync.scheduleTrace('schedule_idle', 'Extension hỏi lịch nền: chưa có tiến trình đến hạn; ' + FbmSync.scheduleNextText(at) + '.');
    if (state.chain) { state.chain = null; FbmSync.stateWrite(state); }
    return { ok: false, code: 'NO_PROCESS_DUE' };
  }
  state.scheduledScan = due[0];
  state.scheduledDirection = schedule.direction;
  state.chain = { current: due[0], ran: [], direction: schedule.direction, startedAt: at };
  state.message = 'Đã chọn tiến trình nền ' + due[0] + '.';
  FbmSync.stateWrite(state);
  return { ok: true, kind: due[0] };
};
/** Mở một tiến trình của chuỗi. Giữ phiên do `keepaliveStart` quyết; các tiến trình khác là một lượt nền thường, tự kết thúc bằng bước đếm. */
FbmSync.chainStart = function (kind) {
  var state = FbmSync.stateRead(), schedule = FbmSync.backgroundScheduleRead(), direction = state.chain && state.chain.direction || schedule.direction;
  state.chain = Object.assign({ ran: [], direction: direction }, state.chain || {}, { current: kind });
  state.scheduledScan = '';
  if (kind === 'heartbeat') {
    FbmSync.stateWrite(state);
    return FbmSync.keepaliveStart(direction);
  }
  FbmSync.stateWrite(state);
  var options = { mode: direction, scan: FbmSync.SCHEDULE_SCANS[kind] || 'full', origin: 'background' };
  if (kind === 'detail') { options.detail = schedule.detail; }
  return FbmSync.start(options);
};
/**
 * Nơi duy nhất quyết thân của Giữ phiên, cho cả hai đường cấp (`chainStart` và `fbmSyncHeartbeatRequest`). Chiều lịch nền có ghi FBM và cổng chặng đẩy mở thì mở lượt Chỉ đẩy nền `keepalive`: request đầu của lượt là bước kiểm phiên nên vẫn giữ phiên, cuối lượt đếm khách theo chiều lịch nền. Còn lại (cổng đóng, chiều Lấy) phát request đếm như cũ.
 * Cổng quyết ở đây được chuyển vào lượt nên bước kiểm dữ liệu ShinCRM không quyết lại.
 */
FbmSync.keepaliveStart = function (direction) {
  var state = FbmSync.stateRead();
  if (FbmSync.canWriteFbm(direction)) {
    var options = { mode: 'push', scan: 'keepalive', origin: 'background', scheduleMode: direction };
    var gate = FbmSync.pushGateCheck(state, options);
    if (gate.open) { return FbmSync.start(Object.assign(options, { pushGate: gate })); }
    state = FbmSync.stateRead();
  }
  state.scheduledScan = 'heartbeat'; state.scheduledDirection = direction; state.cursor = { kind: 'heartbeat' };
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.cursorStartEnvelope(state), status: FbmSync.statusView() };
};
/**
 * Tiến trình hiện tại của chuỗi vừa chạy xong: ghi giờ chạy xong của nó rồi mở tiến trình đến hạn kế tiếp chưa chạy trong chuỗi.
 * Mỗi tiến trình theo lịch chạy tối đa một lần mỗi chuỗi nên chuỗi luôn dừng dù chu kỳ ngắn hơn thời gian chạy; Quét nhanh do bước đếm gọi nằm trong lượt của tiến trình đang chạy nên không tính.
 */
FbmSync.chainAdvance = function () {
  for (var guard = 0; guard <= Object.keys(FbmSync.SCHEDULE_DONE_KEYS).length; guard += 1) {
    var state = FbmSync.stateRead(), chain = state.chain, at = Date.now();
    if (!chain || !chain.current) { return null; }
    FbmSync.scheduleMarkDone(chain.current, at);
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
  if (state.origin !== 'background' || !state.chain || !state.chain.current) { return result; }
  // Lượt dừng ở xung đột đã chạy hết phần đọc, chỉ chờ người dùng chọn: tính là chạy xong để lần hỏi sau không chạy lại liên tục; chuỗi dừng tới khi xung đột được xử lý.
  if (state.phase === 'conflict') {
    FbmSync.scheduleMarkDone(state.chain.current, Date.now());
    state.chain = null; state.scheduledScan = ''; state.nextRunAt = FbmSync.scheduleNextAt(); FbmSync.stateWrite(state);
    return result;
  }
  if (state.phase !== 'done') { return result; }
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
  FbmSync.requestWatchTrail(opt.extensionTrail);
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!documentStoreTryLock(lock, waitMs)) { return fbmSyncLockResult('BUSY', 'GAS đang bận; chưa cấp request heartbeat mới.'); }
  try {
    var state = FbmSync.stateRead(), session = state.session || {}, cursor = state.cursor || {}, now = Date.now();
    var activePhase = FbmSync.ACTIVE_PHASES && FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0;
    if (state.activeRequestId && now < Number(state.deadlineAt || 0)) {
      return fbmSyncLockResult('REQUEST_IN_FLIGHT', 'Đã có request FBM đang chờ response; không cấp request heartbeat chồng.');
    }
    // Lượt dở không còn request nào chờ trong hạn (Extension bị tắt giữa chừng, response mất): kết thúc có Log rồi mở lượt mới, không gửi lại request của lượt cũ (09/02 Phần 3 "Mỗi lần hỏi nền là một lượt mới").
    if (state.runId && activePhase) { FbmSync.recoverStaleRun(state, now, { abandoned: true }); }
    // Chọn tiến trình đến hạn trước, để nhịp hỏi kỹ thuật không tự mở việc mỗi lần.
    var picked = FbmSync.schedulerPickDue(now, { startup: source === 'startup' });
    if (!picked.ok) {
      return { ok: true, noop: true, code: picked.code || 'NO_PROCESS_DUE', request: null, status: FbmSync.statusView() };
    }
    // Đọc lại sau khi chọn: ghi bản đọc trước đó sẽ xóa mất tiến trình vừa chọn và lịch nền không bao giờ khởi động.
    state = FbmSync.stateRead();
    state.cursor = { kind: 'heartbeat' };
    // Dấu "phiên hết hạn" của lượt đã kết thúc không còn đáng tin: bỏ dấu, response của request đếm khách quyết định phiên sống hay chết (09/06).
    if (!FbmSync.runInProgress(state)) { FbmSync.sessionGateForgetStale(state); }
    FbmSync.stateWrite(state);
    // Chuỗi mở bằng chính request đầu của tiến trình đến hạn, kể cả Giữ phiên (`keepaliveStart` quyết đếm hay đẩy); chỉ Quét nhanh do bước đếm gọi còn mở bằng request đếm khách ở dưới.
    if (state.chain && state.scheduledScan && state.scheduledScan === state.chain.current) {
      var opened = FbmSync.chainTail(FbmSync.chainStart(state.scheduledScan)), openedRequest = opened && opened.request || null, openedState = FbmSync.stateRead();
      if (!openedRequest) { return { ok: !!(opened && opened.ok), code: opened && opened.code || 'CHAIN_START_EMPTY', request: null, status: FbmSync.statusView(), error: opened && opened.error }; }
      var openedEnvelope = openedRequest.protocol ? openedRequest : FbmSync.nextEnvelope(openedRequest);
      var openedCode = openedState.scheduledScan === 'heartbeat' && typeof FbmSync.sessionGateRequestCode === 'function' ? FbmSync.sessionGateRequestCode(openedEnvelope, openedState) : 'CHAIN_REQUEST_READY';
      return { ok: true, code: openedCode, request: openedEnvelope, status: FbmSync.statusView() };
    }
    var heartbeatEnvelope = FbmSync.cursorStartEnvelope(state), currentState = FbmSync.stateRead();
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
  if (!FbmSync.requestAnswered(state, responseRequestId)) {
    FbmSync.logStaleResponse(state, responseRequestId, 'heartbeat_stale_response');
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
  FbmSync.scheduleTrace('heartbeat_ok', 'Giữ phiên FBM OK, FBM báo ' + countTotal + ' khách' + (state.scheduledScan === 'recount' ? '; số khách lệch nên chạy Quét nhanh.' : '.'), { customers: countTotal });
  state.cursor = {};
  FbmSync.stateWrite(state);
  state = FbmSync.stateRead();
  if (result.ok && FbmSync.runInProgress(state) && !(state.metadata && state.metadata.manualPending)) {
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
    if (!FbmSync.requestAnswered(state, requestId)) {
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
