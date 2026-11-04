/** Lệnh Dừng và cờ dừng, công tắc tổng, đặt lại phiên kẹt: cờ ghi được khi lát khác đang giữ khóa điều phối, lát áp cờ trước khi phát request kế; đóng lượt thì qua `runClose` ở `Run.js`. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Cờ dừng nằm ở khóa riêng, ghi không cần khóa điều phối: lát đang chạy giữ khóa thì lệnh Dừng vẫn ghi được ngay.
 * Cờ gắn mã lượt nên không cần xóa: cờ của lượt đã đóng không khớp lượt nào nữa. Không xóa cũng tránh được việc lát xóa nhầm cờ của lượt mới ghi chen vào.
 */
FbmSync.STOP_KEY = 'FBM_SYNC_STOP_V1';
FbmSync.stopFlagWrite = function (flag) {
  FbmSync.documentPropertySet(FbmSync.STOP_KEY, JSON.stringify(flag), 'cờ dừng lượt');
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

/** Kết luận đóng lượt theo phạm vi lệnh Dừng: `master` là tắt công tắc tổng. */
FbmSync.STOP_SCOPE_VERDICTS = { any: 'cancelled', background: 'stopped', master: 'disabled' };
/**
 * Lệnh Dừng có được nhận không. `background`: chỉ dừng lượt nền (người dùng chọn dừng nền để chạy lượt tay); `any` (nút Dừng) và `master` (tắt công tắc): dừng mọi lượt.
 * Trả `null` là được nhận; ngược lại là kết quả trả ngay, không ghi gì.
 */
FbmSync.stopAllowed = function (state, scope) {
  if (!FbmSync.runInProgress(state)) { return { ok: true, code: scope === 'background' ? 'SYNC_BACKGROUND_IDLE' : 'SYNC_NOT_RUNNING' }; }
  if (scope === 'background' && String(state.origin || '') !== 'background') { return { ok: true, code: 'SYNC_BACKGROUND_IDLE' }; }
  return null;
};

/**
 * Người điều phối của `cancel`, `stop_background` và phần dừng của `set_master`, chạy ngoài khóa điều phối: ghi cờ dừng rồi thử lấy khóa không chờ.
 * Lấy được khóa (không lát nào đang chạy, thường gặp vì phần lớn thời gian lượt chờ FBM) thì đóng lượt ngay. Không lấy được thì lát đang giữ khóa thấy cờ trước khi phát request kế và tự đóng lượt (`SYNC_STOP_PENDING`); lệnh mở lượt và nhịp nền cũng áp cờ trước khi làm gì khác.
 */
FbmSync.runStopCommand = function (scope) {
  var verdict = FbmSync.STOP_SCOPE_VERDICTS[scope], state = FbmSync.stateRead(), refused = FbmSync.stopAllowed(state, scope);
  if (refused) { return Object.assign(refused, { status: FbmSync.statusView() }); }
  FbmSync.stopFlagWrite({ runId: String(state.runId), verdict: verdict, at: Date.now() });
  var applied = FbmSync.withOrchestrationLock(function () { return FbmSync.stopPendingApply(); }, 0);
  if (applied && applied.code === 'BUSY') { return { ok: true, code: 'SYNC_STOP_PENDING', status: FbmSync.statusView() }; }
  return { ok: true, code: verdict === 'stopped' ? 'SYNC_BACKGROUND_STOPPED' : 'SYNC_STOPPED', status: FbmSync.statusView() };
};

/**
 * Kết luận dừng của lượt đang chạy: cờ dừng thuộc lượt thì theo cờ; công tắc tổng tắt thì `disabled`; không thì rỗng.
 * Công tắc tắt là một điều kiện dừng như cờ, nên mọi chỗ áp cờ cũng đóng lượt khi công tắc tắt. Công tắc đọc từ bản chụp (không tốn lần đọc kho): tắt giữa lát thì `masterSwitchCommand` đã ghi kèm cờ dừng, lần đọc cờ `fresh` thấy nó.
 */
FbmSync.stopVerdict = function (state, fresh) {
  if (!FbmSync.runInProgress(state)) { return ''; }
  var flag = FbmSync.stopFlagRead(fresh);
  if (FbmSync.stopFlagFor(state, flag)) { return flag.verdict; }
  return settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled') ? '' : 'disabled';
};

/**
 * Áp điều kiện dừng trong khóa: lượt đang chạy có kết luận dừng thì đóng lượt và ghi. Người điều phối gọi ở đầu lát, trước khi phát request kế (`fresh`), ở lệnh mở lượt, nhịp nền và lệnh tắt công tắc.
 * Trả `{ state, stopped }`; `state` là bản sau khi áp.
 */
FbmSync.stopPendingApply = function (fresh) {
  var state = FbmSync.stateRead(), verdict = FbmSync.stopVerdict(state, fresh);
  if (!verdict) { return { state: state, stopped: false }; }
  FbmSync.runClose(state, verdict);
  return { state: FbmSync.stateWrite(state), stopped: true };
};

/**
 * Lối thoát cuối khi kho state hỏng (FBM-044): chỉ xóa state phiên. Hash chờ xác nhận ở khóa riêng và trạng thái "đang đẩy" trên Sheet vẫn còn,
 * nên lệnh tạo mất phản hồi vẫn được tra lại ở phiên sau, không tạo trùng. Phiên còn chạy bình thường thì từ chối, người dùng dùng "Dừng đồng bộ".
 */
FbmSync.stateReset = function (now) {
  var current = null, unreadable = null;
  // Không đọc được state chính là lý do cần đặt lại, nên lỗi đọc không chặn việc xóa; nó đi vào dòng Log bên dưới.
  try { current = FbmSync.stateRead(); } catch (readError) { unreadable = readError; }
  var age = current ? Number(now || Date.now()) - Number(current.updatedAt || current.startedAt || 0) : 0;
  if (current && FbmSync.ACTIVE_PHASES.indexOf(String(current.phase || '')) >= 0 && age <= FbmSync.STALE_RUN_MS) {
    return { ok: false, code: 'SYNC_RESET_RUNNING', message: 'Phiên đồng bộ đang chạy bình thường nên không đặt lại; hãy bấm "Dừng đồng bộ" nếu muốn dừng.' };
  }
  FbmSync.stateErase();
  logEvent({ source: 'fbm_sync', action: 'state_reset', outcome: LOG_WARN, reason: 'Người dùng đặt lại phiên đồng bộ bị kẹt' + (unreadable ? ' (state không đọc được: ' + String(unreadable.message || unreadable) + ')' : ' (phiên ' + String(current.runId || '') + ' ở "' + String(current.phase || '') + '")') + '; dữ liệu Sheet và FBM không đổi.', detail: { runId: current ? String(current.runId || '') : '', phase: current ? String(current.phase || '') : '' } });
  return { ok: true };
};
