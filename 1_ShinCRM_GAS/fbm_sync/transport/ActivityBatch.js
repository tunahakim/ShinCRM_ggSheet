/**
 * Cửa ghi chiều lấy về (Tài liệu 09/02 Phần 8, 09/04 "Luật ghi ở chiều lấy về", 09/05 Phần 9): mọi lần ghi Sheet ở chiều lấy về, kể cả cờ, đi qua đây theo lô tối đa `activityBatchCustomers` khách, bốn bước đọc, đối chiếu, tra mã, ghi.
 * Một lô Extension gồm phần tử 0 là danh sách khách lọc theo quyền và đúng các mã của lô, các phần tử sau là giao dịch của từng khách theo thứ tự lô; giao dịch của khách FBM không trả về bị bỏ, đổi lấy một lần gọi GAS ít hơn mỗi lô.
 * Dữ liệu lô không lọt DocumentProperties giữa hai lần gọi GAS nên lô ghi làm hai vòng: vòng đọc ghi khách rồi giao dịch và các cờ không cần tra; vòng tra mã (chỉ khi có vắng mặt) ghi các cờ còn lại. Danh sách mã cần tra nằm ở khóa riêng, cursor chỉ giữ vị trí.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

// Mỗi phần tử là `c:<stt_rec_kh>` (khách vắng, kiểm tra còn tồn tại) hoặc `a:<id giao dịch>` (giao dịch vắng, hỏi khách đang giữ).
FbmSync.GATE_LOOKUP_PREFIX = 'FBM_SYNC_GATE_LOOKUP_';

/** Mở cửa ghi cho một chặng đọc; trả request lô đầu hoặc `null` khi chặng không có khách nào. */
FbmSync.gateOpen = function (state, cursorFields, message) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  if (typeof FbmSync.businessStepStart === 'function') {
    ['pull_customer', 'reconcile_customer', 'pull_activity', 'reconcile_activity'].forEach(function (step) { FbmSync.businessStepStart(state, step, { mode: state.mode, scan: state.scan, entity: step.indexOf('customer') >= 0 ? 'customer' : 'activity' }); });
  }
  state.cursor = Object.assign({ kind: 'activity_grid', customers: [], count: FbmSync.BUDGET.activityCustomerRows }, cursorFields || {});
  state.message = message;
  FbmSync.activityBatchPlan(state.cursor);
  FbmSync.activityLayerProgress(state);
  FbmSync.stateWrite(state);
  return FbmSync.activityBatchRequest(state);
};

/** Lấp lô kế khi lô trước đã ghi xong: lớp 3, Vòng xoay hoặc danh sách đọc. Đang ở vòng tra mã thì giữ nguyên. */
FbmSync.activityBatchPlan = function (cursor) {
  if (cursor.lookup || (cursor.customers || []).length) { return cursor.customers || []; }
  if (cursor.layer === 'top') { FbmSync.activityTopRefill(cursor); }
  else if (cursor.rotation) { FbmSync.activityRotationRefill(cursor); }
  else { cursor.customers = FbmSync.readListNext(FbmSync.BUDGET.activityBatchCustomers); }
  return cursor.customers;
};

FbmSync.gateLookupChunk = function (cursor) {
  var from = Number(cursor.lookupPos || 0);
  return FbmSync.shardListRead(FbmSync.GATE_LOOKUP_PREFIX).slice(from, from + FbmSync.BUDGET.activityBatchCustomers);
};

/**
 * Dựng lại lô từ cursor; cùng cursor luôn ra cùng lô nên chạy lại sau probe hoặc thử lại là idempotent.
 * Chỉ khi lượt chưa có danh sách cột giao dịch thì phần tử giao dịch đầu lấy kèm tiêu đề; các phần tử khác đọc cột theo danh sách đó.
 */
