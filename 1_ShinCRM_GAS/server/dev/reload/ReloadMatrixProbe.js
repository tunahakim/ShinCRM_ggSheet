/**
 * Probe DEV cho ma trận reload. Probe chỉ chạy trên tệp DEV, không phải đường runtime.
 *
 * Fixture được ghi trực tiếp để không làm tăng bộ đếm mã và không phát signal giả trước
 * khi kiểm onEdit. Mọi ghi mô phỏng đều gọi `shinOnEdit` rõ ràng vì setValue bằng GAS
 * không tự phát installable onEdit. Probe dừng trước khi ghi nếu Customer hoặc Activity
 * đã có dữ liệu, rồi xóa fixture và khôi phục thuộc tính trước khi trả kết quả.
 */

var RELOAD_MATRIX_PROBE_VIEW = '!__CRM_RELOAD_MATRIX_PROBE';

/** Dòng sổ cuối đọc theo hình dạng các ca kiểm: mã bản ghi, cờ từng phần. Mỗi ca so revision trước/sau nên dòng cuối là dòng của chính ca đó. */
function reloadMatrixProbeState() {
  var journal = reloadJournalRead();
  var entry = journal.entries[journal.entries.length - 1] || {};
  var ids = [];
  RELOAD_RECORD_PARTS.forEach(function (part) { if (Array.isArray(entry[part])) { ids = ids.concat(entry[part]); } });
  return {
    revision: journal.rev,
    records: ids,
    entities: RELOAD_RECORD_PARTS.filter(function (part) { return entry[part] === true; }),
    category: entry.category === true,
    config: entry.config === true,
    schema: entry.core === true,
    allCore: entry.core === true
  };
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
  // Trigger thật là một lần chạy riêng; hàm dò chạy lồng trong cửa vào của DEV runner nên phải tự ghi nhận thay đổi.
  recordChangesAfterWrite();
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
  recordChangesAfterWrite();
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

/** Sửa ô điều khiển sheet `!` chỉ gắn cờ `controls` cho đúng sheet đó trong sổ vẽ; lượt vẽ chạy sau, ngoài onEdit. Vẽ lại trước để cờ bắt đầu tắt. */
function reloadMatrixProbeMarksControls(sheetName, edit) {
  renderViewSheet(sheetName);
  var before = viewLedgerEntry(sheetName) || {};
  var result = edit();
  var after = viewLedgerEntry(sheetName) || {};
  var sheets = result && result.signal ? result.signal.viewSheets : [];
  return {
    ok: before.controls !== true && after.controls === true && !!result && result.kind === 'view-control'
      && Array.isArray(sheets) && sheets.length === 1 && sheets[0] === sheetName,
    detail: JSON.stringify({ kind: result && result.kind, viewSheets: sheets, controlsBefore: before.controls === true, controlsAfter: after.controls === true })
  };
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
  // Cột mang mã @ (kể cả cột đồng bộ, cột module ngoài DATA_SCHEMA) vẫn làm view cũ theo luật; ca này cần cột nhãn thường.
  for (var i = 0; i < context.columnMap.headerRow.length; i++) {
    var code = String(context.columnMap.headerRow[i] || '');
    if (code && code.charAt(0) !== '@') { return { column: i + 1, inserted: false }; }
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

  var propSnapshot = reloadProbeSnapshotProperties(reloadProbePropKeys());
  var userPrefsSnapshot = reloadMatrixProbeSnapshotUserPrefs();
  var customerRows = 0;
  var activityRows = 0;
  var customerStartRow = SHEET_FIRST_DATA_ROW + customer.rowCount;
  var activityStartRow = SHEET_FIRST_DATA_ROW + activity.rowCount;
  var temporaryView = null;
  var extraInvalidColumn = false;
  var report = [];

  try {
    var prefProps = PropertiesService.getUserProperties();
    prefProps.setProperty(USER_PREFS.autoRenderView.key, 'true');

    temporaryView = createViewSheet(RELOAD_MATRIX_PROBE_VIEW);
    var viewSheet = book.getSheetByName(RELOAD_MATRIX_PROBE_VIEW);
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
    shinViewSheetNames(book).forEach(renderViewSheet);
    report.push('Fixture nối sau dữ liệu hiện có: Customer ' + customerRows + ' dòng từ hàng ' + customerStartRow + ', Activity ' + activityRows + ' dòng từ hàng ' + activityStartRow + '; view quản trị ' + expectedViews + ' sheet.');

    var customerEdit = reloadMatrixProbeFindDataColumn(customer, 'companyName');
    var activityEdit = reloadMatrixProbeFindDataColumn(activity, 'content');

    var before = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(customer.sheet, customerStartRow, customerEdit.column, 'DEV reload customer edit');
    var after = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Customer cột @ hợp lệ phát records + allViews', after.revision > before.revision && after.records.indexOf(customerIds[0]) >= 0, JSON.stringify({ revision: after.revision, records: after.records }));
    var customerReloadProbe = probeSelectionAndReload({ lastSeenRevision: before.revision, previousCustomerId: '' });
    reloadProbeAssert(report, 'Customer cột @ nạp ngay ở lời hỏi kế tiếp, không chờ', customerReloadProbe.decision.ram.action === 'reload'
      && customerReloadProbe.decision.ram.mode === 'parts' && !!customerReloadProbe.payload, JSON.stringify({
        action: customerReloadProbe.decision.ram.action,
        mode: customerReloadProbe.decision.ram.mode,
        reloadAfterProbe: customerReloadProbe.reload
      }));

    var batchBefore = reloadMatrixProbeState();
    var batchValues = [];
    for (var batchAt = 0; batchAt < customerRows; batchAt++) { batchValues.push(['DEV reload batch ' + (batchAt + 1)]); }
    reloadMatrixProbeWriteRangeEvent(customer.sheet, customerStartRow, customerEdit.column, batchValues);
    var batchAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Vùng Customer nhiều hàng gom đủ mã', batchAfter.revision > batchBefore.revision && customerIds.every(function (id) { return batchAfter.records.indexOf(id) >= 0; }), JSON.stringify({ revisionDelta: batchAfter.revision - batchBefore.revision, records: batchAfter.records }));

    var activityBefore = reloadMatrixProbeState();
    var activityResult = reloadMatrixProbeWriteEvent(activity.sheet, activityStartRow, activityEdit.column, 'DEV reload activity edit');
    var activityAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Activity cột @ hợp lệ phát đúng mã', activityAfter.revision > activityBefore.revision && activityAfter.records.indexOf(activityIds[0]) >= 0, JSON.stringify({ column: activityEdit.column, code: activityEdit.name, expectedId: activityIds[0], revisionBefore: activityBefore.revision, revisionAfter: activityAfter.revision, records: activityAfter.records, decision: activityResult && activityResult.kind, ram: activityResult && activityResult.ram }));

    var invalidInfo = reloadMatrixProbeFindInvalidColumn(customer);
    var invalidColumn = invalidInfo.column;
    extraInvalidColumn = invalidInfo.inserted === true;
    var invalidBefore = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(customer.sheet, customerStartRow, invalidColumn, 'DEV invalid column');
    var invalidAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Customer cột không hợp lệ không phát signal/debounce', invalidAfter.revision === invalidBefore.revision, JSON.stringify({ before: invalidBefore.revision, after: invalidAfter.revision, column: invalidColumn, code: customer.columnMap.headerRow[invalidColumn - 1] || '', entry: reloadJournalRead().entries.slice(-1)[0] }));

    var row2Before = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(customer.sheet, 2, customerEdit.column, 'DEV row 2');
    var row2After = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Customer hàng 2 không reload', row2After.revision === row2Before.revision, 'revision=' + row2After.revision);

    var row3Before = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(customer.sheet, 3, customerEdit.column, 'DEV row 3');
    var row3After = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Customer hàng 3 ghi chú không reload', row3After.revision === row3Before.revision, 'revision=' + row3After.revision);

    var schemaMap = readColumnMap('Customer');
    var schemaRange = customer.sheet.getRange(1, 1, 1, 2);
    var schemaOld = schemaRange.getValues();
    schemaRange.setValues([[schemaOld[0][1], schemaOld[0][0]]]);
    SpreadsheetApp.flush();
    var schemaBefore = reloadMatrixProbeState();
    var schemaResult = shinOnEdit({ range: schemaRange });
    recordChangesAfterWrite();
    SpreadsheetApp.flush();
    var schemaAfter = reloadMatrixProbeState();
    schemaRange.setValues(schemaOld);
    SpreadsheetApp.flush();
    reloadProbeAssert(report, 'Customer hàng 1 phát schema + fullCore + làm mọi view cũ', schemaAfter.revision > schemaBefore.revision && schemaAfter.schema === true && schemaAfter.allCore === true && reloadStateRead().viewsStaleRevision === schemaAfter.revision, JSON.stringify({ revision: schemaAfter.revision, schema: schemaAfter.schema, allCore: schemaAfter.allCore, rendered: schemaResult && schemaResult.rendered && schemaResult.rendered.length }));
    report.push('Schema map sau khi khôi phục: ' + Object.keys(schemaMap.map).length + ' mã.');

    var categoryCell = reloadMatrixProbeFindCategoryCell(book.getSheetByName('Category'));
    var categorySnapshot = reloadMatrixProbeSnapshotCell(categoryCell.cell);
    var categoryBefore = reloadMatrixProbeState();
    categoryCell.cell.setValue(String(categorySnapshot.value || '') + ' ');
    SpreadsheetApp.flush();
    var categoryResult = shinOnEdit({ range: categoryCell.cell, oldValue: categorySnapshot.value, value: String(categorySnapshot.value || '') + ' ' });
    recordChangesAfterWrite();
    SpreadsheetApp.flush();
    var categoryAfter = reloadMatrixProbeState();
    reloadMatrixProbeRestoreCell(categoryCell.cell, categorySnapshot);
    SpreadsheetApp.flush();
    reloadProbeAssert(report, 'Category cột @ phát phần Category + làm mọi view cũ', categoryAfter.revision > categoryBefore.revision && categoryAfter.category === true && reloadStateRead().viewsStaleRevision === categoryAfter.revision, JSON.stringify({ revision: categoryAfter.revision, category: categoryAfter.category, rendered: categoryResult && categoryResult.rendered && categoryResult.rendered.length }));

    // Lưu lại phần vận hành với giá trị đang có: đi đúng cổng màn Cài đặt dùng, không đổi giá trị nào nên không cần khôi phục.
    var configBefore = reloadMatrixProbeState();
    var configResult = settingsSave('core_ops', {});
    recordChangesAfterWrite();
    SpreadsheetApp.flush();
    var configAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Lưu cài đặt phát phần config + làm mọi view cũ', configResult.ok && configAfter.revision > configBefore.revision && configAfter.config === true && configAfter.allCore === false && reloadStateRead().viewsStaleRevision === configAfter.revision, JSON.stringify({ revision: configAfter.revision, config: configAfter.config, allCore: configAfter.allCore }));

    var viewOrdinaryColumn = viewSheet.getLastColumn();
    var viewRow1Before = reloadMatrixProbeState();
    var viewRow1Result = reloadMatrixProbeWriteEvent(viewSheet, 1, viewOrdinaryColumn, 'DEV_RELOAD_ORDINARY_2');
    var viewRow1After = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Sheet quản trị hàng 1 cột thường không vẽ', viewRow1After.revision === viewRow1Before.revision, JSON.stringify({ revision: viewRow1After.revision, rendered: viewRow1Result && viewRow1Result.rendered && viewRow1Result.rendered.length }));

    var viewValidHeaderColumn = viewSheet.getRange(1, 1, 1, viewSheet.getLastColumn()).getValues()[0].indexOf(DATA_SCHEMA.customer.id.code) + 1;
    var viewValidHeaderCell = viewSheet.getRange(1, viewValidHeaderColumn);
    var viewValidHeaderSnapshot = reloadMatrixProbeSnapshotCell(viewValidHeaderCell);
    // Giữ nguyên mã hợp lệ để phép thử chỉ kiểm nhánh phân loại hàng 1, không
    // làm thay đổi cấu hình dữ liệu của view tạm trong lúc renderer chạy.
    var viewValidHeaderTarget = viewValidHeaderSnapshot.value || DATA_SCHEMA.customer.id.code;
    var viewValidRow1 = reloadMatrixProbeMarksControls(RELOAD_MATRIX_PROBE_VIEW, function () {
      viewValidHeaderCell.setValue(viewValidHeaderTarget);
      SpreadsheetApp.flush();
      var edited = shinOnEdit({ range: viewValidHeaderCell, oldValue: viewValidHeaderSnapshot.value, value: viewValidHeaderTarget });
      recordChangesAfterWrite();
      SpreadsheetApp.flush();
      return edited;
    });
    reloadMatrixProbeRestoreCell(viewValidHeaderCell, viewValidHeaderSnapshot);
    SpreadsheetApp.flush();
    reloadProbeAssert(report, 'Sheet quản trị hàng 1 mã cột hợp lệ gắn cờ ô điều khiển cho đúng sheet bị sửa', viewValidRow1.ok, viewValidRow1.detail);

    var viewValidColumn = viewSheet.getRange(1, 1, 1, viewSheet.getLastColumn()).getValues()[0].indexOf(DATA_SCHEMA.customer.id.code) + 1;
    var viewRow3 = reloadMatrixProbeMarksControls(RELOAD_MATRIX_PROBE_VIEW, function () {
      return reloadMatrixProbeWriteEvent(viewSheet, 3, viewValidColumn, '<>""');
    });
    reloadProbeAssert(report, 'Sheet quản trị hàng 3 dưới cột @ gắn cờ ô điều khiển cho đúng sheet bị sửa', viewRow3.ok, viewRow3.detail);

    var viewOrdinaryBefore = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(viewSheet, 3, viewOrdinaryColumn, 'DEV filter thường');
    var viewOrdinaryAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Sheet quản trị hàng 3 dưới cột thường không vẽ', viewOrdinaryAfter.revision === viewOrdinaryBefore.revision, 'revision=' + viewOrdinaryAfter.revision);

    var viewDataBefore = reloadMatrixProbeState();
    reloadMatrixProbeWriteEvent(viewSheet, SHEET_FIRST_DATA_ROW, viewOrdinaryColumn, 'DEV output edit');
    var viewDataAfter = reloadMatrixProbeState();
    reloadProbeAssert(report, 'Sheet quản trị hàng 4 cột dữ liệu sinh không vẽ', viewDataAfter.revision === viewDataBefore.revision, 'revision=' + viewDataAfter.revision);

    report.push('Hoàn tất: tất cả ca probe reload đều đạt.');
    return report;
  } finally {
    try {
      if (activityRows) { activity.sheet.getRange(activityStartRow, 1, activityRows, activity.columnMap.lastColumn).clearContent(); }
      if (customerRows) { customer.sheet.getRange(customerStartRow, 1, customerRows, customer.columnMap.lastColumn).clearContent(); }
      SpreadsheetApp.flush();
      if (temporaryView) { book.deleteSheet(book.getSheetByName(RELOAD_MATRIX_PROBE_VIEW)); }
      if (extraInvalidColumn) { customer.sheet.deleteColumn(customer.sheet.getMaxColumns()); }
      shinViewSheetNames(book).forEach(renderViewSheet);
      reloadProbeRestoreProperties(propSnapshot);
      reloadMatrixProbeRestoreUserPrefs(userPrefsSnapshot);
    } catch (cleanupError) {
      throw new Error('Probe không dọn sạch được: ' + errorMessage(cleanupError));
    }
  }
}
