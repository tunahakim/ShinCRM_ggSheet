/**
 * Chuyển dữ liệu một lần từ sheet `Config` cũ sang cổng cài đặt, rồi xóa sheet. Chạy tay trong trình chỉnh sửa Apps Script (hoặc `node tests/gas.js settingsMigrateFromConfig --push` trên Sheet DEV).
 *
 * Thứ tự cố định: đọc cả sheet, dựng kế hoạch, kiểm **mọi** phần trước khi ghi phần nào, ghi, đọc lại từ kho thật so với kế hoạch, khớp đủ mới xóa sheet. Có vấn đề ở bất kỳ bước nào thì ném lỗi kèm đủ danh sách: `runEntryPoint` ghi Log và phát thông báo, sheet `Config` còn nguyên để sửa rồi chạy lại.
 *
 * Tệp này là công cụ một lần: xóa cùng `server/dev/` trước khi đưa dữ liệu thật vào production, sau khi tệp production đã chạy nó.
 */

/** Tên tham số cũ → chỗ ở mới. `defaults_fbm_pull` lưu theo thực thể + trường như mọi phần ngầm định. */
var SETTINGS_MIGRATE_PARAMS = {
  LOG_TRACE: { section: 'core_ops', field: LOG_TRACE_SETTING },
  CELL_BUDGET: { section: 'core_ops', field: CELL_BUDGET_SETTING },
  USER_NAME: { section: 'core_ops', field: USER_NAME_SETTING },
  FBM_VERIFY_STATUS_DEFAULT: { section: 'defaults_fbm_pull', entity: 'customer', field: 'verifyStatus' }
};

/** Tham số FBM đời cũ: `fbm_sync` đã chuyển chúng vào DocumentProperties riêng từ trước, nên chỉ bỏ qua được khi khóa của FBM đã có; chưa có thì chặn để không mất giá trị. `FBM_SPREADSHEET_ID` là phép đối chiếu đã bỏ. */
var SETTINGS_MIGRATE_FBM_LEGACY = {
  FBM_SYNC_APPROVAL_THRESHOLD: 'FBM_SYNC_SETTINGS_V1',
  FBM_MA_KH_PREFIX: 'FBM_ACCOUNT_SETTINGS_V1',
  FBM_MA_KH_TIEN_TO: 'FBM_ACCOUNT_SETTINGS_V1',
  FBM_MA_KH_LENGTH: 'FBM_ACCOUNT_SETTINGS_V1',
  FBM_MA_KH_DO_DAI: 'FBM_ACCOUNT_SETTINGS_V1',
  FBM_SPREADSHEET_ID: ''
};

/** Công cụ đọc: cả sheet `Config` thành các cặp cột theo mã hàng 1. Trả `{ pairs(keyCode, valueCode) → [[khóa, giá trị]] }` theo thứ tự hàng. */
function settingsMigrateReadConfig(sheet) {
  var block = sheetReadBlock(sheet, { data: 'all' });
  var rows = sheetReadBlockRows(block, SHEET_FIRST_DATA_ROW);
  var header = block.header.map(function (code) { return String(code || '').trim(); });
  return {
    pairs: function (keyCode, valueCode) {
      var keyAt = header.indexOf(keyCode), valueAt = header.indexOf(valueCode);
      if (keyAt < 0 || valueAt < 0) { return []; }
      return rows.map(function (row) { return [settingsKindText(row[keyAt]), settingsKindText(row[valueAt])]; })
        .filter(function (pair) { return pair[0] || pair[1]; });
    }
  };
}

/** Mã cột → `{ entity, name }` của `DATA_SCHEMA`; `null` khi không có. */
function settingsMigrateFieldOf(code) {
  var found = null;
  Object.keys(DATA_SCHEMA).some(function (entity) {
    return Object.keys(DATA_SCHEMA[entity]).some(function (name) {
      if (DATA_SCHEMA[entity][name].code !== code) { return false; }
      found = { entity: entity, name: name };
      return true;
    });
  });
  return found;
}

/**
 * Công cụ tính (thuần): kế hoạch chuyển từ dữ liệu đã đọc. `storedKeys` là tập khóa DocumentProperties đang có (để biết FBM đã lưu cài đặt riêng chưa). Trả `{ sections: { tên phần: giá trị }, counters: { entity: số }, ignored: [dòng], problems: [dòng] }`.
 */
