/**
 * Người điều phối lệnh mở lại nhóm bản ghi lỗi đẩy (`retry_push_failures`), không mở lượt. Không đọc, không ghi ô lượt: lượt kế (tay hoặc nền) tự dựng lại tập và qua cổng chặng đẩy. Chấp thuận không phải lệnh riêng: nút Chấp thuận mở lượt tay mang dấu tập (`startRun`).
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Mở lại toàn bộ nhóm lỗi sau khi người dùng đã sửa nguyên nhân; không phát request FBM. Đọc dòng và ghi trạng thái trong cùng một lần qua cửa ghi bản ghi; bản ghi đang bận giữ nguyên dấu lỗi để lần mở lại sau xét tiếp. Bản ghi không còn trên Sheet thì bỏ dấu, vì giữ lại nó chiếm chỗ của cầu dao lỗi đẩy mãi mãi.
 */
FbmSync.pushFailuresClearCommand = function () {
  var failures = FbmSync.pushFailuresRead().hashes, keys = Object.keys(failures);
  if (!keys.length) { return { ok: false, code: 'PUSH_FAILURES_NOT_FOUND', message: 'Không có nhóm bản ghi lỗi đẩy cần mở lại.' }; }
  var opened = FbmSync.recordChange(function (gate) {
    var byEntity = { customer: [], activity: [] }, present = { customer: {}, activity: {} }, reset = [], missing = [];
    ['customer', 'activity'].forEach(function (entity) {
      gate.read(entity, FbmSync.recordSchemas()).forEach(function (record) { present[entity][String(record && record.id || '')] = true; });
    });
    keys.forEach(function (key) {
      var split = key.indexOf(':'), entity = split < 0 ? '' : key.slice(0, split), id = split < 0 ? '' : key.slice(split + 1);
      if (!byEntity[entity] || !id || !present[entity][id]) { missing.push(key); return; }
      if (gate.busy(entity, [id])[id]) { return; }
      byEntity[entity].push({ id: id, syncStatus: FbmSync.SYNC_STATUS.pending });
      reset.push(key);
    });
    return { save: ['customer', 'activity'].map(function (entity) { return { entity: entity, records: byEntity[entity], source: 'pull' }; }), value: { reset: reset, missing: missing } };
  }).value;
  FbmSync.pushFailuresRemove(opened.reset.concat(opened.missing));
  logEvent({ source: 'fbm_sync', action: 'push_retry_batch_enabled', outcome: LOG_OK, reason: 'Người dùng chủ động mở lại nhóm bản ghi lỗi đẩy.', detail: { total: keys.length, reset: opened.reset.length, missing: opened.missing.length } });
  return { ok: true, total: keys.length, reset: opened.reset.length, missing: opened.missing.length, message: 'Đã mở lại ' + opened.reset.length + ' bản ghi lỗi; hãy chạy lại phiên Ghi thật để gửi theo hàng đợi.', status: FbmSync.statusView() };
};
