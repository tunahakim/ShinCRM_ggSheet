/** Trigger cài đặt cho dữ liệu kho và sheet quản trị. */

function shinViewSheetNames(book) {
  return book.getSheets().map(function (sheet) { return sheet.getName(); }).filter(function (name) { return name.charAt(0) === '!'; });
}

function shinRangeTouchesRow(range, row) {
  return range.getRow() <= row && range.getLastRow() >= row;
}

function shinRangeTouchesColumn(range, column) {
  return column > 0 && range.getColumn() <= column && range.getLastColumn() >= column;
}

/** Hàng 3 chỉ là hàng lọc dưới cột mang mã `@`; chữ ghi chú dưới cột thường không phải cấu hình view. */
function shinRangeTouchesCodedFilter(sheet, range) {
  if (!shinRangeTouchesRow(range, 3)) { return false; }
  var first = range.getColumn();
  var count = range.getLastColumn() - first + 1;
  return sheet.getRange(1, first, 1, count).getValues()[0].some(function (value) {
    var code = String(value === null || value === undefined ? '' : value).trim();
    return shinViewCodeIsValid(code);
  });
}

function shinViewCodeIsValid(code) {
  var value = String(code || '').trim();
  if (!/^@(CUS|ACT)_/.test(value)) { return false; }
  try {
    var entity = value.indexOf('@CUS_') === 0 ? 'customer' : 'activity';
    return selectionColumnIndex(shinOpenSheet(ENTITY_SHEETS[entity]), value) > 0;
  } catch (ignore) {
    return false;
  }
}

function shinDefaultCodeIsValid(sheet, entity, firstColumn, lastColumn) {
  var valid = {};
  if (DATA_SCHEMA[entity]) {
    Object.keys(DATA_SCHEMA[entity]).forEach(function (name) { valid[DATA_SCHEMA[entity][name].code] = true; });
  } else if (entity === 'category' || entity === 'config') {
    sheetCoreColumns(entity === 'category' ? 'Category' : 'Config').forEach(function (pair) { valid[pair[0]] = true; });
  } else {
    return false;
  }
  return sheet.getRange(1, firstColumn, 1, lastColumn - firstColumn + 1).getValues()[0].some(function (value) {
    return !!valid[String(value === null || value === undefined ? '' : value).trim()];
  });
}

function shinReloadDecision(input) {
  var change = input || {};
  change.viewSheetNames = change.viewSheetNames || shinViewSheetNames(shinOpenBook());
  var decision = reloadDecisionForChange(change);
  dirtyStateMarkDecision(decision);
  return decision;
}

function shinRenderAllViewsAfterSignal(options) {
  if (typeof renderAllManagedViewsIfAllowed === 'function') { return renderAllManagedViewsIfAllowed(options); }
  if (typeof renderAllViewSheets === 'function') { return renderAllViewSheets(); }
  if (typeof renderViewIfDirty === 'function') {
    return shinViewSheetNames(shinOpenBook()).map(function (name) { return renderViewIfDirty(name); });
  }
  return null;
}

/** Chỉ ba vùng cấu hình của sheet quản trị được phép kích hoạt một lượt làm mới tự động. */
function shinViewEditNeedsRender(sheet, range) {
  if (shinRangeTouchesRow(range, 1) || shinRangeTouchesCodedFilter(sheet, range)) { return true; }
  return shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_COL'))
    || shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_LEVEL'));
}

function shinOnEdit(event) {
  if (!event || !event.range) { return; }
  return runEntryPoint('shinOnEdit', 'core', ERROR_CHANNEL_THROW, function () {
    var range = event.range;
    var sheet = range.getSheet();
    var name = sheet.getName();
    if (name.charAt(0) === '!') {
      if (shinViewEditNeedsRender(sheet, range)) {
        var viewDecision = shinReloadDecision({ source: 'edit', surface: 'view-control', viewControl: true });
        if (viewDecision.views.action === 'render') { return shinRenderAllViewsAfterSignal({ policyBypass: viewDecision.views.policyBypass === true }); }
      }
      return;
    }
    if (shinRangeTouchesRow(range, 1)) {
      var schemaDecision = shinReloadDecision({ source: 'edit', surface: 'schema', schema: true });
      if (schemaDecision.views.action === 'render') { return shinRenderAllViewsAfterSignal(); }
      return schemaDecision;
    }
    if (name === 'Config' || name === 'Category') {
      if (range.getRow() < SHEET_FIRST_DATA_ROW) { return; }
      if (!shinDefaultCodeIsValid(sheet, name.toLowerCase(), range.getColumn(), range.getLastColumn())) { return; }
      var configDecision = shinReloadDecision({ source: 'edit', surface: name.toLowerCase(), entity: name.toLowerCase() });
      if (configDecision.views.action === 'render') { return shinRenderAllViewsAfterSignal(); }
      return configDecision;
    }
    var entity = name === ENTITY_SHEETS.customer ? 'customer' : name === ENTITY_SHEETS.activity ? 'activity' : '';
    if (!entity || range.getRow() < SHEET_FIRST_DATA_ROW) { return; }
    if (!shinDefaultCodeIsValid(sheet, entity, range.getColumn(), range.getLastColumn())) { return; }
    var column = selectionColumnIndex(sheet, DATA_SCHEMA[entity].id.code);
    if (!column) { return; }
    var last = range.getLastRow();
    var ids = sheet.getRange(range.getRow(), column, last - range.getRow() + 1, 1).getValues().map(function (row) { return row[0]; });
    var recordDecision = shinReloadDecision({ source: 'edit', surface: 'record', entity: entity, recordIds: ids });
    if (recordDecision.views.action === 'render') { return shinRenderAllViewsAfterSignal(); }
    return recordDecision;
  });
}

function shinOnChange(event) {
  if (event && event.changeType === 'INSERT_GRID') {
    var book = shinOpenBook();
    book.getSheets().filter(function (sheet) { return sheet.getName().charAt(0) === '!'; }).forEach(function (sheet) { prepareViewSheet(sheet.getName()); });
  }
}

function shinInstallTriggers() {
  var book = shinOpenBook();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'shinOnEdit' || handler === 'shinOnChange') { ScriptApp.deleteTrigger(trigger); }
  });
  ScriptApp.newTrigger('shinOnEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('shinOnChange').forSpreadsheet(book).onChange().create();
  return ['shinOnEdit', 'shinOnChange'];
}

/** Nghiệm thu DEV: cho biết hai trigger cài đặt có thực sự tồn tại trên tệp đang chạy hay không. */
function probeTriggerState() {
  var handlers = ScriptApp.getProjectTriggers().map(function (trigger) { return trigger.getHandlerFunction(); });
  return [
    'shinOnEdit: ' + (handlers.indexOf('shinOnEdit') >= 0),
    'shinOnChange: ' + (handlers.indexOf('shinOnChange') >= 0),
    'Tất cả handler: ' + handlers.join(', ')
  ];
}
