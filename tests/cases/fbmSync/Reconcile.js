/** Kiểm tra missing, tombstone, khóa và ứng viên push. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");
const { taoBoTest } = require('./Sidebar');

async function chay(so) {
  section("FBM sync — reconcile và candidate");
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  const edges = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  const reconcileLogs = [];
  edges.logEvent = (event) => reconcileLogs.push(event);
  edges.LOG_OK = 'ok'; edges.LOG_WARN = 'warn'; edges.LOG_ERROR = 'error'; edges.LOG_CONFLICT = 'conflict';
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/SheetSave.js');
  edges.FbmSync.readCategoryGate = () => gate;
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh', edges.FbmSync.normalize('/Date(1757386800000+0700)/'), edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint', edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'), edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'));
  check(so, 'conflict map Activity details ve content noi bo', edges.FbmSync.conflictLocalField('activity', 'details'), 'content');
  check(so, 'conflict map Activity end_date ve workDate noi bo', edges.FbmSync.conflictLocalField('activity', 'end_date'), 'workDate');
  check(so, 'conflict map Customer ten_kh ve companyName noi bo', edges.FbmSync.conflictLocalField('customer', 'ten_kh'), 'companyName');
  edges.PropertiesService = { getDocumentProperties: () => ({ getProperty: () => '' }) };
  edges.FbmSync.accountSettingsRead = () => ({ activitySince: '2024-10-07' });
  const refresh = edges.FbmSync.conflictRefreshRequest('activity', { id: 'ACT-1', fbmId: '174813' });
  check(so, 'conflict dựng request đọc lại đúng Activity FBM, không bị giới hạn bởi mốc', [refresh.meta.kind, refresh.meta.entity, refresh.body.externalKey[0].Name, refresh.body.externalKey[0].Value, refresh.body.filter], ['conflict_refresh_grid', 'activity', 'id', '174813', []]);
  edges.FbmSync.testScopeCodes = () => ['ALT00010'];
  const customerRefresh = edges.FbmSync.conflictRefreshRequest('customer', { id: 'CUS-NEW', fbmId: 'A000080352' });
  check(so, 'FBM-052: conflict đọc lại Customer đích danh theo ID FBM, không gắn lọc mã khách thử nên khách mới tạo mã khác vẫn đọc được', customerRefresh.body.externalKey.map((key) => key.Name + '=' + key.Value), ['stt_rec_kh=A000080352']);
  edges.PropertiesService = { getDocumentProperties: () => ({ getProperty: () => '' }) };

  let lockedWrite = false;
  const lockedState = { mode: 'write', metadata: { seen: { customer: {}, activity: {} } }, locks: { 'customer:CUS-000010': { owner: 'user', revision: 'r1' } } };
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
  edges.FbmSync.scriptSettings = () => ({ testCodes: null });
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
  edges.FbmSync.stateRead = () => ({ metadata: { seen: { customer: {}, activity: {} } }, locks: {} });
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
  const invalidState = { runId: 'invalid-activity', phase: 'pull_activity', entity: 'activity', cursor: { kind: 'activity_grid', index: 2 }, session: { customerAuthorized: '', activityAuthorized: '', expired: false }, metadata: { seen: { customer: {}, activity: {} }, conflicts: [] }, locks: {}, counts: { total: 1, completed: 0, succeeded: 0, skipped: 0, conflict: 0, error: 0 }, message: '', lastError: '' };
  edges.FbmSync.stateRead = () => invalidState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(invalidState, next); return invalidState; };
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate);
  const invalidActivityResult = edges.FbmSync.pullWrite('activity', [invalidActivity]);
  const invalidActivityUi = taoBoTest();
  invalidActivityUi.hop.fbmSyncPaint(edges.FbmSync.statusView());
  check(so, 'Activity missing Sidebar có thông báo lỗi', invalidActivityUi.content.textContent.indexOf('lỗi') >= 0 || invalidActivityUi.content.textContent.indexOf('ngày') >= 0, true);
  check(so, 'Activity thiếu ngày bị chặn an toàn và không ghi Log từng record', [invalidActivityResult.written, reconcileLogs.some((event) => event.action === 'pull_record')], [0, false]);
  const validActivity = edges.FbmSync.activityRecord({ id: 91, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Đủ ngày', end_date: '/Date(1757386800000)/' }, gate);
  const mixedActivityResult = edges.FbmSync.pullWrite('activity', [validActivity, invalidActivity]);
  check(so, 'Activity hợp lệ vẫn được ghi khi cả thiếu ngày cùng lô', [mixedActivityResult.written, activityPullWrite.records.some((record) => String(record.fbmId) === '91'), reconcileLogs.some((event) => event.action === 'pull_record')], [1, true, false]);

  const conflictRawBase = { stt_rec_kh: 'FBM-CONFLICT', ma_kh: 'ALT00015', ten_kh: 'Ten goc', ma_so_thue: '010015', dien_thoai: '090015', dc_lh: 'Ha Noi' };
  const conflictState = { runId: 'conflict-run', mode: 'read', phase: 'conflict', entity: 'customer', cursor: { kind: 'customer_grid', index: 4 }, session: { customerAuthorized: '', activityAuthorized: '', expired: false }, metadata: { seen: { customer: {}, activity: {} }, conflicts: [] }, locks: {}, counts: { total: 0, completed: 0, succeeded: 0, skipped: 0, conflict: 0, error: 0 } };
  const conflictLocal = { id: 'CUS-CONFLICT', fbmId: 'FBM-CONFLICT', fbmCustomerCode: 'ALT00015', companyName: 'Ten Shin moi', taxNumber: '010015', phone: '090015', address: 'Ha Noi', fbmHash: edges.FbmSync.hash(conflictRawBase, 'customer', gate), syncStatus: edges.FbmSync.SYNC_STATUS.synced };
  edges.FbmSync.stateRead = () => conflictState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(conflictState, next); return conflictState; };
  edges.FbmSync.readLocal = () => [conflictLocal];
  edges.writeGateSave = () => ({ ok: true });
  const conflictIncoming = edges.FbmSync.customerRecord(Object.assign({}, conflictRawBase, { ten_kh: 'Ten FBM moi' }), gate);
  const conflictResult = edges.FbmSync.pullWrite('customer', [conflictIncoming]);
  const conflictUi = taoBoTest();
  conflictUi.hop.fbmSyncPaint(edges.FbmSync.statusView());
  check(so, 'Conflict Sidebar hiển thị cho quyết định', conflictUi.content.textContent.toLowerCase().indexOf('xung đột') >= 0 || conflictUi.content.textContent.toLowerCase().indexOf('quyết định') >= 0, true);
  check(so, 'conflict hai phía giữ nguyên record và chờ quyết định, không cất bản ghi vào danh sách trong state', [conflictResult.conflicts, (conflictState.metadata.conflicts || []).length, reconcileLogs.some((event) => event.action === 'pull_record')], [1, 0, false]);

  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmSyncPermission: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', {});
  const failedState = { metadata: { pushFailures: { 'customer:C-FAIL': failedHash } } };
  edges.FbmSync.stateRead = () => failedState;
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', edges.FbmSync.pushCandidates('customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', edges.FbmSync.pushCandidates('customer').length, 1);

  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', {});
  const notAppliedState = { metadata: { seen: { customer: {}, activity: {} } }, locks: {} };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord(oldFbm, {})]);
  check(so, 'FBM khong doi sau push thanh notApplied, chặn đẩy bằng trạng thái Sheet thay vì khóa trong state', [notApplied.skipped, notAppliedWrite.records[0].syncStatus, Object.keys(notAppliedState.locks)], [1, edges.FbmSync.SYNC_STATUS.notApplied, []]);

  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  pushed.FbmSync.readCategoryGate = () => gate;
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', fbmSyncPermission: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  check(so, 'bản ghi đã đẩy chờ xác nhận không bị đẩy lặp', pushed.FbmSync.pushCandidates('customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', fbmSyncPermission: 'Cấm đồng bộ' }]
    : [{ id: 'ACT-STOP', customerId: 'CUS-PARENT', fbmSyncPermission: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer ngừng đồng bộ chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', fbmSyncPermission: 'Chỉ lấy từ FBM' }]
    : [{ id: 'ACT-NO-PERM', customerId: 'CUS-PARENT', fbmSyncPermission: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer chưa cho phép chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: '', fbmCustomerCode: 'ALT-PARENT', fbmSyncPermission: 'Cho phép' }]
    : [{ id: 'ACT-NO-ID', customerId: 'CUS-PARENT', fbmSyncPermission: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer thiếu FBM ID chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);

  pushed.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-KEEP', fbmId: 'FBM-1' }] : [];
  check(so, 'beforeHardDelete chan xoa cung record co FBM ID', pushed.beforeHardDelete('customer', 'CUS-KEEP').allowed, false);
  check(so, 'beforeHardDelete cho xoa cung record chua co FBM ID', pushed.beforeHardDelete('customer', 'CUS-MISSING').allowed, true);
}

module.exports = { chay };
