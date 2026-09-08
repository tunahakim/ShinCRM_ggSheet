/** Câu báo ngắn dùng chung cho parser bộ lọc. */
var FILTER_ERROR_MESSAGES = {
  rangeOrder: 'Giá trị đầu lớn hơn giá trị cuối. Viết giá trị nhỏ trước, ví dụ 10..50.',
  date: 'Không đọc được ngày này. Ngày viết theo dạng YYYY-MM-DD, ví dụ 2026-03-10.',
  number: 'Cột này là cột số nên chỉ so sánh được với số. Muốn tìm theo chữ số bên trong thì viết *999*.',
  quoted: 'Thiếu một dấu nháy kép. Muốn tìm đúng một giá trị thì bọc nó trong hai dấu nháy, ví dụ "Gọi điện".',
  operator: 'Không viết <> trước dấu lớn hơn hay nhỏ hơn. Muốn tìm số không lớn hơn 100 thì viết <=100.'
};

function filterError(field, raw, reason, hint) {
  return {
    field: field && field.code ? field.code : '',
    raw: String(raw === null || raw === undefined ? '' : raw),
    reason: reason || 'Cú pháp không hợp lệ',
    hint: hint || 'Kiểm tra lại điều kiện ở hàng 3.'
  };
}

