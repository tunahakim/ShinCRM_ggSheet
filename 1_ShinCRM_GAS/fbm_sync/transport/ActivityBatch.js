/**
 * Lô Activity: một lần gọi GAS nhận giao dịch của nhiều khách (Tài liệu 09/01 "Lô request đọc độc lập", 09/05 "Chỉ kết luận vắng mặt khi lượt quét đầy đủ").
 * GAS giữ kế hoạch lô trong cursor; response chỉ được đối chiếu với kế hoạch đó, id phần tử là thứ tự trong lô.
 * Cursor phải lọt một khóa state (9.000 byte) nên chỉ giữ chỉ số khách trong trang (`batch`). Vị trí trang của khách còn trang sau nằm ở khóa riêng: cả lô đều còn trang sau thì chừng đó vị trí không lọt khóa state; kho nạp một lần và ghi gộp mỗi lời gọi nên khóa riêng không tốn thêm lần gọi kho.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.ACTIVITY_PAGES_KEY = 'FBM_SYNC_ACTIVITY_PAGES';

/** Gắn runId để lượt sau không đọc nhầm vị trí trang của lượt bỏ dở. */
FbmSync.activityPagesRead = function (state) {
  var raw = FbmSync.props().getProperty(FbmSync.ACTIVITY_PAGES_KEY), value = raw ? JSON.parse(raw) : null;
  return value && value.runId === String(state.runId || '') ? value.pages || {} : {};
};
FbmSync.activityPagesWrite = function (state, pages) {
  var props = FbmSync.props();
  if (Object.keys(pages).length) { props.setProperty(FbmSync.ACTIVITY_PAGES_KEY, JSON.stringify({ runId: String(state.runId || ''), pages: pages })); return; }
  if (!props.getProperty(FbmSync.ACTIVITY_PAGES_KEY)) { return; }
  if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.ACTIVITY_PAGES_KEY); } else { props.setProperty(FbmSync.ACTIVITY_PAGES_KEY, ''); }
};

/**
 * Hàng đợi khách cần đọc giao dịch của lượt quét: khách đã thấy trong lượt (bitmap `customer`), lấy theo số CUS tăng dần từ `queueFrom`.
 * Cursor chỉ giữ vị trí và tối đa một lô mã khách, nên state không phình theo số khách; khách mới tạo trong lượt có số lớn hơn mốc của bitmap nên vẫn được đọc.
 */
FbmSync.activityQueueRefill = function (cursor) {
  var hasSeen = FbmSync.seenStoreReader('customer'), hasDue = cursor.layer === 'due' ? FbmSync.seenStoreReader(FbmSync.ACTIVITY_DUE_STORE) : null, from = Number(cursor.queueFrom), picked = [];
  FbmSync.readLocal('customer').forEach(function (record) {
    var index = FbmSync.seenStoreIndex('customer', record), fbmId = String(record && record.fbmId || '').trim();
    if (index < from || !fbmId || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('customer', record) || !hasSeen(record) || (hasDue && !hasDue(record))) { return; }
    picked.push({ index: index, sttRec: fbmId });
  });
  picked.sort(function (a, b) { return a.index - b.index; });
  picked = picked.slice(0, FbmSync.BUDGET.activityBatchCustomers);
  cursor.customers = picked.map(function (item) { return item.sttRec; });
  cursor.customerIndex = 0;
  cursor.queueFrom = picked.length ? picked[picked.length - 1].index + 1 : -1;
};

/** Lấp kế hoạch lô bằng khách chưa quét, tối đa `activityBatchCustomers`; hết danh sách mà còn hàng đợi thì lấy lô mã khách kế tiếp. */
FbmSync.activityBatchPlan = function (cursor) {
  var drained = !(cursor.batch || []).length && Number(cursor.customerIndex || 0) >= (cursor.customers || []).length;
  if (drained && cursor.layer === 'top') { FbmSync.activityTopRefill(cursor); }
  else if (drained && cursor.queueFrom !== undefined && Number(cursor.queueFrom) >= 0) { FbmSync.activityQueueRefill(cursor); }
  var plan = (cursor.batch || []).slice(), customers = cursor.customers || [], next = Number(cursor.customerIndex || 0);
  while (plan.length < FbmSync.BUDGET.activityBatchCustomers && next < customers.length) { plan.push(next); next += 1; }
  cursor.batch = plan; cursor.customerIndex = next;
  return plan;
};

/**
 * Dựng lại lô từ cursor; cùng cursor luôn ra cùng lô nên chạy lại sau probe hoặc thử lại là idempotent.
 * Chỉ khi lượt chưa có danh sách cột thì phần tử trang đầu đầu tiên lấy kèm tiêu đề; các phần tử khác đọc cột theo danh sách đó.
 */
