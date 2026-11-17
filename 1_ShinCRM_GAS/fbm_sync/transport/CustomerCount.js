/**
 * Bước "Đếm khách" (09/02 Phần 3 "Chuỗi trong một lần hỏi", Phần 8): một request đếm và một số khách mốc, dùng ở cuối mọi lượt có ghi Sheet và làm thân của Giữ phiên.
 * Số mốc chỉ do lượt lấy danh sách toàn bộ khách ghi, bằng đúng `TotalRowCount` của request đó; request đếm dựng bằng cùng hàm nên hai số khớp khi FBM không đổi và Quét nhanh không lặp vô ích.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.RECOUNT_MESSAGE = 'Số khách FBM vừa đổi, quét thêm một lần...';

/** Số khách mốc trong sổ tiến trình, hoặc `null` khi chưa có: chưa có mốc thì coi như lệch. Chỉ `runBookCommit` ghi khi lượt xong. */
FbmSync.customerBaselineRead = function () { return FbmSync.processBookRead().customerFull.baseline; };

/**
 * Request đếm: cùng điều kiện lọc với danh sách toàn bộ khách nên `TotalRowCount` hai bên khớp khi FBM không đổi; khác `count: 1` và không xin tiêu đề cột (chỉ cần tổng, tiêu đề nặng hơn cả response).
 * Không giữ cột nào (`keepFields` rỗng): Extension chỉ trả tổng.
 */
FbmSync.customerCountRequest = function (scope, cfg) {
  var request = FbmSync.customerListRequest({ count: 1, type: 1, pageIndex: FbmSync.GRID_FIRST_PAGE_NO_HEADER }, { keepFields: [], scope: scope }, cfg);
  request.meta.kind = 'customer_count'; request.meta.entity = 'customer';
  return request;
};

/** Đọc `TotalRowCount` của response đếm; response không có số thì trả `null` để bên gọi dừng lỗi, không đoán. */
FbmSync.customerCountTotal = function (rawResponse) {
  var parsed = FbmSync.protocol.parse(rawResponse) || {}, data = parsed.d || parsed;
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var value = data && (data.TotalRowCount !== undefined ? data.TotalRowCount : data.totalRowCount);
  if (value === undefined || value === null || value === '') { return null; }
  var number = Number(value);
  return isFinite(number) && number >= 0 ? number : null;
};

/** Số khách vừa đếm khác mốc (hoặc chưa có mốc, `null`) thì phải chạy Quét nhanh. Mốc do người gọi đọc và truyền vào. */
FbmSync.customerCountChanged = function (total, baseline) {
  return baseline === null || Number(total) !== Number(baseline);
};

/** Bước đếm chỉ ở chiều có ghi Sheet (09/02 mục 8): chiều Kiểm tra và Chỉ đẩy không ghi được mốc, gọi Quét nhanh cùng chiều sẽ lặp mãi. */
FbmSync.customerCountApplies = function (mode) { return FbmSync.canWriteSheet(mode); };

/**
 * Đánh dấu đầu lượt: chỉ lượt nghiệp vụ có ghi Sheet mới đếm cuối lượt; lượt đăng nhập thử, kiểm tra liên kết dùng chung state nhưng không mang dấu này.
 * Chiều đếm ghi vào dấu: lượt Giữ phiên chạy mode `push` nhưng đếm và Quét nhanh bù theo chiều lịch nền (`scheduleMode`), không thì Hai chiều mất bước phát hiện khách mới.
 */
FbmSync.countTailMark = function (state) {
  var scan = String(state.scan || ''), mode = scan === 'keepalive' ? state.scheduleMode : state.mode;
  if (['full', 'activity_bulk', 'detail', 'keepalive'].indexOf(scan) >= 0 && FbmSync.customerCountApplies(mode)) { state.metadata = state.metadata || {}; state.metadata.countTail = { pending: true, mode: mode }; }
};

/**
 * Cuối lượt: lượt nghiệp vụ vừa xong (`done`, không còn request) thì chèn bước đếm trước khi trả kết quả. Mọi đường kết thúc lượt đều đi qua `start`/`continue` nên chỉ cần một chỗ này.
 * Lượt dừng lỗi, tạm dừng hay xung đột không đếm: chưa xong việc chính thì chưa có gì để đối chiếu.
 */
