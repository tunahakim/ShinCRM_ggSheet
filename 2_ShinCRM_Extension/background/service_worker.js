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
/** Đợi trang FBM sẵn sàng trước khi tiêm executor; không tự đổi URL hoặc quyết định nghiệp vụ. */
function waitForFbmTabReady(tab, timeoutMs) {
  var target = tab || {}, tabId = Number(target.id || 0);
  if (!tabId || String(target.status || 'complete') === 'complete' || !chrome.tabs || !chrome.tabs.onUpdated || typeof chrome.tabs.onUpdated.addListener !== 'function') {
    return Promise.resolve(target);
  }
  return new Promise(function (resolve, reject) {
    var settled = false;
    var remove = typeof chrome.tabs.onUpdated.removeListener === 'function' ? function (listener) { chrome.tabs.onUpdated.removeListener(listener); } : function () {};
    var timer = setTimeout(function () {
      if (settled) { return; }
      settled = true;
      remove(onUpdated);
      var error = new Error('Tab FBM chưa tải xong trong thời gian an toàn.');
      error.code = 'FBM_TAB_NOT_READY';
      reject(error);
    }, Math.max(0, Number(timeoutMs || 0)));
    function finish(value) {
      if (settled) { return; }
      settled = true;
      clearTimeout(timer);
      remove(onUpdated);
      resolve(value || target);
    }
    function onUpdated(updatedTabId, changeInfo, updatedTab) {
      if (Number(updatedTabId) === tabId && (!changeInfo || changeInfo.status === 'complete')) { finish(updatedTab || target); }
    }
    chrome.tabs.onUpdated.addListener(onUpdated);
  });
}
/**
 * Hạn của một envelope do GAS cấp (`meta.timeoutMs`, Tài liệu 09/01 "Ngân sách một lượt"): tính một lần từ lúc Extension nhận envelope và dùng chung cho chờ tab, chờ executor và mọi phần tử của lô.
 * Extension không giữ con số riêng; envelope thiếu hạn thì hạn bằng 0 và bị báo lỗi transport ngay chứ không chờ vô hạn.
 */
var envelopeDeadlines = new WeakMap();
function envelopeDeadline(request) {
  if (!request || typeof request !== 'object') { return Date.now(); }
  if (!envelopeDeadlines.has(request)) { envelopeDeadlines.set(request, Date.now() + Math.max(0, Number(request.meta && request.meta.timeoutMs || 0))); }
  return envelopeDeadlines.get(request);
}
function envelopeRemainingMs(request) { return Math.max(0, envelopeDeadline(request) - Date.now()); }
/** GAS may explicitly request a background FBM tab; Extension only opens the supplied URL. */
function ensureFbmTab(request) {
  envelopeDeadline(request);
  return findFbmTab().then(function (tab) {
    if (tab) { return waitForFbmTabReady(tab, envelopeRemainingMs(request)); }
    var instruction = request && request.meta && request.meta.openFbmContext;
    if (!instruction || !instruction.url || !chrome.tabs || typeof chrome.tabs.create !== 'function') { return null; }
    // Dùng được cả Chrome API kiểu callback và kiểu Promise; không tạo tab lần hai.
    var created = new Promise(function (resolve, reject) {
      var settled = false;
      function finish(value) { if (settled) { return; } settled = true; resolve(value || null); }
      function fail(error) { if (settled) { return; } settled = true; reject(error); }
      try {
        var result = chrome.tabs.create({ url: String(instruction.url), active: instruction.active === true }, finish);
        if (result && typeof result.then === 'function') { result.then(finish, fail); }
      } catch (error) { fail(error); }
    });
    return created.then(function (newTab) { return newTab ? waitForFbmTabReady(newTab, envelopeRemainingMs(request)) : null; });
  });
}
var FBM_EXECUTOR_VERSION = '21.21';
// Mã phiên bản hợp đồng GAS–Extension (tests/contracts/gasExtensionContract.js). Chỉ trả về cho GAS; GAS quyết định dừng khi lệch mã.
var FBM_CONTRACT_VERSION = 'd90ed1d95988';

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

