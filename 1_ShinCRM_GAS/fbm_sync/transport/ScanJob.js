/**
 * Việc quét (Tài liệu 09/01 "Việc quét"): GAS cấp `scan_job` để Extension gọi FBM một lần và cắt gói, rồi xin từng gói bằng `scan_chunk`.
 * GAS sở hữu cursor: gói chỉ được ghi khi `jobId` và số thứ tự khớp cursor; cursor chỉ tăng sau khi gói đã ghi xong, nên ghi lỗi thì lần sau xin lại đúng gói đó.
 * Mất tab hoặc Extension mất việc thì chạy lại cả việc từ gói đầu; cửa ghi idempotent nên gói đã ghi ghi lại không đổi gì.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SCAN_ID_FIELDS = { customer: 'stt_rec_kh', activity: 'id' };

/** Mở việc quét cho trang đang mô tả trong cursor; `attempt` đổi thì `jobId` đổi, gói của lần chạy trước bị coi là gói lạ. */
FbmSync.scanJobOpen = function (state, cursor) {
  cursor.kind = 'scan_job';
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

/** Dựng request cho đúng vị trí cursor: chưa nhận gói nào thì gọi FBM, đã có thì xin gói kế từ RAM của tab. */
FbmSync.scanJobRequest = function (state) {
  var cursor = state.cursor || {}, budget = FbmSync.BUDGET;
  if (Number(cursor.chunkCount || 0) > 0) {
    var cfg = FbmSync.scriptSettings();
    return { url: cfg.baseUrl + FbmSync.ENDPOINTS.grid, body: {}, meta: { kind: 'scan_chunk', entity: cursor.entity, job: { jobId: cursor.jobId, chunkIndex: Number(cursor.next || 0) } } };
  }
  var request = FbmSync.customerGridRequest({ type: Number(cursor.type || 0), count: Number(cursor.count || budget.scanCustomerRows), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue || null, pageItems: cursor.pageItems || null, gridRefresh: false });
  request.meta.kind = 'scan_job';
  request.meta.job = { jobId: cursor.jobId, fields: FbmSync.scanFields(cursor.entity), idField: FbmSync.SCAN_ID_FIELDS[cursor.entity], keepIds: null, chunkTargetBytes: budget.chunkTargetBytes, chunkMaxBytes: budget.chunkMaxBytes };
  return request;
};

/** Gói lạ là lỗi hợp đồng: dừng phiên, không ghi gì, Sidebar và Log cùng thấy. */
FbmSync.scanJobMismatch = function (state, message) {
  var code = 'FBM_SCAN_JOB_MISMATCH', failed = FbmSync.stateFailRun(message, code).failed;
  state = FbmSync.stateRead();
  if (!failed) { state.phase = 'error'; state.lastFailureCode = code; state.lastError = message; state.message = message; FbmSync.stateWrite(state); }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'scan_job_mismatch', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: message, detail: { code: code } }); }
  return { ok: false, code: code, request: null, error: message, status: FbmSync.statusView() };
};

/**
 * Đối chiếu gói với cursor trước mọi xử lý. Trả `{ chunk }` khi đúng gói đang chờ, `{ result }` khi phải dừng hoặc xin lại gói.
 * Gói trùng (số thứ tự nhỏ hơn gói đang chờ, cùng việc) bỏ qua và xin lại gói đang chờ; gói khác việc, vượt trước hoặc tổng số dòng đổi giữa chừng là gói lạ.
 */
