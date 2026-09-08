/**
 * Đọc ba khối cấu hình dạng bảng của sheet `Config` và dựng lại hợp đồng bộ đếm từ khối tham số.
 *
 * `Config` có các khối bảng đứng cạnh nhau; cặp tham số được `configParams()` ở `Settings.js` đọc riêng vì nằm trên đường ghi log. Đọc lại cặp này ở đây là dựng hai bản đọc cho một khối và mở đường cho chúng lệch nhau.
 *
 * Ba khối đọc ở đây:
 *   - **Sheet Schema** — kiểu của cột do người dùng tự thêm.
 *   - **Ngầm định gõ tay** — giá trị mặc định của từng trường.
 *   - **Sắp xếp mặc định** — khối *duy nhất* trong `Config` mà **thứ tự hàng mang nghĩa**.
 * Bộ đếm cấp mã nằm chung cặp cột tham số, nhưng vẫn trả về riêng dưới khóa `counters` để client không phụ thuộc cách lưu vật lý.
 *
 * Đọc cả vùng bằng một lệnh rồi tự chẻ theo cột, cùng lý do như `CategoryRead.gs`.
 *
 * **Điều tệp này chưa làm, và cố ý chưa:** phép kiểm nhẹ của tài liệu 02 Phần 10 — ngầm định thuộc loại danh mục thì giá trị phải khớp một mục trong danh mục. Phép đó cần cả bảng ngầm định lẫn bảng danh mục nên không thuộc tệp nào trong hai tệp đọc, và nó chỉ có chỗ hiện ra khi bộ máy ngầm định có thật ở chặng dựng form. Nó vào cùng chặng đó, không phải chặng này.
 */

/** Hai khối tra khóa ở tệp này; khối sắp xếp được đọc riêng vì thứ tự hàng mang nghĩa. */
var CONFIG_READ_BLOCKS = {
  sheetSchema: { key: '@CFG_COT_MA', value: '@CFG_COT_KIEU', label: 'Sheet Schema' },
  defaults: { key: '@CFG_NGAM_DINH_MA_COT', value: '@CFG_NGAM_DINH_GIA_TRI', label: 'Ngầm định gõ tay' }
};

/**
 * Một khối đọc theo kiểu tra khóa: mã ở cột trái, giá trị ở cột phải, thứ tự hàng không mang nghĩa.
 *
 * Khóa trùng thì **ném lỗi kèm khóa bị trùng**, không tự chọn một hàng. Đây là ràng buộc cứng của tài liệu 02 Phần 10 và nó khác hẳn cách xử lý giá trị trùng ở `Category`: ở đây hai hàng cùng khóa nghĩa là hai câu trả lời khác nhau cho cùng một câu hỏi, nên đoán lấy một là đoán thay người dùng ở một chỗ ảnh hưởng tới mọi bản ghi ghi sau đó. Ở `Category` thì hai giá trị trùng chỉ là một mục hiện hai lần trong danh sách chọn, bỏ một cái là xong.
 */
function configReadBlock(block, columnMap, rows) {
  var keyAt = columnIndex(columnMap, block.key) - 1;
  var valueAt = columnIndex(columnMap, block.value) - 1;
  var result = {};
  var duplicates = [];

  rows.forEach(function (row) {
    var name = String(row[keyAt] === null || row[keyAt] === undefined ? '' : row[keyAt]).trim();
    if (!name) { return; }

    if (Object.prototype.hasOwnProperty.call(result, name)) {
      duplicates.push(name);
      return;
    }

    var value = row[valueAt];
    result[name] = String(value === null || value === undefined ? '' : value).trim();
  });

  if (duplicates.length) {
    throw new Error('Khối "' + block.label + '" của sheet Config có khóa khai trùng: ' + duplicates.join(', ') + '. Mỗi khóa chỉ được một dòng — xóa dòng thừa rồi chạy lại.');
  }

  return result;
}

/**
 * Khối sắp xếp mặc định, đọc **theo thứ tự hàng**.
 *
 * Đây là khối duy nhất trong `Config` mà thứ tự trên xuống chính là thứ tự ưu tiên của các cấp sắp xếp, nên nó không dùng được đường tra khóa ở trên: một object JavaScript không hứa giữ thứ tự khóa theo mọi ca, và cùng một mã cột hoàn toàn có thể xuất hiện ở hai cấp.
 *
 * Hàng thiếu một vế thì **bỏ qua và đi tiếp**, không dừng đọc — đúng theo tài liệu 02 Phần 10. Dừng đọc ở hàng thiếu nghĩa là một ô xóa lỡ tay ở cấp hai sẽ âm thầm làm mất cấp ba và cấp bốn.
 */
function configReadSort(columnMap, rows) {
  var colAt = columnIndex(columnMap, '@CFG_SORT_COL') - 1;
  var levelAt = columnIndex(columnMap, '@CFG_SORT_LEVEL') - 1;
  var levels = [];

  rows.forEach(function (row) {
    var col = String(row[colAt] === null || row[colAt] === undefined ? '' : row[colAt]).trim();
    var level = String(row[levelAt] === null || row[levelAt] === undefined ? '' : row[levelAt]).trim();
    if (!col || !level) { return; }
    levels.push({ col: col, level: level });
  });

  return levels;
}

/** Trả về hợp đồng ổn định `{ sheetSchema, defaults, counters, sort }`. */
function configReadAll() {
  var sheetName = 'Config';
  var sheet = shinOpenSheet(sheetName);
  var columnMap = readColumnMap(sheetName);
  var rowCount = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  var rows = sheetGridReadBlock(sheet, SHEET_FIRST_DATA_ROW, rowCount, columnMap.lastColumn);

  return {
    sheetSchema: configReadBlock(CONFIG_READ_BLOCKS.sheetSchema, columnMap, rows),
    defaults: configReadBlock(CONFIG_READ_BLOCKS.defaults, columnMap, rows),
    counters: configCounterValues(configParams()),
    sort: configReadSort(columnMap, rows)
  };
}

/** Phép nghiệm thu chạy được trên Google: in các khối bảng của `Config`, kèm bộ đếm và tham số do `Settings.js` đọc. */
function probeConfigRead() {
  var report = [];
  var khoi = configReadAll();

  report.push('Khối tham số hệ thống (do Settings.js đọc): ' + Object.keys(configParams()).length + ' tham số');

  ['sheetSchema', 'defaults', 'counters'].forEach(function (name) {
    var block = khoi[name];
    var keys = Object.keys(block);
    report.push('Khối ' + name + ': ' + (keys.length ? keys.length + ' dòng' : 'chưa có dòng nào (đúng với sheet mới dựng)'));
    keys.forEach(function (key) { report.push('  ' + key + ' = "' + block[key] + '"'); });
  });

  report.push('Khối sort (thứ tự hàng mang nghĩa): ' + (khoi.sort.length ? khoi.sort.length + ' cấp' : 'chưa có cấp nào'));
  khoi.sort.forEach(function (item, i) { report.push('  cấp ' + (i + 1) + ': ' + item.col + ' ' + item.level); });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
