/** Kiểm state, cursor và status điều phối, chặn cấu hình đẩy, trigger hẹn giờ cũ còn sót. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, TEP_KHUNG_LUOT, giuBanGhiDongBo } = require("../../lib/load-gas");
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section("FBM sync — orchestration");
  const props = { data: {} };
  const propertyCount = { doc: 0, ghi: 0 };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: taoPropertiesService({ doc: props.data, demDoc: propertyCount }),
    // Lệnh Dừng thử lấy khóa điều phối không chờ.
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const started = orchestration.FbmSync.start({ mode: 'read' });
   check(so, 'start bat dau bang probe User truoc bootstrap Customer', started.request.meta.kind, 'session_probe');
  check(so, 'DTO pipeline tu GAS chi danh dau buoc kiem tra phien o dau luot',
    [started.status.pipeline.kind, started.status.pipeline.title, started.status.pipeline.steps.map((step) => step.state)],
    ['read', 'Pipeline đang chạy', ['current', 'pending', 'pending', 'pending', 'pending', 'pending']]);
  const pipelineActivityState = orchestration.FbmSync.stateRead();
  pipelineActivityState.phase = 'pull_activity'; pipelineActivityState.entity = 'activity'; pipelineActivityState.cursor = { kind: 'activity_grid' }; orchestration.FbmSync.stateWrite(pipelineActivityState);
  check(so, 'DTO pipeline chuyen dung sang Activity ma khong danh dau doi soat va Sheet',
    orchestration.FbmSync.statusView().pipeline.steps.map((step) => step.state),
    ['done', 'done', 'done', 'current', 'pending', 'pending']);
  const pipelineErrorState = orchestration.FbmSync.stateRead();
  pipelineErrorState.phase = 'error'; pipelineErrorState.cursor = { kind: 'activity_grid' }; orchestration.FbmSync.stateWrite(pipelineErrorState);
  check(so, 'DTO pipeline dung tai Activity khi loi, khong bao hoan tat gia',
    [orchestration.FbmSync.statusView().pipeline.title, orchestration.FbmSync.statusView().pipeline.steps.map((step) => step.state)],
    ['Pipeline dừng vì lỗi', ['done', 'done', 'done', 'error', 'pending', 'pending']]);
  [
    ['check khong bao gio hien buoc ghi Sheet', { mode: 'check', scan: 'full', phase: 'done', cursor: {} }, 'check', ['done', 'done', 'done', 'done', 'done']],
    ['push dang mo form chi hoan tat session Category va gate', { mode: 'push', scan: 'full', phase: 'push', cursor: { kind: 'customer_edit_open' } }, 'push', ['done', 'done', 'done', 'current', 'pending', 'pending', 'pending']],
    ['push dang doc xac nhan khong danh dau baseline', { mode: 'push', scan: 'full', phase: 'push', cursor: { kind: 'push_wait', operation: 'customer_verify' } }, 'push', ['done', 'done', 'done', 'done', 'done', 'current', 'pending']],
    ['write chi sang ghi FBM sau khi cap nhat Sheet', { mode: 'write', scan: 'full', phase: 'push', cursor: { kind: 'push_wait', operation: 'activity_verify' } }, 'write', ['done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'done', 'current', 'pending']],
    ['identity probe dang doc User hoan tat session truoc nhan dien', { mode: 'check', scan: 'identity_probe', phase: 'checking_session', cursor: { kind: 'identity_user_grid' } }, 'identity_probe', ['done', 'current']],
    ['identity check chi quet Customer va doi soat lien ket', { mode: 'check', scan: 'identity_check', phase: 'pull_customer', cursor: { kind: 'customer_grid' } }, 'identity_check', ['done', 'current', 'pending']],
    ['login test sau login chuyen sang kiem tra phien', { mode: 'read', scan: 'full', phase: 'checking_session', cursor: { kind: 'login_identity_authorize' } }, 'login_test', ['done', 'current', 'pending']],
    ['preflight loi khong tu nhan bat ky buoc FBM nao da xong', { mode: 'read', scan: 'full', phase: 'error', cursor: {} }, 'read', ['pending', 'pending', 'pending', 'pending', 'pending', 'pending']],
    ['tam dung o Activity giu dung cac buoc da xong', { mode: 'read', scan: 'full', phase: 'paused', cursor: { kind: 'activity_grid' } }, 'read', ['done', 'done', 'done', 'paused', 'pending', 'pending']],
    ['xung dot dung tai doi soat va khong hoan tat Sheet', { mode: 'read', scan: 'full', phase: 'conflict', cursor: {} }, 'read', ['done', 'done', 'done', 'done', 'error', 'pending']]
  ].forEach((item) => {
    const pipeline = orchestration.FbmSync.pipelineView(item[1]);
    check(so, 'ma tran pipeline ' + item[0],
      [pipeline.kind, pipeline.steps.map((step) => step.state)],
      [item[2], item[3]]);
  });
  const identityCheckStatus = orchestration.FbmSync.statusMetadata({ identityCheck: { total: 3, matched: 2, missing: 1, missingSample: [{ fbmId: 'FBM-3' }] } });
  check(so, 'DTO Sidebar giữ tổng hợp kiểm tra liên kết n/N',
    [identityCheckStatus.identityCheck.total, identityCheckStatus.identityCheck.matched, identityCheckStatus.identityCheck.missing, identityCheckStatus.identityCheck.missingSample[0].fbmId],
    [3, 2, 1, 'FBM-3']);
  // State V1 cũ còn danh sách conflict và khóa sync: phiên mới bỏ cả hai, chỉ giữ số đếm; hàng đợi thật nằm trên Sheet (FBM-024).
  const legacyConflict = orchestration.FbmSync.stateRead();
  legacyConflict.phase = 'conflict';
  legacyConflict.metadata.conflicts = [{ entity: 'activity', id: 'ACT-KEEP', fields: [{ field: 'details', left: 'x'.repeat(500), right: 'y'.repeat(500) }] }];
  legacyConflict.metadata.conflictCount = 1;
  legacyConflict.counts.conflict = 1;
  legacyConflict.locks = { 'activity:ACT-KEEP': { owner: 'sync', reason: 'conflict' }, 'customer:CUS-EDIT': { owner: 'user', revision: 'r1' } };
  orchestration.FbmSync.stateWrite(legacyConflict);
  const legacyStored = orchestration.FbmSync.stateRead();
  orchestration.FbmSync.readLocal = () => { throw new Error('runOpen không được đọc Sheet'); };
  const carriedStart = orchestration.FbmSync.runOpen({ phase: 'checking_session' });
  check(so, 'FBM-024: state cũ còn danh sách conflict thì lần ghi state bỏ danh sách; phiên mới giữ số đếm, bỏ khóa cũ trong state (đã chuyển sang sổ bận), không đọc Sheet',
    ['conflicts' in legacyStored.metadata, 'conflicts' in carriedStart.metadata, carriedStart.metadata.conflictCount, carriedStart.counts.conflict, 'locks' in carriedStart],
    [false, false, 1, 0, false]);
  orchestration.FbmSync.readLocal = () => [];
  const restartFromConflict = orchestration.FbmSync.stateRead();
  restartFromConflict.phase = 'conflict';
  restartFromConflict.metadata.conflictCount = 1;
  restartFromConflict.counts.conflict = 1;
  orchestration.FbmSync.stateWrite(restartFromConflict);
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const restartedConflict = orchestration.FbmSync.start({ mode: 'read' });
   check(so, 'bam Dong bo ngay khi phase conflict phai probe lai phien; so xung dot ton dong van hien',
     [restartedConflict.ok, restartedConflict.request.meta.kind, restartedConflict.status.metadata.conflictCount, restartedConflict.status.counts.conflict],
     [true, 'session_probe', 1, 0]);
  orchestration.FbmSync.stateWrite(orchestration.FbmSync.runOpen({ phase: 'idle' }));
  const bulkStarted = orchestration.FbmSync.start({ mode: 'read', scan: 'activity_bulk' });
  const bulkSnapshotState = orchestration.FbmSync.stateRead();
  const bulkSnapshotRequest = orchestration.FbmSync.activityBulkRequest({ type: 0 });
   check(so, 'start bulk Activity probe User truoc request bulk; request lấy toàn bộ giao dịch không lọc ngày',
     [bulkStarted.request.meta.kind, bulkSnapshotState.scan, bulkSnapshotRequest.body.filter],
     ['session_probe', 'activity_bulk', []]);
   check(so, 'probe User khong mang authorized cu',
     [started.request.body.authorized, started.request.body.controller],
     [undefined, 'User']);
  check(so, 'envelope mang runId/requestId va GAS luu moc response',
    [Boolean(started.request.meta.trace.runId), Boolean(started.request.meta.trace.requestId), orchestration.FbmSync.stateRead().activeRequestId === bulkStarted.request.meta.trace.requestId, orchestration.FbmSync.traceRead(5).some((item) => item.stage === 'response_built')],
    [true, true, true, true]);
   orchestration.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0, phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   check(so, 'fixture transport dat marker phien song truoc request nghiep vu',
     [orchestration.FbmSync.sessionIdentityIsVerified(orchestration.FbmSync.stateRead()), orchestration.FbmSync.stateRead().cursor.kind],
     [true, 'customer_grid']);
   const dateEnvelope = orchestration.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', body: { gridPageValue: [new Date('2026-09-09T00:00:00Z'), { nested: new Date('2026-09-10T00:00:00Z') }] }, meta: { kind: 'grid' } });
   check(so, 'request nghiep vu sau marker live khong bi thay bang probe',
     [dateEnvelope.meta.kind, orchestration.FbmSync.stateRead().cursor.kind, orchestration.FbmSync.stateRead().activeRequestId === dateEnvelope.id],
     ['grid', 'customer_grid', true]);
  check(so, 'envelope khong tra Date o cursor phan trang Activity',
    [dateEnvelope.body.gridPageValue[0], dateEnvelope.body.gridPageValue[1].nested],
    ['/Date(1788912000000)/', '/Date(1788998400000)/']);
  check(so, 'response co trace bridge client van nhan dung reservation GAS',
    orchestration.FbmSync.responseRequestId({ transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gas-request-1' }, { stage: 'bridge_response_sent', clientRequestId: 'sidebar-waiter-1' }] } }),
    'gas-request-1');
  check(so, 'response co trace bridge cu van bo qua waiter id va nhan reservation GAS',
    orchestration.FbmSync.responseRequestId({ transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gas-request-2' }, { stage: 'bridge_response_sent', requestId: 'sidebar-waiter-2' }] } }),
    'gas-request-2');
  let blockedEndpoint = '';
  try { orchestration.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/Main/undefined', body: {}, meta: { kind: 'legacy' } }); } catch (err) { blockedEndpoint = String(err && err.message || err); }
  check(so, 'endpoint legacy undefined bi chan truoc khi cap envelope',
    blockedEndpoint.indexOf('FBM_ENDPOINT_MISSING') >= 0,
    true);
  check(so, 'GAS tao body wire escaped cho FBM',
    [dateEnvelope.bodyText.indexOf('\\/Date(1788912000000)\\/') >= 0, dateEnvelope.bodyText.indexOf('/Date(1788912000000)/') >= 0],
    [true, false]);
  const traceEvents = [{ stage: 'client_gas_call_started', requestId: 'trace-1', at: 1 }, { stage: 'client_gas_success', requestId: 'trace-1', at: 2 }];
  const writesBeforeTraceImport = propertyCount.ghi;
  const traceState = orchestration.FbmSync.stateRead();
  check(so, 'trace client ghi theo lo mot lan',
    [orchestration.FbmSync.traceImport(traceState, traceEvents), propertyCount.ghi - writesBeforeTraceImport],
    [2, 1]);
  check(so, 'trace client gui lai khong ghi lap',
    [orchestration.FbmSync.traceImport(traceState, traceEvents), propertyCount.ghi - writesBeforeTraceImport],
    [0, 1]);
  check(so, 'ngữ cảnh trace lấy từ ô lượt bên gọi truyền vào, không tự đọc ô lượt',
    orchestration.FbmSync.traceContext({ runId: 'r-trace', cursor: { operation: 'grid' } }, {}).runId + '/' + orchestration.FbmSync.traceContext({ runId: 'r-trace', cursor: { operation: 'grid' } }, {}).operation,
    'r-trace/grid');
  check(so, 'body lỗi FBM không phải JSON cho câu báo rõ, body có Bugs cho nội dung lỗi',
    [orchestration.FbmSync.protocol.httpErrorMessage(500, '<html>lỗi</html>'), orchestration.FbmSync.protocol.httpErrorMessage(400, '{"d":{"Bugs":{"Message":"Sai"}}}')],
    ['HTTP 500: FBM không trả nội dung lỗi đọc được.', 'HTTP 400: Sai']);
   orchestration.FbmSync.statePatch({ origin: 'manual', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, activeRequestId: dateEnvelope.id, deadlineAt: Date.now() + 60000, metadata: { sessionGate: {} }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const retrySlice = orchestration.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: dateEnvelope.id }] } });
    check(so, 'loi request nghiep vu fail-closed khong tu retry',
      [retrySlice && retrySlice.ok, retrySlice && retrySlice.code, retrySlice && retrySlice.request, orchestration.FbmSync.stateRead().phase, orchestration.FbmSync.stateRead().lastFailureCode],
      [false, 'TRANSPORT_ERROR', null, 'error', 'TRANSPORT_ERROR']);
  const missingRequestId = orchestration.FbmSync.continue({ ok: true, status: 200, body: '{"d":{}}' });
   check(so, 'response thieu requestId bi chan khong an nham reservation',
     [missingRequestId.ok, missingRequestId.code, orchestration.FbmSync.stateRead().activeRequestId],
     [false, 'STALE_RESPONSE', '']);
   orchestration.FbmSync.statePatch({ runId: 'active-run', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, activeRequestId: 'active-request', deadlineAt: Date.now() + 60000, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const blockedDuplicate = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start khong cap request chong khi reservation cu con hieu luc',
    [blockedDuplicate.ok, blockedDuplicate.code, blockedDuplicate.request],
    [false, 'REQUEST_IN_FLIGHT', null]);
   orchestration.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const resumed = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start chi tiep tuc sau khi reservation cu da thu hoi bang probe moi',
    [resumed.ok, resumed.resumed, resumed.request.meta.kind],
    [true, true, 'session_probe']);
  const staleState = JSON.parse(props.data[orchestration.FbmSync.STATE_KEY]);
  staleState.runId = 'old-run'; staleState.updatedAt = Date.now() - orchestration.FbmSync.STALE_RUN_MS - 1; staleState.lastProgressAt = staleState.updatedAt; staleState.activeRequestId = '';
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(staleState);
  const restarted = orchestration.FbmSync.start({ mode: 'read' });
   check(so, 'run stale duoc thay bang phien moi va probe lai',
     [restarted.ok, restarted.resumed, restarted.request.meta.kind, orchestration.FbmSync.stateRead().runId === 'old-run'],
     [true, undefined, 'session_probe', false]);
  const abandoned = orchestration.FbmSync.stateRead();
  abandoned.runId = 'abandoned-run'; abandoned.phase = 'pull_customer'; abandoned.updatedAt = Date.now() - orchestration.FbmSync.STALE_RUN_MS - 1;
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(abandoned);
  const staleView = orchestration.FbmSync.statusView();
  check(so, 'status chi doc khong tu ghi de phien stale',
    [staleView.phase, staleView.lastFailureCode, orchestration.FbmSync.stateRead().runId],
    ['pull_customer', '', 'abandoned-run']);
  const uncertainWrite = orchestration.FbmSync.runOpen({ entity: 'customer', phase: 'push', total: 1 });
  uncertainWrite.cursor = { kind: 'push_wait' };
  orchestration.FbmSync.stateWrite(uncertainWrite);
  giuBanGhiDongBo(orchestration, 'customer', 'C-1');
  const staleClose = (state) => orchestration.FbmSync.staleRunClose(state, orchestration.FbmSync.staleRunCheck(state, Date.now() + orchestration.FbmSync.STALE_RUN_MS + 1));
  const recoveredWrite = staleClose(orchestration.FbmSync.stateRead());
  check(so, 'Lượt mất phản hồi lúc chờ lệnh ghi: không tự thử lại và vẫn giữ bản ghi trong sổ bận',
    [recoveredWrite.phase, recoveredWrite.lastFailureCode, orchestration.recordHoldsPeekOwner('fbm')],
    ['error', 'SYNC_STALE_WRITE', true]);
  const stuckRead = orchestration.FbmSync.runOpen({ entity: 'customer', phase: 'pull_customer', total: 1 });
  orchestration.FbmSync.stateWrite(stuckRead);
  giuBanGhiDongBo(orchestration, 'customer', 'C-1');
  staleClose(orchestration.FbmSync.stateRead());
  check(so, 'Lượt kẹt không chờ lệnh ghi thì nhả mọi bản ghi đồng bộ đang giữ',
    orchestration.recordHoldsPeekOwner('fbm'),
    false);
  const lookupProps = {};
  const lookupHop = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService({ doc: lookupProps }) });
  napServer(lookupHop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/SheetSave.js');
  lookupHop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, namesBySource: {}, warnings: [] });
  lookupHop.FbmSync.readLocal = () => [];
  lookupHop.FbmSync.currentSpreadsheetId = () => 'sheet-lookup-test';
  lookupHop.FbmSync.identityStatus = () => ({ status: 'BOUND' });
  const lookupErrorState = lookupHop.FbmSync.runOpen({ phase: 'checking_session' });
  lookupErrorState.mode = 'write'; lookupErrorState.origin = 'manual'; lookupErrorState.phase = 'checking_session'; lookupErrorState.cursor = { kind: 'lookup', index: 0 }; lookupErrorState.activeRequestId = 'lookup-error-request'; lookupErrorState.session.identityVerified = true; lookupErrorState.session.sessionId = 'lookup-session'; lookupErrorState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupErrorState);
  const lookupError = lookupHop.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-error-request' }] } });
  check(so, 'lookup loi transport hoac parse fail-closed khong tu dong di tiep',
    [lookupError.ok, lookupError.request, lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().cursor.kind],
    [false, null, 'error', 'lookup']);
  const lookupEmptyState = lookupHop.FbmSync.stateRead(); lookupEmptyState.runId = 'lookup-empty-run'; lookupEmptyState.phase = 'checking_session'; lookupEmptyState.cursor = { kind: 'lookup', index: 0 }; lookupEmptyState.activeRequestId = 'lookup-empty-request'; lookupEmptyState.session.identityVerified = true; lookupEmptyState.session.sessionId = 'lookup-session'; lookupEmptyState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupEmptyState);
  const lookupEmpty = lookupHop.FbmSync.continue({ ok: true, status: 200, items: [0, 1, 2].map((id) => ({ id: String(id), ok: true, status: 200, body: '{"d":{"Rows":[]}}' })), transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-empty-request' }] } });
  check(so, 'lo danh muc thanh cong nhung khong co dong la ket qua hop le va di tiep',
    [lookupEmpty.ok, lookupEmpty.request && lookupEmpty.request.meta.kind, lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().metadata.categoryLookupFailed],
    [true, 'scan_job', 'pull_customer', undefined]);
  orchestration.FbmSync.previewRecords('customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM',
    orchestration.FbmSync.previewRead().customers[0].code,
    'ALT00010');
  const pullStatus = orchestration.FbmSync.stateRead();
  pullStatus.phase = 'pull_customer'; pullStatus.entity = 'customer'; pullStatus.mode = 'read'; orchestration.FbmSync.stateWrite(pullStatus);
  const pullView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu FBM ve ShinCRM', pullView.direction, 'FBM → ShinCRM');
  check(so, 'status noi ro dang dong bo khach hang', pullView.entityLabel, 'Khách hàng');
  const resumeState = orchestration.FbmSync.stateRead();
  resumeState.runId = 'resume-run'; resumeState.phase = 'pull_customer'; resumeState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['d', 't', 'x'], count: 2000 };
  orchestration.FbmSync.stateWrite(resumeState);
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const resumedGrid = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'Sidebar mo lai probe lai phien truoc khi tiep tuc cursor Customer',
    [resumedGrid.ok, resumedGrid.resumed, resumedGrid.request.meta.kind],
    [true, true, 'session_probe']);
  const pushStatus = orchestration.FbmSync.stateRead();
  pushStatus.phase = 'push'; pushStatus.entity = 'activity'; pushStatus.mode = 'write'; orchestration.FbmSync.stateWrite(pushStatus);
  const pushView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu ShinCRM sang FBM', pushView.direction, 'ShinCRM → FBM');
  check(so, 'status noi ro dang dong bo giao dich', pushView.entityLabel, 'Giao dịch');
  const compactState = orchestration.FbmSync.stateRead();
  compactState.cursor = { kind: 'push_wait', operation: 'activity_edit_save', entity: 'activity', index: 0, candidate: { record: { payload: 'khong-duoc-gui' } }, oldValues: { details: 'old-value' } };
  compactState.metadata.categoryGate = { map: { category: 'FBM' }, valid: { category: true } };
  compactState.metadata.identityProbe = { spreadsheetId: 'sheet-probe', userId: '2037', accountName: 'ANHLT' };
  orchestration.FbmSync.stateWrite(compactState);
  const compactView = orchestration.FbmSync.statusView();
  check(so, 'status Sidebar khong tra Category gate va OldValue noi bo',
    [compactView.metadata.categoryGate, compactView.cursor.candidate, compactView.cursor.operation],
    [undefined, undefined, 'activity_edit_save']);
  check(so, 'status Sidebar giu identity probe de tu dien tai khoan',
    compactView.metadata.identityProbe,
    { spreadsheetId: 'sheet-probe', userId: '2037', accountName: 'ANHLT' });
  check(so, 'status Sidebar giu response nho khi state noi bo lon', JSON.stringify(compactView).length < 5500, true);

  const pausedState = orchestration.FbmSync.stateRead();
  pausedState.runId = 'paused-run'; pausedState.phase = 'paused'; pausedState.cursor = {};
  orchestration.FbmSync.stateWrite(pausedState);
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const restartedPaused = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'dong bo lai tu trang thai tam dung probe lai phien',
    [restartedPaused.ok, restartedPaused.request.meta.kind, restartedPaused.resumed],
    [true, 'session_probe', undefined]);
  orchestration.FbmSync.statePatch({ runId: 'scheduled-run', origin: 'background', phase: 'pull_customer', process: 'customerFull', activeRequestId: '', deadlineAt: 0 });
  orchestration.FbmSync.runStopCommand('any');
  check(so, 'Dừng lượt nền giữ kết quả ở trạng thái tạm dừng và giữ tên tiến trình để lần hỏi sau ghi kết quả vào sổ',
    [orchestration.FbmSync.stateRead().phase, orchestration.FbmSync.stateRead().process],
    ['paused', 'customerFull']);

  const guards = taoHopCat({ FbmSync: {}, PropertiesService: taoPropertiesService() });
  napServer(guards, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  check(so, 'push config chan khi phien chua co ten day du cua tai khoan da xac minh',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }),
    'Phiên FBM chưa có tên đầy đủ của tài khoản đã xác minh; chiều đẩy đã bị dừng.');
  check(so, 'push config chan tao Customer khi thieu prefix va do dai ma khach',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh' }),
    'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.');
  check(so, 'push config cho phep tao Customer khi du prefix va do dai ma khach',
    guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' }),
    '');
  check(so, 'push config cho activity sua khi account co',
    guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }),
    '');

  const schedulerData = {};
  const scheduler = taoHopCat({ FbmSync: {}, SETTINGS: { LOCK_WAIT_MS: 1 }, PropertiesService: taoPropertiesService({ doc: schedulerData }), LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, runEntryPoint: (name, source, fn) => fn() });
  napServer(scheduler, 'fbm_sync/schema/FbmFields.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js');
  const schedule = scheduler.FbmSync.scheduleShape(scheduler.settingsValues(scheduler.FbmSync.SETTING_SECTIONS.background));
  check(so, 'Lấy toàn bộ giao dịch chạy nền mặc định chu kỳ 8 giờ; chưa từng chạy xong thì đến hạn ngay',
    [schedule.activityFull.minutes, scheduler.FbmSync.processDueAt('activityFull', schedule, scheduler.FbmSync.processBookRead())],
    [480, 0]);
  // Trigger hẹn giờ phía GAS của thiết kế cũ còn sót trên project: gọi tới thì tự gỡ mọi trigger cũ, ghi một dòng Log, không đụng state hay lịch nền.
  const triggers = ['fbmHeartbeatTrigger', 'fbmSupervisorTrigger', 'shinOnEdit', 'fbmCustomerScanTrigger'].map((name) => ({ getHandlerFunction: () => name }));
  const deleted = [], legacyLogs = [];
  scheduler.ScriptApp = { getProjectTriggers: () => triggers.filter((trigger) => deleted.indexOf(trigger) < 0), deleteTrigger: (trigger) => deleted.push(trigger) };
  scheduler.logEvent = (entry) => legacyLogs.push(entry);
  const stateBeforeLegacy = JSON.stringify(scheduler.FbmSync.stateRead()), markersBeforeLegacy = JSON.stringify(schedulerData);
  scheduler.fbmHeartbeatTrigger();
  scheduler.fbmSupervisorTrigger();
  check(so, 'Trigger hẹn giờ cũ còn sót tự gỡ hết trigger cũ ở lần chạy đầu, giữ trigger khác, ghi một dòng Log, không đổi state và mốc lịch nền',
    [deleted.map((trigger) => trigger.getHandlerFunction()).join(','), legacyLogs.length, legacyLogs[0] && legacyLogs[0].action, JSON.stringify(scheduler.FbmSync.stateRead()) === stateBeforeLegacy, JSON.stringify(schedulerData) === markersBeforeLegacy],
    ['fbmHeartbeatTrigger,fbmSupervisorTrigger,fbmCustomerScanTrigger', 1, 'legacy_trigger_removed', true, true]);
  // Nhịp nền chỉ do alarm `gas_poll` của Extension (09/02): code đồng bộ không được cài trigger hẹn giờ nào.
  const fbmSources = require('fs').readdirSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync'), { recursive: true }).filter((file) => /\.js$/.test(file)).map((file) => require('fs').readFileSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync', file), 'utf8'));
  check(so, 'Code đồng bộ FBM không cài trigger hẹn giờ nào phía GAS', fbmSources.filter((source) => /newTrigger\(|timeBased\(/.test(source)).length, 0);

}

module.exports = { chay };
