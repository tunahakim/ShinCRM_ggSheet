/** Reconcile chieu pull va ghi thay doi an toan vao ShinCRM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc dữ liệu cục bộ kèm cột sync để phục vụ reconcile. */
FbmSync.readLocal = function (entity) {
  var block = typeof entityReadAllCombined === 'function' ? entityReadAllCombined(entity, [DATA_SCHEMA, SYNC_SCHEMA]) : entityReadAll(entity);
  return block.rows.map(function (row) {
    var record = {};
    block.fields.forEach(function (field, index) { record[field] = row[index]; });
    return record;
  });
};

/** Ghi quyết định pull theo từng record; không ghi payload hay cookie. */
FbmSync.logPullRecord = function (entity, incoming, current, statusAfter, reason, detail) {
  if (typeof logEvent !== 'function') { return; }
  var before = String(current && current.syncStatus || 'chưa liên kết');
  var after = String(statusAfter || 'đã đồng bộ');
  var outcome = after === FbmSync.SYNC_STATUS.conflict ? (typeof LOG_CONFLICT !== 'undefined' ? LOG_CONFLICT : 'conflict') : (after === FbmSync.SYNC_STATUS.error ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : (after === FbmSync.SYNC_STATUS.skipped || after === FbmSync.SYNC_STATUS.unknownCategory ? (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn') : (typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok')));
  logEvent({
    source: 'fbm_sync', action: 'pull_record', outcome: outcome, entity: entity,
    recordId: String(current && current.id || incoming && (incoming.fbmId || incoming.id) || ''),
    reason: String(reason || ''),
    detail: Object.assign({ direction: 'FBM → ShinCRM', statusBefore: before, statusAfter: after, hBASE: String(current && current.fbmHash || ''), hFBM: String(incoming && incoming.fbmHash || '') }, detail || {})
  });
};

