/**
 * Vẽ một sheet quản trị từ kho Customer/Activity. Sheet quản trị không bao giờ là nguồn sự thật. Tài liệu 07.
 *
 * Mọi lệnh đọc và ghi sheet `!` đi qua tầng 1 (`SheetReadCopy`, `SheetCellWrite`): hàng 1, hàng lọc và khối sắp xếp đọc một lần rồi nằm trong tờ nháp của lần gọi; ghi tự quên vùng vừa ghi.
 * Vẽ đè chứ không xóa rồi ghi: mỗi dải cột ShinCRM vẽ là một lệnh ghi cao bằng số dòng cũ hoặc mới (lấy số lớn hơn), dòng thừa ghi ô rỗng.
 * Lỗi chặn vẽ (hàng 1 sai, lọc sai, sắp xếp sai, công thức trong cột ShinCRM vẽ) dừng trước khi chạm ô nào và trả về các khối `{ title, lines, hint }` cho màn thông báo của Sidebar; không còn note trên ô.
 */

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

var VIEW_FILTER_ROW = 3;

/** Múi giờ tệp, đọc lười: chỉ ô lọc kiểu ngày mới cần, nên lượt vẽ thường không tốn lệnh này. */
function viewTimezoneReader() {
  var timezone = null;
  return function () {
    if (timezone === null) { timezone = sheetReadTimezone(); }
    return timezone;
  };
}

/** Chữ của một ô hàng lọc. Ô đã bị Sheets tự đổi thành ngày (gõ `2026-10-01` khi ô chưa có khuôn chữ) đọc lại đúng chữ người gõ. */
function viewFilterCellText(value, timezone) {
  if (dateTextIsDate(value)) { return dateToText(value, 'day', timezone()); }
  return String(value === null || value === undefined ? '' : value).trim();
}

/** Ô điều khiển của sheet: hàng 1, hàng lọc, mười cặp sắp xếp (hàng 4–13) và dòng cuối. Hàng 3–13 đọc chung một lệnh và nằm lại trong tờ nháp. */
function viewControls(sheet) {
  var header = sheetReadHeader(sheet);
  var lastRow = sheetReadLastRow(sheet);
  if (!header.length) { return { header: [], filterRow: [], sortPairs: [], lastRow: lastRow }; }
  var rowNumbers = [VIEW_FILTER_ROW];
  for (var row = SHEET_FIRST_DATA_ROW; row < SHEET_FIRST_DATA_ROW + VIEW_SORT_MAX_LEVELS; row++) { rowNumbers.push(row); }
  var rows = sheetReadRows(sheet, rowNumbers);
  var colAt = header.indexOf('@VIEW_SORT_COL');
  var levelAt = header.indexOf('@VIEW_SORT_LEVEL');
  var sortPairs = colAt < 0 || levelAt < 0 ? [] : rows.slice(1).map(function (values) {
    return { col: String(values[colAt] || '').trim(), level: String(values[levelAt] || '').trim() };
  });
  return { header: header, filterRow: rows[0], sortPairs: sortPairs, lastRow: lastRow };
}

/** Một khối lỗi cho màn thông báo. Cắt bớt dòng chi tiết vì sổ vẽ của mọi sheet nằm chung một DocumentProperty. */
function viewProblem(title, lines, hint) {
  var max = SETTINGS.VIEW_PROBLEM_MAX_LINES;
  var list = lines.slice(0, max);
  if (lines.length > max) { list.push('… và ' + (lines.length - max) + ' dòng khác.'); }
  return { title: title, lines: list, hint: hint || '' };
}

/** Các khối lỗi thành chữ, cho Log và hộp báo của lệnh menu. */
function viewProblemsText(problems) {
  return (problems || []).map(function (problem) {
    return problem.title + ':\n' + problem.lines.map(function (line) { return '- ' + line; }).join('\n') + (problem.hint ? '\n' + problem.hint : '');
  }).join('\n\n');
}

function viewProblemsError(problems) {
  var error = new Error(viewProblemsText(problems));
  error.viewProblems = problems;
  return error;
}

function viewFilterErrorText(error) {
  return [error.reason, error.hint].filter(function (part, i, all) { return part && all.indexOf(part) === i; }).join(' ');
}

