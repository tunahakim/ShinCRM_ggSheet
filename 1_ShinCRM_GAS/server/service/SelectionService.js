/**
 * Hai đường đọc ô đang chọn khi không có Extension. Đường rẻ chỉ trả tọa độ; đường đầy đủ tra thêm mã khách và luôn đóng an toàn khi không chắc chắn.
 */

/** Mở bảng tính và hỏi vùng đang chọn tốn 0,1–0,3 giây, nên chỉ lời hỏi vị trí trong tệp này gọi; phản hồi lưu, xóa, nạp không chụp vị trí vì Sidebar không đọc ở đó. */
function selectionProbeContext() {
  var book = shinOpenBook();
  var sheet = typeof book.getActiveSheet === 'function' ? book.getActiveSheet() : null;
  var range = sheet && typeof sheet.getActiveRange === 'function' ? sheet.getActiveRange() : null;
  return { book: book, sheet: sheet, range: range };
}

function selectionSnapshotFromContext(context) {
  var sheet = context.sheet;
  var range = context.range;
  var row = range ? range.getRow() : 0;
  var col = range ? range.getColumn() : 0;
  var rowEnd = range ? range.getLastRow() : 0;
  var colEnd = range ? range.getLastColumn() : 0;

  return {
    spreadsheetId: context.book.getId(),
    gid: sheet && typeof sheet.getSheetId === 'function' ? String(sheet.getSheetId()) : '',
    sheetName: sheet ? sheet.getName() : '',
    cellRef: range ? range.getA1Notation() : '',
    row: row,
    col: col,
    rowEnd: rowEnd,
    colEnd: colEnd,
    selectionKind: range ? (row === rowEnd && col === colEnd ? 'cell' : 'range') : 'none'
  };
}

/** Vị trí Sidebar đã biết, dùng khi lời hỏi không mở bảng tính; chỉ lấy trường vị trí để không mang ngược mã khách cũ vào ảnh chụp. */
function selectionKnownSnapshot(previous) {
  var value = previous || {};
  return {
    spreadsheetId: String(value.spreadsheetId || ''),
    gid: String(value.gid || ''),
    sheetName: String(value.sheetName || ''),
    cellRef: String(value.cellRef || ''),
    row: Number(value.row) || 0,
    col: Number(value.col) || 0,
    rowEnd: Number(value.rowEnd) || 0,
    colEnd: Number(value.colEnd) || 0,
    selectionKind: String(value.selectionKind || 'none')
  };
}

function selectionProbeReply(snapshot, started, customerId) {
  var reply = {
    ok: true,
    spreadsheetId: snapshot.spreadsheetId,
    gid: snapshot.gid,
    sheetName: snapshot.sheetName,
    cellRef: snapshot.cellRef,
    row: snapshot.row,
    col: snapshot.col,
    rowEnd: snapshot.rowEnd,
    colEnd: snapshot.colEnd,
    selectionKind: snapshot.selectionKind
  };

  if (customerId !== undefined) { reply.customerId = customerId; }
  reply.reload = reloadStateRead();
  reply.ms = Date.now() - started;
  return reply;
}

/** Tìm đúng một cột theo mã. Không đoán khi mã thiếu hoặc bị nhân đôi. */
function selectionColumnIndex(sheet, code) {
  var header = sheetReadHeader(sheet);
  var found = 0;
  for (var i = 0; i < header.length; i++) {
    if (header[i] !== code) { continue; }
    if (found) { return 0; }
    found = i + 1;
  }
  return found;
}

function selectionContextPositionKey(context) {
  var value = context || {};
  return [value.spreadsheetId || '', value.gid || '', value.sheetName || '', value.row || 0, value.col || 0, value.rowEnd || 0, value.colEnd || 0, value.selectionKind || 'none'].join('|');
}

function selectionContextPositionChanged(previous, current) {
  if (!previous) { return true; }
  return selectionContextPositionKey(previous) !== selectionContextPositionKey(current);
}

function selectionReloadRequestId(input) {
  var supplied = input && input.requestId;
  if (supplied !== undefined && supplied !== null && String(supplied).trim()) { return String(supplied).trim(); }
  return 'selection-' + Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 8);
}

