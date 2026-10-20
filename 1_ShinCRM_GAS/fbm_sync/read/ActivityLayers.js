/**
 * Chọn khách cho cửa ghi chiều lấy về theo gói quét (Tài liệu 09/02 Phần 8): danh sách đọc của lượt, lớp 3 quét từ khách mới nhất xuống, lớp 4 Vòng xoay; các bước quét hàng loạt chỉ đánh dấu khách vào danh sách đọc.
 * Mọi tập theo khách nằm ở khóa riêng đánh theo số CUS như kho "đã thấy"; cursor chỉ giữ vị trí, không giữ danh sách khách vì khóa state chỉ 9.000 byte.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Gói người dùng chọn ở `Mức quét`; giá trị lạ về gói mặc định chứ không về "Quét toàn bộ", để lỗi gõ không biến thành lượt nặng nhất. */
FbmSync.SCAN_PACKS = ['quick', 'deep', 'all'];
FbmSync.scanPackOf = function (value) { return FbmSync.SCAN_PACKS.indexOf(value) >= 0 ? value : 'quick'; };

// Tên kho không bắt đầu bằng "activity": kho đánh theo số CUS của khách cha, không theo số ACT.
FbmSync.READ_LIST_STORE = 'customer_read_list';
FbmSync.READ_DONE_STORE = 'customer_read_done';
FbmSync.ACTIVITY_READ_STORE = 'customer_activity_read';
FbmSync.ACTIVITY_FRESH_STORE = 'customer_activity_fresh';
// Khách chưa có trên Sheet chưa có số CUS: danh sách theo FBM giữ `stt_rec_kh`, một danh sách chờ đọc và một danh sách đã đọc.
FbmSync.READ_NEW_PREFIX = 'FBM_SYNC_READ_NEW_';
FbmSync.READ_NEW_DONE_PREFIX = 'FBM_SYNC_READ_NEW_DONE_';
// Ghi chú "giao dịch chờ nối": khách B chưa đọc → các id giao dịch FBM báo B đang giữ.
FbmSync.READ_WAIT_KEY = 'FBM_SYNC_READ_WAIT';
FbmSync.LAST_ACTIVITY_FIELDS = ['end_date', 'ma_cv'];
FbmSync.TOP_ORDER_PREFIX = 'FBM_SYNC_TOP_ORDER_';

/** Mở các kho của lớp 3; kho chính xác từng bit vì khách chưa đánh dấu nghĩa là chưa đọc, không được coi là đã đọc. */
FbmSync.activityLayersBegin = function () {
  [FbmSync.ACTIVITY_READ_STORE, FbmSync.ACTIVITY_FRESH_STORE].forEach(function (scope) { FbmSync.seenStoreBeginExact(scope); });
  FbmSync.topOrderClear();
};

FbmSync.topOrderClear = function () { FbmSync.shardListWrite(FbmSync.TOP_ORDER_PREFIX, []); };
FbmSync.topOrderAll = function () { return FbmSync.shardListRead(FbmSync.TOP_ORDER_PREFIX).map(Number); };
/** Nối số CUS theo đúng thứ tự FBM trả (`ngay_gd` giảm dần); gói nối tiếp gói nên thứ tự cả lượt vẫn đúng. */
FbmSync.topOrderAppend = function (indices) {
  if (!indices.length) { return; }
  FbmSync.shardListWrite(FbmSync.TOP_ORDER_PREFIX, FbmSync.topOrderAll().concat(indices));
};

/**
 * Danh sách đọc của lượt (09/02 Phần 8): sống từ lúc mở lượt tới lúc kết thúc lượt, kể cả lượt hỏng giữa chừng; lượt sau bắt đầu rỗng. Kho bit đã xóa không còn mốc nên là kho chính xác: khách tạo dòng giữa lượt không bị coi là đã đánh dấu.
 */
FbmSync.readListClear = function () {
  [FbmSync.READ_LIST_STORE, FbmSync.READ_DONE_STORE].forEach(function (scope) { FbmSync.seenStoreClear(scope); });
  FbmSync.shardListWrite(FbmSync.READ_NEW_PREFIX, []);
  FbmSync.shardListWrite(FbmSync.READ_NEW_DONE_PREFIX, []);
  FbmSync.readWaitWrite({});
};

