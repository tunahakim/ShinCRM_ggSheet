/**
 * Lấy toàn bộ giao dịch ShinCRM đã biết (Tài liệu 09/02 Phần 8 lớp 1): chỉ đánh dấu, không ghi Sheet. Giao dịch sửa, mang cờ cần xét lại hoặc vắng thì khách cha theo Sheet vào danh sách đọc; cửa ghi đọc lại khách đó, tra mã rồi mới ghi hoặc gắn cờ.
 * Lưới giao dịch FBM không có cột khách, nên khách cha của mỗi dòng tra từ chính giao dịch đó trên Sheet; giao dịch mới thuộc lớp 2 và 3.
 * Quá lớn, hết hạn fetch, không parse được hoặc FBM trả thiếu dòng thì ngay trong lượt chia cửa sổ ngày. Giao dịch đổi ngày giữa hai cửa sổ có thể bị coi là vắng; khi đó chỉ tốn một lần đọc khách cha, không gắn cờ nhầm vì cờ do cửa ghi quyết.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

// Mã lỗi Extension báo khi một request lấy cả khoảng thời gian là quá sức; lỗi phiên và lỗi mạng khác không đổi cách lấy.
FbmSync.ACTIVITY_WINDOW_CODES = ['FBM_SCAN_TOO_LARGE', 'FBM_SCAN_UNPARSEABLE', 'FBM_FETCH_TIMEOUT'];

/** Giao dịch được theo dõi: có FBM ID, không phải tombstone hay dòng tạm, khách cha cho phép lấy về. Một chỗ cho lớp 1 lẫn bước đối chiếu vắng mặt của cửa ghi. */
FbmSync.activityBulkTracker = function () {
  var pullAllowed = FbmSync.pullAllowedReader('activity');
  return function (record) {
    return !!String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('activity', record) && pullAllowed(record);
  };
};

FbmSync.activityKeepIds = function (local) {
  return (local || []).filter(FbmSync.activityBulkTracker()).map(function (record) { return String(record.fbmId).trim(); });
};

/** Khóa ngày cộng số ngày, theo lịch UTC để không lệch vì giờ mùa hè hay múi giờ máy chạy. */
FbmSync.dayKeyAdd = function (key, days) {
  var parts = String(key).split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + Number(days))).toISOString().slice(0, 10);
};

/** Cửa sổ thứ `windowIndex`: cửa sổ đầu không chặn dưới, cửa sổ chứa hôm nay không chặn trên, để giao dịch ngày tương lai hay đổi về trước ngày sớm nhất vẫn nằm trong một cửa sổ. "Hôm nay" là `cursor.today`, chốt lúc chuyển sang cửa sổ, nên mọi lát của lượt chia cùng một cách. */
FbmSync.activityWindow = function (cursor) {
  var days = FbmSync.BUDGET.activityWindowDays, index = Number(cursor.windowIndex || 0), start = String(cursor.windowStart || '');
  var to = FbmSync.dayKeyAdd(start, (index + 1) * days - 1), last = to >= String(cursor.today || '');
  return { from: index ? FbmSync.dayKeyAdd(start, index * days) : '', to: last ? '' : to, last: last };
};

/** Bộ lọc ngày của cửa sổ theo đúng mẫu FBM: hai đầu đều lấy ngày biên, nên cửa sổ sau bắt đầu từ ngày kế ngày cuối cửa sổ trước. */
FbmSync.activityWindowFilters = function (cursor) {
  var window = FbmSync.activityWindow(cursor), lower = FbmSync.fbmFilterDate(window.from), upper = FbmSync.fbmFilterDate(window.to);
  if (lower && upper) { return ['end_date:>=' + lower + '\u0000<=' + upper + '\u0000']; }
  if (lower) { return ['end_date:>=' + lower]; }
  return upper ? ['end_date:<=' + upper] : [];
};

/** Request FBM của việc quét giao dịch; cursor chế độ cửa sổ thì lọc theo cửa sổ, không thì lấy mọi giao dịch. */
FbmSync.activityScanRequest = function (cursor, cfg) {
  return FbmSync.activityBulkRequest({ type: 0, count: FbmSync.BUDGET.scanActivityRows, gridPageIndex: -1, gridRefresh: false, filter: cursor.window ? FbmSync.activityWindowFilters(cursor) : [] }, cfg);
};

/** Mở lớp 1 trên ô lượt được truyền vào, không ghi ô lượt. Sheet chưa có giao dịch FBM nào thì không có gì để đối soát: trả `null`, không gọi FBM. */
FbmSync.beginActivityBulkPull = function (state, cfg) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  var local = FbmSync.readLocal('activity');
  state.metadata = state.metadata || {};
  state.metadata.activityBulk = { windows: 0, missing: 0 };
  if (!local.some(FbmSync.activityBulkTracker())) { return null; }
  FbmSync.seenStoreBegin(FbmSync.ACTIVITY_BULK_STORE, local);
  FbmSync.scanJobOpen(state, { entity: 'activity', page: 0, window: false });
  state.message = 'Đang lấy toàn bộ giao dịch đã có trên ShinCRM từ FBM...';
  return FbmSync.scanJobRequest(state, cfg, null);
};

