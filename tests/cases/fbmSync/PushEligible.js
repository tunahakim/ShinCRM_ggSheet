/** Phép xét một dòng của chặng đẩy (`pushEligible`), quyền đồng bộ, người phụ trách, và preflight đếm đúng tập mà chặng đẩy dựng. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../../lib/load-gas');

async function chay(so) {
  section('FBM sync — phép xét đẩy');
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: { customer: {} }, shinCorePreflight: () => ({ category: { categories: {} }, issues: [] }) });
  napServer(hop, 'server/gate/IdGate.js', 'fbm_sync/transport/Budget.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/report/PreflightPush.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js');
  const F = hop.FbmSync, S = F.SYNC_STATUS;

  // Năm giá trị cố định, so khớp đúng chữ; ô trống hoặc sai thì không đẩy, vẫn kéo về, và bị cảnh báo kèm mã.
  const quyen = (value, entity, parent) => { const r = F.syncPermission({ fbmSyncPermission: value }, entity || 'customer', parent); return [r.push, r.pull, r.invalid]; };
  check(so, 'Cho phép đồng bộ FBM: năm giá trị cố định cho đúng quyền đẩy/kéo; ô trống, sai chữ hoặc lệch hoa thường là không hợp lệ: không đẩy, vẫn kéo',
    [quyen('Cho phép'), quyen('Chỉ lấy từ FBM'), quyen('Chờ đồng bộ'), quyen('Không đồng bộ'), quyen('Cấm đồng bộ'), quyen(''), quyen('cho phép'), quyen('Ngừng đồng bộ'), F.pullDefaultPermission()],
    [[true, true, false], [false, true, false], [false, false, false], [false, false, false], [false, false, false], [false, true, true], [false, true, true], [false, true, true], 'Cho phép']);
  check(so, 'Activity bị chặn theo Customer cha: cha chỉ lấy thì con không đẩy, cha cấm thì con không kéo',
    [quyen('Cho phép', 'activity', { fbmSyncPermission: 'Chỉ lấy từ FBM' }), quyen('Cho phép', 'activity', { fbmSyncPermission: 'Cấm đồng bộ' })], [[false, true, false], [false, false, false]]);
  check(so, 'ownerCheck: thiếu tên tài khoản là lỗi (không cho qua khi chưa biết); giao dịch chưa có người phụ trách thuộc tài khoản đang đẩy',
    [/Chưa có tên tài khoản/.test(F.ownerCheck({ owner: '' }, '')), /Chưa có tên tài khoản/.test(F.ownerCheck({ owner: 'A' }, '  ')), F.ownerCheck({ owner: '' }, 'A'), F.ownerCheck({ owner: ' A ' }, 'A'), /khác tài khoản/.test(F.ownerCheck({ owner: 'B' }, 'A'))],
    [true, true, '', '', true]);

  hop.FbmSync.scriptSettings = () => ({ accountName: 'Owner đúng', customerPrefix: 'KH', customerCodeLength: '5' });
  hop.FbmSync.scope = () => null;
  hop.FbmSync.readCategoryGate = () => ({ map: { '@CAT_CONG_VIEC\u001fGọi điện': 'GD', '@CAT_TINH_THANH\u001fHà Nội': '01', '@CAT_NGUON_KH\u001fWeb': 'WEB' }, valid: null });
  const cp = 'Cho phép';
  const kh = (id, extra) => Object.assign({ id: id, companyName: 'Công ty ' + id, taxNumber: '0101', contactPerson: 'Anh B', phone: '0900', leadSource: 'Web', address: 'Số 1', province: 'Hà Nội', fbmSyncPermission: cp }, extra || {});
  const khach = [
    kh('CUS-A', { fbmId: 'F-A', fbmCustomerCode: 'ALT-A', fbmHash: 'cu' }),
    kh('CUS-B'),
    kh('CUS-C', { fbmId: 'F-C', fbmCustomerCode: 'ALT-C', fbmHash: 'cu', syncStatus: S.conflict }),
    kh('CUS-D', { fbmId: 'F-D', fbmCustomerCode: 'ALT-D', fbmHash: 'cu', fbmSyncPermission: 'Chỉ lấy từ FBM' }),
    kh('TMP-E')
  ];
  const gd = (id, customerId, extra) => Object.assign({ id: id, customerId: customerId, fbmId: id.replace(/\D/g, ''), fbmSyncPermission: cp, taskType: 'Gọi điện', content: 'Nội dung', workDate: '2026-09-09', fbmHash: 'cu' }, extra || {});
  const giaoDich = [gd('ACT-1', 'CUS-A'), gd('ACT-2', 'CUS-B'), gd('ACT-3', 'CUS-A', { owner: 'Người khác' }), gd('ACT-4', 'CUS-A', { taskType: 'Lạ' }), gd('ACT-5', 'CUS-D')];
  hop.FbmSync.readLocal = (entity) => entity === 'customer' ? khach : giaoDich;

  const scan = F.localScan(), context = F.pushReviewContext(F.stateRead(), scan, F.scriptSettings());
  const xet = (entity, id) => { const record = scan.records(entity).find((r) => r.id === id); const parent = entity === 'activity' ? khach.find((c) => c.id === record.customerId) : null; const v = F.pushEligible(entity, record, parent, context); return v.eligible ? v.kind : v.reason; };
  check(so, 'pushEligible: mỗi dòng một kết luận theo thứ tự lý do cố định (tạm, xung đột, quyền, cha chưa sẵn sàng...)',
    [xet('customer', 'CUS-A'), xet('customer', 'CUS-B'), xet('customer', 'CUS-C'), xet('customer', 'CUS-D'), xet('customer', 'TMP-E'), xet('activity', 'ACT-1'), xet('activity', 'ACT-2'), xet('activity', 'ACT-5')],
    ['edit', 'create', 'conflict', 'noPermission', 'temporary', 'edit', 'parentNotReady', 'noPermission']);

  // Preflight và chặng đẩy cùng một lần duyệt và cùng phép xét: tập preflight đếm phải đúng là tập chặng đẩy sẽ dựng, dòng chờ sửa tách riêng thành cảnh báo.
  const khoa = (list) => list.map((c) => c.entity + ':' + c.id);
  const day = F.pushCandidatesAll(scan, context), issues = [];
  const report = F.preflightCandidates(issues, 'write', scan);
  check(so, 'preflight đếm đúng tập ứng viên mà chặng đẩy dựng; dòng lệch người phụ trách và thiếu mã danh mục là cảnh báo, không vào số ứng viên',
    [khoa(report.candidates), khoa(day.filter((c) => !c.hold)), day.filter((c) => c.hold).map((c) => c.id + ':' + c.hold.code), issues.filter((i) => i.code === 'FBM_ACTIVITY_OWNER_MISMATCH' || i.code === 'FBM_CATEGORY_MAPPING_MISSING').length],
    [['customer:CUS-A', 'customer:CUS-B', 'activity:ACT-1'], ['customer:CUS-A', 'customer:CUS-B', 'activity:ACT-1'], ['ACT-3:owner', 'ACT-4:category'], 2]);
}

module.exports = { chay };
