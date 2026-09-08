/** Vẽ một sheet quản trị từ kho Customer/Activity. Sheet quản trị không bao giờ là nguồn sự thật. */

/** Áp dụng hiến pháp đọc cột: Code Schema, rồi Sheet Schema, cuối cùng mặc định TEXT. */
function viewFieldMaps(sheetSchema, sourceHeaders) {
  var byCode = {};
  Object.keys(DATA_SCHEMA).forEach(function (entity) {
    Object.keys(DATA_SCHEMA[entity]).forEach(function (name) { byCode[DATA_SCHEMA[entity][name].code] = DATA_SCHEMA[entity][name]; });
  });

  Object.keys(sheetSchema || {}).forEach(function (code) {
    if (byCode[code]) { return; }
    var type = String(sheetSchema[code] || '').trim().toUpperCase();
    byCode[code] = { code: code, type: DATA_TYPES.indexOf(type) >= 0 ? type : 'TEXT' };
  });
  (sourceHeaders || []).forEach(function (code) {
    if (code && code.charAt(0) === '@' && !byCode[code]) { byCode[code] = { code: code, type: 'TEXT' }; }
  });
  return byCode;
}

function viewSourceFieldMaps(fieldByCode, sourceHeaders) {
  var sourceFields = {};
  (sourceHeaders || []).forEach(function (code) {
    if (/^@(CUS|ACT)_/.test(code) && fieldByCode[code]) { sourceFields[code] = fieldByCode[code]; }
  });
  return sourceFields;
}

function viewReadCell(value, field, timezone) {
  var spec = field;
  if (field.type === 'DATE' && !field.precision) { spec = { type: 'DATE', precision: 'minute' }; }
  return entityReadCell(value, spec, timezone);
}

/** Đọc mọi cột đúng tiền tố từ kho, kể cả cột không có trong DATA_SCHEMA. */
function viewReadEntity(context, fieldByCode) {
  var prefix = context.entity === 'customer' ? '@CUS_' : '@ACT_';
  var codes = context.columnMap.headerRow.filter(function (code) { return code.indexOf(prefix) === 0; });
  var rawRows = sheetGridReadBlock(context.sheet, SHEET_FIRST_DATA_ROW, context.rowCount, context.columnMap.lastColumn);
  var idCode = DATA_SCHEMA[context.entity].id.code;
  var rows = [];

  rawRows.forEach(function (raw) {
    var values = {};
    codes.forEach(function (code) {
      values[code] = viewReadCell(raw[context.columnMap.map[code] - 1], fieldByCode[code], context.timezone);
    });
    if (values[idCode]) { rows.push(values); }
  });
  return rows;
}

function viewLatestActivity(activities) {
  var latest = {};
  var statusCode = DATA_SCHEMA.activity.recordStatus.code;
  var customerCode = DATA_SCHEMA.activity.customerId.code;
  var dateCode = DATA_SCHEMA.activity.workDate.code;
  var idCode = DATA_SCHEMA.activity.id.code;
  activities.forEach(function (activity) {
    var customerId = activity[customerCode];
    if (String(activity[statusCode] || '') === 'deleted' || !customerId) { return; }
    var old = latest[customerId];
    var newer = !old || String(activity[dateCode] || '') > String(old[dateCode] || '') || (String(activity[dateCode] || '') === String(old[dateCode] || '') && String(activity[idCode] || '') > String(old[idCode] || ''));
    if (newer) { latest[customerId] = activity; }
  });
  return latest;
}

function viewValues(customer, activity) {
  var values = {};
  Object.keys(customer || {}).forEach(function (code) { values[code] = customer[code]; });
  Object.keys(activity || {}).forEach(function (code) { values[code] = activity[code]; });
  return values;
}

