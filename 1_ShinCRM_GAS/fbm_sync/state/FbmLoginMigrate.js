/**
 * Chuyển một lần khóa đăng nhập đời cũ `FBM_LOGIN_CONFIG_V1` (bản mã, phần công khai và dấu lần thử gộp chung) cùng `FBM_AUTO_LOGIN_LAST_ATTEMPT_V1` sang hai kho `FBM_CREDENTIAL_V1` và `FBM_LOGIN_ATTEMPT_V1`, rồi xóa khóa cũ. Chạy ngay sau lần đẩy code đọc kho mới (`node tests/gas.js fbmLoginMigrate --push` trên Sheet DEV): từ lúc đẩy tới lúc chạy, cổng đọc kho mới ném `FBM_LOGIN_MIGRATION_PENDING`.
 *
 * Cùng thứ tự với `fbmStoresMigrate` và dùng lại khóa điều phối, chặn lượt đang chạy của nó: lần cầm khóa thứ nhất đọc khóa cũ, dựng và ghi phần kho mới chưa có; đọc lại từ kho thật so khớp; lần cầm khóa thứ hai mới xóa khóa cũ. Hỏng ở bước nào thì ném, khóa cũ còn nguyên. Kho mới đã có (người dùng lưu lại kết nối sau lần đẩy) thì giữ kho mới, chỉ xóa khóa cũ.
 * Khóa cũ còn trường chính sách tự đăng nhập nghĩa là hàm chuyển cài đặt `fbmSettingsMigrate` chưa chạy: ném, vì xóa khóa cũ lúc đó là mất chính sách.
 *
 * Tệp này là công cụ một lần: xóa cùng `server/dev/` trước khi đưa dữ liệu thật vào production, sau khi tệp production đã chạy nó.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Công cụ tính (thuần): `config` là `FBM_LOGIN_CONFIG_V1` đã parse (hoặc `undefined`), `lastAttemptRaw` là chuỗi số của khóa giờ thử cũ. Trả `{ credential, attempt }`; phần không có nguồn thì `null`. */
function fbmLoginMigratePlan(config, lastAttemptRaw) {
  var plan = { credential: null, attempt: null };
  if (config && FbmSync.LOGIN_POLICY_FIELDS.some(function (name) { return config[name] !== undefined; })) {
    var policy = new Error('Khóa ' + FbmSync.LOGIN_CONFIG_KEY + ' còn chính sách tự đăng nhập; chạy hàm chuyển fbmSettingsMigrate trước. Chưa chuyển gì.'); policy.code = 'FBM_LOGIN_MIGRATE_SETTINGS_PENDING'; throw policy;
  }
  if (config) {
    var credential = FbmSync.credentialShape({ credentialRef: config.credentialRef, ciphertext: config.envelope, public: config.public });
    if (credential.configured) { plan.credential = credential; }
  }
  if (config || lastAttemptRaw !== undefined) {
    var attempt = FbmSync.loginAttemptShape(config);
    attempt.lastAttemptAt = Math.max(attempt.lastAttemptAt, Number(lastAttemptRaw || 0));
    plan.attempt = attempt;
  }
  return plan;
}

function fbmLoginMigrate() {
  return runEntryPoint('fbmLoginMigrate', 'fbm_sync', function () {
    var first = fbmStoresMigrateLocked(function () {
      fbmStoresMigrateIdle();
      var props = FbmSync.props(), lastRaw = props.getProperty(FbmSync.LOGIN_OLD_KEYS[1]);
      var plan = fbmLoginMigratePlan(FbmSync.documentPropertyJson(FbmSync.LOGIN_CONFIG_KEY, 'khóa đăng nhập đời cũ') || undefined, lastRaw === null || lastRaw === '' ? undefined : lastRaw), expected = {};
      if (plan.credential && props.getProperty(FbmSync.CREDENTIAL_KEY) === null) {
        FbmSync.credentialWrite(plan.credential);
        expected[FbmSync.CREDENTIAL_KEY] = props.getProperty(FbmSync.CREDENTIAL_KEY);
      }
      if (plan.attempt && props.getProperty(FbmSync.LOGIN_ATTEMPT_KEY) === null) {
        FbmSync.loginAttemptWrite(plan.attempt);
        expected[FbmSync.LOGIN_ATTEMPT_KEY] = props.getProperty(FbmSync.LOGIN_ATTEMPT_KEY);
      }
      return { expected: expected, plan: plan };
    });

    documentStoreRefresh();
    var real = documentStoreReal(), written = Object.keys(first.expected);
    var mismatched = written.filter(function (key) { return real.getProperty(key) !== first.expected[key]; });
    if (mismatched.length) { var differ = new Error('Đọc lại kho không khớp ở ' + mismatched.join(', ') + '; khóa cũ giữ nguyên, chạy lại hàm chuyển.'); differ.code = 'FBM_LOGIN_MIGRATE_VERIFY_FAILED'; differ.detail = { keys: mismatched }; throw differ; }

    var deleted = fbmStoresMigrateLocked(function () {
      fbmStoresMigrateIdle();
      var props = FbmSync.props(), present = FbmSync.LOGIN_OLD_KEYS.filter(function (key) { return props.getProperty(key) !== null; });
      present.forEach(function (key) { FbmSync.propertyJsonWrite(key, null); });
      return present;
    });

    var report = written.length || deleted.length
      ? 'Đã ghi ' + (written.join(', ') || 'không khóa mới nào') + '; xóa ' + (deleted.join(', ') || 'không khóa cũ nào') + '.'
      : 'Không còn khóa đăng nhập đời cũ; không có gì để chuyển.';
    logEvent({ source: 'fbm_sync', action: 'fbmLoginMigrate', outcome: LOG_OK, reason: report, detail: { written: written, deleted: deleted } });
    var credential = first.plan.credential;
    return { ok: true, report: [report], written: written, deleted: deleted, credential: credential ? { credentialRef: credential.credentialRef, usernameHint: credential.public.usernameHint } : null, attempt: first.plan.attempt };
  });
}
