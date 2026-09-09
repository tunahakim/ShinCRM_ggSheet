/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: iframe_bridge.js
 * TITLE: Cầu nối
 * ROLE: Bridge
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Nhận "cú bắt tay" từ Sidebar, đáp tiếng, rồi bắn ảnh chụp trạng thái về đúng
 * khung vừa bắt tay.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

console.log("🚀 CRM Extension V21.2: iframe_bridge Loaded");

/*
 * An ninh của cầu nối, và giới hạn còn lại.
 *
 * Sidebar chạy trong iframe có origin `*.googleusercontent.com` (Apps Script phục vụ khung từ đó), còn trang Sheets ở
 * `docs.google.com` — khác origin nên mọi tin qua lại đều phải chỉ định rõ đích. Ba chỗ chặn:
 *   1. Chỉ nhận bắt tay từ origin khớp allowlist dưới đây, không nhận từ khung lạ.
 *   2. Mỗi lần bắt tay lưu lại cả window lẫn origin, và mọi tin bắn về sau dùng đúng origin đó — bỏ hẳn `'*'`.
 *   3. Tiếng đáp `CRM_HANDSHAKE_ACK` mang đúng nonce vừa nhận; nonce do sidebar sinh ngẫu nhiên lúc boot.
 *
 * Giới hạn thật lòng: một add-on Apps Script khác cùng nằm trên trang **và biết giao thức này** vẫn đọc được tin. Rò rỉ bị
 * chặn ở mức tên sheet cộng nội dung ô đang chọn, không chặn được mức đó. Chấp nhận, vì chủ dự án là người duy nhất dùng
 * và tự quyết cài add-on nào.
 */
var SIDEBAR_ORIGIN_ALLOWLIST = [
  /^https:\/\/[a-z0-9-]+\.googleusercontent\.com$/
];

var sidebarWindow = null;
var sidebarOrigin = '';
var sidebarNonce = '';
var extensionSessionId = Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
var CRM_COLUMN_HINTS = null;

function isColumnHints(value) {
  if (!value || typeof value !== 'object') { return false; }
  if (!Array.isArray(value.targets) || !value.targets.length) { return false; }
  return value.targets.every(function (target) {
    return target && typeof target === 'object'
      && ((typeof target.sheetName === 'string' && target.sheetName.trim() !== '')
        || (typeof target.prefix === 'string' && target.prefix.trim() !== ''))
      && typeof target.header === 'string' && target.header.trim() !== '';
  });
}

function acceptColumnHints(data) {
  if (!isColumnHints(data.columnHints)) { return; }
  if (data.spreadsheetId && typeof readSpreadsheetId === 'function' && String(data.spreadsheetId) !== String(readSpreadsheetId())) { return; }
  CRM_COLUMN_HINTS = {
    revision: String(data.hintsRevision || ''),
    targets: data.columnHints.targets.map(function (target) {
      return {
        sheetName: typeof target.sheetName === 'string' ? target.sheetName : '',
        prefix: typeof target.prefix === 'string' ? target.prefix : '',
        header: target.header.trim()
      };
    })
  };
  if (typeof lastContextKey !== 'undefined') { lastContextKey = ''; }
}

/** Retry một lần khi worker vừa thức dậy nhưng chưa nhận listener kịp. */
function sendRequestToWorker(message, done, attempt) {
  chrome.runtime.sendMessage(message, function (reply) {
    var error = chrome.runtime.lastError;
    if (error && attempt < 1 && /Receiving end does not exist/i.test(error.message || '')) {
      setTimeout(function () { sendRequestToWorker(message, done, attempt + 1); }, 150);
      return;
    }
    done(error, reply);
  });
}

function isAllowedSidebarOrigin(origin) {
  for (var i = 0; i < SIDEBAR_ORIGIN_ALLOWLIST.length; i++) {
    if (SIDEBAR_ORIGIN_ALLOWLIST[i].test(origin)) { return true; }
  }
  return false;
}

// 1. Bắt tay: kiểm origin, ghi nhớ đích, đáp tiếng kèm đúng nonce.
window.addEventListener('message', function (event) {
  var data = event.data;
  if (data && data.action === 'CRM_FBM_REQUEST') {
    // Chuyển nguyên request qua service worker; bridge không phân tích response FBM.
    if (!isAllowedSidebarOrigin(event.origin) || String(data.nonce || '') !== sidebarNonce) { return; }
    // Sheets có thể thay WindowProxy sau reload; nonce vẫn định danh đúng Sidebar.
    if (event.source && event.source !== sidebarWindow) { sidebarWindow = event.source; sidebarOrigin = event.origin; }
    sendRequestToWorker({ type: 'FBM_EXECUTE_REQUEST', id: data.id, request: data.request }, function (error, reply) {
      try { event.source.postMessage({ action: 'CRM_FBM_RESPONSE', nonce: sidebarNonce, id: data.id, result: error ? null : (reply && reply.result), error: error ? error.message : (reply && reply.error) }, event.origin); } catch (err) { sidebarWindow = null; sidebarOrigin = ''; sidebarNonce = ''; }
    });
    return;
  }
  if (data && data.action === 'CRM_COLUMN_HINTS') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce) { return; }
    acceptColumnHints(data);
    return;
  }
  if (!data || data.action !== 'CRM_HANDSHAKE') { return; }
  if (!isAllowedSidebarOrigin(event.origin) || !event.source) { return; }
  var nonce = String(data.nonce || '');
  if (!nonce) { return; }

  var newChannel = event.source !== sidebarWindow || event.origin !== sidebarOrigin || nonce !== sidebarNonce;

  sidebarWindow = event.source;
  sidebarOrigin = event.origin;
  sidebarNonce = nonce;
  acceptColumnHints(data);
  if (newChannel && typeof lastContextKey !== 'undefined') { lastContextKey = ''; }

  try {
    event.source.postMessage({
      action: 'CRM_HANDSHAKE_ACK',
      nonce: sidebarNonce,
      sessionId: extensionSessionId,
      at: Date.now()
    }, event.origin);
  } catch (err) {
    sidebarWindow = null;
    sidebarOrigin = '';
    sidebarNonce = '';
  }
});

// 2. Bắn ảnh chụp trạng thái sang Sidebar. Sidebar tự quyết dùng trường nào.
function sendContextToSidebar(context) {
  if (!sidebarWindow || !sidebarOrigin || !sidebarNonce) return;
  try {
      context.action = 'CRM_CONTEXT';
      context.nonce = sidebarNonce;
      context.sessionId = extensionSessionId;
      sidebarWindow.postMessage(context, sidebarOrigin);
  } catch (err) {
      sidebarWindow = null;
      sidebarOrigin = '';
      sidebarNonce = '';
  }
}