/** Cột ShinCRM vẽ mà đang có công thức ở hàng dữ liệu: vẽ đè sẽ xóa mất công thức, nên báo đủ mọi cột như vậy. Mỗi dải cột một lệnh đọc. */
function viewFormulaProblem(sheet, header, writable, lastRow) {
  var rows = lastRow - SHEET_FIRST_DATA_ROW + 1;
  if (rows < 1) { return null; }
  var lines = [];
  sheetRegionsSpans(writable).forEach(function (span) {
    var formulas = sheetReadFormulas(sheet, SHEET_FIRST_DATA_ROW, span[0], rows, span.length);
    span.forEach(function (column, i) {
      var found = formulas.some(function (cells) { return !!cells[i]; });
      if (found) { lines.push('Cột ' + selectionColumnLetters(column) + ', stt: ' + column + ', Mã cột: ' + header[column - 1]); }
    });
  });
  if (!lines.length) { return null; }
  return viewProblem('Có công thức trong các cột ShinCRM tự vẽ', lines, 'Chuyển công thức sang cột không có mã @ hoặc sang sheet khác.');
}

/** Hàng lọc khuôn chữ để người dùng gõ gì ô giữ đúng chữ đó, kể cả `2026-10-01` mà Sheets hay tự đổi thành ngày. */
function viewFormatFilterRowText(sheet, columns) {
  sheetRegionsSpans(columns).forEach(function (span) {
    sheetCellsFormat(sheet, VIEW_FILTER_ROW, span[0], 1, span.length, COLUMN_FORMAT_TEXT);
  });
}

/** Ô đã thành ngày từ trước thì ghi lại chữ một lần. */
function viewKeepFilterRowText(sheet, writable, filterRow, timezone) {
  viewFormatFilterRowText(sheet, writable);
  writable.forEach(function (column) {
    var value = filterRow[column - 1];
    if (dateTextIsDate(value)) { sheetCellsWrite(sheet, VIEW_FILTER_ROW, column, [[viewFilterCellText(value, timezone)]]); }
  });
}

/** Kiểm mọi lỗi chặn vẽ trước khi đọc kho; có lỗi thì ném một lỗi mang đủ các khối, chưa chạm ô nào. Trả các cột được vẽ, bộ lọc và thứ tự sắp đã hiểu. */
function viewRenderPlan(sheet, name, controls, config, fieldByCode, sourceFieldByCode, customerContext, activityContext, timezone) {
  var header = controls.header;
  var writable;
  try {
    viewHeaderMap(header, name);
    writable = viewWritableColumns(header, customerContext, activityContext);
  } catch (headerError) {
    throw viewProblemsError([viewProblem('Hàng mã cột (hàng 1) sai', [errorMessage(headerError)])]);
  }

  var problems = [];
  var filters = {};
  var filterLines = [];
  writable.forEach(function (column) {
    var raw = viewFilterCellText(controls.filterRow[column - 1], timezone);
    if (!raw) { return; }
    var parsed = filterParseCell(raw, fieldByCode[header[column - 1]]);
    if (!parsed.errors.length) { filters[column] = parsed; return; }
    parsed.errors.forEach(function (error) {
      filterLines.push('Ô ' + selectionColumnLetters(column) + VIEW_FILTER_ROW + ' (' + header[column - 1] + '): bạn gõ "' + error.raw + '". ' + viewFilterErrorText(error));
    });
  });
  if (filterLines.length) { problems.push(viewProblem('Điều kiện lọc sai (hàng 3)', filterLines)); }

  var localSort = sortSpecParse(controls.sortPairs, sourceFieldByCode);
  if (localSort.errors.length) { problems.push(viewProblem('Quy tắc sắp xếp của sheet sai (hai cột sắp xếp, hàng 4–13)', localSort.errors)); }
  var configSort = localSort.specs.length || localSort.errors.length ? { specs: [], errors: [] } : sortSpecParse(config.sort, sourceFieldByCode);
  if (configSort.errors.length) { problems.push(viewProblem('Sắp xếp chung trong Config sai', configSort.errors)); }

  var formulas = viewFormulaProblem(sheet, header, writable, controls.lastRow);
  if (formulas) { problems.push(formulas); }
  if (problems.length) { throw viewProblemsError(problems); }

  var specs = localSort.specs.length ? localSort.specs : configSort.specs.length ? configSort.specs : [
    { code: DATA_SCHEMA.activity.workDate.code, direction: 'desc', field: DATA_SCHEMA.activity.workDate },
    { code: DATA_SCHEMA.activity.id.code, direction: 'desc', field: DATA_SCHEMA.activity.id }
  ];
  return { writable: writable, filters: filters, specs: specs };
}

