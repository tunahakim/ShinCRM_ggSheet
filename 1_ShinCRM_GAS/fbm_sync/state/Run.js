/** Đóng Lượt và lệnh Dừng: nơi duy nhất đưa một lượt tới trạng thái cuối, và cờ dừng ghi được khi lát khác đang giữ khóa. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Kho làm việc chỉ sống trong một lượt: bản ghi giữ trong sổ bận, tập "đã thấy", danh sách đọc, bản xem trước. Dọn khi mở lượt để lượt trước hỏng giữa chừng không để lại gì cho lượt này.
 */
FbmSync.workStoreClear = function () {
  recordGateReleaseOwner(FbmSync.RECORD_HOLDER);
  ['customer', 'activity', 'activity_bulk'].forEach(function (scope) { FbmSync.seenStoreClear(scope); });
  FbmSync.readListClear();
  FbmSync.previewClear();
};

/**
 * Nhãn của lượt, chốt một lần lúc mở: ai chạy (Tay/Nền) và tiến trình nào. Dòng Log của lượt lấy nhãn này, không suy lại từ ô lượt lúc ghi (ô lượt có thể đã sang lượt khác).
 * `kindLabel` đặt thẳng tên tiến trình (đăng nhập, giữ phiên); bỏ trống thì suy từ kiểu quét và chuỗi nền đang mở.
 */
FbmSync.runLabelOf = function (state, kindLabel) {
  var labels = FbmSync.SCHEDULE_LABELS || {}, scans = FbmSync.SCHEDULE_SCANS || {}, chain = state.chain || {}, background = state.origin === 'background';
  var parts = [background ? 'Nền' : 'Tay'];
  if (kindLabel) { parts.push(kindLabel); return parts.join(' · '); }
  if (background && chain.current) { parts.push(labels[chain.current] || chain.current); }
  var runKind = Object.keys(scans).filter(function (kind) { return scans[kind] === state.scan; })[0] || '';
  if (runKind !== chain.current) { parts.push(labels[runKind] || String(state.scan || '')); }
  return parts.join(' · ');
};

/**
 * Nơi duy nhất mở lượt: dọn kho làm việc của lượt trước, dựng ô lượt mới từ ô hiện tại, ghi và trả về ô đã ghi.
 * `spec`: `origin`, `mode`, `scan`, `phase` (mặc định `checking_session`), `entity`, `total`, `cursor`, `message`, `kindLabel` (xem `runLabelOf`).
 * Ô cũ còn lượt chưa đóng (lượt treo bị thay) thì các bước của nó được đóng trước khi metadata bị bỏ. Mỗi lượt xác nhận phiên FBM lại từ đầu nên phiên cũ không được mang sang; số xung đột đang chờ quyết thì mang sang vì nó phản ánh Sheet.
 */
FbmSync.runOpen = function (spec) {
  var opt = spec || {}, old = FbmSync.stateRead(), now = Date.now();
  FbmSync.workStoreClear();
  FbmSync.businessFinishOpenSteps(old, 'paused', { error: 'Phiên mới đã bắt đầu thay phiên này.' });
  var state = Object.assign(FbmSync.stateDefault(), {
    runId: Number(now).toString(36), entity: String(opt.entity || ''), phase: opt.phase || 'checking_session', cursor: opt.cursor || {}, message: String(opt.message || ''),
    counts: Object.assign(FbmSync.countsDefault(), { total: Number(opt.total) || 0 }),
    metadata: Object.assign(FbmSync.stateDefault().metadata, { conflictCount: Number(old.metadata && old.metadata.conflictCount || 0), conflictLogged: Number(old.metadata && old.metadata.conflictLogged || 0) }),
    chain: old.chain || null, origin: opt.origin === 'background' ? 'background' : 'manual', mode: FbmSync.modeOf(opt.mode), scan: String(opt.scan || 'full'),
    startedAt: Number(now), updatedAt: Number(now)
  });
  state.runLabel = FbmSync.runLabelOf(state, opt.kindLabel);
  return FbmSync.stateWrite(state);
};

