/**
 * Vẽ một sheet quản trị từ kho Customer/Activity. Sheet quản trị không bao giờ là nguồn sự thật. Tài liệu 07.
 *
 * Mọi lệnh đọc và ghi sheet đi qua tầng 1 (`SheetReadCopy`, `SheetCellWrite`). Lượt vẽ tách đúng luật người điều phối: một công cụ đọc (mỗi sheet một yêu cầu đọc), công cụ kiểm và tính thuần, một kế hoạch ghi rồi một công cụ ghi.
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

/** Giá trị đã đổi kiểu của mọi cột đúng tiền tố, kể cả cột không có trong DATA_SCHEMA, từ các dòng kho người đọc đã lấy. Dòng không mã bị bỏ. */
function viewEntityRows(context, fieldByCode) {
  var prefix = context.entity === 'customer' ? '@CUS_' : '@ACT_';
  var codes = context.columnMap.headerRow.filter(function (code) { return code.indexOf(prefix) === 0; });
  var idCode = DATA_SCHEMA[context.entity].id.code;
  var rows = [];

  context.dataRows.forEach(function (raw) {
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

/** Số cột (1-based) mang mã nguồn `@CUS_`/`@ACT_` ở hàng 1: các cột ShinCRM vẽ, có hàng lọc và note tra cú pháp. */
function viewDrawnColumns(header) {
  var columns = [];
  header.forEach(function (code, i) { if (/^@(CUS|ACT)_/.test(code)) { columns.push(i + 1); } });
  return columns;
}

function viewWritableColumns(header, customerContext, activityContext) {
  return viewDrawnColumns(header).map(function (column) {
    var code = header[column - 1];
    var source = code.indexOf('@CUS_') === 0 ? customerContext : activityContext;
    if (!source.columnMap.map[code]) { throw new Error('Không tìm thấy cột ' + code + ' trong sheet kho ' + source.sheetName + '. Sheet chưa được vẽ lại.'); }
    return column;
  });
}

function viewSortRows(rows, specs) {
  var list = specs.slice();
  list.push({ code: DATA_SCHEMA.customer.id.code, direction: 'desc', field: DATA_SCHEMA.customer.id });
  return rows.sort(sortSpecComparator(list, function (row, code) { return row.values[code]; }));
}

/** Chữ của một ô hàng lọc. Ô đã bị Sheets tự đổi thành ngày (gõ `2026-10-01` khi ô chưa có khuôn chữ) đọc lại đúng chữ người gõ, theo múi giờ tệp. */
function viewFilterCellText(value, timezone) {
  if (dateTextIsDate(value)) { return dateToText(value, 'day', timezone); }
  return String(value === null || value === undefined ? '' : value).trim();
}

/** Mười cặp sắp xếp (hàng 4–13) của hai cột `@VIEW_SORT_COL`, `@VIEW_SORT_LEVEL`; thiếu một trong hai cột thì không có cặp nào. */
function viewSortPairs(header, sortRows) {
  var colAt = header.indexOf('@VIEW_SORT_COL');
  var levelAt = header.indexOf('@VIEW_SORT_LEVEL');
  if (colAt < 0 || levelAt < 0) { return []; }
  return sortRows.map(function (values) {
    return { col: String(values[colAt] || '').trim(), level: String(values[levelAt] || '').trim() };
  });
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

/** Các cột trong `columns` đang có công thức ở hàng dữ liệu tới `lastRow`. Mỗi dải cột liền nhau một lệnh đọc. */
function viewReadFormulaColumns(sheet, columns, lastRow) {
  var rows = lastRow - SHEET_FIRST_DATA_ROW + 1;
  var found = [];
  if (rows < 1) { return found; }
  sheetRegionsSpans(columns).forEach(function (span) {
    var formulas = sheetReadFormulas(sheet, SHEET_FIRST_DATA_ROW, span[0], rows, span.length);
    span.forEach(function (column, i) {
      if (formulas.some(function (cells) { return !!cells[i]; })) { found.push(column); }
    });
  });
  return found;
}

/**
 * Công cụ đọc của lượt vẽ: mọi thứ lượt vẽ cần, mỗi sheet một yêu cầu đọc (`sheetReadBlock`). Không kiểm, không tính.
 * Kho đọc cả khối ngay cùng hàng 1 dù lượt vẽ có thể hỏng vì lọc sai: lượt hỏng là đường hiếm, còn đọc riêng hàng 1 rồi mới đọc dữ liệu tốn thêm hai lệnh cho mỗi kho ở mọi lượt vẽ thành công.
 * Công thức đọc cho mọi cột mang mã nguồn; múi giờ chỉ đọc khi hàng lọc có ô đã thành ngày.
 */
function viewReadInputs(sheet, name) {
  var filterRow = sheetControlRow(name, 'filter');
  var sortRows = [];
  for (var row = SHEET_FIRST_DATA_ROW; row < SHEET_FIRST_DATA_ROW + VIEW_SORT_MAX_LEVELS; row++) { sortRows.push(row); }
  var top = sheetReadBlock(sheet, { rows: [filterRow].concat(sortRows), lastRow: true });
  if (!top.header.length) { return { header: [] }; }
  var filterValues = top.rows[filterRow];
  return {
    header: top.header,
    lastRow: top.lastRow,
    filterRow: filterRow,
    filterValues: filterValues,
    sortPairs: viewSortPairs(top.header, sortRows.map(function (row) { return top.rows[row]; })),
    config: configReadAll(),
    customer: entityReadContext('customer', undefined, { data: 'all' }),
    activity: entityReadContext('activity', undefined, { data: 'all' }),
    formulaColumns: viewReadFormulaColumns(sheet, viewDrawnColumns(top.header), top.lastRow),
    timezone: filterValues.some(dateTextIsDate) ? sheetReadTimezone() : ''
  };
}

/** Công cụ kiểm (thuần): cột ShinCRM vẽ mà đang có công thức. Vẽ đè sẽ xóa mất công thức, nên báo đủ mọi cột như vậy. */
function viewFormulaProblem(header, writable, formulaColumns) {
  var lines = writable.filter(function (column) { return formulaColumns.indexOf(column) >= 0; }).map(function (column) {
    return 'Cột ' + selectionColumnLetters(column) + ', stt: ' + column + ', Mã cột: ' + header[column - 1];
  });
  if (!lines.length) { return null; }
  return viewProblem('Có công thức trong các cột ShinCRM tự vẽ', lines, 'Chuyển công thức sang cột không có mã @ hoặc sang sheet khác.');
}

/**
 * Công cụ kiểm (thuần) mọi lỗi chặn vẽ trên dữ liệu người đọc đã lấy; có lỗi thì ném một lỗi mang đủ các khối. Trả các cột được vẽ, bộ lọc, thứ tự sắp và bảng kiểu cột đã hiểu.
 */
function viewRenderPlan(inputs, name) {
  var header = inputs.header;
  var sourceHeaders = inputs.customer.columnMap.headerRow.concat(inputs.activity.columnMap.headerRow);
  var fieldByCode = viewFieldMaps(inputs.config.sheetSchema, sourceHeaders);
  var sourceFieldByCode = viewSourceFieldMaps(fieldByCode, sourceHeaders);
  var writable;
  try {
    viewHeaderMap(header, name);
    writable = viewWritableColumns(header, inputs.customer, inputs.activity);
  } catch (headerError) {
    throw viewProblemsError([viewProblem('Hàng mã cột (hàng 1) sai', [errorMessage(headerError)])]);
  }

  var problems = [];
  var filters = {};
  var filterLines = [];
  writable.forEach(function (column) {
    var raw = viewFilterCellText(inputs.filterValues[column - 1], inputs.timezone);
    if (!raw) { return; }
    var parsed = filterParseCell(raw, fieldByCode[header[column - 1]]);
    if (!parsed.errors.length) { filters[column] = parsed; return; }
    parsed.errors.forEach(function (error) {
      filterLines.push('Ô ' + selectionColumnLetters(column) + inputs.filterRow + ' (' + header[column - 1] + '): bạn gõ "' + error.raw + '". ' + viewFilterErrorText(error));
    });
  });
  if (filterLines.length) { problems.push(viewProblem('Điều kiện lọc sai (hàng ' + inputs.filterRow + ')', filterLines)); }

  var localSort = sortSpecParse(inputs.sortPairs, sourceFieldByCode);
  if (localSort.errors.length) { problems.push(viewProblem('Quy tắc sắp xếp của sheet sai (hai cột sắp xếp, hàng 4–13)', localSort.errors)); }
  var configSort = localSort.specs.length || localSort.errors.length ? { specs: [], errors: [] } : sortSpecParse(inputs.config.sort, sourceFieldByCode);
  if (configSort.errors.length) { problems.push(viewProblem('Sắp xếp chung trong Config sai', configSort.errors)); }

  var formulas = viewFormulaProblem(header, writable, inputs.formulaColumns);
  if (formulas) { problems.push(formulas); }
  if (problems.length) { throw viewProblemsError(problems); }

  var specs = localSort.specs.length ? localSort.specs : configSort.specs.length ? configSort.specs : [
    { code: DATA_SCHEMA.activity.workDate.code, direction: 'desc', field: DATA_SCHEMA.activity.workDate },
    { code: DATA_SCHEMA.activity.id.code, direction: 'desc', field: DATA_SCHEMA.activity.id }
  ];
  return { writable: writable, filters: filters, specs: specs, fieldByCode: fieldByCode };
}

/** Công cụ tính (thuần): khách ghép hoạt động mới nhất, lọc theo hàng lọc rồi sắp xếp. */
function viewRenderRows(inputs, plan) {
  var header = inputs.header;
  var activities = viewLatestActivity(viewEntityRows(inputs.activity, plan.fieldByCode));
  var customerIdCode = DATA_SCHEMA.customer.id.code;
  var rows = viewEntityRows(inputs.customer, plan.fieldByCode).map(function (customer) {
    return { values: viewValues(customer, activities[customer[customerIdCode]]) };
  }).filter(function (row) {
    return !plan.writable.some(function (column) {
      var code = header[column - 1];
      return !!plan.filters[column] && !filterCellMatches(row.values[code], plan.filters[column], plan.fieldByCode[code]);
    });
  });
  return viewSortRows(rows, plan.specs);
}

/**
 * Kế hoạch ghi (thuần) của một lượt vẽ: khuôn chữ hàng lọc, chữ của ô lọc đã thành ngày, khuôn chữ cột chữ, và vùng giá trị.
 * Vẽ đè: mỗi dải cột một ma trận cao bằng số dòng cũ hoặc mới (lấy số lớn hơn), dòng thừa là ô rỗng nên không cần lệnh xóa.
 */
function viewWritePlan(inputs, plan, rows) {
  var header = inputs.header;
  var height = Math.max(Math.max(0, inputs.lastRow - SHEET_FIRST_DATA_ROW + 1), rows.length);
  var filterTexts = [];
  plan.writable.forEach(function (column) {
    var value = inputs.filterValues[column - 1];
    if (dateTextIsDate(value)) { filterTexts.push({ column: column, text: viewFilterCellText(value, inputs.timezone) }); }
  });
  var textColumns = plan.writable.filter(function (column) { return columnFormatIsText(plan.fieldByCode[header[column - 1]]); });
  return {
    filterRow: inputs.filterRow,
    filterColumns: plan.writable,
    filterTexts: filterTexts,
    height: height,
    textSpans: height ? sheetRegionsSpans(textColumns) : [],
    valueSpans: !height ? [] : sheetRegionsSpans(plan.writable).map(function (span) {
      var matrix = [];
      for (var i = 0; i < height; i++) {
        var row = rows[i];
        matrix.push(span.map(function (column) {
          var value = row ? row.values[header[column - 1]] : '';
          return value === undefined ? '' : value;
        }));
      }
      return { column: span[0], matrix: matrix };
    })
  };
}

/** Hàng lọc khuôn chữ để người dùng gõ gì ô giữ đúng chữ đó, kể cả `2026-10-01` mà Sheets hay tự đổi thành ngày. */
function viewFormatFilterRowText(sheet, filterRow, columns) {
  sheetRegionsSpans(columns).forEach(function (span) {
    sheetCellsFormat(sheet, filterRow, span[0], 1, span.length, COLUMN_FORMAT_TEXT);
  });
}

/** Công cụ ghi: làm đúng kế hoạch ghi, không kiểm, không tính. */
function viewWriteApply(sheet, writePlan) {
  viewFormatFilterRowText(sheet, writePlan.filterRow, writePlan.filterColumns);
  writePlan.filterTexts.forEach(function (cell) { sheetCellsWrite(sheet, writePlan.filterRow, cell.column, [[cell.text]]); });
  if (!writePlan.height) { return; }
  sheetGridEnsureRoom(sheet, SHEET_FIRST_DATA_ROW + writePlan.height - 1, SHEET_GRID_SLACK);
  writePlan.textSpans.forEach(function (span) {
    sheetCellsFormat(sheet, SHEET_FIRST_DATA_ROW, span[0], writePlan.height, span.length, COLUMN_FORMAT_TEXT);
  });
  writePlan.valueSpans.forEach(function (span) { sheetCellsWrite(sheet, SHEET_FIRST_DATA_ROW, span.column, span.matrix); });
}

/** Người điều phối một lượt vẽ: đọc → kiểm → tính → lập kế hoạch ghi → ghi, trong khóa của người gọi. Không ghi sổ — việc của `viewAttemptLocked`. Lỗi chặn vẽ ném ra mang `viewProblems`, trước khi chạm ô nào. */
function viewRenderSheetLocked(sheet, name) {
  var inputs = viewReadInputs(sheet, name);
  if (!inputs.header.length) { return { header: [], rows: 0 }; }
  var plan = viewRenderPlan(inputs, name);
  var rows = viewRenderRows(inputs, plan);
  viewWriteApply(sheet, viewWritePlan(inputs, plan, rows));
  return { header: inputs.header, rows: rows.length };
}

/**
 * Cửa duy nhất của mọi lượt thử vẽ (Sidebar hỏi, bấm làm mới, tạo sheet): ghi sổ rồi trả kết quả, kể cả khi hỏng — lỗi đi vào sổ và về Sidebar dưới dạng khối, không ném.
 * Lỗi giống hệt lượt hỏng trước không ghi Log lần nữa, để lỗi không tự đánh thức thành chuỗi dòng Log. Lỗi ngoài dự kiến (lỗi Google, lỗi code) cũng thành một khối và ghi Log mức lỗi.
 * `data` đọc lúc bắt đầu: tín hiệu đến giữa lượt vẽ để sheet vẫn cũ. Mục sổ mới không mang cờ ô điều khiển: lượt thử này đã xét đúng các ô đó.
 */
function viewAttemptLocked(sheet, name) {
  var previous = viewLedgerEntry(name);
  var data = reloadStateRead().revision;
  var revision = previous ? Number(previous.revision) || 0 : 0;
  var drawn;
  try {
    drawn = viewRenderSheetLocked(sheet, name);
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
    return viewAttemptLocked(sheet, name);
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
      return viewAttemptLocked(sheet, name);
    }
    return { ok: entry.ok === true, skipped: true, sheetName: name, problems: entry.ok === true ? [] : entry.problems || [], reload: reload };
  });
}
