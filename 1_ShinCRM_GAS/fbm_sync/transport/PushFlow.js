/** Dieu phoi chieu day ShinCRM sang FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc companion và lookup một lần trước chiều đẩy; mismatch chỉ chặn push. */
FbmSync.prepareCategoryGate = function (state) {
  var gate = { map: {}, names: {}, valid: {}, warnings: [] }, blocks = [];
  try {
    gate = FbmSync.readCategoryGate();
    blocks = FbmSync.validateLookupGate(state, gate);
  } catch (err) {
    blocks = [{ source: 'Category', reason: 'Không đọc được bảng Category: ' + String(err && err.message || err) }];
  }
  state.metadata = state.metadata || {};
  gate.blocked = {};
  blocks.forEach(function (block) { if (block.source && block.code) { gate.blocked[block.source + '\u001f' + block.code] = block.reason; } });
  state.metadata.categoryGate = gate;
  state.metadata.categoryBlocks = blocks;
  return blocks;
};
/** Ghi kết quả push theo record; chỉ giữ ID, request kind và hash, không giữ payload. */
FbmSync.logPushRecord = function (candidate, operation, outcome, reason, detail) {
  if (typeof logEvent !== 'function') { return; }
  var record = candidate && candidate.record || {}, entity = String(candidate && candidate.entity || ''), id = String(candidate && candidate.id || record.id || '');
  var gate = (candidate && candidate.categoryGate) || {};
  var hShin = typeof FbmSync.hash === 'function' ? FbmSync.hash(record, entity, gate) : '';
  logEvent({
    source: 'fbm_sync', action: 'push_record', outcome: outcome || (typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok'), entity: entity, recordId: id,
    reason: String(reason || ''),
    detail: Object.assign({ direction: 'ShinCRM → FBM', requestKind: String(operation || candidate && candidate.kind || ''), hSHIN: hShin, hBASE: String(record.fbmHash || '') }, detail || {})
  });
};
/** Ghi trạng thái kỹ thuật sau push; baseline chỉ cập nhật khi pull sau đó xác nhận bằng nhau. */
FbmSync.markPushResult = function (candidate, response, operation) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {};
  data = data.d || data;
  // Giữ baseline cũ để kỳ pull sau phân biệt FBM không đổi với dữ liệu đã áp dụng.
  var patch = { id: record.id, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: String(record.fbmHash || '').trim() };
  if (candidate.entity === 'customer') {
    patch.fbmId = String(values.stt_rec_kh || values.stt_rec_kh0 || record.fbmId || '').trim();
    patch.fbmCustomerCode = String(values.ma_kh || record.fbmCustomerCode || candidate.autoCode || '').trim();
    if (!patch.fbmId || !patch.fbmCustomerCode) { throw new Error('FBM không trả đủ stt_rec_kh/ma_kh sau khi ghi Customer.'); }
  } else {
    var activityId = values.id || (data && data.id) || record.fbmId || '';
    patch.fbmId = String(activityId).trim();
    if (!patch.fbmId) { throw new Error('FBM không trả id sau khi ghi Activity.'); }
  }
  var saved = writeGateSave({ entity: candidate.entity, records: [patch], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { throw new Error('Không ghi được trạng thái chờ xác nhận sau push.'); }
  FbmSync.logPushRecord(candidate, operation, typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', 'Đã gửi request ghi; chờ kỳ pull xác nhận.', { fbmId: patch.fbmId, fbmCustomerCode: patch.fbmCustomerCode || '' });
  return patch;
};

/** Nhả khóa push và nhập lại các khóa mới nhất để caller không ghi đè khóa khác. */
FbmSync.releasePushLock = function (state, entity, id) {
  var key = String(entity) + ':' + String(id), latest;
  if (state && state.locks) { delete state.locks[key]; }
  if (typeof FbmSync.unlockRecord !== 'function') { return state; }
  latest = FbmSync.unlockRecord(entity, id);
  if (latest && latest.locks) { state.locks = latest.locks; }
  return state;
};

/** Chuẩn hóa lỗi để Sidebar/Log luôn giữ được mã và nguyên nhân, không giữ payload. */
FbmSync.pushFailureDetail = function (failure) {
  if (failure && typeof failure === 'object') {
    return { code: String(failure.code || 'PUSH_ERROR'), status: Number(failure.status || 0) || 0, fieldName: String(failure.fieldName || failure.FieldName || ''), reason: String(failure.reason || failure.message || failure.Message || 'Không thể đẩy bản ghi.') };
  }
  return { code: 'PUSH_ERROR', status: 0, fieldName: '', reason: String(failure || 'Không thể đẩy bản ghi.') };
};

/** Ghi trạng thái kỹ thuật và giải phóng khóa khi một bản ghi không thể đẩy. */
FbmSync.markPushError = function (state, candidate, failure, operation) {
  var detail = FbmSync.pushFailureDetail(failure);
  state.counts.error += 1;
  state.message = 'Lỗi đẩy ' + String(candidate && candidate.entity || '') + ':' + String(candidate && candidate.id || '') + ': ' + detail.reason;
  state.metadata = state.metadata || {};
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  state.metadata.pushFailureDetails = state.metadata.pushFailureDetails || {};
  var gate = state.metadata.categoryGate || {}, localHash = typeof FbmSync.hash === 'function' ? FbmSync.hash(candidate.record || {}, candidate.entity, gate) : '';
  state.metadata.pushFailures[candidate.entity + ':' + String(candidate.id || '')] = localHash;
  state.metadata.pushFailureDetails[candidate.entity + ':' + String(candidate.id || '')] = detail;
  var waitingForMarker = candidate.kind === 'create';
  if (typeof writeGateSave === 'function') {
    try { writeGateSave({ entity: candidate.entity, records: [{ id: candidate.id, syncStatus: waitingForMarker ? FbmSync.SYNC_STATUS.pushing : FbmSync.SYNC_STATUS.error }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
  }
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'push_record_error', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', entity: candidate.entity, recordId: String(candidate.id || ''), reason: detail.reason, detail: { code: detail.code, status: detail.status, fieldName: detail.fieldName } });
  }
  FbmSync.logPushRecord(candidate, operation || candidate.kind, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', detail.reason, { syncStatus: FbmSync.SYNC_STATUS.error, failureCode: detail.code, httpStatus: detail.status, fieldName: detail.fieldName });
  state.metadata.pushFailureDetails[candidate.entity + ':' + String(candidate.id || '')].requestKind = String(operation || candidate.kind || '');
  if (!waitingForMarker) { FbmSync.releasePushLock(state, candidate.entity, candidate.id); }
};

/** Ghi lý do bản ghi bị bỏ qua mà không phát request ghi ra FBM. */
FbmSync.markPushSkipped = function (state, candidate, status, reason) {
  state.counts.skipped += 1;
  state.message = String(reason || 'Bản ghi chưa đủ điều kiện đẩy.');
  if (typeof writeGateSave === 'function') {
    try { writeGateSave({ entity: candidate.entity, records: [{ id: candidate.id, syncStatus: status || FbmSync.SYNC_STATUS.skipped }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
  }
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'push_record_skipped', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: candidate.entity, recordId: String(candidate.id || ''), reason: String(reason || 'Bo qua ban ghi chua du dieu kien day.') });
  }
  FbmSync.logPushRecord(candidate, candidate.kind, typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', reason, { syncStatus: status || FbmSync.SYNC_STATUS.skipped });
};

/** Bỏ qua một record push lỗi và tiếp tục candidate kế tiếp, không lặp request đã gửi. */
FbmSync.continueAfterPushError = function (state, cursor, failure) {
  var candidate = cursor && cursor.candidate;
  if (candidate) { FbmSync.markPushError(state, candidate, failure, cursor.operation); }
  state.cursor = { kind: 'push_scan', entity: cursor.entity, index: Number(cursor.index || 0) + 1 };
  state.current = '';
  state.phase = 'push';
  state.lastError = '';
  state.message = 'Đã ghi nhận lỗi đẩy ' + String(cursor.entity || '') + ' ' + String(candidate && candidate.id || '') + '; đang xử lý bản ghi tiếp theo.';
  FbmSync.stateWrite(state);
  var next = FbmSync.nextPushRequest(state);
  return { ok: true, request: next ? FbmSync.nextEnvelope(next) : null, status: FbmSync.statusView(), continued: true };
};

/** Kiểm tra các núm an toàn trước khi phát request ghi đầu tiên. */
FbmSync.pushConfigErrors = function (candidate, settings) {
  var cfg = settings || FbmSync.scriptSettings();
  if (!String(cfg.accountName || '').trim()) { return 'Thiếu FBM_ACCOUNT_NAME; chiều đẩy đã bị dừng.'; }
  if (candidate.kind === 'create' && candidate.entity === 'customer' && (!String(cfg.customerPrefix || '').trim() || !String(cfg.customerCodeLength || '').trim())) { return 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH; không tạo khách mới.'; }
  return '';
};

/** Đảm bảo mã khách FBM tự sinh đúng cấu hình trước khi lưu Customer mới. */
FbmSync.validateAutoCustomerCode = function (code, settings) {
  var cfg = settings || FbmSync.scriptSettings(), value = String(code || '').trim(), prefix = String(cfg.customerPrefix || '').trim(), length = Number(cfg.customerCodeLength || 0);
  if (!prefix || !length) { return { ok: false, reason: 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH.' }; }
  if (value.indexOf(prefix) !== 0 || value.length !== length) { return { ok: false, reason: 'Mã khách FBM tự sinh không khớp tiền tố/độ dài đã cấu hình: ' + value }; }
  return { ok: true };
};

/** Tạo request kế tiếp của queue push từ state, không giữ queue trong Extension. */
FbmSync.stopPushOnConflicts = function (state) {
  var conflicts = state && state.metadata && state.metadata.conflicts || [];
  if (!conflicts.length) { return false; }
  state.phase = 'conflict'; state.entity = ''; state.current = ''; state.cursor = {};
  state.message = 'Đã phát hiện ' + conflicts.length + ' xung đột; chiều đẩy tạm dừng để người dùng quyết định.';
  FbmSync.stateWrite(state);
  return true;
};

FbmSync.nextPushRequest = function (state) {
  var globalCategoryBlock = state.metadata && (state.metadata.categoryLookupFailed || (state.metadata.categoryBlocks || []).some(function (block) { return !block.code; }));
  if (globalCategoryBlock) {
    state.phase = 'paused'; state.message = 'Đã đọc xong nhưng tạm dừng chiều đẩy vì danh mục chưa khớp FBM.'; FbmSync.stateWrite(state); return null;
  }
  if (FbmSync.stopPushOnConflicts(state)) { return null; }
  var entity = state.cursor.entity || 'customer', index = Number(state.cursor.index || 0), candidates = FbmSync.pushCandidates(entity);
  while (index < candidates.length) {
    var candidate = candidates[index];
    var configError = FbmSync.pushConfigErrors(candidate);
    if (configError) { state.phase = 'paused'; state.message = configError; FbmSync.stateWrite(state); return null; }
    if (typeof FbmSync.isRecordLocked === 'function' && FbmSync.isRecordLocked(entity, candidate.id)) {
      state.counts.skipped += 1; state.message = 'Hoãn ' + entity + ' ' + candidate.id + ' vì đang được người dùng chỉnh sửa.';
      index += 1; state.cursor.index = index; FbmSync.stateWrite(state); continue;
    }
    var categoryErrors = FbmSync.validatePushCategories(candidate.record, entity, state.metadata.categoryGate || {});
    if (categoryErrors.length) {
      candidate.entity = entity;
      FbmSync.markPushSkipped(state, candidate, FbmSync.SYNC_STATUS.unknownCategory, 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + categoryErrors[0].result.reason);
      index += 1; state.cursor.index = index; FbmSync.stateWrite(state); continue;
    }
    var eligibilityErrors = typeof FbmSync.pushEligibilityErrors === 'function' ? FbmSync.pushEligibilityErrors(candidate.record, entity) : [];
    if (eligibilityErrors.length) {
      candidate.entity = entity;
      FbmSync.markPushSkipped(state, candidate, FbmSync.SYNC_STATUS.skipped, 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + eligibilityErrors.join(' '));
      index += 1; state.cursor.index = index; FbmSync.stateWrite(state); continue;
    }
    candidate.entity = entity;
    var request;
    if (entity === 'customer') {
      request = candidate.kind === 'create' ? FbmSync.customerCreateOpenRequest() : FbmSync.customerEditOpenRequest(candidate.record.fbmId);
    } else {
      request = candidate.kind === 'create' ? FbmSync.activityCreateRequest(candidate.record, state.metadata.categoryGate) : FbmSync.activityEditOpenRequest(candidate.record.fbmId);
    }
    if (typeof FbmSync.lockRecord === 'function') { state = FbmSync.lockRecord(entity, candidate.id, candidate.record.fbmHash || '', 'sync'); }
    if (typeof writeGateSave === 'function') {
      try { writeGateSave({ entity: entity, records: [{ id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.pushing }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
    }
    state.phase = 'push'; state.entity = entity; state.current = candidate.id; state.cursor = { kind: 'push_wait', operation: request.meta.kind, entity: entity, index: index, candidate: candidate };
    state.message = 'Đang đẩy ' + (entity === 'customer' ? 'khách hàng' : 'giao dịch') + ' ' + candidate.id + '...'; FbmSync.stateWrite(state);
    return request;
  }
  if (entity === 'customer') {
    state.cursor = { kind: 'push_scan', entity: 'activity', index: 0 }; state.entity = 'activity'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
  }
  state.phase = 'done'; state.entity = ''; state.current = '';
  var pushSucceeded = Number(state.metadata && state.metadata.pushSucceeded || 0);
  state.message = Number(state.counts.error || 0) > 0
    ? 'Đồng bộ hoàn tất nhưng có ' + Number(state.counts.error || 0) + ' lỗi đẩy; xem Chi tiết bản ghi.'
    : pushSucceeded > 0
      ? 'Đồng bộ hoàn tất; bản ghi vừa đẩy đang chờ kỳ đọc xác nhận.'
      : state.mode === 'write'
        ? 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.'
        : 'Đồng bộ hoàn tất.';
  state.cursor = {}; FbmSync.stateWrite(state); return null;
};

/** Xử lý bước mở form và bước lưu của một candidate push. */
FbmSync.continuePush = function (state, response) {
  var cursor = state.cursor, candidate = cursor.candidate, gate = state.metadata.categoryGate || {};
  if (cursor.operation === 'customer_create_open') {
    var autoCode = FbmSync.extractAutoCustomerCode(response);
    var codeCheck = FbmSync.validateAutoCustomerCode(autoCode);
    if (!codeCheck.ok) { throw new Error(codeCheck.reason); }
    if (!autoCode) { throw new Error('Không lấy được _ma_kh_auto từ form tạo Customer.'); }
    candidate.autoCode = autoCode; cursor.operation = 'customer_create_save'; state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.customerCreateRequest(candidate.record, autoCode, '', gate);
  }
  if (cursor.operation === 'customer_edit_open') {
    var customerOldValues = FbmSync.extractFormValues(response, 'customer');
    var customerSaveRequest = FbmSync.customerEditRequest(candidate.record, customerOldValues, gate);
    cursor.operation = 'customer_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor; FbmSync.stateWrite(state);
    return customerSaveRequest;
  }
  if (cursor.operation === 'activity_edit_open') {
    var activityOldValues = FbmSync.extractFormValues(response, 'activity');
    var configuredOwner = String(FbmSync.scriptSettings().accountName || '').trim(), currentOwner = String(activityOldValues.owner || '').trim();
    if (!configuredOwner || (currentOwner && currentOwner.toLowerCase() !== configuredOwner.toLowerCase())) { throw new Error('Hoạt động thuộc owner FBM khác tài khoản đã cấu hình.'); }
    var activitySaveRequest = FbmSync.activityEditRequest(candidate.record, activityOldValues, gate);
    cursor.operation = 'activity_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor; FbmSync.stateWrite(state);
    return activitySaveRequest;
  }
  if (cursor.operation === 'activity_create') {
    FbmSync.markPushResult(candidate, response, cursor.operation);
  } else if (cursor.operation === 'customer_create_save' || cursor.operation === 'customer_edit_save' || cursor.operation === 'activity_edit_save') {
    FbmSync.markPushResult(candidate, response, cursor.operation);
  } else {
    throw new Error('Không nhận diện được bước push: ' + cursor.operation);
  }
  state.metadata = state.metadata || {};
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  delete state.metadata.pushFailures[cursor.entity + ':' + String(candidate.id || '')];
  state.metadata.pushSucceeded = Number(state.metadata.pushSucceeded || 0) + 1;
  state.counts.succeeded += 1; FbmSync.releasePushLock(state, cursor.entity, candidate.id); state.cursor = { kind: 'push_scan', entity: cursor.entity, index: Number(cursor.index || 0) + 1 }; state.current = ''; FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};
