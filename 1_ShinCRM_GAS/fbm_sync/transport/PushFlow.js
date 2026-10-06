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
  state.metadata.categoryBlocks = blocks;
  FbmSync.stateCategoryGate(state, gate);
  if (state.session) { state.session.lookups = {}; }
  return blocks;
};
/** Push thành công chỉ cộng vào số liệu bước; lỗi và bỏ qua vào bộ gom Log của lát. */
FbmSync.logPushRecord = function (candidate, operation, outcome, reason, detail) {
  var ok = typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok';
  if (!outcome || outcome === ok) { return null; }
  return FbmSync.recordIssueAdd('push', String(candidate && candidate.entity || ''), String(detail && detail.syncStatus || ''), String(candidate && candidate.id || ''), reason, outcome);
};
/** Ghi trạng thái kỹ thuật sau push; baseline chỉ cập nhật sau bước đọc xác nhận. */
FbmSync.markPushResult = function (candidate, response, operation) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {}, current = typeof FbmSync.stateRead === 'function' ? FbmSync.stateRead() : {}, gate = FbmSync.stateCategoryGate(current);
  data = data.d || data;
  // Giữ baseline cũ; hash payload gửi được lưu riêng để kỳ đọc nhận ra chính lần ghi này.
  var sentHash = typeof FbmSync.hash === 'function' ? FbmSync.hash(record, candidate.entity, gate) : '';
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
  FbmSync.sheetSave(candidate.entity, [patch], 'push');
  // Hash chờ xác nhận chỉ lưu trong state server, không ghi vào Sheet.
  try {
    FbmSync.pendingPushSet(candidate.entity, record.id, { hSHIN: sentHash, sentAt: Date.now(), fbmId: patch.fbmId });
  } catch (pendingError) {
    throw new Error('Không ghi được hash đang chờ xác nhận sau push: ' + String(pendingError && pendingError.message || pendingError));
  }
  FbmSync.logPushRecord(candidate, operation, typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', 'Đã gửi request ghi; đang đọc xác nhận trực tiếp.', { fbmId: patch.fbmId, fbmCustomerCode: patch.fbmCustomerCode || '', hPUSH: sentHash });
  return patch;
};

/** Khi New Customer mất response, chỉ đọc lại theo mã tự sinh để xác định có ghi thành công hay chưa. */
FbmSync.customerCreateRecoveryRequest = function (state, cursor) {
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate || {}, record = candidate.record || {}, taxNumber = String(record.taxNumber || '').trim();
  if (!taxNumber || typeof FbmSync.customerGridRequest !== 'function') { return null; }
  state.cursor = { kind: 'push_wait', operation: 'customer_create_recover', entity: 'customer', index: Number(cursor.index || 0), candidate: FbmSync.pushCandidateForState(candidate) };
  state.message = 'Đang kiểm tra Customer vừa tạo sau khi mất phản hồi; không gửi lại lệnh ghi.';
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -2, gridRefresh: false, includeTestCustomer: false, filter: ['ma_so_thue:**' + taxNumber] });
};
/**
 * Đối chiếu đúng một dòng Customer sau create mất response rồi vá ID/baseline.
 * Cùng phiên thì còn mã tự sinh để khớp kèm MST và so dữ liệu đã gửi. Phiên sau (`recover`) mã tự sinh đã mất và người dùng có thể đã sửa bản ghi, nên chỉ khớp MST rồi vá hai mã FBM, baseline để rỗng như `09/04` bước 5: kỳ đọc sau so hai bên để ghi baseline hoặc báo xung đột.
 */
