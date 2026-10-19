/** Kiểm tra state, cursor và status điều phối. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, giuBanGhiDongBo } = require("../../lib/load-gas");
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section("FBM sync — orchestration");
  const bindingData = {};
  const bindingProperties = {
    getProperty: (key) => bindingData[key] || null,
    setProperty: (key, value) => { bindingData[key] = String(value); },
    deleteProperty: (key) => { delete bindingData[key]; }
  };
  const identity = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => bindingProperties },
    shinOpenBook: () => ({ getId: () => 'sheet-binding-test' })
  });
  napServer(identity, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  identity.FbmSync.configValue = () => '';
  let identityLocalReads = 0;
  identity.FbmSync.readLocal = () => { identityLocalReads += 1; return []; };
  bindingData[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-binding-test', userId: '2037', username: 'anhlt', accountName: 'Le Tuan Anh' });
  const boundStatus = identity.FbmSync.identityStatus();
  check(so, 'bản chụp Sheet: đã liên kết thì xem trạng thái liên kết (Sidebar mở) không đọc Sheet Customer/Activity', [boundStatus.status, identityLocalReads], ['BOUND', 0]);
  const clearedBinding = identity.FbmSync.bindingWrite({});
  check(so, 'lưu liên kết rỗng xóa binding và khóa mọi đồng bộ thường', [clearedBinding.ok, clearedBinding.code, bindingData[identity.FbmSync.BINDING_KEY], clearedBinding.identityStatus.status], [true, 'IDENTITY_BINDING_CLEARED', undefined, 'UNBOUND']);
  bindingData[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-binding-test', userId: '2037', username: 'anhlt', accountName: 'Le Tuan Anh' });
  identity.FbmSync.stateRead = () => ({ runId: 'running-binding-test', phase: 'pull_customer', activeRequestId: 'request-binding-test' });
  const blockedBindingClear = identity.FbmSync.bindingWrite({});
  check(so, 'không hủy liên kết khi request FBM đang bay', [blockedBindingClear.ok, blockedBindingClear.code, Boolean(bindingData[identity.FbmSync.BINDING_KEY])], [false, 'SYNC_ALREADY_RUNNING', true]);
  identity.FbmSync.stateRead = () => ({ runId: 'failed-binding-test', phase: 'error', activeRequestId: '' });
  const clearedFailedBinding = identity.FbmSync.bindingWrite({});
  check(so, 'lỗi cầu nối đã kết thúc vẫn cho phép hủy liên kết', [clearedFailedBinding.ok, clearedFailedBinding.code, bindingData[identity.FbmSync.BINDING_KEY]], [true, 'IDENTITY_BINDING_CLEARED', undefined]);

  const relay = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => 'relay-test-key' }), getScriptProperties: () => ({ getProperty: () => 'relay-test-key' }) },
    ScriptApp: { getService: () => ({ getUrl: () => 'https://script.google.com/macros/s/head-only/exec' }) },
    shinOpenBook: () => ({ getId: () => 'sheet-relay-test' }),
    ContentService: { MimeType: { JSON: 'application/json' }, createTextOutput: (text) => ({ text: text, setMimeType() { return this; } }) },
    ERROR_CHANNEL_PENDING: 'pending', LOG_ERROR: 'error', errorMessage: (err) => String(err && err.message || err)
  });
  // Bộ ghi Log giả: đếm dòng đệm và số lần xả để chốt cổng nhịp nền đi qua đúng vỏ runEntryPoint (FBM-034).
  const relayLog = { lines: [], flushes: 0, reports: [] };
  relay.logEvent = (entry) => { relayLog.lines.push(entry); };
  relay.flushLog = () => { relayLog.flushes += 1; return 0; };
  relay.reportError = (err, channel) => { relayLog.reports.push([String(err && err.message || err), channel]); };
  napServer(relay, 'server/state/DirtyState.js', 'server/entry/EntryPoint.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/write/SheetSave.js');
  const stableRelayConfig = relay.fbmSyncRelayConfig();
  check(so, 'relay cap URL deployment co dinh, khong lay URL @HEAD theo context Sidebar', [stableRelayConfig.url, stableRelayConfig.url.indexOf('head-only') >= 0], ['https://script.google.com/macros/s/AKfycbx0ueI_gR2zzkTUGV5lTAXty0zotK2owAd5zPy0Z0SzJkJjRa0dIvbMREAoVJm3iFrX/exec', false]);
  const rejectedProbe = JSON.parse(relay.doPost({ postData: { contents: JSON.stringify({ key: 'relay-test-key', spreadsheetId: 'sheet-relay-test', kind: 'probe' }) } }).text);
  check(so, 'Web App từ chối probe ngoài nhịp nền', [rejectedProbe.ok, rejectedProbe.code, rejectedProbe.request], [false, 'RELAY_KIND_UNSUPPORTED', null]);
  // FBM-034: nhịp nền chạy cả khi Sidebar đóng, nên lỗi ở đây chỉ còn Log và tin chờ ở Sidebar lần mở sau. Trước đây doPost không qua runEntryPoint: Log nằm trong RAM rồi mất, exception chỉ trả về Extension.
  const relayPost = (body) => JSON.parse(relay.doPost({ postData: { contents: typeof body === 'string' ? body : JSON.stringify(body) } }).text);
  check(so, 'FBM-034: nhịp nền thành công vẫn xả bộ đệm Log đúng một lần', relayLog.flushes, 1);
  relay.fbmSyncHeartbeatRequest = () => { throw new Error('Lỗi đọc state thử nghiệm'); };
  const relayBoom = relayPost({ key: 'relay-test-key', spreadsheetId: 'sheet-relay-test', kind: 'heartbeat_request' });
  const boomLine = relayLog.lines.filter((line) => line.action === 'fbmRelay')[0] || {};
  check(so, 'FBM-034: exception trong nhịp nền có dòng Log lỗi action fbmRelay, được xả ra Sheet, đẩy tin chờ cho Sidebar và vẫn trả JSON lỗi cho Extension',
    [relayBoom.ok, relayBoom.error, boomLine.outcome, boomLine.reason, relayLog.flushes, relayLog.reports], [false, 'Lỗi đọc state thử nghiệm', 'error', 'Lỗi đọc state thử nghiệm', 2, [['Lỗi đọc state thử nghiệm', 'pending']]]);
  const mismatch = relayPost({ key: 'relay-test-key', spreadsheetId: 'sheet-khac', kind: 'heartbeat_request' });
  check(so, 'FBM-034: Extension gửi nhịp nền cho bảng tính khác thì có dòng Log lỗi và tin chờ, không xử lý nhịp', [mismatch.ok, relayLog.lines.length, relayLog.reports.length, relayLog.lines[1] && relayLog.lines[1].reason.indexOf('bảng tính khác') >= 0], [false, 2, 2, true]);
  const intruder = relayPost({ key: 'sai-khoa', spreadsheetId: 'sheet-relay-test', kind: 'heartbeat_request' });
  const badJson = relayPost('{"key":"relay-test-key", hỏng');
  check(so, 'FBM-034: khóa sai hoặc JSON hỏng bị từ chối mà không ghi Log (người lạ không đẩy trôi được Log thật) và câu trả về không trích nội dung gửi lên', [intruder.error, badJson.error, JSON.stringify(badJson).indexOf('relay-test-key') < 0, relayLog.lines.length, relayLog.flushes], ['unauthorized', 'invalid_json', true, 2, 3]);

  // GAS bận lúc Extension mang kết quả FBM về thì kết quả mất; phải có dòng Log nói thẳng. Bận lúc cấp request mới thì chưa mất gì, không ghi.
  const busyReply = () => ({ ok: false, code: 'BUSY', request: null, message: 'GAS đang bận', status: {} });
  relay.fbmSyncHeartbeatRequest = busyReply;
  relay.fbmSyncHeartbeat = busyReply;
  relay.FbmSync = Object.assign(relay.FbmSync || {}, { controlDispatchLocked: busyReply });
  const linesBeforeBusy = relayLog.lines.length;
  relayPost({ key: 'relay-test-key', spreadsheetId: 'sheet-relay-test', kind: 'heartbeat_request' });
  const busyAsk = relayLog.lines.slice(linesBeforeBusy).filter((line) => line.action === 'relay_busy_dropped').length;
  const busyHeartbeat = relayPost({ key: 'relay-test-key', spreadsheetId: 'sheet-relay-test', kind: 'heartbeat', response: {}, hop: 2 });
  relayPost({ key: 'relay-test-key', spreadsheetId: 'sheet-relay-test', command: 'continue', payload: {}, hop: 6 });
  const dropped = relayLog.lines.slice(linesBeforeBusy).filter((line) => line.action === 'relay_busy_dropped');
  check(so, 'GAS bận bỏ kết quả FBM Extension gửi về (Giữ phiên hay chuỗi nền) thì có dòng Log lỗi nêu GAS bận và lượt sẽ chờ tới hạn; bận lúc cấp request mới thì không ghi', [busyAsk, busyHeartbeat.code, dropped.length, dropped.map((line) => line.outcome).join(','), dropped[0] && dropped[0].reason.indexOf('GAS đang bận') >= 0, dropped.map((line) => line.detail.kind + '@' + line.detail.hop).join(',')], [0, 'BUSY', 2, 'error,error', true, 'heartbeat@2,continue@6']);

  const props = { data: {} };
  let propertyWrites = 0;
  const propertyApi = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { propertyWrites += 1; props.data[key] = String(value); }, deleteProperty: (key) => { delete props.data[key]; } };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => propertyApi, getScriptProperties: () => propertyApi }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const started = orchestration.FbmSync.start({ mode: 'read' });
   check(so, 'start bat dau bang probe User truoc bootstrap Customer', started.request.meta.kind, 'session_probe');
  check(so, 'DTO pipeline tu GAS chi danh dau buoc kiem tra phien o dau luot', [started.status.pipeline.kind, started.status.pipeline.title, started.status.pipeline.steps.map((step) => step.state)], ['read', 'Pipeline đang chạy', ['current', 'pending', 'pending', 'pending', 'pending', 'pending']]);
  const pipelineActivityState = orchestration.FbmSync.stateRead();
  pipelineActivityState.phase = 'pull_activity'; pipelineActivityState.entity = 'activity'; pipelineActivityState.cursor = { kind: 'activity_grid' }; orchestration.FbmSync.stateWrite(pipelineActivityState);
  check(so, 'DTO pipeline chuyen dung sang Activity ma khong danh dau doi soat va Sheet', orchestration.FbmSync.statusView().pipeline.steps.map((step) => step.state), ['done', 'done', 'done', 'current', 'pending', 'pending']);
  const pipelineErrorState = orchestration.FbmSync.stateRead();
  pipelineErrorState.phase = 'error'; pipelineErrorState.cursor = { kind: 'activity_grid' }; orchestration.FbmSync.stateWrite(pipelineErrorState);
  check(so, 'DTO pipeline dung tai Activity khi loi, khong bao hoan tat gia', [orchestration.FbmSync.statusView().pipeline.title, orchestration.FbmSync.statusView().pipeline.steps.map((step) => step.state)], ['Pipeline dừng vì lỗi', ['done', 'done', 'done', 'error', 'pending', 'pending']]);
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
    check(so, 'ma tran pipeline ' + item[0], [pipeline.kind, pipeline.steps.map((step) => step.state)], [item[2], item[3]]);
  });
  const identityCheckStatus = orchestration.FbmSync.statusMetadata({ identityCheck: { total: 3, matched: 2, missing: 1, missingSample: [{ fbmId: 'FBM-3' }] } });
  check(so, 'DTO Sidebar giữ tổng hợp kiểm tra liên kết n/N', [identityCheckStatus.identityCheck.total, identityCheckStatus.identityCheck.matched, identityCheckStatus.identityCheck.missing, identityCheckStatus.identityCheck.missingSample[0].fbmId], [3, 2, 1, 'FBM-3']);
  // State V1 cũ còn danh sách conflict và khóa sync: phiên mới bỏ cả hai, chỉ giữ số đếm; hàng đợi thật nằm trên Sheet (FBM-024).
  const legacyConflict = orchestration.FbmSync.stateRead();
  legacyConflict.phase = 'conflict';
  legacyConflict.metadata.conflicts = [{ entity: 'activity', id: 'ACT-KEEP', fields: [{ field: 'details', left: 'x'.repeat(500), right: 'y'.repeat(500) }] }];
  legacyConflict.metadata.conflictCount = 1;
  legacyConflict.counts.conflict = 1;
  legacyConflict.locks = { 'activity:ACT-KEEP': { owner: 'sync', reason: 'conflict' }, 'customer:CUS-EDIT': { owner: 'user', revision: 'r1' } };
  orchestration.FbmSync.stateWrite(legacyConflict);
  const legacyStored = orchestration.FbmSync.stateRead();
  orchestration.FbmSync.readLocal = () => { throw new Error('stateStart không được đọc Sheet'); };
  const carriedStart = orchestration.FbmSync.stateStart('', 'checking_session', 0);
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
   check(so, 'bam Dong bo ngay khi phase conflict phai probe lai phien; so xung dot ton dong van hien', [restartedConflict.ok, restartedConflict.request.meta.kind, restartedConflict.status.metadata.conflictCount, restartedConflict.status.counts.conflict], [true, 'session_probe', 1, 0]);
  orchestration.FbmSync.stateWrite(orchestration.FbmSync.stateStart('', 'idle', 0));
  const bulkStarted = orchestration.FbmSync.start({ mode: 'read', scan: 'activity_bulk' });
  const bulkSnapshotState = orchestration.FbmSync.stateRead();
  const bulkSnapshotRequest = orchestration.FbmSync.activityBulkRequest({ type: 0 });
   check(so, 'start bulk Activity probe User truoc request bulk; request lấy toàn bộ giao dịch không lọc ngày', [bulkStarted.request.meta.kind, bulkSnapshotState.scan, bulkSnapshotRequest.body.filter], ['session_probe', 'activity_bulk', []]);
   check(so, 'probe User khong mang authorized cu', [started.request.body.authorized, started.request.body.controller], [undefined, 'User']);
  check(so, 'envelope mang runId/requestId va GAS luu moc response', [Boolean(started.request.meta.trace.runId), Boolean(started.request.meta.trace.requestId), orchestration.FbmSync.stateRead().activeRequestId === bulkStarted.request.meta.trace.requestId, orchestration.FbmSync.traceRead(5).some((item) => item.stage === 'response_built')], [true, true, true, true]);
   orchestration.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0, phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   check(so, 'fixture transport dat marker phien song truoc request nghiep vu', [orchestration.FbmSync.sessionIdentityIsVerified(orchestration.FbmSync.stateRead()), orchestration.FbmSync.stateRead().cursor.kind], [true, 'customer_grid']);
   const dateEnvelope = orchestration.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', body: { gridPageValue: [new Date('2026-09-09T00:00:00Z'), { nested: new Date('2026-09-10T00:00:00Z') }] }, meta: { kind: 'grid' } });
   check(so, 'request nghiep vu sau marker live khong bi thay bang probe', [dateEnvelope.meta.kind, orchestration.FbmSync.stateRead().cursor.kind, orchestration.FbmSync.stateRead().activeRequestId === dateEnvelope.id], ['grid', 'customer_grid', true]);
  check(so, 'envelope khong tra Date o cursor phan trang Activity', [dateEnvelope.body.gridPageValue[0], dateEnvelope.body.gridPageValue[1].nested], ['/Date(1788912000000)/', '/Date(1788998400000)/']);
  check(so, 'response co trace bridge client van nhan dung reservation GAS', orchestration.FbmSync.responseRequestId({ transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gas-request-1' }, { stage: 'bridge_response_sent', clientRequestId: 'sidebar-waiter-1' }] } }), 'gas-request-1');
  check(so, 'response co trace bridge cu van bo qua waiter id va nhan reservation GAS', orchestration.FbmSync.responseRequestId({ transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gas-request-2' }, { stage: 'bridge_response_sent', requestId: 'sidebar-waiter-2' }] } }), 'gas-request-2');
  let blockedEndpoint = '';
  try { orchestration.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/Main/undefined', body: {}, meta: { kind: 'legacy' } }); } catch (err) { blockedEndpoint = String(err && err.message || err); }
  check(so, 'endpoint legacy undefined bi chan truoc khi cap envelope', blockedEndpoint.indexOf('FBM_ENDPOINT_MISSING') >= 0, true);
  check(so, 'GAS tao body wire escaped cho FBM', [dateEnvelope.bodyText.indexOf('\\/Date(1788912000000)\\/') >= 0, dateEnvelope.bodyText.indexOf('/Date(1788912000000)/') >= 0], [true, false]);
  const traceEvents = [{ stage: 'client_gas_call_started', requestId: 'trace-1', at: 1 }, { stage: 'client_gas_success', requestId: 'trace-1', at: 2 }];
  const writesBeforeTraceImport = propertyWrites;
  check(so, 'trace client ghi theo lo mot lan', [orchestration.FbmSync.traceImport(traceEvents), propertyWrites - writesBeforeTraceImport], [2, 1]);
  check(so, 'trace client gui lai khong ghi lap', [orchestration.FbmSync.traceImport(traceEvents), propertyWrites - writesBeforeTraceImport], [0, 1]);
   orchestration.FbmSync.statePatch({ origin: 'manual', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, activeRequestId: dateEnvelope.id, deadlineAt: Date.now() + 60000, metadata: { sessionGate: {} }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const retrySlice = orchestration.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: dateEnvelope.id }] } });
    check(so, 'loi request nghiep vu fail-closed khong tu retry', [retrySlice && retrySlice.ok, retrySlice && retrySlice.code, retrySlice && retrySlice.request, orchestration.FbmSync.stateRead().phase, orchestration.FbmSync.stateRead().lastFailureCode], [false, 'TRANSPORT_ERROR', null, 'error', 'TRANSPORT_ERROR']);
  const missingRequestId = orchestration.FbmSync.continue({ ok: true, status: 200, body: '{"d":{}}' });
   check(so, 'response thieu requestId bi chan khong an nham reservation', [missingRequestId.ok, missingRequestId.code, orchestration.FbmSync.stateRead().activeRequestId], [false, 'STALE_RESPONSE', '']);
   orchestration.FbmSync.statePatch({ runId: 'active-run', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, activeRequestId: 'active-request', deadlineAt: Date.now() + 60000, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const blockedDuplicate = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start khong cap request chong khi reservation cu con hieu luc', [blockedDuplicate.ok, blockedDuplicate.code, blockedDuplicate.request], [false, 'REQUEST_IN_FLIGHT', null]);
   orchestration.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const resumed = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start chi tiep tuc sau khi reservation cu da thu hoi bang probe moi', [resumed.ok, resumed.resumed, resumed.request.meta.kind], [true, true, 'session_probe']);
  const staleState = JSON.parse(props.data[orchestration.FbmSync.STATE_KEY]);
  staleState.runId = 'old-run'; staleState.updatedAt = Date.now() - orchestration.FbmSync.STALE_RUN_MS - 1; staleState.lastProgressAt = staleState.updatedAt; staleState.activeRequestId = '';
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(staleState);
  const restarted = orchestration.FbmSync.start({ mode: 'read' });
   check(so, 'run stale duoc thay bang phien moi va probe lai', [restarted.ok, restarted.resumed, restarted.request.meta.kind, orchestration.FbmSync.stateRead().runId === 'old-run'], [true, undefined, 'session_probe', false]);
  const abandoned = orchestration.FbmSync.stateRead();
  abandoned.runId = 'abandoned-run'; abandoned.phase = 'pull_customer'; abandoned.updatedAt = Date.now() - orchestration.FbmSync.STALE_RUN_MS - 1;
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(abandoned);
  const staleView = orchestration.FbmSync.statusView();
  check(so, 'status chi doc khong tu ghi de phien stale', [staleView.phase, staleView.lastFailureCode, orchestration.FbmSync.stateRead().runId], ['pull_customer', '', 'abandoned-run']);
  const uncertainWrite = orchestration.FbmSync.stateStart('customer', 'push', 1);
  uncertainWrite.cursor = { kind: 'push_wait' };
  orchestration.FbmSync.stateWrite(uncertainWrite);
  giuBanGhiDongBo(orchestration, 'customer', 'C-1');
  const recoveredWrite = orchestration.FbmSync.recoverStaleRun(orchestration.FbmSync.stateRead(), Date.now() + orchestration.FbmSync.STALE_RUN_MS + 1);
  check(so, 'Lượt mất phản hồi lúc chờ lệnh ghi: không tự thử lại và vẫn giữ bản ghi trong sổ bận', [recoveredWrite.state.phase, recoveredWrite.state.lastFailureCode, orchestration.recordHoldsPeekOwner('fbm')], ['error', 'SYNC_STALE_WRITE', true]);
  const stuckRead = orchestration.FbmSync.stateStart('customer', 'pull_customer', 1);
  orchestration.FbmSync.stateWrite(stuckRead);
  giuBanGhiDongBo(orchestration, 'customer', 'C-1');
  orchestration.FbmSync.recoverStaleRun(orchestration.FbmSync.stateRead(), Date.now() + orchestration.FbmSync.STALE_RUN_MS + 1);
  check(so, 'Lượt kẹt không chờ lệnh ghi thì nhả mọi bản ghi đồng bộ đang giữ', orchestration.recordHoldsPeekOwner('fbm'), false);
  const lookupProps = {};
  const lookupHop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => lookupProps[key] || null, setProperty: (key, value) => { lookupProps[key] = String(value); } }) } });
  napServer(lookupHop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/SheetSave.js');
  lookupHop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, namesBySource: {}, warnings: [] });
  lookupHop.FbmSync.readLocal = () => [];
  lookupHop.FbmSync.currentSpreadsheetId = () => 'sheet-lookup-test';
  lookupHop.FbmSync.identityStatus = () => ({ status: 'BOUND' });
  const lookupErrorState = lookupHop.FbmSync.stateStart('', 'checking_session', 0);
  lookupErrorState.mode = 'write'; lookupErrorState.origin = 'manual'; lookupErrorState.phase = 'checking_session'; lookupErrorState.cursor = { kind: 'lookup', index: 0 }; lookupErrorState.activeRequestId = 'lookup-error-request'; lookupErrorState.session.identityVerified = true; lookupErrorState.session.sessionId = 'lookup-session'; lookupErrorState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupErrorState);
  const lookupError = lookupHop.FbmSync.continue({ ok: false, status: 503, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-error-request' }] } });
  check(so, 'lookup loi transport hoac parse fail-closed khong tu dong di tiep', [lookupError.ok, lookupError.request, lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().cursor.kind], [false, null, 'error', 'lookup']);
  const lookupEmptyState = lookupHop.FbmSync.stateRead(); lookupEmptyState.runId = 'lookup-empty-run'; lookupEmptyState.phase = 'checking_session'; lookupEmptyState.cursor = { kind: 'lookup', index: 0 }; lookupEmptyState.activeRequestId = 'lookup-empty-request'; lookupEmptyState.session.identityVerified = true; lookupEmptyState.session.sessionId = 'lookup-session'; lookupEmptyState.session.identitySessionId = 'lookup-session'; lookupHop.FbmSync.stateWrite(lookupEmptyState);
  const lookupEmpty = lookupHop.FbmSync.continue({ ok: true, status: 200, items: [0, 1, 2].map((id) => ({ id: String(id), ok: true, status: 200, body: '{"d":{"Rows":[]}}' })), transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'lookup-empty-request' }] } });
  check(so, 'lo danh muc thanh cong nhung khong co dong la ket qua hop le va di tiep', [lookupEmpty.ok, lookupEmpty.request && lookupEmpty.request.meta.kind, lookupHop.FbmSync.stateRead().phase, lookupHop.FbmSync.stateRead().metadata.categoryLookupFailed], [true, 'scan_job', 'pull_customer', undefined]);
  orchestration.FbmSync.previewRecords('customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM', orchestration.FbmSync.previewRead().customers[0].code, 'ALT00010');
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
  check(so, 'Sidebar mo lai probe lai phien truoc khi tiep tuc cursor Customer', [resumedGrid.ok, resumedGrid.resumed, resumedGrid.request.meta.kind], [true, true, 'session_probe']);
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
  check(so, 'status Sidebar khong tra Category gate va OldValue noi bo', [compactView.metadata.categoryGate, compactView.cursor.candidate, compactView.cursor.operation], [undefined, undefined, 'activity_edit_save']);
  check(so, 'status Sidebar giu identity probe de tu dien tai khoan', compactView.metadata.identityProbe, { spreadsheetId: 'sheet-probe', userId: '2037', accountName: 'ANHLT' });
  check(so, 'status Sidebar giu response nho khi state noi bo lon', JSON.stringify(compactView).length < 5000, true);

  const pausedState = orchestration.FbmSync.stateRead();
  pausedState.runId = 'paused-run'; pausedState.phase = 'paused'; pausedState.cursor = {};
  orchestration.FbmSync.stateWrite(pausedState);
   orchestration.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
   const restartedPaused = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'dong bo lai tu trang thai tam dung probe lai phien', [restartedPaused.ok, restartedPaused.request.meta.kind, restartedPaused.resumed], [true, 'session_probe', undefined]);
  orchestration.FbmSync.statePatch({ runId: 'scheduled-run', phase: 'pull_customer', scheduledScan: 'customer', activeRequestId: '', deadlineAt: 0 });
  orchestration.fbmSyncCancel();
  check(so, 'dung dong bo xoa marker scheduler va giu ket qua o trang thai tam dung', [orchestration.FbmSync.stateRead().phase, orchestration.FbmSync.stateRead().scheduledScan], ['paused', '']);

  const guards = taoHopCat({ FbmSync: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }), getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }) } });
  napServer(guards, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  check(so, 'push config chan khi binding khong co ten tai khoan', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }), 'Thiếu tên đầy đủ trong liên kết tài khoản FBM; chiều đẩy đã bị dừng.');
  check(so, 'push config chan tao Customer khi thieu prefix va do dai ma khach', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh' }), 'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.');
  check(so, 'push config cho phep tao Customer khi du prefix va do dai ma khach', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' }), '');
  check(so, 'push config cho activity sua khi account co', guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }), '');

  const schedulerData = {};
  const schedulerPropertyApi = { getProperty: (key) => schedulerData[key] || null, setProperty: (key, value) => { schedulerData[key] = String(value); } };
  const scheduler = taoHopCat({ FbmSync: {}, SETTINGS: { LOCK_WAIT_MS: 1 }, PropertiesService: { getDocumentProperties: () => schedulerPropertyApi }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) } });
  napServer(scheduler, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/state/Scheduler.js');
  const schedule = scheduler.FbmSync.backgroundScheduleRead();
  check(so, 'Lấy toàn bộ giao dịch chạy nền mặc định chu kỳ 8 giờ; chưa từng chạy xong thì đến hạn ngay', [schedule.activityFull.minutes, scheduler.FbmSync.scheduleDueAt('activityFull')], [480, 0]);
  // Trigger hẹn giờ phía GAS của thiết kế cũ còn sót trên project: gọi tới thì tự gỡ mọi trigger cũ, ghi một dòng Log, không đụng state hay lịch nền.
  const triggers = ['fbmHeartbeatTrigger', 'fbmSupervisorTrigger', 'shinOnEdit', 'fbmCustomerScanTrigger'].map((name) => ({ getHandlerFunction: () => name }));
  const deleted = [], legacyLogs = [];
  scheduler.ScriptApp = { getProjectTriggers: () => triggers.filter((trigger) => deleted.indexOf(trigger) < 0), deleteTrigger: (trigger) => deleted.push(trigger) };
  scheduler.logEvent = (entry) => legacyLogs.push(entry);
  const stateBeforeLegacy = JSON.stringify(scheduler.FbmSync.stateRead()), markersBeforeLegacy = JSON.stringify(schedulerData);
  scheduler.fbmHeartbeatTrigger();
  scheduler.fbmSupervisorTrigger();
  check(so, 'Trigger hẹn giờ cũ còn sót tự gỡ hết trigger cũ ở lần chạy đầu, giữ trigger khác, ghi một dòng Log, không đổi state và mốc lịch nền', [deleted.map((trigger) => trigger.getHandlerFunction()).join(','), legacyLogs.length, legacyLogs[0] && legacyLogs[0].action, JSON.stringify(scheduler.FbmSync.stateRead()) === stateBeforeLegacy, JSON.stringify(schedulerData) === markersBeforeLegacy], ['fbmHeartbeatTrigger,fbmSupervisorTrigger,fbmCustomerScanTrigger', 1, 'legacy_trigger_removed', true, true]);
  // Nhịp nền chỉ do alarm `gas_poll` của Extension (09/02): code đồng bộ không được cài trigger hẹn giờ nào.
  const fbmSources = require('fs').readdirSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync'), { recursive: true }).filter((file) => /\.js$/.test(file)).map((file) => require('fs').readFileSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync', file), 'utf8'));
  check(so, 'Code đồng bộ FBM không cài trigger hẹn giờ nào phía GAS', fbmSources.filter((source) => /newTrigger\(|timeBased\(/.test(source)).length, 0);

  const heartbeatData = {};
  const heartbeatPropertyApi = { getProperty: (key) => heartbeatData[key] || null, setProperty: (key, value) => { heartbeatData[key] = String(value); } };
  const heartbeat = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => heartbeatPropertyApi, getScriptProperties: () => heartbeatPropertyApi }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) } });
  napServer(heartbeat, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
  heartbeat.FbmSync.stateStart('', 'idle', 0);
  heartbeat.FbmSync.statePatch({ session: { cookie: '', expired: false } });
  heartbeat.FbmSync.identityPreflight = () => ({ blocking: true, status: { status: 'UNBOUND' }, message: 'Chưa có liên kết tài khoản FBM.' });
  const unboundHeartbeat = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat không cấp envelope FBM khi chưa liên kết tài khoản', [unboundHeartbeat.ok, unboundHeartbeat.code, unboundHeartbeat.request], [true, 'FBM_IDENTITY_UNBOUND', null]);
  heartbeat.FbmSync.statePatch({ runId: 'master-off-run', phase: 'checking_session', cursor: { kind: 'authorize_customer' }, activeRequestId: '' });
  const masterOff = heartbeat.FbmSync.setMasterEnabled(false);
  check(so, 'tắt công tắc tổng dừng ngay state khi không có request FBM đang bay', [masterOff.enabled, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().activeRequestId], [false, 'paused', '']);
  heartbeat.FbmSync.setMasterEnabled(true);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  heartbeat.FbmSync.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  // Các tiến trình khác vừa chạy xong nên chưa đến hạn: lần hỏi nào đến hạn chỉ là Giữ phiên.
  ['CUSTOMER_FULL_SCAN', 'ACTIVITY_FULL_SCAN', 'DETAIL_SCAN'].forEach((key) => { heartbeatData['FBM_SYNC_DONE_' + key] = String(Date.now()); });
  heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
  const heartbeatRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'Giữ phiên cấp request đếm khách (cùng hàm dựng request lấy danh sách khách, count 1) để capture generic khi chưa biết cookie', [heartbeatRequest.ok, heartbeatRequest.code, heartbeatRequest.request.meta.kind, heartbeatRequest.request.body.type, heartbeatRequest.request.body.count, heartbeatRequest.request.body.sortExpression, heartbeatRequest.request.bodyText.indexOf('{{FBM_PAYLOAD_COOKIE}}') >= 0], [true, 'HEARTBEAT_REQUEST_READY', 'heartbeat', 0, 1, heartbeat.FbmSync.customerListRequest({}).body.sortExpression, true]);
  const overlappingHeartbeat = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat không cấp request chồng khi reservation còn hiệu lực', [overlappingHeartbeat.ok, overlappingHeartbeat.code, overlappingHeartbeat.request], [false, 'REQUEST_IN_FLIGHT', null]);
  const transportFailure = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: heartbeatRequest.request.id, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'GAS thu hồi reservation và kết thúc phiên khi Extension không có tab FBM', [transportFailure.ok, transportFailure.code, heartbeat.FbmSync.stateRead().activeRequestId, heartbeat.FbmSync.stateRead().phase], [false, 'FBM_TAB_NOT_FOUND', '', 'error']);
  const staleTransportFailure = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: heartbeatRequest.request.id, code: 'FBM_TAB_NOT_FOUND' });
  check(so, 'transport failure cũ không đụng reservation mới', [staleTransportFailure.ok, staleTransportFailure.code], [false, 'STALE_RESPONSE']);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', scheduledScan: '' });
  heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
  heartbeatData.FBM_SYNC_CUSTOMER_BASELINE_V1 = JSON.stringify({ total: 2 });
  const firstHeartbeatRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  const firstHeartbeat = heartbeat.fbmSyncHeartbeat({ d: { TotalRowCount: 2 }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: firstHeartbeatRequest.request.id }] } });
  check(so, 'Giữ phiên đếm khách khớp số khách mốc thì chỉ lưu lần sống, không cấp request nào', [heartbeat.FbmSync.stateRead().session.lastHeartbeatAt > 0, firstHeartbeat.request], [true, null]);
  heartbeat.FbmSync.statePatch({ session: { expired: true } });
   const blockedHeartbeatRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
   check(so, 'GAS khong tu dang nhap khi khong co tien trinh den han', heartbeat.FbmSync.stateRead().phase, 'idle');
   check(so, 'GAS tra request:null khi khong co tien trinh den han', [blockedHeartbeatRequest.ok, blockedHeartbeatRequest.code, blockedHeartbeatRequest.request], [true, 'NO_PROCESS_DUE', null]);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', session: { cookie: '', expired: false, lastHeartbeatAt: 0 } });
   heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
   const missingCookieRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'cookie chua capture khong bi coi la logout', [missingCookieRequest.ok, missingCookieRequest.code, missingCookieRequest.request.meta.kind], [true, 'HEARTBEAT_REQUEST_READY', 'heartbeat']);
   heartbeat.FbmSync.statePatch({ session: { cookie: 'userFHN_CRM_App', expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' }, scheduledScan: 'customerFull', chain: { current: 'customerFull', ran: [], direction: 'read' }, phase: 'idle', runId: '', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const scheduledHeartbeat = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'Quet nhanh den han: lan hoi nen mo thang luot Customer bang request dau cua luot (probe User), khong gui request dem khach truoc', [scheduledHeartbeat.ok, scheduledHeartbeat.request.meta.kind, scheduledHeartbeat.status.phase], [true, 'session_probe', 'checking_session']);
   const continuedProbe = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } }), transport: { contract: MA_HOP_DONG, trace: [{ requestId: scheduledHeartbeat.request.id }], payloadCookie: 'userFHN_CRM_App' } });
   check(so, 'probe User cua phien nen moi cap authorize Customer', [continuedProbe && continuedProbe.ok, continuedProbe && continuedProbe.request && continuedProbe.request.meta.kind, continuedProbe && continuedProbe.request && continuedProbe.request.meta.entity], [true, 'authorize', 'customer']);
   const continuedBackground = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'auth-customer' } }), transport: { contract: MA_HOP_DONG, trace: [{ requestId: continuedProbe && continuedProbe.request && continuedProbe.request.id || '' }], payloadCookie: 'userFHN_CRM_App' } });
   check(so, 'response authorize cua phien nen di qua continuation chung', [continuedBackground && continuedBackground.ok, continuedBackground && continuedBackground.request && continuedBackground.request.meta.kind, continuedBackground && continuedBackground.request && continuedBackground.request.meta.entity, heartbeat.FbmSync.stateRead().cursor.kind], [true, 'authorize', 'activity', 'authorize_activity']);
  // Mỗi lần hỏi nền là một lượt mới (09/02 Phần 3): lượt dở không còn request chờ trong hạn thì kết thúc có Log, lượt mới mở bằng probe User, không gửi lại trang Customer đang dở.
  const abandonLogs = [];
  heartbeat.logEvent = (entry) => abandonLogs.push(entry);
  heartbeat.FbmSync.statePatch({ runId: 'abandoned-run', origin: 'background', phase: 'pull_customer', cursor: { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['d', 't', 'x'], count: 2000 }, activeRequestId: 'lost-request', deadlineAt: Date.now() - 1000, scheduledScan: 'customerFull', chain: { current: 'customerFull', ran: [], direction: 'read' }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' }, metadata: { sessionGate: {} } });
  const afterAbandon = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm', extensionTrail: { stage: 'fbm_tab_sent', requestId: 'lost-request', hop: 3, at: Date.now() - 5 * 60000, workerStartedAt: 100, currentWorkerStartedAt: 200, cookie: 'bi-mat-khong-duoc-chep' } });
  const abandonState = heartbeat.FbmSync.stateRead();
  check(so, 'Lần hỏi nền gặp lượt dở không còn request chờ: lượt cũ kết thúc SYNC_ABANDONED_RUN có dòng Log lỗi, lượt mới mở bằng probe User, không gửi lại trang Customer đang dở', [
    abandonLogs.some((entry) => JSON.stringify(entry).indexOf('SYNC_ABANDONED_RUN') >= 0), afterAbandon.ok, afterAbandon.request && afterAbandon.request.meta.kind, abandonState.runId !== 'abandoned-run'
  ], [true, true, 'session_probe', true]);
  const lostLines = abandonLogs.filter((entry) => entry.action === 'request_unanswered'), staleLine = lostLines[0] || {};
  check(so, 'Lượt bị bỏ dở: request đang chờ quá hạn có đúng một dòng request_unanswered mang hộp đen; dòng stale_run chỉ nói lượt bị đóng, không lặp hộp đen', [lostLines.length, String(staleLine.reason).indexOf('Request FBM lost-request (bước customer_grid) không nhận được trả lời từ Extension') === 0, String((abandonLogs.find((entry) => entry.action === 'stale_run') || {}).reason).indexOf('Hộp đen') < 0], [1, true, true]);
  check(so, 'Dòng Log request không có trả lời mang hộp đen Extension: bước cuối, cách đây bao lâu, worker có bị Chrome tắt; không chép trường lạ từ Extension', [
    String(staleLine.reason).indexOf('Hộp đen Extension: bước cuối (cách đây 5 phút) là đã gửi request sang tab FBM, chưa nhận lại kết quả, request lost-request.') >= 0,
    String(staleLine.reason).indexOf('đã khởi động lại sau bước đó nên lượt bị cắt giữa chừng') >= 0, JSON.stringify(staleLine).indexOf('bi-mat-khong-duoc-chep') < 0
  ], [true, true, true]);
  // Luật chung request không có trả lời: nằm ở cửa ghi state nên mọi loại request đều đi qua, kể cả Giữ phiên không thuộc lượt nào.
  const watchLogs = [];
  heartbeat.logEvent = (entry) => watchLogs.push(entry);
  const unanswered = () => watchLogs.filter((entry) => entry.action === 'request_unanswered');
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'done', cursor: { kind: 'heartbeat' }, activeRequestId: 'hb-lost', deadlineAt: Date.now() - 4 * 60000, scheduledScan: '', chain: null });
  heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
  const afterLostHeartbeat = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm', extensionTrail: { stage: 'gas_request_received', requestId: 'hb-lost', hop: 0, at: Date.now() - 6 * 60000 } });
  const lostHeartbeat = unanswered()[0] || {};
  check(so, 'Giữ phiên hết hạn không có trả lời (không thuộc lượt nào): lần hỏi nền kế tiếp có dòng Log lỗi nêu request, bước, số phút quá hạn và hộp đen Extension, rồi vẫn cấp request mới', [
    unanswered().length, lostHeartbeat.outcome, String(lostHeartbeat.reason).indexOf('Request FBM hb-lost (bước heartbeat) không nhận được trả lời từ Extension, đã quá hạn chờ 4 phút; GAS bỏ request này. Hộp đen Extension: bước cuối (cách đây 6 phút) là đã nhận request từ GAS, chưa gửi sang tab FBM, request hb-lost.') === 0, !!(afterLostHeartbeat.request && afterLostHeartbeat.request.id)
  ], [1, 'error', true, true]);
  watchLogs.length = 0;
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'done', cursor: { kind: 'heartbeat' }, activeRequestId: 'hb-late', deadlineAt: Date.now() - 60000, scheduledScan: '', chain: null });
  heartbeat.fbmSyncHeartbeat({ d: { TotalRowCount: 2 }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'hb-late' }] } });
  heartbeat.FbmSync.statePatch({ activeRequestId: 'in-time', deadlineAt: Date.now() + 60000 });
  heartbeat.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  check(so, 'Không báo nhầm: trả lời đến muộn vẫn là có trả lời; GAS tự bỏ request còn trong hạn (dừng, cổng phiên chặn) không phải request mất', unanswered().length, 0);
  heartbeat.FbmSync.requestWatch.trail = undefined;
  heartbeat.FbmSync.statePatch({ runId: 'manual-run', origin: 'manual', phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: 'manual-lost', deadlineAt: Date.now() - 60000 });
  heartbeat.FbmSync.stateStart('', 'checking_session', 0, { origin: 'manual', mode: 'read', scan: 'full' });
  const manualLost = unanswered()[0] || {};
  check(so, 'Lượt bấm tay mở lượt mới đè request quá hạn của lượt trước: cũng có dòng request_unanswered, không nhắc hộp đen vì lần gọi không đến từ Extension', [unanswered().length, String(manualLost.reason).indexOf('manual-lost') >= 0, String(manualLost.reason).indexOf('Hộp đen') < 0], [1, true, true]);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  check(so, 'Hộp đen Extension: không có hộp đen thì nói rõ, worker chạy liền thì nói không bị tắt', [
    heartbeat.FbmSync.extensionTrailText(null, Date.now()), heartbeat.FbmSync.extensionTrailText({ stage: 'gas_response_sent', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 50 }, 1000)
  ], ['Hộp đen Extension: không có (Extension bản cũ hoặc chưa ghi được bước nào).', 'Hộp đen Extension: bước cuối (cách đây 0 phút) là đã gửi kết quả về GAS, chưa nhận trả lời. Phần chạy nền của Extension vẫn chạy liền từ bước đó, không khởi động lại.']);
  check(so, 'Hộp đen Extension: Extension đã chạy hết lượt thì không nói bị Chrome tắt dù worker dựng lại sau đó, chỉ ra lỗi phía GAS', heartbeat.FbmSync.extensionTrailText({ stage: 'chain_finished', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 900 }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là Extension đã chạy hết lượt vì GAS trả lời không còn request tiếp. Lượt còn mở là lỗi phía GAS, không phải Extension bỏ dở.');
  check(so, 'Hộp đen Extension: GAS trả lỗi thì Log nêu mã lỗi Extension nhận được, chỉ giữ ký tự an toàn', heartbeat.FbmSync.extensionTrailText({ stage: 'gas_reply_failed', at: 1000, code: 'RELAY_TIMEOUT<script>' }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là GAS trả lời lỗi hoặc Extension không gọi được GAS, Extension dừng lượt. Mã lỗi: RELAY_TIMEOUTscript.');
  check(so, 'Hộp đen Extension: lượt dừng lúc tự tải lại tab FBM thì Log nói rõ bước đó, mã lỗi và việc phần chạy nền khởi động lại', heartbeat.FbmSync.extensionTrailText({ stage: 'fbm_tab_reloading', requestId: 'r-1', code: 'FBM_TAB_NOT_READY', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 900 }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là tab FBM không phản hồi, Extension đang tự tải lại tab, request r-1. Mã lỗi: FBM_TAB_NOT_READY. Phần chạy nền của Extension đã khởi động lại sau bước đó nên lượt bị cắt giữa chừng (Chrome tắt phần chạy nền hoặc Extension được tải lại).');
  heartbeat.FbmSync.logContextNote({ runId: 'r', origin: 'manual', phase: 'done', scan: 'full', chain: { current: 'heartbeat' } });
  const ctxHeartbeat = heartbeat.FbmSync.logContextText();
  heartbeat.FbmSync.logContextNote({ runId: 'r', origin: 'background', phase: 'pull_customer', scan: 'full', chain: { current: 'heartbeat' } });
  const ctxRecount = heartbeat.FbmSync.logContextText();
  heartbeat.FbmSync.logContextNote({ runId: 'r', origin: 'background', phase: 'pull_activity', scan: 'detail', chain: { current: 'detail' } });
  const ctxDetail = heartbeat.FbmSync.logContextText();
  heartbeat.FbmSync.logContextNote({ runId: 'r', origin: 'manual', phase: 'pull_customer', scan: 'full', chain: { current: 'heartbeat' } });
  const ctxManual = heartbeat.FbmSync.logContextText();
  check(so, 'Lượt trong Log: Giữ phiên là Nền dù lượt trước bấm tay; Quét nhanh do Giữ phiên gọi ghi cả hai; tiến trình nền ghi tên nó; lượt bấm tay ghi Tay và kiểu quét, không ghi chuỗi nền sót', [ctxHeartbeat, ctxRecount, ctxDetail, ctxManual], ['Nền · Giữ phiên FBM', 'Nền · Giữ phiên FBM · Quét nhanh', 'Nền · Vòng xoay giao dịch', 'Tay · Quét nhanh']);
  heartbeat.FbmSync.statePatch({ chain: { current: 'detail', ran: [] } });
  heartbeat.FbmSync.stateStart('', 'checking_session', 0, { origin: 'background', mode: 'read', scan: 'detail' });
  const openedRead = heartbeat.FbmSync.stateRead();
  check(so, 'Mở lượt ghi ngay nguồn và kiểu quét: đọc lại kho giữa chừng (preflight) vẫn thấy lượt nền Vòng xoay, nhãn Log không thành Tay · Quét nhanh', [openedRead.origin, openedRead.scan, heartbeat.FbmSync.logContextText()], ['background', 'detail', 'Nền · Vòng xoay giao dịch']);
  const leftOpenLogs = [];
  heartbeat.logEvent = (entry) => leftOpenLogs.push(entry);
  heartbeat.FbmSync.statePatch({ runId: 'left-open-run', origin: 'background', phase: 'pull_customer', cursor: { kind: 'scan_job' }, activeRequestId: 'in-flight', deadlineAt: Date.now() + 60000 });
  const inFlightReply = heartbeat.FbmSync.runSlice(() => ({ ok: true, request: null }));
  const inFlightPhase = heartbeat.FbmSync.stateRead().phase;
  heartbeat.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const leftOpenReply = heartbeat.FbmSync.runSlice(() => ({ ok: true, request: null }));
  const leftOpenState = heartbeat.FbmSync.stateRead();
  check(so, 'Lát trả hết việc khi lượt còn ở phase đang chạy và không request nào chờ: đóng lượt ngay với RUN_LEFT_OPEN và Log ghi lỗi phía GAS; còn request đang chờ thì không đụng', [
    inFlightReply.ok, inFlightPhase, leftOpenReply.ok, leftOpenReply.code, leftOpenState.phase, leftOpenState.lastFailureCode, leftOpenLogs.filter((entry) => entry.action === 'run_left_open').length
  ], [true, 'pull_customer', false, 'RUN_LEFT_OPEN', 'error', 'RUN_LEFT_OPEN', 1]);
  heartbeat.FbmSync.statePatch({ runId: 'write-lost-run', origin: 'background', phase: 'push', cursor: { kind: 'push_wait', entity: 'customer' }, activeRequestId: 'write-request', deadlineAt: Date.now() - 1000, scheduledScan: '', chain: null });
  giuBanGhiDongBo(heartbeat, 'customer', '1');
  heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  const lostWrite = heartbeat.FbmSync.stateRead();
  check(so, 'Lần hỏi nền gặp lệnh ghi mất response: kết thúc SYNC_STALE_WRITE, giữ khóa bản ghi, không gửi lại lệnh ghi', [lostWrite.lastFailureCode, heartbeat.recordHoldsPeekOwner('fbm'), lostWrite.phase], ['SYNC_STALE_WRITE', true, 'error']);
  delete heartbeat.logEvent;
  const activeState = heartbeat.FbmSync.stateRead();
  activeState.phase = 'pull_customer'; activeState.runId = 'heartbeat-run'; activeState.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }; activeState.activeRequestId = 'in-flight-request'; activeState.deadlineAt = Date.now() + 60000;
  heartbeat.FbmSync.stateWrite(activeState);
  const overlapDuringSync = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat khong ghi de cursor phien Customer dang chay', [overlapDuringSync.ok, overlapDuringSync.code, overlapDuringSync.request], [false, 'REQUEST_IN_FLIGHT', null]);
   heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { cookie: 'userFHN_CRM_App', expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' }, scheduledScan: '' });
   heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
   const changedRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat thay doi tong Customer co reservation moi', [changedRequest.ok, changedRequest.request.meta.kind], [true, 'heartbeat']);
  const changedHeartbeat = heartbeat.fbmSyncHeartbeat({ d: { TotalRowCount: 3 }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: changedRequest.request.id }] } });
   check(so, 'heartbeat tong Customer thay doi kich full Customer va probe lai', [changedHeartbeat.request.meta.kind, changedHeartbeat.status.phase], ['session_probe', 'checking_session']);
   heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { cookie: 'userFHN_CRM_App', expired: false }, scheduledScan: '' });
   heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
   const failedRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  const failedHeartbeat = heartbeat.fbmSyncHeartbeat({ ok: false, status: 500, body: '{"Message":"There was an error processing the request."}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: failedRequest.request.id }] } });
  check(so, 'heartbeat HTTP 500 dung phien va tra loi ro rang', [failedHeartbeat.ok, failedHeartbeat.code, heartbeat.FbmSync.stateRead().lastFailureCode], [false, 'TRANSPORT_ERROR', 'TRANSPORT_ERROR']);
   heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { cookie: 'userFHN_CRM_App', expired: false } });
   heartbeatData.FBM_SYNC_DONE_HEARTBEAT = '1';
   const emptyRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat shape rong co reservation truoc khi phan loai', [emptyRequest.ok, emptyRequest.request.meta.kind], [true, 'heartbeat']);
  const emptyHeartbeat = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":{}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: emptyRequest.request.id }] } });
  check(so, 'heartbeat khong co shape Customer khong duoc suy ra het phien tu heartbeat', [emptyHeartbeat.ok, emptyHeartbeat.code, heartbeat.FbmSync.stateRead().session.expired], [false, 'HEARTBEAT_RESPONSE_INVALID', false]);
  const backgroundState = heartbeat.FbmSync.stateRead();
  backgroundState.runId = 'background-run'; backgroundState.origin = 'background'; backgroundState.phase = 'pull_customer'; backgroundState.entity = 'customer'; backgroundState.activeRequestId = 'background-request'; backgroundState.cursor = { kind: 'customer_grid', type: 0, pageIndex: 0, pageValue: null, count: 2000 }; backgroundState.metadata.manualPending = null;
  heartbeat.FbmSync.stateWrite(backgroundState);
  const manualRequest = heartbeat.FbmSync.start({ mode: 'read', manual: true });
  check(so, 'chạy tay giữa lượt nền không tự dừng nền mà trả mã để Sidebar hỏi người dùng', [manualRequest.ok, manualRequest.code, !!manualRequest.status, heartbeat.FbmSync.stateRead().metadata.manualPending, heartbeat.FbmSync.stateRead().runId], [false, 'SYNC_BACKGROUND_RUNNING', true, null, 'background-run']);
  const stopRequest = heartbeat.FbmSync.stopBackground();
  check(so, 'chỉ lệnh dừng nền mới đặt cờ dừng sau response hiện tại', [stopRequest.ok, stopRequest.code, !!heartbeat.FbmSync.stateRead().metadata.manualPending], [true, 'SYNC_BACKGROUND_STOPPING', true]);
  const stoppedBackground = heartbeat.FbmSync.continue({ d: { Rows: [] }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'background-request' }] } });
  check(so, 'phien nen dung va san sang cho manual sau khi nhan response', [stoppedBackground.manualReady, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().runId], [true, 'idle', '']);
  const manualRun = heartbeat.FbmSync.stateRead(); manualRun.runId = 'manual-run'; manualRun.origin = 'manual'; manualRun.phase = 'pull_customer'; heartbeat.FbmSync.stateWrite(manualRun);
  const stopManual = heartbeat.FbmSync.stopBackground();
  check(so, 'lệnh dừng nền gặp lượt tay thì không đặt cờ dừng', [stopManual.code, heartbeat.FbmSync.stateRead().metadata.manualPending || null], ['SYNC_BACKGROUND_IDLE', null]);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', origin: 'manual' });
  const preservedState = heartbeat.FbmSync.stateRead();
  preservedState.runId = 'preserve-run'; preservedState.phase = 'pull_customer'; preservedState.cursor = { kind: 'customer_grid', pageIndex: 4 }; preservedState.activeRequestId = 'preserve-request';
  heartbeat.FbmSync.stateWrite(preservedState);
  heartbeat.FbmSync.setMasterEnabled(false);
  const blockedByMaster = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/Main/blocked', body: {}, meta: { kind: 'grid' } });
  const keptAfterMasterOff = heartbeat.FbmSync.stateRead();
  check(so, 'tắt công tắc tổng giữ cursor va reservation đang bay', [blockedByMaster, keptAfterMasterOff.cursor.kind, keptAfterMasterOff.activeRequestId, keptAfterMasterOff.phase], [null, 'customer_grid', 'preserve-request', 'paused']);
  heartbeat.FbmSync.setMasterEnabled(true);
  const cancelledState = heartbeat.FbmSync.stateRead();
  cancelledState.runId = 'cancel-run'; cancelledState.phase = 'checking_session'; cancelledState.cursor = { kind: 'authorize_customer' }; cancelledState.activeRequestId = 'cancel-request';
  heartbeat.FbmSync.stateWrite(cancelledState);
  const pendingCancel = heartbeat.fbmSyncCancel();
  check(so, 'dung phien khi request dang bay giu reservation', [pendingCancel.code, heartbeat.FbmSync.stateRead().activeRequestId, heartbeat.FbmSync.stateRead().metadata.cancelPending], ['SYNC_CANCEL_PENDING', 'cancel-request', true]);
  const stoppedAfterResponse = heartbeat.FbmSync.continue({ d: { Authorized: 'auth-customer' }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'cancel-request' }] } });
  check(so, 'response hien tai duoc dong nhung khong cap request tiep', [stoppedAfterResponse.ok, stoppedAfterResponse.request, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().activeRequestId], [true, null, 'paused', '']);
  const cancelWithoutFlight = heartbeat.fbmSyncCancel();
  check(so, 'dung phien khi khong con request bay giu man ket qua o trang thai tam dung ma khong khoa lich nen sau do', [cancelWithoutFlight.phase, cancelWithoutFlight.runId, cancelWithoutFlight.message.indexOf('kết quả và log') >= 0], ['paused', '', true]);

  // Bộ đệm DocumentProperties: lượt khác ghi trong lúc chờ khóa phải được thấy; lỗi giữa chừng vẫn lưu phần đã ghi và giữ lỗi gốc.
  const bufferData = {};
  const bufferStore = {
    getProperty: (key) => Object.prototype.hasOwnProperty.call(bufferData, key) ? bufferData[key] : null,
    getProperties: () => Object.assign({}, bufferData),
    setProperty: (key, value) => { bufferData[key] = String(value); },
    setProperties: (values) => { Object.keys(values).forEach((key) => { bufferData[key] = String(values[key]); }); },
    deleteProperty: (key) => { delete bufferData[key]; }
  };
  const buffered = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => bufferStore } });
  napServer(buffered, 'fbm_sync/state/PropertyBuffer.js');
  const fs = buffered.FbmSync;
  bufferData.k = 'v1';
  fs.propertyBufferBegin();
  const firstScope = fs.withPropertyBuffer(() => fs.props().getProperty('k'));
  bufferData.k = 'v2';
  const secondScope = fs.withPropertyBuffer(() => fs.props().getProperty('k'));
  fs.propertyBufferEnd();
  check(so, 'bộ đệm kho FBM: lấy khóa lần sau trong cùng lần gọi đọc lại kho, thấy giá trị lượt khác vừa ghi', [firstScope, secondScope], ['v1', 'v2']);
  bufferData.gone = 'x';
  let workError = null;
  try {
    fs.withPropertyBuffer(() => {
      fs.props().setProperty('k', 'v3');
      fs.props().deleteProperty('gone');
      check(so, 'bộ đệm kho FBM: trong khóa, ghi chỉ chờ, kho chưa đổi', [bufferData.k, bufferData.gone], ['v2', 'x']);
      throw new Error('work-failed');
    });
  } catch (err) { workError = err.message; }
  check(so, 'bộ đệm kho FBM: phần việc lỗi giữa chừng vẫn ghi gộp phần đã ghi và ném nguyên lỗi gốc', [workError, bufferData.k, 'gone' in bufferData, buffered.DOCUMENT_STORE.lockDepth], ['work-failed', 'v3', false, 0]);

}

module.exports = { chay };
