/**
 * Khung dựng môi trường GAS giả trong `tests/lib/gas/`: kho thuộc tính, một lần gọi, đọc Log, bản ghi mẫu.
 *
 * Khung sai thì mọi ca dựng trên nó xanh trên một môi trường không tồn tại, nên khung cũng phải có phép kiểm như code thật. Nhánh dễ hỏng âm thầm: kho biến chuỗi rỗng thành `null`, kho không ép chuỗi, kho trộn ba vùng, lần gọi không đi qua cửa thật, bản ghi mẫu ghi nhầm cột.
 */

const { section, check, checkThrows } = require('../../lib/assert');
const { taoKhoThuocTinh, taoPropertiesService, khoGay } = require('../../lib/gas/kho-thuoc-tinh');
const { trongLanGoi, TEN_LAN_GOI } = require('../../lib/gas/lan-goi');
const { docLog } = require('../../lib/gas/doc-log');
const { ghiKhach, ghiGiaoDich } = require('../../lib/gas/mau-ban-ghi');
const { dungHop } = require('../../lib/dung-hop');
const { taoHopCat } = require('../../lib/load-gas');

function testKho(so) {
  const duLieu = { rong: '' };
  const dem = { doc: 0, ghi: 0 };
  const kho = taoKhoThuocTinh(duLieu, dem);
  check(so, 'kho: khóa chưa có trả null, chuỗi rỗng đã lưu vẫn là chuỗi rỗng', [kho.getProperty('khong'), kho.getProperty('rong')], [null, '']);
  check(so, 'kho: giá trị lưu thành chuỗi, ghi nối được vì trả lại chính kho', [kho.setProperty('so', 5) === kho, duLieu.so], [true, '5']);
  kho.setProperties({ a: 1, b: true });
  check(so, 'kho: setProperties giữ khóa cũ khi không xóa hết', Object.keys(duLieu).sort(), ['a', 'b', 'rong', 'so']);
  kho.setProperties({ c: 'x' }, true);
  check(so, 'kho: setProperties với deleteAllOthers chỉ còn khóa mới', Object.assign({}, duLieu), { c: 'x' });
  kho.deleteProperty('c');
  kho.setProperty('d', 'y');
  kho.deleteAllProperties();
  check(so, 'kho: xóa một khóa và xóa hết đều chạm đúng đối tượng truyền vào', Object.keys(duLieu), []);
  check(so, 'kho: mỗi lệnh đọc/ghi tăng đúng một, đếm riêng theo tên lệnh', [dem.doc, dem.ghi, dem.lenh.setProperties, dem.lenh.deleteProperty, dem.lenh.getProperty], [2, 6, 2, 1, 2]);

  const doc = {}, user = {}, script = {};
  const ps = taoPropertiesService({ doc: doc, user: user, script: script });
  ps.getDocumentProperties().setProperty('k', 'tai lieu');
  ps.getUserProperties().setProperty('k', 'nguoi dung');
  check(so, 'PropertiesService: ba kho tách rời, cùng khóa không đè nhau', [doc.k, user.k, Object.keys(script).length], ['tai lieu', 'nguoi dung', 0]);

  const gay = khoGay('kho hỏng');
  checkThrows(so, 'khoGay: lấy kho tài liệu thì ném đúng thông báo', () => gay.getDocumentProperties(), 'kho hỏng');
  checkThrows(so, 'khoGay: lấy kho người dùng thì ném đúng thông báo', () => gay.getUserProperties(), 'kho hỏng');
}

function testLanGoi(so) {
  checkThrows(so, 'trongLanGoi: hộp chưa nạp EntryPoint thì ném lỗi rõ, không lùi về bản tự viết', () => trongLanGoi(taoHopCat(), () => 1), 'EntryPoint.js');

  const nen = dungHop({ sheets: ['Log'] });
  let trongCua = null;
  const kq = trongLanGoi(nen.hop, () => { trongCua = nen.hop.documentStoreActive(); return 'xong'; });
  check(so, 'trongLanGoi: chạy qua cửa thật (bản đọc kho mở trong lần gọi, đóng sau đó) và trả kết quả của hàm', [trongCua, nen.hop.documentStoreActive(), kq], [true, false, 'xong']);
  check(so, 'trongLanGoi: tên lần gọi cố định', TEN_LAN_GOI, 'lanGoiThu');
}

function testDocLog(so) {
  const nen = dungHop({ sheets: ['Log'] });
  check(so, 'docLog: Log trống trả mảng rỗng', docLog(nen), []);
  nen.hop.logEvent({ source: 'core', action: 'thuDocLog', outcome: '✅ ok', reason: 'dòng thử' });
  check(so, 'docLog: chưa nhả bộ đệm thì chưa có dòng', docLog(nen).length, 0);
  const dong = docLog(nen, { flush: true });
  check(so, 'docLog: flush nhả bộ đệm, mỗi dòng đủ số cột của LOG_HEADERS', [dong.length, dong[0].length], [1, nen.hop.LOG_HEADERS.length]);
  check(so, 'docLog: noi nối các ô của dòng thành chuỗi', /thuDocLog\|.*dòng thử/.test(docLog(nen, { noi: '|' })[0]), true);
}

function testMauBanGhi(so) {
  const nen = dungHop({ sheets: ['Customer', 'Activity'] });
  const dau = nen.hop.SHEET_LAYOUT.Customer.firstDataRow;
  ghiKhach(nen, dau, { ma: 'KH1', ten: 'Công ty A' });
  const o = (sheet, codes, hang, ma) => sheet.getRange(hang, codes.indexOf(ma) + 1).getValue();
  const c = nen.Customer;
  check(so, 'ghiKhach: ghi theo mã cột, tình trạng mặc định active, trường không truyền thì để trống', [
    o(c.sheet, c.codes, dau, '@CUS_MA_KH'), o(c.sheet, c.codes, dau, '@CUS_TEN_CTY'), o(c.sheet, c.codes, dau, '@CUS_TT_BAN_GHI'), o(c.sheet, c.codes, dau, '@CUS_MST')
  ], ['KH1', 'Công ty A', 'active', '']);

  const dauGd = nen.hop.SHEET_LAYOUT.Activity.firstDataRow;
  ghiGiaoDich(nen, dauGd, { ma: 'GD1', maKhach: 'KH1', ngay: '2026-11-01', tinhTrang: 'deleted' });
  const a = nen.Activity;
  check(so, 'ghiGiaoDich: ghi theo mã cột, tình trạng truyền vào được giữ', [
    o(a.sheet, a.codes, dauGd, '@ACT_MA_GD'), o(a.sheet, a.codes, dauGd, '@ACT_MA_KH'), o(a.sheet, a.codes, dauGd, '@ACT_TT_BAN_GHI')
  ], ['GD1', 'KH1', 'deleted']);
}

function chay(so) {
  section('Khung test GAS — kho thuộc tính, một lần gọi, đọc Log, bản ghi mẫu');
  testKho(so);
  testLanGoi(so);
  testDocLog(so);
  testMauBanGhi(so);
}

module.exports = { chay };
