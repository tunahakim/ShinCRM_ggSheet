/** Sổ đã thấy theo mã nội bộ: sắp lại dòng không mất dấu, mã lạ thì đóng an toàn, phạm vi cố định đầu kỳ bỏ qua bản ghi tạo sau. */
const { section, check } = require('../../lib/assert');
const { hopKeoBien } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Sổ đã thấy theo mã nội bộ');
  const edges = hopKeoBien();
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000320' }, { id: 'CUS-000321' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000321', fbmId: 'FBM-SEEN' }], [{ fbmId: 'FBM-SEEN' }]);
  check(so, 'bitmap seen bam theo ma noi bo nen sap xep lai dong khong lam mat dau',
    edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000321', fbmId: 'FBM-SEEN' }),
    true);
  check(so, 'bitmap fail closed voi ID cu, sai khuon hoac sai namespace',
    [edges.FbmSync.seenStoreHas('customer', { id: 'KH000321', fbmId: 'FBM-OLD' }), edges.FbmSync.seenStoreHas('customer', { id: 'khach-cu', fbmId: 'FBM-UNKNOWN' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-1', fbmId: 'FBM-SHORT' }), edges.FbmSync.seenStoreHas('customer', { id: 'ACT-000321', fbmId: 'FBM-WRONG-SCOPE' })],
    [true, true, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000019' }, { id: 'CUS-000020' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000019', fbmId: 'FBM-19' }, { id: 'CUS-000020', fbmId: 'FBM-20' }], [{ fbmId: 'FBM-20' }]);
  check(so, 'pham vi missing co dinh tai dau ky va bo qua record tao sau high-water',
    [edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000019' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000020' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000021' })],
    [false, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', []);
  check(so, 'pham vi rong dau ky bo qua moi record tao trong khi request dang bay',
    edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000001' }),
    true);

  return so;
}

module.exports = { chay };
