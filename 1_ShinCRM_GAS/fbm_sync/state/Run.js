/** Mở và đóng Lượt: nơi duy nhất đưa một lượt tới trạng thái cuối; lệnh Dừng và cờ dừng ở `RunStop.js`. */
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
 * `kindLabel` đặt thẳng tên tiến trình; bỏ trống thì lấy tên tiến trình nền (`process`) và thêm tên kiểu quét khi khác tiến trình (Quét nhanh do bước đếm gọi trong Giữ phiên).
 */
FbmSync.runLabelOf = function (state, kindLabel) {
  var labels = FbmSync.SCHEDULE_LABELS, scans = FbmSync.SCHEDULE_SCANS, process = String(state.process || ''), background = state.origin === 'background';
  var parts = [background ? 'Nền' : 'Tay'];
  if (kindLabel) { parts.push(kindLabel); return parts.join(' · '); }
  if (background && process) { parts.push(labels[process] || process); }
  var runKind = Object.keys(scans).filter(function (kind) { return scans[kind] === state.scan; })[0] || '';
  if (!background || runKind !== process) { parts.push(labels[runKind] || String(state.scan || '')); }
  return parts.join(' · ');
};

/**
 * Nơi duy nhất mở lượt: dọn kho làm việc của lượt trước, dựng ô lượt mới từ ô hiện tại, ghi và trả về ô đã ghi.
 * `spec`: `origin`, `mode`, `scan`, `phase` (mặc định `checking_session`), `entity`, `total`, `cursor`, `message`, `kindLabel` (xem `runLabelOf`), `process` và `pollAt` (tiến trình nền và giờ bắt đầu lần hỏi mở lượt, xem `Heartbeat.js`).
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
    process: String(opt.process || ''), pollAt: Number(opt.pollAt || 0), origin: opt.origin === 'background' ? 'background' : 'manual', mode: FbmSync.modeOf(opt.mode), scan: String(opt.scan || 'full'),
    startedAt: Number(now), updatedAt: Number(now)
  });
  state.runLabel = FbmSync.runLabelOf(state, opt.kindLabel);
  return FbmSync.stateReplace(state);
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
  disabled: { phase: 'paused', message: 'Đã tắt đồng bộ; lượt đang chạy dừng ngay, response FBM về sau bị bỏ.', reason: 'tắt đồng bộ' },
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
 * Đóng lượt chết theo kết luận của `staleRunCheck`: đóng qua `runFail`, ghi, và ghi riêng một dòng Log (lượt bị thu hồi có thể không còn bước nào mở để tự ghi dòng kết thúc). Không gửi lại lệnh ghi đang mở. Trả ô lượt đã ghi.
 * Hộp đen Extension không ghi ở đây: request quá hạn bị bỏ đã có dòng `request_unanswered` mang hộp đen (`RequestWatch.js`), lần hỏi nền nạp hộp đen trước khi đóng.
 */
FbmSync.staleRunClose = function (state, verdict) {
  var cursorKind = String((state.cursor || {}).kind || '');
  state.schemaVersion = FbmSync.STATE_SCHEMA_VERSION;
  FbmSync.runFail(state, verdict.code, verdict.message, { keepRecords: verdict.keepRecords });
  var written = FbmSync.stateWrite(state);
  logEvent({ source: 'fbm_sync', action: 'stale_run', outcome: LOG_ERROR, cycleId: String(state.runId || ''), reason: verdict.message, detail: { code: verdict.code, runId: String(state.runId || ''), cursor: cursorKind } });
  return written;
};
