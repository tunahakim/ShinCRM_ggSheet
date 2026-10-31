/** Liệt kê tệp cho các phép quét mã nguồn. */

const fs = require('fs');
const path = require('path');
const { GAS_DIR } = require('../load-gas');

/** Liệt kê tệp mà `khop(tên)` nhận, trong `thuMuc` tính từ `coSo`, đi cả thư mục con; đường dẫn tính từ `coSo`, dấu `/`, đã sắp. Thư mục không có thì trả về mảng rỗng, vì có thư mục chưa dựng là chuyện bình thường. Bỏ thư mục `node_modules` và thư mục bắt đầu bằng dấu chấm: không phải mã của dự án. */
function lietTrong(coSo, thuMuc, khop) {
  const goc = path.join(coSo, thuMuc);
  if (!fs.existsSync(goc)) { return []; }

  const ra = [];
  (function di(hienTai) {
    fs.readdirSync(hienTai, { withFileTypes: true }).forEach((muc) => {
      const day = path.join(hienTai, muc.name);
      if (muc.isDirectory()) {
        if (muc.name !== 'node_modules' && muc.name.charAt(0) !== '.') { di(day); }
      } else if (khop(muc.name)) { ra.push(path.relative(coSo, day).split(path.sep).join('/')); }
    });
  })(goc);
  return ra.sort();
}

/** Liệt kê tệp theo đuôi trong một thư mục con của dự án GAS. */
function liet(thuMuc, duoi) {
  return lietTrong(GAS_DIR, thuMuc, (ten) => ten.endsWith(duoi));
}

module.exports = { liet, lietTrong };
