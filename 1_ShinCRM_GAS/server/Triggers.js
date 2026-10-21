/** Trigger cài đặt cho dữ liệu kho và sheet quản trị. Tham số `range` của các hàm dưới đây là tọa độ vùng sửa từ `sheetRangeBounds`, không phải đối tượng vùng của Google. */

function shinRangeTouchesRow(range, row) {
  return range.row <= row && range.lastRow >= row;
}

function shinRangeTouchesColumn(range, column) {
  return column > 0 && range.column <= column && range.lastColumn >= column;
}

function shinHeaderSnapshotKey(sheetName) { return 'SHIN_HEADER_SNAPSHOT_' + String(sheetName || ''); }

function shinHeaderSnapshotRead(sheet) {
  return documentMemoRead(documentProps(), shinHeaderSnapshotKey(sheet.getName()), 'ảnh chụp hàng 1 của sheet ' + sheet.getName(), 'array');
}

function shinHeaderValues(sheet) {
  return sheetReadHeader(sheet);
}

/** Mã hàng 1 trong dải cột của vùng sửa, lấy từ bản đọc chung: một lần sửa đi qua nhiều phép kiểm, mỗi phép tự đọc hàng 1 là mỗi phép một lệnh gọi Sheet. */
function shinHeaderSlice(sheet, firstColumn, lastColumn) {
  return sheetReadHeader(sheet).slice(firstColumn - 1, lastColumn);
}

function shinHeaderSnapshotWrite(sheet) {
  documentProps().setProperty(shinHeaderSnapshotKey(sheet.getName()), JSON.stringify(shinHeaderValues(sheet)));
}

function shinHeaderRangeHasValidCode(sheet, range, event, validCode) {
  if (!shinRangeTouchesRow(range, 1)) { return false; }
  var first = range.column;
  var last = range.lastColumn;
  var current = shinHeaderValues(sheet);
  var previous = shinHeaderSnapshotRead(sheet);
  if (!previous) { return true; }
  var rowCount = range.lastRow - range.row + 1;
  var single = first === last && rowCount === 1;
  for (var column = first; column <= last; column++) {
    var oldValue = previous && previous[column - 1];
    var newValue = current[column - 1];
    if (single && Object.prototype.hasOwnProperty.call(event || {}, 'oldValue')) { oldValue = event.oldValue; }
    if (validCode(oldValue) || validCode(newValue)) { return true; }
  }
  return false;
}

/**
 * Ô dưới cột ShinCRM vẽ (mã nguồn `@CUS_`/`@ACT_`) ở hàng lọc hoặc hàng dữ liệu. Hàng lọc là cấu hình. Hàng dữ liệu do ShinCRM sở hữu: sửa tay (thêm công thức, xóa hay đổi giá trị) phải được vẽ lại hoặc báo lỗi ngay, không để sheet sai âm thầm hay lỗi hiện trễ tới lần kho đổi. Hàng nhãn và cột không mã không tính.
 */
function shinRangeTouchesDrawnCell(sheet, range) {
  if (range.lastRow < sheetControlRow(sheet.getName(), 'filter')) { return false; }
  return viewDrawnColumns(shinHeaderSlice(sheet, range.column, range.lastColumn)).length > 0;
}

/** Cột module (mã @ có thật trên sheet kho nhưng ngoài DATA_SCHEMA): sheet `!` đọc được cột đó dù RAM không giữ. */
function shinRangeTouchesViewSource(sheet, range) {
  return shinHeaderSlice(sheet, range.column, range.lastColumn).some(shinViewCodeIsValid);
}

function shinViewCodeIsValid(code) {
  var value = String(code || '').trim();
  if (!/^@(CUS|ACT)_/.test(value)) { return false; }
  var entity = value.indexOf('@CUS_') === 0 ? 'customer' : 'activity';
  return selectionColumnIndex(shinOpenSheet(ENTITY_SHEETS[entity]), value) > 0;
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
  return shinHeaderSlice(sheet, firstColumn, lastColumn).some(function (code) { return !!valid[code]; });
}

/** Sheet ngoài bốn sheet kho không có schema: thiếu ảnh chụp hàng 1 ở đó không được coi thận trọng là đổi schema, nếu không mỗi lần gõ hàng 1 của sheet nháp là một lượt nạp lại toàn bộ. */
function shinSchemaEditNeedsReload(sheet, range, event) {
  var valid = shinDefaultCodeMap(sheet, sheet.getName().toLowerCase());
  if (!valid) { return false; }
  return shinHeaderRangeHasValidCode(sheet, range, event, function (value) {
    return !!valid[String(value === null || value === undefined ? '' : value).trim()];
  });
}

