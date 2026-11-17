/**
 * Chuỗi nền: người điều phối lần hỏi của Extension (lệnh `heartbeat`). Mỗi lần hỏi xét theo thứ tự: lượt tay giữ chỗ cho máy này → máy hỏi có phải máy chạy nền → lượt dở quá hạn → lượt đang sống → tiến trình đến hạn → không có gì.
 * Mọi tiến trình nền, kể cả Giữ phiên, là một Lượt mở qua `runOpen`; ô lượt mang tên tiến trình (`process`) và giờ bắt đầu lần hỏi (`pollAt`), nên lượt đóng ở đường nào thì `runClose` cũng ghi kết quả của tiến trình vào sổ đúng một lần.
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
  return { ok: true, request: FbmSync.cursorIssue(state), status: FbmSync.statusView() };
};

/**
 * Mở tiến trình đến hạn đầu tiên của lần hỏi, qua đuôi chuỗi để tiến trình xong ngay (không cần request) thì chạy tiếp tiến trình kế. Không có gì đến hạn thì `null`.
 * `ask`: `now`, `pollAt`, `book` (sổ tiến trình đã đọc trong lời gọi), `startup` (mở trình duyệt khi không có gì đến hạn vẫn được một lần Giữ phiên, không sinh loạt việc bù).
 */
FbmSync.backgroundNext = function (ask) {
  var schedule = FbmSync.scheduleShape(settingsValues(FbmSync.SETTING_SECTIONS.background)), book = ask.book;
  var due = FbmSync.processDue(ask.now, schedule, book, ask.pollAt);
  if (!due.length && ask.startup && schedule.heartbeat.enabled) { due = ['heartbeat']; }
  if (!due.length) { FbmSync.scheduleTrace('schedule_idle', 'Extension hỏi lịch nền: chưa có tiến trình đến hạn; ' + FbmSync.scheduleNextText(ask.now, schedule, book) + '.'); return null; }
  var kind = due[0], carry = { process: kind, pollAt: ask.pollAt }, direction = schedule.direction;
  if (kind !== 'heartbeat') { return FbmSync.backgroundTail(FbmSync.start(Object.assign({ mode: direction, scan: FbmSync.SCHEDULE_SCANS[kind], origin: 'background', detail: kind === 'detail' ? schedule.detail : null }, carry), FbmSync.stateRead())); }
  var gate = FbmSync.pushGateDue(FbmSync.stateRead(), direction);
  if (gate) { return FbmSync.backgroundTail(FbmSync.start(Object.assign({ mode: 'push', scan: 'keepalive', origin: 'background', scheduleMode: direction, pushGate: gate }, carry), FbmSync.stateRead())); }
  return FbmSync.keepaliveCountOpen(direction, carry);
};

/**
 * Đuôi của mọi lát lượt nền: lượt nền vừa đóng xong (không còn request; `runClose` đã ghi sổ) mà công tắc còn bật thì mở tiến trình đến hạn kế trong cùng lần hỏi (sổ loại tiến trình đã chạy xong từ `pollAt`, nên chuỗi luôn dừng).
 * Lệnh bị từ chối (`ok: false`) không mở lượt nên ô lượt còn là lượt đóng trước đó: không nối chuỗi từ nó, không thì một tiến trình bị từ chối mãi sẽ được mở lại vô hạn.
 */
FbmSync.backgroundTail = function (result) {
  if (!result || result.request || result.ok === false) { return result; }
  var state = FbmSync.stateRead(), pollAt = Number(state.pollAt || 0);
  if (FbmSync.processOutcome(state) !== 'done' || !settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled') || !settingsValue(FbmSync.SETTING_SECTIONS.background, 'enabled')) { return result; }
  var next = FbmSync.backgroundNext({ now: Date.now(), pollAt: pollAt, book: FbmSync.processBookRead() });
  return Object.assign({}, result, { ok: true, request: next && next.request || null, status: FbmSync.statusView() });
};

/** Máy hỏi chạy nền được hay không, và ghi kho máy: máy được giao ghi lần hỏi cuối; máy tự nhận ghi thành máy được giao kèm Log và thông báo chung (còn tới khi người dùng bấm ✕); máy lạ ghi Log. Trả kết luận của `machineCheck`. */
FbmSync.machineAskRecord = function (input, now) {
  var extension = settingsValues(FbmSync.SETTING_SECTIONS.extension), machine = FbmSync.backgroundMachineRead();
  var verdict = FbmSync.machineCheck({ master: settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled'), background: settingsValue(FbmSync.SETTING_SECTIONS.background, 'enabled'), machine: machine, machineId: input.machineId, now: now, silentMinutes: FbmSync.machineSilentMinutes(extension), autoTakeover: settingsValue(FbmSync.SETTING_SECTIONS.background, 'machineAutoTakeover'), credentialRef: FbmSync.credentialRead().credentialRef, keyRefs: input.keyRefs });
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
  // Câu trả lời kèm mã tham chiếu GAS đang giữ bản mã: Extension bỏ bản mã đời cũ nằm cạnh khóa của mã đó (kho Extension chỉ còn khóa).
  var credential = FbmSync.credentialRead();
  return Object.assign({}, FbmSync.heartbeatDecide(input), { credentialRefs: credential.configured ? [credential.credentialRef] : [] });
};
/** Quyết định của lần hỏi: máy nào được chạy, lượt nào nhận tiếp, tiến trình nào đến hạn, lệnh chuông. */
FbmSync.heartbeatDecide = function (input) {
  var ask = input || {}, machineId = String(ask.machineId || '');
  // Hộp đen nạp trước mọi lần ghi ô lượt: request quá hạn bị bỏ ở lần ghi nào thì dòng Log của nó cũng mang hộp đen.
  FbmSync.requestWatchTrail(ask.trail);
  var state = FbmSync.stopPendingApply().state, now = Date.now();
  var purpose = FbmSync.askPurpose(ask.trigger, settingsValue(FbmSync.SETTING_SECTIONS.extension, 'runOnStartup'));
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
  // Lượt nền bị đóng vì bỏ dở là lần lỗi của tiến trình của nó: `runClose` ghi sổ ngay để tiến trình đó chờ thử lại, không chạy lại liền trong lần hỏi này.
  if (stale) { state = FbmSync.staleRunClose(state, stale); }
  if (FbmSync.runInProgress(state)) { return idle('SYNC_BUSY'); }
  var identity = FbmSync.identityPreflight('background');
  if (identity.blocking) { return idle(identity.status.status === 'UNBOUND' ? 'FBM_IDENTITY_UNBOUND' : 'REBIND_REQUIRED', { message: identity.message }); }
  var book = FbmSync.processBookRead();
  if (FbmSync.identityStopActive(book, FbmSync.bindingRead())) { return idle('BACKGROUND_IDENTITY_STOPPED', { message: 'Chạy nền dừng vì lần trước tài khoản FBM đang mở khác tài khoản đã liên kết. Kiểm tra tài khoản FBM rồi lưu lại liên kết để chạy nền tiếp.' }); }
  // Lượt nền mở trong lát như lượt tay: lỗi giữa lúc mở đóng lượt lỗi, và mọi sửa ô lượt được ghi một lần cuối lát.
  var started = FbmSync.runSlice(function () { return FbmSync.backgroundNext({ now: now, pollAt: now, book: book, startup: purpose === 'startup' }); }, state);
  if (!started) { return idle('NO_PROCESS_DUE'); }
  return Object.assign({}, started, { request: started.request || null, poll: FbmSync.pollKeep(), status: FbmSync.statusView() });
};