/** Khách trên Sheet được cửa ghi đọc: đã có mã FBM, chưa xóa, không phải dòng tạm, cho phép lấy về và thuộc phạm vi. Một chỗ cho cả cổng thêm lẫn bước chọn lô. */
FbmSync.readListEligibleReader = function () {
  var pullAllowed = FbmSync.pullAllowedReader('customer'), scope = typeof FbmSync.scope === 'function' ? FbmSync.scope() : null;
  return function (record) {
    return !!String(record && record.fbmId || '').trim() && FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, record) >= 0 && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('customer', record) && pullAllowed(record) && FbmSync.inScope(record, scope);
  };
};

/**
 * Cổng duy nhất thêm khách vào danh sách đọc, theo `stt_rec_kh`. Khách đã có trên Sheet vào dãy bit theo số CUS, khách chưa có vào danh sách theo FBM; khách đã đọc trong lượt không vào lại, nên mỗi khách tối đa một lần mỗi lượt.
 * Trả số khách thực sự được thêm.
 */
FbmSync.readListAdd = function (sttRecs) {
  var wanted = {};
  (sttRecs || []).forEach(function (value) { var text = String(value || '').trim(); if (FbmSync.STT_REC_PATTERN.test(text)) { wanted[text] = true; } });
  if (!Object.keys(wanted).length) { return 0; }
  var customers = FbmSync.readLocal('customer'), eligible = FbmSync.readListEligibleReader(), inList = FbmSync.seenStoreReader(FbmSync.READ_LIST_STORE), isDone = FbmSync.seenStoreReader(FbmSync.READ_DONE_STORE), onSheet = {}, known = [];
  customers.forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    if (!wanted[fbmId]) { return; }
    onSheet[fbmId] = true;
    if (eligible(record) && !inList(record) && !isDone(record)) { known.push({ fbmId: fbmId }); }
  });
  FbmSync.seenStoreMark(FbmSync.READ_LIST_STORE, customers, known);
  var fresh = Object.keys(wanted).filter(function (fbmId) { return !onSheet[fbmId]; }), added = [];
  if (fresh.length) {
    var pending = FbmSync.shardListRead(FbmSync.READ_NEW_PREFIX), have = {};
    pending.concat(FbmSync.shardListRead(FbmSync.READ_NEW_DONE_PREFIX)).forEach(function (fbmId) { have[fbmId] = true; });
    added = fresh.filter(function (fbmId) { return !have[fbmId]; });
    if (added.length) { FbmSync.shardListWrite(FbmSync.READ_NEW_PREFIX, pending.concat(added)); }
  }
  return known.length + added.length;
};

/** Tối đa `limit` khách còn chờ đọc: khách trên Sheet theo số CUS tăng dần trước, rồi khách mới theo thứ tự đánh dấu. Xét lại điều kiện lúc chọn vì người dùng có thể tắt đồng bộ một khách giữa lượt. */
FbmSync.readListNext = function (limit) {
  var inList = FbmSync.seenStoreReader(FbmSync.READ_LIST_STORE), isDone = FbmSync.seenStoreReader(FbmSync.READ_DONE_STORE), eligible = FbmSync.readListEligibleReader(), known = [], max = Number(limit || 0);
  FbmSync.readLocal('customer').forEach(function (record) {
    if (eligible(record) && inList(record) && !isDone(record)) { known.push({ index: FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, record), sttRec: String(record.fbmId).trim() }); }
  });
  known.sort(function (a, b) { return a.index - b.index; });
  var picked = known.map(function (item) { return item.sttRec; });
  if (picked.length < max) { picked = picked.concat(FbmSync.shardListRead(FbmSync.READ_NEW_PREFIX).filter(function (fbmId) { return picked.indexOf(fbmId) < 0; })); }
  return picked.slice(0, max);
};
FbmSync.readListPendingCount = function () { return FbmSync.readListNext(Infinity).length; };