/** Đặt đúng một alarm kỹ thuật; GAS mới biết lịch nghiệp vụ nào đến hạn. */
var GAS_POLL_ALARM = 'gas_poll';
var gasPollAlarmKnown = false;
var gasPollAlarmMinutes = 0;
function scheduleGasPoll(extensionConfig) {
  try {
    if (chrome.alarms && chrome.alarms.create) {
      var minutes = Math.max(1, Math.min(60, Math.round(Number(extensionConfig && extensionConfig.pollMinutes || 5))));
      if (gasPollAlarmKnown && gasPollAlarmMinutes === minutes) { return; }
      var create = function () {
        gasPollAlarmKnown = true;
        gasPollAlarmMinutes = minutes;
        var result = chrome.alarms.create(GAS_POLL_ALARM, { periodInMinutes: minutes });
        if (result && typeof result.catch === 'function') { result.catch(function (err) { console.warn('Không đặt được nhịp hỏi GAS:', err); }); }
      };
      if (typeof chrome.alarms.get !== 'function') { create(); return; }
      chrome.alarms.get(GAS_POLL_ALARM, function (alarm) { if (!alarm || Number(alarm.periodInMinutes || 0) !== minutes) { create(); } else { gasPollAlarmKnown = true; gasPollAlarmMinutes = minutes; } });
    }
  } catch (err) {
    console.warn('Không đặt được nhịp hỏi GAS:', err);
  }
}

/** Alarm là nhịp kỹ thuật; GAS quyết định mỗi nhịp có cấp việc hay không. */
function stopGasPoll() {
  try {
    gasPollAlarmKnown = false;
    gasPollAlarmMinutes = 0;
    if (chrome.alarms && chrome.alarms.clear) { return chrome.alarms.clear(GAS_POLL_ALARM); }
  } catch (err) {
    console.warn('Không dừng được nhịp hỏi GAS:', err);
  }
  return undefined;
}

