/**
 * Đọc hàng mã cột của một sheet và trả về bảng tra mã → chỉ số cột. Mọi phép đọc ghi ô về sau đều đi qua bảng tra này.
 *
 * Đây là chỗ luật "hàng 1 là căn cứ duy nhất để nhận cột" của tài liệu 02 Phần 3 thành code. Người dùng chèn cột, đổi thứ tự cột,
 * hay thêm cột riêng của họ vào giữa thì bảng tra đổi theo và phần còn lại của chương trình không biết gì cả — vì không chỗ nào
 * khác được phép nhắc tới chỉ số cột.
 *
 * Điều tệp này cố tình KHÔNG làm: nó không coi cột lạ là lỗi. Trên sheet thật còn có tám cột của `fbm_sync` và cột riêng người dùng
 * tự thêm; lõi không biết chúng tên gì và cũng không cần biết. Nó chỉ đòi những mã mà lõi thực sự cần phải có mặt.
 */

/**
 * Trả về bảng tra của một sheet: `{ map: { mã: chỉ số cột 1-based }, headerRow: mảng ô hàng 1, lastColumn: số cột }`.
 *
 * Ném lỗi nêu thẳng tên mã trong hai trường hợp: một mã xuất hiện hai lần trên sheet, hoặc một mã lõi cần mà sheet không có.
 * Cả hai đều là đọc lệch cột nếu để chạy tiếp — mà đọc lệch cột thì ghi số tiền của khách này vào dòng khách khác.
 */
function readColumnMap(sheetName) {
  var layout = SHEET_LAYOUT[sheetName];
  if (!layout) {
    throw new Error('Không có khai hình dáng cho sheet "' + sheetName + '" trong SHEET_LAYOUT.');
  }

  var sheet = shinOpenSheet(sheetName);
  var lastColumn = sheet.getLastColumn();
  if (lastColumn < 1) {
    throw new Error('Sheet "' + sheetName + '" chưa có cột nào. Chạy setupSheets trước.');
  }

  var headerRow = sheet.getRange(1, 1, 1, lastColumn).getValues()[0].map(function (cell) {
    return cell === null || cell === undefined ? '' : String(cell).trim();
  });

  var map = {};
  var duplicates = [];

  headerRow.forEach(function (code, index) {
    if (!code) { return; }
    if (map[code]) {
      duplicates.push(code + ' (cột ' + map[code] + ' và cột ' + (index + 1) + ')');
    } else {
      map[code] = index + 1;
    }
  });

  if (duplicates.length) {
    throw new Error('Sheet "' + sheetName + '" có mã cột trùng nhau: ' + duplicates.join(', ') + '. Sửa hàng 1 rồi chạy lại.');
  }

  var missing = sheetCoreColumns(sheetName)
    .map(function (pair) { return pair[0]; })
    .filter(function (code) { return !map[code]; });

  if (missing.length) {
    throw new Error('Sheet "' + sheetName + '" thiếu mã cột: ' + missing.join(', ') + '. Hoặc hàng 1 bị sửa, hoặc sheet dựng từ bản khai cũ.');
  }

  return { map: map, headerRow: headerRow, lastColumn: lastColumn };
}

/**
 * Lấy chỉ số cột của một mã, ném lỗi nếu không có.
 *
 * Có hàm này thay vì để bên gọi tự viết `map[code]` là để chặn một lỗi cụ thể: `map[code]` khi thiếu mã trả về `undefined`,
 * rồi `getRange(row, undefined)` ném lỗi của Google không nói mã nào sai, và người đọc lỗi phải tự đi tìm.
 */
function columnIndex(columnMap, code) {
  var index = columnMap.map[code];
  if (!index) {
    throw new Error('Không có mã cột "' + code + '" trong bảng tra. Hàng 1 hiện có: ' + columnMap.headerRow.filter(function (c) { return c; }).join(', '));
  }
  return index;
}

/**
 * In bảng tra của cả năm sheet ra log để người ngồi ngoài xem, và trả về chính những dòng đã in.
 *
 * Đây là phép nghiệm thu số 2 của chặng 1.1: gọi `node tests/gas.js dumpColumnMap --push` thì thấy sheet nào có mã gì ở cột nào.
 *
 * Trả về mảng dòng chữ chứ không trả về đối tượng lồng nhau, vì thứ cần ở đây là đọc được bằng mắt qua cửa chạy hàm.
 * Code cần bảng tra thì gọi `readColumnMap` — hàm này là để cho người xem.
 */
function dumpColumnMap() {
  var report = [];

  Object.keys(SHEET_LAYOUT).forEach(function (sheetName) {
    var info = readColumnMap(sheetName);
    var pairs = Object.keys(info.map).map(function (code) { return code + ' → ' + info.map[code]; });
    report.push(sheetName + ' (' + info.lastColumn + ' cột, ' + pairs.length + ' mã):');
    report.push('  ' + pairs.join(', '));
  });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