FbmSync.finishCustomerCreateRecovery = function (state, response) {
  var cursor = state.cursor || {}, candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor.candidate || {}) : cursor.candidate || {}, record = candidate.record || {}, grid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields), taxNumber = String(record.taxNumber || '').trim(), autoCode = String(candidate.autoCode || '').trim(), laterRun = candidate.kind === 'recover', rows = grid.rows.filter(function (row) { return String(row.ma_so_thue || '').trim() === taxNumber && (laterRun || String(row.ma_kh || '').trim() === autoCode); }), local = (FbmSync.readLocal('customer') || []).filter(function (item) { return String(item.id || '') === String(candidate.id || ''); })[0];
  if (laterRun && local && rows.length === 0) { throw new Error('Customer đang đẩy từ lần trước nhưng FBM không có khách cùng Mã số thuế; lần tạo trước có thể chưa thành công. Không tự tạo lại; kiểm tra trên FBM rồi bấm Mở lại bản ghi lỗi nếu cần tạo lại.'); }
  if (rows.length !== 1 || !local) { throw new Error('CREATE_RECOVERY_NOT_EXACT: không xác định duy nhất Customer vừa tạo; không gửi lại request ghi.'); }
  if (laterRun) {
    var found = FbmSync.customerRecord(rows[0], FbmSync.stateCategoryGate(state));
    FbmSync.sheetSave('customer', [{ id: local.id, fbmId: found.fbmId, fbmCustomerCode: found.fbmCustomerCode, fbmHash: '', syncStatus: FbmSync.SYNC_STATUS.pending }], 'push');
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_customer', { written: 1, sheetWriteBatches: 1 }); }
    FbmSync.releasePushLock(state, 'customer', local.id); state.cursor = { kind: 'push_scan', entity: 'customer', index: Number(cursor.index || 0) + 1 }; state.current = ''; state.message = 'Đã tìm thấy trên FBM Customer ' + local.id + ' tạo ở lần trước; đã vá mã FBM, kỳ đọc sau sẽ đối soát.'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
  }
  var incoming = FbmSync.customerRecord(rows[0], FbmSync.stateCategoryGate(state)), localHash = FbmSync.hash(local, 'customer', FbmSync.stateCategoryGate(state)), incomingHash = FbmSync.hash(incoming, 'customer', FbmSync.stateCategoryGate(state)), sentHash = FbmSync.hash(candidate.record || {}, 'customer', FbmSync.stateCategoryGate(state));
  if (incomingHash !== sentHash || localHash !== sentHash) { throw new Error('CREATE_RECOVERY_MISMATCH: Customer tìm thấy không khớp chính xác dữ liệu đã gửi.'); }
  var patch = { id: local.id, fbmId: incoming.fbmId, fbmCustomerCode: incoming.fbmCustomerCode, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() };
  FbmSync.sheetSave('customer', [patch], 'push');
  state.metadata.pushSucceeded = Number(state.metadata.pushSucceeded || 0) + 1; state.counts.succeeded += 1;
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_customer', { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 }); }
  FbmSync.releasePushLock(state, 'customer', local.id); state.cursor = { kind: 'push_scan', entity: 'customer', index: Number(cursor.index || 0) + 1 }; state.current = ''; state.message = 'Đã xác nhận Customer tạo thành công sau khi mất phản hồi.'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
};

/** Kiểm tra response mở form có đủ trường fingerprint trước khi xác nhận. */
FbmSync.verifyFormValues = function (response, entity) {
  var values = FbmSync.extractFormValues(response, entity), required = entity === 'activity' ? ['id', 'ma_cv', 'details', 'end_date'] : ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dien_thoai', 'email', 'dc_lh'];
  var missing = required.filter(function (name) { return !Object.prototype.hasOwnProperty.call(values, name); });
  if (missing.length) { throw new Error('FBM_VERIFY_INCOMPLETE: thiếu trường ' + missing.join(', ') + ' trong response đọc xác nhận.'); }
  return values;
};

