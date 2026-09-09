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

/** Định tuyến request từ Sidebar tới đúng tab FBM, không xử lý dữ liệu nghiệp vụ. */
chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
  if (!message || message.type !== 'FBM_EXECUTE_REQUEST') { return false; }
  findFbmTab().then(function (tab) {
    if (!tab) { sendResponse({ error: 'Không tìm thấy tab FBM đang mở.' }); return; }
    chrome.tabs.sendMessage(tab.id, { type: 'FBM_EXECUTE', request: message.request }, function (reply) {
      var error = chrome.runtime.lastError;
      sendResponse(error ? { error: error.message } : (reply || { error: 'Tab FBM không trả kết quả.' }));
    });
  }).catch(function (err) { sendResponse({ error: String(err && err.message || err) }); });
  return true;
});

/** Khởi tạo heartbeat khi Extension cài mới hoặc Chrome khởi động. */
chrome.runtime.onInstalled.addListener(function () { chrome.alarms.create('fbm-heartbeat', { periodInMinutes: 5 }); });
chrome.runtime.onStartup.addListener(function () { chrome.alarms.create('fbm-heartbeat', { periodInMinutes: 5 }); });
chrome.alarms.create('fbm-heartbeat', { periodInMinutes: 5 });
/** Gửi request đọc tối thiểu; không gửi thao tác ghi từ alarm. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== 'fbm-heartbeat') { return; }
  findFbmTab().then(function (tab) { if (tab) { chrome.tabs.sendMessage(tab.id, { type: 'FBM_EXECUTE', request: null }, function () { void chrome.runtime.lastError; }); } });
});

