/* Cầu nối FBM: nhận request, fetch trong tab đăng nhập, trả response thô. */
(function () {
  var EXECUTOR_VERSION = '21.8';
  var HEARTBEAT_URL = 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage';
  var FETCH_TIMEOUT_MS = 10000;
  var FBM_ORIGIN = 'https://fbo.com.vn:8888';
  var FBM_PATHS = ['/AppService/', '/FastBusiness.DataService.asmx/', '/Main/Login.aspx/'];
  function endpointPath(url) {
    try { return new URL(String(url || ''), FBM_ORIGIN).pathname; } catch (ignore) { return ''; }
  }
  function validateEndpoint(url) {
    var value = String(url || '').trim(), parsed, path;
    if (!value || /(?:undefined|null|NaN)/i.test(value)) { return { ok: false, code: 'FBM_ENDPOINT_MISSING', message: 'Request FBM thiếu endpoint; đã chặn trước khi gửi.' }; }
    try { parsed = new URL(value, FBM_ORIGIN); } catch (ignoreUrl) { return { ok: false, code: 'FBM_ENDPOINT_INVALID', message: 'Endpoint FBM không hợp lệ; đã chặn trước khi gửi.' }; }
    path = parsed.pathname;
    if (parsed.origin !== FBM_ORIGIN || !FBM_PATHS.some(function (prefix) { return path.indexOf(prefix) === 0; })) {
      return { ok: false, code: 'FBM_ENDPOINT_UNALLOWED', message: 'Endpoint FBM nằm ngoài danh sách cho phép; đã chặn trước khi gửi.' };
    }
    return { ok: true, url: parsed.toString(), path: path };
  }
  function traceEvent(trace, stage, request, extra) {
    var meta = request && request.meta && request.meta.trace || {};
    trace.push(Object.assign({ at: Date.now(), stage: stage, runId: String(meta.runId || ''), requestId: String(meta.requestId || ''), operation: String(request && request.meta && request.meta.kind || ''), entity: String(request && request.meta && request.meta.entity || ''), recordId: String(request && request.meta && (request.meta.id || request.meta.shinId || request.meta.stt_rec_kh) || ''), endpoint: endpointPath(request && request.url) }, extra || {}));
  }
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
  /** Dùng chuỗi wire GAS đã dựng; chỉ serialize request nội bộ của heartbeat khi không có envelope GAS. */
  function requestBody(req) {
    if (req.body === undefined) { return undefined; }
    if (typeof req.bodyText === 'string') { return { text: req.bodyText, cookie: req.body && req.body.cookie || '' }; }
    var body = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
    return { text: body, cookie: req.body && req.body.cookie || payloadCookieFromPage() };
  }
  function jsonValue(text) { try { var value = JSON.parse(String(text || '')); return value && value.d !== undefined ? value.d : value; } catch (ignore) { return null; } }
  function loginValueFromPage() {
    var html = document.documentElement ? document.documentElement.innerHTML : '', patterns = [
      /(?:loginValue|encryptSalt|encrypt_salt|passwordSalt|loginSalt)\s*[=:]\s*["']([^"']+)["']/i,
      /["']value["']\s*:\s*["']([^"']+)["']/i
    ];
    for (var i = 0; i < patterns.length; i += 1) { var match = html.match(patterns[i]); if (match) { return match[1]; } }
    return '';
  }
  function payloadCookieFromText(text) {
    var source = String(text || ''), patterns = [
      /\\?["']cookie\\?["']\s*[:=]\s*\\?["']([^"'\\]+FHN_CRM_App)["']/i,
      /(?:payloadCookie|cookiePayload)\s*[=:]\s*\\?["']([^"'\\]+FHN_CRM_App)["']/i
    ];
    for (var i = 0; i < patterns.length; i += 1) { var match = source.match(patterns[i]); if (match) { return match[1]; } }
    return '';
  }
  function md5(value) {
    function rotate(x, n) { return (x << n) | (x >>> (32 - n)); }
    function add(x, y) { return (x + y) | 0; }
    function ff(a, b, c, d, x, s, t) { return add(rotate(add(add(a, (b & c) | (~b & d)), add(x, t)), s), b); }
    function gg(a, b, c, d, x, s, t) { return add(rotate(add(add(a, (b & d) | (c & ~d)), add(x, t)), s), b); }
    function hh(a, b, c, d, x, s, t) { return add(rotate(add(add(a, b ^ c ^ d), add(x, t)), s), b); }
    function ii(a, b, c, d, x, s, t) { return add(rotate(add(add(a, c ^ (b | ~d)), add(x, t)), s), b); }
    var input = unescape(encodeURIComponent(String(value))), bytes = [], i, j, a, b, c, d, olda, oldb, oldc, oldd, x = [];
    for (i = 0; i < input.length; i += 1) { bytes[i >> 2] = (bytes[i >> 2] || 0) | input.charCodeAt(i) << ((i % 4) * 8); }
    bytes[input.length >> 2] = (bytes[input.length >> 2] || 0) | 0x80 << ((input.length % 4) * 8);
    bytes[(((input.length + 8) >> 6) + 1) * 16 - 2] = input.length * 8;
    bytes[(((input.length + 8) >> 6) + 1) * 16 - 1] = 0;
    a = 0x67452301; b = 0xefcdab89; c = 0x98badcfe; d = 0x10325476;
    for (i = 0; i < bytes.length; i += 16) {
      for (j = 0; j < 16; j += 1) { x[j] = bytes[i + j] || 0; }
      olda = a; oldb = b; oldc = c; oldd = d;
      a = ff(a,b,c,d,x[0],7,-680876936); d = ff(d,a,b,c,x[1],12,-389564586); c = ff(c,d,a,b,x[2],17,606105819); b = ff(b,c,d,a,x[3],22,-1044525330);
      a = ff(a,b,c,d,x[4],7,-176418897); d = ff(d,a,b,c,x[5],12,1200080426); c = ff(c,d,a,b,x[6],17,-1473231341); b = ff(b,c,d,a,x[7],22,-45705983);
      a = ff(a,b,c,d,x[8],7,1770035416); d = ff(d,a,b,c,x[9],12,-1958414417); c = ff(c,d,a,b,x[10],17,-42063); b = ff(b,c,d,a,x[11],22,-1990404162);
      a = ff(a,b,c,d,x[12],7,1804603682); d = ff(d,a,b,c,x[13],12,-40341101); c = ff(c,d,a,b,x[14],17,-1502002290); b = ff(b,c,d,a,x[15],22,1236535329);
      a = gg(a,b,c,d,x[1],5,-165796510); d = gg(d,a,b,c,x[6],9,-1069501632); c = gg(c,d,a,b,x[11],14,643717713); b = gg(b,c,d,a,x[0],20,-373897302);
      a = gg(a,b,c,d,x[5],5,-701558691); d = gg(d,a,b,c,x[10],9,38016083); c = gg(c,d,a,b,x[15],14,-660478335); b = gg(b,c,d,a,x[4],20,-405537848);
      a = gg(a,b,c,d,x[9],5,568446438); d = gg(d,a,b,c,x[14],9,-1019803690); c = gg(c,d,a,b,x[3],14,-187363961); b = gg(b,c,d,a,x[8],20,1163531501);
      a = gg(a,b,c,d,x[13],5,-1444681467); d = gg(d,a,b,c,x[2],9,-51403784); c = gg(c,d,a,b,x[7],14,1735328473); b = gg(b,c,d,a,x[12],20,-1926607734);
      a = hh(a,b,c,d,x[5],4,-378558); d = hh(d,a,b,c,x[8],11,-2022574463); c = hh(c,d,a,b,x[11],16,1839030562); b = hh(b,c,d,a,x[14],23,-35309556);
      a = hh(a,b,c,d,x[1],4,-1530992060); d = hh(d,a,b,c,x[4],11,1272893353); c = hh(c,d,a,b,x[7],16,-155497632); b = hh(b,c,d,a,x[10],23,-1094730640);
      a = hh(a,b,c,d,x[13],4,681279174); d = hh(d,a,b,c,x[0],11,-358537222); c = hh(c,d,a,b,x[3],16,-722521979); b = hh(b,c,d,a,x[6],23,76029189);
      a = hh(a,b,c,d,x[9],4,-640364487); d = hh(d,a,b,c,x[12],11,-421815835); c = hh(c,d,a,b,x[15],16,530742520); b = hh(b,c,d,a,x[2],23,-995338651);
      a = ii(a,b,c,d,x[0],6,-198630844); d = ii(d,a,b,c,x[7],10,1126891415); c = ii(c,d,a,b,x[14],15,-1416354905); b = ii(b,c,d,a,x[5],21,-57434055);
      a = ii(a,b,c,d,x[12],6,1700485571); d = ii(d,a,b,c,x[3],10,-1894986606); c = ii(c,d,a,b,x[10],15,-1051523); b = ii(b,c,d,a,x[1],21,-2054922799);
      a = ii(a,b,c,d,x[8],6,1873313359); d = ii(d,a,b,c,x[15],10,-30611744); c = ii(c,d,a,b,x[6],15,-1560198380); b = ii(b,c,d,a,x[13],21,1309151649);
      a = ii(a,b,c,d,x[4],6,-145523070); d = ii(d,a,b,c,x[11],10,-1120210379); c = ii(c,d,a,b,x[2],15,718787259); b = ii(b,c,d,a,x[9],21,-343485551);
      a = add(a, olda); b = add(b, oldb); c = add(c, oldc); d = add(d, oldd);
    }
    function hex(n) { var out = '', k; for (k = 0; k < 4; k += 1) { out += ('0' + ((n >> (k * 8)) & 255).toString(16)).slice(-2); } return out; }
    return hex(a) + hex(b) + hex(c) + hex(d);
  }
  function executeLogin(request, trace) {
    var credentials = request && request.meta && request.meta.loginCredentials || {}, base = 'https://fbo.com.vn:8888/Main/Login.aspx/', headers = { accept: '*/*', 'content-type': 'application/json; charset=UTF-8' };
    function post(url, body) { return fetch(base + url, { method: 'POST', headers: headers, body: body, credentials: 'include', cache: 'no-store' }).then(function (response) { return readResponseText(response).then(function (text) { return { response: response, text: text }; }); }); }
    return post('GetEntityData', '').then(function (entity) {
      if (!entity.response.ok) { throw new Error('FBM không cho đọc danh sách database.'); }
      var data = jsonValue(entity.text), database = String(credentials.database || (Array.isArray(data) && data[0] && data[0][2]) || '');
      return post('GetUnitData', JSON.stringify({ u: String(credentials.username || ''), d: database })).then(function (unit) {
        if (!unit.response.ok) { throw new Error('FBM không cho đọc danh sách đơn vị.'); }
        var units = jsonValue(unit.text), selectedUnit = String(credentials.unit || (Array.isArray(units) && units[0] && units[0][0]) || ''), salt = String(credentials.value || loginValueFromPage() || '');
        if (!database || !selectedUnit || !salt) { throw new Error('Không lấy đủ database, đơn vị hoặc mã phiên để đăng nhập FBM.'); }
        var firstHash = /^[a-f0-9]{32}$/i.test(String(credentials.password || '')) ? String(credentials.password) : md5(salt + md5(String(credentials.password || '')));
        var body = JSON.stringify({ user: String(credentials.username || ''), password: firstHash, database: database, unit: selectedUnit, language: String(credentials.language || 'v'), value: salt, force: false, storage: true });
        traceEvent(trace, 'login_request_built', request, { database: database, unit: selectedUnit });
        return post('Login', body).then(function (login) { return { ok: login.response.ok, status: login.response.status, headers: { contentType: login.response.headers.get('content-type') || '' }, body: login.text, transport: { payloadCookie: payloadCookieFromText(login.text) || payloadCookieFromPage(), trace: trace } }; });
      });
    });
  }
  /** Thực thi fetch và luôn trả body dạng text để GAS tự parse. */
  /** Giai ma ca response gzip bi FBM tra tho, tranh GAS nhan chuoi 1F 8B. */
  function readResponseText(response) {
    return response.arrayBuffer().then(function (buffer) {
      var bytes = new Uint8Array(buffer), gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (gzip && typeof DecompressionStream === 'function') {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text();
      }
      if (typeof TextDecoder === 'function') { return new TextDecoder('utf-8').decode(bytes); }
      return String.fromCharCode.apply(null, bytes);
    });
  }
  function execute(request) {
    var req = request || heartbeat(), trace = [];
    traceEvent(trace, 'executor_started', req);
    if (req.meta && req.meta.kind === 'login') { return executeLogin(req, trace); }
    var endpoint = validateEndpoint(req.url);
    if (!endpoint.ok) {
      traceEvent(trace, 'fetch_blocked', req, { code: endpoint.code, error: endpoint.message });
      var endpointError = new Error(endpoint.message);
      endpointError.code = endpoint.code;
      endpointError.trace = trace;
      return Promise.reject(endpointError);
    }
    var sent = requestBody(req);
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    traceEvent(trace, 'fetch_started', req);
    return fetch(endpoint.url, { method: req.method || 'POST', headers: req.headers || { 'content-type': 'application/json; charset=UTF-8' }, body: sent && sent.text, credentials: 'include', cache: 'no-store', signal: controller.signal }).then(function (response) {
      return readResponseText(response).then(function (body) { traceEvent(trace, 'fetch_finished', req, { httpStatus: response.status, responseLength: body.length }); return { ok: response.ok, status: response.status, headers: { contentType: response.headers.get('content-type') || '' }, body: body, transport: { payloadCookie: sent && sent.cookie || '', trace: trace } }; });
    }).catch(function (err) {
      traceEvent(trace, 'fetch_finished', req, { error: String(err && err.message || err) });
      try { err.trace = trace; } catch (ignore) {}
      if (err && err.name === 'AbortError') { throw new Error('FBM không phản hồi sau 10 giây.'); }
      throw err;
    }).finally(function () { clearTimeout(timer); });
  }
  /** Chỉ nhận message đúng loại, giữ channel mở cho Promise fetch. */
  function onFbmMessage(message, sender, sendResponse) {
    if (message && (message.type === 'FBM_PING_V2' || message.type === 'FBM_PING')) { sendResponse({ ready: true, version: EXECUTOR_VERSION }); return false; }
    if (!message || (message.type !== 'FBM_EXECUTE_V2' && message.type !== 'FBM_EXECUTE')) { return false; }
    execute(message.request).then(function (result) { sendResponse({ result: result }); }, function (err) { sendResponse({ error: String(err && err.message || err), trace: err && err.trace || [] }); });
    return true;
  }
  try {
    if (globalThis.__SHINCRM_FBM_LISTENER__) { chrome.runtime.onMessage.removeListener(globalThis.__SHINCRM_FBM_LISTENER__); }
  } catch (ignore) {}
  globalThis.__SHINCRM_FBM_LISTENER__ = onFbmMessage;
  chrome.runtime.onMessage.addListener(onFbmMessage);
})();