function selectionPayloadFromReload(result) {
  if (!result || result.ok === false) { return null; }
  var parts = result.parts.map(selectionPayloadPart);
  // Thiếu một phần là cả gói không có: Sidebar giữ revision cũ và lời hỏi sau nạp lại đủ, thay vì nâng revision trên một gói hụt.
  return parts.length && parts.every(function (part) { return !!part; }) ? { parts: parts } : null;
}

/** Một phần của gói nạp, theo đúng hình dạng Sidebar áp cho từng loại. */
function selectionPayloadPart(result) {
  if (!result || result.ok === false) { return null; }
  if (result.reloadMode === 'records') {
    return { mode: 'records', customer: result.customer, activity: result.activity, affectedCustomerIds: result.affectedCustomerIds || [], removedRecordIds: result.removedRecordIds || [], counters: result.counters };
  }
  if (result.reloadMode === 'customer' || result.reloadMode === 'activity') {
    return { mode: 'entity', entity: result.reloadMode, customer: result.customer, activity: result.activity, counters: result.counters };
  }
  if (result.reloadMode === 'category') {
    return { mode: 'category', categories: result.categories || {}, warnings: result.warnings || [] };
  }
  if (result.reloadMode === 'config') {
    return { mode: 'config', config: result.config || {} };
  }
  if (result.reloadMode === 'fullCore') {
    return { mode: 'fullCore', core: result };
  }
  return null;
}

/** Trạng thái sheet `!` đang xem cho Sidebar, tính từ DocumentProperties chứ không đọc Sheet; núm người dùng chỉ đọc khi sheet cũ. Sidebar tự gọi vẽ bằng lời gọi riêng để lời hỏi không bị chậm vì vẽ. */
function selectionViewDecision(sheetName, state) {
  var name = String(sheetName || '').trim();
  if (name.charAt(0) !== '!') { return reloadDecisionForView({ sheetName: name }); }
  var entry = viewLedgerEntry(name);
  var staleRevision = state ? state.viewsStaleRevision : 0;
  var prefs = viewLedgerStale(entry, staleRevision) ? userPrefsRead() : {};
  return reloadDecisionForView({ sheetName: name, viewsStaleRevision: staleRevision, entry: entry, autoRenderView: prefs.autoRenderView, now: Date.now() });
}

function selectionColumnLetters(column) {
  var value = Number(column);
  var letters = '';
  while (value > 0) {
    var remainder = (value - 1) % 26;
    letters = String.fromCharCode(65 + remainder) + letters;
    value = Math.floor((value - 1) / 26);
  }
  return letters;
}

/** Một mục read plan gửi Extension: ô tiêu đề để xác nhận đúng cột, và mẫu địa chỉ ô giá trị theo hàng đang chọn. */
function selectionPlanItem(key, code, column, withValue) {
  var letters = selectionColumnLetters(column);
  return { token: key + ':' + code, headerAddress: letters + '1', expectedValue: code, valueAddressTemplate: withValue ? letters + '{row}' : '' };
}

/** Sheet xem tự do: mọi sheet ngoài bốn sheet kho và sheet `!`. GAS chỉ đọc hộ ô mã khi Extension không đọc được, không bao giờ ghi. */
function selectionIsFreeSheet(sheetName) {
  var name = String(sheetName || '');
  return !!name && name.charAt(0) !== '!' && [ENTITY_SHEETS.customer, ENTITY_SHEETS.activity, 'Category', 'Config'].indexOf(name) < 0;
}

/** Cột mã khách của sheet xem tự do, từ đúng một lần đọc hàng 1: `@CUS_MA_KH` trước, thiếu thì `@ACT_MA_KH`. Mã thiếu hoặc bị nhân đôi thì bỏ, không đoán. Chỉ dùng khi không có Extension đọc. */
function selectionFreeSheetColumn(sheet) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return 0; }
  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (value) {
    return String(value === null || value === undefined ? '' : value).trim();
  });
  var codes = [DATA_SCHEMA.customer.id.code, DATA_SCHEMA.activity.customerId.code];
  for (var i = 0; i < codes.length; i++) {
    var first = header.indexOf(codes[i]);
    if (first >= 0 && header.indexOf(codes[i], first + 1) < 0) { return first + 1; }
  }
  return 0;
}

