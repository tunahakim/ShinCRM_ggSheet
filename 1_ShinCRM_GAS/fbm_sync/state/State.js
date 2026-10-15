/** Trạng thái bền vững của phiên sync trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.STATE_KEY = 'FBM_SYNC_STATE_V1';
// Request FBM thuong ket thuc trong vai giay; state im qua lau la phien bi bo roi.
FbmSync.STALE_RUN_MS = 2 * 60 * 1000;
/** Phiên bản logic của state trong cùng khóa kho. State thiếu số này là bản cũ: lượt đang dở của nó bị dừng ở `recoverStaleRun`, không chạy tiếp mù trên cấu trúc cũ. */
FbmSync.STATE_SCHEMA_VERSION = 2;
FbmSync.ACTIVE_PHASES = ['checking_session', 'waiting_session', 'pull_customer', 'pull_activity', 'reconcile', 'push'];
FbmSync.TERMINAL_PHASES = ['done', 'error', 'paused', 'conflict'];
FbmSync.DONE_MESSAGE = 'Đồng bộ hoàn tất.';
/** Quyền ghi được tách theo đích; mode không được kiêm thêm một cờ ẩn ngoài UI. */
/** Chế độ chạy hợp lệ từ lựa chọn của người dùng hoặc lịch nền; giá trị lạ về `read` (chỉ lấy về), không bao giờ thành chế độ có đẩy. */
FbmSync.modeOf = function (mode) { return mode === 'write' || mode === 'push' || mode === 'check' ? mode : 'read'; };
FbmSync.canWriteSheet = function (mode) { return mode === 'read' || mode === 'write'; };
FbmSync.canWriteFbm = function (mode) { return mode === 'push' || mode === 'write'; };
/**
 * Bộ đếm của một lượt, chỗ định nghĩa duy nhất. `succeeded` là bản ghi ghi vào Sheet từ FBM, `pushed` là bản ghi FBM đã đọc xác nhận sau khi đẩy; hai số tách riêng vì Sidebar hiện riêng.
 * `missingCustomer`/`missingActivity` là bản ghi mang cờ "không thấy bên FBM" sau lượt quét đủ, kể cả bản ghi đã mang cờ từ lượt trước.
 */
/**
 * Thông báo kết thúc lượt cho mọi chiều chạy. Lượt Hai chiều kết thúc ở bước đẩy nên ghi chú của phần đọc (khách lỗi khi đọc giao dịch) phải dựng cùng chỗ, không thì mất.
 * Số liệu chi tiết nằm ở `counts`; câu này chỉ nêu kết luận và việc người dùng cần xem.
 */
