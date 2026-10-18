/** Reconcile chieu pull va ghi thay doi an toan vao ShinCRM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc dữ liệu cục bộ kèm cột sync qua bản đọc Sheet chung của lần gọi: nhiều kiểm tra cùng gọi chỉ tốn một lần đọc Sheet, và cửa ghi sửa bản đọc sau khi ghi nên không có đường đọc dữ liệu cũ. Mỗi lần gọi dựng record mới nên bên gọi sửa record không làm bẩn lần đọc sau. */
FbmSync.readLocal = function (entity) {
  return entityBlockRecords(entityReadAllCombined(entity, [DATA_SCHEMA, SYNC_SCHEMA]));
};

/**
 * Bản đọc Customer/Activity cho một bước cần nhiều công cụ cùng xét mọi bản ghi (kiểm tra trước phiên, dựng ứng viên đẩy): mỗi thực thể chỉ đọc và chuyển ô khi có người hỏi tới, và tối đa một lần; hash mỗi bản ghi tính tối đa một lần.
 * Hash nhớ theo `gate.map` chứ không theo object gate, vì gate của phiên là bản chép nông của gate Category chung và chỉ khác phần `blocked` mà hash không dùng. Bản đọc chỉ sống trong lần gọi, không lưu đi đâu.
 */
FbmSync.localScan = function () {
  var hashes = new WeakMap(), read = {};
  return {
    records: function (entity) {
      if (!read[entity]) { read[entity] = FbmSync.readLocal(entity) || []; }
      return read[entity];
    },
    hash: function (record, entity, gate) {
      var map = gate && gate.map || null, memo = hashes.get(record);
      if (memo && memo.map === map) { return memo.hash; }
      var hash = String(FbmSync.hash(record, entity, gate));
      hashes.set(record, { map: map, hash: hash });
      return hash;
    }
  };
};

/** Chỉ trạng thái người dùng cần xử lý mới vào bộ gom Log; `detail.issue` đánh dấu bản ghi bỏ qua vì dữ liệu hỏng. */
FbmSync.logPullRecord = function (entity, incoming, current, statusAfter, reason, detail) {
  var status = String(statusAfter || ''), sync = FbmSync.SYNC_STATUS;
  var issue = (detail && detail.issue === true) || [sync.conflict, sync.error, sync.notApplied, sync.unknownCategory, sync.missing, sync.transferred].indexOf(status) >= 0;
  if (!issue) { return null; }
  var outcome = status === sync.conflict ? (typeof LOG_CONFLICT !== 'undefined' ? LOG_CONFLICT : 'conflict') : status === sync.error ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn');
  return FbmSync.recordIssueAdd('pull', entity, status, String(current && current.id || incoming && (incoming.fbmId || incoming.id) || ''), reason, outcome);
};

/**
 * So hai mã FBM theo thứ tự tạo: mã toàn chữ số so như số (độ dài trước, rồi chuỗi), mã khác coi là hòa để giữ nguyên thứ tự nhận.
 *
 * Không so chuỗi thô vì `99999` đứng sau `100000`; không dùng `Number` vì mã dài có thể vượt độ chính xác số thực.
 */
FbmSync.compareFbmId = function (a, b) {
  var left = String(a || '').trim(), right = String(b || '').trim();
  if (!/^\d+$/.test(left) || !/^\d+$/.test(right)) { return 0; }
  left = left.replace(/^0+(?=\d)/, ''); right = right.replace(/^0+(?=\d)/, '');
  if (left.length !== right.length) { return left.length - right.length; }
  return left < right ? -1 : left > right ? 1 : 0;
};