function restoreHeartbeatSchedule() {
  getRelayConfig().then(function (config) {
    if (config) { scheduleGasPoll(config.extension); } else { stopGasPoll(); }
  });
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
      if (!injectedReply || !injectedReply.ready) {
        var executorError = new Error(injectedReply && injectedReply.error || 'Executor FBM không trả lời sau khi nạp.');
        executorError.code = 'FBM_TAB_NOT_READY';
        throw executorError;
      }
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

/**
 * Khoảng nghỉ giữa hai request liên tiếp tới FBM (Tài liệu 09/07 "Tham số phiên FBM"): GAS cấp khoảng [minMs, maxMs] trong envelope, Extension chọn ngẫu nhiên và chỉ chờ phần còn thiếu tính từ lúc request FBM trước kết thúc.
 * Mốc chỉ sống trong RAM service worker: Chrome tắt worker khi rảnh khoảng 30 giây thì mất mốc, chấp nhận vì lúc đó đã nghỉ lâu. Lấy gói từ RAM tab (`scan_chunk`) không gọi FBM nên không chờ và không dời mốc.
 */
var FBM_LAST_FETCH_END_AT = 0;
var FBM_REQUEST_GAP_CAP_MS = 60000;
function callsFbm(request) { return String(request && request.meta && request.meta.kind || '') !== 'scan_chunk'; }
function waitForFbmGap(request) {
  var gap = request && request.meta && request.meta.requestGap || {}, minMs = Math.max(0, Number(gap.minMs || 0)), maxMs = Math.max(minMs, Number(gap.maxMs || 0));
  if (!callsFbm(request) || !isFinite(maxMs) || maxMs <= 0 || !FBM_LAST_FETCH_END_AT) { return Promise.resolve(); }
  var waitMs = Math.min(FBM_REQUEST_GAP_CAP_MS, minMs + Math.random() * (maxMs - minMs)) - (Date.now() - FBM_LAST_FETCH_END_AT);
  if (waitMs <= 0) { return Promise.resolve(); }
  return new Promise(function (resolve) {
    var timer = setTimeout(wake, Math.round(waitMs));
    function wake() { clearTimeout(timer); if (fbmGapWake === wake) { fbmGapWake = null; } resolve(); }
    fbmGapWake = wake;
  });
}

/**
 * Người dùng bấm Dừng (Tài liệu 09/01 "Lô request đọc độc lập"): lô đang chạy trả phần đã đọc sau request FBM đang gọi, không chạy hết lô. Request đang gọi FBM không bị cắt vì không biết FBM đã nhận hay chưa.
 * Lệnh dừng là một mốc thời gian, nên lệnh cũ không chặn lô mở sau nó.
 */
var FBM_CANCEL_AT = 0, fbmGapWake = null;
function fbmCancelBatch() {
  FBM_CANCEL_AT = Date.now();
  if (fbmGapWake) { fbmGapWake(); }
  return { ok: true };
}
function fbmCancelledSince(since) { return since > 0 && FBM_CANCEL_AT >= since; }

/** Tự phục hồi các tab Sheets đang mở; lỗi một tab không làm worker ngừng nhận message. */
function recoverSheetsBridges() {
  return chrome.tabs.query({ url: ['https://docs.google.com/*'] }).then(function (tabs) {
    return Promise.all((tabs || []).filter(function (tab) { return /https:\/\/docs\.google\.com\/spreadsheets\//i.test(String(tab && tab.url || '')); }).map(function (tab) {
      return ensureSheetsBridge(tab.id).catch(function (error) { console.warn('Không khôi phục được bridge Google Sheet:', error); });
    }));
  }).catch(function (error) { console.warn('Không dò được tab Google Sheet:', error); });
}

/** Kiểm tra đầu nhận rồi gửi request nghiệp vụ (hoặc lô) đúng một lần. */
function sendToFbmTab(tabId, request) {
  if (!request || typeof request !== 'object') { return Promise.resolve({ error: 'GAS chưa cấp request FBM; đã chặn trước khi tìm tab.' }); }
  var envelope = request;
  return ensureFbmExecutor(tabId).then(function () {
    if (Array.isArray(envelope.items)) { return executeBatch(tabId, envelope).then(stampContract); }
    return hydrateLoginRequest(request).then(function (readyRequest) {
      request = readyRequest;
      return sendTabExecute(tabId, request, envelope).then(function (reply) { return showFbmHomeAfterLogin(tabId, request, stampContract(reply)); });
    });
  });
}

/** Cửa duy nhất gửi request cho executor: nghỉ đủ khoảng cách với request FBM trước, rồi gửi trong phần hạn còn lại của envelope; hết hạn thì là lỗi transport, không chờ thêm. */
function sendTabExecute(tabId, request, envelope, cancelSince) {
  return waitForFbmGap(request).then(function () {
    if (fbmCancelledSince(cancelSince)) { return { cancelled: true }; }
    var remaining = envelopeRemainingMs(envelope);
    if (remaining <= 0) { return { error: 'Extension đã hết hạn chờ GAS cấp cho request này; tab FBM phản hồi quá chậm.', code: 'FBM_TRANSPORT_TIMEOUT' }; }
    return sendTabMessage(tabId, { type: 'FBM_EXECUTE_V2', request: request }, remaining).finally(function () {
      if (callsFbm(request)) { FBM_LAST_FETCH_END_AT = Date.now(); }
    });
  });
}

/**
 * Lô request đọc độc lập (Tài liệu 09/01 "Lô request đọc độc lập"): chạy lần lượt trên cùng tab qua đúng đường request đơn, dừng khi tổng thân vượt `meta.batch.maxBytes`.
 * Một phần tử lỗi vận chuyển thì bỏ cả lô và trả lỗi như request đơn: lỗi mạng chỉ có một lớp xử lý ở GAS; chạy lại an toàn vì GAS ghi idempotent. Extension không biết phần tử thuộc khách nào và không tự chạy lại.
 */
function executeBatch(tabId, envelope) {
  var items = envelope.items, meta = envelope.meta || {}, maxBytes = Number(meta.batch && meta.batch.maxBytes || 0), results = [], traces = [], captured = {}, bytes = 0, startedAt = Date.now();
  function itemRequest(item) {
    return Object.assign({}, item, { meta: Object.assign({}, item.meta || {}, { transport: meta.transport, fetchMs: meta.fetchMs, requestGap: meta.requestGap }) });
  }
  function finish() {
    return { result: { ok: true, status: 200, items: results, transport: Object.assign({}, captured, { trace: traces }) } };
  }
  function next(index) {
    if (index >= items.length || (maxBytes > 0 && bytes > maxBytes)) { return Promise.resolve(finish()); }
    var request = itemRequest(items[index]);
    // Phần tử đầu không nhận lệnh dừng: lô rỗng là lỗi lệch hợp đồng ở GAS.
    return sendTabExecute(tabId, request, envelope, index > 0 ? startedAt : 0).then(function (reply) {
      if (reply && reply.cancelled) { return finish(); }
      var result = reply && reply.result;
      if (!result || reply.error) {
        return { error: String(reply && reply.error || 'Tab FBM không trả kết quả cho một request trong lô.'), code: String(reply && reply.code || 'FBM_TRANSPORT_UNAVAILABLE'), trace: traces.concat(reply && reply.trace || []) };
      }
      var transport = result.transport || {};
      traces = traces.concat(transport.trace || []);
      if (transport.captures) { captured = { captures: transport.captures }; }
      bytes += String(result.body || '').length;
      results.push({ id: String(items[index].id), ok: result.ok, status: result.status, headers: result.headers, body: result.body });
      return next(index + 1);
    });
  }
  return next(0);
}

/** Mọi response FBM về GAS (qua Sidebar hay nhịp nền) đều đi qua đây, nên đóng dấu mã hợp đồng ở đúng một chỗ. */
function stampContract(reply) {
  if (reply && reply.result && typeof reply.result === 'object') {
    reply.result.transport = reply.result.transport || {};
    reply.result.transport.contract = FBM_CONTRACT_VERSION;
  }
  return reply;
}

/** Đăng nhập chạy bằng fetch nên tab vẫn đứng ở trang lỗi/Login; GAS cấp địa chỉ màn hình làm việc, Extension chỉ mở và chờ tải xong trước khi trả kết quả để request kế tiếp không rơi vào tab đang tải. */
function showFbmHomeAfterLogin(tabId, request, reply) {
  var url = request && request.meta && request.meta.afterLoginUrl, result = reply && reply.result;
  if (!url || !result || !result.ok || (result.transport && result.transport.loginBlocked) || !chrome.tabs || typeof chrome.tabs.update !== 'function') { return Promise.resolve(reply); }
  return new Promise(function (resolve, reject) {
    chrome.tabs.update(tabId, { url: String(url) }, function (tab) {
      var error = chrome.runtime.lastError;
      if (error) { reject(Object.assign(new Error(error.message), { code: 'FBM_HOME_OPEN_FAILED' })); } else { resolve(tab || { id: tabId, status: 'loading' }); }
    });
  }).then(waitForFbmTabReady).then(function () { return addWorkerTrace(reply, request, 'fbm_home_opened'); }, function (error) {
    // Đăng nhập đã thành công; chỉ ghi vết để GAS thấy, không đổi kết quả đăng nhập.
    return addWorkerTrace(reply, request, 'fbm_home_open_failed', { code: String(error && error.code || 'FBM_HOME_OPEN_FAILED') });
  });
}

var CREDENTIAL_VAULT_PREFIX = 'fbmCredentialVault:';
function bytesToBase64(bytes) { var text = ''; for (var i = 0; i < bytes.length; i += 1) { text += String.fromCharCode(bytes[i]); } return btoa(text); }
function base64ToBytes(value) { var text = atob(String(value || '')), bytes = new Uint8Array(text.length); for (var i = 0; i < text.length; i += 1) { bytes[i] = text.charCodeAt(i); } return bytes; }
function credentialRef() { var bytes = new Uint8Array(12); crypto.getRandomValues(bytes); return 'cred-' + bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 16); }
function storageGet(key) { return new Promise(function (resolve) { chrome.storage.local.get([key], function (result) { resolve(result && result[key] || null); }); }); }
function storageSet(value) { return new Promise(function (resolve, reject) { chrome.storage.local.set(value, function () { var error = chrome.runtime.lastError; if (error) { reject(new Error(error.message)); } else { resolve(true); } }); }); }

