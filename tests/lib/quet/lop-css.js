/** Mọi tên lớp có mặt trong một đoạn CSS, kể cả trong bộ chọn nhiều mắt. Dùng cho phép quét "khai `className` mà không có luật". */
function lopCoLuat(css) {
  const ra = {};
  const mo = /([^{}]+)\{[^{}]*\}/g;
  let khop;
  while ((khop = mo.exec(css)) !== null) {
    (khop[1].match(/\.([A-Za-z_][\w-]*)/g) || []).forEach((t) => { ra[t.slice(1)] = true; });
  }
  return Object.keys(ra);
}

module.exports = { lopCoLuat };
