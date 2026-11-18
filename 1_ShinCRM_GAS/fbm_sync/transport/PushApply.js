/**
 * Công cụ áp kết quả của chiều đẩy lên dòng Sheet: mọi chỗ chiều đẩy ghi mốc `fbmHash` nằm ở đây (cùng `Pull.js` và `Conflict.js`, luật baseline ở `StaticRules.js`). Tệp khác của chiều đẩy chỉ quyết rồi gọi vào đây, không tự ghi mốc.
 * `pushResultSent` (pha 1) ghi dòng "đã đẩy chờ xác nhận". Các hàm `...Patch` thuần: nhận dòng cục bộ đọc trong cửa ghi và kết luận đã quyết, trả patch cho `pushRowChange`; không đọc Sheet, không ghi Log, không đổi ô lượt.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Pha 1 của áp kết quả đẩy (`pushResultApply`): lệnh lưu đã trả thành công. Lấy ID FBM (thiếu thì ném `FBM_PUSH_RESPONSE_INCOMPLETE`), băm bản đã gửi rồi ghi dòng `đã đẩy chờ xác nhận`. Baseline chỉ đổi ở pha 2, sau bước đọc lại.
 * Hash đã gửi không ghi kho nào: bên gọi giữ trong dấu trang của chặng cho pha 2. Lượt chết trước pha 2 thì dòng `đã đẩy chờ xác nhận` đã có ID FBM, lần kéo về sau so ba chiều như mọi dòng; lệnh tạo không bao giờ bị phát lại vì dòng đã có ID.
 * `gate` là cổng danh mục của chặng. Trả `{ patch, sentHash }`: patch đã ghi lên dòng (có `fbmId` để mở form đọc lại).
 */
FbmSync.pushResultSent = function (candidate, response, operation, gate) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {};
  data = data.d || data;
  var patch = { id: record.id, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: String(record.fbmHash || '').trim() };
  if (candidate.entity === 'customer') {
    patch.fbmId = String(values.stt_rec_kh || values.stt_rec_kh0 || record.fbmId || '').trim();
    patch.fbmCustomerCode = String(values.ma_kh || record.fbmCustomerCode || candidate.autoCode || '').trim();
    if (!patch.fbmId || !patch.fbmCustomerCode) { throw FbmSync.pushResponseIncomplete('FBM không trả đủ stt_rec_kh/ma_kh sau khi ghi Customer.'); }
  } else {
    var activityId = values.id || (data && data.id) || record.fbmId || '';
    patch.fbmId = String(activityId).trim();
    if (!patch.fbmId) { throw FbmSync.pushResponseIncomplete('FBM không trả id sau khi ghi Activity.'); }
  }
  // Fingerprint Activity có `id` FBM nên phải tính sau khi gắn ID vừa nhận; tính trên bản ghi lúc tạo (chưa có ID) thì mọi lệnh tạo đọc xác nhận lệch thành xung đột giả (FBM-050).
  var sentHash = FbmSync.hash(Object.assign({}, record, { fbmId: patch.fbmId }), candidate.entity, gate);
  FbmSync.pushRowChange(candidate.entity, record.id, { must: 'chưa ghi mã FBM vừa tạo, dòng giữ "đang đẩy" để lượt sau tra lại', build: function () { return { patch: patch }; } });
  return { patch: patch, sentHash: sentHash };
};
/** FBM báo lưu thành công mà không trả ID: không biết bản ghi nằm đâu trên FBM nên không đọc xác nhận được. */
FbmSync.pushResponseIncomplete = function (message) {
  var error = new Error(message);
  error.code = 'FBM_PUSH_RESPONSE_INCOMPLETE';
  return error;
};

/**
 * Patch cho bước mở form quyết không lưu (`decision.action` của `pushOpenDecision`). Dòng đã đổi tiếp so với bản đem so (`hSHIN`) thì không ghi kết quả so, chỉ về `chờ đối soát` để lượt sau so lại. Hai bên đã bằng nhau (`settled`) thì mốc = hash FBM vừa mở.
 * `value` là tên kết quả cho người gọi: `changed`, `settled`, `conflict`, `fbmOnly`.
 */
