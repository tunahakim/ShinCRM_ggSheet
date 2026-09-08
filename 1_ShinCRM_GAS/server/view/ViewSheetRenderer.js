/** Vẽ một sheet quản trị từ kho Customer/Activity. Sheet quản trị không bao giờ là nguồn sự thật. */

function viewFieldMaps() {
  var byCode = {};
  Object.keys(DATA_SCHEMA).forEach(function (entity) {
    Object.keys(DATA_SCHEMA[entity]).forEach(function (name) { byCode[DATA_SCHEMA[entity][name].code] = DATA_SCHEMA[entity][name]; });
  });
  return byCode;
}

function viewBlockObjects(block) {
  return block.rows.map(function (row) {
    var object = {};
    block.fields.forEach(function (field, i) { object[field] = row[i]; });
    return object;
  });
}

function viewLatestActivity(activities) {
  var latest = {};
  activities.forEach(function (activity) {
    if (String(activity.recordStatus || '') === 'deleted' || !activity.customerId) { return; }
    var old = latest[activity.customerId];
    var newer = !old || String(activity.workDate || '') > String(old.workDate || '') || (String(activity.workDate || '') === String(old.workDate || '') && String(activity.id || '') > String(old.id || ''));
    if (newer) { latest[activity.customerId] = activity; }
  });
  return latest;
}

function viewValues(customer, activity, headers, fieldByCode) {
  var values = {};
  headers.forEach(function (code) {
    if (code.indexOf('@CUS_') === 0) { values[code] = customer[fieldByCode[code] && fieldNameByCode('customer', code)]; }
    else if (code.indexOf('@ACT_') === 0) { values[code] = activity && fieldByCode[code] ? activity[fieldNameByCode('activity', code)] : ''; }
  });
  return values;
}

function fieldNameByCode(entity, code) {
  var fields = DATA_SCHEMA[entity];
  var names = Object.keys(fields);
  for (var i = 0; i < names.length; i++) { if (fields[names[i]].code === code) { return names[i]; } }
  return '';
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

function renderViewSheet(sheetName) {
  var name = String(sheetName || '').trim();
  if (name.charAt(0) !== '!') { throw new Error('Sheet quản trị phải có tên bắt đầu bằng !.'); }
  var book = shinOpenBook();
  var sheet = book.getSheetByName(name);
  if (!sheet) { throw new Error('Không tìm thấy sheet quản trị "' + name + '".'); }
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return { ok: true, sheetName: name, rowMaps: {} }; }
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value || '').trim(); });
  var headerMap = {};
  header.forEach(function (code, i) { if (code) { headerMap[code] = i + 1; } });
  var fieldByCode = viewFieldMaps();
  var writable = header.map(function (code, i) { return (code.indexOf('@CUS_') === 0 || code.indexOf('@ACT_') === 0) && fieldByCode[code] ? i + 1 : 0; }).filter(function (column) { return column > 0; });
  var customers = viewBlockObjects(entityReadAll('customer'));
  var activities = viewLatestActivity(viewBlockObjects(entityReadAll('activity')));
  var errors = [];
  var rows = customers.map(function (customer) {
    var activity = activities[customer.id];
    var values = viewValues(customer, activity, header, fieldByCode);
    writable.forEach(function (column) {
      var code = header[column - 1];
      if (String(sheet.getRange(3, column).getValue() || '').trim()) {
        var parsed = filterParseCell(sheet.getRange(3, column).getValue(), fieldByCode[code]);
        if (parsed.errors.length) { parsed.errors.forEach(function (error) { errors.push({ cell: column, error: error }); }); }
        else if (!filterCellMatches(values[code], parsed, fieldByCode[code])) { customer.__filtered = true; }
      }
    });
    return { customer: customer, values: values };
  }).filter(function (row) { return !row.customer.__filtered; });
  if (errors.length) { throw new Error(errors.map(function (item) { return name + ', ô cột ' + item.cell + ': ' + item.error.reason + '. ' + item.error.hint; }).join('\n')); }

  var sortPairs = viewReadSortPairs(sheet, headerMap, SHEET_FIRST_DATA_ROW, sheet.getLastRow());
  var parsedSort = sortSpecParse(sortPairs, fieldByCode);
  if (parsedSort.errors.length) { throw new Error(parsedSort.errors.join('\n')); }
  var specs = parsedSort.specs.length ? parsedSort.specs : [
    { code: DATA_SCHEMA.activity.workDate.code, direction: 'desc', field: DATA_SCHEMA.activity.workDate },
    { code: DATA_SCHEMA.activity.id.code, direction: 'desc', field: DATA_SCHEMA.activity.id }
  ];
  viewSortRows(rows, specs);

  var oldLast = Math.max(sheet.getLastRow(), SHEET_FIRST_DATA_ROW - 1);
  var oldRows = oldLast - SHEET_FIRST_DATA_ROW + 1;
  if (oldRows > 0) { viewColumnSpans(writable).forEach(function (span) { sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], oldRows, span[1]).clearContent(); }); }
  if (rows.length) {
    viewColumnSpans(writable).forEach(function (span) {
      var matrix = rows.map(function (row) { return header.slice(span[0] - 1, span[0] - 1 + span[1]).map(function (code) { return row.values[code] === undefined ? '' : row.values[code]; }); });
      sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], rows.length, span[1]).setValues(matrix);
    });
  }
  var rowMap = {};
  rows.forEach(function (row, i) { rowMap[String(SHEET_FIRST_DATA_ROW + i)] = row.customer.id; });
  dirtyStateClearViewSheet(name);
  SpreadsheetApp.flush();
  return { ok: true, sheetName: name, rowMaps: (function () { var map = {}; map[name] = rowMap; return map; }()), rows: rows.length };
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
  if (typeof sheet.getRange(3, 1).getNote === 'function' && !sheet.getRange(3, 1).getNote()) { sheet.getRange(3, 1).setNote(note); }
  if (levelAt && typeof SpreadsheetApp.newDataValidation === 'function') {
    var rule = SpreadsheetApp.newDataValidation().requireValueInList(['Tăng dần (A → Z)', 'Giảm dần (Z → A)'], true).setAllowInvalid(true).build();
    sheet.getRange(SHEET_FIRST_DATA_ROW, levelAt, Math.max(1, sheet.getMaxRows() - SHEET_FIRST_DATA_ROW + 1), 1).setDataValidation(rule);
  }
  return { ok: true, sheetName: name, sortColumn: colAt, sortLevel: levelAt };
}
