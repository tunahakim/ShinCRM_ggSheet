/**
 * Hai đường nạp dữ liệu lên RAM của sidebar: `loadCore` và `loadActivityChunk`. Tài liệu 05 Phần 4, Phần 11, Phần 12.
 *
 * Tệp này biết **trình tự** và **kích cỡ**: cái gì đọc trước cái gì, gói bao nhiêu hàng, hết gói chưa, tốn bao nhiêu mili giây. Nó không tự đọc ô nào — việc đọc thuộc `EntityRead.gs`, `CategoryRead.gs`, `ConfigRead.gs`, và việc đo lưới thuộc `CellBudget.gs`. Giữ ranh giới đó vì trình tự là thứ sẽ đổi nhiều lần khi có dữ liệu thật để đo, còn phép đọc thì không.
 *
 * **Vì sao chia hai luồng.** Apps Script không có trạng thái giữa hai lần gọi, nên mỗi vòng chạm máy chủ tốn hai tới năm giây tiền đi đường, bất kể đọc một ô hay một nghìn ô. Cách duy nhất để sidebar dùng được ngay là nạp **một lần** rồi giữ hết trong một biến JavaScript. Nhưng `activity` là phần nặng nhất và không cần thiết để tra một khách, nên nó xuống luồng nền: `loadCore` trả về phần vừa đủ để vẽ và để tra cứu, `loadActivityChunk` chạy tiếp phía sau. Nhờ vậy khung hình đầu tiên tới sau vài giây thay vì vài chục giây.
 *
 * **Nạp ngược từ dòng cuối lên.** Cả hai thực thể đều đọc từ hàng cuối ngược về hàng bốn, vì bản ghi mới nhất nằm dưới cùng và đó là phần người dùng cần trước. Nên gói `activity` đầu tiên đã chứa phần lớn dữ liệu gần đây. Đây là ràng buộc cứng của tài liệu 05 Phần 4.
 *
 * **Máy chủ nhận dạng bản ghi bằng mã, không bằng vị trí.** Vị trí đổi mỗi lần sheet được sắp lại, còn mã thì không. Đường chọn khách riêng đọc mã trực tiếp từ live model hoặc cột mã hiện tại.
 *
 * **Hai dòng "nạp xong" đều là dòng vết, không phải dòng luôn ghi.** Chủ dự án chốt ngày 05/09/2026: bật debug thì ghi chi tiết, ngày thường ẩn hết. Công tắc là tham số `LOG_TRACE` ở sheet `Config`. Một lượt mở sidebar trơn để lại **không** dòng nào, vì "mọi thứ bình thường" không đáng ghi ba lần mỗi lượt; lượt nào có lỗi thì vòng đệm vết tự bung ra sheet kèm dòng lỗi, nên đúng lúc cần chẩn đoán vẫn có đủ số liệu. Dòng cảnh báo vượt trần ngân sách ô thì vẫn `logEvent` — nó không phải chuyện bình thường.
 */

/** Nguồn ghi log của mọi đường trong tệp này. Sidebar gọi qua `google.script.run` nên theo bảng ở tài liệu 10 Phần 8, nguồn là `sidebar` và kênh báo lỗi là ném lại cho `withFailureHandler`. */
var LOAD_SOURCE = 'sidebar';

function getReloadState() {
  return runEntryPoint('getReloadState', LOAD_SOURCE, 'throw', function () {
    var started = Date.now();
    return { ok: true, reload: reloadStateRead(), selection: selectionSnapshot(), ms: Date.now() - started };
  });
}

/** Chuẩn hóa scope trước khi đọc để cùng một mã không làm phình request hoặc danh sách cờ bẩn. */
function loadNormalizeRecordIds(recordIds) {
  var values = Array.isArray(recordIds) ? recordIds : [recordIds];
  var out = [];
  var seen = {};
  values.forEach(function (value) {
    var id = String(value === null || value === undefined ? '' : value).trim();
    if (!id || seen[id]) { return; }
    seen[id] = true;
    out.push(id);
  });
  return out;
}

