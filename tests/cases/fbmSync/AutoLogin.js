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
  const saved = hop.FbmSync.loginConfigSave({ credentialRef: 'cred-test-1234', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'an***', database: 'FHN_CRM_App', unit: 'CTY' } });
  check(so, 'lưu envelope chỉ trả metadata công khai', [saved.ok, saved.public.usernameHint, saved.envelope, JSON.stringify(data.FBM_LOGIN_CONFIG_V1).includes('password')], [true, 'an***', undefined, false]);
  check(so, 'đọc cấu hình không trả ciphertext ra Sidebar', [hop.FbmSync.loginConfigPublic().configured, hop.FbmSync.loginConfigPublic().envelope], [true, undefined]);
  const state = hop.FbmSync.stateStart('', 'pull_customer', 1);
  state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }; hop.FbmSync.stateWrite(state);
  const login = hop.FbmSync.beginAutoLogin(hop.FbmSync.stateRead(), state.cursor);
  check(so, 'hết phiên tạo request login và giữ cursor cũ', [login.meta.kind, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.resumeCursor.pageIndex], ['login', 'login', 2]);
  check(so, 'auto-login chỉ thử lại một lần trong 15 phút', hop.FbmSync.autoLoginCanAttempt(Date.now() + 1000).code, 'AUTO_LOGIN_THROTTLED');
  const resumed = hop.FbmSync.loginResumeRequest(hop.FbmSync.stateRead());
  check(so, 'login thành công dựng lại request grid theo cursor', [resumed.meta.kind, resumed.body.gridPageIndex, hop.FbmSync.stateRead().session.expired], ['grid', 2, false]);
  check(so, 'login test không coi Login.aspx là thành công', hop.FbmSync.loginTestResult({ ok: true, status: 200, body: '<form action="Login.aspx"></form>' }).ok, false);
}

module.exports = { chay };