function viewHeaderMap(header, sheetName) {
  var map = {};
  var duplicates = [];
  header.forEach(function (code, i) {
    if (!code) { return; }
    if (code.charAt(0) === '@' && map[code]) { duplicates.push(code); }
    else { map[code] = i + 1; }
  });
  if (duplicates.length) { throw new Error('Sheet "' + sheetName + '" có mã ' + duplicates.join(', ') + ' xuất hiện hai lần ở hàng 1. Mỗi mã chỉ được có một cột.'); }
  return map;
}

function viewWritableColumns(header, customerContext, activityContext) {
  return header.map(function (code, i) {
    var source = code.indexOf('@CUS_') === 0 ? customerContext : code.indexOf('@ACT_') === 0 ? activityContext : null;
    if (!source) { return 0; }
    if (!source.columnMap.map[code]) { throw new Error('Không tìm thấy cột ' + code + ' trong sheet kho ' + source.sheetName + '. Sheet chưa được vẽ lại.'); }
    return i + 1;
  }).filter(function (column) { return column > 0; });
}

function viewSortRows(rows, specs) {
  var list = specs.slice();
  list.push({ code: DATA_SCHEMA.customer.id.code, direction: 'desc', field: DATA_SCHEMA.customer.id });
  return rows.sort(sortSpecComparator(list, function (row, code) { return row.values[code]; }));
}

function viewReadSortPairs(sheet, headerMap, firstRow, lastRow) {
  var colAt = headerMap['@VIEW_SORT_COL'];
  var levelAt = headerMap['@VIEW_SORT_LEVEL'];
  if (!colAt || !levelAt || lastRow < firstRow) { return []; }
  var rows = sheet.getRange(firstRow, 1, lastRow - firstRow + 1, Math.max(colAt, levelAt)).getValues();
  return rows.map(function (row) { return { col: String(row[colAt - 1] || '').trim(), level: String(row[levelAt - 1] || '').trim() }; });
}