/** Hoàn tất ghi chỉ sau khi đọc lại đúng bản ghi và so hash với payload đã gửi. */
FbmSync.finishPushVerification = function (state, response) {
  var cursor = state.cursor || {}, candidate = cursor.candidate || {}, entity = String(cursor.entity || candidate.entity || ''), id = String(candidate.id || ''), locals = FbmSync.readLocal(entity) || [], local = locals.filter(function (item) { return String(item && item.id || '') === id; })[0], pending = FbmSync.pendingPushGet(entity, id), pendingHash = String(pending && (pending.hSHIN || pending.hash) || '').trim();
  if (!pendingHash) { throw new Error('FBM_VERIFY_STATE_MISSING: không còn hash của lần ghi cần xác nhận.'); }
  var values = FbmSync.verifyFormValues(response, entity), incomingHash = FbmSync.hash(values, entity, FbmSync.stateCategoryGate(state)), sentHash = pendingHash;
  if (!local) { FbmSync.pendingPushClear(entity, id); throw new Error('FBM_VERIFY_RECORD_MISSING: bản ghi không còn tồn tại trong ShinCRM.'); }
  var localHash = FbmSync.hash(local, entity, FbmSync.stateCategoryGate(state)), previousHash = String(local.fbmHash || '').trim();
  if (incomingHash === sentHash) {
    var status = localHash === sentHash ? FbmSync.SYNC_STATUS.synced : FbmSync.SYNC_STATUS.pending;
    FbmSync.sheetSave(entity, [{ id: local.id, fbmHash: incomingHash, syncStatus: status, syncedAt: new Date() }], 'push');
    FbmSync.pendingPushClear(entity, id);
    FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', status === FbmSync.SYNC_STATUS.synced ? 'FBM đã xác nhận đúng dữ liệu vừa ghi.' : 'FBM đã xác nhận; ShinCRM đã sửa tiếp nên chờ lượt đẩy mới.', { hPUSH: sentHash, hFBM: incomingHash, syncStatus: status });
    state.metadata.pushSucceeded = Number(state.metadata.pushSucceeded || 0) + 1;
    state.counts.succeeded += 1;
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + entity, { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 }); }
    FbmSync.releasePushLock(state, entity, id);
    state.cursor = { kind: 'push_scan', entity: entity, index: Number(cursor.index || 0) + 1 }; state.current = ''; state.message = 'Đã xác nhận ' + entity + ' ' + id + '.'; FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  if (previousHash && incomingHash === previousHash) {
    state.counts.skipped += 1;
    FbmSync.sheetSave(entity, [{ id: local.id, syncStatus: FbmSync.SYNC_STATUS.notApplied }], 'push');
    FbmSync.pendingPushClear(entity, id);
    FbmSync.logPullRecord(entity, values, local, FbmSync.SYNC_STATUS.notApplied, 'FBM không đổi sau lần ghi; đọc xác nhận trực tiếp.');
    state.cursor = { kind: 'push_scan', entity: entity, index: Number(cursor.index || 0) + 1 }; state.current = ''; state.message = 'FBM chưa áp dụng ' + entity + ' ' + id + '.'; FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  // Sheet là nguồn của hàng đợi xung đột nên ghi trạng thái trước; khóa push nhả luôn vì dòng `xung đột chờ quyết` đã bị khóa đồng bộ.
  FbmSync.sheetSave(entity, [{ id: local.id, syncStatus: FbmSync.SYNC_STATUS.conflict }], 'push');
  FbmSync.pendingPushClear(entity, id);
  FbmSync.logPullRecord(entity, values, local, FbmSync.SYNC_STATUS.conflict, 'Đọc xác nhận khác dữ liệu vừa ghi; chờ quyết định xung đột.');
  FbmSync.releasePushLock(state, entity, id);
  state.metadata.conflictCount = Number(state.metadata.conflictCount || 0) + 1;
  state.counts.conflict += 1; state.cursor = {}; state.current = ''; state.phase = 'conflict'; state.message = 'Đọc xác nhận khác dữ liệu vừa ghi; đã dừng để kiểm tra xung đột.'; FbmSync.stateWrite(state);
  return null;
};