/** Mã hóa ngay trên Extension; GAS chỉ nhận ciphertext và metadata cần cho việc hiển thị. */
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
          return { ok: true, credentialRef: ref, envelope: envelope, public: { usernameHint: username, database: String(value.database || ''), unit: String(value.unit || ''), language: String(value.language || 'v') } };
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
function readCredentialMetadata(ref) {
  return readCredential(ref).then(function (credentials) {
    return { ok: true, username: String(credentials && credentials.username || '') };
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
  if (reply && reply.error) { return { ok: false, status: 599, code: String(reply.code || 'FBM_TRANSPORT_UNAVAILABLE'), body: String(reply.error), transport: { trace: reply.trace || [] } }; }
  return reply;
}

/** Gọi Web App relay và đọc kết quả handoff mà không ghi payload vào log. */
// GAS Web App có thể mất hơn 15 giây khi cold start hoặc đang chờ Spreadsheet lock.
// Giữ giới hạn hữu hạn để alarm không treo vô hạn, nhưng đủ rộng cho redirect /exec.
var GAS_RELAY_TIMEOUT_MS = 30000;
// Lời gọi nộp response của một envelope chờ theo `meta.gasReplyMs` GAS ghi trong envelope đó, vì GAS có thể đang xử lý cả một lô; hạn trên chỉ cho lời gọi chưa gắn envelope (xin request heartbeat).
function relayTimeoutFor(request) { return Number(request && request.meta && request.meta.gasReplyMs || 0) || GAS_RELAY_TIMEOUT_MS; }
var relayConfigureFlight = null;

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

function postRelay(url, key, body, timeoutMs) {
  var limitMs = Number(timeoutMs || 0) || GAS_RELAY_TIMEOUT_MS;
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, limitMs) : null;
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
    var message = timeout ? 'GAS relay không trả lời sau ' + limitMs + ' ms.' : String(error && error.message || error || 'Lỗi fetch GAS relay.');
    noteRelayStatus({ stage: 'failed', requestSentAt: requestSentAt, ok: false, code: timeout ? 'RELAY_TIMEOUT' : 'RELAY_FETCH_FAILED', error: message });
    throw new Error(message);
  }).finally(function () { if (timer) { clearTimeout(timer); } });
}

