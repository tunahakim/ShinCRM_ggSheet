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
  var cappedLastRow = Math.min(lastRow, firstRow + VIEW_SORT_MAX_LEVELS - 1);
  if (!colAt || !levelAt || cappedLastRow < firstRow) { return []; }
  var rows = sheet.getRange(firstRow, 1, cappedLastRow - firstRow + 1, Math.max(colAt, levelAt)).getValues();
  return rows.map(function (row) { return { col: String(row[colAt - 1] || '').trim(), level: String(row[levelAt - 1] || '').trim() }; });
}

function viewColumnA1(column, row) {
  var label = '';
  var n = column;
  while (n > 0) { n -= 1; label = String.fromCharCode(65 + n % 26) + label; n = Math.floor(n / 26); }
  return label + row;
}

var VIEW_ERROR_NOTE_PREFIX = '⛔ ShinCRM:';
var VIEW_USER_NOTE_MARKER = '\n\nGhi chú trước đó:\n';
var VIEW_FILTER_ROW = 3;

/** Múi giờ tệp, đọc lười: chỉ ô lọc kiểu ngày mới cần, nên lượt vẽ thường không tốn lệnh này. */
function viewTimezoneReader() {
  var timezone = null;
  return function () {
    if (timezone === null) { timezone = shinOpenBook().getSpreadsheetTimeZone(); }
    return timezone;
  };
}

/** Chữ của một ô hàng lọc. Ô đã bị Sheets tự đổi thành ngày (gõ `2026-10-01` khi ô chưa có khuôn chữ) đọc lại đúng chữ người gõ. */
function viewFilterCellText(value, timezone) {
  if (dateTextIsDate(value)) { return dateToText(value, 'day', timezone()); }
  return String(value === null || value === undefined ? '' : value).trim();
}

function viewHeaderRow(sheet, lastColumn) {
  return sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) { return String(value === null || value === undefined ? '' : value).trim(); });
}

/** Dấu vân tay của đúng các ô người dùng dùng để điều khiển một sheet quản trị. Không ném lỗi khi hàng 1 có mã trùng: lượt vẽ hỏng vì mã trùng vẫn phải được sổ nhớ theo dấu vân tay này. */
function viewInputSignature(sheet, timezone) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return 'empty'; }

  var header = viewHeaderRow(sheet, lastColumn);
  var rawFilterRow = sheet.getRange(VIEW_FILTER_ROW, 1, 1, lastColumn).getValues()[0];
  var filterRow = rawFilterRow.map(function (value, i) { return header[i].charAt(0) === '@' ? viewFilterCellText(value, timezone) : ''; });
  var sortMap = { '@VIEW_SORT_COL': header.indexOf('@VIEW_SORT_COL') + 1, '@VIEW_SORT_LEVEL': header.indexOf('@VIEW_SORT_LEVEL') + 1 };
  var sortPairs = viewReadSortPairs(sheet, sortMap, SHEET_FIRST_DATA_ROW, sheet.getLastRow()).filter(function (pair) { return pair.col || pair.level; });
  var raw = JSON.stringify([header, filterRow, sortPairs]);
  var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return bytes.map(function (byte) { return ('0' + (byte & 0xFF).toString(16)).slice(-2); }).join('');
}

function viewInputMetaFromHeader(header, revision) {
  var filterColumns = [];
  var sortColumns = [];
  header.forEach(function (code, i) {
    if (code.charAt(0) === '@') { filterColumns.push(i + 1); }
    if (code === '@VIEW_SORT_COL' || code === '@VIEW_SORT_LEVEL') { sortColumns.push(i + 1); }
  });
  return { revision: Number(revision) || 0, filterColumns: filterColumns, sortColumns: sortColumns };
}

function viewInputMeta(sheet, entry) {
  var lastColumn = sheet.getLastColumn();
  var revision = entry ? entry.revision : 0;
  return viewInputMetaFromHeader(lastColumn < 1 ? [] : viewHeaderRow(sheet, lastColumn), revision);
}

function viewFilterErrorText(error) {
  return [error.reason, error.hint].filter(function (part, i, all) { return part && all.indexOf(part) === i; }).join(' ');
}

/** Lỗi lượt vẽ mang theo note cần đặt và ô công thức chặn (nếu có); cửa thử vẽ quyết có ghi note hay không. */
function viewRenderError(message, notes, blocker) {
  var error = new Error(message);
  error.viewNotes = notes || [];
  error.viewBlocker = blocker || null;
  return error;
}

