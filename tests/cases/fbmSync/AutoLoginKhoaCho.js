/** Kiểm khóa chờ sau tự đăng nhập hỏng: FBM chặn vì còn phiên cũ, gỡ khóa khi người dùng tự đăng nhập, nối lại lượt nền, trang FBM lệch danh tính. */
const { section, check } = require('../../lib/assert');
const { trongLat } = require('../../lib/fbm/hop-dong-bo');
const { TRANG_FBM_THU } = require('../../lib/load-gas');
const { datPhan, docPhan, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { USER_BODY, quaTrang, noiNen, nopBuoc, congVao, hoiNen, dungHopGiuPhien, vaDauThu, batLogCong } = require('../../lib/fbm/tu-dang-nhap');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section('FBM sync - auto-login: khóa chờ và nối lại lượt');
  const { hop: heartbeat } = dungHopGiuPhien();
  const gateLogs = batLogCong(heartbeat);
  const logsBeforeAuthorize = gateLogs.length;
  const authorizeFalse = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'authorize' }, { ok: true, status: 200, body: '{"d":{"Authorized":false,"Rows":null}}' }, { session: { expired: true } });
  const authorizeLog = gateLogs.slice(logsBeforeAuthorize).filter((event) => event.action === 'login_identity_failure')[0] || {};
  check(so, 'xin mã xác thực sau đăng nhập hỏng thì ghi lý do cho lần chờ sau và ghi dấu hiệu response an toàn vào Log, không lộ tên trường nhạy cảm',
    [authorizeFalse.code, heartbeat.FbmSync.credentialPublicView().lastError, authorizeLog.detail && authorizeLog.detail.response],
    ['LOGIN_IDENTITY_AUTHORIZE_FAILED', 'FBM không trả mã xác thực để kiểm tra tài khoản sau đăng nhập.', { httpStatus: 200, responseLength: 38, json: true, dType: 'object', dKeys: 'Rows', deniedFlag: true }]);
  datPhan(heartbeat, 'loginPolicy', { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 1 });
  const blockedAuto = nopBuoc(heartbeat.FbmSync, { purpose: 'auto', step: 'login', facts: { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY' }, afterLogin: { cursor: { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }, phase: 'pull_customer', entity: 'customer' } }, { ok: true, status: 200, body: '{"d":"Duplicate"}' }, { origin: 'background', session: { expired: true, identityVerified: false, sessionId: '', identitySessionId: '' }, metadata: { sessionGate: {} } });
  check(so, 'FBM chặn vì còn phiên cũ: tách khỏi sai mật khẩu, không tắt và không ngừng tự đăng nhập, lượt đóng lỗi chứ không giữ lượt chờ',
    [blockedAuto.code, heartbeat.FbmSync.stateRead().phase, heartbeat.FbmSync.stateRead().cursor.kind, docPhan(heartbeat, 'loginPolicy').enabled, Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead()).loginHalted, heartbeat.FbmSync.runInProgress(heartbeat.FbmSync.stateRead())],
    ['AUTO_LOGIN_FAILED', 'error', undefined, true, false, false]);
  // Lần hỏi nền sau là lượt mới: response báo chưa xác thực thì probe; chưa hết chu kỳ thử lại thì lượt kết thúc, không gửi lệnh đăng nhập.
  const unauthBody = '{"d":{"TotalRowCount":0,"Rows":null,"ViewPage":null,"Authorized":false}}';
  // Lần đăng nhập vừa bị chặn được ghi là lần thử gần nhất (thực tế do beginAutoLogin ghi trước khi gửi lệnh).
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: Date.now() });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const withinCycle = hoiNen(heartbeat);
  const withinCycleEnd = noiNen(heartbeat, { ok: true, status: 200, body: unauthBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: withinCycle.request.id }] } });
  check(so, 'Chưa hết chu kỳ thử lại: lượt nền mới thấy phiên chết thì kết thúc AUTO_LOGIN_THROTTLED, không gửi lệnh đăng nhập',
    [withinCycle.request.meta.kind, withinCycleEnd.code, withinCycleEnd.request, heartbeat.FbmSync.runInProgress(heartbeat.FbmSync.stateRead())],
    ['session_probe', 'AUTO_LOGIN_THROTTLED', null, false]);
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: Date.now() - 10 * 1000, loginHalted: true, lastError: 'Lý do cũ' });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const afterCycle = hoiNen(heartbeat);
  const afterCycleIdentity = noiNen(heartbeat, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: afterCycle.request.id }] } });
  const afterCycleLive = noiNen(heartbeat, { d: { TotalRowCount: 2 }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: afterCycleIdentity.request && afterCycleIdentity.request.id }] } });
  const unlocked = Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead());
  check(so, 'Đang khóa chờ, ngừng tự đăng nhập mà người dùng tự đăng nhập: probe xác minh gỡ hết khóa, đếm khách, lệch mốc thì mở Quét nhanh, không gửi lệnh đăng nhập',
    [afterCycle.request.meta.kind, afterCycleIdentity.request && afterCycleIdentity.request.meta.kind, afterCycleLive.ok, afterCycleLive.request && afterCycleLive.request.meta.kind, congVao(heartbeat.FbmSync).ok, unlocked.loginHalted, unlocked.lastError],
    ['session_probe', 'customer_count', true, 'session_probe', true, false, '']);
  heartbeat.FbmSync.statePatch({ phase: 'done', cursor: {}, activeRequestId: '', deadlineAt: 0, process: '' });
  vaSoNen(heartbeat.FbmSync, { heartbeat: { doneAt: 1 } });
  const afterCycleDead = hoiNen(heartbeat);
  const afterCycleLogin = noiNen(heartbeat, { ok: true, status: 200, body: unauthBody, transport: { contract: MA_HOP_DONG, trace: [{ requestId: afterCycleDead.request.id }] } });
  check(so, 'Khóa đã gỡ mà người dùng đăng xuất: cấp lệnh đăng nhập ngay; lý do đường truyền ghi từ lúc gửi nên hỏng giữa đường vẫn có lý do',
    [afterCycleDead.request && afterCycleDead.request.meta.kind, afterCycleLogin.ok, afterCycleLogin.request && afterCycleLogin.request.meta.kind, heartbeat.FbmSync.autoLoginBlockMessage('AUTO_LOGIN_THROTTLED', null, heartbeat.FbmSync.loginAttemptRead().lastError).indexOf('Lý do lần trước: ' + heartbeat.FbmSync.LOGIN_REPLIES.transport.text) >= 0],
    ['session_probe', true, 'login_step', true]);
  // Lượt nền hết phiên → loginRun → đăng nhập xong thì nối lại đúng chỗ quay về của chính lượt đó (cùng mã lượt, cùng cursor nghiệp vụ).
  const nenTruoc = heartbeat.FbmSync.stateRead(), nenQuayVe = nenTruoc.cursor.afterLogin.cursor.kind;
  const nenTrang = quaTrang((reply) => noiNen(heartbeat, reply), afterCycleLogin.request);
  const nenAuth = noiNen(heartbeat, { ok: true, status: 200, body: '{"d":{"Authorized":"auth-customer"}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: nenTrang.request.id }] } });
  const nenXong = noiNen(heartbeat, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: TRANG_FBM_THU, trace: [{ requestId: nenAuth.request.id }] } });
  check(so, 'B11.11: lượt nền hết phiên tự đăng nhập xong thì nối lại đúng cursor đã giữ, cùng lượt nền, request kế là request của cursor đó',
    [nenXong.ok, heartbeat.FbmSync.stateRead().runId === nenTruoc.runId, heartbeat.FbmSync.stateRead().origin, heartbeat.FbmSync.stateRead().cursor.kind, nenXong.request && nenXong.request.meta.kind],
    [true, true, 'background', nenQuayVe, 'customer_count']);
  // Sau đăng nhập, liên kết (ở đây là bản nháp của đăng nhập thử) cũng phải khớp cả trang FBM vừa mở.
  const loginPageCursor = { purpose: 'test', step: 'identity', expectedIdentity: { spreadsheetId: 'sheet-test', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } };
  const loginPageWrong = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Nguoi khac' } } });
  const loginPageEmpty = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG } });
  const loginPageEmptyCursor = heartbeat.FbmSync.stateRead().cursor;
  const loginPageStillEmpty = trongLat(heartbeat.FbmSync, () => heartbeat.FbmSync.stageRun(heartbeat.FbmSync.cursorTable('login'), heartbeat.FbmSync.stateRead(), { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG } }));
  check(so, 'Sau đăng nhập: trang FBM lệch thì LOGIN_IDENTITY_MISMATCH; trang thiếu thì đọc lại grid User kèm lệnh tải trang khách hàng, vẫn thiếu thì FBM_PAGE_IDENTITY_MISSING', [
    loginPageWrong.code, loginPageEmpty.ok, loginPageEmpty.request && loginPageEmpty.request.meta.kind, loginPageEmpty.request && loginPageEmpty.request.meta.reloadFbmPage, loginPageEmptyCursor.pageReloaded, loginPageStillEmpty.code
  ], ['LOGIN_IDENTITY_MISMATCH', true, 'identity_user_grid', 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', true, 'FBM_PAGE_IDENTITY_MISSING']);
  // Lần tự đăng nhập vừa hỏng đặt khóa chờ; người dùng bấm "Đăng nhập thử" thành công thì nền phải tự đăng nhập lại được ngay (lời báo khóa chờ hướng dẫn đúng việc này; gặp thật 2026-10-31).
  const gan = Date.now() - 10 * 1000;
  vaDauThu(heartbeat.FbmSync, { lastAttemptAt: gan, lastLoginAt: gan - 60 * 1000 });
  const throttledBefore = congVao(heartbeat.FbmSync).code;
  nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Nguoi khac' } } });
  const throttledAfterMismatch = congVao(heartbeat.FbmSync).code;
  const testLoginOk = nopBuoc(heartbeat.FbmSync, loginPageCursor, { ok: true, status: 200, body: USER_BODY, transport: { contract: MA_HOP_DONG, captures: { pageUserId: '2037', pageAccountName: 'Le Tuan Anh' } } });
  check(so, 'Đăng nhập thử thành công gỡ khóa chờ của lần tự đăng nhập hỏng trước đó; đăng nhập thử lệch tài khoản thì không gỡ', [
    throttledBefore, throttledAfterMismatch, testLoginOk.code, congVao(heartbeat.FbmSync).ok, Object.assign({}, heartbeat.FbmSync.credentialRead(), heartbeat.FbmSync.loginAttemptRead()).nextRetryAt
  ], ['AUTO_LOGIN_THROTTLED', 'AUTO_LOGIN_THROTTLED', 'LOGIN_OK', true, 0]);
}

module.exports = { chay };
