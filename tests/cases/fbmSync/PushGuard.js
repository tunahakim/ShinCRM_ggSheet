/** Cửa chặn trước request đẩy: đủ bảy trường FBM bắt buộc của Customer, giới hạn độ dài, Activity sai owner và mở form không thấy bản ghi (FBM-048) đều bị chặn trước lệnh lưu. */
const { section, check } = require('../../lib/assert');
const { dungHopDay } = require('../../lib/fbm/hop-day');

async function chay(so) {
  section('FBM sync — push: cửa chặn');
  const { push, dieuKienThat } = dungHopDay();
  push.FbmSync.pushEligibilityErrors = dieuKienThat;
  const requiredCustomer = { companyName: 'Company', taxNumber: '0100123456', contactPerson: 'Contact', phone: '0900000000', leadSource: 'Source', address: 'Ha Noi', province: 'HNI' };
  check(so, 'Customer du bay field FBM bat buoc',
    push.FbmSync.pushEligibilityErrors(requiredCustomer, 'customer').length,
    0);
  ['companyName', 'taxNumber', 'contactPerson', 'phone', 'leadSource', 'address', 'province'].forEach((field) => {
    const invalid = Object.assign({}, requiredCustomer); delete invalid[field];
    check(so, 'Customer thieu field bat buoc ' + field,
      push.FbmSync.pushEligibilityErrors(invalid, 'customer').some((message) => message.indexOf('Thi') === 0),
      true);
  });
  check(so, 'Customer vuot gioi han do dai bi chan',
    push.FbmSync.pushEligibilityErrors(Object.assign({}, requiredCustomer, { companyName: 'x'.repeat(1001) }), 'customer').length > 0,
    true);
  check(so, 'Activity vuot gioi han noi dung bi chan',
    push.FbmSync.pushEligibilityErrors({ taskType: 'Goi', content: 'x'.repeat(4001), workDate: '2026-09-09' }, 'activity').length > 0,
    true);
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Chu tai khoan dung' });
  let ownerMismatch = '';
  try {
    push.FbmSync.pushOperationStep({ metadata: {}, cursor: { operation: 'activity_edit_open', entity: 'activity', candidate: { entity: 'activity', id: 'ACT-OWNER', record: { id: 'ACT-OWNER', fbmId: 'A-OWNER' } } } }, { d: { Row: ['A-OWNER'], InternalValues: [{ Name: 'owner', NewValue: 'Chu tai khoan khac' }] } }, push.FbmSync.scriptSettings());
  } catch (error) { ownerMismatch = String(error && error.message || error); }
  check(so, 'Activity sai owner bi chan truoc request sua',
    ownerMismatch.indexOf('khác tài khoản FBM đang đăng nhập') >= 0,
    true);
  ['customer', 'activity'].forEach((entity) => {
    let notFound = null;
    try {
      push.FbmSync.pushOperationStep({ metadata: {}, cursor: { operation: entity + '_edit_open', entity, candidate: { entity, id: 'X-GIA', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } } } }, { d: { Row: null, InternalValues: [{ Name: 'nguoi_sua', NewValue: '' }] } }, push.FbmSync.scriptSettings());
    } catch (error) { notFound = error; }
    check(so, 'FBM-048: ' + entity + ' mở form không thấy đúng bản ghi thì không phát lệnh lưu',
      [notFound && notFound.code, push.FbmSync.stateRead().cursor && push.FbmSync.stateRead().cursor.operation === entity + '_edit_save'],
      ['FBM_RECORD_NOT_FOUND', false]);
  });
}

module.exports = { chay };
