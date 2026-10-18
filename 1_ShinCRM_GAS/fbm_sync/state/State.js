/** Trạng thái bền vững của phiên sync trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.STATE_KEY = 'FBM_SYNC_STATE_V1';
// Request FBM thuong ket thuc trong vai giay; state im qua lau la phien bi bo roi.
FbmSync.STALE_RUN_MS = 2 * 60 * 1000;
/** Phiên bản logic của state trong cùng khóa kho. State thiếu số này là bản cũ: lượt đang dở của nó bị dừng ở `recoverStaleRun`, không chạy tiếp mù trên cấu trúc cũ. */
FbmSync.STATE_SCHEMA_VERSION = 2;
FbmSync.ACTIVE_PHASES = ['checking_session', 'waiting_session', 'pull_customer', 'pull_activity', 'reconcile', 'push'];
FbmSync.TERMINAL_PHASES = ['done', 'error', 'paused', 'conflict'];
/** Lượt còn dở (đang chạy hoặc chờ chấp thuận). Lượt đã kết thúc ở bất kỳ trạng thái cuối nào, kể cả tạm dừng vì tự đăng nhập bị từ chối, không chặn lịch nền mở lượt mới. */
FbmSync.runInProgress = function (state) { return !!(state && state.runId) && ['idle'].concat(FbmSync.TERMINAL_PHASES).indexOf(String(state.phase || '')) < 0; };
FbmSync.DONE_MESSAGE = 'Đồng bộ hoàn tất.';
/** Quyền ghi được tách theo đích; mode không được kiêm thêm một cờ ẩn ngoài UI. */
/** Chế độ chạy hợp lệ từ lựa chọn của người dùng hoặc lịch nền; giá trị lạ về `read` (chỉ lấy về), không bao giờ thành chế độ có đẩy. */
FbmSync.modeOf = function (mode) { return mode === 'write' || mode === 'push' || mode === 'check' ? mode : 'read'; };
FbmSync.canWriteSheet = function (mode) { return mode === 'read' || mode === 'write'; };
FbmSync.canWriteFbm = function (mode) { return mode === 'push' || mode === 'write'; };
/**
 * Bộ đếm của một lượt, chỗ định nghĩa duy nhất. `succeeded` là bản ghi ghi vào Sheet từ FBM, `pushed` là bản ghi FBM đã đọc xác nhận sau khi đẩy; hai số tách riêng vì Sidebar hiện riêng.
 * `missingCustomer`/`missingActivity` và `transferredCustomer`/`transferredActivity` là bản ghi cửa ghi gắn cờ "không thấy bên FBM" hoặc "đã chuyển cho người khác" trong lượt.
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
FbmSync.countsDefault = function () { return { total: 0, completed: 0, succeeded: 0, pushed: 0, missingCustomer: 0, missingActivity: 0, transferredCustomer: 0, transferredActivity: 0, error: 0, conflict: 0, skipped: 0 }; };
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
  var failure = null, result;
  try { result = work(); } catch (error) { failure = error; throw error; } finally {
    if (typeof FbmSync.recordIssuesFlush === 'function') { FbmSync.recordIssuesFlush(); }
    if (failure) { FbmSync.controlFailRun(failure); }
  }
  return FbmSync.runLeftOpenClose(result);
};
/**
 * Lát trả lời không kèm request trong khi lượt còn ở phase đang chạy và không request nào đang chờ: không ai còn đẩy lượt đi tiếp (Extension hết việc, Sidebar không có gì để gửi).
 * Đóng lượt ngay ở đây, có Log ghi rõ lỗi thuộc GAS, thay vì để lượt treo tới lần hỏi nền sau rồi bị ghi nhầm là Extension bỏ dở.
 */
