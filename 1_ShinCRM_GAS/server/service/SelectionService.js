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

function selectionRemainingRevision(state) {
  if (!state) { return 0; }
  var hasDirty = !!(state.records && state.records.length) || !!(state.category || state.config || state.schema || state.allCore || state.allViews || (state.viewSheets && state.viewSheets.length));
  return hasDirty ? Number(state.revision || 0) : 0;
}

function selectionPayloadFromReload(result) {
  if (!result || result.ok === false) { return null; }
  if (result.reloadMode === 'records') {
    return { mode: 'records', customer: result.customer, activity: result.activity, affectedCustomerIds: result.affectedCustomerIds || [], removedRecordIds: result.removedRecordIds || [] };
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

function selectionRenderDirtyViews(state) {
  if (!state || !(state.allViews || (state.viewSheets && state.viewSheets.length))) { return null; }
  if (typeof renderAllManagedViewsIfAllowed === 'function') { return renderAllManagedViewsIfAllowed(); }
  return null;
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
    var context = selectionProbeContext();
    var snapshot = selectionSnapshotFromContext(context);
    var previous = request.previousSelectionContext || request.selectionContext || null;
    var positionChanged = selectionContextPositionChanged(previous, snapshot);
    var previousCustomerId = String(request.previousCustomerId || (previous && previous.customerId) || '').trim();
    var customerId = positionChanged ? selectionCustomerId(context, snapshot) : previousCustomerId;
    var state = reloadStateRead();
    var decision = typeof reloadDecisionForState === 'function'
      ? reloadDecisionForState({
        reloadState: state,
        lastSeenRevision: request.lastSeenRevision,
        localDraft: request.localDraft,
        reason: request.reason,
        forceImmediate: request.forceImmediate === true
      })
      : reloadDecisionBlank('Chưa có bộ quyết định reload.');
    var selection = Object.assign({}, snapshot, {
      positionChanged: positionChanged,
      customerId: customerId,
      customerIdChanged: positionChanged && customerId !== previousCustomerId
    });
    var viewRender = selectionRenderDirtyViews(state);
    var payload = null;
    var processedRevision = 0;
    var revisionMatched = true;
    var reloadResult = null;
    var ram = decision && decision.ram;
    var waitMs = ram ? Number(ram.waitMs) : 0;
    if (!isFinite(waitMs) || waitMs < 0) { waitMs = 0; }
    if (ram && ram.action === 'reload' && waitMs > 0) {
      decision = Object.assign({}, decision, { ram: Object.assign({}, ram, { action: 'defer' }) });
      ram = decision.ram;
    }
    var deferred = ram && ram.action === 'defer';
    var ready = !deferred && ram && ram.action === 'reload' && waitMs <= 0;
    if (ready) {
      var expectedRevision = state && state.revision ? state.revision : undefined;
      if (ram.mode === 'records' && typeof reloadRecords === 'function') {
        reloadResult = reloadRecords(ram.recordIds || [], expectedRevision, { internal: true });
      } else if (ram.mode === 'category' && typeof reloadCategory === 'function') {
        reloadResult = reloadCategory(expectedRevision, { internal: true });
      } else if (ram.mode === 'config' && typeof reloadConfig === 'function') {
        reloadResult = reloadConfig(expectedRevision, { internal: true });
      } else if (ram.mode === 'fullCore' && typeof loadCore === 'function') {
        reloadResult = loadCore({ internal: true, preserveDirty: true, expectedRevision: expectedRevision });
        if (reloadResult && reloadResult.ok === true) { reloadResult.reloadMode = 'fullCore'; }
      }
      payload = selectionPayloadFromReload(reloadResult);
      revisionMatched = reloadResult && reloadResult.revisionMatched !== undefined ? reloadResult.revisionMatched !== false : true;
      processedRevision = reloadResult && reloadResult.processedRevision !== undefined ? Number(reloadResult.processedRevision || 0) : 0;
      if (revisionMatched === false && state && state.revision) {
        // The loader may report the newest observed state for diagnostics, but
        // this response only processed the revision captured at request start.
        processedRevision = Number(state.revision);
      }
    }
    var latest = reloadResult && reloadResult.reload ? reloadResult.reload : reloadStateRead();
    return {
      ok: true,
      requestId: requestId,
      selection: selection,
      customerId: customerId,
      reload: latest,
      dirty: dirtyStateRead(),
      decision: ready && reloadResult ? Object.assign({}, decision, { executed: true, resultMode: reloadResult.reloadMode }) : decision,
      payload: payload,
      viewRender: viewRender,
      observedRevision: state ? Number(state.revision || 0) : 0,
      processedRevision: processedRevision,
      remainingRevision: selectionRemainingRevision(latest),
      revisionMatched: revisionMatched,
      readyAt: state && state.recordsReadyAt ? Number(state.recordsReadyAt) : 0,
      waitMs: waitMs,
      ms: Date.now() - started
    };
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
