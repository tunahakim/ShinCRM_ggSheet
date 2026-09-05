/**
 * Hàm dựng khung tệp Sheet: năm sheet với đúng số hàng tiêu đề và đúng mã cột của phần lõi.
 *
 * Vì sao dựng bằng code chứ không gõ tay: hàng 1 là căn cứ duy nhất để code nhận cột, nên một mã gõ lệch một chữ là một lỗi không có gì bắt được cho tới lúc nạp. Sinh hàng 1 từ cùng bảng khai mà chương trình đọc lúc chạy thì hai bên không có đường lệch nhau.
 *
 * Tệp này không giữ danh sách cột nào của riêng nó. Nó hỏi `sheetCoreColumns()` — nghĩa là hỏi `DATA_SCHEMA` với hai sheet kho, hỏi `SheetLayout.gs` với `Category`, `Config` và `Log`. Trước đây nó giữ một bản sao danh sách cột, và bản sao đó đã hết việc.
 *
 * Nó chỉ dựng phần cột của **lõi**. Tám cột thuần đồng bộ do `fbm_sync` tự dựng ở giai đoạn 3, nên chạy hàm này lại trên sheet đã có cột đồng bộ thì các cột đó nằm ngoài vùng ghi và không bị đụng tới.
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
 * Kiểm lại khung vừa dựng, đọc ngược từ sheet lên chứ không tin bảng khai.
 *
 * Phần đối chiếu mã cột giao hẳn cho `readColumnMap()` — chính hàm mà chương trình dùng lúc chạy thật. Viết lại phép đối chiếu ở đây là tạo ra hai bộ luật, và bộ nghiệm thu dễ dãi hơn bộ chạy thật thì nghiệm thu xanh mà chạy thật đỏ.
 *
 * Chỉ hai thứ `readColumnMap` không xem mà ở đây phải xem: số hàng đóng băng, và thứ tự cột lõi. Thứ tự cột không phải luật — code luôn tra theo mã — nhưng lệch thứ tự so với bảng khai là dấu hiệu sheet dựng từ bản khai cũ, nên nói ra thành ghi chú, không thành lỗi.
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

  lines.push('');
  lines.push(problems.length ? '❌ KHÔNG ĐẠT — ' + problems.length + ' vấn đề' : '✅ ĐẠT — khung sheet đúng thiết kế');

  var text = lines.join('\n');
  console.log(text);
  return text;
}
