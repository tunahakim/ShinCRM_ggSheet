/**
 * Chuỗi nền: người điều phối lần hỏi của Extension (lệnh `heartbeat`). Mỗi lần hỏi xét theo thứ tự: lượt tay giữ chỗ cho máy này → máy hỏi có phải máy chạy nền → lượt dở quá hạn → lượt đang sống → tiến trình đến hạn → không có gì.
 * Mọi tiến trình nền, kể cả Giữ phiên, là một Lượt mở qua `runOpen`; ô lượt mang tên tiến trình (`process`) và giờ bắt đầu lần hỏi (`pollAt`), nên lượt đóng ở đường nào thì kết quả của tiến trình cũng ghi vào sổ ở lần hỏi kế hoặc ở đuôi lượt (`backgroundTail`).
 * Kết quả luôn kèm `poll` cho Extension: giữ chuông theo nhịp hay tắt chuông. Máy không chạy nền tắt chuông tới lần mở trình duyệt kế tiếp, trừ khi đang có lượt tay chờ máy đó nhận (chuông là đường nhận lượt khi tin đánh thức từ Sidebar mất).
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Lý do Extension hỏi → việc lần hỏi được làm. `work`: nhận lượt chờ và chạy tiến trình đến hạn; `check`: chỉ nhận lượt chờ và báo máy có phải máy nền (Sidebar đánh thức sau khi mở lượt tay, sau khi lưu cài đặt, Extension vừa cài).
 * Mở trình duyệt chỉ chạy việc khi bật "Hỏi GAS khi mở trình duyệt"; lý do lạ là lỗi lập trình nên ném.
 */
FbmSync.ASK_TRIGGERS = { alarm: 'work', startup: 'startup', run_now: 'check', config: 'check', install: 'check' };
FbmSync.askPurpose = function (trigger, runOnStartup) {
  var key = String(trigger || '');
  if (!Object.prototype.hasOwnProperty.call(FbmSync.ASK_TRIGGERS, key)) { var unknown = new Error('Extension hỏi GAS với lý do "' + key + '" không có trong ASK_TRIGGERS.'); unknown.code = 'ASK_TRIGGER_UNKNOWN'; throw unknown; }
  var purpose = FbmSync.ASK_TRIGGERS[key];
  return purpose === 'startup' ? (runOnStartup ? 'startup' : 'check') : purpose;
};

/**
 * Kết quả lượt nền vừa đóng với tiến trình của nó: `done` (xong, kể cả dừng ở xung đột vì phần đọc đã chạy hết), `failed` (lỗi, hoặc tạm dừng có mã), `dropped` (dừng không phải lỗi: người dùng dừng lượt nền để chạy lượt tay, tiến trình chạy lại ở lần hỏi sau). Lượt còn chạy hoặc không phải lượt nền của tiến trình nào thì `''`.
 */
FbmSync.processOutcome = function (state) {
  if (!state || state.origin !== 'background' || !state.process || FbmSync.runInProgress(state)) { return ''; }
  var phase = String(state.phase || '');
  if (phase === 'done' || phase === 'conflict') { return 'done'; }
  if (phase === 'error') { return 'failed'; }
  if (phase === 'paused') { return state.lastFailureCode ? 'failed' : 'dropped'; }
  return '';
};