function viewColumnA1(column, row) {
  var label = '';
  var n = column;
  while (n > 0) { n -= 1; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label + row;
}

function viewColumnSpans(columns) {
  var sorted = columns.slice().sort(function (a, b) { return a - b; });
  var spans = [];
  sorted.forEach(function (column) {
    var last = spans[spans.length - 1];
    if (last && column === last[0] + last[1]) { last[1] += 1; }
    else { spans.push([column, 1]); }
  });
  return spans;
}

/** Đọc lại bản đồ dòng hiện có sau khi trigger đã làm mới sheet mà sidebar không nhận được giá trị trả về. */
function viewSheetRowMaps(sheet, sheetName) {
  var maps = {};
  var rowMap = {};
  maps[sheetName] = rowMap;
  var idColumn = selectionColumnIndex(sheet, DATA_SCHEMA.customer.id.code);
  if (!idColumn || sheet.getLastRow() < SHEET_FIRST_DATA_ROW) { return maps; }
  var values = sheet.getRange(SHEET_FIRST_DATA_ROW, idColumn, sheet.getLastRow() - SHEET_FIRST_DATA_ROW + 1, 1).getValues();
  values.forEach(function (row, i) {
    if (row[0] !== '' && row[0] !== null && row[0] !== undefined) { rowMap[String(SHEET_FIRST_DATA_ROW + i)] = String(row[0]); }
  });
  return maps;
}

function viewRenderSheetLocked(book, sheet, name) {
  var config = configReadAll();
  var customerContext = entityReadContext('customer');
  var activityContext = entityReadContext('activity');
  var sourceHeaders = customerContext.columnMap.headerRow.concat(activityContext.columnMap.headerRow);
  var fieldByCode = viewFieldMaps(config.sheetSchema, sourceHeaders);
  var sourceFieldByCode = viewSourceFieldMaps(fieldByCode, sourceHeaders);
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    dirtyStateClearViewSheet(name);
    var emptyMaps = {}; emptyMaps[name] = {};
    return { ok: true, sheetName: name, rowMaps: emptyMaps, rows: 0 };
  }
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || '').trim(); });
  var filterRow = sheet.getRange(3, 1, 1, lastColumn).getValues()[0];
  var headerMap = viewHeaderMap(header, name);
  var writable = viewWritableColumns(header, customerContext, activityContext);
  var filters = {};
  var filterErrors = [];
  writable.forEach(function (column) {
    var raw = String(filterRow[column - 1] || '').trim();
    if (!raw) { return; }
    var parsed = filterParseCell(raw, fieldByCode[header[column - 1]]);
    if (parsed.errors.length) { parsed.errors.forEach(function (error) { filterErrors.push({ cell: viewColumnA1(column, 3), error: error }); }); }
    else { filters[column] = parsed; }
  });
  if (filterErrors.length) { throw new Error(filterErrors.map(function (item) { return 'Sheet "' + name + '", ô ' + item.cell + ': bạn gõ "' + item.error.raw + '". ' + item.error.reason + ' ' + item.error.hint + ' Sheet chưa được vẽ lại.'; }).join('\n')); }

  var localSort = sortSpecParse(viewReadSortPairs(sheet, headerMap, SHEET_FIRST_DATA_ROW, sheet.getLastRow()), sourceFieldByCode);
  if (localSort.errors.length) { throw new Error(localSort.errors.join('\n') + '\nSheet chưa được vẽ lại.'); }
  var configSort = localSort.specs.length ? { specs: [], errors: [] } : sortSpecParse(config.sort, sourceFieldByCode);
  if (configSort.errors.length) { throw new Error(configSort.errors.join('\n') + '\nSheet chưa được vẽ lại.'); }
  var specs = localSort.specs.length ? localSort.specs : configSort.specs.length ? configSort.specs : [
    { code: DATA_SCHEMA.activity.workDate.code, direction: 'desc', field: DATA_SCHEMA.activity.workDate },
    { code: DATA_SCHEMA.activity.id.code, direction: 'desc', field: DATA_SCHEMA.activity.id }
  ];

  var customers = viewReadEntity(customerContext, fieldByCode);
  var activities = viewLatestActivity(viewReadEntity(activityContext, fieldByCode));
  var customerIdCode = DATA_SCHEMA.customer.id.code;
  var rows = customers.map(function (customer) {
    var activity = activities[customer[customerIdCode]];
    var values = viewValues(customer, activity);
    var filtered = false;
    writable.forEach(function (column) {
      var code = header[column - 1];
      if (filters[column] && !filterCellMatches(values[code], filters[column], fieldByCode[code])) { filtered = true; }
    });
    return { customer: customer, values: values, filtered: filtered };
  }).filter(function (row) { return !row.filtered; });
  viewSortRows(rows, specs);

  var spans = viewColumnSpans(writable);
  var oldLast = Math.max(sheet.getLastRow(), SHEET_FIRST_DATA_ROW - 1);
  var oldRows = oldLast - SHEET_FIRST_DATA_ROW + 1;
  if (oldRows > 0) { spans.forEach(function (span) { sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], oldRows, span[1]).clearContent(); }); }
  if (rows.length) {
    spans.forEach(function (span) {
      var matrix = rows.map(function (row) { return header.slice(span[0] - 1, span[0] - 1 + span[1]).map(function (code) { return row.values[code] === undefined ? '' : row.values[code]; }); });
      sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], rows.length, span[1]).setValues(matrix);
    });
  }
  var rowMap = {};
  rows.forEach(function (row, i) { rowMap[String(SHEET_FIRST_DATA_ROW + i)] = row.customer[customerIdCode]; });
  SpreadsheetApp.flush();
  dirtyStateClearViewSheet(name);
  return { ok: true, sheetName: name, rowMaps: (function () { var map = {}; map[name] = rowMap; return map; }()), rows: rows.length };
}