/** Ghi dấu vào danh sách thay đổi chờ ghi nhận của lần chạy; `runEntryPoint` ghi nhận ở cuối (kèm tô cam sheet vừa thành cũ). */
function shinReloadDecision(input) {
  var decision = reloadDecisionForChange(input || {});
  dirtyStateMarkDecision(decision);
  return decision;
}

/** Mã hàng 1 của sheet quản trị mà sửa vào là sửa ô điều khiển: mã cột nguồn hợp lệ và hai cột sắp xếp. */
function shinViewHeaderCodeIsValid(code) {
  var value = String(code === null || code === undefined ? '' : code).trim();
  return shinViewCodeIsValid(value) || value === '@VIEW_SORT_COL' || value === '@VIEW_SORT_LEVEL';
}

/**
 * Sửa này có phải gắn cờ ô điều khiển cho sheet `!` không: hàng 1 có mã hợp lệ, hàng lọc hoặc hàng dữ liệu ở cột ShinCRM vẽ, hàng 4–13 của hai cột sắp xếp, hoặc ô bất kỳ khi sheet đang lỗi (người dùng gỡ công thức hay sửa chỗ sai không nằm trong ô điều khiển). Sheet đang lỗi xét trước vì chỉ đọc sổ vẽ trong kho, không tốn lệnh Sheet.
 */
function shinViewEditMarksControls(sheet, range, event) {
  var entry = viewLedgerEntry(sheet.getName());
  if (entry && entry.ok !== true) { return true; }
  if (shinRangeTouchesRow(range, 1)) {
    return shinHeaderRangeHasValidCode(sheet, range, event, shinViewHeaderCodeIsValid);
  }
  if (shinRangeTouchesDrawnCell(sheet, range)) { return true; }
  var lastSortRow = SHEET_FIRST_DATA_ROW + VIEW_SORT_MAX_LEVELS - 1;
  if (range.lastRow < SHEET_FIRST_DATA_ROW || range.row > lastSortRow) { return false; }
  return shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_COL'))
    || shinRangeTouchesColumn(range, selectionColumnIndex(sheet, '@VIEW_SORT_LEVEL'));
}

/** Bỏ khỏi sổ vẽ tên không còn là sheet `!`. Gọi khi xóa sheet hoặc đổi tên, nên phải liệt kê tab. */
function shinViewLedgerPrune(book) {
  var names = shinViewSheetNames(book);
  documentLockRun(function () { viewLedgerPrune(names); });
  return names;
}

/** Sheet `!` chưa có trong sổ vẽ (vừa thêm hoặc vừa đổi tên thành `!`): chuẩn bị đúng sheet đó và tô cam, vì nó chưa từng được vẽ. */
function shinViewSheetArrived(name) {
  if (name.charAt(0) !== '!' || viewLedgerEntry(name)) { return; }
  prepareViewSheet(name);
  viewTabColorSyncUnrendered([name]);
}

function shinOnEdit(event) {
  if (!event || !event.range) { return; }
  var range = sheetRangeBounds(event.range);
  var sheet = event.range.getSheet();
  var result;
  try {
    result = runEntryPoint('shinOnEdit', 'core', ERROR_CHANNEL_PENDING, function () {
    var name = sheet.getName();
    if (name.charAt(0) === '!') {
      if (shinViewEditMarksControls(sheet, range, event)) {
        return shinReloadDecision({ source: 'edit', surface: 'view-control', sheetName: name });
      }
      return;
    }
    if (shinSchemaEditNeedsReload(sheet, range, event)) {
      return shinReloadDecision({ source: 'edit', surface: 'schema', schema: true });
    }
    if (name === 'Config' || name === 'Category') {
      if (range.row < SHEET_FIRST_DATA_ROW) { return; }
      if (!shinDefaultCodeIsValid(sheet, name.toLowerCase(), range.column, range.lastColumn)) { return; }
      return shinReloadDecision({ source: 'edit', surface: name.toLowerCase(), entity: name.toLowerCase() });
    }
    var entity = name === ENTITY_SHEETS.customer ? 'customer' : name === ENTITY_SHEETS.activity ? 'activity' : '';
    if (!entity || range.row < SHEET_FIRST_DATA_ROW) { return; }
    if (!shinDefaultCodeIsValid(sheet, entity, range.column, range.lastColumn)) {
      return shinRangeTouchesViewSource(sheet, range) ? shinReloadDecision({ source: 'edit', surface: 'view-source' }) : undefined;
    }
    var column = selectionColumnIndex(sheet, DATA_SCHEMA[entity].id.code);
    if (!column) { return; }
    var last = range.lastRow;
    var ids = sheetGridReadBlock(sheet, range.row, last - range.row + 1, 1, column).map(function (row) { return sheetReadCellText(row[0]); });
    // Xóa trắng ô mã thì trigger chỉ thấy ô rỗng sau sửa: một ô đơn còn `oldValue` để đánh dấu đúng mã cũ, vùng nhiều ô thì không biết mã nào đã mất nên nạp trọn thực thể.
    if (shinRangeTouchesColumn(range, column) && ids.indexOf('') >= 0) {
      var single = range.row === last && range.column === range.lastColumn;
      var oldId = single && event && event.oldValue !== undefined && event.oldValue !== null ? String(event.oldValue).trim() : '';
      if (oldId) { ids = [oldId]; }
      else { return shinReloadDecision({ source: 'edit', surface: 'entity', entities: [entity] }); }
    }
    return shinReloadDecision({ source: 'edit', surface: 'record', entity: entity, recordIds: ids });
    });
  } finally {
    if (shinRangeTouchesRow(range, 1)) { shinHeaderSnapshotWrite(sheet); }
  }
  return result;
}