/** Nạp đúng các mã (lẫn Customer và Activity); mã Activity kéo theo khách cha và mọi giao dịch của khách đó, vì Sidebar coi giao dịch vắng trong payload là đã xóa. */
function reloadRecords(recordIds, options) {
  var execute = function () {
    var started = Date.now();
    var ids = loadNormalizeRecordIds(recordIds);
    if (!ids.length) { throw new Error('Nạp lại bản ghi cần ít nhất một mã.'); }
    var customerContext = entityReadContext('customer');
    var activityContext = entityReadContext('activity');
    var customerFirstRow = SHEET_FIRST_DATA_ROW;
    var activityFirstRow = SHEET_FIRST_DATA_ROW;
    var customerKeyRows = entityReadFieldBlock(customerContext, customerFirstRow, customerContext.rowCount, ['id']);
    var activityKeyRows = entityReadFieldBlock(activityContext, activityFirstRow, activityContext.rowCount, ['id', 'customerId']);
    var requested = {};
    ids.forEach(function (id) { requested[id] = true; });
    var customerIds = {};
    var existingCustomerIds = {};
    var existingActivityIds = {};
    var customerRowsAt = [];
    var activityRowsAt = [];

    activityKeyRows.forEach(function (row) {
      var activityId = String(row[0] || '').trim();
      var customerId = String(row[1] || '').trim();
      if (!activityId) { return; }
      existingActivityIds[activityId] = true;
      if (requested[activityId] && customerId) { customerIds[customerId] = true; }
    });

    ids.forEach(function (id) {
      if (!existingActivityIds[id]) { customerIds[id] = true; }
    });

    // Đọc Customer sau khi Activity đã lộ khách cha: Sidebar coi khách có trong affectedCustomerIds mà vắng trong payload là khách đã bị xóa.
    customerKeyRows.forEach(function (row, index) {
      var id = String(row[0] || '').trim();
      if (!id) { return; }
      existingCustomerIds[id] = true;
      if (customerIds[id]) { customerRowsAt.push(customerFirstRow + index); }
    });

    activityKeyRows.forEach(function (row, index) {
      var activityId = String(row[0] || '').trim();
      var customerId = String(row[1] || '').trim();
      if (requested[activityId] || customerIds[customerId]) { activityRowsAt.push(activityFirstRow + index); }
    });
    var customers = entityReadRowsAt(customerContext, customerRowsAt);
    var activities = entityReadRowsAt(activityContext, activityRowsAt);
    var removedRecordIds = ids.filter(function (id) { return !existingCustomerIds[id] && !existingActivityIds[id]; });
    return {
      ok: true,
      reloadMode: 'records',
      customer: { fields: customers.fields, rows: customers.rows },
      activity: { fields: activities.fields, rows: activities.rows },
      affectedCustomerIds: Object.keys(customerIds),
      removedRecordIds: removedRecordIds,
      // Bản ghi có thể do máy khác vừa cấp mã; gửi bộ đếm để mã xem trước của Sidebar này không tụt lại.
      counters: idGateCounterValues(),
      reload: reloadStateRead(),
      selection: selectionSnapshot(),
      ms: Date.now() - started
    };
  };
  return options && options.internal === true ? execute() : runEntryPoint('reloadRecords', LOAD_SOURCE, 'throw', execute);
}

/** Nạp riêng Category. */
function reloadCategory(options) {
  var execute = function () {
    var started = Date.now();
    var result = categoryReadAll();
    return {
      ok: true,
      reloadMode: 'category',
      categories: result.categories,
      warnings: result.warnings,
      reload: reloadStateRead(),
      selection: selectionSnapshot(),
      ms: Date.now() - started
    };
  };
  return options && options.internal === true ? execute() : runEntryPoint('reloadCategory', LOAD_SOURCE, 'throw', execute);
}