FbmSync.runTail = function (result) {
  if (!result || result.request) { return result; }
  var state = FbmSync.stateRead();
  if (!FbmSync.countTailPending(state)) { return result; }
  var tail = state.metadata.countTail;
  state.metadata.countTail = { pending: false, mode: tail.mode, message: String(state.message || '') };
  state.phase = 'pull_customer'; state.entity = 'customer'; state.cursor = { kind: 'customer_count' };
  state.message = 'Đang đếm lại số khách FBM...';
  FbmSync.stateWrite(state);
  return Object.assign({}, result, { ok: true, request: FbmSync.cursorIssue(state), status: FbmSync.statusView() });
};

/** Đầu vào của chặng đếm, đọc qua cổng chủ: số khách mốc. */
FbmSync.customerCountInputs = function () { return { baseline: FbmSync.customerBaselineRead() }; };

/**
 * Chặng đếm khách (hợp đồng chung): đọc tổng khách FBM của response đếm, so với mốc truyền vào. Không đọc kho, không ghi gì.
 * FBM không trả số thì ném `FBM_CUSTOMER_COUNT_INVALID`: dữ liệu của lượt đã ghi, lượt sau đếm lại.
 */
FbmSync.customerCountStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var total = FbmSync.customerCountTotal(ctx.reply);
  if (total === null) {
    var invalid = new Error('FBM không trả số khách ở bước đếm cuối lượt; dữ liệu của lượt đã ghi, lượt sau sẽ đếm lại.');
    invalid.code = 'FBM_CUSTOMER_COUNT_INVALID';
    throw invalid;
  }
  var baseline = ctx.inputs.baseline, tail = ctx.state.metadata && ctx.state.metadata.countTail || {}, changed = FbmSync.customerCountChanged(total, baseline) && tail.recount !== false;
  var patch = changed ? { logs: [{ action: 'customer_count_changed', outcome: LOG_OK, reason: baseline === null ? 'Chưa có số khách mốc; chạy Quét nhanh để lấy mốc.' : 'Số khách FBM đổi từ ' + baseline + ' thành ' + total + '; chạy Quét nhanh ngay.', detail: { baseline: baseline, total: total } }] } : {};
  return { patch: patch, end: { total: total, baseline: baseline, changed: changed } };
};

/**
 * Bước kết của chặng đếm (người điều phối): đóng lượt với thông báo cũ; lệch mốc thì mở ngay một lượt Quét nhanh cùng chiều (mang tiến trình nền của lượt vừa xong), lượt đó lại kết thúc bằng bước đếm.
 * Dấu đếm có `recount: false` (Giữ phiên ở chiều không ghi Sheet) thì chỉ đếm để giữ phiên. Lượt Giữ phiên ghi giờ giữ phiên cuối.
 */
FbmSync.customerCountEnd = function (state, end) {
  var tail = state.metadata && state.metadata.countTail || {};
  if (state.scan === 'keepalive') {
    state.session.lastHeartbeatAt = Date.now();
    FbmSync.scheduleTrace('heartbeat_ok', 'Giữ phiên FBM OK, FBM báo ' + end.total + ' khách' + (end.changed ? '; số khách lệch nên chạy Quét nhanh.' : '.'), { customers: end.total });
  }
  // Lệch mốc: tiến trình nền của lượt chưa xong mà chuyển sang lượt Quét nhanh, nên trao tên tiến trình cho lượt đó thay vì để `runClose` ghi xong.
  var carry = { process: state.process, pollAt: state.pollAt, follows: state.runId };
  if (end.changed) { state.process = ''; }
  FbmSync.runClose(state, 'done', { message: tail.message || FbmSync.runDoneMessage(state) });
  FbmSync.stateWrite(state);
  if (!end.changed) { return { ok: true, request: null, status: FbmSync.statusView() }; }
  return FbmSync.recountStart(tail.mode || state.mode, state.origin, carry, state);
};

/** Quét nhanh do bước đếm gọi: chiều đếm của lượt vừa xong, cùng nguồn và cùng tiến trình nền (`carry`: `process`, `pollAt`, `follows` là mã lượt vừa đóng để Sidebar đang chờ lượt đó chờ tiếp lượt này); không đi qua công tắc tiến trình và không dời mốc lịch nào. */
FbmSync.recountStart = function (mode, origin, carry, state) {
  var started = FbmSync.start(Object.assign({ mode: mode, scan: 'full', pack: 'quick', origin: origin, manual: false }, carry), state);
  if (started && started.ok && started.request) { FbmSync.statePatch({ message: FbmSync.RECOUNT_MESSAGE }); started.status = FbmSync.statusView(); }
  return started;
};