function viewSetErrorNote(sheet, column, message) {
  var cell = sheet.getRange(VIEW_FILTER_ROW, column);
  var current = typeof cell.getNote === 'function' ? String(cell.getNote() || '') : '';
  var userNote = current;
  if (current.indexOf(VIEW_ERROR_NOTE_PREFIX) === 0) {
    var markerAt = current.indexOf(VIEW_USER_NOTE_MARKER);
    userNote = markerAt >= 0 ? current.slice(markerAt + VIEW_USER_NOTE_MARKER.length) : '';
  }
  cell.setNote(VIEW_ERROR_NOTE_PREFIX + ' ' + message + (userNote ? VIEW_USER_NOTE_MARKER + userNote : ''));
}

function viewClearErrorNotes(sheet, columns) {
  columns.forEach(function (column) {
    var cell = sheet.getRange(VIEW_FILTER_ROW, column);
    if (typeof cell.getNote !== 'function') { return; }
    var current = String(cell.getNote() || '');
    if (current.indexOf(VIEW_ERROR_NOTE_PREFIX) !== 0) { return; }
    var markerAt = current.indexOf(VIEW_USER_NOTE_MARKER);
    if (markerAt >= 0) { cell.setNote(current.slice(markerAt + VIEW_USER_NOTE_MARKER.length)); }
    else { cell.clearNote(); }
  });
}

/** Ô công thức trong vùng bộ vẽ ghi sẽ bị xóa mất ở lần vẽ, nên dừng trước khi chạm bất kỳ ô nào. Note đặt ở ô hàng lọc của cột đó; ô công thức là `blocker` để sổ biết thử lại khi nó được gỡ. */
function viewAssertNoFormulas(sheet, name, spans) {
  var rows = sheet.getLastRow() - SHEET_FIRST_DATA_ROW + 1;
  if (rows < 1) { return; }
  var found = null;
  spans.some(function (span) {
    var formulas = sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], rows, span[1]).getFormulas();
    for (var r = 0; r < formulas.length && !found; r++) {
      for (var c = 0; c < formulas[r].length; c++) {
        if (formulas[r][c]) { found = { row: SHEET_FIRST_DATA_ROW + r, column: span[0] + c, formula: formulas[r][c] }; break; }
      }
    }
    return !!found;
  });
  if (!found) { return; }
  var cell = viewColumnA1(found.column, found.row);
  var hint = 'Ô ' + cell + ' có công thức ' + found.formula + ' nằm trong cột ShinCRM tự vẽ. Chuyển công thức sang cột không có mã @ hoặc sang sheet khác.';
  throw viewRenderError('Sheet "' + name + '", ô ' + cell + ': ' + hint + ' Sheet chưa được vẽ lại.', [{ column: found.column, text: hint }], { row: found.row, column: found.column });
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

/** Hàng lọc khuôn chữ để người dùng gõ gì ô giữ đúng chữ đó, kể cả `2026-10-01` mà Sheets hay tự đổi thành ngày. */
function viewFormatFilterRowText(sheet, columns) {
  viewColumnSpans(columns).forEach(function (span) {
    sheet.getRange(VIEW_FILTER_ROW, span[0], 1, span[1]).setNumberFormat(COLUMN_FORMAT_TEXT);
  });
}

/** Ô đã thành ngày từ trước thì ghi lại chữ một lần. Dấu vân tay đọc ô ngày và ô chữ ra cùng chuỗi nên lần ghi lại không sinh lượt vẽ thứ hai. */
function viewKeepFilterRowText(sheet, writable, filterRow, timezone) {
  viewFormatFilterRowText(sheet, writable);
  writable.forEach(function (column) {
    var value = filterRow[column - 1];
    if (dateTextIsDate(value)) { sheet.getRange(VIEW_FILTER_ROW, column).setValue(viewFilterCellText(value, timezone)); }
  });
}