/** Ghi kết quả tiến trình của lượt nền đã đóng vào sổ (một lần: xong thì bỏ `process` khỏi ô lượt), dời lần thử lại khi lỗi, ghi giờ đến hạn kế. Trả ô lượt đã ghi; chưa có gì để ghi thì trả nguyên ô lượt. */
FbmSync.backgroundSettle = function (state, now) {
  var outcome = FbmSync.processOutcome(state);
  if (!outcome) { return state; }
  var kind = String(state.process), schedule = FbmSync.scheduleShape(settingsValues(FbmSync.SETTING_SECTIONS.background));
  if (outcome !== 'dropped') {
    var mark = FbmSync.processBookMark(kind, outcome, now, FbmSync.processBookRead());
    if (outcome === 'failed') {
      logEvent({ source: 'fbm_sync', action: 'schedule_retry_later', outcome: LOG_WARN, cycleId: String(state.runId || ''), reason: FbmSync.SCHEDULE_LABELS[kind] + ' chạy nền không xong' + (state.lastFailureCode ? ' (mã ' + state.lastFailureCode + ')' : '') + ', lỗi liền ' + mark.failures + ' lần; thử lại sau ' + mark.minutes + ' phút, các tiến trình khác vẫn chạy theo lịch.', detail: { kind: kind, failures: mark.failures, retryMinutes: mark.minutes } });
    }
  }
  state.process = '';
  state.nextRunAt = FbmSync.scheduleNextAt(schedule, FbmSync.processBookRead());
  return FbmSync.stateWrite(state);
};

/** Cổng chặng đẩy cho Giữ phiên: chiều lịch nền có ghi FBM và từ lần đẩy sạch trước có dữ liệu đổi thì trả cổng mở để Giữ phiên đẩy bản ghi vừa sửa; không thì `null` (Giữ phiên chỉ đếm khách). */
FbmSync.pushGateDue = function (state, direction) {
  if (!FbmSync.canWriteFbm(direction)) { return null; }
  var gate = FbmSync.pushGateCheck(state, { origin: 'background', mode: 'push', scan: 'keepalive' });
  return gate.open ? gate : null;
};

/**
 * Giữ phiên chỉ đếm khách: một lượt nền đi thẳng tới bước đếm (request đầu là bước hỏi thử phiên của Cổng phiên, nên phiên FBM vẫn được giữ). Số khách lệch mốc thì bước đếm mở Quét nhanh cùng chiều; chiều không ghi Sheet chỉ đếm để giữ phiên.
 * `carry`: `process`, `pollAt` của lần hỏi.
 */
FbmSync.keepaliveCountOpen = function (direction, carry) {
  var state = FbmSync.runOpen({ origin: 'background', mode: direction, scan: 'keepalive', phase: 'pull_customer', entity: 'customer', cursor: { kind: 'customer_count' }, message: 'Đang giữ phiên FBM...', process: carry.process, pollAt: carry.pollAt });
  state.scheduleMode = FbmSync.modeOf(direction);
  state.metadata.countTail = { pending: false, mode: state.scheduleMode, message: 'Giữ phiên FBM OK.', recount: FbmSync.customerCountApplies(direction) };
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.cursorStartEnvelope(state), status: FbmSync.statusView() };
};

/**
 * Mở tiến trình đến hạn đầu tiên của lần hỏi, qua đuôi chuỗi để tiến trình xong ngay (không cần request) thì chạy tiếp tiến trình kế. Không có gì đến hạn thì `null`.
 * `ask`: `now`, `pollAt`, `startup` (mở trình duyệt khi không có gì đến hạn vẫn được một lần Giữ phiên, không sinh loạt việc bù).
 */
FbmSync.backgroundNext = function (ask) {
  var schedule = FbmSync.scheduleShape(settingsValues(FbmSync.SETTING_SECTIONS.background)), book = FbmSync.processBookRead();
  var due = FbmSync.processDue(ask.now, schedule, book, ask.pollAt);
  if (!due.length && ask.startup && schedule.heartbeat.enabled) { due = ['heartbeat']; }
  if (!due.length) { FbmSync.scheduleTrace('schedule_idle', 'Extension hỏi lịch nền: chưa có tiến trình đến hạn; ' + FbmSync.scheduleNextText(ask.now, schedule, book) + '.'); return null; }
  var kind = due[0], carry = { process: kind, pollAt: ask.pollAt }, direction = schedule.direction;
  if (kind !== 'heartbeat') { return FbmSync.backgroundTail(FbmSync.start(Object.assign({ mode: direction, scan: FbmSync.SCHEDULE_SCANS[kind], origin: 'background', detail: kind === 'detail' ? schedule.detail : null }, carry))); }
  var gate = FbmSync.pushGateDue(FbmSync.stateRead(), direction);
  if (gate) { return FbmSync.backgroundTail(FbmSync.start(Object.assign({ mode: 'push', scan: 'keepalive', origin: 'background', scheduleMode: direction, pushGate: gate }, carry))); }
  return FbmSync.keepaliveCountOpen(direction, carry);
};

