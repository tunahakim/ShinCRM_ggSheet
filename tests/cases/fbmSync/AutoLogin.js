/** Kiểm tra cấu hình envelope và phục hồi cursor auto-login phía GAS. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');

async function chay(so) {
  section('FBM sync - auto-login');
  const data = {};
  const props = { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, logEvent() {}, LOG_OK: 'ok', LOG_ERROR: 'error' });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/auth/AutoLogin.js');
  check(so, 'auto-login mặc định bật nhưng chưa cấu hình', [hop.FbmSync.loginConfigPublic().enabled, hop.FbmSync.loginConfigPublic().configured], [true, false]);
  const invalid = hop.FbmSync.loginConfigSave({ credentialRef: 'cred-invalid', envelope: { iv: 'short', ciphertext: 'short' } });
  check(so, 'envelope thiếu độ dài bị từ chối', invalid.code, 'LOGIN_ENVELOPE_INVALID');
  const saved = hop.FbmSync.loginConfigSave({ credentialRef: 'cred-test-1234', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  check(so, 'lưu envelope chỉ trả metadata công khai và username đầy đủ', [saved.ok, saved.public.usernameHint, saved.envelope, JSON.stringify(data.FBM_LOGIN_CONFIG_V1).includes('password')], [true, 'anhlt', undefined, false]);
  check(so, 'đọc cấu hình không trả ciphertext ra Sidebar', [hop.FbmSync.loginConfigPublic().configured, hop.FbmSync.loginConfigPublic().envelope], [true, undefined]);
  const state = hop.FbmSync.stateStart('', 'pull_customer', 1);
  state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }; hop.FbmSync.stateWrite(state);
  const login = hop.FbmSync.beginAutoLogin(hop.FbmSync.stateRead(), state.cursor);
  check(so, 'hết phiên tạo request login và giữ cursor cũ', [login.meta.kind, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.resumeCursor.pageIndex], ['login', 'login', 2]);
  check(so, 'auto-login chỉ thử lại một lần trong 30 phút', hop.FbmSync.autoLoginCanAttempt(Date.now() + 1000).code, 'AUTO_LOGIN_THROTTLED');
  const resumed = hop.FbmSync.loginResumeRequest(hop.FbmSync.stateRead());
  check(so, 'login thành công dựng lại request grid theo cursor', [resumed.meta.kind, resumed.body.gridPageIndex, hop.FbmSync.stateRead().session.expired], ['grid', 2, false]);
  check(so, 'login test không coi Login.aspx là thành công', hop.FbmSync.protocol.isSessionExpired({ ok: true, status: 200, body: '<form action="Login.aspx"></form>' }), true);
  const heartbeatData = {};
  const heartbeatProps = { getProperty: (key) => heartbeatData[key] || null, setProperty: (key, value) => { heartbeatData[key] = String(value); } };
  const heartbeat = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => heartbeatProps, getScriptProperties: () => heartbeatProps }, LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, shinOpenBook: () => ({ getId: () => 'sheet-test' }) });
  napServer(heartbeat, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/auth/AutoLogin.js', 'fbm_sync/transport/PullFlow.js');
  heartbeat.FbmSync.configValue = () => '';
  heartbeat.FbmSync.readLocal = () => [];
  heartbeat.FbmSync.bindingWrite({ spreadsheetId: 'sheet-test', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-123', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  heartbeat.FbmSync.stateStart('', 'idle', 0);
  heartbeat.FbmSync.statePatch({ session: { expired: true } });
  heartbeatData.FBM_SYNC_NEXT_HEARTBEAT = String(Date.now() - 1000);
  const autoLoginRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'heartbeat het phien cap login request mot lan', [autoLoginRequest.ok, autoLoginRequest.code, autoLoginRequest.request.meta.kind, autoLoginRequest.request.meta.testOnly], [true, 'AUTO_LOGIN_REQUEST_READY', 'login', false]);
  const loginResponse = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":true}', transport: { payloadCookie: '461020379855cFHN_CRM_App', trace: [{ requestId: autoLoginRequest.request.id }] } });
  check(so, 'login adapter thanh cong van phai authorize truoc', [loginResponse.ok, loginResponse.request.meta.kind, loginResponse.request.meta.entity], [true, 'authorize', 'customer']);
  const authorizeResponse = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { trace: [{ requestId: loginResponse.request.id }] } });
  check(so, 'sau authorize GAS cap User grid de xac minh identity', [authorizeResponse.ok, authorizeResponse.request.meta.kind, authorizeResponse.request.body.controller], [true, 'identity_user_grid', 'User']);
  const userResponse = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[2037,"ANHLT","Le Tuan Anh"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { trace: [{ requestId: authorizeResponse.request.id }] } });
  check(so, 'chi identity khop moi tiep tuc heartbeat', [userResponse.ok, userResponse.code, userResponse.request.meta.kind, heartbeat.FbmSync.stateRead().session.accountUsername, heartbeat.FbmSync.stateRead().session.accountName], [true, 'AUTO_LOGIN_OK', 'heartbeat', 'ANHLT', 'Le Tuan Anh']);

  const gateLogs = [];
  let gateFlushes = 0;
  heartbeat.logEvent = (event) => gateLogs.push(event);
  heartbeat.flushLog = () => { gateFlushes += 1; };
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: false } });
  const validRead = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/read', body: { read: true }, meta: { kind: 'valid_read' } });
  heartbeat.FbmSync.statePatch({ activeRequestId: '', phase: 'push', mode: 'push', cursor: { kind: 'customer_edit_save' }, session: { expired: false } });
  const validWrite = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/write', body: { write: true }, meta: { kind: 'valid_write' } });
  check(so, 'session hop le khong doi hanh vi ca doc va ghi', [validRead.meta.kind, validWrite.meta.kind, validRead.meta.openFbmContext, validWrite.meta.openFbmContext, gateLogs.length], ['valid_read', 'valid_write', undefined, undefined, 0]);

  heartbeat.FbmSync.loginConfigPolicySave({ enabled: false, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'closed-gate', phase: 'checking_session', mode: 'read', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: true }, lastFailureCode: '', lastError: '' });
  const closedGate = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/blocked', body: {}, meta: { kind: 'blocked_read' } });
  check(so, 'cổng fail-closed khi tự đăng nhập tắt', [closedGate, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, gateLogs.some((event) => event.action === 'session_gate_blocked'), gateFlushes > 0], [null, 'paused', 'AUTO_LOGIN_NOT_CONFIGURED', true, true]);

  heartbeat.FbmSync.statePatch({ runId: 'write-expired', phase: 'push', mode: 'push', cursor: { kind: 'push_wait', operation: 'customer_edit_save' }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  const blockedWrite = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/write-blocked', body: {}, meta: { kind: 'customer_edit_save' } });
  check(so, 'request ghi khong duoc tu dong gui lai khi session het han', [blockedWrite, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().phase], [null, 'SESSION_EXPIRED_AT_WRITE', 'paused']);

  heartbeat.FbmSync.loginConfigPolicySave({ enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'login-flight', phase: 'checking_session', mode: 'read', cursor: { kind: 'login', credentialRef: 'cred-heartbeat-123' }, activeRequestId: 'login-flight-request', deadlineAt: Date.now() + 1000, session: { expired: true } });
  const concurrentGate = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/second', body: {}, meta: { kind: 'second_request' } });
  check(so, 'hai luong phat hien mat session chi giu mot tien trinh login', [concurrentGate, heartbeat.FbmSync.stateRead().lastFailureCode, heartbeat.FbmSync.stateRead().activeRequestId], [null, 'AUTO_LOGIN_IN_PROGRESS', 'login-flight-request']);

  heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-123', enabled: true, autoOpenTab: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  heartbeat.FbmSync.statePatch({ runId: 'no-tab-run', phase: 'checking_session', mode: 'read', cursor: { kind: 'heartbeat' }, activeRequestId: 'tab-request-1', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabRetry = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: 'tab-request-1', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  const retryId = noTabRetry.request && noTabRetry.request.id;
  const noTabFinal = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: retryId, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'no-tab chi retry mot lan theo policy va co log loi', [noTabRetry.ok, noTabRetry.code, noTabRetry.request.meta.openFbmContext !== undefined, noTabFinal.ok, noTabFinal.code, heartbeat.FbmSync.stateRead().phase, gateLogs.filter((event) => event.action === 'transport_retry' || event.action === 'transport_failure').length >= 2], [true, 'FBM_TAB_RETRY_REQUEST_READY', true, false, 'FBM_TAB_NOT_FOUND', 'error', true]);
  heartbeat.FbmSync.loginConfigPolicySave({ enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'no-tab-closed', phase: 'checking_session', cursor: { kind: 'heartbeat' }, activeRequestId: 'tab-request-closed', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const noTabClosed = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: 'tab-request-closed', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'no-tab bi chan ngay khi policy tu mo tab tat', [noTabClosed.ok, noTabClosed.request, noTabClosed.code, heartbeat.FbmSync.stateRead().phase], [false, null, 'FBM_TAB_NOT_FOUND', 'error']);
  check(so, 'log session gate khong chua bi mat hoac payload nhay cam', /password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs)), false);

  const savedConfig = JSON.parse(heartbeatData.FBM_LOGIN_CONFIG_V1);
  savedConfig.lastAttemptAt = Date.now() - 31 * 60 * 1000;
  heartbeatData.FBM_LOGIN_CONFIG_V1 = JSON.stringify(savedConfig);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: true, cookie: '' } });
  heartbeatData.FBM_SYNC_NEXT_HEARTBEAT = String(Date.now() - 1000);
  const failedLoginRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  const failedLogin = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":false}', trace: [{ requestId: failedLoginRequest.request.id }] });
  check(so, 'login heartbeat that bai tam dung va khong lap ngay', [failedLogin.ok, failedLogin.code, failedLogin.request, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'login_failure')], [false, 'AUTO_LOGIN_FAILED', null, 'paused', true]);
  const throttledAfterFailure = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'login that bai khong tu chay khi chua den lich', [throttledAfterFailure.ok, throttledAfterFailure.code, throttledAfterFailure.request], [true, 'NO_PROCESS_DUE', null]);
  heartbeatData.FBM_SYNC_NEXT_HEARTBEAT = String(Date.now() - 1000);
  heartbeat.FbmSync.statePatch({ scheduledScan: 'heartbeat' });
  const throttledDue = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'login that bai bi throttle toi da mot lan moi 30 phut khi den lich', [throttledDue.ok, throttledDue.code, throttledDue.request], [true, 'AUTO_LOGIN_THROTTLED', null]);

  const expiredConfig = JSON.parse(heartbeatData.FBM_LOGIN_CONFIG_V1);
  expiredConfig.lastAttemptAt = Date.now() - 31 * 60 * 1000;
  expiredConfig.nextRetryAt = 0;
  heartbeatData.FBM_LOGIN_CONFIG_V1 = JSON.stringify(expiredConfig);
  heartbeat.FbmSync.statePatch({ runId: 'expired-401', phase: 'pull_customer', mode: 'read', entity: 'customer', cursor: { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] }, activeRequestId: 'expired-401-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const expired401 = heartbeat.FbmSync.continue({ ok: false, status: 401, body: '', transport: { trace: [{ requestId: 'expired-401-request' }] } });
  check(so, 'FBM 401 di qua cong session va bat dau auto-login mot lan', [expired401.ok, expired401.request.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind, gateLogs.some((event) => event.action === 'session_expired')], [true, 'login', 'login', true]);

  heartbeat.FbmSync.loginConfigPolicySave({ enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'network-failure', phase: 'checking_session', mode: 'read', cursor: { kind: 'heartbeat' }, activeRequestId: 'network-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const networkFailure = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: 'network-request', code: 'FBM_TRANSPORT_UNAVAILABLE', message: 'Relay timeout.' });
  check(so, 'loi mang transport ket thuc huu han va van ghi Log khi Sidebar dong', [networkFailure.ok, networkFailure.code, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'transport_failure'), gateFlushes > 0], [false, 'FBM_TRANSPORT_UNAVAILABLE', 'error', true, true]);

  const savedLoginConfigRead = heartbeat.FbmSync.loginConfigRead;
  heartbeat.FbmSync.loginConfigRead = () => { throw new Error('secret-internal'); };
  heartbeat.FbmSync.statePatch({ runId: 'gate-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'heartbeat' }, activeRequestId: '', deadlineAt: 0, session: { expired: true } });
  const gateException = heartbeat.FbmSync.nextEnvelope({ url: 'https://fbm.test/gate-exception', body: {}, meta: { kind: 'gate_exception_read' } });
  check(so, 'exception noi bo cong fail-closed va ghi loi an toan', [gateException, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().lastFailureCode, gateLogs.some((event) => event.action === 'session_gate_exception'), /secret-internal|password|cookie|envelope|authorized/i.test(JSON.stringify(gateLogs))], [null, 'error', 'FBM_SESSION_GATE_EXCEPTION', true, false]);
  heartbeat.FbmSync.statePatch({ runId: 'gate-transport-exception', phase: 'checking_session', mode: 'read', cursor: { kind: 'heartbeat' }, activeRequestId: 'gate-transport-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const gateTransportException = heartbeat.FbmSync.heartbeatTransportFailure({ requestId: 'gate-transport-request', code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'exception cong trong nhanh no-tab cung thu hoi reservation', [gateTransportException, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().activeRequestId, heartbeat.FbmSync.stateRead().lastFailureCode], [null, 'error', '', 'FBM_SESSION_GATE_EXCEPTION']);
  heartbeat.FbmSync.loginConfigRead = savedLoginConfigRead;

  const beforeTestConfig = heartbeat.FbmSync.loginConfigRead();
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const testRequest = heartbeat.FbmSync.loginTestRequest();
  check(so, 'login test khong truyen ref van dung credential da luu', [testRequest.request.meta.credentialRef, testRequest.request.meta.testOnly], ['cred-heartbeat-123', true]);
  const testFailure = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":false}', transport: { trace: [{ requestId: testRequest.request.id }] } });
  const afterTestFailure = heartbeat.FbmSync.loginConfigRead();
  check(so, 'dang nhap thu that bai khong thay doi throttle hay loi auto-login', [testFailure.code, afterTestFailure.lastAttemptAt, afterTestFailure.lastLoginAt, afterTestFailure.lastError], ['LOGIN_FAILED', beforeTestConfig.lastAttemptAt, beforeTestConfig.lastLoginAt, beforeTestConfig.lastError]);

  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const mismatchTest = heartbeat.FbmSync.loginTestRequest('cred-heartbeat-123');
  const mismatchLogin = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":true}', transport: { trace: [{ requestId: mismatchTest.request.id }] } });
  const mismatchAuthorize = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { trace: [{ requestId: mismatchLogin.request.id }] } });
  const mismatchIdentity = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[9999,"OTHER","Other User"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { trace: [{ requestId: mismatchAuthorize.request.id }] } });
  check(so, 'dang nhap thu sai identity bao loi nhung khong tu tat auto-login', [mismatchIdentity.code, heartbeat.FbmSync.loginConfigPublic().enabled], ['LOGIN_IDENTITY_MISMATCH', true]);

  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const draftB = { spreadsheetId: 'sheet-test', userId: '2040', username: 'USERB', accountName: 'Tai khoan B' };
  const draftLogin = heartbeat.FbmSync.loginTestRequest('cred-heartbeat-123', draftB);
  const draftLoginAdapter = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":true}', transport: { payloadCookie: '461020379855cFHN_CRM_App', trace: [{ requestId: draftLogin.request.id }] } });
  const draftLoginAuthorize = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { trace: [{ requestId: draftLoginAdapter.request.id }] } });
  const draftLoginIdentity = heartbeat.FbmSync.loginTestResult({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[2040,"USERB","Tai khoan B"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { trace: [{ requestId: draftLoginAuthorize.request.id }] } });
  check(so, 'login test doi chieu theo identity ban nhap B, khong ep theo binding A', [draftLoginIdentity.code, heartbeat.FbmSync.stateRead().session.accountUsername], ['LOGIN_OK', 'USERB']);
  const policy = heartbeat.FbmSync.loginConfigPolicySave({ enabled: true, autoOpenTab: true, retryEnabled: false, retryMinutes: 45 });
  check(so, 'chinh sach auto-login chi luu mot noi va cong khai dung metadata', [policy.ok, policy.autoOpenTab, policy.retryEnabled, policy.retryMinutes, heartbeat.FbmSync.loginConfigRead().envelope.ciphertext], [true, true, false, 45, 'ciphertext-long-enough']);
  const credentialUpdate = heartbeat.FbmSync.loginConfigSave({ credentialRef: 'cred-heartbeat-456', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt' } });
  const credentialPolicy = heartbeat.FbmSync.loginConfigPublic();
  check(so, 'lưu lại credential không đặt lại chính sách tự mở tab và retry', [credentialUpdate.ok, credentialPolicy.autoOpenTab, credentialPolicy.retryEnabled, credentialPolicy.retryMinutes], [true, true, false, 45]);
  heartbeat.FbmSync.loginConfigPolicySave({ enabled: false, autoOpenTab: true, retryEnabled: true, retryMinutes: 45 });
  const disabledParentLogin = heartbeat.FbmSync.loginRequest('cred-heartbeat-123', false);
  check(so, 'tat muc cha thi tuy chon tu mo tab khong con hieu luc', disabledParentLogin.meta.openFbmContext, undefined);

  const connectionData = {};
  let failLoginWrite = false;
  const connectionProps = {
    getProperty: (key) => connectionData[key] || null,
    setProperty: (key, value) => { if (failLoginWrite && key === 'FBM_LOGIN_CONFIG_V1') { throw new Error('LOGIN_WRITE_FAILED'); } connectionData[key] = String(value); },
    deleteProperty: (key) => { delete connectionData[key]; }
  };
  const connection = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => connectionProps }, shinOpenBook: () => ({ getId: () => 'sheet-connection' }) });
  napServer(connection, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/auth/AutoLogin.js');
  connection.FbmSync.configValue = () => '';
  connection.FbmSync.readLocal = () => [];
  const incompleteBinding = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: '' }, credential: { mode: 'preserve' } });
  const mismatchedSheet = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-other', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'preserve' } });
  const invalidMode = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'unknown' } });
  const credentialWithoutBinding = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'save', credentialRef: 'cred-save-123', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } } });
  check(so, 'connection validation chặn thiếu identity, sai Spreadsheet, mode lạ và credential không có binding', [incompleteBinding.code, mismatchedSheet.code, invalidMode.code, credentialWithoutBinding.code], ['IDENTITY_BINDING_INCOMPLETE', 'SPREADSHEET_MISMATCH', 'LOGIN_CREDENTIAL_MODE_INVALID', 'IDENTITY_BINDING_REQUIRED']);
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-123', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  const usernameMismatch = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'save', credentialRef: 'cred-save-999', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERB' } } });
  check(so, 'connection không nhận credential có username lệch identity', usernameMismatch.code, 'LOGIN_IDENTITY_MISMATCH');
  const preserved = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' }, credential: { mode: 'preserve' } });
  check(so, 'connection save giu credential khi identity khong doi', [preserved.ok, connection.FbmSync.loginConfigPublic().configured], [true, true]);
  const changedWithoutCredential = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }, credential: { mode: 'preserve' } });
  check(so, 'doi identity khong co credential moi thi xoa credential cu va tat auto-login', [changedWithoutCredential.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigPublic().configured, connection.FbmSync.loginConfigPublic().enabled], [true, 'user-b', false, false]);
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-456', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  failLoginWrite = true;
  const rollback = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }, credential: { mode: 'clear' } });
  failLoginWrite = false;
  check(so, 'credential loi thi connection save rollback ca binding va login config', [rollback.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigRead().credentialRef], [false, 'user-a', 'cred-connection-456']);

  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-789', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
  failLoginWrite = true;
  const saveCredentialFailure = connection.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-connection', userId: 'user-c', username: 'USERC', accountName: 'Tai khoan C' }, credential: { mode: 'save', credentialRef: 'cred-save-fail', envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERC' } } });
  failLoginWrite = false;
  check(so, 'lỗi mã hóa/lưu credential không ghi nửa chừng và giữ identity cũ', [saveCredentialFailure.ok, connection.FbmSync.bindingRead().userId, connection.FbmSync.loginConfigRead().credentialRef], [false, 'user-a', 'cred-connection-789']);
  const clearedConnection = connection.FbmSync.connectionSave({ binding: {}, credential: { mode: 'preserve' } });
  check(so, 'bỏ toàn bộ identity đồng thời xóa credential cũ và trạng thái auto-login', [clearedConnection.ok, connection.FbmSync.bindingRead().spreadsheetId || '', connection.FbmSync.loginConfigPublic().configured, connection.FbmSync.loginConfigPublic().enabled], [true, '', false, false]);

  const clearData = {};
  const clearProps = { getProperty: (key) => clearData[key] || null, setProperty: (key, value) => { clearData[key] = String(value); }, deleteProperty: (key) => { delete clearData[key]; } };
  const cleared = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => clearProps }, shinOpenBook: () => ({ getId: () => 'sheet-clear' }) });
  napServer(cleared, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Identity.js');
  cleared.FbmSync.configValue = () => '';
  cleared.FbmSync.readLocal = () => [{ id: 'CUS-OLD', fbmId: 'FBM-OLD' }];
  cleared.FbmSync.bindingWrite({ spreadsheetId: 'sheet-clear', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  cleared.FbmSync.bindingWrite({});
  const clearThenRebind = cleared.FbmSync.bindingWrite({ spreadsheetId: 'sheet-clear', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' });
  check(so, 'clear A roi save B van bi chan khi con du lieu lien ket', [clearThenRebind.ok, clearThenRebind.code], [false, 'REBIND_REQUIRED']);
}

module.exports = { chay };
