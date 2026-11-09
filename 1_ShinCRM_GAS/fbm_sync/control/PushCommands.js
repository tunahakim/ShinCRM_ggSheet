/**
 * Người điều phối hai lệnh của chiều đẩy không mở lượt: chấp thuận tập đang chờ (`approve_push`) và mở lại nhóm bản ghi lỗi đẩy (`retry_push_failures`). Không đọc, không ghi ô lượt: lượt kế (tay hoặc nền) tự dựng lại tập và qua cổng chặng đẩy.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Lời trả mang danh sách thông báo để Sidebar gỡ hoặc giữ thông báo chờ duyệt ngay. Lời duyệt gắn với dấu tập Sidebar đang hiện, không phải một cờ "đã duyệt": chỉ ghi `approvedFingerprint` khi dấu gửi lên khớp tập đang chờ. Tập đã đổi (có người sửa thêm, hoặc lượt vừa rồi hỏi lại tập khác) thì trả `PUSH_APPROVAL_STALE` để Sidebar hiện tập mới.
 */
FbmSync.runPushApprovalCommand = function (input) {
  var gate = FbmSync.pushGateRead(), fingerprint = String(input && input.fingerprint || ''), verdict = FbmSync.approvalDecide(gate, fingerprint);
  if (verdict === 'no_pending') { return { ok: false, code: 'PUSH_APPROVAL_NOT_REQUIRED', message: 'Không có tập bản ghi nào đang chờ chấp thuận.', status: FbmSync.statusView(), notices: noticeList() }; }
  if (verdict === 'stale') { return { ok: false, code: 'PUSH_APPROVAL_STALE', message: 'Tập bản ghi chờ đẩy đã đổi từ lúc hiện thông báo; hãy xem lại số bản ghi rồi chấp thuận lại.', status: FbmSync.statusView(), notices: noticeList() }; }
  FbmSync.pushGateWrite(Object.assign({}, gate, { approvedFingerprint: fingerprint }));
  noticeResolve(FbmSync.PUSH_APPROVAL_TOPIC, '');
  logEvent({ source: 'fbm_sync', action: 'push_batch_approved', outcome: LOG_OK, reason: 'Người dùng chấp thuận ' + Number(gate.count || 0) + ' bản ghi chờ đẩy; lượt đồng bộ kế đẩy đúng tập này.', detail: { count: Number(gate.count || 0), fingerprint: fingerprint } });
  return { ok: true, code: 'PUSH_APPROVED', message: 'Đã chấp thuận ' + Number(gate.count || 0) + ' bản ghi; lượt đồng bộ kế sẽ đẩy lên FBM.', status: FbmSync.statusView(), notices: noticeList() };
};

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
