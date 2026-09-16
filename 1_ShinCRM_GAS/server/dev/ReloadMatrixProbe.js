/**
 * Probe DEV cho ma trận reload. Probe chỉ chạy trên tệp DEV, không phải đường runtime.
 *
 * Fixture được ghi trực tiếp để không làm tăng bộ đếm mã và không phát signal giả trước
 * khi kiểm onEdit. Mọi ghi mô phỏng đều gọi `shinOnEdit` rõ ràng vì setValue bằng GAS
 * không tự phát installable onEdit. Probe dừng trước khi ghi nếu Customer hoặc Activity
 * đã có dữ liệu, rồi xóa fixture và khôi phục thuộc tính trước khi trả kết quả.
 */

var RELOAD_MATRIX_PROBE_VIEW = '!__CRM_RELOAD_MATRIX_PROBE';

function reloadMatrixProbePropKeys() {
  return [
    DIRTY_KEYS.viewSheets, DIRTY_KEYS.records, DIRTY_KEYS.config, DIRTY_KEYS.all,
    DIRTY_KEYS.category, DIRTY_KEYS.schema, DIRTY_KEYS.allCore, DIRTY_KEYS.allViews,
    DIRTY_KEYS.revision, DIRTY_KEYS.changedAt
  ];
}

function reloadMatrixProbeSnapshotProperties(keys) {
  var props = PropertiesService.getDocumentProperties();
  var snapshot = {};
  keys.forEach(function (key) { snapshot[key] = props.getProperty(key); });
  return snapshot;
}

function reloadMatrixProbeRestoreProperties(snapshot) {
  var props = PropertiesService.getDocumentProperties();
  Object.keys(snapshot || {}).forEach(function (key) {
    if (snapshot[key] === null || snapshot[key] === undefined) { props.deleteProperty(key); }
    else { props.setProperty(key, snapshot[key]); }
  });
}

function reloadMatrixProbeSnapshotViewProperties(book) {
  var props = PropertiesService.getDocumentProperties();
  var snapshot = {};
  book.getSheets().filter(function (sheet) { return sheet.getName().charAt(0) === '!'; }).forEach(function (sheet) {
    [viewRevisionKey(sheet), viewInputSignatureKey(sheet)].forEach(function (key) {
      snapshot[key] = props.getProperty(key);
    });
  });
  return snapshot;
}

function reloadMatrixProbeSnapshotUserPrefs() {
  var props = PropertiesService.getUserProperties();
  var key = USER_PREFS.autoRenderView.key;
  return { key: key, value: props.getProperty(key) };
}

function reloadMatrixProbeRestoreUserPrefs(snapshot) {
  var props = PropertiesService.getUserProperties();
  if (!snapshot || snapshot.value === null || snapshot.value === undefined) { props.deleteProperty(snapshot.key); }
  else { props.setProperty(snapshot.key, snapshot.value); }
}

function reloadMatrixProbeSnapshotCell(cell) {
  return {
    value: cell.getValue(),
    formula: typeof cell.getFormula === 'function' ? cell.getFormula() : ''
  };
}

function reloadMatrixProbeRestoreCell(cell, snapshot) {
  if (snapshot && snapshot.formula) { cell.setFormula(snapshot.formula); }
  else { cell.setValue(snapshot ? snapshot.value : ''); }
}

function reloadMatrixProbeWriteEvent(sheet, row, column, value) {
  var cell = sheet.getRange(row, column);
  var before = reloadMatrixProbeSnapshotCell(cell);
  var oldValue = before.value;
  cell.setValue(value);
  SpreadsheetApp.flush();
  var result = shinOnEdit({ range: cell, oldValue: oldValue, value: value });
  SpreadsheetApp.flush();
  reloadMatrixProbeRestoreCell(cell, before);
  SpreadsheetApp.flush();
  return result;
}

