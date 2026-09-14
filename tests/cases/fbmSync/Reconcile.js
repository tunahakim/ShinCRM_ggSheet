/** Kiểm tra missing, tombstone, khóa và ứng viên push. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — reconcile và candidate");
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  const edges = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js');
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh', edges.FbmSync.normalize('/Date(1757386800000+0700)/'), edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint', edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'), edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'));
  check(so, 'conflict map Activity details ve content noi bo', edges.FbmSync.conflictLocalField('activity', 'details'), 'content');
  check(so, 'conflict map Activity end_date ve workDate noi bo', edges.FbmSync.conflictLocalField('activity', 'end_date'), 'workDate');
  check(so, 'conflict map Customer ten_kh ve companyName noi bo', edges.FbmSync.conflictLocalField('customer', 'ten_kh'), 'companyName');
  let mergedSaved = null;
  const mergedFbm = { id: 'FBM-1', fbmId: 'FBM-1', taskType: 'Gọi', content: 'Nội dung FBM', workDate: '/Date(1757386800000)/' };
  const mergedShin = { id: 'ACT-1', fbmId: 'FBM-1', taskType: 'Gọi', content: 'Nội dung Shin', workDate: '/Date(1757386800000)/' };
  const mergedState = { metadata: { conflicts: [{ entity: 'activity', id: 'ACT-1', fbmId: 'FBM-1', hFBM: edges.FbmSync.hash(mergedFbm, 'activity', {}), fields: [{ field: 'details', left: 'Nội dung Shin', right: 'Nội dung FBM' }], shinRecord: mergedShin, fbmRecord: mergedFbm }], categoryGate: {} }, counts: { conflict: 1 }, locks: { 'activity:ACT-1': { owner: 'sync' } }, phase: 'conflict' };
  edges.FbmSync.stateRead = () => mergedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(mergedState, next); return mergedState; };
  edges.writeGateSave = (request) => { mergedSaved = request.records[0]; return { ok: true }; };
  const mergedResult = edges.FbmSync.resolveConflict('activity', 'ACT-1', 'manual', { details: 'Nội dung FBM' }, true);
  check(so, 'trộn conflict đổi details về content nội bộ', [mergedResult.ok, mergedSaved && mergedSaved.content], [true, 'Nội dung FBM']);
  edges.PropertiesService = { getDocumentProperties: () => ({ getProperty: () => '' }) };
  const refresh = edges.FbmSync.conflictRefreshRequest('activity', { id: 'ACT-1', fbmId: '174813' });
  check(so, 'conflict dựng request đọc lại đúng Activity FBM', [refresh.meta.kind, refresh.meta.entity, refresh.body.externalKey[0].Name, refresh.body.externalKey[0].Value], ['conflict_refresh_grid', 'activity', 'id', '174813']);

  let lockedWrite = false;
  const lockedState = { mode: 'write', metadata: { categoryGate: {}, seen: { customer: {}, activity: {} } }, locks: { 'customer:CUS-000010': { owner: 'user', revision: 'r1' } } };
  edges.FbmSync.stateRead = () => lockedState;
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.validateIncomingCategories = () => [];
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000010', fbmId: 'FBM-LOCK', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmHash: '' }];
  edges.writeGateSave = () => { lockedWrite = true; return { ok: true }; };
  const lockedPull = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-LOCK', ma_kh: 'ALT00010', ten_kh: 'Mới' }, {})]);
  check(so, 'pull khong ghi record dang bi user khoa', [lockedPull.written, lockedPull.skipped, lockedWrite], [0, 1, false]);

  let missingWrite = false;
  const missingState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: { 'customer:CUS-000011': { owner: 'user' } } };
  edges.FbmSync.stateRead = () => missingState;
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000011', fbmId: 'FBM-MISSING', recordStatus: 'active' }];
  edges.writeGateSave = () => { missingWrite = true; return { ok: true }; };
  check(so, 'missing scan bo qua record dang user sua', [edges.FbmSync.markMissingAfterFullScan('customer', missingState).written, missingWrite], [0, false]);
  let missingBatch;
  const fullScanState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: {} };
  edges.FbmSync.scriptSettings = () => ({ testCustomerCode: '' });
  edges.FbmSync.stateRead = () => fullScanState;
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000011', fbmId: 'FBM-MISSING', recordStatus: 'active' }, { id: 'CUS-000012', fbmId: 'FBM-TOMBSTONE', recordStatus: 'deleted' }];
  edges.writeGateSave = (request) => { missingBatch = request; return { ok: true }; };
  const missingResult = edges.FbmSync.markMissingAfterFullScan('customer', fullScanState);
  check(so, 'Customer vang chi danh dau missing va bo qua tombstone', [missingResult.written, missingBatch.records.length, missingBatch.records[0].id, missingBatch.records[0].syncStatus], [1, 1, 'CUS-000011', edges.FbmSync.SYNC_STATUS.missing]);
  let activityMissingBatch;
  edges.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-000021', fbmId: 'ACT-MISSING', recordStatus: 'active' }, { id: 'ACT-000022', fbmId: 'ACT-TOMBSTONE', recordStatus: 'deleted' }]
    : [];
  edges.writeGateSave = (request) => { activityMissingBatch = request; return { ok: true }; };
  const activityMissingResult = edges.FbmSync.markMissingAfterFullScan('activity', fullScanState);
  check(so, 'Activity vang trong bulk chi danh dau missing khong xoa cung', [activityMissingResult.written, activityMissingBatch.records[0].id, activityMissingBatch.records[0].syncStatus, activityMissingBatch.records.length], [1, 'ACT-000021', edges.FbmSync.SYNC_STATUS.missing, 1]);
  let activityPullWrite;
  edges.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate, seen: { customer: {}, activity: {} } }, locks: {} });
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  edges.writeGateSave = (request) => { activityPullWrite = request; return { ok: true }; };
  const newActivity = edges.FbmSync.activityRecord({ id: 88, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Nội dung', end_date: '/Date(1757386800000)/' }, gate);
  const activityPull = edges.FbmSync.pullWrite('activity', [newActivity]);
  check(so, 'Activity pull moi noi dung vao Customer noi bo', [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId], [1, 'CUS-ACT', 88]);
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  const orphanActivity = edges.FbmSync.activityRecord({ id: 89, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Mồ côi #SC-ACT-UNKNOWN', end_date: '/Date(1757386800000)/' }, gate);
  const orphanActivityResult = edges.FbmSync.pullWrite('activity', [orphanActivity]);
  check(so, 'Activity marker mo coi khong tao dong moi', orphanActivityResult.written, 0);
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate);
  const invalidActivityResult = edges.FbmSync.pullWrite('activity', [invalidActivity]);
  check(so, 'Activity thieu ngay bi chan an toan', invalidActivityResult.written, 0);

  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', allowFbmPush: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', {});
  const failedState = { metadata: { categoryGate: {}, pushFailures: { 'customer:C-FAIL': failedHash } } };
  edges.FbmSync.stateRead = () => failedState;
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', edges.FbmSync.pushCandidates('customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', edges.FbmSync.pushCandidates('customer').length, 1);

  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', allowFbmPush: 'Chưa cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', {});
  const notAppliedState = { metadata: { categoryGate: {}, seen: { customer: {}, activity: {} } }, locks: {} };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord(oldFbm, {})]);
  check(so, 'FBM khong doi sau push thanh notApplied va khoa record', [notApplied.skipped, notAppliedWrite.records[0].syncStatus, notAppliedState.locks['customer:C-PUSHED'].reason], [1, edges.FbmSync.SYNC_STATUS.notApplied, 'not_applied']);

  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js');
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', allowFbmPush: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  check(so, 'bản ghi đã đẩy chờ xác nhận không bị đẩy lặp', pushed.FbmSync.pushCandidates('customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Ngừng đồng bộ' }]
    : [{ id: 'ACT-STOP', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer ngừng đồng bộ chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Chưa cho phép' }]
    : [{ id: 'ACT-NO-PERM', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer chưa cho phép chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: '', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Cho phép' }]
    : [{ id: 'ACT-NO-ID', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer thiếu FBM ID chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);

  pushed.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-KEEP', fbmId: 'FBM-1' }] : [];
  check(so, 'beforeHardDelete chan xoa cung record co FBM ID', pushed.beforeHardDelete('customer', 'CUS-KEEP').allowed, false);
  check(so, 'beforeHardDelete cho xoa cung record chua co FBM ID', pushed.beforeHardDelete('customer', 'CUS-MISSING').allowed, true);
}

module.exports = { chay };
