/**
 * Lấy toàn bộ giao dịch ShinCRM đã biết (Tài liệu 09/02 Phần 8 lớp 1, 09/05 "Chỉ kết luận vắng mặt khi lượt quét đầy đủ"): một việc quét chỉ giữ các FBM ID đang có trên Sheet, GAS đối soát từng gói, chỉ gắn cờ "không thấy" sau khi đã nhận đủ.
 * Lưới giao dịch FBM không có cột khách, nên khách cha của mỗi dòng tra từ chính giao dịch đó trên Sheet; vì vậy tầng này chỉ đối soát giao dịch đã biết, giao dịch mới thuộc lớp 2 và 3.
 * Quá lớn, hết hạn fetch, không parse được hoặc FBM trả thiếu dòng thì ngay trong lượt chia cửa sổ ngày. Giao dịch có thể đổi ngày giữa hai cửa sổ nên ở chế độ cửa sổ, ứng viên "không thấy" được đọc lại theo id trước khi gắn cờ.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.ACTIVITY_BULK_STORE = 'activity_bulk';
// Mã lỗi Extension báo khi một request lấy cả khoảng thời gian là quá sức; lỗi phiên và lỗi mạng khác không đổi cách lấy.
FbmSync.ACTIVITY_WINDOW_CODES = ['FBM_SCAN_TOO_LARGE', 'FBM_SCAN_UNPARSEABLE', 'FBM_FETCH_TIMEOUT'];

/** Giao dịch tầng này theo dõi: có FBM ID, không phải tombstone, dòng tạm hay nằm trước mốc `activitySince`. Một chỗ cho cả danh sách id gửi Extension lẫn luật "không thấy". */
FbmSync.activityBulkTracked = function (record) {
  return !!String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('activity', record) && FbmSync.activitySinceAllows(record);
};

FbmSync.activityKeepIds = function (local) {
  return (local || []).filter(FbmSync.activityBulkTracked).map(function (record) { return String(record.fbmId).trim(); });
};

/** Khóa ngày cộng số ngày, theo lịch UTC để không lệch vì giờ mùa hè hay múi giờ máy chạy. */
FbmSync.dayKeyAdd = function (key, days) {
  var parts = String(key).split('-');
  return new Date(Date.UTC(Number(parts[0]), Number(parts[1]) - 1, Number(parts[2]) + Number(days))).toISOString().slice(0, 10);
};

/** Cửa sổ thứ `windowIndex`: cửa sổ đầu không chặn dưới (chỉ mốc `activitySince`), cửa sổ chứa hôm nay không chặn trên, để giao dịch ngày tương lai hay đổi về trước ngày sớm nhất vẫn nằm trong một cửa sổ. */
FbmSync.activityWindow = function (cursor) {
  var days = FbmSync.BUDGET.activityWindowDays, index = Number(cursor.windowIndex || 0), start = String(cursor.windowStart || '');
  var to = FbmSync.dayKeyAdd(start, (index + 1) * days - 1), last = to >= FbmSync.activityDateKey(new Date());
  return { from: index ? FbmSync.dayKeyAdd(start, index * days) : '', to: last ? '' : to, last: last };
};

/** Bộ lọc ngày của cửa sổ theo đúng mẫu FBM: hai đầu đều lấy ngày biên, nên cửa sổ sau bắt đầu từ ngày kế ngày cuối cửa sổ trước. */
FbmSync.activityWindowFilters = function (cursor) {
  var window = FbmSync.activityWindow(cursor), since = String(FbmSync.scriptSettings().activitySince || '').trim();
  var lower = FbmSync.activitySinceFilterDate(window.from || since), upper = FbmSync.activitySinceFilterDate(window.to);
  if (lower && upper) { return ['end_date:>=' + lower + '\u0000<=' + upper + '\u0000']; }
  if (lower) { return ['end_date:>=' + lower]; }
  return upper ? ['end_date:<=' + upper] : [];
};

