/** Cạnh biên của cửa ghi kéo về: bản ghi đang bị tiến trình khác giữ thì để lượt sau, giao dịch mới nối vào khách nội bộ, marker mồ côi hoặc thiếu ngày không tạo dòng, FBM không đổi sau đẩy thì chặn đẩy. */
const { section, check } = require('../../lib/assert');
const { giuBanGhi } = require('../../lib/load-gas');
const { keoVe } = require('../../lib/fbm/keo-ve');
const { hopKeoBien, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Cạnh biên của cửa ghi kéo về');
  const edges = hopKeoBien();
  const gate = congDanhMucThu();
  edges.FbmSync.readCategoryGate = () => gate;
  let lockedWrite = false;
  const lockedState = { mode: 'write', metadata: { seen: { customer: {}, activity: {} } } };
  edges.FbmSync.stateRead = () => lockedState;
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.categoryGateCheck = () => [];
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000010', fbmId: 'FBM-LOCK', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmHash: '' }];
  giuBanGhi(edges, 'khac', 'customer', 'CUS-000010');
  edges.writeGateSave = () => { lockedWrite = true; return { ok: true }; };
  const lockedPull = keoVe(edges.FbmSync, 'customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-LOCK', ma_kh: 'ALT00010', ten_kh: 'Mới' }, { map: {} })]);
  check(so, 'pull bỏ qua bản ghi tiến trình khác đang giữ trong sổ bận, để lượt sau',
    [lockedPull.written, lockedPull.skipped, lockedWrite],
    [0, 1, false]);

  let activityPullWrite;
  edges.FbmSync.stateRead = () => ({ metadata: { seen: { customer: {}, activity: {} } } });
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmId: 'S14', fbmCustomerCode: 'ALT00014' }] : [];
  edges.writeGateSave = (request) => { activityPullWrite = request; return { ok: true }; };
  const newActivity = edges.FbmSync.activityRecord({ id: 88, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Nội dung', end_date: '/Date(1757386800000)/' }, gate, { sttRec: 'S14' });
  const activityPull = keoVe(edges.FbmSync, 'activity', [newActivity]);
  check(so, 'Activity pull moi noi dung vao Customer noi bo va cho phep day',
    [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId, activityPullWrite.records[0].fbmSyncPermission],
    [1, 'CUS-ACT', 88, edges.FbmSync.pullDefaultPermission()]);
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmId: 'S14', fbmCustomerCode: 'ALT00014' }] : [];
  const orphanActivity = edges.FbmSync.activityRecord({ id: 89, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Mồ côi #SC-ACT-UNKNOWN', end_date: '/Date(1757386800000)/' }, gate, { sttRec: 'S14' });
  const orphanActivityResult = keoVe(edges.FbmSync, 'activity', [orphanActivity]);
  check(so, 'Activity marker mo coi khong tao dong moi', orphanActivityResult.written, 0);
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate, { sttRec: 'S14' });
  const invalidActivityResult = keoVe(edges.FbmSync, 'activity', [invalidActivity]);
  check(so, 'Activity thieu ngay bi chan an toan', invalidActivityResult.written, 0);
  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', { map: {} });
  const notAppliedState = { metadata: { seen: { customer: {}, activity: {} } } };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = keoVe(edges.FbmSync, 'customer', [edges.FbmSync.customerRecord(oldFbm, { map: {} })]);
  check(so, 'FBM khong doi sau push thanh notApplied, chặn đẩy bằng trạng thái Sheet',
    [notApplied.skipped, notAppliedWrite.records[0].syncStatus],
    [1, edges.FbmSync.SYNC_STATUS.notApplied]);

  return so;
}

module.exports = { chay };
