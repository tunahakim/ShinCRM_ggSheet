/**
 * Công cụ thuần của lượt đăng nhập: dựng mô tả request từng bước trang Login, đọc salt và lựa chọn database/đơn vị từ response, quyết định lệnh khóa trang, quyết định khớp danh tính và cổng tự đăng nhập. Không đọc kho, không ghi state, không ghi Log: người điều phối truyền dữ liệu vào.
 * Phần cần mật khẩu (tên đăng nhập, hash Login, khóa trang) không bao giờ có ở đây: request mang ô trống `meta.fill.slots` và bản mã; Extension giải mã, điền đúng ô rồi gửi FBM. Đọc kết quả Login dùng bảng `LOGIN_REPLIES`/`loginReplyReason`; đọc mã authorize dùng `extractAuthorized`; so trang dùng `pageIdentityCheck`.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Thứ tự bước trang Login; bước sau dựa vào dữ liệu bước trước (salt từ `page`, database từ `entity`, đơn vị từ `unit`, giá trị kiểm khóa trang từ `account`). */
FbmSync.LOGIN_PAGE_STEPS = ['page', 'entity', 'unit', 'login', 'account', 'pageKey', 'home'];

/**
 * Mô tả request của một bước. `facts` là dữ liệu bước trước (`salt`, `database`, `unit`, `pageKey`), `credential` là bản đọc kho credential (hoặc bản nháp D1), `options.force` chỉ bật từ nút người dùng đã xác nhận.
 * Bước `unit` và `login` cần tên đăng nhập và hash: GAS để ô trống, ghi tên ô trong `meta.fill.slots` kèm bản mã và salt. Bước `pageKey` và `home` là lệnh cho Extension, không gọi FBM.
 */
FbmSync.loginRequestPlan = function (step, facts, credential, options) {
  var base = FbmSync.FBM_BASE_URL, page = base + '/Main/Login.aspx', f = facts || {}, c = credential || {}, pub = c.public || {};
  var fill = function (slots) { return { slots: slots, credentialRef: String(c.credentialRef || ''), ciphertext: c.ciphertext || null, salt: String(f.salt || '') }; };
  var meta = function (extra) { return Object.assign({ kind: 'login_step', step: step }, extra || {}); };
  if (step === 'page') { return { url: page, method: 'GET', body: null, meta: meta() }; }
  if (step === 'entity') { return { url: page + '/GetEntityData', method: 'POST', body: '', meta: meta() }; }
  if (step === 'unit') { return { url: page + '/GetUnitData', method: 'POST', body: { u: '', d: String(f.database || '') }, meta: meta({ fill: fill({ u: 'username' }) }) }; }
  if (step === 'login') {
    return { url: page + '/Login', method: 'POST', body: { user: '', password: '', database: String(f.database || ''), unit: String(f.unit || ''), language: String(pub.language || 'v'), value: String(f.salt || ''), force: !!(options && options.force === true), storage: true }, meta: meta({ fill: fill({ user: 'username', password: 'loginHash' }) }) };
  }
  if (step === 'account') { return { url: base + '/Main/zccrAccount.aspx', method: 'GET', body: null, meta: meta() }; }
  if (step === 'pageKey') { return { url: base + '/Main/zccrAccount.aspx', method: 'COMMAND', body: null, meta: meta({ command: 'pageKeyStore', pageKey: { check: String(f.pageKey && f.pageKey.check || ''), pageCookie: String(f.pageKey && f.pageKey.pageCookie || '') }, fill: fill({}) }) }; }
  if (step === 'home') { return { url: base + '/Default.aspx', method: 'COMMAND', body: null, meta: meta({ command: 'navigate' }) }; }
  var unknown = new Error('Bước đăng nhập lạ: ' + step); unknown.code = 'LOGIN_STEP_UNKNOWN'; throw unknown;
};

