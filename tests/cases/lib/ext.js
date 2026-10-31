/**
 * Khung nạp Extension trong `tests/lib/ext/`: đường dẫn khai một chỗ, tệp thiếu thì nổ, hộp luôn có `console`, nạp thêm vào hộp đã có.
 *
 * Nhánh dễ hỏng âm thầm: một tệp Extension đổi tên mà khung vẫn trỏ đường cũ, hoặc hộp thiếu biến toàn cục mà trình duyệt thật luôn có.
 */

const fs = require('fs');
const { section, check, checkThrows } = require('../../lib/assert');
const { TEP_EXT, duongDanExt, manifestThat, napExtension } = require('../../lib/ext/nap-extension');

function chay(so) {
  section('Khung test Extension — đường dẫn khai một chỗ, hộp có biến của trình duyệt');

  const thieu = Object.keys(TEP_EXT).filter((ten) => !fs.existsSync(duongDanExt(ten)));
  check(so, 'TEP_EXT: mọi tệp khai đều có thật trong 2_ShinCRM_Extension', thieu, []);
  checkThrows(so, 'duongDanExt: tên chưa khai thì ném lỗi nêu chỗ phải sửa', () => duongDanExt('khongCo'), 'TEP_EXT');

  const manifest = manifestThat();
  check(so, 'manifestThat: đọc manifest thật, có phiên bản', [manifest.manifest_version, typeof manifest.version], [3, 'string']);

  const window = { postMessage: () => {}, addEventListener: () => {}, XMLHttpRequest: function () {} };
  window.XMLHttpRequest.prototype.open = function () {};
  window.XMLHttpRequest.prototype.send = function () {};
  const hop = napExtension('bindWatcher', { location: { origin: 'https://docs.google.com' }, window: window });
  check(so, 'napExtension: hộp luôn có console và giữ biến riêng của cảnh thử', [hop.console === console, typeof hop.window], [true, 'object']);
  const cungHop = napExtension('bindWatcher', null, hop);
  check(so, 'napExtension: truyền hộp đã có thì nạp vào đúng hộp đó', cungHop === hop, true);
}

module.exports = { chay };