/** `EDIT` đã có `shinOnEdit` lo, `FORMAT` không đổi dữ liệu: hai loại này chiếm gần hết lượt onChange nên trả về trước khi khởi động lượt chạy và mở bảng tính. */
function shinOnChange(event) {
  var type = String(event && event.changeType || '').toUpperCase();
  if (type === 'EDIT' || type === 'FORMAT') { return null; }
  return runEntryPoint('shinOnChange', 'core', ERROR_CHANNEL_PENDING, function () {
    var book = shinOpenBook();
    var active = book.getActiveSheet();
    var name = active && typeof active.getName === 'function' ? active.getName() : '';
    // Vết để biết thao tác nào của người dùng sinh loại nào (nhất là `OTHER`); chỉ ra sheet khi `LOG_TRACE` bật.
    logTrace({ source: 'core', action: 'shinOnChange', outcome: LOG_OK, reason: 'changeType ' + type, detail: { changeType: type, sheetName: name } });

    // Thêm sheet: chỉ sheet đang đứng có thể là sheet vừa thêm. Xóa sheet không làm sheet nào khác cũ, chỉ dọn sổ vẽ.
    if (type === 'INSERT_GRID') { shinViewSheetArrived(name); return null; }
    if (type === 'REMOVE_GRID') { shinViewLedgerPrune(book); return null; }

    // onChange không có range đáng tin cậy nên đánh dấu bảo thủ theo sheet đang active. Thêm/xóa hàng và `OTHER` (sắp xếp, có thể chỉ trên một phần cột) trên Customer/Activity nạp trọn đúng thực thể đó; thêm/xóa cột có thể đổi schema nên vẫn full core.
    var entity = name === ENTITY_SHEETS.customer ? 'customer' : name === ENTITY_SHEETS.activity ? 'activity' : '';
    if (type === 'OTHER') {
      if (entity) { return shinReloadDecision({ source: 'change', surface: 'entity', entities: [entity] }); }
      if (name === 'Category' || name === 'Config') { return shinReloadDecision({ source: 'change', surface: name.toLowerCase(), entity: name.toLowerCase() }); }
      // Đổi tên sheet cũng báo `OTHER`: tên `!` mới chưa có trong sổ vẽ thì chuẩn bị sheet đó; tên cũ (kể cả khi đổi thành tên thường) bỏ khỏi sổ.
      if (name.charAt(0) === '!' && viewLedgerEntry(name)) { return null; }
      shinViewLedgerPrune(book);
      shinViewSheetArrived(name);
      return null;
    }
    if (['INSERT_ROW', 'REMOVE_ROW', 'INSERT_COLUMN', 'REMOVE_COLUMN'].indexOf(type) >= 0) {
      var structural;
      if (entity && (type === 'INSERT_ROW' || type === 'REMOVE_ROW')) {
        structural = shinReloadDecision({ source: 'change', surface: 'entity', entities: [entity] });
      } else if (entity) {
        structural = shinReloadDecision({ source: 'change', surface: 'structure', structure: true, allCore: true });
      } else if (name === 'Category') {
        structural = shinReloadDecision({ source: 'change', surface: 'category', entity: 'category' });
      } else if (name === 'Config') {
        structural = shinReloadDecision({ source: 'change', surface: 'config', entity: 'config' });
      } else if (name && name.charAt(0) === '!') {
        structural = shinReloadDecision({ source: 'change', surface: 'view-control', sheetName: name });
      } else {
        structural = shinReloadDecision({ source: 'change', surface: 'structure', structure: true, allCore: true });
      }
      return structural;
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
