const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const TEP_VIEW = TEP_NEN.concat([
  'server/view/FilterMessages.js',
  'server/view/FilterParser.js',
  'server/view/SortSpec.js',
  'server/view/ViewSheetRenderer.js'
]);

function taoNen(headers) {
  const nen = dungHop({
    sheets: ['Customer', 'Activity', 'Config', 'Category', 'Log'],
    tep: TEP_VIEW
  });
  const view = nen.book.insertSheet('!Lead');
  view.getRange(1, 1, 1, headers.length).setValues([headers]);
  return { nen, view };
}

function gieoHaiKhach(nen) {
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH0001');
  ghiO(nen, 'Customer', 4, '@CUS_TEN_CTY', 'Mot');
  ghiO(nen, 'Customer', 5, '@CUS_MA_KH', 'KH0002');
  ghiO(nen, 'Customer', 5, '@CUS_TEN_CTY', 'Hai');
}

function gieoHaiGiaoDich(nen) {
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
}

function chay(so) {
  section('ViewSheetRenderer — giao dịch sống gần nhất, cột động, lọc, sắp và rowMap');
  let base;
  try {
    base = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@ACT_CONG_VIEC', '@ACT_GIA_TRI_HD']);
  } catch (err) { return ghiLoiNap(so, 'nạp ViewSheetRenderer', err); }
  gieoHaiKhach(base.nen);
  gieoHaiGiaoDich(base.nen);

  const result = base.nen.hop.renderViewSheet('!Lead');
  check(so, 'khách có giao dịch mới đã xóa mềm dùng lần sống trước đó', base.view.getRange(4, 4).getValue(), 'Email');
  check(so, 'khách chưa có giao dịch vẫn có thể hiện thành dòng', Object.values(result.rowMaps['!Lead']).sort(), ['KH0001', 'KH0002']);
  check(so, 'rowMap dựng theo hàng thật sau khi ghi', Object.keys(result.rowMaps['!Lead']).sort(), ['4', '5']);
  check(so, 'lượt vẽ có báo trạng thái và luôn nhả khóa', [base.nen.dem.toast, base.nen.stubs._khoa.dangGiu], [1, false]);

  base.view.getRange(3, 5).setValue('60..50');
  base.view.getRange(4, 5).setValue('giữ nguyên');
  checkThrows(so, 'cú pháp lọc sai dừng trước khi đụng sheet', () => base.nen.hop.renderViewSheet('!Lead'), 'Giá trị đầu lớn hơn');
  check(so, 'nội dung cũ còn nguyên khi cú pháp lọc sai', base.view.getRange(4, 5).getValue(), 'giữ nguyên');
  check(so, 'khóa được nhả cả khi parser ném lỗi', base.nen.stubs._khoa.dangGiu, false);

  const custom = taoNen(['@CUS_MA_KH', '@CUS_DOANH_THU']);
  gieoHaiKhach(custom.nen);
  const customCol = custom.nen.Customer.codes.length + 1;
  custom.nen.Customer.sheet.getRange(1, customCol).setValue('@CUS_DOANH_THU');
  custom.nen.Customer.sheet.getRange(4, customCol).setValue('20');
  custom.nen.Customer.sheet.getRange(5, customCol).setValue('3');
  ghiO(custom.nen, 'Config', 4, '@CFG_COT_MA', '@CUS_DOANH_THU');
  ghiO(custom.nen, 'Config', 4, '@CFG_COT_KIEU', 'NUMBER');
  ghiO(custom.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_DOANH_THU');
  ghiO(custom.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  custom.nen.hop.renderViewSheet('!Lead');
  check(so, 'cột người dùng ngoài DATA_SCHEMA được chép và sắp theo kiểu Sheet Schema',
    custom.view.getRange(4, 1, 2, 2).getValues(), [['KH0002', 3], ['KH0001', 20]]);
  check(so, 'cột kho không khai kiểu mặc định là TEXT',
    custom.nen.hop.viewFieldMaps({}, ['@CUS_COT_MOI'])['@CUS_COT_MOI'].type, 'TEXT');

  const sort = taoNen(['@CUS_MA_KH', '@CUS_TEN_CTY', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']);
  gieoHaiKhach(sort.nen);
  gieoHaiGiaoDich(sort.nen);
  ghiO(sort.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_TEN_CTY');
  ghiO(sort.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sort chung từ Config được dùng khi sheet không có cặp riêng', sort.view.getRange(4, 1).getValue(), 'KH0002');
  sort.view.getRange(4, 3, 1, 2).setValues([['@ACT_NGAY_LAM_VIEC', 'Tăng dần (A → Z)']]);
  sort.nen.hop.renderViewSheet('!Lead');
  check(so, 'sort riêng đè Config và dùng được cột kho không hiển thị', sort.view.getRange(4, 1).getValue(), 'KH0001');

  const missing = taoNen(['@CUS_MA_KH', '@CUS_KHONG_CO']);
  gieoHaiKhach(missing.nen);
  missing.view.getRange(4, 1, 1, 2).setValues([['cũ', 'không được xóa']]);
  checkThrows(so, 'mã CUS trên view không tồn tại trong kho làm lượt vẽ thất bại',
    () => missing.nen.hop.renderViewSheet('!Lead'), '@CUS_KHONG_CO');
  check(so, 'lỗi mã nguồn xảy ra trước clearContent và khóa vẫn được nhả',
    [missing.view.getRange(4, 1, 1, 2).getValues(), missing.nen.stubs._khoa.dangGiu], [[['cũ', 'không được xóa']], false]);

  const missingSort = taoNen(['@CUS_MA_KH']);
  gieoHaiKhach(missingSort.nen);
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_MA', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_COT_KIEU', 'TEXT');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_COL', '@CUS_KHONG_CO');
  ghiO(missingSort.nen, 'Config', 4, '@CFG_SORT_LEVEL', 'Tăng dần (A → Z)');
  missingSort.view.getRange(4, 1).setValue('cũ');
  checkThrows(so, 'Sheet Schema không làm mã sort vắng trong kho trở thành hợp lệ',
    () => missingSort.nen.hop.renderViewSheet('!Lead'), '@CUS_KHONG_CO');
  check(so, 'lỗi sort chung cũng xảy ra trước khi xóa dữ liệu', missingSort.view.getRange(4, 1).getValue(), 'cũ');

  const duplicate = taoNen(['@CUS_MA_KH', '@CUS_MA_KH']);
  duplicate.view.getRange(4, 1, 1, 2).setValues([['cũ 1', 'cũ 2']]);
  checkThrows(so, 'mã @ trùng ở hàng 1 bị chặn trước khi vẽ',
    () => duplicate.nen.hop.renderViewSheet('!Lead'), 'xuất hiện hai lần');
  check(so, 'lỗi mã trùng không xóa dữ liệu đang có', duplicate.view.getRange(4, 1, 1, 2).getValues(), [['cũ 1', 'cũ 2']]);
}

module.exports = { chay };
