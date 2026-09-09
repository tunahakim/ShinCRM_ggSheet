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
var cachedFormulaBar = null;
var liveRequestCounter = 0;
var livePendingRequest = null;
var LIVE_MODEL_TIMEOUT_MS = 800;
var liveRetryAt = 0;

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

function sendResolvedContext(base, result, fallbackHeader, fallbackReason) {
  var context = Object.assign({}, base);
  context.customerId = result && result.status === 'ok' ? String(result.customerId || '').trim() : '';
  context.customerIdHeader = result && result.header ? result.header : (fallbackHeader || '');
  context.customerIdSource = 'live-model';
  context.customerIdStatus = result && result.status ? result.status : 'unavailable';
  context.customerIdReason = result && result.reason ? result.reason : (fallbackReason || '');
  seqCounter += 1;
  context.at = Date.now();
  context.seq = seqCounter;
  sendContextToSidebar(context);
}

function requestLiveCustomerId(base, header) {
  var requestId = 'live-' + Date.now().toString(36) + '-' + (++liveRequestCounter);
  if (livePendingRequest && livePendingRequest.timer) { clearTimeout(livePendingRequest.timer); }
  livePendingRequest = { requestId: requestId, context: base, header: header };
  livePendingRequest.timer = setTimeout(function () {
    if (!livePendingRequest || livePendingRequest.requestId !== requestId) { return; }
    var pending = livePendingRequest;
    livePendingRequest = null;
    lastContextKey = '';
    liveRetryAt = Date.now() + 1000;
    sendResolvedContext(pending.context, null, pending.header, 'LIVE_MODEL_TIMEOUT');
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
  sendResolvedContext(pending.context, data, pending.header);
});

/*
 * NHỮNG THỨ KHÔNG ĐỌC ĐƯỢC TỪ EXTENSION — đừng đi tìm, đã tìm rồi.
 * Lưới của Sheets vẽ bằng <canvas>, nội dung ô không nằm trong DOM. Vì vậy:
 *   - Các ô khác ô đang chọn được đọc qua live model trong MAIN world; DOM chỉ cung cấp tọa độ và trạng thái sửa.
 *   - Không đọc được hàng mã cột ở hàng 1, điều kiện lọc ở hàng 3, định dạng ô, ghi chú ô.
 *   - Không đọc được gid của tab chưa kích hoạt: gid chỉ hiện ở location.hash của tab đang mở.
 *   - Trạng thái đang sửa (isEditing) suy từ focus của thanh công thức, không phải từ canvas.
 * Sidebar bù phần thiếu bằng cách tự hỏi máy chủ (SelectionService), không phải bằng cách đọc DOM.
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

function readFormulaBar() {
  if (!cachedFormulaBar || !cachedFormulaBar.isConnected) {
    cachedFormulaBar = document.getElementById('t-formula-bar-input') || document.querySelector('.cell-input');
  }
  if (!cachedFormulaBar) { return { cellText: "", isEditing: false }; }
  var cellText = cachedFormulaBar.value !== undefined ? String(cachedFormulaBar.value) : String(cachedFormulaBar.textContent || "");
  return { cellText: cellText, isEditing: document.activeElement === cachedFormulaBar };
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

/** Dựng một ảnh chụp trạng thái. Mọi trường đều là thứ đọc được từ DOM, sidebar tự quyết dùng gì. */
function buildContext() {
  var cellRef = readCellRef();
  var toaDo = parseRangeRef(cellRef);
  var thanhCongThuc = readFormulaBar();

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
    cellText: thanhCongThuc.cellText,
    isEditing: thanhCongThuc.isEditing,
    sheetTabs: readSheetTabs()
  };
}

setInterval(function () {
  if (document.hidden || !sidebarWindow) { return; }

  var context = buildContext();

  // Chỉ bắn khi có gì đổi, so trên toàn ảnh chụp (at/seq không tham gia so sánh).
  var key = JSON.stringify(context);
  if (key === lastContextKey) { return; }
  if (Date.now() < liveRetryAt) { return; }
  lastContextKey = key;

  var header = liveHeaderForSheet(context.sheetName);
  if (context.selectionKind !== 'cell') {
    sendResolvedContext(context, null, header, 'UNSUPPORTED_SELECTION');
  } else if (context.isEditing) {
    sendResolvedContext(context, null, header, 'EDITING');
  } else if (!header) {
    sendResolvedContext(context, null, '', 'NO_SCHEMA_TARGET');
  } else {
    requestLiveCustomerId(context, header);
  }
}, 200);
