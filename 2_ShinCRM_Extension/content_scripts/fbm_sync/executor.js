/* Cầu nối FBM: nhận request, fetch trong tab đăng nhập, trả response thô. */
(function () {
  var HEARTBEAT_URL = 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage';
  var FETCH_TIMEOUT_MS = 10000;
  /** Request đọc tối thiểu để giữ phiên và phát hiện logout. */
  function heartbeat() { return { url: HEARTBEAT_URL, method: 'POST', headers: { accept: '*/*', 'content-type': 'application/json; charset=UTF-8' }, body: { type: 1, count: 1, language: 'v', controller: 'zccrAccount', viewId: null, childObject: false, lastPageIndex: 0, firstPageItem: '', lastPageItem: '', lastRowCount: 0, memvars: [], externalKey: [], gridPageIndex: -1, gridPageValue: null, gridRefresh: true, filter: [], sortExpression: 'ngay_gd desc', cookie: '' } }; }
  /** Đọc cookie payload nếu request GAS không truyền cookie. */
  function payloadCookieFromPage() {
    var html = document.documentElement ? document.documentElement.innerHTML : '';
    var sources = [html, document.documentElement ? document.documentElement.textContent || '' : ''];
    var patterns = [
      /\\?["']cookie\\?["']\s*[:=]\s*\\?["']([^"'\\]+FHN_CRM_App)["']/i,
      /(?:payloadCookie|cookiePayload)\s*[=:]\s*\\?["']([^"'\\]+FHN_CRM_App)["']/i
    ];
    for (var i = 0; i < sources.length; i++) {
      for (var j = 0; j < patterns.length; j++) {
        var match = sources[i].match(patterns[j]);
        if (match) { return match[1]; }
      }
    }
    return '';
  }
  /** Clone body và bổ sung cookie lấy từ trang FBM. */
  function requestBody(req) {
    if (req.body === undefined) { return undefined; }
    var body = typeof req.body === 'string' ? JSON.parse(req.body) : JSON.parse(JSON.stringify(req.body));
    if (!body.cookie) { body.cookie = payloadCookieFromPage(); }
    return { text: JSON.stringify(body), cookie: body.cookie || '' };
  }
  /** Thực thi fetch và luôn trả body dạng text để GAS tự parse. */
  function execute(request) {
    var req = request || heartbeat();
    var sent = requestBody(req);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    return fetch(req.url, { method: req.method || 'POST', headers: req.headers || { 'content-type': 'application/json; charset=UTF-8' }, body: sent && sent.text, credentials: 'include', cache: 'no-store', signal: controller.signal }).then(function (response) {
      return response.text().then(function (body) { return { ok: response.ok, status: response.status, headers: { contentType: response.headers.get('content-type') || '' }, body: body, transport: { payloadCookie: sent && sent.cookie || '' } }; });
    }).catch(function (err) {
      if (err && err.name === 'AbortError') { throw new Error('FBM không phản hồi sau 10 giây.'); }
      throw err;
    }).finally(function () { clearTimeout(timer); });
  }
  /** Chỉ nhận message đúng loại, giữ channel mở cho Promise fetch. */
  function onFbmMessage(message, sender, sendResponse) {
    if (message && message.type === 'FBM_PING') { sendResponse({ ready: true, version: '21.7' }); return false; }
    if (!message || message.type !== 'FBM_EXECUTE') { return false; }
    execute(message.request).then(function (result) { sendResponse({ result: result }); }, function (err) { sendResponse({ error: String(err && err.message || err) }); });
    return true;
  }
  try {
    if (globalThis.__SHINCRM_FBM_LISTENER__) { chrome.runtime.onMessage.removeListener(globalThis.__SHINCRM_FBM_LISTENER__); }
  } catch (ignore) {}
  globalThis.__SHINCRM_FBM_LISTENER__ = onFbmMessage;
  chrome.runtime.onMessage.addListener(onFbmMessage);
})();
