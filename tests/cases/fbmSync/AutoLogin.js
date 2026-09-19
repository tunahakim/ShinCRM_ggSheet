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

  const savedConfig = JSON.parse(heartbeatData.FBM_LOGIN_CONFIG_V1);
  savedConfig.lastAttemptAt = Date.now() - 31 * 60 * 1000;
  heartbeatData.FBM_LOGIN_CONFIG_V1 = JSON.stringify(savedConfig);
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: true, cookie: '' } });
  heartbeatData.FBM_SYNC_NEXT_HEARTBEAT = String(Date.now() - 1000);
  const failedLoginRequest = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  const failedLogin = heartbeat.fbmSyncHeartbeat({ ok: true, status: 200, body: '{"d":false}', trace: [{ requestId: failedLoginRequest.request.id }] });
  check(so, 'login heartbeat that bai tam dung va khong lap ngay', [failedLogin.ok, failedLogin.code, failedLogin.request, heartbeat.FbmSync.stateRead().phase], [false, 'AUTO_LOGIN_FAILED', null, 'paused']);
  const throttledAfterFailure = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'login that bai khong tu chay khi chua den lich', [throttledAfterFailure.ok, throttledAfterFailure.code, throttledAfterFailure.request], [true, 'NO_PROCESS_DUE', null]);
  heartbeatData.FBM_SYNC_NEXT_HEARTBEAT = String(Date.now() - 1000);
  heartbeat.FbmSync.statePatch({ scheduledScan: 'heartbeat' });
  const throttledDue = heartbeat.fbmSyncHeartbeatRequest({ source: 'alarm' });
  check(so, 'login that bai bi throttle toi da mot lan moi 30 phut khi den lich', [throttledDue.ok, throttledDue.code, throttledDue.request], [true, 'AUTO_LOGIN_THROTTLED', null]);

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
  connection.FbmSync.bindingWrite({ spreadsheetId: 'sheet-connection', userId: 'user-a', username: 'USERA', accountName: 'Tai khoan A' });
  connection.FbmSync.loginConfigSave({ credentialRef: 'cred-connection-123', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'USERA' } });
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
