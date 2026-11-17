/** Kiểm probe User đầu lượt và cổng danh tính: probe mỗi lượt mới, Authorized false chuyển sang tự đăng nhập, marker phiên lệch, sai tài khoản sau đăng nhập. */
const { section, check } = require('../../lib/assert');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const { docPhan } = require('../../lib/fbm/cai-dat-thu');
const { USER_BODY, nopBuoc, dungHopGiuPhien, vaDauThu } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync - auto-login: probe đầu lượt và danh tính phiên');
  const { hop: heartbeat } = dungHopGiuPhien();
  let identityUserRequests = 0;
  const identityUserBuilder = heartbeat.FbmSync.identityUserRequest;
  heartbeat.FbmSync.identityUserRequest = function (cfg) { identityUserRequests += 1; return identityUserBuilder(cfg); };
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: false, identitySessionId: '', sessionId: '' } });
  const probeStart = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' }, heartbeat.FbmSync.stateRead()));
  const probeResponse = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: probeStart.request.id }] } }));
  check(so, 'session probe đầu lượt đọc User rồi trả lại cursor authorize',
    [probeStart.request.meta.kind, probeResponse.request.meta.kind, heartbeat.FbmSync.stateRead().session.identityVerified, heartbeat.FbmSync.stateRead().cursor.kind],
    ['session_probe', 'authorize', true, 'authorize_customer']);
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const secondStart = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' }, heartbeat.FbmSync.stateRead()));
  check(so, 'moi luot moi probe lai User du khong con cookie cu',
    [secondStart.request.meta.kind, identityUserRequests, heartbeat.FbmSync.stateRead().session.identityVerified],
    ['session_probe', 2, false]);
  check(so, 'probe User khong co payload cookie van duoc cap fallback transport tuy chon',
    [secondStart.request.body.cookie, secondStart.request.meta.transport.replacements[0].required, secondStart.request.meta.transport.replacements[0].fallback],
    ['{{FBM_PAYLOAD_COOKIE}}', false, '']);
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: 0, nextRetryAt: 0 });
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: false, identitySessionId: '', sessionId: '' } });
  const unauthenticatedProbe = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.start({ mode: 'read', origin: 'manual' }, heartbeat.FbmSync.stateRead()));
  const unauthenticatedResult = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: 0, Rows: null, Repetition: null, Aggregation: null, ViewPage: null, Authorized: false } }), transport: { contract: MA_HOP_DONG, trace: [{ requestId: unauthenticatedProbe.request.id }] } }));
  check(so, 'probe User Authorized false khong dong bo phai chuyen sang auto-login',
    [unauthenticatedResult.ok, unauthenticatedResult.request && unauthenticatedResult.request.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind],
    [true, 'login_step', 'login']);
  datState(heartbeat.FbmSync, { metadata: { autoLoginTried: false } });

  datState(heartbeat.FbmSync, { runId: 'marker-mismatch', phase: 'checking_session', cursor: { kind: 'authorize_customer' }, activeRequestId: '', deadlineAt: 0, session: { expired: false, identityVerified: true, identitySessionId: 'old-session', sessionId: 'new-session' } });
  const markerMismatch = heartbeat.FbmSync.sliceIssue(heartbeat.FbmSync.stateRead(), { url: 'https://fbm.test/marker-mismatch', body: {}, meta: { kind: 'business_request', requireIdentityProbe: true } });
  check(so, 'marker lệch session bị coi là chưa xác thực và chặn request nghiệp vụ',
    [markerMismatch.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind],
    ['session_probe', 'session']);

  const autoMismatch = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'identity', afterLogin: { cursor: { kind: 'customer_count' } } }, { ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[9999,"OTHER","Other User"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}' }, { session: { expired: false, identityVerified: true, sessionId: 'old-session', identitySessionId: 'old-session' } });
  check(so, 'auto-login sai identity fail-closed va xoa marker phien',
    [autoMismatch.code, heartbeat.FbmSync.stateRead().session.identityVerified, heartbeat.FbmSync.stateRead().session.expired, docPhan(heartbeat, 'loginPolicy').enabled],
    ['LOGIN_IDENTITY_MISMATCH', false, true, false]);
}

module.exports = { chay };
