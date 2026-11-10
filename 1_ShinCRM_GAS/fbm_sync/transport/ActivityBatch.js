/**
 * Cửa ghi chiều lấy về (Tài liệu 09/02 Phần 8, 09/04 "Luật ghi ở chiều lấy về", 09/05 Phần 9): mọi lần ghi Sheet ở chiều lấy về, kể cả cờ, đi qua đây theo lô tối đa `activityBatchCustomers` khách, bốn bước đọc, đối chiếu, tra mã, ghi.
 * Một lô Extension gồm phần tử 0 là danh sách khách lọc theo quyền và đúng các mã của lô, các phần tử sau là giao dịch của từng khách theo thứ tự lô; giao dịch của khách FBM không trả về bị bỏ, đổi lấy một lần gọi GAS ít hơn mỗi lô.
 * Dữ liệu lô không lọt DocumentProperties giữa hai lần gọi GAS nên lô ghi làm hai vòng: vòng đọc ghi khách rồi giao dịch và các cờ không cần tra; vòng tra mã (chỉ khi có vắng mặt) ghi các cờ còn lại. Danh sách mã cần tra nằm ở khóa riêng, cursor chỉ giữ vị trí.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }


/** Mở cửa ghi cho một chặng đọc trên ô lượt được truyền vào; trả request lô đầu hoặc `null` khi chặng không có khách nào. Không ghi ô lượt. */
FbmSync.gateOpen = function (state, cursorFields, message, cfg, scope) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  ['pull_customer', 'reconcile_customer', 'pull_activity', 'reconcile_activity'].forEach(function (step) { FbmSync.businessStepStart(state, step, { mode: state.mode, scan: state.scan, entity: step.indexOf('customer') >= 0 ? 'customer' : 'activity' }); });
  state.cursor = Object.assign({ kind: 'activity_grid', customers: [], count: FbmSync.BUDGET.activityCustomerRows }, cursorFields || {});
  state.message = message;
  var source = FbmSync.activityBatchSource(state.cursor);
  FbmSync.activityBatchPlan(state.cursor, state.metadata, source);
  FbmSync.activityLayerProgress(state, source);
  return FbmSync.activityBatchRequest(state, cfg, scope, null);
};

/**
 * Đọc thứ lớp đang chạy cần để lấp lô kế và tính tiến trình; gọi sau khi lô trước đã ghi xong vì khách mới ghi trong lô làm đổi danh sách. Lô kế đã có sẵn (vòng tra mã, khách đọc dở trang) thì lớp 3 và Vòng xoay không đọc.
 * Lớp 3 trả `top`, Vòng xoay trả `ring`, danh sách đọc trả `list` cùng `pending` (số khách còn chờ, mẫu số tiến trình).
 */
FbmSync.activityBatchSource = function (cursor) {
  var refill = !cursor.lookup && !(cursor.customers || []).length;
  if (cursor.layer === 'top') { return refill ? { top: FbmSync.activityTopSource() } : {}; }
  if (cursor.rotation) { return refill ? { ring: FbmSync.activityRotationRing(Number(cursor.rotation.start)) } : {}; }
  var all = FbmSync.readListNext(Infinity);
  return { list: all.slice(0, FbmSync.BUDGET.activityBatchCustomers), pending: all.length };
};

/** Thiếu phần đầu vào lớp cần là lỗi người điều phối: ném, không coi như hết khách (hết khách thì chặng kết thúc âm thầm). */
FbmSync.activityBatchSourceMissing = function (what) {
  var error = new Error('Lô đọc chi tiết thiếu "' + what + '" của lớp đang chạy; người điều phối phải đọc qua activityBatchSource (hoặc gateLookupChunk) trước.');
  error.code = 'FBM_BATCH_SOURCE_MISSING';
  return error;
};

/** Lấp lô kế khi lô trước đã ghi xong: lớp 3, Vòng xoay hoặc danh sách đọc, từ `source` của `activityBatchSource`. Đang ở vòng tra mã hoặc còn khách đọc dở thì giữ nguyên. `metadata` là của ô lượt, Vòng xoay ghi vị trí đã đọc xong vào đó. */
FbmSync.activityBatchPlan = function (cursor, metadata, source) {
  if (cursor.lookup || (cursor.customers || []).length) { return cursor.customers || []; }
  var key = cursor.layer === 'top' ? 'top' : cursor.rotation ? 'ring' : 'list';
  if (!source || !source[key]) { throw FbmSync.activityBatchSourceMissing(key); }
  if (key === 'top') { FbmSync.activityTopRefill(cursor, source.top); }
  else if (key === 'ring') { FbmSync.activityRotationRefill(cursor, metadata, source.ring); }
  else { cursor.customers = source.list.slice(); }
  return cursor.customers;
};