FbmSync.runLeftOpenClose = function (result) {
  if (!result || typeof result !== 'object' || result.request) { return result; }
  var state = FbmSync.stateRead();
  if (!state.runId || state.activeRequestId || FbmSync.ACTIVE_PHASES.indexOf(String(state.phase || '')) < 0) { return result; }
  var phase = String(state.phase || ''), cursorKind = String(state.cursor && state.cursor.kind || '');
  FbmSync.stateFailRun('GAS trả lời hết việc trong khi lượt vẫn mở (phase ' + phase + ', cursor ' + (cursorKind || 'trống') + '); đã đóng lượt để lịch nền chạy lại ở lần hỏi sau.', 'RUN_LEFT_OPEN');
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'run_left_open', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: 'Lỗi GAS: trả lời hết việc trong khi lượt vẫn mở (phase ' + phase + ', cursor ' + (cursorKind || 'trống') + '); đã đóng lượt.' }); }
  return Object.assign({}, result, { ok: false, code: 'RUN_LEFT_OPEN', status: FbmSync.statusView(), error: FbmSync.stateRead().lastError });
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
  return { schemaVersion: FbmSync.STATE_SCHEMA_VERSION, runId: '', origin: 'manual', mode: 'read', scan: 'full', scanPack: '', scheduledScan: '', chain: null, requestGap: null, phase: 'idle', entity: '', cursor: {}, activeRequestId: '', loginForceOffered: false, identityTarget: null, lastProgressAt: 0, deadlineAt: 0, session: { customerAuthorized: '', activityAuthorized: '', cookie: '', userId: '', accountUsername: '', accountName: '', lookups: {}, expired: false, identityVerified: false, identitySessionId: '', identityVerifiedAt: 0, sessionId: '', lastHeartbeatAt: 0 }, metadata: { categoryBlocks: [], preflightIssues: [], conflictCount: 0, conflictRefresh: null, manualPending: null, sessionGate: null }, counts: FbmSync.countsDefault(), progress: { done: 0, total: 0 }, current: '', message: '', startedAt: 0, updatedAt: 0, lastError: '', lastFailureCode: '', retryable: false };
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
  var read = Object.assign(fallback, parsed, { schemaVersion: Number(parsed.schemaVersion || 1), counts: Object.assign(fallback.counts, parsed.counts || {}), session: Object.assign(fallback.session, parsed.session || {}), metadata: Object.assign(fallback.metadata, metadata, { conflictCount: Number(metadata.conflictCount || 0), preflightIssues: Array.isArray(metadata.preflightIssues) ? metadata.preflightIssues : [], manualPending: metadata.manualPending || null }), progress: Object.assign(fallback.progress, parsed.progress || {}) });
  // Khóa bản ghi cũ trong state đã chuyển sang sổ bận của lõi; bản state cũ còn mang thì bỏ, không ai đọc nữa.
  delete read.locks;
  if (typeof FbmSync.logContextNote === 'function') { FbmSync.logContextNote(read); }
  FbmSync.requestWatchNote(read);
  return read;
};
/** Ghi state, cập nhật timestamp và giữ cấu trúc nhất quán. */
FbmSync.stateWrite = function (state) {
  var next = Object.assign(FbmSync.stateDefault(), state || {});
  next.session = Object.assign(FbmSync.stateDefault().session, next.session || {});
  next.session.lookups = Object.assign({}, FbmSync.stateDefault().session.lookups, next.session.lookups || {});
  next.metadata = Object.assign(FbmSync.stateDefault().metadata, next.metadata || {});
  delete next.metadata.pushSucceeded;
  delete next.version;
  // State cũ còn bản sao tập "đã thấy"; tập này nay nằm trong kho riêng theo lượt.
  delete next.metadata.seen;
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
  if (typeof FbmSync.logContextNote === 'function') { FbmSync.logContextNote(next); }
  FbmSync.requestWatchCheck(next);
  var stateWrite = FbmSync.documentPropertySet(FbmSync.STATE_KEY, JSON.stringify(next), 'state');
  if (stateWrite.ok) { FbmSync.requestWatchNote(next); return next; }
  // Đóng phiên mà ghi hỏng thì phiên đứng mãi ở pha đang chạy và màn đồng bộ kẹt (FBM-044); lát giữa chừng thì vẫn ném để phiên chuyển sang lỗi.
  var minimal = FbmSync.TERMINAL_PHASES.indexOf(String(next.phase || '')) >= 0 ? FbmSync.stateWriteMinimal(next, stateWrite) : null;
  if (!minimal) { throw stateWrite.error; }
  return minimal;
};
/**
 * Luật chung cho mọi request GAS phát cho Extension (Giữ phiên, lượt nền, lượt bấm tay, đăng nhập): request đã quá hạn chờ mà rời khỏi state không qua trả lời thì có một dòng Log lỗi.
 * Đặt ở cửa đọc/ghi state vì mọi đường bỏ request (cấp request mới đè lên, mở lượt mới, đóng lượt, dừng) đều phải ghi state; đường mới thêm sau này cũng không lọt.
 * Chỉ nhớ trong RAM của lần gọi: request đang chờ theo lần đọc/ghi gần nhất, các request đã được trả lời (kể cả trả lời muộn) và hộp đen Extension gửi kèm lần hỏi nền. Không tốn thêm lần đọc kho.
 * Bỏ request khi còn trong hạn (dừng, cổng phiên chặn) là GAS chủ động, không ghi ở đây.
 */
