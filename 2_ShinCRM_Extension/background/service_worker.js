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

/**
 * Giữ service worker sống trong lúc chờ: Chrome tắt worker rảnh khoảng 30 giây, hẹn giờ đang chờ không tính là bận, chỉ lời gọi API Extension mới tính. Thiếu cái này thì worker chết giữa lúc chờ tab và request GAS phát ra mất hẳn, không ai báo lỗi.
 * Mọi lời chờ của worker phải đi qua `workerKeepAlive` (trực tiếp hoặc qua `waitUntil`); test tĩnh chặn chỗ chờ mới đi đường khác.
 */
var WORKER_KEEPALIVE_MS = 20000;
var workerBusyCount = 0, workerKeepAliveTimer = null;
function workerKeepAliveTick() {
  workerKeepAliveTimer = null;
  if (workerBusyCount <= 0) { return; }
  if (chrome.runtime && typeof chrome.runtime.getPlatformInfo === 'function') { chrome.runtime.getPlatformInfo(function () { return chrome.runtime.lastError; }); }
  workerKeepAliveTimer = setTimeout(workerKeepAliveTick, WORKER_KEEPALIVE_MS);
}
function workerKeepAlive(promise) {
  workerBusyCount += 1;
  if (!workerKeepAliveTimer) { workerKeepAliveTimer = setTimeout(workerKeepAliveTick, WORKER_KEEPALIVE_MS); }
  return Promise.resolve(promise).finally(function () {
    workerBusyCount -= 1;
    if (workerBusyCount <= 0 && workerKeepAliveTimer) { clearTimeout(workerKeepAliveTimer); workerKeepAliveTimer = null; }
  });
}
/** Công cụ chờ duy nhất có hạn chót: quá `deadlineAt` thì từ chối bằng lỗi mang mã `code`, không bao giờ chờ vô hạn. */
function waitUntil(promise, deadlineAt, code, message) {
  var timer = null;
  var expired = new Promise(function (resolve, reject) {
    timer = setTimeout(function () { reject(Object.assign(new Error(String(message || 'Extension chờ quá hạn.')), { code: String(code || 'FBM_TRANSPORT_TIMEOUT') })); }, Math.max(0, Number(deadlineAt || 0) - Date.now()));
  });
  return workerKeepAlive(Promise.race([Promise.resolve(promise), expired]).finally(function () { clearTimeout(timer); }));
}
/** Gọi Chrome API dùng được cả kiểu callback lẫn kiểu Promise, đọc `lastError` ở một chỗ; không gọi API hai lần. */
function chromeApi(invoke) {
  return new Promise(function (resolve, reject) {
    var settled = false;
    function done(value) {
      if (settled) { return; }
      settled = true;
      var error = chrome.runtime && chrome.runtime.lastError;
      if (error) { reject(new Error(String(error.message || error))); } else { resolve(value); }
    }
    function fail(error) { if (settled) { return; } settled = true; reject(error); }
    try {
      var result = invoke(done);
      if (result && typeof result.then === 'function') { result.then(function (value) { if (!settled) { settled = true; resolve(value); } }, fail); }
    } catch (error) { fail(error); }
  });
}

/** Miền FBM duy nhất Extension được chạm. Mọi URL trong envelope (request, lô, trang mở tab, trang tải lại, trang sau đăng nhập) qua đúng một phép kiểm `envelopeSiteCheck` trước khi tìm tab. */
var FBM_SITE = 'https://fbo.com.vn:8888/';
function envelopeSiteCheck(request) {
  var meta = request && request.meta || {}, urls = [request && request.url].concat((request && Array.isArray(request.items) ? request.items : []).map(function (item) { return item && item.url; }), [meta.openFbmContext && meta.openFbmContext.url, meta.reloadFbmPage, meta.afterLoginUrl]);
  var outside = urls.filter(function (url) { return url !== undefined && url !== null && url !== '' && String(url).indexOf(FBM_SITE) !== 0; });
  if (!outside.length) { return null; }
  var error = new Error('Envelope mang địa chỉ ngoài miền FBM; Extension không mở và không gửi.');
  error.code = 'FBM_URL_OUTSIDE_SITE';
  return error;
}
/** Tìm tab FBM đang đăng nhập để content script thực hiện fetch cùng cookie. */
function findFbmTab() {
  return chrome.tabs.query({ url: [FBM_SITE + '*'] }).then(function (tabs) { return tabs && tabs.length ? tabs[0] : null; });
}
/**
 * Chờ tab tải xong trong hạn. `start` (nếu có) chạy sau khi đã gắn listener, nên lệnh đổi trang không thể xong trước khi kịp nghe.
 * Không có `start` thì hỏi lại trạng thái tab sau khi gắn listener, vì tab có thể đã tải xong giữa lúc tìm và lúc nghe.
 */