FbmSync.activityBatchRequest = function (state) {
  var cursor = state.cursor || {};
  if (cursor.lookup) {
    var lookups = FbmSync.gateLookupChunk(cursor).map(function (entry) { return FbmSync.ownerLookupRequest(entry.charAt(0) === 'c' ? 'customer' : 'activity', entry.slice(2)); });
    return lookups.length ? { items: lookups, meta: { kind: 'batch', entity: 'customer' } } : null;
  }
  var customers = cursor.customers || [], count = Number(cursor.count || FbmSync.BUDGET.activityCustomerRows), needHeader = !(state.metadata && Array.isArray(state.metadata.activityFields) && state.metadata.activityFields.length);
  var customerItem = FbmSync.customerBatchRequest(customers);
  if (!customerItem) { return null; }
  return { items: [customerItem].concat(customers.map(function (sttRec) {
    var options = needHeader ? { type: 0, count: count, gridPageIndex: -1, gridRefresh: false } : { type: 1, count: count, gridPageIndex: FbmSync.GRID_FIRST_PAGE_NO_HEADER, gridRefresh: false };
    needHeader = false;
    return FbmSync.activityGridRequest(String(sttRec), options);
  })), meta: { kind: 'batch', entity: 'activity' } };
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
 * Ghi cờ của cửa ghi: "không thấy bên FBM", "đã chuyển cho người khác" và đổi khách cha khi khách mới bị chặn. Hàm quyết đọc lại bản ghi trong Cửa bản ghi theo mã; bỏ dòng đã vắng, dòng tiến trình khác đang giữ và dòng đang chờ quyết xung đột; dòng đã mang đúng cờ thì không ghi và không Log lại, nhưng vẫn đếm vì lượt này vẫn thấy nó vắng.
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
    if (!id || done[id] || !record || gate.busy(entity, [id])[id] || FbmSync.isConflictPending(record)) { return; }
    done[id] = true;
    var patch = Object.assign({ id: id }, flag.patch || {}), key = flag.status === sync.missing ? 'missing' : flag.status === sync.transferred ? 'transferred' : '';
    if (key) { state.counts[counted[key]] = Number(state.counts[counted[key]] || 0) + 1; }
    if (flag.status && String(record.syncStatus || '') !== flag.status) { patch.syncStatus = flag.status; }
    if (Object.keys(patch).length === 1) { return; }
    writes.push(patch);
    if (flag.status) { FbmSync.logPullRecord(entity, { fbmId: record.fbmId }, record, flag.status, flag.reason); }
  });
  // Ghi theo gói `CHUNK_ROWS` dòng: khách chuyển quyền kéo theo mọi giao dịch của khách nên một lần có thể vượt một lần qua cửa ghi.
  var size = typeof SETTINGS !== 'undefined' && SETTINGS.CHUNK_ROWS ? Number(SETTINGS.CHUNK_ROWS) : 2000, save = [];
  for (var start = 0; start < writes.length; start += size) { save.push({ entity: entity, records: writes.slice(start, start + size), source: 'pull' }); }
  return { save: save, value: writes.length };
};

