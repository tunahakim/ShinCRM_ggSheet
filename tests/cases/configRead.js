/**
 * Ca kiểm cho `server/sheet/ConfigRead.js`: ba bảng cấu hình và hợp đồng bộ đếm suy từ tham số.
 *
 * Hai luật trái ngược nhau nằm trong cùng một tệp, và đó chính là chỗ đáng kiểm.
 *
 * Khóa trùng ở đây **ném lỗi**, trong khi giá trị trùng ở `Category` chỉ cảnh báo. Không phải hai cách xử lý tùy hứng: hai hàng cùng khóa ở `Config` là hai câu trả lời khác nhau cho cùng một câu hỏi, và câu trả lời đó ảnh hưởng tới **mọi bản ghi ghi sau đó** — tự chọn một hàng nghĩa là người dùng sửa hàng còn lại, thấy không có tác dụng gì, rồi ngồi đoán.
 *
 * Khối `sort` là khối **duy nhất** trong `Config` mà thứ tự hàng mang nghĩa, nên nó không đi đường tra khóa. Hai điều được canh riêng cho nó: thứ tự giữ nguyên, và hàng thiếu một vế thì **bỏ qua rồi đi tiếp** chứ không dừng đọc — dừng ở hàng thiếu nghĩa là một ô xóa lỡ tay ở cấp hai âm thầm làm mất cấp ba và cấp bốn.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Các khối Config — khóa trùng thì chặn, còn khối sắp xếp thì thứ tự là nghĩa');

  let nen;
  try {
    nen = dungHop({ sheets: ['Config'] });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/ConfigRead.js', err);
  }

  const hop = nen.hop;
  const hangDau = hop.SHEET_FIRST_DATA_ROW;

  check(so, 'hai khối đọc theo kiểu tra khóa, khai bằng cặp mã cột',
    Object.keys(hop.CONFIG_READ_BLOCKS).sort(), ['defaults', 'sheetSchema']);

  // Ca rỗng đi trước: sheet Config mới dựng chưa có dòng nào ở cả bốn khối, và đó là trạng thái bình thường.
  const rong = hop.configReadAll();
  check(so, 'sheet mới dựng đọc ra ba bảng rỗng và một danh sách rỗng',
    [rong.sheetSchema, rong.defaults, rong.counters, rong.sort], [{}, {}, { customer: '', activity: '' }, []]);

  // Bốn khối chạy dọc ĐỘC LẬP: khối này có dòng ở hàng 4, khối kia bắt đầu ở hàng 6, và không khối nào ảnh hưởng khối nào.
  ghiO(nen, 'Config', hangDau, '@CFG_COT_MA', '@CUS_COT_RIENG');
  ghiO(nen, 'Config', hangDau, '@CFG_COT_KIEU', 'TEXT');
  ghiO(nen, 'Config', hangDau + 4, '@CFG_NGAM_DINH_MA_COT', '@CUS_XAC_THUC');
  ghiO(nen, 'Config', hangDau + 4, '@CFG_NGAM_DINH_GIA_TRI', '  Chưa xác thực  ');
  ghiO(nen, 'Config', hangDau + 1, '@CFG_THAM_SO', hop.ID_COUNTER_CONFIG_NAMES.customer);
  ghiO(nen, 'Config', hangDau + 1, '@CFG_THAM_SO_GIA_TRI', 17);
  hop.resetSettingsCache();

  const doc = hop.configReadAll();
  check(so, 'khối cột người dùng thêm đọc đúng cặp mã và kiểu', doc.sheetSchema, { '@CUS_COT_RIENG': 'TEXT' });
  check(so, 'khối ngầm định đọc được dù nằm ở hàng khác hẳn, và cắt khoảng trắng',
    doc.defaults, { '@CUS_XAC_THUC': 'Chưa xác thực' });
  check(so, 'ô số bộ đếm trong khối tham số vẫn ra hợp đồng riêng ổn định cho RAM',
    doc.counters, { customer: '17', activity: '' });

  // Khối sắp xếp. Dựng ba cấp KÈM một hàng thiếu vế ở giữa để canh luật "bỏ qua rồi đi tiếp".
  ghiO(nen, 'Config', hangDau, '@CFG_SORT_COL', '@CUS_NGAY_NHAP_LIEU');
  ghiO(nen, 'Config', hangDau, '@CFG_SORT_LEVEL', 'desc');
  ghiO(nen, 'Config', hangDau + 1, '@CFG_SORT_COL', '@CUS_TEN_CTY');
  ghiO(nen, 'Config', hangDau + 2, '@CFG_SORT_LEVEL', 'asc');
  ghiO(nen, 'Config', hangDau + 3, '@CFG_SORT_COL', '  @CUS_MST  ');
  ghiO(nen, 'Config', hangDau + 3, '@CFG_SORT_LEVEL', 'asc');

  const sort = hop.configReadAll().sort;
  check(so, 'hàng thiếu một vế bị bỏ qua nhưng KHÔNG làm mất cấp bên dưới',
    sort, [{ col: '@CUS_NGAY_NHAP_LIEU', level: 'desc' }, { col: '@CUS_MST', level: 'asc' }]);
  check(so, 'thứ tự trên xuống của sheet chính là thứ tự cấp sắp xếp', sort[0].col, '@CUS_NGAY_NHAP_LIEU');

  // Cùng một mã cột xuất hiện ở hai cấp là chuyện hợp lệ, và chính nó là lý do khối này không đi đường tra khóa.
  ghiO(nen, 'Config', hangDau + 5, '@CFG_SORT_COL', '@CUS_NGAY_NHAP_LIEU');
  ghiO(nen, 'Config', hangDau + 5, '@CFG_SORT_LEVEL', 'asc');
  check(so, 'một mã cột đứng ở hai cấp thì giữ cả hai, không gộp mất một',
    hop.configReadAll().sort.filter((item) => item.col === '@CUS_NGAY_NHAP_LIEU').length, 2);

  // Khóa trùng. Ném lỗi, và lời lỗi phải nêu ĐÚNG khối nào cùng ĐÚNG khóa nào để người dùng biết mở cột nào ra sửa.
  const trung = dungHop({ sheets: ['Config'] });
  ghiO(trung, 'Config', hangDau, '@CFG_NGAM_DINH_MA_COT', '@CUS_XAC_THUC');
  ghiO(trung, 'Config', hangDau, '@CFG_NGAM_DINH_GIA_TRI', 'Chưa xác thực');
  ghiO(trung, 'Config', hangDau + 3, '@CFG_NGAM_DINH_MA_COT', '  @CUS_XAC_THUC  ');
  ghiO(trung, 'Config', hangDau + 3, '@CFG_NGAM_DINH_GIA_TRI', 'Đã xác thực');

  checkThrows(so, 'khóa trùng ở khối ngầm định thì ném lỗi nêu tên khối', () => trung.hop.configReadAll(), 'Ngầm định gõ tay');
  checkThrows(so, 'lời lỗi nêu đúng khóa bị trùng', () => trung.hop.configReadAll(), '@CUS_XAC_THUC');
  checkThrows(so, 'lời lỗi nói rõ phải làm gì', () => trung.hop.configReadAll(), 'xóa dòng thừa');

  // Trùng ở một khối không ngăn đường đọc tham số độc lập.
  check(so, 'khối tham số của cùng sheet vẫn đọc riêng được dù khối ngầm định đang trùng',
    trung.hop.configCounterValues(trung.hop.configParams()), { customer: '', activity: '' });

  return so;
}

module.exports = { chay };
