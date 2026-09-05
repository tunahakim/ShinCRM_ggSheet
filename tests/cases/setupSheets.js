/**
 * Ca kiểm cho `server/sheet/SetupSheets.js` và `server/config/ConfigParams.js`.
 *
 * Điều đáng kiểm nhất không phải "dựng đúng thì ra đúng" mà **chạy lại lần thứ hai có phá gì không** — một hàm chỉ hỏng ở lượt chạy thứ hai là hàm sẽ hỏng sau khi đã có người tin nó. Điều thứ hai: tên mới phải nối dưới dòng cuối của chính cột tham số, vì năm khối của `Config` chạy dọc độc lập.
 *
 * Giới hạn: tệp Sheet giả nuốt `setNote`, nên ở đây không chứng minh được ghi chú ô hiện ra thật. Chỗ thấy nó là chạy `node tests/gas.js setupSheets` rồi trỏ chuột vào ô tên.
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, checkContains, ghiLoiNap } = require('../lib/assert');

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

  // Ghim nội dung và thứ tự danh mục bằng chính hai hằng tên, không bằng chuỗi gõ lại: đổi tên hằng mà quên đổi ở đây thì đỏ, còn gõ lại chuỗi thì hai chỗ lệch nhau mà vẫn xanh.
  check(so, 'danh mục có đúng hai tham số mà code đang thật sự đọc',
    nen.hop.configParamNames(),
    [nen.hop.LOG_TRACE_CONFIG_NAME, nen.hop.CELL_BUDGET_CONFIG_NAME]);

  // Một dòng tham số không có lời giải thích là một cái tên mà chủ dự án vẫn phải đi đoán giá trị hợp lệ — tức là phép gieo chỉ làm được một nửa việc nó hứa.
  check(so, 'mỗi tham số trong danh mục đều có ghi chú giải thích',
    nen.hop.configParamCatalog().filter((item) => !item.note || !item.note.trim()).map((item) => item.name),
    []);

  // Bốn tham số đồng bộ cố ý chưa gieo: với hai tham số đang có, ô trống nghĩa là dùng mặc định; với bốn tham số kia, ô trống nghĩa là kỳ đồng bộ dừng. Gieo chung là dựng sẵn một chỗ hiểu sai.
  check(so, 'chưa gieo bốn tham số của module đồng bộ, vì ô trống ở đó mang nghĩa khác',
    ['FBM_ACCOUNT_NAME', 'FBM_MA_KH_PREFIX', 'FBM_MA_KH_LENGTH', 'FBM_ACTIVITY_SINCE'].filter((ten) => nen.hop.configParamNames().indexOf(ten) !== -1),
    []);

  nen.dem.setValues = 0;
  nen.hop.setupSheets();

  check(so, 'gieo xong thì khối tham số có đủ tên, giá trị đều để trống',
    nen.hop.configParams(),
    { LOG_TRACE: '', CELL_BUDGET: '' });

  check(so, 'hai tên nằm ngay hàng dữ liệu đầu, không chừa khoảng trắng',
    docKhoiThamSo(nen),
    [[4, 'LOG_TRACE', ''], [5, 'CELL_BUDGET', '']]);

  // Năm lệnh ghi cho năm hàng tiêu đề, cộng đúng một lệnh cho cả khối tham số. Luật gộp lệnh ghi của tài liệu 06: hai tên thiếu vẫn là một lệnh, không phải hai.
  check(so, 'cả lượt dựng tốn 6 lệnh ghi: 5 hàng tiêu đề và 1 cho cả khối tham số', nen.dem.setValues, 6);
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
    [[4, 'LOG_TRACE', 'all'], [5, 'CELL_BUDGET', '']]);

  check(so, 'chạy lại không thêm dòng trùng tên, nên configParams không ném lỗi',
    lai.hop.configParams(),
    { LOG_TRACE: 'all', CELL_BUDGET: '' });

  check(so, 'chạy lại mà không thiếu tên nào thì không tốn lệnh ghi nào cho khối tham số', lai.dem.setValues, 5);

  section('Nối tên mới vào dưới dòng cuối của chính cột tham số');

  // Khối bộ đếm dài tay tới hàng 20, cột tham số vẫn trắng. Lấy `getLastRow()` của cả sheet thì hai tên rơi xuống hàng 21 và 22, chừa lại 16 hàng trắng giữa bảng.
  const lech = dungKhung([]);
  for (let hang = 4; hang <= 20; hang += 1) {
    ghiO(lech, 'Config', hang, '@CFG_BO_DEM_LOAI', 'loai_' + hang);
  }
  lech.hop.setupSheets();

  check(so, 'khối bộ đếm dài hơn không đẩy tên tham số xuống dưới khoảng trắng',
    docKhoiThamSo(lech),
    [[4, 'LOG_TRACE', ''], [5, 'CELL_BUDGET', '']]);

  section('Sheet đã có tên lạ và một tên trong danh mục nằm giữa khối');

  // Người dùng có thể tự gõ thêm dòng, và một tên trong danh mục có thể đã nằm giữa khối. Phép gieo chỉ được nối tên còn thiếu vào cuối, không sắp lại chỗ và không ghi lại dòng đã có.
  const tron = dungKhung([['GHI_CHU_RIENG', 'của tôi'], ['CELL_BUDGET', '900000'], ['MOT_TEN_LA', '7']]);
  tron.dem.setValues = 0;
  tron.hop.setupSheets();

  check(so, 'tên đã có giữ nguyên chỗ và giá trị, chỉ tên còn thiếu được nối vào cuối',
    docKhoiThamSo(tron),
    [[4, 'GHI_CHU_RIENG', 'của tôi'], [5, 'CELL_BUDGET', '900000'], [6, 'MOT_TEN_LA', '7'], [7, 'LOG_TRACE', '']]);

  check(so, 'thiếu một tên cũng chỉ tốn một lệnh ghi cho khối tham số', tron.dem.setValues, 6);

  section('verifySheets nghiệm thu khối tham số');

  const thu = dungKhung([]);
  thu.hop.setupSheets();
  const dongDat = thu.hop.verifySheets().split('\n');

  checkContains(so, 'nghiệm thu báo đạt sau khi dựng khung', dongDat, '✅ ĐẠT');
  checkContains(so, 'nghiệm thu kể tên từng tham số kèm giá trị đang mang', dongDat,
    'Config, khối tham số — đủ 2 tên: LOG_TRACE = (trống, dùng mặc định), CELL_BUDGET = (trống, dùng mặc định)');

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
