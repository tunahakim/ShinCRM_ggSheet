/** Trạng thái bền vững của phiên sync trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.STATE_KEY = 'FBM_SYNC_STATE_V1';
FbmSync.LOCK_KEY = 'FBM_SYNC_RECORD_LOCKS_V1';
// Request FBM thuong ket thuc trong vai giay; state im qua lau la phien bi bo roi.
FbmSync.STALE_RUN_MS = 2 * 60 * 1000;
FbmSync.ACTIVE_PHASES = ['checking_session', 'pull_customer', 'pull_activity', 'reconcile', 'push'];

/** Tạo state rỗng với đủ field để các phiên cũ vẫn đọc được. */
FbmSync.stateDefault = function () {
  return { version: 1, runId: '', mode: 'read', scan: 'full', scheduledScan: '', phase: 'idle', entity: '', cursor: {}, activeRequestId: '', lastProgressAt: 0, deadlineAt: 0, session: { customerAuthorized: '', activityAuthorized: '', cookie: '', userId: '', lookups: {}, expired: false, lastHeartbeatAt: 0, customerTotal: null }, metadata: { categoryGate: null, categoryBlocks: [], preflight: null, preflightIssues: [], seen: { customer: {}, activity: {} }, conflicts: [], pushSucceeded: 0, pushFailures: {}, pushFailureDetails: {}, callbackTrace: null, preview: { customers: [], activities: [], truncated: false } }, counts: { total: 0, completed: 0, succeeded: 0, error: 0, conflict: 0, skipped: 0 }, current: '', message: '', startedAt: 0, updatedAt: 0, lastError: '', lastFailureCode: '', retryable: false, retryCount: 0, retryLimit: 2, locks: {} };
};