/** Pull chỉ ghi record mới/thay đổi an toàn; không bao giờ xóa. */
FbmSync.pullWrite = function (entity, records) {
  // Pull không ghi đè thay đổi cục bộ; chỉ đánh dấu pending hoặc conflict.
  if (!records || !records.length) { return { ok: true, written: 0, conflicts: 0, skipped: 0 }; }
  var state = FbmSync.stateRead();
  var orphaned = 0;
  var categoryGate = state.metadata && state.metadata.categoryGate || {};
  var sourceRecords = records;
  if (entity === 'activity') {
    state.metadata = state.metadata || {};
    state.metadata.seen = state.metadata.seen || { customer: {}, activity: {} };
    (sourceRecords || []).forEach(function (incoming) { var sourceId = String(incoming && incoming.fbmId || '').trim(); if (sourceId) { state.metadata.seen.activity[sourceId] = true; } });
    records = (sourceRecords || []).filter(function (incoming) {
      var allowed = FbmSync.activitySinceAllows(incoming, state);
      if (!allowed) { FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.skipped, 'Activity nằm trước mốc FBM_ACTIVITY_SINCE.'); }
      return allowed;
    });
  }
  if (entity === 'activity') {
    var linked = FbmSync.linkActivityCustomers(records, FbmSync.readLocal('customer'), categoryGate);
    records = linked.records;
    orphaned = linked.orphaned + Number(linked.blocked || 0);
  }
  var local = {}, localById = {}, localByCode = {}, localByTaxNumber = {};
  FbmSync.readLocal(entity).forEach(function (record) {
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
    if (key) {
      state.metadata = state.metadata || {};
      state.metadata.seen = state.metadata.seen || { customer: {}, activity: {} };
      state.metadata.seen[entity] = state.metadata.seen[entity] || {};
      state.metadata.seen[entity][key] = true;
    }
    if (entity === 'activity' && !current) {
      var markerId = String(incoming.markerId || '').trim(), marked = markerId ? localById[markerId] : null;
      if (marked) {
        var markedLock = state.locks && state.locks[entity + ':' + String(marked.id || '')];
        if (markedLock && markedLock.owner === 'user') { skipped += 1; FbmSync.logActivityDecision('activity_pull_deferred', incoming, 'Activity dang duoc nguoi dung sua.'); FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.skipped, 'Hoãn vì người dùng đang sửa Activity.'); return; }
        if (String(marked.fbmId || '').trim() && String(marked.fbmId).trim() !== key) {
          conflicts += 1;
          FbmSync.rememberConflict(state, entity, marked, incoming, { hBASE: String(marked.fbmHash || ''), hSHIN: FbmSync.hash(marked, entity, categoryGate), hFBM: FbmSync.hash(incoming, entity, categoryGate) }, categoryGate);
          statusWrites.push({ id: marked.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
          FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.conflict, 'Marker trỏ tới Activity đã liên kết với FBM ID khác.');
        } else {
          writes.push(Object.assign({}, incoming, { id: marked.id, fbmId: key, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: '' }));
          if (state.locks) { delete state.locks[entity + ':' + String(marked.id || '')]; }
          FbmSync.logActivityDecision('activity_marker_recovery', incoming, 'Da va FBM ID tu marker noi bo.', typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', { shinId: String(marked.id || '') });
          FbmSync.logPullRecord(entity, incoming, marked, FbmSync.SYNC_STATUS.pushed, 'Khôi phục liên kết Activity từ marker nội bộ.');
        }
        return;
      }
      if (markerId) { skipped += 1; FbmSync.logActivityDecision('activity_pull_skipped', incoming, 'Marker khong tro toi Activity noi bo.'); FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.skipped, 'Marker không trỏ tới Activity nội bộ.'); return; }
    }
    var currentLock = current && state.locks && state.locks[entity + ':' + String(current.id || '')];
    if (currentLock && currentLock.owner === 'user') { skipped += 1; FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.skipped, 'Hoãn vì người dùng đang sửa bản ghi.'); return; }
    var mergedIncoming = current ? FbmSync.preserveLocalFields(entity, current, incoming) : incoming;
    if (current && FbmSync.pushPermission && FbmSync.pushPermission(current, entity).stop) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.skipped });
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.skipped, 'Customer hoặc Activity đã ngừng đồng bộ.');
      return;
    }
    var categoryErrors = typeof FbmSync.validateIncomingCategories === 'function' ? FbmSync.validateIncomingCategories(incoming, entity, categoryGate) : [];
    if (entity === 'activity' && (!String(incoming.workDate || '').trim() || (FbmSync.isDate(incoming.workDate) && isNaN(incoming.workDate.getTime())))) {
      skipped += 1;
      if (current) { statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.error }); }
      FbmSync.logActivityDecision('activity_pull_skipped', incoming, 'Activity thieu ngay lam viec hop le.', typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error');
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.error, 'Activity thiếu ngày làm việc hợp lệ.');
      return;
    }
    if (!current) {
      // Mã lạ không được tạo dòng thiếu dữ liệu; người dùng bổ sung Category rồi chạy lại.
      if (categoryErrors.length) { skipped += 1; FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.unknownCategory, 'Mã danh mục lạ; chưa tạo bản ghi mới.'); return; }
      // Chỉ bản ghi mới nhận giá trị mặc định này; record đã có không bị xóa quan hệ cha.
      writes.push(entity === 'customer' ? Object.assign({ parentCompanyName: '' }, incoming) : incoming);
      FbmSync.logPullRecord(entity, incoming, null, FbmSync.SYNC_STATUS.synced, 'Tạo bản ghi mới từ FBM; cửa ghi sẽ cấp mã nội bộ và ngày tạo.');
      return;
    }
    if (categoryErrors.length) {
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.unknownCategory });
      skipped += 1;
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.unknownCategory, 'Mã danh mục lạ; giữ nguyên nội dung nội bộ.');
      return;
    }
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
        FbmSync.logPullRecord(entity, incoming, current, confirmedStatus, confirmedStatus === FbmSync.SYNC_STATUS.synced ? 'Xac nhan ban ghi sau lan day truc tiep.' : 'Xac nhan lan day; ShinCRM da sua tiep nen cho luot day moi.');
      } else if (incomingHash === localHash) {
        writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Xác nhận bản ghi sau lần đẩy trước.');
      } else if (previousHash && incomingHash === previousHash) {
        if (pendingHash) { pendingClears.push({ entity: entity, id: current.id }); }
        skipped += 1;
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.notApplied });
        state.locks = state.locks || {};
        state.locks[entity + ':' + String(current.id)] = { revision: localHash, owner: 'sync', reason: 'not_applied', at: Date.now() };
        if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_not_applied', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: entity, recordId: String(current.id || ''), reason: 'FBM khong thay doi sau khi ghi; da khoa de khong lap vo han.' }); }
        FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.notApplied, 'FBM không đổi sau khi ghi; khóa để tránh lặp vô hạn.');
      } else {
        if (pendingHash) { pendingClears.push({ entity: entity, id: current.id }); }
        conflicts += 1;
        FbmSync.rememberConflict(state, entity, current, incoming, { hBASE: previousHash, hSHIN: localHash, hFBM: incomingHash }, categoryGate);
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
      if (String(current.syncStatus || '') !== FbmSync.SYNC_STATUS.synced || String(current.fbmHash || '') !== decision.hFBM) {
        statusWrites.push({ id: current.id, fbmHash: decision.hFBM, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() });
      }
      FbmSync.logPullRecord(entity, incoming, current, FbmSync.SYNC_STATUS.synced, 'Không có thay đổi giữa FBM và ShinCRM.');
      return;
    }
    if (decision.conflict) {
      conflicts += 1;
      FbmSync.rememberConflict(state, entity, current, incoming, decision, categoryGate);
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
  var result = { ok: true, written: 0, conflicts: conflicts, skipped: skipped + orphaned };
  var schemas = [DATA_SCHEMA, SYNC_SCHEMA];
  var allWrites = writes.concat(statusWrites);
  if (allWrites.length) {
    var saved = writeGateSave({ entity: entity, records: allWrites, source: 'pull', schemas: schemas });
    result.ok = !!saved.ok; result.written = saved.ok ? writes.length : 0; result.writeResult = saved;
    if (saved.ok && pendingClears.length && typeof FbmSync.pendingPushClear === 'function') { pendingClears.forEach(function (item) { FbmSync.pendingPushClear(item.entity, item.id); }); }
    if (saved.ok && typeof dirtyStateMarkRecords === 'function') {
      var ids = allWrites.map(function (record) { return record.id; }).filter(function (id) { return id !== undefined && id !== null && String(id).trim(); });
      if (saved.rows && saved.fields && saved.fields.indexOf('id') >= 0) {
        var idAt = saved.fields.indexOf('id');
        saved.rows.forEach(function (row) { if (row[idAt] !== undefined && row[idAt] !== null && String(row[idAt]).trim()) { ids.push(row[idAt]); } });
      }
      dirtyStateMarkRecords(ids);
    }
  }
  if (typeof FbmSync.stateWrite === 'function') { FbmSync.stateWrite(state); }
  return result;
};