/** Xử lý lỗi đọc xác nhận mà không lặp lại request ghi. */
FbmSync.continueAfterPushVerificationError = function (state, cursor, failure) {
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate, entity = String(cursor && cursor.entity || ''), id = String(candidate && candidate.id || '');
  state.counts.error += 1; state.phase = 'error'; state.lastFailureCode = 'FBM_VERIFY_FAILED'; state.retryable = false;
  state.message = 'Đã ghi FBM nhưng chưa xác nhận được ' + entity + ' ' + id + ': ' + String(failure && failure.message || failure || 'Lỗi đọc xác nhận.') + '. Không tự ghi lại.';
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + entity, { errors: 1 }); }
  FbmSync.stateWrite(state);
  if (typeof FbmSync.logPushRecord === 'function') { FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', state.message, { failureCode: 'FBM_VERIFY_FAILED' }); }
  return { ok: false, status: FbmSync.statusView(), error: state.message };
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
  var gate = FbmSync.stateCategoryGate(state), localHash = typeof FbmSync.hash === 'function' ? FbmSync.hash(candidate.record || {}, candidate.entity, gate) : '';
  state.metadata.pushFailures[candidate.entity + ':' + String(candidate.id || '')] = localHash;
  state.metadata.pushFailureDetails[candidate.entity + ':' + String(candidate.id || '')] = detail;
  // Lệnh tạo đã có thể tới FBM thì giữ `đang đẩy` để không bị tạo lại (FBM-027); lỗi ở bước mở form thì lệnh lưu chưa phát nên an toàn để đẩy lại.
  var waitingForMarker = candidate.kind === 'recover' || candidate.kind === 'stuck' || (candidate.kind === 'create' && operation !== 'customer_create_open');
  FbmSync.sheetSave(candidate.entity, [{ id: candidate.id, syncStatus: waitingForMarker ? FbmSync.SYNC_STATUS.pushing : FbmSync.SYNC_STATUS.error }], 'push');
  FbmSync.logPushRecord(candidate, operation || candidate.kind, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', detail.reason, { syncStatus: FbmSync.SYNC_STATUS.error, failureCode: detail.code, httpStatus: detail.status, fieldName: detail.fieldName });
  state.metadata.pushFailureDetails[candidate.entity + ':' + String(candidate.id || '')].requestKind = String(operation || candidate.kind || '');
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { errors: 1 }); }
  if (!waitingForMarker) { FbmSync.releasePushLock(state, candidate.entity, candidate.id); }
};

/** Ghi lý do bản ghi bị bỏ qua mà không phát request ghi ra FBM. */
FbmSync.markPushSkipped = function (state, candidate, status, reason) {
  state.counts.skipped += 1;
  state.message = String(reason || 'Bản ghi chưa đủ điều kiện đẩy.');
  FbmSync.sheetSave(candidate.entity, [{ id: candidate.id, syncStatus: status || FbmSync.SYNC_STATUS.skipped }], 'push');
  FbmSync.logPushRecord(candidate, candidate.kind, typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', reason, { syncStatus: status || FbmSync.SYNC_STATUS.skipped });
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { skipped: 1 }); }
};

/** Bỏ qua một record push lỗi và tiếp tục candidate kế tiếp, không lặp request đã gửi. */
FbmSync.continueAfterPushError = function (state, cursor, failure) {
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate;
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
  if (!String(cfg.accountName || '').trim()) { return 'Thiếu tên đầy đủ trong liên kết tài khoản FBM; chiều đẩy đã bị dừng.'; }
  if (candidate.kind === 'create' && candidate.entity === 'customer' && (!String(cfg.customerPrefix || '').trim() || !String(cfg.customerCodeLength || '').trim())) { return 'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.'; }
  return '';
};

/** Kiểm tra mã ma_kh FBM tự sinh trước khi gửi lệnh lưu Customer mới. */
FbmSync.validateAutoCustomerCode = function (code, settings) {
  var cfg = settings || FbmSync.scriptSettings(), value = String(code || '').trim(), prefix = String(cfg.customerPrefix || '').trim(), length = Number(cfg.customerCodeLength || 0);
  if (!prefix || !length) { return { ok: false, reason: 'Thiếu tiền tố hoặc độ dài mã khách FBM.' }; }
  if (value.indexOf(prefix) !== 0 || value.length !== length) { return { ok: false, reason: 'Mã khách FBM tự sinh không khớp tiền tố/độ dài đã cấu hình: ' + value }; }
  return { ok: true };
};

/** Owner của Activity phải khớp binding đã xác nhận trước khi cấp bất kỳ request push nào. */
FbmSync.pushOwnerError = function (candidate, settings) {
  if (!candidate || candidate.entity !== 'activity') { return ''; }
  var cfg = settings || FbmSync.scriptSettings(), configured = String(cfg.accountName || '');
  var owner = String(candidate.record && candidate.record.owner || '');
  if (!configured) { return ''; }
  if (owner && owner !== configured) {
    return 'Activity ' + String(candidate.id || '') + ' thuộc owner FBM "' + owner + '", khác tài khoản FBM đã liên kết "' + configured + '".';
  }
  return '';
};

/** Xung đột phát hiện trong phiên này dừng cả chiều đẩy; xung đột tồn đọng từ trước chỉ khóa đúng dòng của nó. */
FbmSync.stopPushOnConflicts = function (state) {
  var conflictCount = Number(state && state.counts && state.counts.conflict || 0);
  if (!conflictCount) { return false; }
  state.phase = 'conflict'; state.entity = ''; state.current = ''; state.cursor = {};
  state.message = 'Đã phát hiện ' + conflictCount + ' xung đột; chiều đẩy tạm dừng để người dùng quyết định.';
  FbmSync.stateWrite(state);
  return true;
};

