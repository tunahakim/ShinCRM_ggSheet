/**
 * Che bí mật trước khi ghi ra ngoài: nhận tên khóa bí mật, dựng nhãn che, che trong chuỗi và trong đối tượng. Tài liệu 10 Phần 7.
 *
 * Công cụ tính thuần, không biết bộ đệm hay Sheet. Nơi duy nhất che bí mật cho cả sheet `Log` (`server/log/LogGate.js`) và thông báo (`server/notice/NoticeGate.js`); che ở chỗ khác là có hai luật che lệch nhau.
 */

/** Tên khóa này có phải tên khóa giữ bí mật không. Khớp theo chuỗi con và không phân biệt hoa thường, nên `payloadCookie` và `ASP.NET_SessionId` đều trúng. Tài liệu 10 Phần 7. */
function logIsSecretKey(name) {
  var lower = String(name === null || name === undefined ? '' : name).toLowerCase();
  return SETTINGS.LOG_SECRET_KEYS.some(function (word) { return lower.indexOf(word) !== -1; });
}

/**
 * Dựng nhãn che cho một giá trị bí mật: `[132 ký tự · ASP. · #a3f1]`.
 *
 * Nhãn giữ đúng ba thứ hữu ích khi debug — độ dài, vài ký tự đầu, và một mã băm ngắn để so hai lần chạy xem có cùng một bí mật hay không — mà không mang giá trị thật ra ngoài. Nó thay `***` vì `***` không trả lời được câu nào trong ba câu đó.
 *
 * Mã băm ở đây là **dấu nhận dạng ngắn để so hai lần chạy**, không phải một phép bảo vệ. Bốn chữ số hex thì dò ra được, và điều đó không sao: thứ cần bảo vệ là giá trị thật, và giá trị thật không có trong nhãn.
 */
function logMaskLabel(value) {
  var text = String(value === null || value === undefined ? '' : value);
  var hash = '????';

  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text);
    hash = bytes.slice(0, 2).map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  } catch (khongBamDuoc) {
    hash = '????';
  }

  return '[' + text.length + ' ký tự · ' + text.slice(0, 4) + ' · #' + hash + ']';
}

/**
 * Che bí mật nằm trong một chuỗi, dạng `tên khóa: giá trị` hoặc `tên khóa=giá trị`.
 *
 * Phép này là **cố gắng hết sức, không phải bảo đảm**: nó chỉ thấy được bí mật nào đi kèm tên khóa của nó. Một chuỗi chỉ có giá trị trần, không có tên khóa nào cạnh, thì không có gì để nhận ra. Đường an toàn là bên gọi đưa `detail` dạng đối tượng — lúc đó tên khóa là tên khóa thật và phép che ăn chắc.
 */
function logMaskText(text) {
  return String(text).replace(/([A-Za-z_][\w.\-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;&}]+)/g, function (all, key, raw) {
    if (!logIsSecretKey(key)) { return all; }
    return key + ': ' + logMaskLabel(raw.replace(/^["']/, '').replace(/["']$/, ''));
  });
}

/** Dựng bản sao đã che của một giá trị bất kỳ. Đi sâu vào đối tượng và mảng, dừng ở độ sâu 5 để một cấu trúc tự trỏ vào chính nó không làm treo lượt chạy. */
function logMaskCopy(value, depth) {
  if (value === null || value === undefined) { return value; }
  if (depth > 5) { return '[lồng quá sâu]'; }
  if (typeof value === 'string') { return logMaskText(value); }
  if (typeof value !== 'object') { return value; }
  // Nhận Date bằng `Object.prototype.toString` chứ không bằng `instanceof Date`: `instanceof` trả về false khi đối tượng
  // sinh ra ở một vùng chạy khác (different realm — hai môi trường JavaScript khác nhau). Bộ kiểm offline nạp code trong
  // hộp cát `vm` chính là hoàn cảnh đó, nên với `instanceof` thì luật này không có cách nào kiểm được trên máy — mà một
  // luật không kiểm được là một luật không có ai canh.
  if (Object.prototype.toString.call(value) === '[object Date]') { return Utilities.formatDate(value, LOG_TIMEZONE, LOG_TIME_FORMAT); }
  if (Array.isArray(value)) {
    return value.map(function (item) { return logMaskCopy(item, depth + 1); });
  }

  var out = {};
  Object.keys(value).forEach(function (key) {
    out[key] = logIsSecretKey(key) ? logMaskLabel(value[key]) : logMaskCopy(value[key], depth + 1);
  });
  return out;
}