/** Vẽ đè các cột ShinCRM vẽ: mỗi dải cột một lệnh ghi cao bằng số dòng cũ hoặc mới, dòng thừa là ô rỗng nên không cần lệnh xóa. */
function viewWriteRows(sheet, header, writable, rows, oldRows, fieldByCode) {
  var height = Math.max(oldRows, rows.length);
  if (!height) { return; }
  sheetGridEnsureRoom(sheet, SHEET_FIRST_DATA_ROW + height - 1, SHEET_GRID_SLACK);
  var textColumns = writable.filter(function (column) { return columnFormatIsText(fieldByCode[header[column - 1]]); });
  sheetRegionsSpans(textColumns).forEach(function (span) {
    sheetCellsFormat(sheet, SHEET_FIRST_DATA_ROW, span[0], height, span.length, COLUMN_FORMAT_TEXT);
  });
  sheetRegionsSpans(writable).forEach(function (span) {
    var matrix = [];
    for (var i = 0; i < height; i++) {
      var row = rows[i];
      matrix.push(span.map(function (column) {
        var value = row ? row.values[header[column - 1]] : '';
        return value === undefined ? '' : value;
      }));
    }
    sheetCellsWrite(sheet, SHEET_FIRST_DATA_ROW, span[0], matrix);
  });
}

/** Vẽ một lượt; không ghi sổ — việc của `viewAttemptLocked`. Lỗi chặn vẽ ném ra mang `viewProblems`. */
function viewRenderSheetLocked(sheet, name, timezone) {
  var controls = viewControls(sheet);
  var header = controls.header;
  if (!header.length) { return { header: [], rows: 0 }; }
  var config = configReadAll();
  var customerContext = entityReadContext('customer');
  var activityContext = entityReadContext('activity');
  var sourceHeaders = customerContext.columnMap.headerRow.concat(activityContext.columnMap.headerRow);
  var fieldByCode = viewFieldMaps(config.sheetSchema, sourceHeaders);
  var sourceFieldByCode = viewSourceFieldMaps(fieldByCode, sourceHeaders);
  var plan = viewRenderPlan(sheet, name, controls, config, fieldByCode, sourceFieldByCode, customerContext, activityContext, timezone);

  var customers = viewReadEntity(customerContext, fieldByCode);
  var activities = viewLatestActivity(viewReadEntity(activityContext, fieldByCode));
  var customerIdCode = DATA_SCHEMA.customer.id.code;
  var rows = customers.map(function (customer) {
    var values = viewValues(customer, activities[customer[customerIdCode]]);
    var filtered = plan.writable.some(function (column) {
      var code = header[column - 1];
      return !!plan.filters[column] && !filterCellMatches(values[code], plan.filters[column], fieldByCode[code]);
    });
    return { customer: customer, values: values, filtered: filtered };
  }).filter(function (row) { return !row.filtered; });
  viewSortRows(rows, plan.specs);

  viewKeepFilterRowText(sheet, plan.writable, controls.filterRow, timezone);
  viewWriteRows(sheet, header, plan.writable, rows, Math.max(0, controls.lastRow - SHEET_FIRST_DATA_ROW + 1), fieldByCode);
  return { header: header, rows: rows.length };
}

/**
 * Cửa duy nhất của mọi lượt thử vẽ (Sidebar hỏi, bấm làm mới, tạo sheet): ghi sổ rồi trả kết quả, kể cả khi hỏng — lỗi đi vào sổ và về Sidebar dưới dạng khối, không ném.
 * Lỗi giống hệt lượt hỏng trước không ghi Log lần nữa, để lỗi không tự đánh thức thành chuỗi dòng Log. Lỗi ngoài dự kiến (lỗi Google, lỗi code) cũng thành một khối và ghi Log mức lỗi.
 * `data` đọc lúc bắt đầu: tín hiệu đến giữa lượt vẽ để sheet vẫn cũ. Mục sổ mới không mang cờ ô điều khiển: lượt thử này đã xét đúng các ô đó.
 */