/** Nạp riêng toàn bộ Config. */
function reloadConfig(options) {
  var execute = function () {
    var started = Date.now();
    resetSettingsCache();
    var config = configReadAll();
    config.params = configUserParams(configParams());
    return {
      ok: true,
      reloadMode: 'config',
      config: config,
      reload: reloadStateRead(),
      selection: selectionSnapshot(),
      ms: Date.now() - started
    };
  };
  return options && options.internal === true ? execute() : runEntryPoint('reloadConfig', LOAD_SOURCE, 'throw', execute);
}

/** Nạp trọn một sheet dữ liệu theo yêu cầu thủ công; không suy diễn từ trạng thái màn hình của Sidebar. */
function reloadEntityAll(entity) {
  var started = Date.now();
  if (entity !== 'customer' && entity !== 'activity') {
    throw new Error('Chỉ nạp thủ công được Customer hoặc Activity, nhận được: ' + entity + '.');
  }
  var result = entityReadAll(entity);
  return {
    ok: true,
    reloadMode: entity,
    entity: entity,
    customer: entity === 'customer' ? result : undefined,
    activity: entity === 'activity' ? result : undefined,
    counters: idGateCounterValues(),
    reload: reloadStateRead(),
    selection: selectionSnapshot(),
    ms: Date.now() - started
  };
}

/**
 * Chạy một kế hoạch nạp của sổ nhật ký trong cùng lời gọi (07A mục 4): nạp lõi, hoặc từng phần đổi bằng các hàm nạp riêng. Thứ tự Config, Category trước dữ liệu để Sidebar áp bản ghi với cấu hình mới.
 * Một thực thể nạp cả sheet thì mã của thực thể đó không đọc lại; mã của thực thể kia vẫn nạp theo mã.
 */
function reloadByPlan(plan) {
  if (plan.core) {
    var core = loadCore({ internal: true, withActivity: true });
    core.reloadMode = 'fullCore';
    return { ok: core.ok !== false, reloadMode: 'fullCore', parts: [core] };
  }
  var parts = [];
  if (plan.config) { parts.push(reloadConfig({ internal: true })); }
  if (plan.category) { parts.push(reloadCategory({ internal: true })); }
  var ids = [];
  RELOAD_RECORD_PARTS.forEach(function (entity) {
    if (plan[entity] === true) { parts.push(reloadEntityAll(entity)); }
    else if (Array.isArray(plan[entity])) { ids = ids.concat(plan[entity]); }
  });
  if (ids.length) { parts.push(reloadRecords(ids, { internal: true })); }
  return { ok: true, reloadMode: 'parts', parts: parts };
}

function reloadCustomer() {
  return runEntryPoint('reloadCustomer', LOAD_SOURCE, 'throw', function () {
    return reloadEntityAll('customer');
  });
}

function reloadActivity() {
  return runEntryPoint('reloadActivity', LOAD_SOURCE, 'throw', function () {
    return reloadEntityAll('activity');
  });
}

/** Xác định sheet hiện tại ở GAS rồi chọn đúng API; client không được tự đoán theo màn đang mở. */
function reloadCurrentSheet() {
  return runEntryPoint('reloadCurrentSheet', LOAD_SOURCE, 'throw', function () {
    var sheet = shinOpenBook().getActiveSheet();
    var name = sheet && typeof sheet.getName === 'function' ? sheet.getName() : '';
    var result;
    if (name === ENTITY_SHEETS.customer) {
      result = reloadEntityAll('customer');
      result.target = 'customer';
      return result;
    }
    if (name === ENTITY_SHEETS.activity) {
      result = reloadEntityAll('activity');
      result.target = 'activity';
      return result;
    }
    if (name === 'Category') {
      result = reloadCategory();
      result.target = 'category';
      return result;
    }
    if (name === 'Config') {
      result = reloadConfig();
      result.target = 'config';
      return result;
    }
    if (name && name.charAt(0) === '!' && typeof renderViewSheet === 'function') {
      result = renderViewSheet(name);
      return { ok: true, target: 'view', sheetName: name, view: result, reload: reloadStateRead() };
    }
    throw new Error('Sheet hiện tại "' + name + '" không thuộc Customer, Activity, Category, Config hoặc sheet quản trị.');
  });
}

