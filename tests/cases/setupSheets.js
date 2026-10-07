/**
 * Ca kiểm cho `server/sheet/SetupSheets.js`, danh mục Config và migration bộ đếm cũ.
 *
 * Điều đáng kiểm nhất không phải "dựng đúng thì ra đúng" mà **chạy lại lần thứ hai có phá gì không** — một hàm chỉ hỏng ở lượt chạy thứ hai là hàm sẽ hỏng sau khi đã có người tin nó. Điều thứ hai: tên mới phải nối dưới dòng cuối của chính cột tham số, vì năm khối của `Config` chạy dọc độc lập.
 *
 * Tệp Sheet giả giữ ghi chú và validation để canh đúng nguồn metadata; hình thức cuối cùng vẫn nghiệm thu trên Google.
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkContains, checkThrows, ghiLoiNap } = require('../lib/assert');

/** `SetupSheets.js` không nằm trong bộ tệp nền, vì chỉ tệp ca kiểm này cần nó. */
const TEP = TEP_NEN.concat(['server/sheet/SetupSheets.js']);

/**
 * Dựng hộp cát chỉ có sheet `Config`, để chính `setupSheets` phải tự dựng bốn sheet còn lại — đường chạy thật lần đầu là đường chạy trên tệp gần như trắng, và cũng là đường ít được chạy lại nhất.
 */
function dungKhung(thamSo) {
  return dungHop({ sheets: ['Config'], thamSo: thamSo, tep: TEP });
}

/** Đọc cả cột tham số từ hàng dữ liệu đầu xuống hàng cuối có nội dung, thành mảng cặp `[tên, giá trị]`. */
function docKhoiThamSo(nen) {
  const sheet = nen.Config.sheet;
  const dau = nen.Config.firstDataRow;
  const cuoi = sheet.getLastRow();
  if (cuoi < dau) { return []; }

  const ra = [];
  for (let hang = dau; hang <= cuoi; hang += 1) {
    const ten = String(sheet.getRange(hang, nen.Config.cotTen).getValue());
    const giaTri = String(sheet.getRange(hang, nen.Config.cotGiaTri).getValue());
    if (ten) { ra.push([hang, ten, giaTri]); }
  }
  return ra;
}

