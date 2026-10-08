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

/** Lấp kế hoạch lô bằng khách chưa quét của trang Customer, tối đa `activityBatchCustomers`. */
FbmSync.activityBatchPlan = function (cursor) {
  var plan = (cursor.batch || []).slice(), customers = cursor.customers || [], next = Number(cursor.customerIndex || 0);
  while (plan.length < FbmSync.BUDGET.activityBatchCustomers && next < customers.length) { plan.push(next); next += 1; }
  cursor.batch = plan; cursor.customerIndex = next;
  return plan;
};

/** Dựng lại lô từ cursor; cùng cursor luôn ra cùng lô nên chạy lại sau probe hoặc thử lại là idempotent. */
FbmSync.activityBatchRequest = function (state) {
  var cursor = state.cursor || {}, plan = cursor.batch || [], customers = cursor.customers || [], pages = FbmSync.activityPagesRead(state);
  if (!plan.length) { return null; }
  return { items: plan.map(function (index) {
    var page = pages[index];
    return FbmSync.activityGridRequest(String(customers[index]), page ? { type: 1, count: Number(cursor.count || 100), gridPageIndex: page[0], gridPageValue: page[1], gridRefresh: false } : { type: 0, count: Number(cursor.count || 100), gridPageIndex: -1, gridRefresh: false });
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

/** Lô lệch kế hoạch là lỗi hợp đồng của cả lô: dừng phiên, không ghi gì. */
FbmSync.activityBatchMismatch = function (state, message) {
  var code = 'FBM_BATCH_ITEM_MISMATCH', failed = FbmSync.stateFailRun(message, code).failed;
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
  var gate = FbmSync.stateCategoryGate(state), parents = FbmSync.activityParentCodes(), pages = FbmSync.activityPagesRead(state), nextPlan = [], nextPages = {}, records = [], failed = [], finished = 0;
  checks.forEach(function (entry) {
    var sttRec = String(customers[entry.index] || ''), parent = { sttRec: sttRec, maKh: parents[sttRec] || '' };
    if (!entry.item) { nextPlan.push(entry.index); if (pages[entry.index]) { nextPages[entry.index] = pages[entry.index]; } return; }
    finished += 1;
    if (!entry.check.ok) {
      failed.push({ customer: parent.maKh || sttRec, code: String(entry.check.code || 'FBM_ERROR'), status: Number(entry.check.status || 0), reason: String(entry.check.bug && (entry.check.bug.Message || entry.check.bug.message) || 'FBM trả lỗi khi đọc giao dịch của khách') });
      return;
    }
    var grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(entry.item), state.metadata.activityFields);
    state.metadata.activityFields = grid.fields;
    grid.rows.forEach(function (row) { if (!FbmSync.isTemporaryRecord('activity', row)) { records.push(FbmSync.activityRecord(row, gate, parent)); } });
    if (grid.rows.length > 0 && grid.rows.length >= Number(cursor.count || 100)) {
      var last = grid.rows[grid.rows.length - 1], pageIndex = pages[entry.index] ? pages[entry.index][0] : -1;
      finished -= 1;
      nextPlan.push(entry.index);
      nextPages[entry.index] = [FbmSync.gridNextPageIndex(pageIndex), FbmSync.gridPageValue([last.end_date || '', last.datetime0 || '', last.id || '', last.line_nbr || 0])];
    }
  });
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
  FbmSync.activityBatchPlan(state.cursor);
  var request = FbmSync.activityBatchRequest(state);
  FbmSync.stateWrite(state);
  return request ? { result: { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView(), imported: records.length } } : { done: true, state: state, imported: records.length };
};
