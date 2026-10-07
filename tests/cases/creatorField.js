/**
 * Ca kiểm cột "Người tạo trên FBM" (`enteredBy`) ở cửa ghi.
 *
 * Nhánh hỏng âm thầm: người dùng gõ đè được tên người tạo, hoặc lượt kéo bị cửa ghi thay tên sale cũ bằng tên mình. Cả hai đều trông như dữ liệu hợp lệ trên Sheet nên chỉ test mới bắt được.
 */

const { dungHop, TEP_NEN } = require('../lib/dung-hop');
const { section, check } = require('../lib/assert');

function dungDay(tenNguoiDung) {
  return dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], thamSo: [['USER_NAME', tenNguoiDung]], tep: TEP_NEN });
}

function giaoDich(them) {
  return Object.assign({
    customerId: 'CUS-000001', workDate: '2026-09-06', taskType: 'Gọi điện', content: 'Chào hàng',
    product: 'Thép hộp', fbmSyncPermission: 'Cho phép'
  }, them || {});
}

function nguoiTao(ra) {
  const at = ra.fields.indexOf('enteredBy');
  return ra.rows.map((row) => row[at]);
}

function chay(so) {
  section('creatorField — cửa ghi tự điền và khóa cột Người tạo trên FBM');

  const nen = dungDay('Lê Tuấn Anh');
  const tao = nen.hop.writeGateSave({ entity: 'activity', records: [giaoDich({ enteredBy: 'Gõ đè' })] });
  check(so, 'giao dịch người dùng tạo mới lấy tên ở Config USER_NAME, bỏ giá trị client gửi', [tao.ok, nguoiTao(tao)], [true, ['Lê Tuấn Anh']]);

  const ma = tao.recordIds[0];
  const sua = nen.hop.writeGateSave({ entity: 'activity', records: [{ id: ma, content: 'Sửa nội dung', enteredBy: 'Gõ đè' }] });
  check(so, 'người dùng sửa giao dịch không đổi được người tạo', [sua.ok, nguoiTao(sua)], [true, ['Lê Tuấn Anh']]);

  const keo = nen.hop.writeGateSave({ entity: 'activity', records: [giaoDich({ enteredBy: 'Sale Cũ' })], source: 'pull' });
  check(so, 'lượt kéo tạo giao dịch giữ đúng người tạo trên FBM, không thay bằng USER_NAME', [keo.ok, nguoiTao(keo)], [true, ['Sale Cũ']]);

  const keoSua = nen.hop.writeGateSave({ entity: 'activity', records: [{ id: ma, enteredBy: 'Sale Mới' }], source: 'pull' });
  check(so, 'lượt kéo ghi đè người tạo của giao dịch đã có', [keoSua.ok, nguoiTao(keoSua)], [true, ['Sale Mới']]);

  const trong = dungDay('');
  const taoTrong = trong.hop.writeGateSave({ entity: 'activity', records: [giaoDich({ enteredBy: 'Gõ đè' })] });
  check(so, 'Config USER_NAME trống thì cột để trống, không lấy giá trị client', [taoTrong.ok, nguoiTao(taoTrong)], [true, ['']]);
}

module.exports = { chay };