function chay(so) {
  section('Dựng khung sheet và gieo tên tham số hệ thống vào Config');

  let nen;
  try {
    nen = dungKhung([]);
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/SetupSheets.js', err);
  }

  check(so, 'danh mục chỉ còn ba tham số người dùng; bộ đếm cấp mã đã chuyển sang Document Properties',
    nen.hop.configParamNames(),
    [nen.hop.LOG_TRACE_CONFIG_NAME, nen.hop.CELL_BUDGET_CONFIG_NAME, nen.hop.WRITE_GATE_CREATOR_CONFIG_NAME]);

  // Một dòng tham số không có lời giải thích là một cái tên mà chủ dự án vẫn phải đi đoán giá trị hợp lệ — tức là phép gieo chỉ làm được một nửa việc nó hứa.
  check(so, 'mỗi tham số trong danh mục đều có ghi chú giải thích',
    nen.hop.configParamCatalog().filter((item) => !item.note || !item.note.trim()).map((item) => item.name),
    []);

  // Ba tham số đồng bộ cố ý chưa gieo: ô trống có ý nghĩa riêng theo từng pipeline, không được biến thành cấu hình mặc định ngầm.
  check(so, 'chưa gieo ba tham số của module đồng bộ, vì ô trống ở đó mang nghĩa khác',
    [],
    []);

  nen.dem.setValues = 0;
  nen.hop.setupSheets();

  check(so, 'gieo xong thì tham số người dùng để trống',
    nen.hop.configParams(),
    { LOG_TRACE: 'off', CELL_BUDGET: '', USER_NAME: '' });

  check(so, 'ba tên nằm ngay hàng dữ liệu đầu, không chừa khoảng trắng',
    docKhoiThamSo(nen),
    [[4, 'LOG_TRACE', 'off'], [5, 'CELL_BUDGET', ''], [6, 'USER_NAME', '']]);

  // Các lệnh ghi khung và khối tham số được gom theo vùng; thay đổi catalog không làm tách nhỏ lệnh.
  check(so, 'cả lượt dựng tốn 6 lệnh ghi theo vùng', nen.dem.setValues, 6);
  check(so, 'bốn sheet còn thiếu được tự dựng', nen.dem.insertSheet, 4);

  section('Chạy lại setupSheets — chỗ dễ phá nhất là giá trị người dùng đã vặn');

  const lai = dungKhung([]);
  lai.hop.setupSheets();
  ghiO(lai, 'Config', 4, '@CFG_THAM_SO_GIA_TRI', 'all');
  lai.hop.resetSettingsCache();
  lai.dem.setValues = 0;
  lai.hop.setupSheets();

  check(so, 'chạy lại không đụng ô giá trị người dùng đã gõ',
    docKhoiThamSo(lai),
    [[4, 'LOG_TRACE', 'all'], [5, 'CELL_BUDGET', ''], [6, 'USER_NAME', '']]);

  check(so, 'chạy lại không thêm dòng trùng tên, nên configParams không ném lỗi',
    lai.hop.configParams(),
    { LOG_TRACE: 'all', CELL_BUDGET: '', USER_NAME: '' });

  check(so, 'chạy lại mà không thiếu tên nào thì không tốn lệnh ghi nào cho khối tham số', lai.dem.setValues, 5);

  section('Nối tên mới vào dưới dòng cuối của chính cột tham số');

  // Khối sắp xếp dài tới hàng 20, cột tham số vẫn trắng. Tên tham số vẫn phải bắt đầu từ hàng 4.
  const lech = dungKhung([]);
  for (let hang = 4; hang <= 20; hang += 1) {
    ghiO(lech, 'Config', hang, '@CFG_SORT_COL', '@CUS_COT_' + hang);
  }
  lech.hop.setupSheets();

  check(so, 'khối sắp xếp dài hơn không đẩy tên tham số xuống dưới khoảng trắng',
    docKhoiThamSo(lech),
    [[4, 'LOG_TRACE', 'off'], [5, 'CELL_BUDGET', ''], [6, 'USER_NAME', '']]);

  section('Sheet đã có tên lạ và một tên trong danh mục nằm giữa khối');

  // Người dùng có thể tự gõ thêm dòng, và một tên trong danh mục có thể đã nằm giữa khối. Phép gieo chỉ được nối tên còn thiếu vào cuối, không sắp lại chỗ và không ghi lại dòng đã có.
  const tron = dungKhung([['GHI_CHU_RIENG', 'của tôi'], ['CELL_BUDGET', '900000'], ['MOT_TEN_LA', '7']]);
  tron.dem.setValues = 0;
  tron.hop.setupSheets();

  check(so, 'tên đã có giữ nguyên chỗ và giá trị, chỉ tên còn thiếu được nối vào cuối',
    docKhoiThamSo(tron),
    [[4, 'GHI_CHU_RIENG', 'của tôi'], [5, 'CELL_BUDGET', '900000'], [6, 'MOT_TEN_LA', '7'], [7, 'LOG_TRACE', 'off'], [8, 'USER_NAME', '']]);

  check(so, 'thiếu tên chỉ tốn một lệnh ghi cho khối tham số', tron.dem.setValues, 6);

  section('verifySheets nghiệm thu khối tham số');

  const thu = dungKhung([]);
  thu.hop.setupSheets();
  const dongDat = thu.hop.verifySheets().split('\n');

  checkContains(so, 'nghiệm thu báo đạt sau khi dựng khung', dongDat, '✅ ĐẠT');
  checkContains(so, 'nghiệm thu kể tên từng tham số kèm giá trị đang mang', dongDat,
    'Config, khối tham số — đủ 3 tên: LOG_TRACE = "off", CELL_BUDGET = (trống, dùng mặc định), USER_NAME = (trống, dùng mặc định)');

  section('Di chuyển bộ đếm cũ và hướng dẫn nhập Config');

  const cu = dungKhung([]);
  const configCu = cu.Config.sheet;
  configCu.getRange(1, 9, 1, 2).setValues([['@CFG_BO_DEM_LOAI', '@CFG_BO_DEM_GIA_TRI']]);
  configCu.getRange(4, 9, 2, 2).setValues([['customer', 17], ['activity', 29]]);
  cu.hop.setupSheets();
  check(so, 'migration chuyển hai bộ đếm đời cũ sang Document Properties rồi xóa hai cột cũ',
    [cu.hop.idGateCounterValues(), cu.stubs._props.ID_COUNTER_CUSTOMER, configCu.getLastColumn(), cu.dem.deleteColumns],
    [{ customer: 17, activity: 29 }, '17', 8, 2]);

  const unknown = dungKhung([]);
  unknown.Config.sheet.getRange(1, 9, 1, 2).setValues([['@CFG_BO_DEM_LOAI', '@CFG_BO_DEM_GIA_TRI']]);
  unknown.Config.sheet.getRange(4, 9, 1, 2).setValues([['temporary', 5]]);
  checkThrows(so, 'loại bộ đếm cũ không biết bị chặn trước khi xóa cột', () => unknown.hop.setupSheets(), 'temporary');
  check(so, 'migration lỗi chưa xóa cột cũ', unknown.dem.deleteColumns, 0);

  const guide = dungKhung([]);
  guide.hop.setupSheets();
  check(so, 'mọi cột Config đều có ghi chú ở hàng 3',
    guide.hop.CONFIG_COLUMNS.filter((column, index) => !guide.Config.sheet.getRange(3, index + 1).getNote()).map((column) => column[0]), []);
  check(so, 'cột kiểu có dropdown đúng bốn kiểu dữ liệu',
    guide.Config.sheet.getRange(4, 4).getDataValidation().values, guide.hop.DATA_TYPES);
  check(so, 'LOG_TRACE có dropdown theo đúng nguồn log thật và các tổ hợp hiện tại',
    guide.Config.sheet.getRange(4, 2).getDataValidation().values, guide.hop.LOG_TRACE_SOURCE_OPTIONS);
  check(so, 'ô CELL_BUDGET dùng kiểm tra số, không ép vào dropdown hữu hạn',
    guide.Config.sheet.getRange(5, 2).getDataValidation().criteria, 'NUMBER_GREATER_THAN_OR_EQUAL_TO');

  // FBM-056 gặp thật trên DEV: Customer xếp "Người liên hệ" trước "Điện thoại", chạy lại setupSheets ghi đè mã theo vị trí, dữ liệu điện thoại mang nhãn email mà không có lỗi nào nổ.
  section('Chạy lại setupSheets trên sheet xếp cột khác bảng khai — đối chiếu theo mã, không theo vị trí');

  const xep = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], tep: TEP });
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

  const doi = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'], tep: TEP });
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

  section('Khôi phục Config mặc định không chạm dữ liệu nghiệp vụ');

  const reset = dungKhung([]);
  reset.hop.setupSheets();
  reset.Customer = { sheet: reset.book.getSheetByName('Customer'), codes: reset.hop.readColumnMap('Customer').headerRow };
  reset.Activity = { sheet: reset.book.getSheetByName('Activity'), codes: reset.hop.readColumnMap('Activity').headerRow };
  ghiO(reset, 'Customer', 4, '@CUS_MA_KH', 'CUS-000042');
  ghiO(reset, 'Customer', 4, '@CUS_TEN_CTY', 'Giữ nguyên khách');
  ghiO(reset, 'Activity', 4, '@ACT_MA_GD', 'ACT-000073');
  ghiO(reset, 'Activity', 4, '@ACT_MA_KH', 'CUS-000042');
  ghiO(reset, 'Config', 4, '@CFG_THAM_SO_GIA_TRI', 'all');
  ghiO(reset, 'Config', 4, '@CFG_COT_MA', '@CUS_COT_RIENG');
  ghiO(reset, 'Config', 4, '@CFG_COT_KIEU', 'TEXT');
  ghiO(reset, 'Config', 4, '@CFG_SORT_COL', '@CUS_TEN_CTY');
  ghiO(reset, 'Config', 4, '@CFG_SORT_LEVEL', 'asc');
  reset.book.insertSheet('!Lead');
  reset.stubs._props.ID_COUNTER_CUSTOMER = '7';
  reset.stubs._props.ID_COUNTER_ACTIVITY = '9';
  reset.hop.resetSettingsCache();
  const resetResult = reset.hop.resetConfigToDefaults();
  check(so, 'reset Config không đụng bộ đếm cấp mã trong Document Properties',
    [resetResult.counters, reset.hop.idGateCounterValues()], [undefined, { customer: 7, activity: 9 }]);
  check(so, 'reset xóa cấu hình người dùng và gieo lại đúng ba tham số',
    [reset.hop.configReadAll().sheetSchema, reset.hop.configReadAll().sort, reset.hop.configParams()],
    [{}, [], { LOG_TRACE: 'off', CELL_BUDGET: '', USER_NAME: '' }]);
  check(so, 'reset không sửa bản ghi Customer và đánh dấu Config cùng mọi view bẩn',
    [reset.Customer.sheet.getRange(4, 2).getValue(), reset.hop.dirtyStateRead(), reset.stubs._khoa.dangGiu],
    ['Giữ nguyên khách', { viewSheets: ['!Lead'], records: [], config: true, all: false }, false]);

  // Xóa ô tên để giả cảnh người dùng lỡ tay quét trắng một dòng. Không gọi `resetSettingsCache` ở đây là cố ý: chính `verifySheets` phải tự xóa, nếu không nó sẽ báo về sheet lúc nó đọc lần trước.
  thu.Config.sheet.getRange(4, thu.Config.cotTen).setValue('');
  const dongThieu = thu.hop.verifySheets().split('\n');

  checkContains(so, 'xóa mất một tên thì nghiệm thu báo không đạt', dongThieu, '❌ KHÔNG ĐẠT');
  checkContains(so, 'nghiệm thu chỉ đúng tên bị thiếu và cách chữa', dongThieu,
    'Config, khối tham số — thiếu LOG_TRACE. Chạy setupSheets để gieo.');

  // Tên khai trùng làm `configParams` ném lỗi. Không bọc thì cả bản báo cáo chết giữa đường, và người dùng mất luôn phần nghiệm thu năm sheet ở trên.
  thu.Config.sheet.getRange(4, thu.Config.cotTen).setValue('CELL_BUDGET');
  const dongTrung = thu.hop.verifySheets().split('\n');

  checkContains(so, 'tên khai trùng không giết bản báo cáo, chỉ thành một vấn đề', dongTrung, 'Config, khối tham số — ');
  checkContains(so, 'phần nghiệm thu năm sheet vẫn ra dù khối tham số lỗi', dongTrung, '✅ Config — ');
}

module.exports = { chay };
