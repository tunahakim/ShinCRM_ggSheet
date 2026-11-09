/** Ứng viên đẩy sau lỗi: cùng hash thì không lặp lại, hash đổi thì được thử lại. */
const { section, check } = require('../../lib/assert');
const { ungVienDay } = require('../../lib/fbm/buoc-day');
const { hopKeoBien } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Ứng viên đẩy sau lỗi');
  const edges = hopKeoBien();
  edges.FbmSync.scope = () => null;
  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmSyncPermission: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', { map: {} });
  edges.FbmSync.stateRead = () => ({ metadata: {} });
  edges.FbmSync.pushFailuresRead = () => ({ hashes: { 'customer:C-FAIL': failedHash }, details: {} });
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', ungVienDay(edges.FbmSync, 'customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', ungVienDay(edges.FbmSync, 'customer').length, 1);

  return so;
}

module.exports = { chay };
