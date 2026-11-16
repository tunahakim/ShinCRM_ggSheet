/**
 * Chế độ xử lý xung đột: hàng đợi lấy từ Sheet, diff tính lại khi mở, quyết định ghi qua Cửa bản ghi.
 * Người dùng quyết trên thứ đang thấy, nên lệnh chốt ghi theo ảnh chụp lúc mở do Sidebar giữ, cùng luật với lưu form: phía ShinCRM cửa ghi so từng trường được quyết với giá trị lúc mở (tài liệu 06 Phần 4), phía FBM so hash bản ghép từ giá trị Sidebar gửi lại với hash FBM lúc mở (tài liệu 09/04 bước 4).
 * Lệnh chốt không đọc lại FBM: baseline ghi bằng hash FBM lúc mở, nên FBM đổi sau lúc mở thì kỳ so sau thấy cả ba khác nhau và báo xung đột lại; lệnh chốt chỉ ghi ShinCRM nên không có gì bị ghi đè.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Hàng đợi xung đột là các dòng Sheet đang `xung đột chờ quyết` (`09/04` "Chế độ xử lý xung đột riêng"), xét trên bản đọc `scan` bên gọi đưa.
 * State không giữ danh sách hay giá trị hai bên: giá trị Activity dài làm đầy property 9KB sau vài chục xung đột, và danh sách trong state lệch khỏi Sheet khi phiên mới xóa metadata (FBM-024).
 */