/**
 * Kết luận đóng lượt → trạng thái cuối. Kết luận lạ là lỗi lập trình, ném ngay; không có kết luận "mặc định".
 * `cancelled` (nút Dừng) và `stopped` (dừng lượt nền để chạy lượt tay) không phải lỗi nên không tăng giãn cách thử lại.
 */
FbmSync.RUN_VERDICTS = {
  done: { phase: 'done' },
  conflict: { phase: 'conflict' },
  paused: { phase: 'paused' },
  cancelled: { phase: 'paused', message: 'Đã dừng lượt đồng bộ theo yêu cầu; kết quả và log của lượt này vẫn được giữ để xem lại.', reason: 'dừng theo yêu cầu người dùng' },
  stopped: { phase: 'paused', message: 'Đã dừng đồng bộ nền theo yêu cầu; có thể chạy lượt thủ công.', reason: 'dừng lượt nền theo yêu cầu người dùng' },
  error: { phase: 'error' }
};

/**
 * Đóng lượt trên state truyền vào và trả chính state đó; người điều phối ghi. Mọi đường kết thúc (xong, lỗi, dừng, bỏ lượt) đi qua đây nên:
 * - Dòng Log kết thúc các bước được ghi ngay lúc đóng, khi state còn là lượt đang chạy, nên mang đúng mã và nhãn của lượt đó.
 * - Request đang bay bị bỏ: `activeRequestId` rỗng thì response về muộn bị `requestAnswered` loại; mã của nó giữ ở `closedRequestId` để Log ghi đó là response của lượt đã đóng.
 * - `runId` giữ lại để Sidebar còn vẽ kết quả lượt vừa xong; lượt coi là đã đóng nhờ phase cuối. Lượt lỗi giữ cursor.
 * `detail`: `message`, `code` (mã lỗi hoặc mã tạm dừng), `error` (chữ lỗi; lỗi thì mặc định là `message`), `retryable`, `keepRecords` (giữ bản ghi trong sổ bận khi lệnh ghi FBM chưa rõ kết quả), `cursor` (cursor giữ lại cho lần chạy sau, ví dụ lệnh ghi đang chờ xác nhận).
 */
FbmSync.runClose = function (state, verdict, detail) {
  var spec = FbmSync.RUN_VERDICTS[String(verdict || '')], extra = detail || {};
  if (!spec) { var unknown = new Error('Kết luận đóng lượt "' + String(verdict) + '" không có trong RUN_VERDICTS.'); unknown.code = 'RUN_VERDICT_UNKNOWN'; throw unknown; }
  if (!FbmSync.runInProgress(state)) { var closed = new Error('Đóng lượt khi không có lượt đang chạy (runId ' + String(state && state.runId || 'trống') + ', phase ' + String(state && state.phase || '') + ').'); closed.code = 'RUN_NOT_OPEN'; throw closed; }
  var failed = spec.phase === 'error', message = String(extra.message || spec.message || state.message || '');
  var error = extra.error !== undefined ? String(extra.error || '') : failed ? message : '';
  FbmSync.businessFinishOpenSteps(state, spec.phase, { error: error || String(spec.reason || '') });
  if (extra.keepRecords !== true) { recordGateReleaseOwner(FbmSync.RECORD_HOLDER); }
  FbmSync.readListClear();
  state.closedRequestId = String(state.activeRequestId || '');
  state.activeRequestId = ''; state.deadlineAt = 0; state.current = '';
  // Lượt lỗi giữ cursor và thực thể: chỗ hỏng còn đọc được khi tra Log, và lần chạy lại dựng lại đúng request đã hỏng thay vì bỏ qua nó.
  if (!failed) { state.cursor = {}; state.entity = ''; }
  if (extra.cursor) { state.cursor = extra.cursor; }
  state.phase = spec.phase;
  state.message = message;
  state.lastError = error;
  state.lastFailureCode = String(extra.code || (failed ? 'FBM_SYNC_EXCEPTION' : ''));
  state.retryable = extra.retryable === true;
  return state;
};