/** Request FBM của việc quét giao dịch; cursor chế độ cửa sổ thì lọc theo cửa sổ, không thì lấy cả khoảng từ mốc `activitySince`. */
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
  if (!local.some(FbmSync.activityBulkTracked)) {
    state.cursor = { kind: 'activity_bulk_done' };
    return state.scan === 'full' ? null : FbmSync.activityBulkSupplement(state);
  }
  FbmSync.seenStoreBegin(FbmSync.ACTIVITY_BULK_STORE, local);
  FbmSync.scanJobOpen(state, { entity: 'activity', page: 0, window: false });
  state.message = 'Đang lấy toàn bộ giao dịch đã có trên ShinCRM từ FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.scanJobRequest(state);
};

/** Ngày sớm nhất của giao dịch đang theo dõi, làm mốc cửa sổ; không đọc được ngày nào thì lấy hôm nay (một cửa sổ mở hai đầu). */
FbmSync.activityWindowStart = function () {
  var first = '';
  FbmSync.readLocal('activity').forEach(function (record) {
    if (!FbmSync.activityBulkTracked(record)) { return; }
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

/** Mã FBM của khách cha cho từng giao dịch đã biết, tra qua giao dịch trên Sheet rồi khách trên Sheet. */
FbmSync.activityParentByFbmId = function (local) {
  var codes = {}, parents = {};
  FbmSync.readLocal('customer').forEach(function (customer) { codes[String(customer.id || '').trim()] = String(customer.fbmCustomerCode || '').trim(); });
  (local || []).forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    if (fbmId) { parents[fbmId] = { maKh: codes[String(record.customerId || '').trim()] || '' }; }
  });
  return parents;
};

/** Đối soát một nhóm dòng FBM của giao dịch đã biết qua cửa ghi chung và đánh dấu đã thấy. Trả số bản ghi đã đưa vào cửa ghi. */
FbmSync.activityBulkAccept = function (state, rows, seenIds) {
  var local = FbmSync.readLocal('activity'), parents = FbmSync.activityParentByFbmId(local), gate = FbmSync.stateCategoryGate(state);
  var records = rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, gate, parents[String(row.id || '').trim()] || {}); });
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_BULK_STORE, local, rows.concat((seenIds || []).map(function (id) { return { id: id }; })));
  if (records.length) {
    FbmSync.pullRecords('activity', records, state.mode);
    FbmSync.previewRecords('activity', records);
  }
  return records.length;
};

/**
 * Nhận một gói của việc quét giao dịch: ghi qua cửa ghi rồi mới tăng cursor. Hết gói thì sang cửa sổ kế, đọc lại ứng viên theo id (chế độ cửa sổ) hoặc chốt "không thấy".
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
  if (cursor.window) {
    state.cursor = { kind: 'activity_recheck', recheckFrom: 0, recheck: [] };
    var recheck = FbmSync.activityRecheckNext(state);
    if (recheck) { return { ok: true, request: FbmSync.nextEnvelope(recheck), status: FbmSync.statusView(), imported: imported }; }
  }
  return FbmSync.activityBulkEnd(state, { imported: imported });
};

/** Ứng viên "không thấy" kế tiếp theo số ACT tăng dần, tối đa một lô; cursor chỉ giữ số ACT nên state không phình theo số ứng viên. */
FbmSync.activityRecheckNext = function (state) {
  var cursor = state.cursor, hasSeen = FbmSync.seenStoreReader(FbmSync.ACTIVITY_BULK_STORE), from = Number(cursor.recheckFrom || 0), picked = [];
  if (!(cursor.recheck || []).length) {
    FbmSync.readLocal('activity').forEach(function (record) {
      var index = FbmSync.seenStoreIndex(FbmSync.ACTIVITY_BULK_STORE, record);
      if (index >= from && FbmSync.activityBulkTracked(record) && !hasSeen(record)) { picked.push(index); }
    });
    picked.sort(function (a, b) { return a - b; });
    cursor.recheck = picked.slice(0, FbmSync.BUDGET.activityBatchCustomers);
    cursor.recheckFrom = cursor.recheck.length ? cursor.recheck[cursor.recheck.length - 1] + 1 : from;
  }
  FbmSync.stateWrite(state);
  return FbmSync.activityRecheckRequest(state);
};