/** Salt chỉ có trên Login.aspx: HTML thật escape dấu nháy nhiều lớp, chỉ ghép hai đoạn hex trong ChallengeScript; các mẫu sau là dạng trang cũ. Không thấy thì trả rỗng để người điều phối dừng lượt, không đoán. */
FbmSync.loginSaltExtract = function (html) {
  var source = String(html || ''), challenge = source.match(/"ChallengeScript"\s*:\s*"([^"]+)"/i);
  if (challenge) {
    var pieces = challenge[1].replace(/\\+u0027/gi, '|').match(/[a-f0-9]{4,}/gi) || [];
    if (pieces.length >= 2) { return String(pieces[0]) + String(pieces[1]); }
  }
  var patterns = [/\\u0027([a-f0-9]{4,})\\u0027\s*\+\s*\\u0027([a-f0-9]{4,})\\u0027/i, /u0027([a-f0-9]{4,})u0027\s*\+\s*u0027([a-f0-9]{4,})u0027/i, /'([a-f0-9]{4,})'\s*\+\s*'([a-f0-9]{4,})'/i, /(?:loginValue|encryptSalt|encrypt_salt|passwordSalt|loginSalt)\s*[=:]\s*["']([^"']+)["']/i, /["']value["']\s*:\s*["']([^"']+)["']/i];
  for (var i = 0; i < patterns.length; i += 1) {
    var match = source.match(patterns[i]);
    if (match) { return match[2] ? String(match[1]) + String(match[2]) : String(match[1]); }
  }
  return '';
};

/** Khóa đọc database và đơn vị trong response `GetEntityData`/`GetUnitData`. */
FbmSync.LOGIN_CHOICE_KEYS = { database: ['Ma_DL', 'ma_dl', 'database', 'Database'], unit: ['Ma_Dvcs', 'ma_dvcs', 'unit', 'Unit'] };
/** Chọn database hoặc đơn vị: giá trị người dùng đã lưu thắng; không có thì lấy giá trị FBM trả (mục cuối danh sách, như trang Login chọn mặc định); FBM không trả thì giá trị mặc định đã đo. */
FbmSync.loginChoicePick = function (responseText, kind, configured, fallback) {
  if (String(configured || '')) { return String(configured); }
  var parsed = FbmSync.protocol.parse(String(responseText || '')) || {}, data = parsed.d !== undefined ? parsed.d : parsed, keys = FbmSync.LOGIN_CHOICE_KEYS[kind] || [], found = '';
  var walk = function (item) {
    if (found || item === undefined || item === null) { return; }
    if (typeof item === 'string') { if (item && (item.indexOf('_') >= 0 || !fallback)) { found = item; } return; }
    if (Array.isArray(item)) { for (var i = item.length - 1; i >= 0 && !found; i -= 1) { walk(item[i]); } return; }
    if (typeof item === 'object') {
      for (var j = 0; j < keys.length && !found; j += 1) { if (item[keys[j]] !== undefined) { found = String(item[keys[j]] || ''); } }
      Object.keys(item).some(function (key) { if (!found && key !== 'parseError') { walk(item[key]); } return !!found; });
    }
  };
  if (!parsed.parseError) { walk(data); }
  return found || String(fallback || '');
};

/** Trang tài khoản mang giá trị kiểm khóa trang (`"salt":"<32 hex>\t`) và cookie trang; thiếu một trong hai thì không kiểm được, bỏ bước ghi khóa trang (tab FBM có thể trắng, Log ghi mã). */
FbmSync.loginPageKeyDecide = function (accountHtml) {
  var html = String(accountHtml || ''), check = html.match(/"salt"\s*:\s*"([a-f0-9]{32})\\t/i), pageCookie = html.match(/"cookie"\s*:\s*"([^"]+)"/i);
  if (!check || !pageCookie) { return { ok: false, code: 'LOGIN_PAGE_KEY_UNVERIFIABLE' }; }
  return { ok: true, pageKey: { check: check[1].toLowerCase(), pageCookie: pageCookie[1] } };
};

/** Bản nháp danh tính (đăng nhập thử trước khi lưu liên kết) có ô nào đã điền; không thì so với liên kết đã lưu. */
FbmSync.identityDraftFilled = function (expected) {
  var e = FbmSync.identityNormalize(expected);
  return !!(expected && (e.spreadsheetId || e.userId || e.username || e.accountName));
};

/**
 * Quyết định khớp danh tính sau đăng nhập. `expected` là bản nháp đăng nhập thử (có thể điền dở, chỉ so ô đã điền) hoặc `null`; `bound` là kết quả `identityStatus(runtime)` người điều phối đã đọc (chỉ cần khi không có bản nháp); `page` là danh tính trên trang FBM vừa mở.
 * Trả `BOUND`, `REBIND_REQUIRED`, `PAGE_RELOAD` (trang chưa hiện mã/tên, tải lại một lần) hoặc `PAGE_MISSING` (đã tải lại vẫn thiếu).
 */
FbmSync.identityMatchDecide = function (input) {
  var v = input || {}, draft = FbmSync.identityDraftFilled(v.expected), expected = draft ? FbmSync.identityNormalize(v.expected) : null, runtime = v.runtime || {};
  var status = draft ? (FbmSync.identityMismatches(expected, FbmSync.identityFilledFields(expected, runtime)).length ? 'REBIND_REQUIRED' : 'BOUND') : String(v.bound && v.bound.status || '');
  if (status !== 'BOUND') { return { status: 'REBIND_REQUIRED' }; }
  var page = FbmSync.pageIdentityCheck(draft ? expected : v.bound.binding, v.page, v.pageReloaded === true);
  if (page.status === 'reload') { return { status: 'PAGE_RELOAD' }; }
  if (page.status === 'missing') { return { status: 'PAGE_MISSING' }; }
  return { status: page.status === 'mismatch' ? 'REBIND_REQUIRED' : 'BOUND' };
};

/**
 * Cổng tự đăng nhập. Chặn cả lượt người bấm khi đã ngừng (`loginHalted`): mỗi lần bấm là một lần gửi lại mật khẩu FBM đã báo sai. Chu kỳ chờ chỉ áp sau lần thử chưa thành công và chỉ cho lượt máy tự gọi; người bấm được thử ngay (chủ dự án chốt 2026-10-07).
 * `input`: `{ masterEnabled, policy, credential, attempt, now, manual }`.
 */
FbmSync.autoLoginGate = function (input) {
  var v = input || {}, policy = v.policy || {}, credential = v.credential || {}, attempt = v.attempt || {};
  if (!v.masterEnabled) { return { ok: false, code: 'SYNC_DISABLED' }; }
  if (!policy.enabled || !credential.configured) { return { ok: false, code: 'AUTO_LOGIN_NOT_CONFIGURED' }; }
  if (attempt.loginHalted) { return { ok: false, code: 'AUTO_LOGIN_HALTED' }; }
  if (v.manual === true) { return { ok: true, credentialRef: credential.credentialRef }; }
  var last = Number(attempt.lastAttemptAt || 0), lastFailed = last > 0 && Number(attempt.lastLoginAt || 0) < last;
  if (!policy.retryEnabled && lastFailed) { return { ok: false, code: 'AUTO_LOGIN_RETRY_DISABLED' }; }
  var retryMs = Number(policy.retryMinutes) * 60 * 1000;
  if (lastFailed && Number(v.now) - last < retryMs) { return { ok: false, code: 'AUTO_LOGIN_THROTTLED', retryAt: last + retryMs }; }
  return { ok: true, credentialRef: credential.credentialRef };
};