/** Hai lần đọc FBM nói khác nhau về khách đang giữ một giao dịch: không ghi gì, Log để người phụ trách kiểm tra. */
FbmSync.gateOwnerMismatch = function (state, activity, owner, reason) {
  if (typeof logEvent !== 'function') { return; }
  logEvent({ source: 'fbm_sync', action: 'activity_owner_mismatch', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: 'activity', recordId: String(activity.id || ''), cycleId: String(state.runId || ''), reason: 'Giao dịch ' + String(activity.id || '') + ' (FBM ' + String(activity.fbmId || '') + '): ' + reason + ' Chưa ghi gì.', detail: { fbmId: String(activity.fbmId || ''), owner: String(owner || ''), customerId: String(activity.customerId || '') } });
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
 * Vòng đọc của lô: kiểm phần tử, ghi khách rồi giao dịch, đối chiếu vắng mặt, ghi cờ không cần tra; còn vắng mặt thì mở vòng tra mã.
 * Phần tử nghi phiên thì cả lô không ghi và đi đường probe (cursor còn nguyên nên dựng lại đúng lô); lỗi của một khách thì chỉ bỏ khách đó.
 */
FbmSync.gateReadContinue = function (state, cursor, checks) {
  var customers = cursor.customers || [], gate = FbmSync.stateCategoryGate(state), write = FbmSync.canWriteSheet(state.mode), count = Number(cursor.count || FbmSync.BUDGET.activityCustomerRows), customerCheck = checks[0];
  var returned = {}, readOk = {}, customerRecords = [], activityRecords = [], failed = [], outcomes = [], retry = [], isFresh = FbmSync.activityFreshIndex();
  state.metadata = state.metadata || {};
  if (!customerCheck.check.ok) {
    // Không biết khách nào còn nên không kết luận vắng mặt cho ai: báo lỗi từng khách của lô, không ghi, không tra.
    var reason = 'FBM trả lỗi khi đọc thông tin khách của lô; khách này chưa được đọc và không bị gắn cờ trong lượt. ' + String(customerCheck.check.bug && (customerCheck.check.bug.Message || customerCheck.check.bug.message) || '');
    customers.forEach(function (sttRec) { failed.push({ customer: sttRec, code: String(customerCheck.check.code || 'FBM_ERROR'), status: Number(customerCheck.check.status || 0), reason: reason }); outcomes.push({ sttRec: sttRec, fresh: null }); });
  } else {
    try {
      FbmSync.rowsToRecords('customer', FbmSync.protocol.parse(customerCheck.item)).rows.forEach(function (row) {
        var sttRec = String(row.stt_rec_kh || '').trim();
        if (customers.indexOf(sttRec) >= 0 && !FbmSync.isTemporaryRecord('customer', row)) { returned[sttRec] = row; }
      });
      checks.slice(1).forEach(function (entry) {
        var fields = entry.check.ok && !(state.metadata.activityFields || []).length ? FbmSync.gridFields(entry.item) : [];
        if (fields.length) { state.metadata.activityFields = fields; }
      });
      customers.forEach(function (sttRec, position) {
        var row = returned[sttRec], entry = checks[position + 1];
        if (!row) { return; }
        customerRecords.push(FbmSync.customerRecord(row, gate));
        if (!entry.check.ok) {
          failed.push({ customer: String(row.ma_kh || sttRec), code: String(entry.check.code || 'FBM_ERROR'), status: Number(entry.check.status || 0), reason: String(entry.check.bug && (entry.check.bug.Message || entry.check.bug.message) || 'FBM trả lỗi khi đọc giao dịch của khách') });
          outcomes.push({ sttRec: sttRec, fresh: null });
          return;
        }
        // Khách giữ tiêu đề bị lỗi thì lô chưa có danh sách cột: khách còn lại đọc lại ở lô sau, lô đó có một khách lấy tiêu đề.
        if (!(state.metadata.activityFields || []).length) { retry.push(sttRec); return; }
        var grid = FbmSync.rowsToRecords('activity', FbmSync.protocol.parse(entry.item), state.metadata.activityFields);
        state.metadata.activityFields = grid.fields;
        var records = grid.rows.filter(function (item) { return !FbmSync.isTemporaryRecord('activity', item); }).map(function (item) { return FbmSync.activityRecord(item, gate, { sttRec: sttRec, maKh: row.ma_kh }); });
        var complete = grid.rows.length < count;
        activityRecords = activityRecords.concat(records);
        readOk[sttRec] = { complete: complete };
        // Khách chạm trần một lần đọc chưa được đọc đủ: không vào tập "đã đọc" để giao dịch của khách không bị kết luận vắng.
        outcomes.push({ sttRec: sttRec, fresh: isFresh(records), complete: complete });
        if (!complete) { failed.push({ customer: String(row.ma_kh || sttRec), code: 'FBM_ACTIVITY_PAGE_LIMIT', status: 0, reason: 'Khách có từ ' + grid.rows.length + ' giao dịch trở lên, vượt trần một lần đọc; đã ghi phần đã đọc, phần còn lại chưa đọc và giao dịch của khách không bị kết luận vắng.' }); }
      });
    } catch (shapeError) {
      // Khối này chỉ ghép dòng theo tiêu đề cột: lỗi ở đây là FBM trả lệch cấu trúc (thiếu, trùng, đổi số cột), dừng cả lô chứ không đoán.
      return { result: FbmSync.activityBatchMismatch(state, String(shapeError && shapeError.message || shapeError), shapeError && shapeError.code || 'FBM_BATCH_ITEM_MISMATCH') };
    }
  }
  // Đối chiếu trên Sheet trước khi ghi: ghi xong thì giao dịch đổi khách đã nằm dưới khách mới.
  var local = write ? FbmSync.gateLocalIndex() : null, inBatch = {}, lookups = [], moved = [], flags = { customer: [], activity: [] }, waits = write ? FbmSync.readWaitRead() : {};
  activityRecords.forEach(function (record) { inBatch[String(record.fbmId || '').trim()] = String(record.customerFbmId || ''); });
  if (write) {
    customers.forEach(function (sttRec) { if (customerCheck.check.ok && !returned[sttRec] && local.byStt[sttRec]) { lookups.push('c:' + sttRec); } });
    Object.keys(local.activitiesOf).forEach(function (cus) {
      var parent = local.byCus[cus], owner = String(parent && parent.fbmId || '').trim();
      local.activitiesOf[cus].forEach(function (activity) {
        var fbmId = String(activity.fbmId).trim(), holder = inBatch[fbmId];
        // Giao dịch thấy dưới khách khác của lô: cửa ghi nối sang khách đó, khách cha cũ vào danh sách đọc.
        if (holder !== undefined) { if (holder !== owner) { moved.push(owner); } return; }
        if (readOk[owner] && readOk[owner].complete && FbmSync.ACTIVITY_ID_PATTERN.test(fbmId)) { lookups.push('a:' + fbmId); }
      });
    });
    // Giao dịch chờ nối vào khách của lô (09/05 Phần 9).
    customers.forEach(function (sttRec) {
      var waiting = waits[sttRec];
      if (!waiting) { return; }
      delete waits[sttRec];
      waiting.forEach(function (fbmId) {
        var activity = local.activityById[fbmId];
        if (!activity || inBatch[fbmId] !== undefined) { return; }
        if (customerCheck.check.ok && !returned[sttRec]) { flags.activity.push({ record: activity, status: FbmSync.SYNC_STATUS.transferred, reason: 'FBM báo giao dịch thuộc khách ' + sttRec + ' nhưng khách đó không còn trong quyền của tài khoản; giữ dưới khách cũ.' }); return; }
        if (readOk[sttRec] && readOk[sttRec].complete) { FbmSync.gateOwnerMismatch(state, activity, sttRec, 'FBM báo khách ' + sttRec + ' đang giữ giao dịch nhưng lần đọc khách đó không có giao dịch này.'); }
      });
    });
  }
  // Cursor chỉ tiến sau khi ghi xong: ghi lỗi giữa chừng thì state còn cursor cũ, lần sau dựng lại đúng lô này (ghi lại là idempotent).
  var activityFields = state.metadata.activityFields, mode = state.mode;
  if (customerRecords.length) { FbmSync.pullRecords('customer', customerRecords, mode); FbmSync.previewRecords('customer', customerRecords); }
  if (activityRecords.length) { FbmSync.pullRecords('activity', activityRecords, mode); FbmSync.previewRecords('activity', activityRecords); }
  state = FbmSync.stateRead();
  state.metadata = state.metadata || {};
  if ((activityFields || []).length) { state.metadata.activityFields = activityFields; }
  state.cursor.customers = retry;
  FbmSync.activityCustomerErrors(state, failed);
  if (write) {
    FbmSync.gateFlagWrite(state, 'activity', flags.activity);
    FbmSync.readWaitWrite(waits);
    FbmSync.readListAdd(moved);
  }
  FbmSync.readListDone(customers.filter(function (sttRec) { return retry.indexOf(sttRec) < 0; }));
  FbmSync.activityReadMark(outcomes.filter(function (item) { return item.complete; }).map(function (item) { return item.sttRec; }), outcomes.filter(function (item) { return item.fresh; }).map(function (item) { return item.sttRec; }));
  FbmSync.progressCustomersDone(state, customers.length - retry.length);
  if (cursor.layer === 'top') { state.cursor.customers = customers; FbmSync.activityTopAccount(state.cursor, outcomes); state.cursor.customers = retry; }
  var imported = customerRecords.length + activityRecords.length;
  if (lookups.length) {
    FbmSync.shardListWrite(FbmSync.GATE_LOOKUP_PREFIX, lookups);
    state.cursor.lookup = true; state.cursor.lookupPos = 0;
    state.message = 'Đang tra ' + lookups.length + ' mã vắng mặt trước khi gắn cờ...';
    FbmSync.stateWrite(state);
    return { result: { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityBatchRequest(state)), status: FbmSync.statusView(), imported: imported } };
  }
  return FbmSync.gateNextBatch(state, imported);
};

