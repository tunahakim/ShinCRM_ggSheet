/** Chế độ xử lý xung đột: hàng đợi lấy từ Sheet, diff tính lại khi mở, quyết định ghi qua cửa ghi chung. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Hàng đợi xung đột là các dòng Sheet đang `xung đột chờ quyết` (`09/04` "Chế độ xử lý xung đột riêng").
 * State không giữ danh sách hay giá trị hai bên: giá trị Activity dài làm đầy property 9KB sau vài chục xung đột, và danh sách trong state lệch khỏi Sheet khi phiên mới xóa metadata (FBM-024).
 */
FbmSync.conflictQueue = function () {
  var queue = [];
  ['customer', 'activity'].forEach(function (entity) {
    (FbmSync.readLocal(entity) || []).forEach(function (record) {
      if (FbmSync.isConflictPending(record)) { queue.push({ entity: entity, id: String(record.id || ''), fbmId: String(record.fbmId || '').trim() }); }
    });
  });
  return queue;
};

/** Dòng đang chờ người quyết bị khóa đồng bộ: pull không lấy về, push không đẩy (`09/04`). */
FbmSync.isConflictPending = function (record) {
  return String(record && record.syncStatus || '') === FbmSync.SYNC_STATUS.conflict;
};

/** Lỗi chung của chế độ xung đột; trả status để Sidebar vẽ lại đúng state hiện tại. */
FbmSync.conflictFail = function (code, message) {
  return { ok: false, code: code, message: message, status: FbmSync.statusView() };
};

/** Mở bản ghi đầu hàng đợi: chỉ phát request đọc bản ghi FBM; diff tính khi response về. */
FbmSync.openConflict = function () {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể xử lý conflict.' }; }
  var state = FbmSync.stateRead();
  if (FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0) { return FbmSync.conflictFail('SYNC_RUNNING', 'Phiên đồng bộ đang chạy; chờ phiên dừng rồi mới xử lý xung đột.'); }
  var queue = FbmSync.conflictQueue();
  state.metadata.conflictCount = queue.length;
  state.metadata.conflictRefresh = null;
  if (!queue.length) {
    if (state.phase === 'conflict') { state.phase = 'done'; }
    state.message = 'Không còn xung đột chờ quyết.';
    FbmSync.stateWrite(state);
    return { ok: true, empty: true, remaining: 0, status: FbmSync.statusView() };
  }
  var item = queue[0], request = FbmSync.conflictRefreshRequest(item.entity, item);
  if (!request) { return FbmSync.conflictDropUnreadable(state, item.entity, item.id, 'không có ID FBM để đọc lại'); }
  state.metadata.conflictRefresh = { entity: item.entity, id: item.id, stage: 'open', openedHash: '', choice: '' };
  state.cursor = { kind: 'conflict_refresh', entity: item.entity, id: item.id };
  state.message = 'Đang đọc FBM để mở xung đột ' + item.id + '...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(request), remaining: queue.length, status: FbmSync.statusView() };
};

/**
 * Nhận response đọc bản ghi đang mở, dùng chung cho bước mở và bước chốt.
 * Trả bản FBM mới nhất cùng dòng ShinCRM hiện tại, hoặc `failure` khi response cũ, FBM lỗi hay bản ghi không còn ở trạng thái xung đột.
 */
FbmSync.conflictRefreshRead = function (state, stage, rawResponse) {
  var refresh = state.metadata && state.metadata.conflictRefresh || {}, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '';
  if (!refresh.entity || refresh.stage !== stage) { return { failure: FbmSync.conflictFail('CONFLICT_REFRESH_NOT_FOUND', 'Không còn lượt đọc lại conflict tương ứng.') }; }
  if (!state.activeRequestId || !responseRequestId || responseRequestId !== String(state.activeRequestId) || !state.cursor || state.cursor.kind !== 'conflict_refresh') {
    return { failure: FbmSync.conflictFail('STALE_RESPONSE', 'Response đọc lại xung đột đã cũ hoặc không thuộc request đang chờ.') };
  }
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now(); state.cursor = {};
  // Đọc lại ở bước chốt mà hỏng thì quay về bước xem để người dùng bấm chốt lại được.
  if (stage === 'confirm') { refresh.stage = 'review'; refresh.choice = ''; }
  var entity = refresh.entity, target = String(refresh.id || ''), success = FbmSync.protocol.assertSuccess(rawResponse);
  if (!success.ok) {
    state.message = 'Không đọc lại được FBM; xung đột ' + target + ' vẫn giữ nguyên để thử lại.'; FbmSync.stateWrite(state);
    return { failure: FbmSync.conflictFail(success.code || 'CONFLICT_REFRESH_FAILED', state.message) };
  }
  var local = (FbmSync.readLocal(entity) || []).filter(function (record) { return String(record && record.id || '') === target; })[0];
  if (!local || String(local.syncStatus || '') !== FbmSync.SYNC_STATUS.conflict) {
    state.metadata.conflictRefresh = null; state.message = 'Bản ghi ' + target + ' không còn ở trạng thái xung đột chờ quyết trên Sheet.'; FbmSync.stateWrite(state);
    return { failure: FbmSync.conflictFail('CONFLICT_NOT_FOUND', state.message) };
  }
  var latest = (FbmSync.rowsToRecords(entity, rawResponse, state.metadata[entity + 'Fields']).rows || [])[0];
  if (!latest) { return { failure: FbmSync.conflictDropUnreadable(state, entity, target, 'không còn đọc được trên FBM (bị xóa hoặc chuyển quyền)') }; }
  var gate = state.metadata.categoryGate || {}, latestRecord = entity === 'customer' ? FbmSync.customerRecord(latest, gate) : FbmSync.activityRecord(latest, gate);
  return { entity: entity, id: target, local: local, latest: latestRecord, latestHash: String(latestRecord.fbmHash || FbmSync.hash(latestRecord, entity, gate)), gate: gate, refresh: refresh };
};

