/**
 * Chọn khách cần đọc giao dịch theo gói quét (Tài liệu 09/02 Phần 8): lớp 2 so giao dịch cuối trên danh sách khách vừa lấy, lớp 3 quét từ khách mới nhất xuống.
 * Tập khách cần đọc, đã đọc, có giao dịch mới và thứ tự lớp 3 nằm ở khóa riêng đánh theo số CUS như kho "đã thấy"; cursor chỉ giữ vị trí, không giữ danh sách khách vì khóa state chỉ 9.000 byte.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Gói người dùng chọn ở `Mức quét`; giá trị lạ về gói mặc định chứ không về "Quét toàn bộ", để lỗi gõ không biến thành lượt nặng nhất. */
FbmSync.SCAN_PACKS = ['quick', 'deep', 'all'];
FbmSync.scanPackOf = function (value) { return FbmSync.SCAN_PACKS.indexOf(value) >= 0 ? value : 'quick'; };

// Tên kho không bắt đầu bằng "activity": kho đánh theo số CUS của khách cha, không theo số ACT.
FbmSync.ACTIVITY_DUE_STORE = 'customer_activity_due';
FbmSync.ACTIVITY_READ_STORE = 'customer_activity_read';
FbmSync.ACTIVITY_FRESH_STORE = 'customer_activity_fresh';
// Khách đã gửi request đọc giao dịch trong lượt, kể cả đọc lỗi: lớp 3 không đọc lại khách lỗi ở lớp 2, lỗi đã báo một lần.
FbmSync.ACTIVITY_TRIED_STORE = 'customer_activity_tried';
FbmSync.LAST_ACTIVITY_FIELDS = ['end_date', 'ma_cv'];
FbmSync.TOP_ORDER_PREFIX = 'FBM_SYNC_TOP_ORDER_';
// Mỗi số CUS tối đa 6 chữ số cộng dấu phẩy: 1.000 số vẫn dưới 9.000 byte một khóa.
FbmSync.TOP_ORDER_SHARD = 1000;

/** Mở các kho của lượt; kho chính xác từng bit vì khách chưa đánh dấu nghĩa là chưa đọc, không được coi là đã đọc. */
FbmSync.activityLayersBegin = function () {
  [FbmSync.ACTIVITY_DUE_STORE, FbmSync.ACTIVITY_READ_STORE, FbmSync.ACTIVITY_FRESH_STORE, FbmSync.ACTIVITY_TRIED_STORE].forEach(function (scope) { FbmSync.seenStoreBeginExact(scope); });
  FbmSync.topOrderClear();
};

FbmSync.topOrderClear = function () {
  var props = FbmSync.props(), count = Number(props.getProperty(FbmSync.TOP_ORDER_PREFIX + 'SHARDS') || 0);
  for (var i = 0; i < count; i += 1) { props.setProperty(FbmSync.TOP_ORDER_PREFIX + i, ''); }
  props.setProperty(FbmSync.TOP_ORDER_PREFIX + 'SHARDS', '0');
};
FbmSync.topOrderAll = function () {
  var props = FbmSync.props(), count = Number(props.getProperty(FbmSync.TOP_ORDER_PREFIX + 'SHARDS') || 0), order = [];
  for (var i = 0; i < count; i += 1) {
    String(props.getProperty(FbmSync.TOP_ORDER_PREFIX + i) || '').split(',').forEach(function (text) { if (text !== '') { order.push(Number(text)); } });
  }
  return order;
};
/** Nối số CUS theo đúng thứ tự FBM trả (`ngay_gd` giảm dần); gói nối tiếp gói nên thứ tự cả lượt vẫn đúng. */
FbmSync.topOrderAppend = function (indices) {
  if (!indices.length) { return; }
  var props = FbmSync.props(), order = FbmSync.topOrderAll().concat(indices), shards = Math.ceil(order.length / FbmSync.TOP_ORDER_SHARD);
  for (var i = 0; i < shards; i += 1) { props.setProperty(FbmSync.TOP_ORDER_PREFIX + i, order.slice(i * FbmSync.TOP_ORDER_SHARD, (i + 1) * FbmSync.TOP_ORDER_SHARD).join(',')); }
  props.setProperty(FbmSync.TOP_ORDER_PREFIX + 'SHARDS', String(shards));
};

