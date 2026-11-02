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
// Apps Script giới hạn một giá trị DocumentProperties khoảng 9 KB: chặn trước khi gọi setProperty để không đẩy một JSON dở dang vào kho.
// Ghi hỏng thì ném lỗi có mã kèm `detail`; không tự ghi Log và không trả kết quả để bên gọi bỏ qua: người điều phối bắt được lỗi thì ghi Log, không bắt thì `runEntryPoint` ghi.
FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT = 9000;
FbmSync.documentPropertySet = function (key, value, context) {
  var text = String(value === null || value === undefined ? '' : value), bytes = Utilities.newBlob(text).getBytes().length, failure;
  var detail = { property: String(key || ''), bytes: bytes, context: String(context || '') };
  if (bytes > FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT) {
    failure = new Error('Không thể lưu state đồng bộ vì DocumentProperties đã chạm giới hạn dung lượng.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA';
  } else {
    try { FbmSync.props().setProperty(key, text); return; } catch (err) { detail.error = String(err && err.message || err); }
    failure = new Error('Không thể lưu state đồng bộ vào DocumentProperties.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
  }
  failure.detail = detail;
  throw failure;
};
/** Đọc một property JSON dạng object của đồng bộ qua công cụ chung `documentPropertyJson` (cursor, hash chờ xác nhận, cấu hình: hỏng thì ném, không coi là trống — FBM-025, FBM-026). */
FbmSync.documentPropertyJson = function (key, context) {
  return documentPropertyJson(FbmSync.props(), key, context, 'object');
};

/** Khóa duy nhất của state/cursor đồng bộ (khóa script); không dùng DocumentLock vì WriteGate tự giữ khóa đó khi ghi Sheet. Không có khóa thay thế: thiếu khóa script thì lỗi to, không chạy không khóa. */
FbmSync.orchestrationLock = function () { return LockService.getScriptLock(); };
/** `waitMs` bỏ trống là hạn chờ chung; lệnh Dừng truyền 0 để không bao giờ chờ lát đang chạy. */
FbmSync.withOrchestrationLock = function (work, waitMs) {
  var lock = FbmSync.orchestrationLock();
  if (waitMs === undefined) { waitMs = SETTINGS.LOCK_WAIT_MS; }
  if (!documentStoreTryLock(lock, waitMs)) { return { ok: false, code: 'BUSY', request: null, message: 'GAS đang xử lý một lượt đồng bộ khác; chưa thay đổi state.', status: FbmSync.statusView() }; }
  // State ghi gộp trước khi nhả khóa, để lượt chờ khóa đọc được bản hoàn chỉnh (PropertyBuffer.js).
  try { return FbmSync.withPropertyBuffer(work); } finally { lock.releaseLock(); }
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
  for (var i = 0; i < count; i += 1) { props.deleteProperty(prefix + i); }
  props.deleteProperty(prefix + 'TOTAL'); props.deleteProperty(prefix + 'HIGH_WATER'); props.deleteProperty(prefix + 'SHARDS');
};
FbmSync.seenStoreBegin = function (scope, recordsOrTotal) {
  FbmSync.seenStoreClear(scope);
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), records = Array.isArray(recordsOrTotal) ? recordsOrTotal : null, highWater = 0;
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
  return { schemaVersion: FbmSync.STATE_SCHEMA_VERSION, runId: '', origin: 'manual', mode: 'read', scan: 'full', scanPack: '', scheduledScan: '', chain: null, requestGap: null, phase: 'idle', entity: '', cursor: {}, activeRequestId: '', activeRequestSig: '', closedRequestId: '', resubmit: { answered: '', issued: '' }, loginForceOffered: false, identityTarget: null, lastProgressAt: 0, deadlineAt: 0, session: { customerAuthorized: '', activityAuthorized: '', cookie: '', userId: '', accountUsername: '', accountName: '', lookups: {}, expired: false, identityVerified: false, identitySessionId: '', identityVerifiedAt: 0, sessionId: '', lastHeartbeatAt: 0 }, metadata: { categoryBlocks: [], preflightIssues: [], conflictCount: 0, conflictRefresh: null, manualPending: null, sessionGate: null }, counts: FbmSync.countsDefault(), progress: { done: 0, total: 0 }, current: '', message: '', startedAt: 0, updatedAt: 0, lastError: '', lastFailureCode: '', retryable: false };
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
  FbmSync.documentPropertySet('FBM_SYNC_PENDING_PUSHES_V1', JSON.stringify(all), 'pending_push');
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
  FbmSync.documentPropertySet(FbmSync.PUSH_FAILURES_KEY, JSON.stringify({ hashes: store.hashes, details: details }), 'push_failures');
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

/**
 * Danh sách đẩy của chặng đẩy: các mã lần quét gần nhất thấy có việc, Khách trước Giao dịch. Chỉ là gợi ý chỗ cần nhìn, không quyết gì: mỗi mã được đọc lại và xét lại trước khi đẩy, và chặng đẩy chỉ sạch sau một lần quét không còn ứng viên, nên danh sách thiếu hay cũ không làm sót bản ghi.
 * Chỉ một khóa để kho không phình theo số bản ghi; phần không vừa để lần quét sau. Ghi một lần sau mỗi lần quét, không sửa từng bước.
 */
FbmSync.PUSH_LIST_PREFIX = 'FBM_SYNC_PUSH_LIST_';
FbmSync.PUSH_LIST_TAGS = { customer: 'c', activity: 'a' };
/** Trả số mã đã ghi (đầu danh sách, vừa một khóa). */
FbmSync.pushListWrite = function (candidates) {
  return FbmSync.shardListWrite(FbmSync.PUSH_LIST_PREFIX, (candidates || []).map(function (item) { return FbmSync.PUSH_LIST_TAGS[item.entity] + ':' + String(item.id || ''); }), 1);
};
/** Phần tử không đúng dạng là khóa hỏng: ném lỗi để bên gọi ghi Log rồi quét lại, không coi là rỗng. */
FbmSync.pushListRead = function () {
  var entities = {};
  Object.keys(FbmSync.PUSH_LIST_TAGS).forEach(function (entity) { entities[FbmSync.PUSH_LIST_TAGS[entity]] = entity; });
  return FbmSync.shardListRead(FbmSync.PUSH_LIST_PREFIX).map(function (text) {
    var at = text.indexOf(':'), entity = at > 0 ? entities[text.slice(0, at)] : '', id = at > 0 ? text.slice(at + 1) : '';
    if (!entity || !id) { throw new Error('Danh sách đẩy hỏng ở phần tử "' + text.slice(0, 40) + '".'); }
    return { entity: entity, id: id };
  });
};
FbmSync.pushListClear = function () { FbmSync.shardListWrite(FbmSync.PUSH_LIST_PREFIX, []); };

/**
 * Dấu lần đẩy sạch: mọi thứ ngoài dòng Sheet mà phép xét đẩy dựa vào. Dòng Sheet đại diện bằng `rev` của sổ nạp lại (mọi cửa ghi và trigger sửa tay đều tăng nó, kể cả Category và Cài đặt); sổ lỗi đẩy, phạm vi trong cài đặt và tài khoản FBM đã liên kết đọc thẳng. Chỉ là quyền bỏ qua một lần quét, không phải nguồn sự thật: thiếu hay hỏng thì quét.
 * Đọc từ bản chụp DocumentProperties của lần gọi nên không thêm lần gọi kho.
 */
FbmSync.PUSH_CLEAN_KEY = 'FBM_SYNC_PUSH_CLEAN_V1';
FbmSync.pushCleanNow = function () {
  var hashes = FbmSync.pushFailuresRead().hashes, settings = FbmSync.syncSettingsRead();
  return {
    rev: Number(reloadJournalRead().rev),
    failures: Object.keys(hashes).sort().map(function (key) { return key + '=' + hashes[key]; }).join('|'),
    scope: settings.scopeLimited === false ? '' : 'limited:' + (settings.scopeCodes || []).join(','),
    account: FbmSync.boundIdentity().accountName
  };
};
/** Dấu đã lưu, `null` khi chưa có; hỏng thì ném để người gọi ghi Log rồi quét. */
FbmSync.pushCleanRead = function () { return FbmSync.documentPropertyJson(FbmSync.PUSH_CLEAN_KEY, 'dấu lần đẩy sạch'); };
FbmSync.pushCleanWrite = function (mark) {
  FbmSync.documentPropertySet(FbmSync.PUSH_CLEAN_KEY, JSON.stringify(mark), 'push_clean');
};
FbmSync.pushCleanClear = function () { FbmSync.props().deleteProperty(FbmSync.PUSH_CLEAN_KEY); };
/**
 * Bản ô lượt của lát đang chạy: `runSlice` mở, đóng và ghi xuống kho một lần ở cuối lát. Trong lát mọi lần `stateRead` trả cùng một bản, nên hai hàm sửa hai trường khác nhau không đè mất thay đổi của nhau; `stateWrite` một bản khác bản của lát thì ném `SLICE_FOREIGN_STATE` trước khi kịp đè.
 * `null` khi không có lát nào mở: đọc và ghi đi thẳng xuống kho như cũ.
 */
FbmSync.sliceStore = null;
/** Đọc state; trong lát trả bản của lát (lần đầu mới đọc kho). */
FbmSync.stateRead = function () {
  var store = FbmSync.sliceStore;
  if (!store) { return FbmSync.stateLoad(); }
  if (!store.state) { store.state = FbmSync.stateLoad(); }
  return store.state;
};
/**
 * Ghi state. Trong lát chỉ đánh dấu bản của lát cần ghi và trả lại chính bản đó; bản khác là một bản sao cũ sắp đè thay đổi của hàm khác nên ném. Lát chưa đọc ô lượt thì nhận bản được ghi làm bản của lát.
 * Mở lượt mới thay hẳn ô lượt thì dùng `stateReplace`.
 */
FbmSync.stateWrite = function (state) {
  var store = FbmSync.sliceStore;
  if (!store) { return FbmSync.stateStore(state); }
  if (store.state && state !== store.state) {
    var foreign = new Error('Ghi một bản ô lượt khác bản của lát đang chạy; bản này sẽ đè mất thay đổi của hàm khác trong cùng lát.');
    foreign.code = 'SLICE_FOREIGN_STATE';
    throw foreign;
  }
  store.state = state;
  store.dirty = true;
  return state;
};
/** Thay hẳn ô lượt (mở lượt mới): trong lát bản mới thành bản của lát, bản cũ ai còn giữ mà ghi lại thì bị `stateWrite` chặn. */
FbmSync.stateReplace = function (state) {
  var store = FbmSync.sliceStore;
  if (!store) { return FbmSync.stateStore(state); }
  store.state = state;
  store.dirty = true;
  return state;
};
/** Đóng bản của lát; có thay đổi thì ghi xuống kho một lần. Trả bản đã ghi, hoặc `null` khi lát không đổi ô lượt. */
FbmSync.sliceStoreClose = function () {
  var store = FbmSync.sliceStore;
  FbmSync.sliceStore = null;
  return store && store.dirty ? FbmSync.stateStore(store.state) : null;
};
/** Đọc ô lượt từ kho và tự bù field thiếu từ mặc định. */
FbmSync.stateLoad = function () {
  var fallback = FbmSync.stateDefault();
  var parsed = FbmSync.documentPropertyJson(FbmSync.STATE_KEY, 'state đồng bộ');
  if (!parsed) { return fallback; }
  var metadata = parsed.metadata || {};
  var read = Object.assign(fallback, parsed, { schemaVersion: Number(parsed.schemaVersion || 1), counts: Object.assign(fallback.counts, parsed.counts || {}), session: Object.assign(fallback.session, parsed.session || {}), metadata: Object.assign(fallback.metadata, metadata, { conflictCount: Number(metadata.conflictCount || 0), preflightIssues: Array.isArray(metadata.preflightIssues) ? metadata.preflightIssues : [], manualPending: metadata.manualPending || null }), progress: Object.assign(fallback.progress, parsed.progress || {}) });
  // Khóa bản ghi cũ trong state đã chuyển sang sổ bận của lõi; bản state cũ còn mang thì bỏ, không ai đọc nữa.
  delete read.locks;
  FbmSync.logContextNote(read);
  FbmSync.requestWatchNote(read);
  return read;
};
/** Ghi ô lượt xuống kho, cập nhật timestamp và giữ cấu trúc nhất quán. */
FbmSync.stateStore = function (state) {
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
  if (FbmSync.TERMINAL_PHASES.indexOf(String(next.phase || '')) >= 0) {
    FbmSync.businessFinishOpenSteps(next, next.phase, { error: String(next.lastError || next.message || '') });
  }
  FbmSync.logContextNote(next);
  FbmSync.requestWatchCheck(next);
  try { FbmSync.documentPropertySet(FbmSync.STATE_KEY, JSON.stringify(next), 'state'); } catch (error) {
    // Đóng phiên mà ghi hỏng thì phiên đứng mãi ở pha đang chạy và màn đồng bộ kẹt (FBM-044): ghi bản rút gọn để phiên đóng được, rồi vẫn ném để người điều phối báo lỗi.
    if (FbmSync.stateStorageError(error) && FbmSync.TERMINAL_PHASES.indexOf(String(next.phase || '')) >= 0) { error.minimal = FbmSync.stateWriteMinimal(next, error); }
    throw error;
  }
  FbmSync.requestWatchNote(next);
  return next;
};
/** Phiên đã có token của màn `customer` hoặc `activity` chưa. Nơi khác chỉ được hỏi có hay không, không đọc giá trị bí mật (luật tĩnh `sessionSecret`). */
FbmSync.sessionAuthorized = function (state, entity) {
  var session = state && state.session || {};
  return !!(entity === 'customer' ? session.customerAuthorized : session.activityAuthorized);
};

FbmSync.PICKUP_PREFIX = 'pickup:';
/** Lượt đang giữ chỗ chờ Extension nhận: chưa có request nào sang FBM. */
FbmSync.pickupHeld = function (state) { return !!state && !!state.runId && String(state.activeRequestId || '') === FbmSync.PICKUP_PREFIX + String(state.runId); };
/** Lần hỏi của máy này có nhận lượt đang giữ chỗ không: đúng máy được giao và còn hạn. */
FbmSync.pickupAwaits = function (state, machineId, now) { return FbmSync.pickupHeld(state) && !!String(machineId || '') && String(state.driverMachineId || '') === String(machineId) && Number(now) < Number(state.deadlineAt || 0); };
FbmSync.STATE_MINIMAL_TEXT_LIMIT = 1000;
FbmSync.STATE_MINIMAL_NOTE = ' (Không lưu được đầy đủ trạng thái phiên; đã lưu bản rút gọn, xem Log.)';
/** Bản state đóng phiên chỉ gồm phase, lý do và (nếu vừa) cursor/khóa ghi; preview, session, sổ bước bị bỏ vì chính chúng làm phình state. Trả bản đã ghi kèm `cursorKept`, hoặc `null` khi không ghi được bản nào (lỗi gốc vẫn được ném ở `stateStore`). */
FbmSync.stateWriteMinimal = function (full, failure) {
  var cut = function (text) { return String(text || '').slice(0, FbmSync.STATE_MINIMAL_TEXT_LIMIT); };
  var base = { version: full.version, runId: full.runId, origin: full.origin, mode: full.mode, scan: full.scan, phase: full.phase, entity: full.entity, startedAt: full.startedAt, updatedAt: full.updatedAt, retryable: false, lastFailureCode: String(full.lastFailureCode || failure.code || ''), lastError: cut(full.lastError), message: cut(full.message || full.lastError) + FbmSync.STATE_MINIMAL_NOTE, metadata: { conflictCount: Number(full.metadata && full.metadata.conflictCount || 0) } };
  var tiers = [Object.assign({}, base, { cursor: full.cursor || {} }), base];
  for (var i = 0; i < tiers.length; i += 1) {
    try { FbmSync.documentPropertySet(FbmSync.STATE_KEY, JSON.stringify(tiers[i]), 'state_minimal'); } catch (tierError) {
      if (!FbmSync.stateStorageError(tierError)) { throw tierError; }
      continue;
    }
    return { state: tiers[i], cursorKept: i === 0 };
  }
  return null;
};
// Lỗi kho state: gặp ở lần đọc status thì người dùng không tự thoát được, nên GAS mở nút "Đặt lại phiên đồng bộ" (FBM-044).
FbmSync.STATE_STORAGE_CODES = ['DOCUMENT_PROPERTIES_READ_FAILED', 'DOCUMENT_PROPERTY_CORRUPT', 'FBM_DOCUMENT_PROPERTIES_QUOTA', 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED'];
FbmSync.stateStorageError = function (error) { return !!error && FbmSync.STATE_STORAGE_CODES.indexOf(String(error.code || '')) >= 0; };
/** Snapshot thay cho status khi kho state hỏng: lý do kèm cờ mở nút đặt lại. Không ghi Log: cửa lệnh gặp lỗi kho ghi (`storageFailureLog`). */
FbmSync.stateStuckView = function (error) {
  var reason = String(error && error.message || error || '');
  return { ok: false, code: 'SYNC_STATE_STUCK', failureCode: String(error && error.code || ''), resetOffered: true, runId: '', phase: 'error', label: 'Có lỗi', message: 'Màn đồng bộ đang kẹt: ' + reason, lastError: reason, counts: {} };
};
/** Xóa ô lượt khỏi kho (lối thoát khi kho state hỏng, lệnh `stateReset`); xóa hỏng thì ném lỗi có mã. */
FbmSync.stateErase = function () {
  try { FbmSync.props().deleteProperty(FbmSync.STATE_KEY); } catch (deleteError) {
    var failure = new Error('Không xóa được trạng thái phiên đồng bộ; thử lại sau ít phút.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
    failure.detail = { key: FbmSync.STATE_KEY, context: 'state_reset', error: String(deleteError && deleteError.message || deleteError) };
    throw failure;
  }
};
/** Ghi một phần state mà không làm mất field đang có. */
FbmSync.statePatch = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };
/** Tên bước của hộp đen Extension. Bước lạ (Extension bản khác) vẫn được ghi nhưng không dịch, để không đoán bừa. */
FbmSync.EXTENSION_TRAIL_STAGES = {
  gas_request_received: 'đã nhận request từ GAS, chưa gửi sang tab FBM',
  fbm_tab_preparing: 'đang chuẩn bị tab FBM (chờ tab tải xong và có bộ chạy request)',
  fbm_page_reloading: 'Extension đang đổi tab FBM về trang GAS yêu cầu tải lại',
  fbm_tab_sent: 'đã gửi request sang tab FBM, chưa nhận lại kết quả',
  fbm_tab_replied: 'tab FBM đã trả kết quả, chưa gửi về GAS',
  gas_response_sent: 'đã gửi kết quả về GAS, chưa nhận trả lời',
  failure_sent: 'đang báo lỗi vận chuyển về GAS',
  chain_finished: 'Extension đã chạy hết lượt vì GAS trả lời không còn request tiếp',
  gas_reply_failed: 'GAS trả lời lỗi hoặc Extension không gọi được GAS, Extension dừng lượt'
};
/** Chỉ giữ tên bước, mã request, số hop và mốc giờ từ hộp đen: Extension là nguồn ngoài, không chép nguyên văn vào Log. */
/**
 * Ô lỗi của hộp đen: lỗi Extension không báo được lúc xảy ra (gọi GAS hỏng vì 404, HTML, quá giờ; không đặt được chuông hỏi GAS) nên lần gọi được kế tiếp mang theo. `command` là việc Extension đang làm. Trả dòng Log cần ghi và mốc ô (`at`) làm `trailAck`; ô không có thì trả null. Chỉ dựng dữ liệu, người điều phối ghi Log.
 */
FbmSync.relayFailureEntry = function (trail) {
  var cell = trail && typeof trail === 'object' ? trail.relayFailure : null;
  if (!cell || typeof cell !== 'object' || !Number(cell.at || 0)) { return null; }
  var code = String(cell.code || '').replace(/[^A-Za-z0-9_ .:-]/g, '').slice(0, 60), httpStatus = Number(cell.httpStatus || 0), attempts = Number(cell.attempts || 0), command = String(cell.command || '').replace(/[^a-z_]/g, '').slice(0, 40);
  return { at: Number(cell.at), entry: { source: 'fbm_sync', action: 'relay_call_failed', outcome: LOG_ERROR, reason: 'Extension báo lỗi lúc ' + (command || 'không rõ việc') + ': ' + (code || 'không rõ mã') + (httpStatus ? ' (HTTP ' + httpStatus + ')' : '') + (attempts ? ', đã thử ' + attempts + ' lần' : '') + '. Lỗi ghi lúc ' + new Date(Number(cell.at)).toISOString() + '.', detail: { code: code, httpStatus: httpStatus, attempts: attempts, command: command, at: Number(cell.at) } } };
};
FbmSync.extensionTrailSafe = function (trail) {
  if (!trail || typeof trail !== 'object') { return null; }
  return { stage: String(trail.stage || '').slice(0, 40), requestId: String(trail.requestId || '').slice(0, 80), hop: Number(trail.hop || 0), httpStatus: Number(trail.httpStatus || 0), at: Number(trail.at || 0), workerStartedAt: Number(trail.workerStartedAt || 0), currentWorkerStartedAt: Number(trail.currentWorkerStartedAt || 0), code: String(trail.code || '').replace(/[^A-Za-z0-9_ .:-]/g, '').slice(0, 60) };
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
  if (t.code) { text += (t.stage === 'fbm_tab_preparing' ? ' Trạng thái tab lúc tìm thấy: ' : ' Mã lỗi: ') + t.code + (t.httpStatus ? ' (HTTP ' + t.httpStatus + ')' : '') + '.'; } else if (t.stage === 'gas_reply_failed') { text += ' Mã lỗi: không rõ.'; }
  if (t.stage === 'gas_reply_failed') { return text; }
  if (t.workerStartedAt && t.currentWorkerStartedAt) {
    text += t.currentWorkerStartedAt > t.workerStartedAt ? ' Phần chạy nền của Extension đã khởi động lại sau bước đó nên lượt bị cắt giữa chừng (Chrome tắt phần chạy nền hoặc Extension được tải lại).' : ' Phần chạy nền của Extension vẫn chạy liền từ bước đó, không khởi động lại.';
  }
  return text;
};
