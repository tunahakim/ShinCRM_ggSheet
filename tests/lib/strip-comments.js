/**
 * Bỏ chú thích khỏi một đoạn mã JavaScript, giữ nguyên số dòng.
 *
 * Vì sao cần: các phép kiểm tĩnh của dự án quét mã tìm những thứ **code** không được phép nhắc tới — ví dụ luật "tệp lõi không được đọc `SYNC_SCHEMA`". Nhưng docstring thì được phép nhắc tới, và phải được phép: một chú thích giải thích "chỗ này cố ý không đọc bảng kia" là thứ đáng có nhất trong tệp. Quét cả chú thích thì phép kiểm bắt oan đúng những tệp viết tài liệu tốt nhất.
 *
 * Mỗi chú thích bị thay bằng khoảng trắng cùng độ dài, và dấu xuống dòng trong chú thích khối được giữ lại, nên vị trí dòng và cột của phần mã còn lại không xê dịch.
 *
 * Giới hạn phải biết: hàm này KHÔNG hiểu biểu thức chính quy dạng `/.../`. Một biểu thức chính quy chứa `//` hoặc `/*` sẽ làm nó cắt sai. Toàn bộ dự án hiện không có biểu thức nào như vậy, và nếu sau này có thì phép kiểm dùng hàm này sẽ báo lạ chứ không im lặng — nhưng cứ biết trước thì đỡ mất thời gian đi tìm.
 */

/** Ba trạng thái của phép quét, đặt tên thay vì dùng số để đọc được đoạn `switch` bên dưới. */
const MA = 0;
const CHUOI = 1;
const CHU_THICH = 2;

function stripComments(source) {
  let ra = '';
  let trangThai = MA;
  let dauChuoi = '';
  let chuThichDong = false;

  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const sau = source[i + 1];

    if (trangThai === MA) {
      if (ch === '/' && sau === '/') { trangThai = CHU_THICH; chuThichDong = true; ra += '  '; i += 1; }
      else if (ch === '/' && sau === '*') { trangThai = CHU_THICH; chuThichDong = false; ra += '  '; i += 1; }
      else if (ch === '"' || ch === "'" || ch === '`') { trangThai = CHUOI; dauChuoi = ch; ra += ch; }
      else { ra += ch; }
      continue;
    }

    if (trangThai === CHUOI) {
      ra += ch;
      if (ch === '\\') { ra += sau === undefined ? '' : sau; i += 1; }
      else if (ch === dauChuoi) { trangThai = MA; }
      continue;
    }

    // Đang trong chú thích: giữ dấu xuống dòng, mọi thứ khác thay bằng dấu cách để cột không xê dịch.
    if (chuThichDong) {
      if (ch === '\n') { trangThai = MA; ra += '\n'; }
      else { ra += ' '; }
    } else if (ch === '*' && sau === '/') { trangThai = MA; ra += '  '; i += 1; }
    else { ra += ch === '\n' ? '\n' : ' '; }
  }

  return ra;
}

module.exports = { stripComments };
