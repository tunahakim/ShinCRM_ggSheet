/** Dựng, hướng dẫn, di chuyển cấu trúc cũ và khôi phục sheet `Config`. */

var CONFIG_LEGACY_COUNTER_COLUMNS = {
  key: '@CFG_BO_DEM_LOAI',
  value: '@CFG_BO_DEM_GIA_TRI'
};

var CONFIG_COLUMN_NOTES = {
  '@CFG_THAM_SO': 'Tên tham số ShinCRM hỗ trợ. Chọn trong danh sách; mỗi tên chỉ xuất hiện một lần.',
  '@CFG_THAM_SO_GIA_TRI': 'Giá trị của tham số cùng hàng. Quy tắc nhập và giá trị mặc định nằm trong ghi chú của từng ô.',
  '@CFG_COT_MA': 'Mã cột tự thêm trong Customer hoặc Activity, bắt đầu bằng @CUS_ hoặc @ACT_. Mỗi mã chỉ khai một lần.',
  '@CFG_COT_KIEU': 'Kiểu dữ liệu của mã cột tự thêm cùng hàng: TEXT, NUMBER, DATE hoặc SELECT.',
  '@CFG_NGAM_DINH_MA_COT': 'Mã cột cần điền sẵn khi mở form tạo mới. Chọn từ mã thật đang có trong Customer và Activity.',
  '@CFG_NGAM_DINH_GIA_TRI': 'Giá trị điền sẵn cho mã cột cùng hàng. Giá trị phải đúng kiểu và đúng danh mục của trường đó.',
  '@CFG_SORT_COL': 'Mã cột dùng để sắp xếp chung cho các sheet quản trị chưa khai sắp xếp riêng. Thứ tự từ trên xuống là thứ tự ưu tiên.',
  '@CFG_SORT_LEVEL': 'Chiều sắp xếp của mã cột cùng hàng. Hàng thiếu một vế được bỏ qua.'
};

function configSheetHeader(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return []; }
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || '').trim(); });
}

/** Đọc xong và kiểm đủ dữ liệu cũ rồi mới xóa hai cột, để một loại lạ không bị mất âm thầm. */
function configMigrateLegacyCounters(sheet) {
  var header = configSheetHeader(sheet);
  var keyColumns = [];
  var valueColumns = [];
  header.forEach(function (code, index) {
    if (code === CONFIG_LEGACY_COUNTER_COLUMNS.key) { keyColumns.push(index + 1); }
    if (code === CONFIG_LEGACY_COUNTER_COLUMNS.value) { valueColumns.push(index + 1); }
  });

  if (!keyColumns.length && !valueColumns.length) { return { found: false, values: {}, removedColumns: 0 }; }
  if (keyColumns.length !== 1 || valueColumns.length !== 1) {
    throw new Error('Config cũ phải có đúng một cột ' + CONFIG_LEGACY_COUNTER_COLUMNS.key + ' và một cột ' + CONFIG_LEGACY_COUNTER_COLUMNS.value + ' trước khi di chuyển bộ đếm.');
  }

  var firstRow = SHEET_FIRST_DATA_ROW;
  var rowCount = Math.max(0, sheet.getLastRow() - firstRow + 1);
  var values = {};
  var seen = {};
  var unknown = [];
  if (rowCount > 0) {
    var startColumn = Math.min(keyColumns[0], valueColumns[0]);
    var width = Math.max(keyColumns[0], valueColumns[0]) - startColumn + 1;
    var rows = sheet.getRange(firstRow, startColumn, rowCount, width).getValues();
    var keyOffset = keyColumns[0] - startColumn;
    var valueOffset = valueColumns[0] - startColumn;
    rows.forEach(function (row) {
      var legacyType = String(row[keyOffset] || '').trim().toLowerCase();
      var raw = row[valueOffset];
      var hasValue = raw !== '' && raw !== null && raw !== undefined;
      if (!legacyType) {
        if (hasValue) { unknown.push('(ô loại trống)'); }
        return;
      }
      if (legacyType !== 'customer' && legacyType !== 'activity') {
        unknown.push(legacyType);
        return;
      }
      if (seen[legacyType]) { throw new Error('Khối bộ đếm cũ của Config có loại khai trùng: ' + legacyType + '.'); }
      seen[legacyType] = true;
      var rawText = String(raw).trim();
      if (hasValue && !/^\d+$/.test(rawText)) { throw new Error('Bộ đếm cũ "' + legacyType + '" không phải số không âm.'); }
      var number = hasValue ? Number(rawText) : 0;
      if (!isFinite(number) || number < 0) { throw new Error('Bộ đếm cũ "' + legacyType + '" không phải số không âm.'); }
      values[legacyType] = number;
    });
  }

  if (unknown.length) {
    throw new Error('Config cũ có loại bộ đếm không được ShinCRM biết: ' + unknown.join(', ') + '. Chưa xóa cột cũ; hãy kiểm tra dữ liệu này trước.');
  }

  [keyColumns[0], valueColumns[0]].sort(function (a, b) { return b - a; }).forEach(function (column) {
    sheet.deleteColumn(column);
  });
  return { found: true, values: values, removedColumns: 2 };
}