/** Tính lại baseline theo luật hiện tại; chỉ ghi cột sync, không gọi FBM. */
FbmSync.recalculateBaseline = function (entity) {
  var state = FbmSync.stateRead(), gate = state.metadata && state.metadata.categoryGate || {};
  var records = FbmSync.readLocal(entity), patches = records.filter(function (record) {
    return !FbmSync.isTemporaryRecord(entity, record) && String(record.fbmId || '').trim();
  }).map(function (record) {
    return { id: record.id, fbmHash: FbmSync.hash(record, entity, gate), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() };
  });
  if (!patches.length) { return { ok: true, written: 0, reason: 'Không có bản ghi đã liên kết để tính baseline.' }; }
  if (typeof writeGateSave !== 'function') { return { ok: false, written: 0, reason: 'Thiếu cửa ghi nội bộ.' }; }
  var saved = writeGateSave({ entity: entity, records: patches, source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  return { ok: !!(saved && saved.ok), written: saved && saved.ok ? patches.length : 0, result: saved };
};

/** Giữ tombstone có FBM ID; bản ghi chưa từng đẩy vẫn được xóa cứng bình thường. */
function beforeHardDelete(entity, id) {
  var target = String(id || '').trim(), records = FbmSync.readLocal(entity);
  var found = records.filter(function (record) { return String(record.id || '').trim() === target; })[0];
  if (found && String(found.fbmId || '').trim()) { return { allowed: false, reason: 'Bản ghi đã có ID FBM nên chỉ được xóa mềm để giữ tombstone.' }; }
  return { allowed: true, reason: '' };
}