var fbmHeartbeatFlight = null;

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
  }, relayTimeoutFor(request));
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
      if (!gasRequest || gasRequest.ok !== true) {
        var requestCode = String(gasRequest && gasRequest.code || 'HEARTBEAT_REQUEST_NOT_READY');
        noteHeartbeatStatus('blocked_gas_request', { source: origin, code: requestCode, error: String(gasRequest && (gasRequest.error || gasRequest.message) || 'GAS chưa cấp request heartbeat.').slice(0, 240) });
        return Object.assign({}, gasRequest || {}, { ok: false, code: requestCode, error: String(gasRequest && (gasRequest.error || gasRequest.message) || 'GAS chưa cấp request heartbeat.') });
      }
      if (!gasRequest.request) {
        noteHeartbeatStatus('gas_noop', { source: origin, code: String(gasRequest.code || 'HEARTBEAT_NOOP') });
        return gasRequest;
      }
      return ensureFbmTab(gasRequest.request).then(function (tab) {
        if (!tab) {
          noteHeartbeatStatus('blocked_tab', { source: origin, code: 'FBM_TAB_NOT_FOUND' });
          return relayHeartbeatTransportFailure(config, gasRequest.request, 'FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM đang mở.').then(function (gasReply) {
            if (gasReply && gasReply.request) { return relayScheduledRequests(null, config, gasReply, 0); }
            return Object.assign({}, gasReply || {}, { ok: false, code: 'FBM_TAB_NOT_FOUND', error: 'Không tìm thấy tab FBM đang mở.' });
          });
        }
        noteHeartbeatStatus('fbm_request_sent', { source: origin, tabId: Number(tab.id || 0) });
        return sendToFbmTab(tab.id, gasRequest.request).then(function (reply) {
          if (reply && reply.error) {
            return relayHeartbeatTransportFailure(config, gasRequest.request, reply.code || 'FBM_TRANSPORT_UNAVAILABLE', reply.error).then(function (gasReply) {
              if (gasReply && gasReply.request) { return relayScheduledRequests(null, config, gasReply, 0); }
              return Object.assign({}, gasReply || {}, { ok: false, code: String(reply.code || 'FBM_TRANSPORT_UNAVAILABLE'), error: String(reply.error) });
            });
          }
          var raw = rawFbmReply(reply) || {};
          noteHeartbeatStatus('fbm_response_received', { source: origin, tabId: Number(tab.id || 0), ok: raw.ok === true, httpStatus: Number(raw.status || 0), responseLength: String(raw.body || '').length, error: String(raw.error || '').slice(0, 240) });
          return relayHeartbeatToGas(tab.id, reply, 1, gasRequest.request).then(function (gasReply) {
            noteHeartbeatStatus('gas_response_received', { source: origin, ok: !!(gasReply && gasReply.ok), code: String(gasReply && gasReply.code || '') });
            return gasReply && gasReply.ok === false ? Object.assign({ ok: false }, gasReply) : { ok: true, gas: gasReply || null };
          });
        }).catch(function (error) {
          return relayHeartbeatTransportFailure(config, gasRequest.request, 'FBM_TRANSPORT_UNAVAILABLE', error && error.message || error).then(function (gasReply) {
            if (gasReply && gasReply.request) { return relayScheduledRequests(null, config, gasReply, 0); }
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

/**
 * Đo trần đường truyền gói lớn bằng gói đệm vô nghĩa, không chạm FBM: `sidebar` trả gói về Sidebar để Sidebar gửi GAS (đường lượt chạy tay), `relay` gửi gói thẳng lên Web App (đường lượt nền).
 * Chỉ trả về thời gian và câu trả lời của GAS, không trả lại gói.
 */
function fbmTransportProbe(message) {
  var sizeBytes = Math.max(0, Math.round(Number(message && message.sizeBytes || 0))), startedAt = Date.now();
  var padding = new Array(sizeBytes + 1).join('x');
  if (message && message.route === 'sidebar') { return Promise.resolve({ ok: true, padding: padding, buildMs: Date.now() - startedAt }); }
  return getRelayConfig().then(function (config) {
    if (!config) { return { ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Extension chưa có cấu hình relay của file này.' }; }
    var sentAt = Date.now();
    return postRelay(config.url, config.key, { kind: 'transport_probe', spreadsheetId: config.spreadsheetId, sizeBytes: sizeBytes, padding: padding }, Number(message.timeoutMs || 0)).then(function (reply) {
      return { ok: !!reply && reply.ok !== false, ms: Date.now() - sentAt, code: reply && reply.code || '', error: reply && reply.error || '', receivedBytes: reply && reply.receivedBytes || 0 };
    });
  }).catch(function (error) { return { ok: false, code: 'RELAY_FETCH_FAILED', error: String(error && error.message || error), ms: Date.now() - startedAt }; });
}

/** Đọc một relay config duy nhất; thiếu config thì không được chạm tab FBM. */
function getRelayConfig() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) { return Promise.resolve(null); }
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId', 'fbmPollMinutes', 'fbmRunOnStartup'], function (config) {
      var url = normalizeRelayUrl(config && config.fbmWebAppUrl);
      var key = config && String(config.fbmSyncKey || '').trim();
      var spreadsheetId = config && String(config.fbmSpreadsheetId || '').trim();
      var extension = { pollMinutes: Math.max(1, Math.min(60, Math.round(Number(config && config.fbmPollMinutes || 5)))), runOnStartup: config && config.fbmRunOnStartup !== false };
      resolve(url && key ? { url: url, key: key, spreadsheetId: spreadsheetId, extension: extension } : null);
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

/** So cấu hình kỹ thuật đã lưu; không gọi Web App khi Sidebar mở. */
function relayConfigAlreadyConfirmed(config) {
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId', 'fbmPollMinutes', 'fbmRunOnStartup'], function (saved) {
      resolve(
        normalizeRelayUrl(saved && saved.fbmWebAppUrl) === normalizeRelayUrl(config && config.url) &&
        String(saved && saved.fbmSyncKey || '') === String(config && config.key || '') &&
        String(saved && saved.fbmSpreadsheetId || '') === String(config && config.spreadsheetId || '') &&
        Number(saved && saved.fbmPollMinutes || 5) === Number(config && config.extension && config.extension.pollMinutes || 5) &&
        (saved && saved.fbmRunOnStartup !== false) === (config && config.extension && config.extension.runOnStartup !== false)
      );
    });
  });
}

/** Sidebar chỉ truyền địa chỉ relay một lần; Extension chỉ kiểm tra cấu trúc rồi lưu local. */
function configureRelay(config) {
  var value = config || {}, url = normalizeRelayUrl(value.url), key = String(value.key || '').trim(), spreadsheetId = String(value.spreadsheetId || '').trim();
  if (!url || !key || !spreadsheetId) { return Promise.resolve({ ok: false, code: 'RELAY_CONFIG_INVALID', error: 'Cấu hình relay thiếu URL Web App hợp lệ, khóa hoặc Spreadsheet ID.' }); }
  if (relayConfigureFlight) { return relayConfigureFlight; }
  var extension = value.extension && typeof value.extension === 'object' ? value.extension : {};
  var normalized = { url: url, key: key, spreadsheetId: spreadsheetId, extension: { pollMinutes: Math.max(1, Math.min(60, Math.round(Number(extension.pollMinutes || 5)))), runOnStartup: extension.runOnStartup !== false } };
  relayConfigureFlight = relayConfigAlreadyConfirmed(normalized).then(function (confirmed) {
    if (confirmed) {
      scheduleGasPoll(normalized.extension);
      return { ok: true, code: 'RELAY_CONFIG_UNCHANGED' };
    }
    return new Promise(function (resolve) {
      chrome.storage.local.set({ fbmWebAppUrl: url, fbmSyncKey: key, fbmSpreadsheetId: spreadsheetId, fbmPollMinutes: normalized.extension.pollMinutes, fbmRunOnStartup: normalized.extension.runOnStartup }, function () {
        var error = chrome.runtime.lastError;
        if (error) { resolve({ ok: false, code: 'RELAY_CONFIG_SAVE_FAILED', error: error.message }); return; }
        scheduleGasPoll(normalized.extension);
        resolve({ ok: true, code: 'RELAY_CONFIG_SAVED' });
      });
    });
  }).catch(function (error) { return { ok: false, code: 'RELAY_CONFIG_SAVE_FAILED', error: String(error && error.message || error) }; }).finally(function () { relayConfigureFlight = null; });
  return relayConfigureFlight;
}

/**
 * Chuyển các request tiếp theo của cursor nền qua cổng continuation chung.
 * Lượt đầu vẫn là heartbeat; từ response kế tiếp, GAS đã chuyển sang một
 * phiên quét nền và phải nhận lại bằng đúng kênh `background_sync`.
 */
function relayScheduledRequests(tabId, config, gasReply, count) {
  var next = gasReply && gasReply.request, used = Number(count || 0);
  if (!next || !config || !config.url || !config.key) { return Promise.resolve(gasReply); }
  function reportFailure(code, message) {
    return postRelay(config.url, config.key, {
      kind: 'background_sync',
      command: 'transport_failure',
      payload: { requestId: next.id, code: String(code || 'FBM_TRANSPORT_UNAVAILABLE'), message: String(message || 'Extension không gửi được request tới tab FBM.').slice(0, 240) },
      spreadsheetId: config.spreadsheetId,
      hop: used + 1
    }, relayTimeoutFor(next)).then(function (failureReply) {
      return relayScheduledRequests(null, config, failureReply, used + 1);
    }).catch(function (relayError) {
      var relayMessage = String(relayError && relayError.message || relayError || 'Không thể báo lỗi transport lên GAS.').slice(0, 240);
      noteRelayStatus({ stage: 'failed', ok: false, code: 'GAS_RELAY_FAILED', error: relayMessage });
      return { ok: false, code: 'GAS_RELAY_FAILED', error: relayMessage, request: null };
    });
  }
  return ensureFbmTab(next).then(function (tab) {
    if (!tab) { return reportFailure('FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM đang mở.'); }
    return sendToFbmTab(tab.id, next).then(function (reply) {
      if (reply && reply.error) { return reportFailure(reply.code || 'FBM_TRANSPORT_UNAVAILABLE', reply.error); }
      var raw = rawFbmReply(reply);
      return postRelay(config.url, config.key, {
        kind: 'background_sync',
        command: 'continue',
        payload: { response: raw },
        spreadsheetId: config.spreadsheetId,
        hop: used + 1
      }, relayTimeoutFor(next)).then(function (nextReply) { return relayScheduledRequests(null, config, nextReply, used + 1); }).catch(function (error) {
        return reportFailure('FBM_TRANSPORT_UNAVAILABLE', error && error.message || error);
      });
    });
  }).catch(function (error) {
    return reportFailure('FBM_TRANSPORT_UNAVAILABLE', error && error.message || error);
  });
}

/** Nộp heartbeat cho GAS và chạy tiếp các request đọc scheduler trả về. */
function relayHeartbeatToGas(tabId, reply, hop, request) {
  return getRelayConfig().then(function (config) {
    if (!config) {
      noteRelayStatus({ ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu URL hoặc khóa Web App GAS.' });
      return null;
    }
    return postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply), hop: Number(hop || 1) }, relayTimeoutFor(request)).then(function (gasReply) {
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
    if (!String(message.credentialRef || '').trim()) { sendResponse({ ok: false, code: 'LOGIN_CREDENTIAL_REF_REQUIRED', error: 'Thiếu mã tham chiếu thông tin đăng nhập.' }); return false; }
    chrome.storage.local.remove([clearKey], function () { var error = chrome.runtime.lastError; sendResponse(error ? { ok: false, code: 'LOGIN_CREDENTIAL_CLEAR_FAILED', error: String(error.message || error) } : { ok: true, credentialRef: String(message.credentialRef || '') }); });
    return true;
  }
  if (message && message.type === 'FBM_GET_CREDENTIAL_METADATA') {
    readCredentialMetadata(message.credentialRef).then(sendResponse).catch(function (error) { sendResponse({ ok: false, code: 'LOGIN_METADATA_READ_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_CONFIGURE_RELAY') {
    var config = message.config || {};
    if (!chrome.storage || !chrome.storage.local) { sendResponse({ ok: false, error: 'Extension không có kho cấu hình.' }); return false; }
    configureRelay(config).then(sendResponse);
    return true;
  }
  if (message && message.type === 'FBM_CANCEL_BATCH') {
    sendResponse(fbmCancelBatch());
    return false;
  }
  if (message && message.type === 'FBM_TRANSPORT_PROBE') {
    fbmTransportProbe(message).then(sendResponse);
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
    existingFlight.then(sendResponse, function (err) { sendResponse({ error: String(err && err.message || err), code: String(err && err.code || 'FBM_TRANSPORT_UNAVAILABLE') }); });
    return true;
  }
  var flight = ensureFbmTab(message.request).then(function (tab) {
    if (!tab) { return addWorkerTrace({ error: 'Không tìm thấy tab FBM đang mở.', code: 'FBM_TAB_NOT_FOUND' }, message.request, 'fbm_tab_not_found'); }
    return sendToFbmTab(tab.id, message.request).then(function (reply) { return addWorkerTrace(addWorkerTrace(reply, message.request, 'worker_received'), message.request, 'fbm_tab_found'); });
  });
  if (requestId) {
    fbmRequestFlights[requestId] = flight;
    flight.then(function () { delete fbmRequestFlights[requestId]; }, function () { delete fbmRequestFlights[requestId]; });
  }
  flight.then(sendResponse, function (err) { sendResponse({ error: String(err && err.message || err), code: String(err && err.code || 'FBM_TRANSPORT_UNAVAILABLE') }); });
  return true;
});

/** Khôi phục alarm khi Extension cài mới; Chrome startup có thể hỏi GAS một lượt. */
chrome.runtime.onInstalled.addListener(restoreHeartbeatSchedule);
chrome.runtime.onStartup.addListener(function () {
  restoreHeartbeatSchedule();
  getRelayConfig().then(function (config) {
    if (config && config.extension && config.extension.runOnStartup === true) { return fbmHeartbeatNow('startup'); }
    return null;
  }).catch(function (error) { console.warn('Không hỏi GAS được ở startup:', error); });
});
restoreHeartbeatSchedule();
recoverSheetsBridges();
/** Gửi request đọc tối thiểu; không gửi thao tác ghi từ alarm. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== GAS_POLL_ALARM) { return; }
  fbmHeartbeatNow('alarm').then(function (result) { if (!result || result.ok !== true) { console.warn('Heartbeat FBM không chạy:', result); } });
});

