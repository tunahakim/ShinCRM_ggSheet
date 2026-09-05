/**
 * Hàm dựng khung tệp Sheet: năm sheet với đúng số hàng tiêu đề và đúng mã cột của phần lõi.
 *
 * Vì sao dựng bằng code chứ không gõ tay: hàng 1 là căn cứ duy nhất để code nhận cột, nên một mã gõ lệch một chữ là một lỗi không có gì bắt được cho tới lúc nạp. Sinh hàng 1 từ cùng bảng khai mà chương trình đọc lúc chạy thì hai bên không có đường lệch nhau.
 *
 * Tệp này không giữ danh sách cột nào của riêng nó. Nó hỏi `sheetCoreColumns()` — nghĩa là hỏi `DATA_SCHEMA` với hai sheet kho, hỏi `SheetLayout.gs` với `Category`, `Config` và `Log`. Trước đây nó giữ một bản sao danh sách cột, và bản sao đó đã hết việc.
 *
 * Nó chỉ dựng phần cột của **lõi**. Tám cột thuần đồng bộ do `fbm_sync` tự dựng ở giai đoạn 3, nên chạy hàm này lại trên sheet đã có cột đồng bộ thì các cột đó nằm ngoài vùng ghi và không bị đụng tới.
 *
 * Ngoài hàng tiêu đề, nó gieo thêm đúng một thứ: tên các tham số hệ thống vào cột `Tham số` của sheet `Config`, giá trị để trống. Danh sách tên ở `ConfigParams.gs`, không ở đây.
 */

/**
 * Dựng toàn bộ khung sheet. Chạy lại được nhiều lần: sheet đã có thì chỉ ghi lại hàng tiêu đề, không đụng dữ liệu bên dưới.
 */
function setupSheets() {
  var file = shinOpenBook();
  var report = ['ShinCRM — dựng khung sheet', 'Tệp: ' + file.getName(), ''];

  Object.keys(SHEET_LAYOUT).forEach(function (sheetName) {
    var layout = SHEET_LAYOUT[sheetName];
    var columns = sheetCoreColumns(sheetName);
    var sheet = file.getSheetByName(sheetName) || file.insertSheet(sheetName);
    var headerRows = layout.headerRows;

    var rows = [columns.map(function (column) { return column[0]; })];
    if (headerRows >= 2) {
      rows.push(columns.map(function (column) { return column[1]; }));
    }
    while (rows.length < headerRows) {
      rows.push(columns.map(function () { return ''; }));
    }

    // Ghi cả các hàng tiêu đề bằng đúng một lệnh, theo luật gộp lệnh ghi của tài liệu 06.
    sheet.getRange(1, 1, headerRows, columns.length).setValues(rows);

    sheet.getRange(1, 1, 1, columns.length).setFontWeight('bold').setBackground(layout.headerColor);
    if (headerRows >= 2) {
      sheet.getRange(2, 1, 1, columns.length).setFontWeight('bold');
    }
    sheet.setFrozenRows(headerRows);

    report.push('✅ ' + sheetName + ': ' + columns.length + ' cột lõi, ' + headerRows + ' hàng tiêu đề, dữ liệu từ hàng ' + layout.firstDataRow);
  });

  // Gieo tên tham số sau vòng lặp trên, vì phép tra cột của nó đọc hàng 1 của `Config` — hàng vừa được ghi ở trên.
  seedConfigParams(file).forEach(function (line) { report.push(line); });

  // Sheet trắng của Google tên "Trang tính1" hoặc "Sheet1"; xóa nếu nó còn trống, vì để lại thì nó lọt vào danh sách sheet cần nạp.
  var leftovers = file.getSheets().filter(function (sheet) {
    return !SHEET_LAYOUT.hasOwnProperty(sheet.getName()) && sheet.getLastRow() === 0;
  });
  leftovers.forEach(function (sheet) {
    report.push('🗑 Đã xóa sheet trống thừa: ' + sheet.getName());
    file.deleteSheet(sheet);
  });

  report.push('');
  report.push('Các sheet hiện có: ' + file.getSheets().map(function (sheet) { return sheet.getName(); }).join(', '));

  var text = report.join('\n');
  console.log(text);
  return text;
}

