/**
 * PROJECT: ShinCRM_Master_Workspace
 * FILE: service_worker.js
 * TITLE: Điều phối
 * ROLE: Router
 * -------------------------------------------------------------------------
 * CHI TIẾT ĐẶC TẢ:
 * Router trung tâm: Message & Feature Flags.
 * -------------------------------------------------------------------------
 * NGÀY KHỞI TẠO: 06/03/2026
 */

/** Tìm tab FBM đang đăng nhập để content script thực hiện fetch cùng cookie. */
function findFbmTab() {
  return chrome.tabs.query({ url: ['https://fbo.com.vn:8888/*'] }).then(function (tabs) { return tabs && tabs.length ? tabs[0] : null; });
}

function addWorkerTrace(reply, request, stage, extra) {
  var meta = request && request.meta && request.meta.trace || {}, event = Object.assign({ at: Date.now(), stage: stage, runId: String(meta.runId || ''), requestId: String(meta.requestId || ''), operation: String(request && request.meta && request.meta.kind || ''), entity: String(request && request.meta && request.meta.entity || ''), recordId: String(request && request.meta && (request.meta.id || request.meta.shinId || request.meta.stt_rec_kh) || '') }, extra || {});
  if (reply && reply.result && typeof reply.result === 'object') {
    reply.result.transport = reply.result.transport || {};
    reply.result.transport.trace = (reply.result.transport.trace || []).concat([event]);
  } else if (reply && typeof reply === 'object') {
    reply.trace = (reply.trace || []).concat([event]);
  }
  return reply;
}

/** Đặt heartbeat sau khi worker đã đăng ký listener; tránh lỗi khởi động làm mất toàn bộ đầu nhận. */
function scheduleHeartbeat() {
  try {
    if (chrome.alarms && chrome.alarms.create) {
      var result = chrome.alarms.create('fbm-heartbeat', { periodInMinutes: 5 });
      if (result && typeof result.catch === 'function') { result.catch(function (err) { console.warn('Không đặt được heartbeat FBM:', err); }); }
    }
  } catch (err) {
    console.warn('Không đặt được heartbeat FBM:', err);
  }
}

/** Gửi message có hạn chờ để worker không giữ kênh Sidebar vô thời hạn. */
function sendTabMessage(tabId, message, timeoutMs) {
  return new Promise(function (resolve) {
    var settled = false;
    var timer = setTimeout(function () { if (!settled) { settled = true; resolve({ error: 'Tab FBM không trả lời cầu nối.' }); } }, timeoutMs);
    chrome.tabs.sendMessage(tabId, message, function (reply) {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      var error = chrome.runtime.lastError;
      resolve(error ? { error: error.message } : (reply || { error: 'Tab FBM không trả kết quả.' }));
    });
  });
}

/** Ping trước, chỉ nạp executor khi chưa có đầu nhận. */
function ensureFbmExecutor(tabId) {
  return sendTabMessage(tabId, { type: 'FBM_PING' }, 1500).then(function (reply) {
    if (reply && reply.ready) { return reply; }
    return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/fbm_sync/executor.js'] }).then(function () {
      return sendTabMessage(tabId, { type: 'FBM_PING' }, 1500);
    }).then(function (injectedReply) {
      if (!injectedReply || !injectedReply.ready) { throw new Error(injectedReply && injectedReply.error || 'Executor FBM không trả lời sau khi nạp.'); }
      return injectedReply;
    });
  });
}

/** Khôi phục bridge trên các tab Sheets đã mở trước khi Extension được tải lại. */
function ensureSheetsBridge(tabId) {
  return sendTabMessage(tabId, { type: 'CRM_BRIDGE_PING' }, 1000).then(function (reply) {
    if (reply && reply.ready) { return reply; }
    return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/model/live_model_reader.js'], world: 'MAIN' }).then(function () {
      return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/bridge/iframe_bridge.js', 'content_scripts/scout/sheet_scout.js'] });
    }).then(function () {
      return sendTabMessage(tabId, { type: 'CRM_BRIDGE_PING' }, 1500);
    }).then(function (injectedReply) {
      if (!injectedReply || !injectedReply.ready) { throw new Error(injectedReply && injectedReply.error || 'Bridge Google Sheet không trả lời sau khi nạp.'); }
      return injectedReply;
    });
  });
}