function waitFbmTabComplete(tabId, deadlineAt, start) {
  var listener = null;
  var completed = new Promise(function (resolve, reject) {
    listener = function (updatedTabId, changeInfo, updatedTab) {
      if (Number(updatedTabId) === Number(tabId) && (!changeInfo || changeInfo.status === 'complete')) { resolve(updatedTab || { id: tabId, status: 'complete' }); }
    };
    chrome.tabs.onUpdated.addListener(listener);
    var begun = start ? Promise.resolve().then(start) : (typeof chrome.tabs.get === 'function' ? chromeApi(function (done) { return chrome.tabs.get(tabId, done); }) : Promise.resolve(null));
    begun.then(function (tab) { if (!start && tab && String(tab.status || '') === 'complete' && !tab.discarded) { resolve(tab); } }, reject);
  });
  return waitUntil(completed, deadlineAt, 'FBM_TAB_NOT_READY', 'Tab FBM chưa tải xong trong thời gian an toàn.').finally(function () {
    if (typeof chrome.tabs.onUpdated.removeListener === 'function') { chrome.tabs.onUpdated.removeListener(listener); }
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
/** Tìm tab FBM; chỉ mở tab mới khi GAS cấp `openFbmContext`, và chỉ mở đúng URL GAS cấp. */
function findOrOpenFbmTab(request) {
  return findFbmTab().then(function (tab) {
    if (tab) { return tab; }
    var instruction = request && request.meta && request.meta.openFbmContext;
    if (!instruction || !instruction.url || !chrome.tabs || typeof chrome.tabs.create !== 'function') { return null; }
    return chromeApi(function (done) { return chrome.tabs.create({ url: String(instruction.url), active: instruction.active === true }, done); }).then(function (created) { return created || null; });
  });
}
/** Tab đang tải thì chờ tải xong; tab Chrome đã dỡ (discarded) không bao giờ tự tải nên coi là chưa sẵn sàng ngay; sau đó phải có executor đúng phiên bản. */
function readyFbmTab(tab, deadlineAt) {
  var status = String(tab && tab.status || 'complete');
  if (tab.discarded || status === 'unloaded') { return Promise.reject(Object.assign(new Error('Tab FBM đang bị Chrome tạm dỡ.'), { code: 'FBM_TAB_NOT_READY' })); }
  var loaded = status === 'complete' ? Promise.resolve(tab) : waitFbmTabComplete(tab.id, deadlineAt);
  return loaded.then(function (current) {
    var readyTab = Object.assign({}, tab, current || {});
    return ensureFbmExecutor(tab.id, deadlineAt).then(function () { return readyTab; });
  });
}
/** Chrome không được tự dỡ tab FBM khi máy thiếu RAM hay tab nằm nền lâu; tab đã đánh dấu thì không gọi lại. */
function keepFbmTabLoaded(tab) {
  if (tab.autoDiscardable === false || typeof chrome.tabs.update !== 'function') { return Promise.resolve(tab); }
  return chromeApi(function (done) { return chrome.tabs.update(tab.id, { autoDiscardable: false }, done); }).then(function () { return tab; });
}
/**
 * Công cụ duy nhất đưa tab FBM tới trạng thái nhận được request (Tài liệu 09/01 "Chuẩn bị tab FBM"): tìm hoặc mở tab, đánh dấu không cho Chrome dỡ, chờ tải xong và có executor.
 * Extension không tự tải lại tab: hỏng thì trả nguyên mã lỗi (`FBM_TAB_NOT_READY`, `FBM_SITE_ACCESS_BLOCKED`) để GAS quyết; GAS muốn tải lại thì cấp `meta.reloadFbmPage` ở envelope phát lại.
 * Trả null khi không có tab và GAS không cho mở; nơi gọi báo `FBM_TAB_NOT_FOUND`. `onStage(stage, code)` để nơi gọi ghi hộp đen trước mỗi bước.
 */
function prepareFbmTab(request, onStage) {
  var deadlineAt = envelopeDeadline(request), note = typeof onStage === 'function' ? onStage : function () {};
  return findOrOpenFbmTab(request).then(function (tab) {
    if (!tab) { return null; }
    note('fbm_tab_preparing', String(tab.discarded ? 'discarded' : tab.status || 'complete'));
    return keepFbmTabLoaded(tab).then(function () { return openFbmPageIfAsked(tab, request, deadlineAt, note); });
  }).catch(function (error) { return siteAccessCheck(FBM_SITE_ORIGINS, 'FBM_SITE_ACCESS_BLOCKED', error); });
}
/**
 * GAS cấp `meta.reloadFbmPage` khi tab không sẵn sàng ở lần gửi trước, hoặc trang đang mở không có mã hoặc tên người dùng để đối chiếu (tab đứng ở trang Login, trang lỗi hay trang tải từ trước khi đăng nhập). Extension chỉ đổi trang tới đúng URL đó, chờ tải xong và có executor; không tự quyết khi nào cần.
 * Đổi trang cũng nạp lại tab Chrome đã dỡ hay tab treo, nên không xét trạng thái tab trước. URL đã qua `envelopeSiteCheck` trước khi tìm tab.
 */
function openFbmPageIfAsked(tab, request, deadlineAt, note) {
  var url = String(request && request.meta && request.meta.reloadFbmPage || '');
  if (!url) { return readyFbmTab(tab, deadlineAt); }
  note('fbm_page_reloading');
  return waitFbmTabComplete(tab.id, deadlineAt, function () {
    return chromeApi(function (done) { return chrome.tabs.update(tab.id, { url: url }, done); });
  }).then(function (loaded) {
    return readyFbmTab(Object.assign({}, tab, loaded || {}, { id: tab.id, status: 'complete', discarded: false }), deadlineAt);
  });
}
/** Executor nạp từ cùng gói Extension nên mang đúng số bản trong manifest; ping trả số khác là bản cũ còn sót trong tab, phải nạp lại. */
var FBM_EXECUTOR_VERSION = chrome.runtime.getManifest().version;
// Mã phiên bản hợp đồng GAS–Extension (tests/contracts/gasExtensionContract.js). Chỉ trả về cho GAS; GAS quyết định dừng khi lệch mã.
var FBM_CONTRACT_VERSION = 'e5ec480fccd9';

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
      var minutes = Math.round(Number(extensionConfig && extensionConfig.pollMinutes));
      if (!(minutes >= 1 && minutes <= 60)) { alarmFailure('ALARM_MINUTES_INVALID', new Error('Nhịp hỏi GAS không hợp lệ: ' + String(extensionConfig && extensionConfig.pollMinutes))); return; }
      if (gasPollAlarmKnown && gasPollAlarmMinutes === minutes) { return; }
      var create = function () {
        gasPollAlarmKnown = true;
        gasPollAlarmMinutes = minutes;
        var result = chrome.alarms.create(GAS_POLL_ALARM, { periodInMinutes: minutes });
        if (result && typeof result.catch === 'function') { result.catch(function (err) { alarmFailure('ALARM_CREATE_FAILED', err); }); }
      };
      if (typeof chrome.alarms.get !== 'function') { create(); return; }
      chrome.alarms.get(GAS_POLL_ALARM, function (alarm) { if (!alarm || Number(alarm.periodInMinutes || 0) !== minutes) { create(); } else { gasPollAlarmKnown = true; gasPollAlarmMinutes = minutes; } });
    }
  } catch (err) {
    alarmFailure('ALARM_CREATE_FAILED', err);
  }
}
/** Lỗi đặt/dừng chuông hỏi GAS: ghi ô lỗi hộp đen để GAS ghi Log ở lần hỏi sau và báo ngay Sidebar đang mở. */
function alarmFailure(code, error) {
  var failure = Object.assign(new Error(String(error && error.message || error)), { code: code });
  noteExtensionFailure('alarm', failure, 1);
  extensionFailureForward(code, 'Extension không đặt được nhịp hỏi GAS: ' + failure.message);
}

/** Alarm là nhịp kỹ thuật; GAS quyết định mỗi nhịp có cấp việc hay không. */
function stopGasPoll() {
  try {
    gasPollAlarmKnown = false;
    gasPollAlarmMinutes = 0;
    if (chrome.alarms && chrome.alarms.clear) { return chrome.alarms.clear(GAS_POLL_ALARM); }
  } catch (err) {
    alarmFailure('ALARM_CLEAR_FAILED', err);
  }
  return undefined;
}

/**
 * Lệnh chuông GAS trả kèm mỗi lần hỏi: `{ minutes }` giữ chuông theo nhịp, `{ stop: true }` tắt chuông vì máy này không chạy nền. Cờ tắt giữ trong kho để worker khởi động lại (Chrome tắt worker rảnh) không tự bật lại chuông; chỉ mở trình duyệt, tải lại Extension, Sidebar đánh thức hoặc cấu hình mới mới xóa cờ (`pollReopen`) và hỏi GAS lại.
 */
