/**
 * Nhóm ca kiểm của `normalizeText`: hai bản sinh đôi — một phía máy chủ, một phía sidebar — phải khớp bảng ca chuẩn của tài liệu 02 Phần 12 và khớp với nhau.
 *
 * Vì sao có hai bản mà không phải một: sidebar cần lọc và tìm kiếm ngay trong RAM, không gọi được sang máy chủ cho từng ký tự người dùng gõ. Tài liệu 02 chấp nhận hai bản và bù lại bằng một `[RÀNG BUỘC CỨNG]`: hai bản phải giống hệt nhau, và có bộ kiểm chỉ ra ngay khi lệch.
 */

const { napRieng } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

/**
 * Bảng ca chuẩn, chép nguyên từ tài liệu 02 Phần 12.
 *
 * Ba bản giống nhau — bảng này, bảng trong tệp máy chủ, bảng trong tệp sidebar — nghe như thừa, nhưng chính là chỗ bắt lệch: sửa một bên mà quên bên kia là bộ kiểm đỏ ngay.
 */
const NORMALIZE_TEXT_CASES = [
  ['Hà Nội', 'ha noi'],
  ['CÔNG TY TNHH', 'cong ty tnhh'],
  ['  Đà   Nẵng  ', 'da nang'],
  ['Nguyễn Văn Đức', 'nguyen van duc'],
  ['0101-002', '0101-002'],
  ['81. Tiềm năng cao', '81. tiem nang cao'],
  ['', '']
];

function chay(so) {
  section('normalizeText — bảng ca chuẩn của tài liệu 02 Phần 12');

  // Hai hộp cát riêng, không dùng chung. Nạp chung một hộp thì bản sau ghi đè bản trước và phép so hai bản thành vô nghĩa.
  let mayChu = null;
  let sidebar = null;
  try {
    mayChu = napRieng('server/TextNormalize.js');
    sidebar = napRieng('client/util/textNormalize.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp hai bản normalizeText', err);
  }

  NORMALIZE_TEXT_CASES.forEach(([input, expected]) => {
    check(so, 'máy chủ  normalizeText(' + JSON.stringify(input) + ')', mayChu.normalizeText(input), expected);
    check(so, 'sidebar  normalizeText(' + JSON.stringify(input) + ')', sidebar.normalizeText(input), expected);
  });

  check(so, 'bảng ca của máy chủ khớp tài liệu 02', mayChu.TEXT_NORMALIZE_CASES, NORMALIZE_TEXT_CASES);
  check(so, 'bảng ca của sidebar khớp bảng ca của máy chủ', sidebar.TEXT_NORMALIZE_CASES, mayChu.TEXT_NORMALIZE_CASES);

  // Vài ca ngoài bảng của tài liệu, để chốt những chỗ hàm này KHÔNG được đụng vào.
  check(so, 'giữ nguyên gạch ngang của mã số thuế mẹ con', mayChu.normalizeText('0101-002-001'), '0101-002-001');
  check(so, 'gộp cả dấu xuống dòng thành một dấu cách', mayChu.normalizeText('Hà Nội\r\n\tThủ đô'), 'ha noi thu do');
  check(so, 'null về chuỗi rỗng chứ không nổ', mayChu.normalizeText(null), '');
  check(so, 'số về chuỗi', mayChu.normalizeText(2026), '2026');
}

module.exports = { chay, NORMALIZE_TEXT_CASES };
