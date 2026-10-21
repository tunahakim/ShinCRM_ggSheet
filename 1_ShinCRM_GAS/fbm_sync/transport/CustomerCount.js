/**
 * Bước "Đếm khách" (09/02 Phần 3 "Chuỗi trong một lần hỏi", Phần 8): một request đếm và một số khách mốc, dùng ở cuối mọi lượt có ghi Sheet và làm thân của Giữ phiên.
 * Số mốc chỉ do lượt lấy danh sách toàn bộ khách ghi, bằng đúng `TotalRowCount` của request đó; request đếm dựng bằng cùng hàm nên hai số khớp khi FBM không đổi và Quét nhanh không lặp vô ích.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.CUSTOMER_BASELINE_KEY = 'FBM_SYNC_CUSTOMER_BASELINE_V1';
FbmSync.RECOUNT_MESSAGE = 'Số khách FBM vừa đổi, quét thêm một lần...';

/** Số khách mốc, hoặc `null` khi chưa có: chưa có mốc thì coi như lệch. Nằm ngoài state vì `stateStart` xóa `session` mỗi lượt. */
FbmSync.customerBaselineRead = function () {
  var parsed = documentMemoRead(FbmSync.props(), FbmSync.CUSTOMER_BASELINE_KEY, 'số khách mốc FBM', 'object'), total = parsed ? Number(parsed.total) : NaN;
  return isFinite(total) && total >= 0 ? total : null;
};
FbmSync.customerBaselineWrite = function (total) {
  FbmSync.props().setProperty(FbmSync.CUSTOMER_BASELINE_KEY, JSON.stringify({ total: Number(total), at: Date.now() }));
};

/** Request đếm: đúng request trang đầu của lượt lấy danh sách toàn bộ khách, chỉ khác `count: 1`. `kind` là `heartbeat` khi chạy làm Giữ phiên. */
FbmSync.customerCountRequest = function (kind) {
  var request = FbmSync.customerListRequest({ count: 1 });
  request.meta.kind = kind || 'customer_count'; request.meta.entity = 'customer';
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

/** Số khách vừa đếm khác mốc (hoặc chưa có mốc) thì phải chạy Quét nhanh. */
FbmSync.customerCountChanged = function (total) {
  var baseline = FbmSync.customerBaselineRead();
  return baseline === null || Number(total) !== baseline;
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
  var tail = state.metadata && state.metadata.countTail;
  if (state.phase !== 'done' || !tail || tail.pending !== true) { return result; }
  state.metadata.countTail = { pending: false, mode: tail.mode, message: String(state.message || '') };
  state.phase = 'pull_customer'; state.entity = 'customer'; state.cursor = { kind: 'customer_count' };
  state.message = 'Đang đếm lại số khách FBM...';
  FbmSync.stateWrite(state);
  return Object.assign({}, result, { ok: true, request: FbmSync.nextEnvelope(FbmSync.customerCountRequest()), status: FbmSync.statusView() });
};

/** Nhận response đếm cuối lượt: khớp mốc thì đóng lượt với thông báo cũ; lệch thì mở ngay một lượt Quét nhanh cùng chiều, lượt đó lại kết thúc bằng bước đếm. */
FbmSync.customerCountContinue = function (state, rawResponse) {
  var total = FbmSync.customerCountTotal(rawResponse), tail = state.metadata && state.metadata.countTail || {};
  if (total === null) {
    var reason = 'FBM không trả số khách ở bước đếm cuối lượt; dữ liệu của lượt đã ghi, lượt sau sẽ đếm lại.';
    state.phase = 'error'; state.cursor = {}; state.entity = ''; state.lastFailureCode = 'FBM_CUSTOMER_COUNT_INVALID'; state.lastError = reason; state.message = reason;
    FbmSync.stateWrite(state);
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'customer_count_failed', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: reason, detail: { code: state.lastFailureCode } }); }
    return { ok: false, code: state.lastFailureCode, request: null, error: reason, status: FbmSync.statusView() };
  }
  var baseline = FbmSync.customerBaselineRead(), changed = FbmSync.customerCountChanged(total);
  state.phase = 'done'; state.cursor = {}; state.entity = '';
  state.message = tail.message || FbmSync.runDoneMessage(state);
  FbmSync.stateWrite(state);
  if (!changed) { return { ok: true, request: null, status: FbmSync.statusView() }; }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'customer_count_changed', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: baseline === null ? 'Chưa có số khách mốc; chạy Quét nhanh để lấy mốc.' : 'Số khách FBM đổi từ ' + baseline + ' thành ' + total + '; chạy Quét nhanh ngay.', detail: { baseline: baseline, total: total } }); }
  return FbmSync.recountStart(tail.mode || state.mode, state.origin);
};

/** Quét nhanh do bước đếm gọi: chiều đếm của lượt vừa xong, cùng nguồn; không đi qua công tắc tiến trình và không dời mốc lịch nào. */
FbmSync.recountStart = function (mode, origin) {
  var started = FbmSync.start({ mode: mode, scan: 'full', pack: 'quick', origin: origin, manual: false });
  if (started && started.ok && started.request) { FbmSync.statePatch({ message: FbmSync.RECOUNT_MESSAGE }); started.status = FbmSync.statusView(); }
  return started;
};
