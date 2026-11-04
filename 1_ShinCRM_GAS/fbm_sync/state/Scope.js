/** Phạm vi khách của lượt đồng bộ (danh sách khách chỉ định trong phần cài đặt `fbm_run`) và khoảng nghỉ giữa hai request gửi kèm envelope. Danh sách nhận cả mã FBM lẫn mã ShinCRM; GAS đổi mã ra khách nên lượt hai chiều chạy cả hai chiều cho khách nhập bằng một loại mã (Tài liệu 09/07 "Tham số phiên FBM"). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Đánh dấu mã FBM chưa có trên Sheet mà đúng tiền tố nhưng khác độ dài mã FBM trong cài đặt tài khoản: chỉ để cảnh báo, không chặn lưu, vì FBM có thể đổi độ dài mã mà cài đặt chưa kịp sửa.
 * Thiếu tiền tố hoặc độ dài trong cài đặt thì không đánh dấu gì.
 */
FbmSync.scopeLengthMark = function (lines, account) {
  var prefix = String(account && account.customerPrefix || '').trim().toUpperCase(), length = Number(account && account.customerCodeLength || 0);
  if (!prefix || !length) { return lines; }
  return (lines || []).map(function (line) {
    var code = String(line.code || '').trim();
    return line.status === 'fbm_new' && code.toUpperCase().indexOf(prefix) === 0 && code.length !== length ? Object.assign({}, line, { lengthExpected: length }) : line;
  });
};

/** Khoảng nghỉ gửi kèm envelope theo mili-giây; Extension chọn ngẫu nhiên trong khoảng này trước mỗi request FBM. */
FbmSync.requestGapMs = function (settings) {
  var source = settings || {};
  return { minMs: Math.round(Number(source.requestGapMinSeconds || 0) * 1000), maxMs: Math.round(Number(source.requestGapMaxSeconds || 0) * 1000) };
};

/**
 * Đổi danh sách mã ra khách: mã khớp khuôn cổng cấp mã ShinCRM tra theo mã khách, mã khác tra theo cột mã FBM, nên không mã nào mang hai nghĩa.
 * `fbm` lọc grid Customer (gồm cả mã FBM chưa có trên Sheet, tức khách mới bên FBM); `shin` lọc chiều ghi. Khách đã ghép cặp nhập mã nào cũng vào cả hai.
 * Công cụ tính (thuần): `customers` là danh sách khách bên gọi đã đọc.
 */
FbmSync.scopeResolve = function (codes, customers) {
  var byId = {}, byFbm = {}, fbm = [], shin = [], lines = [];
  var add = function (list, value) { if (value && list.indexOf(value) < 0) { list.push(value); } };
  customers.forEach(function (customer) {
    var id = String(customer.id || '').trim(), fbmCode = String(customer.fbmCustomerCode || '').trim();
    if (id) { byId[id] = customer; }
    if (fbmCode) { byFbm[fbmCode] = customer; }
  });
  (codes || []).forEach(function (code) {
    var kind = idGateMatches('customer', code) ? 'shin' : 'fbm', customer = kind === 'shin' ? byId[code] : byFbm[code];
    if (!customer) {
      if (kind === 'fbm') { add(fbm, code); }
      lines.push({ code: code, kind: kind, status: kind === 'shin' ? 'not_found' : 'fbm_new', customerId: '', fbmCode: kind === 'fbm' ? code : '' });
      return;
    }
    var customerId = String(customer.id || '').trim(), fbmCode = String(customer.fbmCustomerCode || '').trim();
    add(shin, customerId); add(fbm, fbmCode);
    lines.push({ code: code, kind: kind, status: 'matched', customerId: customerId, fbmCode: fbmCode });
  });
  return { fbm: fbm, shin: shin, lines: lines };
};

/** Phạm vi của lượt chạy: `null` khi không giới hạn (đọc và ghi toàn bộ), ngược lại `{ codes, fbm, shin, fbmNew, notFound }` (`fbmNew`: mã FBM chưa có trên Sheet); danh sách rỗng lọc ra rỗng chứ không rơi thành toàn bộ. */
FbmSync.scope = function () {
  var settings = settingsValues(FbmSync.SETTING_SECTIONS.run);
  if (settings.scopeLimited === false) { return null; }
  // Sheet Customer đọc qua bản chụp của lần gọi, nên gọi nhiều lần trong một lời gọi GAS không đọc lại Sheet.
  var resolved = FbmSync.scopeResolve(settings.scopeCodes, FbmSync.readLocal('customer'));
  return { codes: settings.scopeCodes.slice(), fbm: resolved.fbm, shin: resolved.shin, fbmNew: resolved.lines.filter(function (line) { return line.status === 'fbm_new'; }).map(function (line) { return line.code; }), notFound: resolved.lines.filter(function (line) { return line.status === 'not_found'; }).map(function (line) { return line.code; }) };
};

