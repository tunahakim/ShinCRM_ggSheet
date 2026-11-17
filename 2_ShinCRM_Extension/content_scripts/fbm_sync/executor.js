/* Cầu nối FBM: nhận request, fetch trong tab đăng nhập, trả response thô. */
(function () {
  var EXECUTOR_VERSION = chrome.runtime.getManifest().version;
  /** Đọc và cắt response nằm ở `response_shape.js`, nạp trước tệp này. Thiếu thì ném ngay: không đăng ký đầu nhận, service worker báo FBM_TAB_NOT_READY thay vì tab chạy executor thiếu công cụ. */
  var shape = globalThis.ShinFbmResponse;
  if (!shape) { throw new Error('Thiếu response_shape.js: phải nạp trước executor.js.'); }
  /** Mã request trong vết là mã GAS cấp (`meta.trace.requestId`); phần tử lô có `id` chỉ là thứ tự trong lô, dùng nó thì GAS coi response là cũ và bỏ. */
  function traceEvent(trace, stage, request, extra) {
    var reservation = request && request.meta && request.meta.trace && request.meta.trace.requestId;
    trace.push(Object.assign({ at: Date.now(), stage: stage, requestId: String(reservation || request && request.id || '') }, extra || {}));
  }
  function requestBody(req) {
    if (typeof req.bodyText === 'string') { return req.bodyText; }
    if (req.body === undefined) { return undefined; }    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  /** Chỉ thu thập giá trị trên trang để thay token request do GAS cấp. */
  function captureTransportValues(request, responseBody, sourceName) {
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, captures = Array.isArray(transport.captures) ? transport.captures : [], values = {};
    captures.forEach(function (capture) {
      var item = capture || {}, source = sourceName || item.source, sources = source === 'page_html'
        ? [document.documentElement ? document.documentElement.innerHTML : '', document.documentElement ? document.documentElement.textContent || '' : '']
        : [String(responseBody || '')], pattern = String(item.pattern || ''), flags = String(item.flags || ''), match;
      if (!pattern) { return; }
      for (var index = 0; index < sources.length; index += 1) {
        if (!sources[index]) { continue; }
        // Mẫu GAS cấp sai thì `new RegExp` ném: lỗi về GAS qua câu trả lời lỗi, không bỏ qua giá trị cần thay.
        match = String(sources[index]).match(new RegExp(pattern, flags));
        if (match) {
          values[String(item.name || 'value')] = match[Number(item.group || 1)];
          return;
        }
      }
    });
    return values;
  }
  /** Dấu vết chẩn đoán an toàn khi bắt mã phiên: chỉ đường dẫn, độ dài và có/không có dấu hiệu database FBM; không đưa nội dung trang hay mã phiên vào trace. */
  function payloadCookieDiagnostic(html, url) {
    var text = String(html || ''), path = '';
    try { path = new URL(String(url || location.href)).pathname; } catch (ignorePath) { path = ''; }
    return { endpoint: path, responseLength: text.length, error: text.indexOf('FHN_CRM_App') >= 0 ? 'payload_marker_present' : 'payload_marker_absent' };
  }
  function captureTransport(request, responseBody) {
    var values = captureTransportValues(request, responseBody);
    return Object.keys(values).length ? { captures: values } : {};
  }
  /** Thay token theo chỉ dẫn GAS mà không parse hoặc dựng lại JSON nghiệp vụ. */
  function applyTransportReplacements(request, bodyText) {
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, replacements = bodyText !== undefined && Array.isArray(transport.replacements) ? transport.replacements : [], values = captureTransportValues(request, '', ''), output = bodyText;
    replacements.forEach(function (replacement) {
      var item = replacement || {}, token = String(item.token || ''), value = values[String(item.capture || '')];
      if (!token) { return; }
      if (value === undefined || value === null) {
        if (item.required === false) { output = String(output).split(token).join(String(item.fallback === undefined ? '' : item.fallback)); }
        return;
      }
      output = String(output).split(token).join(String(value));
    });
    return output;
  }
  /**
   * Lệnh `pageKeyStore`: phần phía trình duyệt của trang Login FBM (_onLoginComplete). Bảng dữ liệu trên trang chính kiểm khóa `localStorage["k\0"]`; thiếu hoặc lệch thì tab FBM trắng.
   * Worker đã tính khóa và so với giá trị kiểm của trang tài khoản; khóa rỗng nghĩa là không khớp: máy chủ giữ khóa của phiên trình duyệt đang sống, tab giữ nguyên khóa đó (`LOGIN_PAGE_KEY_KEPT_EXISTING`), vì ghi khóa sai làm bảng trắng. Thân trả về chỉ mang mã, không mang khóa.
   */
  function storePageKey(request, trace) {
    var key = String(request.meta && request.meta.pageKeyWrite || ''), code;
    if (!key) { code = 'LOGIN_PAGE_KEY_KEPT_EXISTING'; }
    else {
      try { sessionStorage.clear(); localStorage.removeItem('menuItems'); localStorage.setItem('k' + String.fromCharCode(0), key); code = 'LOGIN_PAGE_KEY_STORED'; }
      catch (storageError) { code = 'LOGIN_PAGE_KEY_STORAGE_FAILED'; }
    }
    traceEvent(trace, 'login_page_storage', request, { code: code });
    return { ok: true, status: 200, headers: { contentType: 'application/json' }, body: JSON.stringify({ code: code }), transport: { trace: trace } };
  }
  /**
   * Việc quét (Tài liệu 09/01 "Việc quét"): gọi FBM một lần, giữ cột GAS liệt kê, cắt dòng thành gói nhỏ hơn trần đường relay và giữ trong RAM của tab theo `jobId`; `scan_chunk` trả gói từ RAM, không gọi FBM lại.
   * Mỗi tab giữ một việc, việc mới thay việc cũ. Tab tải lại thì mất việc và GAS nhận `FBM_SCAN_JOB_GONE`. Extension không hiểu nghiệp vụ: không đổi giá trị ô, không chọn dòng ngoài danh sách id GAS gửi.
   */
  var scanJob = null;
  function scanChunkResult(chunkIndex, trace, request) {
    var job = scanJob, index = Number(chunkIndex);
    if (!job || !request.meta.job || String(request.meta.job.jobId || '') !== job.jobId || !(index >= 0 && index < job.chunks.length)) {
      var gone = new Error('Tab FBM không còn giữ việc quét này (tab đã tải lại hoặc Extension đã khởi động lại); GAS sẽ chạy lại việc quét.');
      gone.code = 'FBM_SCAN_JOB_GONE'; gone.trace = trace;
      throw gone;
    }
    traceEvent(trace, 'scan_chunk_sent', request, { responseLength: job.chunks[index].length });
    return { ok: true, status: 200, headers: { contentType: 'application/json; charset=utf-8' }, body: job.chunks[index], job: { jobId: job.jobId, chunkIndex: index, chunkCount: job.chunks.length, rowCount: job.rowCount, keptCount: job.keptCount, totalRowCount: job.totalRowCount, oversize: index === 0 ? job.oversize : [] }, transport: { trace: trace } };
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
    // Rẽ nhánh theo lệnh vật lý GAS ghi trong phong bì (`meta.command`), không theo loại việc (`meta.kind`).
    var command = String(req.meta && req.meta.command || ''), scanning = command === 'scanJob';
    if (command === 'pageKeyStore') { return Promise.resolve(storePageKey(req, trace)); }
    if (command === 'scanChunk') { return Promise.resolve().then(function () { return scanChunkResult(req.meta.job && req.meta.job.chunkIndex, trace, req); }); }
    if (scanning) { scanJob = null; }
    var sent = applyTransportReplacements(req, requestBody(req));
    var transportInstructions = req.transport || req.meta && req.meta.transport || {};
    var replacements = Array.isArray(transportInstructions.replacements) ? transportInstructions.replacements : [];
    if (replacements.some(function (replacement) { return String(sent || '').indexOf(String(replacement && replacement.token || '')) >= 0; })) {
      var captureError = new Error('Không lấy được giá trị transport do GAS yêu cầu; đã chặn trước khi gửi FBM.');
      captureError.code = 'FBM_TRANSPORT_CAPTURE_MISSING';
      traceEvent(trace, 'transport_capture_missing', req, Object.assign(payloadCookieDiagnostic(document.documentElement ? document.documentElement.innerHTML : ''), { code: captureError.code }));
      captureError.trace = trace;
      return Promise.reject(captureError);
    }
    // Hạn một lần fetch do GAS cấp trong envelope (Tài liệu 09/01 "Ngân sách một lượt"); executor không giữ con số riêng.
    var fetchMs = Math.max(0, Number(req.meta && req.meta.fetchMs || 0)), controller = new AbortController();
    var timer = setTimeout(function () { controller.abort(); }, fetchMs);
    traceEvent(trace, 'fetch_started', req);
    return fetch(String(req.url || ''), { method: req.method || 'POST', headers: req.headers || { 'content-type': 'application/json; charset=UTF-8' }, body: sent, credentials: 'include', cache: 'no-store', signal: controller.signal }).then(function (response) {
      var scanLimit = scanning && req.meta.job ? req.meta.job.maxResponseBytes : 0;
      return shape.readResponseText(response, scanLimit).then(function (body) {
        var captured = captureTransport(req, body);
        traceEvent(trace, 'fetch_finished', req, { httpStatus: response.status, responseLength: body.length });
        var data = null;
        // Response không phải grid (lỗi HTTP, trang đăng nhập, Bugs của FBM) đi nguyên về GAS để cổng phiên phân loại như request thường.
        if (scanning && response.ok) { try { data = shape.gridData(body); } catch (notGrid) { data = null; } }
        // Response không phải grid mà lớn hơn một gói thì không gửi nguyên về GAS (vượt trần đường truyền); trang đăng nhập hay Bugs của FBM vốn nhỏ nên vẫn đi nguyên.
        if (scanning && !data && body.length > Number(req.meta.job && req.meta.job.chunkMaxBytes || 0)) {
          var unparseable = new Error('Response FBM của việc quét không đọc được dạng bảng (' + Math.round(body.length / 1048576) + ' MB).');
          unparseable.code = 'FBM_SCAN_UNPARSEABLE';
          throw unparseable;
        }
        if (data) {
          var cut = shape.scanChunks(shape.replyPick(data, req.meta.keep), req.meta.job || {});
          scanJob = { jobId: String(req.meta.job.jobId || ''), chunks: cut.chunks, rowCount: cut.rowCount, keptCount: cut.keptCount, totalRowCount: cut.totalRowCount, oversize: cut.oversize };
          traceEvent(trace, 'scan_job_cut', req, { responseLength: body.length, code: 'chunks:' + cut.chunks.length });
          var first = scanChunkResult(0, trace, req);
          first.transport = Object.assign({}, captured, first.transport);
          return first;
        }
        var picked = response.ok ? shape.replyPickText(body, req.meta && req.meta.keep) : body;
        if (picked !== body) { traceEvent(trace, 'reply_picked', req, { responseLength: picked.length }); }
        return { ok: response.ok, status: response.status, headers: { contentType: response.headers.get('content-type') || '' }, body: picked, transport: Object.assign({}, captured, { trace: trace }) };
      });
    }).catch(function (err) {
      traceEvent(trace, 'fetch_finished', req, { error: String(err && err.message || err) });
      if (err && typeof err === 'object' && Object.isExtensible(err)) { err.trace = trace; }
      if (err && err.name === 'AbortError') {
        var timeout = new Error('FBM không phản hồi sau ' + Math.round(fetchMs / 1000) + ' giây.');
        timeout.code = 'FBM_FETCH_TIMEOUT'; timeout.trace = trace;
        throw timeout;
      }
      throw err;
    }).finally(function () { clearTimeout(timer); });
  }
  /** Chỉ nhận message đúng loại, giữ channel mở cho Promise fetch. */
  function onFbmMessage(message, sender, sendResponse) {
    if (message && message.type === 'FBM_PING_V2') { sendResponse({ ready: true, version: EXECUTOR_VERSION }); return false; }
    if (!message || message.type !== 'FBM_EXECUTE_V2') { return false; }
    execute(message.request).then(function (result) { sendResponse({ result: result }); }, function (err) { sendResponse({ error: String(err && err.message || err), code: String(err && err.code || 'FBM_TRANSPORT_UNAVAILABLE'), trace: err && err.trace || [] }); });
    return true;
  }
  if (globalThis.__SHINCRM_FBM_LISTENER__) { chrome.runtime.onMessage.removeListener(globalThis.__SHINCRM_FBM_LISTENER__); }
  globalThis.__SHINCRM_FBM_LISTENER__ = onFbmMessage;
  chrome.runtime.onMessage.addListener(onFbmMessage);
})();
