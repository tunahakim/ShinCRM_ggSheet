/**
 * Các chặng đầu lượt theo hợp đồng chặng chung (`CURSOR_TABLE`): xác thực Customer/Activity (`authorize_*`), đọc grid User cho lượt đọc danh tính (`identity_user_grid`), nạp danh mục (`lookup`) và đọc grid Customer của lượt kiểm tra liên kết (`customer_grid`).
 * Chặng chỉ đọc response trên bản sao ô lượt và trả `{ patch, end }` hoặc `session.suspected`; phần đổi cursor, đọc Sheet và mở chặng kế nằm ở bước kết (người điều phối), request đi qua `cursorIssue`/`sliceIssue` nên cổng phiên xét đúng cursor mới.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Kết quả trả về sau khi bước kết đã chọn request kế (hoặc không): lượt đóng lỗi thì trả đúng lý do dừng chứ không trả "không có request". */
FbmSync.openStageResult = function (state, request) {
  if (request) { return { ok: true, request: FbmSync.sliceIssue(state, request), status: FbmSync.statusView() }; }
  if (state.phase === 'error') { return { ok: false, code: state.lastFailureCode, request: null, status: FbmSync.statusView(), error: state.lastError }; }
  return { ok: true, request: null, status: FbmSync.statusView() };
};
/** Đổi cursor rồi phát request của cursor mới (qua cổng phiên). */
FbmSync.openStageMove = function (state, patch) {
  FbmSync.stagePatchApply(state, patch);
  return { ok: true, request: FbmSync.cursorIssue(state), status: FbmSync.statusView() };
};

/** Chặng xác thực: lấy mã `authorized` của controller rồi giao bước kết chọn chặng kế. Mã gắn với phiên nên lưu vào ô phiên trước mọi request ghi. */
FbmSync.authorizeStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var entity = ctx.state.cursor.kind === 'authorize_customer' ? 'customer' : 'activity', auth = FbmSync.extractAuthorized(ctx.reply);
  if (!auth) { var missing = new Error('FBM không trả mã authorized cho ' + entity + '.'); missing.code = 'FBM_AUTHORIZE_MISSING'; throw missing; }
  var session = ctx.state.session;
  session[entity === 'customer' ? 'customerAuthorized' : 'activityAuthorized'] = auth;
  return { patch: { session: session }, end: { entity: entity } };
};
/**
 * Bước kết của chặng xác thực. Sau Customer: lượt đọc danh tính sang grid User, lượt kiểm liên kết sang grid Customer, còn lại sang xác thực Activity.
 * Sau Activity: kiểm tra trước phiên phần đắt (chỉ chạy khi phiên đã xác thực), rồi nạp danh mục khi chiều chạy cần, không thì vào chặng đọc.
 */