/** Đánh dấu khách đã đọc trong lượt, kể cả đọc lỗi (lỗi đã báo một lần). Gọi sau khi lô đã ghi khách để khách mới đã có số CUS. */
FbmSync.readListDone = function (sttRecs) {
  var done = {};
  (sttRecs || []).forEach(function (value) { var text = String(value || '').trim(); if (text) { done[text] = true; } });
  if (!Object.keys(done).length) { return; }
  FbmSync.seenStoreMark(FbmSync.READ_DONE_STORE, FbmSync.readLocal('customer'), Object.keys(done).map(function (fbmId) { return { fbmId: fbmId }; }));
  var pending = FbmSync.shardListRead(FbmSync.READ_NEW_PREFIX), left = pending.filter(function (fbmId) { return !done[fbmId]; });
  if (left.length === pending.length) { return; }
  FbmSync.shardListWrite(FbmSync.READ_NEW_PREFIX, left);
  FbmSync.shardListWrite(FbmSync.READ_NEW_DONE_PREFIX, FbmSync.shardListRead(FbmSync.READ_NEW_DONE_PREFIX).concat(pending.filter(function (fbmId) { return done[fbmId]; })));
};

/** Hỏi một `stt_rec_kh` đã được đọc trong lượt chưa; dựng một lần mỗi lời gọi. */
FbmSync.readListDoneReader = function () {
  var isDone = FbmSync.seenStoreReader(FbmSync.READ_DONE_STORE), byStt = {}, newDone = {};
  FbmSync.readLocal('customer').forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId && FbmSync.seenStoreIndex(FbmSync.READ_DONE_STORE, record) >= 0) { byStt[fbmId] = record; } });
  FbmSync.shardListRead(FbmSync.READ_NEW_DONE_PREFIX).forEach(function (fbmId) { newDone[fbmId] = true; });
  return function (sttRec) { var key = String(sttRec || '').trim(), record = byStt[key]; return !!newDone[key] || (!!record && isDone(record)); };
};

FbmSync.readWaitRead = function () {
  var raw = FbmSync.props().getProperty(FbmSync.READ_WAIT_KEY), value = raw ? JSON.parse(raw) : {};
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
};
FbmSync.readWaitWrite = function (waits) {
  var props = FbmSync.props();
  if (Object.keys(waits || {}).length) { props.setProperty(FbmSync.READ_WAIT_KEY, JSON.stringify(waits)); return; }
  if (!props.getProperty(FbmSync.READ_WAIT_KEY)) { return; }
  if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.READ_WAIT_KEY); } else { props.setProperty(FbmSync.READ_WAIT_KEY, ''); }
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
FbmSync.lastActivityDiff = function (row, last, categoryGate) {
  var fbm = { end_date: row.ngay_gd, ten_cv: row.ten_cv }, date = FbmSync.isDate(row.ngay_gd) ? row.ngay_gd : FbmSync.fbDate(row.ngay_gd);
  if (!FbmSync.isDate(date) || isNaN(date.getTime())) { return ['end_date']; }
  // 01/01/1999 là "chưa có giao dịch" (kiểm trên FBM thật 2026-10-09: 326/326 khách mang ngày này có 0 giao dịch).
  if (FbmSync.isEmptyFbmDate(date)) { return last ? ['end_date'] : []; }
  var day = FbmSync.canonical('activity', fbm, categoryGate).end_date;
  if (!last || last.day !== day) { return ['end_date']; }
  return last.records.some(function (record) { return !FbmSync.diff('activity', fbm, record, categoryGate, FbmSync.LAST_ACTIVITY_FIELDS).length; }) ? [] : ['ma_cv'];
};

/** Trạng thái làm khách hoặc giao dịch phải đọc lại dù nội dung FBM không đổi: cờ vắng mặt, chuyển quyền được xét lại, bản đã đẩy chờ xác nhận, xung đột chờ quyết (FBM quay về gốc thì danh sách không lộ thay đổi mà dòng vẫn phải so lại). */
FbmSync.readAgainStatus = function (record) {
  var status = String(record && record.syncStatus || ''), sync = FbmSync.SYNC_STATUS;
  return status === sync.missing || status === sync.transferred || status === sync.pushed || status === sync.conflict;
};

