/** Chặn cấu hình chiều đẩy: thiếu tên tài khoản đã xác minh, thiếu tiền tố hoặc độ dài mã khách khi tạo Customer. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

function chay(so) {
  section('FBM sync — cấu hình chặn đẩy');
  const guards = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService() });
  napServer(guards, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  check(so, 'push config chan khi phien chua co ten day du cua tai khoan da xac minh',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }),
    'Phiên FBM chưa có tên đầy đủ của tài khoản đã xác minh; chiều đẩy đã bị dừng.');
  check(so, 'push config chan tao Customer khi thieu prefix va do dai ma khach',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh' }),
    'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.');
  check(so, 'push config cho phep tao Customer khi du prefix va do dai ma khach',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' }),
    '');
  check(so, 'push config cho activity sua khi account co',
    guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }),
    '');

  return so;
}

module.exports = { chay };