/** Tự phục hồi các tab Sheets đang mở; lỗi một tab không làm worker ngừng nhận message. */
function recoverSheetsBridges() {
  return chrome.tabs.query({ url: ['https://docs.google.com/spreadsheets/*'] }).then(function (tabs) {
    return Promise.all((tabs || []).map(function (tab) {
      return ensureSheetsBridge(tab.id).catch(function (error) { console.warn('Không khôi phục được bridge Google Sheet:', error); });
    }));
  }).catch(function (error) { console.warn('Không dò được tab Google Sheet:', error); });
}

/** Kiểm tra đầu nhận rồi gửi request nghiệp vụ đúng một lần. */
function sendToFbmTab(tabId, request) {
  return ensureFbmExecutor(tabId).then(function () {
    return hydrateLoginRequest(request).then(function (readyRequest) {
      request = readyRequest;
      return sendTabMessage(tabId, { type: 'FBM_EXECUTE', request: request }, 15000);
    });
  });
}

var CREDENTIAL_VAULT_PREFIX = 'fbmCredentialVault:';
function bytesToBase64(bytes) { var text = ''; for (var i = 0; i < bytes.length; i += 1) { text += String.fromCharCode(bytes[i]); } return btoa(text); }
function base64ToBytes(value) { var text = atob(String(value || '')), bytes = new Uint8Array(text.length); for (var i = 0; i < text.length; i += 1) { bytes[i] = text.charCodeAt(i); } return bytes; }
function credentialRef() { var bytes = new Uint8Array(12); crypto.getRandomValues(bytes); return 'cred-' + bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 16); }
function storageGet(key) { return new Promise(function (resolve) { chrome.storage.local.get([key], function (result) { resolve(result && result[key] || null); }); }); }
function storageSet(value) { return new Promise(function (resolve, reject) { chrome.storage.local.set(value, function () { var error = chrome.runtime.lastError; if (error) { reject(new Error(error.message)); } else { resolve(true); } }); }); }

/** Mã hóa ngay trên Extension; GAS chỉ nhận ciphertext và metadata đã che. */
function saveCredentialEnvelope(input) {
  var value = input || {}, ref = String(value.credentialRef || '').trim() || credentialRef(), username = String(value.username || ''), password = String(value.password || '');
  if (!username || !password) { return Promise.resolve({ ok: false, code: 'LOGIN_FIELDS_REQUIRED', error: 'Cần nhập username và mật khẩu FBM.' }); }
  var payload = JSON.stringify({ username: username, password: password, userId: String(value.userId || ''), spreadsheetId: String(value.spreadsheetId || ''), database: String(value.database || ''), unit: String(value.unit || ''), language: String(value.language || 'v') });
  var iv = crypto.getRandomValues(new Uint8Array(12));
  return crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt', 'decrypt']).then(function (key) {
    return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, key, new TextEncoder().encode(payload)).then(function (cipher) {
      return crypto.subtle.exportKey('jwk', key).then(function (jwk) {
        var envelope = { version: 1, alg: 'AES-GCM', iv: bytesToBase64(iv), ciphertext: bytesToBase64(new Uint8Array(cipher)) };
        return storageSet({ [CREDENTIAL_VAULT_PREFIX + ref]: { ref: ref, key: jwk, envelope: envelope } }).then(function () {
          return { ok: true, credentialRef: ref, envelope: envelope, public: { usernameHint: username.length > 2 ? username.slice(0, 2) + '***' : '***', database: String(value.database || ''), unit: String(value.unit || ''), language: String(value.language || 'v') } };
        });
      });
    });
  }).catch(function (error) { return { ok: false, code: 'LOGIN_ENCRYPT_FAILED', error: String(error && error.message || error) }; });
}
function readCredential(ref) {
  return storageGet(CREDENTIAL_VAULT_PREFIX + String(ref || '')).then(function (saved) {
    if (!saved || !saved.key || !saved.envelope) { throw new Error('Không tìm thấy thông tin đăng nhập đã mã hóa trên Extension.'); }
    return crypto.subtle.importKey('jwk', saved.key, { name: 'AES-GCM' }, false, ['decrypt']).then(function (key) {
      return crypto.subtle.decrypt({ name: 'AES-GCM', iv: base64ToBytes(saved.envelope.iv) }, key, base64ToBytes(saved.envelope.ciphertext)).then(function (plain) { return JSON.parse(new TextDecoder().decode(plain)); });
    });
  });
}
function hydrateLoginRequest(request) {
  var value = request || {}, meta = value.meta || {};
  if (String(meta.kind || '') !== 'login') { return Promise.resolve(value); }
  return readCredential(meta.credentialRef).then(function (credentials) {
    return Object.assign({}, value, { body: {}, meta: Object.assign({}, meta, { loginCredentials: credentials }) });
  });
}

