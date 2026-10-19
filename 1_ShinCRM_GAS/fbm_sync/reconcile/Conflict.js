/**
 * Chế độ xử lý xung đột: hàng đợi lấy từ Sheet, diff tính lại khi mở, quyết định ghi qua Cửa bản ghi.
 * Người dùng quyết trên thứ đang thấy, nên lệnh chốt ghi theo ảnh chụp lúc mở do Sidebar giữ, cùng luật với lưu form: phía ShinCRM cửa ghi so từng trường được quyết với giá trị lúc mở (tài liệu 06 Phần 4), phía FBM so hash bản ghép từ giá trị Sidebar gửi lại với hash FBM lúc mở (tài liệu 09/04 bước 4).
 * Lệnh chốt không đọc lại FBM: baseline ghi bằng hash FBM lúc mở, nên FBM đổi sau lúc mở thì kỳ so sau thấy cả ba khác nhau và báo xung đột lại; lệnh chốt chỉ ghi ShinCRM nên không có gì bị ghi đè.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Hàng đợi xung đột là các dòng Sheet đang `xung đột chờ quyết` (`09/04` "Chế độ xử lý xung đột riêng").
 * State không giữ danh sách hay giá trị hai bên: giá trị Activity dài làm đầy property 9KB sau vài chục xung đột, và danh sách trong state lệch khỏi Sheet khi phiên mới xóa metadata (FBM-024).
 */
FbmSync.conflictQueue = function (scan) {
  var queue = [], local = scan || FbmSync.localScan();
  ['customer', 'activity'].forEach(function (entity) {
    local.records(entity).forEach(function (record) {
      if (FbmSync.isConflictPending(record)) { queue.push({ entity: entity, id: String(record.id || ''), fbmId: String(record.fbmId || '').trim() }); }
    });
  });
  return queue;
};

/** Dòng đang chờ người quyết: hàng đợi của màn xung đột; push không đẩy, pull vẫn so ba chiều lại mỗi kỳ (`09/04`). */
FbmSync.isConflictPending = function (record) {
  return String(record && record.syncStatus || '') === FbmSync.SYNC_STATUS.conflict;
};

/**
 * Số dòng xung đột chờ quyết đếm từ Sheet lúc preflight: cập nhật số hiện cho Sidebar và ghi Log một dòng khi số khác lần ghi trước, để lượt nền chạy mỗi vài phút không lặp lại cùng một dòng.
 * `conflictLogged` đi theo state sang lượt sau như `conflictCount`. Phiên không dừng vì xung đột: pull so ba chiều lại dòng đó mỗi kỳ, push bỏ qua nó cho tới khi pull hoặc người dùng gỡ xung đột.
 */
FbmSync.conflictPendingNote = function (state, count) {
  var now = Number(count || 0), before = Number(state.metadata.conflictLogged || 0);
  state.metadata.conflictCount = now;
  if (now === before) { return false; }
  state.metadata.conflictLogged = now;
  if (typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'conflict_pending_changed', outcome: now ? (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn') : (typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok'), cycleId: String(state.runId || ''), reason: now ? 'Còn ' + now + ' bản ghi xung đột chờ quyết (lần ghi trước: ' + before + '); mở chế độ xử lý xung đột để quyết.' : 'Không còn bản ghi xung đột chờ quyết (lần ghi trước: ' + before + ').', detail: { count: now, previous: before } });
  }
  return true;
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
  // State chỉ giữ request đọc FBM đang chờ; bản người dùng xem nằm trong DTO ở Sidebar.
  state.metadata.conflictRefresh = { entity: item.entity, id: item.id };
  state.cursor = { kind: 'conflict_refresh', entity: item.entity, id: item.id };
  state.message = 'Đang đọc FBM để mở xung đột ' + item.id + '...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(request), remaining: queue.length, status: FbmSync.statusView() };
};

/** Nhận response đọc bản ghi đang mở. Trả bản FBM mới nhất cùng dòng ShinCRM hiện tại, hoặc `failure` khi response cũ, FBM lỗi hay bản ghi không còn ở trạng thái xung đột. */
FbmSync.conflictRefreshRead = function (state, rawResponse) {
  var refresh = state.metadata && state.metadata.conflictRefresh || {}, responseRequestId = FbmSync.responseRequestId ? FbmSync.responseRequestId(rawResponse) : '';
  if (!refresh.entity) { return { failure: FbmSync.conflictFail('CONFLICT_REFRESH_NOT_FOUND', 'Không còn lượt đọc lại conflict tương ứng.') }; }
  if (!state.cursor || state.cursor.kind !== 'conflict_refresh' || !FbmSync.requestAnswered(state, responseRequestId)) {
    return { failure: FbmSync.conflictFail('STALE_RESPONSE', 'Response đọc lại xung đột đã cũ hoặc không thuộc request đang chờ.') };
  }
  state.activeRequestId = ''; state.deadlineAt = 0; state.lastProgressAt = Date.now(); state.cursor = {};
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
  var gate = FbmSync.stateCategoryGate(state), latestRecord = entity === 'customer' ? FbmSync.customerRecord(latest, gate) : FbmSync.activityRecord(latest, gate);
  return { entity: entity, id: target, local: local, latest: latestRecord, latestHash: String(latestRecord.fbmHash || FbmSync.hash(latestRecord, entity, gate)), gate: gate };
};

