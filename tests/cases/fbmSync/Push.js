/** Kiểm tra chiều push, khóa, owner và log. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, giuBanGhiDongBo, soBan, TRANG_FBM_THU } = require("../../lib/load-gas");
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section("FBM sync — push");
  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  // pushCandidates không còn nuốt lỗi đọc state, nên hộp thử phải có state và sổ lỗi đẩy dù rỗng.
  pushed.FbmSync.stateRead = () => ({ metadata: {} });
  pushed.FbmSync.pushFailuresRead = () => ({ hashes: {}, details: {} });
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', fbmSyncPermission: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  const props = { data: {} };
  const propertyApi = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { props.data[key] = String(value); } };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => propertyApi, getScriptProperties: () => propertyApi }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
  orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const approvalProps = { data: {} };
  const approvalPropertyApi = { getProperty: (key) => approvalProps.data[key] || null, setProperty: (key, value) => { approvalProps.data[key] = String(value); } };
  const approval = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => approvalPropertyApi, getScriptProperties: () => approvalPropertyApi } });
  napServer(approval, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/report/Report.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
  approval.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  // Phần kiểm tra rẻ chạy đầu lượt; phần đọc và hash cả hai Sheet chỉ chạy sau khi phiên FBM xác thực xong, nên FBM hỏng ở bước xác thực thì ShinCRM chưa tốn công tính.
  const localCalls = [];
  approval.FbmSync.preflightGates = () => ({ ok: true, issues: [], blocking: [], warnings: [], candidateCount: 0 });
  approval.FbmSync.preflightNeedsLocal = (options) => options.mode !== 'read';
  approval.FbmSync.preflightLocal = (options) => { localCalls.push(options.mode); return { ok: true, issues: [], blocking: [], warnings: [], candidateCount: 11 }; };
  approval.FbmSync.extractAuthorized = () => 'auth-token';
  const firstAsk = approval.FbmSync.start({ mode: 'write' });
  check(so, 'Mở lượt ghi: request đầu là kiểm phiên FBM, chưa đọc hay hash Sheet Customer/Activity', [firstAsk.ok, firstAsk.request.meta.kind, localCalls.length], [true, 'session_probe', 0]);
  approval.FbmSync.authContinue('customer', {});
  const awaiting = approval.FbmSync.authContinue('activity', {});
  check(so, 'Xác thực xong mới quét dữ liệu; đẩy từ 10 bản ghi trở lên thì dừng chờ người dùng chấp thuận, không cấp request dữ liệu', [awaiting, localCalls, approval.FbmSync.stateRead().phase, approval.FbmSync.stateRead().metadata.approvalCount], [null, ['write'], 'awaiting_approval', 11]);
  const approved = approval.fbmSyncApprovePush();
  check(so, 'chap thuan push cap probe User dau tien', [approved.ok, approved.request.meta.kind, approval.FbmSync.stateRead().metadata.approvalGranted], [true, 'session_probe', true]);
  approval.FbmSync.authContinue('customer', {});
  const afterApproval = approval.FbmSync.authContinue('activity', {});
  check(so, 'Sau chấp thuận lượt kiểm lại dữ liệu nhưng không hỏi lại, đi tiếp sang request dữ liệu', [!!afterApproval, localCalls.length, approval.FbmSync.stateRead().phase !== 'awaiting_approval'], [true, 2, true]);
  approval.FbmSync.stateWrite(approval.FbmSync.stateStart('', 'idle', 0));
  approval.FbmSync.readLocal = () => [];
  approval.FbmSync.start({ mode: 'read' });
  approval.FbmSync.authContinue('customer', {});
  approval.FbmSync.authContinue('activity', {});
  check(so, 'Chiều Lấy không quét hash Sheet ShinCRM ở bất kỳ bước nào', localCalls.length, 2);
  approval.FbmSync.stateWrite(approval.FbmSync.stateStart('', 'idle', 0));
  approval.FbmSync.preflightLocal = () => ({ ok: true, issues: [], blocking: [], warnings: [], candidateCount: 0 });
  const pushOnly = approval.FbmSync.start({ mode: 'push' });
  check(so, 'mode day rieng chi probe truoc khi gui du lieu ShinCRM len FBM', [pushOnly.ok, pushOnly.request.meta.kind, approval.FbmSync.stateRead().mode], [true, 'session_probe', 'push']);
  approval.FbmSync.stateWrite(approval.FbmSync.stateStart('', 'idle', 0));
  const checkOnly = approval.FbmSync.start({ mode: 'check' });
  check(so, 'bon mode tach dung quyen ghi Sheet va FBM', [
    checkOnly.ok,
    approval.FbmSync.canWriteSheet('check'), approval.FbmSync.canWriteFbm('check'),
    approval.FbmSync.canWriteSheet('read'), approval.FbmSync.canWriteFbm('read'),
    approval.FbmSync.canWriteSheet('push'), approval.FbmSync.canWriteFbm('push'),
    approval.FbmSync.canWriteSheet('write'), approval.FbmSync.canWriteFbm('write')
  ], [true, false, false, true, false, false, true, true, true]);
  let pullWriteCalls = 0;
  approval.FbmSync.pullWrite = (_entity, records) => { pullWriteCalls += 1; return { ok: true, written: records.length, conflicts: 0, skipped: 0 }; };
  approval.FbmSync.statePatch({ counts: { total: 0, completed: 0, succeeded: 0, error: 0, conflict: 0, skipped: 0 } });
  const readPull = approval.FbmSync.pullRecords('customer', [{ id: 'C-1' }], 'read');
  const checkPull = approval.FbmSync.pullRecords('customer', [{ id: 'C-2' }], 'check');
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
  resumeState.runId = 'resume-run'; resumeState.phase = 'pull_customer'; resumeState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['d', 't', 'x'], count: 2000 }; resumeState.activeRequestId = ''; resumeState.deadlineAt = 0;
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

  const guards = taoHopCat({ FbmSync: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }), getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }) } });
  napServer(guards, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  check(so, 'push config chan khi phien chua co ten day du cua tai khoan da xac minh', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }), 'Phiên FBM chưa có tên đầy đủ của tài khoản đã xác minh; chiều đẩy đã bị dừng.');
  check(so, 'push config chan tao Customer khi thieu prefix va do dai ma khach', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh' }), 'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.');
  check(so, 'push config cho phep tao Customer khi du prefix va do dai ma khach', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' }), '');
  check(so, 'ma khach FBM tu sinh phai khop prefix va do dai', [guards.FbmSync.validateAutoCustomerCode('ALT00010', { customerPrefix: 'ALT', customerCodeLength: '8' }).ok, guards.FbmSync.validateAutoCustomerCode('CUS-000001', { customerPrefix: 'ALT', customerCodeLength: '8' }).ok], [true, false]);
  check(so, 'push config cho activity sua khi account co', guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }), '');
  check(so, 'owner Activity lech tai khoan dang dang nhap bi chan truoc request push', guards.FbmSync.pushOwnerError({ entity: 'activity', id: 'ACT-OWNER', record: { owner: 'Tài khoản khác' } }, { accountName: 'Lê Tuấn Anh' }).indexOf('khác tài khoản FBM đang đăng nhập') >= 0, true);

  const pushProps = { data: {} };
  const pushPropertyApi = { getProperty: (key) => pushProps.data[key] || null, setProperty: (key, value) => { pushProps.data[key] = String(value); } };
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => pushPropertyApi, getScriptProperties: () => pushPropertyApi }, writeGateSave: () => ({ ok: true }) });
  napServer(push, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
  push.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const pushCandidatesImpl = push.FbmSync.pushCandidates;
  // Hộp này kiểm hàng đợi đẩy; lịch kiểm lại danh mục có test riêng.
  const pushLookupDueImpl = push.FbmSync.pushLookupDue;
  push.FbmSync.pushLookupDue = () => false;
  push.FbmSync.scriptSettings = () => ({ accountName: 'FBM test', baseUrl: 'https://fbm.test' });
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', baseUrl: 'https://fbm.test' });
  push.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }];
  push.FbmSync.validatePushCategories = () => [];
  const pushEligibilityErrors = push.FbmSync.pushEligibilityErrors;
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.customerEditOpenRequest = () => ({ url: 'https://fbm.test/edit', body: {}, meta: { kind: 'customer_edit_open' } });
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' }, { id: 'C-ERR', companyName: 'Lỗi' }, { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }] : [{ id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' }];
  const pushState = push.FbmSync.stateStart('', 'push', 0);
  pushState.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
  pushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(pushState);
  const pushRequest = push.FbmSync.nextPushRequest(pushState);
  const pushedState = push.FbmSync.stateRead();
  check(so, 'Trước request ghi FBM, bản ghi được giữ trong sổ bận dưới tên đồng bộ', soBan(push)['customer:C-1'].by, 'fbm');
  check(so, 'push request luu dung cursor cho phan hoi tiep', pushedState.cursor.kind, 'push_wait');
  check(so, 'push request co envelope protocol', pushRequest.meta.kind, 'customer_edit_open');
  push.FbmSync.pushCandidates = () => [
    { kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, raw: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1', companyName: 'Bản lúc chọn' } },
    { kind: 'edit', id: 'C-NEXT', position: 3, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }, raw: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ];
  const changedState = push.FbmSync.stateStart('', 'push', 0);
  changedState.session = pushState.session;
  changedState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(changedState);
  const changedRequest = push.FbmSync.nextPushRequest(changedState);
  check(so, 'ứng viên bị sửa sau lúc chọn thì hoãn tới lượt sau, không giữ, không gửi; lượt chuyển sang ứng viên kế tiếp', [
    !!changedRequest, push.FbmSync.stateRead().counts.skipped, Object.keys(soBan(push)), push.FbmSync.stateRead().current
  ], [true, 1, ['customer:C-NEXT'], 'C-NEXT']);
  push.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }];
  const conflictPushState = push.FbmSync.stateStart('', 'push', 0);
  conflictPushState.counts.conflict = 1;
  conflictPushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(conflictPushState);
  const conflictPushRequest = push.FbmSync.nextPushRequest(conflictPushState);
  check(so, 'pull phát hiện xung đột giữa lượt không dừng chiều đẩy: bản ghi khác vẫn được phát request đẩy', [!!conflictPushRequest, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().current], [true, 'push', 'C-1']);
  push.FbmSync.pushCandidates = () => [];
  const emptyWriteState = push.FbmSync.stateStart('', 'push', 0); emptyWriteState.mode = 'write'; emptyWriteState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; push.FbmSync.stateWrite(emptyWriteState);
  push.FbmSync.nextPushRequest(emptyWriteState);
  check(so, 'push khong co ung vien hien thong bao khong co ban ghi day', push.FbmSync.stateRead().message, 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.');
  let pushPatch, pushWriteRequest;
  const pushLogs = [];
  push.logEvent = (event) => pushLogs.push(event);
  push.writeGateSave = (request) => { pushWriteRequest = request; pushPatch = request.records[0]; return { ok: true }; };
  push.FbmSync.markPushResult({ entity: 'customer', record: { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' } }, { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-OLD' }, { Name: 'ma_kh', Value: 'ALT00010' }] } }, 'customer_edit_save');
  check(so, 'push thanh cong giu baseline cu cho ky xac nhan va dung source push', [pushPatch.fbmHash, pushWriteRequest.source], ['BASE', 'push']);
  check(so, 'push thành công không ghi Log từng record', pushLogs.length, 0);
  let pendingSet;
  const realPendingSet = push.FbmSync.pendingPushSet;
  push.FbmSync.pendingPushSet = (entity, id, value) => { pendingSet = value; };
  const createdActivity = { id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' };
  push.FbmSync.markPushResult({ entity: 'activity', record: createdActivity }, { d: { InternalValues: [{ Name: 'id', Value: 174900 }] } }, 'activity_new_save');
  check(so, 'FBM-050: tạo Activity lưu hash đã gửi kèm ID FBM vừa cấp, khớp bản đọc xác nhận', pendingSet.hSHIN, push.FbmSync.hash(Object.assign({}, createdActivity, { fbmId: '174900' }), 'activity', {}));
  push.FbmSync.pendingPushSet = realPendingSet;
  const errorState = { counts: { error: 0 }, metadata: { pushFailures: {} } };
  push.FbmSync.markPushError(errorState, { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', companyName: 'Lỗi' } }, 'FBM từ chối', 'customer_edit_save');
  check(so, 'push loi luu hash local de chan lap lai', push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'], push.FbmSync.hash({ id: 'C-ERR', companyName: 'Lỗi' }, 'customer', {}));
  check(so, 'push loi luu nguyen nhan hien thi rieng voi hash', push.FbmSync.pushFailuresRead().details['customer:C-ERR'].reason, 'FBM từ chối');
  check(so, 'push loi luu dung buoc request gay loi', push.FbmSync.pushFailuresRead().details['customer:C-ERR'].requestKind, 'customer_edit_save');
  let retryPatch;
  push.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-FAIL', fbmId: '174813', syncStatus: push.FbmSync.SYNC_STATUS.error, content: 'Nội dung cũ' }]
    : [];
  push.writeGateSave = (request) => { retryPatch = request.records; return { ok: true }; };
  const retryState = push.FbmSync.stateStart('', 'done', 0);
  push.FbmSync.stateWrite(retryState);
  push.FbmSync.pushFailuresWrite({ hashes: { 'activity:ACT-FAIL': 'failed-hash', 'activity:ACT-GONE': 'gone-hash' }, details: { 'activity:ACT-FAIL': { reason: 'HTTP 500' } } });
  const retryEnabled = push.fbmSyncRetryPushFailures();
  check(so, 'retry push mo lai ca lo cung payload khong doi du lieu', [retryEnabled.ok, retryPatch[0].syncStatus, push.FbmSync.pushFailuresRead().hashes['activity:ACT-FAIL']], [true, push.FbmSync.SYNC_STATUS.pending, undefined]);
  check(so, 'mở lại bản ghi lỗi xóa luôn dấu lỗi của bản ghi không còn trên Sheet, để nó không chiếm chỗ cầu dao lỗi đẩy', [retryEnabled.missing, Object.keys(push.FbmSync.pushFailuresRead().hashes)], [1, []]);
  // Từ đây Sheet giả chứa đúng các ứng viên đang được chọn: chiều đẩy đọc lại dòng trong cửa trước khi đánh dấu "đang đẩy".
  push.FbmSync.readLocal = () => (push.FbmSync.pushCandidates() || []).map((candidate) => candidate.record);
  push.FbmSync.pushCandidates = () => [
    { kind: 'edit', id: 'C-ERR', position: 0, record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } },
    { kind: 'edit', id: 'C-NEXT', position: 1, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ];
  const pushErrorProps = push.FbmSync.stateStart('', 'push', 0);
  pushErrorProps.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
  pushErrorProps.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(pushErrorProps);
  const continuedPush = push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, 'Owner sai');
  check(so, 'push loi mot record van tiep tuc record ke', [continuedPush.continued, continuedPush.request.meta.kind, push.FbmSync.stateRead().cursor.index, push.FbmSync.stateRead().counts.error], [true, 'customer_edit_open', 1, 1]);
  push.FbmSync.pushEligibilityErrors = pushEligibilityErrors;
  push.FbmSync.stateWrite(pushedState);
  giuBanGhiDongBo(push, 'customer', 'C-2');
  push.fbmSyncCancel();
  check(so, 'Dừng phiên nhả mọi bản ghi đồng bộ đang giữ trong sổ bận', Object.keys(soBan(push)), []);

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
    push.FbmSync.continuePush({ metadata: {}, cursor: { operation: 'activity_edit_open', entity: 'activity', candidate: { entity: 'activity', id: 'ACT-OWNER', record: { id: 'ACT-OWNER', fbmId: 'A-OWNER' } } } }, { d: { Row: ['A-OWNER'], InternalValues: [{ Name: 'owner', NewValue: 'Chu tai khoan khac' }] } });
  } catch (error) { ownerMismatch = String(error && error.message || error); }
  check(so, 'Activity sai owner bi chan truoc request sua', ownerMismatch.indexOf('owner FBM khác') >= 0, true);
  ['customer', 'activity'].forEach((entity) => {
    let notFound = null;
    try {
      push.FbmSync.continuePush({ metadata: {}, cursor: { operation: entity + '_edit_open', entity, candidate: { entity, id: 'X-GIA', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } } } }, { d: { Row: null, InternalValues: [{ Name: 'nguoi_sua', NewValue: '' }] } });
    } catch (error) { notFound = error; }
    check(so, 'FBM-048: ' + entity + ' mở form không thấy đúng bản ghi thì không phát lệnh lưu', [notFound && notFound.code, push.FbmSync.stateRead().cursor && push.FbmSync.stateRead().cursor.operation === entity + '_edit_save'], ['FBM_RECORD_NOT_FOUND', false]);
  });
  {
    const savedGate = push.writeGateSave, savedRead = push.FbmSync.readLocal, savedLog = push.FbmSync.logPushRecord, sheetRows = [], logRows = [];
    push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'X-GIA', fbmId: 'FBM-GIA' }] : [];
    push.writeGateSave = (request) => { sheetRows.push(...request.records); return { ok: true }; };
    push.FbmSync.logPushRecord = (candidate, op, outcome, reason, detail) => { logRows.push([outcome, detail.syncStatus, detail.failureCode]); };
    const missingState = push.FbmSync.stateStart('', 'push', 0);
    push.FbmSync.markPushError(missingState, { entity: 'customer', id: 'X-GIA', kind: 'edit', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } }, Object.assign(new Error('FBM không trả bản ghi FBM-GIA'), { code: 'FBM_RECORD_NOT_FOUND' }), 'customer_edit_open');
    push.writeGateSave = savedGate; push.FbmSync.readLocal = savedRead; push.FbmSync.logPushRecord = savedLog;
    check(so, 'FBM-048: không thấy bản ghi khi mở form ghi Sheet "không thấy bên FBM" và Log lỗi kèm mã', [sheetRows.map((row) => row.syncStatus), logRows], [[push.FbmSync.SYNC_STATUS.missing], [['error', push.FbmSync.SYNC_STATUS.missing, 'FBM_RECORD_NOT_FOUND']]]);
  }
  const bugState = push.FbmSync.stateStart('', 'push', 0);
  bugState.mode = 'push'; bugState.activeRequestId = 'test-bug-request'; bugState.cursor = { kind: 'push_wait', operation: 'customer_edit_save', entity: 'customer', index: 0, candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(bugState);
  const bugResult = push.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-bug-request' }] } });
  check(so, 'Bugs HTTP 200 danh dau loi record va khong retry request da gui', [bugResult.continued, push.FbmSync.stateRead().counts.error, push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'] !== undefined], [true, 1, true]);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-NEW', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: 'Chỉ lấy từ FBM' }]
    : [];
  check(so, 'Customer moi chua cho phep chi pull khong push', pushed.FbmSync.pushCandidates('customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-XUNGDOT', fbmId: 'F1', fbmCustomerCode: 'ALT2', fbmSyncPermission: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.conflict, companyName: 'Sửa', fbmHash: 'cu' }, { id: 'CUS-KHAC', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: 'Cho phép', companyName: 'Mới' }]
    : [];
  check(so, 'dòng vừa thành xung đột bị pushCandidates loại vì đọc lại trạng thái trên dòng; bản ghi khác vẫn vào danh sách đẩy', pushed.FbmSync.pushCandidates('customer').map((item) => item.id), ['CUS-KHAC']);
  pushed.FbmSync.stateRead = () => { throw new Error('Không đọc được state'); };
  let stateReadFailure = '';
  try { pushed.FbmSync.pushCandidates('customer'); } catch (error) { stateReadFailure = String(error && error.message || error); }
  check(so, 'pushCandidates không nuốt lỗi đọc state: ném lỗi rõ thay vì coi sổ lỗi đẩy là rỗng', stateReadFailure, 'Không đọc được state');
  pushed.FbmSync.stateRead = () => ({ metadata: {} });
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', fbmSyncPermission: pushed.FbmSync.pullDefaultPermission() }]
    : [{ id: 'ACT-NEW', customerId: 'CUS-PARENT', fbmId: '', fbmSyncPermission: pushed.FbmSync.pullDefaultPermission(), taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09' }];
  check(so, 'Activity moi co Customer cha lien ket duoc dua vao queue', pushed.FbmSync.pushCandidates('activity').length, 1);
  {
    const allow = pushed.FbmSync.pullDefaultPermission(), savedScope = pushed.FbmSync.scope;
    pushed.FbmSync.scope = () => ({ codes: ['ALT00010', 'CUS-NEW'], fbm: ['ALT00010'], shin: ['CUS-ALT', 'CUS-NEW'], notFound: [] });
    pushed.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [
        { id: 'CUS-ALT', fbmId: 'FBM-ALT', fbmCustomerCode: 'ALT00010', fbmSyncPermission: allow, syncStatus: pushed.FbmSync.SYNC_STATUS.pending },
        { id: 'CUS-NEW', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: allow, companyName: 'Khách mới' },
        { id: 'CUS-KHAC', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: allow, companyName: 'Khách ngoài phạm vi' },
        { id: 'CUS-THAT', fbmId: 'FBM-THAT', fbmCustomerCode: 'ALT00999', fbmSyncPermission: allow }
      ]
      : [
        { id: 'ACT-ALT', customerId: 'CUS-ALT', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'A', workDate: '2026-10-07' },
        { id: 'ACT-THAT', customerId: 'CUS-THAT', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'B', workDate: '2026-10-07' }
      ];
    check(so, 'Phạm vi giới hạn: chiều đẩy chỉ xét khách GAS đã đổi ra từ danh sách (khách ghép cặp và khách mới chưa có mã FBM), khách ngoài danh sách và Activity của nó bị chặn',
      [pushed.FbmSync.pushCandidates('customer').map((c) => c.kind + ':' + c.id), pushed.FbmSync.pushCandidates('activity').map((c) => c.id)],
      [['edit:CUS-ALT', 'create:CUS-NEW'], ['ACT-ALT']]);
    pushed.FbmSync.scope = savedScope;
  }
  {
    // 09/05 Phần 9: bản ghi vắng hoặc đã chuyển cho người khác, và giao dịch của khách mang hai trạng thái đó, sửa trên Sheet cũng không được đẩy.
    const allow = pushed.FbmSync.pullDefaultPermission(), sync = pushed.FbmSync.SYNC_STATUS;
    pushed.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [
        { id: 'CUS-MAT', fbmId: 'FBM-MAT', fbmCustomerCode: 'ALT00011', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, companyName: 'Sửa khi vắng' },
        { id: 'CUS-CHUYEN', fbmId: 'FBM-CHUYEN', fbmCustomerCode: 'ALT00012', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.transferred, companyName: 'Sửa khi đã chuyển' },
        { id: 'CUS-OK', fbmId: 'FBM-OK', fbmCustomerCode: 'ALT00013', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.synced, companyName: 'Sửa bình thường' }
      ]
      : [
        { id: 'ACT-CUA-CHUYEN', customerId: 'CUS-CHUYEN', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'Mới dưới khách đã chuyển', workDate: '2026-10-16' },
        { id: 'ACT-MAT', customerId: 'CUS-OK', fbmId: '200001', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, taskType: 'Goi', content: 'Sửa khi vắng', workDate: '2026-10-16' },
        { id: 'ACT-OK', customerId: 'CUS-OK', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'Mới', workDate: '2026-10-16' }
      ];
    check(so, 'Đóng băng: bản ghi mang "không thấy bên FBM" hoặc "đã chuyển cho người khác" và giao dịch của khách đã chuyển không vào danh sách đẩy dù đã sửa',
      [pushed.FbmSync.pushCandidates('customer').map((c) => c.id), pushed.FbmSync.pushCandidates('activity').map((c) => c.id)],
      [['CUS-OK'], ['ACT-OK']]);
  }
  const transportState = push.FbmSync.stateStart('', 'read', 0);
  push.FbmSync.scriptSettings = () => ({ baseUrl: 'https://fbm.test', cookie: 'cookie' });
  transportState.phase = 'pull_customer'; transportState.activeRequestId = 'test-transport-request'; transportState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] };
  push.FbmSync.stateWrite(transportState);
  const http500 = push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"server"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-transport-request' }] } });
  check(so, 'HTTP 500 cua request nghiep vu fail-closed va giu cursor', [http500.ok, http500.request, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], [false, null, 'error', 'customer_grid']);
  [{ status: 401, body: '' }, { status: 403, body: '' }, { status: 200, body: '<form action="Login.aspx"></form>' }].forEach((failure) => {
    const sessionState = push.FbmSync.stateStart('', 'read', 0);
    sessionState.phase = 'pull_customer'; sessionState.activeRequestId = 'test-session-request'; sessionState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'] };
    push.FbmSync.stateWrite(sessionState);
    const sessionResult = push.FbmSync.continue({ ok: failure.status === 200, status: failure.status, body: failure.body, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-session-request' }] } });
  const suspicious = failure.status === 401 || failure.status === 403;
  check(so, 'Session error ' + failure.status + ' duoc probe lai hoac fail-closed', [sessionResult.ok, sessionResult.request && sessionResult.request.meta.kind, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], suspicious ? [true, 'session_probe', 'checking_session', 'session_probe'] : [false, null, 'error', 'customer_grid']);
  });
  const skippedLogs = [];
  push.logEvent = (event) => skippedLogs.push(event);
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-SKIP' }] : [];
  const skippedState = { counts: { skipped: 0 }, metadata: {} };
  push.FbmSync.markPushSkipped(skippedState, { entity: 'activity', id: 'ACT-SKIP' }, push.FbmSync.SYNC_STATUS.unknownCategory, 'Category chua khop');
  check(so, 'Push record bị hoãn chỉ tăng state, không ghi Log chi tiết', [skippedState.counts.skipped, skippedLogs.length], [1, 0]);
  push.FbmSync.readLocal = () => (push.FbmSync.pushCandidates() || []).map((candidate) => candidate.record);
  push.logEvent = (event) => {
    pushLogs.push(event);
    skippedLogs.push(event);
  };
  check(so, 'Xung đột phát hiện giữa lượt không còn công tắc dừng cả chiều đẩy: chỉ dòng xung đột bị pushCandidates loại', typeof push.FbmSync.stopPushOnConflicts, 'undefined');

  const activityCandidate = { entity: 'activity', kind: 'create', id: 'ACT-NEW', position: 0, record: { id: 'ACT-NEW', fbmId: '', customerFbmCode: 'ALT00010', stt_rec: 'A-CUS', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09', fbmSyncPermission: push.FbmSync.pullDefaultPermission() } };
  push.FbmSync.pushCandidates = () => [activityCandidate];
  push.FbmSync.validatePushCategories = () => [];
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', baseUrl: 'https://fbm.test', activityAuthorized: '1.test' });
  const activityEditOpen = push.FbmSync.activityEditOpenRequest('174813');
  check(so, 'Activity edit mo form dung type 0 va token activity', [activityEditOpen.body.type, activityEditOpen.body.viewPage, activityEditOpen.body.authorized, activityEditOpen.meta.kind], [0, true, '1.test', 'activity_edit_open']);
  const activityEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, ma_cv: 'GD', details: 'Noi dung cu', start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T00:00:00Z'), fileticket: 'ticket' }, {});
  check(so, 'Activity edit gui id FBM thay vi id noi bo', activityEdit.body.memvars.filter((item) => item.Name === 'id')[0].NewValue, 174813);
  check(so, 'Activity edit khong tra Date trong ket qua GAS', JSON.stringify(activityEdit).indexOf('2026-09-09T00:00:00.000Z') < 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue || '').indexOf('/Date(') === 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue || '').indexOf('/Date(') === 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue || '').indexOf('/Date(') === 0, true);
  check(so, 'Activity edit doi ngay Sheet thanh Date .NET dung fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue, activityEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue], ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const unchangedDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T16:59:59Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {});
  check(so, 'Activity edit Sheet không đổi ngày thì gửi lại đúng ngày của form ở dạng 0 giờ UTC', [unchangedDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue, unchangedDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue], ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const formDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {});
  check(so, 'Activity edit gửi ngày form dạng 0 giờ UTC theo ngày VN như giao diện FBM, không gửi lại mốc FBM trả (lùi 7 tiếng)', [
    formDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].OldValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/']);
  const changedWorkDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-10-11' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {});
  check(so, 'Activity edit doi ngay phat sinh nhung giu ngay bat dau', [
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].OldValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1791676800000)/']);
  // Ca gặp thật 2026-10-07: form trả 22/09 01:00 VN thành 21/09 18:00 UTC; gửi lại nguyên mốc thì FBM lưu thành 21/09.
  const shiftedEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008616', fbmId: '176920', content: 'Noi dung', taskType: 'GD', workDate: '2026-09-22' }, { id: 176920, start_date: '/Date(1790010000000)/', end_date: '/Date(1790013600000)/', details: 'Noi dung #SC-ACT-008616', fileticket: 'ticket' }, {});
  check(so, 'Activity edit không lùi ngày khi form FBM trả mốc giờ VN lùi 7 tiếng (ACT-008616)', ['start_date', 'end_date'].map((name) => shiftedEdit.body.memvars.filter((item) => item.Name === name)[0].NewValue), ['/Date(1790035200000)/', '/Date(1790035200000)/']);
  check(so, 'Activity edit gui fileticket theo OldValue/NewValue cua fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'fileticket')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'fileticket')[0].NewValue], ['', 'ticket']);
  check(so, 'Activity edit cap nhat datetime0 moi', activityEdit.body.memvars.filter((item) => item.Name === 'datetime0')[0].NewValue !== activityEdit.body.memvars.filter((item) => item.Name === 'datetime0')[0].OldValue, true);
  check(so, 'Activity edit de comment rong thanh null', activityEdit.body.memvars.filter((item) => item.Name === 'comment')[0].NewValue, null);
  check(so, 'Activity edit comment rong van co NewValue', Object.prototype.hasOwnProperty.call(activityEdit.body.memvars.filter((item) => item.Name === 'comment')[0], 'NewValue'), true);
  check(so, 'Activity edit giu OldValue rong cho field form khong co Row', [activityEdit.body.memvars.filter((item) => item.Name === 'ma_kh')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'fileupload')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'filekey')[0].OldValue], ['', '', '']);
  check(so, 'Activity edit giu null cho field nullable cua fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'ngay_nhac')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'ma_nhom')[0].OldValue], [null, null]);
  const activityEditState = push.FbmSync.stateStart('', 'push', 0);
  push.FbmSync.scriptSettings = () => ({ accountName: 'Owner', baseUrl: 'https://fbm.test', activityAuthorized: '1.test' });
  activityEditState.cursor = { kind: 'push_wait', operation: 'activity_edit_open', entity: 'activity', index: 0, candidate: { entity: 'activity', id: 'ACT-008600', record: { id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09' } } };
  push.FbmSync.stateWrite(activityEditState);
  const activitySave = push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { Controller: 'zccrAccountTask', Row: (function () { const row = []; row[0] = 174813; row[3] = 'GD'; row[15] = 'Noi dung cu'; row[21] = 'Owner'; return row; }()), Showing: "_ticket = 'ticket-1';" } });
  check(so, 'Activity edit tu response mo form tao request type 1', [activitySave.body.type, activitySave.body.memvars.length, push.FbmSync.stateRead().cursor.operation, Object.prototype.hasOwnProperty.call(push.FbmSync.stateRead().cursor, 'oldValues')], [1, 36, 'activity_edit_save', false]);
  const activityPushState = push.FbmSync.stateStart('', 'push', 0);
  activityPushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  push.FbmSync.stateWrite(activityPushState);
  const activityCreate = push.FbmSync.nextPushRequest(activityPushState);
  check(so, 'Activity moi dung request New va marker', [activityCreate.meta.kind, activityCreate.body.action, activityCreate.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, push.FbmSync.stateRead().cursor.operation], ['activity_create', 'New', 'Nội dung #SC-ACT-NEW', 'activity_create']);
  const activityResponse = push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { InternalValues: [{ Name: 'id', Value: 42 }] } });
  check(so, 'Activity New nhan ID FBM va tao request doc xac nhan', [activityResponse.meta.kind, activityResponse.meta.id, push.FbmSync.stateRead().counts.succeeded, push.FbmSync.stateRead().phase], ['activity_edit_open', '42', 0, 'push']);
  const verifyRecord = { id: 'ACT-VERIFY', fbmId: '42', customerFbmCode: 'ALT00010', taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09', owner: 'Owner', fbmHash: 'base', syncStatus: push.FbmSync.SYNC_STATUS.pushed };
  push.FbmSync.pendingPushSet('activity', verifyRecord.id, { hSHIN: push.FbmSync.hash(verifyRecord, 'activity', {}), fbmId: '42' });
  push.FbmSync.readLocal = () => [verifyRecord];
  push.writeGateSave = () => ({ ok: true });
  const verifyState = push.FbmSync.stateStart('', 'push', 0);
  verifyState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(verifyState);
  const verifyRow = []; verifyRow[0] = 42; verifyRow[3] = 'Goi'; verifyRow[10] = new Date('2026-09-09T00:00:00Z'); verifyRow[15] = 'Noi dung #SC-ACT-VERIFY';
  const markerClean = push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { Controller: 'zccrAccountTask', Row: verifyRow } });
  const markerCleanDetails = markerClean && markerClean.body.memvars.filter((item) => item.Name === 'details')[0];
  check(so, 'G12: lệnh tạo Activity xác nhận xong mà FBM còn dấu #SC thì gửi ngay lệnh sửa Edit theo ID FBM với nội dung sạch', [markerClean && markerClean.body.action, markerClean && markerClean.body.values[0], markerCleanDetails && markerCleanDetails.OldValue, markerCleanDetails && markerCleanDetails.NewValue, push.FbmSync.stateRead().cursor.operation], ['Edit', '42', 'Noi dung #SC-ACT-VERIFY', 'Noi dung', 'activity_marker_clean']);
  check(so, 'Activity chỉ tính đã đẩy sau khi đọc xác nhận khớp hash', [push.FbmSync.stateRead().counts.pushed, push.FbmSync.pendingPushGet('activity', verifyRecord.id), pushLogs.some((event) => event.action === 'push_record')], [1, null, false]);
  const cleanWrites = [];
  push.writeGateSave = (request) => { cleanWrites.push(request); return { ok: true }; };
  push.FbmSync.recordIssues = {};
  push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: {} });
  check(so, 'G12: lệnh bỏ dấu thành công thì không ghi lại Sheet, không có cảnh báo và đi tiếp', [cleanWrites.length, Object.keys(push.FbmSync.recordIssues).length, push.FbmSync.stateRead().cursor.operation === 'activity_marker_clean'], [0, 0, false]);
  const cleanFailState = push.FbmSync.stateStart('', 'push', 0);
  cleanFailState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_marker_clean', candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(cleanFailState);
  push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, { code: 'FBM_ERROR', reason: 'Lỗi thử' });
  const cleanIssue = Object.keys(push.FbmSync.recordIssues).map((key) => push.FbmSync.recordIssues[key])[0] || {};
  check(so, 'G12: lệnh bỏ dấu hỏng chỉ cảnh báo ở Log và câu chốt Sidebar, không đánh lỗi giao dịch', [cleanIssue.outcome, /Chưa bỏ được dấu nhận diện #SC/.test(cleanIssue.reason || ''), cleanWrites.length, push.FbmSync.stateRead().counts.error, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)], ['warn', true, 0, 0, true]);
  const keptRecord = Object.assign({}, verifyRecord, { id: 'ACT-KEPT', syncStatus: push.FbmSync.SYNC_STATUS.pushed });
  push.FbmSync.pendingPushSet('activity', keptRecord.id, { hSHIN: push.FbmSync.hash(keptRecord, 'activity', {}), fbmId: '42' });
  push.FbmSync.readLocal = () => [keptRecord];
  const keptState = push.FbmSync.stateStart('', 'push', 0);
  keptState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', candidate: { entity: 'activity', kind: 'edit', id: keptRecord.id, record: keptRecord } };
  push.FbmSync.stateWrite(keptState);
  const keptRow = verifyRow.slice(); keptRow[15] = 'Noi dung #SC-ACT-KEPT';
  push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { Controller: 'zccrAccountTask', Row: keptRow } });
  check(so, 'G12: lệnh sửa không mang dấu mà FBM vẫn giữ dấu thì ghi "đẩy không ăn" để không xếp dọn lại mỗi lượt', [cleanWrites.slice(-1)[0].records[0].syncStatus, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)], [push.FbmSync.SYNC_STATUS.notApplied, true]);
  const cleanEdit = push.FbmSync.activityEditRequest({ id: 'ACT-1', fbmId: 5, content: 'Nội dung' }, { id: 5, details: 'Nội dung #SC-ACT-1' }, {});
  check(so, 'G12: lệnh sửa Activity không gắn dấu #SC, chỉ lệnh tạo gắn', cleanEdit.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, 'Nội dung');
  const createLocal = { id: 'CUS-CREATE', fbmId: '', fbmCustomerCode: '', companyName: 'Khach tao lai', taxNumber: '0100123456', contactPerson: 'Nguoi lien he', phone: '0900000000', email: 'a@example.com', address: 'Ha Noi', province: 'HNI', website: '', leadSource: 'Source', product: '', fbmSyncPermission: push.FbmSync.pullDefaultPermission() };
  const createCandidate = { entity: 'customer', kind: 'create', id: createLocal.id, autoCode: 'ALT00020', record: createLocal };
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [createLocal] : [];
  push.FbmSync.pushCandidates = pushCandidatesImpl;
  push.FbmSync.scriptSettings = () => ({ accountName: 'Owner', userId: '2037', baseUrl: 'https://fbm.test', cookie: 'cookie', customerAuthorized: '1.test' });
  push.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const createState = push.FbmSync.stateStart('', 'push', 0); createState.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' }; createState.activeRequestId = 'test-create-request'; createState.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_create_save', candidate: createCandidate }; push.FbmSync.stateWrite(createState);
  const recoveryStart = push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"timeout"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-create-request' }] } });
  check(so, 'Customer create mat response chuyen sang request doc MST contains, khong ghi lai', [recoveryStart.recovering, recoveryStart.request.meta.kind, recoveryStart.request.body.gridPageIndex, recoveryStart.request.body.filter, recoveryStart.request.body.externalKey.some((item) => item.Name === 'ma_kh' && item.Value === 'ALT00010'), push.FbmSync.stateRead().cursor.operation], [true, 'grid', -2, ['ma_so_thue:**0100123456'], false, 'customer_create_recover']);
  const customerFields = push.FbmSync.GRID_FIELDS.customer.slice();
  const customerRow = []; customerRow[0] = 'FBM-CREATE'; customerRow[1] = 'ALT00020'; customerRow[2] = 'Khach tao lai'; customerRow[3] = '0100123456'; customerRow[4] = 'Nguoi lien he'; customerRow[5] = 'Ha Noi'; customerRow[6] = '0900000000'; customerRow[7] = 'a@example.com'; customerRow[9] = ''; customerRow[12] = 'HNI'; customerRow[18] = 'Source'; customerRow[21] = '';
  push.writeGateSave = (request) => { push._recoveryPatch = request.records[0]; return { ok: true }; };
  const recoveryParsed = push.FbmSync.rowsToRecords('customer', { d: { Fields: customerFields.map((Name) => ({ AliasName: Name })), Rows: [customerRow], TotalRowCount: 1 } });
  check(so, 'fixture recovery doc dung stt_rec_kh va ma_kh', [recoveryParsed.rows[0].stt_rec_kh, recoveryParsed.rows[0].ma_kh], ['FBM-CREATE', 'ALT00020']);
  push.FbmSync.continuePush(push.FbmSync.stateRead(), { d: { Fields: customerFields.map((Name) => ({ AliasName: Name })), Rows: [customerRow], TotalRowCount: 1 } });
  check(so, 'Customer create recovery doi chieu exact va vach ID baseline', [push._recoveryPatch.fbmId, push._recoveryPatch.fbmCustomerCode, push._recoveryPatch.syncStatus, push.FbmSync.stateRead().counts.pushed], ['FBM-CREATE', 'ALT00020', push.FbmSync.SYNC_STATUS.synced, 1]);
  const lostState = push.FbmSync.stateStart('', 'push', 0);
  lostState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_create', candidate: activityCandidate };
  push.FbmSync.stateWrite(lostState);
  giuBanGhiDongBo(push, 'activity', 'ACT-NEW');
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [activityCandidate.record] : [];
  let lostPatch;
  push.writeGateSave = (request) => { lostPatch = request.records[0]; return { ok: true }; };
  const lost = push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, 'Mất phản hồi');
  check(so, 'Activity mat phan hoi giu dang day va khoa cho marker', [lost.continued, lost.request, lostPatch.syncStatus, push.FbmSync.stateRead().counts.error, !!push.FbmSync.pushFailuresRead().hashes['activity:ACT-NEW'], soBan(push)['activity:ACT-NEW'].by], [true, null, push.FbmSync.SYNC_STATUS.pushing, 1, true, 'fbm']);
}

module.exports = { chay };