/** Bỏ wrapper message của Extension trước khi chuyển response thô cho GAS. */
function rawFbmReply(reply) {
  if (reply && reply.result !== undefined) { return reply.result; }
  if (reply && reply.error) { return { ok: false, status: 599, body: String(reply.error), transport: { trace: reply.trace || [] } }; }
  return reply;
}

/** Gọi Web App relay và đọc kết quả handoff mà không ghi payload vào log. */
var GAS_RELAY_TIMEOUT_MS = 15000;

/** Lưu dấu chẩn đoán relay tối thiểu để có thể kiểm tra khi không có Sidebar. */
function noteRelayStatus(status) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) { return; }
  var item = status || {};
  try {
    chrome.storage.local.set({ fbmRelayLastStatus: {
      at: Date.now(),
      stage: String(item.stage || ''),
      requestSentAt: Number(item.requestSentAt || 0),
      responseReceivedAt: Number(item.responseReceivedAt || 0),
      ok: item.ok === true,
      code: String(item.code || ''),
      httpStatus: Number(item.httpStatus || 0),
      responseLength: Number(item.responseLength || 0),
      contentType: String(item.contentType || '').slice(0, 120),
      responsePrefix: String(item.responsePrefix || '').slice(0, 160),
      error: String(item.error || '').slice(0, 240)
    } });
  } catch (ignore) {}
}

function postRelay(url, key, body) {
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, GAS_RELAY_TIMEOUT_MS) : null;
  var requestSentAt = Date.now();
  noteRelayStatus({ stage: 'request_sent', requestSentAt: requestSentAt, code: 'RELAY_REQUEST_SENT' });
  return fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', redirect: 'follow', signal: controller && controller.signal, body: JSON.stringify(Object.assign({ key: key }, body)) }).then(function (response) {
    return response.text().then(function (text) {
      var responseReceivedAt = Date.now();
      var contentType = response.headers.get('content-type') || '';
      var responsePrefix = text.replace(/[\r\n\t]+/g, ' ').slice(0, 160);
      noteRelayStatus({ stage: 'response_received', requestSentAt: requestSentAt, responseReceivedAt: responseReceivedAt, httpStatus: response.status, responseLength: text.length, contentType: contentType, responsePrefix: responsePrefix, code: 'RELAY_RESPONSE_RECEIVED' });
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (ignore) {
        var htmlError = response.status === 404 ? 'GAS Web App không tồn tại ở URL đang lưu (HTTP 404).' : 'GAS relay trả về dữ liệu không phải JSON.';
        parsed = { ok: false, code: response.status === 404 ? 'RELAY_ENDPOINT_NOT_FOUND' : 'RELAY_INVALID_JSON', error: htmlError, contentType: contentType, responsePrefix: responsePrefix };
      }
      if (!response.ok && parsed && !parsed.error) { parsed.error = 'GAS relay HTTP ' + response.status; }
      noteRelayStatus({ stage: 'completed', requestSentAt: requestSentAt, responseReceivedAt: responseReceivedAt, ok: response.ok && parsed && parsed.ok !== false, code: parsed && parsed.code || (response.ok ? 'OK' : 'RELAY_HTTP_ERROR'), httpStatus: response.status, responseLength: text.length, contentType: contentType, responsePrefix: responsePrefix, error: parsed && parsed.error || '' });
      return parsed;
    });
  }).catch(function (error) {
    var timeout = error && error.name === 'AbortError';
    var message = timeout ? 'GAS relay không trả lời sau ' + GAS_RELAY_TIMEOUT_MS + ' ms.' : String(error && error.message || error || 'Lỗi fetch GAS relay.');
    noteRelayStatus({ stage: 'failed', requestSentAt: requestSentAt, ok: false, code: timeout ? 'RELAY_TIMEOUT' : 'RELAY_FETCH_FAILED', error: message });
    throw new Error(message);
  }).finally(function () { if (timer) { clearTimeout(timer); } });
}