FbmSync.runDoneMessage = function (state) {
  var counts = state.counts || {}, metadata = state.metadata || {};
  var customerErrors = Number(metadata.customerErrors && metadata.customerErrors.total || 0), pushErrors = Math.max(0, Number(counts.error || 0) - customerErrors), markerCleanFailed = Number(metadata.markerCleanFailed || 0);
  var head = pushErrors > 0 ? 'Đồng bộ hoàn tất nhưng có ' + pushErrors + ' lỗi đẩy; xem Chi tiết bản ghi.'
    : Number(counts.pushed || 0) > 0 ? 'Đồng bộ hoàn tất; bản ghi vừa đẩy đã được FBM xác nhận.'
      : FbmSync.canWriteFbm(state.mode) ? 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.'
        : FbmSync.DONE_MESSAGE;
  var fullScan = FbmSync.canWriteSheet(state.mode) && state.scan !== 'detail';
  return head
    + (customerErrors ? ' Có ' + customerErrors + ' khách lỗi khi đọc giao dịch (xem danh sách lỗi)' + (fullScan ? '; lượt này chưa đánh dấu giao dịch "không thấy bên FBM".' : '.') : '')
    + (markerCleanFailed > 0 ? ' Có ' + markerCleanFailed + ' giao dịch chưa bỏ được dấu #SC trên FBM; xem Log.' : '');
};
FbmSync.countsDefault = function () { return { total: 0, completed: 0, succeeded: 0, pushed: 0, missingCustomer: 0, missingActivity: 0, error: 0, conflict: 0, skipped: 0 }; };
FbmSync.SEEN_SHARD_HEX_LENGTH = 8000;
// Apps Script giới hạn một giá trị DocumentProperties khoảng 9 KB. Chặn trước
// khi gọi setProperty để không đẩy một JSON dở dang vào kho state.
FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT = 9000;
FbmSync.documentPropertySet = function (key, value, context) {
  var text = String(value === null || value === undefined ? '' : value), bytes = text.length;
  // State cũ chỉ để ghi chi tiết Log khi ghi hỏng, nên chỉ đọc ở nhánh hỏng; đọc ở mỗi lần ghi từng tốn một lần gọi DocumentProperties.
  var previous = null, loadPrevious = function () {
    try { previous = key === FbmSync.STATE_KEY ? JSON.parse(FbmSync.props().getProperty(key) || 'null') : null; } catch (ignorePrevious) { previous = null; }
  };
  try {
    if (typeof Utilities !== 'undefined' && Utilities.newBlob) { bytes = Utilities.newBlob(text).getBytes().length; }
  } catch (ignoreBytes) {}
  if (bytes > FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT) {
    var tooLarge = new Error('Không thể lưu state đồng bộ vì DocumentProperties đã chạm giới hạn dung lượng.');
    tooLarge.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA';
    loadPrevious();
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_write', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: tooLarge.code, detail: { key: String(key || ''), bytes: bytes, context: String(context || ''), runId: previous && String(previous.runId || ''), phase: previous && String(previous.phase || ''), cursor: previous && previous.cursor || {} } }); }
    return { ok: false, code: tooLarge.code, message: tooLarge.message, error: tooLarge };
  }
  try {
    FbmSync.props().setProperty(key, text);
    return { ok: true };
  } catch (err) {
    var failure = new Error('Không thể lưu state đồng bộ vào DocumentProperties.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
    loadPrevious();
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_write', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: failure.code, detail: { key: String(key || ''), context: String(context || ''), runId: previous && String(previous.runId || ''), phase: previous && String(previous.phase || ''), cursor: previous && previous.cursor || {} } }); }
    return { ok: false, code: failure.code, message: failure.message, error: failure };
  }
};
/**
 * Đọc một property JSON dạng object; chưa có thì trả `null`.
 * Lỗi dịch vụ hoặc JSON hỏng thì ném lỗi có mã, không coi như "chưa có": coi như trống thì lần ghi kế tiếp đè mất cursor, hash chờ xác nhận hay cấu hình thật (FBM-025, FBM-026). Thông điệp không chứa giá trị property vì có thể là envelope đăng nhập.
 */
FbmSync.documentPropertyJson = function (key, context) {
  var raw;
  try { raw = FbmSync.props().getProperty(key); } catch (err) {
    var readFailure = new Error('Không đọc được ' + context + ' từ DocumentProperties; thử lại sau ít phút.');
    readFailure.code = 'FBM_DOCUMENT_PROPERTIES_READ_FAILED';
    throw readFailure;
  }
  if (!raw) { return null; }
  var parsed = null;
  try { parsed = JSON.parse(raw); } catch (ignoreParse) { parsed = null; }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    var corrupt = new Error('Dữ liệu ' + context + ' trong DocumentProperties bị hỏng (' + key + '); đã dừng để không ghi đè.');
    corrupt.code = 'FBM_DOCUMENT_PROPERTY_CORRUPT';
    throw corrupt;
  }
  return parsed;
};

/** Khóa riêng cho state/cursor đồng bộ; không dùng DocumentLock vì WriteGate tự giữ khóa đó khi ghi Sheet. */
FbmSync.orchestrationLock = function () {
  if (typeof LockService !== 'undefined' && LockService.getScriptLock) { return LockService.getScriptLock(); }
  if (typeof LockService !== 'undefined' && LockService.getDocumentLock) { return LockService.getDocumentLock(); }
  return { tryLock: function () { return true; }, releaseLock: function () {} };
};
FbmSync.withOrchestrationLock = function (work) {
  var lock = FbmSync.orchestrationLock(), waitMs = typeof SETTINGS !== 'undefined' && SETTINGS && SETTINGS.LOCK_WAIT_MS ? SETTINGS.LOCK_WAIT_MS : 10000;
  if (!documentStoreTryLock(lock, waitMs)) { return { ok: false, code: 'BUSY', request: null, message: 'GAS đang xử lý một lượt đồng bộ khác; chưa thay đổi state.', status: typeof FbmSync.statusView === 'function' ? FbmSync.statusView() : null }; }
  // State ghi gộp trước khi nhả khóa, để lượt chờ khóa đọc được bản hoàn chỉnh (PropertyBuffer.js).
  try { return FbmSync.withPropertyBuffer(work); } finally { lock.releaseLock(); }
};

/**
 * Ranh giới một lát đồng bộ, chạy bên trong khóa điều phối: nhả bộ gom vấn đề theo bản ghi, và nếu lát ném lỗi thì chuyển phiên sang lỗi
 * trước khi nhả khóa (nhả khóa rồi mới ghi thì một lát khác có thể chen vào giữa). Đường Sidebar và đường nền dùng chung hàm này.
 */
