/**
 * Khung nạp Sidebar trong `tests/lib/sidebar/`: thứ tự nạp lấy từ `client/Sidebar.html`, tệp ngoài Sidebar thì nổ, duyệt cây node.
 *
 * Nhánh dễ hỏng âm thầm: đọc hụt dòng `include()` nên danh sách rỗng, nạp theo thứ tự người gọi thay vì thứ tự Sidebar, nạp được tệp mà Sidebar thật không nạp.
 */

const { section, check, checkThrows } = require('../../lib/assert');
const { tepSidebar, xepTheoSidebar, napTheoSidebar } = require('../../lib/sidebar/nap-sidebar');
const { moiNode } = require('../../lib/sidebar/schema-node');
const { docTep } = require('../../lib/load-gas');

function chay(so) {
  section('Khung test Sidebar — thứ tự nạp theo Sidebar.html, duyệt cây node');

  const thuTu = tepSidebar();
  const soInclude = (docTep('client/Sidebar.html').match(/include\('/g) || []).length;
  check(so, 'tepSidebar: đủ mọi dòng include() của Sidebar, có đuôi .html', [thuTu.length, thuTu.every((t) => t.endsWith('.html'))], [soInclude, true]);

  const hai = [thuTu[thuTu.length - 1], thuTu[0].replace(/\.html$/, '')];
  check(so, 'xepTheoSidebar: xếp theo thứ tự Sidebar, nhận cả tên thiếu đuôi', xepTheoSidebar(hai), [thuTu[0], thuTu[thuTu.length - 1]]);
  checkThrows(so, 'xepTheoSidebar: tệp không có trong Sidebar thì ném lỗi nêu tên', () => xepTheoSidebar(['client/KhongCo.html']), 'client/KhongCo.html');

  const tepJs = thuTu.filter((t) => /<script>/.test(docTep(t)));
  const hop = napTheoSidebar([tepJs[0]]);
  check(so, 'napTheoSidebar: tạo hộp mới khi không truyền hộp và nạp được tệp', typeof hop === 'object' && hop !== null, true);

  const cay = [{ role: 'a', elements: [{ role: 'b', elements: [{ role: 'c' }] }, null, { khongRole: true }] }, { role: 'd' }];
  check(so, 'moiNode: lấy cả con của con, bỏ node rỗng hoặc thiếu role', moiNode(cay, []).map((n) => n.role), ['a', 'b', 'c', 'd']);
}

module.exports = { chay };
