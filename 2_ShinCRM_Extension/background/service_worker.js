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

/** Tự nạp executor khi tab FBM đã mở trước lúc Extension được tải lại. */
function sendToFbmTab(tabId, request) {
  return new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, { type: 'FBM_EXECUTE', request: request }, function (reply) {
      var error = chrome.runtime.lastError;
      if (!error) { resolve(reply || { error: 'Tab FBM không trả kết quả.' }); return; }
      if (!/Receiving end does not exist/i.test(error.message || '')) { resolve({ error: error.message }); return; }
      chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/fbm_sync/executor.js'] }).then(function () {
        chrome.tabs.sendMessage(tabId, { type: 'FBM_EXECUTE', request: request }, function (retryReply) {
          var retryError = chrome.runtime.lastError;
          resolve(retryError ? { error: retryError.message } : (retryReply || { error: 'Tab FBM không trả kết quả.' }));
        });
      }).catch(function (injectError) { resolve({ error: 'Không nạp được cầu nối vào tab FBM: ' + String(injectError && injectError.message || injectError) }); });
    });
  });
}

/** Định tuyến request từ Sidebar tới đúng tab FBM, không xử lý dữ liệu nghiệp vụ. */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
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
/** Gửi request đọc tối thiểu; không gửi thao tác ghi từ alarm. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== 'fbm-heartbeat') { return; }
  findFbmTab().then(function (tab) { if (tab) { return sendToFbmTab(tab.id, null); } });
});