/**
 * Vòng tra mã: mỗi phần tử một mã, theo bảng 09/05 Phần 9 "Vắng mặt và chuyển quyền". Lỗi tra thì không gắn cờ, Sidebar và Log báo; hai lần đọc FBM nói khác nhau thì không ghi, Log `activity_owner_mismatch`.
 */
FbmSync.gateLookupContinue = function (state, cursor, checks, chunk) {
  var local = FbmSync.gateLocalIndex(), waits = FbmSync.readWaitRead(), isDone = FbmSync.readListDoneReader(), pullAllowed = FbmSync.pullAllowedReader('customer'), scope = typeof FbmSync.scope === 'function' ? FbmSync.scope() : null, sync = FbmSync.SYNC_STATUS;
  var flags = { customer: [], activity: [] }, adds = [], failed = [];
  chunk.forEach(function (entry, position) {
    var value = entry.slice(2), result = FbmSync.ownerLookupParse(checks[position].item);
    if (entry.charAt(0) === 'c') {
      var customer = local.byStt[value];
      if (!customer) { return; }
      if (!result.ok) { failed.push({ customer: String(customer.fbmCustomerCode || value), code: result.code, status: result.status, reason: 'Không kiểm tra được khách vắng còn tồn tại trên FBM; khách chưa bị gắn cờ. ' + result.reason }); return; }
      if (result.sttRecs.length) { FbmSync.gateTransferCustomer(flags, local, customer, 'Khách không còn trong quyền của tài khoản nhưng vẫn tồn tại trên FBM.'); }
      else { flags.customer.push({ record: customer, status: sync.missing, reason: 'Không thấy khách bên FBM; không suy ra xóa.' }); }
      return;
    }
    var activity = local.activityById[value], parent = activity && local.byCus[String(activity.customerId || '').trim()], current = String(parent && parent.fbmId || '').trim();
    if (!activity) { return; }
    if (!result.ok) { failed.push({ customer: 'giao dịch ' + value, code: result.code, status: result.status, reason: 'Không tra được khách đang giữ giao dịch vắng; giao dịch chưa bị gắn cờ. ' + result.reason }); return; }
    var owner = result.sttRecs[0] || '', next = local.byStt[owner];
    if (!owner) { flags.activity.push({ record: activity, status: sync.missing, reason: 'Không thấy giao dịch bên FBM; không suy ra xóa.' }); return; }
    if (owner === current) { FbmSync.gateOwnerMismatch(state, activity, owner, 'FBM báo khách cũ vẫn giữ giao dịch nhưng lần đọc khách đó không có giao dịch này.'); return; }
    if (isDone(owner)) { FbmSync.gateOwnerMismatch(state, activity, owner, 'FBM báo khách ' + owner + ' đang giữ giao dịch nhưng lần đọc khách đó trong lượt không có giao dịch này.'); return; }
    if (next && (String(next.recordStatus || 'active') === 'deleted' || !pullAllowed(next))) {
      // Khách mới đã xóa mềm hoặc không cho lấy về: không đọc khách đó, chỉ đổi khách cha, giữ nội dung.
      flags.activity.push({ record: activity, patch: { customerId: String(next.id || '').trim() } });
      if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'activity_parent_blocked', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: 'activity', recordId: String(activity.id || ''), cycleId: String(state.runId || ''), reason: 'Giao dịch ' + String(activity.id || '') + ' đã chuyển sang khách ' + String(next.id || '') + ' nhưng khách đó đã xóa hoặc không cho lấy về; chỉ đổi khách cha, giữ nội dung.', detail: { fbmId: value, from: String(activity.customerId || ''), to: String(next.id || '') } }); }
      return;
    }
    if (scope && !(next && FbmSync.inScope(next, scope))) { flags.activity.push({ record: activity, status: sync.transferred, reason: 'Giao dịch đã chuyển sang khách ngoài phạm vi đồng bộ; giữ dưới khách cũ.' }); return; }
    adds.push(owner);
    (waits[owner] = waits[owner] || []).push(value);
  });
  FbmSync.activityCustomerErrors(state, failed);
  FbmSync.gateFlagWrite(state, 'customer', flags.customer);
  FbmSync.gateFlagWrite(state, 'activity', flags.activity);
  FbmSync.readWaitWrite(waits);
  FbmSync.readListAdd(adds);
  state.cursor.lookupPos = Number(cursor.lookupPos || 0) + chunk.length;
  if (FbmSync.gateLookupChunk(state.cursor).length) {
    FbmSync.stateWrite(state);
    return { result: { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityBatchRequest(state)), status: FbmSync.statusView() } };
  }
  FbmSync.shardListWrite(FbmSync.GATE_LOOKUP_PREFIX, []);
  state.cursor.lookup = false; state.cursor.lookupPos = 0;
  return FbmSync.gateNextBatch(state, 0);
};