/** Nơi duy nhất đưa lượt sang lỗi. `message` là chữ người dùng đọc, nên bên gọi tự nêu bước hỏng. */
FbmSync.runFail = function (state, code, message, detail) {
  return FbmSync.runClose(state, 'error', Object.assign({}, detail || {}, { code: String(code || 'FBM_SYNC_EXCEPTION'), message: String(message || 'Lượt đồng bộ lỗi không rõ nguyên nhân.') }));
};

/**
 * Người điều phối đưa lượt đang chạy sang lỗi khi gặp sự cố giữa lát: đọc ô lượt, nêu bước hỏng trong chữ lỗi, đóng qua `runFail` rồi ghi. Không có lượt đang chạy thì không làm gì (`failed: false`).
 * Giữ bản ghi trong sổ bận: sự cố có thể xảy ra khi lệnh ghi FBM chưa rõ kết quả; lượt mở sau nhả chúng.
 */
FbmSync.runFailCurrent = function (reason, code) {
  var state = FbmSync.stateRead();
  if (!FbmSync.runInProgress(state)) { return { state: state, failed: false }; }
  var step = FbmSync.businessFailingStep(state), label = step ? FbmSync.businessStepDefinition(step).label : 'phiên đồng bộ';
  FbmSync.runFail(state, code, 'Lỗi khi ' + label + ': ' + String(reason || 'không rõ nguyên nhân'), { keepRecords: true });
  return { state: FbmSync.stateWrite(state), failed: true };
};

/**
 * Lượt đang chạy có còn sống không, chỉ đọc ô lượt truyền vào và không ghi gì: `null` là còn sống, ngược lại là kết luận đóng lượt (`code`, `message`, `keepRecords`).
 * Lượt chết khi không còn request trong hạn và quá `STALE_RUN_MS` không có tiến triển. Request đang bay còn trong hạn ngân sách (một lô có thể chạy lâu hơn mốc chung) thì chưa chết.
 * Lượt dở do bản cũ tạo (thiếu `schemaVersion` hiện hành) luôn chết: cursor cũ không được chạy tiếp mù; dấu chờ đẩy và hash nằm ở khóa riêng nên còn nguyên cho lượt chạy lại.
 * `abandoned`: lần hỏi nền gặp lượt dở không còn request chờ trong hạn thì kết luận ngay, không đợi mốc, vì lượt nền không bao giờ được nối lại qua lần hỏi.
 * Lượt chờ lệnh ghi FBM (`push_wait`) giữ bản ghi trong sổ bận để người dùng kiểm tra trên FBM trước.
 */