/** Ngày sớm nhất của giao dịch đang theo dõi, làm mốc cửa sổ; không đọc được ngày nào thì lấy `today` (một cửa sổ mở hai đầu). */
FbmSync.activityWindowStart = function (local, today) {
  var first = '', tracked = FbmSync.activityBulkTracker();
  (local || []).forEach(function (record) {
    if (!tracked(record)) { return; }
    var key = FbmSync.dateNormalize(record.workDate);
    if (key && (!first || key < first)) { first = key; }
  });
  return first || today;
};

/**
 * Lấy cả khoảng thời gian là quá sức: chuyển sang cửa sổ ngày ngay trong lượt và trả request cửa sổ đầu. Đã ở chế độ cửa sổ thì không chia tiếp: ném đúng mã lỗi kèm dòng Log, không gắn cờ "không thấy".
 * Thuần trên bản sao ô lượt; `windowStart` (ngày sớm nhất của giao dịch đang theo dõi), `now` và cài đặt dựng request `cfg` do người gọi truyền.
 */
FbmSync.activityWindowPlan = function (state, code, message, windowStart, now, cfg) {
  var cursor = state.cursor, reason = String(message || '').slice(0, 240), days = FbmSync.BUDGET.activityWindowDays;
  if (cursor.window) {
    var window = FbmSync.activityWindow(cursor), text = 'Một khoảng ' + days + ' ngày giao dịch (' + (window.from || 'đầu') + ' đến ' + (window.to || 'nay') + ') vẫn quá lớn để lấy trong một lần: ' + reason + ' Đã dừng, không gắn cờ "không thấy bên FBM".';
    var failed = new Error(text);
    failed.code = code;
    failed.logs = [{ action: 'activity_bulk_failed', outcome: LOG_ERROR, reason: text, detail: { code: code, windowIndex: Number(cursor.windowIndex || 0) } }];
    throw failed;
  }
  FbmSync.scanJobOpen(state, { entity: 'activity', page: 0, window: true, windowIndex: 0, windowStart: windowStart, today: FbmSync.dateNormalize(new Date(now)) });
  var log = { action: 'activity_bulk_window', outcome: LOG_WARN, reason: 'Lấy toàn bộ giao dịch một lần không được (' + reason + '); chuyển sang từng khoảng ' + days + ' ngày trong lượt này.', detail: { code: code, windowStart: windowStart } };
  return { patch: { cursor: state.cursor, message: 'Lấy toàn bộ giao dịch một lần quá lớn; đang lấy theo từng khoảng ' + days + ' ngày.', logs: [log] }, next: FbmSync.scanJobRequest(state, cfg, null) };
};

/** Khách cha theo Sheet của các giao dịch đã biết, theo FBM ID giao dịch; `stt_rec_kh` của khách cha là mã vào danh sách đọc. */
FbmSync.activityParentSttIndex = function (local, customers) {
  var stt = {}, parents = {};
  (customers || []).forEach(function (customer) { stt[String(customer.id || '').trim()] = String(customer.fbmId || '').trim(); });
  (local || []).forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId) { parents[fbmId] = stt[String(record.customerId || '').trim()] || ''; } });
  return parents;
};

/** Đầu vào của chặng, đọc qua cổng chủ một lần mỗi lát. */
FbmSync.activityScanInputs = function (state) {
  return { local: FbmSync.readLocal('activity'), customers: FbmSync.readLocal('customer'), gate: FbmSync.stateCategoryGate(state) };
};

/**
 * Một nhóm dòng FBM của giao dịch đã biết: đánh dấu đã thấy; giao dịch sửa hoặc mang cờ cần xét lại thì khách cha vào danh sách đọc. Không ghi Sheet. Trả số khách được thêm.
 * Dấu vân so trên bản ghi dựng như cửa ghi kéo về dựng (`activityRecord`), vì dấu vân trên Sheet tính trên nội dung đã bỏ dấu #SC; so trên dòng thô thì giao dịch mang dấu luôn bị coi là sửa.
 */
FbmSync.activityBulkAccept = function (rows, seenIds, input) {
  var byFbmId = {}, parents = FbmSync.activityParentSttIndex(input.local, input.customers), tracked = FbmSync.activityBulkTracker(), marked = [];
  input.local.forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId && tracked(record)) { byFbmId[fbmId] = record; } });
  rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).forEach(function (row) {
    var fbmId = String(row.id || '').trim(), record = byFbmId[fbmId];
    if (record && (FbmSync.readAgainStatus(record) || String(record.fbmHash || '') !== FbmSync.activityRecord(row, input.gate, null).incomingHash)) { marked.push(parents[fbmId]); }
  });
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_BULK_STORE, input.local, rows.concat((seenIds || []).map(function (id) { return { id: id }; })));
  return FbmSync.readListAdd(marked);
};

