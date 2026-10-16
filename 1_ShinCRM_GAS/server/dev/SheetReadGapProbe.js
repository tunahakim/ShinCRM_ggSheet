/**
 * Probe DEV đo hai con số quyết định ngưỡng gộp dòng của bản đọc Sheet (`SETTINGS.SHEET_READ_MERGE_GAP_ROWS`): phí cố định của một lệnh `getValues` và phí thêm mỗi dòng trong cùng lệnh. Hai dòng cách nhau ít hơn tỉ số đó thì đọc chung một lệnh rẻ hơn hai lệnh.
 *
 * Cạm bẫy: Google nhớ vùng vừa đọc trong cùng lần chạy, đọc lại đúng vùng cũ ra số ảo; mỗi phép đo lấy một vùng chưa đọc. Chỉ đọc, không ghi gì.
 */
function measureSheetReadGap() {
  var sheet = shinOpenSheet(ENTITY_SHEETS.customer);
  var lastColumn = sheet.getLastColumn();
  var rowCount = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  var sizes = [1, 2, 5, 10, 25, 50, 100, 200];
  var rounds = 3;
  var need = sizes.reduce(function (sum, n) { return sum + n; }, 0) * rounds;
  if (rowCount < need) { return ['Sheet Customer chỉ có ' + rowCount + ' dòng, cần ít nhất ' + need + ' dòng chưa đọc để đo.']; }
  var next = SHEET_FIRST_DATA_ROW;
  var out = ['Customer: ' + rowCount + ' dòng × ' + lastColumn + ' cột'];
  var median = {};
  sizes.forEach(function (n) {
    var samples = [];
    for (var round = 0; round < rounds; round++) {
      var started = Date.now();
      sheet.getRange(next, 1, n, lastColumn).getValues();
      samples.push(Date.now() - started);
      next += n;
    }
    samples.sort(function (a, b) { return a - b; });
    median[n] = samples[Math.floor(rounds / 2)];
    out.push(n + ' dòng: ' + samples.join(', ') + ' ms (giữa ' + median[n] + ')');
  });
  // Đường thẳng qua các điểm giữa: hệ số góc là phí mỗi dòng, giao trục là phí cố định một lệnh.
  var xs = sizes, ys = sizes.map(function (n) { return median[n]; });
  var mx = xs.reduce(function (a, b) { return a + b; }, 0) / xs.length;
  var my = ys.reduce(function (a, b) { return a + b; }, 0) / ys.length;
  var num = 0, den = 0;
  xs.forEach(function (x, i) { num += (x - mx) * (ys[i] - my); den += (x - mx) * (x - mx); });
  var perRow = num / den;
  var fixed = my - perRow * mx;
  out.push('Phí cố định một lệnh ≈ ' + Math.round(fixed) + ' ms; phí mỗi dòng ≈ ' + perRow.toFixed(3) + ' ms; hòa vốn khi khoảng cách ≈ ' + (perRow > 0 ? Math.round(fixed / perRow) : 'vô hạn') + ' dòng');
  return out;
}

/** Đo vùng Google tự nạp quanh một lần đọc: đọc một dòng ở giữa Activity, rồi dò từng dòng tiến và lùi cho tới khi một lần đọc tốn như đọc lạnh. Số đầu tiên vượt ngưỡng cho biết cỡ vùng được nạp sẵn. */
function measureSheetReadPrefetch() {
  var sheet = shinOpenSheet(ENTITY_SHEETS.activity);
  var lastColumn = sheet.getLastColumn();
  var rowCount = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  var middle = SHEET_FIRST_DATA_ROW + Math.floor(rowCount / 2);
  var read = function (row) { var started = Date.now(); sheet.getRange(row, 1, 1, lastColumn).getValues(); return Date.now() - started; };
  var out = ['Activity: ' + rowCount + ' dòng × ' + lastColumn + ' cột, dòng giữa ' + middle + ' đọc lạnh ' + read(middle) + ' ms'];
  [1, -1].forEach(function (step) {
    var line = [];
    for (var k = 5; k <= 600; k += 5) {
      var row = middle + step * k;
      if (row < SHEET_FIRST_DATA_ROW || row >= SHEET_FIRST_DATA_ROW + rowCount) { break; }
      var ms = read(row);
      if (ms >= 30) { line.push((step > 0 ? '+' : '-') + k + ':' + ms); }
    }
    out.push((step > 0 ? 'Tiến' : 'Lùi') + ' (chỉ ghi lần đọc ≥ 30 ms): ' + (line.join(', ') || 'không có'));
  });
  var columnSheet = shinOpenSheet(ENTITY_SHEETS.customer);
  var q = SHEET_FIRST_DATA_ROW + 700;
  var started = Date.now();
  columnSheet.getRange(q, 1, 1, 1).getValues();
  var oneCell = Date.now() - started;
  started = Date.now();
  columnSheet.getRange(q, 1, 1, columnSheet.getLastColumn()).getValues();
  out.push('Customer dòng ' + q + ': đọc 1 ô lạnh ' + oneCell + ' ms, rồi cả dòng ' + (Date.now() - started) + ' ms');
  return out;
}
