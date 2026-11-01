/** Đọc tên khai báo ở tầng ngoài cùng của mã GAS: mọi tệp Apps Script chung một không gian tên, nên khai báo ở cột 0 là tên toàn cục. */

/** Khai báo ở cột 0: `var TÊN` hoặc `function TÊN(`. */
const MO_KHAI_BAO = /^(?:var|let|const)\s+([A-Za-z_$][\w$]*)|^function\s+([A-Za-z_$][\w$]*)\s*\(/gm;

/** Bảng khai mở `var X = typeof X !== 'undefined' ? X : {};`: lõi và module cùng khai để không phụ thuộc thứ tự nạp tệp, mỗi bên chỉ thêm khóa của mình nên không tranh nhau. */
const BANG_KHAI_MO = /^var\s+([A-Za-z_$][\w$]*)\s*=\s*typeof\s+\1\s*!==\s*'undefined'\s*\?\s*\1\s*:\s*\{\};/;

/** Lấy danh sách tên khai báo ở tầng ngoài cùng của một đoạn mã, bỏ qua bảng khai mở. */
function tenKhaiBao(code) {
  const ten = [];
  let khop;
  MO_KHAI_BAO.lastIndex = 0;
  while ((khop = MO_KHAI_BAO.exec(code)) !== null) {
    if (BANG_KHAI_MO.test(code.slice(khop.index, code.indexOf('\n', khop.index) >>> 0))) { continue; }
    ten.push(khop[1] || khop[2]);
  }
  return ten;
}

module.exports = { tenKhaiBao };