/**
 * Bản ghi xung đột không đọc được trên FBM thì rời hàng đợi với trạng thái `không thấy bên FBM` (FBM-033, chủ dự án chốt 2026-10-06).
 * Giữ nó trong hàng đợi thì mỗi lần mở lại gặp đúng bản ghi đó và các xung đột phía sau không bao giờ tới lượt. Mọi nguyên nhân (bị xóa, chuyển quyền, thiếu ID FBM) đi chung đường này; người dùng tự kiểm tra trên FBM.
 */
FbmSync.conflictDropUnreadable = function (state, entity, id, reason) {
  FbmSync.sheetSave(entity, [{ id: id, syncStatus: FbmSync.SYNC_STATUS.missing }], 'pull');
  FbmSync.logPullRecord(entity, null, { id: id }, FbmSync.SYNC_STATUS.missing, 'Xung đột ' + reason + '; đã rời hàng đợi xung đột, cần kiểm tra trên FBM.');
  // Lệnh chế độ xung đột không đi qua ranh giới lát, nên tự nhả dòng Log ngay.
  FbmSync.recordIssuesFlush();
  var remaining = FbmSync.conflictQueue().length;
  state.metadata.conflictRefresh = null;
  state.metadata.conflictCount = remaining;
  if (state.phase === 'conflict' && !remaining) { state.phase = 'done'; }
  state.message = 'Bản ghi ' + id + ' ' + reason + '. Đã chuyển sang "' + FbmSync.SYNC_STATUS.missing + '" và rời hàng đợi; kiểm tra bản ghi này trên FBM. Còn ' + remaining + ' xung đột.';
  FbmSync.stateWrite(state);
  return { ok: false, code: 'CONFLICT_RECORD_UNREADABLE', message: state.message, remaining: remaining, status: FbmSync.statusView() };
};

/** DTO một bản ghi cho Sidebar; giá trị chỉ để hiển thị, quyết định từng trường được GAS lấy lại từ hai bản ghi gốc. */
FbmSync.conflictView = function (read, remaining) {
  var schema = typeof DATA_SCHEMA !== 'undefined' && DATA_SCHEMA && DATA_SCHEMA[read.entity] || {}, local = read.local;
  var fields = FbmSync.diff(read.entity, local, read.latest, read.gate).map(function (item) {
    var localField = FbmSync.conflictLocalField(read.entity, item.field), spec = schema[localField] || {};
    // Diff so ở dạng chuẩn hóa (danh mục là mã FBM, ngày là ISO); người dùng xem giá trị gốc của Sheet, riêng ngày hiện dạng chuẩn hóa.
    // Chỉ trường chữ tự do mới được gõ tay: giá trị PA3 ghi bằng cửa 'pull' không qua kiểm định dạng/trùng, nên danh mục, ngày, trường có validate hoặc unique chỉ chọn một bên.
    var display = function (raw, canonical) { return raw === null || raw === undefined || raw === '' ? '' : spec.type === 'DATE' || FbmSync.isDate(raw) ? String(canonical || '') : String(raw); };
    var editable = spec.type === 'TEXT' && !spec.source && !spec.validate && !spec.unique && !spec.readonly;
    return { field: item.field, label: String(spec.label || localField), editable: editable, left: display(local[localField], item.left), right: display(read.latest[localField], item.right) };
  });
  return { entity: read.entity, id: read.id, fbmId: String(local.fbmId || ''), code: String(local.fbmCustomerCode || local.customerFbmCode || ''), name: String(read.entity === 'customer' ? local.companyName || '' : local.taskType || ''), remaining: remaining, fields: fields };
};

/** Bước mở: chốt hash FBM lúc người dùng bắt đầu xem để bước chốt phát hiện FBM đổi giữa chừng. */
FbmSync.conflictOpened = function (rawResponse) {
  var state = FbmSync.stateRead(), read = FbmSync.conflictRefreshRead(state, 'open', rawResponse);
  if (read.failure) { return read.failure; }
  state.metadata.conflictRefresh = { entity: read.entity, id: read.id, stage: 'review', openedHash: read.latestHash, choice: '' };
  state.message = 'Đang xem xung đột ' + read.id + '.';
  FbmSync.stateWrite(state);
  return { ok: true, conflict: FbmSync.conflictView(read, Number(state.metadata.conflictCount || 0)), status: FbmSync.statusView() };
};