/**
 * Nạp phần lõi. Đây là lời gọi đầu tiên của mỗi lượt mở sidebar.
 *
 * Trả về `{ ok: true, blocked: false, settings, schema, config, categories, customer, activity, prefs, budget, reload, warnings, pendingMessages, ms }` ở đường bình thường, hoặc gói rút gọn vẫn có `pendingMessages` khi vượt trần ngân sách ô.
 *
 * **Đo ngân sách ô là việc đầu tiên, trước khi đọc một ô dữ liệu nào.** Vượt trần thì dừng ngay tại đó. Phép đo không đọc ô nào nên nó gần như miễn phí, còn đọc dữ liệu trong một tệp đã quá ì là cách chắc nhất để lượt chạy chết ở giữa đường — và chết ở giữa đường thì người dùng thấy sidebar treo, không thấy nguyên nhân.
 *
 * `blocked` mang tên lý do chứ không phải `true`, để sau này còn lý do chặn thứ hai thì client không phải đoán.
 */
function loadCore(options) {
  var opts = options || {};
  var execute = function () {
    var batDau = Date.now();
    var book = shinOpenBook();
    var budget = cellBudgetMeasure(book);

    if (budget.exceeded) {
      logEvent({
        source: LOAD_SOURCE,
        action: 'loadCore',
        outcome: LOG_WARN,
        reason: 'Vượt trần ngân sách ô nên chặn, không đọc dữ liệu',
        detail: { total: budget.total, ceiling: budget.ceiling, sheets: budget.sheets }
      });

      return { ok: true, blocked: 'cellBudget', budget: budget, reload: reloadStateRead(), selection: selectionSnapshot(), pendingMessages: takePendingMessages(), ms: Date.now() - batDau };
    }

    // Revision đọc trước mọi ô dữ liệu: thay đổi ghi trong lúc đọc mang revision lớn hơn nên lời hỏi sau của Sidebar tự thấy.
    var processed = reloadStateRead().revision;
    resetSettingsCache();
    var config = configReadAll();
    config.params = configUserParams(configParams());
    var danhMuc = categoryReadAll();
    var khach = entityReadAll('customer');
    var soGiaoDich = entityRowCount('activity');
    // Nạp lõi từ lời hỏi nạp lại trả trọn Activity trong cùng gói; lượt mở Sidebar thì Activity xuống luồng nạp nền theo gói.
    var activityAll = opts.withActivity === true ? entityReadAll('activity') : null;
    var ms = Date.now() - batDau;

    var warnings = danhMuc.warnings.slice();
    if (budget.warning) { warnings.push(budget.warning); }
    var traceMode = String(config.params[LOG_TRACE_CONFIG_NAME] || '').trim();
    if (traceMode && traceMode.toLowerCase() !== 'off') {
      warnings.push('LOG_TRACE đang bật (' + traceMode + '). Sheet Log có thể chứa dữ liệu nhạy cảm nguyên văn; hãy tắt LOG_TRACE sau khi kiểm tra xong.');
    }

    logTrace({
      source: LOAD_SOURCE,
      action: 'loadCore',
      outcome: LOG_OK,
      reason: 'Nạp lõi xong',
      detail: {
        khach: khach.rows.length,
        giaoDichSeNap: soGiaoDich,
        danhMuc: Object.keys(danhMuc.categories).length,
        hangTrangBoQua: khach.blankRows,
        nganSachO: budget.total + '/' + budget.ceiling,
        ms: ms
      }
    });

    return {
      ok: true,
      blocked: false,
      settings: SETTINGS,
      spreadsheetId: book.getId(),
      selectionHints: typeof selectionReadPlan === 'function' ? {
        readPlan: selectionReadPlan()
      } : null,
      schema: DATA_SCHEMA,
      config: config,
      categories: danhMuc.categories,
      customer: { fields: khach.fields, rows: khach.rows, blankRows: khach.blankRows },
      activity: activityAll ? { fields: activityAll.fields, rows: activityAll.rows, total: soGiaoDich, chunkRows: SETTINGS.CHUNK_ROWS } : { total: soGiaoDich, chunkRows: SETTINGS.CHUNK_ROWS },
      processedRevision: processed,
      prefs: userPrefsRead(),
      budget: budget,
      reload: reloadStateRead(),
      selection: selectionSnapshot(),
      warnings: warnings,
      pendingMessages: takePendingMessages(),
      ms: ms
    };
  };
  return opts.internal === true ? execute() : runEntryPoint('loadCore', LOAD_SOURCE, 'throw', execute);
}

