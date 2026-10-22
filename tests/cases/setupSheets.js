/**
 * Ca kiểm cho `server/sheet/SetupSheets.js`: dựng bốn sheet trên tệp gần như trắng, chạy lại không phá gì, và đối chiếu hàng mã theo mã chứ không theo vị trí.
 *
 * Điều đáng kiểm nhất không phải "dựng đúng thì ra đúng" mà **chạy lại lần thứ hai có phá gì không** — một hàm chỉ hỏng ở lượt chạy thứ hai là hàm sẽ hỏng sau khi đã có người tin nó.
 *
 * Tệp Sheet giả giữ ghi chú và validation để canh đúng nguồn metadata; hình thức cuối cùng vẫn nghiệm thu trên Google.
 */

const { dungHop, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkContains, ghiLoiNap } = require('../lib/assert');

/** `SetupSheets.js` không nằm trong bộ tệp nền, vì chỉ tệp ca kiểm này cần nó. */
const TEP = TEP_NEN.concat(['server/sheet/SetupSheets.js']);

function chay(so) {
  section('Dựng khung bốn sheet trên tệp gần như trắng');

  let nen;
  try {
    nen = dungHop({ sheets: ['Sheet1', 'Config'], tep: TEP });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/SetupSheets.js', err);
  }
  nen.book.getSheetByName('Config').getRange(1, 1).setValue('@CFG_THAM_SO');
  nen.hop.setupSheets();
  check(so, 'dựng đủ bốn sheet, xóa sheet trắng thừa, không đụng sheet Config đời cũ còn dữ liệu chờ chuyển',
    nen.book.getSheets().map((s) => s.getName()).sort(), ['Activity', 'Category', 'Config', 'Customer', 'Log']);
  check(so, 'bốn sheet còn thiếu được tự dựng', nen.dem.insertSheet, 4);
  const dongDat = nen.hop.verifySheets().split('\n');
  checkContains(so, 'nghiệm thu báo đạt sau khi dựng khung', dongDat, '✅ ĐẠT');

  nen.dem.insertSheet = 0;
  const truoc = nen.book.getSheetByName('Customer').getRange(1, 1, 1, 5).getValues();
  nen.hop.setupSheets();
  check(so, 'chạy lại không dựng thêm sheet và không đổi hàng mã', [nen.dem.insertSheet, nen.book.getSheetByName('Customer').getRange(1, 1, 1, 5).getValues()], [0, truoc]);

  // FBM-056 gặp thật trên DEV: Customer xếp "Người liên hệ" trước "Điện thoại", chạy lại setupSheets ghi đè mã theo vị trí, dữ liệu điện thoại mang nhãn email mà không có lỗi nào nổ.
  section('Chạy lại setupSheets trên sheet xếp cột khác bảng khai — đối chiếu theo mã, không theo vị trí');

  const xep = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Log'], tep: TEP });
  const khai = xep.hop.sheetCoreColumns('Customer').map((cot) => cot[0]);
  const nhan = {};
  xep.hop.sheetCoreColumns('Customer').forEach((cot) => { nhan[cot[0]] = cot[1]; });
  const thieu = '@CUS_GHI_CHU';
  const tren = khai.filter((ma) => ma !== thieu && ma !== '@CUS_NGUOI_LIEN_HE');
  tren.splice(tren.indexOf('@CUS_SDT'), 0, '@CUS_NGUOI_LIEN_HE');
  tren.push('@CUS_FBM_ID');
  const sheetKh = xep.Customer.sheet;
  sheetKh.getRange(1, 1, 1, khai.length).setValues([khai.map(() => '')]);
  sheetKh.getRange(1, 1, 1, tren.length).setValues([tren]);
  sheetKh.getRange(4, tren.indexOf('@CUS_SDT') + 1).setValue('0912345678');
  sheetKh.getRange(4, tren.indexOf('@CUS_NGUOI_LIEN_HE') + 1).setValue('Anh Minh');
  xep.hop.setupSheets();

  const sauMa = xep.hop.readColumnMap('Customer').headerRow.filter((ma) => ma);
  check(so, 'mã cột đã có giữ nguyên chỗ, mã thiếu nối vào cuối, mã lạ của module khác để yên', sauMa, tren.concat([thieu]));
  check(so, 'nhãn hàng 2 đi theo mã của chính cột đó',
    sauMa.map((ma, i) => [ma, sheetKh.getRange(2, i + 1).getValue()]).filter((cap) => nhan[cap[0]] && cap[1] !== nhan[cap[0]]), []);
  const sauMap = xep.hop.readColumnMap('Customer').map;
  check(so, 'dữ liệu dưới mỗi mã không đổi nghĩa sau khi chạy lại',
    [sheetKh.getRange(4, sauMap['@CUS_SDT']).getValue(), sheetKh.getRange(4, sauMap['@CUS_NGUOI_LIEN_HE']).getValue()], ['0912345678', 'Anh Minh']);

  section('Chạy lại setupSheets đổi mã cột đã đổi tên ngay tại chỗ, giữ dữ liệu');

  const doi = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Log'], tep: TEP });
  const sheetDoi = doi.Customer.sheet;
  const maCu = doi.hop.readColumnMap('Customer').headerRow.map((ma) => ma === '@CUS_CHO_PHEP_DONG_BO_FBM' ? '@CUS_CHO_PHEP_FBM' : ma);
  sheetDoi.getRange(1, 1, 1, maCu.length).setValues([maCu]);
  const cotCu = maCu.indexOf('@CUS_CHO_PHEP_FBM') + 1;
  sheetDoi.getRange(4, cotCu).setValue('Cho phép');
  doi.hop.setupSheets();
  const sauDoi = doi.hop.readColumnMap('Customer');
  check(so, 'mã cũ @CUS_CHO_PHEP_FBM thành mã mới tại đúng cột cũ, không thêm cột trống ở cuối, dữ liệu giữ nguyên',
    [sauDoi.map['@CUS_CHO_PHEP_DONG_BO_FBM'], sauDoi.headerRow.indexOf('@CUS_CHO_PHEP_FBM'), sauDoi.headerRow.filter((ma) => ma).length, sheetDoi.getRange(4, cotCu).getValue()],
    [cotCu, -1, maCu.filter((ma) => ma).length, 'Cho phép']);
  const hai = maCu.concat(['@CUS_CHO_PHEP_DONG_BO_FBM']);
  sheetDoi.getRange(1, 1, 1, hai.length).setValues([hai]);
  let loiHai = '';
  try { doi.hop.setupSheets(); } catch (e) { loiHai = String(e.message); }
  check(so, 'sheet có cả mã cũ lẫn mã mới thì dừng và báo, không tự chọn cột nào', loiHai.indexOf('có cả mã cũ @CUS_CHO_PHEP_FBM') >= 0, true);

  return so;
}

module.exports = { chay };