var FBM_POLL_STOPPED_KEY = 'fbmPollStopped';
function pollApply(poll) {
  if (!poll) { return Promise.resolve(); }
  if (poll.stop) { return storageSet({ [FBM_POLL_STOPPED_KEY]: true }).then(function () { stopGasPoll(); }); }
  return storageSet({ [FBM_POLL_STOPPED_KEY]: false }).then(function () { scheduleGasPoll({ pollMinutes: poll.minutes }); });
}
function pollReopen() { return storageSet({ [FBM_POLL_STOPPED_KEY]: false }); }
/** Đặt lại chuông theo cấu hình đã lưu, trừ khi GAS đã bảo tắt. */
function restoreHeartbeatSchedule() {
  return Promise.all([getRelayConfig(), storageGet(FBM_POLL_STOPPED_KEY)]).then(function (read) {
    if (read[0] && read[1] !== true) { scheduleGasPoll(read[0].extension); } else { stopGasPoll(); }
  });
}

/** Gửi message có hạn chờ để worker không giữ kênh Sidebar vô thời hạn. */
function sendTabMessage(tabId, message, timeoutMs) {
  var replied = new Promise(function (resolve) {
    chrome.tabs.sendMessage(tabId, message, function (reply) {
      var error = chrome.runtime.lastError;
      resolve(error ? { error: error.message } : (reply || { error: 'Tab FBM không trả kết quả.' }));
    });
  });
  return waitUntil(replied, Date.now() + Math.max(0, Number(timeoutMs || 0)), 'FBM_TRANSPORT_TIMEOUT', 'Tab FBM không trả lời cầu nối.').catch(function (error) {
    return { error: String(error && error.message || error), code: String(error && error.code || 'FBM_TRANSPORT_TIMEOUT') };
  });
}

/**
 * Bước chạm một trang đã hỏng: hỏi Chrome Extension còn quyền với các trang đó không. Thiếu quyền thì ném lỗi `code` nêu tên trang; còn quyền thì ném lại lỗi gốc.
 * Chỉ hỏi khi đã hỏng nên đường chạy bình thường không tốn lần hỏi nào. Hỏi thẳng Chrome thay vì đoán qua chữ của lỗi: chữ đổi theo bản Chrome, và có cách chặn quyền không báo lỗi mà để bước chờ tới hết hạn.
 */
