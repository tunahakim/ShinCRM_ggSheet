/** Chuẩn hóa ngày và dấu vân khi kéo: ngày giữ chỗ 1999 thành rỗng, offset không đổi timestamp, id 0 không làm đổi dấu vân. */
const { section, check } = require('../../lib/assert');
const { hopKeoBien, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Chuẩn hóa ngày và dấu vân khi kéo');
  const edges = hopKeoBien();
  const gate = congDanhMucThu();
  edges.FbmSync.readCategoryGate = () => gate;
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh',
    edges.FbmSync.normalize('/Date(1757386800000+0700)/'),
    edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint',
    edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity', { map: {} }),
    edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity', { map: {} }));

  return so;
}

module.exports = { chay };