FbmSync.staleRunCheck = function (state, now, options) {
  var current = state || {}, at = Number(now), abandoned = !!(options && options.abandoned);
  if (!FbmSync.runInProgress(current)) { return null; }
  var legacy = Number(current.schemaVersion || 1) < FbmSync.STATE_SCHEMA_VERSION;
  if (!legacy && FbmSync.ACTIVE_PHASES.indexOf(String(current.phase || '')) < 0) { return null; }
  var updated = Number(current.updatedAt || current.startedAt || 0), age = updated ? at - updated : FbmSync.STALE_RUN_MS + 1;
  var inFlight = !!current.activeRequestId && at < Number(current.deadlineAt || 0);
  if (!legacy && (inFlight || (!abandoned && age <= FbmSync.STALE_RUN_MS))) { return null; }
  var waitingWrite = (current.cursor || {}).kind === 'push_wait', unclaimed = !legacy && FbmSync.pickupHeld(current);
  var message = legacy
    ? (waitingWrite ? 'Phiên ghi FBM đang dở được tạo bởi bản cũ; đã dừng và không tự ghi lại để tránh trùng dữ liệu. Hãy chạy lại lượt.' : 'Phiên đồng bộ đang dở được tạo bởi bản cũ; đã dừng, hãy chạy lại lượt.')
    : waitingWrite
    ? 'Phiên ghi FBM không nhận được phản hồi quá thời gian an toàn; không tự ghi lại để tránh trùng dữ liệu.'
    : unclaimed
    ? 'Lượt tay chờ Extension máy được giao đến nhận nhưng Extension máy đó không hỏi GAS lần nào trong hạn (Extension tắt, máy tắt hoặc mất mạng); đã đóng lượt, chưa có request nào sang FBM.'
    : abandoned
    ? 'Lượt đồng bộ trước bị bỏ dở (không còn request nào chờ phản hồi); đã kết thúc, lượt mới chạy lại từ đầu.'
    : 'Phiên đồng bộ không nhận được phản hồi quá thời gian an toàn; đã tự dừng, có thể chạy lại.';
  var code = legacy ? 'SYNC_STATE_MIGRATED' : waitingWrite ? 'SYNC_STALE_WRITE' : unclaimed ? 'RUN_PICKUP_EXPIRED' : abandoned ? 'SYNC_ABANDONED_RUN' : 'SYNC_STALE_RUN';
  return { code: code, message: message, keepRecords: waitingWrite };
};

/**
 * Người điều phối thu hồi lượt chết: `staleRunCheck` kết luận thì đóng qua `runFail`, ghi, và ghi riêng một dòng Log (lượt bị thu hồi có thể không còn bước nào mở để tự ghi dòng kết thúc). Không gửi lại lệnh ghi đang mở.
 */
FbmSync.recoverStaleRun = function (state, now, options) {
  var current = state || FbmSync.stateRead(), verdict = FbmSync.staleRunCheck(current, Number(now || Date.now()), options);
  if (!verdict) { return { state: current, recovered: false }; }
  var cursorKind = String((current.cursor || {}).kind || '');
  current.schemaVersion = FbmSync.STATE_SCHEMA_VERSION;
  FbmSync.runFail(current, verdict.code, verdict.message, { keepRecords: verdict.keepRecords });
  var written = FbmSync.stateWrite(current);
  logEvent({ source: 'fbm_sync', action: 'stale_run', outcome: LOG_ERROR, cycleId: String(current.runId || ''), reason: verdict.message, detail: { code: verdict.code, runId: String(current.runId || ''), cursor: cursorKind } });
  return { state: written, recovered: true, waitingWrite: verdict.keepRecords };
};

/**
 * Cờ dừng nằm ở khóa riêng, ghi không cần khóa điều phối: lát đang chạy giữ khóa thì lệnh Dừng vẫn ghi được ngay.
 * Cờ gắn mã lượt nên không cần xóa: cờ của lượt đã đóng không khớp lượt nào nữa. Không xóa cũng tránh được việc lát xóa nhầm cờ của lượt mới ghi chen vào.
 */
FbmSync.STOP_KEY = 'FBM_SYNC_STOP_V1';
FbmSync.stopFlagWrite = function (flag) {
  var written = FbmSync.documentPropertySet(FbmSync.STOP_KEY, JSON.stringify(flag), 'cờ dừng lượt');
  if (!written.ok) { throw written.error; }
  return flag;
};
/**
 * `fresh`: đọc thẳng kho thật, vì bản đọc trong khóa chụp lúc lấy khóa nên không thấy cờ do lệnh Dừng ghi giữa lát; tốn một lần gọi kho.
 * Không `fresh`: đọc bản chụp, đủ cho chỗ vừa lấy khóa (cờ ghi trước lúc lấy khóa đã nằm trong bản chụp).
 */