FbmSync.activityBatchRequest = function (state) {
  var cursor = state.cursor || {}, plan = cursor.batch || [], customers = cursor.customers || [], pages = FbmSync.activityPagesRead(state), count = Number(cursor.count || 100);
  var needHeader = !(state.metadata && Array.isArray(state.metadata.activityFields) && state.metadata.activityFields.length);
  if (!plan.length) { return null; }
  return { items: plan.map(function (index) {
    var page = pages[index], options;
    if (page) { options = { type: 1, count: count, gridPageIndex: page[0], gridPageValue: page[1], gridRefresh: false }; }
    else if (needHeader) { needHeader = false; options = { type: 0, count: count, gridPageIndex: -1, gridRefresh: false }; }
    else { options = { type: 1, count: count, gridPageIndex: FbmSync.GRID_FIRST_PAGE_NO_HEADER, gridRefresh: false }; }
    return FbmSync.activityGridRequest(String(customers[index]), options);
  }), meta: { kind: 'batch', entity: 'activity' } };
};

/** Mã FBM của khách cha tra từ một chỉ mục dựng một lần mỗi lời gọi; chế độ không ghi Sheet thì khách mới chưa có trên Sheet nên mã để trống. */
FbmSync.activityParentCodes = function () {
  var codes = {};
  (FbmSync.readLocal('customer') || []).forEach(function (item) {
    var fbmId = String(item.fbmId || '').trim();
    if (fbmId) { codes[fbmId] = String(item.fbmCustomerCode || '').trim(); }
  });
  return codes;
};

/** Lỗi của một khách không làm hỏng lô: Log từng khách, Sidebar thấy 20 khách gần nhất cùng tổng số. */
FbmSync.activityCustomerErrors = function (state, failed) {
  if (!failed.length) { return; }
  var previous = state.metadata.customerErrors || { total: 0, recent: [] };
  state.metadata.customerErrors = { total: Number(previous.total || 0) + failed.length, recent: (previous.recent || []).concat(failed).slice(-20) };
  state.counts.error = Number(state.counts.error || 0) + failed.length;
  if (typeof logEvent !== 'function') { return; }
  failed.forEach(function (item) {
    logEvent({ source: 'fbm_sync', action: 'activity_customer_failed', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: item.reason, detail: { customer: item.customer, code: item.code, status: item.status } });
  });
};

/** Lô lệch kế hoạch hoặc lệch cấu trúc cột là lỗi của cả lô: dừng phiên, không ghi gì. */
FbmSync.activityBatchMismatch = function (state, message, failureCode) {
  var code = failureCode || 'FBM_BATCH_ITEM_MISMATCH', failed = FbmSync.stateFailRun(message, code).failed;
  state = FbmSync.stateRead();
  if (!failed) { state.phase = 'error'; state.lastFailureCode = code; state.lastError = message; state.message = message; FbmSync.stateWrite(state); }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_batch_mismatch', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: message, detail: { code: code } }); }
  return { ok: false, code: code, request: null, error: message, status: FbmSync.statusView() };
};

/**
 * Nhận một lô: phần tử nghi phiên thì cả lô không ghi và đi đường probe (cursor còn nguyên nên dựng lại đúng lô); lỗi của một khách thì bỏ khách đó; mọi bản ghi đạt ghi bằng một lần `pullRecords`.
 * Trả `{ request }` khi còn lô kế trong trang, `{ done: true }` khi trang đã quét xong để PullFlow chuyển bước.
 */
