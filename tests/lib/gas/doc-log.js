/**
 * Đọc các dòng dữ liệu của sheet `Log` trong hộp cát dựng bằng `dungHop`.
 *
 * `flush: true` nhả bộ đệm Log trước khi đọc, cho ca kiểm gọi thẳng cổng mà không đi qua cửa vào (cửa vào thật tự nhả). `noi` là ký tự nối các ô của một dòng thành một chuỗi, để so cả dòng bằng một phép so; bỏ trống thì trả mảng ô.
 */

function docLog(nen, chon) {
  const y = chon || {};
  if (y.flush) { nen.hop.flushLog(); }
  const sheet = nen.Log.sheet;
  const dau = nen.hop.SHEET_LAYOUT.Log.firstDataRow;
  if (sheet.getLastRow() < dau) { return []; }
  const rows = sheet.getRange(dau, 1, sheet.getLastRow() - dau + 1, nen.hop.LOG_HEADERS.length).getValues();
  return y.noi === undefined ? rows : rows.map((row) => row.join(y.noi));
}

module.exports = { docLog };
