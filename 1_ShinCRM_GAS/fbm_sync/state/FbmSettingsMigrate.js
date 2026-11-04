/**
 * Chuyển một lần cài đặt FBM từ các khóa kho riêng đời cũ sang cổng cài đặt chung, rồi xóa khóa cũ. Chạy tay trong trình chỉnh sửa Apps Script (hoặc `node tests/gas.js fbmSettingsMigrate --push` trên Sheet DEV) ngay sau lần đẩy code đọc cài đặt qua cổng chung: từ lúc đẩy tới lúc chạy, đồng bộ đọc giá trị mặc định.
 *
 * Thứ tự như `settingsMigrateFromConfig`: đọc mọi khóa cũ, dựng kế hoạch theo đúng cách đọc của code cũ (để giá trị hiệu lực không đổi), kiểm **mọi** phần trước khi ghi, ghi cả gói, đọc lại từ kho thật so với kế hoạch, khớp đủ mới xóa khóa cũ và bỏ phần chính sách khỏi cấu hình đăng nhập. Có vấn đề ở bước nào thì ném lỗi kèm đủ danh sách và khóa cũ còn nguyên. Phần mới đã có trong kho mà khác kế hoạch thì chặn, để lần chạy lại không đè cài đặt người dùng vừa đặt ở màn mới.
 *
 * Tệp này là công cụ một lần: xóa cùng `server/dev/` trước khi đưa dữ liệu thật vào production, sau khi tệp production đã chạy nó.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa cũ → phần mới và cách dựng giá trị phần mới từ JSON cũ (đọc như code cũ: trường thiếu mang mặc định của code cũ). */
var FBM_SETTINGS_MIGRATE_SOURCES = {
  FBM_SYNC_SETTINGS_V1: { section: 'run', plan: function (old) {
    var values = {};
    ['approvalThreshold', 'requestGapMinSeconds', 'requestGapMaxSeconds'].forEach(function (name) { if (old[name] !== undefined && old[name] !== null) { values[name] = old[name]; } });
    if (old.scopeLimited !== undefined) { values.scopeLimited = old.scopeLimited !== false; }
    if (old.scopeCodes !== undefined) { values.scopeCodes = old.scopeCodes; }
    return values;
  } },
  FBM_ACCOUNT_SETTINGS_V1: { section: 'account', plan: function (old) {
    return { customerPrefix: old.customerPrefix === undefined ? '' : old.customerPrefix, customerCodeLength: old.customerCodeLength === undefined ? '' : old.customerCodeLength };
  } },
  FBM_SYNC_EXTENSION_CONFIG_V1: { section: 'extension', plan: function (old) {
    var values = { runOnStartup: old.runOnStartup !== false };
    if (old.pollMinutes !== undefined && old.pollMinutes !== null) { values.pollMinutes = old.pollMinutes; }
    return values;
  } },
  FBM_SYNC_BACKGROUND_SCHEDULE_V1: { section: 'background', plan: function (old) {
    // Code cũ: tiến trình thiếu hoặc thiếu `enabled` được coi là bật.
    var values = { enabled: old.enabled !== false };
    if (old.direction) { values.direction = old.direction; }
    FbmSync.SCHEDULE_KINDS.forEach(function (kind) {
      var item = old[kind] || {};
      values[kind + 'Enabled'] = item.enabled !== false;
      if (item.minutes !== undefined && item.minutes !== null) { values[kind + 'Minutes'] = item.minutes; }
    });
    if (old.detail && old.detail.customersPerRun !== undefined && old.detail.customersPerRun !== null) { values.detailCustomersPerRun = old.detail.customersPerRun; }
    return values;
  } }
};
/** Trường chính sách trong cấu hình đăng nhập cũ; phần còn lại (credential, lần thử) ở nguyên khóa đó. */
FbmSync.LOGIN_POLICY_FIELDS = ['enabled', 'autoOpenTab', 'retryEnabled', 'retryMinutes'];

/** Công cụ tính (thuần): từ khóa cũ đã đọc (`FBM_SYNC_ENABLED` là chuỗi, các khóa JSON đã qua `documentPropertyJson`) dựng `{ patches, sources, loginRest }`. */
function fbmSettingsMigratePlan(stored) {
  var plan = { patches: {}, sources: [], loginRest: null };
  if (stored.FBM_SYNC_ENABLED !== undefined) {
    plan.patches[FbmSync.SETTING_SECTIONS.master] = { enabled: stored.FBM_SYNC_ENABLED !== 'false' };
    plan.sources.push('FBM_SYNC_ENABLED');
  }
  Object.keys(FBM_SETTINGS_MIGRATE_SOURCES).forEach(function (key) {
    if (stored[key] === undefined) { return; }
    var source = FBM_SETTINGS_MIGRATE_SOURCES[key];
    plan.patches[FbmSync.SETTING_SECTIONS[source.section]] = source.plan(stored[key]);
    plan.sources.push(key);
  });
  var loginKey = FbmSync.LOGIN_CONFIG_KEY;
  var login = stored[loginKey];
  if (login !== undefined) {
    var hasPolicy = FbmSync.LOGIN_POLICY_FIELDS.some(function (name) { return login[name] !== undefined; });
    if (hasPolicy) {
      plan.patches[FbmSync.SETTING_SECTIONS.loginPolicy] = { enabled: login.enabled !== false, autoOpenTab: login.autoOpenTab === true, retryEnabled: login.retryEnabled !== false };
      if (login.retryMinutes !== undefined && login.retryMinutes !== null) { plan.patches[FbmSync.SETTING_SECTIONS.loginPolicy].retryMinutes = login.retryMinutes; }
      plan.loginRest = {};
      Object.keys(login).forEach(function (name) { if (FbmSync.LOGIN_POLICY_FIELDS.indexOf(name) < 0) { plan.loginRest[name] = login[name]; } });
      plan.sources.push(loginKey + ' (phần chính sách)');
    }
  }
  return plan;
}