/** Bước chốt 1: phát request đọc lại FBM ngay lúc bấm nút (`09/04`: hFBM phải lấy mới tại thời điểm bấm). */
FbmSync.prepareConflictResolution = function (entity, id, choice) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể xử lý conflict.' }; }
  var state = FbmSync.stateRead(), refresh = state.metadata && state.metadata.conflictRefresh || {}, target = String(id || '').trim();
  if (refresh.stage !== 'review' || refresh.entity !== entity || String(refresh.id || '') !== target) { return FbmSync.conflictFail('CONFLICT_NOT_OPEN', 'Xung đột này chưa được mở để xem; mở lại chế độ xử lý xung đột.'); }
  if (['fbm', 'shin', 'manual'].indexOf(choice) < 0) { return FbmSync.conflictFail('CONFLICT_CHOICE_INVALID', 'Cách xử lý conflict không hợp lệ.'); }
  var local = (FbmSync.readLocal(entity) || []).filter(function (record) { return String(record && record.id || '') === target; })[0];
  var request = local ? FbmSync.conflictRefreshRequest(entity, { id: target, fbmId: String(local.fbmId || '').trim() }) : null;
  if (!request) { return FbmSync.conflictFail('CONFLICT_REFRESH_UNAVAILABLE', 'Không dựng được request đọc lại FBM cho ' + target + '.'); }
  refresh.stage = 'confirm'; refresh.choice = choice;
  state.metadata.conflictRefresh = refresh;
  state.cursor = { kind: 'conflict_refresh', entity: entity, id: target };
  state.message = 'Đang đọc lại FBM trước khi chốt conflict ' + target + '...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() };
};

/**
 * Bước chốt 2: FBM đổi so với lúc mở thì trả DTO mới để xem lại; khớp thì ghi quyết định với baseline là hash FBM mới.
 * `merged` là lựa chọn từng trường `{ field: { choice, value } }` gửi thẳng trong lệnh chốt, không cất vào state vì giá trị nhập tay có thể dài.
 */
FbmSync.confirmConflict = function (entity, id, choice, merged, rawResponse) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  var state = FbmSync.stateRead(), refresh = state.metadata && state.metadata.conflictRefresh || {};
  if (refresh.entity !== entity || String(refresh.id || '') !== String(id || '').trim() || refresh.choice !== choice) { return FbmSync.conflictFail('CONFLICT_REFRESH_NOT_FOUND', 'Không còn lượt đọc lại conflict tương ứng.'); }
  var read = FbmSync.conflictRefreshRead(state, 'confirm', rawResponse);
  if (read.failure) { return read.failure; }
  if (read.latestHash !== String(refresh.openedHash || '')) {
    state.metadata.conflictRefresh = { entity: read.entity, id: read.id, stage: 'review', openedHash: read.latestHash, choice: '' };
    state.message = 'FBM đã thay đổi trong lúc xử lý; xung đột đã được cập nhật, hãy xem lại.';
    FbmSync.stateWrite(state);
    return { ok: false, code: 'CONFLICT_CHANGED_REVIEW', message: state.message, conflict: FbmSync.conflictView(read, Number(state.metadata.conflictCount || 0)), status: FbmSync.statusView() };
  }
  // Giữ FBM vẫn giữ các trường chỉ ShinCRM có (xác thực, cho phép đẩy...) như chiều pull.
  var record = choice === 'fbm' ? FbmSync.preserveLocalFields(entity, read.local, read.latest) : Object.assign({}, read.local);
  if (choice === 'manual') {
    Object.keys(merged && typeof merged === 'object' ? merged : {}).forEach(function (field) {
      var pick = merged[field] || {}, localField = FbmSync.conflictLocalField(entity, field);
      if (pick.choice === 'fbm') { record[localField] = read.latest[localField]; }
      else if (pick.choice === 'manual') { record[localField] = pick.value === undefined || pick.value === null ? '' : pick.value; }
    });
  }
  record.id = read.id;
  record.fbmId = read.local.fbmId;
  record.fbmHash = read.latestHash;
  record.syncStatus = FbmSync.hash(record, entity, read.gate) === read.latestHash ? FbmSync.SYNC_STATUS.synced : FbmSync.SYNC_STATUS.pending;
  FbmSync.sheetSave(entity, [record], 'pull');
  var remaining = FbmSync.conflictQueue().length;
  state.metadata.conflictRefresh = null;
  state.metadata.conflictCount = remaining;
  state.metadata.pushFailures = state.metadata.pushFailures || {};
  state.metadata.pushFailureDetails = state.metadata.pushFailureDetails || {};
  delete state.metadata.pushFailures[entity + ':' + read.id];
  delete state.metadata.pushFailureDetails[entity + ':' + read.id];
  if (state.phase === 'conflict' && !remaining) { state.phase = 'done'; }
  state.message = 'Đã quyết conflict ' + entity + ' ' + read.id + ' theo ' + choice + '.';
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: read.id, choice: choice, syncStatus: record.syncStatus, remaining: remaining, status: FbmSync.statusView() };
};