function configWriteFrame(sheet) {
  var rows = [
    CONFIG_COLUMNS.map(function (column) { return column[0]; }),
    CONFIG_COLUMNS.map(function (column) { return column[1]; }),
    CONFIG_COLUMNS.map(function () { return ''; })
  ];
  sheet.getRange(1, 1, SHEET_HEADER_ROWS, CONFIG_COLUMNS.length).setValues(rows);
  sheet.getRange(1, 1, 1, CONFIG_COLUMNS.length).setFontWeight('bold').setBackground(SHEET_LAYOUT.Config.headerColor);
  sheet.getRange(2, 1, 1, CONFIG_COLUMNS.length).setFontWeight('bold');
  sheet.setFrozenRows(SHEET_HEADER_ROWS);
}

function configSourceCodes() {
  return ['Customer', 'Activity'].reduce(function (result, sheetName) {
    var prefix = sheetName === 'Customer' ? '@CUS_' : '@ACT_';
    return result.concat(readColumnMap(sheetName).headerRow.filter(function (code) { return code.indexOf(prefix) === 0; }));
  }, []);
}

function configCounterMaxima() {
  return {
    customer: idGateMaxOnSheet(entityReadContext('customer')),
    activity: idGateMaxOnSheet(entityReadContext('activity'))
  };
}

/** Gieo danh mục; chạy thường giữ giá trị cũ, còn reset ghi đúng mặc định và bộ đếm được truyền vào. */
function seedConfigParams(file, initialCounters, resetValues) {
  var sheet = file.getSheetByName('Config');
  var columnMap = readColumnMap('Config');
  var nameColumn = columnIndex(columnMap, '@CFG_THAM_SO');
  var valueColumn = columnIndex(columnMap, '@CFG_THAM_SO_GIA_TRI');
  var firstRow = SHEET_LAYOUT.Config.firstDataRow;
  var lastRow = sheet.getLastRow();
  var rowOfName = {};
  var lastFilled = firstRow - 1;

  if (lastRow >= firstRow) {
    sheet.getRange(firstRow, nameColumn, lastRow - firstRow + 1, 1).getValues().forEach(function (row, index) {
      var name = String(row[0] || '').trim();
      if (!name) { return; }
      lastFilled = firstRow + index;
      if (!rowOfName[name]) { rowOfName[name] = firstRow + index; }
    });
  }

  var catalog = configParamCatalog();
  var missing = catalog.filter(function (item) { return !rowOfName[item.name]; });
  var counters = initialCounters || {};
  function desiredValue(item) {
    if (item.name === ID_COUNTER_CONFIG_NAMES.customer && counters.customer !== undefined) { return counters.customer; }
    if (item.name === ID_COUNTER_CONFIG_NAMES.activity && counters.activity !== undefined) { return counters.activity; }
    return item.defaultValue;
  }
  if (missing.length) {
    sheetGridEnsureRoom(sheet, lastFilled + missing.length, 0);
    sheet.getRange(lastFilled + 1, nameColumn, missing.length, 2).setValues(missing.map(function (item) { return [item.name, desiredValue(item)]; }));
    missing.forEach(function (item, index) { rowOfName[item.name] = lastFilled + 1 + index; });
  }

  catalog.forEach(function (item) {
    var row = rowOfName[item.name];
    var valueCell = sheet.getRange(row, valueColumn);
    var desired = desiredValue(item);
    var wasMissing = missing.some(function (missingItem) { return missingItem.name === item.name; });
    var current = valueCell.getValue();
    var isEmpty = String(current === null || current === undefined ? '' : current).trim() === '';
    if (!wasMissing && (resetValues || isEmpty)) {
      if (resetValues || item.owner === CONFIG_PARAM_OWNER_SYSTEM || desired !== '') { valueCell.setValue(desired); }
    }
    sheet.getRange(row, nameColumn).setNote(item.note);
    valueCell.setNote(item.note + '\n\n' + (item.owner === CONFIG_PARAM_OWNER_SYSTEM ? 'Giá trị này do hệ thống sở hữu; không sửa bằng tay.' : 'Giá trị này do người dùng cấu hình.'));
  });

  resetSettingsCache();
  return { total: catalog.length, added: missing.map(function (item) { return item.name; }), rows: rowOfName };
}

function configValidationList(values, note) {
  return SpreadsheetApp.newDataValidation().requireValueInList(values, true).setAllowInvalid(false).setHelpText(note).build();
}

