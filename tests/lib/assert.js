/**
 * Bộ đếm và bốn phép so của bộ kiểm offline. Tách riêng khỏi `run.js` vì `run.js` chỉ nên làm một việc: gọi các nhóm ca kiểm rồi in tổng kết.
 *
 * Vì sao không dùng thư viện kiểm thử có sẵn: dự án này cố ý không có `node_modules`. Bốn hàm dưới đây là tất cả những gì bộ kiểm cần, và chúng đọc hết trong một phút — thứ mà một người tiếp nhận dự án cần hơn là một khung kiểm thử đầy đủ tính năng.
 */

/** Sổ ghi kết quả. Một đối tượng dùng chung cho cả lượt chạy, các nhóm ca cùng ghi vào đây. */
function taoSo() {
  return { passed: 0, failed: 0, failures: [] };
}

/** In tiêu đề một nhóm ca. */
function section(title) {
  console.log('');
  console.log(title);
}

/** Ghi một ca đạt. */
function ghiDat(so, label) {
  so.passed += 1;
  console.log('  ✅ ' + label);
}

/** Ghi một ca không đạt, kèm các dòng giải thích thụt lề. */
function ghiTruot(so, label, chiTiet) {
  so.failed += 1;
  so.failures.push(label);
  console.log('  ❌ ' + label);
  (chiTiet || []).forEach((dong) => console.log('     ' + dong));
}

/**
 * So một giá trị với giá trị mong đợi.
 *
 * So bằng `JSON.stringify` chứ không bằng `===` để so được cả mảng và đối tượng. Cái giá phải biết: thứ tự khóa của đối tượng có ảnh hưởng, và `undefined` biến mất. Với dữ liệu của dự án này — mảng chuỗi, bảng khai phẳng — cả hai đều không thành vấn đề.
 */
function check(so, label, actual, expected) {
  if (JSON.stringify(actual) === JSON.stringify(expected)) {
    ghiDat(so, label);
  } else {
    ghiTruot(so, label, [
      'mong đợi: ' + JSON.stringify(expected),
      'nhận được: ' + JSON.stringify(actual)
    ]);
  }
}

/** Kiểm rằng một lời gọi ném lỗi, và thông báo lỗi có chứa một mẩu chữ nhất định. */
function checkThrows(so, label, fn, expectedFragment) {
  try {
    fn();
    ghiTruot(so, label, ['mong đợi ném lỗi, nhưng chạy trót lọt']);
  } catch (err) {
    if (String(err.message).includes(expectedFragment)) {
      ghiDat(so, label);
    } else {
      ghiTruot(so, label, ['lỗi ném ra thiếu mẩu chữ "' + expectedFragment + '": ' + err.message]);
    }
  }
}

/** Kiểm rằng trong một danh sách chuỗi có **đúng một** dòng chứa mẩu chữ cần tìm. Dùng cho các phép kiểm trả về danh sách vấn đề. */
function checkContains(so, label, lines, fragment) {
  const hit = lines.filter((line) => String(line).includes(fragment));
  if (hit.length === 1) {
    ghiDat(so, label);
  } else {
    ghiTruot(so, label, [
      'mong đợi đúng 1 dòng chứa "' + fragment + '", nhận được ' + hit.length,
      'toàn bộ: ' + JSON.stringify(lines)
    ]);
  }
}

/** Ghi một ca không đạt vì nạp tệp thất bại. Trả về `null` để bên gọi bỏ qua cả nhóm ca một cách rõ ràng. */
function ghiLoiNap(so, label, err) {
  ghiTruot(so, label, [err.message]);
  return null;
}

module.exports = { taoSo, section, check, checkThrows, checkContains, ghiDat, ghiTruot, ghiLoiNap };