var FBM_SITE_ORIGINS = [FBM_SITE + '*'];
var RELAY_SITE_ORIGINS = ['https://script.google.com/macros/*', 'https://script.googleusercontent.com/macros/*'];
function siteAccessCheck(origins, code, error) {
  return chrome.permissions.contains({ origins: origins }).then(function (granted) {
    if (granted) { throw error; }
    throw Object.assign(new Error('Chrome đang chặn Extension truy cập ' + origins.join(', ') + ' (' + String(error && error.message || error) + '). Mở chrome://extensions → Chi tiết của Extension → Quyền truy cập trang web để cho phép lại.'), { code: code });
  });
}
/** Ping trước, chỉ nạp executor khi chưa có đầu nhận; mọi bước nằm trong hạn `deadlineAt` của envelope. */
var FBM_PING_MS = 1500;
function ensureFbmExecutor(tabId, deadlineAt) {
  function ping() { return sendTabMessage(tabId, { type: 'FBM_PING_V2' }, Math.min(FBM_PING_MS, Math.max(0, deadlineAt - Date.now()))); }
  return ping().then(function (reply) {
    if (reply && reply.ready && String(reply.version || '') === FBM_EXECUTOR_VERSION) { return reply; }
    return waitUntil(chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/fbm_sync/executor.js'] }), deadlineAt, 'FBM_TAB_NOT_READY', 'Không nạp được executor vào tab FBM trong thời gian an toàn.').then(ping).then(function (injectedReply) {
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
var SHEETS_BRIDGE_INJECT_MS = 10000;
function ensureSheetsBridge(tabId) {
  return sendTabMessage(tabId, { type: 'CRM_BRIDGE_PING' }, 1000).then(function (reply) {
    if (reply && reply.ready) { return reply; }
    var deadlineAt = Date.now() + SHEETS_BRIDGE_INJECT_MS;
    return waitUntil(chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/model/live_model_reader.js'], world: 'MAIN' }).then(function () {
      return chrome.scripting.executeScript({ target: { tabId: tabId }, files: ['content_scripts/bridge/iframe_bridge.js', 'content_scripts/scout/sheet_scout.js'] });
    }), deadlineAt, 'SHEETS_BRIDGE_NOT_READY', 'Không nạp được bridge Google Sheet trong thời gian an toàn.').then(function () {
      return sendTabMessage(tabId, { type: 'CRM_BRIDGE_PING' }, 1500);
    }).then(function (injectedReply) {
      if (!injectedReply || !injectedReply.ready) { throw new Error(injectedReply && injectedReply.error || 'Bridge Google Sheet không trả lời sau khi nạp.'); }
      return injectedReply;
    });
  });
}

/**
 * Khoảng nghỉ giữa hai request liên tiếp tới FBM (Tài liệu 09/07 "Tham số phiên FBM"): GAS cấp khoảng [minMs, maxMs] trong envelope, Extension chọn ngẫu nhiên và chỉ chờ phần còn thiếu tính từ lúc request FBM trước kết thúc.
 * Mốc chỉ sống trong RAM service worker: Chrome tắt worker khi rảnh khoảng 30 giây thì mất mốc, chấp nhận vì lúc đó đã nghỉ lâu. GAS chỉ cấp `requestGap` cho request gọi FBM, nên có khoảng nghỉ thì chờ và dời mốc, không cần biết loại request.
 */
var FBM_LAST_FETCH_END_AT = 0;
var FBM_REQUEST_GAP_CAP_MS = 60000;
function waitForFbmGap(request) {
  var gap = request && request.meta && request.meta.requestGap || {}, minMs = Math.max(0, Number(gap.minMs || 0)), maxMs = Math.max(minMs, Number(gap.maxMs || 0));
  if (!isFinite(maxMs) || maxMs <= 0 || !FBM_LAST_FETCH_END_AT) { return Promise.resolve(); }
  var waitMs = Math.min(FBM_REQUEST_GAP_CAP_MS, minMs + Math.random() * (maxMs - minMs)) - (Date.now() - FBM_LAST_FETCH_END_AT);
  if (waitMs <= 0) { return Promise.resolve(); }
  return workerKeepAlive(new Promise(function (resolve) {
    var timer = setTimeout(wake, Math.round(waitMs));
    function wake() { clearTimeout(timer); if (fbmGapWake === wake) { fbmGapWake = null; } resolve(); }
    fbmGapWake = wake;
  }));
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

/**
 * Tự phục hồi cầu nối ở tab Sheets đang mở; lỗi một tab không làm worker ngừng nhận message.
 * Đã cấu hình Sheet thì chỉ chạm tab của đúng Sheet đó: tab Sheet khác hay tab bị Chrome cho ngủ (discarded) không có Sidebar ShinCRM, phục hồi chúng chỉ sinh lỗi giả mỗi lần worker thức dậy.
 */
function recoverSheetsBridges() {
  return Promise.all([getRelayConfig(), chrome.tabs.query({ url: ['https://docs.google.com/*'] })]).then(function (found) {
    return Promise.all(sheetsBridgeTabs(found[1], found[0] && found[0].spreadsheetId).map(function (tab) {
      return ensureSheetsBridge(tab.id).catch(function (error) { return noteExtensionFailure('sheets_bridge', Object.assign(error || new Error('SHEETS_BRIDGE_NOT_READY'), { code: String(error && error.code || 'SHEETS_BRIDGE_NOT_READY') }), 1); });
    }));
  }).catch(function (error) { return noteExtensionFailure('sheets_bridge', Object.assign(error || new Error('SHEETS_TAB_QUERY_FAILED'), { code: 'SHEETS_TAB_QUERY_FAILED' }), 1); });
}
/** Tab Sheets cần cầu nối: tab đang thức, thuộc Sheet đã cấu hình (chưa cấu hình thì mọi Sheet, để Sidebar lần đầu gửi được cấu hình). */
function sheetsBridgeTabs(tabs, spreadsheetId) {
  var id = String(spreadsheetId || '');
  return (tabs || []).filter(function (tab) {
    var url = String(tab && tab.url || '');
    return !tab.discarded && /^https:\/\/docs\.google\.com\/spreadsheets\//i.test(url) && (!id || url.indexOf('/spreadsheets/d/' + id) >= 0);
  });
}

/** Gửi request nghiệp vụ (hoặc lô) đúng một lần tới tab đã qua `prepareFbmTab`. */
function sendToFbmTab(tabId, request) {
  if (!request || typeof request !== 'object') { return Promise.resolve({ error: 'GAS chưa cấp request FBM; đã chặn trước khi tìm tab.' }); }
  var envelope = request;
  if (Array.isArray(envelope.items)) { return executeBatch(tabId, envelope).then(stampContract); }
  return hydrateLoginRequest(request).then(function (readyRequest) {
    return sendTabExecute(tabId, readyRequest, envelope).then(function (reply) { return showFbmHomeAfterLogin(tabId, readyRequest, stampContract(reply), envelopeDeadline(envelope)); });
  });
}

/** Cửa duy nhất gửi request cho executor: nghỉ đủ khoảng cách với request FBM trước, rồi gửi trong phần hạn còn lại của envelope; hết hạn thì là lỗi transport, không chờ thêm. */
function sendTabExecute(tabId, request, envelope, cancelSince) {
  return waitForFbmGap(request).then(function () {
    if (fbmCancelledSince(cancelSince)) { return { cancelled: true }; }
    var remaining = envelopeRemainingMs(envelope);
    if (remaining <= 0) { return { error: 'Extension đã hết hạn chờ GAS cấp cho request này; tab FBM phản hồi quá chậm.', code: 'FBM_TRANSPORT_TIMEOUT' }; }
    return sendTabMessage(tabId, { type: 'FBM_EXECUTE_V2', request: request }, remaining).finally(function () {
      if (request.meta && request.meta.requestGap) { FBM_LAST_FETCH_END_AT = Date.now(); }
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

/**
 * Phong bì GAS mang mã hợp đồng của GAS; lệch mã với Extension đang chạy thì không chạm tab FBM (Extension cũ có thể hiểu sai phong bì mới). Lỗi có mã `EXTENSION_PROTOCOL_MISMATCH` đi về GAS như mọi lỗi gửi request, GAS ghi Log và Sidebar báo tải lại Extension.
 */
function envelopeContractCheck(request) {
  var received = String(request && request.contract || '');
  if (received === FBM_CONTRACT_VERSION) { return null; }
  var error = new Error('Extension đang dùng bản giao thức "' + FBM_CONTRACT_VERSION + '", GAS gửi bản "' + (received || 'không có') + '"; hãy tải lại Extension (chrome://extensions → ShinCRM → Tải lại).');
  error.code = 'EXTENSION_PROTOCOL_MISMATCH';
  return error;
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
function showFbmHomeAfterLogin(tabId, request, reply, deadlineAt) {
  var url = request && request.meta && request.meta.afterLoginUrl, result = reply && reply.result;
  if (!url || !result || !result.ok || (result.transport && result.transport.loginBlocked) || !chrome.tabs || typeof chrome.tabs.update !== 'function') { return Promise.resolve(reply); }
  return waitFbmTabComplete(tabId, deadlineAt === undefined ? envelopeDeadline(request) : deadlineAt, function () {
    return chromeApi(function (done) { return chrome.tabs.update(tabId, { url: String(url) }, done); });
  }).then(function () { return addWorkerTrace(reply, request, 'fbm_home_opened'); }, function (error) {
    // Đăng nhập đã thành công; chỉ ghi vết để GAS thấy, không đổi kết quả đăng nhập.
    return addWorkerTrace(reply, request, 'fbm_home_open_failed', { code: String(error && error.code || 'FBM_HOME_OPEN_FAILED') });
  });
}

var CREDENTIAL_VAULT_PREFIX = 'fbmCredentialVault:';
function bytesToBase64(bytes) { var text = ''; for (var i = 0; i < bytes.length; i += 1) { text += String.fromCharCode(bytes[i]); } return btoa(text); }
function base64ToBytes(value) { var text = atob(String(value || '')), bytes = new Uint8Array(text.length); for (var i = 0; i < text.length; i += 1) { bytes[i] = text.charCodeAt(i); } return bytes; }
function credentialRef() { var bytes = new Uint8Array(12); crypto.getRandomValues(bytes); return 'cred-' + bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 16); }
function storageGet(key) { return new Promise(function (resolve) { chrome.storage.local.get([key], function (result) { resolve(result && result[key] || null); }); }); }
/** Mã các khóa giải mã mật khẩu FBM Extension máy này đang giữ (chỉ mã, không có khóa): GAS cần biết để chỉ cho máy đăng nhập lại được FBM tự nhận chạy nền. */
function credentialRefsHeld() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(null, function (all) {
      resolve(Object.keys(all || {}).filter(function (key) { return key.indexOf(CREDENTIAL_VAULT_PREFIX) === 0; }).map(function (key) { return key.slice(CREDENTIAL_VAULT_PREFIX.length); }));
    });
  });
}
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

// Lời gọi xin request (ask) chờ hạn này; lời gọi nộp kết quả của một envelope chờ theo `meta.gasReplyMs` GAS ghi trong envelope đó, vì GAS có thể đang xử lý cả một lô. GAS Web App có thể mất hơn 15 giây khi cold start hoặc đang chờ khóa.
var GAS_RELAY_TIMEOUT_MS = 30000;
function relayTimeoutFor(request) { return Number(request && request.meta && request.meta.gasReplyMs || 0) || GAS_RELAY_TIMEOUT_MS; }
var relayConfigureFlight = null;

/** Một lần POST lên Web App relay: thân luôn mang khóa relay và mã hợp đồng. Trả JSON GAS viết; 404, trang HTML, hết giờ hay mạng hỏng thì ném lỗi mang mã thật và `httpStatus`, không bao giờ đổi thành `{ok:false}` như thể GAS đã trả lời. */
function postRelay(url, key, body, timeoutMs) {
  var limitMs = Number(timeoutMs || 0) || GAS_RELAY_TIMEOUT_MS;
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  var timer = controller ? setTimeout(function () { controller.abort(); }, limitMs) : null;
  return workerKeepAlive(fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, credentials: 'omit', redirect: 'follow', signal: controller && controller.signal, body: JSON.stringify(Object.assign({ key: key, contract: FBM_CONTRACT_VERSION }, body)) }).then(function (response) {
    return response.text().then(function (text) {
      var parsed = null;
      try { parsed = JSON.parse(text); } catch (notJson) {
        var notFound = response.status === 404, invalid = new Error(notFound ? 'GAS Web App không tồn tại ở URL đang lưu (HTTP 404).' : 'GAS relay trả về dữ liệu không phải JSON (HTTP ' + response.status + ').');
        invalid.code = notFound ? 'RELAY_ENDPOINT_NOT_FOUND' : 'RELAY_INVALID_JSON';
        invalid.httpStatus = response.status;
        throw invalid;
      }
      if (!response.ok && parsed && !parsed.error) { parsed.error = 'GAS relay HTTP ' + response.status; }
      return parsed;
    });
  }).catch(function (error) {
    if (error && (error.code === 'RELAY_ENDPOINT_NOT_FOUND' || error.code === 'RELAY_INVALID_JSON')) { throw error; }
    var timeout = error && error.name === 'AbortError', failure = new Error(timeout ? 'GAS relay không trả lời sau ' + limitMs + ' ms.' : String(error && error.message || error || 'Lỗi fetch GAS relay.'));
    failure.code = timeout ? 'RELAY_TIMEOUT' : 'RELAY_FETCH_FAILED';
    if (timeout) { throw failure; }
    return siteAccessCheck(RELAY_SITE_ORIGINS, 'RELAY_SITE_ACCESS_BLOCKED', failure);
  }).finally(function () { if (timer) { clearTimeout(timer); } }));
}

/**
 * Thế hệ cấu hình relay: tăng mỗi lần Extension chuyển sang Sheet khác. Chuỗi nền mang thế hệ lúc nó đọc cấu hình; lệch thế hệ nghĩa là Sheet đã đổi giữa chừng, chuỗi phải dừng chứ không được chạy tiếp cho Sheet cũ.
 * Chỉ sống trong RAM của worker là đủ: worker bị tắt thì chuỗi đang chạy cũng chết theo.
 */
var relayConfigGeneration = 0;

/** Đọc một relay config duy nhất; thiếu config thì không được chạm tab FBM. Thế hệ lấy trước khi đọc kho: cấu hình vừa đổi giữa lúc đọc thì chuỗi dừng thừa một lần, không bao giờ chạy theo cấu hình cũ. */
function getRelayConfig() {
  if (!chrome.storage || !chrome.storage.local || !chrome.storage.local.get) { return Promise.resolve(null); }
  var generation = relayConfigGeneration;
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId', 'fbmPollMinutes', 'fbmRunOnStartup'], function (config) {
      var url = normalizeRelayUrl(config && config.fbmWebAppUrl);
      var key = config && String(config.fbmSyncKey || '').trim();
      var spreadsheetId = config && String(config.fbmSpreadsheetId || '').trim();
      var extension = { pollMinutes: Math.max(1, Math.min(60, Math.round(Number(config && config.fbmPollMinutes || 5)))), runOnStartup: config && config.fbmRunOnStartup !== false };
      resolve(url && key ? { url: url, key: key, spreadsheetId: spreadsheetId, extension: extension, generation: generation } : null);
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

/** Đọc nguyên trạng cấu hình relay đã lưu. */
function relayConfigSaved() {
  return new Promise(function (resolve) {
    chrome.storage.local.get(['fbmWebAppUrl', 'fbmSyncKey', 'fbmSpreadsheetId', 'fbmPollMinutes', 'fbmRunOnStartup'], function (saved) { resolve(saved || {}); });
  });
}

/** So cấu hình kỹ thuật đã lưu; không gọi Web App khi Sidebar mở. */
function relayConfigMatches(saved, config) {
  return normalizeRelayUrl(saved.fbmWebAppUrl) === normalizeRelayUrl(config.url) &&
    String(saved.fbmSyncKey || '') === String(config.key || '') &&
    String(saved.fbmSpreadsheetId || '') === String(config.spreadsheetId || '') &&
    Number(saved.fbmPollMinutes || 5) === Number(config.extension.pollMinutes || 5) &&
    (saved.fbmRunOnStartup !== false) === (config.extension.runOnStartup !== false);
}

/**
 * Sidebar chỉ truyền địa chỉ relay; Extension kiểm tra cấu trúc rồi lưu local.
 * Extension giữ đúng một Sheet. Sidebar của Sheet khác chỉ thay được Sheet đang giữ khi mang `switchFrom` đúng Spreadsheet đang lưu, tức người dùng đã bấm xác nhận ở Sidebar; thiếu hoặc sai thì không lưu và trả Spreadsheet đang giữ để Sidebar hỏi. Mở nhầm Sheet vì vậy không tự kéo đồng bộ nền sang Sheet đó.
 */
function configureRelay(config) {
  var value = config || {}, url = normalizeRelayUrl(value.url), key = String(value.key || '').trim(), spreadsheetId = String(value.spreadsheetId || '').trim();
  if (!url || !key || !spreadsheetId) { return Promise.resolve({ ok: false, code: 'RELAY_CONFIG_INVALID', error: 'Cấu hình relay thiếu URL Web App hợp lệ, khóa hoặc Spreadsheet ID.' }); }
  if (relayConfigureFlight) { return relayConfigureFlight; }
  var extension = value.extension && typeof value.extension === 'object' ? value.extension : {};
  var normalized = { url: url, key: key, spreadsheetId: spreadsheetId, extension: { pollMinutes: Math.max(1, Math.min(60, Math.round(Number(extension.pollMinutes || 5)))), runOnStartup: extension.runOnStartup !== false } };
  relayConfigureFlight = relayConfigSaved().then(function (saved) {
    var currentSpreadsheetId = String(saved.fbmSpreadsheetId || '').trim(), switching = !!currentSpreadsheetId && currentSpreadsheetId !== spreadsheetId;
    if (switching && String(value.switchFrom || '').trim() !== currentSpreadsheetId) {
      return { ok: false, code: 'RELAY_SPREADSHEET_SWITCH_REQUIRED', currentSpreadsheetId: currentSpreadsheetId, error: 'Extension đang đồng bộ nền cho một Sheet khác; chỉ chuyển sang Sheet này khi người dùng xác nhận.' };
    }
    if (relayConfigMatches(saved, normalized)) {
      restoreHeartbeatSchedule();
      return { ok: true, code: 'RELAY_CONFIG_UNCHANGED' };
    }
    return new Promise(function (resolve) {
      chrome.storage.local.set({ fbmWebAppUrl: url, fbmSyncKey: key, fbmSpreadsheetId: spreadsheetId, fbmPollMinutes: normalized.extension.pollMinutes, fbmRunOnStartup: normalized.extension.runOnStartup }, function () {
        var error = chrome.runtime.lastError;
        if (error) { resolve({ ok: false, code: 'RELAY_CONFIG_SAVE_FAILED', error: error.message }); return; }
        if (switching) {
          // Hộp đen của chuỗi cũ (bước cuối và ô lỗi) thuộc Sheet cũ, không được mang lên GAS của Sheet mới.
          relayConfigGeneration += 1;
          chrome.storage.local.remove([FBM_CHAIN_TRAIL_KEY, FBM_FAILURE_CELL_KEY]);
        }
        // Cấu hình mới: bật lại chuông, lần chuông kế hỏi GAS và nhận lệnh chuông mới. Không gọi Web App ngay lúc Sidebar gửi cấu hình.
        pollReopen().then(function () { scheduleGasPoll(normalized.extension); });
        resolve({ ok: true, code: switching ? 'RELAY_SPREADSHEET_SWITCHED' : 'RELAY_CONFIG_SAVED' });
      });
    });
  }).catch(function (error) { return { ok: false, code: 'RELAY_CONFIG_SAVE_FAILED', error: String(error && error.message || error) }; }).finally(function () { relayConfigureFlight = null; });
  return relayConfigureFlight;
}

/**
 * Hộp đen của chuỗi: bước cuối Extension làm được, cất xuống `chrome.storage.local` trước khi làm bước đó. Chrome tắt service worker giữa lượt thì không còn ai báo lỗi; lần hỏi sau mang hộp đen lên để dòng Log "bị bỏ dở" của GAS nói được Extension dừng ở đâu.
 * `workerStartedAt` là lúc service worker hiện tại khởi động: lần hỏi sau thấy nó mới hơn bước cuối nghĩa là worker đã bị tắt và dựng lại. Chỉ ghi tên bước, mã request và giờ — không ghi nội dung request hay response.
 * Ô lỗi (`fbmExtensionFailure`) nằm ở khóa riêng để bước sau không ghi đè: lỗi gọi GAS hay đặt chuông không báo được lúc đó, lần hỏi sau mang lên, GAS ghi Log rồi trả `trailAck` thì xóa.
 */
var FBM_WORKER_STARTED_AT = Date.now();
var FBM_CHAIN_TRAIL_KEY = 'fbmChainTrail';
var FBM_FAILURE_CELL_KEY = 'fbmExtensionFailure';
function noteChainStep(stage, request, hop, code, httpStatus) {
  var trail = { at: Date.now(), stage: String(stage || ''), requestId: String(request && request.id || ''), hop: Number(hop || 0), workerStartedAt: FBM_WORKER_STARTED_AT, code: String(code || ''), httpStatus: Number(httpStatus || 0) };
  return storageSet({ [FBM_CHAIN_TRAIL_KEY]: trail }).catch(function (error) { extensionFailureForward('TRAIL_WRITE_FAILED', 'Extension không ghi được hộp đen: ' + String(error && error.message || error)); });
}
/** Ghi ô lỗi của hộp đen. `command` là việc Extension đang làm (ví dụ `relay_continue`, `gas_poll_schedule`). */
function noteExtensionFailure(command, error, attempts) {
  var cell = { at: Date.now(), command: String(command || ''), code: String(error && error.code || 'EXTENSION_FAILED'), httpStatus: Number(error && error.httpStatus || 0), attempts: Number(attempts || 0) };
  return storageSet({ [FBM_FAILURE_CELL_KEY]: cell }).catch(function (writeError) { extensionFailureForward('TRAIL_WRITE_FAILED', 'Extension không ghi được ô lỗi hộp đen: ' + String(writeError && writeError.message || writeError)); });
}
function readChainTrail() {
  return Promise.all([storageGet(FBM_CHAIN_TRAIL_KEY), storageGet(FBM_FAILURE_CELL_KEY)]).then(function (saved) {
    var trail = saved[0], failure = saved[1];
    if (!trail && !failure) { return null; }
    return Object.assign({}, trail || {}, { workerStartedAt: Number(trail && trail.workerStartedAt || 0), currentWorkerStartedAt: FBM_WORKER_STARTED_AT }, failure ? { relayFailure: failure } : {});
  });
}
/** GAS đã ghi Log ô lỗi có mốc `ack`: xóa ô nếu chưa có lỗi mới hơn ghi đè. */
function trailClear(ack) {
  if (!Number(ack || 0)) { return Promise.resolve(); }
  return storageGet(FBM_FAILURE_CELL_KEY).then(function (cell) {
    if (!cell || Number(cell.at || 0) !== Number(ack)) { return null; }
    return chromeApi(function (done) { return chrome.storage.local.remove([FBM_FAILURE_CELL_KEY], done); });
  });
}

/** Mã máy của Extension này, tạo một lần và giữ trong `chrome.storage.local`. GAS ghi máy chở lượt và từ chối kết quả từ máy khác. */
var FBM_MACHINE_ID_KEY = 'fbmMachineId';
var machineIdFlight = null;
function machineIdRead() {
  if (machineIdFlight) { return machineIdFlight; }
  machineIdFlight = storageGet(FBM_MACHINE_ID_KEY).then(function (saved) {
    if (saved) { return String(saved); }
    var bytes = new Uint8Array(12);
    crypto.getRandomValues(bytes);
    var created = 'may-' + bytesToBase64(bytes).replace(/[+/=]/g, '').slice(0, 16);
    return storageSet({ [FBM_MACHINE_ID_KEY]: created }).then(function () { return created; });
  }).catch(function (error) { machineIdFlight = null; throw error; });
  return machineIdFlight;
}

/**
 * Giãn cách thử lại lần gọi relay hỏng, do GAS gửi kèm mọi lần trả lời (`retryMs`) và Sidebar chuyển kèm `run_now`. Extension không giữ con số riêng: chưa nhận được lần nào (worker vừa khởi động) thì không thử lại, chuông hỏi kế tiếp là lần thử lại.
 */
var relayRetrySchedule = [];
function relayRetryLearn(list) {
  if (Array.isArray(list) && list.length && list.every(function (value) { return Number(value) > 0; })) { relayRetrySchedule = list.map(Number); }
}
function relayRetryWait(ms) { return workerKeepAlive(new Promise(function (resolve) { setTimeout(resolve, ms); })); }

/**
 * Cổng duy nhất Extension gọi GAS: `ask` hỏi việc (lệnh `heartbeat`; GAS trả request của lượt tay đang chờ máy này hoặc việc nền đến hạn), `continue` nộp kết quả hoặc báo lỗi. Thân mang Sheet, mã máy và hộp đen (lần hỏi); GAS trả `trailAck` thì xóa ô lỗi đã được ghi Log.
 * Lỗi gọi (404, không phải JSON, hết giờ, mạng) thử lại theo `relayRetrySchedule`; hết lượt thử thì ghi ô lỗi hộp đen rồi ném lỗi mang mã thật.
 */
/** Hai việc của cổng gọi GAS: lệnh GAS tương ứng và có mang hộp đen hay không. Việc lạ thì ném, không có nhánh mặc định. */
var RELAY_CALLS = {
  ask: { command: 'heartbeat', trail: true },
  continue: { command: 'continue', trail: false }
};
function relayCall(config, kind, payload, timeoutMs) {
  if (!Object.prototype.hasOwnProperty.call(RELAY_CALLS, kind)) { return Promise.reject(Object.assign(new Error('Cổng gọi GAS không có việc "' + kind + '".'), { code: 'RELAY_CALL_UNKNOWN' })); }
  var command = RELAY_CALLS[kind].command, attempts = 0;
  return machineIdRead().then(function (machineId) {
    var withTrail = RELAY_CALLS[kind].trail ? Promise.all([readChainTrail(), credentialRefsHeld()]).then(function (read) { return Object.assign({}, payload, { trail: read[0], keyRefs: read[1] }); }) : Promise.resolve(Object.assign({}, payload));
    return withTrail.then(function (body) {
      var sent = { command: command, spreadsheetId: config.spreadsheetId, payload: Object.assign(body, { machineId: machineId }) };
      function attempt() {
        attempts += 1;
        // Ghi hộp đen ở mọi lần hỏng, kể cả khi lần thử sau thành công: lần hỏng có thể đã tới GAS (GAS xử lý xong, câu trả lời mất trên đường về), lần hỏi nền sau đưa mã lỗi thật vào Log.
        return postRelay(config.url, config.key, sent, timeoutMs).catch(function (error) {
          var waitMs = relayRetrySchedule[attempts - 1];
          return noteExtensionFailure('relay_' + kind, error, attempts).then(function () {
            if (!waitMs) { throw error; }
            return relayRetryWait(waitMs).then(attempt);
          });
        });
      }
      return attempt();
    });
  }).then(function (reply) {
    relayRetryLearn(reply && reply.retryMs);
    return Promise.all([trailClear(reply && reply.trailAck), pollApply(reply && reply.poll)]).then(function () { return reply; });
  });
}

/**
 * Chuyển trạng thái lượt (statusView GAS vừa trả) hoặc lỗi Extension sang Sidebar đang mở của đúng Sheet: gửi tới các tab Google Sheets, cầu nối iframe chỉ nhận khi trùng Spreadsheet đang mở.
 * Tab không có Sidebar hay cầu nối không trả lời là bình thường (Sidebar đóng), lượt vẫn chạy và Sidebar mở lại sẽ đọc status từ GAS.
 */
function statusForward(spreadsheetId, message) {
  return chrome.tabs.query({ url: ['https://docs.google.com/spreadsheets/*'] }).then(function (tabs) {
    return Promise.all((tabs || []).map(function (tab) { return sendTabMessage(tab.id, Object.assign({ type: 'CRM_FBM_STATUS', spreadsheetId: String(spreadsheetId || '') }, message), 1000); }));
  }, function (error) { return noteExtensionFailure('status_forward', error, 1); });
}
/** Lỗi Extension cần người dùng thấy ngay: chuyển sang Sidebar đang mở của Sheet đang cấu hình relay. */
function extensionFailureForward(code, message, httpStatus) {
  return getRelayConfig().then(function (config) {
    return statusForward(config && config.spreadsheetId, { failure: { code: String(code || 'EXTENSION_FAILED'), message: String(message || '').slice(0, 240), httpStatus: Number(httpStatus || 0) } });
  });
}

/** Thân nộp về GAS: kết quả request (`response`) hoặc lỗi không gửi được request (`error` kèm `requestId`). GAS quyết theo cursor, Extension không cần biết request thuộc bước nào. */
function relayReplyPayload(response, hop) { return { response: response, hop: hop }; }
function relayFailurePayload(request, code, message, hop) { return { error: { requestId: String(request.id), code: String(code || 'FBM_TRANSPORT_UNAVAILABLE'), message: String(message || 'Extension không gửi được request tới tab FBM.').slice(0, 240) }, hop: hop }; }

/** Chạy một envelope GAS cấp: kiểm hợp đồng và miền, chuẩn bị tab, gửi đúng một lần. Trả thân nộp về GAS; mọi lỗi trước khi có kết quả thành thân báo lỗi mang mã thật. */
function envelopeRun(request, hop) {
  var refused = envelopeContractCheck(request) || envelopeSiteCheck(request);
  if (refused) { return Promise.resolve(relayFailurePayload(request, refused.code, refused.message, hop)); }
  return prepareFbmTab(request, function (stage, code) { noteChainStep(stage, request, hop, code); }).then(function (tab) {
    if (!tab) { return relayFailurePayload(request, 'FBM_TAB_NOT_FOUND', 'Không tìm thấy tab FBM đang mở.', hop); }
    noteChainStep('fbm_tab_sent', request, hop);
    return sendToFbmTab(tab.id, request).then(function (reply) {
      noteChainStep('fbm_tab_replied', request, hop);
      if (!reply || reply.error) { return relayFailurePayload(request, reply && reply.code, reply ? reply.error : 'Tab FBM không trả kết quả.', hop); }
      return relayReplyPayload(rawFbmReply(reply), hop);
    });
  }).catch(function (error) {
    return relayFailurePayload(request, error && error.code, error && error.message || error, hop);
  });
}

/**
 * Vòng duy nhất chở lát giữa GAS và tab FBM, cho cả nhịp nền và lượt tay: gọi GAS → chạy envelope → nộp → lặp tới khi GAS không cấp request nữa. Mỗi lần GAS trả lời thì chuyển status sang Sidebar đang mở.
 * Lượt tay vào vòng bằng `continue{runId}` (nhận lượt Sidebar vừa mở), nhịp nền bằng `ask`. Người dùng chuyển Extension sang Sheet khác giữa chừng thì báo một lần cho GAS cũ để nó đóng request rồi dừng.
 */
var relayLoopFlight = null;
function relayLoop(config, first) {
  var hop = 0;
  function finish(reply) {
    noteChainStep(reply && reply.ok === false ? 'gas_reply_failed' : 'chain_finished', null, hop, reply && reply.ok === false ? reply.code || 'GAS_REPLY_FAILED' : '');
    return reply;
  }
  function step(reply) {
    var request = reply && reply.request;
    // `done`: GAS không cấp request kế, chuỗi của lượt này đã hết; Sidebar chờ lượt tay dựa vào cờ này, không đoán theo phase. `ok` chuyển nguyên của GAS: lượt đạt vẫn có thể mang mã (`LOGIN_OK`).
    statusForward(config.spreadsheetId, { ok: !(reply && reply.ok === false), status: reply && reply.status || null, conflict: reply && reply.conflict || null, code: String(reply && reply.code || ''), error: String(reply && reply.error || ''), done: !request });
    if (!request) { return finish(reply); }
    noteChainStep('gas_request_received', request, hop);
    if (config.generation !== relayConfigGeneration) {
      noteChainStep('config_switched', request, hop, 'RELAY_CONFIG_SWITCHED');
      return relayCall(config, 'continue', relayFailurePayload(request, 'RELAY_CONFIG_SWITCHED', 'Extension đã chuyển đồng bộ nền sang Sheet khác theo xác nhận của người dùng; dừng chuỗi của Sheet này.', hop + 1), relayTimeoutFor(request)).then(function () {
        return finish({ ok: false, code: 'RELAY_CONFIG_SWITCHED', request: null });
      });
    }
    return envelopeRun(request, hop + 1).then(function (payload) {
      hop += 1;
      noteChainStep(payload.error ? 'failure_sent' : 'gas_response_sent', request, hop, payload.error && payload.error.code);
      return relayCall(config, 'continue', payload, relayTimeoutFor(request));
    }).then(step);
  }
  return relayCall(config, first.kind, first.payload || {}).then(step).catch(function (error) {
    noteChainStep('gas_reply_failed', null, hop, error && error.code || 'GAS_RELAY_FAILED', error && error.httpStatus);
    extensionFailureForward(error && error.code || 'GAS_RELAY_FAILED', error && error.message || error, error && error.httpStatus);
    return { ok: false, code: String(error && error.code || 'GAS_RELAY_FAILED'), error: String(error && error.message || error) };
  });
}
/** Một vòng tại một thời điểm trong worker: lần gọi đến khi vòng khác đang chạy thì nối sau vòng đó, không chạy song song hai vòng trên cùng tab FBM. */
function relayLoopStart(first) {
  var previous = relayLoopFlight || Promise.resolve();
  var flight = previous.then(function () {
    return getRelayConfig().then(function (config) {
      if (!config) {
        var missing = Object.assign(new Error('Thiếu cấu hình relay; hãy mở Sidebar một lần.'), { code: 'RELAY_CONFIG_MISSING' });
        noteExtensionFailure(first.kind, missing, 0);
        return { ok: false, code: missing.code, error: missing.message };
      }
      return relayLoop(config, first);
    });
  });
  relayLoopFlight = flight;
  flight.then(function () { if (relayLoopFlight === flight) { relayLoopFlight = null; } });
  return flight;
}
/** Nhịp hỏi GAS (chuông, khởi động Chrome, Sidebar mở). GAS phải cấp envelope trước; không có envelope thì không chạm tab FBM. */
function fbmHeartbeatNow(source) { return relayLoopStart({ kind: 'ask', payload: { trigger: String(source || 'manual') } }); }
if (typeof globalThis !== 'undefined') { globalThis.fbmHeartbeatNow = fbmHeartbeatNow; }
/**
 * Sidebar đánh thức Extension hỏi GAS ngay: `run_now` sau khi mở lượt tay (GAS tự biết lượt nào đang chờ máy này; tin mất thì lần hỏi theo chuông vẫn nhận lượt), `config` sau khi lưu cài đặt đồng bộ (GAS trả nhịp chuông mới và báo máy này có chạy nền không). Đánh thức xóa cờ tắt chuông vì người dùng vừa thao tác trên máy này.
 */
var WAKE_TRIGGERS = ['run_now', 'config'];
function fbmRunNow(retryMs, trigger) {
  var reason = String(trigger || 'run_now');
  if (WAKE_TRIGGERS.indexOf(reason) < 0) { return Promise.resolve({ ok: false, code: 'WAKE_TRIGGER_UNKNOWN', error: 'Sidebar đánh thức Extension với lý do "' + reason + '" không có trong WAKE_TRIGGERS.' }); }
  relayRetryLearn(retryMs);
  return getRelayConfig().then(function (config) {
    if (!config) { return { ok: false, code: 'RELAY_CONFIG_MISSING', error: 'Thiếu cấu hình relay; hãy mở lại Sidebar để gửi cấu hình cho Extension.' }; }
    return pollReopen().then(function () {
      fbmHeartbeatNow(reason);
      return { ok: true, accepted: true };
    });
  });
}


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
  if (message && message.type === 'FBM_MACHINE_ID') {
    machineIdRead().then(function (machineId) { sendResponse({ ok: true, machineId: machineId }); }, function (error) { sendResponse({ ok: false, code: 'MACHINE_ID_READ_FAILED', error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_RUN_NOW') {
    fbmRunNow(message.retryMs, message.trigger).then(sendResponse, function (error) { sendResponse({ ok: false, code: String(error && error.code || 'RUN_NOW_FAILED'), error: String(error && error.message || error) }); });
    return true;
  }
  if (message && message.type === 'FBM_BRIDGE_FAILURE') {
    noteExtensionFailure('bridge', Object.assign(new Error(String(message.message || '')), { code: String(message.code || 'BRIDGE_POST_FAILED') }), 1).then(function () { sendResponse({ ok: true }); });
    return true;
  }
  return false;
});

/**
 * Mở trình duyệt hoặc cài/tải lại Extension: xóa cờ tắt chuông, đặt lại chuông và hỏi GAS đúng một lần. GAS quyết lần hỏi đó chỉ kiểm máy hay chạy việc (mở trình duyệt chạy việc khi bật "Hỏi GAS khi mở trình duyệt") và trả lệnh chuông.
 * Chưa có cấu hình relay thì không hỏi (chưa biết GAS nào); Sidebar mở lần đầu gửi cấu hình là lần hỏi `config`.
 */
function askOnOpen(trigger) {
  return pollReopen().then(restoreHeartbeatSchedule).then(getRelayConfig).then(function (config) {
    return config ? fbmHeartbeatNow(trigger) : null;
  }).catch(function (error) { return noteExtensionFailure(trigger, error, 1); });
}
chrome.runtime.onInstalled.addListener(function () { askOnOpen('install'); });
chrome.runtime.onStartup.addListener(function () { askOnOpen('startup'); });
// Worker khởi động lại giữa chừng (Chrome tắt worker rảnh): chỉ đặt lại chuông theo cờ, không hỏi GAS.
restoreHeartbeatSchedule();
recoverSheetsBridges();
/** Gửi request đọc tối thiểu; không gửi thao tác ghi từ alarm. */
chrome.alarms.onAlarm.addListener(function (alarm) {
  if (!alarm || alarm.name !== GAS_POLL_ALARM) { return; }
  fbmHeartbeatNow('alarm');
});

