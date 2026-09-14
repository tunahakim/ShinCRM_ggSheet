/** Luu va giai quyet conflict sau doi soat ba chieu. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Ghi descriptor conflict có giới hạn; bản sao record được đọc lại khi người dùng xử lý. */
FbmSync.rememberConflict = function (state, entity, current, incoming, decision, categoryGate) {
  state.metadata = state.metadata || {};
  state.metadata.conflicts = Array.isArray(state.metadata.conflicts) ? state.metadata.conflicts : [];
  state.metadata.conflicts.push({ entity: entity, id: String(current && current.id || ''), fbmId: String(incoming && incoming.fbmId || current && current.fbmId || ''), hBASE: decision.hBASE, hSHIN: decision.hSHIN, hFBM: decision.hFBM, fields: FbmSync.diff(entity, current, incoming, categoryGate), at: Date.now() });
  state.locks = state.locks || {};
  state.locks[entity + ':' + String(current && current.id || '')] = { revision: String(decision.hSHIN || ''), owner: 'sync', reason: 'conflict', at: Date.now() };
  if (state.metadata.conflicts.length > 100) {
    var dropped = state.metadata.conflicts.slice(0, state.metadata.conflicts.length - 100);
    state.metadata.conflicts = state.metadata.conflicts.slice(-100);
    dropped.forEach(function (entry) {
      var key = String(entry.entity || '') + ':' + String(entry.id || '');
      if (state.locks[key] && state.locks[key].owner === 'sync' && state.locks[key].reason === 'conflict') { delete state.locks[key]; }
    });
  }
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'conflict', outcome: LOG_CONFLICT, entity: entity, recordId: String(current && current.id || ''), reason: 'Hai phía cùng thay đổi; chờ quyết định.', detail: { fbmId: String(incoming && incoming.fbmId || current && current.fbmId || ''), hBASE: decision.hBASE, hSHIN: decision.hSHIN, hFBM: decision.hFBM, fields: FbmSync.diff(entity, current, incoming, categoryGate) } });
  }
};
/** Chốt conflict theo phía được chọn; baseline mới chỉ ghi sau quyết định rõ ràng. */
FbmSync.resolveConflict = function (entity, id, choice, merged, verified) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  if (verified !== true) { return { ok: false, code: 'CONFLICT_REREAD_REQUIRED', message: 'Phải đọc lại FBM và ShinCRM ngay trước khi chốt xung đột.' }; }
  var state = FbmSync.stateRead(), conflicts = state.metadata && state.metadata.conflicts || [], target = String(id || '').trim(), item = conflicts.filter(function (entry) { return entry.entity === entity && String(entry.id) === target; })[0];
  if (!item) { return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không tìm thấy conflict cần xử lý.' }; }
  var record;
  if (choice === 'fbm') { record = Object.assign({}, item.fbmRecord); }
  else if (choice === 'shin') { record = Object.assign({}, item.shinRecord); }
  else if (choice === 'manual' && merged && typeof merged === 'object') {
    record = Object.assign({}, item.shinRecord);
    Object.keys(merged).forEach(function (field) {
      var localField = typeof FbmSync.conflictLocalField === 'function' ? FbmSync.conflictLocalField(entity, field) : field;
      if (localField) { record[localField] = merged[field]; }
    });
  }
  else { return { ok: false, code: 'CONFLICT_CHOICE_INVALID', message: 'Cách xử lý conflict không hợp lệ.' }; }
  record.id = target;
  var categoryGate = state.metadata.categoryGate || {};
  record.fbmHash = item.hFBM;
  record.syncStatus = FbmSync.hash(record, entity, categoryGate) === String(item.hFBM || '')
    ? FbmSync.SYNC_STATUS.synced
    : FbmSync.SYNC_STATUS.pending;
  if (typeof writeGateSave !== 'function') { return { ok: false, code: 'WRITE_GATE_UNAVAILABLE', message: 'Không có cửa ghi để chốt conflict.' }; }
  var saved = writeGateSave({ entity: entity, records: [record], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { return { ok: false, code: 'CONFLICT_WRITE_FAILED', result: saved }; }
  state.metadata.conflicts = conflicts.filter(function (entry) { return entry !== item; });
  var lockKey = entity + ':' + target;
  if (state.locks && state.locks[lockKey] && state.locks[lockKey].owner === 'sync') { delete state.locks[lockKey]; }
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  state.metadata.pushFailureDetails = state.metadata.pushFailureDetails || {};
  delete state.metadata.pushFailures[entity + ':' + target];
  delete state.metadata.pushFailureDetails[entity + ':' + target];
  state.counts.conflict = Math.max(0, Number(state.counts.conflict || 0) - 1);
  state.phase = state.metadata.conflicts.length ? 'conflict' : (state.phase === 'conflict' ? 'done' : state.phase);
  state.message = 'Đã quyết conflict ' + entity + ' ' + target + ' theo ' + choice + '.';
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: target, choice: choice, status: record.syncStatus };
};

/** Chuẩn bị một lượt đọc lại FBM; chỉ Sidebar chuyển request qua Extension, GAS vẫn quyết định nghiệp vụ. */
FbmSync.prepareConflictResolution = function (entity, id, choice, merged) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể xử lý conflict.' }; }
  var state = FbmSync.stateRead(), conflicts = state.metadata && state.metadata.conflicts || [], target = String(id || '').trim();
  var item = conflicts.filter(function (entry) { return entry.entity === entity && String(entry.id) === target; })[0];
  if (!item) { return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không tìm thấy conflict cần xử lý.' }; }
  if (!['fbm', 'shin', 'manual'].some(function (value) { return value === choice; })) { return { ok: false, code: 'CONFLICT_CHOICE_INVALID', message: 'Cách xử lý conflict không hợp lệ.' }; }
  var request = typeof FbmSync.conflictRefreshRequest === 'function' ? FbmSync.conflictRefreshRequest(entity, item) : null;
  if (!request) { return { ok: false, code: 'CONFLICT_REFRESH_UNAVAILABLE', message: 'Không dựng được request đọc lại FBM.' }; }
  state.metadata = state.metadata || {};
  state.metadata.conflictRefresh = { entity: entity, id: target, choice: choice, merged: merged && typeof merged === 'object' ? merged : {}, openedHash: String(item.hFBM || '') };
  state.cursor = { kind: 'conflict_refresh', entity: entity, id: target };
  state.message = 'Đang đọc lại FBM trước khi chốt conflict ' + target + '...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() };
};

/** Nhận response đọc lại và chỉ chốt khi hash FBM vẫn đúng snapshot lúc mở conflict. */
FbmSync.confirmConflict = function (entity, id, choice, merged, rawResponse) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  var state = FbmSync.stateRead(), refresh = state.metadata && state.metadata.conflictRefresh || {}, target = String(id || '').trim(), responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '';
  if (refresh.entity !== entity || String(refresh.id || '') !== target) { return { ok: false, code: 'CONFLICT_REFRESH_NOT_FOUND', message: 'Không còn lượt đọc lại conflict tương ứng.' }; }
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId) || !state.cursor || state.cursor.kind !== 'conflict_refresh') {
    return { ok: false, code: 'STALE_RESPONSE', message: 'Response đọc lại xung đột đã cũ hoặc không thuộc request đang chờ.' };
  }
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now(); FbmSync.stateWrite(state);
  var success = FbmSync.protocol.assertSuccess(rawResponse);
  if (!success.ok) {
    state.cursor = {}; state.metadata.conflictRefresh = null; state.message = 'Không đọc lại được FBM; conflict vẫn giữ nguyên để thử lại.'; FbmSync.stateWrite(state);
    return { ok: false, code: success.code || 'CONFLICT_REFRESH_FAILED', message: 'Không đọc lại được FBM trước khi chốt conflict.', status: FbmSync.statusView() };
  }
  var item = (state.metadata.conflicts || []).filter(function (entry) { return entry.entity === entity && String(entry.id) === target; })[0];
  if (!item) { return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không tìm thấy conflict cần xử lý.' }; }
  var grid = FbmSync.rowsToRecords(entity, rawResponse, state.metadata[entity + 'Fields']), rows = grid.rows || [], latest = rows[0];
  if (!latest) {
    state.cursor = {}; state.metadata.conflictRefresh = null; state.message = 'FBM không trả bản ghi conflict; giữ nguyên để người dùng kiểm tra.'; FbmSync.stateWrite(state);
    return { ok: false, code: 'CONFLICT_REFRESH_MISSING', message: 'FBM không còn trả bản ghi này; conflict chưa được chốt.', status: FbmSync.statusView() };
  }
  var gate = state.metadata.categoryGate || {}, latestRecord = entity === 'customer' ? FbmSync.customerRecord(latest, gate) : FbmSync.activityRecord(latest, gate), latestHash = String(latestRecord.fbmHash || '');
  item.fbmRecord = latestRecord;
  if (latestHash !== String(refresh.openedHash || '')) {
    item.fbmRecord = latestRecord; item.hFBM = latestHash; item.fields = FbmSync.diff(entity, item.shinRecord, latestRecord, gate); item.at = Date.now();
    state.cursor = {}; state.metadata.conflictRefresh = null; state.message = 'FBM đã thay đổi trong lúc xử lý; conflict đã được cập nhật, hãy xem lại.'; FbmSync.stateWrite(state);
    return { ok: false, code: 'CONFLICT_CHANGED_REVIEW', message: state.message, status: FbmSync.statusView() };
  }
  var local = (FbmSync.readLocal(entity) || []).filter(function (record) { return String(record && record.id || '') === target; })[0];
  if (!local) {
    state.cursor = {}; state.metadata.conflictRefresh = null; state.message = 'Bản ghi ShinCRM không còn tồn tại; conflict vẫn được giữ để kiểm tra.'; FbmSync.stateWrite(state);
    return { ok: false, code: 'CONFLICT_LOCAL_MISSING', message: state.message, status: FbmSync.statusView() };
  }
  item.shinRecord = local; item.hSHIN = FbmSync.hash(local, entity, gate);
  state.cursor = {}; state.metadata.conflictRefresh = null; FbmSync.stateWrite(state);
  return FbmSync.resolveConflict(entity, target, refresh.choice, refresh.merged, true);
};