/** Lấy kho state cấp tài liệu, dùng chung giữa các lần gọi GAS. */
FbmSync.props = function () { return PropertiesService.getDocumentProperties(); };
/** Hash của lần ghi đang chờ xác nhận; không đưa metadata kỹ thuật vào Sheet. */
FbmSync.pendingPushesRead = function () {
  try {
    var raw = FbmSync.props().getProperty('FBM_SYNC_PENDING_PUSHES_V1'), parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (ignore) { return {}; }
};
FbmSync.pendingPushGet = function (entity, id) {
  return FbmSync.pendingPushesRead()[String(entity || '') + ':' + String(id || '')] || null;
};
FbmSync.pendingPushSet = function (entity, id, value) {
  var key = String(entity || '') + ':' + String(id || ''), all = FbmSync.pendingPushesRead();
  if (value && typeof value === 'object') { all[key] = value; } else { delete all[key]; }
  FbmSync.props().setProperty('FBM_SYNC_PENDING_PUSHES_V1', JSON.stringify(all));
  return value || null;
};
FbmSync.pendingPushClear = function (entity, id) { return FbmSync.pendingPushSet(entity, id, null); };
/** Đọc state và tự bù field thiếu từ mặc định. */
FbmSync.stateRead = function () {
  var fallback = FbmSync.stateDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.STATE_KEY);
    if (!raw) { return fallback; }
    var parsed = JSON.parse(raw);
    var metadata = parsed.metadata || {};
    return Object.assign(fallback, parsed, { counts: Object.assign(fallback.counts, parsed.counts || {}), session: Object.assign(fallback.session, parsed.session || {}), metadata: Object.assign(fallback.metadata, metadata, { seen: Object.assign(fallback.metadata.seen, metadata.seen || {}), conflicts: Array.isArray(metadata.conflicts) ? metadata.conflicts : [], pushSucceeded: Number(metadata.pushSucceeded || 0), preflightIssues: Array.isArray(metadata.preflightIssues) ? metadata.preflightIssues : [], pushFailures: Object.assign(fallback.metadata.pushFailures, metadata.pushFailures || {}), pushFailureDetails: Object.assign(fallback.metadata.pushFailureDetails, metadata.pushFailureDetails || {}), callbackTrace: metadata.callbackTrace || null, preview: Object.assign(fallback.metadata.preview, metadata.preview || {}) }), locks: parsed.locks || {} });
  } catch (err) { return fallback; }
};
/** Ghi state, cập nhật timestamp và giữ cấu trúc nhất quán. */
FbmSync.stateWrite = function (state) {
  var next = Object.assign(FbmSync.stateDefault(), state || {});
  next.session = Object.assign(FbmSync.stateDefault().session, next.session || {});
  next.session.lookups = Object.assign({}, FbmSync.stateDefault().session.lookups, next.session.lookups || {});
  next.metadata = Object.assign(FbmSync.stateDefault().metadata, next.metadata || {});
  next.metadata.pushSucceeded = Number(next.metadata.pushSucceeded || 0);
  next.metadata.seen = Object.assign(FbmSync.stateDefault().metadata.seen, next.metadata.seen || {});
  next.metadata.conflicts = Array.isArray(next.metadata.conflicts) ? next.metadata.conflicts.slice(-100) : [];
  next.metadata.pushFailures = Object.assign({}, FbmSync.stateDefault().metadata.pushFailures, next.metadata.pushFailures || {});
  next.metadata.pushFailureDetails = Object.assign({}, FbmSync.stateDefault().metadata.pushFailureDetails, next.metadata.pushFailureDetails || {});
  next.metadata.callbackTrace = next.metadata.callbackTrace || null;
  next.metadata.preview = Object.assign(FbmSync.stateDefault().metadata.preview, next.metadata.preview || {});
  next.counts = Object.assign(FbmSync.stateDefault().counts, next.counts || {});
  next.updatedAt = Date.now();
  FbmSync.props().setProperty(FbmSync.STATE_KEY, JSON.stringify(next));
  return next;
};
/** Ghi một phần state mà không làm mất field đang có. */
FbmSync.statePatch = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };
/** Lọc conflict cũ theo bản ghi còn tồn tại; lỗi đọc Sheet thì giữ nguyên để fail-closed. */
FbmSync.relevantConflicts = function (conflicts) {
  var source = Array.isArray(conflicts) ? conflicts : [], records = { customer: {}, activity: {} };
  if (!source.length) { return { ok: true, conflicts: [], removed: 0 }; }
  if (typeof FbmSync.readLocal !== 'function') { return { ok: false, conflicts: source.slice(-100), removed: 0 }; }
  try {
    ['customer', 'activity'].forEach(function (entity) {
      (FbmSync.readLocal(entity) || []).forEach(function (record) {
        var id = String(record && record.id || '').trim();
        if (id && String(record && record.recordStatus || 'active') !== 'deleted') { records[entity][id] = true; }
      });
    });
    var kept = source.filter(function (item) {
      var entity = String(item && item.entity || '').trim(), id = String(item && item.id || '').trim();
      return !!(records[entity] && id && records[entity][id]);
    });
    return { ok: true, conflicts: kept.slice(-100), removed: Math.max(0, source.length - kept.length) };
  } catch (err) {
    return { ok: false, conflicts: source.slice(-100), removed: 0, error: String(err && err.message || err) };
  }
};
/** Mở phiên mới và xóa cursor/đếm của phiên trước. */
FbmSync.stateStart = function (entity, phase, total) {
  var preserveConflicts = arguments[3] && arguments[3].preserveConflicts === true, now = Date.now(), previous = FbmSync.stateRead(), userLocks = {}, conflictSource = preserveConflicts && previous.phase === 'conflict' && previous.metadata && Array.isArray(previous.metadata.conflicts) ? previous.metadata.conflicts.slice(-100) : [], conflictCheck = FbmSync.relevantConflicts(conflictSource), preservedConflicts = conflictCheck.conflicts, conflictKeys = {};
  preservedConflicts.forEach(function (item) { conflictKeys[String(item.entity || '') + ':' + String(item.id || '')] = true; });
  Object.keys(previous.locks || {}).forEach(function (key) { if (previous.locks[key] && previous.locks[key].owner === 'user') { userLocks[key] = previous.locks[key]; } });
  Object.keys(previous.locks || {}).forEach(function (key) { if (conflictKeys[key] && previous.locks[key] && previous.locks[key].owner === 'sync') { userLocks[key] = previous.locks[key]; } });
  var next = FbmSync.stateWrite({ runId: now.toString(36), entity: entity || '', phase: phase || 'checking_session', cursor: {}, counts: { total: Number(total) || 0, completed: 0, succeeded: 0, error: 0, conflict: preservedConflicts.length, skipped: 0 }, metadata: { conflicts: preservedConflicts }, current: '', message: '', startedAt: now, updatedAt: now, lastError: '', lastFailureCode: '', retryable: false, retryCount: 0, retryLimit: 2, locks: userLocks });
  if (conflictCheck.ok && conflictCheck.removed && typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'conflict_orphan_discarded', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', entity: 'fbm_sync', reason: 'Đã bỏ ' + conflictCheck.removed + ' conflict không còn bản ghi trong Sheet; không còn đối tượng để người dùng quyết định.', detail: { removed: conflictCheck.removed, previousCount: conflictSource.length, keptCount: preservedConflicts.length } });
  }
  return next;
};
/** Thu hoi state dang chay nhung khong con caller; khong retry lenh ghi dang mo. */
FbmSync.recoverStaleRun = function (state, now) {
  var current = state || FbmSync.stateRead(), at = Number(now || Date.now());
  if (!current.runId || FbmSync.ACTIVE_PHASES.indexOf(String(current.phase || '')) < 0) { return { state: current, recovered: false }; }
  var updated = Number(current.updatedAt || current.startedAt || 0), age = updated ? at - updated : FbmSync.STALE_RUN_MS + 1;
  if (age <= FbmSync.STALE_RUN_MS) { return { state: current, recovered: false }; }
  var cursor = current.cursor || {}, waitingWrite = cursor.kind === 'push_wait';
  var message = waitingWrite
    ? 'Phiên ghi FBM không nhận được phản hồi quá thời gian an toàn; không tự ghi lại để tránh trùng dữ liệu.'
    : 'Phiên đồng bộ không nhận được phản hồi quá thời gian an toàn; đã tự dừng, có thể chạy lại.';
  current.phase = 'error';
  current.lastFailureCode = waitingWrite ? 'SYNC_STALE_WRITE' : 'SYNC_STALE_RUN';
  current.retryable = false;
  current.lastError = message;
  current.message = message;
  if (!waitingWrite) {
    var kept = {};
    Object.keys(current.locks || {}).forEach(function (key) { if (current.locks[key] && current.locks[key].owner === 'user') { kept[key] = current.locks[key]; } });
    current.locks = kept;
  }
  return { state: FbmSync.stateWrite(current), recovered: true, waitingWrite: waitingWrite };
};
/** Đóng hoặc chuyển phase với thông báo cuối. */
FbmSync.stateFinish = function (phase, message) { return FbmSync.statePatch({ phase: phase || 'done', message: message || '', current: '' }); };
/** Cộng dồn một bộ đếm, không cho âm. */
FbmSync.stateCount = function (name, amount) {
  var state = FbmSync.stateRead();
  state.counts[name] = Math.max(0, Number(state.counts[name] || 0) + (Number(amount) || 1));
  return FbmSync.stateWrite(state);
};
/** Khóa một record khi Sidebar đang sửa hoặc sync chuẩn bị ghi. */
FbmSync.lockRecord = function (entity, id, revision, owner) {
  var state = FbmSync.stateRead();
  var key = String(entity) + ':' + String(id);
  state.locks[key] = { revision: String(revision || ''), owner: owner || 'sync', at: Date.now() };
  return FbmSync.stateWrite(state);
};
/** Bỏ khóa record sau khi kết thúc chỉnh sửa. */
FbmSync.unlockRecord = function (entity, id) {
  var state = FbmSync.stateRead();
  delete state.locks[String(entity) + ':' + String(id)];
  return FbmSync.stateWrite(state);
};
/** Kiểm tra nhanh record có đang bị khóa hay không. */
FbmSync.isRecordLocked = function (entity, id) { var state = FbmSync.stateRead(); return !!state.locks[String(entity) + ':' + String(id)]; };

/** Tương thích với caller cũ cần snapshot state trực tiếp. */
function getSyncStatus() { return FbmSync.stateRead(); }