/**
 * Danh sách toàn bộ khách chỉ đánh dấu, không ghi Sheet: khách mới, khách sửa (dấu vân hoặc mã khách khác), khách mang cờ cần xét lại, khách lệch giao dịch cuối (lớp 2); gói Quét toàn bộ đánh dấu mọi khách. Đánh dấu "đã thấy" để cuối danh sách biết khách vắng.
 * Log một dòng tóm tắt, không một dòng mỗi khách vì lượt đầu mọi khách đều mới.
 */
FbmSync.customerScanMark = function (state, rows) {
  var gate = FbmSync.stateCategoryGate(state), customers = FbmSync.readLocal('customer'), byFbmId = {}, all = state.scanPack === 'all', last = all ? null : FbmSync.lastActivityIndex(gate), pullAllowed = FbmSync.pullAllowedReader('customer'), marked = [], order = [], reasons = {}, sample = [];
  customers.forEach(function (record) { var id = String(record.fbmId || '').trim(); if (id) { byFbmId[id] = record; } });
  rows.forEach(function (row) {
    var sttRec = String(row.stt_rec_kh || '').trim(), local = byFbmId[sttRec], reason = '';
    if (!sttRec) { return; }
    if (!local) { reason = 'new'; }
    else if (all) { reason = 'all'; }
    else if (FbmSync.readAgainStatus(local)) { reason = 'status'; }
    else if (String(local.fbmHash || '') !== FbmSync.hash(row, 'customer', gate)) { reason = 'changed'; }
    else if (String(row.ma_kh || '').trim() !== String(local.fbmCustomerCode || '').trim()) { reason = 'code'; }
    // Khách chặn chiều lấy về không vào lớp 2 lẫn thứ tự lớp 3.
    if (local && !all && pullAllowed(local)) {
      var index = FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, local);
      if (index >= 0) { order.push(index); }
      if (!reason && FbmSync.lastActivityDiff(row, last[String(local.id)], gate).length) { reason = 'activity'; }
    }
    if (!reason) { return; }
    marked.push(sttRec);
    reasons[reason] = Number(reasons[reason] || 0) + 1;
    if (sample.length < 20) { sample.push({ customer: String(local && local.id || sttRec), reason: reason }); }
  });
  FbmSync.seenStoreMark('customer', customers, rows.map(function (row) { return { fbmId: row.stt_rec_kh }; }));
  var added = FbmSync.readListAdd(marked);
  if (!all) { FbmSync.topOrderAppend(order); }
  if (added && typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'read_list_mark', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: added + ' khách được đánh dấu để đọc chi tiết (khách mới, sửa, cờ cần xét lại hoặc lệch giao dịch cuối với FBM).', detail: { count: added, reasons: reasons, sample: sample } });
  }
  return added;
};

/** Cuối danh sách toàn bộ khách: khách trên Sheet không thấy trong danh sách vào danh sách đọc, cửa ghi tra mã khách rồi mới gắn cờ. Chỉ chế độ ghi Sheet mới xét vắng mặt. */
FbmSync.customerAbsentMark = function (state) {
  if (!FbmSync.canWriteSheet(state.mode)) { FbmSync.seenStoreClear('customer'); return 0; }
  var hasSeen = FbmSync.seenStoreReader('customer'), absent = [];
  FbmSync.readLocal('customer').forEach(function (record) { var fbmId = String(record.fbmId || '').trim(); if (fbmId && !hasSeen(record)) { absent.push(fbmId); } });
  FbmSync.seenStoreClear('customer');
  return FbmSync.readListAdd(absent);
};