/**
 * Cỡ gói dùng cho một lời gọi, đã kẹp lại trong ngưỡng an toàn.
 *
 * Client được phép **xin gói nhỏ hơn** — đó là đường lùi khi một gói cỡ chuẩn thất bại. Nó không được phép xin gói lớn hơn: một con số từ phía client đi thẳng vào `getRange` là một cái núm cho phép bên ngoài quyết định một lượt đọc lớn bao nhiêu, và cửa vào thì không tin bên gọi. Xin số vô nghĩa — chữ, số âm, số lẻ — thì im lặng dùng cỡ chuẩn, vì một lượt nạp nền không phải chỗ để dừng lại tranh luận về tham số.
 */
function loadChunkRows(requested) {
  var so = Number(requested);
  if (!isFinite(so) || so < 1) { return SETTINGS.CHUNK_ROWS; }
  return Math.min(Math.floor(so), SETTINGS.CHUNK_ROWS);
}

/**
 * Nạp một gói `activity`, đi từ hàng cuối ngược lên.
 *
 * `cursor` là `null` ở lần gọi đầu, còn các lần sau truyền lại `nextCursor` của phản hồi trước. `chunkRows` là cỡ gói client xin cho riêng lời gọi này; bỏ trống thì dùng `SETTINGS.CHUNK_ROWS`. Trả về `{ ok, fields, rows, done, nextCursor, total, chunkRows, reload, ms }`.
 *
 * **Con trỏ mang số hàng chứ không mang số thứ tự gói.** Nếu client chỉ gửi "cho tôi gói thứ ba" thì hai gói liền nhau có thể đọc lệch nhau khi số hàng đổi giữa hai lần gọi — mà giữa hai lần gọi thì người dùng hoàn toàn có thể vừa thêm một dòng thẳng trên sheet. Số hàng cuối của gói là thứ tự nó nói ra, không phải thứ suy diễn từ trạng thái mà máy chủ không còn nhớ.
 *
 * Chính vì con trỏ mang số hàng nên đường lùi cỡ gói mới chạy được: gọi lại **đúng con trỏ cũ** với cỡ nhỏ hơn là đọc lại đúng chỗ vừa thất bại, không lệch một hàng nào.
 *
 * Gói cuối cùng — gói chạm tới hàng bốn — là chỗ ghi dòng log kết thúc. Ghi mỗi gói một dòng thì một tệp năm mươi gói để lại năm mươi dòng log cho một việc, làm loãng sheet `Log` tới mức không tìm ra thứ đáng xem; còn không ghi gì thì không ai biết lượt nạp nền đã xong hay đã chết giữa đường.
 */
