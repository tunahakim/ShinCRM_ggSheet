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
  if (data.spreadsheetId && typeof readSpreadsheetId === 'function' && String(data.spreadsheetId) !== String(readSpreadsheetId())) { return; }
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
  sidebarWindow = null; sidebarOrigin = ''; sidebarNonce = '';
}

function isInvalidatedExtensionError(error) {
  return !!(error && /Extension context invalidated/i.test(String(error.message || error)));
}

/** Cho worker xác nhận bridge còn sống trước khi quyết định nạp lại content script. */
if (typeof chrome !== 'undefined' && chrome.runtime && chrome.runtime.onMessage) {
  chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!message || message.type !== 'CRM_BRIDGE_PING') { return false; }
    sendResponse({ ready: true, version: '21.7' });
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

// 1. Bắt tay: kiểm origin, ghi nhớ đích, đáp tiếng kèm đúng nonce.
function bridgeOnMessage(event) {
  if (!bridgeContextAlive()) { bridgeRetire(); return; }
  var data = event.data;
  if (data && data.action === 'CRM_FBM_CONFIG') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_CONFIGURE_RELAY', config: data.config || {} }, function (error, reply) {
      if (error && console && console.warn) { console.warn('Không lưu được cấu hình relay FBM:', error); }
      try {
        event.source.postMessage({ action: 'CRM_FBM_CONFIG_ACK', nonce: sidebarNonce, sessionId: extensionSessionId, id: String(data.id || ''), ok: !error && !(reply && reply.ok === false), code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || '') }, event.origin);
      } catch (ignoreAck) {}
    });
    return;
  }
  if (data && data.action === 'CRM_FBM_CREDENTIALS') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_ENCRYPT_CREDENTIALS', credentials: data.credentials || {} }, function (error, reply) {
      try {
        event.source.postMessage({ action: 'CRM_FBM_CREDENTIALS_RESULT', nonce: sidebarNonce, sessionId: extensionSessionId, id: String(data.id || ''), result: error ? null : reply, code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || '') }, event.origin);
      } catch (ignoreCredentialsAck) {}
    });
    return;
  }
  if (data && data.action === 'CRM_FBM_CREDENTIAL_METADATA') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_GET_CREDENTIAL_METADATA', credentialRef: String(data.credentialRef || '') }, function (error, reply) {
      try {
        event.source.postMessage({ action: 'CRM_FBM_CREDENTIAL_METADATA_RESULT', nonce: sidebarNonce, sessionId: extensionSessionId, id: String(data.id || ''), result: error ? null : reply, code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || '') }, event.origin);
      } catch (ignoreMetadataAck) {}
    });
    return;
  }
  if (data && data.action === 'CRM_FBM_CREDENTIAL_CLEAR') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_CLEAR_CREDENTIALS', credentialRef: String(data.credentialRef || '') }, function (error, reply) {
      try {
        event.source.postMessage({ action: 'CRM_FBM_CREDENTIAL_CLEAR_RESULT', nonce: sidebarNonce, sessionId: extensionSessionId, id: String(data.id || ''), result: error ? null : reply, code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || '') }, event.origin);
      } catch (ignoreClearAck) {}
    });
    return;
  }
  if (data && data.action === 'CRM_FBM_CANCEL') {
    if (!isAllowedSidebarOrigin(event.origin) || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_CANCEL_BATCH' }, function (error) { if (error && console && console.warn) { console.warn('Không báo được lệnh dừng cho Extension:', error); } });
    return;
  }
  if (data && data.action === 'CRM_FBM_TRANSPORT_PROBE') {
    if (!isAllowedSidebarOrigin(event.origin) || event.source !== sidebarWindow || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    sendRequestToWorker({ type: 'FBM_TRANSPORT_PROBE', route: String(data.route || ''), sizeBytes: Number(data.sizeBytes || 0), timeoutMs: Number(data.timeoutMs || 0) }, function (error, reply) {
      try {
        event.source.postMessage({ action: 'CRM_FBM_TRANSPORT_PROBE_RESULT', nonce: sidebarNonce, sessionId: extensionSessionId, id: String(data.id || ''), result: error ? null : reply, code: error ? bridgeErrorCode(error) : (reply && reply.code || ''), error: error ? bridgeErrorMessage(error) : (reply && reply.error || '') }, event.origin);
      } catch (ignoreProbeAck) {}
    });
    return;
  }
  if (data && data.action === 'CRM_FBM_REQUEST') {
    // Chuyển nguyên request qua service worker; bridge không phân tích response FBM.
    if (!isAllowedSidebarOrigin(event.origin) || String(data.nonce || '') !== sidebarNonce || !isCurrentExtensionSession(data)) { return; }
    // Sheets có thể thay WindowProxy sau reload; nonce vẫn định danh đúng Sidebar.
    if (event.source && event.source !== sidebarWindow) { sidebarWindow = event.source; sidebarOrigin = event.origin; }
    // `data.id` is only the Sidebar waiter id. The GAS reservation id lives in
    // request.meta.trace.requestId and must remain the sole `requestId` used by
    // GAS stale-response validation.
    var bridgeTrace = { at: Date.now(), stage: 'bridge_received', clientRequestId: String(data.id || '') };
    sendRequestToWorker({ type: 'FBM_EXECUTE_REQUEST', id: data.id, request: data.request }, function (error, reply) {
      try {
        var trace = (reply && reply.result && reply.result.transport && reply.result.transport.trace) || (reply && reply.trace) || [];
        var bridgeResponseTrace = Object.assign({}, bridgeTrace, { at: Date.now(), stage: 'bridge_response_sent' });
        trace = [bridgeTrace].concat(trace, [bridgeResponseTrace]);
        if (reply && reply.result && typeof reply.result === 'object') { reply.result.transport = reply.result.transport || {}; reply.result.transport.trace = trace; }
        event.source.postMessage({
          action: 'CRM_FBM_RESPONSE',
          nonce: sidebarNonce,
          id: data.id,
          result: error ? null : (reply && reply.result),
          error: error ? bridgeErrorMessage(error) : (reply && reply.error),
          code: error ? bridgeErrorCode(error) : (reply && reply.code),
          trace: trace,
          retryable: false
        }, event.origin);
      } catch (err) { sidebarWindow = null; sidebarOrigin = ''; sidebarNonce = ''; }
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
}
window.addEventListener('message', bridgeOnMessage);

// 2. Bắn ảnh chụp trạng thái sang Sidebar. Sidebar tự quyết dùng trường nào.
function sendContextToSidebar(context) {
  if (!bridgeContextAlive()) { bridgeRetire(); return; }
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
