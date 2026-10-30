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
var CRM_READ_PLAN = null;
// Khoảng gộp nhịp sống của kênh `/bind`, do Sidebar gửi trong bắt tay (`SETTINGS` của GAS); chưa nhận thì chuyển mọi nhịp.
var channelAliveMs = 0;
var channelAliveSentAt = 0;

function isReadPlan(value) {
  if (!value || typeof value !== 'object') { return false; }
  return Object.keys(value).every(function (key) {
    return Array.isArray(value[key]) && value[key].every(function (item) {
      return item && typeof item === 'object'
        && typeof item.token === 'string'
        && typeof item.headerAddress === 'string'
        && typeof item.expectedValue === 'string'
        && typeof item.valueAddressTemplate === 'string';
    });
  });
}

function acceptReadPlan(data) {
  if (!isReadPlan(data.readPlan)) { return; }
  if (data.spreadsheetId && String(data.spreadsheetId) !== String(readSpreadsheetId())) { return; }
  // Sidebar gửi kèm read plan ở mọi nhịp bắt tay; chỉ plan mới mới cần đọc lại ô, nếu không Extension bắn lại context mỗi giây.
  if (JSON.stringify(data.readPlan) === JSON.stringify(CRM_READ_PLAN)) { return; }
  CRM_READ_PLAN = data.readPlan;
  if (typeof lastContextKey !== 'undefined') { lastContextKey = ''; }
}

/** Retry một lần khi worker vừa thức dậy nhưng chưa nhận listener kịp. */
function sendRequestToWorker(message, done, attempt) {
  attempt = Number(attempt || 0);
  try {
    chrome.runtime.sendMessage(message, function (reply) {
      var error = chrome.runtime.lastError;
      if (error && attempt < 1 && /Receiving end does not exist/i.test(error.message || '')) {
        setTimeout(function () { sendRequestToWorker(message, done, attempt + 1); }, 150);
        return;
      }
      done(error, reply);
    });
  } catch (error) {
    done(error);
  }
}

/**
 * Tải lại Extension không gỡ được content script đã chạy: bản cũ vẫn nằm trong trang cạnh bản mới worker vừa nạp, nhưng mất quyền gọi worker.
 * Nếu bản cũ còn đáp bắt tay thì Sidebar nhận hai phiên luân phiên và gửi cấu hình relay vào bản cũ ("Extension context invalidated"), nên bản cũ phải tự im lặng hẳn.
 */
function bridgeContextAlive() {
  try { return typeof chrome !== 'undefined' && !!(chrome.runtime && chrome.runtime.id); } catch (contextError) { return false; }
}
function bridgeRetire() {
  window.removeEventListener('message', bridgeOnMessage);
  window.removeEventListener('message', bridgeOnBindEvent);
  sidebarWindow = null; sidebarOrigin = ''; sidebarNonce = '';
}

function isInvalidatedExtensionError(error) {
  return !!(error && /Extension context invalidated/i.test(String(error.message || error)));
}

/** Cho worker xác nhận bridge còn sống trước khi quyết định nạp lại content script. */
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== 'CRM_BRIDGE_PING') { return false; }
    sendResponse({ ready: true, version: chrome.runtime.getManifest().version });
    return false;
  });
}

function isAllowedSidebarOrigin(origin) {
  for (var i = 0; i < SIDEBAR_ORIGIN_ALLOWLIST.length; i++) {
    if (SIDEBAR_ORIGIN_ALLOWLIST[i].test(origin)) { return true; }
  }
  return false;
}

/** Tin có việc phải thuộc đúng phiên Extension vừa ACK để bridge cũ không trả lời chen vào bridge mới. */
function isCurrentExtensionSession(data) {
  return String(data && data.sessionId || '') === extensionSessionId;
}

function bridgeErrorCode(error) {
  return isInvalidatedExtensionError(error) ? 'EXTENSION_CONTEXT_INVALIDATED' : 'FBM_TRANSPORT_UNAVAILABLE';
}