/**
 * Gieo tên các tham số hệ thống vào cột `Tham số` của sheet `Config`, ô giá trị để trống.
 *
 * Chỉ thêm tên **còn thiếu**, và không bao giờ chạm vào ô giá trị. Không có luật đó thì mỗi lần chạy lại `setupSheets` là một lần xóa sạch các núm người dùng đã vặn — mà hàm này sinh ra để chạy lại được nhiều lần.
 *
 * Thêm vào ngay dưới dòng cuối **của chính cột tham số**, không phải dưới `getLastRow()` của cả sheet: năm khối của `Config` chạy dọc độc lập nên một khối bộ đếm dài hơn sẽ đẩy các tên mới xuống dưới một khoảng trống trắng.
 *
 * Ghi chú giải thích đặt trên ô **tên**, và viết lại mỗi lượt chạy để nó không lạc hậu so với code. Ô tên là ô của code; ô giá trị là ô của người dùng. Ranh giới đó là toàn bộ lý do hàm này chạy lại được mà không phá gì.
 */
function seedConfigParams(file) {
  var columnMap = readColumnMap('Config');
  var nameColumn = columnIndex(columnMap, '@CFG_THAM_SO');
  var firstDataRow = SHEET_LAYOUT.Config.firstDataRow;
  var sheet = file.getSheetByName('Config');
  var lastRow = sheet.getLastRow();
  var rowOfName = {};
  var lastFilled = firstDataRow - 1;

  if (lastRow >= firstDataRow) {
    sheet.getRange(firstDataRow, nameColumn, lastRow - firstDataRow + 1, 1).getValues().forEach(function (row, index) {
      var name = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
      if (!name) { return; }
      lastFilled = firstDataRow + index;
      if (!rowOfName[name]) { rowOfName[name] = firstDataRow + index; }
    });
  }

  var catalog = configParamCatalog();
  var missing = catalog.filter(function (item) { return !rowOfName[item.name]; });

  if (missing.length) {
    // Nới lưới trước khi ghi vì `setValues` không tự nới. Nới vừa đủ, không nới thừa: khối này gieo một lần rồi thôi, còn mỗi hàng thừa là mười ô trừ vào ngân sách ô.
    sheetGridEnsureRoom(sheet, lastFilled + missing.length, 0);
    sheet.getRange(lastFilled + 1, nameColumn, missing.length, 1).setValues(missing.map(function (item) { return [item.name]; }));
    missing.forEach(function (item, index) { rowOfName[item.name] = lastFilled + 1 + index; });
  }

  catalog.forEach(function (item) { sheet.getRange(rowOfName[item.name], nameColumn).setNote(item.note); });

  // Bộ nhớ tạm của `configParams` giữ bảng đọc trước lúc gieo, nên không xóa thì phần còn lại của lượt chạy này vẫn thấy khối tham số như cũ.
  resetSettingsCache();

  return ['', 'Khối tham số hệ thống của Config: ' + catalog.length + ' tham số trong danh mục, thêm mới ' + missing.length
    + (missing.length ? ' (' + missing.map(function (item) { return item.name; }).join(', ') + '), giá trị để trống nghĩa là dùng mặc định' : ' — các tên đã có sẵn, giá trị giữ nguyên không đụng tới')];
}

