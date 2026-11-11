/** Chặng chính của lượt Lấy khi hết danh sách khách: gắn khách vắng vào danh sách đọc một lần, không mở chiều đẩy. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

function chay(so) {
  section('FBM sync — Chặng chính của lượt Lấy khi hết danh sách khách');
  let readFinishState = {
    runId: 'read-run', origin: 'manual', mode: 'read', scan: 'full', phase: 'pull_customer', entity: 'customer',
    cursor: { kind: 'customer_scan', entity: 'customer', jobId: 'read-run:customer:0:0', page: 0, next: 0, chunkCount: 0 }, activeRequestId: 'read-request', deadlineAt: Date.now() + 60000,
    lastProgressAt: Date.now(), session: {}, metadata: {},
    counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }
  };
  let readFinishMissing = 0;
  let readFinishPushRequests = 0;
  const readFinish = taoHopCat({
    recordGateReleaseOwner: () => {},
    PropertiesService: taoPropertiesService({}),
    FbmSync: {
      stateRead: () => readFinishState, scriptSettings: () => ({ cookie: '', customerAuthorized: '' }),
      stateWrite: (next) => { readFinishState = next; return next; },
      staleRunCheck: () => null,
      responseRequestId: () => 'read-request', requestAnswered: (state, id) => !!id && String(state.activeRequestId || '') === id,
      protocol: { parse: (value) => value, assertSuccess: () => ({ ok: true }), contractMismatch: () => null }, replyCheck: () => ({ ok: true }), scope: () => null,
      traceImport: () => {}, traceEvent: () => {}, traceResponse: () => ({}), applyTransportSession: () => false, sessionGateResponseStarted: () => {},
      rowsToRecords: () => ({ rows: [], fields: [], total: 0 }), isTemporaryRecord: () => false, customerPageItem: () => '', customerPageValue: () => [], seenStoreReader: () => () => true, seenStoreMark: () => {}, readLocal: () => [],
      pullPageApply: () => ({ ok: true, written: 0, conflicts: 0, skipped: 0, identityBlocks: [] }), previewRecords: () => {}, customerNext: () => false,
      canWriteSheet: (mode) => mode === 'read' || mode === 'write', canWriteFbm: (mode) => mode === 'push' || mode === 'write',
      pushStageOpen: () => { readFinishPushRequests += 1; return {}; },
      runInProgress: (state) => !!state.runId && ['idle', 'done', 'error', 'paused', 'conflict'].indexOf(state.phase) < 0, businessFinishOpenSteps: () => {}, RECORD_HOLDER: 'fbm',
      runDoneMessage: () => 'Đồng bộ hoàn tất.',
      statusView: () => ({ phase: readFinishState.phase, mode: readFinishState.mode })
    }
  });
  napServer(readFinish, 'fbm_sync/state/Run.js', 'fbm_sync/state/RunStop.js', 'fbm_sync/state/Slice.js', 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  // Chỉ kiểm chặng chính của lượt; bước đếm cuối lượt có test riêng.
  readFinish.FbmSync.customerAbsentMark = () => { readFinishMissing += 1; };
  readFinish.FbmSync.readListClear = () => {};
  readFinish.FbmSync.workStoreClear = () => 0;
  readFinish.FbmSync.staleRunCheck = () => null;
  readFinish.FbmSync.processBookRead = () => readFinish.FbmSync.processBookShape(null);
  readFinish.FbmSync.processBookWrite = () => {};
  readFinish.FbmSync.activityStageNext = () => null;
  const readFinished = readFinish.FbmSync.continue({ job: { jobId: 'read-run:customer:0:0', chunkIndex: 0, chunkCount: 1, rowCount: 0, totalRowCount: 0, oversize: [] }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'read-request' }] } });
  check(so, 'Lượt Lấy hết danh sách khách thì gắn khách vắng vào danh sách đọc một lần, không mở chiều đẩy',
    [readFinished.ok, readFinishState.phase, readFinishMissing, readFinishPushRequests],
    [true, 'done', 1, 0]);

  return so;
}

module.exports = { chay };