/** Probe chỉ gọi Web App GAS; không tìm tab FBM, không gửi request nghiệp vụ. */
function fbmRelayProbe() {
  return getRelayConfig().then(function (config) {
    if (!config) {
      var missing = { ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu URL, khóa hoặc Spreadsheet ID relay.' };
      noteRelayStatus(Object.assign({ stage: 'blocked' }, missing));
      return missing;
    }
    return postRelay(config.url, config.key, { kind: 'probe', spreadsheetId: config.spreadsheetId }).then(function (reply) {
      console.info('[ShinCRM] GAS relay probe', reply);
      return reply;
    });
  });
}
if (typeof globalThis !== 'undefined') { globalThis.fbmRelayProbe = fbmRelayProbe; }

var fbmBackgroundSyncFlight = null;
var FBM_BACKGROUND_SYNC_MAX_REQUESTS = 100;

function noteBackgroundSyncStatus(stage, extra) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) { return; }
  var item = Object.assign({ at: Date.now(), stage: String(stage || '') }, extra || {});
  try { chrome.storage.local.set({ fbmBackgroundSyncLastStatus: item }); } catch (ignore) {}
}

/** Chạy một phiên GAS trực tiếp từ Service Worker; mặc định chỉ đọc, không cần Sidebar. */
function fbmRunBackgroundSync(mode) {
  if (fbmBackgroundSyncFlight) { return fbmBackgroundSyncFlight; }
  var selectedMode = String(mode || 'read').toLowerCase() === 'write' ? 'write' : 'read';
  fbmBackgroundSyncFlight = getRelayConfig().then(function (config) {
    if (!config) { throw new Error('Thiếu cấu hình relay; hãy mở Sidebar một lần để cấp URL và khóa.'); }
    return findFbmTab().then(function (tab) {
      if (!tab) { throw new Error('Không tìm thấy tab FBM đang mở.'); }
      noteBackgroundSyncStatus('start_requested', { mode: selectedMode, requestCount: 0 });
      return postRelay(config.url, config.key, { kind: 'background_sync', command: 'start', payload: { mode: selectedMode, origin: 'background', manual: false }, mode: selectedMode, spreadsheetId: config.spreadsheetId }).then(function (reply) {
        return relayBackgroundSyncRequests(tab.id, config, reply, 0, selectedMode);
      });
    });
  }).then(function (reply) {
    noteBackgroundSyncStatus('completed', { mode: selectedMode, requestCount: Number(reply && reply.requestCount || 0), ok: !!(reply && reply.ok), code: String(reply && reply.code || '') });
    console.info('[ShinCRM] GAS background sync completed', reply);
    return reply;
  }).catch(function (error) {
    noteBackgroundSyncStatus('failed', { mode: selectedMode, error: String(error && error.message || error) });
    console.error('[ShinCRM] GAS background sync failed', error);
    throw error;
  }).finally(function () { fbmBackgroundSyncFlight = null; });
  return fbmBackgroundSyncFlight;
}

function relayBackgroundSyncRequests(tabId, config, gasReply, requestCount, mode) {
  var count = Number(requestCount || 0), next = gasReply && gasReply.request;
  if (!next) { return Promise.resolve(Object.assign({}, gasReply || {}, { requestCount: count, mode: mode })); }
  if (count >= FBM_BACKGROUND_SYNC_MAX_REQUESTS) { throw new Error('Đồng bộ Service Worker vượt quá ' + FBM_BACKGROUND_SYNC_MAX_REQUESTS + ' request trong một lượt.'); }
  noteBackgroundSyncStatus('fbm_request_sent', { mode: mode, requestCount: count + 1 });
  console.info('[ShinCRM] FBM background request', count + 1, next.meta && next.meta.kind || 'request');
  return sendToFbmTab(tabId, next).then(function (reply) {
    noteBackgroundSyncStatus('fbm_response_received', { mode: mode, requestCount: count + 1 });
    var rawResponse = rawFbmReply(reply);
    return postRelay(config.url, config.key, { kind: 'background_sync', command: 'continue', payload: { response: rawResponse }, spreadsheetId: config.spreadsheetId, response: rawResponse });
  }).then(function (nextReply) { return relayBackgroundSyncRequests(tabId, config, nextReply, count + 1, mode); });
}
if (typeof globalThis !== 'undefined') { globalThis.fbmRunBackgroundSync = fbmRunBackgroundSync; }

/** Đọc một relay config duy nhất; thiếu config thì không được chạm tab FBM. */
function getRelayConfig() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) { return Promise.resolve(null); }
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId'], function (config) {
      var url = config && String(config.fbmWebAppUrl || '').trim();
      var key = config && String(config.fbmSyncKey || '').trim();
      var spreadsheetId = config && String(config.fbmSpreadsheetId || '').trim();
      resolve(url && key ? { url: url, key: key, spreadsheetId: spreadsheetId } : null);
    });
  });
}