function loadActivityChunk(cursor, chunkRows) {
  return runEntryPoint('loadActivityChunk', LOAD_SOURCE, 'throw', function () {
    var batDau = Date.now();
    var context = entityReadContext('activity');
    var firstDataRow = SHEET_FIRST_DATA_ROW;
    var lastDataRow = firstDataRow + context.rowCount - 1;
    var endRow = cursor && cursor.endRow ? cursor.endRow : lastDataRow;
    var coGoi = loadChunkRows(chunkRows);

    if (context.rowCount <= 0 || endRow < firstDataRow) {
      return { ok: true, fields: context.names, rows: [], done: true, nextCursor: null, total: context.rowCount, chunkRows: coGoi, reload: reloadStateRead(), selection: selectionSnapshot(), ms: Date.now() - batDau };
    }

    var startRow = Math.max(firstDataRow, endRow - coGoi + 1);
    var goi = entityReadRange(context, startRow, endRow - startRow + 1);
    var done = startRow <= firstDataRow;
    var ms = Date.now() - batDau;

    if (done) {
      logTrace({
        source: LOAD_SOURCE,
        action: 'loadActivityChunk',
        outcome: LOG_OK,
        reason: 'Nạp xong toàn bộ giao dịch',
        detail: { tongHang: context.rowCount, hangTrangBoQua: goi.blankRows, coGoiCuoi: coGoi, msGoiCuoi: ms }
      });
    } else {
      logTrace({ source: LOAD_SOURCE, action: 'loadActivityChunk', outcome: LOG_OK, reason: 'Gói hàng ' + startRow + '–' + endRow, detail: { banGhi: goi.rows.length, coGoi: coGoi, ms: ms } });
    }

    return {
      ok: true,
      fields: goi.fields,
      rows: goi.rows,
      done: done,
      nextCursor: done ? null : { endRow: startRow - 1 },
      total: context.rowCount,
      chunkRows: coGoi,
      reload: reloadStateRead(),
      selection: selectionSnapshot(),
      ms: ms
    };
  });
}

/**
 * Phép nghiệm thu của cả chặng, chạy được trên Google: nạp lõi rồi nạp hết các gói giao dịch, in số bản ghi từng sheet và thời gian.
 *
 * Đây là phép trả lời đúng câu hỏi của chặng này: **đường nạp có vỡ khi số bản ghi bằng không hay không.** Sheet còn trắng nên mọi con số đều là 0, và một đường nạp chỉ hỏng ở ca rỗng thì phải bắt ngay bây giờ, chứ không phải bắt vào lúc đã có một nghìn bảy trăm khách ở trong đó.
 */
function probeLoadAll() {
  var report = [];
  var batDau = Date.now();
  var core = loadCore();

  if (core.blocked) {
    report.push('CHẶN: ' + core.blocked);
    cellBudgetLines(core.budget).forEach(function (line) { report.push('  ' + line); });
    report.forEach(function (line) { Logger.log(line); });
    return report;
  }

  report.push('loadCore: ' + core.ms + ' ms');
  report.push('  customer: ' + core.customer.rows.length + ' bản ghi, ' + core.customer.fields.length + ' trường, ' + core.customer.blankRows + ' hàng trắng bỏ qua');
  report.push('  categories: ' + Object.keys(core.categories).length + ' danh mục, tổng ' + Object.keys(core.categories).reduce(function (sum, code) { return sum + core.categories[code].length; }, 0) + ' giá trị');
  report.push('  config: params ' + Object.keys(core.config.params).length + ', ngầm định ' + Object.keys(core.config.defaults).length + ', bộ đếm ' + Object.keys(core.config.counters).length + ', sort ' + core.config.sort.length + ' cấp');
  report.push('  ngân sách ô: ' + core.budget.total + '/' + core.budget.ceiling);
  report.push('  activity sẽ nạp: ' + core.activity.total + ' hàng, gói ' + core.activity.chunkRows + ' hàng');

  var cursor = null;
  var soGoi = 0;
  var soBanGhi = 0;

  do {
    var goi = loadActivityChunk(cursor);
    soGoi += 1;
    soBanGhi += goi.rows.length;
    cursor = goi.nextCursor;
    if (soGoi > 1000) { throw new Error('Vòng nạp gói không dừng sau 1000 gói — con trỏ có vấn đề.'); }
  } while (cursor);

  report.push('activity: ' + soBanGhi + ' bản ghi qua ' + soGoi + ' gói');
  report.push('Tổng cả lượt: ' + (Date.now() - batDau) + ' ms');
  report.push('Trạng thái nạp lại: ' + JSON.stringify(core.reload));
  report.push('Cảnh báo: ' + (core.warnings.length ? core.warnings.join(' / ') : 'không có'));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