FbmSync.activityBatchContinue = function (state, cursor, rawResponse) {
  var plan = cursor.batch || [], customers = cursor.customers || [], items = rawResponse && rawResponse.items, received = {}, bad = '';
  if (!Array.isArray(items) || !items.length) { return { result: FbmSync.activityBatchMismatch(state, 'Response giao dịch không phải lô hoặc lô rỗng dù GAS đã cấp lô; Extension hoặc Sidebar đang chạy bản lệch hợp đồng.') }; }
  items.forEach(function (item) {
    var id = String(item && item.id);
    if (!/^\d+$/.test(id) || Number(id) >= plan.length || received[id]) { bad = bad || id; }
    received[id] = item;
  });
  if (bad) { return { result: FbmSync.activityBatchMismatch(state, 'Lô giao dịch trả phần tử "' + bad + '" không có trong kế hoạch hoặc bị trùng; đã dừng và không ghi gì.') }; }
  var checks = plan.map(function (index, position) { var item = received[String(position)]; return { index: index, item: item, check: item ? FbmSync.protocol.assertSuccess(item) : null }; });
  if (checks.some(function (entry) { return entry.check && entry.check.code === 'SESSION_SUSPECTED'; })) {
    var probe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ trong lô giao dịch; chưa ghi gì, đang probe lại phiên.');
    return { result: probe ? { ok: true, request: probe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError } };
  }
  var gate = FbmSync.stateCategoryGate(state), parents = FbmSync.activityParentCodes(), pages = FbmSync.activityPagesRead(state), nextPlan = [], nextPages = {}, records = [], failed = [], finished = 0, isFresh = FbmSync.activityFreshIndex(), outcomes = [];
  state.metadata = state.metadata || {};
  checks.forEach(function (entry) {
    var fields = entry.check && entry.check.ok && !(state.metadata.activityFields || []).length ? FbmSync.gridFields(entry.item) : [];
    if (fields.length) { state.metadata.activityFields = fields; }
  });
  try { checks.forEach(function (entry) {
    var sttRec = String(customers[entry.index] || ''), parent = { sttRec: sttRec, maKh: parents[sttRec] || '' };
    if (!entry.item) { nextPlan.push(entry.index); if (pages[entry.index]) { nextPages[entry.index] = pages[entry.index]; } return; }
    finished += 1;
    if (!entry.check.ok) {
      failed.push({ customer: parent.maKh || sttRec, code: String(entry.check.code || 'FBM_ERROR'), status: Number(entry.check.status || 0), reason: String(entry.check.bug && (entry.check.bug.Message || entry.check.bug.message) || 'FBM trả lỗi khi đọc giao dịch của khách') });
      outcomes.push({ sttRec: sttRec, fresh: null });
      return;
    }
    // Khách giữ tiêu đề bị lỗi thì cả lô chưa có danh sách cột: xếp lại các khách còn lại, lô sau sẽ có một khách lấy tiêu đề.
    if (!(state.metadata.activityFields || []).length) { finished -= 1; nextPlan.push(entry.index); return; }
    var grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(entry.item), state.metadata.activityFields);
    state.metadata.activityFields = grid.fields;
    var customerRecords = grid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('activity', row); }).map(function (row) { return FbmSync.activityRecord(row, gate, parent); });
    records = records.concat(customerRecords);
    // Khách chạm trần một lần đọc chưa được đọc đủ: không vào tập "đã đọc" để giao dịch của khách không bị gắn cờ "không thấy".
    outcomes.push({ sttRec: sttRec, fresh: isFresh(customerRecords), complete: grid.rows.length < Number(cursor.count || FbmSync.BUDGET.activityCustomerRows) });
    // Trang đầy nghĩa là có thể còn giao dịch chưa đọc: báo lỗi khách để lượt này không đánh dấu "không thấy bên FBM" nhầm.
    if (grid.rows.length >= Number(cursor.count || FbmSync.BUDGET.activityCustomerRows)) {
      failed.push({ customer: parent.maKh || sttRec, code: 'FBM_ACTIVITY_PAGE_LIMIT', status: 0, reason: 'Khách có từ ' + grid.rows.length + ' giao dịch trở lên, vượt trần một lần đọc; đã ghi phần đã đọc, phần còn lại chưa đọc và giao dịch của khách không bị đánh dấu không thấy bên FBM.' });
    }
  }); } catch (shapeError) {
    if (shapeError && shapeError.code === 'FBM_GRID_SHAPE_CHANGED') { return { result: FbmSync.activityBatchMismatch(state, shapeError.message, shapeError.code) }; }
    throw shapeError;
  }
  FbmSync.activityCustomerErrors(state, failed);
  state.cursor.batch = nextPlan;
  FbmSync.activityPagesWrite(state, nextPages);
  FbmSync.stateWrite(state);
  if (records.length) {
    FbmSync.pullRecords('activity', records, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords('activity', records);
  }
  FbmSync.progressCustomersDone(state, finished);
  FbmSync.activityReadMark(outcomes.filter(function (item) { return item.complete; }).map(function (item) { return item.sttRec; }), outcomes.filter(function (item) { return item.fresh; }).map(function (item) { return item.sttRec; }), outcomes.map(function (item) { return item.sttRec; }));
  if (state.cursor.layer === 'top') { FbmSync.activityTopAccount(state.cursor, outcomes); }
  if (state.cursor.layer) { FbmSync.activityLayerProgress(state, false); }
  FbmSync.activityBatchPlan(state.cursor);
  var request = FbmSync.activityBatchRequest(state);
  FbmSync.stateWrite(state);
  return request ? { result: { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView(), imported: records.length } } : { done: true, state: state, imported: records.length };
};
