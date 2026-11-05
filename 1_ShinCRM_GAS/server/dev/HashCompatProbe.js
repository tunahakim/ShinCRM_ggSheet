/**
 * Đếm dòng Customer/Activity có dấu vân tính bằng `FbmSync.hash` hiện tại khớp mốc `fbmHash` đã lưu trên Sheet, kèm số mốc trong sổ chờ xác nhận và sổ lỗi đẩy. Chạy sau mỗi lần đổi công thức dấu vân: dòng đang khớp mà thành lệch là dòng sẽ bị coi như đã sửa ở ShinCRM.
 * Chỉ đọc, không ghi Sheet hay kho, không gọi FBM.
 */
function fbmProbeHashCompat() {
  var scan = FbmSync.localScan(), gate = FbmSync.stateCategoryGate(FbmSync.stateRead()), report = {};
  ['customer', 'activity'].forEach(function (entity) {
    var item = { rows: 0, withBaseline: 0, matchBaseline: 0, samples: [] };
    scan.records(entity).forEach(function (record) {
      var stored = String(record.fbmHash || '').trim(), now = FbmSync.hash(record, entity, gate);
      item.rows += 1;
      if (!stored) { return; }
      item.withBaseline += 1;
      if (now === stored) { item.matchBaseline += 1; return; }
      if (item.samples.length < 10) { item.samples.push({ id: String(record.id || ''), stored: stored, now: now }); }
    });
    report[entity] = item;
  });
  report.pendingPushes = Object.keys(FbmSync.pendingPushesRead()).length;
  report.pushFailures = Object.keys(FbmSync.pushFailuresRead().hashes).length;
  return report;
}