/** Kế hoạch đọc thô: Extension chỉ đọc đúng địa chỉ và trả giá trị, không biết token có ý nghĩa gì. */
function selectionReadPlan() {
  var definitions = [
    { sheetName: ENTITY_SHEETS.customer, entity: 'customer' },
    { sheetName: ENTITY_SHEETS.activity, entity: 'activity' },
    { sheetName: 'Category', sheetCore: 'Category' },
    { sheetName: 'Config', sheetCore: 'Config' },
    { prefix: '!', entity: 'customer' },
    { prefix: '!', entity: 'activity' }
  ];
  var plan = {};
  definitions.forEach(function (definition) {
    var key = definition.sheetName || definition.prefix;
    if (!plan[key]) { plan[key] = []; }
    try {
      var sourceSheet = definition.sheetName || (definition.entity === 'activity' ? ENTITY_SHEETS.activity : ENTITY_SHEETS.customer);
      var map = readColumnMap(sourceSheet);
      var codes = definition.entity
        ? [definition.entity === 'customer' ? DATA_SCHEMA.customer.id.code : DATA_SCHEMA.activity.customerId.code]
        : sheetCoreColumns(definition.sheetCore).map(function (pair) { return pair[0]; });
      codes.forEach(function (code) {
        var column = Number(map.map[code] || 0);
        if (!column) { return; }
        plan[key].push(selectionPlanItem(key, code, column, !!definition.entity));
      });
    } catch (ignore) {
      // Client thiếu plan phải fail-open và hỏi GAS; không đoán cột.
    }
  });
  return plan;
}

/**
 * Sidebar chỉ báo mã lỗi một lần mỗi phiên; client không được ghi sheet nên GAS ghi hộ trong lượt selection sẵn có.
 * Chỉ nhận mã dạng hằng để chuỗi lạ từ client không đi thẳng vào `Log`.
 */
function selectionLogReaderFailure(code) {
  var value = String(code || '').trim();
  if (!/^[A-Z_]{1,40}$/.test(value)) { return; }
  logEvent({
    source: 'sidebar',
    action: 'extension_read',
    outcome: LOG_WARN,
    reason: 'Extension không đọc được dữ liệu Sheet (' + value + '); Sidebar chuyển sang hỏi GAS mã khách ở ô đang chọn, chậm hơn. Thường do Google đổi cấu trúc nội bộ của Sheets.'
  });
}

/** Sidebar báo kênh báo thay đổi im quá ngưỡng; Sidebar tự giữ cờ một lần mỗi phiên. */
function selectionLogChannelSilence(silent) {
  if (silent !== true) { return; }
  logEvent({
    source: 'sidebar',
    action: 'change_channel',
    outcome: LOG_WARN,
    reason: 'Sidebar không nhận được tin nào từ kênh báo thay đổi của Google Sheets quá ngưỡng CHANNEL_SILENCE_MS; chuyển sang tự kiểm tra định kỳ nhịp ngắn, dữ liệu sửa trên Sheet đến Sidebar chậm hơn. Thường do Extension cũ chưa tải lại hoặc Google đổi kênh.'
  });
}

/**
 * Một request bên ngoài cho cả selection và reload. GAS là nơi duy nhất quyết
 * định có cần đọc cột mã khách và có cần nạp RAM hay không; Sidebar chỉ truyền
 * context lần trước rồi thực thi output.
 */