FbmSync.runSlice = function (work) {
  var failure = null;
  try { return work(); } catch (error) { failure = error; throw error; } finally {
    if (typeof FbmSync.recordIssuesFlush === 'function') { FbmSync.recordIssuesFlush(); }
    if (failure) { FbmSync.controlFailRun(failure); }
  }
};

/** Ghi phiên lỗi sau exception của lát. Lỗi gốc luôn được ném lại ở chỗ gọi; ghi state hỏng thì chỉ thêm một dòng Log, không thay lỗi gốc. */
FbmSync.controlFailRun = function (error) {
  try {
    FbmSync.stateFailRun(String(error && error.message || error), String(error && error.code || ''));
  } catch (writeError) {
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_fail_run', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', reason: 'Không ghi được trạng thái lỗi của phiên: ' + String(writeError && writeError.message || writeError) }); }
  }
};

/** Bitmap phân mảnh theo mã nội bộ ổn định; thứ tự dòng Sheet có đổi thì dấu vẫn đúng. */
FbmSync.seenStorePrefix = function (scope) { return 'FBM_SYNC_SEEN_' + String(scope || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_'; };
FbmSync.seenStoreIndex = function (scope, record) {
  var value = record && typeof record === 'object' ? record.id : record;
  var text = String(value === null || value === undefined ? '' : value).trim();
  var match = text.match(/^(CUS|ACT)-(\d{6})$/i);
  if (!match) { return -1; }
  var expected = String(scope || '').toLowerCase().indexOf('activity') === 0 ? 'ACT' : 'CUS';
  if (String(match[1]).toUpperCase() !== expected) { return -1; }
  var digits = match[2];
  var index = Number(digits);
  return isFinite(index) && index >= 0 ? index : -1;
};
FbmSync.seenStoreClear = function (scope) {
  var props = FbmSync.props(), prefix = FbmSync.seenStorePrefix(scope), count = Number(props.getProperty(prefix + 'SHARDS') || 0);
  if (!props || typeof props.setProperty !== 'function') { return; }
  if (typeof props.deleteProperty === 'function') {
    for (var i = 0; i < count; i += 1) { props.deleteProperty(prefix + i); }
    props.deleteProperty(prefix + 'TOTAL'); props.deleteProperty(prefix + 'HIGH_WATER'); props.deleteProperty(prefix + 'SHARDS');
  } else {
    for (var j = 0; j < count; j += 1) { props.setProperty(prefix + j, ''); }
    props.setProperty(prefix + 'TOTAL', '0'); props.setProperty(prefix + 'HIGH_WATER', '0'); props.setProperty(prefix + 'SHARDS', '0');
  }
};
FbmSync.seenStoreBegin = function (scope, recordsOrTotal) {
  FbmSync.seenStoreClear(scope);
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), records = Array.isArray(recordsOrTotal) ? recordsOrTotal : null, highWater = 0;
  if (!props || typeof props.setProperty !== 'function') { return; }
  if (records) {
    records.forEach(function (record) { highWater = Math.max(highWater, FbmSync.seenStoreIndex(scope, record)); });
  }
  props.setProperty(prefix + 'TOTAL', String(records ? records.length : Math.max(0, Number(recordsOrTotal || 0))));
  props.setProperty(prefix + 'HIGH_WATER', String(Math.max(0, highWater)));
  props.setProperty(prefix + 'SHARDS', '0');
};
/** Kho không có mốc "khách sinh sau đầu lượt coi như đã đánh dấu": bit nào chưa đặt là chưa, dùng cho tập khách cần đọc hoặc đã đọc giao dịch. */
FbmSync.seenStoreBeginExact = function (scope) {
  FbmSync.seenStoreBegin(scope, []);
  FbmSync.props().setProperty(FbmSync.seenStorePrefix(scope) + 'HIGH_WATER', '');
};
FbmSync.seenStoreMark = function (scope, localRecords, incomingRecords) {
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, local = localRecords || [], incoming = incomingRecords || [], positions = {}, shards = {}, maxShard = -1;
  if (!props || typeof props.setProperty !== 'function') { return; }
  local.forEach(function (record) {
    var id = String(record && record.fbmId || '').trim(), index = FbmSync.seenStoreIndex(scope, record);
    if (id && index >= 0) { positions[id] = index; }
  });
  incoming.forEach(function (record) {
    var id = String(record && (record.fbmId || record.id) || '').trim(), index = positions[id];
    if (index === undefined) { return; }
    var hexIndex = Math.floor(index / 4), shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
    if (!shards[shardIndex]) { shards[shardIndex] = String(props.getProperty(prefix + shardIndex) || '').split(''); }
    while (shards[shardIndex].length <= offset) { shards[shardIndex].push('0'); }
    var nibble = parseInt(shards[shardIndex][offset] || '0', 16) || 0;
    shards[shardIndex][offset] = (nibble | (1 << (index % 4))).toString(16);
    maxShard = Math.max(maxShard, shardIndex);
  });
  Object.keys(shards).forEach(function (key) { props.setProperty(prefix + key, shards[key].join('')); });
  var previous = Number(props.getProperty(prefix + 'SHARDS') || 0);
  props.setProperty(prefix + 'SHARDS', String(Math.max(previous, maxShard + 1)));
};
FbmSync.seenStoreHas = function (scope, record) {
  var index = FbmSync.seenStoreIndex(scope, record), prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), highWaterRaw = props.getProperty(prefix + 'HIGH_WATER'), highWater = Number(highWaterRaw || 0), hasBoundary = highWaterRaw !== null && highWaterRaw !== undefined && String(highWaterRaw) !== '';
  // ID cũ hoặc lạ không đủ an toàn để đánh dấu; coi như đã thấy để không suy ra vắng mặt nhầm.
  if (index < 0 || (hasBoundary && index > highWater)) { return true; }
  var hexIndex = Math.floor(index / 4), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
  var value = String(props.getProperty(prefix + shardIndex) || ''), nibble = parseInt(value.charAt(offset) || '0', 16) || 0;
  return (nibble & (1 << (index % 4))) !== 0;
};
FbmSync.seenStoreReader = function (scope) {
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, cache = {}, highWaterRaw = props.getProperty(prefix + 'HIGH_WATER'), highWater = Number(highWaterRaw || 0), hasBoundary = highWaterRaw !== null && highWaterRaw !== undefined && String(highWaterRaw) !== '';
  return function (record) {
    var valueIndex = FbmSync.seenStoreIndex(scope, record);
    if (valueIndex < 0 || (hasBoundary && valueIndex > highWater)) { return true; }
    var hexIndex = Math.floor(valueIndex / 4), shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
    if (cache[shardIndex] === undefined) { cache[shardIndex] = String(props.getProperty(prefix + shardIndex) || ''); }
    var nibble = parseInt(cache[shardIndex].charAt(offset) || '0', 16) || 0;
    return (nibble & (1 << (valueIndex % 4))) !== 0;
  };
};

