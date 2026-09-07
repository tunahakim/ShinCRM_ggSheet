/**
 * Dựng sẵn hộp cát có tệp Sheet giả, để tệp ca kiểm chỉ còn việc kiểm.
 *
 * Vì sao tách ra khỏi từng tệp ca kiểm: danh sách tệp máy chủ cần nạp là thứ đổi mỗi lần cây thư mục đổi. Để nó nằm rải ở từng tệp ca kiểm thì một lần dọn thư mục là một lần sửa năm chỗ, và chỗ bị quên sẽ báo đỏ vì lý do không liên quan gì tới điều nó đang kiểm.
 *
 * Tệp này **không** chứa phép kiểm nào. Nó chỉ dựng hoàn cảnh.
 */

const { napServer, taoHopCat } = require('./load-gas');
const { taoStubsGas } = require('./gas-stubs');

/**
 * Bộ tệp máy chủ mà mọi ca kiểm chạm sheet đều cần, xếp theo chiều phụ thuộc.
 *
 * Thứ tự ở đây **không** quyết định việc hàm nào gọi được hàm nào — Apps Script dùng chung một vùng tên nên hàm nào cũng thấy hàm nào, bất kể tệp nạp trước hay sau. Xếp theo chiều phụ thuộc là để người đọc thấy được tầng: mở tệp → khai hình → đọc/ghi ô → tham số → log → tiện ích → đọc bản ghi → trạng thái → cửa ghi và cửa xóa → gom lượt nạp → vỏ bọc lỗi.
 *
 * Ba tệp cố ý **không** có trong danh sách này, và lý do thuộc về từng tệp chứ không phải một luật chung:
 *   - `server/sheet/SetupSheets.js` — dựng khung sheet, chỉ ca kiểm nói về việc dựng sheet mới cần, và nó tự nạp thêm.
 *   - `server/entry/Menu.js` — mọi việc của nó đều đi qua `SpreadsheetApp.getUi()` và `HtmlService`, hai thứ hộp cát không có. Nạp vào thì chỉ có thêm mấy cái tên, không thêm điều gì chứng minh được; phép nghiệm thu của nó là `probeSidebarTemplate` trên Google.
 *   - cả thư mục `server/dev/` — cửa chạy hàm lúc phát triển, không thuộc đường chạy thật.
 */
const TEP_NEN = [
  'server/sheet/Book.js',
  'server/data/DataSchema.js',
  'server/data/SheetLayout.js',
  'server/data/ColumnFormat.js',
  'server/sheet/SheetIo.js',
  'server/sheet/SheetGrid.js',
  'server/config/Settings.js',
  'server/log/LogGate.js',
  'server/util/DateText.js',
  'server/util/TextNormalize.js',
  'server/sheet/CellBudget.js',
  'server/config/ConfigParams.js',
  'server/sheet/EntityRead.js',
  'server/sheet/CategoryRead.js',
  'server/sheet/ConfigRead.js',
  'server/state/DirtyState.js',
  'server/state/UserPrefs.js',
  'server/gate/FieldLogic.js',
  'server/gate/IdGate.js',
  'server/gate/WriteGate.js',
  'server/gate/DeleteGate.js',
  'server/service/LoadService.js',
  'server/entry/ErrorReport.js',
  'server/entry/EntryPoint.js'
];

/**
 * Đặt khuôn hiển thị cho vùng dữ liệu, đúng như `setupColumnFormats` làm trên sheet thật.
 *
 * Cần có vì tệp giả đã mô phỏng **hệ quả** của khuôn ô. Hộp cát không đặt khuôn thì nó là một sheet chưa ai dựng khung, nên mọi phép kiểm gieo mã số thuế `0101243150` vào đó đều mất số 0 đầu — mất đúng vì lý do Google mất, tức là hoàn cảnh dựng sai chứ không phải code sai.
 */
function datKhuonCot(hop, sheet, tenSheet, codes) {
  if (!hop.SHEET_LAYOUT[tenSheet]) { return; }

  const khuon = hop.columnFormatMap(tenSheet);
  if (!khuon) { return; }

  const firstDataRow = hop.SHEET_LAYOUT[tenSheet].firstDataRow;
  const soDong = sheet.getMaxRows() - firstDataRow + 1;
  if (soDong <= 0) { return; }

  codes.forEach((code, i) => {
    if (!khuon[code]) { return; }
    sheet.getRange(firstDataRow, i + 1, soDong, 1).setNumberFormat(khuon[code]);
  });
}

