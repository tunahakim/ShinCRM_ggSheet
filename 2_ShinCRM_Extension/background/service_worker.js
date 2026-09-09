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
    return sendTabMessage(tabId, { type: 'FBM_EXECUTE', request: request }, 15000);
  });
}

/** Nộp heartbeat cho GAS khi đã cấu hình Web App; thiếu cấu hình thì chỉ giữ phiên FBM. */
function relayHeartbeatToGas(reply) {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) { return Promise.resolve(null); }
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey'], function (config) {
      var url = config && String(config.fbmWebAppUrl || '').trim(), key = config && String(config.fbmSyncKey || '').trim();
      if (!url || !key) { resolve(null); return; }
      fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ key: key, kind: 'heartbeat', response: reply && reply.result !== undefined ? reply.result : reply }) }).then(function () { resolve(null); }, function (error) { console.warn('Không relay được heartbeat cho GAS:', error); resolve(null); });
    });
  });
}

/** Định tuyến request từ Sidebar tới đúng tab FBM, không xử lý dữ liệu nghiệp vụ. */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (message && message.type === 'FBM_CONFIGURE_RELAY') {
    var config = message.config || {};
    if (!chrome.storage || !chrome.storage.local) { sendResponse({ ok: false, error: 'Extension không có kho cấu hình.' }); return false; }
    chrome.storage.local.set({ fbmWebAppUrl: String(config.url || ''), fbmSyncKey: String(config.key || '') }, function () { sendResponse({ ok: true }); });
    return true;
  }
  if (!message || message.type !== 'FBM_EXECUTE_REQUEST') { return false; }
  findFbmTab().then(function (tab) {
    if (!tab) { sendResponse({ error: 'Không tìm thấy tab FBM đang mở.' }); return; }
    return sendToFbmTab(tab.id, message.request).then(sendResponse);
  }).catch(function (err) { sendResponse({ error: String(err && err.message || err) }); });
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
  findFbmTab().then(function (tab) { if (tab) { return sendToFbmTab(tab.id, null).then(relayHeartbeatToGas); } return null; }).catch(function (error) { console.warn('Heartbeat FBM thất bại:', error); });
});