FbmSync.conflictQueue = function (scan) {
  var queue = [];
  ['customer', 'activity'].forEach(function (entity) {
    scan.records(entity).forEach(function (record) {
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


/**
 * Lệnh `open_conflict`: mở bản ghi đầu hàng đợi, chỉ phát request đọc bản ghi FBM; diff tính khi response về ở chặng `conflict_refresh`. Dấu trang mang đủ bản ghi đang chờ đọc, ô lượt không giữ bản người dùng xem.
 * Hàng đợi rỗng thì trả `{ empty: true }`, không phát request.
 */
FbmSync.runConflictOpenCommand = function () {
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể xử lý conflict.' }; }
  var state = FbmSync.stateRead();
  // Mở xung đột phải đọc FBM qua kênh duy nhất của phiên: lượt nền đang chạy thì để Sidebar hỏi người dùng dừng hay chờ, lượt tay thì báo chờ.
  if (FbmSync.runInProgress(state) && String(state.origin || '') === 'background') { return FbmSync.backgroundRunningResult(); }
  if (FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) >= 0) { return FbmSync.conflictFail('SYNC_RUNNING', 'Phiên đồng bộ đang chạy; chờ phiên dừng rồi mới xử lý xung đột.'); }
  var queue = FbmSync.conflictQueue(FbmSync.localScan());
  state.metadata.conflictCount = queue.length;
  if (!queue.length) {
    if (state.phase === 'conflict') { state.phase = 'done'; }
    state.message = 'Không còn xung đột chờ quyết.';
    FbmSync.stateWrite(state);
    return { ok: true, empty: true, remaining: 0, status: FbmSync.statusView() };
  }
  var item = queue[0], request = FbmSync.conflictRefreshRequest(item.entity, item, FbmSync.scriptSettings(state));
  if (!request) { return FbmSync.conflictDropUnreadable(state, item.entity, item.id, 'không có ID FBM để đọc lại'); }
  state.cursor = { kind: 'conflict_refresh', entity: item.entity, id: item.id, fbmId: String(item.fbmId || '') };
  state.message = 'Đang đọc FBM để mở xung đột ' + item.id + '...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.sliceIssue(request), remaining: queue.length, status: FbmSync.statusView() };
};

/** Bước kết của chặng `conflict_refresh` trong bảng cursor: trả DTO cho Sidebar, hoặc làm việc ghi chặng đã quyết (tự đóng theo bản FBM, rời hàng đợi). */
FbmSync.conflictRefreshEnd = function (state, end) {
  if (end.kind === 'view') { return { ok: true, conflict: end.view, status: FbmSync.statusView() }; }
  if (end.kind === 'settle') {
    var read = end.read, settled = FbmSync.conflictSettle(state, read, function (local, latest) { return FbmSync.preserveLocalFields(read.entity, local, latest); }, 'Xung đột ' + read.id + ' không còn trường lệch; đã tự đóng theo bản FBM.');
    return settled.ok ? Object.assign(settled, { conflict: null }) : settled;
  }
  if (end.kind === 'drop') { return FbmSync.conflictDropUnreadable(state, end.entity, end.id, end.reason); }
  state.message = end.message;
  FbmSync.stateWrite(state);
  return FbmSync.conflictFail(end.code, end.message);
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
  var remaining = FbmSync.conflictQueue(FbmSync.localScan()).length;
  state.metadata.conflictCount = remaining;
  if (state.phase === 'conflict' && !remaining) { state.phase = 'done'; }
  state.message = 'Bản ghi ' + id + ' ' + reason + '. Đã chuyển sang "' + FbmSync.SYNC_STATUS.missing + '" và rời hàng đợi; kiểm tra bản ghi này trên FBM. Còn ' + remaining + ' xung đột.';
  FbmSync.stateWrite(state);
  return { ok: false, code: 'CONFLICT_RECORD_UNREADABLE', message: state.message, remaining: remaining, status: FbmSync.statusView() };
};

/**
 * Lệnh `confirm_conflict`: chốt theo ảnh chụp lúc mở, không đọc lại FBM. Kiểm lệnh (`conflictChoiceValidate`, thuần) rồi `conflictSettle` ghi trong một lần cầm khóa; phép so phía FBM (`snapshotMatch`) chạy trong khóa vì Activity cần ID FBM của dòng đọc lúc đó.
 * `input`: `entity`, `id`, `choice` (`fbm` / `shin` / `manual`), `merged` (lựa chọn từng trường `{ field: { choice, value } }`), `fbmValues` và `shinValues` (`{ field: value }` giá trị hai bên màn đang hiện của các trường lệch, theo tên trường FBM), `snapshot` (ảnh chụp trong DTO lúc mở).
 */
FbmSync.runConflictConfirmCommand = function (input) {
  if (!settingsValue(FbmSync.SETTING_SECTIONS.master, 'enabled')) { return { ok: false, code: 'SYNC_DISABLED', message: 'Đồng bộ đang tắt; chưa thể chốt conflict.' }; }
  var state = FbmSync.stateRead(), plan = FbmSync.conflictChoiceValidate(input || {});
  if (plan.code === 'CONFLICT_REOPEN') { return FbmSync.conflictReject(state, plan.entity, plan.id, plan.message); }
  if (!plan.ok) { return FbmSync.conflictFail(plan.code, plan.message); }
  var read = { entity: plan.entity, id: plan.id, gate: FbmSync.stateCategoryGate(state), latestHash: plan.openedHash, latestFor: function (local) { return FbmSync.snapshotLatest(local, plan.shotOld, plan.latestFbm); }, old: plan.old };
  return FbmSync.conflictSettle(state, read, function (local) { return Object.assign({}, local, plan.picks); }, 'Đã quyết conflict ' + plan.entity + ' ' + plan.id + ' theo ' + plan.choice + '.');
};

/**
 * Kiểm lệnh chốt, thuần (không đọc gì): đúng bản ghi, đúng cách xử lý, giá trị FBM chỉ gồm trường fingerprint, đủ giá trị ShinCRM của từng trường lệch và có ảnh chụp lúc mở. Giá trị gửi kèm sai thì `CONFLICT_REOPEN` (mở lại xung đột, FBM được đọc mới).
 * Hợp lệ thì trả kế hoạch ghi theo tên cột Sheet: `picks` là giá trị ghi (mỗi dữ liệu một vai: chọn ShinCRM ghi giá trị màn đang hiện; `old` từ ảnh chụp chỉ là mốc so của cửa ghi, không bao giờ là giá trị ghi), `latestFbm` là giá trị FBM để so hash lúc mở.
 */
FbmSync.conflictChoiceValidate = function (input) {
  var entity = input.entity, target = String(input.id || '').trim(), choice = input.choice;
  if (['customer', 'activity'].indexOf(entity) < 0 || !target) { return { ok: false, code: 'CONFLICT_TARGET_INVALID', message: 'Bản ghi xung đột không hợp lệ.' }; }
  if (['fbm', 'shin', 'manual'].indexOf(choice) < 0) { return { ok: false, code: 'CONFLICT_CHOICE_INVALID', message: 'Cách xử lý conflict không hợp lệ.' }; }
  var allowed = (FbmSync.FINGERPRINT_FIELDS[entity] || []).filter(function (field) { return !(entity === 'activity' && field === 'id'); });
  var isMap = function (value) { return !!value && typeof value === 'object' && !Array.isArray(value); };
  var values = isMap(input.fbmValues) ? input.fbmValues : null, snapshot = input.snapshot;
  var stray = values ? Object.keys(values).filter(function (field) { return allowed.indexOf(field) < 0; }) : ['không có giá trị FBM'];
  var shot = isMap(snapshot) && isMap(snapshot.old) && String(snapshot.openedHash || '') ? snapshot : null;
  if (!shot) { stray.push('thiếu ảnh chụp lúc mở'); }
  var shins = isMap(input.shinValues) ? input.shinValues : {};
  if (values) { Object.keys(values).forEach(function (field) { if (!Object.prototype.hasOwnProperty.call(shins, field)) { stray.push('thiếu giá trị ShinCRM của ' + field); } }); }
  if (stray.length) { return { ok: false, code: 'CONFLICT_REOPEN', entity: entity, id: target, message: 'Giá trị gửi kèm lệnh chốt ' + target + ' không hợp lệ (' + stray.join(', ') + '); chưa ghi gì, mở lại xung đột.' }; }
  var blank = function (value) { return value === undefined || value === null ? '' : value; };
  var latestFbm = {}, picks = {}, old = {};
  Object.keys(values).forEach(function (field) {
    var localField = FbmSync.conflictLocalField(entity, field), pick = choice === 'manual' ? (input.merged && input.merged[field]) || {} : { choice: choice };
    latestFbm[localField] = blank(values[field]);
    picks[localField] = blank(pick.choice === 'fbm' ? values[field] : pick.choice === 'manual' ? pick.value : shins[field]);
    old[localField] = blank(shot.old[localField]);
  });
  return { ok: true, entity: entity, id: target, choice: choice, openedHash: String(shot.openedHash), shotOld: shot.old, latestFbm: latestFbm, picks: picks, old: old };
};

/** Bản FBM lúc mở dựng lại từ ảnh chụp: dòng đọc trong khóa (cho trường ngoài fingerprint và ID FBM), giá trị ShinCRM lúc mở, đè giá trị FBM của các trường lệch. Thuần. */
FbmSync.snapshotLatest = function (local, shotOld, latestFbm) {
  return Object.assign({}, local, shotOld, latestFbm);
};

/** Bản FBM gửi lại có đúng là bản lúc mở không: hash của nó phải bằng hash FBM lúc mở. Thuần. */
FbmSync.snapshotMatch = function (latest, entity, gate, openedHash) {
  return String(FbmSync.hash(latest, entity, gate)) === String(openedHash);
};

/** Lệnh chốt không ghi được theo ảnh chụp đã gửi (giá trị FBM lệch hash lúc mở, thiếu hoặc thừa trường): ghi Log và trả `CONFLICT_REOPEN` để Sidebar mở lại xung đột, lúc đó FBM được đọc mới. */
FbmSync.conflictReject = function (state, entity, id, message) {
  state.message = message; FbmSync.stateWrite(state);
  logEvent({ source: 'fbm_sync', action: 'conflict_reopen', outcome: LOG_WARN, entity: entity, recordId: id, cycleId: String(state.runId || ''), reason: message });
  return { ok: false, code: 'CONFLICT_REOPEN', message: message, status: FbmSync.statusView() };
};

/**
 * Ghi quyết định xung đột qua Cửa bản ghi với baseline là `read.latestHash` (hash FBM lúc mở); lệnh chốt và bước kết của chặng mở (khi không còn trường lệch) dùng chung.
 * Ngoại lệ duy nhất của luật baseline: đây là công cụ duy nhất được ghi `fbmHash` khi hai bên đang khác nhau (chọn ShinCRM hay tự nhập thì baseline là hash FBM lúc mở, dòng "chờ đối soát" để lượt sau đẩy). Luật tĩnh `baselineWrite` giữ ngoại lệ đúng một chỗ ở tệp này.
 * Trong khóa: dòng đã rời trạng thái chờ quyết thì báo, dòng đang bị tiến trình khác giữ thì trả `busy`, bản FBM (`read.latest` hoặc `read.latestFor(local)`) không khớp hash lúc mở (`snapshotMatch`) thì không ghi.
 * Khớp thì `build(local, latest)` dựng bản ghi và cửa ghi so các trường trong `read.old` với Sheet như lưu form; Sheet đã đổi thì trả `conflicts`, không ghi gì.
 */
FbmSync.conflictSettle = function (state, read, build, message) {
  var entity = read.entity;
  var run = FbmSync.recordChange(function (gate) {
    var local = gate.readById(entity, FbmSync.recordSchemas(), read.id);
    if (!local || !FbmSync.isConflictPending(local)) { return { value: { status: 'gone' } }; }
    var busy = gate.busy(entity, [read.id])[read.id];
    if (busy) { return { value: { status: 'busy', busy: busy } }; }
    var latest = read.latestFor ? read.latestFor(local) : read.latest;
    if (!FbmSync.snapshotMatch(latest, entity, read.gate, read.latestHash)) { return { value: { status: 'fbmMismatch' } }; }
    var record = build(local, latest);
    record.id = read.id;
    record.fbmId = local.fbmId;
    record.fbmHash = read.latestHash;
    record.syncStatus = FbmSync.hash(record, entity, read.gate) === read.latestHash ? FbmSync.SYNC_STATUS.synced : FbmSync.SYNC_STATUS.pending;
    if (record.syncStatus === FbmSync.SYNC_STATUS.synced) { record.syncedAt = new Date(); }
    return { save: [{ entity: entity, records: [record], source: 'pull', old: [read.old] }], value: { status: 'ok' } };
  });
  var done = run.value || {}, saved = run.saves && run.saves[0];
  if (saved && Array.isArray(saved.conflicts) && saved.conflicts.length) {
    return { ok: false, code: 'CONFLICT_SHEET_CHANGED', conflicts: saved.conflicts, message: 'ShinCRM đã đổi trong lúc xử lý ' + read.id + '; chưa ghi gì.' };
  }
  if (done.status === 'gone') {
    state.message = 'Bản ghi ' + read.id + ' không còn ở trạng thái xung đột chờ quyết trên Sheet.'; FbmSync.stateWrite(state);
    return FbmSync.conflictFail('CONFLICT_NOT_FOUND', state.message);
  }
  if (done.status === 'busy') {
    return { ok: false, code: 'CONFLICT_RECORD_BUSY', busy: { id: read.id, by: done.busy.by, reason: done.busy.reason }, message: 'Bản ghi ' + read.id + ' đang bận (' + done.busy.reason + '); chưa ghi gì.' };
  }
  if (done.status === 'fbmMismatch') { return FbmSync.conflictReject(state, entity, read.id, 'Giá trị FBM gửi kèm lệnh chốt ' + read.id + ' không khớp bản FBM lúc mở xung đột; chưa ghi gì, mở lại xung đột.'); }
  var remaining = FbmSync.conflictQueue(FbmSync.localScan()).length;
  state.metadata.conflictCount = remaining;
  FbmSync.pushFailuresRemove([entity + ':' + read.id]);
  if (state.phase === 'conflict' && !remaining) { state.phase = 'done'; }
  state.message = message;
  FbmSync.stateWrite(state);
  return { ok: true, remaining: remaining, status: FbmSync.statusView() };
};
