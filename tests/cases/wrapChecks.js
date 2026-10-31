/** `tests/tools/wrapChecks.js`: chỉ xuống dòng lệnh `check(` dài bốn đối số, không cắt nhầm dấu phẩy trong chuỗi hay ngoặc, chạy lại không đổi thêm. */

const { section, check } = require('../lib/assert');
const { DO_DAI_TOI_DA, xuongDong } = require('../tools/wrapChecks');

function chay(so) {
  section('wrapChecks — xuống dòng lệnh check dài theo ba phần');

  const dai = 'x'.repeat(DO_DAI_TOI_DA);
  const vao = "  check(so, 'nhãn, có phẩy (và ngoặc)', f(a, [1, 2]), { k: '" + dai + "' });";
  const ra = xuongDong(vao);
  check(so, 'lệnh dài thành ba dòng: sổ và nhãn, giá trị nhận, giá trị mong đợi', ra.split('\n'), [
    "  check(so, 'nhãn, có phẩy (và ngoặc)',",
    '    f(a, [1, 2]),',
    "    { k: '" + dai + "' });"
  ]);
  check(so, 'chạy lại không đổi thêm', xuongDong(ra), ra);
  check(so, 'giữ kiểu xuống dòng CRLF', xuongDong(vao + '\r\nx;').split('\r\n').length, 4);

  const giuNguyen = [
    "check(so, 'ngắn', 1, 1);",
    "  check(so, 'ba đối số', '" + dai + "');",
    "  check(so, 'chưa đóng trên dòng', [" + "'" + dai + "',",
    "  check(so, `template ${x}`, 1, '" + dai + "');",
    "  const y = check(so, 'không đứng đầu dòng', 1, '" + dai + "');"
  ];
  check(so, 'lệnh ngắn, khác bốn đối số, chưa đóng, template có biểu thức, không đứng đầu dòng thì giữ nguyên', giuNguyen.map(xuongDong), giuNguyen);
}

module.exports = { chay };
