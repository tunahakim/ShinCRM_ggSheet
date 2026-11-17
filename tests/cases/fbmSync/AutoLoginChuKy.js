/** Kiểm cổng tự đăng nhập: chu kỳ chờ chỉ dành cho chạy nền, lượt bấm tay, tắt tự thử lại, cursor quay về sau đăng nhập. */
const { section, check } = require('../../lib/assert');
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datPhan, docPhan } = require('../../lib/fbm/cai-dat-thu');
const { HET_HAN, noiNen, congVao, dungHopCong } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync - auto-login: cổng chu kỳ chờ');
  const hop = dungHopCong();
  check(so, 'auto-login mặc định bật nhưng chưa cấu hình',
    [docPhan(hop, 'loginPolicy').enabled, hop.FbmSync.credentialPublicView().configured],
    [true, false]);
  hop.FbmSync.credentialWrite({ credentialRef: 'cred-test-1234', ciphertext: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'anhlt', database: 'FHN_CRM_App', unit: 'CTY' } });
  check(so, 'đọc cấu hình không trả ciphertext ra Sidebar',
    [hop.FbmSync.credentialPublicView().configured, hop.FbmSync.credentialPublicView().ciphertext],
    [true, undefined]);
  const state = hop.FbmSync.runOpen({ phase: 'pull_customer', total: 1 });
  state.entity = 'customer'; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }; hop.FbmSync.stateWrite(state);
  const login = hop.FbmSync.autoLoginOpen(hop.FbmSync.stateRead(), { manual: false, afterLogin: { cursor: state.cursor, phase: 'pull_customer', entity: 'customer' } });
  check(so, 'hết phiên tạo request bước trang Login, giữ cursor cũ làm chỗ quay về và đánh dấu lượt đã tự đăng nhập',
    [login.request.meta.kind, login.request.meta.step, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.afterLogin.cursor.pageIndex, hop.FbmSync.stateRead().metadata.autoLoginTried],
    ['login_step', 'page', 'login', 2, true]);
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
  check(so, 'lượt bấm tay ngay sau lần đăng nhập hỏng vẫn gửi đăng nhập và đánh dấu cursor là bấm tay, chạy nền thì bị chặn',
    [backgroundThrottled.code, backgroundThrottled.request, manualRetry.request && manualRetry.request.meta.kind, hop.FbmSync.stateRead().cursor.manual],
    ['AUTO_LOGIN_THROTTLED', null, 'login_step', true]);
  const attemptAt = Date.now();
  const thanhCong = (at) => hop.FbmSync.loginAttemptWrite(hop.FbmSync.loginAttemptMark(hop.FbmSync.loginAttemptRead(), { kind: 'success' }, at, 0));
  thanhCong(attemptAt + 500);
  check(so, 'đăng nhập tự động thành công rồi phiên bị đăng xuất thì được đăng nhập lại ngay, không phải chờ chu kỳ 30 phút',
    cong(attemptAt + 13 * 60 * 1000).ok,
    true);
  datPhan(hop, 'loginPolicy', { retryEnabled: false });
  check(so, 'tắt tự thử lại chỉ chặn sau lần thất bại, lần trước thành công vẫn được đăng nhập lại',
    cong(attemptAt + 60 * 1000).ok,
    true);
  hop.FbmSync.autoLoginMarkAttempt(attemptAt + 2000);
  check(so, 'tắt tự thử lại thì lần thử chưa thành công chặn với lý do riêng',
    [cong(attemptAt + 60 * 60 * 1000).code, hop.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_RETRY_DISABLED').indexOf('tắt tự thử lại') >= 0],
    ['AUTO_LOGIN_RETRY_DISABLED', true]);
  datPhan(hop, 'loginPolicy', { retryEnabled: true });
  const sauDangNhap = hop.FbmSync.stateRead();
  sauDangNhap.session = Object.assign({}, sauDangNhap.session, { identityVerified: false, sessionId: '', identitySessionId: '' });
  const resumed = trongLat(hop.FbmSync, () => hop.FbmSync.loginSucceed(sauDangNhap, { purpose: 'auto', afterLogin: { cursor: { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'], count: 2000 }, phase: 'pull_customer', entity: 'customer' } }, {}), sauDangNhap);
  check(so, 'đăng nhập tự động xong mà phiên chưa xác minh thì quay lại hỏi phiên (grid User) trước request nghiệp vụ, chỗ quay về là cursor cũ',
    [resumed.request.meta.kind, hop.FbmSync.stateRead().cursor.kind, hop.FbmSync.stateRead().cursor.resume.cursor.pageIndex],
    ['session_probe', 'session', 2]);
  check(so, 'login test không coi Login.aspx là thành công',
    hop.FbmSync.protocol.isSessionExpired({ ok: true, status: 200, body: '<form action="Login.aspx"></form>' }),
    true);
}

module.exports = { chay };
