/**
 * Chặn chữ mojibake (chuỗi UTF-8 bị đọc nhầm thành Latin-1/Windows-1252, ví dụ `Ä‘ang` thay cho `đang`) trong mã GAS và Sidebar.
 *
 * Chữ rác này lọt vào mã khi sao chép qua công cụ đọc sai bảng mã; cú pháp vẫn đúng nên không test nghiệp vụ nào bắt được, người dùng nhìn thấy trước (FBM-007).
 * `MÃ` (chữ hoa của `mã`) là tiếng Việt hợp lệ, nên mẫu chỉ bắt `Ã`/`Ä`/`á`/`Æ` khi đi liền một ký tự thuộc dải byte tiếp nối của UTF-8 (U+0080–U+00BF, U+2018–U+203A).
 */

const fs = require('fs');
const path = require('path');
const { GAS_DIR } = require('../lib/load-gas');
const { liet } = require('./namespace');
const { section, check } = require('../lib/assert');

const MOJIBAKE = /[ÃÄáÆ][\u0080-¿‘-›ŒœŠšŸŽžƒˆ˜]/;

function chay(so) {
  section('Bảng mã mã nguồn');
  const tep = liet('.', '.js').concat(liet('.', '.html')).filter((ten) => !/^node_modules\//.test(ten));
  const loi = tep.filter((ten) => MOJIBAKE.test(fs.readFileSync(path.join(GAS_DIR, ten), 'utf8')));
  check(so, 'FBM-007: mã GAS và Sidebar không chứa chữ mojibake kiểu "Ä‘ang Ä‘á»c"', loi, []);
  check(so, 'mẫu mojibake bắt được chuỗi rác cũ nhưng không bắt chữ "MÃ" hợp lệ', [MOJIBAKE.test('ÄÃ£ ghi; Ä‘ang Ä‘á»c xÃ¡c nháº­n'), MOJIBAKE.test('MÃ. Tên # | MÃ. Tên')], [true, false]);
}

module.exports = { chay };
