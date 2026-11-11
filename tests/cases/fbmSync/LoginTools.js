/** Công cụ thuần của lượt đăng nhập: mô tả request từng bước trang Login, đọc salt và lựa chọn, lệnh khóa trang, khớp danh tính, cổng tự đăng nhập. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const BAN_MA = { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ban-ma-gia-du-dai-K8' };
const CRED = { configured: true, credentialRef: 'ref-k-12345678', ciphertext: BAN_MA, public: { usernameHint: 'k8user', database: '', unit: '', language: 'v' } };
const ma = (fn) => { try { fn(); return ''; } catch (err) { return err.code || String(err.message); } };

function chay(so) {
  section('FBM sync - công cụ thuần của lượt đăng nhập');
  const F = workflowGas({}).hop.FbmSync;
  const facts = { salt: 'ab12cd34', database: 'FHN_CRM_App', unit: 'CTY', pageKey: { check: 'a'.repeat(32), pageCookie: 'pc' } };
  const plans = {};
  F.LOGIN_PAGE_STEPS.forEach((step) => { plans[step] = F.loginRequestPlan(step, facts, CRED); });
  check(so, 'bước Login: ô tên đăng nhập và hash để trống, Extension điền theo `meta.fill` (bản mã, ref, salt); salt, database, đơn vị đi trong thân; không ép trừ khi được yêu cầu',
    [plans.login.body.user, plans.login.body.password, plans.login.body.value, plans.login.body.database, plans.login.body.unit, plans.login.body.force, plans.login.meta.fill.slots, plans.login.meta.fill.credentialRef, plans.login.meta.fill.ciphertext.ciphertext, plans.login.meta.fill.salt, F.loginRequestPlan('login', facts, CRED, { force: true }).body.force],
    ['', '', 'ab12cd34', 'FHN_CRM_App', 'CTY', false, { user: 'username', password: 'loginHash' }, 'ref-k-12345678', BAN_MA.ciphertext, 'ab12cd34', true]);
  check(so, 'các bước khác: đơn vị điền tên đăng nhập ở ô `u`; khóa trang và về trang chủ là lệnh cho Extension; mọi URL nằm trên miền FBM đã cấu hình; bước lạ thì ném',
    [plans.unit.body, plans.unit.meta.fill.slots, plans.pageKey.meta.command, plans.pageKey.meta.pageKey, plans.home.meta.command, F.LOGIN_PAGE_STEPS.every((s) => plans[s].url.indexOf(F.FBM_BASE_URL + '/') === 0), ma(() => F.loginRequestPlan('la', facts, CRED))],
    [{ u: '', d: 'FHN_CRM_App' }, { u: 'username' }, 'pageKeyStore', facts.pageKey, 'navigate', true, 'LOGIN_STEP_UNKNOWN']);
  check(so, 'đọc salt từ ChallengeScript của trang Login (dấu nháy escape nhiều lớp); trang không có salt thì rỗng',
    [F.loginSaltExtract('<script>var o = {"ChallengeScript":"eval(\\u0027ab12\\u0027+\\u0027cd34\\u0027)"};</script>'), F.loginSaltExtract('<html></html>')], ['ab12cd34', '']);
  check(so, 'chọn database/đơn vị: giá trị đã lưu thắng, rồi giá trị FBM trả, cuối cùng mặc định; response hỏng thì mặc định',
    [F.loginChoicePick('{"d":[{"Ma_DL":"FHN_CRM_App"}]}', 'database', '', 'X_Y'), F.loginChoicePick('{"d":[{"Ma_Dvcs":"CTY"}]}', 'unit', '', 'CTY0'), F.loginChoicePick('{"d":[{"Ma_Dvcs":"CTY"}]}', 'unit', 'DV2', 'CTY0'), F.loginChoicePick('{hỏng', 'unit', '', 'CTY0')],
    ['FHN_CRM_App', 'CTY', 'DV2', 'CTY0']);
  const kiem = 'b'.repeat(32);
  check(so, 'khóa trang: trang tài khoản có giá trị kiểm và cookie thì ra lệnh kèm hai giá trị; thiếu thì LOGIN_PAGE_KEY_UNVERIFIABLE',
    [F.loginPageKeyDecide('{"salt":"' + kiem + '\\t","cookie":"pc-1"}'), F.loginPageKeyDecide('{"cookie":"pc-1"}').code], [{ ok: true, pageKey: { check: kiem, pageCookie: 'pc-1' } }, 'LOGIN_PAGE_KEY_UNVERIFIABLE']);
  const runtime = { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'k8user', accountName: 'K8 Demo' }, page = { userId: '2037', accountName: 'K8 Demo' };
  const bound = { status: 'BOUND', binding: runtime };
  const quyet = (v) => F.identityMatchDecide(Object.assign({ runtime, page, bound }, v)).status;
  check(so, 'khớp danh tính: bản nháp điền dở chỉ so ô đã điền; trang chưa hiện mã/tên thì tải lại một lần, đã tải lại vẫn thiếu thì dừng; trang lệch hoặc liên kết lệch thì cần liên kết lại',
    [quyet({ expected: { userId: '2037' }, bound: null }), quyet({ expected: { userId: '9999' }, bound: null }), quyet({ expected: null }), quyet({ page: {} }), quyet({ page: {}, pageReloaded: true }), quyet({ page: { userId: '1', accountName: 'K8 Demo' } }), quyet({ bound: { status: 'REBIND_REQUIRED' } })],
    ['BOUND', 'REBIND_REQUIRED', 'BOUND', 'PAGE_RELOAD', 'PAGE_MISSING', 'REBIND_REQUIRED', 'REBIND_REQUIRED']);
  const now = 100 * 60 * 1000, policy = { enabled: true, retryEnabled: true, retryMinutes: 30 };
  const cong = (v) => F.autoLoginGate(Object.assign({ masterEnabled: true, policy, credential: CRED, attempt: {}, now, manual: false }, v)).code || 'OK';
  const vuaHong = { lastAttemptAt: now - 60 * 1000, lastLoginAt: 0 };
  check(so, 'cổng tự đăng nhập: tắt đồng bộ, chưa cấu hình, đã ngừng (cả lượt bấm tay), chu kỳ chờ chỉ cho lượt máy, tắt thử lại sau lần hỏng',
    [cong({ masterEnabled: false }), cong({ credential: { configured: false } }), cong({ attempt: { loginHalted: true }, manual: true }), cong({ attempt: vuaHong }), cong({ attempt: vuaHong, manual: true }), cong({ attempt: vuaHong, policy: Object.assign({}, policy, { retryEnabled: false }) }), cong({ attempt: { lastAttemptAt: now - 31 * 60 * 1000 } }), cong({})],
    ['SYNC_DISABLED', 'AUTO_LOGIN_NOT_CONFIGURED', 'AUTO_LOGIN_HALTED', 'AUTO_LOGIN_THROTTLED', 'OK', 'AUTO_LOGIN_RETRY_DISABLED', 'OK', 'OK']);
}

module.exports = { chay };