FbmSync.requestWatch = { open: null, answered: {}, trail: undefined };
FbmSync.requestWatchNote = function (state) {
  // Bước và lượt lấy lúc request mới xuất hiện: về sau GAS có thể đổi cursor (chọn tiến trình, đóng lượt) khi request cũ vẫn nằm đó.
  var id = String(state && state.activeRequestId || ''), seen = FbmSync.requestWatch.open && FbmSync.requestWatch.open.id === id ? FbmSync.requestWatch.open : null;
  FbmSync.requestWatch.open = id ? { id: id, deadlineAt: Number(state.deadlineAt || 0), kind: seen ? seen.kind : String(state.cursor && state.cursor.kind || ''), runId: seen ? seen.runId : String(state.runId || '') } : null;
};
/** Cổng duy nhất nhận ra response thuộc request đang chờ; đánh dấu đã trả lời để luật request quá hạn không báo nhầm trả lời muộn. */
FbmSync.requestAnswered = function (state, responseRequestId) {
  var id = String(state && state.activeRequestId || '');
  if (!id || !responseRequestId || String(responseRequestId) !== id) { return false; }
  FbmSync.requestWatch.answered[id] = true;
  return true;
};
/** Hộp đen Extension gửi kèm lần hỏi nền; chỉ lần gọi đến từ Extension mới có, nên dòng Log của lượt Sidebar không nhắc hộp đen. */
FbmSync.requestWatchTrail = function (trail) { FbmSync.requestWatch.trail = trail || null; };
FbmSync.requestWatchCheck = function (next, now) {
  var open = FbmSync.requestWatch.open, at = Number(now || Date.now());
  if (!open || String(next && next.activeRequestId || '') === open.id || FbmSync.requestWatch.answered[open.id] || at < open.deadlineAt) { return; }
  FbmSync.requestWatch.answered[open.id] = true;
  if (typeof logEvent !== 'function') { return; }
  var trail = FbmSync.requestWatch.trail, overdue = open.deadlineAt ? Math.max(0, Math.round((at - open.deadlineAt) / 60000)) : 0;
  logEvent({ source: 'fbm_sync', action: 'request_unanswered', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: open.runId, reason: 'Request FBM ' + open.id + (open.kind ? ' (bước ' + open.kind + ')' : '') + ' không nhận được trả lời từ Extension, đã quá hạn chờ ' + overdue + ' phút; GAS bỏ request này.' + (trail !== undefined ? ' ' + FbmSync.extensionTrailText(trail, at) : ''), detail: { code: 'REQUEST_UNANSWERED', requestId: open.id, kind: open.kind, runId: open.runId, extensionTrail: trail !== undefined ? FbmSync.extensionTrailSafe(trail) : undefined } });
};
FbmSync.STATE_MINIMAL_TEXT_LIMIT = 1000;
FbmSync.STATE_MINIMAL_NOTE = ' (Không lưu được đầy đủ trạng thái phiên; đã lưu bản rút gọn, xem Log.)';
/** Bản state đóng phiên chỉ gồm phase, lý do và (nếu vừa) cursor/khóa ghi; preview, session, sổ bước bị bỏ vì chính chúng làm phình state. */
FbmSync.stateWriteMinimal = function (full, failure) {
  var cut = function (text) { return String(text || '').slice(0, FbmSync.STATE_MINIMAL_TEXT_LIMIT); };
  var base = { version: full.version, runId: full.runId, origin: full.origin, mode: full.mode, scan: full.scan, phase: full.phase, entity: full.entity, startedAt: full.startedAt, updatedAt: full.updatedAt, retryable: false, lastFailureCode: String(full.lastFailureCode || failure.code || ''), lastError: cut(full.lastError), message: cut(full.message || full.lastError) + FbmSync.STATE_MINIMAL_NOTE, metadata: { conflictCount: Number(full.metadata && full.metadata.conflictCount || 0) } };
  var tiers = [Object.assign({}, base, { cursor: full.cursor || {} }), base];
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
/**
 * Mở phiên mới và xóa cursor/đếm của phiên trước.
 * Nguồn, chế độ và kiểu quét ghi ngay ở lần ghi đầu: gán sau vào bản trong RAM thì ai đọc lại kho giữa chừng (preflight, nhãn lượt của Log) thấy phiên mặc định `manual`/`full`.
 */
FbmSync.stateStart = function (entity, phase, total, identity) {
  var who = identity || {};
  var now = Date.now(), previous = FbmSync.stateRead(), freshSession = FbmSync.stateDefault().session;
  // Lượt mới nhả mọi bản ghi lượt trước còn giữ trong sổ bận (kể cả lượt kết thúc `SYNC_STALE_WRITE`): mỗi lúc chỉ một lượt đồng bộ chạy.
  recordGateReleaseOwner(FbmSync.RECORD_HOLDER);
  ['customer', 'activity', 'activity_bulk'].forEach(function (scope) { FbmSync.seenStoreClear(scope); });
  // Danh sách đọc chỉ sống trong một lượt: lượt trước hỏng giữa chừng cũng không để lại mã hay ghi chú nào cho lượt này.
  if (typeof FbmSync.readListClear === 'function') { FbmSync.readListClear(); }
  if (typeof FbmSync.previewClear === 'function') { FbmSync.previewClear(); }
  // Phiên cũ chưa tới phase kết thúc mà bị phiên mới thay thì các bước của nó phải được đóng trước khi metadata bị xóa.
  if (typeof FbmSync.businessFinishOpenSteps === 'function') { FbmSync.businessFinishOpenSteps(previous, 'paused', { error: 'Phiên mới đã bắt đầu thay phiên này.' }); }
  // Mỗi run phải xác nhận phiên sống lại; cookie và marker của run trước không
  // được dùng làm bằng chứng live cho request đầu tiên của run mới.
  // Số xung đột phản ánh các dòng Sheet đang chờ quyết nên đi theo sang phiên mới; preflight đếm lại từ Sheet.
  var next = FbmSync.stateWrite({ runId: now.toString(36), entity: entity || '', phase: phase || 'checking_session', cursor: {}, session: freshSession, counts: Object.assign(FbmSync.countsDefault(), { total: Number(total) || 0 }), metadata: { conflictCount: Number(previous.metadata && previous.metadata.conflictCount || 0) }, chain: previous.chain || null, origin: who.origin || 'manual', mode: who.mode || 'read', scan: who.scan || 'full', current: '', message: '', startedAt: now, updatedAt: now, lastError: '', lastFailureCode: '', retryable: false });
  return next;
};
/**
 * Thu hồi state đang chạy mà không còn bên gọi; không gửi lại lệnh ghi đang mở.
 * Lượt dở do bản cũ tạo (thiếu `schemaVersion` hiện hành) cũng dừng tại đây, kể cả khi đang chờ duyệt: cursor cũ không được chạy tiếp mù; dấu chờ đẩy và hash nằm ở khóa riêng nên còn nguyên cho lượt chạy lại.
 * `abandoned`: lần hỏi nền gặp lượt dở không còn request chờ trong hạn thì kết thúc ngay, không đợi mốc 2 phút, vì lượt nền không bao giờ được nối lại qua lần hỏi (09/02 Phần 3).
 */
FbmSync.recoverStaleRun = function (state, now, options) {
  var current = state || FbmSync.stateRead(), at = Number(now || Date.now()), abandoned = !!(options && options.abandoned);
  var legacy = Number(current.schemaVersion || 1) < FbmSync.STATE_SCHEMA_VERSION;
  if (!current.runId || FbmSync.ACTIVE_PHASES.concat(legacy ? ['awaiting_approval'] : []).indexOf(String(current.phase || '')) < 0) { return { state: current, recovered: false }; }
  var updated = Number(current.updatedAt || current.startedAt || 0), age = updated ? at - updated : FbmSync.STALE_RUN_MS + 1;
  // Request đang bay còn trong hạn ngân sách (một lô có thể chạy lâu hơn mốc chung) thì chưa phải phiên kẹt.
  var inFlight = !!current.activeRequestId && at < Number(current.deadlineAt || 0);
  if (!legacy && (inFlight || (!abandoned && age <= FbmSync.STALE_RUN_MS))) { return { state: current, recovered: false }; }
  var cursor = current.cursor || {}, waitingWrite = cursor.kind === 'push_wait';
  var message = legacy
    ? (waitingWrite ? 'Phiên ghi FBM đang dở được tạo bởi bản cũ; đã dừng và không tự ghi lại để tránh trùng dữ liệu. Hãy chạy lại lượt.' : 'Phiên đồng bộ đang dở được tạo bởi bản cũ; đã dừng, hãy chạy lại lượt.')
    : waitingWrite
    ? 'Phiên ghi FBM không nhận được phản hồi quá thời gian an toàn; không tự ghi lại để tránh trùng dữ liệu.'
    : abandoned
    ? 'Lượt đồng bộ trước bị bỏ dở (không còn request nào chờ phản hồi); đã kết thúc, lượt mới chạy lại từ đầu.'
    : 'Phiên đồng bộ không nhận được phản hồi quá thời gian an toàn; đã tự dừng, có thể chạy lại.';
  current.phase = 'error';
  current.schemaVersion = FbmSync.STATE_SCHEMA_VERSION;
  current.lastFailureCode = legacy ? 'SYNC_STATE_MIGRATED' : (waitingWrite ? 'SYNC_STALE_WRITE' : abandoned ? 'SYNC_ABANDONED_RUN' : 'SYNC_STALE_RUN');
  current.retryable = false;
  current.lastError = message;
  current.message = message;
  // Lượt mất phản hồi khi đang chờ lệnh ghi vẫn giữ bản ghi trong sổ bận để người dùng kiểm tra trên FBM trước; lượt kẹt khác thì nhả.
  if (!waitingWrite) { recordGateReleaseOwner(FbmSync.RECORD_HOLDER); }
  var written = FbmSync.stateWrite(current);
  // Lượt bị thu hồi có thể không còn bước nào đang mở để tự ghi Log kết thúc, nên ghi riêng một dòng: không có lỗi im lặng.
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'stale_run', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(current.runId || ''), reason: message, detail: { code: current.lastFailureCode, runId: String(current.runId || ''), cursor: String(cursor.kind || '') } }); }
  return { state: written, recovered: true, waitingWrite: waitingWrite };
};
/** Tên bước của hộp đen Extension. Bước lạ (Extension bản khác) vẫn được ghi nhưng không dịch, để không đoán bừa. */
FbmSync.EXTENSION_TRAIL_STAGES = {
  gas_request_received: 'đã nhận request từ GAS, chưa gửi sang tab FBM',
  fbm_tab_preparing: 'đang chuẩn bị tab FBM (chờ tab tải xong và có bộ chạy request)',
  fbm_tab_reloading: 'tab FBM không phản hồi, Extension đang tự tải lại tab',
  fbm_tab_sent: 'đã gửi request sang tab FBM, chưa nhận lại kết quả',
  fbm_tab_replied: 'tab FBM đã trả kết quả, chưa gửi về GAS',
  gas_response_sent: 'đã gửi kết quả về GAS, chưa nhận trả lời',
  failure_sent: 'đang báo lỗi vận chuyển về GAS',
  chain_finished: 'Extension đã chạy hết lượt vì GAS trả lời không còn request tiếp',
  gas_reply_failed: 'GAS trả lời lỗi hoặc Extension không gọi được GAS, Extension dừng lượt'
};
/** Chỉ giữ tên bước, mã request, số hop và mốc giờ từ hộp đen: Extension là nguồn ngoài, không chép nguyên văn vào Log. */
FbmSync.extensionTrailSafe = function (trail) {
  if (!trail || typeof trail !== 'object') { return null; }
  return { stage: String(trail.stage || '').slice(0, 40), requestId: String(trail.requestId || '').slice(0, 80), hop: Number(trail.hop || 0), at: Number(trail.at || 0), workerStartedAt: Number(trail.workerStartedAt || 0), currentWorkerStartedAt: Number(trail.currentWorkerStartedAt || 0), code: String(trail.code || '').replace(/[^A-Za-z0-9_ .:-]/g, '').slice(0, 60) };
};
/**
 * Câu tiếng người cho dòng Log request không có trả lời: Extension dừng ở bước nào, và phần chạy nền của nó có khởi động lại sau bước đó không.
 * Phần chạy nền ngủ rồi khởi động lại giữa hai nhịp là bình thường; chỉ khi bước cuối nằm giữa lượt thì khởi động lại mới nghĩa là lượt bị cắt, và nguyên nhân có thể là Chrome tắt hoặc người dùng tải lại Extension, nên không quy cho một bên.
 */