/**
 * Chặng quét giao dịch (lớp 1): nhận một gói, đánh dấu rồi mới tiến cursor. Hết gói thì sang cửa sổ kế, hết cửa sổ thì đánh dấu khách cha của giao dịch vắng và trả `end`.
 * FBM trả ít dòng hơn tổng nó báo ở gói đầu nghĩa là một lần lấy không đủ: chuyển sang cửa sổ, không đánh dấu gói thiếu.
 */
FbmSync.activityScanStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var state = ctx.state, cursor = state.cursor, input = ctx.inputs, logs = [];
  var accepted = FbmSync.scanReplyCheck(ctx.reply, cursor);
  if (accepted.duplicate) {
    logs.push({ action: 'scan_chunk_duplicate', outcome: LOG_WARN, reason: 'Extension trả lại gói quét đã nhận (gói ' + accepted.duplicate + '); xin lại gói ' + Number(cursor.next || 0) + '.' });
    return { patch: { logs: logs }, next: FbmSync.scanJobRequest(state, ctx.settings, null) };
  }
  var chunk = accepted.chunk;
  if (chunk.index === 0 && chunk.rowCount < chunk.totalRowCount) {
    var today = FbmSync.dateNormalize(new Date(ctx.now));
    return FbmSync.activityWindowPlan(state, 'FBM_SCAN_INCOMPLETE', 'FBM chỉ trả ' + chunk.rowCount + '/' + chunk.totalRowCount + ' giao dịch trong một lần lấy.', FbmSync.activityWindowStart(input.local, today), ctx.now, ctx.settings);
  }
  var grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(ctx.reply)), oversize = chunk.index === 0 ? chunk.oversize : [];
  var imported = FbmSync.activityBulkAccept(grid.rows, oversize, input);
  // Dòng quá lớn không về được nhưng chắc chắn còn trên FBM: coi là đã thấy, không cập nhật.
  if (oversize.length) { state.metadata.scanOversize = Number(state.metadata.scanOversize || 0) + oversize.length; logs = logs.concat(FbmSync.scanOversizeLogs('activity', oversize)); }
  var patch = { metadata: { scanOversize: state.metadata.scanOversize }, logs: logs };
  // Cùng một lưới giao dịch với lô đọc chi tiết: lưu tên cột gốc để lô sau xin trang không tiêu đề.
  if (grid.sourceFields) { state.metadata.activityFields = grid.sourceFields; patch.metadata.activityFields = grid.sourceFields; }
  if (!FbmSync.scanJobAdvance(cursor, chunk)) { patch.cursor = cursor; return { patch: patch, next: FbmSync.scanJobRequest(state, ctx.settings, null) }; }
  if (cursor.window && !FbmSync.activityWindow(cursor).last) {
    cursor.windowIndex = Number(cursor.windowIndex || 0) + 1; cursor.page = cursor.windowIndex; cursor.attempt = 0; cursor.restarts = 0;
    FbmSync.scanJobOpen(state, cursor);
    patch.cursor = state.cursor;
    return { patch: patch, next: FbmSync.scanJobRequest(state, ctx.settings, null) };
  }
  patch.cursor = cursor;
  var absent = FbmSync.activityBulkAbsent(input, cursor.window ? Number(cursor.windowIndex || 0) + 1 : 0);
  patch.metadata.activityBulk = absent.summary;
  logs.push(absent.log);
  return { patch: patch, end: { imported: imported } };
};

/** Lớp 1 đã nhận đủ: khách cha của giao dịch đã biết mà FBM không trả vào danh sách đọc, xóa sổ đã thấy, trả sổ tổng và dòng Log cho chặng. */
FbmSync.activityBulkAbsent = function (input, windows) {
  var hasSeen = FbmSync.seenStoreReader(FbmSync.ACTIVITY_BULK_STORE), tracked = FbmSync.activityBulkTracker(), parents = FbmSync.activityParentSttIndex(input.local, input.customers), absent = [], sample = [];
  input.local.forEach(function (record) {
    if (!tracked(record) || hasSeen(record)) { return; }
    absent.push(parents[String(record.fbmId).trim()]);
    if (sample.length < 20) { sample.push({ id: String(record.id || ''), fbmId: String(record.fbmId || '') }); }
  });
  FbmSync.seenStoreClear(FbmSync.ACTIVITY_BULK_STORE);
  var added = FbmSync.readListAdd(absent), summary = { windows: windows, missing: 0, absent: absent.length, sample: sample };
  var reason = 'Đã đối chiếu toàn bộ giao dịch ShinCRM đã biết với FBM' + (windows ? ' theo ' + windows + ' khoảng ngày' : ' trong một lần lấy') + '; ' + absent.length + ' giao dịch FBM không trả, ' + added + ' khách được đánh dấu để đọc chi tiết.';
  return { summary: summary, log: { action: 'activity_bulk_done', outcome: LOG_OK, reason: reason, detail: summary } };
};

/** Bước kết của chặng: mở chặng đọc kế của lượt. */
FbmSync.activityScanEnd = function (state, end) {
  return FbmSync.runTail(FbmSync.activityStagesContinue(state, { imported: end.imported }));
};
