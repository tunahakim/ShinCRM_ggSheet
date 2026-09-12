/** Kiểm tra chiều push, khóa, owner và log. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — push");
  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js');
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', allowFbmPush: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  const props = { data: {} };
  const propertyApi = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { props.data[key] = String(value); } };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => propertyApi, getScriptProperties: () => propertyApi }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/EntryPoints.js');
  const started = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start bat dau bang bootstrap Customer', started.request.meta.kind, 'authorize');
  check(so, 'bootstrap dung viewPage false', started.request.body.viewPage, false);
  check(so, 'bootstrap khong gui authorized cu', started.request.body.authorized, null);
  const retrySlice = orchestration.FbmSync.continue({ ok: false, status: 503, body: '' });
  check(so, 'loi doc tam thoi duoc retry co gioi han', [retrySlice.ok, retrySlice.retrying, retrySlice.request.meta.kind, orchestration.FbmSync.stateRead().retryCount], [true, true, 'authorize', 1]);
  const resumed = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start thu lai tiep tuc dung authorize Customer ban dau', [resumed.ok, resumed.resumed, resumed.request.meta.entity], [true, true, 'customer']);
  const staleState = JSON.parse(props.data[orchestration.FbmSync.STATE_KEY]);
  staleState.runId = 'old-run'; staleState.updatedAt = Date.now() - 120000;
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(staleState);
  const restarted = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'authorize cu qua mot phut duoc thay bang phien moi', [restarted.ok, restarted.resumed, orchestration.FbmSync.stateRead().runId === 'old-run'], [true, undefined, false]);
  check(so, 'lookup san pham dung controller FBM that', orchestration.FbmSync.SYNC_LOOKUPS.filter((item) => item.key === '@CAT_SAN_PHAM')[0].controller, 'crdmsp');
  const previewState = { metadata: {} };
  orchestration.FbmSync.previewRecords(previewState, 'customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM', previewState.metadata.preview.customers[0].code, 'ALT00010');
  const pullStatus = orchestration.FbmSync.stateRead();
  pullStatus.phase = 'pull_customer'; pullStatus.entity = 'customer'; pullStatus.mode = 'read'; orchestration.FbmSync.stateWrite(pullStatus);
  const pullView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu FBM ve ShinCRM', pullView.direction, 'FBM → ShinCRM');
  check(so, 'status noi ro dang dong bo khach hang', pullView.entityLabel, 'Khách hàng');
  const resumeState = orchestration.FbmSync.stateRead();
  resumeState.runId = 'resume-run'; resumeState.phase = 'pull_customer'; resumeState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['d', 't', 'x'], count: 2000 };
  orchestration.FbmSync.stateWrite(resumeState);
  const resumedGrid = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'Sidebar mo lai tiep tuc cursor doc Customer dang do', [resumedGrid.ok, resumedGrid.resumed, resumedGrid.request.meta.kind, resumedGrid.request.body.type], [true, true, 'grid', 1]);
  const pushStatus = orchestration.FbmSync.stateRead();
  pushStatus.phase = 'push'; pushStatus.entity = 'activity'; pushStatus.mode = 'write'; orchestration.FbmSync.stateWrite(pushStatus);
  const pushView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu ShinCRM sang FBM', pushView.direction, 'ShinCRM → FBM');
  check(so, 'status noi ro dang dong bo giao dich', pushView.entityLabel, 'Giao dịch');

  const guards = taoHopCat({ FbmSync: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }), getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }) } });
  napServer(guards, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js');
  check(so, 'push config chan account rong', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }), 'Thiếu FBM_ACCOUNT_NAME; chiều đẩy đã bị dừng.');
  check(so, 'push config chan prefix va do dai khi tao customer', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: '', customerCodeLength: 8 }), 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH; không tạo khách mới.');
  check(so, 'push config cho activity sua khi account co', guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }), '');
  check(so, 'ma customer tu sinh hop le', guards.FbmSync.validateAutoCustomerCode('ALT00010', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, true);
  check(so, 'ma customer tu sinh sai tien to', guards.FbmSync.validateAutoCustomerCode('KH000010', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, false);
  check(so, 'ma customer tu sinh sai do dai', guards.FbmSync.validateAutoCustomerCode('ALT10', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, false);

  const lockState = { locks: { 'customer:C-1': { owner: 'sync' }, 'customer:C-2': { owner: 'user' } } };
  guards.FbmSync.unlockRecord = () => ({ locks: { 'customer:C-2': { owner: 'user' }, 'activity:A-1': { owner: 'sync' } } });
  guards.FbmSync.releasePushLock(lockState, 'customer', 'C-1');
  check(so, 'nha khoa push giu khoa khac', Object.keys(lockState.locks).sort().join(','), 'activity:A-1,customer:C-2');

  const recordLocks = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => {
    const data = recordLocks._props || (recordLocks._props = {});
    return { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  } } });
  napServer(recordLocks, 'fbm_sync/state/State.js', 'fbm_sync/state/RecordLocks.js');
  recordLocks.FbmSync.stateStart('', 'idle', 0);
  recordLocks.FbmSync.lockRecord('customer', 'C-1', 'h1', 'sync');
  check(so, 'save bi chan khi record dang bi sync khoa', recordLocks.FbmSync.saveAllowed('customer', 'C-1', 'h1').code, 'RECORD_BUSY');
  check(so, 'edit begin bi chan khi record dang bi sync khoa', recordLocks.FbmSync.editBegin('customer', 'C-1', 'h1').code, 'RECORD_BUSY');
  recordLocks.FbmSync.unlockRecord('customer', 'C-1');
  check(so, 'save duoc phep sau khi nha khoa sync', recordLocks.FbmSync.saveAllowed('customer', 'C-1', 'h1').ok, true);
  recordLocks.FbmSync.lockRecord('customer', 'C-2', 'h2', 'user');
  recordLocks.FbmSync.stateStart('', 'checking_session', 0);
  check(so, 'phien sync moi giu khoa cua form nguoi dung', recordLocks.FbmSync.stateRead().locks['customer:C-2'].owner, 'user');

  const pushProps = { data: {} };
  const pushPropertyApi = { getProperty: (key) => pushProps.data[key] || null, setProperty: (key, value) => { pushProps.data[key] = String(value); } };
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => pushPropertyApi, getScriptProperties: () => pushPropertyApi }, writeGateSave: () => ({ ok: true }) });
  napServer(push, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/RecordLocks.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/EntryPoints.js');
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
  push.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'C-1', record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }];
  push.FbmSync.validatePushCategories = () => [];
  const pushEligibilityErrors = push.FbmSync.pushEligibilityErrors;
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.customerEditOpenRequest = () => ({ url: 'https://fbm.test/edit', body: {}, meta: { kind: 'customer_edit_open' } });
  const pushState = push.FbmSync.stateStart('', 'push', 0);
  pushState.metadata.categoryGate = {};
  pushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(pushState);
  const pushRequest = push.FbmSync.nextPushRequest(pushState);
  const pushedState = push.FbmSync.stateRead();
  check(so, 'push status danh dau dang day truoc request', pushedState.locks['customer:C-1'].owner, 'sync');
  check(so, 'push request luu dung cursor cho phan hoi tiep', pushedState.cursor.kind, 'push_wait');
  check(so, 'push request co envelope protocol', pushRequest.meta.kind, 'customer_edit_open');
  const conflictPushState = push.FbmSync.stateStart('', 'push', 0);
  conflictPushState.metadata.categoryGate = {};
  conflictPushState.metadata.conflicts = [{ entity: 'activity', id: 'ACT-1' }];
  conflictPushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(conflictPushState);
  check(so, 'push dung lai khi pull da phat hien conflict', [push.FbmSync.nextPushRequest(conflictPushState), push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor], [null, 'conflict', {}]);
  push.FbmSync.pushCandidates = () => [];
  const emptyWriteState = push.FbmSync.stateStart('', 'push', 0); emptyWriteState.mode = 'write'; emptyWriteState.metadata.categoryGate = {}; emptyWriteState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; push.FbmSync.stateWrite(emptyWriteState);
  push.FbmSync.nextPushRequest(emptyWriteState);
  check(so, 'push khong co ung vien hien thong bao khong co ban ghi day', push.FbmSync.stateRead().message, 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.');
  let pushPatch;
  const pushLogs = [];
  push.logEvent = (event) => pushLogs.push(event);
  push.writeGateSave = (request) => { pushPatch = request.records[0]; return { ok: true }; };
  push.FbmSync.markPushResult({ entity: 'customer', record: { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' } }, { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-OLD' }, { Name: 'ma_kh', Value: 'ALT00010' }] } }, 'customer_edit_save');
  check(so, 'push thanh cong giu baseline cu cho ky xac nhan', pushPatch.fbmHash, 'BASE');
  check(so, 'push thanh cong ghi log request kind huong va hash', [pushLogs[0].action, pushLogs[0].detail.requestKind, pushLogs[0].detail.direction, pushLogs[0].detail.hBASE], ['push_record', 'customer_edit_save', 'ShinCRM → FBM', 'BASE']);
  const errorState = { counts: { error: 0 }, metadata: { categoryGate: {}, pushFailures: {} }, locks: {} };
  push.FbmSync.unlockRecord = () => ({ locks: {} });
  push.FbmSync.markPushError(errorState, { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', companyName: 'Lỗi' } }, 'FBM từ chối', 'customer_edit_save');
  check(so, 'push loi luu hash local de chan lap lai', errorState.metadata.pushFailures['customer:C-ERR'], push.FbmSync.hash({ id: 'C-ERR', companyName: 'Lỗi' }, 'customer', {}));
  check(so, 'push loi luu nguyen nhan hien thi rieng voi hash', errorState.metadata.pushFailureDetails['customer:C-ERR'].reason, 'FBM từ chối');
  check(so, 'push loi luu dung buoc request gay loi', errorState.metadata.pushFailureDetails['customer:C-ERR'].requestKind, 'customer_edit_save');
  let retryPatch;
  push.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-FAIL', fbmId: '174813', syncStatus: push.FbmSync.SYNC_STATUS.error, content: 'Nội dung cũ' }]
    : [];
  push.writeGateSave = (request) => { retryPatch = request.records; return { ok: true }; };
  const retryState = push.FbmSync.stateStart('', 'done', 0);
  retryState.metadata.pushFailures = { 'activity:ACT-FAIL': 'failed-hash' };
  retryState.metadata.pushFailureDetails = { 'activity:ACT-FAIL': { reason: 'HTTP 500' } };
  push.FbmSync.stateWrite(retryState);
  const retryEnabled = push.fbmSyncRetryPushFailures();
  check(so, 'retry push mo lai ca lo cung payload khong doi du lieu', [retryEnabled.ok, retryPatch[0].syncStatus, push.FbmSync.stateRead().metadata.pushFailures['activity:ACT-FAIL']], [true, push.FbmSync.SYNC_STATUS.pending, undefined]);
  push.FbmSync.pushCandidates = () => [
    { kind: 'edit', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } },
    { kind: 'edit', id: 'C-NEXT', record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ];
  const pushErrorProps = push.FbmSync.stateStart('', 'push', 0);
  pushErrorProps.metadata.categoryGate = {};
  pushErrorProps.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(pushErrorProps);
  const continuedPush = push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, 'Owner sai');
  check(so, 'push loi mot record van tiep tuc record ke', [continuedPush.continued, continuedPush.request.meta.kind, push.FbmSync.stateRead().cursor.index, push.FbmSync.stateRead().counts.error], [true, 'customer_edit_open', 1, 1]);
  push.FbmSync.pushEligibilityErrors = pushEligibilityErrors;
  pushedState.locks['customer:C-2'] = { owner: 'user', revision: 'h2' };
  push.FbmSync.stateWrite(pushedState);
  push.fbmSyncCancel();
  const cancelled = push.FbmSync.stateRead();
  check(so, 'dung phien nha khoa sync nhung giu khoa user', Object.keys(cancelled.locks).sort().join(','), 'customer:C-2');

  const requiredCustomer = { companyName: 'Company', taxNumber: '0100123456', contactPerson: 'Contact', phone: '0900000000', leadSource: 'Source', address: 'Ha Noi', province: 'HNI' };
  check(so, 'Customer du bay field FBM bat buoc', push.FbmSync.pushEligibilityErrors(requiredCustomer, 'customer').length, 0);
  ['companyName', 'taxNumber', 'contactPerson', 'phone', 'leadSource', 'address', 'province'].forEach((field) => {
    const invalid = Object.assign({}, requiredCustomer); delete invalid[field];
    check(so, 'Customer thieu field bat buoc ' + field, push.FbmSync.pushEligibilityErrors(invalid, 'customer').some((message) => message.indexOf('Thi') === 0), true);
  });
  check(so, 'Customer vuot gioi han do dai bi chan', push.FbmSync.pushEligibilityErrors(Object.assign({}, requiredCustomer, { companyName: 'x'.repeat(1001) }), 'customer').length > 0, true);
  check(so, 'Activity vuot gioi han noi dung bi chan', push.FbmSync.pushEligibilityErrors({ taskType: 'Goi', content: 'x'.repeat(4001), workDate: '2026-09-09' }, 'activity').length > 0, true);
  push.FbmSync.scriptSettings = () => ({ accountName: 'Chu tai khoan dung' });
  let ownerMismatch = '';
  try {
    push.FbmSync.continuePush({ metadata: { categoryGate: {} }, cursor: { operation: 'activity_edit_open', entity: 'activity', candidate: { entity: 'activity', id: 'ACT-OWNER', record: { id: 'ACT-OWNER', fbmId: 'A-OWNER' } } } }, { d: { InternalValues: [{ Name: 'owner', NewValue: 'Chu tai khoan khac' }] } });
  } catch (error) { ownerMismatch = String(error && error.message || error); }
  check(so, 'Activity sai owner bi chan truoc request sua', ownerMismatch.indexOf('FBM') >= 0, true);
  const bugState = push.FbmSync.stateStart('', 'push', 0);
  bugState.metadata.categoryGate = {};
  bugState.cursor = { kind: 'push_wait', operation: 'customer_edit_save', entity: 'customer', index: 0, candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(bugState);
  const bugResult = push.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}' });
  check(so, 'Bugs HTTP 200 danh dau loi record va khong retry request da gui', [bugResult.continued, push.FbmSync.stateRead().counts.error, push.FbmSync.stateRead().metadata.pushFailures['customer:C-ERR'] !== undefined], [true, 1, true]);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-NEW', fbmId: '', fbmCustomerCode: '', allowFbmPush: 'Chưa cho phép' }]
    : [];
  check(so, 'Customer moi chua cho phep chi pull khong push', pushed.FbmSync.pushCandidates('customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: pushed.FbmSync.PUSH_ALLOW_VALUE }]
    : [{ id: 'ACT-NEW', customerId: 'CUS-PARENT', fbmId: '', allowFbmPush: pushed.FbmSync.PUSH_ALLOW_VALUE, taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09' }];
  check(so, 'Activity moi co Customer cha lien ket duoc dua vao queue', pushed.FbmSync.pushCandidates('activity').length, 1);
  const transportState = push.FbmSync.stateStart('', 'read', 0);
  transportState.phase = 'pull_customer'; transportState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] };
  push.FbmSync.stateWrite(transportState);
  const http500 = push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"server"}' });
  check(so, 'HTTP 500 giu cursor doc hop le cho ky sau', [http500.ok, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], [false, 'error', 'customer_grid']);
  [{ status: 401, body: '' }, { status: 403, body: '' }, { status: 200, body: '<form action="Login.aspx"></form>' }].forEach((failure) => {
    const sessionState = push.FbmSync.stateStart('', 'read', 0);
    sessionState.phase = 'pull_customer'; sessionState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'] };
    push.FbmSync.stateWrite(sessionState);
    const sessionResult = push.FbmSync.continue({ ok: failure.status === 200, status: failure.status, body: failure.body });
  check(so, 'Session error ' + failure.status + ' giu cursor de chay ky sau', [sessionResult.ok, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], [false, 'error', 'customer_grid']);
  });
  const skippedLogs = [];
  push.logEvent = (event) => skippedLogs.push(event);
  const skippedState = { counts: { skipped: 0 }, metadata: {} };
  push.FbmSync.markPushSkipped(skippedState, { entity: 'activity', id: 'ACT-SKIP' }, push.FbmSync.SYNC_STATUS.unknownCategory, 'Category chua khop');
  const skippedEntry = skippedLogs.filter((event) => event.action === 'push_record_skipped')[0];
  const skippedDetail = skippedLogs.filter((event) => event.action === 'push_record')[0];
  check(so, 'Push record bi hoan co log chi tiet', [!!skippedEntry, skippedEntry && skippedEntry.recordId, skippedDetail && skippedDetail.detail.direction, skippedDetail && skippedDetail.detail.syncStatus], [true, 'ACT-SKIP', 'ShinCRM → FBM', push.FbmSync.SYNC_STATUS.unknownCategory]);

  const activityCandidate = { entity: 'activity', kind: 'create', id: 'ACT-NEW', record: { id: 'ACT-NEW', fbmId: '', customerFbmCode: 'ALT00010', stt_rec: 'A-CUS', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09', allowFbmPush: push.FbmSync.PUSH_ALLOW_VALUE } };
  push.FbmSync.pushCandidates = () => [activityCandidate];
  push.FbmSync.validatePushCategories = () => [];
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', baseUrl: 'https://fbm.test', activityAuthorized: '1.test' });
  const activityEditOpen = push.FbmSync.activityEditOpenRequest('174813');
  check(so, 'Activity edit mo form dung type 0 va token activity', [activityEditOpen.body.type, activityEditOpen.body.viewPage, activityEditOpen.body.authorized, activityEditOpen.meta.kind], [0, true, '1.test', 'activity_edit_open']);
  const activityEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, ma_cv: 'GD', details: 'Noi dung cu', start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T00:00:00Z'), fileticket: 'ticket' }, {});
  check(so, 'Activity edit gui id FBM thay vi id noi bo', activityEdit.body.memvars.filter((item) => item.Name === 'id')[0].NewValue, 174813);
  const activityEditState = push.FbmSync.stateStart('', 'push', 0);
  push.FbmSync.scriptSettings = () => ({ accountName: 'Owner', baseUrl: 'https://fbm.test', activityAuthorized: '1.test' });
  activityEditState.metadata.categoryGate = {};
  activityEditState.cursor = { kind: 'push_wait', operation: 'activity_edit_open', entity: 'activity', index: 0, candidate: { entity: 'activity', id: 'ACT-008600', record: { id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09' } } };
  push.FbmSync.stateWrite(activityEditState);
  const activitySave = push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { Controller: 'zccrAccountTask', Row: (function () { const row = []; row[0] = 174813; row[3] = 'GD'; row[15] = 'Noi dung cu'; row[21] = 'Owner'; return row; }()), Showing: "_ticket = 'ticket-1';" } });
  check(so, 'Activity edit tu response mo form tao request type 1', [activitySave.body.type, activitySave.body.memvars.length, push.FbmSync.stateRead().cursor.operation, Object.prototype.hasOwnProperty.call(push.FbmSync.stateRead().cursor, 'oldValues')], [1, 36, 'activity_edit_save', false]);
  const activityPushState = push.FbmSync.stateStart('', 'push', 0);
  activityPushState.metadata.categoryGate = {};
  activityPushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  push.FbmSync.stateWrite(activityPushState);
  const activityCreate = push.FbmSync.nextPushRequest(activityPushState);
  check(so, 'Activity moi dung request New va marker', [activityCreate.meta.kind, activityCreate.body.action, activityCreate.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, push.FbmSync.stateRead().cursor.operation], ['activity_create', 'New', 'Nội dung #SC-ACT-NEW', 'activity_create']);
  const activityResponse = push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { InternalValues: [{ Name: 'id', Value: 42 }] } });
  check(so, 'Activity New nhan ID FBM va chuyen sang cho xac nhan', [activityResponse, push.FbmSync.stateRead().counts.succeeded, push.FbmSync.stateRead().phase], [null, 1, 'done']);
  const lostState = push.FbmSync.stateStart('', 'push', 0);
  lostState.metadata.categoryGate = {};
  lostState.locks['activity:ACT-NEW'] = { owner: 'sync', revision: 'h-create' };
  lostState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_create', candidate: activityCandidate };
  push.FbmSync.stateWrite(lostState);
  let lostPatch;
  push.writeGateSave = (request) => { lostPatch = request.records[0]; return { ok: true }; };
  const lost = push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, 'Mất phản hồi');
  check(so, 'Activity mat phan hoi giu dang day va khoa cho marker', [lost.continued, lost.request, lostPatch.syncStatus, push.FbmSync.stateRead().counts.error, !!push.FbmSync.stateRead().metadata.pushFailures['activity:ACT-NEW'], push.FbmSync.stateRead().locks['activity:ACT-NEW'].owner], [true, null, push.FbmSync.SYNC_STATUS.pushing, 1, true, 'sync']);
}

module.exports = { chay };