/** Công cụ đọc: các khóa cũ còn trong kho. Khóa JSON hỏng thì `documentPropertyJson` ném `DOCUMENT_PROPERTY_CORRUPT` kèm tên khóa, chưa chuyển gì; sửa hoặc xóa khóa đó rồi chạy lại. */
function fbmSettingsMigrateRead() {
  var props = documentProps(), stored = {}, enabled = props.getProperty('FBM_SYNC_ENABLED');
  if (enabled !== null && enabled !== undefined) { stored.FBM_SYNC_ENABLED = enabled; }
  Object.keys(FBM_SETTINGS_MIGRATE_SOURCES).concat([FbmSync.LOGIN_CONFIG_KEY]).forEach(function (key) {
    var value = documentPropertyJson(props, key, 'cài đặt FBM đời cũ', 'object');
    if (value !== null) { stored[key] = value; }
  });
  return stored;
}

function fbmSettingsMigrate() {
  return runEntryPoint('fbmSettingsMigrate', 'fbm_sync', function () {
    var plan = fbmSettingsMigratePlan(fbmSettingsMigrateRead());
    var names = Object.keys(plan.patches), problems = [];
    if (!names.length) { return { ok: true, report: ['Không còn khóa cài đặt FBM đời cũ; không có gì để chuyển.'] }; }

    // Kiểm mọi phần trên phần thay đổi phủ lên rỗng (không phủ lên kho mới), rồi so với phần mới nếu kho đã có.
    var checked = {};
    names.forEach(function (name) {
      var section = settingsSection(name), result = settingsValidate(section, Object.assign(settingsEmpty(section), plan.patches[name]), {});
      result.problems.forEach(function (p) { problems.push(section.label + ' › ' + p.reason); });
      checked[name] = result.values;
      var existing = documentProps().getProperty(settingsKey(section));
      if (existing !== null && existing !== undefined && existing !== JSON.stringify(result.values)) {
        problems.push(section.label + ': kho mới đã có giá trị khác giá trị cũ (' + settingsKey(section) + '); xem lại rồi xóa một trong hai trước khi chạy lại.');
      }
    });
    if (problems.length) {
      throw new Error('Chưa chuyển gì, khóa cũ giữ nguyên:\n- ' + problems.join('\n- '));
    }

    var saved = settingsSave(checked);
    if (!saved.ok) { throw new Error('Lưu cài đặt không đạt: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }

    // Đọc lại từ kho thật (bỏ bản đọc của lần gọi), không tin bản vừa ghi trong bộ nhớ.
    documentStoreRefresh();
    var mismatched = names.filter(function (name) { return JSON.stringify(settingsRead(settingsSection(name))) !== JSON.stringify(checked[name]); });
    if (mismatched.length) {
      throw new Error('Đọc lại kho không khớp ở: ' + mismatched.join(', ') + '. Khóa cũ giữ nguyên; chạy lại sau ít phút.');
    }

    documentLockRun(function () {
      var props = documentProps();
      ['FBM_SYNC_ENABLED'].concat(Object.keys(FBM_SETTINGS_MIGRATE_SOURCES)).forEach(function (key) {
        if (props.getProperty(key) !== null) { props.deleteProperty(key); }
      });
      if (plan.loginRest) { props.setProperty(FbmSync.LOGIN_CONFIG_KEY, JSON.stringify(plan.loginRest)); }
    }, 'Đang có thao tác khác giữ khóa tệp; chạy lại sau ít giây.');

    var report = ['Đã chuyển ' + plan.sources.length + ' khóa cũ (' + plan.sources.join(', ') + ') sang ' + names.length + ' phần (' + names.join(', ') + ') và xóa khóa cũ.'];
    logEvent({ source: 'fbm_sync', action: 'fbmSettingsMigrate', outcome: LOG_OK, reason: report[0], detail: { sources: plan.sources, sections: names } });
    return { ok: true, report: report, sources: plan.sources.length, sections: names.length };
  });
}
