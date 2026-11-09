/** Mở lượt: request đầu luôn là probe phiên FBM, chế độ chạy tách quyền ghi Sheet và FBM, lượt hỏng hay lượt cũ chỉ chạy lại từ probe; trạng thái hiện đúng chiều và loại bản ghi. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, TEP_KHUNG_LUOT, TRANG_FBM_THU } = require('../../lib/load-gas');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { keoLo } = require('../../lib/fbm/keo-ve');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

async function chay(so) {
  section('FBM sync — mở lượt, chế độ chạy và probe phiên');
  const props = { data: {} };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: taoPropertiesService({ doc: props.data, script: props.data })
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushStage.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/control/PushCommands.js', 'fbm_sync/write/SheetSave.js');
  orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const approvalProps = { data: {} };
  const approval = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: approvalProps.data, script: approvalProps.data }) });
  napServer(approval, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/report/Report.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/report/PreflightPush.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushStage.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/control/PushCommands.js', 'fbm_sync/write/SheetSave.js');
  approval.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  // Phần kiểm tra rẻ chạy đầu lượt; phần đọc và hash cả hai Sheet chỉ chạy sau khi phiên FBM xác thực xong, nên FBM hỏng ở bước xác thực thì ShinCRM chưa tốn công tính.
  const localCalls = [];
  approval.FbmSync.preflightGates = () => ({ ok: true, issues: [], blocking: [], warnings: [], candidateCount: 0 });
  approval.FbmSync.preflightNeedsLocal = (options) => options.mode !== 'read';
  approval.FbmSync.preflightLocal = (options) => { localCalls.push(options.mode); return { ok: true, issues: [], blocking: [], warnings: [], candidateCount: 11 }; };
  approval.FbmSync.extractAuthorized = () => 'auth-token';
  const firstAsk = approval.FbmSync.start({ mode: 'write' });
  check(so, 'Mở lượt ghi: request đầu là kiểm phiên FBM, chưa đọc hay hash Sheet Customer/Activity', [firstAsk.ok, firstAsk.request.meta.kind, localCalls.length], [true, 'session_probe', 0]);
  approval.FbmSync.authContinue('customer', { map: {} });
  const afterAuth = approval.FbmSync.authContinue('activity', { map: {} });
  check(so, 'Xác thực xong mới quét dữ liệu; số bản ghi lúc kiểm trước phiên không dừng lượt chờ chấp thuận (cổng chấp thuận nằm ở đầu chặng đẩy), đi tiếp sang request dữ liệu', [!!afterAuth, localCalls], [true, ['write']]);
  approval.FbmSync.stateWrite(approval.FbmSync.runOpen({ phase: 'idle' }));
  approval.FbmSync.readLocal = () => [];
  approval.FbmSync.start({ mode: 'read' });
  approval.FbmSync.authContinue('customer', { map: {} });
  approval.FbmSync.authContinue('activity', { map: {} });
  check(so, 'Chiều Lấy không quét hash Sheet ShinCRM ở bất kỳ bước nào', localCalls.length, 1);
  approval.FbmSync.stateWrite(approval.FbmSync.runOpen({ phase: 'idle' }));
  approval.FbmSync.preflightLocal = () => ({ ok: true, issues: [], blocking: [], warnings: [], candidateCount: 0 });
  const pushOnly = approval.FbmSync.start({ mode: 'push' });
  check(so, 'mode day rieng chi probe truoc khi gui du lieu ShinCRM len FBM', [pushOnly.ok, pushOnly.request.meta.kind, approval.FbmSync.stateRead().mode], [true, 'session_probe', 'push']);
  approval.FbmSync.stateWrite(approval.FbmSync.runOpen({ phase: 'idle' }));
  const checkOnly = approval.FbmSync.start({ mode: 'check' });
  check(so, 'bon mode tach dung quyen ghi Sheet va FBM', [
    checkOnly.ok,
    approval.FbmSync.canWriteSheet('check'), approval.FbmSync.canWriteFbm('check'),
    approval.FbmSync.canWriteSheet('read'), approval.FbmSync.canWriteFbm('read'),
    approval.FbmSync.canWriteSheet('push'), approval.FbmSync.canWriteFbm('push'),
    approval.FbmSync.canWriteSheet('write'), approval.FbmSync.canWriteFbm('write')
  ], [true, false, false, true, false, false, true, true, true]);
  let pullWriteCalls = 0;
  approval.FbmSync.pullPageApply = (_entity, records) => { pullWriteCalls += 1; return { ok: true, written: records.length, conflicts: 0, skipped: 0, identityBlocks: [], pendingClears: [] }; };
  approval.FbmSync.statePatch({ counts: { total: 0, completed: 0, succeeded: 0, error: 0, conflict: 0, skipped: 0 } });
  const readPull = keoLo(approval.FbmSync, 'customer', [{ id: 'C-1' }], 'read');
  const checkPull = keoLo(approval.FbmSync, 'customer', [{ id: 'C-2' }], 'check');
  check(so, 'read ghi Sheet con check chi preview', [readPull.written, checkPull.preview, pullWriteCalls], [1, true, 1]);
  orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const started = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start bat dau bang probe User', started.request.meta.kind, 'session_probe');
  check(so, 'probe khong gui authorized cu', started.request.body.authorized, undefined);
  orchestration.FbmSync.currentSpreadsheetId = () => 'sheet-push-test';
  orchestration.FbmSync.identityStatus = () => ({ status: 'BOUND' });
  orchestration.FbmSync.statePatch({ runId: 'business-failure-run', origin: 'manual', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, activeRequestId: '', deadlineAt: 0, metadata: { sessionGate: {} }, session: { expired: false, sessionId: '', identityVerified: false, identitySessionId: '' } });
  const businessProbe = orchestration.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', body: { controller: 'zccrAccount' }, meta: { kind: 'grid' } });
  check(so, 'request nghiep vu chi duoc cap sau probe User dat', businessProbe.meta.kind, 'session_probe');
  const businessRequest = orchestration.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: businessProbe.id }] } });
  check(so, 'probe dat thi moi phat request nghiep vu de kiem fail-closed', [businessRequest.ok, businessRequest.request && businessRequest.request.meta.kind], [true, 'grid']);
  const retrySlice = orchestration.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: businessRequest.request.id }] } });
  check(so, 'loi request nghiep vu fail-closed khong tu retry', [retrySlice && retrySlice.ok, retrySlice && retrySlice.request, orchestration.FbmSync.stateRead().phase, orchestration.FbmSync.stateRead().lastFailureCode], [false, null, 'error', 'TRANSPORT_ERROR']);
  const blockedDuplicate = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'sau loi request chi cho phep nguoi dung chay lai tu dau bang probe', [blockedDuplicate.ok, blockedDuplicate.request && blockedDuplicate.request.meta.kind, orchestration.FbmSync.stateRead().phase], [true, 'session_probe', 'checking_session']);
  orchestration.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const resumed = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start tiep tuc sau khi reservation cu da thu hoi bang probe moi', [resumed.ok, resumed.resumed, resumed.request.meta.kind], [true, true, 'session_probe']);
  const staleState = JSON.parse(props.data[orchestration.FbmSync.STATE_KEY]);
  staleState.runId = 'old-run'; staleState.updatedAt = Date.now() - orchestration.FbmSync.STALE_RUN_MS - 1; staleState.lastProgressAt = staleState.updatedAt; staleState.deadlineAt = staleState.updatedAt;
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(staleState);
  const restarted = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'run stale duoc thay bang phien moi va probe lai', [restarted.ok, restarted.resumed, restarted.request.meta.kind, orchestration.FbmSync.stateRead().runId === 'old-run'], [true, undefined, 'session_probe', false]);
  check(so, 'FBM-051: sản phẩm không đồng bộ nên phiên chỉ tải ba danh mục FBM, không tải crdmsp', orchestration.FbmSync.SYNC_LOOKUPS.map((item) => item.key + ':' + item.controller), ['@CAT_TINH_THANH:crProvinceCity', '@CAT_NGUON_KH:crLeadSource', '@CAT_CONG_VIEC:crJob']);
  orchestration.FbmSync.previewRecords('customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM', orchestration.FbmSync.previewRead().customers[0].code, 'ALT00010');
  const pullStatus = orchestration.FbmSync.stateRead();
  pullStatus.phase = 'pull_customer'; pullStatus.entity = 'customer'; pullStatus.mode = 'read'; orchestration.FbmSync.stateWrite(pullStatus);
  const pullView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu FBM ve ShinCRM', pullView.direction, 'FBM → ShinCRM');
  check(so, 'status noi ro dang dong bo khach hang', pullView.entityLabel, 'Khách hàng');
  const resumeState = orchestration.FbmSync.stateRead();
  resumeState.runId = 'resume-run'; resumeState.phase = 'pull_customer'; resumeState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['d', 't', 'x'], count: 2000 }; resumeState.metadata = Object.assign({}, resumeState.metadata, { customerFields: orchestration.FbmSync.GRID_FIELDS.customer }); resumeState.activeRequestId = ''; resumeState.deadlineAt = 0;
  orchestration.FbmSync.stateWrite(resumeState);
  const resumedGrid = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'Sidebar mo lai probe lai phien truoc khi tiep tuc cursor Customer', [resumedGrid.ok, resumedGrid.resumed, resumedGrid.request.meta.kind], [true, true, 'session_probe']);
  const pushStatus = orchestration.FbmSync.stateRead();
  pushStatus.phase = 'push'; pushStatus.entity = 'activity'; pushStatus.mode = 'write'; orchestration.FbmSync.stateWrite(pushStatus);
  const pushView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu ShinCRM sang FBM', pushView.direction, 'ShinCRM → FBM');
  check(so, 'status noi ro dang dong bo giao dich', pushView.entityLabel, 'Giao dịch');
  const queueState = orchestration.FbmSync.stateRead();
  queueState.metadata.conflictCount = 2;
  orchestration.FbmSync.stateWrite(queueState);
  const queueMetadata = orchestration.FbmSync.statusView().metadata;
  check(so, 'FBM-024: DTO Sidebar chỉ nhận số xung đột, bản ghi cụ thể chỉ có khi mở chế độ xung đột', [queueMetadata.conflictCount, 'conflicts' in queueMetadata], [2, false]);
  return so;
}

module.exports = { chay };
