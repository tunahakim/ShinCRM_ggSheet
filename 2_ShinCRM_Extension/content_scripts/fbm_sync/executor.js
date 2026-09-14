/* Cầu nối FBM: nhận request, fetch trong tab đăng nhập, trả response thô. */
(function () {
  var EXECUTOR_VERSION = '21.11';
  var FETCH_TIMEOUT_MS = 10000;
  function traceEvent(trace, stage, request, extra) {
    trace.push(Object.assign({ at: Date.now(), stage: stage, requestId: String(request && request.id || '') }, extra || {}));
  }
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
  function requestBody(req) {
    if (typeof req.bodyText === 'string') { return req.bodyText; }
    if (req.body === undefined) { return undefined; }
    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  /** Lọc response theo chỉ dẫn transport do GAS cấp; không có chỉ dẫn thì trả nguyên văn. */
  function captureTransportValues(request, responseBody, sourceName) {
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, captures = Array.isArray(transport.captures) ? transport.captures : [], values = {};
    captures.forEach(function (capture) {
      var item = capture || {}, source = (sourceName || item.source) === 'page_html' ? (document.documentElement ? document.documentElement.innerHTML : '') : String(responseBody || ''), pattern = String(item.pattern || ''), flags = String(item.flags || ''), match;
      if (!pattern || !source) { return; }
      try { match = source.match(new RegExp(pattern, flags)); } catch (ignore) { return; }
      if (match) { values[String(item.name || 'value')] = match[Number(item.group || 1)]; }
    });
    return values;
  }
  function captureTransport(request, responseBody) {
    var values = captureTransportValues(request, responseBody);
    return Object.keys(values).length ? { captures: values } : {};
  }
  /** Thay token theo chỉ dẫn GAS mà không parse hoặc dựng lại JSON nghiệp vụ. */
  function applyTransportReplacements(request, bodyText) {
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, replacements = Array.isArray(transport.replacements) ? transport.replacements : [], values = captureTransportValues(request, '', 'page_html'), output = bodyText;
    replacements.forEach(function (replacement) {
      var item = replacement || {}, token = String(item.token || ''), value = values[String(item.capture || '')];
      if (!token || value === undefined || value === null) { return; }
      output = String(output).split(token).join(String(value));
    });
    return output;
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
        return post('Login', body).then(function (login) {
          if (!login.response.ok) { return { ok: false, status: login.response.status, headers: { contentType: login.response.headers.get('content-type') || '' }, body: login.text, transport: { trace: trace } }; }
          traceEvent(trace, 'login_successful', request, { httpStatus: login.response.status });
          return fetch('https://fbo.com.vn:8888/Main/zccrAccount.aspx', { method: 'GET', credentials: 'include', cache: 'no-store' }).then(function (account) {
            return readResponseText(account).then(function (accountHtml) {
              traceEvent(trace, 'payload_cookie_page_read', request, { httpStatus: account.status, responseLength: accountHtml.length });
              return { ok: login.response.ok, status: login.response.status, headers: { contentType: login.response.headers.get('content-type') || '' }, body: login.text, transport: { payloadCookie: payloadCookieFromText(accountHtml) || payloadCookieFromText(login.text) || payloadCookieFromPage(), trace: trace } };
            });
          });
        });
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
    if (!request || typeof request !== 'object') {
      var missing = new Error('GAS chưa cấp request FBM; executor chỉ là cầu nối.');
      missing.code = 'FBM_REQUEST_MISSING';
      missing.trace = [];
      return Promise.reject(missing);
    }
    var req = request, trace = [];
    traceEvent(trace, 'executor_started', req);
    if (req.meta && req.meta.kind === 'login') { return executeLogin(req, trace); }
    var sent = applyTransportReplacements(req, requestBody(req));
    var transportInstructions = req.transport || req.meta && req.meta.transport || {};
    var replacements = Array.isArray(transportInstructions.replacements) ? transportInstructions.replacements : [];
    if (replacements.some(function (replacement) { return String(sent || '').indexOf(String(replacement && replacement.token || '')) >= 0; })) {
      var captureError = new Error('Không lấy được giá trị transport do GAS yêu cầu; đã chặn trước khi gửi FBM.');
      captureError.code = 'FBM_TRANSPORT_CAPTURE_MISSING';
      traceEvent(trace, 'transport_capture_missing', req, { code: captureError.code });
      captureError.trace = trace;
      return Promise.reject(captureError);
    }
    var controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, FETCH_TIMEOUT_MS);
    traceEvent(trace, 'fetch_started', req);
    return fetch(String(req.url || ''), { method: req.method || 'POST', headers: req.headers || { 'content-type': 'application/json; charset=UTF-8' }, body: sent, credentials: 'include', cache: 'no-store', signal: controller.signal }).then(function (response) {
      return readResponseText(response).then(function (body) { var captured = captureTransport(req, body); traceEvent(trace, 'fetch_finished', req, { httpStatus: response.status, responseLength: body.length }); return { ok: response.ok, status: response.status, headers: { contentType: response.headers.get('content-type') || '' }, body: body, transport: Object.assign({}, captured, { trace: trace }) }; });
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