/** Tạo state rỗng với đủ field để các phiên cũ vẫn đọc được. */
FbmSync.stateDefault = function () {
  return { schemaVersion: FbmSync.STATE_SCHEMA_VERSION, runId: '', origin: 'manual', mode: 'read', scan: 'full', scanPack: '', scheduledScan: '', activitySince: '', requestGap: null, phase: 'idle', entity: '', cursor: {}, activeRequestId: '', loginForceOffered: false, identityTarget: null, lastProgressAt: 0, deadlineAt: 0, session: { customerAuthorized: '', activityAuthorized: '', cookie: '', userId: '', accountUsername: '', accountName: '', lookups: {}, expired: false, identityVerified: false, identitySessionId: '', identityVerifiedAt: 0, sessionId: '', lastHeartbeatAt: 0 }, metadata: { categoryBlocks: [], preflightIssues: [], seen: { customer: {}, activity: {} }, conflictCount: 0, conflictRefresh: null, manualPending: null, sessionGate: null }, counts: FbmSync.countsDefault(), progress: { done: 0, total: 0 }, current: '', message: '', startedAt: 0, updatedAt: 0, lastError: '', lastFailureCode: '', retryable: false, locks: {} };
};

/** Lấy kho state cấp tài liệu, dùng chung giữa các lần gọi GAS. */
/** Hash của lần ghi đang chờ xác nhận; không đưa metadata kỹ thuật vào Sheet. */
FbmSync.pendingPushesRead = function () {
  return FbmSync.documentPropertyJson('FBM_SYNC_PENDING_PUSHES_V1', 'hash chờ xác nhận') || {};
};
FbmSync.pendingPushGet = function (entity, id) {
  return FbmSync.pendingPushesRead()[String(entity || '') + ':' + String(id || '')] || null;
};
FbmSync.pendingPushSet = function (entity, id, value) {
  var key = String(entity || '') + ':' + String(id || ''), all = FbmSync.pendingPushesRead();
  if (value && typeof value === 'object') { all[key] = value; } else { delete all[key]; }
  var pendingWrite = FbmSync.documentPropertySet('FBM_SYNC_PENDING_PUSHES_V1', JSON.stringify(all), 'pending_push');
  if (!pendingWrite.ok) { throw pendingWrite.error; }
  return value || null;
};
FbmSync.pendingPushClear = function (entity, id) { return FbmSync.pendingPushSet(entity, id, null); };