/** Lô đã ghi xong: lấp lô kế của chặng; hết khách thì trả `{ done: true }` để PullFlow sang chặng sau. */
FbmSync.gateNextBatch = function (state, imported) {
  FbmSync.activityBatchPlan(state.cursor);
  FbmSync.activityLayerProgress(state);
  var request = FbmSync.activityBatchRequest(state);
  FbmSync.stateWrite(state);
  return request ? { result: { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView(), imported: imported } } : { done: true, state: state, imported: imported };
};

/** Nhận một lô của cửa ghi. Lô thiếu, thừa hoặc trùng phần tử là lệch hợp đồng: dừng phiên, không ghi gì. */
FbmSync.activityBatchContinue = function (state, cursor, rawResponse) {
  var chunk = cursor.lookup ? FbmSync.gateLookupChunk(cursor) : null, expected = chunk ? chunk.length : (cursor.customers || []).length + 1, items = rawResponse && rawResponse.items, received = {}, bad = '';
  if (!Array.isArray(items) || !items.length) { return { result: FbmSync.activityBatchMismatch(state, 'Response lô đọc chi tiết không phải lô hoặc lô rỗng dù GAS đã cấp lô; Extension hoặc Sidebar đang chạy bản lệch hợp đồng.') }; }
  items.forEach(function (item) {
    var id = String(item && item.id);
    if (!/^\d+$/.test(id) || Number(id) >= expected || received[id]) { bad = bad || id; }
    received[id] = item;
  });
  if (bad) { return { result: FbmSync.activityBatchMismatch(state, 'Lô đọc chi tiết trả phần tử "' + bad + '" không có trong kế hoạch hoặc bị trùng; đã dừng và không ghi gì.') }; }
  if (items.length < expected) { return { result: FbmSync.activityBatchMismatch(state, 'Lô đọc chi tiết chỉ trả ' + items.length + '/' + expected + ' phần tử; đã dừng và không ghi gì.') }; }
  var checks = [];
  for (var position = 0; position < expected; position += 1) { checks.push({ item: received[String(position)], check: FbmSync.protocol.assertSuccess(received[String(position)]) }); }
  if (checks.some(function (entry) { return entry.check.code === 'SESSION_SUSPECTED'; })) {
    var probe = FbmSync.sessionGateProbeRequest(state, cursor, 'Phản hồi FBM đáng ngờ trong lô đọc chi tiết; chưa ghi gì, đang probe lại phiên.');
    return { result: probe ? { ok: true, request: probe, status: FbmSync.statusView(), probing: true } : { ok: false, code: 'SESSION_PROBE_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: state.lastError } };
  }
  return chunk ? FbmSync.gateLookupContinue(state, cursor, checks, chunk) : FbmSync.gateReadContinue(state, cursor, checks);
};