/** Mỗi khách ShinCRM: ngày làm việc lớn nhất trong các giao dịch đã có `@ACT_FBM_ID` và các giao dịch của ngày đó. Giao dịch nội bộ không được tính, nếu không một giao dịch ngày tương lai sẽ che phát sinh thật bên FBM. */
FbmSync.lastActivityIndex = function (categoryGate) {
  var index = {};
  FbmSync.readLocal('activity').forEach(function (record) {
    var customerId = String(record && record.customerId || '').trim();
    if (!String(record && record.fbmId || '').trim() || !customerId) { return; }
    var day = FbmSync.canonical('activity', record, categoryGate).end_date, entry = index[customerId];
    if (!day) { return; }
    if (!entry || day > entry.day) { index[customerId] = { day: day, records: [record] }; } else if (day === entry.day) { entry.records.push(record); }
  });
  return index;
};

/**
 * Trường lệch giữa giao dịch cuối FBM báo trên dòng khách và giao dịch cuối trên ShinCRM; rỗng là khớp.
 * Công việc khớp khi nằm trong tập công việc của ngày đó: một ngày nhiều giao dịch khác công việc thì không biết FBM hiện giao dịch nào, so bằng sẽ đọc lại khách đó mọi lượt.
 */
FbmSync.lastActivityDiff = function (row, last, categoryGate, since) {
  var fbm = { end_date: row.ngay_gd, ten_cv: row.ten_cv }, date = FbmSync.isDate(row.ngay_gd) ? row.ngay_gd : FbmSync.fbDate(row.ngay_gd);
  if (!FbmSync.isDate(date) || isNaN(date.getTime())) { return ['end_date']; }
  // 01/01/1999 là "chưa có giao dịch" (kiểm trên FBM thật 2026-10-09: 326/326 khách mang ngày này có 0 giao dịch).
  if (FbmSync.isEmptyFbmDate(date)) { return last ? ['end_date'] : []; }
  var day = FbmSync.canonical('activity', fbm, categoryGate).end_date;
  if (since && day < since && (!last || last.day < since)) { return []; }
  if (!last || last.day !== day) { return ['end_date']; }
  return last.records.some(function (record) { return !FbmSync.diff('activity', fbm, record, categoryGate, FbmSync.LAST_ACTIVITY_FIELDS).length; }) ? [] : ['ma_cv'];
};

/** Lớp 2 trên một gói danh sách khách đã ghi xuống Sheet: đánh dấu khách lệch giao dịch cuối, nối thứ tự cho lớp 3. Log một dòng tóm tắt, không một dòng mỗi khách vì lượt đầu mọi khách đều lệch. */
FbmSync.activityDueMark = function (state, rows) {
  var gate = FbmSync.stateCategoryGate(state), customers = FbmSync.readLocal('customer'), byFbmId = {}, last = FbmSync.lastActivityIndex(gate), due = [], order = [], fieldCounts = {}, sample = [], pullAllowed = FbmSync.pullAllowedReader('customer');
  // Khách chặn chiều lấy về không vào lớp 2 lẫn thứ tự lớp 3.
  customers.forEach(function (record) { var id = String(record.fbmId || '').trim(); if (id && pullAllowed(record)) { byFbmId[id] = record; } });
  rows.forEach(function (row) {
    var local = byFbmId[String(row.stt_rec_kh || '').trim()], index = local ? FbmSync.seenStoreIndex(FbmSync.ACTIVITY_DUE_STORE, local) : -1;
    if (index < 0) { return; }
    order.push(index);
    var fields = FbmSync.lastActivityDiff(row, last[String(local.id)], gate, String(state.activitySince || ''));
    if (!fields.length) { return; }
    due.push({ fbmId: local.fbmId });
    fields.forEach(function (field) { fieldCounts[field] = Number(fieldCounts[field] || 0) + 1; });
    if (sample.length < 20) { sample.push({ customer: String(local.id), fields: fields }); }
  });
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_DUE_STORE, customers, due);
  FbmSync.topOrderAppend(order);
  state.metadata = state.metadata || {};
  state.metadata.activityDue = Number(state.metadata.activityDue || 0) + due.length;
  if (due.length && typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'activity_due', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: due.length + ' khách lệch giao dịch cuối với FBM, sẽ đọc giao dịch của các khách này.', detail: { count: due.length, fields: fieldCounts, sample: sample } });
  }
};

