/**
 * Ca kiểm của `server/data/ColumnFormat.js` và chỗ chống mất số 0 đầu ở cửa ghi.
 *
 * Đây là chỗ hỏng-trong-im-lặng đắt nhất của dự án: ghi `'0101243150'` vào ô chưa ở khuôn văn bản thuần thì Sheets cắt số 0 đầu thành `101243150`, cửa ghi vẫn trả về `ok: true`, và không có đường nào lấy số đó lại. Nên phép kiểm dưới đây **đổi khuôn cột sang Number trước rồi mới lưu** — đúng việc người dùng làm được bằng hai cú bấm trên sheet.
 *
 * Kiểm được ngay ở đây vì tệp Sheet giả đã mô phỏng hệ quả của khuôn ô cho chuỗi toàn chữ số. Chủ dự án chốt ngày 06/09/2026: mã số thuế và số điện thoại mất số 0 đầu là chuyện không được xảy ra ở cả ba sheet Customer, Activity, Category.
 */

const { dungHop, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

/** `SetupSheets.js` nằm ngoài bộ tệp nền, nhưng ở đây cần nó để kiểm cả `setupColumnFormats` và nhánh khuôn của `verifySheets`. */
const TEP = TEP_NEN.concat(['server/sheet/SetupSheets.js']);

/** Hộp cát có đủ năm sheet, vì `verifySheets` đọc cả năm. */
function dungDay() {
  return dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], tep: TEP });
}

/** Số cột của một sheet giả, tra theo mã ở hàng 1. */
function cot(nen, tenSheet, ma) {
  return nen[tenSheet].codes.indexOf(ma) + 1;
}

/** Một bản ghi khách đủ bốn trường bắt buộc, kèm mã số thuế và số điện thoại có số 0 đầu. */
function khachMoi() {
  return {
    companyName: 'Thép Đồng Tâm', taxNumber: '0101243150', phone: '0912345678',
    leadSource: 'Facebook', verifyStatus: 'Đã xác thực', allowFbmPush: 'Cho phép'
  };
}