/**
 * Đuôi của mọi lát lượt nền: lượt vừa đóng (không còn request) thì ghi kết quả tiến trình vào sổ; xong mà công tắc còn bật thì mở tiến trình đến hạn kế trong cùng lần hỏi (sổ loại tiến trình đã chạy xong từ `pollAt`, nên chuỗi luôn dừng).
 */
FbmSync.backgroundTail = function (result) {
  if (!result || result.request) { return result; }
  var state = FbmSync.stateRead(), outcome = FbmSync.processOutcome(state), pollAt = Number(state.pollAt || 0);
  if (!outcome) { return result; }
  FbmSync.backgroundSettle(state, Date.now());
  if (outcome !== 'done' || !settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled') || !settingsValue(FbmSync.SETTING_SECTIONS.background, 'enabled')) { return Object.assign({}, result, { status: FbmSync.statusView() }); }
  var next = FbmSync.backgroundNext({ now: Date.now(), pollAt: pollAt });
  return Object.assign({}, result, { ok: true, request: next && next.request || null, status: FbmSync.statusView() });
};

/** Máy hỏi chạy nền được hay không, và ghi kho máy: máy được giao ghi lần hỏi cuối; máy tự nhận ghi thành máy được giao kèm Log và thông báo chung (còn tới khi người dùng bấm ✕); máy lạ ghi Log. Trả kết luận của `machineCheck`. */
FbmSync.machineAskRecord = function (input, now) {
  var extension = settingsValues(FbmSync.SETTING_SECTIONS.extension), machine = FbmSync.backgroundMachineRead();
  var verdict = FbmSync.machineCheck({ master: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'), background: settingsValue(FbmSync.SETTING_SECTIONS.background, 'enabled'), machine: machine, machineId: input.machineId, now: now, silentMinutes: FbmSync.machineSilentMinutes(extension), autoTakeover: settingsValue(FbmSync.SETTING_SECTIONS.background, 'machineAutoTakeover'), credentialRef: FbmSync.loginConfigRead().credentialRef, keyRefs: input.keyRefs });
  if (verdict.verdict === 'assigned') { machine.lastAskAt = now; FbmSync.backgroundMachineWrite(machine); }
  if (verdict.verdict === 'takeover') {
    var taken = FbmSync.backgroundMachineWrite(FbmSync.machineTakenOver(input.machineId, now)), text = 'Máy "' + taken.name + '" đã tự nhận chạy nền FBM thay máy "' + machine.name + '" vì máy đó không hỏi GAS quá ' + FbmSync.machineSilentMinutes(extension) + ' phút.';
    logEvent({ source: 'fbm_sync', action: 'background_machine_takeover', outcome: LOG_WARN, reason: 'BACKGROUND_MACHINE_TAKEOVER: ' + text, detail: { code: 'BACKGROUND_MACHINE_TAKEOVER', machineId: taken.machineId, fromMachineId: machine.machineId } });
    noticeRaise({ topic: 'fbm_machine_takeover', scope: '', source: 'fbm_sync', title: text, hint: 'Xem lại máy "' + machine.name + '" (tắt máy, Chrome hoặc Extension?). Muốn chạy nền lại trên máy đó thì mở Sidebar ở máy đó và bấm "Dùng máy này chạy nền".' });
  }
  if (verdict.code === 'MACHINE_NOT_ASSIGNED') {
    logEvent({ source: 'fbm_sync', action: 'background_machine_refused', outcome: LOG_WARN, reason: 'Extension máy ' + String(input.machineId).slice(-6) + ' hỏi GAS nhưng không chạy nền: ' + FbmSync.MACHINE_REFUSED_TEXT[verdict.reason] + '; Extension máy đó tắt chuông tới lần mở trình duyệt kế tiếp.', detail: { code: verdict.code, reason: verdict.reason } });
  }
  return verdict;
};

/** Lệnh chuông trả Extension: giữ nhịp `pollMinutes` hay tắt chuông (kèm mã lý do). */
FbmSync.pollKeep = function () { return { minutes: settingsValue(FbmSync.SETTING_SECTIONS.extension, 'pollMinutes') }; };
FbmSync.pollStop = function (code) { return { stop: true, code: String(code) }; };

/**
 * Người điều phối lệnh `heartbeat` (chạy trong khóa điều phối). `input`: `machineId`, `trigger` (lý do hỏi, xem `ASK_TRIGGERS`), `trail` (hộp đen Extension), `keyRefs` (mã khóa giải mã Extension máy này đang giữ).
 * Lượt tay giữ chỗ quá hạn được đóng ở lần hỏi của bất kỳ máy nào (không thì Sidebar thấy lượt "đang chạy" mãi); các việc khác chỉ máy chạy nền được làm.
 */
FbmSync.heartbeatRun = function (input) {
  var ask = input || {}, machineId = String(ask.machineId || '');
  // Hộp đen nạp trước mọi lần ghi ô lượt: request quá hạn bị bỏ ở lần ghi nào thì dòng Log của nó cũng mang hộp đen.
  FbmSync.requestWatchTrail(ask.trail);
  var state = FbmSync.stopPendingApply().state, now = Date.now();
  var purpose = FbmSync.askPurpose(ask.trigger, settingsValue(FbmSync.SETTING_SECTIONS.extension, 'runOnStartup'));
  state = FbmSync.backgroundSettle(state, now);
  if (FbmSync.pickupAwaits(state, machineId, now)) {
    return Object.assign(FbmSync.runSlice(function () { return FbmSync.envelopeReissue(state, ''); }, state), { poll: FbmSync.pollKeep() });
  }
  if (FbmSync.pickupHeld(state) && now >= Number(state.deadlineAt || 0)) { state = FbmSync.staleRunClose(state, FbmSync.staleRunCheck(state, now, { abandoned: true })); }
  var verdict = FbmSync.machineAskRecord({ machineId: machineId, keyRefs: ask.keyRefs }, now);
  // Máy đang chở lượt tay của chính nó vẫn giữ chuông dù không phải máy nền.
  var driving = FbmSync.runInProgress(state) && String(state.driverMachineId || '') === machineId;
  if (verdict.verdict === 'refused') { return { ok: true, noop: true, code: verdict.code, request: null, poll: driving ? FbmSync.pollKeep() : FbmSync.pollStop(verdict.code), status: FbmSync.statusView() }; }
  var idle = function (code, extra) { return Object.assign({ ok: true, noop: true, code: code, request: null, poll: FbmSync.pollKeep(), status: FbmSync.statusView() }, extra || {}); };
  if (purpose === 'check') { return idle('ASK_CHECK_ONLY'); }
  var stale = FbmSync.staleRunCheck(state, now, { abandoned: true });
  // Lượt nền bị đóng vì bỏ dở là lần lỗi của tiến trình của nó: ghi sổ ngay để tiến trình đó chờ thử lại, không chạy lại liền trong lần hỏi này.
  if (stale) { state = FbmSync.backgroundSettle(FbmSync.staleRunClose(state, stale), now); }
  if (FbmSync.runInProgress(state)) { return idle('SYNC_BUSY'); }
  var identity = FbmSync.identityPreflight('background');
  if (identity.blocking) { return idle(identity.status.status === 'UNBOUND' ? 'FBM_IDENTITY_UNBOUND' : 'REBIND_REQUIRED', { message: identity.message }); }
  var started = FbmSync.backgroundNext({ now: now, pollAt: now, startup: purpose === 'startup' });
  if (!started) { return idle('NO_PROCESS_DUE'); }
  return Object.assign({}, started, { request: started.request || null, poll: FbmSync.pollKeep(), status: FbmSync.statusView() });
};
