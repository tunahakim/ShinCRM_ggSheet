/**
 * Xuống dòng các lệnh `check(` dài trong tệp test thành ba phần: sổ và nhãn, giá trị nhận, giá trị mong đợi. Không đổi gì khác.
 *
 * Chỉ đụng lệnh nằm gọn trên một dòng, đứng đầu dòng và có đúng bốn đối số; lệnh đã xuống dòng hoặc có hình khác giữ nguyên, vì đoán sai chỗ cắt là đổi nghĩa test. Đối số được tách bằng bộ quét chuỗi và ngoặc, nên dấu phẩy trong chuỗi, mảng hay hàm không bị cắt nhầm.
 *
 * Dùng: node tests/tools/wrapChecks.js <tệp test> [...]
 */

const fs = require('fs');

/** Dòng dài hơn số ký tự này mới xuống dòng. */
const DO_DAI_TOI_DA = 120;

const MO = { '(': ')', '[': ']', '{': '}' };

/** Tách phần trong ngoặc của `check(` bắt đầu ở `from` (ngay sau `(`). Trả `{ args, end }` với `end` là vị trí `)` đóng, hoặc null khi không đóng được trên dòng. */
function tachDoiSo(text, from) {
  const args = [];
  const ngoac = [];
  let dau = from;
  for (let i = from; i < text.length; i++) {
    const c = text[i];
    if (c === '\'' || c === '"' || c === '`') {
      i = cuoiChuoi(text, i);
      if (i < 0) { return null; }
    } else if (MO[c]) {
      ngoac.push(MO[c]);
    } else if (c === ')' && ngoac.length === 0) {
      args.push(text.slice(dau, i).trim());
      return { args, end: i };
    } else if (c === ')' || c === ']' || c === '}') {
      if (ngoac.pop() !== c) { return null; }
    } else if (c === ',' && ngoac.length === 0) {
      args.push(text.slice(dau, i).trim());
      dau = i + 1;
    }
  }
  return null;
}

/** Vị trí dấu đóng của chuỗi mở ở `at`; -1 khi chuỗi không đóng trên dòng hoặc template có `${`, vì khi đó bộ quét không chắc ranh giới. */
function cuoiChuoi(text, at) {
  const q = text[at];
  for (let i = at + 1; i < text.length; i++) {
    if (text[i] === '\\') { i++; continue; }
    if (q === '`' && text[i] === '$' && text[i + 1] === '{') { return -1; }
    if (text[i] === q) { return i; }
  }
  return -1;
}

/** Trả nội dung đã xuống dòng; không có gì đổi thì trả đúng chuỗi vào. Giữ kiểu xuống dòng của tệp. */
function xuongDong(source) {
  const eol = source.indexOf('\r\n') >= 0 ? '\r\n' : '\n';
  return source.split(eol).map((dong) => {
    if (dong.length <= DO_DAI_TOI_DA) { return dong; }
    const k = /^(\s*)check\(/.exec(dong);
    if (!k) { return dong; }
    const tach = tachDoiSo(dong, k[0].length);
    if (!tach || tach.args.length !== 4 || tach.args.some((a) => a === '')) { return dong; }
    const [so, nhan, nhan2, mong] = tach.args;
    const thut = k[1] + '  ';
    return k[1] + 'check(' + so + ', ' + nhan + ',' + eol + thut + nhan2 + ',' + eol + thut + mong + dong.slice(tach.end);
  }).join(eol);
}

module.exports = { DO_DAI_TOI_DA, xuongDong };

if (require.main === module) {
  const tep = process.argv.slice(2);
  if (!tep.length) { console.error('Dùng: node tests/tools/wrapChecks.js <tệp test> [...]'); process.exit(1); }
  tep.forEach((f) => {
    const cu = fs.readFileSync(f, 'utf8');
    const moi = xuongDong(cu);
    if (moi !== cu) { fs.writeFileSync(f, moi); }
    console.log((moi === cu ? 'giữ  ' : 'sửa  ') + f);
  });
}
