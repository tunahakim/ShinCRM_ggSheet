/** Liệt kê tệp cho các phép quét mã nguồn. */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { GAS_DIR } = require('../load-gas');

const GOC_REPO = path.join(__dirname, '..', '..', '..');
let boQua = null;

/** Tệp Git bỏ qua (`.gitignore`) là tệp sinh ra hoặc của máy riêng, không phải mã dự án; đọc một lần cho cả lần chạy test. Git lỗi thì ném, không quét lẫn tệp sinh ra. */
function tepBoQua() {
  if (!boQua) {
    const ra = execFileSync('git', ['ls-files', '--others', '--ignored', '--exclude-standard', '-z'], { cwd: GOC_REPO, encoding: 'utf8' });
    boQua = new Set(ra.split('\0').filter(Boolean).map((tep) => path.join(GOC_REPO, tep)));
  }
  return boQua;
}

/** Liệt kê tệp mà `khop(tên)` nhận, trong `thuMuc` tính từ `coSo`, đi cả thư mục con; đường dẫn tính từ `coSo`, dấu `/`, đã sắp. Thư mục không có thì trả về mảng rỗng, vì có thư mục chưa dựng là chuyện bình thường. Bỏ thư mục `node_modules`, thư mục bắt đầu bằng dấu chấm và tệp Git bỏ qua: không phải mã của dự án. */
function lietTrong(coSo, thuMuc, khop) {
  const goc = path.join(coSo, thuMuc);
  if (!fs.existsSync(goc)) { return []; }

  const ra = [];
  (function di(hienTai) {
    fs.readdirSync(hienTai, { withFileTypes: true }).forEach((muc) => {
      const day = path.join(hienTai, muc.name);
      if (muc.isDirectory()) {
        if (muc.name !== 'node_modules' && muc.name.charAt(0) !== '.') { di(day); }
      } else if (khop(muc.name) && !tepBoQua().has(day)) { ra.push(path.relative(coSo, day).split(path.sep).join('/')); }
    });
  })(goc);
  return ra.sort();
}

/** Liệt kê tệp theo đuôi trong một thư mục con của dự án GAS. */
function liet(thuMuc, duoi) {
  return lietTrong(GAS_DIR, thuMuc, (ten) => ten.endsWith(duoi));
}

module.exports = { liet, lietTrong };