FbmSync.extensionTrailText = function (trail, now) {
  var t = FbmSync.extensionTrailSafe(trail);
  if (!t || !t.stage) { return 'Hộp đen Extension: không có (Extension bản cũ hoặc chưa ghi được bước nào).'; }
  var ago = t.at ? Math.max(0, Math.round((Number(now || Date.now()) - t.at) / 60000)) : -1;
  var text = 'Hộp đen Extension: bước cuối' + (ago >= 0 ? ' (cách đây ' + ago + ' phút)' : '') + ' là ' + (FbmSync.EXTENSION_TRAIL_STAGES[t.stage] || t.stage) + (t.requestId ? ', request ' + t.requestId : '') + '.';
  if (t.stage === 'chain_finished') { return text + ' Lượt còn mở là lỗi phía GAS, không phải Extension bỏ dở.'; }
  if (t.code) { text += (t.stage === 'fbm_tab_preparing' ? ' Trạng thái tab lúc tìm thấy: ' : ' Mã lỗi: ') + t.code + '.'; } else if (t.stage === 'gas_reply_failed') { text += ' Mã lỗi: không rõ.'; }
  if (t.stage === 'gas_reply_failed') { return text; }
  if (t.workerStartedAt && t.currentWorkerStartedAt) {
    text += t.currentWorkerStartedAt > t.workerStartedAt ? ' Phần chạy nền của Extension đã khởi động lại sau bước đó nên lượt bị cắt giữa chừng (Chrome tắt phần chạy nền hoặc Extension được tải lại).' : ' Phần chạy nền của Extension vẫn chạy liền từ bước đó, không khởi động lại.';
  }
  return text;
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
  if (typeof FbmSync.readListClear === 'function') { FbmSync.readListClear(); }
  return { state: FbmSync.stateWrite(state), failed: true };
};
