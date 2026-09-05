/**
 * Hàm dựng khung tệp Sheet: năm sheet với đúng số hàng tiêu đề và đúng mã cột của phần lõi, cộng phép gieo tên tham số hệ thống vào `Config`.
 *
 * Dựng bằng code chứ không gõ tay vì hàng 1 là căn cứ duy nhất để code nhận cột — một mã gõ lệch một chữ không có gì bắt được cho tới lúc nạp. Tệp này không giữ danh sách cột nào của riêng nó, nó hỏi `sheetCoreColumns()`; danh sách tên tham số hỏi `ConfigParams.gs`.
 *
 * Chỉ dựng phần cột của **lõi**. Tám cột thuần đồng bộ do `fbm_sync` tự dựng ở giai đoạn 3, nằm ngoài vùng ghi nên chạy lại không đụng tới.
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
 * Gieo tên tham số hệ thống vào cột `Tham số` của `Config`, ô giá trị để trống.
 *
 * Ô tên là ô của code (ghi chú viết lại mỗi lượt), ô giá trị là ô của người dùng — không bao giờ chạm. Ranh giới đó là lý do chạy lại được nhiều lần mà không xóa mất núm người dùng đã vặn. Tên mới nối dưới dòng cuối của **chính cột tham số**, vì năm khối của `Config` chạy dọc độc lập nên `getLastRow()` của cả sheet sẽ chừa lại khoảng trắng.
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
    // `setValues` không tự nới lưới. Nới vừa đủ: mỗi hàng thừa là mười ô trừ vào ngân sách ô.
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
 * Phần đối chiếu mã cột giao hẳn cho `readColumnMap()` — chính hàm chương trình dùng lúc chạy thật, vì hai bộ luật thì bộ nghiệm thu dễ dãi hơn sẽ xanh trong khi chạy thật đỏ. Chỉ hai thứ nó không xem mà ở đây phải xem: số hàng đóng băng, và thứ tự cột lõi (lệch thứ tự chỉ là dấu hiệu sheet dựng từ bản khai cũ, nên thành ghi chú chứ không thành lỗi).
 *
 * Thứ ba là khối tham số hệ thống: đủ tên chưa, mỗi tên đang mang giá trị gì — đây cũng là chỗ trả lời câu "cái núm này đang bật hay tắt".
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

  // Đọc qua chính `configParams()` chương trình dùng, không dựng đường đọc thứ hai. Nó ném lỗi khi có tên trùng, nên bọc lại: một tên trùng không được giết cả bản báo cáo.
  try {
    // Xóa bộ nhớ tạm trước khi đọc: nghiệm thu phải nói về sheet **đang** như thế nào.
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
