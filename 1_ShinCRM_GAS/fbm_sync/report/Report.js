/** Ghi Log trạng thái lượt, gom vấn đề theo bản ghi và bản xem trước; không tự tạo request FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Bộ gom vấn đề theo bản ghi trong RAM của một lần chạy GAS. Một lát xử lý đúng một response FBM, nên mỗi nhóm
 * (chiều, entity, trạng thái, lý do) thành đúng một dòng Log có số lượng và tối đa 20 mã; bản ghi bình thường chỉ cộng vào số liệu bước.
 */
FbmSync.RECORD_ISSUE_ID_LIMIT = 20;
FbmSync.recordIssues = {};
FbmSync.recordIssueAdd = function (direction, entity, status, id, reason, outcome) {
  var key = [direction, entity, status, reason].join('|'), group = FbmSync.recordIssues[key];
  if (!group) { group = FbmSync.recordIssues[key] = { direction: String(direction || ''), entity: String(entity || ''), status: String(status || ''), reason: String(reason || ''), outcome: outcome, count: 0, ids: [] }; }
  group.count += 1;
  if (id && group.ids.length < FbmSync.RECORD_ISSUE_ID_LIMIT) { group.ids.push(String(id)); }
  return group;
};
/** Ghi mỗi nhóm thành một dòng Log rồi xóa bộ gom; gọi ở ranh giới lát, kể cả khi lát ném lỗi. */
FbmSync.recordIssuesFlush = function (state) {
  var groups = FbmSync.recordIssues, keys = Object.keys(groups);
  FbmSync.recordIssues = {};
  if (!keys.length || typeof logEvent !== 'function') { return 0; }
  // Gọi từ cửa ghi state thì nhận luôn state đang ghi: đọc lại kho lúc đó trả bản cũ và tốn một lần đọc.
  state = state || FbmSync.stateRead();
  var cycleId = String(state.runId || state.metadata && state.metadata.businessRunId || '');
  keys.forEach(function (key) {
    var group = groups[key], more = group.count - group.ids.length;
    logEvent({ source: 'fbm_sync', action: group.direction + '_record_issue', outcome: group.outcome, entity: group.entity, recordId: group.count === 1 ? (group.ids[0] || '') : '', cycleId: cycleId, reason: group.reason + ' — ' + group.count + ' bản ghi' + (group.ids.length ? ': ' + group.ids.join(', ') : '') + (more > 0 ? ' và ' + more + ' bản ghi khác' : ''), detail: { status: group.status, count: group.count, ids: group.ids } });
  });
  return keys.length;
};

/** Ghi snapshot nghiệp vụ của ô lượt người gọi vừa đọc; payload/cookie không bao giờ đi vào Log. */
FbmSync.logStatus = function (state, action) {
  if (!state || typeof logEvent !== 'function') { return; }
  var phase = String(state.phase || 'idle');
  // Phiên có sổ bước nghiệp vụ đã có dòng mở/đóng bước (đóng tại stateWrite), nên không ghi thêm snapshot cho mỗi lát.
  if (state.runId && state.metadata && state.metadata.businessSteps) { return; }
  var outcome = phase === 'error' || state.lastError ? LOG_ERROR : (phase === 'conflict' ? LOG_CONFLICT : LOG_OK);
  var writer = outcome === LOG_ERROR || phase === 'done' ? logEvent : logTrace;
  writer({
    source: 'fbm_sync', action: action || 'slice', outcome: outcome,
    entity: state.entity || '', recordId: state.current || '',
    reason: state.message || FbmSync.statusLabel(phase) || phase,
    detail: { runId: String(state.runId || ''), phase: phase, cursor: String(state.cursor && state.cursor.kind || ''), direction: FbmSync.syncDirection(state), entityLabel: FbmSync.syncEntityLabel(state.entity, phase), counts: state.counts || {}, lastError: state.lastError || '' }
  });
};
/** Chỉ ghi khi đổi giai đoạn hoặc kết thúc để không làm chậm từng request FBM. */
FbmSync.shouldLogStatus = function (before, after) {
  if (!after) { return false; }
  var phase = String(after.phase || '');
  return phase === 'error' || phase === 'done' || phase === 'paused' || phase === 'conflict' || !before || String(before.phase || '') !== phase || String(before.entity || '') !== String(after.entity || '');
};
/**
 * Response bị bỏ vì không thuộc request đang chờ: không đổi state (lượt đang chạy vẫn là của request khác) nhưng phải có dòng Log, vì response bị bỏ lặp lại là lượt kẹt không ai thấy.
 * Response của request đang bay lúc người dùng dừng lượt (`closedRequestId`) là chuyện thường, ghi mức ok để Log không báo lỗi giả cho một lần dừng hợp lệ.
 * Chỉ ghi mã request, không ghi nội dung response.
 */