function viewAttemptLocked(sheet, name, timezone) {
  var previous = viewLedgerEntry(name);
  var data = reloadStateRead().revision;
  var revision = previous ? Number(previous.revision) || 0 : 0;
  var drawn;
  try {
    drawn = viewRenderSheetLocked(sheet, name, timezone);
  } catch (error) {
    var expected = !!(error && error.viewProblems);
    var problems = expected ? error.viewProblems : [viewProblem('Lỗi khi vẽ sheet', [errorMessage(error)])];
    var repeated = !!previous && previous.ok !== true && JSON.stringify(previous.problems || []) === JSON.stringify(problems);
    viewLedgerWrite(name, { data: data, ok: false, problems: problems, at: Date.now(), revision: revision });
    viewTabColorSync([sheet]);
    if (!repeated) {
      logEvent({ source: 'core', action: 'renderView', outcome: expected ? LOG_WARN : LOG_ERROR, reason: 'Sheet "' + name + '" chưa được vẽ lại.', detail: { sheetName: name, problems: viewProblemsText(problems) } });
    }
    return { ok: false, sheetName: name, problems: problems, reload: reloadStateRead() };
  }
  viewLedgerWrite(name, { data: data, ok: true, problems: [], at: Date.now(), revision: revision + 1 });
  viewTabColorSync([sheet]);
  if (previous && previous.ok !== true) { logEvent({ source: 'core', action: 'renderView', outcome: LOG_OK, reason: 'Sheet "' + name + '" đã vẽ lại được, hết lỗi.', detail: { sheetName: name } }); }
  return { ok: true, sheetName: name, rows: drawn.rows, problems: [], reload: reloadStateRead() };
}

function viewOpenLocked(sheetName, work) {
  var name = String(sheetName || '').trim();
  var sheet = name.charAt(0) === '!' ? shinOpenBook().getSheetByName(name) : null;
  if (!sheet) { throw new Error(name.charAt(0) === '!' ? 'Không tìm thấy sheet quản trị "' + name + '".' : 'Sheet quản trị phải có tên bắt đầu bằng !.'); }
  return documentLockRun(function () { return work(sheet, name); });
}

/** Người dùng yêu cầu vẽ (bấm làm mới, menu, tạo sheet): luôn thử, kể cả khi sổ nói lượt trước đã hỏng. */
function renderViewSheet(sheetName) {
  return viewOpenLocked(sheetName, function (sheet, name) {
    return viewAttemptLocked(sheet, name, viewTimezoneReader());
  });
}

function viewProbeRenderCurrent() {
  var sheet = shinOpenBook().getActiveSheet();
  var result = renderViewSheet(sheet.getName());
  var report = ['Sheet: ' + result.sheetName, result.ok ? 'Số dòng: ' + result.rows : 'Lỗi:\n' + viewProblemsText(result.problems)];
  report.forEach(function (line) { Logger.log(line); });
  return report;
}

/** Sidebar gọi khi lời hỏi chung quyết vẽ sheet đang xem: thử vẽ khi sổ nói cần thử (chưa có mục, cờ ô điều khiển, dữ liệu đổi, lượt hỏng đến hạn thử lại). Ngoài đó chỉ trả kết quả lượt thử gần nhất, kể cả các khối lỗi, mà không chạm Sheet. */
function renderViewIfDirty(sheetName) {
  return runEntryPoint('renderViewIfDirty', 'sidebar', 'throw', function () { return viewRenderIfStale(sheetName); });
}

/** Phần ruột không bọc cửa vào, cho đường nội bộ và probe DEV. */
function viewRenderIfStale(sheetName) {
  return viewOpenLocked(sheetName, function (sheet, name) {
    var entry = viewLedgerEntry(name);
    var reload = reloadStateRead();
    if (viewLedgerNeedsAttempt(entry, reload.viewsStaleRevision, Date.now())) {
      return viewAttemptLocked(sheet, name, viewTimezoneReader());
    }
    return { ok: entry.ok === true, skipped: true, sheetName: name, problems: entry.ok === true ? [] : entry.problems || [], reload: reload };
  });
}
