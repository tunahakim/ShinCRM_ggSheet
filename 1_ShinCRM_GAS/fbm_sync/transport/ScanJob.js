/**
 * Việc quét (Tài liệu 09/01 "Việc quét"): GAS cấp `scan_job` để Extension gọi FBM một lần và cắt gói, rồi xin từng gói bằng `scan_chunk`.
 * GAS sở hữu cursor: gói chỉ được ghi khi `jobId` và số thứ tự khớp cursor; cursor chỉ tăng sau khi gói đã ghi xong, nên ghi lỗi thì lần sau xin lại đúng gói đó.
 * Mất tab hoặc Extension mất việc thì chạy lại cả việc từ gói đầu; cửa ghi idempotent nên gói đã ghi ghi lại không đổi gì.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SCAN_ID_FIELDS = { customer: 'stt_rec_kh', activity: 'id' };
// Kiểu cursor theo thực thể, cả hai là chặng theo hợp đồng chung trong `CURSOR_TABLE` (`customer_scan`, `scan_job` của giao dịch). Phong bì gửi Extension vẫn mang `scan_job`/`scan_chunk`.
FbmSync.SCAN_CURSOR_KINDS = { customer: 'customer_scan', activity: 'scan_job' };
FbmSync.isScanCursor = function (cursor) { var kind = String(cursor && cursor.kind || ''); return kind === FbmSync.SCAN_CURSOR_KINDS.customer || kind === FbmSync.SCAN_CURSOR_KINDS.activity; };

/** Mở việc quét cho trang đang mô tả trong cursor; `attempt` đổi thì `jobId` đổi, gói của lần chạy trước bị coi là gói lạ. */
FbmSync.scanJobOpen = function (state, cursor) {
  cursor.kind = FbmSync.SCAN_CURSOR_KINDS[cursor.entity];
  cursor.attempt = Number(cursor.attempt || 0);
  cursor.page = Number(cursor.page || 0);
  cursor.jobId = String(state.runId || '') + ':' + cursor.entity + ':' + cursor.page + ':' + cursor.attempt;
  cursor.next = 0; cursor.chunkCount = 0; cursor.jobTotal = null;
  state.metadata = state.metadata || {};
  // Số khách đã nhận trước trang này: chạy lại việc thì trả về mốc này để không đếm trùng các gói đã nhận.
  cursor.seenBefore = Number(state.metadata.customerScan && state.metadata.customerScan.seen || 0);
  state.cursor = cursor;
  return cursor;
};

/** Request lấy danh sách toàn bộ khách tại vị trí trang của cursor; bước "Đếm khách" dựng từ chính hàm này với `count: 1` nên hai bên luôn cùng phạm vi, cùng bộ lọc. `keep` là `{ sourceFields }` hoặc `{ keepFields }` chuyển nguyên cho `gridRequest`. */
FbmSync.customerListRequest = function (cursor, keep) {
  var value = cursor || {};
  return FbmSync.customerGridRequest(Object.assign({ type: Number(value.type || 0), count: Number(value.count || FbmSync.BUDGET.scanCustomerRows), gridPageIndex: value.pageIndex === undefined ? -1 : value.pageIndex, gridPageValue: value.pageValue || null, pageItems: value.pageItems || null, gridRefresh: false }, keep || {}));
};

/** Dựng request cho đúng vị trí cursor: chưa nhận gói nào thì gọi FBM, đã có thì xin gói kế từ RAM của tab. */
FbmSync.scanJobRequest = function (state) {
  var cursor = state.cursor || {}, budget = FbmSync.BUDGET;
  if (Number(cursor.chunkCount || 0) > 0) {
    var cfg = FbmSync.scriptSettings();
    return { url: cfg.baseUrl + FbmSync.ENDPOINTS.grid, body: {}, meta: { kind: 'scan_chunk', entity: cursor.entity, job: { jobId: cursor.jobId, chunkIndex: Number(cursor.next || 0) } } };
  }
  var activity = cursor.entity === 'activity';
  // Trang khách sau trang đầu không có tiêu đề: cắt theo tên cột gốc trang đầu đã lưu. Cột giữ lại đi qua `meta.keep` do `gridRequest` dựng như mọi request đọc lưới.
  var request = activity ? FbmSync.activityScanRequest(cursor) : FbmSync.customerListRequest(cursor, { sourceFields: (state.metadata || {}).customerFields });
  request.meta.kind = 'scan_job'; request.meta.entity = cursor.entity;
  // Giao dịch chỉ giữ id đã có trên Sheet: lưới giao dịch không có cột khách nên dòng lạ không ghép được khách cha. Extension tìm id theo vị trí trong dòng đã cắt.
  request.meta.job = { jobId: cursor.jobId, idIndex: FbmSync.scanFields(cursor.entity).indexOf(FbmSync.SCAN_ID_FIELDS[cursor.entity]), keepIds: activity ? FbmSync.activityKeepIds(FbmSync.readLocal('activity')) : null, chunkTargetBytes: budget.chunkTargetBytes, chunkMaxBytes: budget.chunkMaxBytes, maxResponseBytes: budget.scanMaxResponseBytes };
  return request;
};

/**
 * Đối chiếu gói với cursor trước mọi xử lý, không đọc kho, không ghi: `{ chunk }` khi đúng gói đang chờ, `{ duplicate: số gói }` khi Extension trả lại gói đã nhận (cùng việc, số nhỏ hơn gói đang chờ), còn lại ném `FBM_SCAN_JOB_MISMATCH` (khác việc, vượt trước, tổng số dòng đổi giữa chừng, thiếu khối việc quét).
 */