function probeSelectionAndReload(input) {
  return runEntryPoint('probeSelectionAndReload', 'sidebar', 'throw', function () {
    var started = Date.now();
    var request = input || {};
    var requestId = selectionReloadRequestId(request);
    selectionLogReaderFailure(request.extensionReadFailure);
    selectionLogChannelSilence(request.channelSilence);
    var previous = request.previousSelectionContext || request.selectionContext || null;
    var previousCustomerId = String(request.previousCustomerId || (previous && previous.customerId) || '').trim();
    // Extension đã đọc được vị trí và mã khách thì GAS không mở bảng tính: vị trí Sidebar gửi lên là nguồn đúng, lời hỏi chỉ còn việc reload.
    var readPosition = request.skipPosition !== true || request.needsSelection === true;
    var context = readPosition ? selectionProbeContext() : null;
    var snapshot = context ? selectionSnapshotFromContext(context) : selectionKnownSnapshot(previous);
    var positionChanged = context ? selectionContextPositionChanged(previous, snapshot) : false;
    // Extension đọc hỏng thì vị trí Sidebar gửi lên đã là vị trí mới, so vị trí sẽ không thấy đổi; cờ `needsSelection` bắt GAS đọc thay.
    var readSelection = !!context && (positionChanged || request.needsSelection === true);
    var customerCell = readSelection ? selectionCustomerCell(context, snapshot) : null;
    var customerId = customerCell ? customerCell.value : previousCustomerId;
    var journal = reloadJournalRead();
    var decision = reloadDecisionForState({ journal: journal, lastSeenRevision: request.lastSeenRevision, localDraft: request.localDraft });
    var selection = Object.assign({}, snapshot, {
      positionChanged: positionChanged,
      customerId: customerId,
      customerIdChanged: readSelection && customerId !== previousCustomerId,
      customerCell: customerCell && customerCell.read ? (customerId ? 'value' : 'empty') : ''
    });
    var ram = decision.ram;
    var ready = ram.action === 'reload';
    // Revision của sổ lúc bắt đầu là mốc Sidebar được nâng tới sau khi áp gói; thay đổi ghi trong lúc đọc là dòng mới, lời hỏi sau sẽ thấy.
    var payload = ready ? selectionPayloadFromReload(reloadByPlan(ram.plan)) : null;
    var latest = reloadStateRead();
    return {
      ok: true,
      requestId: requestId,
      selection: context ? selection : null,
      customerId: customerId,
      reload: latest,
      decision: decision,
      payload: payload,
      view: selectionViewDecision(selection.sheetName, latest),
      processedRevision: payload ? journal.rev : 0,
      ms: Date.now() - started
    };
  });
}

/** Đổi dòng đang chọn thành mã khách bằng cách đọc đúng cột mã của chính sheet đó. */
function selectionCustomerId(context, snapshot) {
  return selectionCustomerCell(context, snapshot).value;
}

/** Ô mã khách của dòng đang chọn, một luật cho mọi sheet và mọi hàng: đọc đúng ô ở cột mã của hàng đó; chỗ không có cột mã thì giá trị rỗng. `read` false chỉ khi không có vị trí để đọc. Sidebar tra giá trị trong RAM: có thì hiện khách, không có thì báo không tìm thấy, rỗng thì báo rỗng. */
function selectionCustomerCell(context, snapshot) {
  if (!snapshot.sheetName || snapshot.row < 1 || !context.sheet) { return { read: false, value: '' }; }

  var column = 0;
  if (snapshot.sheetName === ENTITY_SHEETS.customer || snapshot.sheetName.charAt(0) === '!') {
    column = selectionColumnIndex(context.sheet, DATA_SCHEMA.customer.id.code);
  } else if (snapshot.sheetName === ENTITY_SHEETS.activity) {
    column = selectionColumnIndex(context.sheet, DATA_SCHEMA.activity.customerId.code);
  } else if (selectionIsFreeSheet(snapshot.sheetName)) {
    column = selectionFreeSheetColumn(context.sheet);
  }
  if (!column) { return { read: true, value: '' }; }
  var value = context.sheet.getRange(snapshot.row, column).getValue();
  return { read: true, value: String(value === null || value === undefined ? '' : value).trim() };
}

/** Nghiệm thu trên Google: chọn hàng dữ liệu và hàng tiêu đề để đối chiếu mã khách cùng thời gian thật. */
function viewProbeSelection() {
  return runEntryPoint('viewProbeSelection', 'sidebar', 'throw', function () {
    var started = Date.now();
    var context = selectionProbeContext();
    var snapshot = selectionSnapshotFromContext(context);
    if (snapshot.sheetName && snapshot.sheetName.charAt(0) === '!') {
      viewRenderIfStale(snapshot.sheetName);
    }
    var full = selectionProbeReply(snapshot, started, selectionCustomerId(context, snapshot));
    var report = [];
    report.push('selection: row=' + full.row + ' col=' + full.col + ' sheet="' + full.sheetName + '" cellRef="' + full.cellRef + '"');
    report.push('customerId="' + full.customerId + '"');
    report.push('spreadsheetId: ' + full.spreadsheetId);
    report.push('dirty: ' + JSON.stringify(full.dirty));
    report.push('SelectionService: ' + full.ms + ' ms');
    return report;
  });
}
