/** Hợp đồng GAS/Extension; Extension chỉ chuyển response FBM dạng thô. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.protocol = {
  version: 1,
  /** Tạo envelope có id để ghép đúng response với request. */
  request: function (id, url, body, meta) {
    return { protocol: 'shincrm-fbm', version: 1, id: String(id), url: url, method: 'POST', headers: { 'content-type': 'application/json; charset=UTF-8' }, body: body, meta: meta || {} };
  },
  /** Serialize body, dùng null khi không có giá trị. */
  json: function (value) { return JSON.stringify(value === undefined ? null : value); },
  /** Parse response thô, envelope transport hoặc JSON lồng của FBM. */
  parse: function (raw) {
    if (raw === null || raw === undefined || raw === '') { return null; }
    var transport = null;
    if (raw && typeof raw === 'object' && Object.prototype.hasOwnProperty.call(raw, 'body') && Object.prototype.hasOwnProperty.call(raw, 'status')) {
      transport = raw.transport || null;
      if (raw.ok === false && Number(raw.status) >= 400) {
        return { Bugs: { FieldName: '$HTTP', Message: FbmSync.protocol.httpErrorMessage(raw.status, raw.body) }, _transport: transport };
      }
      raw = raw.body;
    }
    if (typeof raw === 'object') { if (transport) { raw._transport = transport; } return raw; }
    try { var parsed = JSON.parse(String(raw)); if (transport && parsed && typeof parsed === 'object') { parsed._transport = transport; } return parsed; } catch (err) { return { raw: String(raw), parseError: err.message, _transport: transport }; }
  },
  /** Giữ lại lỗi FBM ngắn gọn để người dùng biết vì sao request ghi bị từ chối. */
  httpErrorMessage: function (status, body) {
    var detail = '';
    try {
      var parsed = JSON.parse(String(body || ''));
      var data = parsed && (parsed.d || parsed);
      var bug = data && data.Bugs;
      detail = bug && (bug.Message || bug.message) || '';
    } catch (ignore) {}
    if (!detail) {
      detail = String(body || '').replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 240);
    }
    return 'HTTP ' + status + (detail ? ': ' + detail : '');
  },
  /** FBM đôi khi trả trang đăng nhập với HTTP 200 thay vì 401/403. */
  isSessionExpired: function (response) {
    var parsed = FbmSync.protocol.parse(response) || {};
    var body = parsed && parsed.raw !== undefined ? String(parsed.raw) : String((response && response.body) || '');
    return /(?:Login\.aspx|name\s*=\s*["'](?:username|userName)["']|id\s*=\s*["'](?:login|loginForm)["'])/i.test(body);
  },
  /** Phân loại lỗi để orchestration biết khi nào được retry. */
  classifyFailure: function (response) {
    if (response && typeof response === 'object' && response.ok === false && Number(response.status) >= 500 && !String(response.body || '').trim()) {
      return { code: 'TRANSPORT_ERROR', retryable: true, bug: { FieldName: '$HTTP', Message: FbmSync.protocol.httpErrorMessage(response.status, response.body) } };
    }
    var parsed = FbmSync.protocol.parse(response) || {};
    var bug = FbmSync.protocol.fbmBug(parsed);
    if (FbmSync.protocol.isSessionExpired(response)) { return { code: 'SESSION_EXPIRED', retryable: false, bug: { FieldName: '$SESSION', Message: 'Phiên FBM đã hết hạn; hãy đăng nhập lại.' } }; }
    if (parsed.parseError) { return { code: 'PARSE_ERROR', retryable: true, bug: { FieldName: '$PARSE', Message: parsed.parseError } }; }
    if (bug) { return { code: 'FBM_BUSINESS_ERROR', retryable: false, bug: bug }; }
    if (response && response.ok === false) { return { code: 'TRANSPORT_ERROR', retryable: true, bug: { FieldName: '$HTTP', Message: FbmSync.protocol.httpErrorMessage(response.status, response.body) } }; }
    return null;
  },
  /** Lấy Bugs mà không buộc Extension hiểu nghiệp vụ FBM. */
  fbmBug: function (response) {
    var parsed = FbmSync.protocol.parse(response) || {};
    var data = parsed.d || parsed;
    return data && data.Bugs ? data.Bugs : null;
  },
  /** Chuẩn hóa kết quả thành cặp ok/bug cho orchestration. */
  assertSuccess: function (response) {
    var failure = FbmSync.protocol.classifyFailure(response);
    if (failure) { return { ok: false, code: failure.code, retryable: failure.retryable, bug: failure.bug }; }
    return { ok: true };
  }
};

/** API tương thích cho caller cần parse response trực tiếp. */
function fbmSyncProtocolParse(raw) { return FbmSync.protocol.parse(raw); }