/** Chạy một lượng request đọc giới hạn trong mỗi heartbeat để tiếp tục cursor GAS. */
function relayScheduledRequests(tabId, config, gasReply, count) {
  var next = gasReply && gasReply.request, used = Number(count || 0);
  if (!next || used >= 10 || !config || !config.url || !config.key) { return Promise.resolve(gasReply); }
    return sendToFbmTab(tabId, next).then(function (reply) {
    return postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply) }).then(function (nextReply) {
      return relayScheduledRequests(tabId, config, nextReply, used + 1);
    });
  });
}

/** Nộp heartbeat cho GAS và chạy tiếp các request đọc scheduler trả về. */
function relayHeartbeatToGas(tabId, reply) {
  return getRelayConfig().then(function (config) {
    if (!config) {
      noteRelayStatus({ ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu URL hoặc khóa Web App GAS.' });
      return null;
    }
    return postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply) }).then(function (gasReply) {
      return relayScheduledRequests(tabId, config, gasReply, 0);
    });
  }).catch(function (error) { console.warn('Không relay được heartbeat cho GAS:', String(error && error.message || error)); return null; });
}

/** Định tuyến request từ Sidebar tới đúng tab FBM, không xử lý dữ liệu nghiệp vụ. */
var fbmRequestFlights = Object.create(null);

chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'FBM_ENCRYPT_CREDENTIALS') {
    saveCredentialEnvelope(message.credentials || {}).then(sendResponse);
    return true;
  }
  if (message && message.type === 'FBM_CLEAR_CREDENTIALS') {
    var clearKey = CREDENTIAL_VAULT_PREFIX + String(message.credentialRef || '');
    chrome.storage.local.remove([clearKey], function () { sendResponse({ ok: !chrome.runtime.lastError }); });
    return true;
  }
  if (message && message.type === 'FBM_CONFIGURE_RELAY') {
    var config = message.config || {};
    if (!chrome.storage || !chrome.storage.local) { sendResponse({ ok: false, error: 'Extension không có kho cấu hình.' }); return false; }
    chrome.storage.local.set({ fbmWebAppUrl: String(config.url || ''), fbmSyncKey: String(config.key || ''), fbmSpreadsheetId: String(config.spreadsheetId || '') }, function () { sendResponse({ ok: true }); });
    return true;
  }
  if (message && message.type === 'FBM_RELAY_PROBE') {
    fbmRelayProbe().then(sendResponse, function (error) { sendResponse({ ok: false, code: 'RELAY_PROBE_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_BACKGROUND_SYNC') {
    fbmRunBackgroundSync(message.mode).then(sendResponse, function (error) { sendResponse({ ok: false, code: 'BACKGROUND_SYNC_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (!message || message.type !== 'FBM_EXECUTE_REQUEST') { return false; }
  var requestId = String(message.id || '');
  var existingFlight = requestId && fbmRequestFlights[requestId];
  if (existingFlight) {
    existingFlight.then(sendResponse, function (err) { sendResponse({ error: String(err && err.message || err) }); });
    return true;
  }
  var flight = findFbmTab().then(function (tab) {
    if (!tab) { return addWorkerTrace({ error: 'Không tìm thấy tab FBM đang mở.' }, message.request, 'fbm_tab_not_found'); }
    return sendToFbmTab(tab.id, message.request).then(function (reply) { return addWorkerTrace(addWorkerTrace(reply, message.request, 'worker_received'), message.request, 'fbm_tab_found'); });
  });
  if (requestId) {
    fbmRequestFlights[requestId] = flight;
    flight.then(function () { delete fbmRequestFlights[requestId]; }, function () { delete fbmRequestFlights[requestId]; });
  }
  flight.then(sendResponse, function (err) { sendResponse({ error: String(err && err.message || err) }); });
  return true;
});

/** Khởi tạo heartbeat khi Extension cài mới hoặc Chrome khởi động. */
chrome.runtime.onInstalled.addListener(scheduleHeartbeat);
chrome.runtime.onStartup.addListener(scheduleHeartbeat);
scheduleHeartbeat();
recoverSheetsBridges();
/** Gửi request đọc tối thiểu; không gửi thao tác ghi từ alarm. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== 'fbm-heartbeat') { return; }
  getRelayConfig().then(function (config) {
    if (!config) { return null; }
    return findFbmTab().then(function (tab) { if (tab) { return sendToFbmTab(tab.id, null).then(function (reply) { return relayHeartbeatToGas(tab.id, reply); }); } return null; });
  }).catch(function (error) { console.warn('Heartbeat FBM thất bại:', error); });
});

