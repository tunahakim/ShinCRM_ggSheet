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

/** Chỉ ba vùng cấu hình của sheet quản trị được phép kích hoạt một lượt làm mới tự động. */
function shinViewEditNeedsRender(sheet, range) {
  if (shinRangeTouchesRow(range, 1) || shinRangeTouchesRow(range, 3)) { return true; }
  return shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_COL'))
    || shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_LEVEL'));
}

function shinOnEdit(event) {
  if (!event || !event.range) { return; }
  return runEntryPoint('shinOnEdit', 'core', ERROR_CHANNEL_TOAST, function () {
    var range = event.range;
    var sheet = range.getSheet();
    var name = sheet.getName();
    if (name.charAt(0) === '!') {
      if (shinViewEditNeedsRender(sheet, range)) { return renderViewSheet(name); }
      return;
    }
    if (name === 'Config' || name === 'Category') { dirtyStateMarkConfig(); return; }
    var entity = name === ENTITY_SHEETS.customer ? 'customer' : name === ENTITY_SHEETS.activity ? 'activity' : '';
    if (!entity || range.getRow() < SHEET_FIRST_DATA_ROW) { return; }
    var column = selectionColumnIndex(sheet, DATA_SCHEMA[entity].id.code);
    if (!column) { return; }
    var last = range.getLastRow();
    var ids = sheet.getRange(range.getRow(), column, last - range.getRow() + 1, 1).getValues().map(function (row) { return row[0]; });
    dirtyStateMarkRecords(ids);
    dirtyStateMarkViewSheets(shinViewSheetNames(shinOpenBook()));
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
