const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('ViewSheetRenderer — giao dịch sống gần nhất, lọc, sắp và rowMap');
  let nen;
  try {
    nen = dungHop({
      sheets: ['Customer', 'Activity', 'Config', 'Category', 'Log'],
      tep: TEP_NEN.concat(['server/view/FilterMessages.js', 'server/view/FilterParser.js', 'server/view/SortSpec.js', 'server/view/ViewSheetRenderer.js'])
    });
  } catch (err) { return ghiLoiNap(so, 'nạp ViewSheetRenderer', err); }
  const view = nen.book.insertSheet('!Lead');
  view.getRange(1, 1, 1, 5).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@ACT_CONG_VIEC', '@ACT_GIA_TRI_HD']]);
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH0001');
  ghiO(nen, 'Customer', 4, '@CUS_TEN_CTY', 'Mot');
  ghiO(nen, 'Customer', 5, '@CUS_MA_KH', 'KH0002');
  ghiO(nen, 'Customer', 5, '@CUS_TEN_CTY', 'Hai');
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'GD0001');
  ghiO(nen, 'Activity', 4, '@ACT_MA_KH', 'KH0001');
  ghiO(nen, 'Activity', 4, '@ACT_NGAY_LAM_VIEC', '2026-03-01');
  ghiO(nen, 'Activity', 4, '@ACT_CONG_VIEC', 'Email');
  ghiO(nen, 'Activity', 5, '@ACT_MA_GD', 'GD0002');
  ghiO(nen, 'Activity', 5, '@ACT_MA_KH', 'KH0001');
  ghiO(nen, 'Activity', 5, '@ACT_NGAY_LAM_VIEC', '2026-03-02');
  ghiO(nen, 'Activity', 5, '@ACT_CONG_VIEC', 'Gọi điện');
  ghiO(nen, 'Activity', 5, '@ACT_TT_BAN_GHI', 'deleted');
  ghiO(nen, 'Activity', 6, '@ACT_MA_GD', 'GD0003');
  ghiO(nen, 'Activity', 6, '@ACT_MA_KH', 'KH0002');
  ghiO(nen, 'Activity', 6, '@ACT_NGAY_LAM_VIEC', '2026-03-03');
  ghiO(nen, 'Activity', 6, '@ACT_CONG_VIEC', 'Email');

  const result = nen.hop.renderViewSheet('!Lead');
  check(so, 'khách có giao dịch mới đã xóa mềm dùng lần sống trước đó', view.getRange(4, 4).getValue(), 'Email');
  check(so, 'khách chưa có giao dịch vẫn có thể hiện thành dòng', Object.values(result.rowMaps['!Lead']).sort(), ['KH0001', 'KH0002']);
  check(so, 'rowMap dựng theo hàng thật sau khi ghi', Object.keys(result.rowMaps['!Lead']).sort(), ['4', '5']);

  view.getRange(3, 5).setValue('60..50');
  view.getRange(4, 5).setValue('giữ nguyên');
  let failed = false;
  try { nen.hop.renderViewSheet('!Lead'); } catch (err) { failed = true; }
  check(so, 'cú pháp sai dừng trước khi đụng sheet', [failed, view.getRange(4, 5).getValue()], [true, 'giữ nguyên']);
}

module.exports = { chay };
