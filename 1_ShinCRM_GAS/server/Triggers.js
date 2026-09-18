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

function shinHeaderSnapshotKey(sheetName) { return 'SHIN_HEADER_SNAPSHOT_' + String(sheetName || ''); }

function shinHeaderSnapshotRead(sheet) {
  var raw = PropertiesService.getDocumentProperties().getProperty(shinHeaderSnapshotKey(sheet.getName()));
  if (!raw) { return null; }
  try { var parsed = JSON.parse(raw); return Array.isArray(parsed) ? parsed : null; } catch (ignore) { return null; }
}

function shinHeaderValues(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return []; }
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return String(value === null || value === undefined ? '' : value).trim();
  });
}

function shinHeaderSnapshotWrite(sheet) {
  PropertiesService.getDocumentProperties().setProperty(shinHeaderSnapshotKey(sheet.getName()), JSON.stringify(shinHeaderValues(sheet)));
}

function shinHeaderRangeHasValidCode(sheet, range, event, validCode) {
  if (!shinRangeTouchesRow(range, 1)) { return false; }
  var first = range.getColumn();
  var last = range.getLastColumn();
  var current = shinHeaderValues(sheet);
  var previous = shinHeaderSnapshotRead(sheet);
  if (!previous) { return true; }
  var rowCount = typeof range.getNumRows === 'function' ? range.getNumRows() : range.getLastRow() - range.getRow() + 1;
  var single = first === last && rowCount === 1;
  for (var column = first; column <= last; column++) {
    var oldValue = previous && previous[column - 1];
    var newValue = current[column - 1];
    if (single && Object.prototype.hasOwnProperty.call(event || {}, 'oldValue')) { oldValue = event.oldValue; }
    if (validCode(oldValue) || validCode(newValue)) { return true; }
  }
  return false;
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

function shinDefaultCodeMap(sheet, entity) {
  var valid = {};
  if (DATA_SCHEMA[entity]) {
    Object.keys(DATA_SCHEMA[entity]).forEach(function (name) { valid[DATA_SCHEMA[entity][name].code] = true; });
  } else if (entity === 'category' || entity === 'config') {
    sheetCoreColumns(entity === 'category' ? 'Category' : 'Config').forEach(function (pair) { valid[pair[0]] = true; });
  } else {
    return null;
  }
  return valid;
}

function shinDefaultCodeIsValid(sheet, entity, firstColumn, lastColumn) {
  var valid = shinDefaultCodeMap(sheet, entity);
  if (!valid) { return false; }
  return sheet.getRange(1, firstColumn, 1, lastColumn - firstColumn + 1).getValues()[0].some(function (value) {
    return !!valid[String(value === null || value === undefined ? '' : value).trim()];
  });
}

function shinSchemaEditNeedsReload(sheet, range, event) {
  var valid = shinDefaultCodeMap(sheet, sheet.getName().toLowerCase()) || {};
  return shinHeaderRangeHasValidCode(sheet, range, event, function (value) {
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
function shinViewHeaderCodeIsValid(code) {
  var value = String(code === null || code === undefined ? '' : code).trim();
  return shinViewCodeIsValid(value) || value === '@VIEW_SORT_COL' || value === '@VIEW_SORT_LEVEL';
}

function shinViewEditNeedsRender(sheet, range, event) {
  if (shinRangeTouchesRow(range, 1)) {
    return shinHeaderRangeHasValidCode(sheet, range, event, shinViewHeaderCodeIsValid);
  }
  if (shinRangeTouchesCodedFilter(sheet, range)) { return true; }
  return shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_COL'))
    || shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_LEVEL'));
}

function shinOnEdit(event) {
  if (!event || !event.range) { return; }
  var range = event.range;
  var sheet = range.getSheet();
  var result;
  try {
    result = runEntryPoint('shinOnEdit', 'core', ERROR_CHANNEL_THROW, function () {
    var name = sheet.getName();
    if (name.charAt(0) === '!') {
      if (shinViewEditNeedsRender(sheet, range, event)) {
        var viewDecision = shinReloadDecision({ source: 'edit', surface: 'view-control', viewControl: true });
        if (viewDecision.views.action === 'render') { return shinRenderAllViewsAfterSignal({ policyBypass: viewDecision.views.policyBypass === true }); }
      }
      return;
    }
    if (shinSchemaEditNeedsReload(sheet, range, event)) {
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
  } finally {
    if (shinRangeTouchesRow(range, 1)) { shinHeaderSnapshotWrite(sheet); }
  }
  return result;
}

function shinOnChange(event) {
  return runEntryPoint('shinOnChange', 'core', ERROR_CHANNEL_THROW, function () {
    var type = String(event && event.changeType || '').toUpperCase();
    var book = shinOpenBook();
    var active = book.getActiveSheet();
    var name = active && typeof active.getName === 'function' ? active.getName() : '';

    if (type === 'INSERT_GRID') {
      book.getSheets().filter(function (sheet) { return sheet.getName().charAt(0) === '!'; }).forEach(function (sheet) { prepareViewSheet(sheet.getName()); });
      var inserted = shinReloadDecision({ source: 'change', surface: 'view-control', viewControl: true });
      return inserted.views.action === 'render' ? shinRenderAllViewsAfterSignal({ policyBypass: inserted.views.policyBypass === true }) : inserted;
    }

    if (type === 'REMOVE_GRID') {
      var removed = shinReloadDecision({ source: 'change', surface: 'view-control', viewControl: true });
      return removed.views.action === 'render' ? shinRenderAllViewsAfterSignal({ policyBypass: removed.views.policyBypass === true }) : removed;
    }

    // onChange không có range đáng tin cậy. Với thêm/xóa hàng/cột, đánh dấu
    // bảo thủ theo sheet đang active; nếu không xác định được thì dùng full core.
    if (['INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN'].indexOf(type) >= 0) {
      var structural;
      if (name === ENTITY_SHEETS.customer || name === ENTITY_SHEETS.activity) {
        structural = shinReloadDecision({ source: 'change', surface: 'structure', structure: true, allCore: true });
      } else if (name === 'Category') {
        structural = shinReloadDecision({ source: 'change', surface: 'category', entity: 'category' });
      } else if (name === 'Config') {
        structural = shinReloadDecision({ source: 'change', surface: 'config', entity: 'config' });
      } else if (name && name.charAt(0) === '!') {
        structural = shinReloadDecision({ source: 'change', surface: 'view-control', viewControl: true });
      } else {
        structural = shinReloadDecision({ source: 'change', surface: 'structure', structure: true, allCore: true });
      }
      return structural.views.action === 'render' ? shinRenderAllViewsAfterSignal({ policyBypass: structural.views.policyBypass === true }) : structural;
    }

    return null;
  });
}

function shinInstallTriggers() {
  var book = shinOpenBook();
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'shinOnEdit' || handler === 'shinOnChange') { ScriptApp.deleteTrigger(trigger); }
  });
  ScriptApp.newTrigger('shinOnEdit').forSpreadsheet(book).onEdit().create();
  ScriptApp.newTrigger('shinOnChange').forSpreadsheet(book).onChange().create();
  book.getSheets().forEach(function (sheet) { shinHeaderSnapshotWrite(sheet); });
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