/**
 * Bản ghi xung đột không đọc được trên FBM thì rời hàng đợi với trạng thái `không thấy bên FBM` (FBM-033, chủ dự án chốt 2026-10-06).
 * Giữ nó trong hàng đợi thì mỗi lần mở lại gặp đúng bản ghi đó và các xung đột phía sau không bao giờ tới lượt. Mọi nguyên nhân (bị xóa, chuyển quyền, thiếu ID FBM) đi chung đường này; người dùng tự kiểm tra trên FBM.
 */
FbmSync.conflictDropUnreadable = function (state, entity, id, reason) {
  // Chỉ đổi dòng còn đang chờ quyết: dòng đã rời trạng thái đó (vừa được quyết ở nơi khác) không bị ghi đè thành "không thấy bên FBM".
  var dropped = FbmSync.recordChange(function (gate) {
    var local = gate.readById(entity, FbmSync.recordSchemas(), id);
    if (!local || !FbmSync.isConflictPending(local) || gate.busy(entity, [id])[id]) { return { value: false }; }
    return { save: [{ entity: entity, records: [{ id: id, syncStatus: FbmSync.SYNC_STATUS.missing }], source: 'pull' }], value: true };
  }).value;
  if (dropped) { FbmSync.logPullRecord(entity, null, { id: id }, FbmSync.SYNC_STATUS.missing, 'Xung đột ' + reason + '; đã rời hàng đợi xung đột, cần kiểm tra trên FBM.'); }
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

/**
 * DTO một bản ghi cho Sidebar. `snapshot` là ảnh chụp lúc mở, nằm ở Sidebar như ảnh chụp lúc mở form: `openedHash` là hash FBM lúc mở, `old` là giá trị ShinCRM lúc mở của mọi trường fingerprint theo tên cột Sheet.
 * Ảnh chụp không cất trong state vì state là của phiên đồng bộ: phiên mới (kể cả lượt nền) xóa metadata, người dùng đang xem sẽ mất bản đang mở.
 */
FbmSync.conflictView = function (read, remaining) {
  var schema = typeof DATA_SCHEMA !== 'undefined' && DATA_SCHEMA && DATA_SCHEMA[read.entity] || {}, local = read.local;
  // Diff so ở dạng chuẩn hóa (danh mục là mã FBM, ngày là ISO); người dùng xem giá trị gốc của Sheet, riêng ngày hiện dạng chuẩn hóa. google.script.run không trả được Date nên ảnh chụp cũng dùng dạng này.
  var display = function (raw, canonical) { return raw === null || raw === undefined || raw === '' ? '' : FbmSync.isDate(raw) ? String(canonical || '') : String(raw); };
  var fields = FbmSync.diff(read.entity, local, read.latest, read.gate).map(function (item) {
    var localField = FbmSync.conflictLocalField(read.entity, item.field), spec = schema[localField] || {};
    // Chỉ trường chữ tự do mới được gõ tay: giá trị PA3 ghi bằng cửa 'pull' không qua kiểm định dạng/trùng, nên danh mục, ngày, trường có validate hoặc unique chỉ chọn một bên.
    var editable = spec.type === 'TEXT' && !spec.source && !spec.validate && !spec.unique && !spec.readonly;
    var shown = function (raw, canonical) { return spec.type === 'DATE' ? String(raw === null || raw === undefined || raw === '' ? '' : canonical || '') : display(raw, canonical); };
    return { field: item.field, localField: localField, label: String(spec.label || localField), editable: editable, left: shown(local[localField], item.left), right: shown(read.latest[localField], item.right) };
  });
  return { entity: read.entity, id: read.id, fbmId: String(local.fbmId || ''), code: String(local.fbmCustomerCode || local.customerFbmCode || ''), name: String(read.entity === 'customer' ? local.companyName || '' : local.taskType || ''), remaining: remaining, fields: fields, snapshot: { openedHash: read.latestHash, old: FbmSync.conflictSnapshotOld(read.entity, local) } };
};

/** Giá trị ShinCRM lúc mở của mọi trường fingerprint (trừ ID FBM của Activity, không đổi được), theo tên cột Sheet. */
FbmSync.conflictSnapshotOld = function (entity, local) {
  var old = {};
  (FbmSync.FINGERPRINT_FIELDS[entity] || []).forEach(function (field) {
    if (entity === 'activity' && field === 'id') { return; }
    var localField = FbmSync.conflictLocalField(entity, field);
    var raw = local[localField];
    old[localField] = raw === null || raw === undefined || raw === '' ? '' : FbmSync.isDate(raw) ? String(FbmSync.normalizeFingerprintValue(entity, field, raw)) : String(raw);
  });
  return old;
};

/** Bước mở: trả DTO kèm ảnh chụp lúc mở; state chỉ giữ request đọc FBM đang chờ, không giữ bản đang xem. */
FbmSync.conflictOpened = function (rawResponse) {
  var state = FbmSync.stateRead(), read = FbmSync.conflictRefreshRead(state, rawResponse);
  if (read.failure) { return read.failure; }
  state.metadata.conflictRefresh = null;
  var view = FbmSync.conflictView(read, Number(state.metadata.conflictCount || 0));
  // Hai bên đã khớp mọi trường thì không còn gì để người dùng chọn (gặp khi đọc xác nhận lệch nhưng bản đọc lại đã khớp); đóng luôn theo bản FBM thay vì để màn xung đột rỗng không lưu được.
  if (!view.fields.length) {
    var settled = FbmSync.conflictSettle(state, { entity: read.entity, id: read.id, gate: read.gate, latestHash: read.latestHash, latest: read.latest, old: view.snapshot.old }, function (local, latest) { return FbmSync.preserveLocalFields(read.entity, local, latest); }, 'fbm', 'Xung đột ' + read.id + ' không còn trường lệch; đã tự đóng theo bản FBM.');
    return settled.ok ? Object.assign(settled, { conflict: null }) : settled;
  }
  state.message = 'Đang xem xung đột ' + read.id + '.';
  FbmSync.stateWrite(state);
  return { ok: true, conflict: view, status: FbmSync.statusView() };
};

/**
 * Chốt xung đột theo ảnh chụp lúc mở, không đọc lại FBM. `merged` là lựa chọn từng trường `{ field: { choice, value } }`; `fbmValues` là `{ field: value }` giá trị FBM của các trường lệch theo tên trường FBM; `snapshot` là ảnh chụp trong DTO lúc mở.
 * Phía ShinCRM kiểm như lưu form: cửa ghi so từng trường được quyết với `snapshot.old` (tài liệu 06 Phần 4) và trả `conflicts` để Sidebar hỏi bằng đúng popup của form. Phía FBM: hash bản ghép từ ảnh chụp và `fbmValues` phải bằng `snapshot.openedHash`.
 */
FbmSync.confirmConflict = function (entity, id, choice, merged, fbmValues, snapshot) {
  if (typeof FbmSync.masterEnabled === 'function' && !FbmSync.masterEnabled()) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  var state = FbmSync.stateRead(), target = String(id || '').trim();
  if (['customer', 'activity'].indexOf(entity) < 0 || !target) { return FbmSync.conflictFail('CONFLICT_TARGET_INVALID', 'Bản ghi xung đột không hợp lệ.'); }
  if (['fbm', 'shin', 'manual'].indexOf(choice) < 0) { return FbmSync.conflictFail('CONFLICT_CHOICE_INVALID', 'Cách xử lý conflict không hợp lệ.'); }
  var allowed = (FbmSync.FINGERPRINT_FIELDS[entity] || []).filter(function (field) { return !(entity === 'activity' && field === 'id'); });
  var values = fbmValues && typeof fbmValues === 'object' && !Array.isArray(fbmValues) ? fbmValues : null;
  var stray = values ? Object.keys(values).filter(function (field) { return allowed.indexOf(field) < 0; }) : ['không có giá trị FBM'];
  var shot = snapshot && typeof snapshot === 'object' && snapshot.old && typeof snapshot.old === 'object' && String(snapshot.openedHash || '') ? snapshot : null;
  if (!shot) { stray.push('thiếu ảnh chụp lúc mở'); }
  if (stray.length) { return FbmSync.conflictReject(state, entity, target, 'Giá trị gửi kèm lệnh chốt ' + target + ' không hợp lệ (' + stray.join(', ') + '); chưa ghi gì, mở lại xung đột.'); }
  var blank = function (value) { return value === undefined || value === null ? '' : value; };
  var latestFbm = {}, picks = {}, old = {};
  Object.keys(values).forEach(function (field) {
    var localField = FbmSync.conflictLocalField(entity, field), pick = choice === 'manual' ? (merged && merged[field]) || {} : { choice: choice };
    latestFbm[localField] = blank(values[field]);
    picks[localField] = blank(pick.choice === 'fbm' ? values[field] : pick.choice === 'manual' ? pick.value : shot.old[localField]);
    old[localField] = blank(shot.old[localField]);
  });
  var read = { entity: entity, id: target, gate: FbmSync.stateCategoryGate(state), latestHash: String(shot.openedHash), latestFor: function (local) { return Object.assign({}, local, shot.old, latestFbm); }, old: old };
  return FbmSync.conflictSettle(state, read, function (local) { return Object.assign({}, local, picks); }, choice, 'Đã quyết conflict ' + entity + ' ' + target + ' theo ' + choice + '.');
};

/** Lệnh chốt không ghi được theo ảnh chụp đã gửi (giá trị FBM lệch hash lúc mở, thiếu hoặc thừa trường): ghi Log và trả `CONFLICT_REOPEN` để Sidebar mở lại xung đột, lúc đó FBM được đọc mới. */
FbmSync.conflictReject = function (state, entity, id, message) {
  state.message = message; FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'conflict_reopen', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: entity, recordId: id, cycleId: String(state.runId || ''), reason: message }); }
  return { ok: false, code: 'CONFLICT_REOPEN', message: message, status: FbmSync.statusView() };
};