/** Đánh dấu khách đã đọc đủ giao dịch và khách có giao dịch mới hoặc sửa; kho "đã đọc" là phạm vi duy nhất bước gắn cờ "không thấy" giao dịch được xét. */
FbmSync.activityReadMark = function (read, fresh, tried) {
  var customers = FbmSync.readLocal('customer');
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_TRIED_STORE, customers, tried.map(function (id) { return { fbmId: id }; }));
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_READ_STORE, customers, read.map(function (id) { return { fbmId: id }; }));
  FbmSync.seenStoreMark(FbmSync.ACTIVITY_FRESH_STORE, customers, fresh.map(function (id) { return { fbmId: id }; }));
};

/** Khách có ít nhất một giao dịch FBM chưa có trên Sheet hoặc khác dấu vân đã lưu; tính trước khi ghi vì ghi xong thì mọi thứ đều đã khớp. */
FbmSync.activityFreshIndex = function () {
  var known = {};
  FbmSync.readLocal('activity').forEach(function (record) { var id = String(record && record.fbmId || '').trim(); if (id) { known[id] = String(record.fbmHash || ''); } });
  return function (records) { return records.some(function (record) { var id = String(record.fbmId || '').trim(); return !Object.prototype.hasOwnProperty.call(known, id) || known[id] !== String(record.fbmHash || ''); }); };
};

/**
 * Lớp 3: đi từ khách mới nhất xuống, lấy một dải khách chưa đọc liên tiếp làm lô. Khách đã đọc ở lớp 2 dùng luôn kết quả lần đọc đó cho bộ đếm.
 * Lô không dài quá số khách còn thiếu để đủ chuỗi im lặng, nên lượt dừng đúng sau `activityTopScanQuietStreak` khách liên tiếp không có gì mới, không đọc dư.
 */
FbmSync.activityTopRefill = function (cursor) {
  var streak = FbmSync.BUDGET.activityTopScanQuietStreak, order = FbmSync.topOrderAll(), byIndex = {}, hasTried = FbmSync.seenStoreReader(FbmSync.ACTIVITY_TRIED_STORE), hasRead = FbmSync.seenStoreReader(FbmSync.ACTIVITY_READ_STORE), hasFresh = FbmSync.seenStoreReader(FbmSync.ACTIVITY_FRESH_STORE), pullAllowed = FbmSync.pullAllowedReader('customer');
  FbmSync.readLocal('customer').forEach(function (record) { var index = FbmSync.seenStoreIndex(FbmSync.ACTIVITY_READ_STORE, record); if (index >= 0 && String(record.fbmId || '').trim() && pullAllowed(record)) { byIndex[index] = record; } });
  var pos = Number(cursor.topPos || 0), quiet = Number(cursor.topQuiet || 0), picked = [], positions = [];
  while (pos < order.length && quiet < streak) {
    var record = byIndex[order[pos]];
    if (record && hasTried(record)) {
      if (picked.length) { break; }
      // Khách đọc lỗi hoặc chưa đọc đủ thì chưa biết có gì mới: không cộng vào chuỗi im lặng.
      if (hasFresh(record)) { quiet = 0; cursor.topDeepest = pos + 1; } else if (hasRead(record)) { quiet += 1; }
    } else if (record) {
      if (picked.length >= Math.min(FbmSync.BUDGET.activityBatchCustomers, streak - quiet)) { break; }
      picked.push(String(record.fbmId).trim()); positions.push(pos + 1);
    }
    pos += 1;
  }
  cursor.customers = picked; cursor.customerIndex = 0; cursor.topPos = pos; cursor.topQuiet = quiet; cursor.topPositions = positions;
};