/** Phần mã cần tra của lô kế trong danh sách mã chờ tra, tính từ vị trí `pos`. */
FbmSync.gateLookupSlice = function (list, pos) {
  var from = Number(pos || 0);
  return (list || []).slice(from, from + FbmSync.BUDGET.activityBatchCustomers);
};

/** Đọc phần mã cần tra của lô hiện tại từ khóa riêng; chỉ người điều phối gọi (dựng lại request khi cứu đường truyền). */
FbmSync.gateLookupChunk = function (cursor) {
  return FbmSync.gateLookupSlice(FbmSync.shardListRead(FbmSync.GATE_LOOKUP_PREFIX), cursor.lookupPos);
};

/**
 * Dựng lại lô từ cursor; vòng tra mã nhận phần mã cần tra qua `chunk` (người điều phối đọc). Cùng cursor luôn ra cùng lô nên chạy lại sau probe hoặc thử lại là idempotent.
 * Mỗi bảng (khách, giao dịch) chỉ lấy tiêu đề khi lượt chưa có tên cột gốc của bảng đó; có rồi thì Extension cắt cột theo vị trí tính từ tên cột gốc. Chưa có tên cột gốc giao dịch thì mọi phần tử giao dịch đầu trang của lô lấy tiêu đề, vì vị trí cột phải biết lúc dựng request.
 */
FbmSync.activityBatchRequest = function (state, cfg, scope, chunk) {
  var cursor = state.cursor || {}, metadata = state.metadata || {};
  if (cursor.lookup) {
    if (!Array.isArray(chunk)) { throw FbmSync.activityBatchSourceMissing('chunk'); }
    var lookups = chunk.map(function (entry) { return FbmSync.ownerLookupRequest(entry.charAt(0) === 'c' ? 'customer' : 'activity', entry.slice(2), metadata.customerFields, cfg); });
    return lookups.length ? { items: lookups, meta: { kind: 'batch', entity: 'customer' } } : null;
  }
  var customers = cursor.customers || [], count = Number(cursor.count || FbmSync.BUDGET.activityCustomerRows), activityFields = Array.isArray(metadata.activityFields) && metadata.activityFields.length ? metadata.activityFields : null;
  var customerItem = FbmSync.customerBatchRequest(customers, metadata.customerFields, scope, cfg);
  if (!customerItem) { return null; }
  var pages = cursor.pages || {};
  return { items: [customerItem].concat(customers.map(function (sttRec) {
    var page = pages[sttRec];
    // Khách đang đọc dở nhiều trang luôn đã có tên cột gốc (trang trước có hoặc đã dùng nó).
    if (page) { return FbmSync.activityGridRequest(String(sttRec), { type: 1, count: count, gridPageIndex: page.pageIndex, gridPageValue: page.pageValue, pageItems: page.pageItems, gridRefresh: false, sourceFields: activityFields }, cfg); }
    return FbmSync.activityGridRequest(String(sttRec), activityFields ? { type: 1, count: count, gridPageIndex: FbmSync.GRID_FIRST_PAGE_NO_HEADER, gridRefresh: false, sourceFields: activityFields } : { type: 0, count: count, gridPageIndex: -1, gridRefresh: false }, cfg);
  })), meta: { kind: 'batch', entity: 'activity' } };
};

/** Lỗi một khách không hỏng lô: Sidebar thấy mã 20 khách gần nhất cùng tổng số; câu lỗi (thông báo FBM dài tùy FBM) chỉ ở dòng Log trả cho chặng, vì ô lượt có trần một khóa. */
FbmSync.activityCustomerErrors = function (state, failed) {
  if (!failed.length) { return []; }
  var previous = state.metadata.customerErrors || { total: 0, recent: [] }, codes = failed.map(function (item) { return { customer: String(item.customer || ''), code: String(item.code || ''), status: Number(item.status || 0) }; });
  state.metadata.customerErrors = { total: Number(previous.total || 0) + failed.length, recent: (previous.recent || []).concat(codes).slice(-20) };
  state.counts.error = Number(state.counts.error || 0) + failed.length;
  return failed.map(function (item) { return { action: 'activity_customer_failed', outcome: LOG_ERROR, reason: item.reason, detail: { customer: item.customer, code: item.code, status: item.status } }; });
};