/**
 * Ghi quyết định xung đột qua Cửa bản ghi với baseline là `read.latestHash` (hash FBM lúc mở); bước chốt và bước mở (khi không còn trường lệch) dùng chung.
 * Trong khóa: dòng đã rời trạng thái chờ quyết thì báo, dòng đang bị tiến trình khác giữ thì trả `busy`, hash bản FBM (`read.latest` hoặc `read.latestFor(local)`) khác `latestHash` thì không ghi.
 * Khớp thì `build(local, latest)` dựng bản ghi và cửa ghi so các trường trong `read.old` với Sheet như lưu form; Sheet đã đổi thì trả `conflicts`, không ghi gì.
 */
FbmSync.conflictSettle = function (state, read, build, choice, message) {
  var entity = read.entity;
  var run = FbmSync.recordChange(function (gate) {
    var local = gate.readById(entity, FbmSync.recordSchemas(), read.id);
    if (!local || !FbmSync.isConflictPending(local)) { return { value: { status: 'gone' } }; }
    var busy = gate.busy(entity, [read.id])[read.id];
    if (busy) { return { value: { status: 'busy', busy: busy } }; }
    var latest = read.latestFor ? read.latestFor(local) : read.latest;
    if (String(FbmSync.hash(latest, entity, read.gate)) !== read.latestHash) { return { value: { status: 'fbmMismatch' } }; }
    var record = build(local, latest);
    record.id = read.id;
    record.fbmId = local.fbmId;
    record.fbmHash = read.latestHash;
    record.syncStatus = FbmSync.hash(record, entity, read.gate) === read.latestHash ? FbmSync.SYNC_STATUS.synced : FbmSync.SYNC_STATUS.pending;
    if (record.syncStatus === FbmSync.SYNC_STATUS.synced) { record.syncedAt = new Date(); }
    return { save: [{ entity: entity, records: [record], source: 'pull', old: [read.old] }], value: { status: 'ok', record: record } };
  });
  var done = run.value || {}, saved = run.saves && run.saves[0];
  if (saved && Array.isArray(saved.conflicts) && saved.conflicts.length) {
    return { ok: false, code: 'CONFLICT_SHEET_CHANGED', entity: entity, id: read.id, conflicts: saved.conflicts, message: 'ShinCRM đã đổi trong lúc xử lý ' + read.id + '; chưa ghi gì.' };
  }
  if (done.status === 'gone') {
    state.message = 'Bản ghi ' + read.id + ' không còn ở trạng thái xung đột chờ quyết trên Sheet.'; FbmSync.stateWrite(state);
    return FbmSync.conflictFail('CONFLICT_NOT_FOUND', state.message);
  }
  if (done.status === 'busy') {
    return { ok: false, code: 'CONFLICT_RECORD_BUSY', entity: entity, busy: { id: read.id, by: done.busy.by, reason: done.busy.reason }, message: 'Bản ghi ' + read.id + ' đang bận (' + done.busy.reason + '); chưa ghi gì.' };
  }
  if (done.status === 'fbmMismatch') { return FbmSync.conflictReject(state, entity, read.id, 'Giá trị FBM gửi kèm lệnh chốt ' + read.id + ' không khớp bản FBM lúc mở xung đột; chưa ghi gì, mở lại xung đột.'); }
  var record = done.record;
  var remaining = FbmSync.conflictQueue().length;
  state.metadata.conflictCount = remaining;
  FbmSync.pushFailuresRemove([entity + ':' + read.id]);
  if (state.phase === 'conflict' && !remaining) { state.phase = 'done'; }
  state.message = message;
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: read.id, choice: choice, syncStatus: record.syncStatus, remaining: remaining, status: FbmSync.statusView() };
};
