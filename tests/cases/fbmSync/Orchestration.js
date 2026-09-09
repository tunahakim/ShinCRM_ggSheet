/** Kiểm tra state, cursor và status điều phối. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — orchestration");
  const props = { data: {} };
  const propertyApi = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { props.data[key] = String(value); } };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => propertyApi, getScriptProperties: () => propertyApi }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/EntryPoints.js');
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

  const schedulerData = {};
  const schedulerPropertyApi = { getProperty: (key) => schedulerData[key] || null, setProperty: (key, value) => { schedulerData[key] = String(value); } };
  const scheduler = taoHopCat({ FbmSync: {}, SETTINGS: { LOCK_WAIT_MS: 1 }, PropertiesService: { getDocumentProperties: () => schedulerPropertyApi }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) } });
  napServer(scheduler, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/state/State.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/state/Scheduler.js');
  scheduler.FbmSync.schedule();
  schedulerData.FBM_SYNC_NEXT_CUSTOMER_SCAN = '1000';
  const claimed = scheduler.FbmSync.schedulerClaim('customer', 1000);
  check(so, 'scheduler claim mot ky Customer va doi marker', [claimed.ok, claimed.kind, scheduler.FbmSync.stateRead().scheduledScan, Number(schedulerData.FBM_SYNC_NEXT_CUSTOMER_SCAN) > 1000], [true, 'customer', 'customer', true]);
  const notDue = scheduler.FbmSync.schedulerClaim('customer', 1001);
  check(so, 'scheduler khong tao ky Customer thu hai khi marker chua den', [notDue.ok, notDue.code], [false, 'NOT_DUE']);
  const active = scheduler.FbmSync.stateRead();
  active.phase = 'pull_customer'; active.runId = 'busy'; scheduler.FbmSync.stateWrite(active);
  schedulerData.FBM_SYNC_NEXT_ACTIVITY_SCAN = '1000';
  const busy = scheduler.FbmSync.schedulerClaim('activity', 1000);
  check(so, 'scheduler bo qua khi dang co phien', [busy.ok, busy.code], [false, 'SYNC_ALREADY_RUNNING']);
}

module.exports = { chay };