/**
 * Kiểm lại khung vừa dựng, đọc ngược từ sheet lên chứ không tin bảng khai.
 *
 * Phần đối chiếu mã cột giao hẳn cho `readColumnMap()` — chính hàm mà chương trình dùng lúc chạy thật. Viết lại phép đối chiếu ở đây là tạo ra hai bộ luật, và bộ nghiệm thu dễ dãi hơn bộ chạy thật thì nghiệm thu xanh mà chạy thật đỏ.
 *
 * Chỉ hai thứ `readColumnMap` không xem mà ở đây phải xem: số hàng đóng băng, và thứ tự cột lõi. Thứ tự cột không phải luật — code luôn tra theo mã — nhưng lệch thứ tự so với bảng khai là dấu hiệu sheet dựng từ bản khai cũ, nên nói ra thành ghi chú, không thành lỗi.
 *
 * Thứ ba là khối tham số hệ thống: đủ tên trong danh mục chưa, và mỗi tên đang mang giá trị gì. Có phần này vì một phép gieo không được nghiệm thu là một phép gieo chỉ tồn tại trong lời kể — và vì cùng lúc đó nó trả lời được câu người dùng hay hỏi nhất, "cái núm này đang bật hay tắt".
 */
function verifySheets() {
  var problems = [];
  var lines = ['ShinCRM — nghiệm thu khung sheet', ''];

  Object.keys(SHEET_LAYOUT).forEach(function (sheetName) {
    var layout = SHEET_LAYOUT[sheetName];
    var expected = sheetCoreColumns(sheetName).map(function (column) { return column[0]; });
    var info;

    try {
      info = readColumnMap(sheetName);
    } catch (loi) {
      problems.push(sheetName + ': ' + loi.message);
      lines.push('❌ ' + sheetName + ' — ' + loi.message);
      return;
    }

    var notes = [];
    var failed = false;
    var sheet = shinOpenSheet(sheetName);

    if (sheet.getFrozenRows() !== layout.headerRows) {
      var frozenNote = 'đóng băng ' + sheet.getFrozenRows() + ' hàng, phải là ' + layout.headerRows;
      problems.push(sheetName + ': ' + frozenNote);
      notes.push(frozenNote);
      failed = true;
    }

    var outOfOrder = expected.filter(function (code, index) { return info.map[code] !== index + 1; });
    if (outOfOrder.length) {
      notes.push('cột lõi không nằm đúng thứ tự bảng khai: ' + outOfOrder.join(', '));
    }

    var extra = info.lastColumn - expected.length;
    var extraText = extra > 0 ? ', thêm ' + extra + ' cột ngoài lõi' : '';

    if (notes.length) {
      lines.push((failed ? '❌ ' : '⚠️ ') + sheetName + ' — ' + notes.join('; '));
    } else {
      lines.push('✅ ' + sheetName + ' — ' + expected.length + ' mã cột lõi đúng, đóng băng ' + layout.headerRows + ' hàng' + extraText);
    }
  });

  // Đọc khối tham số qua chính `configParams()` mà chương trình dùng lúc chạy, không dựng đường đọc thứ hai. Nó ném lỗi khi có tên khai trùng, nên bọc lại: một tên trùng không được phép giết cả bản báo cáo.
  try {
    // Xóa bộ nhớ tạm trước khi đọc: một hàm nghiệm thu phải nói về sheet **đang** như thế nào, không phải như thế nào lúc ai đó đọc nó lần đầu trong cùng lượt chạy.
    resetSettingsCache();
    var params = configParams();
    var names = configParamNames();
    var missing = names.filter(function (name) { return !Object.prototype.hasOwnProperty.call(params, name); });

    if (missing.length) {
      problems.push('Config, khối tham số: thiếu ' + missing.join(', '));
      lines.push('❌ Config, khối tham số — thiếu ' + missing.join(', ') + '. Chạy setupSheets để gieo.');
    } else {
      lines.push('✅ Config, khối tham số — đủ ' + names.length + ' tên: ' + names.map(function (name) {
        return name + ' = ' + (params[name] ? '"' + params[name] + '"' : '(trống, dùng mặc định)');
      }).join(', '));
    }
  } catch (loiThamSo) {
    problems.push('Config, khối tham số: ' + loiThamSo.message);
    lines.push('❌ Config, khối tham số — ' + loiThamSo.message);
  }

  lines.push('');
  lines.push(problems.length ? '❌ KHÔNG ĐẠT — ' + problems.length + ' vấn đề' : '✅ ĐẠT — khung sheet đúng thiết kế');

  var text = lines.join('\n');
  console.log(text);
  return text;
}