function configParamValueValidation(item) {
  if (item.options && item.options.length) { return configValidationList(item.options, item.note); }
  var builder = SpreadsheetApp.newDataValidation().setAllowInvalid(false).setHelpText(item.note);
  if (item.type === 'NUMBER') {
    return builder.requireNumberGreaterThanOrEqualTo(item.minimum === undefined ? 0 : item.minimum).build();
  }
  if (item.type === 'DATE') { return builder.requireDate().build(); }
  return null;
}

function configApplyGuidance(sheet, paramRows) {
  var columnMap = readColumnMap('Config');
  Object.keys(CONFIG_COLUMN_NOTES).forEach(function (code) {
    sheet.getRange(3, columnIndex(columnMap, code)).setNote(CONFIG_COLUMN_NOTES[code]);
  });
  if (typeof SpreadsheetApp.newDataValidation !== 'function') { return; }

  var firstRow = SHEET_FIRST_DATA_ROW;
  var rowCount = Math.max(1, sheet.getMaxRows() - firstRow + 1);
  var sourceCodes = configSourceCodes();
  var nameColumn = columnIndex(columnMap, '@CFG_THAM_SO');
  var valueColumn = columnIndex(columnMap, '@CFG_THAM_SO_GIA_TRI');
  sheet.getRange(firstRow, nameColumn, rowCount, 1).setDataValidation(configValidationList(configParamNames(), CONFIG_COLUMN_NOTES['@CFG_THAM_SO']));
  sheet.getRange(firstRow, columnIndex(columnMap, '@CFG_COT_KIEU'), rowCount, 1).setDataValidation(configValidationList(DATA_TYPES, CONFIG_COLUMN_NOTES['@CFG_COT_KIEU']));
  sheet.getRange(firstRow, columnIndex(columnMap, '@CFG_NGAM_DINH_MA_COT'), rowCount, 1).setDataValidation(configValidationList(sourceCodes, CONFIG_COLUMN_NOTES['@CFG_NGAM_DINH_MA_COT']));
  sheet.getRange(firstRow, columnIndex(columnMap, '@CFG_SORT_COL'), rowCount, 1).setDataValidation(configValidationList(sourceCodes, CONFIG_COLUMN_NOTES['@CFG_SORT_COL']));
  sheet.getRange(firstRow, columnIndex(columnMap, '@CFG_SORT_LEVEL'), rowCount, 1).setDataValidation(configValidationList(SORT_LEVEL_OPTIONS, CONFIG_COLUMN_NOTES['@CFG_SORT_LEVEL']));

  configParamCatalog().forEach(function (item) {
    var rule = configParamValueValidation(item);
    if (rule) { sheet.getRange(paramRows[item.name], valueColumn).setDataValidation(rule); }
  });
}

function prepareConfigSheet(file, options) {
  var opts = options || {};
  var sheet = file.getSheetByName('Config') || file.insertSheet('Config');
  var migration = configMigrateLegacyCounters(sheet);
  var maxima = configCounterMaxima();
  var counters = {
    customer: opts.reset ? maxima.customer : (migration.values.customer === undefined ? maxima.customer : migration.values.customer),
    activity: opts.reset ? maxima.activity : (migration.values.activity === undefined ? maxima.activity : migration.values.activity)
  };

  configWriteFrame(sheet);
  if (opts.reset) {
    var rows = sheet.getMaxRows() - SHEET_FIRST_DATA_ROW + 1;
    if (rows > 0) {
      sheet.getRange(SHEET_FIRST_DATA_ROW, 1, rows, CONFIG_COLUMNS.length).clearContent();
      var dataRange = sheet.getRange(SHEET_FIRST_DATA_ROW, 1, rows, CONFIG_COLUMNS.length);
      if (typeof dataRange.clearDataValidations === 'function') {
        dataRange.clearDataValidations();
      }
    }
  }

  var seeded = seedConfigParams(file, counters, opts.reset === true);
  configApplyGuidance(sheet, seeded.rows);
  return { sheet: sheet, migration: migration, seeded: seeded, counters: counters };
}

/** Khôi phục chỉ Config; hai kho dữ liệu được đọc để tính bộ đếm nhưng không bị ghi. */
function resetConfigToDefaults() {
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận. Vui lòng thử lại!'); }
  try {
    var file = shinOpenBook();
    var result = prepareConfigSheet(file, { reset: true });
    var views = file.getSheets().map(function (sheet) { return sheet.getName(); }).filter(function (name) { return name.charAt(0) === '!'; });
    dirtyStateMarkConfig();
    dirtyStateMarkViewSheets(views);
    return { ok: true, counters: result.counters, viewSheets: views, params: configUserParams(configParams()) };
  } finally {
    lock.releaseLock();
  }
}