/** Lô lệch kế hoạch, lệch cột hoặc hỏng yêu cầu đọc khách chung là lỗi cả lô: lỗi có mã kèm dòng Log (`detail` chỉ vào Log) để chặng ném, lượt đóng lỗi, không ghi gì. */
FbmSync.activityBatchError = function (message, failureCode, detail) {
  var error = new Error(message);
  error.code = failureCode || 'FBM_BATCH_ITEM_MISMATCH';
  error.logs = [{ action: 'activity_batch_mismatch', outcome: LOG_ERROR, reason: message, detail: Object.assign({ code: error.code }, detail || {}) }];
  return error;
};

/**
 * Kiểm response của một lô theo kế hoạch: thiếu, thừa hoặc trùng phần tử là lệch hợp đồng, ném `FBM_BATCH_ITEM_MISMATCH` (thiếu phần tử thì không biết khách nào vắng thật). Khớp thì xếp loại từng phần tử theo `classifyFailure`.
 */
FbmSync.activityBatchCheck = function (reply, expected) {
  var items = reply && reply.items, received = {}, bad = '';
  if (!Array.isArray(items) || !items.length) { throw FbmSync.activityBatchError('Response lô đọc chi tiết không phải lô hoặc lô rỗng dù GAS đã cấp lô; Extension hoặc Sidebar đang chạy bản lệch hợp đồng.'); }
  items.forEach(function (item) {
    var id = String(item && item.id);
    if (!/^\d+$/.test(id) || Number(id) >= expected || received[id]) { bad = bad || id; }
    received[id] = item;
  });
  if (bad) { throw FbmSync.activityBatchError('Lô đọc chi tiết trả phần tử "' + bad + '" không có trong kế hoạch hoặc bị trùng; đã dừng và không ghi gì.'); }
  if (items.length < expected) { throw FbmSync.activityBatchError('Lô đọc chi tiết chỉ trả ' + items.length + '/' + expected + ' phần tử; đã dừng và không ghi gì.'); }
  var checks = [];
  for (var position = 0; position < expected; position += 1) { checks.push({ item: received[String(position)], check: FbmSync.protocol.assertSuccess(received[String(position)]) }); }
  return checks;
};

/**
 * Ghi cờ của cửa ghi: "không thấy bên FBM", "đã chuyển cho người khác" và đổi khách cha khi khách mới bị chặn. Hàm quyết đọc lại bản ghi trong Cửa bản ghi theo mã; bỏ dòng đã vắng và dòng tiến trình khác đang giữ; dòng đang chờ quyết xung đột vẫn nhận cờ vì bản FBM đã vắng hoặc đổi chủ thì không còn gì để quyết, và rời hàng đợi xung đột; dòng đã mang đúng cờ thì không ghi và không Log lại, nhưng vẫn đếm vì lượt này vẫn thấy nó vắng.
 * `flags`: `[{ record, status, patch, reason }]`, mỗi bản ghi một lần; `record` chỉ dùng để lấy mã.
 */
FbmSync.gateFlagWrite = function (state, entity, flags) {
  if (!(flags || []).length) { return 0; }
  return FbmSync.recordChange(function (gate) { return FbmSync.gateFlagDecide(gate, state, entity, flags); }).value;
};

