/**
 * Công cụ quét mã nguồn trong `tests/lib/quet/`: liệt kê tệp GAS, tên lớp CSS có luật, so ngoại lệ chỉ co lại.
 *
 * Nhánh dễ hỏng âm thầm: liệt kê hụt thư mục con nên phép quét không quét gì; so ngoại lệ bỏ lọt trường hợp số giảm hoặc tệp đã sạch, làm danh sách đứng yên mãi.
 */

const { section, check } = require('../../lib/assert');
const { liet } = require('../../lib/quet/liet-tep');
const { lopCoLuat } = require('../../lib/quet/lop-css');
const { compareExceptions } = require('../../lib/quet/ngoai-le');

function chay(so) {
  section('Công cụ quét — liệt kê tệp, lớp CSS, ngoại lệ chỉ co lại');

  const server = liet('server', '.js');
  check(so, 'liet: đi cả thư mục con, đường dẫn dùng dấu /, đã sắp', [
    server.some((t) => t.split('/').length > 2), server.every((t) => t.indexOf('\\') < 0), server.slice().sort().join() === server.join()
  ], [true, true, true]);
  check(so, 'liet: thư mục không có thì trả mảng rỗng', liet('khongCoThuMucNay', '.js'), []);

  check(so, 'lopCoLuat: lấy mọi lớp trong bộ chọn nhiều mắt, không lặp',
    lopCoLuat('.a .b, .c:hover { x: 1 }\n.a { y: 2 }').sort(),
    ['a', 'b', 'c']);

  const v = (line) => ({ line: line, text: 'x' });
  const thuc = { 'moi.js': [v(1)], 'tang.js': [v(1), v(2)], 'giam.js': [v(3)], 'bang.js': [v(4)] };
  const ghi = { 'tang.js': 1, 'giam.js': 2, 'bang.js': 1, 'sach.js': 1 };
  const loi = compareExceptions('r', thuc, ghi);
  check(so, 'compareExceptions: bắt vi phạm mới, số tăng, số giảm chưa hạ, tệp sạch chưa xóa; số bằng thì đạt', [
    loi.length, /vi phạm mới ở moi\.js/.test(loi.join()), /tang\.js có 2/.test(loi.join()), /giam\.js đã giảm/.test(loi.join()), /sach\.js không còn/.test(loi.join()), /bang\.js/.test(loi.join())
  ], [4, true, true, true, true, false]);
}

module.exports = { chay };
