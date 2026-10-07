/**
 * Ca kiểm cho bộ đếm cấp mã trong `server/gate/IdGate.js`, nay lưu ở Document Properties.
 *
 * Nhánh đáng sợ nhất là nhánh hỏng âm thầm: bộ đếm hỏng mà tự về 0 thì lần cấp kế tiếp trùng mã cũ; chưa di chuyển mà bỏ qua số trong Config thì mã của bản ghi đã xóa ở cuối sheet bị cấp lại.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows } = require('../lib/assert');

function chay(so) {
  section('Bộ đếm cấp mã ở Document Properties');

  // Chưa có khóa: đọc số đời cũ trong Config, lần cấp đầu ghi khóa và không ghi gì xuống sheet.
  const cu = dungHop({ sheets: ['Config', 'Log', 'Customer'], thamSo: [['ID_COUNTER_CUSTOMER', 17]] });
  const ctx = cu.hop.entityReadContext('customer');
  const ghiTruoc = cu.dem.setValues;
  check(so, 'chưa có khóa thì cấp mã tiếp từ số đời cũ trong Config rồi ghi khóa vào Document Properties',
    [cu.hop.idGateIssue('customer', 2, ctx), cu.props.ID_COUNTER_CUSTOMER], [['CUS-000018', 'CUS-000019'], '19']);
  check(so, 'cấp mã không còn ghi ô nào xuống sheet Config', cu.dem.setValues, ghiTruoc);

  // Đã có khóa: khóa thắng, số cũ trong Config bị bỏ qua để bộ đếm không bị kéo lùi.
  const moi = dungHop({ sheets: ['Config', 'Log', 'Customer'], thamSo: [['ID_COUNTER_CUSTOMER', 99]], props: { ID_COUNTER_CUSTOMER: '5' } });
  check(so, 'đã có khóa trong Document Properties thì bỏ qua dòng cũ trong Config',
    moi.hop.idGateIssue('customer', 1, moi.hop.entityReadContext('customer')), ['CUS-000006']);

  // Giá trị hỏng: dừng cấp mã, không tự về 0 rồi ghi đè.
  const hong = dungHop({ sheets: ['Config', 'Log', 'Customer'], props: { ID_COUNTER_CUSTOMER: 'abc' } });
  checkThrows(so, 'bộ đếm hỏng thì ném lỗi thay vì cấp lại từ 1',
    () => hong.hop.idGateIssue('customer', 1, hong.hop.entityReadContext('customer')), 'ID_COUNTER_CUSTOMER');
  check(so, 'bộ đếm hỏng vẫn giữ nguyên giá trị để người phụ trách sửa tay', hong.props.ID_COUNTER_CUSTOMER, 'abc');

  return so;
}

module.exports = { chay };