function renderViewSheet(sheetName) {
  var name = String(sheetName || '').trim();
  if (name.charAt(0) !== '!') { throw new Error('Sheet quản trị phải có tên bắt đầu bằng !.'); }
  var book = shinOpenBook();
  var sheet = book.getSheetByName(name);
  if (!sheet) { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }
  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận. Vui lòng thử lại!'); }
  try {
    book.toast('Đang làm mới dữ liệu ' + name + '…', 'ShinCRM', 3);
    return viewRenderSheetLocked(book, sheet, name);
  } finally {
    lock.releaseLock();
  }
}

function renderAllViewSheets() {
  var book = shinOpenBook();
  return book.getSheets().filter(function (sheet) { return sheet.getName().charAt(0) === '!'; }).map(function (sheet) { return renderViewSheet(sheet.getName()); });
}

function viewProbeRenderCurrent() {
  var sheet = shinOpenBook().getActiveSheet();
  var result = renderViewSheet(sheet.getName());
  var report = ['Sheet: ' + result.sheetName, 'Số dòng: ' + result.rows, 'RowMap: ' + JSON.stringify(result.rowMaps[result.sheetName] || {})];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}

function renderViewIfDirty(sheetName) {
  var name = String(sheetName || '').trim();
  var sheet = shinOpenBook().getSheetByName(name);
  if (!sheet || name.charAt(0) !== '!') { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }
  var state = dirtyStateRead();
  if (state.all || state.config || state.viewSheets.indexOf(name) >= 0) { return renderViewSheet(name); }
  return { ok: true, skipped: true, sheetName: name, rowMaps: viewSheetRowMaps(sheet, name) };
}

function prepareViewSheet(sheetName) {
  var name = String(sheetName || '').trim();
  var sheet = shinOpenBook().getSheetByName(name);
  if (!sheet || name.charAt(0) !== '!') { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return { ok: true, sheetName: name }; }
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || '').trim(); });
  var levelAt = header.indexOf('@VIEW_SORT_LEVEL') + 1;
  var colAt = header.indexOf('@VIEW_SORT_COL') + 1;
  var note = 'Lọc ở hàng 3: dùng ; cho OR, <> cho phủ định, .. cho khoảng. Sắp xếp: chọn mã @CUS_ hoặc @ACT_ ở cột @VIEW_SORT_COL và chiều ở cột @VIEW_SORT_LEVEL.';
  header.forEach(function (code, i) {
    if (code.indexOf('@CUS_') !== 0 && code.indexOf('@ACT_') !== 0 && code.indexOf('@VIEW_') !== 0) { return; }
    var cell = sheet.getRange(3, i + 1);
    if (typeof cell.getNote === 'function' && !cell.getNote()) { cell.setNote(note); }
  });
  var dataRows = Math.max(1, sheet.getMaxRows() - SHEET_FIRST_DATA_ROW + 1);
  if (colAt && typeof SpreadsheetApp.newDataValidation === 'function') {
    var sourceCodes = ['Customer', 'Activity'].reduce(function (all, sourceName) {
      return all.concat(readColumnMap(sourceName).headerRow.filter(function (code) { return code.indexOf(sourceName === 'Customer' ? '@CUS_' : '@ACT_') === 0; }));
    }, []);
    var colRule = SpreadsheetApp.newDataValidation().requireValueInList(sourceCodes, true).setAllowInvalid(true).build();
    sheet.getRange(SHEET_FIRST_DATA_ROW, colAt, dataRows, 1).setDataValidation(colRule);
  }
  if (levelAt && typeof SpreadsheetApp.newDataValidation === 'function') {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Tăng dần (A → Z)', 'Giảm dần (Z → A)'], true).setAllowInvalid(true).build();
    sheet.getRange(SHEET_FIRST_DATA_ROW, levelAt, dataRows, 1).setDataValidation(rule);
  }
  return { ok: true, sheetName: name, sortColumn: colAt, sortLevel: levelAt };
}
