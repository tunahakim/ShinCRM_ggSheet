/**
 * Dựng sẵn hộp cát có tệp Sheet giả, để tệp ca kiểm chỉ còn việc kiểm.
 *
 * Vì sao tách ra khỏi từng tệp ca kiểm: danh sách tệp máy chủ cần nạp là thứ đổi mỗi lần cây thư mục đổi. Để nó nằm rải ở từng tệp ca kiểm thì một lần dọn thư mục là một lần sửa năm chỗ, và chỗ bị quên sẽ báo đỏ vì lý do không liên quan gì tới điều nó đang kiểm.
 *
 * Tệp này **không** chứa phép kiểm nào. Nó chỉ dựng hoàn cảnh.
 */

const { napServer, taoHopCat } = require('./load-gas');
const { taoStubsGas } = require('./gas-stubs');

/** Bộ tệp máy chủ mà mọi ca kiểm chạm sheet đều cần: mở tệp, khai hình dữ liệu, đọc hàng mã, tham số, cửa ghi log. */
const TEP_NEN = [
  'server/sheet/Book.js',
  'server/data/DataSchema.js',
  'server/data/SheetLayout.js',
  'server/sheet/SheetIo.js',
  'server/config/Settings.js',
  'server/log/LogGate.js'
];

/**
 * Ghi hàng 1 cho một sheet giả.
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
  return codes;
}

/**
 * Dựng hộp cát. `sheets` là tên các sheet có trong tệp giả, `props` là `DocumentProperties` ban đầu, `thamSo` là các cặp `[tên, giá trị]` ghi vào khối tham số của `Config`.
 *
 * Trả về cả `dem` — bộ đếm lệnh gọi của tệp giả. Đó là thứ làm cho luật "cả lượt chỉ tốn một lệnh ghi" đo được ngay trên máy, thay vì phải tin vào con số mà chính code cần kiểm tự báo.
 */
function dungHop(chon) {
  const y = chon || {};
  const tenSheets = y.sheets || ['Config', 'Log'];
  const stubs = taoStubsGas({ sheets: tenSheets, props: y.props });
  const hop = napServer(taoHopCat(stubs), ...(y.tep || TEP_NEN));

  const ra = { hop: hop, stubs: stubs, book: stubs._book, dem: stubs._dem, daConsole: stubs._daConsole, props: stubs._props, sheet: (ten) => stubs._book.getSheetByName(ten) };
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

module.exports = { dungHop, ghiHangMa, TEP_NEN };