/** Hàm quyết của `gateFlagWrite`. */
FbmSync.gateFlagDecide = function (gate, state, entity, flags) {
  var writes = [], sync = FbmSync.SYNC_STATUS, counted = { missing: entity === 'activity' ? 'missingActivity' : 'missingCustomer', transferred: entity === 'activity' ? 'transferredActivity' : 'transferredCustomer' }, done = {}, fresh = {};
  gate.read(entity, FbmSync.recordSchemas()).forEach(function (record) { fresh[String(record.id || '').trim()] = record; });
  state.counts = state.counts || {};
  (flags || []).forEach(function (flag) {
    var id = String(flag.record && flag.record.id || '').trim(), record = fresh[id];
    if (!id || done[id] || !record || gate.busy(entity, [id])[id]) { return; }
    done[id] = true;
    var patch = Object.assign({ id: id }, flag.patch || {}), key = flag.status === sync.missing ? 'missing' : flag.status === sync.transferred ? 'transferred' : '';
    if (key) { state.counts[counted[key]] = Number(state.counts[counted[key]] || 0) + 1; }
    if (flag.status && String(record.syncStatus || '') !== flag.status) { patch.syncStatus = flag.status; }
    if (patch.syncStatus && FbmSync.isConflictPending(record)) { FbmSync.conflictCountShift(state, -1); }
    if (Object.keys(patch).length === 1) { return; }
    writes.push(patch);
    if (flag.status) { FbmSync.logPullRecord(entity, { fbmId: record.fbmId }, record, flag.status, flag.reason); }
  });
  // Ghi theo gói `CHUNK_ROWS` dòng: khách chuyển quyền kéo theo mọi giao dịch của khách nên một lần có thể vượt một lần qua cửa ghi.
  var size = Number(SETTINGS.CHUNK_ROWS), save = [];
  for (var start = 0; start < writes.length; start += size) { save.push({ entity: entity, records: writes.slice(start, start + size), source: 'pull' }); }
  return { save: save, value: writes.length };
};

/** Hai lần đọc FBM nói khác nhau về khách đang giữ một giao dịch: không ghi gì; trả dòng Log để người phụ trách kiểm tra. */
FbmSync.gateOwnerMismatch = function (activity, owner, reason) {
  return { action: 'activity_owner_mismatch', outcome: LOG_WARN, entity: 'activity', recordId: String(activity.id || ''), reason: 'Giao dịch ' + String(activity.id || '') + ' (FBM ' + String(activity.fbmId || '') + '): ' + reason + ' Chưa ghi gì.', detail: { fbmId: String(activity.fbmId || ''), owner: String(owner || ''), customerId: String(activity.customerId || '') } };
};

/** Chỉ mục khách và giao dịch trên Sheet cho một bước đối chiếu; dựng một lần mỗi lời gọi. */
FbmSync.gateLocalIndex = function () {
  var index = { byStt: {}, byCus: {}, activityById: {}, activitiesOf: {}, tracked: FbmSync.activityBulkTracker() };
  FbmSync.readLocal('customer').forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    if (fbmId) { index.byStt[fbmId] = record; }
    index.byCus[String(record.id || '').trim()] = record;
  });
  FbmSync.readLocal('activity').forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim(), parent = String(record.customerId || '').trim();
    if (fbmId) { index.activityById[fbmId] = record; }
    if (index.tracked(record)) { (index.activitiesOf[parent] = index.activitiesOf[parent] || []).push(record); }
  });
  return index;
};

/** Khách vắng mà vẫn tồn tại trên FBM: khách và mọi giao dịch của khách mang "đã chuyển cho người khác", giữ nội dung. */
FbmSync.gateTransferCustomer = function (flags, local, customer, reason) {
  flags.customer.push({ record: customer, status: FbmSync.SYNC_STATUS.transferred, reason: reason });
  (local.activitiesOf[String(customer.id || '').trim()] || []).forEach(function (activity) { flags.activity.push({ record: activity, status: FbmSync.SYNC_STATUS.transferred, reason: reason }); });
};

/**
 * Đầu vào của chặng lô đọc chi tiết, đọc qua cổng chủ một lần mỗi lát trước mọi lần ghi: cổng danh mục; phạm vi khách; chỉ mục Sheet và hàng chờ đọc dở khi lô được ghi Sheet hoặc đang tra mã; giao dịch đã thấy ở trang trước khi có khách đọc dở trang; chỉ mục mới cho vòng đọc; danh sách mã chờ tra, tập đã đọc và quyền kéo cho vòng tra. Tên tài khoản lấy ở `ctx.settings`.
 */