/**
 * Bản ghi đẩy lỗi: `hashes` là hash lúc lỗi, chặn gửi lại khi dữ liệu chưa đổi; `details` chỉ để Sidebar hiển thị, bản đầy đủ nằm ở Log.
 * Ở khóa riêng vì state phiên chỉ 9 KB. Khóa này có trần cố định vì chiều đẩy dừng khi chạm `pushFailuresMax` (`pushFailuresGuard`), chi tiết chỉ giữ `pushFailureDetailsMax` mục mới nhất với lý do cắt ngắn.
 */
FbmSync.PUSH_FAILURES_KEY = 'FBM_SYNC_PUSH_FAILURES_V1';
FbmSync.pushFailuresRead = function () {
  var stored = FbmSync.documentPropertyJson(FbmSync.PUSH_FAILURES_KEY, 'bản ghi đẩy lỗi') || {};
  return { hashes: stored.hashes || {}, details: stored.details || {} };
};
FbmSync.pushFailuresWrite = function (store) {
  var budget = FbmSync.BUDGET, details = {}, keys = Object.keys(store.details || {}).filter(function (key) { return store.hashes[key] !== undefined; });
  keys.slice(-budget.pushFailureDetailsMax).forEach(function (key) { details[key] = Object.assign({}, store.details[key], { reason: String(store.details[key] && store.details[key].reason || '').slice(0, budget.pushFailureReasonChars) }); });
  var write = FbmSync.documentPropertySet(FbmSync.PUSH_FAILURES_KEY, JSON.stringify({ hashes: store.hashes, details: details }), 'push_failures');
  if (!write.ok) { throw write.error; }
};
/** Lỗi mới đưa xuống cuối để `details` luôn giữ các lỗi gần nhất. */
FbmSync.pushFailureAdd = function (key, hash, detail) {
  var store = FbmSync.pushFailuresRead();
  store.hashes[key] = hash;
  delete store.details[key];
  store.details[key] = detail;
  FbmSync.pushFailuresWrite(store);
};
FbmSync.pushFailuresRemove = function (keys) {
  var store = FbmSync.pushFailuresRead(), removed = false;
  (keys || []).forEach(function (key) { if (store.hashes[key] !== undefined || store.details[key] !== undefined) { delete store.hashes[key]; delete store.details[key]; removed = true; } });
  if (removed) { FbmSync.pushFailuresWrite(store); }
};
/** Đọc state và tự bù field thiếu từ mặc định. */
FbmSync.stateRead = function () {
  var fallback = FbmSync.stateDefault();
  var parsed = FbmSync.documentPropertyJson(FbmSync.STATE_KEY, 'state đồng bộ');
  if (!parsed) { return fallback; }
  var metadata = parsed.metadata || {};
  return Object.assign(fallback, parsed, { schemaVersion: Number(parsed.schemaVersion || 1), counts: Object.assign(fallback.counts, parsed.counts || {}), session: Object.assign(fallback.session, parsed.session || {}), metadata: Object.assign(fallback.metadata, metadata, { seen: Object.assign(fallback.metadata.seen, metadata.seen || {}), conflictCount: Number(metadata.conflictCount || 0), preflightIssues: Array.isArray(metadata.preflightIssues) ? metadata.preflightIssues : [], manualPending: metadata.manualPending || null }), progress: Object.assign(fallback.progress, parsed.progress || {}), locks: parsed.locks || {} });
};
/** Ghi state, cập nhật timestamp và giữ cấu trúc nhất quán. */
FbmSync.stateWrite = function (state) {
  var next = Object.assign(FbmSync.stateDefault(), state || {});
  next.session = Object.assign(FbmSync.stateDefault().session, next.session || {});
  next.session.lookups = Object.assign({}, FbmSync.stateDefault().session.lookups, next.session.lookups || {});
  next.metadata = Object.assign(FbmSync.stateDefault().metadata, next.metadata || {});
  delete next.metadata.pushSucceeded;
  delete next.version;
  next.metadata.seen = Object.assign(FbmSync.stateDefault().metadata.seen, next.metadata.seen || {});
  // State cũ còn mảng `conflicts` thì bỏ ở lần ghi kế tiếp; hàng đợi xung đột nay đọc từ Sheet (FBM-024).
  next.metadata.conflictCount = Number(next.metadata.conflictCount || 0);
  delete next.metadata.conflicts;
  // State ghi trước FBM-042 còn bản sao map Category; giữ lại thì mọi lần ghi (kể cả đóng phiên lỗi) đều vượt 9 KB và Sidebar kẹt.
  delete next.metadata.categoryGate;
  next.metadata.manualPending = next.metadata.manualPending || null;
  // Trường đã bỏ: dấu vết callback không còn ai ghi; trần và bộ đếm thử lại đọc vì lỗi đọc dừng lượt, lượt sau chạy lại.
  delete next.metadata.callbackTrace;
  delete next.retryLimit;
  delete next.retryCount;
  // Bản xem trước và kết quả preflight đầy đủ không ở trong state: state chỉ giữ thứ cần để chạy tiếp, vì một khóa kho chỉ chứa 9 KB.
  delete next.metadata.preview;
  delete next.metadata.preflight;
  next.counts = Object.assign(FbmSync.stateDefault().counts, next.counts || {});
  next.progress = Object.assign(FbmSync.stateDefault().progress, next.progress || {});
  next.updatedAt = Date.now();
  // Cửa ghi state là chỗ duy nhất thấy mọi đường kết thúc phiên, nên sổ bước nghiệp vụ được đóng tại đây chứ không rải ở từng lệnh.
  if (FbmSync.TERMINAL_PHASES.indexOf(String(next.phase || '')) >= 0 && typeof FbmSync.businessFinishOpenSteps === 'function') {
    FbmSync.businessFinishOpenSteps(next, next.phase, { error: String(next.lastError || next.message || '') });
  }
  var stateWrite = FbmSync.documentPropertySet(FbmSync.STATE_KEY, JSON.stringify(next), 'state');
  if (stateWrite.ok) { return next; }
  // Đóng phiên mà ghi hỏng thì phiên đứng mãi ở pha đang chạy và màn đồng bộ kẹt (FBM-044); lát giữa chừng thì vẫn ném để phiên chuyển sang lỗi.
  var minimal = FbmSync.TERMINAL_PHASES.indexOf(String(next.phase || '')) >= 0 ? FbmSync.stateWriteMinimal(next, stateWrite) : null;
  if (!minimal) { throw stateWrite.error; }
  return minimal;
};
FbmSync.STATE_MINIMAL_TEXT_LIMIT = 1000;
FbmSync.STATE_MINIMAL_NOTE = ' (Không lưu được đầy đủ trạng thái phiên; đã lưu bản rút gọn, xem Log.)';
/** Bản state đóng phiên chỉ gồm phase, lý do và (nếu vừa) cursor/khóa ghi; preview, session, sổ bước bị bỏ vì chính chúng làm phình state. */
FbmSync.stateWriteMinimal = function (full, failure) {
  var cut = function (text) { return String(text || '').slice(0, FbmSync.STATE_MINIMAL_TEXT_LIMIT); };
  var base = { version: full.version, runId: full.runId, origin: full.origin, mode: full.mode, scan: full.scan, phase: full.phase, entity: full.entity, startedAt: full.startedAt, updatedAt: full.updatedAt, retryable: false, lastFailureCode: String(full.lastFailureCode || failure.code || ''), lastError: cut(full.lastError), message: cut(full.message || full.lastError) + FbmSync.STATE_MINIMAL_NOTE, metadata: { conflictCount: Number(full.metadata && full.metadata.conflictCount || 0) } };
  var tiers = [Object.assign({}, base, { cursor: full.cursor || {}, locks: full.locks || {} }), base];
  for (var i = 0; i < tiers.length; i += 1) {
    if (!FbmSync.documentPropertySet(FbmSync.STATE_KEY, JSON.stringify(tiers[i]), 'state_minimal').ok) { continue; }
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_write_minimal', outcome: typeof LOG_WARN === 'undefined' ? 'warn' : LOG_WARN, reason: 'Không lưu được đầy đủ trạng thái phiên (' + String(failure.code || '') + '); đã lưu bản rút gọn để đóng phiên ở "' + String(full.phase || '') + '"' + (i ? ', bỏ cả con trỏ và khóa ghi.' : '.'), detail: { runId: String(full.runId || ''), phase: String(full.phase || '') } }); }
    return FbmSync.stateRead();
  }
  return null;
};
// Lỗi kho state: gặp ở lần đọc status thì người dùng không tự thoát được, nên GAS mở nút "Đặt lại phiên đồng bộ" (FBM-044).
FbmSync.STATE_STORAGE_CODES = ['FBM_DOCUMENT_PROPERTIES_READ_FAILED', 'FBM_DOCUMENT_PROPERTY_CORRUPT', 'FBM_DOCUMENT_PROPERTIES_QUOTA', 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED'];
FbmSync.stateStorageError = function (error) { return !!error && FbmSync.STATE_STORAGE_CODES.indexOf(String(error.code || '')) >= 0; };
/** Snapshot thay cho status khi kho state hỏng: ghi Log và trả lý do kèm cờ mở nút đặt lại. */
FbmSync.stateStuckView = function (error) {
  var reason = String(error && error.message || error || '');
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_stuck', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: reason, detail: { code: String(error && error.code || '') } }); }
  return { ok: false, code: 'SYNC_STATE_STUCK', failureCode: String(error && error.code || ''), resetOffered: true, runId: '', phase: 'error', label: 'Có lỗi', message: 'Màn đồng bộ đang kẹt: ' + reason, lastError: reason, counts: {} };
};
/**
 * Lối thoát cuối khi kho state hỏng (FBM-044): chỉ xóa state phiên. Hash chờ xác nhận ở khóa riêng và trạng thái "đang đẩy" trên Sheet vẫn còn,
 * nên lệnh tạo mất phản hồi vẫn được tra lại ở phiên sau, không tạo trùng. Phiên còn chạy bình thường thì từ chối, người dùng dùng "Dừng đồng bộ".
 */
FbmSync.stateReset = function (now) {
  var current = null, unreadable = null;
  // Không đọc được state chính là lý do cần đặt lại, nên lỗi đọc không chặn việc xóa; nó đi vào dòng Log bên dưới.
  try { current = FbmSync.stateRead(); } catch (readError) { unreadable = readError; }
  var age = current ? Number(now || Date.now()) - Number(current.updatedAt || current.startedAt || 0) : 0;
  if (current && FbmSync.ACTIVE_PHASES.indexOf(String(current.phase || '')) >= 0 && age <= FbmSync.STALE_RUN_MS) {
    return { ok: false, code: 'SYNC_RESET_RUNNING', message: 'Phiên đồng bộ đang chạy bình thường nên không đặt lại; hãy bấm "Dừng đồng bộ" nếu muốn dừng.' };
  }
  try { FbmSync.props().deleteProperty(FbmSync.STATE_KEY); } catch (deleteError) {
    var failure = new Error('Không xóa được trạng thái phiên đồng bộ; thử lại sau ít phút.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
    throw failure;
  }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_reset', outcome: typeof LOG_WARN === 'undefined' ? 'warn' : LOG_WARN, reason: 'Người dùng đặt lại phiên đồng bộ bị kẹt' + (unreadable ? ' (state không đọc được: ' + String(unreadable.message || unreadable) + ')' : ' (phiên ' + String(current.runId || '') + ' ở "' + String(current.phase || '') + '")') + '; dữ liệu Sheet và FBM không đổi.', detail: { runId: current ? String(current.runId || '') : '', phase: current ? String(current.phase || '') : '' } }); }
  return { ok: true };
};
/** Ghi một phần state mà không làm mất field đang có. */
FbmSync.statePatch = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };
/** Mở phiên mới và xóa cursor/đếm của phiên trước. */
FbmSync.stateStart = function (entity, phase, total) {
  var now = Date.now(), previous = FbmSync.stateRead(), userLocks = {}, freshSession = FbmSync.stateDefault().session;
  Object.keys(previous.locks || {}).forEach(function (key) { if (previous.locks[key] && previous.locks[key].owner === 'user') { userLocks[key] = previous.locks[key]; } });
  ['customer', 'activity', 'activity_bulk'].forEach(function (scope) { FbmSync.seenStoreClear(scope); });
  if (typeof FbmSync.previewClear === 'function') { FbmSync.previewClear(); }
  // Phiên cũ chưa tới phase kết thúc mà bị phiên mới thay thì các bước của nó phải được đóng trước khi metadata bị xóa.
  if (typeof FbmSync.businessFinishOpenSteps === 'function') { FbmSync.businessFinishOpenSteps(previous, 'paused', { error: 'Phiên mới đã bắt đầu thay phiên này.' }); }
  // Mỗi run phải xác nhận phiên sống lại; cookie và marker của run trước không
  // được dùng làm bằng chứng live cho request đầu tiên của run mới.
  // Số xung đột phản ánh các dòng Sheet đang chờ quyết nên đi theo sang phiên mới; preflight đếm lại từ Sheet.
  var next = FbmSync.stateWrite({ runId: now.toString(36), entity: entity || '', phase: phase || 'checking_session', cursor: {}, session: freshSession, counts: Object.assign(FbmSync.countsDefault(), { total: Number(total) || 0 }), metadata: { conflictCount: Number(previous.metadata && previous.metadata.conflictCount || 0) }, current: '', message: '', startedAt: now, updatedAt: now, lastError: '', lastFailureCode: '', retryable: false, locks: userLocks });
  return next;
};
/**
 * Thu hồi state đang chạy mà không còn bên gọi; không gửi lại lệnh ghi đang mở.
 * Lượt dở do bản cũ tạo (thiếu `schemaVersion` hiện hành) cũng dừng tại đây, kể cả khi đang chờ duyệt: cursor cũ không được chạy tiếp mù; dấu chờ đẩy và hash nằm ở khóa riêng nên còn nguyên cho lượt chạy lại.
 */
FbmSync.recoverStaleRun = function (state, now) {
  var current = state || FbmSync.stateRead(), at = Number(now || Date.now());
  var legacy = Number(current.schemaVersion || 1) < FbmSync.STATE_SCHEMA_VERSION;
  if (!current.runId || FbmSync.ACTIVE_PHASES.concat(legacy ? ['awaiting_approval'] : []).indexOf(String(current.phase || '')) < 0) { return { state: current, recovered: false }; }
  var updated = Number(current.updatedAt || current.startedAt || 0), age = updated ? at - updated : FbmSync.STALE_RUN_MS + 1;
  // Request đang bay còn trong hạn ngân sách (một lô có thể chạy lâu hơn mốc chung) thì chưa phải phiên kẹt.
  if (!legacy && (age <= FbmSync.STALE_RUN_MS || (current.activeRequestId && at < Number(current.deadlineAt || 0)))) { return { state: current, recovered: false }; }
  var cursor = current.cursor || {}, waitingWrite = cursor.kind === 'push_wait';
  var message = legacy
    ? (waitingWrite ? 'Phiên ghi FBM đang dở được tạo bởi bản cũ; đã dừng và không tự ghi lại để tránh trùng dữ liệu. Hãy chạy lại lượt.' : 'Phiên đồng bộ đang dở được tạo bởi bản cũ; đã dừng, hãy chạy lại lượt.')
    : waitingWrite
    ? 'Phiên ghi FBM không nhận được phản hồi quá thời gian an toàn; không tự ghi lại để tránh trùng dữ liệu.'
    : 'Phiên đồng bộ không nhận được phản hồi quá thời gian an toàn; đã tự dừng, có thể chạy lại.';
  current.phase = 'error';
  current.schemaVersion = FbmSync.STATE_SCHEMA_VERSION;
  current.lastFailureCode = legacy ? 'SYNC_STATE_MIGRATED' : (waitingWrite ? 'SYNC_STALE_WRITE' : 'SYNC_STALE_RUN');
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
/**
 * Chuyển phiên đang chạy sang lỗi, giữ cursor và khóa ghi như thu hồi phiên treo. Gọi khi một lát ném exception hoặc client báo lỗi,
 * để phiên không đứng ở phase đang chạy chờ 2 phút mới bị thu hồi. Phiên đã kết thúc thì không đổi gì.
 */
FbmSync.stateFailRun = function (reason, code) {
  var state = FbmSync.stateRead();
  if (!state.runId || FbmSync.ACTIVE_PHASES.concat(['awaiting_approval']).indexOf(String(state.phase || '')) < 0) { return { state: state, failed: false }; }
  var step = typeof FbmSync.businessFailingStep === 'function' ? FbmSync.businessFailingStep(state) : '';
  var label = step && typeof FbmSync.businessStepDefinition === 'function' ? FbmSync.businessStepDefinition(step).label : 'phiên đồng bộ';
  state.phase = 'error';
  state.lastFailureCode = String(code || 'FBM_SYNC_EXCEPTION');
  state.retryable = false;
  state.lastError = 'Lỗi khi ' + label + ': ' + String(reason || 'không rõ nguyên nhân');
  state.message = state.lastError;
  return { state: FbmSync.stateWrite(state), failed: true };
};
/** Khóa một record khi Sidebar đang sửa hoặc sync chuẩn bị ghi. */
FbmSync.lockRecord = function (entity, id, revision, owner) {
  return FbmSync.stateWrite(FbmSync.lockRecordIn(FbmSync.stateRead(), entity, id, revision, owner));
};
/** Khóa trên object state mà phiên đang giữ: đọc lại kho thì hàm gọi vẫn cầm object cũ, lần ghi sau của nó đè mất cursor `push_wait` (FBM-045). */
FbmSync.lockRecordIn = function (state, entity, id, revision, owner) {
  state.locks = state.locks || {};
  state.locks[String(entity) + ':' + String(id)] = { revision: String(revision || ''), owner: owner || 'sync', at: Date.now() };
  return state;
};
/** Bỏ khóa record sau khi kết thúc chỉnh sửa. */
FbmSync.unlockRecord = function (entity, id) {
  var state = FbmSync.stateRead();
  delete state.locks[String(entity) + ':' + String(id)];
  return FbmSync.stateWrite(state);
};
/** Kiểm tra nhanh record có đang bị khóa hay không. */
FbmSync.isRecordLocked = function (entity, id) { var state = FbmSync.stateRead(); return !!state.locks[String(entity) + ':' + String(id)]; };