FbmSync.scanReplyCheck = function (rawResponse, cursor) {
  var job = rawResponse && rawResponse.job, mismatch = function (message) { var error = new Error(message); error.code = 'FBM_SCAN_JOB_MISMATCH'; throw error; };
  if (!job || typeof job !== 'object') { mismatch('Extension trả response không có khối việc quét dù GAS đã cấp việc quét; Extension hoặc Sidebar đang chạy bản lệch hợp đồng. Đã dừng và không ghi gì.'); }
  var index = Number(job.chunkIndex), next = Number(cursor.next || 0);
  if (String(job.jobId || '') !== String(cursor.jobId || '') || !(index >= 0) || index > next) { mismatch('Gói quét "' + String(job.jobId || '') + '" số ' + String(job.chunkIndex) + ' không khớp việc quét đang chờ (gói số ' + next + '); đã dừng và không ghi gì.'); }
  if (index < next) { return { duplicate: String(index) }; }
  if (cursor.jobTotal !== null && cursor.jobTotal !== undefined && Number(job.totalRowCount) !== Number(cursor.jobTotal)) { mismatch('Tổng số dòng FBM đổi giữa các gói của cùng một việc quét (' + cursor.jobTotal + ' và ' + job.totalRowCount + '); đã dừng và không ghi gì.'); }
  return { chunk: { index: index, count: Number(job.chunkCount || 0), rowCount: Number(job.rowCount || 0), totalRowCount: Number(job.totalRowCount || 0), oversize: Array.isArray(job.oversize) ? job.oversize : [] } };
};

/** Ghi nhận gói đã ghi xong; gọi sau khi Sheet và state của gói đã lưu. */
FbmSync.scanJobAdvance = function (cursor, chunk) {
  cursor.chunkCount = chunk.count;
  cursor.jobTotal = chunk.totalRowCount;
  cursor.next = chunk.index + 1;
  return cursor.next >= cursor.chunkCount;
};

/** Dòng Log cho từng dòng quá cỡ, để người gọi ghi. */
FbmSync.scanOversizeLogs = function (entity, ids) {
  return ids.map(function (id) { return { action: 'scan_row_oversize', outcome: LOG_ERROR, reason: 'Một dòng ' + entity + ' FBM lớn hơn trần một gói nên không chuyển được về ShinCRM; dòng này không bị gắn cờ "không thấy bên FBM".', detail: { entity: entity, fbmId: String(id || '') } }; });
};

/**
 * Tab không còn giữ việc quét: chạy lại cả việc với lần thử mới, tối đa `scanJobRestarts` lần rồi ném `FBM_SCAN_JOB_GONE` kèm dòng Log.
 * Thuần trên bản sao ô lượt; chỉ chạy khi `transportRecoverPlan` chọn `scan_restart` (cursor đang là việc quét, mã `FBM_SCAN_JOB_GONE`).
 */
FbmSync.scanRestartPlan = function (state, message) {
  var cursor = state.cursor, restarts = Number(cursor.restarts || 0), max = FbmSync.BUDGET.scanJobRestarts;
  if (restarts >= max) {
    var text = 'Tab FBM mất việc quét ' + (restarts + 1) + ' lần liên tiếp (tab tải lại hoặc Extension khởi động lại); đã dừng. Giữ tab FBM mở và chạy lại.', gone = new Error(text);
    gone.code = 'FBM_SCAN_JOB_GONE';
    gone.logs = [{ action: 'scan_job_gone', outcome: LOG_ERROR, reason: text, detail: { restarts: restarts } }];
    throw gone;
  }
  cursor.restarts = restarts + 1;
  cursor.attempt = Number(cursor.attempt || 0) + 1;
  var patch = { logs: [{ action: 'scan_job_restart', outcome: LOG_WARN, reason: String(message || 'Tab FBM không còn giữ việc quét.').slice(0, 240), detail: { restarts: cursor.restarts } }] };
  // Số khách đã nhận trả về mốc trước trang này để không đếm trùng các gói sẽ nhận lại; `scanJobOpen` đọc mốc này.
  if (state.metadata && state.metadata.customerScan) { state.metadata.customerScan = Object.assign({}, state.metadata.customerScan, { seen: Number(cursor.seenBefore || 0) }); patch.metadata = { customerScan: state.metadata.customerScan }; }
  FbmSync.scanJobOpen(state, cursor);
  patch.cursor = state.cursor;
  patch.message = 'Tab FBM mất việc quét; đang chạy lại lần ' + cursor.restarts + '/' + max + '.';
  return { patch: patch, next: FbmSync.scanJobRequest(state) };
};

/**
 * Người điều phối đường cứu việc quét khi Extension báo lỗi gửi request: bỏ request đang chờ, đọc đầu vào qua cổng chủ, chạy công cụ cứu mà `transportRecoverPlan` đã chọn trên bản sao ô lượt rồi phát request. Công cụ ném lỗi thì `runSlice` đóng lượt với đúng mã đó.
 */
FbmSync.scanRecoverRun = function (state, plan, code, message) {
  var now = Date.now(), windows = plan === 'activity_windows';
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = now;
  var windowStart = windows ? FbmSync.activityWindowStart(FbmSync.readLocal('activity'), FbmSync.dateNormalize(new Date(now))) : '';
  var out = FbmSync.stageCall(state, function (copy) { return windows ? FbmSync.activityWindowPlan(copy, code, message, windowStart, now) : FbmSync.scanRestartPlan(copy, message); });
  var result = { ok: true, request: FbmSync.nextEnvelope(out.next), status: FbmSync.statusView() };
  if (!windows) { result.restarted = true; }
  return result;
};