FbmSync.pushOpenResultPatch = function (local, entity, gate, decision) {
  var sync = FbmSync.SYNC_STATUS;
  if (FbmSync.hash(local, entity, gate) !== decision.hSHIN) { return { patch: { id: local.id, syncStatus: sync.pending }, value: 'changed' }; }
  if (decision.action === 'settled') { return { patch: { id: local.id, fbmHash: decision.hFBM, syncStatus: sync.synced, syncedAt: new Date() }, value: 'settled' }; }
  if (decision.action === 'conflict') { return { patch: { id: local.id, syncStatus: sync.conflict }, value: 'conflict' }; }
  return { patch: { id: local.id, syncStatus: sync.synced }, value: 'fbmOnly' };
};

/**
 * Patch pha 2 của áp kết quả đẩy: `check` là `{ incomingHash, sentHash, markerLeft }` (hash form đọc lại, hash đã gửi ở pha 1, form còn dấu #SC). Mốc chỉ đổi khi FBM đọc lại bằng đúng bản đã gửi; `confirmed` mà dòng đã sửa tiếp thì mốc theo FBM và dòng về `chờ đối soát`, không ghi nội dung FBM đè lên.
 * `value.outcome`: `confirmed`, `notApplied` (FBM không đổi so với mốc cũ, hoặc lệnh sửa không mang dấu mà FBM vẫn còn dấu), `conflict`. Dòng ghi cùng lần nhả bản ghi trừ khi còn bước dọn dấu #SC.
 */
FbmSync.pushVerifyResultPatch = function (local, entity, gate, check) {
  var sync = FbmSync.SYNC_STATUS, localHash = FbmSync.hash(local, entity, gate), previousHash = String(local.fbmHash || '').trim();
  if (check.incomingHash === check.sentHash) {
    var status = localHash === check.sentHash ? sync.synced : sync.pending, cleaning = check.markerLeft && status === sync.synced;
    return { patch: { id: local.id, fbmHash: check.incomingHash, syncStatus: status, syncedAt: new Date() }, release: !cleaning, value: { outcome: 'confirmed', status: status, cleaning: cleaning } };
  }
  if ((previousHash && check.incomingHash === previousHash) || (check.markerLeft && !check.incomingHash)) {
    return { patch: { id: local.id, syncStatus: sync.notApplied }, release: true, value: { outcome: 'notApplied' } };
  }
  // Sheet là nguồn của hàng đợi xung đột nên ghi trạng thái cùng lần nhả: dòng `xung đột chờ quyết` đã bị khóa đồng bộ.
  return { patch: { id: local.id, syncStatus: sync.conflict }, release: true, value: { outcome: 'conflict' } };
};

/** Patch kết luận tra lại lệnh tạo ở lượt sau: thấy bản ghi (`ids`) thì nối ID FBM và để mốc rỗng, lần quét lại mở form so hai bên (chưa có mốc thì không bao giờ lưu đè); không thấy (`ids` rỗng) thì dòng về `chờ đối soát` để tạo lại như lệnh tạo thường. */
FbmSync.createRecoveryPatch = function (local, ids) {
  return { patch: Object.assign({ id: local.id, syncStatus: FbmSync.SYNC_STATUS.pending }, ids ? Object.assign({ fbmHash: '' }, ids) : {}) };
};

/** Patch cho Customer tra thấy trong cùng lần gửi: `incoming` đã được người gọi so khớp chính xác với bản đã gửi nên mốc là hash FBM của nó (`incoming.incomingHash`) và dòng đã đồng bộ. */
FbmSync.createdCustomerPatch = function (local, incoming) {
  return { patch: { id: local.id, fbmId: incoming.fbmId, fbmCustomerCode: incoming.fbmCustomerCode, fbmHash: incoming.incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() } };
};