/** Cập nhật bộ đếm lớp 3 theo đúng thứ tự trong lô; khách đọc lỗi không cộng cũng không xóa chuỗi vì chưa biết nó có gì mới. */
FbmSync.activityTopAccount = function (cursor, outcomes) {
  var positions = cursor.topPositions || [], customers = cursor.customers || [], quiet = Number(cursor.topQuiet || 0);
  outcomes.forEach(function (outcome) {
    if (outcome.fresh === null) { return; }
    if (outcome.fresh) { quiet = 0; cursor.topDeepest = positions[customers.indexOf(outcome.sttRec)] || cursor.topDeepest; } else { quiet += 1; }
  });
  cursor.topQuiet = quiet;
};

/**
 * Mẫu số tiến trình của lượt đọc theo lớp là số khách sẽ đọc, không phải số khách của lượt: lớp 2 còn bao nhiêu khách lệch cộng một chuỗi im lặng, lớp 3 còn bao nhiêu khách nữa thì đủ chuỗi.
 * Tính trên tổng số khách thì Quét nhanh dừng ở vài phần trăm và người dùng tưởng lượt bị kẹt.
 */
FbmSync.activityLayerProgress = function (state, finished) {
  var cursor = state.cursor || {}, streak = FbmSync.BUDGET.activityTopScanQuietStreak, done = Number(state.progress && state.progress.done || 0);
  var left = finished ? 0 : cursor.layer === 'top' ? Math.max(0, streak - Number(cursor.topQuiet || 0)) : Math.max(0, Number(state.metadata && state.metadata.activityDue || 0) - done) + streak;
  state.progress = { done: done, total: done + left };
};

/** Hết lớp 2 thì sang lớp 3; hết lớp 3 thì ghi Log vị trí sâu nhất có giao dịch mới để chỉnh độ dài chuỗi im lặng theo số đo thật. Trả request kế hoặc `null` khi đã đọc xong giao dịch theo khách. */
FbmSync.activityLayerNext = function (state, cursor) {
  if (cursor.layer === 'due') {
    state.cursor = { kind: 'activity_grid', layer: 'top', customers: [], customerIndex: 0, batch: [], count: FbmSync.BUDGET.activityCustomerRows, topPos: 0, topQuiet: 0, topDeepest: 0, topPositions: [] };
    state.message = 'Đang quét giao dịch từ khách mới nhất xuống...';
    FbmSync.activityBatchPlan(state.cursor);
    FbmSync.stateWrite(state);
    var request = FbmSync.activityBatchRequest(state);
    if (request) { FbmSync.activityLayerProgress(state, false); FbmSync.stateWrite(state); return request; }
    cursor = state.cursor;
  }
  FbmSync.activityLayerProgress(state, true);
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') {
    var streak = FbmSync.BUDGET.activityTopScanQuietStreak;
    logEvent({ source: 'fbm_sync', action: 'activity_top_scan', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: 'Quét từ khách mới nhất xuống dừng ở khách thứ ' + Number(cursor.topPos || 0) + (Number(cursor.topQuiet || 0) >= streak ? ' sau ' + streak + ' khách liên tiếp không có gì mới' : ' vì hết danh sách') + '; giao dịch mới sâu nhất ở khách thứ ' + Number(cursor.topDeepest || 0) + '.', detail: { depth: Number(cursor.topPos || 0), deepestFresh: Number(cursor.topDeepest || 0), quiet: Number(cursor.topQuiet || 0), streak: streak } });
  }
  return null;
};