/** Pull chỉ ghi record mới/thay đổi an toàn; không bao giờ xóa. */
FbmSync.pullWrite = function (entity, records) {
  // Pull không ghi đè thay đổi cục bộ; chỉ đánh dấu pending hoặc conflict.
  if (!records || !records.length) { return { ok: true, written: 0, conflicts: 0, skipped: 0 }; }
  var state = FbmSync.stateRead();
  var orphaned = 0;
  var categoryGate = FbmSync.stateCategoryGate(state);
  state.metadata = state.metadata || {};
  // Đọc cục bộ, nối khách cha, so ba chiều và ghi trong một hàm quyết: một lần Lưu hay Xóa của người dùng không chen được vào giữa lúc đọc và lúc ghi.
  var change = FbmSync.recordChange(function (gate) {
  var localRecords = gate.read(entity, FbmSync.recordSchemas());
  if (entity === 'activity') {
    var linked = FbmSync.linkActivityCustomers(records, gate.read('customer', FbmSync.recordSchemas()), categoryGate);
    records = linked.records;
    orphaned = linked.orphaned + Number(linked.blocked || 0);
    // FBM trả mới nhất trước, còn cửa ghi cấp `ACT-` theo thứ tự mảng này. Sắp cũ trước để mã ShinCRM tăng theo thứ tự nhập thật, nếu không giao dịch cùng ngày sẽ xếp ngược FBM. Chỉ chạy ở đây, một chỗ cấp mã cho mọi đường kéo.
    records = records.slice().sort(function (a, b) { return FbmSync.compareFbmId(a.fbmId, b.fbmId); });
  }
  var local = {}, localById = {}, localByCode = {}, localByTaxNumber = {}, ownedFixes = {}, recovered = [];
  localRecords.forEach(function (record) {
    if (record.fbmId) { local[String(record.fbmId).trim()] = record; localById[String(record.fbmId).trim()] = record; }
    if (record.id) { localById[String(record.id).trim()] = record; }
    if (entity === 'customer' && record.fbmCustomerCode) { var code = String(record.fbmCustomerCode).trim(); (localByCode[code] || (localByCode[code] = [])).push(record); }
    if (entity === 'customer') { var tax = FbmSync.customerTaxKey(record.taxNumber || record.ma_so_thue); if (tax) { (localByTaxNumber[tax] || (localByTaxNumber[tax] = [])).push(record); } }
  });
  var writes = [], statusWrites = [], pendingClears = [], conflicts = 0, skipped = 0;
  records.filter(function (incoming) { return !FbmSync.isTemporaryRecord(entity, incoming); }).forEach(function (incoming) {
    var key = String(incoming.fbmId || '').trim();
    var current = local[key];
    var identityMatched = false;
    if (entity === 'customer' && !current) {
      var taxIssue = FbmSync.customerTaxIdentityIssue(localByTaxNumber, incoming);
      if (taxIssue) {
        skipped += 1;
        state.metadata = state.metadata || {};
        state.metadata.identityBlocks = Array.isArray(state.metadata.identityBlocks) ? state.metadata.identityBlocks : [];
        state.metadata.identityBlocks.push({ entity: 'customer', taxNumber: taxIssue.tax, fbmCustomerCode: String(incoming.fbmCustomerCode || ''), reason: taxIssue.reason, at: Date.now() });
        if (taxIssue.records.length === 1) { statusWrites.push({ id: taxIssue.records[0].id, syncStatus: FbmSync.SYNC_STATUS.error }); }
        FbmSync.logPullRecord(entity, incoming, taxIssue.records.length === 1 ? taxIssue.records[0] : null, FbmSync.SYNC_STATUS.error, 'Không nối được Customer theo MST: ' + taxIssue.reason + '.');
        return;
      }
      current = FbmSync.findCustomerByIdentity(localById, localByCode, incoming, localByTaxNumber);
      if (current) { local[key] = current; identityMatched = String(current.fbmId || '').trim() !== key; }
    }
    if (entity === 'activity' && !current) {
      var markerId = String(incoming.markerId || '').trim(), marked = markerId ? localById[markerId] : null;
      if (marked && FbmSync.isConflictPending(marked)) { skipped += 1; return; }
      if (marked) {
        var markedBusy = gate.busy(entity, [marked.id])[String(marked.id || '').trim()];
        if (markedBusy) { skipped += 1; FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.skipped, 'Hoãn tới lượt sau: ' + markedBusy.reason, { issue: true }); return; }
        if (String(marked.fbmId || '').trim() && String(marked.fbmId).trim() !== key) {
          conflicts += 1;
          statusWrites.push({ id: marked.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
          FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.conflict, 'Marker trỏ tới Activity đã liên kết với FBM ID khác.');
        } else {
          writes.push(Object.assign({}, incoming, { id: marked.id, fbmId: key, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: '' }));
          // Lệnh tạo mất phản hồi giữ bản ghi tới lúc tìm lại được qua dấu; tìm lại rồi thì nhả cùng lần ghi liên kết.
          recovered.push(marked.id);
          FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.pushed, 'Khôi phục liên kết Activity từ marker nội bộ.');
        }
        return;
      }
      if (markerId) { skipped += 1; FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.skipped, 'Marker không trỏ tới Activity nội bộ.', { issue: true }); return; }
    }
    // `09/04`: dòng đang chờ quyết bị khóa đồng bộ, không lấy về; nó đã nằm trong hàng đợi xung đột nên không ghi Log lặp mỗi kỳ.
    if (current && FbmSync.isConflictPending(current)) { skipped += 1; return; }
    var currentBusy = current && gate.busy(entity, [current.id])[String(current.id || '').trim()];
    if (currentBusy) { skipped += 1; FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.skipped, 'Hoãn tới lượt sau: ' + currentBusy.reason, { issue: true }); return; }
    var mergedIncoming = current ? FbmSync.preserveLocalFields(entity, current, incoming) : incoming;
    var currentPermission = current ? FbmSync.syncPermission(current, entity) : null;
    if (currentPermission && !currentPermission.pull) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.skipped });
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.skipped, 'Không lấy từ FBM: ' + currentPermission.reason, { issue: currentPermission.invalid });
      return;
    }
    var categoryErrors = typeof FbmSync.validateIncomingCategories === 'function' ? FbmSync.validateIncomingCategories(incoming, entity, categoryGate) : [];
    if (entity === 'activity' && (!String(incoming.workDate || '').trim() || (FbmSync.isDate(incoming.workDate) && isNaN(incoming.workDate.getTime())))) {
      skipped += 1;
      if (current) { statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.error }); }
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.error, 'Activity thiếu ngày làm việc hợp lệ.');
      return;
    }
    if (!current) {
      // Mã lạ không được tạo dòng thiếu dữ liệu; người dùng bổ sung Category rồi chạy lại.
      if (categoryErrors.length) { skipped += 1; FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.unknownCategory, 'Mã danh mục lạ; chưa tạo bản ghi mới.'); return; }
      // Chỉ bản ghi mới nhận các giá trị mặc định này; record đã có không bị xóa quan hệ cha và giữ Xác thực của mình.
      writes.push(entity === 'customer' ? Object.assign({ parentCompanyName: '' }, incoming, { verifyStatus: FbmSync.pullVerifyStatus() }) : incoming);
      FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.synced, 'Tạo bản ghi mới từ FBM; cửa ghi sẽ cấp mã nội bộ và ngày tạo.');
      return;
    }
    if (categoryErrors.length) {
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.unknownCategory });
      skipped += 1;
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.unknownCategory, 'Mã danh mục lạ; giữ nguyên nội dung nội bộ.');
      return;
    }
    // Trường FBM sở hữu đứng ngoài fingerprint nên hash không lộ khi chúng đổi; ghi đè riêng: ma_kh để Activity mới còn nối được Customer cha (FBM-054), người tạo để hiện đúng người tạo trên FBM.
    (FbmSync.PULL_OVERWRITE_FIELDS[entity] || []).forEach(function (field) {
      var value = String(incoming[field] || '').trim();
      if (!value || value === String(current[field] || '')) { return; }
      (ownedFixes[current.id] = ownedFixes[current.id] || {})[field] = value;
      if (FbmSync.PULL_OVERWRITE_LOGGED[field]) { FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, FbmSync.PULL_OVERWRITE_LOGGED[field] + value + '.', { issue: true }); }
    });
    if (identityMatched) {
      writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmId: key, fbmCustomerCode: incoming.fbmCustomerCode || current.fbmCustomerCode, fbmHash: FbmSync.hash(incoming, entity, categoryGate), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Nối lại định danh FBM vào dòng ShinCRM hiện có.');
      return;
    }
    if (String(current.syncStatus || '') === FbmSync.SYNC_STATUS.pushed) {
      var localHash = FbmSync.hash(current, entity, categoryGate), incomingHash = FbmSync.hash(incoming, entity, categoryGate), previousHash = String(current.fbmHash || '').trim(), pendingItem = typeof FbmSync.pendingPushGet === 'function' ? FbmSync.pendingPushGet(entity, current.id) : null, pendingHash = String(pendingItem && (pendingItem.hSHIN || pendingItem.hash) || '').trim();
      if (pendingHash && incomingHash === pendingHash) {
        pendingClears.push({ entity: entity, id: current.id });
        var confirmedStatus = localHash === pendingHash ? FbmSync.SYNC_STATUS.synced : FbmSync.SYNC_STATUS.pending;
        if (confirmedStatus === FbmSync.SYNC_STATUS.synced) {
          writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: incomingHash, syncStatus: confirmedStatus, syncedAt: new Date() }));
        } else {
          statusWrites.push({ id: current.id, fbmHash: incomingHash, syncStatus: confirmedStatus, syncedAt: new Date() });
        }
        FbmSync.logPullRecord(entity, incoming, current, confirmedStatus, confirmedStatus === FbmSync.SYNC_STATUS.synced ? 'Xác nhận bản ghi sau lần đẩy trực tiếp.' : 'Xác nhận lần đẩy; ShinCRM đã sửa tiếp nên chờ lượt đẩy mới.');
      } else if (incomingHash === localHash) {
        writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Xác nhận bản ghi sau lần đẩy trước.');
      } else if (previousHash && incomingHash === previousHash) {
        if (pendingHash) { pendingClears.push({ entity: entity, id: current.id }); }
        skipped += 1;
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.notApplied });
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.notApplied, 'FBM không đổi sau khi ghi; trạng thái đẩy không ăn chặn đẩy lại để tránh lặp vô hạn.');
      } else {
        if (pendingHash) { pendingClears.push({ entity: entity, id: current.id }); }
        conflicts += 1;
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.conflict, 'Hai phía cùng thay đổi sau lần đẩy.');
      }
      return;
    }
    var localHash = FbmSync.hash(current, entity, categoryGate), incomingHash = FbmSync.hash(incoming, entity, categoryGate);
    if (!String(current.fbmHash || '').trim() && localHash === incomingHash) {
      statusWrites.push({ id: current.id, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() });
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Bổ sung baseline còn thiếu, không ghi nội dung.');
      return;
    }
    var decision = FbmSync.threeWay({ hBASE: current.fbmHash || '' }, current, incoming, entity, categoryGate);
    if (decision.unchanged) {
      // G12: dấu #SC đứng ngoài hash nên chỉ thấy qua markerId. Giao dịch của chính tài khoản đang đồng bộ còn dấu thì xếp một lệnh sửa (không mang dấu) để bỏ, kể cả giao dịch đẩy trước G12; đẩy không ăn thì trạng thái đó chặn xếp lại.
      if (entity === 'activity' && String(incoming.markerId || '') === String(current.id || '') && String(current.syncStatus || '') === FbmSync.SYNC_STATUS.synced && String(incoming.owner || '') === String(FbmSync.scriptSettings().accountName || '')) {
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.pending });
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.pending, 'Nội dung trên FBM còn dấu nhận diện #SC; xếp lượt đẩy để bỏ dấu.');
        return;
      }
      if (String(current.syncStatus || '') !== FbmSync.SYNC_STATUS.synced || String(current.fbmHash || '') !== decision.hFBM) {
        statusWrites.push({ id: current.id, fbmHash: decision.hFBM, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() });
      }
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Không có thay đổi giữa FBM và ShinCRM.');
      return;
    }
    if (decision.conflict) {
      conflicts += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.conflict, 'Hai phía cùng thay đổi; chờ giải quyết.');
      return;
    }
    if (decision.shinChanged && !decision.fbmChanged) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.pending });
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.pending, 'Chỉ ShinCRM thay đổi; chờ chiều đẩy.');
      return;
    }
    writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: decision.hFBM, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
    FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Chỉ FBM thay đổi; cập nhật nội dung ShinCRM.');
  });
  // Dòng chỉ được sửa trường FBM sở hữu vẫn là dữ liệu đổi trên Sheet, nên tính vào số đã ghi; không thì Log báo "0 bản ghi đã ghi Sheet" cạnh một lần ghi thật.
  var ownedOnly = 0;
  Object.keys(ownedFixes).forEach(function (id) {
    var written = writes.filter(function (item) { return String(item.id) === id; })[0], patch = written || statusWrites.filter(function (item) { return String(item.id) === id; })[0];
    if (!written) { ownedOnly += 1; }
    if (patch) { Object.assign(patch, ownedFixes[id]); } else { statusWrites.push(Object.assign({ id: id }, ownedFixes[id])); }
  });
  var allWrites = writes.concat(statusWrites);
  return { save: allWrites.length ? [{ entity: entity, records: allWrites, source: 'pull' }] : [], release: recovered.length ? [{ entity: entity, ids: recovered }] : [], value: { written: allWrites.length ? writes.length + ownedOnly : 0, batches: allWrites.length ? 1 : 0, conflicts: conflicts, skipped: skipped + orphaned, pendingClears: pendingClears } };
  });
  var outcome = change.value;
  var result = { ok: true, written: outcome.written, conflicts: outcome.conflicts, skipped: outcome.skipped, sheetWriteBatches: outcome.batches };
  if (typeof FbmSync.pendingPushClear === 'function') { outcome.pendingClears.forEach(function (item) { FbmSync.pendingPushClear(item.entity, item.id); }); }
  if (typeof FbmSync.stateWrite === 'function') { FbmSync.stateWrite(state); }
  return result;
};

/** Giữ tombstone có FBM ID; bản ghi chưa từng đẩy vẫn được xóa cứng bình thường. Đọc bản ghi cục bộ một lần cho cả danh sách mã; trả `{ soft: { mã: lý do } }`, mã vắng trong `soft` là được xóa hẳn. */
function beforeHardDelete(entity, ids) {
  var wanted = {};
  (ids || []).forEach(function (id) { wanted[String(id || '').trim()] = true; });
  var soft = {};
  FbmSync.readLocal(entity).forEach(function (record) {
    var id = String(record.id || '').trim();
    if (wanted[id] && String(record.fbmId || '').trim()) { soft[id] = 'Bản ghi đã có ID FBM nên chỉ được xóa mềm để giữ tombstone.'; }
  });
  return { soft: soft };
}