FbmSync.stopFlagRead = function (fresh) {
  var parsed = documentPropertyJson(fresh === true ? documentPropsFresh() : FbmSync.props(), FbmSync.STOP_KEY, 'cờ dừng lượt', 'object');
  if (!parsed) { return null; }
  if (!parsed.runId || !FbmSync.RUN_VERDICTS[parsed.verdict]) {
    var corrupt = new Error('Cờ dừng lượt trong DocumentProperties bị hỏng; đã dừng để không chạy tiếp lượt có thể đã bị bấm Dừng.');
    corrupt.code = 'DOCUMENT_PROPERTY_CORRUPT';
    throw corrupt;
  }
  return parsed;
};
/** Cờ dừng có thuộc lượt đang chạy trong state này không. */
FbmSync.stopFlagFor = function (state, flag) {
  return !!flag && FbmSync.runInProgress(state) && String(flag.runId) === String(state.runId);
};

/**
 * Lệnh Dừng có được nhận không. `background`: chỉ dừng lượt nền (người dùng chọn dừng nền để chạy lượt tay); `any`: nút Dừng, dừng mọi lượt.
 * Trả `null` là được nhận; ngược lại là kết quả trả ngay, không ghi gì.
 */
FbmSync.stopAllowed = function (state, scope) {
  if (!FbmSync.runInProgress(state)) { return { ok: true, code: scope === 'background' ? 'SYNC_BACKGROUND_IDLE' : 'SYNC_NOT_RUNNING' }; }
  if (scope === 'background' && String(state.origin || '') !== 'background') { return { ok: true, code: 'SYNC_BACKGROUND_IDLE' }; }
  return null;
};

/**
 * Người điều phối của `cancel` và `stop_background`, chạy ngoài khóa điều phối: ghi cờ dừng rồi thử lấy khóa không chờ.
 * Lấy được khóa (không lát nào đang chạy, thường gặp vì phần lớn thời gian lượt chờ FBM) thì đóng lượt ngay. Không lấy được thì lát đang giữ khóa thấy cờ trước khi phát request kế và tự đóng lượt (`SYNC_STOP_PENDING`); lệnh mở lượt và nhịp nền cũng áp cờ trước khi làm gì khác.
 */
FbmSync.runStopCommand = function (scope) {
  var verdict = scope === 'background' ? 'stopped' : 'cancelled', state = FbmSync.stateRead(), refused = FbmSync.stopAllowed(state, scope);
  if (refused) { return Object.assign(refused, { status: FbmSync.statusView() }); }
  FbmSync.stopFlagWrite({ runId: String(state.runId), verdict: verdict, at: Date.now() });
  var applied = FbmSync.withOrchestrationLock(function () { return FbmSync.stopPendingApply(); }, 0);
  if (applied && applied.code === 'BUSY') { return { ok: true, code: 'SYNC_STOP_PENDING', status: FbmSync.statusView() }; }
  return { ok: true, code: verdict === 'stopped' ? 'SYNC_BACKGROUND_STOPPED' : 'SYNC_STOPPED', status: FbmSync.statusView() };
};

/**
 * Áp cờ dừng trong khóa: cờ thuộc lượt đang chạy thì đóng lượt với kết luận của cờ và ghi. Người điều phối gọi ở đầu lát, trước khi phát request kế (`fresh`), ở lệnh mở lượt và nhịp nền.
 * Trả `{ state, stopped }`; `state` là bản sau khi áp.
 */
FbmSync.stopPendingApply = function (fresh) {
  var state = FbmSync.stateRead(), flag = FbmSync.stopFlagRead(fresh);
  if (!FbmSync.stopFlagFor(state, flag)) { return { state: state, stopped: false }; }
  FbmSync.runClose(state, flag.verdict);
  // Người dùng dừng thì tiến trình nền đang đến hạn cũng bỏ, không để nhịp kế mở lại đúng lượt vừa dừng; lượt chết bị thu hồi thì giữ để lịch nền chạy lại.
  state.scheduledScan = '';
  return { state: FbmSync.stateWrite(state), stopped: true };
};