function settingsMigratePlan(config, storedKeys) {
  var plan = { sections: { core_ops: {}, core_data: { columnTypes: {}, sort: [] }, defaults_sidebar: { values: {} }, defaults_fbm_pull: { values: {} } }, counters: {}, ignored: [], problems: [] };
  var counterOf = {};
  Object.keys(ID_GATE_COUNTER_KEYS).forEach(function (entity) { counterOf[ID_GATE_COUNTER_KEYS[entity]] = entity; });
  var seen = function (label) { var keys = {}; return function (key) { if (keys[key]) { plan.problems.push(label + ': "' + key + '" khai hai dòng.'); return true; } keys[key] = true; return false; }; };

  var paramSeen = seen('Tham số');
  config.pairs('@CFG_THAM_SO', '@CFG_THAM_SO_GIA_TRI').forEach(function (pair) {
    var name = pair[0], value = pair[1];
    if (!name) { plan.problems.push('Tham số không tên mang giá trị "' + value + '".'); return; }
    if (paramSeen(name)) { return; }
    var target = SETTINGS_MIGRATE_PARAMS[name];
    if (target && target.entity) {
      if (value) { plan.sections[target.section].values[target.entity] = { verifyStatus: value }; }
      return;
    }
    // Ô LOG_TRACE trống ở Config cũ nghĩa là tắt.
    if (target) { plan.sections[target.section][target.field] = name === 'LOG_TRACE' && !value ? 'off' : value; return; }
    if (counterOf[name]) { if (value) { plan.counters[counterOf[name]] = value; } return; }
    if (Object.prototype.hasOwnProperty.call(SETTINGS_MIGRATE_FBM_LEGACY, name)) {
      var fbmKey = SETTINGS_MIGRATE_FBM_LEGACY[name];
      if (!value || !fbmKey || storedKeys[fbmKey]) { plan.ignored.push(name + (value ? ' = "' + value + '"' : '') + (fbmKey ? ' (FBM đã lưu cài đặt riêng)' : ' (đã bỏ)')); return; }
      plan.problems.push('Tham số FBM ' + name + ' = "' + value + '" chưa được chuyển sang cài đặt FBM (' + fbmKey + '): mở Cài đặt phiên FBM lưu một lần rồi chạy lại.');
      return;
    }
    if (value) { plan.problems.push('Tham số lạ ' + name + ' = "' + value + '": không biết chuyển đi đâu.'); }
  });

  var typeSeen = seen('Kiểu cột tự thêm');
  config.pairs('@CFG_COT_MA', '@CFG_COT_KIEU').forEach(function (pair) {
    if (!typeSeen(pair[0])) { plan.sections.core_data.columnTypes[pair[0]] = pair[1]; }
  });

  config.pairs('@CFG_SORT_COL', '@CFG_SORT_LEVEL').forEach(function (pair) {
    if (pair[0] && pair[1]) { plan.sections.core_data.sort.push({ col: pair[0], level: pair[1] }); return; }
    plan.ignored.push('Cấp sắp xếp thiếu một vế: ' + pair.join(' / '));
  });

  var defaultSeen = seen('Ngầm định');
  config.pairs('@CFG_NGAM_DINH_MA_COT', '@CFG_NGAM_DINH_GIA_TRI').forEach(function (pair) {
    if (defaultSeen(pair[0])) { return; }
    var field = settingsMigrateFieldOf(pair[0]);
    if (!field) { plan.problems.push('Ngầm định cho mã cột lạ ' + pair[0] + '.'); return; }
    var values = plan.sections.defaults_sidebar.values;
    values[field.entity] = values[field.entity] || {};
    values[field.entity][field.name] = pair[1];
  });
  return plan;
}

function settingsMigrateFromConfig() {
  return runEntryPoint('settingsMigrateFromConfig', 'core', function () {
    var sheet = shinOpenBook().getSheetByName('Config');
    if (!sheet) { return { ok: true, report: ['Không còn sheet Config; không có gì để chuyển.'] }; }

    var plan = settingsMigratePlan(settingsMigrateReadConfig(sheet), documentProps().getProperties());
    var category = categoryReadAll();
    var checked = {};
    Object.keys(plan.sections).forEach(function (name) {
      var result = settingsValidate(settingsSection(name), plan.sections[name], { category: category });
      result.problems.forEach(function (p) { plan.problems.push(settingsSection(name).label + ' › ' + p.reason); });
      checked[name] = result.values;
    });
    if (plan.problems.length) {
      throw new Error('Chưa chuyển gì, sheet Config giữ nguyên. Sửa ở sheet Config rồi chạy lại:\n- ' + plan.problems.join('\n- '));
    }

    documentLockRun(function () {
      Object.keys(checked).forEach(function (name) {
        var saved = settingsSave(name, checked[name]);
        if (!saved.ok) { throw new Error('Lưu phần ' + name + ' không đạt: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
      });
      Object.keys(plan.counters).forEach(function (entity) { idGateAdoptCounter(entity, plan.counters[entity]); });
    });

    // Đọc lại từ kho thật (bỏ bản đọc của lần gọi), không tin bản vừa ghi trong bộ nhớ.
    documentStoreRefresh();
    var mismatched = Object.keys(checked).filter(function (name) {
      return JSON.stringify(settingsRead(settingsSection(name))) !== JSON.stringify(checked[name]);
    });
    Object.keys(plan.counters).forEach(function (entity) {
      if (!idGateCounterRead(entity).stored) { mismatched.push('bộ đếm ' + entity); }
    });
    if (mismatched.length) {
      throw new Error('Đọc lại kho không khớp ở: ' + mismatched.join(', ') + '. Sheet Config giữ nguyên; chạy lại sau ít phút.');
    }

    sheetBookDeleteLegacyConfig(sheet);
    var report = ['Đã chuyển ' + Object.keys(checked).join(', ') + ' và xóa sheet Config.'].concat(plan.ignored.map(function (line) { return 'Bỏ qua: ' + line; }));
    logEvent({ source: 'core', action: 'settingsMigrateFromConfig', outcome: LOG_OK, reason: report[0], detail: { ignored: plan.ignored, counters: Object.keys(plan.counters) } });
    return { ok: true, report: report };
  });
}
