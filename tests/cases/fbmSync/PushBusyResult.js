/**
 * Pha 1 của áp kết quả đẩy (`pushResultSent`) khi dòng đang bị tiến trình khác giữ: cửa ghi không cho ghi mã FBM lên dòng, nên kết quả không được coi là đã ghi (không trả patch như thường, không báo "Đã ghi ..."); phải ném lỗi nêu lý do bận để lượt dừng thấy lỗi thay vì đi tiếp đọc xác nhận với dòng chưa có mã FBM.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { giuBanGhi } = require('../../lib/load-gas');

const PHAN_HOI = { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-1' }, { Name: 'ma_kh', Value: 'ALT00001' }] } };

function chay(so) {
  section('FBM sync — áp kết quả đẩy với dòng đang bận');
  const { hop } = workflowGas({ LOG_WARN: 'warn' }), F = hop.FbmSync, ghi = [];
  F.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-1', fbmId: '', fbmHash: '' }] : [];
  hop.writeGateSave = (request) => { ghi.push(request); return { ok: true }; };
  giuBanGhi(hop, 'nguoidung', 'customer', 'C-1', 'Người dùng đang sửa dòng này');
  let ketQua = null, loi = '';
  try { ketQua = F.pushResultSent({ entity: 'customer', record: { id: 'C-1', companyName: 'Công ty' } }, PHAN_HOI, 'customer_create_save', { map: {} }); } catch (error) { loi = String(error && error.message || error); }
  check(so, 'dòng đang bận: không ghi Sheet và không trả kết quả như đã ghi; lỗi nêu lý do bận',
    [ghi.length, ketQua, loi.indexOf('Người dùng đang sửa dòng này') >= 0],
    [0, null, true]);
}

module.exports = { chay };