function bridgeErrorMessage(error) {
  if (isInvalidatedExtensionError(error)) { return 'Extension vừa được tải lại. Hãy mở lại Sidebar để gửi lại cấu hình kết nối.'; }
  return String(error && error.message || error || 'Extension không xử lý được yêu cầu.');
}

/**
 * Lệnh Sidebar → worker đi qua đúng một bảng: mỗi dòng là loại tin worker nhận, tin trả về Sidebar và trường được chép sang worker.
 * Bridge không đọc nội dung, chỉ chuyển; trả lời luôn mang `result`, `code`, `error` cùng một dạng.
 */
var BRIDGE_COMMANDS = {
  CRM_FBM_CONFIG: { worker: 'FBM_CONFIGURE_RELAY', reply: 'CRM_FBM_CONFIG_ACK', fields: function (data) { return { config: data.config || {} }; } },
  CRM_FBM_CREDENTIALS: { worker: 'FBM_ENCRYPT_CREDENTIALS', reply: 'CRM_FBM_CREDENTIALS_RESULT', fields: function (data) { return { credentials: data.credentials || {} }; } },
  CRM_FBM_CREDENTIAL_METADATA: { worker: 'FBM_GET_CREDENTIAL_METADATA', reply: 'CRM_FBM_CREDENTIAL_METADATA_RESULT', fields: function (data) { return { credentialRef: String(data.credentialRef || '') }; } },
  CRM_FBM_CREDENTIAL_CLEAR: { worker: 'FBM_CLEAR_CREDENTIALS', reply: 'CRM_FBM_CREDENTIAL_CLEAR_RESULT', fields: function (data) { return { credentialRef: String(data.credentialRef || '') }; } },
  CRM_FBM_CANCEL: { worker: 'FBM_CANCEL_BATCH', reply: 'CRM_FBM_CANCEL_RESULT', fields: function () { return {}; } },
  CRM_FBM_MACHINE_ID: { worker: 'FBM_MACHINE_ID', reply: 'CRM_FBM_MACHINE_ID_RESULT', fields: function () { return {}; } },
  CRM_FBM_RUN_NOW: { worker: 'FBM_RUN_NOW', reply: 'CRM_FBM_RUN_NOW_RESULT', fields: function (data) { return { retryMs: Array.isArray(data.retryMs) ? data.retryMs : [] }; } }
};

/** Tin có việc chỉ nhận từ đúng khung Sidebar vừa bắt tay: origin trong allowlist, đúng window, đúng nonce, đúng phiên Extension. */
function bridgeGuard(event, data) {
  return isAllowedSidebarOrigin(event.origin) && event.source === sidebarWindow && String(data.nonce || '') === sidebarNonce && isCurrentExtensionSession(data);
}

/** Gửi tin về Sidebar; gửi hỏng thì kênh coi như đã đóng và worker ghi ô lỗi hộp đen để GAS ghi Log ở lần hỏi sau. */
function bridgePost(message, code) {
  if (!sidebarWindow || !sidebarOrigin || !sidebarNonce) { return false; }
  try {
    sidebarWindow.postMessage(Object.assign({ nonce: sidebarNonce, sessionId: extensionSessionId }, message), sidebarOrigin);
    return true;
  } catch (error) {
    sidebarWindow = null; sidebarOrigin = ''; sidebarNonce = '';
    bridgeFailureReport(code || 'BRIDGE_POST_FAILED', error);
    return false;
  }
}
function bridgeFailureReport(code, error) {
  if (!bridgeContextAlive()) { return; }
  sendRequestToWorker({ type: 'FBM_BRIDGE_FAILURE', code: code, message: String(error && error.message || error || '') }, function () {});
}

