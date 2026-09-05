/**
 * Hàm đưa chuỗi về dạng dùng để so khớp, theo tài liệu 02 Phần 12. Bỏ khoảng trắng hai đầu, gộp mọi cụm khoảng trắng liên tiếp
 * thành một dấu cách, về chữ thường, bỏ dấu tiếng Việt kể cả `đ` thành `d`. Không đụng tới gạch ngang, dấu chấm hay ký tự nào khác.
 *
 * Đây là bản phía máy chủ. Bản sinh đôi nằm ở `client/util/textNormalize.html`. Apps Script không có cách chia sẻ code giữa
 * máy chủ và trang sidebar, nên phải có hai bản, và tài liệu 02 chốt cứng là hai bản không được lệch nhau trong im lặng.
 *
 * Cách chặn lệch: mỗi bản tự chạy bảng ca chuẩn của chính nó lúc nạp. Bảng ca là danh sách vào–ra viết thẳng ra kết quả mong đợi,
 * nên hai bản cùng qua bảng nghĩa là hai bản cùng cho một kết quả — không cần bên này gọi bên kia. Bộ kiểm Node kiểm thêm một tầng
 * nữa: hai bảng ca ở hai tệp phải giống hệt nhau, để không ai sửa được bảng ở một bên rồi tưởng là đã kiểm.
 */

/** Bảng ca chuẩn của tài liệu 02 Phần 12. Bản ở `client/util/textNormalize.html` phải giống hệt bảng này. */
var TEXT_NORMALIZE_CASES = [
  ['Hà Nội', 'ha noi'],
  ['CÔNG TY TNHH', 'cong ty tnhh'],
  ['  Đà   Nẵng  ', 'da nang'],
  ['Nguyễn Văn Đức', 'nguyen van duc'],
  ['0101-002', '0101-002'],
  ['81. Tiềm năng cao', '81. tiem nang cao'],
  ['', '']
];

/**
 * Đưa một chuỗi về dạng so khớp.
 *
 * Thứ tự bốn bước không đổi được. `đ` và `Đ` phải thay trước phép tách dấu, vì chúng là chữ cái riêng của bảng mã Unicode
 * chứ không phải chữ `d` gắn thêm dấu, nên phép tách dấu không nhận ra chúng. Phép gộp khoảng trắng chạy sau cùng vì
 * ba bước trước có thể sinh ra khoảng trắng mới.
 */
function normalizeText(value) {
  if (value === null || value === undefined) {
    return '';
  }

  var text = String(value);
  text = text.replace(/đ/g, 'd').replace(/Đ/g, 'D');
  // \p{M} là "mọi ký tự dấu phụ" của bảng mã Unicode. Viết bằng tên nhóm thay vì bằng khoảng mã cho một lý do thực dụng:
  // dấu tiếng Việt viết thẳng vào code là những ký tự vô hình, mở tệp ra không thấy gì, sửa nhầm cũng không ai biết.
  text = text.normalize('NFD').replace(/\p{M}/gu, '');
  text = text.toLowerCase();
  text = text.replace(/\s+/g, ' ').trim();

  return text;
}

/** Chạy bảng ca chuẩn, trả về danh sách ca sai. Danh sách rỗng là đạt. */
function textNormalizeSelfCheck() {
  var problems = [];
  for (var i = 0; i < TEXT_NORMALIZE_CASES.length; i++) {
    var input = TEXT_NORMALIZE_CASES[i][0];
    var expected = TEXT_NORMALIZE_CASES[i][1];
    var actual = normalizeText(input);
    if (actual !== expected) {
      problems.push('normalizeText("' + input + '") ra "' + actual + '" nhưng phải ra "' + expected + '"');
    }
  }
  return problems;
}

/**
 * Chạy bảng ca ngay lúc nạp tệp, và ném lỗi nếu sai.
 *
 * Ném lỗi ở đây làm chết cả script, kể cả cửa `doGet`. Đó là chủ ý: một `normalizeText` hỏng không làm gì ầm ĩ cả,
 * nó chỉ làm hộp tìm kiếm trượt mất khách và bộ lọc trên sheet quản trị ra thiếu dòng — người dùng không có đường nào
 * để biết vì sao. Chết ngay kèm tên ca sai thì đắt một lần, còn im lặng thì đắt mãi.
 */
(function () {
  var problems = textNormalizeSelfCheck();
  if (problems.length) {
    throw new Error('normalizeText phía máy chủ sai bảng ca chuẩn của tài liệu 02 Phần 12: ' + problems.join(' | '));
  }
})();
