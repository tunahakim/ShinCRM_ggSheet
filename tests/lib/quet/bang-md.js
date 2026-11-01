/** Đọc bảng markdown trong tài liệu để test đối chiếu tài liệu với code. Chỉ nhận bảng có hàng phân cách `|---|`; ô bỏ khoảng trắng hai đầu, giữ nguyên dấu `` ` ``. */

/** Tách một dòng `| a | b |` thành mảng ô; dòng không bắt đầu bằng `|` thì trả `null`. */
function oCuaDong(dong) {
  const gon = dong.trim();
  if (gon.charAt(0) !== '|') { return null; }
  return gon.replace(/^\|/, '').replace(/\|$/, '').split('|').map((o) => o.trim());
}

/** Mọi bảng trong văn bản: `{ tieuDe, hang }`, mỗi hàng kèm số dòng (tính từ 1) để báo lỗi trỏ đúng chỗ. Dòng phân cách sai số cột so với tiêu đề thì không coi là bảng. */
function bangMd(vanBan) {
  const dong = vanBan.replace(/\r\n/g, '\n').split('\n');
  const bang = [];
  for (let i = 0; i + 1 < dong.length; i++) {
    const tieuDe = oCuaDong(dong[i]);
    const phanCach = oCuaDong(dong[i + 1]);
    if (!tieuDe || !phanCach || phanCach.length !== tieuDe.length || !phanCach.every((o) => /^:?-{3,}:?$/.test(o))) { continue; }
    const hang = [];
    let j = i + 2;
    for (; j < dong.length; j++) {
      const o = oCuaDong(dong[j]);
      if (!o) { break; }
      hang.push({ dong: j + 1, o: o });
    }
    bang.push({ tieuDe: tieuDe, hang: hang });
    i = j - 1;
  }
  return bang;
}

module.exports = { bangMd };
