/**
 * Ca kiểm cho bộ đếm cấp mã trong `server/gate/IdGate.js`, nay lưu ở Document Properties.
 *
 * Nhánh đáng sợ nhất là nhánh hỏng âm thầm: bộ đếm hỏng mà tự về 0 thì lần cấp kế tiếp trùng mã cũ; bộ đếm thấp hơn mã đang có thì lưới an toàn của cấp mã phải chặn.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows } = require('../lib/assert');

function chay(so) {
  section('Bộ đếm cấp mã ở Document Properties');

  // Chưa có khóa: tệp mới cấp từ 1; bộ đếm đời cũ trong sheet Config được hàm chuyển một lần nhận vào kho (`tests/cases/settingsMigrate.js`).
  const moiTinh = dungHop({ sheets: ['Log', 'Customer'] });
  check(so, 'chưa có khóa thì cấp mã từ 1 rồi ghi khóa vào Document Properties',
    [moiTinh.hop.idGateIssue('customer', 2, moiTinh.hop.entityReadContext('customer')), moiTinh.props.ID_COUNTER_CUSTOMER], [['CUS-000001', 'CUS-000002'], '2']);

  const moi = dungHop({ sheets: ['Log', 'Customer'], props: { ID_COUNTER_CUSTOMER: '5' } });
  check(so, 'đã có khóa thì cấp tiếp từ khóa', moi.hop.idGateIssue('customer', 1, moi.hop.entityReadContext('customer')), ['CUS-000006']);

  // Giá trị hỏng: dừng cấp mã, không tự về 0 rồi ghi đè.
  const hong = dungHop({ sheets: ['Log', 'Customer'], props: { ID_COUNTER_CUSTOMER: 'abc' } });
  checkThrows(so, 'bộ đếm hỏng thì ném lỗi thay vì cấp lại từ 1',
    () => hong.hop.idGateIssue('customer', 1, hong.hop.entityReadContext('customer')), 'ID_COUNTER_CUSTOMER');
  check(so, 'bộ đếm hỏng vẫn giữ nguyên giá trị để người phụ trách sửa tay', hong.props.ID_COUNTER_CUSTOMER, 'abc');

  section('Cột mã đọc một lần cho cả tìm dòng và lưới an toàn của cấp mã');

  const mot = dungHop({ sheets: ['Log', 'Customer'] });
  const { ghiO } = require('../lib/dung-hop');
  ghiO(mot, 'Customer', 4, '@CUS_MA_KH', 'CUS-000009');
  // Cửa ghi luôn chạy trong một lần gọi, nơi bản đọc Sheet chung nhớ cột mã.
  mot.hop.documentStoreBegin();
  const ctxMot = mot.hop.entityReadContext('customer');
  const cotMa = ctxMot.indexes[ctxMot.idAt] + 1;
  let lanDocCotMa = 0;
  const layVung = ctxMot.sheet.getRange.bind(ctxMot.sheet);
  ctxMot.sheet.getRange = function (row, col, rows, cols) { if (col === cotMa && cols === 1 && rows === ctxMot.rowCount) { lanDocCotMa += 1; } return layVung.apply(null, arguments); };
  const dong = mot.hop.entityRowMap(ctxMot);
  const maMoi = mot.hop.idGateIssue('customer', 1, ctxMot);
  mot.hop.documentStoreEnd();
  check(so, 'cửa ghi tìm dòng rồi cấp mã mới chỉ đọc cột mã một lần, lưới an toàn vẫn nhảy qua số lớn nhất trên sheet',
    [lanDocCotMa, dong['CUS-000009'], maMoi[0] > 'CUS-000009'], [1, 4, true]);

  return so;
}

module.exports = { chay };
