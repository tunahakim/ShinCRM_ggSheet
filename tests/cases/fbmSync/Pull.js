/** Kiểm tra pull Customer/Activity, identity, hash và missing. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");
const fs = require("fs");
const path = require("path");

async function chay(so) {
  section("FBM sync — pull và identity");
  const builders = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => ({ FBM_SYNC_TEST_CUSTOMER_CODE: 'ALT00010' }[key] || ''), setProperty: () => {} }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js');
  check(so, 'mode tach quyen ghi Sheet khoi quyen ghi FBM', [
    builders.FbmSync.canWriteSheet('check'), builders.FbmSync.canWriteFbm('check'),
    builders.FbmSync.canWriteSheet('read'), builders.FbmSync.canWriteFbm('read'),
    builders.FbmSync.canWriteSheet('push'), builders.FbmSync.canWriteFbm('push'),
    builders.FbmSync.canWriteSheet('write'), builders.FbmSync.canWriteFbm('write')
  ], [false, false, true, false, false, true, true, true]);
  let readModeState = { mode: 'read', counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 } };
  let readModeSheetWrites = 0;
  const realPullWrite = builders.FbmSync.pullWrite;
  builders.FbmSync.stateRead = () => readModeState;
  builders.FbmSync.stateWrite = (next) => { readModeState = next; return next; };
  builders.FbmSync.pullWrite = (entity, records) => { readModeSheetWrites += 1; return { ok: true, written: records.length, conflicts: 0, skipped: 0 }; };
  const readModeResult = builders.FbmSync.pullRecords('customer', [{ id: 'CUS-000001' }], 'read');
  check(so, 'mode read ghi ket qua pull vao ShinCRM nhung khong co quyen ghi FBM', [readModeResult.written, readModeSheetWrites, readModeState.counts.succeeded, builders.FbmSync.canWriteFbm('read')], [1, 1, 1, false]);
  builders.FbmSync.pullWrite = realPullWrite;
  const transportSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8');
  check(so, 'khong con co ghi FBM an ngoai mode va cac cong an theo co cu', transportSource.indexOf('FBM_SYNC_ALLOW_WRITES') < 0 && transportSource.indexOf('writeAllowed') < 0, true);

  let readFinishState = {
    runId: 'read-run', origin: 'manual', mode: 'read', scan: 'full', phase: 'pull_customer', entity: 'customer',
    cursor: { kind: 'customer_grid' }, activeRequestId: 'read-request', deadlineAt: Date.now() + 60000,
    lastProgressAt: Date.now(), session: {}, metadata: { categoryGate: {} },
    counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }
  };
  let readFinishMissing = 0;
  let readFinishPushRequests = 0;
  const readFinish = taoHopCat({
    FbmSync: {
      stateRead: () => readFinishState,
      stateWrite: (next) => { readFinishState = next; return next; },
      recoverStaleRun: (state) => ({ state, recovered: false }),
      responseRequestId: () => 'read-request',
      protocol: { parse: (value) => value, assertSuccess: () => ({ ok: true }) },
      traceImport: () => {}, traceEvent: () => {}, traceResponse: () => ({}), applyTransportSession: () => false,
      rowsToRecords: () => ({ rows: [], fields: [], total: 0 }), isTemporaryRecord: () => false,
      pullWrite: () => ({ ok: true, written: 0, conflicts: 0, skipped: 0 }), previewRecords: () => {}, customerNext: () => null, activityForCustomers: () => null,
      canWriteSheet: (mode) => mode === 'read' || mode === 'write', canWriteFbm: (mode) => mode === 'push' || mode === 'write',
      markMissingAfterFullScan: () => { readFinishMissing += 1; return { written: 0 }; },
      stopPushOnConflicts: () => false, nextPushRequest: () => { readFinishPushRequests += 1; return {}; },
      statusView: () => ({ phase: readFinishState.phase, mode: readFinishState.mode })
    }
  });
  napServer(readFinish, 'fbm_sync/transport/PullFlow.js');
  const readFinished = readFinish.FbmSync.continue({ transport: { trace: [{ requestId: 'read-request' }] } });
  check(so, 'mode read ket thuc pull thi ghi missing vao Sheet va khong mo chieu push FBM', [readFinished.ok, readFinishState.phase, readFinishMissing, readFinishPushRequests], [true, 'done', 2, 0]);
  builders.FbmSync.stateRead = () => ({ session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } });
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  let recoveryWrite;
  let recoveryState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: { categoryGate: gate }, locks: { 'activity:ACT-9': { owner: 'sync' } } };
  builders.FbmSync.stateRead = () => recoveryState;
  builders.FbmSync.stateWrite = (next) => { recoveryState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: '', customerId: 'KH-1', syncStatus: builders.FbmSync.SYNC_STATUS.pushing }];
  builders.writeGateSave = (request) => { recoveryWrite = request; return { ok: true }; };
  const recovered = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 77, ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9' }, gate)], 'write');
  check(so, 'Activity marker recovery vá FBM ID không tạo dòng mới', [recovered.written, recoveryWrite.records[0].id, recoveryWrite.records[0].fbmId, recoveryState.locks['activity:ACT-9']], [1, 'ACT-9', '77', undefined]);
  let markerConflictWrite, markerState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: { categoryGate: gate, seen: { customer: {}, activity: {} }, conflicts: [] }, locks: { 'activity:ACT-9': { owner: 'sync' } }, counts: { conflict: 0 } };
  builders.FbmSync.stateRead = () => markerState;
  builders.FbmSync.stateWrite = (next) => { markerState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash' }];
  builders.writeGateSave = (request) => { markerConflictWrite = request; return { ok: true }; };
  const markerConflict = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate)]);
  check(so, 'Activity marker trỏ FBM ID khác tạo conflict và khóa', [markerConflict.conflicts, markerState.metadata.conflicts.length, markerConflictWrite.records[0].syncStatus, markerState.locks['activity:ACT-9'].owner], [1, 1, builders.FbmSync.SYNC_STATUS.conflict, 'sync']);
  const edit = builders.FbmSync.customerEditRequest({ fbmId: 'A1', companyName: 'Đổi tên' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Cũ', dien_thoai: '0123' }, gate);
  check(so, 'Customer sửa giữ OldValue field không đụng tới', edit.body.memvars.filter((item) => item.Name === 'dien_thoai')[0].NewValue, '0123');
  check(so, 'fixture session giữ cookie và userId', [builders.FbmSync.stateRead().session.cookie, builders.FbmSync.stateRead().session.userId], ['461020379855cFHN_CRM_App', '2037']);
  check(so, 'Customer grid gắn điều kiện phân quyền theo userId trong payload cookie', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[0].Name, "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1");
  const customerGridKeys = builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey;
  check(so, 'Customer grid giới hạn đúng mã live test', [customerGridKeys.length, customerGridKeys[1] && customerGridKeys[1].Value], [2, 'ALT00010']);

  const bulkActivity = builders.FbmSync.activityBulkRequest({ type: 0 });
  check(so, 'Bulk Activity không gắn mốc thời gian hay Customer đơn lẻ', [bulkActivity.meta.kind, bulkActivity.body.externalKey.some((item) => item.Name === 'end_date' && item.Opr === '>='), bulkActivity.body.externalKey.some((item) => item.Name === 'stt_rec')], ['activity_bulk_grid', false, false]);
  const activityMissing = builders.FbmSync.activityBulkMissing([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'TMP-3', fbmId: 'F-3', recordStatus: 'active' }], { 'F-1': true });
  check(so, 'Bulk Activity chỉ trả dòng active vắng ID FBM', [activityMissing.length, activityMissing[0] && activityMissing[0].id, activityMissing[0] && activityMissing[0].syncStatus], [0, undefined, undefined]);
  const activityMissingOnly = builders.FbmSync.activityBulkMissing([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'A-4', fbmId: 'F-4', recordStatus: 'active' }, { id: 'TMP-3', fbmId: 'TMP-F-3', recordStatus: 'active' }], { 'F-1': true });
  check(so, 'Bulk Activity vắng được đánh dấu missing khi ID không xuất hiện', [activityMissingOnly.length, activityMissingOnly[0].id, activityMissingOnly[0].syncStatus], [1, 'A-4', builders.FbmSync.SYNC_STATUS.missing]);
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn', builders.FbmSync.validateLookupGate(lookupState, lookupGate).length, 0);

  let bulkState = { mode: 'read', scan: 'activity_bulk', phase: 'pull_activity', entity: 'activity', metadata: {}, cursor: {} };
  builders.FbmSync.stateRead = () => bulkState;
  builders.FbmSync.stateWrite = (next) => { bulkState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'ACT-000001', fbmId: 'F-LOCAL', recordStatus: 'active' }];
  const bulkStart = builders.FbmSync.beginActivityBulkPull(bulkState);
  bulkState.cursor.count = 1;
  check(so, 'Bulk Activity khoi tao cursor ben vung va request khong gan Customer', [bulkState.cursor.kind, bulkStart.meta.kind, bulkStart.body.externalKey.some((item) => item.Name === 'stt_rec')], ['activity_bulk_grid', 'activity_bulk_grid', false]);
  const bulkNext = builders.FbmSync.activityBulkNext(bulkState, { rows: [{ id: 'F-1', end_date: '2026-09-09', datetime0: '2026-09-09T01:00:00', line_nbr: 1 }], total: 2 });
  check(so, 'Bulk Activity tiep tuc bang composite key ma khong nhet ID vao cursor', [bulkNext.meta.kind, bulkNext.body.type, bulkNext.body.gridPageValue, bulkState.cursor.seenIds], ['activity_bulk_grid', 1, ['2026-09-09', '2026-09-09T01:00:00', 'F-1', 1], undefined]);
  const bulkDone = builders.FbmSync.activityBulkNext(bulkState, { rows: [{ id: 'F-2', end_date: '2026-09-10', datetime0: '2026-09-10T01:00:00', line_nbr: 1 }], total: 2 });
  check(so, 'Bulk Activity ket thuc, luu ID local vang va chuyen sang vong xoay Customer', [bulkDone && bulkDone.meta.kind, bulkState.cursor.kind, bulkState.metadata.activityBulkMissing.length, bulkState.metadata.activityBulkMissing[0].fbmId], ['activity_rotation_customer_grid', 'activity_rotation_customer_grid', 1, 'F-LOCAL']);
  const finishedSupplementState = { cursor: { kind: 'activity_grid' }, phase: 'pull_activity', entity: 'activity', metadata: {}, session: {} };
  check(so, 'Trang thai done xoa cursor Activity da ket thuc', [builders.FbmSync.activitySupplementNext(finishedSupplementState, { kind: 'done', rows: [] }), finishedSupplementState.phase, finishedSupplementState.cursor], [null, 'done', {}]);

  builders.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'A-NEW', fbmId: 'F-NEW', workDate: '2026-09-10' }] : [];
  const catchup = builders.FbmSync.activityCatchupCustomerRequest();
  check(so, 'Lop catchup tao Customer grid theo ngay_gd moi hon Activity local', [catchup.meta.kind, catchup.meta.activityMaxDate, catchup.body.externalKey.some((item) => item.Name === 'ngay_gd' && item.Opr === '>')], ['activity_catchup_customer_grid', '2026-09-10', true]);

  const identityCheckState = { session: { userId: '2037', accountName: 'ANHLT' }, metadata: {} };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }, { id: 'CUS-2', fbmId: 'FBM-2', fbmCustomerCode: 'ALT00011' }];
  builders.FbmSync.identityCheckBegin(identityCheckState);
  builders.FbmSync.identityCheckPage(identityCheckState, [{ stt_rec_kh: 'FBM-1' }, { stt_rec_kh: 'FBM-OTHER' }]);
  const identityCheckResult = builders.FbmSync.identityCheckFinish(identityCheckState);
  const identityCheckRequest = builders.FbmSync.identityCheckCustomerRequest({ type: 0 });
  check(so, 'Kiem tra lien ket Customer chi doc ID da lien ket va tra n/N', [identityCheckResult.total, identityCheckResult.matched, identityCheckResult.missing, identityCheckResult.missingSample[0].fbmId, identityCheckRequest.body.externalKey.some((item) => item.Name === 'ma_kh'), identityCheckRequest.body.sortExpression], [2, 1, 1, 'FBM-2', false, 'stt_rec_kh']);
  let identityFlowState = { mode: 'check', scan: 'identity_check', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037' }, metadata: {} };
  builders.FbmSync.stateRead = () => identityFlowState;
  builders.FbmSync.stateWrite = (next) => {
    var fallback = builders.FbmSync.stateDefault();
    identityFlowState = Object.assign(fallback, next || {}, {
      session: Object.assign(fallback.session, next && next.session || {}),
      metadata: Object.assign(fallback.metadata, next && next.metadata || {}),
      counts: Object.assign(fallback.counts, next && next.counts || {})
    });
    return identityFlowState;
  };
  builders.FbmSync.extractAuthorized = () => 'auth-customer';
  builders.FbmSync.extractSessionIdentity = () => ({ userId: '2037', accountName: 'ANHLT' });
  const identityStarted = builders.FbmSync.authContinue('customer', {});
  check(so, 'Identity check sau authorize chi mo Customer grid, khong mo Activity', [identityStarted.meta.kind, identityFlowState.scan, identityFlowState.phase, identityFlowState.metadata.identityCheck.total], ['grid', 'identity_check', 'pull_customer', 2]);
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const identityProbeStarted = builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' });
  const identityUserRequest = identityProbeStarted.request;
  check(so, 'Identity probe chi doc User grid, khong lay Authorized thua', [identityProbeStarted.ok, identityUserRequest.meta.kind, identityFlowState.phase, identityFlowState.cursor.kind, identityUserRequest.body.controller], [true, 'identity_user_grid', 'checking_session', 'identity_user_grid', 'User']);
  const identityProbeFinished = builders.FbmSync.continue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }, Authorized: true }, transport: { trace: [{ requestId: identityUserRequest.id }] } });
  check(so, 'Identity probe nhan dien du ma so va ten day du, cho xac nhan luu', [identityProbeFinished.ok, identityFlowState.phase, identityFlowState.cursor, identityFlowState.metadata.identityProbe.userId, identityFlowState.metadata.identityProbe.accountName], [true, 'done', {}, '2037', 'Le Tuan Anh']);
  check(so, 'Identity probe thieu dong User thi fail ro rang', builders.FbmSync.identityUser({ d: { Rows: [], ViewPage: { Fields: [{ AliasName: 'id' }] } } }).code, 'IDENTITY_PROBE_INCOMPLETE');

  let identityWrite;
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmId: 'OLD-ID', fbmCustomerCode: 'ALT99999', companyName: 'Cũ' }] : [];
  builders.writeGateSave = (request) => { identityWrite = request; return { ok: true }; };
  const identityIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-ID', ma_kh: 'ALT99999', ten_kh: 'Mới' }, gate);
  const identityResult = builders.FbmSync.pullWrite('customer', [identityIncoming]);
  check(so, 'Customer lech stt_rec_kh van cap nhat dung dong theo ma_kh', [identityResult.written, identityWrite.records[0].id, identityWrite.records[0].fbmId], [1, 'CUS-1', 'NEW-ID']);

  let taxWrite;
  let taxState = { metadata: { categoryGate: gate } };
  builders.FbmSync.stateRead = () => taxState;
  builders.FbmSync.stateWrite = (next) => { taxState = next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST', taxNumber: '010.012 3456', fbmId: '', fbmCustomerCode: '', note: 'Nội bộ' }];
  builders.writeGateSave = (request) => { taxWrite = request; return { ok: true }; };
  const taxIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'MST-ID', ma_kh: 'ALT00011', ma_so_thue: '0100123456', ten_kh: 'FBM cùng MST' }, gate);
  const taxResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer cùng MST nối vào dòng ShinCRM chưa liên kết', [taxResult.written, taxWrite.records[0].id, taxWrite.records[0].fbmId, taxWrite.records[0].note], [1, 'CUS-MST', 'MST-ID', 'Nội bộ']);

  let ambiguousWrite = false;
  taxState = { metadata: { categoryGate: gate } };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST-1', taxNumber: '0100123456' }, { id: 'CUS-MST-2', taxNumber: '0100123456' }];
  builders.writeGateSave = () => { ambiguousWrite = true; return { ok: true }; };
  const ambiguousResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi', [ambiguousResult.written, ambiguousResult.skipped, ambiguousWrite, taxState.metadata.identityBlocks[0].reason], [0, 1, false, 'duplicate_tax_number']);
  let baselineWrite;
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.readLocal = () => [{ id: 'CUS-BASE', fbmId: 'FBM-BASE', companyName: 'Baseline' }];
  builders.writeGateSave = (request) => { baselineWrite = request; return { ok: true }; };
  const baselineResult = builders.FbmSync.recalculateBaseline('customer');
  check(so, 'tinh lai baseline chi ghi cot sync noi bo', [baselineResult.ok, baselineResult.written, baselineWrite.records[0].fbmHash !== '', baselineWrite.source], [true, 1, true, 'pull']);
  let newPullWrite, newPullCalls = 0, dirtyIds = [];
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.readLocal = () => [];
  builders.dirtyStateMarkRecords = (ids) => { dirtyIds = ids; };
  builders.writeGateSave = (request) => { newPullCalls += 1; newPullWrite = request; return { ok: true, fields: ['id'], rows: [['CUS-NEW']] }; };
  const newPullResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-C', ma_kh: 'ALT00012', ten_kh: 'Khách mới', ma_so_thue: '001' }, gate)]);
  check(so, 'Customer pull moi ghi ca dinh danh baseline dirty marker va quyen day', [newPullResult.written, newPullWrite.source, newPullWrite.schemas.length, newPullWrite.records[0].fbmId, newPullWrite.records[0].fbmHash !== '', dirtyIds[0], newPullWrite.records[0].parentCompanyName, newPullWrite.records[0].allowFbmPush], [1, 'pull', 2, 'NEW-C', true, 'CUS-NEW', '', builders.FbmSync.PUSH_ALLOW_VALUE]);
  check(so, 'Pull gộp nội dung và trạng thái vào một lượt cửa ghi', newPullCalls, 1);
  const pullLogs = [];
  builders.logEvent = (event) => pullLogs.push(event);
  builders.FbmSync.readLocal = () => [];
  builders.writeGateSave = () => ({ ok: true });
  builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'LOG-C', ma_kh: 'ALT00015', ten_kh: 'Có log', ma_so_thue: '002' }, gate)]);
  check(so, 'Pull ghi log từng record co huong trang thai truoc sau va ly do', [pullLogs.length, pullLogs[0].action, pullLogs[0].detail.direction, pullLogs[0].detail.statusBefore, pullLogs[0].detail.statusAfter, !!pullLogs[0].reason], [1, 'pull_record', 'FBM → ShinCRM', 'chưa liên kết', builders.FbmSync.SYNC_STATUS.synced, true]);
  let reconcileWrite;
  const reconcileIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'Gốc' }, gate);
  const reconcileLocal = Object.assign({}, reconcileIncoming, { id: 'CUS-REC', syncStatus: builders.FbmSync.SYNC_STATUS.synced });
  reconcileLocal.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate }, locks: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = () => [reconcileLocal];
  builders.writeGateSave = (request) => { reconcileWrite = request; return { ok: true }; };
  const unchangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'ba hash khong doi khong ghi noi dung', [unchangedResult.written, reconcileWrite], [0, undefined]);
  builders.FbmSync.readLocal = () => [Object.assign({}, reconcileLocal, { fbmHash: '' })];
  const healedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'baseline rong tu lanh chi ghi hash', [healedResult.written, reconcileWrite.records[0].fbmHash !== '', reconcileWrite.records[0].companyName], [0, true, undefined]);
  const fbmChanged = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'FBM đổi' }, gate);
  builders.FbmSync.readLocal = () => [reconcileLocal];
  const fbmChangedResult = builders.FbmSync.pullWrite('customer', [fbmChanged]);
  check(so, 'chi FBM doi thi pull noi dung', [fbmChangedResult.written, reconcileWrite.records[0].companyName], [1, 'FBM đổi']);
  const shinChanged = Object.assign({}, reconcileLocal, { companyName: 'Shin đổi' });
  shinChanged.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.readLocal = () => [shinChanged];
  const shinChangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'chi ShinCRM doi thi khong pull de', [shinChangedResult.written, reconcileWrite.records[0].syncStatus], [0, builders.FbmSync.SYNC_STATUS.pending]);
  let conflictState = { metadata: { categoryGate: gate, conflicts: [] }, counts: { conflict: 0 } }, conflictWrite, conflictLog = [];
  builders.LOG_CONFLICT = 'conflict';
  builders.logEvent = (event) => { conflictLog.push(event); };
  builders.FbmSync.stateRead = () => conflictState;
  builders.FbmSync.stateWrite = (next) => { conflictState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-2', fbmId: 'C-2', fbmCustomerCode: 'ALT99999', companyName: 'Shin', fbmHash: builders.FbmSync.hash({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'Base' }, 'customer', gate) }];
  builders.writeGateSave = (request) => { conflictWrite = request; return { ok: true }; };
  const conflictResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'FBM' }, gate)]);
  check(so, 'conflict luu diff va khong ghi noi dung', [conflictResult.conflicts, conflictState.metadata.conflicts.length, conflictWrite.records[0].syncStatus], [1, 1, builders.FbmSync.SYNC_STATUS.conflict]);
  const conflictEntries = conflictLog.filter((event) => event.action === 'conflict');
  check(so, 'conflict ghi log diff co cau truc', [conflictEntries.length, conflictEntries[0].action, conflictEntries[0].detail.fields.length > 0], [1, 'conflict', true]);
  check(so, 'conflict tao khoa sync', conflictState.locks['customer:CUS-2'].owner, 'sync');
  check(so, 'khong cho chot conflict neu chua doc lai', builders.FbmSync.resolveConflict('customer', 'CUS-2', 'fbm').code, 'CONFLICT_REREAD_REQUIRED');
  conflictState.metadata.conflicts[0].shinRecord = builders.FbmSync.readLocal('customer')[0];
  conflictState.metadata.conflicts[0].fbmRecord = builders.FbmSync.customerRecord({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'FBM' }, gate);
  const resolved = builders.FbmSync.resolveConflict('customer', 'CUS-2', 'fbm', null, true);
  check(so, 'resolve conflict theo FBM cap nhat baseline va xoa hang doi', [resolved.ok, conflictState.metadata.conflicts.length, conflictWrite.records[0].fbmHash !== '', conflictState.locks['customer:CUS-2']], [true, 0, true, undefined]);
  conflictState.metadata.conflicts = [{ entity: 'customer', id: 'CUS-3', hFBM: 'FBM-HASH', hSHIN: 'SHIN-HASH', fbmRecord: { id: 'CUS-3', companyName: 'FBM' }, shinRecord: { id: 'CUS-3', companyName: 'Shin' } }];
  conflictState.metadata.pushFailures = { 'customer:CUS-3': 'SHIN-HASH' };
  conflictState.metadata.pushFailureDetails = { 'customer:CUS-3': { reason: 'HTTP 500' } };
  conflictState.counts.conflict = 1; conflictState.phase = 'conflict';
  const resolvedShin = builders.FbmSync.resolveConflict('customer', 'CUS-3', 'shin', null, true);
  check(so, 'resolve conflict theo ShinCRM dat baseline FBM va cho phep push', [resolvedShin.ok, resolvedShin.status, conflictWrite.records[0].fbmHash, conflictWrite.records[0].syncStatus, conflictState.metadata.pushFailures['customer:CUS-3']], [true, builders.FbmSync.SYNC_STATUS.pending, 'FBM-HASH', builders.FbmSync.SYNC_STATUS.pending, undefined]);

  const bindingStore = {};
  const identity = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => bindingStore[key] || null, setProperty: (key, value) => { bindingStore[key] = String(value); } }) }
  });
  napServer(identity, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js');
  identity.FbmSync.currentSpreadsheetId = () => 'sheet-a';
  identity.FbmSync.configValue = () => '';
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED', fbmId: 'FBM-A' }];
  check(so, 'file co FBM ID nhung chua lien ket phai yeu cau REBIND', [identity.FbmSync.identityStatus().status, identity.FbmSync.identityPreflight('read').blocking, identity.FbmSync.identityPreflight('write').blocking, identity.FbmSync.identityPreflight('background').blocking, identity.FbmSync.identityPreflight('identity_check').blocking], ['REBIND_REQUIRED', true, true, true, false]);
  const savedBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'luu lien ket dung Spreadsheet va tai khoan', [savedBinding.ok, identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status], [true, 'BOUND']);
  bindingStore[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-a', userId: 'user-a', accountName: 'Tai khoan A' });
  const legacyBeforeRead = bindingStore[identity.FbmSync.BINDING_KEY];
  const legacyStatus = identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'doc binding cu thieu username khong tu ghi nang cap', [legacyStatus.status, bindingStore[identity.FbmSync.BINDING_KEY]], ['REBIND_REQUIRED', legacyBeforeRead]);
  const upgradedLegacyBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'chi thao tac luu ro rang moi nang cap username cho binding cu', [upgradedLegacyBinding.ok, JSON.parse(bindingStore[identity.FbmSync.BINDING_KEY]).username], [true, 'ANHLT']);
  check(so, 'khong cho ghi de lien ket khi du lieu FBM cu van con', [identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok, identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).code], [false, 'REBIND_REQUIRED']);
  identity.FbmSync.readLocal = () => [];
  check(so, 'sau khi xu ly du lieu cu moi cho doi lien ket', identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok, true);
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED-NEW', fbmId: 'FBM-B' }];
  check(so, 'runtime tai khoan lech lien ket moi thi fail-closed', identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status, 'REBIND_REQUIRED');

  const edgeProperties = {};
  const edges = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => edgeProperties[key] || null, setProperty: (key, value) => { edgeProperties[key] = String(value); }, deleteProperty: (key) => { delete edgeProperties[key]; } }) } });
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/transport/TransportCore.js');
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh', edges.FbmSync.normalize('/Date(1757386800000+0700)/'), edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint', edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'), edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'));
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000320' }, { id: 'CUS-000321' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000321', fbmId: 'FBM-SEEN' }], [{ fbmId: 'FBM-SEEN' }]);
  check(so, 'bitmap seen bam theo ma noi bo nen sap xep lai dong khong lam mat dau', edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000321', fbmId: 'FBM-SEEN' }), true);
  check(so, 'bitmap fail closed voi ID cu, sai khuon hoac sai namespace', [edges.FbmSync.seenStoreHas('customer', { id: 'KH000321', fbmId: 'FBM-OLD' }), edges.FbmSync.seenStoreHas('customer', { id: 'khach-cu', fbmId: 'FBM-UNKNOWN' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-1', fbmId: 'FBM-SHORT' }), edges.FbmSync.seenStoreHas('customer', { id: 'ACT-000321', fbmId: 'FBM-WRONG-SCOPE' })], [true, true, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000019' }, { id: 'CUS-000020' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000019', fbmId: 'FBM-19' }, { id: 'CUS-000020', fbmId: 'FBM-20' }], [{ fbmId: 'FBM-20' }]);
  check(so, 'pham vi missing co dinh tai dau ky va bo qua record tao sau high-water', [edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000019' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000020' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000021' })], [false, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', []);
  check(so, 'pham vi rong dau ky bo qua moi record tao trong khi request dang bay', edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000001' }), true);

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
  edges.FbmSync.seenStoreClear('customer');
  const newRecordState = { mode: 'read', cursor: { kind: 'customer_grid' }, metadata: { categoryGate: {}, seen: { customer: { initialized: true }, activity: {} } }, locks: {} };
  let newLocalRecords = [];
  let newRecordWrites = 0;
  edges.FbmSync.stateRead = () => newRecordState;
  edges.FbmSync.stateWrite = () => newRecordState;
  edges.FbmSync.readLocal = () => newLocalRecords;
  edges.writeGateSave = () => {
    newRecordWrites += 1;
    newLocalRecords = [{ id: 'CUS-000777', fbmId: 'FBM-NEW', recordStatus: 'active' }];
    return { ok: true, fields: ['id', 'fbmId', 'recordStatus'], rows: [['CUS-000777', 'FBM-NEW', 'active']] };
  };
  edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-NEW', ma_kh: 'ALT00777', ten_kh: 'Mới' }, {})]);
  const newRecordMissing = edges.FbmSync.markMissingAfterFullScan('customer', newRecordState);
  check(so, 'record vua pull duoc danh dau seen sau khi cua ghi cap ma', [newRecordMissing.written, newRecordWrites], [0, 1]);
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
  check(so, 'Activity pull moi noi dung vao Customer noi bo va cho phep day', [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId, activityPullWrite.records[0].allowFbmPush], [1, 'CUS-ACT', 88, edges.FbmSync.PUSH_ALLOW_VALUE]);
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

}

module.exports = { chay };
