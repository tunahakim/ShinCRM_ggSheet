/**
 * Hai đường đọc ô đang chọn khi không có Extension. Đường rẻ chỉ trả tọa độ; đường đầy đủ tra thêm mã khách và luôn đóng an toàn khi không chắc chắn.
 */

function selectionProbeContext() {
  var book = shinOpenBook();
  var sheet = book.getActiveSheet();
  return { book: book, sheet: sheet, range: sheet ? sheet.getActiveRange() : null };
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
    gid: sheet ? String(sheet.getSheetId()) : '',
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

/** Đổi dòng đang chọn thành mã khách mà không bao giờ dùng bản đồ của sheet khác. */
function selectionCustomerId(context, snapshot, rowMaps) {
  if (!snapshot.sheetName || snapshot.row < SHEET_FIRST_DATA_ROW) { return ''; }

  if (snapshot.sheetName.charAt(0) === '!') {
    var viewMap = rowMaps && rowMaps[snapshot.sheetName];
    return viewMap ? String(viewMap[String(snapshot.row)] || '') : '';
  }

  var code = '';
  if (snapshot.sheetName === ENTITY_SHEETS.customer) {
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

/** Tọa độ kèm mã khách trên Customer, Activity hoặc bản đồ dòng của sheet quản trị. */
function probeSelectionFull(rowMaps) {
  return runEntryPoint('probeSelectionFull', 'sidebar', 'throw', function () {
    var started = Date.now();
    var context = selectionProbeContext();
    var snapshot = selectionSnapshotFromContext(context);
    return selectionProbeReply(snapshot, started, selectionCustomerId(context, snapshot, rowMaps));
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