FbmSync.activityGridInputs = function (state) {
  var cursor = state.cursor || {}, lookup = !!cursor.lookup, local = lookup || FbmSync.canWriteSheet(state.mode);
  return {
    categoryGate: FbmSync.stateCategoryGate(state),
    scope: FbmSync.scope(),
    local: local ? FbmSync.gateLocalIndex() : null,
    waits: local ? FbmSync.readWaitRead() : {},
    pagedSeen: !lookup && Object.keys(cursor.pages || {}).length ? FbmSync.shardListRead(FbmSync.ACTIVITY_PAGED_SEEN_PREFIX) : [],
    isFresh: lookup ? null : FbmSync.activityFreshIndex(),
    lookupList: lookup ? FbmSync.shardListRead(FbmSync.GATE_LOOKUP_PREFIX) : [],
    isDone: lookup ? FbmSync.readListDoneReader() : null,
    pullAllowed: lookup ? FbmSync.pullAllowedReader('customer') : null
  };
};

/**
 * Chặng lô đọc chi tiết (lớp xả đọc và vòng tra mã): kiểm lô, ghi hoặc gắn cờ, rồi lấp lô kế của lớp; hết khách thì `end` để bước kết mở lớp kế.
 * Phần tử nghi phiên thì cả lô không ghi và nhường cổng phiên (cursor còn nguyên nên dựng lại đúng lô); lỗi của một khách thì chỉ bỏ khách đó.
 */
FbmSync.activityGridStage = function (ctx) {
  var state = ctx.state, cursor = state.cursor, input = ctx.inputs, logs = [];
  var chunk = cursor.lookup ? FbmSync.gateLookupSlice(input.lookupList, cursor.lookupPos) : null;
  var checks = FbmSync.activityBatchCheck(ctx.reply, chunk ? chunk.length : (cursor.customers || []).length + 1);
  if (checks.some(function (entry) { return entry.check.code === 'SESSION_SUSPECTED'; })) { return { patch: {}, session: { suspected: 'Phản hồi FBM đáng ngờ trong lô đọc chi tiết; chưa ghi gì, đang probe lại phiên.' } }; }
  state.metadata = state.metadata || {};
  var step = chunk ? FbmSync.gateLookupContinue(state, checks, chunk, input, logs) : FbmSync.gateReadContinue(state, checks, input, { categoryGate: input.categoryGate, accountName: ctx.settings.accountName, now: ctx.now }, logs);
  var imported = step.imported;
  var patch = function () { return { cursor: state.cursor, counts: state.counts, metadata: state.metadata, progress: state.progress, message: state.message, logs: logs }; };
  if (!state.cursor.lookup) {
    var source = FbmSync.activityBatchSource(state.cursor);
    FbmSync.activityBatchPlan(state.cursor, state.metadata, source);
    FbmSync.activityLayerProgress(state, source);
  }
  var request = FbmSync.activityBatchRequest(state, ctx.settings, input.scope, state.cursor.lookup ? FbmSync.gateLookupSlice(step.lookupList, state.cursor.lookupPos) : null);
  if (!request && state.cursor.layer === 'top') { logs.push(FbmSync.activityTopScanLine(state.cursor)); }
  return request ? { patch: patch(), next: request } : { patch: patch(), end: { imported: imported } };
};

/** Bước kết của chặng: mở lớp đọc kế của lượt; hết lớp thì chốt lượt hoặc sang chiều đẩy, lượt xong thì nối bước đếm khách. */
FbmSync.activityGridEnd = function (state, end) {
  return FbmSync.runTail(FbmSync.activityStagesContinue(state, { imported: end.imported }));
};

/**
 * Vòng đọc của lô (người điều phối con của chặng): hàm quyết ghép lô và đối chiếu vắng mặt trên đầu vào đã đọc, rồi ghi khách, giao dịch, cờ không cần tra, hàng chờ, danh sách đọc theo thứ tự; còn vắng mặt thì mở vòng tra mã (`cursor.lookup`). Sửa trên `state` của chặng, trả `{ imported, lookupList }`.
 * Cursor chỉ tiến sau khi ghi xong: ghi lỗi giữa chừng thì lát lỗi, ô lượt còn cursor cũ và lần sau dựng lại đúng lô này (ghi lại là idempotent).
 */
