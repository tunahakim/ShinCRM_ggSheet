/** Liệt kê tệp trong dự án GAS cho các phép quét mã nguồn. */

const fs = require('fs');
const path = require('path');
const { GAS_DIR } = require('../load-gas');

/** Liệt kê tệp theo đuôi trong một thư mục con của dự án GAS. Thư mục không có thì trả về mảng rỗng, vì có thư mục chưa dựng là chuyện bình thường. */
function liet(thuMuc, duoi) {
  const goc = path.join(GAS_DIR, thuMuc);
  if (!fs.existsSync(goc)) { return []; }

  const ra = [];
  (function di(hienTai) {
    fs.readdirSync(hienTai, { withFileTypes: true }).forEach((muc) => {
      const day = path.join(hienTai, muc.name);
      if (muc.isDirectory()) { di(day); }
      else if (muc.name.endsWith(duoi)) { ra.push(path.relative(GAS_DIR, day).split(path.sep).join('/')); }
    });
  })(goc);
  return ra.sort();
}

module.exports = { liet };
