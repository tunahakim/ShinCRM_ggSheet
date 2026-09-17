/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: sheet_scout.js
 * TITLE: Trinh sát trạng thái sheet
 * ROLE: Observer
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Quét DOM trang Sheets mỗi 200ms, dựng ảnh chụp trạng thái CRM_CONTEXT và bắn
 * sang sidebar khi ảnh chụp có gì đổi.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

console.log("🚀 CRM Extension V21.2: sheet_scout Loaded");

var CONTEXT_VERSION = 1;
var lastContextKey = "";   // dấu vết ảnh chụp cuối đã bắn (không gồm at/seq)
var seqCounter = 0;
var cachedNameBox = null;
var liveRequestCounter = 0;
var livePendingRequest = null;
var LIVE_MODEL_TIMEOUT_MS = 800;
var liveRetryAt = 0;
var pendingKeydownHint = false;
var lastResolvedCustomerId = '';
var lastPositionKey = '';

function liveHeaderForSheet(sheetName) {
  var hints = typeof CRM_COLUMN_HINTS !== 'undefined' ? CRM_COLUMN_HINTS : null;
  var targets = hints && Array.isArray(hints.targets) ? hints.targets : [];
  var exact = targets.filter(function (target) {
    return target.sheetName && target.sheetName === sheetName && target.header;
  });
  if (exact.length === 1) { return exact[0].header; }

  var prefix = targets.filter(function (target) {
    return target.prefix && String(sheetName || '').indexOf(target.prefix) === 0 && target.header;
  });
  return prefix.length === 1 ? prefix[0].header : '';
}

function reloadRelevantForContext(context) {
  var hints = typeof CRM_COLUMN_HINTS !== 'undefined' ? CRM_COLUMN_HINTS : null;
  var targets = hints && Array.isArray(hints.reloadColumns) ? hints.reloadColumns : null;
  if (!targets) { return null; }
  var sheetName = String(context && context.sheetName || '');
  var row = Number(context && context.row || 0);
  var firstColumn = Number(context && context.col || 0);
  var lastColumn = Number(context && context.colEnd || firstColumn);
  if (row <= 0 || firstColumn <= 0) { return null; }
  return targets.some(function (target) {
    if (target.sheetName && target.sheetName !== sheetName) { return false; }
    if (target.prefix && sheetName.indexOf(target.prefix) !== 0) { return false; }
    return target.columns.some(function (column) { return column >= firstColumn && column <= lastColumn; });
  });
}

function sendResolvedContext(base, result, fallbackHeader, fallbackReason, hint) {
  var context = Object.assign({}, base);
  if (result && result.status === 'ok') { lastResolvedCustomerId = String(result.customerId || '').trim(); }
  // Kết quả live thất bại không được mượn mã cũ cho vị trí mới; cache chỉ phục vụ hint keydown.
  context.customerId = result && result.status === 'ok' ? lastResolvedCustomerId : '';
  context.customerIdHeader = result && result.header ? result.header : (fallbackHeader || '');
  context.customerIdSource = 'live-model';
  context.customerIdStatus = result && result.status ? result.status : 'unavailable';
  context.customerIdReason = result && result.reason ? result.reason : (fallbackReason || '');
  var reloadRelevant = reloadRelevantForContext(base);
  if (reloadRelevant !== null) { context.reloadRelevant = reloadRelevant; }
  if (hint) { context.hint = hint; }
  seqCounter += 1;
  context.at = Date.now();
  context.seq = seqCounter;
  sendContextToSidebar(context);
}

function sendKeydownHint(base) {
  var context = Object.assign({}, base, {
    hint: 'keydown',
    customerId: lastResolvedCustomerId,
    customerIdSource: 'live-model-cache',
    customerIdStatus: lastResolvedCustomerId ? 'ok' : 'unavailable',
    customerIdReason: 'KEYDOWN_HINT'
  });
  var reloadRelevant = reloadRelevantForContext(base);
  if (reloadRelevant !== null) { context.reloadRelevant = reloadRelevant; }
  seqCounter += 1;
  context.at = Date.now();
  context.seq = seqCounter;
  sendContextToSidebar(context);
}