/**
 * Lớp 4 — Vòng xoay: khách trên Sheet theo số CUS tăng dần, bắt đầu sau khách cuối đã ghi xong ở phiên trước, hết danh sách thì quay về số nhỏ nhất (09/02 "Chuỗi trong một lần hỏi" mục 9).
 * Chỉ khách đã có mã FBM, chưa xóa, cho phép lấy về, thuộc phạm vi và không mang cờ "không thấy bên FBM". Không đọc danh sách khách FBM: khách mới và thông tin khách là việc của Quét nhanh.
 */
FbmSync.activityRotationRing = function (start) {
  var pullAllowed = FbmSync.pullAllowedReader('customer'), scope = typeof FbmSync.scope === 'function' ? FbmSync.scope() : null, list = [];
  FbmSync.readLocal('customer').forEach(function (record) {
    var index = FbmSync.seenStoreIndex('customer', record), fbmId = String(record && record.fbmId || '').trim();
    if (index < 0 || !fbmId || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('customer', record) || String(record.syncStatus || '') === FbmSync.SYNC_STATUS.missing || !pullAllowed(record) || !FbmSync.inScope(record, scope)) { return; }
    list.push({ index: index, sttRec: fbmId });
  });
  list.sort(function (a, b) { return a.index - b.index; });
  return list.filter(function (item) { return item.index > start; }).concat(list.filter(function (item) { return item.index <= start; }));
};

/**
 * Mở phiên Vòng xoay: đọc giao dịch của N khách theo lô `activityBatchCustomers`. Không có khách nào đủ điều kiện thì phiên xong ngay, không đọc FBM.
 */
FbmSync.activityRotationBegin = function (state) {
  var start = FbmSync.detailCursorRead(), limit = Math.max(1, Number(state.detailCustomerLimit || FbmSync.backgroundScheduleDefault().detail.customersPerRun)), total = Math.min(limit, FbmSync.activityRotationRing(start).length);
  state.phase = 'pull_activity'; state.entity = 'activity';
  if (typeof FbmSync.businessStepStart === 'function') {
    FbmSync.businessStepStart(state, 'pull_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
    FbmSync.businessStepStart(state, 'reconcile_activity', { mode: state.mode, scan: state.scan, entity: 'activity' });
  }
  state.progress = { done: 0, total: total };
  state.cursor = { kind: 'activity_grid', customers: [], customerIndex: 0, batch: [], count: FbmSync.BUDGET.activityCustomerRows, customerNext: null, customerSeen: 0, rotation: { start: start, limit: limit, taken: 0, last: -1 } };
  state.message = 'Đang đọc giao dịch của ' + total + ' khách theo vòng xoay...';
  FbmSync.activityBatchPlan(state.cursor);
  FbmSync.activityPagesWrite(state, {});
  FbmSync.stateWrite(state);
  var request = FbmSync.activityBatchRequest(state);
  if (!request) { FbmSync.finishPullRun(state); }
  return request;
};

/**
 * Lô trước đã ghi xong (kế hoạch lô rỗng mới gọi tới đây) nên lưu cursor bền bằng khách cuối của lô đó, rồi lấy lô kế đến khi đủ N. Phiên bị kẹt giữa lô thì phiên sau đọc lại đúng lô đó và vẫn đủ N khách.
 * Khách đọc lỗi đã có dòng Log `activity_customer_failed` và hiện ở Sidebar; cursor vẫn đi qua để một khách hỏng không chặn cả vòng.
 */
FbmSync.activityRotationRefill = function (cursor) {
  var rotation = cursor.rotation, taken = Number(rotation.taken || 0);
  if (Number(rotation.last) >= 0) { FbmSync.detailCursorWrite(rotation.last); }
  var ring = FbmSync.activityRotationRing(Number(rotation.start)), end = Math.min(Number(rotation.limit), ring.length, taken + FbmSync.BUDGET.activityBatchCustomers), picked = ring.slice(taken, Math.max(taken, end));
  cursor.customers = picked.map(function (item) { return item.sttRec; });
  cursor.customerIndex = 0;
  rotation.taken = taken + picked.length;
  rotation.last = picked.length ? picked[picked.length - 1].index : -1;
};
