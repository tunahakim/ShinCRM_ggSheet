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
        return { Bugs: { FieldName: '$HTTP', Message: 'HTTP ' + raw.status }, _transport: transport };
      }
      raw = raw.body;
    }
    if (typeof raw === 'object') { if (transport) { raw._transport = transport; } return raw; }
    try { var parsed = JSON.parse(String(raw)); if (transport && parsed && typeof parsed === 'object') { parsed._transport = transport; } return parsed; } catch (err) { return { raw: String(raw), parseError: err.message, _transport: transport }; }
  },
  /** Lấy Bugs mà không buộc Extension hiểu nghiệp vụ FBM. */
  fbmBug: function (response) {
    var parsed = FbmSync.protocol.parse(response) || {};
    var data = parsed.d || parsed;
    return data && data.Bugs ? data.Bugs : null;
  },
  /** Chuẩn hóa kết quả thành cặp ok/bug cho orchestration. */
  assertSuccess: function (response) {
    response = FbmSync.protocol.parse(response) || {};
    if (response && response.parseError) { return { ok: false, bug: { FieldName: '$PARSE', Message: response.parseError } }; }
    var bug = FbmSync.protocol.fbmBug(response);
    if (bug) { return { ok: false, bug: bug }; }
    return { ok: true };
  }
};

/** API tương thích cho caller cần parse response trực tiếp. */
function fbmSyncProtocolParse(raw) { return FbmSync.protocol.parse(raw); }
