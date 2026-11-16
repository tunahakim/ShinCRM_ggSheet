/* Cầu nối FBM: nhận request, fetch trong tab đăng nhập, trả response thô. */
(function () {
  var EXECUTOR_VERSION = chrome.runtime.getManifest().version;
  /** Mã request trong vết là mã GAS cấp (`meta.trace.requestId`); phần tử lô có `id` chỉ là thứ tự trong lô, dùng nó thì GAS coi response là cũ và bỏ. */
  function traceEvent(trace, stage, request, extra) {
    var reservation = request && request.meta && request.meta.trace && request.meta.trace.requestId;
    trace.push(Object.assign({ at: Date.now(), stage: stage, requestId: String(reservation || request && request.id || '') }, extra || {}));
  }
  function requestBody(req) {
    if (typeof req.bodyText === 'string') { return req.bodyText; }
    if (req.body == null) { return undefined; }    return typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
  }
  /** Chỉ thu thập giá trị trên trang để thay token request do GAS cấp. */
  function captureTransportValues(request, responseBody, sourceName) {
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, captures = Array.isArray(transport.captures) ? transport.captures : [], values = {};
    captures.forEach(function (capture) {
      var item = capture || {}, kind = sourceName || item.source, sources = kind === 'page_html'
        ? [document.documentElement ? document.documentElement.innerHTML : '', document.documentElement ? document.documentElement.textContent || '' : '']
        : [String(responseBody || '')], pattern = String(item.pattern || ''), flags = String(item.flags || ''), match;
      if (!pattern) { return; }
      for (var index = 0; index < sources.length; index += 1) {
        if (!sources[index]) { continue; }
        try { match = String(sources[index]).match(new RegExp(pattern, flags)); } catch (ignore) { return; }
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
    var transport = request && request.transport || request && request.meta && request.meta.transport || {}, replacements = Array.isArray(transport.replacements) ? transport.replacements : [], values = captureTransportValues(request, '', ''), output = bodyText;
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
  /** Việc quét vượt trần cỡ response: không gửi gì về GAS ngoài mã lỗi, GAS tự chia nhỏ theo khoảng ngày. */
  function responseTooLarge(maxBytes) {
    var error = new Error('Response FBM vượt ' + Math.round(maxBytes / 1048576) + ' MB của một lần quét.');
    error.code = 'FBM_SCAN_TOO_LARGE';
    return error;
  }
  /** Có trần thì đọc dần và dừng ngay khi vượt, để tab không phải giữ cả response khổng lồ rồi mới biết. */
  function readResponseBytes(response, maxBytes) {
    var limit = Number(maxBytes || 0);
    if (!(limit > 0) || !response.body || typeof response.body.getReader !== 'function') {
      return response.arrayBuffer().then(function (buffer) {
        if (limit > 0 && buffer.byteLength > limit) { throw responseTooLarge(limit); }
        return new Uint8Array(buffer);
      });
    }
    var reader = response.body.getReader(), parts = [], total = 0;
    function pump() {
      return reader.read().then(function (step) {
        if (step.done) {
          var bytes = new Uint8Array(total), offset = 0;
          parts.forEach(function (part) { bytes.set(part, offset); offset += part.length; });
          return bytes;
        }
        total += step.value.length;
        if (total > limit) { try { reader.cancel(); } catch (ignore) {} throw responseTooLarge(limit); }
        parts.push(step.value);
        return pump();
      });
    }
    return pump();
  }
  /** Thực thi fetch và luôn trả body dạng text để GAS tự parse. */
  /** Giai ma ca response gzip bi FBM tra tho, tranh GAS nhan chuoi 1F 8B. */
  function readResponseText(response, maxBytes) {
    var limit = Number(maxBytes || 0);
    return readResponseBytes(response, limit).then(function (bytes) {
      var gzip = bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b;
      if (gzip && typeof DecompressionStream === 'function') {
        var stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'));
        return new Response(stream).text().then(function (text) {
          if (limit > 0 && text.length > limit) { throw responseTooLarge(limit); }
          return text;
        });
      }
      if (typeof TextDecoder === 'function') { return new TextDecoder('utf-8').decode(bytes); }
      return String.fromCharCode.apply(null, bytes);
    });
  }
  /**
   * Việc quét (Tài liệu 09/01 "Việc quét"): gọi FBM một lần, giữ cột GAS liệt kê, cắt dòng thành gói nhỏ hơn trần đường relay và giữ trong RAM của tab theo `jobId`; `scan_chunk` trả gói từ RAM, không gọi FBM lại.
   * Mỗi tab giữ một việc, việc mới thay việc cũ. Tab tải lại thì mất việc và GAS nhận `FBM_SCAN_JOB_GONE`. Extension không hiểu nghiệp vụ: không đổi giá trị ô, không chọn dòng ngoài danh sách id GAS gửi.
   */
  var scanJob = null;
  function utf8Length(text) { return new TextEncoder().encode(text).length; }
  /** Byte của đoạn văn bản khi nằm trong chuỗi `body` của response JSON (đã thoát ký tự), vì trần đo trên gói đã serialize. */
  function quotedLength(text) { return utf8Length(JSON.stringify(String(text))) - 2; }
  /** Lưới là response có mảng `Rows`; response khác (lỗi FBM, trang đăng nhập) trả null để đi nguyên về GAS. */
  function gridData(text) {
    var parsed = JSON.parse(String(text || '')), data = parsed && parsed.d !== undefined ? parsed.d : parsed;
    if (typeof data === 'string') { data = JSON.parse(data); }
    return data && Array.isArray(data.Rows) ? data : null;
  }
  function fieldName(field) { return String(field && (field.AliasName || field.aliasName || field.Name || field.name) || ''); }
  /**
   * Cắt response lưới theo lệnh `keep` của GAS: dòng chỉ còn các cột GAS cần, đúng thứ tự GAS gửi; bỏ mô tả cột, bố cục và script của FBM. Tên cột cần không gửi về vì GAS đã biết.
   * `keep.fields` (trang có tiêu đề): tìm vị trí theo tên trong tiêu đề, trả thêm `SourceFields` là tên cột gốc để GAS tính vị trí cho các trang không tiêu đề. `keep.positions` với `keep.width` (trang không tiêu đề): cắt theo vị trí GAS tính.
   * Thiếu cột theo tên, hoặc có dòng mang số cột khác, thì không trả dòng mà báo `MissingFields`/`ShapeMismatch` để GAS dừng: cắt tiếp thì ô bị dồn và GAS đọc nhầm trường.
   * Giữ `Authorized` và `Bugs` để cổng phiên và cổng lỗi của GAS vẫn phân loại được (FBM báo chưa đăng nhập bằng `Authorized:false` với lưới rỗng). Chạy trong tab vì response quét có thể vài MB, không ra khỏi tab được.
   */
  function replyPick(data, keep) {
    var source = data.ViewPage && Array.isArray(data.ViewPage.Fields) ? data.ViewPage.Fields.map(fieldName) : null, byName = Array.isArray(keep.fields);
    var positions = byName ? keep.fields.map(function (name) { return source ? source.indexOf(String(name)) : -1; }) : (Array.isArray(keep.positions) ? keep.positions : []).map(Number);
    var width = source ? source.length : keep.width, out = { Rows: [], TotalRowCount: Number(data.TotalRowCount || 0) };
    if (data.Authorized !== undefined) { out.Authorized = data.Authorized; }
    if (data.Bugs !== undefined && data.Bugs !== null) { out.Bugs = data.Bugs; }
    if (source) { out.SourceFields = source; }
    var missing = byName ? keep.fields.filter(function (name, index) { return positions[index] < 0; }).map(String) : [];
    if (missing.length) { out.MissingFields = missing; return out; }
    if (width !== undefined && width !== null && data.Rows.some(function (row) { return !Array.isArray(row) || row.length !== Number(width); })) { out.ShapeMismatch = { width: Number(width) }; return out; }
    out.Rows = data.Rows.map(function (row) { return positions.map(function (position) { return row[position] === undefined ? null : row[position]; }); });
    return out;
  }
  /** Response lưới thì giữ cột theo `keep`; không phải lưới hoặc không có `keep` thì trả nguyên văn bản. */
  function replyPickText(text, keep) {
    if (!keep) { return text; }
    var data = null;
    try { data = gridData(text); } catch (notGrid) { return text; }
    return data ? JSON.stringify({ d: replyPick(data, keep) }) : text;
  }
  /** Cắt gói từ lưới đã qua `replyPick`; một dòng không bao giờ bị cắt đôi, dòng riêng nó đã vượt trần thì không gửi mà báo id trong `oversize`. Vị trí cột mã (`job.idIndex`) do GAS tính; tên cột gốc chỉ đi trong gói 0. */
  function scanChunks(data, job) {
    var idIndex = Number(job.idIndex), keep = Array.isArray(job.keepIds) ? {} : null, total = Number(data.TotalRowCount || 0), head = {};
    if (keep) { job.keepIds.forEach(function (id) { keep[String(id)] = true; }); }
    Object.keys(data).forEach(function (key) { if (key !== 'Rows' && key !== 'SourceFields') { head[key] = data[key]; } });
    var headText = JSON.stringify(head).slice(1, -1), firstText = data.SourceFields ? JSON.stringify({ SourceFields: data.SourceFields }).slice(1, -1) : '';
    var shell = function (rowsText, first) { return '{"d":{"Rows":[' + rowsText + ']' + (headText ? ',' + headText : '') + (first && firstText ? ',' + firstText : '') + '}}'; };
    // Phần cố định của một gói: thân rỗng (gói 0 có thêm tên cột gốc), khối `job` và dấu vết vận chuyển; dư 4 KiB cho trace, mã hợp đồng và wrapper relay.
    var fixed = quotedLength(shell('', true)) + utf8Length(JSON.stringify({ ok: true, status: 200, headers: { contentType: 'application/json; charset=utf-8' }, body: '', job: { jobId: job.jobId, chunkIndex: 0, chunkCount: 0, rowCount: 0, keptCount: 0, totalRowCount: total, oversize: [] } })) + 4096;
    var target = Number(job.chunkTargetBytes || 0), max = Number(job.chunkMaxBytes || 0), chunks = [], current = [], size = fixed, oversize = [], kept = 0;
    data.Rows.forEach(function (row) {
      if (keep && !keep[String(row[idIndex])]) { return; }
      var text = JSON.stringify(row), bytes = quotedLength(text) + 1;
      kept += 1;
      if (fixed + bytes > max) { oversize.push(String(row[idIndex] === undefined ? '' : row[idIndex])); return; }
      if (current.length && size + bytes > target) { chunks.push(shell(current.join(','), !chunks.length)); current = []; size = fixed; }
      current.push(text); size += bytes;
    });
    if (current.length || !chunks.length) { chunks.push(shell(current.join(','), !chunks.length)); }
    return { chunks: chunks, rowCount: data.Rows.length, keptCount: kept, totalRowCount: total, oversize: oversize };
  }
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
    if (req.meta && req.meta.command === 'pageKeyStore') { return Promise.resolve(storePageKey(req, trace)); }
    if (req.meta && req.meta.kind === 'scan_chunk') { return Promise.resolve().then(function () { return scanChunkResult(req.meta.job && req.meta.job.chunkIndex, trace, req); }); }
    if (req.meta && req.meta.kind === 'scan_job') { scanJob = null; }
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
      var scanLimit = req.meta && req.meta.kind === 'scan_job' && req.meta.job ? req.meta.job.maxResponseBytes : 0;
      return readResponseText(response, scanLimit).then(function (body) {
        var captured = captureTransport(req, body);
        traceEvent(trace, 'fetch_finished', req, { httpStatus: response.status, responseLength: body.length });
        var data = null;
        // Response không phải grid (lỗi HTTP, trang đăng nhập, Bugs của FBM) đi nguyên về GAS để cổng phiên phân loại như request thường.
        if (req.meta && req.meta.kind === 'scan_job' && response.ok) { try { data = gridData(body); } catch (notGrid) { data = null; } }
        // Response không phải grid mà lớn hơn một gói thì không gửi nguyên về GAS (vượt trần đường truyền); trang đăng nhập hay Bugs của FBM vốn nhỏ nên vẫn đi nguyên.
        if (req.meta && req.meta.kind === 'scan_job' && !data && body.length > Number(req.meta.job && req.meta.job.chunkMaxBytes || 0)) {
          var unparseable = new Error('Response FBM của việc quét không đọc được dạng bảng (' + Math.round(body.length / 1048576) + ' MB).');
          unparseable.code = 'FBM_SCAN_UNPARSEABLE';
          throw unparseable;
        }
        if (data) {
          var cut = scanChunks(replyPick(data, req.meta.keep), req.meta.job || {});
          scanJob = { jobId: String(req.meta.job.jobId || ''), chunks: cut.chunks, rowCount: cut.rowCount, keptCount: cut.keptCount, totalRowCount: cut.totalRowCount, oversize: cut.oversize };
          traceEvent(trace, 'scan_job_cut', req, { responseLength: body.length, code: 'chunks:' + cut.chunks.length });
          var first = scanChunkResult(0, trace, req);
          first.transport = Object.assign({}, captured, first.transport);
          return first;
        }
        var picked = response.ok ? replyPickText(body, req.meta && req.meta.keep) : body;
        if (picked !== body) { traceEvent(trace, 'reply_picked', req, { responseLength: picked.length }); }
        return { ok: response.ok, status: response.status, headers: { contentType: response.headers.get('content-type') || '' }, body: picked, transport: Object.assign({}, captured, { trace: trace }) };
      });
    }).catch(function (err) {
      traceEvent(trace, 'fetch_finished', req, { error: String(err && err.message || err) });
      try { err.trace = trace; } catch (ignore) {}
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
  try {
    if (globalThis.__SHINCRM_FBM_LISTENER__) { chrome.runtime.onMessage.removeListener(globalThis.__SHINCRM_FBM_LISTENER__); }
  } catch (ignore) {}
  globalThis.__SHINCRM_FBM_LISTENER__ = onFbmMessage;
  chrome.runtime.onMessage.addListener(onFbmMessage);
})();
