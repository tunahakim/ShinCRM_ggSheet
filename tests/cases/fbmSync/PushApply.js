/** Áp kết quả hai pha của lệnh đẩy: pha 1 giữ baseline cũ và không ghi Log từng bản ghi, Activity tạo mới trả hash kèm ID FBM, ghi Sheet hỏng sau khi FBM đã lưu thì lỗi nổi lên. */
const { section, check } = require('../../lib/assert');
const { dungHopDay } = require('../../lib/fbm/hop-day');

async function chay(so) {
  section('FBM sync — push: áp kết quả hai pha');
  const { push } = dungHopDay();
  let pushPatch, pushWriteRequest;
  const pushLogs = [];
  push.logEvent = (event) => pushLogs.push(event);
  push.writeGateSave = (request) => { pushWriteRequest = request; pushPatch = request.records[0]; return { ok: true }; };
  push.FbmSync.pushResultSent({ entity: 'customer', record: { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' } }, { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-OLD' }, { Name: 'ma_kh', Value: 'ALT00010' }] } }, 'customer_edit_save', { map: {} }, '');
  check(so, 'push thanh cong giu baseline cu cho ky xac nhan va dung source push',
    [pushPatch.fbmHash, pushWriteRequest.source],
    ['BASE', 'push']);
  check(so, 'push thành công không ghi Log từng record', pushLogs.length, 0);
  const createdActivity = { id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' };
  const createdSent = push.FbmSync.pushResultSent({ entity: 'activity', record: createdActivity }, { d: { InternalValues: [{ Name: 'id', Value: 174900 }] } }, 'activity_new_save', { map: {} }, '');
  check(so, 'FBM-050: tạo Activity trả hash đã gửi kèm ID FBM vừa cấp, khớp bản đọc xác nhận',
    createdSent.sentHash,
    push.FbmSync.hash(Object.assign({}, createdActivity, { fbmId: '174900' }), 'activity', { map: {} }));

  // Pha 1 không ghi kho nào ngoài dòng: hash đã gửi trả về cho dấu trang; ghi Sheet hỏng sau khi FBM đã lưu thì lỗi nổi lên, không nuốt.
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-THU-TU', fbmId: '', fbmHash: '' }] : [];
  const orderResponse = { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-THU-TU' }, { Name: 'ma_kh', Value: 'ALT00077' }] } };
  push.writeGateSave = () => { throw new Error('Sheet hỏng'); };
  let sheetFailure = '';
  try { push.FbmSync.pushResultSent({ entity: 'customer', record: { id: 'C-THU-TU', companyName: 'Thứ tự' } }, orderResponse, 'customer_create_save', { map: {} }, ''); } catch (error) { sheetFailure = String(error && error.message || error); }
  check(so, 'Pha 1: ghi Sheet ném lỗi sau khi FBM đã lưu thì lỗi nổi lên', sheetFailure !== '', true);
}

module.exports = { chay };
