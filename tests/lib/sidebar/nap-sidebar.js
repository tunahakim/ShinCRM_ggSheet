/**
 * Nạp tệp client của Sidebar vào hộp cát theo đúng thứ tự `include()` của `client/Sidebar.html`.
 *
 * Vì sao đọc từ Sidebar.html: trước đây mỗi tệp ca gõ tay danh sách tệp và thứ tự nạp, và danh sách tay lệch dần với Sidebar thật mà không ai biết. Ở đây tệp ca chỉ nói cần tệp nào; thứ tự lấy từ Sidebar thật, và tệp không có trong Sidebar thì nổ ngay (tệp bị xóa hoặc đổi tên khỏi Sidebar không còn được test âm thầm nạp tiếp).
 */

const vm = require('vm');
const { napClient, napServer, taoHopCat, docTep, catRuotScript } = require('../load-gas');

const SIDEBAR = 'client/Sidebar.html';
/** Thẻ chèn dữ liệu GAS trong Sidebar.html, đứng trước mọi tệp client. */
const THE_DU_LIEU_SERVER = '<?!= sidebarServerData() ?>';
/** Tệp GAS mà `sidebarServerData()` cần: bảng dãy chặng, bảng tiến trình nền và tên của chúng, cùng chính hàm chèn. */
const TEP_DU_LIEU_SERVER = ['fbm_sync/state/RunPlan.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/FbmSettings.js', 'server/entry/EntryPoint.js', 'server/entry/Menu.js'];
let banDuLieuServer = null;

/** Chuỗi `<script>` mà GAS thật in vào chỗ thẻ chèn dữ liệu: chạy đúng hàm `sidebarServerData()` trên các tệp GAS thật, không chép lại dữ liệu. */
function kichBanDuLieuServer() {
  if (banDuLieuServer === null) { banDuLieuServer = napServer(taoHopCat(), ...TEP_DU_LIEU_SERVER).sidebarServerData(); }
  return banDuLieuServer;
}

/** Chạy dữ liệu GAS vào hộp client như dòng đầu của Sidebar thật; hộp đã có thì thôi. */
function napDuLieuServer(hop) {
  if (vm.runInContext('typeof SIDEBAR_SERVER_DATA', hop) !== 'undefined') { return hop; }
  if (docTep(SIDEBAR).indexOf(THE_DU_LIEU_SERVER) < 0) { throw new Error(SIDEBAR + ' không còn thẻ ' + THE_DU_LIEU_SERVER + '; khung test không biết Sidebar nhận dữ liệu GAS ở đâu.'); }
  vm.runInContext(catRuotScript(kichBanDuLieuServer(), 'sidebarServerData()'), hop, { filename: 'sidebarServerData()' });
  return hop;
}

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

/** Dữ liệu `SIDEBAR_SERVER_DATA` mà trang thật nhận, đọc ra bằng cách chạy đúng chuỗi GAS in vào một hộp trắng. */
function duLieuServer() {
  return napDuLieuServer(taoHopCat()).SIDEBAR_SERVER_DATA;
}

/** Nạp `danhSach` vào `hop` (bỏ trống thì tạo hộp mới) theo thứ tự Sidebar, trả lại hộp. Dữ liệu GAS chèn lúc dựng khung luôn vào trước, như Sidebar thật. */
function napTheoSidebar(danhSach, hop) {
  return napClient(napDuLieuServer(hop || taoHopCat()), ...xepTheoSidebar(danhSach));
}

module.exports = { tepSidebar, xepTheoSidebar, napTheoSidebar, kichBanDuLieuServer, duLieuServer, THE_DU_LIEU_SERVER, TEP_DU_LIEU_SERVER };
