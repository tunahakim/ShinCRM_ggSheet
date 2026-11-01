/** Lệnh Dừng và cờ dừng: cờ ghi được khi lát khác đang giữ khóa điều phối, lát áp cờ trước khi phát request kế; đóng lượt thì qua `runClose` ở `Run.js`. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

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
