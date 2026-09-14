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
var FBM_EXECUTOR_VERSION = '21.11';

function addWorkerTrace(reply, request, stage, extra) {
  var event = Object.assign({ at: Date.now(), stage: stage, requestId: String(request && request.id || '') }, extra || {});
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
  return sendTabMessage(tabId, { type: 'FBM_PING_V2' }, 1500).then(function (reply) {
    if (reply && reply.ready && String(reply.version || '') === FBM_EXECUTOR_VERSION) { return reply; }
    return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/fbm_sync/executor.js'] }).then(function () {
      return sendTabMessage(tabId, { type: 'FBM_PING_V2' }, 1500);
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
  return chrome.tabs.query({ url: ['https://docs.google.com/*'] }).then(function (tabs) {
    return Promise.all((tabs || []).filter(function (tab) { return /https:\/\/docs\.google\.com\/spreadsheets\//i.test(String(tab && tab.url || '')); }).map(function (tab) {
      return ensureSheetsBridge(tab.id).catch(function (error) { console.warn('Không khôi phục được bridge Google Sheet:', error); });
    }));
  }).catch(function (error) { console.warn('Không dò được tab Google Sheet:', error); });
}

/** Kiểm tra đầu nhận rồi gửi request nghiệp vụ đúng một lần. */
function sendToFbmTab(tabId, request) {
  if (!request || typeof request !== 'object') { return Promise.resolve({ error: 'GAS chưa cấp request FBM; đã chặn trước khi tìm tab.' }); }
  return ensureFbmExecutor(tabId).then(function () {
    return hydrateLoginRequest(request).then(function (readyRequest) {
      request = readyRequest;
    return sendTabMessage(tabId, { type: 'FBM_EXECUTE_V2', request: request }, 15000);
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
  if (!request) { return Promise.resolve(request); }
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
// GAS Web App có thể mất hơn 15 giây khi cold start hoặc đang chờ Spreadsheet lock.
// Giữ giới hạn hữu hạn để alarm không treo vô hạn, nhưng đủ rộng cho redirect /exec.
var GAS_RELAY_TIMEOUT_MS = 30000;
var GAS_RELAY_REFRESH_COOLDOWN_MS = 30000;
var relayRefreshFlight = null;
var relayRefreshLastAt = 0;

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
      if (parsed && parsed.code === 'RELAY_ENDPOINT_NOT_FOUND') { requestRelayRefresh('RELAY_ENDPOINT_NOT_FOUND'); }
      return parsed;
    });
  }).catch(function (error) {
    var timeout = error && error.name === 'AbortError';
    var message = timeout ? 'GAS relay không trả lời sau ' + GAS_RELAY_TIMEOUT_MS + ' ms.' : String(error && error.message || error || 'Lỗi fetch GAS relay.');
    noteRelayStatus({ stage: 'failed', requestSentAt: requestSentAt, ok: false, code: timeout ? 'RELAY_TIMEOUT' : 'RELAY_FETCH_FAILED', error: message });
    throw new Error(message);
  }).finally(function () { if (timer) { clearTimeout(timer); } });
}

/** Yêu cầu Sidebar đang mở lấy lại URL deployment hiện tại từ GAS. */
function requestRelayRefresh(reason) {
  var now = Date.now();
  if (relayRefreshFlight) { return relayRefreshFlight; }
  if (now - relayRefreshLastAt < GAS_RELAY_REFRESH_COOLDOWN_MS) { return Promise.resolve([]); }
  relayRefreshLastAt = now;
  relayRefreshFlight = chrome.tabs.query({ url: ['https://docs.google.com/*'] }).then(function (tabs) {
    var targets = (tabs || []).filter(function (tab) { return /https:\/\/docs\.google\.com\/spreadsheets\//i.test(String(tab && tab.url || '')); });
    return Promise.all(targets.map(function (tab) {
      return sendTabMessage(tab.id, { type: 'CRM_REFRESH_RELAY', reason: String(reason || '') }, 1500).catch(function () { return null; });
    }));
  }).catch(function () { return []; }).finally(function () { relayRefreshFlight = null; });
  return relayRefreshFlight;
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
var fbmHeartbeatFlight = null;

function noteBackgroundSyncStatus(stage, extra) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) { return; }
  var item = Object.assign({ at: Date.now(), stage: String(stage || '') }, extra || {});
  try { chrome.storage.local.set({ fbmBackgroundSyncLastStatus: item }); } catch (ignore) {}
}

/** Ghi chẩn đoán heartbeat tối thiểu; không lưu cookie hay payload FBM. */
function noteHeartbeatStatus(stage, extra) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.set) { return; }
  try { chrome.storage.local.set({ fbmHeartbeatLastStatus: Object.assign({ at: Date.now(), stage: String(stage || '') }, extra || {}) }); } catch (ignore) {}
}

/** Báo transport failure về GAS theo reservation; không biến lỗi cầu nối thành lỗi nghiệp vụ FBM. */
function relayHeartbeatTransportFailure(config, request, code, message) {
  if (!config || !config.url || !config.key || !request || !request.id) {
    return Promise.resolve({ ok: false, code: 'HEARTBEAT_RESERVATION_MISSING', request: null });
  }
  return postRelay(config.url, config.key, {
    kind: 'heartbeat_transport_failure',
    spreadsheetId: config.spreadsheetId,
    requestId: String(request.id),
    code: String(code || 'FBM_TRANSPORT_UNAVAILABLE'),
    error: String(message || 'Extension không gửi được request tới tab FBM.').slice(0, 240)
  });
}

/** Chạy ngay một heartbeat để nghiệm thu; alarm 5 phút chỉ gọi lại đúng luồng này. */
function fbmHeartbeatNow(source) {
  if (fbmHeartbeatFlight) { return fbmHeartbeatFlight; }
  var origin = String(source || 'manual');
  noteHeartbeatStatus('started', { source: origin });
  fbmHeartbeatFlight = getRelayConfig().then(function (config) {
    if (!config) {
      noteHeartbeatStatus('blocked_config', { source: origin, code: 'RELAY_CONFIG_MISSING' });
      return { ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu cấu hình relay; hãy mở Sidebar một lần.' };
    }
    noteHeartbeatStatus('relay_configured', { source: origin });
    // GAS phải cấp envelope trước; không có envelope thì tuyệt đối không chạm tab FBM.
    return postRelay(config.url, config.key, { kind: 'heartbeat_request', source: origin, spreadsheetId: config.spreadsheetId }).then(function (gasRequest) {
      if (!gasRequest || gasRequest.ok !== true || !gasRequest.request) {
        var requestCode = String(gasRequest && gasRequest.code || 'HEARTBEAT_REQUEST_NOT_READY');
        noteHeartbeatStatus('blocked_gas_request', { source: origin, code: requestCode, error: String(gasRequest && (gasRequest.error || gasRequest.message) || 'GAS chưa cấp request heartbeat.').slice(0, 240) });
        return Object.assign({}, gasRequest || {}, { ok: false, code: requestCode, error: String(gasRequest && (gasRequest.error || gasRequest.message) || 'GAS chưa cấp request heartbeat.') });
      }
      return findFbmTab().then(function (tab) {
        if (!tab) {
          noteHeartbeatStatus('blocked_tab', { source: origin, code: 'FBM_TAB_NOT_FOUND' });
          return relayHeartbeatTransportFailure(config, gasRequest.request, 'FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM đang mở.').then(function (gasReply) {
            return Object.assign({}, gasReply || {}, { ok: false, code: 'FBM_TAB_NOT_FOUND', error: 'Không tìm thấy tab FBM đang mở.' });
          });
        }
        noteHeartbeatStatus('fbm_request_sent', { source: origin, tabId: Number(tab.id || 0) });
        return sendToFbmTab(tab.id, gasRequest.request).then(function (reply) {
          if (reply && reply.error) {
            return relayHeartbeatTransportFailure(config, gasRequest.request, 'FBM_TRANSPORT_UNAVAILABLE', reply.error).then(function (gasReply) {
              return Object.assign({}, gasReply || {}, { ok: false, code: 'FBM_TRANSPORT_UNAVAILABLE', error: String(reply.error) });
            });
          }
          var raw = rawFbmReply(reply) || {};
          noteHeartbeatStatus('fbm_response_received', { source: origin, tabId: Number(tab.id || 0), ok: raw.ok === true, httpStatus: Number(raw.status || 0), responseLength: String(raw.body || '').length, error: String(raw.error || '').slice(0, 240) });
          return relayHeartbeatToGas(tab.id, reply, 1).then(function (gasReply) {
            noteHeartbeatStatus('gas_response_received', { source: origin, ok: !!(gasReply && gasReply.ok), code: String(gasReply && gasReply.code || '') });
            return gasReply && gasReply.ok === false ? Object.assign({ ok: false }, gasReply) : { ok: true, gas: gasReply || null };
          });
        }).catch(function (error) {
          return relayHeartbeatTransportFailure(config, gasRequest.request, 'FBM_TRANSPORT_UNAVAILABLE', error && error.message || error).then(function (gasReply) {
            return Object.assign({}, gasReply || {}, { ok: false, code: 'FBM_TRANSPORT_UNAVAILABLE', error: String(error && error.message || error) });
          });
        });
      });
    });
  }).catch(function (error) {
    var message = String(error && error.message || error);
    noteHeartbeatStatus('failed', { source: origin, code: 'HEARTBEAT_FAILED', error: message.slice(0, 240) });
    return { ok: false, code: 'HEARTBEAT_FAILED', error: message };
  }).finally(function () { fbmHeartbeatFlight = null; });
  return fbmHeartbeatFlight;
}
if (typeof globalThis !== 'undefined') { globalThis.fbmHeartbeatNow = fbmHeartbeatNow; }

/** Chạy một phiên GAS trực tiếp từ Service Worker; mặc định chỉ đọc, không cần Sidebar. */
function fbmRunBackgroundSync() {
  if (fbmBackgroundSyncFlight) { return fbmBackgroundSyncFlight; }
  var selectedMode = 'gas_decides';
  fbmBackgroundSyncFlight = getRelayConfig().then(function (config) {
    if (!config) { throw new Error('Thiếu cấu hình relay; hãy mở Sidebar một lần để cấp URL và khóa.'); }
    noteBackgroundSyncStatus('start_requested', { mode: selectedMode, requestCount: 0 });
    return postRelay(config.url, config.key, { kind: 'background_sync', command: 'start', payload: { origin: 'background', manual: false }, spreadsheetId: config.spreadsheetId }).then(function (reply) {
      if (!reply || !reply.request) { return reply; }
      return findFbmTab().then(function (tab) {
        if (tab) { return relayBackgroundSyncRequests(tab.id, config, reply, 0, selectedMode); }
        return postRelay(config.url, config.key, { kind: 'background_sync', command: 'transport_failure', payload: { requestId: reply.request.id, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' }, spreadsheetId: config.spreadsheetId, hop: 1 });
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
  noteBackgroundSyncStatus('fbm_request_sent', { mode: mode, requestCount: count + 1 });
  console.info('[ShinCRM] FBM background request', count + 1);
  return sendToFbmTab(tabId, next).then(function (reply) {
    if (reply && reply.error) {
      return postRelay(config.url, config.key, { kind: 'background_sync', command: 'transport_failure', payload: { requestId: next.id, code: 'FBM_TRANSPORT_UNAVAILABLE', message: reply.error }, spreadsheetId: config.spreadsheetId, hop: count + 1 });
    }
    noteBackgroundSyncStatus('fbm_response_received', { mode: mode, requestCount: count + 1 });
    var rawResponse = rawFbmReply(reply);
    return postRelay(config.url, config.key, { kind: 'background_sync', command: 'continue', payload: { response: rawResponse }, spreadsheetId: config.spreadsheetId, response: rawResponse, hop: count + 1 });
  }).then(function (nextReply) { return relayBackgroundSyncRequests(tabId, config, nextReply, count + 1, mode); }).catch(function (error) {
    return postRelay(config.url, config.key, { kind: 'background_sync', command: 'transport_failure', payload: { requestId: next.id, code: 'FBM_TRANSPORT_UNAVAILABLE', message: String(error && error.message || error) }, spreadsheetId: config.spreadsheetId, hop: count + 1 });
  });
}
if (typeof globalThis !== 'undefined') { globalThis.fbmRunBackgroundSync = fbmRunBackgroundSync; }

/** Đọc một relay config duy nhất; thiếu config thì không được chạm tab FBM. */
function getRelayConfig() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) { return Promise.resolve(null); }
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId'], function (config) {
      var url = normalizeRelayUrl(config && config.fbmWebAppUrl);
      var key = config && String(config.fbmSyncKey || '').trim();
      var spreadsheetId = config && String(config.fbmSpreadsheetId || '').trim();
      resolve(url && key ? { url: url, key: key, spreadsheetId: spreadsheetId } : null);
    });
  });
}

/** Chỉ nhận URL Web App thuần; loại bỏ dạng Markdown thường xuất hiện khi copy từ tài liệu. */
function normalizeRelayUrl(value) {
  var raw = String(value || '').trim(), markdown = raw.match(/^\[[^\]]+\]\((https:\/\/[^)]+)\)$/i), parsed;
  if (markdown) { raw = markdown[1]; }
  try { parsed = new URL(raw); } catch (ignore) { return ''; }
  if (!/^https:\/\/(?:script\.google\.com|script\.googleusercontent\.com)$/i.test(parsed.origin)) { return ''; }
  if (!/^\/macros\/s\/[^/]+\/exec\/?$/i.test(parsed.pathname)) { return ''; }
  return parsed.toString().replace(/\/$/, '');
}

/** Chỉ ghi relay sau khi endpoint mới đã trả lời; URL hỏng không được ghi đè URL đang dùng. */
function configureRelay(config) {
  var value = config || {}, url = String(value.url || '').trim(), key = String(value.key || '').trim(), spreadsheetId = String(value.spreadsheetId || '').trim();
  if (!url || !key || !spreadsheetId) { return Promise.resolve({ ok: false, code: 'RELAY_CONFIG_INVALID', error: 'Cấu hình relay thiếu URL, khóa hoặc Spreadsheet ID.' }); }
  return postRelay(url, key, { kind: 'probe', spreadsheetId: spreadsheetId }).then(function (probe) {
    if (!probe || probe.ok !== true) { return Object.assign({ ok: false, code: 'RELAY_CONFIG_REJECTED' }, probe || { error: 'Relay mới không trả lời hợp lệ.' }); }
    return new Promise(function (resolve) {
      chrome.storage.local.set({ fbmWebAppUrl: url, fbmSyncKey: key, fbmSpreadsheetId: spreadsheetId }, function () {
        var error = chrome.runtime.lastError;
        resolve(error ? { ok: false, code: 'RELAY_CONFIG_SAVE_FAILED', error: error.message } : { ok: true, code: 'RELAY_CONFIG_SAVED' });
      });
    });
  }).catch(function (error) { return { ok: false, code: 'RELAY_CONFIG_REJECTED', error: String(error && error.message || error) }; });
}

/** Chuyển từng request tiếp theo do GAS cấp trong cùng heartbeat; GAS quyết định điểm dừng. */
function relayScheduledRequests(tabId, config, gasReply, count) {
  var next = gasReply && gasReply.request, used = Number(count || 0);
  if (!next || !config || !config.url || !config.key) { return Promise.resolve(gasReply); }
  return sendToFbmTab(tabId, next).then(function (reply) {
      if (reply && reply.error) { return relayHeartbeatTransportFailure(config, next, 'FBM_TRANSPORT_UNAVAILABLE', reply.error); }
      var raw = rawFbmReply(reply);
      return postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: raw, hop: used + 1 }).then(function (nextReply) {
      return relayScheduledRequests(tabId, config, nextReply, used + 1);
    });
  }).catch(function (error) { return relayHeartbeatTransportFailure(config, next, 'FBM_TRANSPORT_UNAVAILABLE', error && error.message || error); });
}

/** Nộp heartbeat cho GAS và chạy tiếp các request đọc scheduler trả về. */
function relayHeartbeatToGas(tabId, reply, hop) {
  return getRelayConfig().then(function (config) {
    if (!config) {
      noteRelayStatus({ ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu URL hoặc khóa Web App GAS.' });
      return null;
    }
    return postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply), hop: Number(hop || 1) }).then(function (gasReply) {
      if (!gasReply || gasReply.ok === false) { return gasReply || { ok: false, code: 'GAS_HEARTBEAT_FAILED' }; }
      return relayScheduledRequests(tabId, config, gasReply, 0);
    });
  }).catch(function (error) { var message = String(error && error.message || error); console.warn('Không relay được heartbeat cho GAS:', message); return { ok: false, code: 'GAS_RELAY_FAILED', error: message }; });
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
    configureRelay(config).then(sendResponse);
    return true;
  }
  if (message && message.type === 'FBM_RELAY_PROBE') {
    fbmRelayProbe().then(sendResponse, function (error) { sendResponse({ ok: false, code: 'RELAY_PROBE_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_BACKGROUND_SYNC') {
    fbmRunBackgroundSync().then(sendResponse, function (error) { sendResponse({ ok: false, code: 'BACKGROUND_SYNC_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_HEARTBEAT_NOW') {
    fbmHeartbeatNow(message.source || 'manual').then(sendResponse);
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
  fbmHeartbeatNow('alarm').then(function (result) { if (!result || result.ok !== true) { console.warn('Heartbeat FBM không chạy:', result); } });
});

