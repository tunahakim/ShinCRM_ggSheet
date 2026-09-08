/** Câu báo ngắn dùng chung cho parser bộ lọc. */
var FILTER_ERROR_MESSAGES = {
  rangeDash: 'Không hiểu được dấu gạch ngang ở đây. Muốn lọc trong khoảng thì viết hai dấu chấm giữa hai giá trị, ví dụ 10..50.',
  rangeOrder: 'Giá trị đầu lớn hơn giá trị cuối. Viết giá trị nhỏ trước, ví dụ 10..50.',
  date: 'Không đọc được ngày này. Ngày viết theo dạng YYYY-MM-DD, ví dụ 2026-03-10. Muốn cả tháng thì gõ 2026-03.',
  number: 'Cột này là cột số nên chỉ so sánh được với số. Muốn tìm theo chữ số bên trong thì viết *999*.',
  quoted: 'Thiếu một dấu nháy kép. Muốn tìm đúng một giá trị thì bọc nó trong hai dấu nháy, ví dụ "Gọi điện".',
  operator: 'Không viết <> trước dấu lớn hơn hay nhỏ hơn. Muốn tìm số không lớn hơn 100 thì viết <=100.'
};

function filterError(field, raw, reason, hint) {
  return {
    field: field && field.code ? field.code : '',
    raw: String(raw === null || raw === undefined ? '' : raw),
    reason: reason || 'Cú pháp không hợp lệ',
    hint: hint === undefined ? 'Kiểm tra lại điều kiện ở hàng 3.' : hint
  };
}

/** Bản chữ thuần để dùng chung cho cell note và lệnh menu tra cứu. */
var FILTER_QUICK_REFERENCE = [
  'LỌC: gõ vào hàng 3, dưới cột muốn lọc. Để trống là không lọc.',
  '',
  'Chứa chữ: hà nội',
  'Đúng y hệt: "Gọi điện"',
  'Ô trống: ""    Ô có dữ liệu: <>""',
  'Bắt đầu bằng: Công ty*    Kết thúc bằng: *Corp',
  'Chứa chữ số trong cột tiền: *999*',
  'Cái này hoặc cái kia: Hà Nội; Hải Phòng',
  'Không phải: <>Hà Nội',
  'Không phải cả hai: <>Hà Nội; <>Hải Phòng',
  'So sánh: >50000000, <, >=, <=',
  'Trong khoảng: 10..50',
  '',
  'NGÀY: 2026-03-10; cả tháng 2026-03; cả năm 2026; today; <now; today..+3; -7..today; >=+1.',
  '',
  'LƯU Ý',
  '- Hai cột khác nhau nối bằng VÀ.',
  '- Cột giao dịch lọc theo lần làm việc gần nhất còn sống.',
  '- Cột không có mã @ ở hàng 1 không được hệ thống đọc.',
  '- Ô trống luôn xếp cuối khi sắp xếp.',
  '',
  'SẮP XẾP: chọn mã ở @VIEW_SORT_COL và chiều ở @VIEW_SORT_LEVEL, từ hàng 4 xuống. Mỗi hàng là một cấp; hàng thiếu một vế được bỏ qua; để trống cả hai cột thì dùng cấu hình chung trong Config.'
].join('\n');