/** Vẽ một lượt; không ghi sổ, không ghi note lỗi — việc của `viewAttemptLocked`. `clearNotes`: lượt trước hỏng hoặc chưa có sổ thì mới dò gỡ note ⛔. */
function viewRenderSheetLocked(sheet, name, timezone, clearNotes) {
  var config = configReadAll();
  var customerContext = entityReadContext('customer');
  var activityContext = entityReadContext('activity');
  var sourceHeaders = customerContext.columnMap.headerRow.concat(activityContext.columnMap.headerRow);
  var fieldByCode = viewFieldMaps(config.sheetSchema, sourceHeaders);
  var sourceFieldByCode = viewSourceFieldMaps(fieldByCode, sourceHeaders);
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return { header: [], rows: 0 }; }
  var header = viewHeaderRow(sheet, lastColumn);
  var filterRow = sheet.getRange(VIEW_FILTER_ROW, 1, 1, lastColumn).getValues()[0];
  var headerMap = viewHeaderMap(header, name);
  var writable = viewWritableColumns(header, customerContext, activityContext);
  var filters = {};
  var filterErrors = [];
  writable.forEach(function (column) {
    var raw = viewFilterCellText(filterRow[column - 1], timezone);
    if (!raw) { return; }
    var parsed = filterParseCell(raw, fieldByCode[header[column - 1]]);
    if (parsed.errors.length) { parsed.errors.forEach(function (error) { filterErrors.push({ cell: viewColumnA1(column, VIEW_FILTER_ROW), column: column, error: error }); }); }
    else { filters[column] = parsed; }
  });
  if (filterErrors.length) {
    var notes = {};
    filterErrors.forEach(function (item) {
      if (!notes[item.column]) { notes[item.column] = []; }
      notes[item.column].push(viewFilterErrorText(item.error));
    });
    throw viewRenderError(
      filterErrors.map(function (item) { return 'Sheet "' + name + '", ô ' + item.cell + ': bạn gõ "' + item.error.raw + '". ' + viewFilterErrorText(item.error) + ' Sheet chưa được vẽ lại.'; }).join('\n'),
      Object.keys(notes).map(function (column) { return { column: Number(column), text: notes[column].join('\n') }; })
    );
  }

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
  viewAssertNoFormulas(sheet, name, spans);
  viewKeepFilterRowText(sheet, writable, filterRow, timezone);
  var oldLast = Math.max(sheet.getLastRow(), SHEET_FIRST_DATA_ROW - 1);
  var oldRows = oldLast - SHEET_FIRST_DATA_ROW + 1;
  var formatRows = Math.max(oldRows, rows.length);
  var textColumns = writable.filter(function (column) { return columnFormatIsText(fieldByCode[header[column - 1]]); });
  if (formatRows > 0) {
    viewColumnSpans(textColumns).forEach(function (span) {
      sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], formatRows, span[1]).setNumberFormat(COLUMN_FORMAT_TEXT);
    });
  }
  if (oldRows > 0) { spans.forEach(function (span) { sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], oldRows, span[1]).clearContent(); }); }
  if (rows.length) {
    spans.forEach(function (span) {
      var matrix = rows.map(function (row) { return header.slice(span[0] - 1, span[0] - 1 + span[1]).map(function (code) { return row.values[code] === undefined ? '' : row.values[code]; }); });
      sheet.getRange(SHEET_FIRST_DATA_ROW, span[0], rows.length, span[1]).setValues(matrix);
    });
  }
  if (clearNotes) { viewClearErrorNotes(sheet, writable); }
  SpreadsheetApp.flush();
  return { header: header, rows: rows.length };
}

/**
 * Cửa duy nhất của mọi lượt thử vẽ (tự động, trigger, bấm làm mới): ghi sổ trước khi trả hay ném.
 * Note ⛔ chỉ ghi khi lỗi khác lỗi của lượt hỏng trước, vì ghi note là ghi Sheet và đánh thức Sidebar lần nữa. Lỗi lặp lại vẫn ném (người bấm làm mới phải thấy lỗi) nhưng mang `viewRepeated` để bên gọi không ghi Log thêm.
 * `data` đọc lúc bắt đầu: tín hiệu đến giữa lượt vẽ để sheet vẫn cũ.
 */
function viewAttemptLocked(sheet, name, input, timezone) {
  var previous = viewLedgerEntry(name);
  var data = reloadStateRead().revision;
  var revision = previous ? Number(previous.revision) || 0 : 0;
  var drawn;
  try {
    drawn = viewRenderSheetLocked(sheet, name, timezone, !previous || previous.ok !== true);
  } catch (error) {
    var message = String(error && error.message || error);
    var repeated = !!previous && previous.ok !== true && previous.error === message;
    if (!repeated && error && error.viewNotes && error.viewNotes.length) {
      error.viewNotes.forEach(function (note) { viewSetErrorNote(sheet, note.column, note.text); });
      SpreadsheetApp.flush();
    }
    viewLedgerWrite(name, { data: data, input: input, ok: false, error: message, at: Date.now(), revision: revision, blocker: error && error.viewBlocker || null });
    if (error && typeof error === 'object') { error.viewRepeated = repeated; }
    throw error;
  }
  viewLedgerWrite(name, { data: data, input: input, ok: true, error: '', at: Date.now(), revision: revision + 1, blocker: null });
  viewTabTintRestoreLocked(sheet, name);
  return { ok: true, sheetName: name, viewMeta: viewInputMetaFromHeader(drawn.header, revision + 1), rows: drawn.rows, reload: reloadStateRead() };
}

