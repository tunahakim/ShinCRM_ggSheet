/**
 * Lấy toàn bộ giao dịch ShinCRM đã biết (Tài liệu 09/02 Phần 8 lớp 1): chỉ đánh dấu, không ghi Sheet. Giao dịch sửa, mang cờ cần xét lại hoặc vắng thì khách cha theo Sheet vào danh sách đọc; cửa ghi đọc lại khách đó, tra mã rồi mới ghi hoặc gắn cờ.
 * Lưới giao dịch FBM không có cột khách, nên khách cha của mỗi dòng tra từ chính giao dịch đó trên Sheet; giao dịch mới thuộc lớp 2 và 3.
 * Quá lớn, hết hạn fetch, không parse được hoặc FBM trả thiếu dòng thì ngay trong lượt chia cửa sổ ngày. Giao dịch đổi ngày giữa hai cửa sổ có thể bị coi là vắng; khi đó chỉ tốn một lần đọc khách cha, không gắn cờ nhầm vì cờ do cửa ghi quyết.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.ACTIVITY_BULK_STORE = 'activity_bulk';
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

/** Cửa sổ thứ `windowIndex`: cửa sổ đầu không chặn dưới, cửa sổ chứa hôm nay không chặn trên, để giao dịch ngày tương lai hay đổi về trước ngày sớm nhất vẫn nằm trong một cửa sổ. */
FbmSync.activityWindow = function (cursor) {
  var days = FbmSync.BUDGET.activityWindowDays, index = Number(cursor.windowIndex || 0), start = String(cursor.windowStart || '');
  var to = FbmSync.dayKeyAdd(start, (index + 1) * days - 1), last = to >= FbmSync.activityDateKey(new Date());
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
FbmSync.activityScanRequest = function (cursor) {
  return FbmSync.activityBulkRequest({ type: 0, count: FbmSync.BUDGET.scanActivityRows, gridPageIndex: -1, gridRefresh: false, filter: cursor.window ? FbmSync.activityWindowFilters(cursor) : [] });
};

/** Mở lớp 1. Sheet chưa có giao dịch FBM nào thì không có gì để đối soát: trả `null`, không gọi FBM. */
FbmSync.beginActivityBulkPull = function (state) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
    FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  }
  var local = FbmSync.readLocal('activity');
  state.metadata = state.metadata || {};
  state.metadata.activityBulk = { windows: 0, missing: 0 };
  if (!local.some(FbmSync.activityBulkTracker())) { return null; }
  FbmSync.seenStoreBegin(FbmSync.ACTIVITY_BULK_STORE, local);
  FbmSync.scanJobOpen(state, { entity: 'activity', page: 0, window: false });
  state.message = 'Đang lấy toàn bộ giao dịch đã có trên ShinCRM từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.scanJobRequest(state);
};

/** Ngày sớm nhất của giao dịch đang theo dõi, làm mốc cửa sổ; không đọc được ngày nào thì lấy hôm nay (một cửa sổ mở hai đầu). */
FbmSync.activityWindowStart = function () {
  var first = '', tracked = FbmSync.activityBulkTracker();
  FbmSync.readLocal('activity').forEach(function (record) {
    if (!tracked(record)) { return; }
    var key = FbmSync.activityDateKey(record.workDate);
    if (key && (!first || key < first)) { first = key; }
  });
  return first || FbmSync.activityDateKey(new Date());
};

/**
 * Lấy cả khoảng thời gian là quá sức: chuyển sang cửa sổ ngày ngay trong lượt và trả request cửa sổ đầu. Đã ở chế độ cửa sổ thì không chia tiếp: dừng lỗi, không gắn cờ "không thấy".
 * Trả `null` khi cursor không phải việc quét giao dịch đang chờ request FBM, để lỗi đi tiếp đường chung.
 */
FbmSync.activityScanToWindows = function (state, code, message) {
  var cursor = state.cursor || {};
  if (cursor.kind !== 'scan_job' || cursor.entity !== 'activity' || Number(cursor.chunkCount || 0) > 0) { return null; }
  var reason = String(message || '').slice(0, 240), warn = typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn';
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now();
  if (cursor.window) {
    var window = FbmSync.activityWindow(cursor), text = 'Một khoảng ' + FbmSync.BUDGET.activityWindowDays + ' ngày giao dịch (' + (window.from || 'đầu') + ' đến ' + (window.to || 'nay') + ') vẫn quá lớn để lấy trong một lần: ' + reason + ' Đã dừng, không gắn cờ "không thấy bên FBM".';
    FbmSync.stateWrite(state);
    FbmSync.stateFailRun(text, code);
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_bulk_failed', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: text, detail: { code: code, windowIndex: Number(cursor.windowIndex || 0) } }); }
    return { ok: false, code: code, request: null, error: text, status: FbmSync.statusView() };
  }
  FbmSync.scanJobOpen(state, { entity: 'activity', page: 0, window: true, windowIndex: 0, windowStart: FbmSync.activityWindowStart() });
  state.message = 'Lấy toàn bộ giao dịch một lần quá lớn; đang lấy theo từng khoảng ' + FbmSync.BUDGET.activityWindowDays + ' ngày.';
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_bulk_window', outcome: warn, cycleId: String(state.runId || ''), reason: 'Lấy toàn bộ giao dịch một lần không được (' + reason + '); chuyển sang từng khoảng ' + FbmSync.BUDGET.activityWindowDays + ' ngày trong lượt này.', detail: { code: code, windowStart: state.cursor.windowStart } }); }
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView() };
};

