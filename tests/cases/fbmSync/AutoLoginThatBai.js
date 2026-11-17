/** Kiểm Giữ phiên khi đăng nhập thất bại: không lặp ngay, throttle theo chu kỳ, FBM 401 chỉ probe lại, probe đầu lượt hỏng mới được khởi động đăng nhập. */
const { section, check } = require('../../lib/assert');
const { datPhan, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { quaTrang, noiNen, hoiNen, dungHopGiuPhien, vaDauThu, batLogCong } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync - auto-login: đăng nhập thất bại và throttle');
  const { hop: heartbeat } = dungHopGiuPhien();
  const gateLogs = batLogCong(heartbeat);
  /** Phiên đã chết: request đầu (probe, vì phiên chưa xác minh) nhận 401, probe lại xác nhận FBM báo chưa xác thực. */
  const phienChet = (sent) => {
    const probe = noiNen(heartbeat, { ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: sent.request.id }] } });
    return probe.request && probe.request.meta.kind === 'session_probe' ? noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":[]}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: probe.request.id }] } }) : probe;
  };
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: Date.now() - 31 * 60 * 1000 });
  heartbeat.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: true, cookie: '' } });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const failedLoginProbe = hoiNen(heartbeat);
  const failedLoginRequest = phienChet(failedLoginProbe);
  const failedLogin = quaTrang((reply) => noiNen(heartbeat, reply), failedLoginRequest.request, { login: '{"d":"Duplicate"}' });
  check(so, 'login heartbeat bi FBM bao con phien cu: luot dong loi, khong lap ngay, cho chu ky thu lai',
    [failedLogin.ok, failedLogin.code, failedLogin.request, heartbeat.FbmSync.stateRead().phase, gateLogs.some((event) => event.action === 'login_failure'), Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead()).loginHalted],
    [false, 'AUTO_LOGIN_FAILED', null, 'error', true, false]);
  // Trong chu kỳ chờ, lần hỏi sau gửi request việc thật (người dùng có thể đã tự đăng nhập); phiên vẫn chết thì không đăng nhập lại.
  const throttledProbe = hoiNen(heartbeat);
  const throttledAfterFailure = phienChet(throttledProbe);
  check(so, 'login that bai khong tu chay khi chua den lich',
    [throttledProbe.request && throttledProbe.request.meta.kind, throttledAfterFailure.ok, throttledAfterFailure.code, throttledAfterFailure.request],
    ['session_probe', false, 'AUTO_LOGIN_THROTTLED', null]);
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const throttledDueProbe = hoiNen(heartbeat);
  const throttledDue = phienChet(throttledDueProbe);
  check(so, 'login that bai bi throttle toi da mot lan moi 30 phut khi den lich',
    [throttledDueProbe.request && throttledDueProbe.request.meta.kind, throttledDue.ok, throttledDue.code, throttledDue.request],
    ['session_probe', false, 'AUTO_LOGIN_THROTTLED', null]);

  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: Date.now() - 31 * 60 * 1000, nextRetryAt: 0 });
  heartbeat.FbmSync.statePatch({ runId: 'expired-401', phase: 'pull_customer', mode: 'read', entity: 'customer', cursor: { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] }, activeRequestId: 'expired-401-request', deadlineAt: Date.now() + 1000, session: { expired: false } });
  const suspected401 = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: false, status: 401, body: '', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'expired-401-request' }] } }));
  const expired401 = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: suspected401.request.id }] } }));
  check(so, 'FBM 401 chi probe lai va neu probe khong song thi dung, khong tu login tu loi nghiep vu',
    [suspected401.ok, suspected401.request.meta.kind, expired401.ok, expired401.code, heartbeat.FbmSync.stateRead().cursor.kind],
    [true, 'session_probe', false, 'SESSION_PROBE_UNCERTAIN', null]);

  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 });
  heartbeat.FbmSync.statePatch({ runId: 'initial-probe-failure', phase: 'checking_session', mode: 'read', cursor: { kind: 'session', cause: 'issue', resume: { cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, phase: 'pull_customer', entity: 'customer' }, replay: false, probeRetried: false, pageReloaded: false }, activeRequestId: 'initial-probe-request', deadlineAt: Date.now() + 1000, session: { expired: false }, metadata: { autoLoginTried: false } });
  const initialProbeFailure = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: false, status: 500, body: '\ufffd\ufffd\ufffd', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'initial-probe-request' }] } }));
  check(so, 'probe dau luot khong song moi duoc phep khoi dong mot login',
    [initialProbeFailure.ok, initialProbeFailure.request.meta.kind, heartbeat.FbmSync.stateRead().cursor.kind],
    [true, 'login_step', 'login']);
}

module.exports = { chay };
