/** Chặng tra danh mục: lỗi đường truyền hoặc phân tích thì dừng đóng lỗi, lô thành công không có dòng vẫn đi tiếp. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

function chay(so) {
  section('FBM sync — lookup lỗi');
  const lookupProps = {};
  const lookupHop = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: lookupProps }) });
  napServer(lookupHop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushRecover.js', 'fbm_sync/transport/PushStage.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/SheetSave.js');
  lookupHop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, namesBySource: {}, warnings: [] });
  lookupHop.FbmSync.readLocal = () => [];
  lookupHop.FbmSync.currentSpreadsheetId = () => 'sheet-lookup-test';
  lookupHop.FbmSync.identityStatus = () => ({ status: 'BOUND' });
  const lookupErrorState = lookupHop.FbmSync.runOpen({ phase: 'checking_session' });
  lookupErrorState.mode = 'write'; lookupErrorState.origin = 'manual'; lookupErrorState.phase = 'checking_session'; lookupErrorState.cursor = { kind: 'lookup', index: 0 }; lookupErrorState.activeRequestId = 'lookup-error-request'; lookupErrorState.session.identityVerified = true; lookupErrorState.session.sessionId = 'lookup-session'; lookupErrorState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupErrorState);
  let lookupErrorCode = '';
  try { lookupHop.FbmSync.runSlice(() => lookupHop.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-error-request' }] } })); } catch (error) { lookupErrorCode = String(error.code || ''); }
  check(so, 'lookup loi transport hoac parse fail-closed khong tu dong di tiep',
    [lookupErrorCode !== '', lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().cursor.kind, lookupHop.FbmSync.stateRead().activeRequestId],
    [true, 'error', 'lookup', '']);
  const lookupEmptyState = lookupHop.FbmSync.stateRead(); lookupEmptyState.runId = 'lookup-empty-run'; lookupEmptyState.phase = 'checking_session'; lookupEmptyState.cursor = { kind: 'lookup', index: 0 }; lookupEmptyState.activeRequestId = 'lookup-empty-request'; lookupEmptyState.session.identityVerified = true; lookupEmptyState.session.sessionId = 'lookup-session'; lookupEmptyState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupEmptyState);
  const lookupEmpty = lookupHop.FbmSync.runSlice(() => lookupHop.FbmSync.continue({ ok: true, status: 200, items: [0, 1, 2].map((id) => ({ id: String(id), ok: true, status: 200, body: '{"d":{"Rows":[]}}' })), transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-empty-request' }] } }));
  check(so, 'lo danh muc thanh cong nhung khong co dong la ket qua hop le va di tiep',
    [lookupEmpty.ok, lookupEmpty.request && lookupEmpty.request.meta.kind, lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().metadata.categoryLookupFailed],
    [true, 'scan_job', 'pull_customer', undefined]);

  return so;
}

module.exports = { chay };