function reloadMatrixProbeWriteRangeEvent(sheet, row, column, values) {
  var height = values.length;
  var width = values[0].length;
  var range = sheet.getRange(row, column, height, width);
  var before = range.getValues();
  range.setValues(values);
  SpreadsheetApp.flush();
  var result = shinOnEdit({ range: range });
  SpreadsheetApp.flush();
  range.setValues(before);
  SpreadsheetApp.flush();
  return result;
}

function reloadMatrixProbeWriteRows(sheet, startRow, rows) {
  sheetGridEnsureRoom(sheet, startRow + rows.length - 1);
  sheet.getRange(startRow, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
}

function reloadMatrixProbeManagedViewCount(book) {
  return book.getSheets().filter(function (sheet) { return sheet.getName().charAt(0) === '!'; }).length;
}

function reloadMatrixProbeRenderedAll(result, expectedCount) {
  return !!(result && result.ok === true && Array.isArray(result.rendered)
    && result.rendered.length === expectedCount && (!result.failed || result.failed.length === 0));
}

function reloadMatrixProbeFindDataColumn(context, preferredName) {
  var name = preferredName;
  var idName = context.names[context.idAt];
  if (context.names.indexOf(name) < 0) {
    name = context.names.filter(function (item) { return item !== idName; })[0];
  }
  return { name: name, column: context.indexes[context.names.indexOf(name)] + 1 };
}

function reloadMatrixProbeFindInvalidColumn(context) {
  var valid = {};
  Object.keys(DATA_SCHEMA[context.entity]).forEach(function (name) { valid[DATA_SCHEMA[context.entity][name].code] = true; });
  for (var i = 0; i < context.columnMap.headerRow.length; i++) {
    var code = context.columnMap.headerRow[i];
    if (code && !valid[code]) { return { column: i + 1, inserted: false }; }
  }
  var next = context.columnMap.lastColumn + 1;
  if (next > context.sheet.getMaxColumns()) {
    context.sheet.insertColumnAfter(context.sheet.getMaxColumns());
    return { column: next, inserted: true };
  }
  return { column: next, inserted: false };
}

function reloadMatrixProbeFindCategoryCell(sheet) {
  var map = readColumnMap('Category');
  var rowCount = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  var row = rowCount > 0 ? SHEET_FIRST_DATA_ROW : SHEET_FIRST_DATA_ROW;
  var column = map.map[CATEGORY_COLUMNS[0][0]];
  return { cell: sheet.getRange(row, column), row: row, column: column };
}

function reloadMatrixProbeFindConfigCell(sheet) {
  var map = readColumnMap('Config');
  var keyColumn = map.map['@CFG_THAM_SO'];
  var valueColumn = map.map['@CFG_THAM_SO_GIA_TRI'];
  var last = Math.max(SHEET_FIRST_DATA_ROW, sheet.getLastRow());
  var keys = sheet.getRange(SHEET_FIRST_DATA_ROW, keyColumn, Math.max(1, last - SHEET_FIRST_DATA_ROW + 1), 1).getValues();
  var row = SHEET_FIRST_DATA_ROW;
  for (var i = 0; i < keys.length; i++) {
    if (String(keys[i][0] || '').trim() === LOG_TRACE_CONFIG_NAME) { row = SHEET_FIRST_DATA_ROW + i; break; }
  }
  return { cell: sheet.getRange(row, valueColumn), row: row, column: valueColumn };
}

function reloadMatrixProbeAssert(report, label, condition, detail) {
  report.push((condition ? 'DAT' : 'LOI') + ' | ' + label + (detail ? ' | ' + detail : ''));
  if (!condition) { throw new Error(label + (detail ? ': ' + detail : '')); }
}

/**
 * Chạy các ca reload trên fixture nhỏ. Không chạy nếu Customer/Activity đang có dữ liệu.
 * Trả về báo cáo đọc được bằng cửa DEV; lỗi luôn dọn fixture trước khi ném.
 */
function reloadMatrixProbe() {
  var book = shinOpenBook();
  var customer = entityReadContext('customer');
  var activity = entityReadContext('activity');
  if (book.getSheetByName(RELOAD_MATRIX_PROBE_VIEW)) {
    throw new Error('Đã có sheet ' + RELOAD_MATRIX_PROBE_VIEW + '. Xử lý probe cũ trước khi chạy lại.');
  }

  var propSnapshot = reloadMatrixProbeSnapshotProperties(reloadMatrixProbePropKeys());
  var viewPropSnapshot = reloadMatrixProbeSnapshotViewProperties(book);
  var userPrefsSnapshot = reloadMatrixProbeSnapshotUserPrefs();
  var customerRows = 0;
  var activityRows = 0;
  var customerStartRow = SHEET_FIRST_DATA_ROW + customer.rowCount;
  var activityStartRow = SHEET_FIRST_DATA_ROW + activity.rowCount;
  var temporaryView = null;
  var temporaryViewPropertyKeys = [];
  var extraInvalidColumn = false;
  var report = [];

  try {
    var prefProps = PropertiesService.getUserProperties();
    prefProps.setProperty(USER_PREFS.autoRenderView.key, 'true');
    resetSettingsCache();

    temporaryView = createViewSheet(RELOAD_MATRIX_PROBE_VIEW);
    var viewSheet = book.getSheetByName(RELOAD_MATRIX_PROBE_VIEW);
    temporaryViewPropertyKeys = [viewRevisionKey(viewSheet), viewInputSignatureKey(viewSheet)];
    var viewHeaderLast = viewSheet.getLastColumn();
    viewSheet.getRange(1, viewHeaderLast + 1, 3, 1).setValues([['DEV_RELOAD_ORDINARY'], ['Cột thường của probe'], ['']]);
    var expectedViews = reloadMatrixProbeManagedViewCount(book);

    customerRows = 5;
    activityRows = 5;
    var customerIds = [];
    var activityIds = [];
    var customerFixture = seedFakeRows(customer, customerRows, {
      id: function (i) { var id = 'DEV-RELOAD-CUS-' + (i + 1); customerIds.push(id); return id; }
    });
    reloadMatrixProbeWriteRows(customer.sheet, customerStartRow, customerFixture);
    var activityFixture = seedFakeRows(activity, activityRows, {
      id: function (i) { var id = 'DEV-RELOAD-ACT-' + (i + 1); activityIds.push(id); return id; },
      customerId: function (i) { return customerIds[i % customerIds.length]; }
    });
    reloadMatrixProbeWriteRows(activity.sheet, activityStartRow, activityFixture);
    renderAllManagedViews();
    report.push('Fixture nối sau dữ liệu hiện có: Customer ' + customerRows + ' dòng từ hàng ' + customerStartRow + ', Activity ' + activityRows + ' dòng từ hàng ' + activityStartRow + '; view quản trị ' + expectedViews + ' sheet.');

    var customerEdit = reloadMatrixProbeFindDataColumn(customer, 'companyName');
    var activityEdit = reloadMatrixProbeFindDataColumn(activity, 'content');

    var before = reloadStateRead();
    reloadMatrixProbeWriteEvent(customer.sheet, customerStartRow, customerEdit.column, 'DEV reload customer edit');
    var after = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Customer cột @ hợp lệ phát records + allViews', after.revision > before.revision && after.records.indexOf(customerIds[0]) >= 0, JSON.stringify({ revision: after.revision, records: after.records }));
    var customerReloadProbe = probeSelectionAndReload({ lastSeenRevision: before.revision, previousCustomerId: '' });
    reloadMatrixProbeAssert(report, 'Customer cột @ có mốc sẵn sàng reload sau 3 giây', customerReloadProbe.decision.ram.mode === 'records' && customerReloadProbe.reload.recordsReadyAt >= customerReloadProbe.reload.changedAt + 3000 && customerReloadProbe.reload.records.indexOf(customerIds[0]) >= 0, JSON.stringify({ mode: customerReloadProbe.decision.ram.mode, waitMs: customerReloadProbe.decision.ram.waitMs, changedAt: customerReloadProbe.reload.changedAt, recordsReadyAt: customerReloadProbe.reload.recordsReadyAt, records: customerReloadProbe.reload.records }));

    var batchBefore = reloadStateRead();
    var batchValues = [];
    for (var batchAt = 0; batchAt < customerRows; batchAt++) { batchValues.push(['DEV reload batch ' + (batchAt + 1)]); }
    reloadMatrixProbeWriteRangeEvent(customer.sheet, customerStartRow, customerEdit.column, batchValues);
    var batchAfter = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Vùng Customer nhiều hàng gom đủ mã', batchAfter.revision > batchBefore.revision && customerIds.every(function (id) { return batchAfter.records.indexOf(id) >= 0; }), JSON.stringify({ revisionDelta: batchAfter.revision - batchBefore.revision, records: batchAfter.records }));
    report.push('Ghi chú: debounce một lượt sau edit cuối là hành vi Sidebar; probe GAS xác nhận mỗi vùng trả waitMs=3000, không giả vờ đo số lượt reload client.');

    var activityBefore = reloadStateRead();
    var activityResult = reloadMatrixProbeWriteEvent(activity.sheet, activityStartRow, activityEdit.column, 'DEV reload activity edit');
    var activityAfter = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Activity cột @ hợp lệ phát đúng mã', activityAfter.revision > activityBefore.revision && activityAfter.records.indexOf(activityIds[0]) >= 0, JSON.stringify({ column: activityEdit.column, code: activityEdit.name, expectedId: activityIds[0], revisionBefore: activityBefore.revision, revisionAfter: activityAfter.revision, records: activityAfter.records, decision: activityResult && activityResult.kind, ram: activityResult && activityResult.ram }));

    var invalidInfo = reloadMatrixProbeFindInvalidColumn(customer);
    var invalidColumn = invalidInfo.column;
    extraInvalidColumn = invalidInfo.inserted === true;
    var invalidBefore = reloadStateRead();
    reloadMatrixProbeWriteEvent(customer.sheet, customerStartRow, invalidColumn, 'DEV invalid column');
    var invalidAfter = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Customer cột không hợp lệ không phát signal/debounce', invalidAfter.revision === invalidBefore.revision, JSON.stringify({ before: invalidBefore.revision, after: invalidAfter.revision }));

    var row2Before = reloadStateRead();
    reloadMatrixProbeWriteEvent(customer.sheet, 2, customerEdit.column, 'DEV row 2');
    var row2After = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Customer hàng 2 không reload', row2After.revision === row2Before.revision, 'revision=' + row2After.revision);

    var row3Before = reloadStateRead();
    reloadMatrixProbeWriteEvent(customer.sheet, 3, customerEdit.column, 'DEV row 3');
    var row3After = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Customer hàng 3 ghi chú không reload', row3After.revision === row3Before.revision, 'revision=' + row3After.revision);

    var schemaMap = readColumnMap('Customer');
    var schemaRange = customer.sheet.getRange(1, 1, 1, 2);
    var schemaOld = schemaRange.getValues();
    schemaRange.setValues([[schemaOld[0][1], schemaOld[0][0]]]);
    SpreadsheetApp.flush();
    var schemaBefore = reloadStateRead();
    var schemaResult = shinOnEdit({ range: schemaRange });
    SpreadsheetApp.flush();
    var schemaAfter = reloadStateRead();
    schemaRange.setValues(schemaOld);
    SpreadsheetApp.flush();
    reloadMatrixProbeAssert(report, 'Customer hàng 1 phát schema + fullCore + vẽ toàn bộ view', schemaAfter.revision > schemaBefore.revision && schemaAfter.schema === true && schemaAfter.allCore === true && reloadMatrixProbeRenderedAll(schemaResult, expectedViews), JSON.stringify({ revision: schemaAfter.revision, schema: schemaAfter.schema, allCore: schemaAfter.allCore, rendered: schemaResult && schemaResult.rendered && schemaResult.rendered.length }));
    report.push('Schema map sau khi khôi phục: ' + Object.keys(schemaMap.map).length + ' mã.');

    var categoryCell = reloadMatrixProbeFindCategoryCell(book.getSheetByName('Category'));
    var categorySnapshot = reloadMatrixProbeSnapshotCell(categoryCell.cell);
    var categoryBefore = reloadStateRead();
    categoryCell.cell.setValue(String(categorySnapshot.value || '') + ' ');
    SpreadsheetApp.flush();
    var categoryResult = shinOnEdit({ range: categoryCell.cell, oldValue: categorySnapshot.value, value: String(categorySnapshot.value || '') + ' ' });
    SpreadsheetApp.flush();
    var categoryAfter = reloadStateRead();
    reloadMatrixProbeRestoreCell(categoryCell.cell, categorySnapshot);
    SpreadsheetApp.flush();
    resetSettingsCache();
    reloadMatrixProbeAssert(report, 'Category cột @ phát dirtyCategory + vẽ toàn bộ view', categoryAfter.revision > categoryBefore.revision && categoryAfter.category === true && reloadMatrixProbeRenderedAll(categoryResult, expectedViews), JSON.stringify({ revision: categoryAfter.revision, category: categoryAfter.category, rendered: categoryResult && categoryResult.rendered && categoryResult.rendered.length }));

    var configCell = reloadMatrixProbeFindConfigCell(book.getSheetByName('Config'));
    var configSnapshot = reloadMatrixProbeSnapshotCell(configCell.cell);
    var configBefore = reloadStateRead();
    var configValue = String(configSnapshot.value === null || configSnapshot.value === undefined ? '' : configSnapshot.value) + ' ';
    configCell.cell.setValue(configValue);
    SpreadsheetApp.flush();
    var configResult = shinOnEdit({ range: configCell.cell, oldValue: configSnapshot.value, value: configValue });
    SpreadsheetApp.flush();
    var configAfter = reloadStateRead();
    reloadMatrixProbeRestoreCell(configCell.cell, configSnapshot);
    SpreadsheetApp.flush();
    resetSettingsCache();
    reloadMatrixProbeAssert(report, 'Config cột @ phát dirtyConfig + fullCore + vẽ toàn bộ view', configAfter.revision > configBefore.revision && configAfter.config === true && configAfter.allCore === true && reloadMatrixProbeRenderedAll(configResult, expectedViews), JSON.stringify({ revision: configAfter.revision, config: configAfter.config, allCore: configAfter.allCore, rendered: configResult && configResult.rendered && configResult.rendered.length }));

    var viewOrdinaryColumn = viewSheet.getLastColumn();
    var viewRow1Before = reloadStateRead();
    var viewRow1Result = reloadMatrixProbeWriteEvent(viewSheet, 1, viewOrdinaryColumn, 'DEV_RELOAD_ORDINARY_2');
    var viewRow1After = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Sheet quản trị hàng 1 cột thường không vẽ', viewRow1After.revision === viewRow1Before.revision, JSON.stringify({ revision: viewRow1After.revision, rendered: viewRow1Result && viewRow1Result.rendered && viewRow1Result.rendered.length }));

    var viewValidHeaderColumn = viewSheet.getRange(1, 1, 1, viewSheet.getLastColumn()).getValues()[0].indexOf(DATA_SCHEMA.customer.id.code) + 1;
    var viewValidHeaderCell = viewSheet.getRange(1, viewValidHeaderColumn);
    var viewValidHeaderSnapshot = reloadMatrixProbeSnapshotCell(viewValidHeaderCell);
    var viewValidHeaderTarget = DATA_SCHEMA.customer.companyName ? DATA_SCHEMA.customer.companyName.code : DATA_SCHEMA.customer.id.code;
    var viewValidRow1Before = reloadStateRead();
    viewValidHeaderCell.setValue(viewValidHeaderTarget);
    SpreadsheetApp.flush();
    var viewValidRow1Result = shinOnEdit({ range: viewValidHeaderCell, oldValue: viewValidHeaderSnapshot.value, value: viewValidHeaderTarget });
    SpreadsheetApp.flush();
    var viewValidRow1After = reloadStateRead();
    reloadMatrixProbeRestoreCell(viewValidHeaderCell, viewValidHeaderSnapshot);
    SpreadsheetApp.flush();
    reloadMatrixProbeAssert(report, 'Sheet quản trị hàng 1 mã cột hợp lệ vẽ toàn bộ view', viewValidRow1After.revision > viewValidRow1Before.revision && reloadMatrixProbeRenderedAll(viewValidRow1Result, expectedViews), JSON.stringify({ revision: viewValidRow1After.revision, rendered: viewValidRow1Result && viewValidRow1Result.rendered && viewValidRow1Result.rendered.length }));

    var viewValidColumn = viewSheet.getRange(1, 1, 1, viewSheet.getLastColumn()).getValues()[0].indexOf(DATA_SCHEMA.customer.id.code) + 1;
    var viewRow3Before = reloadStateRead();
    var viewRow3Result = reloadMatrixProbeWriteEvent(viewSheet, 3, viewValidColumn, '<>""');
    var viewRow3After = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Sheet quản trị hàng 3 dưới cột @ vẽ toàn bộ view', viewRow3After.revision > viewRow3Before.revision && reloadMatrixProbeRenderedAll(viewRow3Result, expectedViews), JSON.stringify({ revision: viewRow3After.revision, rendered: viewRow3Result && viewRow3Result.rendered && viewRow3Result.rendered.length }));

    var viewOrdinaryBefore = reloadStateRead();
    reloadMatrixProbeWriteEvent(viewSheet, 3, viewOrdinaryColumn, 'DEV filter thường');
    var viewOrdinaryAfter = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Sheet quản trị hàng 3 dưới cột thường không vẽ', viewOrdinaryAfter.revision === viewOrdinaryBefore.revision, 'revision=' + viewOrdinaryAfter.revision);

    var viewDataBefore = reloadStateRead();
    reloadMatrixProbeWriteEvent(viewSheet, SHEET_FIRST_DATA_ROW, viewOrdinaryColumn, 'DEV output edit');
    var viewDataAfter = reloadStateRead();
    reloadMatrixProbeAssert(report, 'Sheet quản trị hàng 4 cột dữ liệu sinh không vẽ', viewDataAfter.revision === viewDataBefore.revision, 'revision=' + viewDataAfter.revision);

    report.push('Hoàn tất: tất cả ca probe reload đều đạt.');
    return report;
  } finally {
    try {
      if (activityRows) { activity.sheet.getRange(activityStartRow, 1, activityRows, activity.columnMap.lastColumn).clearContent(); }
      if (customerRows) { customer.sheet.getRange(customerStartRow, 1, customerRows, customer.columnMap.lastColumn).clearContent(); }
      SpreadsheetApp.flush();
      if (temporaryView) { book.deleteSheet(book.getSheetByName(RELOAD_MATRIX_PROBE_VIEW)); }
      temporaryViewPropertyKeys.forEach(function (key) { PropertiesService.getDocumentProperties().deleteProperty(key); });
      if (extraInvalidColumn) { customer.sheet.deleteColumn(customer.sheet.getMaxColumns()); }
      renderAllManagedViews();
      reloadMatrixProbeRestoreProperties(propSnapshot);
      reloadMatrixProbeRestoreProperties(viewPropSnapshot);
      reloadMatrixProbeRestoreUserPrefs(userPrefsSnapshot);
      resetSettingsCache();
    } catch (cleanupError) {
      throw new Error('Probe không dọn sạch được: ' + errorMessage(cleanupError));
    }
  }
}