function chay(so) {
  section('columnFormat — bảng khuôn cột, ba sheet được che');

  let nen;
  try {
    nen = dungDay();
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/data/ColumnFormat.js cùng SetupSheets.js', err);
  }

  const hop = nen.hop;

  check(so, 'ba sheet có đặt khuôn, và Config với Log cố ý không có mặt',
    hop.columnFormatSheets(), ['Customer', 'Activity', 'Category']);

  check(so, 'Config trả về null chứ không phải bảng rỗng — ô Giá trị là ô người dùng tự vặn núm',
    [hop.columnFormatMap('Config'), hop.columnFormatMap('Log')], [null, null]);

  const cusMap = hop.columnFormatMap('Customer');
  check(so, 'cột chữ và cột chọn đều ở khuôn văn bản thuần, đó là chỗ giữ số 0 đầu',
    [cusMap['@CUS_MST'], cusMap['@CUS_SDT'], cusMap['@CUS_TINH_THANH']], ['@', '@', '@']);

  check(so, 'cột ngày lấy khuôn theo precision, ngày trơn và ngày kèm giờ khác nhau',
    [cusMap['@CUS_NGAY_DONG_THAU'], hop.columnFormatMap('Activity')['@ACT_HAN_XU_LY']],
    ['dd/mm/yyyy', 'dd/mm/yyyy HH:mm']);

  check(so, 'cột số không ở khuôn văn bản — cột số mà thành chữ thì mọi công thức SUM của người dùng trả về 0',
    hop.columnFormatMap('Activity')['@ACT_GIA_TRI_HD'], '#,##0.###');

  // Category là sheet chủ dự án gõ tay nhiều nhất, và giá trị danh mục trông như số (`01`, mã FBM) thì mất số 0 đầu là giá trị đã lưu trong bản ghi khách không còn khớp dòng nào trong danh sách chọn.
  const catMap = hop.columnFormatMap('Category');
  check(so, 'cả mười ba cột của Category đều ở khuôn văn bản thuần, kể cả cột đi kèm FBM',
    [Object.keys(catMap).length, Object.keys(catMap).filter((ma) => catMap[ma] !== '@')],
    [hop.CATEGORY_COLUMNS.length, []]);

  checkThrows(so, 'trường DATE thiếu precision thì ném lỗi chứ không đoán khuôn — đoán sai là một cột hiện sai suốt đời',
    () => hop.columnFormatOf('customer', 'thu', { type: 'DATE' }), 'precision');

  checkThrows(so, 'kiểu lạ thì ném lỗi ở bảng khuôn',
    () => hop.columnFormatOf('customer', 'thu', { type: 'MAU_SAC' }), 'MAU_SAC');

  check(so, 'columnFormatIsText nuốt kiểu lạ chứ không ném — cửa ghi nhận cả bảng khai của module ngoài',
    [hop.columnFormatIsText({ type: 'TEXT' }), hop.columnFormatIsText({ type: 'NUMBER' }), hop.columnFormatIsText({ type: 'MAU_SAC' }), hop.columnFormatIsText(null)],
    [true, false, false, false]);

  section('columnFormat — người dùng đổi khuôn cột sang Number rồi bấm Lưu');

  const doiSangSo = dungDay();
  const cotMst = cot(doiSangSo, 'Customer', '@CUS_MST');
  const cotSdt = cot(doiSangSo, 'Customer', '@CUS_SDT');
  doiSangSo.Customer.sheet.getRange(4, cotMst, 50, 1).setNumberFormat('#,##0');
  doiSangSo.Customer.sheet.getRange(4, cotSdt, 50, 1).setNumberFormat('#,##0');

  const themMoi = doiSangSo.hop.writeGateSave({ entity: 'customer', records: [khachMoi()] });

  check(so, 'thêm khách mới vào cột đã bị đổi khuôn: số 0 đầu của mã số thuế và số điện thoại vẫn còn',
    [themMoi.ok,
      doiSangSo.Customer.sheet.getRange(4, cotMst).getValue(),
      doiSangSo.Customer.sheet.getRange(4, cotSdt).getValue()],
    [true, '0101243150', '0912345678']);

  check(so, 'khuôn ô vừa ghi đã trở lại văn bản thuần, nên lượt Lưu sau cũng an toàn',
    doiSangSo.Customer.sheet.getRange(4, cotMst).getNumberFormat(), '@');

  // Đường sửa bản ghi đã có là đường khác trong cùng cửa ghi, và nó cũng phải tự đặt lại khuôn.
  doiSangSo.Customer.sheet.getRange(4, cotMst, 1, 1).setNumberFormat('#,##0');
  const sua = doiSangSo.hop.writeGateSave({
    entity: 'customer',
    records: [{ id: String(doiSangSo.Customer.sheet.getRange(4, cot(doiSangSo, 'Customer', '@CUS_MA_KH')).getValue()), taxNumber: '0311127395' }]
  });

  check(so, 'sửa một trường trên bản ghi đã có cũng đặt lại khuôn trước khi ghi',
    [sua.ok, doiSangSo.Customer.sheet.getRange(4, cotMst).getValue()], [true, '0311127395']);

  // Cột số và cột ngày **không** bị đặt lại: ghi số vào ô khuôn nào cũng không mất chữ số nào, nên đặt lại chỉ để xóa mất khuôn người dùng tự chọn.
  const giuKhuonSo = dungDay();
  const cotGiaTri = cot(giuKhuonSo, 'Activity', '@ACT_GIA_TRI_HD');
  giuKhuonSo.Activity.sheet.getRange(4, cotGiaTri, 50, 1).setNumberFormat('#,##0.00 [$₫]');

  const themGd = giuKhuonSo.hop.writeGateSave({
    entity: 'activity',
    records: [{
      customerId: 'CUS-000001', workDate: '2026-09-06', taskType: 'Gọi điện', content: 'Chào hàng',
      product: 'Thép hộp', contractValue: '1.500.000', allowFbmPush: 'Cho phép'
    }]
  });

  check(so, 'khuôn tiền tệ người dùng tự chọn cho cột số vẫn còn sau lượt Lưu',
    [themGd.ok,
      giuKhuonSo.Activity.sheet.getRange(4, cotGiaTri).getValue(),
      giuKhuonSo.Activity.sheet.getRange(4, cotGiaTri).getNumberFormat()],
    [true, 1500000, '#,##0.00 [$₫]']);

  section('columnFormat — setupSheets đặt khuôn, verifySheets bắt được cột hở');

  const dungKhung = dungHop({ sheets: ['Config'], tep: TEP });
  dungKhung.hop.setupSheets();

  const khuonSauDung = ['Customer', 'Activity', 'Category'].map((ten) => {
    const sheet = dungKhung.sheet(ten);
    const ma = dungKhung.hop.sheetCoreColumns(ten).map((c) => c[0]);
    const can = dungKhung.hop.columnFormatMap(ten);
    return ma.filter((code, i) => sheet.getRange(4, i + 1).getNumberFormat() !== can[code]);
  });

  check(so, 'chạy setupSheets xong thì cả ba sheet không còn cột nào hở khuôn', khuonSauDung, [[], [], []]);

  check(so, 'verifySheets nói ĐẠT trên khung vừa dựng',
    dungKhung.hop.verifySheets().indexOf('✅ ĐẠT') !== -1, true);

  // Một người đổi khuôn cột danh mục là chuyện xảy ra rồi mới biết, nên `verifySheets` phải là chỗ hỏi ra được.
  dungKhung.sheet('Category').getRange(4, 1, 50, 1).setNumberFormat('#,##0');
  const bcHong = dungKhung.hop.verifySheets();

  check(so, 'đổi khuôn một cột của Category thì verifySheets báo KHÔNG ĐẠT và chỉ đúng mã cột',
    [bcHong.indexOf('❌ KHÔNG ĐẠT') !== -1, bcHong.indexOf(dungKhung.hop.CATEGORY_COLUMNS[0][0]) !== -1],
    [true, true]);
}

module.exports = { chay };
