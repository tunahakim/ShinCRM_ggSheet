/**
 * Dựng hoàn cảnh cho các ca kiểm sheet quản trị (`!Tên`): hộp có các tệp `server/view/`, một sheet `!Lead` với hàng mã, dữ liệu mẫu hai khách và ba giao dịch.
 *
 * Một chỗ cho cả ba tệp ca `tests/cases/view/`, để ba tệp kiểm ba công cụ trên cùng một hoàn cảnh chứ không phải ba bản dựng lệch nhau.
 */

const { dungHop, ghiO, TEP_NEN } = require('../dung-hop');
const { trongLanGoi } = require('../gas/lan-goi');
const { ghiKhach, ghiGiaoDich } = require('../gas/mau-ban-ghi');

/** Tệp máy chủ cho sheet quản trị: bộ nền cộng các tệp vẽ, lọc, sắp. */
const TEP_VIEW = TEP_NEN.concat([
  'server/view/FilterMessages.js',
  'server/view/FilterParser.js',
  'server/view/SortSpec.js',
  'server/view/ViewSheetSetup.js',
  'server/view/ViewSheetRenderer.js'
]);

/** Hộp có sheet `!Lead` mà hàng 1 là `headers`. */
function taoNenView(headers) {
  const nen = dungHop({
    sheets: ['Customer', 'Activity', 'Category', 'Log'],
    tep: TEP_VIEW
  });
  const view = nen.book.insertSheet('!Lead');
  view.getRange(1, 1, 1, headers.length).setValues([headers]);
  return { nen, view };
}

function gieoHaiKhach(nen) {
  const dau = nen.hop.SHEET_LAYOUT.Customer.firstDataRow;
  ghiKhach(nen, dau, { ma: 'KH0001', ten: 'Mot' });
  ghiKhach(nen, dau + 1, { ma: 'KH0002', ten: 'Hai' });
}

/** Ba giao dịch: KH0001 có một giao dịch sống và một giao dịch đã xóa mới hơn, KH0002 có một giao dịch sống. */
function gieoHaiGiaoDich(nen) {
  const dau = nen.hop.SHEET_LAYOUT.Activity.firstDataRow;
  [
    { ma: 'GD0001', maKhach: 'KH0001', ngay: '2026-03-01', congViec: 'Email' },
    { ma: 'GD0002', maKhach: 'KH0001', ngay: '2026-03-02', congViec: 'Gọi điện', tinhTrang: 'deleted' },
    { ma: 'GD0003', maKhach: 'KH0002', ngay: '2026-03-03', congViec: 'Email' }
  ].forEach((gd, i) => {
    ghiGiaoDich(nen, dau + i, gd);
    ghiO(nen, 'Activity', dau + i, '@ACT_CONG_VIEC', gd.congViec);
  });
}

/** Gắn cờ ô điều khiển cho sheet `name` như khi người dùng sửa ô điều khiển, trong một lần gọi thật. */
function ganCoView(hop, name) {
  trongLanGoi(hop, () => hop.dirtyStateMarkSignal({ viewSheets: [name] }));
}

/** Tiêu đề các vấn đề của một kết quả vẽ. */
function tieuDeVanDe(result) {
  return (result.problems || []).map((problem) => problem.title);
}

module.exports = { TEP_VIEW, taoNenView, gieoHaiKhach, gieoHaiGiaoDich, ganCoView, tieuDeVanDe };