FbmSync.scanJobAccept = function (state, cursor, rawResponse) {
  var job = rawResponse && rawResponse.job;
  if (!job || typeof job !== 'object') { return { result: FbmSync.scanJobMismatch(state, 'Extension trả response không có khối việc quét dù GAS đã cấp việc quét; Extension hoặc Sidebar đang chạy bản lệch hợp đồng. Đã dừng và không ghi gì.') }; }
  var index = Number(job.chunkIndex), next = Number(cursor.next || 0);
  if (String(job.jobId || '') !== String(cursor.jobId || '') || !(index >= 0) || index > next) {
    return { result: FbmSync.scanJobMismatch(state, 'Gói quét "' + String(job.jobId || '') + '" số ' + String(job.chunkIndex) + ' không khớp việc quét đang chờ (gói số ' + next + '); đã dừng và không ghi gì.') };
  }
  if (index < next) {
    if (FbmSync.traceEvent) { FbmSync.traceEvent('scan_chunk_duplicate', { operation: 'scan_job', entity: cursor.entity, error: 'gói ' + index + ' đã ghi, xin lại gói ' + next }); }
    return { result: { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView() } };
  }
  if (cursor.jobTotal !== null && cursor.jobTotal !== undefined && Number(job.totalRowCount) !== Number(cursor.jobTotal)) {
    return { result: FbmSync.scanJobMismatch(state, 'Tổng số dòng FBM đổi giữa các gói của cùng một việc quét (' + cursor.jobTotal + ' và ' + job.totalRowCount + '); đã dừng và không ghi gì.') };
  }
  return { chunk: { index: index, count: Number(job.chunkCount || 0), rowCount: Number(job.rowCount || 0), totalRowCount: Number(job.totalRowCount || 0), oversize: Array.isArray(job.oversize) ? job.oversize : [] } };
};

/** Ghi nhận gói đã ghi xong; gọi sau khi Sheet và state của gói đã lưu. */
FbmSync.scanJobAdvance = function (cursor, chunk) {
  cursor.chunkCount = chunk.count;
  cursor.jobTotal = chunk.totalRowCount;
  cursor.next = chunk.index + 1;
  return cursor.next >= cursor.chunkCount;
};

/** Dòng mà riêng nó đã vượt trần một gói không về GAS: ghi Log từng dòng; lượt quét thiếu dòng nên không gắn cờ "không thấy". */
FbmSync.scanJobOversize = function (state, entity, ids) {
  if (!ids.length) { return; }
  state.metadata.scanOversize = Number(state.metadata.scanOversize || 0) + ids.length;
  if (typeof logEvent !== 'function') { return; }
  ids.forEach(function (id) { logEvent({ source: 'fbm_sync', action: 'scan_row_oversize', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: 'Một dòng ' + entity + ' FBM lớn hơn trần một gói nên không chuyển được về ShinCRM; lượt này không gắn cờ "không thấy bên FBM".', detail: { entity: entity, fbmId: String(id || '') } }); });
};

/**
 * Tab không còn giữ việc quét: chạy lại cả việc với lần thử mới, tối đa `scanJobRestarts` lần rồi dừng lỗi.
 * Trả kết quả cho cổng lỗi vận chuyển; `null` khi cursor không phải việc quét.
 */
FbmSync.scanJobRestart = function (state, code, message) {
  var cursor = state.cursor || {};
  if (cursor.kind !== 'scan_job' || String(code || '') !== 'FBM_SCAN_JOB_GONE') { return null; }
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now();
  if (Number(cursor.restarts || 0) >= FbmSync.BUDGET.scanJobRestarts) {
    var text = 'Tab FBM mất việc quét ' + (Number(cursor.restarts || 0) + 1) + ' lần liên tiếp (tab tải lại hoặc Extension khởi động lại); đã dừng. Giữ tab FBM mở và chạy lại.';
    FbmSync.stateWrite(state);
    FbmSync.stateFailRun(text, 'FBM_SCAN_JOB_GONE');
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'scan_job_gone', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: text, detail: { restarts: Number(cursor.restarts || 0) } }); }
    return { ok: false, code: 'FBM_SCAN_JOB_GONE', request: null, error: text, status: FbmSync.statusView() };
  }
  cursor.restarts = Number(cursor.restarts || 0) + 1;
  cursor.attempt = Number(cursor.attempt || 0) + 1;
  state.metadata = state.metadata || {};
  if (state.metadata.customerScan) { state.metadata.customerScan.seen = Number(cursor.seenBefore || 0); }
  FbmSync.scanJobOpen(state, cursor);
  state.message = 'Tab FBM mất việc quét; đang chạy lại lần ' + cursor.restarts + '/' + FbmSync.BUDGET.scanJobRestarts + '.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'scan_job_restart', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', cycleId: String(state.runId || ''), reason: String(message || 'Tab FBM không còn giữ việc quét.').slice(0, 240), detail: { restarts: cursor.restarts } }); }
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), restarted: true };
};
