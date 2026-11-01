/**
 * Nạp tệp client của Sidebar vào hộp cát theo đúng thứ tự `include()` của `client/Sidebar.html`.
 *
 * Vì sao đọc từ Sidebar.html: trước đây mỗi tệp ca gõ tay danh sách tệp và thứ tự nạp, và danh sách tay lệch dần với Sidebar thật mà không ai biết. Ở đây tệp ca chỉ nói cần tệp nào; thứ tự lấy từ Sidebar thật, và tệp không có trong Sidebar thì nổ ngay (tệp bị xóa hoặc đổi tên khỏi Sidebar không còn được test âm thầm nạp tiếp).
 */

const { napClient, taoHopCat, docTep } = require('../load-gas');

const SIDEBAR = 'client/Sidebar.html';

/** Danh sách tệp client theo thứ tự `include()` của Sidebar, có đuôi `.html`. */
function tepSidebar() {
  const ra = [];
  const mo = /include\('([^']+)'\)/g;
  const html = docTep(SIDEBAR);
  let khop;
  while ((khop = mo.exec(html)) !== null) { ra.push(khop[1] + '.html'); }
  if (!ra.length) { throw new Error(SIDEBAR + ' không có dòng include() nào; không biết thứ tự nạp.'); }
  return ra;
}

const coDuoi = (tep) => (tep.endsWith('.html') ? tep : tep + '.html');

/** Xếp các tệp cần nạp theo thứ tự của Sidebar. Tệp không nằm trong Sidebar thì ném lỗi, nêu tên. */
function xepTheoSidebar(danhSach) {
  const thuTu = tepSidebar();
  const can = danhSach.map(coDuoi);
  const la = can.filter((tep) => thuTu.indexOf(tep) < 0);
  if (la.length) { throw new Error('Tệp không có trong ' + SIDEBAR + ': ' + la.join(', ') + '. Sidebar thật không nạp nó thì test cũng không được nạp.'); }
  return thuTu.filter((tep) => can.indexOf(tep) >= 0);
}

/** Nạp `danhSach` vào `hop` (bỏ trống thì tạo hộp mới) theo thứ tự Sidebar, trả lại hộp. */
function napTheoSidebar(danhSach, hop) {
  return napClient(hop || taoHopCat(), ...xepTheoSidebar(danhSach));
}

module.exports = { tepSidebar, xepTheoSidebar, napTheoSidebar };