/** Worker chuyển trạng thái lượt (`CRM_FBM_STATUS`) tới mọi tab Sheets; chỉ tab đúng Spreadsheet mới chuyển tiếp vào Sidebar của nó. */
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== 'CRM_FBM_STATUS') { return false; }
    var own = String(message.spreadsheetId || '') === String(readSpreadsheetId() || '');
    sendResponse({ delivered: own && bridgePost({ action: 'CRM_FBM_STATUS', ok: message.ok !== false, status: message.status || null, conflict: message.conflict || null, code: String(message.code || ''), error: String(message.error || ''), failure: message.failure || null, done: message.done === true }, 'BRIDGE_STATUS_POST_FAILED') });
    return false;
  });
}

// 1. Bắt tay: kiểm origin, ghi nhớ đích, đáp tiếng kèm đúng nonce. Lệnh có việc đi qua `BRIDGE_COMMANDS`.
function bridgeOnMessage(event) {
  if (!bridgeContextAlive()) { bridgeRetire(); return; }
  var data = event.data, command = data && BRIDGE_COMMANDS[data.action];
  if (command) {
    if (!bridgeGuard(event, data)) { return; }
    sendRequestToWorker(Object.assign({ type: command.worker }, command.fields(data)), function (error, reply) {
      bridgePost({ action: command.reply, id: String(data.id || ''), ok: !error && !(reply && reply.ok === false), result: error ? null : reply, code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || ''), currentSpreadsheetId: String(!error && reply && reply.currentSpreadsheetId || '') }, 'BRIDGE_REPLY_POST_FAILED');
    });
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
  acceptReadPlan(data);
  if (Number(data.channelAliveMs) > 0) { channelAliveMs = Number(data.channelAliveMs); }
  if (newChannel && typeof lastContextKey !== 'undefined') { lastContextKey = ''; }

  bridgePost({ action: 'CRM_HANDSHAKE_ACK', at: Date.now() }, 'BRIDGE_HANDSHAKE_POST_FAILED');
}
window.addEventListener('message', bridgeOnMessage);

/**
 * 2. Tín hiệu kênh `/bind` từ `bind_watcher.js` (MAIN world cùng trang) sang Sidebar.
 * Có thể đổi và kênh vừa mở thì chuyển ngay dưới dạng `CRM_RELOAD` không mang revision — Sidebar tự gom và hỏi GAS.
 * Nhịp sống chỉ để Sidebar biết kênh còn thông, nên gộp tối đa một tin mỗi `channelAliveMs` để không ngập cầu nối.
 */
function bridgeOnBindEvent(event) {
  if (event.source !== window || event.origin !== location.origin) { return; }
  var data = event.data;
  if (!data || data.source !== 'SHINCRM_EXTENSION' || data.action !== 'CRM_BIND_EVENT') { return; }
  if (!bridgeContextAlive()) { bridgeRetire(); return; }
  if (!sidebarWindow || !sidebarOrigin || !sidebarNonce) { return; }
  var message = {};
  if (data.kind === 'alive') {
    var now = Date.now();
    if (channelAliveMs > 0 && now - channelAliveSentAt < channelAliveMs) { return; }
    channelAliveSentAt = now;
    message.action = 'CRM_CHANNEL_ALIVE';
  } else {
    message.action = 'CRM_RELOAD';
    message.signal = data.kind === 'open' ? 'channel-open' : 'channel';
    if (data.kind === 'open') { message.sameSession = data.sameSession === true; }
    else { message.firstChunk = data.firstChunk === true; message.hasChange = data.hasChange === true; }
  }
  bridgePost(message, 'BRIDGE_BIND_POST_FAILED');
}
window.addEventListener('message', bridgeOnBindEvent);

// 3. Bắn ảnh chụp trạng thái sang Sidebar. Sidebar tự quyết dùng trường nào.
function sendContextToSidebar(context) {
  if (!bridgeContextAlive()) { bridgeRetire(); return; }
  if (!sidebarWindow || !sidebarOrigin || !sidebarNonce) return;
  bridgePost(Object.assign({}, context, { action: 'CRM_CONTEXT' }), 'BRIDGE_CONTEXT_POST_FAILED');
}