/** Tạo request kế tiếp của queue push từ state, không giữ queue trong Extension. */
FbmSync.nextPushRequest = function (state) {
  var globalCategoryBlock = state.metadata && (state.metadata.categoryLookupFailed || (state.metadata.categoryBlocks || []).some(function (block) { return !block.code; }));
  if (globalCategoryBlock) {
    state.phase = 'paused'; state.message = 'Đã đọc xong nhưng tạm dừng chiều đẩy vì danh mục chưa khớp FBM.'; FbmSync.stateWrite(state); return null;
  }
  if (FbmSync.stopPushOnConflicts(state)) { return null; }
  // `cursor.index` là vị trí dòng Sheet kế tiếp cần xét, không phải thứ tự trong danh sách ứng viên (FBM-032).
  var entity = state.cursor.entity || 'customer', from = Number(state.cursor.index || 0), candidates = FbmSync.pushCandidates(entity).filter(function (item) { return item.position >= from; }), pushStep = 'push_' + entity;
  if (typeof FbmSync.businessStepStart === 'function' && FbmSync.businessStepStart(state, pushStep, { mode: state.mode, scan: state.scan, entity: entity })) {
    FbmSync.businessStepAdd(state, pushStep, { candidateCount: candidates.length });
  }
  for (var at = 0; at < candidates.length; at += 1) {
    var candidate = candidates[at], index = candidate.position;
    candidate.entity = entity;
    if (candidate.kind === 'stuck') {
      FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Hoạt động đang đẩy từ lần trước mà mất phản hồi; FBM không có đường tra lại nên không tự gửi lại để tránh tạo trùng. Kiểm tra trên FBM: chưa có thì bấm Mở lại bản ghi lỗi để tạo lại.' }, 'activity_create');
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    var configError = FbmSync.pushConfigErrors(candidate);
    if (configError) { state.phase = 'paused'; state.message = configError; FbmSync.stateWrite(state); return null; }
    var ownerError = FbmSync.pushOwnerError(candidate);
    if (ownerError) {
      FbmSync.markPushSkipped(state, candidate, FbmSync.SYNC_STATUS.skipped, 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + ownerError);
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    if (typeof FbmSync.isRecordLocked === 'function' && FbmSync.isRecordLocked(entity, candidate.id)) {
      state.counts.skipped += 1; state.message = 'Hoãn ' + entity + ' ' + candidate.id + ' vì đang được người dùng chỉnh sửa.';
      if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, pushStep, { skipped: 1 }); }
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    if (candidate.kind === 'recover') {
      // Tra là request đọc nên không qua kiểm danh mục/điều kiện đẩy; không có MST thì không tra được và không được tạo lại.
      state.current = candidate.id;
      var recovery = FbmSync.customerCreateRecoveryRequest(state, { index: index, candidate: candidate });
      if (recovery) { return recovery; }
      FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Customer đang đẩy từ lần trước nhưng không còn Mã số thuế để tra trên FBM; không tự tạo lại. Kiểm tra trên FBM rồi bấm Mở lại bản ghi lỗi nếu cần tạo lại.' }, 'customer_create_recover');
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    var categoryErrors = FbmSync.validatePushCategories(candidate.record, entity, FbmSync.stateCategoryGate(state));
    if (categoryErrors.length) {
      FbmSync.markPushSkipped(state, candidate, FbmSync.SYNC_STATUS.unknownCategory, 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + categoryErrors[0].result.reason);
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    var eligibilityErrors = typeof FbmSync.pushEligibilityErrors === 'function' ? FbmSync.pushEligibilityErrors(candidate.record, entity) : [];
    if (eligibilityErrors.length) {
      candidate.entity = entity;
      FbmSync.markPushSkipped(state, candidate, FbmSync.SYNC_STATUS.skipped, 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + eligibilityErrors.join(' '));
      state.cursor.index = index + 1; FbmSync.stateWrite(state); continue;
    }
    candidate.entity = entity;
    var request;
    if (entity === 'customer') {
      request = candidate.kind === 'create' ? FbmSync.customerCreateOpenRequest() : FbmSync.customerEditOpenRequest(candidate.record.fbmId);
    } else {
      request = candidate.kind === 'create' ? FbmSync.activityCreateRequest(candidate.record, FbmSync.stateCategoryGate(state)) : FbmSync.activityEditOpenRequest(candidate.record.fbmId);
    }
    if (typeof FbmSync.lockRecord === 'function') { state = FbmSync.lockRecord(entity, candidate.id, candidate.record.fbmHash || '', 'sync'); }
    state.phase = 'push'; state.entity = entity; state.current = candidate.id; state.cursor = { kind: 'push_wait', operation: request.meta.kind, entity: entity, index: index, candidate: typeof FbmSync.pushCandidateForState === 'function' ? FbmSync.pushCandidateForState(candidate) : candidate };
    state.message = 'Đang đẩy ' + (entity === 'customer' ? 'khách hàng' : 'giao dịch') + ' ' + candidate.id + '...'; FbmSync.stateWrite(state);
    // `09/04` bước 1: state chốt cursor trước, rồi ghi `đang đẩy`, rồi mới phát lệnh; ghi Sheet không được thì sheetSave ném lỗi và lệnh ghi FBM không được phát (FBM-002).
    FbmSync.sheetSave(entity, [{ id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.pushing }], 'push');
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
      ? 'Đồng bộ hoàn tất; bản ghi vừa đẩy đã được FBM xác nhận.'
      : (state.mode === 'write' || state.mode === 'push')
        ? 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.'
        : 'Đồng bộ hoàn tất.';
  state.cursor = {}; FbmSync.stateWrite(state); return null;
};

/** Xử lý bước mở form và bước lưu của một candidate push. */
FbmSync.continuePush = function (state, response) {
  var cursor = state.cursor, candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor.candidate) : cursor.candidate, gate = FbmSync.stateCategoryGate(state);
  if (cursor.operation === 'customer_create_recover') {
    return FbmSync.finishCustomerCreateRecovery(state, response);
  }
  if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
    return FbmSync.finishPushVerification(state, response);
  }
  if (cursor.operation === 'customer_create_open') {
    var autoCode = FbmSync.extractAutoCustomerCode(response);
    var codeCheck = FbmSync.validateAutoCustomerCode(autoCode);
    if (!codeCheck.ok) { throw new Error(codeCheck.reason); }
    if (!autoCode) { throw new Error('Không lấy được _ma_kh_auto từ form tạo Customer.'); }
    candidate.autoCode = autoCode; cursor.candidate = typeof FbmSync.pushCandidateForState === 'function' ? FbmSync.pushCandidateForState(candidate) : candidate; cursor.operation = 'customer_create_save'; state.cursor = cursor; FbmSync.stateWrite(state);
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
    var configuredOwner = String(FbmSync.scriptSettings().accountName || ''), currentOwner = String(activityOldValues.owner || '');
    if (!configuredOwner || (currentOwner && currentOwner !== configuredOwner)) { throw new Error('Hoạt động thuộc owner FBM khác tài khoản đã cấu hình.'); }
    var activitySaveRequest = FbmSync.activityEditRequest(candidate.record, activityOldValues, gate);
    cursor.operation = 'activity_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor; FbmSync.stateWrite(state);
    return activitySaveRequest;
  }
  if (cursor.operation === 'activity_create' || cursor.operation === 'customer_create_save' || cursor.operation === 'customer_edit_save' || cursor.operation === 'activity_edit_save') {
    var pushed = FbmSync.markPushResult(candidate, response, cursor.operation);
  } else {
    throw new Error('Không nhận diện được bước push: ' + cursor.operation);
  }
  state = FbmSync.stateRead();
  state.metadata = state.metadata || {};
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  delete state.metadata.pushFailures[cursor.entity + ':' + String(candidate.id || '')];
  cursor.operation = cursor.entity === 'customer' ? 'customer_verify' : 'activity_verify';
  state.cursor = cursor; state.message = 'Đã ghi ' + cursor.entity + ' ' + candidate.id + '; đang đọc xác nhận FBM...'; FbmSync.stateWrite(state);
  return cursor.entity === 'customer' ? FbmSync.customerEditOpenRequest(pushed.fbmId) : FbmSync.activityEditOpenRequest(pushed.fbmId);
};
