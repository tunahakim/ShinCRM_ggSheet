/** Hỏi sổ người gác xóa hẳn trên dữ liệu thật mà không xóa gì: in tên người gác đã đăng ký, rồi lấy một khách có ID FBM và một khách chưa có để xem người gác giữ đúng khách nào. Chạy trong khóa tài liệu như cửa xóa thật. */
function probeHardDeleteGuards() {
  var owners = Object.keys(HARD_DELETE_GUARDS);
  var report = [(owners.indexOf('fbm_sync') >= 0 ? '✅' : '❌') + ' Sổ người gác: ' + JSON.stringify(owners)];
  return documentLockRun(function () {
    var local = FbmSync.readLocal('customer');
    var hasFbm = function (record) { return !!String(record && record.fbmId || '').trim(); };
    var linked = local.filter(hasFbm)[0], plain = local.filter(function (record) { return record && record.id && !hasFbm(record); })[0];
    var ids = [linked, plain].filter(Boolean).map(function (record) { return record.id; });
    var reasons = deleteGateAskHook('customer', ids);
    report.push(!linked ? '⚠️ Không có khách nào có ID FBM để thử' : (reasons[linked.id] ? '✅' : '❌') + ' Khách ' + linked.id + ' có ID FBM: ' + (reasons[linked.id] ? 'chỉ xóa mềm (' + reasons[linked.id] + ')' : 'sẽ bị xóa hẳn'));
    report.push(!plain ? '⚠️ Mọi khách đều có ID FBM; nhánh xóa hẳn thử bằng probeSaveGate (thêm khách mới rồi xóa hẳn)' : (!reasons[plain.id] ? '✅' : '❌') + ' Khách ' + plain.id + ' chưa có ID FBM: ' + (reasons[plain.id] ? 'bị giữ (' + reasons[plain.id] + ')' : 'được xóa hẳn'));
    return report;
  });
}