function requestLiveCustomerId(base, header, hint) {
  var requestId = 'live-' + Date.now().toString(36) + '-' + (++liveRequestCounter);
  if (livePendingRequest && livePendingRequest.timer) { clearTimeout(livePendingRequest.timer); }
  livePendingRequest = { requestId: requestId, context: base, header: header, hint: hint || '' };
  livePendingRequest.timer = setTimeout(function () {
    if (!livePendingRequest || livePendingRequest.requestId !== requestId) { return; }
    var pending = livePendingRequest;
    livePendingRequest = null;
    lastContextKey = '';
    liveRetryAt = Date.now() + 1000;
    sendResolvedContext(pending.context, null, pending.header, 'LIVE_MODEL_TIMEOUT', pending.hint);
  }, LIVE_MODEL_TIMEOUT_MS);
  window.postMessage({
    action: 'CRM_LIVE_MODEL_READ_REQUEST',
    source: 'SHINCRM_EXTENSION',
    requestId: requestId,
    spreadsheetId: base.spreadsheetId,
    gid: base.gid,
    sheetName: base.sheetName,
    row: base.row,
    header: header
  }, location.origin);
}

window.addEventListener('message', function (event) {
  if (event.source !== window || event.origin !== location.origin) { return; }
  var data = event.data;
  if (!data || data.action !== 'CRM_LIVE_MODEL_READ_RESPONSE' || data.source !== 'SHINCRM_EXTENSION') { return; }
  if (!livePendingRequest || String(data.requestId || '') !== livePendingRequest.requestId) { return; }

  var pending = livePendingRequest;
  livePendingRequest = null;
  if (pending.timer) { clearTimeout(pending.timer); }
  sendResolvedContext(pending.context, data, pending.header, '', pending.hint);
});

/*
 * NHỮNG THỨ KHÔNG ĐỌC ĐƯỢC TỪ EXTENSION — đừng đi tìm, đã tìm rồi.
 * Lưới của Sheets vẽ bằng <canvas>, nội dung ô không nằm trong DOM. Vì vậy:
 *   - Các ô khác ô đang chọn được đọc qua live model trong MAIN world; DOM chỉ cung cấp tọa độ và trạng thái sửa.
 *   - Không đọc được hàng mã cột ở hàng 1, điều kiện lọc ở hàng 3, định dạng ô, ghi chú ô.
 *   - Không đọc được gid của tab chưa kích hoạt: gid chỉ hiện ở location.hash của tab đang mở.
 *   - Extension không kết luận ô vừa được sửa; việc này thuộc trigger onEdit của GAS.
 * Sidebar hỏi máy chủ (SelectionService) sau hint để quyết định reload, không dựa vào DOM.
 */

function colLettersToNumber(colStr) {
  var colNum = 0;
  for (var i = 0; i < colStr.length; i++) {
    colNum = colNum * 26 + (colStr.charCodeAt(i) - 64);
  }
  return colNum;
}

/**
 * Cắt chuỗi thô trong hộp tên ô thành tọa độ. Nhận cả vùng chọn và hàng/cột nguyên khối.
 * Trả về null khi chuỗi rỗng hoặc là tên vùng (named range) không theo cú pháp A1.
 */
function parseRangeRef(ref) {
  if (!ref) { return null; }

  // Bỏ tiền tố tên sheet: 'Khách hàng'!A1 hoặc Sheet1!A1:B2
  var text = String(ref).trim().toUpperCase();
  var bang = text.lastIndexOf('!');
  if (bang !== -1) { text = text.slice(bang + 1); }
  if (!text) { return null; }

  var haiPhan = text.split(':');
  var dau = haiPhan[0].match(/^([A-Z]+)([0-9]+)$/);
  if (dau && haiPhan.length === 1) {
    return { row: parseInt(dau[2], 10), col: colLettersToNumber(dau[1]), rowEnd: parseInt(dau[2], 10), colEnd: colLettersToNumber(dau[1]), selectionKind: 'cell' };
  }
  if (haiPhan.length !== 2) { return null; }

  var cuoi = haiPhan[1].match(/^([A-Z]+)([0-9]+)$/);
  if (dau && cuoi) {
    return { row: parseInt(dau[2], 10), col: colLettersToNumber(dau[1]), rowEnd: parseInt(cuoi[2], 10), colEnd: colLettersToNumber(cuoi[1]), selectionKind: 'range' };
  }

  var hangDau = haiPhan[0].match(/^([0-9]+)$/);
  var hangCuoi = haiPhan[1].match(/^([0-9]+)$/);
  if (hangDau && hangCuoi) {
    return { row: parseInt(hangDau[1], 10), col: 1, rowEnd: parseInt(hangCuoi[1], 10), colEnd: 0, selectionKind: 'rows' };
  }

  var cotDau = haiPhan[0].match(/^([A-Z]+)$/);
  var cotCuoi = haiPhan[1].match(/^([A-Z]+)$/);
  if (cotDau && cotCuoi) {
    return { row: 1, col: colLettersToNumber(cotDau[1]), rowEnd: 0, colEnd: colLettersToNumber(cotCuoi[1]), selectionKind: 'columns' };
  }

  return null;
}