function viewOpenLocked(sheetName, work) {
  var name = String(sheetName || '').trim();
  var sheet = name.charAt(0) === '!' ? shinOpenBook().getSheetByName(name) : null;
  if (!sheet) { throw new Error(name.charAt(0) === '!' ? 'Không tìm thấy sheet quản trị "' + name + '".' : 'Sheet quản trị phải có tên bắt đầu bằng !.'); }
  var lock = LockService.getDocumentLock();
  if (!documentStoreTryLock(lock, SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận. Vui lòng thử lại!'); }
  try {
    return work(sheet, name);
  } finally {
    lock.releaseLock();
  }
}

/** Người dùng yêu cầu vẽ (bấm làm mới, menu, tạo sheet): luôn thử, kể cả khi sổ nói đầu vào này đã hỏng. */
function renderViewSheet(sheetName) {
  return viewOpenLocked(sheetName, function (sheet, name) {
    var timezone = viewTimezoneReader();
    return viewAttemptLocked(sheet, name, viewInputSignature(sheet, timezone), timezone);
  });
}

/** Vẽ nhiều sheet quản trị, sheet lỗi không chặn sheet sau. Không truyền tên thì vẽ mọi sheet `!`. Không đọc công tắc người dùng: chỉ gọi khi người dùng sửa bộ điều khiển. */
function renderAllManagedViews(sheetNames) {
  var names = Array.isArray(sheetNames) ? sheetNames : shinViewSheetNames(shinOpenBook());
  var results = names.map(function (name) {
    try {
      return renderViewSheet(name);
    } catch (error) {
      // Sheet lỗi không chặn sheet sau, nhưng không được im lặng: note trên sheet báo tại chỗ, Log giữ vết khi không ai đứng ở sheet đó. Lỗi trùng lượt hỏng trước đã có trong Log.
      if (!(error && error.viewRepeated)) { logEvent({ source: 'core', action: 'renderView', outcome: LOG_WARN, reason: errorMessage(error), detail: { sheetName: name } }); }
      return { ok: false, sheetName: name, error: String(error && error.message || error), reload: reloadStateRead() };
    }
  });
  var failed = results.filter(function (result) { return result.ok !== true; });
  return {
    ok: failed.length === 0,
    results: results,
    failed: failed,
    rendered: results.filter(function (result) { return result.ok === true; }),
    reload: reloadStateRead()
  };
}

function viewProbeRenderCurrent() {
  var sheet = shinOpenBook().getActiveSheet();
  var result = renderViewSheet(sheet.getName());
  var report = ['Sheet: ' + result.sheetName, 'Số dòng: ' + result.rows];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}

/**
 * Sidebar gọi khi có người xem sheet: thử vẽ khi sổ nói cần thử (dữ liệu đổi, ô điều khiển đổi, công thức chặn đã gỡ, lượt hỏng đến hạn thử lại). Ngoài đó chỉ trả `viewMeta` và kết quả lượt thử gần nhất, kể cả lỗi, mà không ghi Sheet.
 * `controlsOnly`: đường lấy metadata hàng điều khiển bỏ qua phần dữ liệu; sheet cũ thì để lời hỏi `probeSelectionAndReload` quyết theo núm người dùng, không vẽ lén khi núm tắt.
 */
function renderViewIfDirty(sheetName, options) {
  return runEntryPoint('renderViewIfDirty', 'sidebar', 'throw', function () { return viewRenderIfStale(sheetName, options); });
}

/** Phần ruột không bọc cửa vào, cho đường nội bộ và probe DEV. */
function viewRenderIfStale(sheetName, options) {
  var controlsOnly = !!(options && options.controlsOnly);
  return viewOpenLocked(sheetName, function (sheet, name) {
    var now = Date.now();
    var timezone = viewTimezoneReader();
    var entry = viewLedgerEntry(name);
    var input = viewInputSignature(sheet, timezone);
    var reload = reloadStateRead();
    if (viewLedgerControlsNeedAttempt(entry, sheet, input, now) || (!controlsOnly && viewLedgerDataNeedsAttempt(entry, reload.viewsStaleRevision, now))) {
      return viewAttemptLocked(sheet, name, input, timezone);
    }
    return { ok: entry.ok === true, skipped: true, sheetName: name, error: entry.ok === true ? '' : entry.error, viewMeta: viewInputMeta(sheet, entry), reload: reload };
  });
}

/** Kiểm tra nhẹ trước khi client quyết định có cần khóa sidebar và làm mới view hay không. */
function inspectViewState(sheetName, knownRevision) {
  return runEntryPoint('inspectViewState', 'sidebar', 'throw', function () {
    var started = Date.now();
    return viewOpenLocked(sheetName, function (sheet, name) {
      var reload = reloadStateRead();
      var entry = viewLedgerEntry(name);
      var revision = entry ? Number(entry.revision) || 0 : 0;
      return {
        ok: true,
        sheetName: name,
        changed: revision !== (Number(knownRevision) || 0),
        // Chỉ phần điều khiển; sheet cũ do lời hỏi probe quyết theo núm người dùng.
        needsRender: viewLedgerControlsNeedAttempt(entry, sheet, viewInputSignature(sheet, viewTimezoneReader()), started),
        dirty: reload,
        reload: reload,
        revision: revision,
        ms: Date.now() - started
      };
    });
  });
}