/** Đánh dấu khách đã đọc đủ giao dịch và khách có giao dịch mới hoặc sửa, cho bộ đếm chuỗi im lặng của lớp 3. */
FbmSync.activityReadMark = function (read, fresh) {
  var customers = FbmSync.readLocal('customer');
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
 * Lớp 3: đi từ khách mới nhất xuống, lấy một dải khách chưa đọc liên tiếp làm lô. Khách đã đọc trong lượt dùng luôn kết quả lần đọc đó cho bộ đếm.
 * Lô không dài quá số khách còn thiếu để đủ chuỗi im lặng, nên lượt dừng đúng sau `activityTopScanQuietStreak` khách liên tiếp không có gì mới, không đọc dư.
 */
FbmSync.activityTopRefill = function (cursor) {
  var streak = FbmSync.BUDGET.activityTopScanQuietStreak, order = FbmSync.topOrderAll(), byIndex = {}, isDone = FbmSync.seenStoreReader(FbmSync.READ_DONE_STORE), hasRead = FbmSync.seenStoreReader(FbmSync.ACTIVITY_READ_STORE), hasFresh = FbmSync.seenStoreReader(FbmSync.ACTIVITY_FRESH_STORE), eligible = FbmSync.readListEligibleReader();
  FbmSync.readLocal('customer').forEach(function (record) { if (eligible(record)) { byIndex[FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, record)] = record; } });
  var pos = Number(cursor.topPos || 0), quiet = Number(cursor.topQuiet || 0), picked = [], positions = [];
  while (pos < order.length && quiet < streak) {
    var record = byIndex[order[pos]];
    if (record && isDone(record)) {
      if (picked.length) { break; }
      // Khách đọc lỗi hoặc chưa đọc đủ thì chưa biết có gì mới: không cộng vào chuỗi im lặng.
      if (hasFresh(record)) { quiet = 0; cursor.topDeepest = pos + 1; } else if (hasRead(record)) { quiet += 1; }
    } else if (record) {
      if (picked.length >= Math.min(FbmSync.BUDGET.activityBatchCustomers, streak - quiet)) { break; }
      picked.push(String(record.fbmId).trim()); positions.push(pos + 1);
    }
    pos += 1;
  }
  cursor.customers = picked; cursor.topPos = pos; cursor.topQuiet = quiet; cursor.topPositions = positions;
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
 * Mẫu số tiến trình của chặng đọc là số khách sẽ đọc, không phải số khách của lượt: danh sách đọc còn bao nhiêu khách, lớp 3 còn bao nhiêu khách nữa thì đủ chuỗi, Vòng xoay giữ tổng lúc mở.
 * Tính trên tổng số khách thì Quét nhanh dừng ở vài phần trăm và người dùng tưởng lượt bị kẹt.
 */
FbmSync.activityLayerProgress = function (state) {
  var cursor = state.cursor || {}, done = Number(state.progress && state.progress.done || 0);
  if (cursor.rotation) { return; }
  var left = cursor.layer === 'top' ? Math.max(0, FbmSync.BUDGET.activityTopScanQuietStreak - Number(cursor.topQuiet || 0)) : FbmSync.readListPendingCount();
  state.progress = { done: done, total: done + left };
};

/** Lớp 3 xong thì ghi Log vị trí sâu nhất có giao dịch mới để chỉnh độ dài chuỗi im lặng theo số đo thật. */
FbmSync.activityTopScanLog = function (state, cursor) {
  if (typeof logEvent !== 'function') { return; }
  var streak = FbmSync.BUDGET.activityTopScanQuietStreak;
  logEvent({ source: 'fbm_sync', action: 'activity_top_scan', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', cycleId: String(state.runId || ''), reason: 'Quét từ khách mới nhất xuống dừng ở khách thứ ' + Number(cursor.topPos || 0) + (Number(cursor.topQuiet || 0) >= streak ? ' sau ' + streak + ' khách liên tiếp không có gì mới' : ' vì hết danh sách') + '; giao dịch mới sâu nhất ở khách thứ ' + Number(cursor.topDeepest || 0) + '.', detail: { depth: Number(cursor.topPos || 0), deepestFresh: Number(cursor.topDeepest || 0), quiet: Number(cursor.topQuiet || 0), streak: streak } });
};

/**
 * Chặng đọc của từng loại lượt (09/02 Phần 8): `list` là danh sách đọc, `top` lớp 3, `bulk` lớp 1, `rotation` lớp 4. Chặng `list` cuối vét khách các chặng trước mới đánh dấu (khách cha cũ của giao dịch đổi khách, khách đang giữ giao dịch vắng).
 */
FbmSync.ACTIVITY_STAGES = { quick: ['list', 'top', 'list'], deep: ['list', 'top', 'bulk', 'list'], all: ['list'], detail: ['rotation', 'list'], activity_bulk: ['bulk', 'list'] };
FbmSync.activityStagesOf = function (state) { return state.scan === 'full' ? FbmSync.ACTIVITY_STAGES[FbmSync.scanPackOf(state.scanPack)] : FbmSync.ACTIVITY_STAGES[state.scan] || ['list']; };

/** Mở chặng kế; chặng không có việc thì sang chặng sau. Trả request đầu của chặng, hoặc `null` khi lượt đã hết chặng đọc. */
FbmSync.activityStageNext = function (state) {
  var stages = FbmSync.activityStagesOf(state);
  state.metadata = state.metadata || {};
  if (state.cursor && state.cursor.kind === 'activity_grid' && state.cursor.layer === 'top') { FbmSync.activityTopScanLog(state, state.cursor); }
  for (var index = Number(state.metadata.activityStage === undefined ? -1 : state.metadata.activityStage) + 1; index < stages.length; index += 1) {
    state.metadata.activityStage = index;
    var stage = stages[index], request;
    if (stage === 'bulk') { request = FbmSync.beginActivityBulkPull(state); }
    else if (stage === 'rotation') { request = FbmSync.activityRotationBegin(state); }
    else { request = FbmSync.gateOpen(state, stage === 'top' ? { layer: 'top', topPos: 0, topQuiet: 0, topDeepest: 0, topPositions: [] } : { layer: 'list' }, stage === 'top' ? 'Đang quét giao dịch từ khách mới nhất xuống...' : 'Đang đọc chi tiết các khách cần đọc...'); }
    if (request) { return request; }
  }
  state.cursor = {};
  FbmSync.stateWrite(state);
  return null;
};

/**
 * Lớp 4 — Vòng xoay: khách trên Sheet theo số CUS tăng dần, bắt đầu sau khách cuối đã ghi xong ở phiên trước, hết danh sách thì quay về số nhỏ nhất (09/02 "Chuỗi trong một lần hỏi" mục 9).
 * Cùng điều kiện với danh sách đọc, trừ khách mang cờ "không thấy bên FBM" hoặc "đã chuyển cho người khác": đọc lại thì mỗi vòng tốn một request tra mã cho khách vẫn vắng, còn khách FBM trả lại thì danh sách toàn bộ khách đã đưa vào đọc. Không đọc danh sách khách FBM: khách mới là việc của Quét nhanh.
 */
FbmSync.activityRotationRing = function (start) {
  var eligible = FbmSync.readListEligibleReader(), frozen = [FbmSync.SYNC_STATUS.missing, FbmSync.SYNC_STATUS.transferred], list = [];
  FbmSync.readLocal('customer').forEach(function (record) {
    if (eligible(record) && frozen.indexOf(String(record.syncStatus || '')) < 0) { list.push({ index: FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, record), sttRec: String(record.fbmId).trim() }); }
  });
  list.sort(function (a, b) { return a.index - b.index; });
  return list.filter(function (item) { return item.index > start; }).concat(list.filter(function (item) { return item.index <= start; }));
};

/** Mở chặng Vòng xoay: N khách theo lô `activityBatchCustomers` qua cửa ghi. Không có khách nào đủ điều kiện thì trả `null`, không đọc FBM. */
FbmSync.activityRotationBegin = function (state) {
  var start = FbmSync.detailCursorRead(), limit = Math.max(1, Number(state.detailCustomerLimit || FbmSync.backgroundScheduleDefault().detail.customersPerRun)), total = Math.min(limit, FbmSync.activityRotationRing(start).length);
  state.progress = { done: 0, total: total };
  return FbmSync.gateOpen(state, { layer: 'rotation', rotation: { start: start, limit: limit, taken: 0, last: -1 } }, 'Đang đọc giao dịch của ' + total + ' khách theo vòng xoay...');
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
  rotation.taken = taken + picked.length;
  rotation.last = picked.length ? picked[picked.length - 1].index : -1;
};