FbmSync.gateReadContinue = function (state, checks, input, pull, logs) {
  var cursor = state.cursor, customers = cursor.customers || [], write = FbmSync.canWriteSheet(state.mode);
  var batch = FbmSync.batchRecordsOf(checks, cursor, input);
  if (batch.customerFields) { state.metadata.customerFields = batch.customerFields; }
  if (batch.activityFields) { state.metadata.activityFields = batch.activityFields; }
  var absent = FbmSync.absentFind(batch, customers, input, write), nextPages = batch.nextPages, pagedSeen = input.pagedSeen || [];
  Array.prototype.push.apply(logs, absent.logs);
  if (batch.customerRecords.length) { FbmSync.pullBatchApply(state, 'customer', batch.customerRecords, pull); FbmSync.previewRecords('customer', batch.customerRecords); }
  if (batch.activityRecords.length) { FbmSync.pullBatchApply(state, 'activity', batch.activityRecords, pull); FbmSync.previewRecords('activity', batch.activityRecords); }
  var carried = Object.keys(nextPages);
  state.cursor.customers = carried;
  state.cursor.pages = nextPages;
  Array.prototype.push.apply(logs, FbmSync.activityCustomerErrors(state, batch.failed));
  if (pagedSeen.length || batch.pagedNew.length) { FbmSync.shardListWrite(FbmSync.ACTIVITY_PAGED_SEEN_PREFIX, pagedSeen.filter(function (entry) { return nextPages[entry.slice(0, entry.indexOf(':'))]; }).concat(batch.pagedNew)); }
  if (write) {
    FbmSync.gateFlagWrite(state, 'activity', absent.flags.activity);
    FbmSync.readWaitWrite(absent.waits);
    FbmSync.readListAdd(absent.moved);
  }
  FbmSync.readListDone(customers.filter(function (sttRec) { return carried.indexOf(sttRec) < 0; }));
  FbmSync.activityReadMark(batch.outcomes.filter(function (item) { return item.complete; }).map(function (item) { return item.sttRec; }), batch.outcomes.filter(function (item) { return item.fresh; }).map(function (item) { return item.sttRec; }));
  FbmSync.progressCustomersDone(state, customers.length - carried.length);
  if (cursor.layer === 'top') {
    // Vị trí lớp top đi theo khách: khách còn ở lô sau giữ đúng vị trí của mình để bộ đếm im lặng tính đúng khi khách đó xong.
    var positions = cursor.topPositions || [];
    state.cursor.customers = customers; FbmSync.activityTopAccount(state.cursor, batch.outcomes);
    state.cursor.customers = carried; state.cursor.topPositions = carried.map(function (sttRec) { return positions[customers.indexOf(sttRec)]; });
  }
  if (absent.lookups.length) {
    FbmSync.shardListWrite(FbmSync.GATE_LOOKUP_PREFIX, absent.lookups);
    state.cursor.lookup = true; state.cursor.lookupPos = 0;
    state.message = 'Đang tra ' + absent.lookups.length + ' mã vắng mặt trước khi gắn cờ...';
  }
  return { imported: batch.customerRecords.length + batch.activityRecords.length, lookupList: absent.lookups };
};

/**
 * Vòng tra mã (người điều phối con của chặng): `lookupDecide` quyết trên đầu vào đã đọc, rồi ghi cờ, hàng chờ, danh sách đọc. Hết mã thì tắt vòng tra để chặng lấp lô kế. Trả `{ imported: 0, lookupList }` vì vòng tra không nhận bản ghi nào.
 */
FbmSync.gateLookupContinue = function (state, checks, chunk, input, logs) {
  var decided = FbmSync.lookupDecide(chunk, checks, input);
  Array.prototype.push.apply(logs, decided.logs);
  Array.prototype.push.apply(logs, FbmSync.activityCustomerErrors(state, decided.failed));
  FbmSync.gateFlagWrite(state, 'customer', decided.flags.customer);
  FbmSync.gateFlagWrite(state, 'activity', decided.flags.activity);
  FbmSync.readWaitWrite(decided.waits);
  FbmSync.readListAdd(decided.adds);
  state.cursor.lookupPos = Number(state.cursor.lookupPos || 0) + chunk.length;
  if (!FbmSync.gateLookupSlice(input.lookupList, state.cursor.lookupPos).length) {
    FbmSync.shardListWrite(FbmSync.GATE_LOOKUP_PREFIX, []);
    state.cursor.lookup = false; state.cursor.lookupPos = 0;
  }
  return { imported: 0, lookupList: input.lookupList };
};
