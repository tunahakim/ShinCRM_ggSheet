/** Trigger cài đặt cho dữ liệu kho và sheet quản trị. */

function shinOnEdit(event) {
  if (!event || !event.range) { return; }
  var range = event.range;
  var sheet = range.getSheet();
  var name = sheet.getName();
  if (name.charAt(0) === '!') {
    if (range.getRow() <= SHEET_FIRST_DATA_ROW - 1) { dirtyStateMarkViewSheet(name); }
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

