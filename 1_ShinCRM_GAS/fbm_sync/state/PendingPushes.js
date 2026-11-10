/**
 * Sổ chờ xác nhận `FBM_SYNC_PENDING_PUSHES_V1`: `entity:id` → `{ hSHIN, sentAt, fbmId }`, hash của lần ghi đã gửi FBM mà chưa đọc lại được. Mục còn thì chặng đẩy không gửi lại bản ghi đó, nên lần tạo khách mất phản hồi không thành khách trùng trên FBM.
 * Xóa mục: khi xác nhận khớp (`pushResultVerify`), khi kéo về khớp (`pullPageApply` trả `pendingClears`), và khi dọn mồ côi ở lần quét đầu chặng đẩy. Không bao giờ xóa theo tuổi: mục quá tuổi chỉ báo cho người dùng xem.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.PENDING_PUSHES_KEY = 'FBM_SYNC_PENDING_PUSHES_V1';
/** Thông báo có mục chờ xác nhận quá tuổi. */
FbmSync.PENDING_STALE_TOPIC = 'fbm_pending_stale';

FbmSync.pendingPushesRead = function () {
  return FbmSync.documentPropertyJson(FbmSync.PENDING_PUSHES_KEY, 'hash chờ xác nhận') || {};
};
/** Cổng ghi duy nhất của sổ: sổ rỗng thì xóa khóa. */
FbmSync.pendingPushesWrite = function (all) {
  if (!Object.keys(all).length) { FbmSync.propertyJsonWrite(FbmSync.PENDING_PUSHES_KEY, null); return all; }
  FbmSync.documentPropertySet(FbmSync.PENDING_PUSHES_KEY, JSON.stringify(all), 'pending_push');
  return all;
};
FbmSync.pendingPushGet = function (entity, id) {
  return FbmSync.pendingPushesRead()[String(entity || '') + ':' + String(id || '')] || null;
};
FbmSync.pendingPushSet = function (entity, id, value) {
  var key = String(entity || '') + ':' + String(id || ''), all = FbmSync.pendingPushesRead();
  if (value && typeof value === 'object') { all[key] = value; } else { delete all[key]; }
  FbmSync.pendingPushesWrite(all);
  return value || null;
};
FbmSync.pendingPushClear = function (entity, id) { return FbmSync.pendingPushSet(entity, id, null); };

/**
 * Xét sổ chờ với bản đọc Sheet (hàm thuần). `local`: `{ customer: [...], activity: [...] }` bản ghi Sheet. Trả `{ orphans, stale }` là danh sách khóa `entity:id`.
 * - Mồ côi: bản ghi không còn trên Sheet (không còn ai đẩy lại nó), hoặc dấu vân FBM của dòng (`fbmHash`) đã bằng hash đã gửi (FBM đã giữ đúng bản gửi, chỉ việc xóa mục bị sót).
 * - Bản ghi tạo khách mất phản hồi chưa có `fbmHash` nên không bao giờ là mồ côi: xóa nó là mở đường tạo trùng.
 * - Quá tuổi: `sentAt` cũ hơn `staleMs` mà không mồ côi; chỉ để báo.
 */
FbmSync.pendingSweep = function (pending, local, now, staleMs) {
  var rows = {}, orphans = [], stale = [];
  Object.keys(local).forEach(function (entity) { (local[entity] || []).forEach(function (record) { rows[entity + ':' + String(record.id || '')] = record; }); });
  Object.keys(pending).forEach(function (key) {
    var item = pending[key] || {}, record = rows[key], sent = String(item.hSHIN || '');
    if (!record || (sent && String(record.fbmHash || '') === sent)) { orphans.push(key); return; }
    if (now - Number(item.sentAt || 0) > staleMs) { stale.push(key); }
  });
  return { orphans: orphans, stale: stale };
};

/** Người điều phối dọn sổ ở lần quét đầu chặng đẩy (đã có bản đọc Sheet `scan`): bỏ mục mồ côi trong một lần ghi; mục quá tuổi thì bật thông báo và ghi Log khi thông báo mới bật, hết mục quá tuổi thì gỡ thông báo. */
FbmSync.pendingSweepApply = function (scan, logs, now) {
  var pending = FbmSync.pendingPushesRead();
  if (!Object.keys(pending).length) { noticeResolve(FbmSync.PENDING_STALE_TOPIC, ''); return; }
  var minutes = FbmSync.BUDGET.pendingPushStaleMinutes;
  var sweep = FbmSync.pendingSweep(pending, { customer: scan.records('customer'), activity: scan.records('activity') }, now, minutes * 60000);
  if (sweep.orphans.length) {
    sweep.orphans.forEach(function (key) { delete pending[key]; });
    FbmSync.pendingPushesWrite(pending);
    logs.push({ action: 'pending_push_orphans', outcome: LOG_OK, reason: 'Bỏ ' + sweep.orphans.length + ' mục chờ xác nhận không còn cần (bản ghi đã xóa khỏi Sheet hoặc FBM đã giữ đúng bản gửi).', detail: { keys: sweep.orphans } });
  }
  if (!sweep.stale.length) { noticeResolve(FbmSync.PENDING_STALE_TOPIC, ''); return; }
  var title = sweep.stale.length + ' bản ghi đã gửi lên FBM quá ' + minutes + ' phút mà chưa xác nhận được';
  var raised = noticeRaise({ topic: FbmSync.PENDING_STALE_TOPIC, scope: '', source: 'fbm_sync', title: title, lines: ['Các bản ghi này không được gửi lại cho đến khi đọc được bản trên FBM, để không tạo trùng: ' + sweep.stale.slice(0, 10).join(', ') + (sweep.stale.length > 10 ? '...' : '') + '.'], hint: 'Chạy một lượt Quét nhanh để đọc lại các bản ghi từ FBM; vẫn còn thì mở FBM kiểm tra bản ghi có được tạo chưa.' });
  if (raised) { logs.push({ action: 'pending_push_stale', outcome: LOG_WARN, reason: title + '; không gửi lại để tránh tạo trùng.', detail: { keys: sweep.stale, minutes: minutes } }); }
};