/** Khách cha theo Sheet của các giao dịch đã biết, theo FBM ID giao dịch; `stt_rec_kh` của khách cha là mã vào danh sách đọc. */
FbmSync.activityParentSttIndex = function (local) {
  var stt = {}, parents = {};
  FbmSync.readLocal('customer').forEach(function (customer) { stt[String(customer.id || '').trim()] = String(customer.fbmId || '').trim(); });
  (local || []).forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId) { parents[fbmId] = stt[String(record.customerId || '').trim()] || ''; } });
  return parents;
};

/** Một nhóm dòng FBM của giao dịch đã biết: đánh dấu đã thấy; giao dịch sửa (dấu vân khác) hoặc mang cờ cần xét lại thì khách cha vào danh sách đọc. Không ghi Sheet. Trả số khách được thêm. */
FbmSync.activityBulkAccept = function (state, rows, seenIds) {
  var local = FbmSync.readLocal('activity'), byFbmId = {}, parents = FbmSync.activityParentSttIndex(local), gate = FbmSync.stateCategoryGate(state), tracked = FbmSync.activityBulkTracker(), marked = [];
  local.forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId && tracked(record)) { byFbmId[fbmId] = record; } });
  rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).forEach(function (row) {
    var fbmId = String(row.id || '').trim(), record = byFbmId[fbmId];
    if (record && (FbmSync.readAgainStatus(record) || String(record.fbmHash || '') !== FbmSync.hash(row, 'activity', gate))) { marked.push(parents[fbmId]); }
  });
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_BULK_STORE, local, rows.concat((seenIds || []).map(function (id) { return { id: id }; })));
  return FbmSync.readListAdd(marked);
};

/**
 * Nhận một gói của việc quét giao dịch: đánh dấu rồi mới tăng cursor. Hết gói thì sang cửa sổ kế, hết cửa sổ thì đánh dấu khách cha của giao dịch vắng.
 * FBM trả ít dòng hơn tổng nó báo nghĩa là một lần lấy không đủ: chuyển sang cửa sổ, không ghi gói thiếu.
 */
FbmSync.activityScanChunk = function (state, cursor, rawResponse) {
  var accepted = FbmSync.scanJobAccept(state, cursor, rawResponse), grid;
  if (accepted.result) { return accepted.result; }
  var chunk = accepted.chunk;
  if (chunk.index === 0 && chunk.rowCount < chunk.totalRowCount) {
    return FbmSync.activityScanToWindows(state, 'FBM_SCAN_INCOMPLETE', 'FBM chỉ trả ' + chunk.rowCount + '/' + chunk.totalRowCount + ' giao dịch trong một lần lấy.');
  }
  try { grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(rawResponse)); } catch (shapeError) { return FbmSync.scanJobMismatch(state, String(shapeError && shapeError.message || shapeError)); }
  var oversize = chunk.index === 0 ? chunk.oversize : [];
  var imported = FbmSync.activityBulkAccept(state, grid.rows, oversize);
  state = FbmSync.stateRead(); cursor = state.cursor;
  // Dòng quá lớn không về được nhưng chắc chắn còn trên FBM: coi là đã thấy, không cập nhật.
  FbmSync.scanJobOversize(state, 'activity', oversize);
  if (!FbmSync.scanJobAdvance(cursor, chunk)) {
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), imported: imported };
  }
  if (cursor.window && !FbmSync.activityWindow(cursor).last) {
    cursor.windowIndex = Number(cursor.windowIndex || 0) + 1; cursor.page = cursor.windowIndex; cursor.attempt = 0; cursor.restarts = 0;
    FbmSync.scanJobOpen(state, cursor);
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.scanJobRequest(state)), status: FbmSync.statusView(), imported: imported };
  }
  state.metadata.activityBulk = { windows: cursor.window ? Number(cursor.windowIndex || 0) + 1 : 0, missing: 0 };
  return FbmSync.activityBulkEnd(state, { imported: imported });
};

/** Lớp 1 đã nhận đủ: khách cha của giao dịch đã biết mà FBM không trả vào danh sách đọc, ghi Log một dòng tổng, rồi sang chặng kế. */
FbmSync.activityBulkEnd = function (state, extra) {
  var hasSeen = FbmSync.seenStoreReader(FbmSync.ACTIVITY_BULK_STORE), tracked = FbmSync.activityBulkTracker(), local = FbmSync.readLocal('activity'), parents = FbmSync.activityParentSttIndex(local), absent = [], sample = [];
  local.forEach(function (record) {
    if (!tracked(record) || hasSeen(record)) { return; }
    absent.push(parents[String(record.fbmId).trim()]);
    if (sample.length < 20) { sample.push({ id: String(record.id || ''), fbmId: String(record.fbmId || '') }); }
  });
  FbmSync.seenStoreClear(FbmSync.ACTIVITY_BULK_STORE);
  var added = FbmSync.readListAdd(absent);
  state.metadata.activityBulk = Object.assign({ windows: 0 }, state.metadata.activityBulk || {}, { absent: absent.length, sample: sample });
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_bulk_done', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: 'Đã đối chiếu toàn bộ giao dịch ShinCRM đã biết với FBM' + (state.metadata.activityBulk.windows ? ' theo ' + state.metadata.activityBulk.windows + ' khoảng ngày' : ' trong một lần lấy') + '; ' + absent.length + ' giao dịch FBM không trả, ' + added + ' khách được đánh dấu để đọc chi tiết.', detail: state.metadata.activityBulk }); }
  return FbmSync.activityStagesContinue(state, Object.assign({}, extra || {}));
};