/** Lô đọc lại theo id dựng từ cursor; cùng cursor ra cùng lô nên thử lại sau probe là idempotent. */
FbmSync.activityRecheckRequest = function (state) {
  var plan = state.cursor && state.cursor.recheck || [], byIndex = {};
  if (!plan.length) { return null; }
  FbmSync.readLocal('activity').forEach(function (record) { byIndex[FbmSync.seenStoreIndex(FbmSync.ACTIVITY_BULK_STORE, record)] = String(record.fbmId || '').trim(); });
  return { items: plan.map(function (index) { return FbmSync.activityByIdRequest(byIndex[index] || ''); }), meta: { kind: 'batch', entity: 'activity' } };
};

/**
 * Nhận lô đọc lại: giao dịch FBM còn thì đối soát và coi là đã thấy; FBM trả lỗi cho một giao dịch thì không kết luận được nên cũng coi là đã thấy và báo lỗi; giao dịch FBM trả rỗng mới là "không thấy".
 * Phần tử nghi phiên thì cả lô không ghi và đi đường probe; phần tử Extension chưa chạy (bấm Dừng) ở lại lô sau.
 */
FbmSync.activityRecheckContinue = function (state, cursor, rawResponse) {
  var plan = cursor.recheck || [], items = rawResponse && rawResponse.items, received = {}, bad = '';
  if (!Array.isArray(items) || !items.length) { return FbmSync.activityBatchMismatch(state, 'Response đọc lại giao dịch không phải lô hoặc lô rỗng dù GAS đã cấp lô; Extension hoặc Sidebar đang chạy bản lệch hợp đồng.'); }
  items.forEach(function (item) {
    var id = String(item && item.id);
    if (!/^\d+$/.test(id) || Number(id) >= plan.length || received[id]) { bad = bad || id; }
    received[id] = item;
  });
  if (bad) { return FbmSync.activityBatchMismatch(state, 'Lô đọc lại giao dịch trả phần tử "' + bad + '" không có trong kế hoạch hoặc bị trùng; đã dừng và không ghi gì.'); }
  var checks = plan.map(function (index, position) { var item = received[String(position)]; return { index: index, item: item, check: item ? FbmSync.protocol.assertSuccess(item) : null }; });
  if (checks.some(function (entry) { return entry.check && entry.check.code === 'SESSION_SUSPECTED'; })) {
    var probe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ khi đọc lại giao dịch; chưa ghi gì, đang probe lại phiên.');
    return probe ? { ok: true, request: probe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError };
  }
  var fbmIdOf = {}, rows = [], unsure = [], failed = [], pending = [];
  FbmSync.readLocal('activity').forEach(function (record) { fbmIdOf[FbmSync.seenStoreIndex(FbmSync.ACTIVITY_BULK_STORE, record)] = String(record.fbmId || '').trim(); });
  try { checks.forEach(function (entry) {
    var fbmId = fbmIdOf[entry.index] || '';
    if (!entry.item) { pending.push(entry.index); return; }
    if (!entry.check.ok) {
      unsure.push(fbmId);
      failed.push({ customer: 'giao dịch ' + fbmId, code: String(entry.check.code || 'FBM_ERROR'), status: Number(entry.check.status || 0), reason: 'FBM trả lỗi khi đọc lại một giao dịch không thấy trong các khoảng ngày; giao dịch này không bị gắn cờ "không thấy bên FBM". ' + String(entry.check.bug && (entry.check.bug.Message || entry.check.bug.message) || '') });
      return;
    }
    rows = rows.concat(FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(entry.item)).rows);
  }); } catch (shapeError) {
    if (shapeError && shapeError.code === 'FBM_GRID_SHAPE_CHANGED') { return FbmSync.activityBatchMismatch(state, shapeError.message, shapeError.code); }
    throw shapeError;
  }
  FbmSync.activityCustomerErrors(state, failed);
  state.cursor.recheck = pending;
  FbmSync.stateWrite(state);
  var imported = FbmSync.activityBulkAccept(state, rows, unsure);
  state = FbmSync.stateRead();
  var request = FbmSync.activityRecheckNext(state);
  if (request) { return { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView(), imported: imported }; }
  return FbmSync.activityBulkEnd(FbmSync.stateRead(), { imported: imported });
};