FbmSync.logStaleResponse = function (state, responseRequestId, action) {
  if (typeof logEvent !== 'function') { return; }
  var current = state || {};
  var closed = !!responseRequestId && String(responseRequestId) === String(current.closedRequestId || '');
  logEvent(closed
    ? { source: 'fbm_sync', action: 'closed_run_response_dropped', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Bỏ response FBM của lượt đã dừng; không ghi gì vào dữ liệu.', detail: { responseRequestId: String(responseRequestId) } }
    : { source: 'fbm_sync', action: action || 'stale_response', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(current.runId || ''), reason: 'Bỏ response FBM vì không thuộc request đang chờ; lượt giữ nguyên cursor và chờ lần hỏi sau.', detail: { code: 'STALE_RESPONSE', runId: String(current.runId || ''), phase: String(current.phase || ''), cursor: String(current.cursor && current.cursor.kind || ''), activeRequestId: String(current.activeRequestId || ''), responseRequestId: String(responseRequestId || '') } });
};
FbmSync.PREVIEW_KEY = 'FBM_SYNC_PREVIEW_V1';
FbmSync.PREVIEW_LIMIT = 10;
FbmSync.previewEmpty = function () { return { customers: [], activities: [], truncated: false }; };
FbmSync.previewRead = function () { return Object.assign(FbmSync.previewEmpty(), FbmSync.documentPropertyJson(FbmSync.PREVIEW_KEY, 'bản xem trước') || {}); };
FbmSync.previewClear = function () { FbmSync.documentPropertySet(FbmSync.PREVIEW_KEY, JSON.stringify(FbmSync.previewEmpty()), 'preview'); };

/**
 * Bản xem trước của lượt (vài khách, vài giao dịch đầu, nội dung cắt ngắn) để người dùng nhìn khi kiểm tra; nằm ở khóa riêng, không ở state, vì state chỉ giữ thứ cần để chạy tiếp và một khóa kho chỉ chứa 9 KB.
 * Gần chạm trần thì bỏ bớt dòng; ghi hỏng thì `documentPropertySet` ném lỗi và lượt dừng như mọi lỗi kho, để lỗi không bị bỏ qua.
 */
FbmSync.previewRecords = function (entity, records) {
  var preview = FbmSync.previewRead(), target = entity === 'customer' ? preview.customers : preview.activities, before = target.length;
  // Nội dung Activity có thể dài 4.000 ký tự; giữ nguyên thì một bản ghi cũng đủ chạm trần khóa.
  var clip = function (value, length) {
    var text = String(value === null || value === undefined ? '' : value);
    return text.length > length ? text.slice(0, length) + '...' : text;
  };
  (records || []).forEach(function (record) {
    if (target.length >= FbmSync.PREVIEW_LIMIT) { preview.truncated = true; return; }
    if (entity === 'customer') {
      target.push({ code: clip(record.fbmCustomerCode, 80), name: clip(record.companyName, 160), fbmId: clip(record.fbmId, 80) });
    } else {
      target.push({ customerCode: clip(record.customerId, 80), date: clip(record.workDate, 40), type: clip(record.taskType, 80), content: clip(record.content, 160) });
    }
  });
  if (target.length === before) { return preview; }
  var bytes = function () { return FbmSync.documentPropertyBytes(JSON.stringify(preview)); };
  while (bytes() > FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT && (preview.activities.length || preview.customers.length)) { preview.truncated = true; (preview.activities.length ? preview.activities : preview.customers).pop(); }
  FbmSync.documentPropertySet(FbmSync.PREVIEW_KEY, JSON.stringify(preview), 'preview');
  return preview;
};
