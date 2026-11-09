/**
 * Chặng `conflict_refresh` theo hợp đồng chung (thiết kế 3.1, 5.9): response mở bản ghi FBM của xung đột đầu hàng đợi về thì dựng DTO cho Sidebar. Chặng chạy trên bản sao ô lượt, không đọc Sheet (dòng ShinCRM và cổng danh mục đi vào qua `conflictRefreshInputs`), không ghi gì: mọi việc ghi (tự đóng khi hết trường lệch, rời hàng đợi khi FBM không còn bản ghi) đi trong `end` cho `conflictRefreshEnd`.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đầu vào của chặng đọc qua cổng chủ: dòng ShinCRM đang xung đột (đọc theo mã) và cổng danh mục của lượt. */
FbmSync.conflictRefreshInputs = function (state) {
  var cursor = state.cursor || {};
  return { local: FbmSync.readLocalById(cursor.entity, String(cursor.id || '')), gate: FbmSync.stateCategoryGate(state) };
};

/**
 * Một response mở bản ghi xung đột. `end.kind`: `view` (DTO cho Sidebar), `settle` (hai bên đã khớp mọi trường, đóng theo bản FBM), `drop` (FBM không còn trả bản ghi), `fail` (FBM lỗi hoặc dòng đã rời trạng thái chờ quyết; xung đột giữ nguyên).
 * Số còn lại lấy từ số bên mở lệnh đã đếm trên Sheet, không quét lại cả sheet trong lát này.
 */
FbmSync.conflictRefreshStage = function (ctx) {
  var cursor = ctx.state.cursor || {}, entity = String(cursor.entity || ''), id = String(cursor.id || ''), patch = { cursor: {} };
  var success = FbmSync.protocol.assertSuccess(ctx.reply);
  if (!success.ok) { return { patch: patch, end: { kind: 'fail', code: success.code || 'CONFLICT_REFRESH_FAILED', message: 'Không đọc lại được FBM; xung đột ' + id + ' vẫn giữ nguyên để thử lại.' } }; }
  var local = ctx.inputs.local;
  if (!local || !FbmSync.isConflictPending(local)) { return { patch: patch, end: { kind: 'fail', code: 'CONFLICT_NOT_FOUND', message: 'Bản ghi ' + id + ' không còn ở trạng thái xung đột chờ quyết trên Sheet.' } }; }
  var read = FbmSync.conflictRefreshParse(entity, id, local, ctx.reply, ctx.inputs.gate);
  if (!read) { return { patch: patch, end: { kind: 'drop', entity: entity, id: id, reason: 'không còn đọc được trên FBM (bị xóa hoặc chuyển quyền)' } }; }
  var view = FbmSync.conflictView(read, Number(ctx.state.metadata && ctx.state.metadata.conflictCount || 0));
  // Hai bên đã khớp mọi trường thì không còn gì để người dùng chọn (gặp khi đọc xác nhận lệch nhưng bản đọc lại đã khớp); đóng luôn theo bản FBM thay vì để màn xung đột rỗng không lưu được.
  if (!view.fields.length) { return { patch: patch, end: { kind: 'settle', read: { entity: entity, id: id, gate: read.gate, latestHash: read.latestHash, latest: read.latest, old: view.snapshot.old } } }; }
  patch.message = 'Đang xem xung đột ' + id + '.';
  return { patch: patch, end: { kind: 'view', view: view } };
};

/** Response mở bản ghi → bản FBM mới nhất cùng dòng ShinCRM: `{ entity, id, local, latest, latestHash, gate }`, hoặc `null` khi FBM không trả bản ghi. Chỉ đọc response, không ghi gì. */
FbmSync.conflictRefreshParse = function (entity, id, local, reply, gate) {
  var latest = (FbmSync.rowsToRecords(entity, reply).rows || [])[0];
  if (!latest) { return null; }
  var latestRecord = entity === 'customer' ? FbmSync.customerRecord(latest, gate) : FbmSync.activityRecord(latest, gate);
  return { entity: entity, id: id, local: local, latest: latestRecord, latestHash: String(latestRecord.fbmHash || FbmSync.hash(latestRecord, entity, gate)), gate: gate };
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
    old[localField] = raw === null || raw === undefined || raw === '' ? '' : FbmSync.isDate(raw) ? FbmSync.dateNormalize(raw) : String(raw);
  });
  return old;
};