/** Lớp 1 đã nhận đủ: gắn cờ "không thấy", ghi Log một dòng tổng, rồi chốt lượt (gói quét) hoặc sang phần bổ sung (lượt lấy giao dịch chạy nền). */
FbmSync.activityBulkEnd = function (state, extra) {
  // Ghi state của lời gọi trước khi gắn cờ: bước gắn cờ đọc lại state từ kho nên thay đổi chưa ghi (dòng quá lớn, số khoảng ngày) sẽ mất.
  FbmSync.stateWrite(state);
  var missing = FbmSync.writeActivityBulkMissing(FbmSync.readLocal('activity'));
  state = FbmSync.stateRead();
  state.metadata.activityBulkMissing = missing.sample;
  state.metadata.activityBulkMissingCount = missing.total;
  state.metadata.activityBulk = Object.assign({ windows: 0 }, state.metadata.activityBulk || {}, { missing: missing.total });
  FbmSync.seenStoreClear(FbmSync.ACTIVITY_BULK_STORE);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_bulk_done', outcome: missing.total ? (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn') : (typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok'), cycleId: String(state.runId || ''), reason: 'Đã đối soát toàn bộ giao dịch ShinCRM đã biết với FBM' + (state.metadata.activityBulk.windows ? ' theo ' + state.metadata.activityBulk.windows + ' khoảng ngày' : ' trong một lần lấy') + '; ' + missing.total + ' giao dịch không còn thấy bên FBM.', detail: state.metadata.activityBulk }); }
  var result = Object.assign({}, extra || {}, { missing: missing.total });
  if (state.scan === 'full') {
    state.cursor = { kind: 'activity_bulk_done' };
    FbmSync.stateWrite(state);
    return FbmSync.pullFinishOrPush(state, result);
  }
  var request = FbmSync.activityBulkSupplement(state);
  FbmSync.stateWrite(state);
  return Object.assign({ ok: true, request: request ? FbmSync.nextEnvelope(request) : null, status: FbmSync.statusView() }, result);
};

/** Lượt lấy giao dịch chạy nền: sau lớp 1 tìm khách có giao dịch mới hơn mốc trên Sheet, rồi xoay vòng khách để bắt giao dịch tạo lùi ngày; hết thì chốt lượt. */
FbmSync.activityBulkSupplement = function (state) {
  var catchupRequest = typeof FbmSync.activityCatchupCustomerRequest === 'function' ? FbmSync.activityCatchupCustomerRequest() : null;
  if (catchupRequest) {
    state.cursor = { kind: 'activity_catchup_customer_grid' };
    state.message = 'Đang tìm Customer có giao dịch mới hơn mốc local...';
    return catchupRequest;
  }
  var rotationRequest = typeof FbmSync.activityRotationCustomerRequest === 'function' ? FbmSync.activityRotationCustomerRequest() : null;
  if (rotationRequest) {
    state.cursor = { kind: 'activity_rotation_customer_grid' };
    state.message = 'Đang xoay 30 Customer để bắt giao dịch tạo lùi ngày...';
    return rotationRequest;
  }
  state.cursor = {}; state.phase = 'done'; state.entity = '';
  state.message = 'Đã đọc xong toàn bộ giao dịch FBM.';
  return null;
};
