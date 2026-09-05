/**
 * Ca kiểm cho `server/sheet/EntityRead.js`: đường đọc bản ghi từ sheet ra dạng truyền được sang client.
 *
 * Bốn điều được canh ở đây, và cả bốn đều là điều **hỏng trong im lặng** nếu sai.
 *
 * Một, `fields` chỉ chứa tên trường, tuyệt đối không chứa mã cột `@`. Để mã cột lọt sang client là mở đường cho client tự đọc sheet theo mã, và khi đó bảng khai ở `DataSchema.js` không còn là bản gốc duy nhất nữa — một sự thật hai bản là một sự thật sẽ lệch.
 *
 * Hai, cột tra theo **mã** chứ không theo thứ tự. Phép kiểm dựng hoàn cảnh có một cột lạ chèn vào giữa, đúng việc mà người dùng được phép làm; nếu code đếm cột theo thứ tự khai thì mọi giá trị lệch đi một cột và vẫn chạy trơn tru — sai kiểu tệ nhất.
 *
 * Ba, `rowIndexes` là số hàng **thật** trên sheet, không phải số đếm dồn. Sai chỗ này thì người dùng bấm vào một hàng và sidebar mở ra khách khác, mà không có gì báo lỗi.
 *
 * Bốn, hàng không có mã bản ghi bị bỏ qua và được **đếm**. Một hàng trắng đi tới client sẽ thành một khách có mã rỗng, rồi hàng trắng thứ hai ghi đè lên đúng chỗ đó.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Đọc bản ghi — tra cột theo mã, và hàng trắng phải được đếm chứ không lọt qua');

  let nen;
  try {
    // `themCot` chèn một mã lạ vào giữa hàng 1: đúng hoàn cảnh người dùng tự thêm một cột của riêng họ.
    nen = dungHop({ sheets: ['Customer', 'Activity'], themCot: true });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/EntityRead.js', err);
  }

  const hop = nen.hop;
  const hangDau = hop.SHEET_FIRST_DATA_ROW;

  const ten = hop.entityReadFields('customer');
  check(so, 'customer có 20 trường, mở đầu bằng id và kết bằng recordStatus',
    [ten.length, ten[0], ten[ten.length - 1]], [20, 'id', 'recordStatus']);
  check(so, 'KHÔNG một mã cột @ nào lọt vào bảng tên trường',
    ten.filter((name) => name.indexOf('@') >= 0), []);
  check(so, 'activity có 13 trường', hop.entityReadFields('activity').length, 13);
  checkThrows(so, 'thực thể lạ thì ném lỗi kèm danh sách thực thể có thật',
    () => hop.entityReadFields('khach'), 'customer, activity');

  const boiCanh = hop.entityReadContext('customer');
  check(so, 'bối cảnh biết sheet nào, mã bản ghi nằm ở trường thứ mấy, và múi giờ của tệp',
    [boiCanh.sheetName, boiCanh.idAt, boiCanh.timezone], ['Customer', 0, 'Asia/Ho_Chi_Minh']);

  // Bằng chứng tra theo mã: cột lạ chèn ở vị trí thứ hai, nên `companyName` nằm ở cột 3 tức chỉ số 2.
  // Nếu code đếm theo thứ tự khai thì con số này là 1, và mọi giá trị sẽ lệch đi một cột mà không báo lỗi.
  check(so, 'cột lạ chèn vào giữa thì chỉ số cột dịch theo, vì tra theo mã chứ không theo thứ tự khai',
    [boiCanh.indexes[0], boiCanh.indexes[1], boiCanh.indexes[2]], [0, 2, 3]);
  check(so, 'sheet chỉ có hàng tiêu đề thì rowCount là 0', boiCanh.rowCount, 0);

  // Ca rỗng đi trước mọi ca khác, vì đó là ca của lượt mở sidebar đầu tiên trên sheet trắng.
  const goiRong = hop.entityReadAll('customer');
  check(so, 'sheet trắng đọc ra gói rỗng đúng hình dạng, không ném lỗi',
    [goiRong.entity, goiRong.rows, goiRong.rowIndexes, goiRong.blankRows], ['customer', [], [], 0]);
  check(so, 'gói rỗng vẫn gửi kèm bảng tên trường đầy đủ', goiRong.fields, ten);

  // Ba hàng: hai hàng có mã, một hàng ở GIỮA có nội dung nhưng không có mã.
  ghiO(nen, 'Customer', hangDau, '@CUS_MA_KH', 'KH0001');
  ghiO(nen, 'Customer', hangDau, '@CUS_TEN_CTY', '  Công ty Một  ');
  ghiO(nen, 'Customer', hangDau, '@CUS_NGAY_DONG_THAU', new Date(2026, 1, 20, 15, 45, 30));
  ghiO(nen, 'Customer', hangDau, '@CUS_TT_BAN_GHI', 'active');

  ghiO(nen, 'Customer', hangDau + 1, '@CUS_TEN_CTY', 'Hàng người dùng xóa mã nhưng chưa xóa hàng');

  ghiO(nen, 'Customer', hangDau + 2, '@CUS_MA_KH', 'KH0003');
  ghiO(nen, 'Customer', hangDau + 2, '@CUS_TEN_CTY', 'Công ty Ba');
  ghiO(nen, 'Customer', hangDau + 2, '@CUS_TT_BAN_GHI', 'deleted');

  const goi = hop.entityReadAll('customer');
  check(so, 'đọc ra 2 bản ghi và đếm được 1 hàng không có mã', [goi.rows.length, goi.blankRows], [2, 1]);
  check(so, 'rowIndexes là số hàng THẬT trên sheet, không phải số đếm dồn', goi.rowIndexes, [hangDau, hangDau + 2]);
  check(so, 'khoảng trắng hai đầu bị cắt', goi.rows[0][ten.indexOf('companyName')], 'Công ty Một');
  check(so, 'ô Date thành chuỗi YYYY-MM-DD, cắt giờ đi vì precision là day',
    goi.rows[0][ten.indexOf('bidClosingDate')], '2026-02-20');
  check(so, 'ô trống thành chuỗi rỗng, không thành undefined hay null',
    goi.rows[0][ten.indexOf('email')], '');

  // Ràng buộc cứng tài liệu 05 Phần 4: máy chủ gửi MỌI bản ghi, kể cả bản ghi đã xóa mềm. Việc ẩn nó là việc của client.
  // Lọc ở đây thì bản ghi đã xóa biến mất khỏi RAM, và đường phục hồi mất luôn thứ nó cần phục hồi.
  check(so, 'bản ghi recordStatus deleted VẪN được gửi, không bị lọc ở máy chủ',
    goi.rows.map((row) => row[ten.indexOf('recordStatus')]), ['active', 'deleted']);

  // Đọc theo gói: cùng một bối cảnh dùng cho nhiều gói, và hai gói kề nhau không được đọc trùng hàng.
  const bc = hop.entityReadContext('customer');
  check(so, 'gói 1 hàng đọc đúng một bản ghi đầu', hop.entityReadRange(bc, hangDau, 1).rowIndexes, [hangDau]);
  check(so, 'gói tiếp theo đọc từ hàng kế, không đọc lại hàng cũ', hop.entityReadRange(bc, hangDau + 1, 2).rowIndexes, [hangDau + 2]);
  check(so, 'gói 0 hàng ra rỗng chứ không ném lỗi', hop.entityReadRange(bc, hangDau, 0).rows, []);
  check(so, 'gói bắt đầu ngoài lưới cũng ra rỗng', hop.entityReadRange(bc, bc.sheet.getMaxRows() + 5, 10).rows, []);

  // Kiểu NUMBER. Đường đọc KHÔNG đổi số: nó không cắt số về số, mà cũng không phán xét ô gõ chữ.
  // Ô gõ chữ phải hiện lên form đúng như đã gõ để người dùng thấy mà sửa; đổi thầm nó thành 0 là làm hỏng dữ liệu trong im lặng.
  const tenGd = hop.entityReadFields('activity');
  ghiO(nen, 'Activity', hangDau, '@ACT_MA_GD', 'GD0001');
  ghiO(nen, 'Activity', hangDau, '@ACT_GIA_TRI_HD', 1500000);
  ghiO(nen, 'Activity', hangDau, '@ACT_HAN_XU_LY', new Date(2026, 2, 1, 9, 5, 59));
  ghiO(nen, 'Activity', hangDau + 1, '@ACT_MA_GD', 'GD0002');
  ghiO(nen, 'Activity', hangDau + 1, '@ACT_GIA_TRI_HD', '  chờ báo giá  ');

  const goiGd = hop.entityReadAll('activity');
  check(so, 'số giữ nguyên là số, không thành chuỗi', goiGd.rows[0][tenGd.indexOf('contractValue')], 1500000);
  check(so, 'ô gõ chữ ở cột số đi qua nguyên văn đã cắt khoảng trắng', goiGd.rows[1][tenGd.indexOf('contractValue')], 'chờ báo giá');
  check(so, 'ô số để trống ra chuỗi rỗng', goiGd.rows[1][tenGd.indexOf('dueAt')], '');
  check(so, 'precision minute ra YYYY-MM-DD HH:mm, không có giây', goiGd.rows[0][tenGd.indexOf('dueAt')], '2026-03-01 09:05');

  // Không một giá trị nào được là `Date` sau khi đọc: `google.script.run` không mang được `Date` qua, nó sẽ thành `null` bên client.
  const coDate = goiGd.rows.concat(goi.rows).some((row) => row.some((o) => hop.dateTextIsDate(o)));
  check(so, 'không một ô nào còn là Date sau khi đọc — google.script.run không mang Date qua được', coDate, false);

  return so;
}

module.exports = { chay };
