/** Kiểm đăng nhập thử và hủy phiên cũ: credential đã lưu, không bắt được mã phiên, danh tính bản nháp, nút hủy phiên cũ và Log. */
const { section, check } = require('../../lib/assert');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const { docPhan } = require('../../lib/fbm/cai-dat-thu');
const { TRA_BUOC } = require('../../lib/fbm/trang-login');
const { USER_BODY, quaTrang, nopBuoc, congVao, dungHopGiuPhien, batLogCong } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync - auto-login: đăng nhập thử và hủy phiên cũ');
  const { hop: heartbeat } = dungHopGiuPhien();
  const gateLogs = batLogCong(heartbeat);
  const beforeTestConfig = Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead());
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const tuHong = gateLogs.length;
  const testRequest = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('test', {}, heartbeat.FbmSync.stateRead()));
  const testFirst = testRequest.request, testUnit = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: TRA_BUOC.page, transport: { contract: MA_HOP_DONG, trace: [{ requestId: testFirst.id }] } }));
  const testUnitRequest = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: TRA_BUOC.entity, transport: { contract: MA_HOP_DONG, trace: [{ requestId: testUnit.request.id }] } })).request;
  check(so, 'đăng nhập thử không có bản nháp dùng credential đã lưu: bước cần mật khẩu mang mã tham chiếu và bản mã đã lưu, ô tên đăng nhập để trống cho Extension điền',
    [testFirst.meta.kind, heartbeat.FbmSync.stateRead().cursor.purpose, testUnitRequest.meta.fill.credentialRef, testUnitRequest.meta.fill.ciphertext.ciphertext, testUnitRequest.body.u],
    ['login_step', 'test', 'cred-heartbeat-123', 'ciphertext-long-enough', '']);
  const testFailure = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), testUnitRequest, { login: '{"d":false}' });
  const afterTestFailure = Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead());
  const denHong = gateLogs.length;
  check(so, 'dang nhap thu bang thong tin da luu bi bao sai mat khau: khong doi moc thu lai, nhung ngung tu dang nhap vi thong tin da luu da sai',
    [testFailure.code, afterTestFailure.lastAttemptAt, afterTestFailure.lastLoginAt, afterTestFailure.lastError, afterTestFailure.loginHalted],
    ['LOGIN_FAILED', beforeTestConfig.lastAttemptAt, beforeTestConfig.lastLoginAt, 'FBM báo sai tên đăng nhập hoặc mật khẩu.', true]);

  // FBM không kiểm trường cookie trong body (đo 2026-10-06: đọc, xin quyền mở form và lưu ALT00010 đều thành công với mã rỗng). Login thành công mà không bắt
  // được mã phiên thì vẫn đi tiếp bước xác minh; request xác minh được cấp mã rỗng làm dự phòng thay vì token bắt buộc khiến Extension chặn FBM_TRANSPORT_CAPTURE_MISSING.
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const noCookieTest = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('test', {}, heartbeat.FbmSync.stateRead()));
  const noCookieLogin = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), noCookieTest.request);
  const noCookieReplacement = (noCookieLogin.request && noCookieLogin.request.meta && noCookieLogin.request.meta.transport && noCookieLogin.request.meta.transport.replacements || [])[0] || {};
  check(so, 'đăng nhập thử thành công mà không bắt được mã phiên vẫn đi tiếp xác minh, mã phiên là tùy chọn có dự phòng rỗng (FBM-037)',
    [noCookieLogin.ok, noCookieLogin.request && noCookieLogin.request.meta.kind, noCookieReplacement.required, noCookieReplacement.fallback],
    [true, 'authorize', false, '']);
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const mismatchTest = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('test', {}, heartbeat.FbmSync.stateRead()));
  const mismatchLogin = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), mismatchTest.request);
  const mismatchAuthorize = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: mismatchLogin.request.id }] } }));
  const mismatchIdentity = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[9999,"OTHER","Other User"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: mismatchAuthorize.request.id }] } }));
  check(so, 'dang nhap thu sai identity fail-closed nhung khong tu tat auto-login',
    [mismatchIdentity.code, docPhan(heartbeat, 'loginPolicy').enabled, heartbeat.FbmSync.stateRead().session.identityVerified],
    ['LOGIN_IDENTITY_MISMATCH', true, false]);

  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, session: { expired: false, cookie: '' } });
  const draftB = { spreadsheetId: 'sheet-test', userId: '2040', username: 'USERB', accountName: 'Tai khoan B' };
  const draftLogin = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('test', { identity: draftB }, heartbeat.FbmSync.stateRead()));
  const draftLoginAdapter = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), draftLogin.request);
  const draftLoginAuthorize = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: draftLoginAdapter.request.id }] } }));
  const draftLoginIdentity = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"TotalRowCount":1,"Rows":[[2040,"USERB","Tai khoan B"]],"ViewPage":{"Fields":[{"AliasName":"id"},{"AliasName":"name"},{"AliasName":"ten"}]}}}', transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2040', pageAccountName: 'Tai khoan B' }, trace: [{ requestId: draftLoginAuthorize.request.id }] } }));
  check(so, 'login test doi chieu theo identity ban nhap B, khong ep theo binding A',
    [draftLoginIdentity.code, heartbeat.FbmSync.stateRead().session.accountUsername],
    ['LOGIN_OK', 'USERB']);

  // Cách đọc từng câu trả lời Login (false, null, chuỗi lạ) kiểm ở LoginReply.js; ở đây chỉ dựng lượt FBM báo còn phiên cũ để mở nút hủy phiên.
  nopBuoc(heartbeat.FbmSync, { purpose: 'auto', manual: true, step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' }, afterLogin: { cursor: { kind: 'customer_grid' } } }, { ok: true, status: 200, body: '{"d":"Duplicate"}' }, { origin: 'manual', session: { expired: true } });
  const textText = heartbeat.FbmSync.stateRead().message;
  check(so, 'Login trả d:"Duplicate" thì báo còn giữ phiên cũ và mở nút hủy phiên cũ',
    [textText.indexOf('còn giữ phiên đăng nhập cũ') > 0, textText.indexOf('Hủy phiên cũ và đăng nhập') > 0, heartbeat.FbmSync.statusView().actions.forceLogin],
    [true, true, true]);
  const serviceSource = require('fs').readFileSync(require('path').join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8');
  check(so, 'mọi lệnh mở lượt (đăng nhập thử, hủy phiên cũ, kiểm liên kết, đồng bộ) đi qua cửa fbmCommand và vỏ runEntryPoint để Log được ghi ra sheet', [/function fbmCommand\(command, payload\) \{ return fbmCommandRun_\(/.test(serviceSource), /return runEntryPoint\(name, 'fbm_sync'/.test(serviceSource)], [true, true]);
  // FBM-057: nút hủy phiên cũ. GAS chỉ mở sau khi FBM trả lời từ chối; đăng nhập tự động luôn là login mềm.
  check(so, 'FBM từ chối đăng nhập thì status mở nút hủy phiên cũ; request đăng nhập tự động không mang cờ hủy phiên',
    [heartbeat.FbmSync.statusView().actions.forceLogin, heartbeat.FbmSync.loginRequestPlan('login', {}, heartbeat.FbmSync.credentialRead(), {}).body.force],
    [true, false]);
  const forceLogsBefore = gateLogs.length;
  const forceStart = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('force', {}, heartbeat.FbmSync.stateRead()));
  const forceLoginStep = quaTrang((reply) => (reply.body === TRA_BUOC.login ? { ok: true, request: null, held: heartbeat.FbmSync.stateRead() } : heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply))), forceStart.request).held.cursor;
  const forceLoginRequest = heartbeat.FbmSync.loginStepRequest(forceLoginStep, heartbeat.FbmSync.credentialRead());
  check(so, 'bấm hủy phiên cũ gửi đăng nhập có cờ hủy phiên bằng thông tin đã lưu, đóng nút lại và ghi Log',
    [forceStart.ok, forceLoginRequest.body.force, forceLoginRequest.meta.fill.credentialRef, heartbeat.FbmSync.statusView().actions.forceLogin, heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('force', {}, heartbeat.FbmSync.stateRead())).code, gateLogs.slice(forceLogsBefore).some((event) => event.action === 'login_force_requested')],
    [true, true, 'cred-heartbeat-123', false, 'LOGIN_FORCE_NOT_OFFERED', true]);
  heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":false}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: heartbeat.FbmSync.stateRead().activeRequestId }] } }));
  check(so, 'đã hủy phiên cũ mà FBM vẫn báo sai mật khẩu thì nói đúng như vậy và không mở lại nút hủy phiên',
    [heartbeat.FbmSync.stateRead().message.indexOf('Hủy phiên cũ rồi đăng nhập không thành công: FBM báo sai tên đăng nhập hoặc mật khẩu') === 0, heartbeat.FbmSync.statusView().actions.forceLogin],
    [true, false]);
  const throttleText = heartbeat.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_THROTTLED', { retryAt: new Date(2026, 9, 7, 16, 48).getTime() }, heartbeat.FbmSync.loginAttemptRead().lastError);
  check(so, 'thông báo chờ chu kỳ nêu giờ được thử lại, lý do lần trước và cách kiểm tra ngay',
    [throttleText.indexOf('sau 16:48') > 0, throttleText.indexOf('Lý do lần trước: FBM báo sai tên đăng nhập') > 0, throttleText.indexOf('Đăng nhập thử') > 0],
    [true, true, true]);
  datState(heartbeat.FbmSync, { phase: 'paused', loginForceOffered: true, activeRequestId: '', deadlineAt: 0 });
  const tuEp = gateLogs.length;
  const forceAgain = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('force', {}, heartbeat.FbmSync.stateRead()));
  const forceLogin = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), forceAgain.request);
  const forceAuthorize = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: forceLogin.request.id }] } }));
  const forceIdentity = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: forceAuthorize.request.id }] } }));
  check(so, 'hủy phiên cũ và đăng nhập đúng tài khoản đã liên kết thì báo thành công, mở lại quyền tự đăng nhập ngay và ghi Log',
    [forceIdentity.code, heartbeat.FbmSync.stateRead().message.indexOf('Đã hủy phiên cũ và đăng nhập') === 0, congVao(heartbeat.FbmSync).ok, gateLogs.some((event) => event.action === 'login_force_ok')],
    ['LOGIN_OK', true, true, true]);
  const denEp = gateLogs.length;
  // Mỗi lượt đăng nhập đúng một dòng kết thúc do luồng đăng nhập ghi; không còn dòng chụp `slice` lặp lại câu thông báo của lượt.
  const dongKet = (tu, den) => gateLogs.slice(tu, den).filter((e) => /^(login_test_ok|login_force_ok|login_failure|slice|start)$/.test(e.action)).map((e) => e.action);
  datState(heartbeat.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0 });
  const tuThu = gateLogs.length, thuMo = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.loginOpen('test', {}, heartbeat.FbmSync.stateRead()));
  const thuDangNhap = quaTrang((reply) => heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue(reply)), thuMo.request);
  const thuXacNhan = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: thuDangNhap.request.id }] } }));
  const thuXong = heartbeat.FbmSync.runSlice(() => heartbeat.FbmSync.continue({ ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: thuXacNhan.request.id }] } }));
  check(so, 'mỗi lượt đăng nhập đúng một dòng kết thúc: Đăng nhập thử thành công, bị FBM báo sai mật khẩu, Hủy phiên cũ thành công',
    [thuXong.code, dongKet(tuThu), dongKet(tuHong, denHong), dongKet(tuEp, denEp)],
    ['LOGIN_OK', ['login_test_ok'], ['login_failure'], ['login_force_ok']]);
}

module.exports = { chay };
