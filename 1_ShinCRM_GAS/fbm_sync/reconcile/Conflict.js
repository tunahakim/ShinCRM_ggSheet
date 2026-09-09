/** Luu va giai quyet conflict sau doi soat ba chieu. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Ghi conflict có giới hạn vào state để người dùng xem và quyết định sau. */
FbmSync.rememberConflict = function (state, entity, current, incoming, decision, categoryGate) {
  state.metadata = state.metadata || {};
  state.metadata.conflicts = Array.isArray(state.metadata.conflicts) ? state.metadata.conflicts : [];
  state.metadata.conflicts.push({ entity: entity, id: String(current && current.id || ''), fbmId: String(incoming && incoming.fbmId || current && current.fbmId || ''), hBASE: decision.hBASE, hSHIN: decision.hSHIN, hFBM: decision.hFBM, fields: FbmSync.diff(entity, current, incoming, categoryGate), shinRecord: Object.assign({}, current || {}), fbmRecord: Object.assign({}, incoming || {}), at: Date.now() });
  state.locks = state.locks || {};
  state.locks[entity + ':' + String(current && current.id || '')] = { revision: String(decision.hSHIN || ''), owner: 'sync', reason: 'conflict', at: Date.now() };
  if (state.metadata.conflicts.length > 100) { state.metadata.conflicts = state.metadata.conflicts.slice(-100); }
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'conflict', outcome: LOG_CONFLICT, entity: entity, recordId: String(current && current.id || ''), reason: 'Hai phía cùng thay đổi; chờ quyết định.', detail: { fbmId: String(incoming && incoming.fbmId || current && current.fbmId || ''), hBASE: decision.hBASE, hSHIN: decision.hSHIN, hFBM: decision.hFBM, fields: FbmSync.diff(entity, current, incoming, categoryGate) } });
  }
};

/** Chốt conflict theo phía được chọn; baseline mới chỉ ghi sau quyết định rõ ràng. */
FbmSync.resolveConflict = function (entity, id, choice, merged) {
  var state = FbmSync.stateRead(), conflicts = state.metadata && state.metadata.conflicts || [], target = String(id || '').trim(), item = conflicts.filter(function (entry) { return entry.entity === entity && String(entry.id) === target; })[0];
  if (!item) { return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không tìm thấy conflict cần xử lý.' }; }
  var record;
  if (choice === 'fbm') { record = Object.assign({}, item.fbmRecord); }
  else if (choice === 'shin') { record = Object.assign({}, item.shinRecord); }
  else if (choice === 'manual' && merged && typeof merged === 'object') { record = Object.assign({}, item.shinRecord, merged); }
  else { return { ok: false, code: 'CONFLICT_CHOICE_INVALID', message: 'Cách xử lý conflict không hợp lệ.' }; }
  record.id = target;
  record.fbmHash = choice === 'fbm' ? item.hFBM : (choice === 'shin' ? item.hSHIN : FbmSync.hash(record, entity, state.metadata.categoryGate || {}));
  record.syncStatus = FbmSync.SYNC_STATUS.synced;
  if (typeof writeGateSave !== 'function') { return { ok: false, code: 'WRITE_GATE_UNAVAILABLE', message: 'Không có cửa ghi để chốt conflict.' }; }
  var saved = writeGateSave({ entity: entity, records: [record], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { return { ok: false, code: 'CONFLICT_WRITE_FAILED', result: saved }; }
  state.metadata.conflicts = conflicts.filter(function (entry) { return entry !== item; });
  var lockKey = entity + ':' + target;
  if (state.locks && state.locks[lockKey] && state.locks[lockKey].owner === 'sync') { delete state.locks[lockKey]; }
  state.counts.conflict = Math.max(0, Number(state.counts.conflict || 0) - 1);
  state.phase = state.metadata.conflicts.length ? 'conflict' : (state.phase === 'conflict' ? 'done' : state.phase);
  state.message = 'Đã quyết conflict ' + entity + ' ' + target + ' theo ' + choice + '.';
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: target, choice: choice, status: FbmSync.SYNC_STATUS.synced };
};

