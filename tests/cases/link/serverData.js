/**
 * Số nhịp của tầng liên kết Sidebar đi một đường: GAS chèn lúc dựng trang (`SIDEBAR_SERVER_DATA.link`), Sidebar không giữ số dự phòng. Khóa Sidebar đọc phải nằm trong bảng khóa GAS gửi, và mọi khóa đó phải có trong `SETTINGS`, nếu không trang hỏng ngay lúc mở thay vì chạy âm thầm với số khác.
 */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, docTep } = require('../../lib/load-gas');
const { dungHopLienKet } = require('../../lib/sidebar/hop-lien-ket');

const TEP_DOC = ['client/link/sheetLink.html', 'client/link/selectionPoll.html', 'client/link/changeSignal.html', 'client/sync/fbmSync.html'];

function chay(so) {
  section('Tầng liên kết — số nhịp GAS gửi lúc dựng trang');
  const hop = napServer(taoHopCat({}), 'server/config/Settings.js', 'server/service/SelectionService.js');
  const gui = hop.SIDEBAR_SERVER_DATA_PROVIDERS.link();
  const khoa = Array.from(hop.SHEET_LINK_SETTING_KEYS);
  check(so, 'GAS gửi đúng các khóa đã khai, giá trị lấy từ SETTINGS', [Object.keys(gui).sort(), khoa.every((k) => gui[k] === hop.SETTINGS[k])], [khoa.slice().sort(), true]);
  const doc = new Set();
  TEP_DOC.forEach((tep) => { const src = docTep(tep); let m; const re = /sheetLink(?:Setting|Ms)\('([A-Z_]+)'\)/g; while ((m = re.exec(src)) !== null) { doc.add(m[1]); } });
  check(so, 'mọi khóa Sidebar đọc đều có trong bảng khóa GAS gửi, và không khóa nào gửi thừa', [Array.from(doc).filter((k) => khoa.indexOf(k) < 0), khoa.filter((k) => !doc.has(k))], [[], []]);
  check(so, 'hộp test tầng liên kết dùng đúng bộ khóa GAS gửi', Object.keys(dungHopLienKet().SIDEBAR_SERVER_DATA.link).sort(), khoa.slice().sort());
  const conSettings = ['client/link/sheetLink.html', 'client/link/selectionPoll.html', 'client/link/changeSignal.html'].filter((tep) => /\bSETTINGS\b/.test(docTep(tep).replace(/\/\*[\s\S]*?\*\/|\/\/.*$/gm, '')));
  check(so, 'tầng liên kết không đọc SETTINGS của gói nạp RAM (đường số dự phòng cũ)', conSettings, []);
  const thieu = dungHopLienKet();
  delete thieu.SIDEBAR_SERVER_DATA.link.CHANNEL_SILENCE_MS;
  let loi = '';
  try { thieu.sheetLinkMs('CHANNEL_SILENCE_MS'); } catch (error) { loi = String(error.message); }
  check(so, 'thiếu khóa thì ném rõ tên khóa, không đoán số', loi.indexOf('CHANNEL_SILENCE_MS') >= 0, true);
}

module.exports = { chay };
