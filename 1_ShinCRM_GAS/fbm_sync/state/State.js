/** Trạng thái bền vững của phiên sync trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.STATE_KEY = 'FBM_SYNC_STATE_V1';
FbmSync.LOCK_KEY = 'FBM_SYNC_RECORD_LOCKS_V1';

/** Tạo state rỗng với đủ field để các phiên cũ vẫn đọc được. */
FbmSync.stateDefault = function () {
  return { version: 1, runId: '', mode: 'read', phase: 'idle', entity: '', cursor: {}, session: { customerAuthorized: '', activityAuthorized: '', cookie: '', userId: '', lookups: {}, expired: false, lastHeartbeatAt: 0 }, metadata: { categoryGate: null, categoryBlocks: [], seen: { customer: {}, activity: {} }, conflicts: [], pushFailures: {}, preview: { customers: [], activities: [], truncated: false } }, counts: { total: 0, completed: 0, succeeded: 0, error: 0, conflict: 0, skipped: 0 }, current: '', message: '', startedAt: 0, updatedAt: 0, lastError: '', lastFailureCode: '', retryable: false, retryCount: 0, retryLimit: 2, locks: {} };
};

/** Lấy kho state cấp tài liệu, dùng chung giữa các lần gọi GAS. */
FbmSync.props = function () { return PropertiesService.getDocumentProperties(); };
/** Đọc state và tự bù field thiếu từ mặc định. */
FbmSync.stateRead = function () {
  var fallback = FbmSync.stateDefault();
  try {
    var raw = FbmSync.props().getProperty(FbmSync.STATE_KEY);
    if (!raw) { return fallback; }
    var parsed = JSON.parse(raw);
    var metadata = parsed.metadata || {};
    return Object.assign(fallback, parsed, { counts: Object.assign(fallback.counts, parsed.counts || {}), session: Object.assign(fallback.session, parsed.session || {}), metadata: Object.assign(fallback.metadata, metadata, { seen: Object.assign(fallback.metadata.seen, metadata.seen || {}), conflicts: Array.isArray(metadata.conflicts) ? metadata.conflicts : [], pushFailures: Object.assign(fallback.metadata.pushFailures, metadata.pushFailures || {}), preview: Object.assign(fallback.metadata.preview, metadata.preview || {}) }), locks: parsed.locks || {} });
  } catch (err) { return fallback; }
};
/** Ghi state, cập nhật timestamp và giữ cấu trúc nhất quán. */
FbmSync.stateWrite = function (state) {
  var next = Object.assign(FbmSync.stateDefault(), state || {});
  next.session = Object.assign(FbmSync.stateDefault().session, next.session || {});
  next.session.lookups = Object.assign({}, FbmSync.stateDefault().session.lookups, next.session.lookups || {});
  next.metadata = Object.assign(FbmSync.stateDefault().metadata, next.metadata || {});
  next.metadata.seen = Object.assign(FbmSync.stateDefault().metadata.seen, next.metadata.seen || {});
  next.metadata.conflicts = Array.isArray(next.metadata.conflicts) ? next.metadata.conflicts.slice(-100) : [];
  next.metadata.pushFailures = Object.assign({}, FbmSync.stateDefault().metadata.pushFailures, next.metadata.pushFailures || {});
  next.metadata.preview = Object.assign(FbmSync.stateDefault().metadata.preview, next.metadata.preview || {});
  next.counts = Object.assign(FbmSync.stateDefault().counts, next.counts || {});
  next.updatedAt = Date.now();
  FbmSync.props().setProperty(FbmSync.STATE_KEY, JSON.stringify(next));
  return next;
};
/** Ghi một phần state mà không làm mất field đang có. */
FbmSync.statePatch = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };
/** Mở phiên mới và xóa cursor/đếm của phiên trước. */
FbmSync.stateStart = function (entity, phase, total) {
  var now = Date.now(), previous = FbmSync.stateRead(), userLocks = {};
  Object.keys(previous.locks || {}).forEach(function (key) { if (previous.locks[key] && previous.locks[key].owner === 'user') { userLocks[key] = previous.locks[key]; } });
  return FbmSync.stateWrite({ runId: now.toString(36), entity: entity || '', phase: phase || 'checking_session', cursor: {}, counts: { total: Number(total) || 0, completed: 0, succeeded: 0, error: 0, conflict: 0, skipped: 0 }, current: '', message: '', startedAt: now, updatedAt: now, lastError: '', lastFailureCode: '', retryable: false, retryCount: 0, retryLimit: 2, locks: userLocks });
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