/**
 * Ghi hàng 1 cho một sheet giả, rồi đặt khuôn hiển thị cho vùng dữ liệu.
 *
 * `themCot` chèn một mã lạ vào giữa hàng 1. Có tham số này để phép kiểm chứng minh được code tra cột theo mã chứ không theo thứ tự — người dùng chèn cột là quyền của họ, và luật hàng 1 nói vị trí cột suy ra từ mã.
 */
function ghiHangMa(hop, sheet, tenSheet, themCot) {
  if (tenSheet === 'Log') {
    sheet.getRange(1, 1, 1, hop.LOG_HEADERS.length).setValues([hop.LOG_HEADERS]);
    return hop.LOG_HEADERS.slice();
  }

  let codes = hop.sheetCoreColumns(tenSheet).map((cot) => cot[0]);
  if (themCot) { codes = [codes[0], '@COT_RIENG_CUA_TOI'].concat(codes.slice(1)); }
  sheet.getRange(1, 1, 1, codes.length).setValues([codes]);
  datKhuonCot(hop, sheet, tenSheet, codes);
  return codes;
}

/**
 * Dựng hộp cát. `sheets` là tên các sheet có trong tệp giả, `props` là `DocumentProperties` ban đầu, `userProps` là `UserProperties` ban đầu, `thamSo` là các cặp `[tên, giá trị]` ghi vào khối tham số của `Config`.
 *
 * Trả về cả `dem` — bộ đếm lệnh gọi của tệp giả. Đó là thứ làm cho luật "cả lượt chỉ tốn một lệnh ghi" đo được ngay trên máy, thay vì phải tin vào con số mà chính code cần kiểm tự báo.
 */
function dungHop(chon) {
  const y = chon || {};
  const tenSheets = y.sheets || ['Config', 'Log'];
  const stubs = taoStubsGas({ sheets: tenSheets, props: y.props, userProps: y.userProps });
  const hop = napServer(taoHopCat(stubs), ...(y.tep || TEP_NEN));

  const ra = { hop: hop, stubs: stubs, book: stubs._book, dem: stubs._dem, daConsole: stubs._daConsole, props: stubs._props, userProps: stubs._userProps, sheet: (ten) => stubs._book.getSheetByName(ten) };
  tenSheets.forEach((ten) => { ra[ten] = { sheet: stubs._book.getSheetByName(ten), codes: ghiHangMa(hop, stubs._book.getSheetByName(ten), ten, y.themCot) }; });

  if (ra.Config) {
    const codes = ra.Config.codes;
    ra.Config.cotTen = codes.indexOf('@CFG_THAM_SO') + 1;
    ra.Config.cotGiaTri = codes.indexOf('@CFG_THAM_SO_GIA_TRI') + 1;
    ra.Config.firstDataRow = hop.SHEET_LAYOUT.Config.firstDataRow;

    (y.thamSo || []).forEach((cap, i) => {
      ra.Config.sheet.getRange(ra.Config.firstDataRow + i, ra.Config.cotTen).setValue(cap[0]);
      ra.Config.sheet.getRange(ra.Config.firstDataRow + i, ra.Config.cotGiaTri).setValue(cap[1]);
    });
  }

  return ra;
}

/**
 * Ghi một ô vào sheet giả, tìm cột **theo mã** ở hàng 1 chứ không theo thứ tự.
 *
 * Nằm ở đây vì nó là việc dựng hoàn cảnh, và vì nó ghi theo đúng cách code thật tra cột: nhờ vậy một tệp ca kiểm không phải tự chốt cứng "mã số thuế là cột thứ ba", tức là chèn thêm một cột vào hoàn cảnh không làm đỏ những phép kiểm chẳng liên quan gì tới thứ tự cột.
 */
function ghiO(nen, tenSheet, hang, ma, giaTri) {
  const cot = nen[tenSheet].codes.indexOf(ma) + 1;
  if (cot === 0) {
    throw new Error('Hàng 1 của sheet "' + tenSheet + '" không có mã ' + ma + '. Có: ' + nen[tenSheet].codes.join(', ') + '.');
  }
  nen[tenSheet].sheet.getRange(hang, cot).setValue(giaTri);
  return cot;
}

module.exports = { dungHop, ghiHangMa, ghiO, TEP_NEN };
