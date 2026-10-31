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
 * `spec`: `origin`, `mode`, `scan`, `phase` (mặc định `checking_session`), `entity`, `total`, `kindLabel` (xem `runLabelOf`).
 * Ô cũ còn lượt chưa đóng (lượt treo bị thay) thì các bước của nó được đóng trước khi metadata bị bỏ. Mỗi lượt xác nhận phiên FBM lại từ đầu nên phiên cũ không được mang sang; số xung đột đang chờ quyết thì mang sang vì nó phản ánh Sheet.
 */
FbmSync.runOpen = function (spec) {
  var opt = spec || {}, old = FbmSync.stateRead(), now = Date.now();
  FbmSync.workStoreClear();
  FbmSync.businessFinishOpenSteps(old, 'paused', { error: 'Phiên mới đã bắt đầu thay phiên này.' });
  var state = Object.assign(FbmSync.stateDefault(), {
    runId: Number(now).toString(36), entity: String(opt.entity || ''), phase: opt.phase || 'checking_session', cursor: {},
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
 * - `runId` giữ lại để Sidebar còn vẽ kết quả lượt vừa xong; lượt coi là đã đóng nhờ phase cuối.
 * `detail`: `message`, `code` (mã lỗi hoặc mã tạm dừng), `error` (chữ lỗi; lỗi thì mặc định là `message`), `retryable`, `keepRecords` (giữ bản ghi trong sổ bận khi lệnh ghi FBM chưa rõ kết quả).
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
  state.activeRequestId = ''; state.deadlineAt = 0; state.cursor = {}; state.entity = ''; state.current = ''; state.scheduledScan = '';
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
  return { state: FbmSync.stateWrite(FbmSync.runClose(state, flag.verdict)), stopped: true };
};
