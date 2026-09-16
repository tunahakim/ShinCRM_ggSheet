/**
 * Hai đường đọc ô đang chọn khi không có Extension. Đường rẻ chỉ trả tọa độ; đường đầy đủ tra thêm mã khách và luôn đóng an toàn khi không chắc chắn.
 */

function selectionProbeContext() {
  var book = shinOpenBook();
  var sheet = typeof book.getActiveSheet === 'function' ? book.getActiveSheet() : null;
  var range = sheet && typeof sheet.getActiveRange === 'function' ? sheet.getActiveRange() : null;
  return { book: book, sheet: sheet, range: range };
}

/** Ảnh chụp vị trí dùng chung cho mọi phản hồi máy chủ; không tự bọc cửa vào và không đọc trạng thái bẩn. */
function selectionSnapshot() {
  return selectionSnapshotFromContext(selectionProbeContext());
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
  reply.dirty = dirtyStateRead();
  reply.ms = Date.now() - started;
  return reply;
}

/** Tìm đúng một cột theo mã. Không đoán khi mã thiếu hoặc bị nhân đôi. */
function selectionColumnIndex(sheet, code) {
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) { return 0; }

  var header = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
  var found = 0;
  for (var i = 0; i < header.length; i++) {
    if (String(header[i] === null || header[i] === undefined ? '' : header[i]).trim() !== code) { continue; }
    if (found) { return 0; }
    found = i + 1;
  }
  return found;
}

/**
 * Kiểm tra cột dữ liệu bằng đúng DATA_SCHEMA phía GAS. Hàm này chỉ phục vụ
 * điểm giao tiếp sau khi Extension báo vừa kết thúc sửa; nó không phát signal
 * và không thay thế phân loại của trigger `shinOnEdit`.
 */
function selectionEditCodeIsValid(sheet, entity, firstColumn, lastColumn) {
  var schema = typeof DATA_SCHEMA === 'object' && DATA_SCHEMA ? DATA_SCHEMA[entity] : null;
  if (!schema) { return false; }

  var valid = {};
  Object.keys(schema).forEach(function (name) {
    var field = schema[name];
    if (field && field.code) { valid[String(field.code).trim()] = true; }
  });

  var first = Math.max(1, Number(firstColumn) || 1);
  var last = Math.max(first, Number(lastColumn) || first);
  return sheet.getRange(1, first, 1, last - first + 1).getValues()[0].some(function (value) {
    return !!valid[String(value === null || value === undefined ? '' : value).trim()];
  });
}

/**
 * Hỏi GAS xem một vùng vừa kết thúc sửa có phải vùng dữ liệu cần debounce
 * không. Đây là phép hỏi do client khởi động, không phải một nguồn dirty mới:
 * trigger onEdit vẫn chịu trách nhiệm duy nhất phát signal và ghi revision.
 * Phản hồi vẫn mang ReloadState theo hợp đồng chung, nhưng gắn cờ
 * `reloadObservation: false` để client không reload sớm trước đủ ba giây.
 */
function inspectEditReload(sheetName, row, col, rowEnd, colEnd) {
  return runEntryPoint('inspectEditReload', 'sidebar', 'throw', function () {
    var started = Date.now();
    var name = String(sheetName || '').trim();
    var entity = name === ENTITY_SHEETS.customer ? 'customer' : name === ENTITY_SHEETS.activity ? 'activity' : '';
    var book = shinOpenBook();
    var sheet = book.getSheetByName(name);
    var firstRow = Math.max(1, Number(row) || 0);
    var lastRow = Math.max(firstRow, Number(rowEnd) || firstRow);
    var firstColumn = Math.max(1, Number(col) || 0);
    var lastColumn = Math.max(firstColumn, Number(colEnd) || firstColumn);

    var reply = function (decision, eligible, waitMs) {
      var result = {
        ok: true,
        eligible: eligible === true,
        decision: decision,
        waitMs: Number(waitMs) || 0,
        reload: reloadStateRead(),
        dirty: dirtyStateRead(),
        reloadObservation: false,
        ms: Date.now() - started
      };
      return result;
    };

    if (!entity || !sheet || firstRow < SHEET_FIRST_DATA_ROW || !selectionEditCodeIsValid(sheet, entity, firstColumn, lastColumn)) {
      return reply(reloadDecisionForChange({ source: 'edit', surface: 'record', entity: entity, recordIds: [] }), false, 0);
    }

    var idColumn = selectionColumnIndex(sheet, DATA_SCHEMA[entity].id.code);
    if (!idColumn) {
      return reply(reloadDecisionForChange({ source: 'edit', surface: 'record', entity: entity, recordIds: [] }), false, 0);
    }

    var ids = sheet.getRange(firstRow, idColumn, lastRow - firstRow + 1, 1).getValues().map(function (value) { return value[0]; });
    var decision = reloadDecisionForChange({ source: 'edit', surface: 'record', entity: entity, recordIds: ids });
    var state = reloadStateRead();
    var waitMs = decision.ram.action === 'none' ? 0 : Math.max(0, Number(decision.ram.waitMs) - Math.max(0, Date.now() - Number(state.changedAt || 0)));
    return reply(decision, decision.ram.action !== 'none', waitMs);
  });
}

/** Đổi dòng đang chọn thành mã khách bằng cách đọc đúng cột mã của chính sheet đó. */
function selectionCustomerId(context, snapshot) {
  if (!snapshot.sheetName || snapshot.row < SHEET_FIRST_DATA_ROW) { return ''; }

  var code = '';
  if (snapshot.sheetName === ENTITY_SHEETS.customer || snapshot.sheetName.charAt(0) === '!') {
    code = DATA_SCHEMA.customer.id.code;
  } else if (snapshot.sheetName === ENTITY_SHEETS.activity) {
    code = DATA_SCHEMA.activity.customerId.code;
  } else {
    return '';
  }

  var column = selectionColumnIndex(context.sheet, code);
  if (!column) { return ''; }
  var value = context.sheet.getRange(snapshot.row, column).getValue();
  return String(value === null || value === undefined ? '' : value).trim();
}

/** Tọa độ ô đang chọn, không đọc giá trị ô. */
function probeSelectionCheap() {
  return runEntryPoint('probeSelectionCheap', 'sidebar', 'throw', function () {
    var started = Date.now();
    return selectionProbeReply(selectionSnapshot(), started);
  });
}

/** Tọa độ kèm mã khách đọc trực tiếp từ cột mã của sheet hiện tại. */
function probeSelectionFull() {
  return runEntryPoint('probeSelectionFull', 'sidebar', 'throw', function () {
    var started = Date.now();
    var context = selectionProbeContext();
    var snapshot = selectionSnapshotFromContext(context);
    if (snapshot.sheetName && snapshot.sheetName.charAt(0) === '!') {
      // Bảo đảm sheet quản trị đã được làm mới trước khi đọc ô mã hiện tại.
      renderViewIfDirty(snapshot.sheetName);
    }
    return selectionProbeReply(snapshot, started, selectionCustomerId(context, snapshot));
  });
}

/** Nghiệm thu trên Google: chọn hàng dữ liệu và hàng tiêu đề để đối chiếu mã khách cùng thời gian thật. */
function viewProbeSelection() {
  return runEntryPoint('viewProbeSelection', 'sidebar', 'throw', function () {
    var started = Date.now();
    var context = selectionProbeContext();
    var snapshot = selectionSnapshotFromContext(context);
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