function readSpreadsheetId() {
  var match = location.pathname.match(/\/spreadsheets\/d\/([^/]+)/);
  return match ? match[1] : "";
}

function readGid() {
  var match = String(location.hash || '').match(/gid=([0-9]+)/);
  return match ? match[1] : "";
}

function readCellRef() {
  if (!cachedNameBox || !cachedNameBox.isConnected) {
    cachedNameBox = document.getElementById('t-name-box') || document.querySelector('.waffle-name-box');
  }
  if (!cachedNameBox) { return ""; }
  return String(cachedNameBox.value || cachedNameBox.innerText || "");
}

function readSheetTabs() {
  var gidHienTai = readGid();
  var tabs = [];
  var nodeList = document.querySelectorAll('.docs-sheet-tab');
  for (var i = 0; i < nodeList.length; i++) {
    var nut = nodeList[i];
    var tenEl = nut.querySelector('.docs-sheet-tab-name');
    var ten = tenEl ? String(tenEl.innerText || tenEl.textContent || "").trim() : "";
    var dangMo = nut.classList.contains('docs-sheet-active-tab');
    tabs.push({ name: ten, active: dangMo, gid: dangMo ? gidHienTai : "" });
  }
  return tabs;
}

function readActiveSheetName() {
  var tabNameEl = document.querySelector('.docs-sheet-active-tab .docs-sheet-tab-name');
  return tabNameEl ? String(tabNameEl.innerText || tabNameEl.textContent || "").trim() : "";
}

/** Dựng ảnh chụp selection. Không đọc nội dung ô hay trạng thái edit từ DOM. */
function buildContext() {
  var cellRef = readCellRef();
  var toaDo = parseRangeRef(cellRef);

  return {
    v: CONTEXT_VERSION,
    spreadsheetId: readSpreadsheetId(),
    gid: readGid(),
    sheetName: readActiveSheetName(),
    cellRef: cellRef,
    row: toaDo ? toaDo.row : 0,
    col: toaDo ? toaDo.col : 0,
    rowEnd: toaDo ? toaDo.rowEnd : 0,
    colEnd: toaDo ? toaDo.colEnd : 0,
    selectionKind: toaDo ? toaDo.selectionKind : (cellRef ? 'named' : 'none'),
    sheetTabs: readSheetTabs()
  };
}

function markInputHint() {
  pendingKeydownHint = true;
}

document.addEventListener('keydown', markInputHint, true);
document.addEventListener('beforeinput', markInputHint, true);
document.addEventListener('keyup', function (event) {
  var key = event && event.key;
  if (key === 'Delete' || key === 'Backspace') { markInputHint(); }
}, true);

function contextPositionKey(context) {
  return [context.sheetName || '', context.row || 0, context.col || 0, context.rowEnd || 0, context.colEnd || 0].join('|');
}

setInterval(function () {
  if (document.hidden || !sidebarWindow) { return; }

  var context = buildContext();

  // Chỉ bắn khi selection đổi hoặc có phím gõ. Phím gõ ở cùng một ô chỉ là
  // hint cho Sidebar, không khởi động live-model đọc mã khách lần nữa.
  var key = JSON.stringify(context);
  var hasKeydownHint = pendingKeydownHint;
  if (key === lastContextKey && !hasKeydownHint) { return; }
  if (Date.now() < liveRetryAt) { return; }
  var positionKey = contextPositionKey(context);
  var positionChanged = positionKey !== lastPositionKey;
  if (key === lastContextKey && hasKeydownHint) {
    pendingKeydownHint = false;
    sendKeydownHint(context);
    return;
  }
  if (key !== lastContextKey && hasKeydownHint && !positionChanged) {
    pendingKeydownHint = false;
    lastContextKey = key;
    lastPositionKey = positionKey;
    sendKeydownHint(context);
    return;
  }
  pendingKeydownHint = false;
  lastContextKey = key;
  lastPositionKey = positionKey;

  var header = liveHeaderForSheet(context.sheetName);
  if (context.selectionKind !== 'cell') {
    sendResolvedContext(context, null, header, 'UNSUPPORTED_SELECTION', hasKeydownHint ? 'keydown' : '');
  } else if (!header) {
    sendResolvedContext(context, null, '', 'NO_SCHEMA_TARGET', hasKeydownHint ? 'keydown' : '');
  } else {
    requestLiveCustomerId(context, header, hasKeydownHint ? 'keydown' : '');
  }
}, 200);