FbmSync.authorizeEnd = function (state, end) {
  if (end.entity === 'customer') {
    if (state.scan === 'identity_probe') { return FbmSync.openStageMove(state, { cursor: { kind: 'identity_user_grid' }, phase: 'checking_session', entity: '', message: 'Đã xác thực phiên; đang đọc thông tin tài khoản FBM...' }); }
    if (state.scan === 'identity_check') {
      FbmSync.identityCheckBegin(state);
      return FbmSync.openStageMove(state, { phase: 'pull_customer', entity: 'customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, message: 'Đang kiểm tra liên kết Customer FBM...' });
    }
    return FbmSync.openStageMove(state, { cursor: { kind: 'authorize_activity' }, message: 'Đã xác thực Customer; đang xác thực Activity...' });
  }
  FbmSync.businessStepFinish(state, 'session', 'ok', {});
  var stopped = FbmSync.preflightLocalStep(state);
  if (stopped) { return stopped; }
  // Category là cấu hình của người dùng; đồng bộ chỉ đọc và đối chiếu. Chiều Lấy không nạp danh mục FBM (`needsFbmLookups`).
  FbmSync.businessStepStart(state, 'category', { mode: state.mode, scan: state.scan });
  if (FbmSync.needsFbmLookups(state)) { return FbmSync.openStageMove(state, { cursor: { kind: 'lookup' }, message: 'Đang kiểm tra danh mục FBM...' }); }
  var pullRequest = FbmSync.beginCustomerPull(state);
  FbmSync.businessStepFinish(state, 'category', 'ok', { lookups: 0, errors: Number(state.metadata && state.metadata.categoryBlocks && state.metadata.categoryBlocks.length || 0) });
  FbmSync.stateWrite(state);
  return FbmSync.runTail(FbmSync.openStageResult(state, pullRequest));
};

/** Đầu vào chặng grid User: mã bảng tính đang mở (cổng Spreadsheet). */
FbmSync.identityUserGridInputs = function () { return { spreadsheetId: FbmSync.currentSpreadsheetId() }; };
/** Chặng grid User của lượt đọc danh tính: ghi danh tính vừa đọc vào ô phiên và kết quả lượt để người dùng xác nhận lưu. Chưa xác minh gì: lượt này chính là bước đọc để tự điền liên kết. FBM trả thiếu danh tính là kết quả nghiệp vụ (lượt đóng lỗi có mã), không phải sự cố của GAS. */
FbmSync.identityUserGridStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var identity = FbmSync.identityUser(ctx.reply);
  if (!identity.ok) { return { patch: {}, end: { fail: { code: identity.code || 'IDENTITY_PROBE_INCOMPLETE', message: identity.message } } }; }
  var state = FbmSync.sessionIdentityRecord(ctx.state, identity);
  return { patch: { session: state.session, metadata: { identityProbe: { spreadsheetId: String(ctx.inputs.spreadsheetId || ''), userId: identity.userId, username: identity.username, accountName: identity.accountName } } }, end: { done: true } };
};
FbmSync.identityUserGridEnd = function (state, end) {
  if (end.fail) {
    FbmSync.runFail(state, end.fail.code, end.fail.message);
    FbmSync.stateWrite(state);
    return FbmSync.runTail({ ok: false, code: end.fail.code, request: null, status: FbmSync.statusView(), error: end.fail.message });
  }
  FbmSync.runClose(state, 'done', { message: 'Đã đọc nhận diện phiên FBM; chờ người dùng xác nhận lưu.' });
  FbmSync.stateWrite(state);
  return FbmSync.runTail({ ok: true, request: null, status: FbmSync.statusView() });
};

/** Chặng nạp danh mục đầu lượt (chế độ ghi cần danh mục trước khi dựng payload; chiều đẩy nạp lại giữa các lô ở `push_lookup`). Cả lô lỗi đường truyền thì dừng lượt (không đi tiếp với danh mục rỗng); phần tử nghi phiên thì nhường chặng phiên, cursor còn nguyên nên dựng lại đúng lô. */
FbmSync.lookupStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var state = ctx.state;
  if (!FbmSync.lookupBatchApply(state, ctx.reply)) { return { patch: {}, session: { suspected: 'Phản hồi FBM đáng ngờ khi đọc danh mục; chưa đối chiếu gì, đang probe lại phiên.' } }; }
  return { patch: { session: state.session, metadata: { categoryCheck: state.metadata.categoryCheck }, message: FbmSync.canWriteFbm(state.mode) ? 'Đã đọc danh mục FBM; đang đối chiếu Category...' : state.message }, end: { loaded: true } };
};
FbmSync.lookupEnd = function (state) {
  var customerRequest = FbmSync.beginCustomerPull(state), categoryBlocks = state.metadata && state.metadata.categoryBlocks || [];
  FbmSync.businessStepFinish(state, 'category', 'ok', { lookups: Number(FbmSync.SYNC_LOOKUPS.length || 0), errors: Number(categoryBlocks.length || 0) });
  FbmSync.stateWrite(state);
  return FbmSync.runTail(FbmSync.openStageResult(state, customerRequest));
};

/** Chặng grid Customer của lượt kiểm tra liên kết: đọc một trang (sắp theo `stt_rec_kh`), bỏ khách tạm; bước kết đối chiếu với Sheet và chọn trang kế. */
FbmSync.identityCheckGridStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var grid = FbmSync.rowsToRecords('customer', ctx.reply);
  return { patch: {}, end: { rows: grid.rows, total: grid.total, sourceFields: grid.sourceFields } };
};
FbmSync.identityCheckGridEnd = function (state, end) {
  var cursor = state.cursor || {}, eligible = end.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); }), firstPage = Number(cursor.pageIndex) < 0;
  if (end.sourceFields) { state.metadata.customerFields = end.sourceFields; }
  state.metadata.customerScan = FbmSync.customerScanRecord(firstPage ? null : state.metadata.customerScan, end.rows, end.total, null);
  if (firstPage) { state.progress = { done: 0, total: state.metadata.customerScan.total }; }
  FbmSync.identityCheckPage(state, eligible);
  FbmSync.progressCustomersDone(state, end.rows.length);
  if (FbmSync.customerNext(state, FbmSync.customerPageOf(end.rows, true), end.total)) {
    FbmSync.stateWrite(state);
    return Object.assign(FbmSync.openStageResult(state, FbmSync.cursorRequest(state)), { imported: eligible.length });
  }
  FbmSync.identityCheckFinish(state);
  FbmSync.runClose(state, 'done', { message: 'Đã kiểm tra liên kết Customer FBM.' });
  FbmSync.stateWrite(state);
  return FbmSync.runTail({ ok: true, request: null, status: FbmSync.statusView(), imported: eligible.length });
};
