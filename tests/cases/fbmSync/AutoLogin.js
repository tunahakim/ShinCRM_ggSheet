/** Kiểm tra cấu hình envelope và phục hồi cursor auto-login phía GAS. */
const { section, check } = require('../../lib/assert');
const { taoKhoThuocTinh } = require('../../lib/gas/kho-thuoc-tinh');
const { taoHopCat, napServer, TEP_KHUNG_LUOT, TRANG_FBM_THU } = require('../../lib/load-gas');
const { datPhan, docPhan, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { TRA_BUOC, quaTrangLogin } = require('../../lib/fbm/trang-login');
const quaTrang = (nop, first, doi) => quaTrangLogin(nop, first, MA_HOP_DONG, doi);
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const USER_BODY = '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}';

/** Nộp response của lượt nền như `continue` qua lát chung, bỏ phần khóa của cửa lệnh (khóa kiểm ở Control), nhưng kết quả vẫn qua cửa ra `publicResult` như đường thật: gọi thẳng lát thì trường lạ ở đường tự đăng nhập không lộ ra trong test. */
function noiNen(hop, response) { return hop.FbmSync.publicResult(hop.FbmSync.runSlice(() => hop.FbmSync.continue(response))); }
/** Đặt ô lượt đăng nhập ở bước `cursor.step` rồi nộp response qua chặng chung (`CURSOR_TABLE.login`). */
function nopBuoc(F, cursor, reply, patch) {
  F.statePatch(Object.assign({ runId: 'login-' + Math.random().toString(36).slice(2), phase: 'checking_session', cursor: F.loginCursorOpen(cursor), activeRequestId: '', deadlineAt: 0 }, patch || {}));
  return F.stageRun(F.cursorTable('login'), F.stateRead(), reply);
}
const HET_HAN = { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}' };
/** Hỏi cổng tự đăng nhập bằng đúng đầu vào chặng phiên đọc khi phiên chết. */
function congVao(F, now, manual) { const vao = F.sessionInputs({ cursor: { kind: 'session', resume: { cursor: { kind: 'customer_grid' } } } }, HET_HAN); return F.autoLoginGate(Object.assign({ attempt: vao.attempt, now: now === undefined ? Date.now() : now, manual: manual === true }, vao.login)); }
/** Lần hỏi của chuông nền từ máy được giao chạy nền, kết quả qua cửa ra `publicResult` như `noiNen`. */
function hoiNen(hop) {
  if (hop.FbmSync.backgroundMachineRead().machineId !== 'may-A') { hop.FbmSync.backgroundMachineWrite(hop.FbmSync.machineAssigned('may-A', 'Máy A', Date.now())); }
  return hop.FbmSync.publicResult(hop.FbmSync.heartbeatRun({ trigger: 'alarm', machineId: 'may-A' }));
}

async function chay(so) {
  section('FBM sync - auto-login');
  const data = {};
  const props = taoKhoThuocTinh(data);
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, logEvent() {}, LOG_OK: 'ok', LOG_ERROR: 'error' });
  napServer(hop, 'fbm_sync/control/ControlPort.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/state/Heartbeat.js');
  check(so, 'auto-login mặc định bật nhưng chưa cấu hình', [docPhan(hop, 'loginPolicy').enabled, hop.FbmSync.loginConfigPublic().configured], [true, false]);
  const invalid = hop.FbmSync.loginConfigSave({ credentialRef: 'cred-invalid', envelope: { iv: 'short', ciphertext: 'short' } });
  check(so, 'envelope thiếu độ dài bị từ chối', invalid.code, 'LOGIN_ENVELOPE_INVALID');
  const saved = hop.FbmSync.loginConfigSave({ credentialRef: 'cred-test-1234', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  check(so, 'lưu envelope chỉ trả metadata công khai và username đầy đủ', [saved.ok, saved.public.usernameHint, saved.envelope, JSON.stringify(data.FBM_CREDENTIAL_V1).includes('password')], [true, 'anhlt', undefined, false]);
  check(so, 'đọc cấu hình không trả ciphertext ra Sidebar', [hop.FbmSync.loginConfigPublic().configured, hop.FbmSync.loginConfigPublic().envelope], [true, undefined]);
  const state = hop.FbmSync.runOpen({ phase: 'pull_customer', total: 1 });
  state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }; hop.FbmSync.stateWrite(state);
  const login = hop.FbmSync.autoLoginOpen(hop.FbmSync.stateRead(), { manual: false, afterLogin: { cursor: state.cursor, phase: 'pull_customer', entity: 'customer' } });
  check(so, 'hết phiên tạo request bước trang Login, giữ cursor cũ làm chỗ quay về và đánh dấu lượt đã tự đăng nhập', [login.request.meta.kind, login.request.meta.step, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.afterLogin.cursor.pageIndex, hop.FbmSync.stateRead().metadata.autoLoginTried], ['login_step', 'page', 'login', 2, true]);
  // Cổng tự đăng nhập với đúng dữ kiện chặng phiên đọc khi phiên không sống (`sessionInputs`).
  const cong = (now, manual) => congVao(hop.FbmSync, now, manual);
  check(so, 'auto-login chỉ thử lại một lần trong 30 phút', cong(Date.now() + 1000).code, 'AUTO_LOGIN_THROTTLED');
  // Chủ dự án chốt 2026-10-07: chu kỳ chờ chỉ dành cho chạy nền; người bấm chạy phải được thử ngay hoặc nhận hướng dẫn.
  check(so, 'lượt bấm tay được bỏ qua chu kỳ chờ', cong(Date.now() + 1000, true).ok, true);
  // Chặng phiên kết luận phiên chết: chạy nền vừa thử hỏng thì dừng có lý do, lượt bấm tay thì gửi đăng nhập và đánh dấu cursor là bấm tay.
  const chetPhien = (origin) => {
    hop.FbmSync.stateWrite(Object.assign(hop.FbmSync.runOpen({ phase: 'checking_session' }), { origin: origin, cursor: { kind: 'session', cause: 'issue', resume: { cursor: { kind: 'customer_grid', type: 1, pageIndex: 0, pageValue: null, count: 2000 }, phase: 'pull_customer', entity: 'customer' }, replay: false, probeRetried: false, pageReloaded: false }, activeRequestId: 'probe-' + origin, deadlineAt: Date.now() + 60000 }));
    return noiNen(hop, Object.assign({}, HET_HAN, { transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'probe-' + origin }] } }));
  };
  const backgroundThrottled = chetPhien('background');
  const manualRetry = chetPhien('manual');
  check(so, 'lượt bấm tay ngay sau lần đăng nhập hỏng vẫn gửi đăng nhập và đánh dấu cursor là bấm tay, chạy nền thì bị chặn', [backgroundThrottled.code, backgroundThrottled.request, manualRetry.request && manualRetry.request.meta.kind, hop.FbmSync.stateRead().cursor.manual], ['AUTO_LOGIN_THROTTLED', null, 'login_step', true]);
  const attemptAt = Date.now();
  const thanhCong = (at) => hop.FbmSync.loginAttemptWrite(hop.FbmSync.loginAttemptMark(hop.FbmSync.loginAttemptRead(), { kind: 'success' }, at, 0));
  thanhCong(attemptAt + 500);
  check(so, 'đăng nhập tự động thành công rồi phiên bị đăng xuất thì được đăng nhập lại ngay, không phải chờ chu kỳ 30 phút', cong(attemptAt + 13 * 60 * 1000).ok, true);
  datPhan(hop, 'loginPolicy', { retryEnabled: false });
  check(so, 'tắt tự thử lại chỉ chặn sau lần thất bại, lần trước thành công vẫn được đăng nhập lại', cong(attemptAt + 60 * 1000).ok, true);
  hop.FbmSync.autoLoginMarkAttempt(attemptAt + 2000);
  check(so, 'tắt tự thử lại thì lần thử chưa thành công chặn với lý do riêng', [cong(attemptAt + 60 * 60 * 1000).code, hop.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_RETRY_DISABLED').indexOf('tắt tự thử lại') >= 0], ['AUTO_LOGIN_RETRY_DISABLED', true]);
  datPhan(hop, 'loginPolicy', { retryEnabled: true });
  const sauDangNhap = hop.FbmSync.stateRead();
  sauDangNhap.session = Object.assign({}, sauDangNhap.session, { identityVerified: false, sessionId: '', identitySessionId: '' });
  const resumed = hop.FbmSync.loginSucceed(sauDangNhap, { purpose: 'auto', afterLogin: { cursor: { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }, phase: 'pull_customer', entity: 'customer' } }, {});
  check(so, 'đăng nhập tự động xong mà phiên chưa xác minh thì quay lại hỏi phiên (grid User) trước request nghiệp vụ, chỗ quay về là cursor cũ', [resumed.request.meta.kind, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.resume.cursor.pageIndex], ['session_probe', 'session', 2]);
  check(so, 'login test không coi Login.aspx là thành công', hop.FbmSync.protocol.isSessionExpired({ ok: true, status: 200, body: '<form action="Login.aspx"></form>' }), true);
  // Các tiến trình khác vừa chạy xong nên chưa đến hạn: lần hỏi nào đến hạn chỉ là Giữ phiên.
  const heartbeatData = { FBM_SYNC_PROCESS_BOOK_V1: JSON.stringify({ customerFull: { doneAt: Date.now() }, activityFull: { doneAt: Date.now() }, detail: { doneAt: Date.now() } }) };
  const heartbeatProps = taoKhoThuocTinh(heartbeatData);
  const heartbeat = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => heartbeatProps, getScriptProperties: () => heartbeatProps }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, shinOpenBook: () => ({ getId: () => 'sheet-test' }) });
  napServer(heartbeat, 'fbm_sync/control/ControlPort.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  heartbeat.FbmSync.configValue = () => '';
  heartbeat.FbmSync.readLocal = () => [];
  heartbeat.FbmSync.bindingWrite({ spreadsheetId: 'sheet-test', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  heartbeat.FbmSync.runOpen({ phase: 'idle' });
  heartbeat.FbmSync.statePatch({ session: { expired: true } });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  // Dấu hết hạn còn từ lượt trước không đủ để đăng nhập (09/06), và phiên chưa xác minh thì Giữ phiên không được dựng request đếm khách (mã người dùng lấy từ phiên đã xác minh): mở bằng probe, probe báo chưa xác thực mới đi cổng đăng nhập.
  const staleCount = hoiNen(heartbeat);
  const staleProbe = noiNen(heartbeat, { ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: staleCount.request.id }] } });
  const autoLoginRequest = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: staleProbe.request.id }] } });
  const autoLoginManual = heartbeat.FbmSync.stateRead().cursor.manual;
  check(so, 'heartbeat phien chua xac minh: mo bang probe, FBM tra 401 thi probe lai mot lan roi cap login request', [staleCount.request.meta.kind, staleProbe.request && staleProbe.request.meta.kind, autoLoginRequest.ok, autoLoginRequest.request && autoLoginRequest.request.meta.kind, autoLoginRequest.request && autoLoginRequest.request.meta.step], ['session_probe', 'session_probe', true, 'login_step', 'page']);
  const loginResponse = quaTrang((reply) => noiNen(heartbeat, reply), autoLoginRequest.request);
  check(so, 'đăng nhập qua đủ các bước trang Login rồi vẫn phải authorize trước', [loginResponse.ok, loginResponse.request.meta.kind, loginResponse.request.meta.entity], [true, 'authorize', 'customer']);
  const authorizeResponse = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: loginResponse.request.id }] } });
  check(so, 'sau authorize GAS cap User grid de xac minh identity', [authorizeResponse.ok, authorizeResponse.request.meta.kind, authorizeResponse.request.body.controller], [true, 'identity_user_grid', 'User']);
  const userResponse = noiNen(heartbeat, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: authorizeResponse.request.id }] } });
  check(so, 'Chỉ khi tài khoản khớp mới đi tiếp lượt Giữ phiên tới bước đếm khách', [userResponse.ok, userResponse.request.meta.kind, heartbeat.FbmSync.stateRead().session.accountUsername, heartbeat.FbmSync.stateRead().session.accountName], [true, 'customer_count', 'ANHLT', 'Le Tuan Anh']);
  check(so, 'Giữ phiên là lượt nền: đi qua probe rồi cần đăng nhập không bị tính là lượt bấm tay, lần đăng nhập vẫn chịu chu kỳ chờ của chạy nền', [heartbeat.FbmSync.stateRead().origin, !!autoLoginRequest.request && autoLoginManual], ['background', false]);
  // Gặp thật 2026-10-16 20:33: đăng nhập xong giữa Giữ phiên, response đếm khách về thì GAS trả "hết việc" mà lượt vẫn mở ở checking_session; Quét đầy đủ đến hạn không chạy, lần hỏi sau mới phát hiện lượt bỏ dở.
  vaSoNen(heartbeat.FbmSync, { customerFull: { doneAt: 1, baseline: 1 } });
  const resumedLogs = [], savedResumedLog = heartbeat.logEvent;
  heartbeat.logEvent = (event) => resumedLogs.push(event);
  const resumedCount = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[1]],"ViewPage":{"Fields":[{"AliasName":"id"}]}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: userResponse.request.id }] } });
  heartbeat.logEvent = savedResumedLog;
  const resumedState = heartbeat.FbmSync.stateRead();
  check(so, 'Đăng nhập xong giữa Giữ phiên: response đếm khách về thì chuỗi chạy tiếp Quét đầy đủ đến hạn, không trả hết việc khi lượt còn mở', [
    resumedCount.ok, !!resumedCount.request, resumedState.process, heartbeat.FbmSync.processBookRead().heartbeat.doneAt > 1, resumedLogs.some((event) => event.action === 'run_left_open')
  ], [true, true, 'customerFull', true, false]);
  // Các ca sau chỉ xét Giữ phiên: bỏ Quét đầy đủ vừa mở khỏi chuỗi.
  vaSoNen(heartbeat.FbmSync, { customerFull: { doneAt: Date.now() } });
  heartbeat.FbmSync.statePatch({ process: '' });
  // Lượt tay đã tự đăng nhập thì cờ "đã thử đăng nhập" còn sót sau khi lượt xong: dựng lại dấu đó cho ca kế.
  const leftoverState = heartbeat.FbmSync.stateRead();
  leftoverState.metadata.autoLoginTried = true;
  heartbeat.FbmSync.stateWrite(leftoverState);

  // Phiên chết lần nữa ở lần hỏi nền sau (gặp thật 2026-10-16: đăng nhập 00:17, 00:32 phiên lại chết): cờ "đã thử đăng nhập" của lượt trước không được chặn lần đăng nhập mới.
  heartbeat.FbmSync.statePatch({ phase: 'done', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const loginLeftover = heartbeat.FbmSync.stateRead().metadata.autoLoginTried;
  const againConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  againConfig.lastAttemptAt = 0; againConfig.nextRetryAt = 0;
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(againConfig);
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const againCount = hoiNen(heartbeat);
  // Quét đầy đủ vừa mở đã xóa phiên nên Giữ phiên mở bằng probe; probe nhận Authorized:false là phiên chết, đi thẳng cổng đăng nhập.
  const againProbe = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: againCount.request.id }] } });
  check(so, 'Lượt trước đã tự đăng nhập thành công, lần hỏi nền sau phiên lại chết: probe nhận Authorized:false thì cấp lệnh đăng nhập mới, không dừng SESSION_PROBE_FAILED_AFTER_LOGIN', [
    loginLeftover, againCount.request.meta.kind, againProbe.code || '', againProbe.request && againProbe.request.meta.kind
  ], [true, 'session_probe', '', 'login_step']);
  let identityUserRequests = 0;
  const identityUserBuilder = heartbeat.FbmSync.identityUserRequest;
  heartbeat.FbmSync.identityUserRequest = function (cfg) { identityUserRequests += 1; return identityUserBuilder(cfg); };
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: false, identitySessionId: '', sessionId: '' } });
  const probeStart = heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' });
  const probeResponse = heartbeat.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: probeStart.request.id }] } });
  check(so, 'session probe đầu lượt đọc User rồi trả lại cursor authorize', [probeStart.request.meta.kind, probeResponse.request.meta.kind, heartbeat.FbmSync.stateRead().session.identityVerified, heartbeat.FbmSync.stateRead().cursor.kind], ['session_probe', 'authorize', true, 'authorize_customer']);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const secondStart = heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' });
  check(so, 'moi luot moi probe lai User du khong con cookie cu', [secondStart.request.meta.kind, identityUserRequests, heartbeat.FbmSync.stateRead().session.identityVerified], ['session_probe', 2, false]);
  check(so, 'probe User khong co payload cookie van duoc cap fallback transport tuy chon', [secondStart.request.body.cookie, secondStart.request.meta.transport.replacements[0].required, secondStart.request.meta.transport.replacements[0].fallback], ['{{FBM_PAYLOAD_COOKIE}}', false, '']);
  const unauthenticatedConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  unauthenticatedConfig.lastAttemptAt = 0;
  unauthenticatedConfig.nextRetryAt = 0;
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(unauthenticatedConfig);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: false, identitySessionId: '', sessionId: '' } });
  const unauthenticatedProbe = heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' });
  const unauthenticatedResult = heartbeat.FbmSync.continue({ ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: 0, Rows: null, Repetition: null, Aggregation: null, ViewPage: null, Authorized: false } }), transport: { contract: MA_HOP_DONG, trace: [{ requestId: unauthenticatedProbe.request.id }] } });
  check(so, 'probe User Authorized false khong dong bo phai chuyen sang auto-login', [unauthenticatedResult.ok, unauthenticatedResult.request && unauthenticatedResult.request.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind], [true, 'login_step', 'login']);
  heartbeat.FbmSync.statePatch({ metadata: { autoLoginTried: false } });

  heartbeat.FbmSync.statePatch({ runId: 'marker-mismatch', phase: 'checking_session', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: true, identitySessionId: 'old-session', sessionId: 'new-session' } });
  const markerMismatch = heartbeat.FbmSync.sliceIssue({ url: 'https://fbm.test/marker-mismatch', body: {}, meta: { kind: 'business_request', requireIdentityProbe: true } });
  check(so, 'marker lệch session bị coi là chưa xác thực và chặn request nghiệp vụ', [markerMismatch.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind], ['session_probe', 'session']);

  const autoMismatch = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'identity', afterLogin: { cursor: { kind: 'customer_count' } } }, { ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[9999,"OTHER","Other User"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}' }, { session: { expired: false, identityVerified: true, sessionId: 'old-session', identitySessionId: 'old-session' } });
  check(so, 'auto-login sai identity fail-closed va xoa marker phien', [autoMismatch.code, heartbeat.FbmSync.stateRead().session.identityVerified, heartbeat.FbmSync.stateRead().session.expired, docPhan(heartbeat, 'loginPolicy').enabled], ['LOGIN_IDENTITY_MISMATCH', false, true, false]);

  const gateLogs = [];
  let gateFlushes = 0;
  heartbeat.logEvent = (event) => gateLogs.push(event);
  heartbeat.flushLog = () => { gateFlushes += 1; };
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const validRead = heartbeat.FbmSync.sliceIssue({ url: 'https://fbm.test/read', body: { read: true }, meta: { kind: 'grid' } });
  heartbeat.FbmSync.statePatch({ activeRequestId: '', phase: 'push', mode: 'push', cursor: { kind: 'push_wait', operation: 'customer_edit_save' }, session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const validWrite = heartbeat.FbmSync.sliceIssue({ url: 'https://fbm.test/write', body: { write: true }, meta: { kind: 'customer_edit_save' } });
  check(so, 'session hop le khong doi hanh vi ca doc va ghi', [validRead.meta.kind, validWrite.meta.kind, validRead.meta.openFbmContext, validWrite.meta.openFbmContext, gateLogs.length], ['grid', 'customer_edit_save', undefined, undefined, 0]);

  datPhan(heartbeat, 'loginPolicy', { enabled: false, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'closed-gate', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: true }, lastFailureCode: '', lastError: '' });
  const closedGateProbe = heartbeat.FbmSync.sliceIssue({ url: 'https://fbm.test/blocked', body: {}, meta: { kind: 'blocked_read' } });
  const closedGate = heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: closedGateProbe.id }] } });
  check(so, 'cổng fail-closed khi tự đăng nhập tắt: lượt đóng lỗi qua runFail mang mã chặn, không tạm dừng', [closedGate && closedGate.ok, closedGate && closedGate.code, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, gateLogs.some((event) => event.action === 'session_gate_blocked')], [false, 'AUTO_LOGIN_NOT_CONFIGURED', 'error', 'AUTO_LOGIN_NOT_CONFIGURED', true]);

  heartbeat.FbmSync.statePatch({ runId: 'write-expired', phase: 'push', mode: 'push', cursor: { kind: 'push_wait', operation: 'customer_edit_save' }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  const blockedWriteProbe = heartbeat.FbmSync.sliceIssue({ url: 'https://fbm.test/write-blocked', body: {}, meta: { kind: 'customer_edit_save' } });
  const blockedWrite = heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: blockedWriteProbe.id }] } });
  check(so, 'request ghi khong duoc tu dong gui lai khi session het han', [blockedWrite && blockedWrite.code, blockedWrite && blockedWrite.request, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().phase], ['SESSION_EXPIRED_AT_WRITE', null, 'SESSION_EXPIRED_AT_WRITE', 'paused']);

  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });

  datPhan(heartbeat, 'loginPolicy', { autoOpenTab: true });
  heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  heartbeat.FbmSync.statePatch({ runId: 'no-tab-run', phase: 'checking_session', mode: 'read', cursor: { kind: 'customer_count' }, activeRequestId: 'tab-request-1', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabRetry = heartbeat.FbmSync.transportFailureRun({ requestId: 'tab-request-1', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  const retryId = noTabRetry.request && noTabRetry.request.id;
  const noTabFinal = heartbeat.FbmSync.transportFailureRun({ requestId: retryId, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'no-tab chi retry mot lan theo policy va co log loi', [noTabRetry.ok, noTabRetry.code, noTabRetry.request.meta.openFbmContext !== undefined, noTabFinal.ok, noTabFinal.code, heartbeat.FbmSync.stateRead().phase, gateLogs.filter((event) => event.action === 'transport_retry' || event.action === 'transport_failure').length >= 2], [true, 'FBM_TAB_RETRY_REQUEST_READY', true, false, 'FBM_TAB_NOT_FOUND', 'error', true]);
  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'no-tab-closed', phase: 'checking_session', cursor: { kind: 'customer_count' }, activeRequestId: 'tab-request-closed', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabClosed = heartbeat.FbmSync.transportFailureRun({ requestId: 'tab-request-closed', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'no-tab bi chan ngay khi policy tu mo tab tat', [noTabClosed.ok, noTabClosed.request, noTabClosed.code, heartbeat.FbmSync.stateRead().phase], [false, null, 'FBM_TAB_NOT_FOUND', 'error']);
  check(so, 'log session gate khong chua bi mat hoac payload nhay cam', /password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs)), false);

  /** Phiên đã chết: request đầu (probe, vì phiên chưa xác minh) nhận 401, probe lại xác nhận FBM báo chưa xác thực. */
  const phienChet = (sent) => {
    const probe = noiNen(heartbeat, { ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: sent.request.id }] } });
    return probe.request && probe.request.meta.kind === 'session_probe' ? noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: probe.request.id }] } }) : probe;
  };
  const savedConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  savedConfig.lastAttemptAt = Date.now() - 31 * 60 * 1000;
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(savedConfig);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: true, cookie: '' } });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const failedLoginProbe = hoiNen(heartbeat);
  const failedLoginRequest = phienChet(failedLoginProbe);
  const failedLogin = quaTrang((reply) => noiNen(heartbeat, reply), failedLoginRequest.request, { login: '{"d":"Duplicate"}' });
  check(so, 'login heartbeat bi FBM bao con phien cu: luot dong loi, khong lap ngay, cho chu ky thu lai', [failedLogin.ok, failedLogin.code, failedLogin.request, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'login_failure'), heartbeat.FbmSync.loginConfigRead().loginHalted], [false, 'AUTO_LOGIN_FAILED', null, 'error', true, false]);
  // Trong chu kỳ chờ, lần hỏi sau gửi request việc thật (người dùng có thể đã tự đăng nhập); phiên vẫn chết thì không đăng nhập lại.
  const throttledProbe = hoiNen(heartbeat);
  const throttledAfterFailure = phienChet(throttledProbe);
  check(so, 'login that bai khong tu chay khi chua den lich', [throttledProbe.request && throttledProbe.request.meta.kind, throttledAfterFailure.ok, throttledAfterFailure.code, throttledAfterFailure.request], ['session_probe', false, 'AUTO_LOGIN_THROTTLED', null]);
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const throttledDueProbe = hoiNen(heartbeat);
  const throttledDue = phienChet(throttledDueProbe);
  check(so, 'login that bai bi throttle toi da mot lan moi 30 phut khi den lich', [throttledDueProbe.request && throttledDueProbe.request.meta.kind, throttledDue.ok, throttledDue.code, throttledDue.request], ['session_probe', false, 'AUTO_LOGIN_THROTTLED', null]);

  const expiredConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  expiredConfig.lastAttemptAt = Date.now() - 31 * 60 * 1000;
  expiredConfig.nextRetryAt = 0;
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(expiredConfig);
  heartbeat.FbmSync.statePatch({ runId: 'expired-401', phase: 'pull_customer', mode: 'read', entity: 'customer', cursor: { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] }, activeRequestId: 'expired-401-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const suspected401 = heartbeat.FbmSync.continue({ ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'expired-401-request' }] } });
  const expired401 = heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: suspected401.request.id }] } });
  check(so, 'FBM 401 chi probe lai va neu probe khong song thi dung, khong tu login tu loi nghiep vu', [suspected401.ok, suspected401.request.meta.kind, expired401.ok, expired401.code, heartbeat.FbmSync.stateRead().cursor.kind], [true, 'session_probe', false, 'SESSION_PROBE_UNCERTAIN', null]);

  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'initial-probe-failure', phase: 'checking_session', mode: 'read', cursor: { kind: 'session', cause: 'issue', resume: { cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, phase: 'pull_customer', entity: 'customer' }, replay: false, probeRetried: false, pageReloaded: false }, activeRequestId: 'initial-probe-request', deadlineAt: Date.now() + 1000, session: { expired: false }, metadata: { autoLoginTried: false } });
  const initialProbeFailure = heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'initial-probe-request' }] } });
  check(so, 'probe dau luot khong song moi duoc phep khoi dong mot login', [initialProbeFailure.ok, initialProbeFailure.request.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind], [true, 'login_step', 'login']);

  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'network-failure', phase: 'checking_session', mode: 'read', cursor: { kind: 'customer_count' }, activeRequestId: 'network-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const networkFailure = heartbeat.FbmSync.transportFailureRun({ requestId: 'network-request', code: 'FBM_TRANSPORT_UNAVAILABLE', message: 'Relay timeout.' });
  check(so, 'loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong', [networkFailure.ok, networkFailure.code, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'transport_failure'), gateFlushes > 0], [false, 'FBM_TRANSPORT_UNAVAILABLE', 'error', true, true]);

  // Công cụ đọc của chặng phiên ném lỗi (kho credential hỏng): lát bắt, đóng lượt lỗi và ghi Log; không request nào được phát, Log không chứa bí mật.
  const savedCredentialRead = heartbeat.FbmSync.credentialRead;
  heartbeat.FbmSync.credentialRead = () => { const loi = new Error('Kho credential hỏng.'); loi.code = 'LOGIN_STORE_CORRUPT'; throw loi; };
  heartbeat.FbmSync.statePatch({ runId: 'gate-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'session', cause: 'issue', resume: { cursor: { kind: 'customer_count' }, phase: 'checking_session', entity: '' }, replay: false, probeRetried: false, pageReloaded: false }, activeRequestId: 'gate-exception-request', deadlineAt: Date.now() + 1000, session: { expired: true } });
  let gateExceptionCode = '';
  try { noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'gate-exception-request' }] } }); } catch (error) { gateExceptionCode = String(error.code || ''); }
  heartbeat.FbmSync.credentialRead = savedCredentialRead;
  check(so, 'công cụ đọc của chặng phiên ném lỗi thì lát đóng lượt lỗi đúng mã và ném tiếp (cửa vào ghi Log), không phát request, lý do lỗi hiện cho người dùng, Log không chứa bí mật', [gateExceptionCode, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().activeRequestId, /Kho credential hỏng/.test(String(heartbeat.FbmSync.stateRead().lastError || '')), /password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs))], ['LOGIN_STORE_CORRUPT', 'error', 'LOGIN_STORE_CORRUPT', '', true, false]);

  // FBM-029: sự kiện cổng không kết thúc phiên vẫn có dòng Log riêng dù phiên có sổ bước; ghi state lỗi thì ném lên lát.
  const stepBookState = heartbeat.FbmSync.stateRead();
  Object.assign(stepBookState, { runId: 'step-book-expired', phase: 'pull_customer', metadata: Object.assign({}, stepBookState.metadata, { businessSteps: { pull_customer: { status: 'running' } } }) });
  heartbeat.FbmSync.stateWrite(stepBookState);
  const logsBeforeExpired = gateLogs.length, savedLogStatus = heartbeat.FbmSync.logStatus, savedStatusView = heartbeat.FbmSync.statusView;
  heartbeat.FbmSync.logStatus = () => {}; // như logStatus thật với phiên có sổ bước: không ghi snapshot
  heartbeat.FbmSync.statusView = () => ({ runId: 'step-book-expired' });
  heartbeat.FbmSync.transportFailureRecord(heartbeat.FbmSync.stateRead(), 'SESSION_EXPIRED', 'Phiên FBM đã hết hạn; cổng đang xử lý đăng nhập lại an toàn.', 'session_expired');
  heartbeat.FbmSync.logStatus = savedLogStatus; heartbeat.FbmSync.statusView = savedStatusView;
  const expiredLog = gateLogs.slice(logsBeforeExpired).find((event) => event.action === 'session_expired');
  check(so, 'FBM-029: phiên có sổ bước gặp "Phiên FBM đã hết hạn" (chưa kết thúc phiên) vẫn có dòng Log lỗi mang lý do và mã',
    [!!expiredLog, expiredLog && expiredLog.reason, expiredLog && expiredLog.detail.code, heartbeat.FbmSync.stateRead().phase], [true, 'Phiên FBM đã hết hạn; cổng đang xử lý đăng nhập lại an toàn.', 'SESSION_EXPIRED', 'pull_customer']);
  const savedGateStateWrite = heartbeat.FbmSync.stateWrite;
  heartbeat.FbmSync.stateWrite = () => { const error = new Error('Không thể lưu state đồng bộ vào DocumentProperties.'); error.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED'; throw error; };
  let gateWriteError = null;
  try { heartbeat.FbmSync.transportFailureRecord(heartbeat.FbmSync.stateRead(), 'FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM.', 'transport_retry'); } catch (error) { gateWriteError = error; }
  heartbeat.FbmSync.stateWrite = savedGateStateWrite;
  check(so, 'FBM-029: cổng phiên ghi state lỗi thì ném FBM_DOCUMENT_PROPERTIES_WRITE_FAILED lên lát, không nuốt', gateWriteError && gateWriteError.code, 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED');
  const savedTransportPolicy = heartbeat.FbmSync.transportPolicy;
  heartbeat.FbmSync.transportPolicy = () => { throw new Error('secret-internal'); };
  heartbeat.FbmSync.statePatch({ runId: 'gate-transport-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'customer_count' }, activeRequestId: 'gate-transport-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const gateTransportException = heartbeat.FbmSync.transportFailureRun({ requestId: 'gate-transport-request', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'exception cong trong nhanh no-tab cung thu hoi reservation', [gateTransportException, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().activeRequestId, heartbeat.FbmSync.stateRead().lastFailureCode], [null, 'error', '', 'FBM_SESSION_GATE_EXCEPTION']);
  heartbeat.FbmSync.transportPolicy = savedTransportPolicy;
  check(so, 'lỗi nội bộ ở bảng lỗi đường truyền ghi Log an toàn, không lộ chữ lỗi gốc', /secret-internal/.test(JSON.stringify(gateLogs)), false);

  const beforeTestConfig = heartbeat.FbmSync.loginConfigRead();
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const testRequest = heartbeat.FbmSync.loginTestRequest();
  const testFirst = testRequest.request, testUnit = heartbeat.FbmSync.continue({ ok: true, status: 200, body: TRA_BUOC.page, transport: { contract: MA_HOP_DONG, trace: [{ requestId: testFirst.id }] } });
  const testUnitRequest = heartbeat.FbmSync.continue({ ok: true, status: 200, body: TRA_BUOC.entity, transport: { contract: MA_HOP_DONG, trace: [{ requestId: testUnit.request.id }] } }).request;
  check(so, 'đăng nhập thử không có bản nháp dùng credential đã lưu: bước cần mật khẩu mang mã tham chiếu và bản mã đã lưu, ô tên đăng nhập để trống cho Extension điền', [testFirst.meta.kind, heartbeat.FbmSync.stateRead().cursor.purpose, testUnitRequest.meta.fill.credentialRef, testUnitRequest.meta.fill.ciphertext.ciphertext, testUnitRequest.body.u], ['login_step', 'test', 'cred-heartbeat-123', 'ciphertext-long-enough', '']);
  const testFailure = quaTrang((reply) => heartbeat.FbmSync.continue(reply), testUnitRequest, { login: '{"d":false}' });
  const afterTestFailure = heartbeat.FbmSync.loginConfigRead();
  check(so, 'dang nhap thu bang thong tin da luu bi bao sai mat khau: khong doi moc thu lai, nhung ngung tu dang nhap vi thong tin da luu da sai', [testFailure.code, afterTestFailure.lastAttemptAt, afterTestFailure.lastLoginAt, afterTestFailure.lastError, afterTestFailure.loginHalted], ['LOGIN_FAILED', beforeTestConfig.lastAttemptAt, beforeTestConfig.lastLoginAt, 'FBM báo sai tên đăng nhập hoặc mật khẩu.', true]);

  // FBM không kiểm trường cookie trong body (đo 2026-10-06: đọc, xin quyền mở form và lưu ALT00010 đều thành công với mã rỗng). Login thành công mà không bắt
  // được mã phiên thì vẫn đi tiếp bước xác minh; request xác minh được cấp mã rỗng làm dự phòng thay vì token bắt buộc khiến Extension chặn FBM_TRANSPORT_CAPTURE_MISSING.
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const noCookieTest = heartbeat.FbmSync.loginTestRequest();
  const noCookieLogin = quaTrang((reply) => heartbeat.FbmSync.continue(reply), noCookieTest.request);
  const noCookieReplacement = (noCookieLogin.request && noCookieLogin.request.meta && noCookieLogin.request.meta.transport && noCookieLogin.request.meta.transport.replacements || [])[0] || {};
  check(so, 'đăng nhập thử thành công mà không bắt được mã phiên vẫn đi tiếp xác minh, mã phiên là tùy chọn có dự phòng rỗng (FBM-037)',
    [noCookieLogin.ok, noCookieLogin.request && noCookieLogin.request.meta.kind, noCookieReplacement.required, noCookieReplacement.fallback],
    [true, 'authorize', false, '']);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const mismatchTest = heartbeat.FbmSync.loginTestRequest();
  const mismatchLogin = quaTrang((reply) => heartbeat.FbmSync.continue(reply), mismatchTest.request);
  const mismatchAuthorize = heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: mismatchLogin.request.id }] } });
  const mismatchIdentity = heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[9999,"OTHER","Other User"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: mismatchAuthorize.request.id }] } });
  check(so, 'dang nhap thu sai identity fail-closed nhung khong tu tat auto-login', [mismatchIdentity.code, docPhan(heartbeat, 'loginPolicy').enabled, heartbeat.FbmSync.stateRead().session.identityVerified], ['LOGIN_IDENTITY_MISMATCH', true, false]);

  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const draftB = { spreadsheetId: 'sheet-test', userId: '2040', username: 'USERB', accountName: 'Tai khoan B' };
  const draftLogin = heartbeat.FbmSync.loginTestRequest(null, draftB);
  const draftLoginAdapter = quaTrang((reply) => heartbeat.FbmSync.continue(reply), draftLogin.request);
  const draftLoginAuthorize = heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: draftLoginAdapter.request.id }] } });
  const draftLoginIdentity = heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[2040,"USERB","Tai khoan B"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2040', pageAccountName: 'Tai khoan B' }, trace: [{ requestId: draftLoginAuthorize.request.id }] } });
  check(so, 'login test doi chieu theo identity ban nhap B, khong ep theo binding A', [draftLoginIdentity.code, heartbeat.FbmSync.stateRead().session.accountUsername], ['LOGIN_OK', 'USERB']);

  // Cách đọc từng câu trả lời Login (false, null, chuỗi lạ) kiểm ở LoginReply.js; ở đây chỉ dựng lượt FBM báo còn phiên cũ để mở nút hủy phiên.
  nopBuoc(heartbeat.FbmSync, { purpose: 'auto', manual: true, step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' }, afterLogin: { cursor: { kind: 'customer_grid' } } }, { ok: true, status: 200, body: '{"d":"Duplicate"}' }, { origin: 'manual', session: { expired: true } });
  const textText = heartbeat.FbmSync.stateRead().message;
  check(so, 'Login trả d:"Duplicate" thì báo còn giữ phiên cũ và mở nút hủy phiên cũ', [textText.indexOf('còn giữ phiên đăng nhập cũ') > 0, textText.indexOf('Hủy phiên cũ và đăng nhập') > 0, heartbeat.FbmSync.statusView().forceLoginOffered], [true, true, true]);
  const serviceSource = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8');
  check(so, 'mọi lệnh mở lượt (đăng nhập thử, hủy phiên cũ, kiểm liên kết, đồng bộ) đi qua cửa fbmDriveCommand và vỏ runEntryPoint để Log được ghi ra sheet', ['fbmDriveCommand'].map((name) => serviceSource.indexOf('function ' + name + '(') >= 0 && serviceSource.indexOf("fbmCommandRun('" + name + "'") >= 0).concat(/function fbmCommandRun\([^)]*\) \{ return runEntryPoint\(name, 'fbm_sync'/.test(serviceSource)), [true, true]);
  // FBM-057: nút hủy phiên cũ. GAS chỉ mở sau khi FBM trả lời từ chối; đăng nhập tự động luôn là login mềm.
  check(so, 'FBM từ chối đăng nhập thì status mở nút hủy phiên cũ; request đăng nhập tự động không mang cờ hủy phiên', [heartbeat.FbmSync.statusView().forceLoginOffered, heartbeat.FbmSync.loginRequestPlan('login', {}, heartbeat.FbmSync.credentialRead(), {}).body.force], [true, false]);
  const forceLogsBefore = gateLogs.length;
  const forceStart = heartbeat.FbmSync.loginForceRequest();
  const forceLoginStep = quaTrang((reply) => (reply.body === TRA_BUOC.login ? { ok: true, request: null, held: heartbeat.FbmSync.stateRead() } : heartbeat.FbmSync.continue(reply)), forceStart.request).held.cursor;
  const forceLoginRequest = heartbeat.FbmSync.loginStepRequest(forceLoginStep, heartbeat.FbmSync.credentialRead());
  check(so, 'bấm hủy phiên cũ gửi đăng nhập có cờ hủy phiên bằng thông tin đã lưu, đóng nút lại và ghi Log', [forceStart.ok, forceLoginRequest.body.force, forceLoginRequest.meta.fill.credentialRef, heartbeat.FbmSync.statusView().forceLoginOffered, heartbeat.FbmSync.loginForceRequest().code, gateLogs.slice(forceLogsBefore).some((event) => event.action === 'login_force_requested')], [true, true, 'cred-heartbeat-123', false, 'LOGIN_FORCE_NOT_OFFERED', true]);
  heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":false}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: heartbeat.FbmSync.stateRead().activeRequestId }] } });
  check(so, 'đã hủy phiên cũ mà FBM vẫn báo sai mật khẩu thì nói đúng như vậy và không mở lại nút hủy phiên', [heartbeat.FbmSync.stateRead().message.indexOf('Hủy phiên cũ rồi đăng nhập không thành công: FBM báo sai tên đăng nhập hoặc mật khẩu') === 0, heartbeat.FbmSync.statusView().forceLoginOffered], [true, false]);
  const throttleText = heartbeat.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_THROTTLED', { retryAt: new Date(2026, 9, 7, 16, 48).getTime() }, heartbeat.FbmSync.loginAttemptRead().lastError);
  check(so, 'thông báo chờ chu kỳ nêu giờ được thử lại, lý do lần trước và cách kiểm tra ngay', [throttleText.indexOf('sau 16:48') > 0, throttleText.indexOf('Lý do lần trước: FBM báo sai tên đăng nhập') > 0, throttleText.indexOf('Đăng nhập thử') > 0], [true, true, true]);
  heartbeat.FbmSync.statePatch({ phase: 'paused', loginForceOffered: true, activeRequestId: '', deadlineAt: 0 });
  const forceAgain = heartbeat.FbmSync.loginForceRequest();
  const forceLogin = quaTrang((reply) => heartbeat.FbmSync.continue(reply), forceAgain.request);
  const forceAuthorize = heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: forceLogin.request.id }] } });
  const forceIdentity = heartbeat.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: forceAuthorize.request.id }] } });
  check(so, 'hủy phiên cũ và đăng nhập đúng tài khoản đã liên kết thì báo thành công, mở lại quyền tự đăng nhập ngay và ghi Log', [forceIdentity.code, heartbeat.FbmSync.stateRead().message.indexOf('Đã hủy phiên cũ và đăng nhập') === 0, congVao(heartbeat.FbmSync).ok, gateLogs.some((event) => event.action === 'login_force_ok')], ['LOGIN_OK', true, true, true]);
  const logsBeforeAuthorize = gateLogs.length;
  const authorizeFalse = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'authorize' }, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":null}}' }, { session: { expired: true } });
  const authorizeLog = gateLogs.slice(logsBeforeAuthorize).filter((event) => event.action === 'login_identity_failure')[0] || {};
  check(so, 'xin mã xác thực sau đăng nhập hỏng thì ghi lý do cho lần chờ sau và ghi dấu hiệu response an toàn vào Log, không lộ tên trường nhạy cảm', [authorizeFalse.code, heartbeat.FbmSync.loginConfigPublic().lastError, authorizeLog.detail && authorizeLog.detail.response], ['LOGIN_IDENTITY_AUTHORIZE_FAILED', 'FBM không trả mã xác thực để kiểm tra tài khoản sau đăng nhập.', { httpStatus: 200, responseLength: 38, json: true, dType: 'object', dKeys: 'Rows', deniedFlag: true }]);
  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 1 });
  const blockedAuto = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' }, afterLogin: { cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, phase: 'pull_customer', entity: 'customer' } }, { ok: true, status: 200, body: '{"d":"Duplicate"}' }, { origin: 'background', session: { expired: true, identityVerified: false, sessionId: '', identitySessionId: '' }, metadata: { sessionGate: {} } });
  check(so, 'FBM chặn vì còn phiên cũ: tách khỏi sai mật khẩu, không tắt và không ngừng tự đăng nhập, lượt đóng lỗi chứ không giữ lượt chờ', [blockedAuto.code, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().cursor.kind, docPhan(heartbeat, 'loginPolicy').enabled, heartbeat.FbmSync.loginConfigRead().loginHalted, heartbeat.FbmSync.runInProgress(heartbeat.FbmSync.stateRead())], ['AUTO_LOGIN_FAILED', 'error', undefined, true, false, false]);
  // Lần hỏi nền sau là lượt mới: response báo chưa xác thực thì probe; chưa hết chu kỳ thử lại thì lượt kết thúc, không gửi lệnh đăng nhập.
  const unauthBody = '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}';
  // Lần đăng nhập vừa bị chặn được ghi là lần thử gần nhất (thực tế do beginAutoLogin ghi trước khi gửi lệnh).
  const justTried = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  justTried.lastAttemptAt = Date.now();
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(justTried);
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const withinCycle = hoiNen(heartbeat);
  const withinCycleEnd = noiNen(heartbeat, { ok: true, status: 200, body: unauthBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: withinCycle.request.id }] } });
  check(so, 'Chưa hết chu kỳ thử lại: lượt nền mới thấy phiên chết thì kết thúc AUTO_LOGIN_THROTTLED, không gửi lệnh đăng nhập', [withinCycle.request.meta.kind, withinCycleEnd.code, withinCycleEnd.request, heartbeat.FbmSync.runInProgress(heartbeat.FbmSync.stateRead())], ['session_probe', 'AUTO_LOGIN_THROTTLED', null, false]);
  const blockedConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  blockedConfig.lastAttemptAt = Date.now() - 10 * 1000; blockedConfig.loginHalted = true; blockedConfig.lastError = 'Lý do cũ';
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(blockedConfig);
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const afterCycle = hoiNen(heartbeat);
  const afterCycleIdentity = noiNen(heartbeat, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: afterCycle.request.id }] } });
  const afterCycleLive = noiNen(heartbeat, { d: { TotalRowCount: 2 }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: afterCycleIdentity.request && afterCycleIdentity.request.id }] } });
  const unlocked = heartbeat.FbmSync.loginConfigRead();
  check(so, 'Đang khóa chờ, ngừng tự đăng nhập mà người dùng tự đăng nhập: probe xác minh gỡ hết khóa, đếm khách, lệch mốc thì mở Quét nhanh, không gửi lệnh đăng nhập', [afterCycle.request.meta.kind, afterCycleIdentity.request && afterCycleIdentity.request.meta.kind, afterCycleLive.ok, afterCycleLive.request && afterCycleLive.request.meta.kind, congVao(heartbeat.FbmSync).ok, unlocked.loginHalted, unlocked.lastError], ['session_probe', 'customer_count', true, 'session_probe', true, false, '']);
  heartbeat.FbmSync.statePatch({ phase: 'done', cursor: {}, activeRequestId: '', deadlineAt: 0, process: '' });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const afterCycleDead = hoiNen(heartbeat);
  const afterCycleLogin = noiNen(heartbeat, { ok: true, status: 200, body: unauthBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: afterCycleDead.request.id }] } });
  check(so, 'Khóa đã gỡ mà người dùng đăng xuất: cấp lệnh đăng nhập ngay; lý do đường truyền ghi từ lúc gửi nên hỏng giữa đường vẫn có lý do', [afterCycleDead.request && afterCycleDead.request.meta.kind, afterCycleLogin.ok, afterCycleLogin.request && afterCycleLogin.request.meta.kind, heartbeat.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_THROTTLED', null, heartbeat.FbmSync.loginAttemptRead().lastError).indexOf('Lý do lần trước: ' + heartbeat.FbmSync.LOGIN_REPLIES.transport.text) >= 0], ['session_probe', true, 'login_step', true]);
  // Sau đăng nhập, liên kết (ở đây là bản nháp của đăng nhập thử) cũng phải khớp cả trang FBM vừa mở.
  const loginPageCursor = { purpose: 'test', step: 'identity', expectedIdentity: { spreadsheetId: 'sheet-test', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } };
  const loginPageWrong = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Nguoi khac' } } });
  const loginPageEmpty = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG } });
  const loginPageEmptyCursor = heartbeat.FbmSync.stateRead().cursor;
  const loginPageStillEmpty = heartbeat.FbmSync.stageRun(heartbeat.FbmSync.cursorTable('login'), heartbeat.FbmSync.stateRead(), { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG } });
  check(so, 'Sau đăng nhập: trang FBM lệch thì LOGIN_IDENTITY_MISMATCH; trang thiếu thì đọc lại grid User kèm lệnh tải trang khách hàng, vẫn thiếu thì FBM_PAGE_IDENTITY_MISSING', [
    loginPageWrong.code, loginPageEmpty.ok, loginPageEmpty.request && loginPageEmpty.request.meta.kind, loginPageEmpty.request && loginPageEmpty.request.meta.reloadFbmPage, loginPageEmptyCursor.pageReloaded, loginPageStillEmpty.code
  ], ['LOGIN_IDENTITY_MISMATCH', true, 'identity_user_grid', 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', true, 'FBM_PAGE_IDENTITY_MISSING']);
  // Lần tự đăng nhập vừa hỏng đặt khóa chờ; người dùng bấm "Đăng nhập thử" thành công thì nền phải tự đăng nhập lại được ngay (lời báo khóa chờ hướng dẫn đúng việc này; gặp thật 2026-10-31).
  const throttledConfig = JSON.parse(heartbeatData.FBM_LOGIN_ATTEMPT_V1);
  throttledConfig.lastAttemptAt = Date.now() - 10 * 1000; throttledConfig.lastLoginAt = throttledConfig.lastAttemptAt - 60 * 1000;
  heartbeatData.FBM_LOGIN_ATTEMPT_V1 = JSON.stringify(throttledConfig);
  const throttledBefore = congVao(heartbeat.FbmSync).code;
  nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Nguoi khac' } } });
  const throttledAfterMismatch = congVao(heartbeat.FbmSync).code;
  const testLoginOk = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Le Tuan Anh' } } });
  check(so, 'Đăng nhập thử thành công gỡ khóa chờ của lần tự đăng nhập hỏng trước đó; đăng nhập thử lệch tài khoản thì không gỡ', [
    throttledBefore, throttledAfterMismatch, testLoginOk.code, congVao(heartbeat.FbmSync).ok, heartbeat.FbmSync.loginConfigRead().nextRetryAt
  ], ['AUTO_LOGIN_THROTTLED', 'AUTO_LOGIN_THROTTLED', 'LOGIN_OK', true, 0]);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const policy = datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: true, retryEnabled: false, retryMinutes: 45 });
  check(so, 'chinh sach auto-login chi luu mot noi va cong khai dung metadata', [policy.autoOpenTab, policy.retryEnabled, policy.retryMinutes, heartbeat.FbmSync.loginConfigRead().envelope.ciphertext], [true, false, 45, 'ciphertext-long-enough']);
  const credentialUpdate = heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-456', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  const credentialPolicy = docPhan(heartbeat, 'loginPolicy');
  check(so, 'lưu lại credential không đặt lại chính sách tự mở tab và retry', [credentialUpdate.ok, credentialPolicy.autoOpenTab, credentialPolicy.retryEnabled, credentialPolicy.retryMinutes], [true, true, false, 45]);
  datPhan(heartbeat, 'loginPolicy', { enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 45 });
  check(so, 'tat muc cha thi tuy chon tu mo tab khong con hieu luc', heartbeat.FbmSync.transportPolicy().autoOpenTab, false);

  const connectionData = {};
  let failLoginWrite = false;
  const connectionProps = taoKhoThuocTinh(connectionData), connectionSet = connectionProps.setProperty;
  connectionProps.setProperty = (key, value) => { if (failLoginWrite && key === 'FBM_CREDENTIAL_V1') { throw new Error('LOGIN_WRITE_FAILED'); } return connectionSet(key, value); }; const connectionDelete = connectionProps.deleteProperty; connectionProps.deleteProperty = (key) => { if (failLoginWrite && key === 'FBM_CREDENTIAL_V1') { throw new Error('LOGIN_WRITE_FAILED'); } return connectionDelete(key); };
  const connection = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => connectionProps }, shinOpenBook: () => ({ getId: () => 'sheet-connection' }) });
  napServer(connection, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  connection.FbmSync.configValue = () => '';
  connection.FbmSync.readLocal = () => [];
  const incompleteBinding = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: '' }, credential: { mode: 'preserve' } });
  const mismatchedSheet = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-other', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'preserve' } });
  const invalidMode = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'unknown' } });
  const credentialWithoutBinding = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'save', credentialRef: 'cred-save-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } } });
  check(so, 'connection validation chặn thiếu identity, sai Spreadsheet, mode lạ và credential không có binding', [incompleteBinding.code, mismatchedSheet.code, invalidMode.code, credentialWithoutBinding.code], ['IDENTITY_BINDING_INCOMPLETE', 'SPREADSHEET_MISMATCH', 'LOGIN_CREDENTIAL_MODE_INVALID', 'IDENTITY_BINDING_REQUIRED']);
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  const usernameMismatch = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'save', credentialRef: 'cred-save-999', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERB' } } });
  check(so, 'connection cho lưu credential có username lệch identity sau khi Sidebar đã xác nhận', [usernameMismatch.ok, connection.FbmSync.loginConfigPublic().public.usernameHint], [true, 'USERB']);
  const preserved = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'preserve' } });
  check(so, 'connection save giu credential khi identity khong doi', [preserved.ok, connection.FbmSync.loginConfigPublic().configured], [true, true]);
  const changedWithoutCredential = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }, credential: { mode: 'preserve' } });
  check(so, 'doi identity khong co credential moi thi xoa credential cu', [changedWithoutCredential.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigPublic().configured], [true, 'user-b', false]);
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-456', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  failLoginWrite = true;
  const rollback = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }, credential: { mode: 'clear' } });
  failLoginWrite = false;
  check(so, 'credential loi thi connection save rollback ca binding va login config', [rollback.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigRead().credentialRef], [false, 'user-a', 'cred-connection-456']);

  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-789', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  failLoginWrite = true;
  const saveCredentialFailure = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-c', username: 'USERC', accountName: 'Tai khoan C' }, credential: { mode: 'save', credentialRef: 'cred-save-fail', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERC' } } });
  failLoginWrite = false;
  check(so, 'lỗi mã hóa/lưu credential không ghi nửa chừng và giữ identity cũ', [saveCredentialFailure.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigRead().credentialRef], [false, 'user-a', 'cred-connection-789']);
  const clearedConnection = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'preserve' } });
  check(so, 'bỏ toàn bộ identity đồng thời xóa credential cũ và trạng thái đăng nhập', [clearedConnection.ok, connection.FbmSync.bindingRead().spreadsheetId || '', connection.FbmSync.loginConfigPublic().configured], [true, '', false]);

  // Không đọc được file thì ném, không lưu liên kết khi chưa so được Spreadsheet.
  const savedBook = connection.shinOpenBook;
  connection.shinOpenBook = () => { throw new Error('Exception: Service Spreadsheets timed out'); };
  let bookError = '';
  try { connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-other', userId: 'user-x', username: 'USERX', accountName: 'Tai khoan X' }); } catch (err) { bookError = String(err && err.message); }
  connection.shinOpenBook = savedBook;
  check(so, 'không đọc được Spreadsheet ID thì lưu liên kết ném lỗi thật, không bỏ qua phép so Spreadsheet', [/timed out/.test(bookError), connection.FbmSync.bindingRead().spreadsheetId || ''], [true, '']);
  // Kho kết nối hỏng: báo lỗi qua cửa đọc JSON và không ghi gì, không coi như chưa từng liên kết.
  const connectionLogs = [];
  connection.logEvent = (event) => connectionLogs.push(event);
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  const connectionGood = connectionData.FBM_CONNECTION_V1;
  connectionData.FBM_CONNECTION_V1 = '{hỏng';
  let corruptCode = '';
  try { connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-d', username: 'USERD', accountName: 'Tai khoan D' }, credential: { mode: 'preserve' } }); } catch (err) { corruptCode = err.code; }
  check(so, 'kho kết nối hỏng thì lưu liên kết ném DOCUMENT_PROPERTY_CORRUPT, không ghi đè kho hỏng', [corruptCode, connectionData.FBM_CONNECTION_V1], ['DOCUMENT_PROPERTY_CORRUPT', '{hỏng']);
  connectionData.FBM_CONNECTION_V1 = connectionGood;
  // Khôi phục cũng hỏng: báo rõ trạng thái có thể nửa cũ nửa mới, không báo như đã khôi phục.
  connectionLogs.length = 0;
  failLoginWrite = true;
  // Lần ghi kho kết nối thứ hai là lần khôi phục bản cũ: cho nó hỏng.
  const savedSet = connectionProps.setProperty;
  let connectionWrites = 0;
  connectionProps.setProperty = (key, value) => { if (key === 'FBM_CONNECTION_V1' && ++connectionWrites === 2) { throw new Error('ROLLBACK_FAILED'); } return savedSet(key, value); };
  const rollbackBroken = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-e', username: 'USERE', accountName: 'Tai khoan E' }, credential: { mode: 'save', credentialRef: 'cred-save-e', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERE' } } });
  connectionProps.setProperty = savedSet;
  failLoginWrite = false;
  check(so, 'khôi phục sau lỗi lưu liên kết cũng hỏng thì trả mã riêng, nêu cả hai lỗi và ghi Log', [rollbackBroken.code, /ROLLBACK_FAILED/.test(rollbackBroken.message), connectionLogs.map((e) => e.detail.code)], ['CONNECTION_ROLLBACK_FAILED', true, ['CONNECTION_ROLLBACK_FAILED']]);

  const clearData = {};
  const clearProps = taoKhoThuocTinh(clearData);
  const cleared = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => clearProps }, shinOpenBook: () => ({ getId: () => 'sheet-clear' }) });
  napServer(cleared, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  cleared.FbmSync.configValue = () => '';
  cleared.FbmSync.readLocal = () => [{ id: 'CUS-OLD', fbmId: 'FBM-OLD' }];
  cleared.FbmSync.bindingWrite({ spreadsheetId: 'sheet-clear', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  cleared.FbmSync.bindingWrite({});
  const clearThenRebind = cleared.FbmSync.bindingWrite({ spreadsheetId: 'sheet-clear', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' });
  check(so, 'clear A roi save B van bi chan khi con du lieu lien ket', [clearThenRebind.ok, clearThenRebind.code], [false, 'REBIND_REQUIRED']);

  // Gặp thật 2026-10-20 00:04: lượt nền mở lượt mới (xóa phiên) rồi hỏng ở request đầu, Giữ phiên 5 phút sau ném "thiếu mã người dùng FBM" vì không qua bước kiểm tra phiên. Giữ phiên phải probe trước, rồi lọc quyền theo mã đọc từ grid User, không theo liên kết hay cookie.
  const afterWipeData = { FBM_SYNC_PROCESS_BOOK_V1: JSON.stringify({ customerFull: { doneAt: Date.now() }, activityFull: { doneAt: Date.now() }, detail: { doneAt: Date.now() } }) };
  const afterWipeProps = taoKhoThuocTinh(afterWipeData);
  const afterWipe = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => afterWipeProps, getScriptProperties: () => afterWipeProps }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, shinOpenBook: () => ({ getId: () => 'sheet-wipe' }) });
  napServer(afterWipe, 'fbm_sync/control/ControlPort.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/auth/LoginTools.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/auth/LoginRun.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  afterWipe.FbmSync.configValue = () => '';
  afterWipe.FbmSync.readLocal = () => [];
  afterWipe.FbmSync.bindingWrite({ spreadsheetId: 'sheet-wipe', userId: '7777', username: 'WIPE', accountName: 'Tai khoan wipe' });
  afterWipe.FbmSync.runOpen({ phase: 'error' });
  afterWipe.FbmSync.statePatch({ session: Object.assign(afterWipe.FbmSync.stateRead().session, { cookie: '461099999855cFHN_CRM_App' }) });
  vaSoNen(afterWipe.FbmSync, { heartbeat: { doneAt: 1 } });
  const wipedSession = afterWipe.FbmSync.stateRead().session;
  const afterWipeHeartbeat = hoiNen(afterWipe);
  const wipeProbeBody = JSON.stringify({ d: { TotalRowCount: 1, Rows: [[7777, 'WIPE', 'Tai khoan wipe']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
  const afterWipeCount = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '7777', pageAccountName: 'Tai khoan wipe' }, trace: [{ requestId: afterWipeHeartbeat.request.id }] } });
  const wipedKeys = JSON.stringify(afterWipeCount.request && afterWipeCount.request.body && afterWipeCount.request.body.externalKey || []);
  check(so, 'Giữ phiên sau lượt bị xóa phiên: request đầu là probe User, sau probe mới dựng request đếm khách, lọc quyền theo mã đọc từ grid User (không theo mã đoán từ cookie)', [
    wipedSession.userId, afterWipeHeartbeat.ok, afterWipeHeartbeat.request && afterWipeHeartbeat.request.meta.kind, afterWipeCount.ok, afterWipeCount.request && afterWipeCount.request.meta.kind, wipedKeys.indexOf("GetCustomerValidate('7777')") >= 0, wipedKeys.indexOf("GetCustomerValidate('9999')") >= 0
  ], ['', true, 'session_probe', true, 'customer_count', true, false]);

  // Liên kết phải khớp cả grid User lẫn trang FBM (mã trong payload cookie, tên đầy đủ trong khối menu); hai nơi so với liên kết, không so với nhau.
  const pageRound = (captures) => {
    afterWipe.FbmSync.runOpen({ phase: 'error' });
    vaSoNen(afterWipe.FbmSync, { heartbeat: { doneAt: 1 } });
    const opened = hoiNen(afterWipe);
    return { opened, reply: noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures, trace: [{ requestId: opened.request.id }] } }) };
  };
  const pageMismatch = pageRound({ pageUserId: '9999', pageAccountName: 'Tai khoan wipe' }).reply;
  const nameMismatch = pageRound({ pageUserId: '7777', pageAccountName: 'Nguoi khac' }).reply;
  check(so, 'Trang FBM lệch liên kết (mã hoặc tên) dù grid User khớp: dừng SESSION_IDENTITY_MISMATCH, không dựng request đọc khách, phiên không được xác minh', [
    pageMismatch.ok, pageMismatch.code, pageMismatch.request, nameMismatch.code, nameMismatch.request, afterWipe.FbmSync.sessionIdentityIsVerified(afterWipe.FbmSync.stateRead())
  ], [false, 'SESSION_IDENTITY_MISMATCH', null, 'SESSION_IDENTITY_MISMATCH', null, false]);
  const pageEmpty = pageRound({});
  const pageStillEmpty = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: pageEmpty.reply.request.id }] } });
  check(so, 'Trang FBM thiếu mã và tên: GAS phát lại probe kèm lệnh tải tab về trang khách hàng; tải lại vẫn thiếu thì dừng FBM_PAGE_IDENTITY_MISSING, không tải lại mãi', [
    pageEmpty.reply.ok, pageEmpty.reply.request.meta.kind, pageEmpty.reply.request.meta.reloadFbmPage, pageStillEmpty.ok, pageStillEmpty.code, pageStillEmpty.request
  ], [true, 'session_probe', 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', false, 'FBM_PAGE_IDENTITY_MISSING', null]);
  const pageAfterReload = pageRound({});
  const pageReloadedOk = noiNen(afterWipe, { ok: true, status: 200, body: wipeProbeBody, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '7777', pageAccountName: 'Tai khoan wipe' }, trace: [{ requestId: pageAfterReload.reply.request.id }] } });
  check(so, 'Tải lại trang xong có đủ mã và tên khớp liên kết: phiên được xác minh, Giữ phiên dựng request đếm khách, request không còn lệnh tải lại', [
    pageReloadedOk.ok, pageReloadedOk.request && pageReloadedOk.request.meta.kind, pageReloadedOk.request && pageReloadedOk.request.meta.reloadFbmPage
  ], [true, 'customer_count', undefined]);
  // Nơi bắt giá trị trên trang: FBM có thể đặt dấu nháy dạng \" trong script, pattern phải bắt cả hai dạng (Nghiên cứu FBM ch02).
  const pageCaptures = afterWipe.FbmSync.payloadCookieTransport().captures, pageHtml = String.raw`<script>x={\"cookie\":\"50202037a947fFHN_CRM_App\"}</script><script>m={"username":"Lê Tuấn Anh","items":[]}</script>`;
  const pagePick = (name) => { const c = pageCaptures.find((item) => item.name === name); const m = pageHtml.match(new RegExp(c.pattern, c.flags)); return m && m[c.group]; };
  check(so, 'Pattern trang FBM: mã người dùng giữa 4 ký tự đầu và 5 ký tự cuối của payload cookie, tên đầy đủ trong khối menu', [pagePick('payloadCookie'), pagePick('pageUserId'), pagePick('pageAccountName')], ['50202037a947fFHN_CRM_App', '2037', 'Lê Tuấn Anh']);
}

module.exports = { chay };
