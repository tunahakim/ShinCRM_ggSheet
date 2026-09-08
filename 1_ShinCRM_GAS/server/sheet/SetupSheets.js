/**
 * Hàm dựng khung tệp Sheet: năm sheet với đúng số hàng tiêu đề và đúng mã cột của phần lõi; Config đi qua lớp chuẩn bị riêng để có migration, ghi chú và validation.
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

  Object.keys(SHEET_LAYOUT).filter(function (sheetName) { return sheetName !== 'Config'; }).forEach(function (sheetName) {
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

  var configResult = prepareConfigSheet(file);
  report.push('✅ Config: ' + CONFIG_COLUMNS.length + ' cột lõi, ' + SHEET_HEADER_ROWS + ' hàng tiêu đề, dữ liệu từ hàng ' + SHEET_FIRST_DATA_ROW);
  report.push('');
  report.push('Khối tham số của Config: ' + configResult.seeded.total + ' tên trong danh mục, thêm mới ' + configResult.seeded.added.length
    + (configResult.seeded.added.length ? ' (' + configResult.seeded.added.join(', ') + ')' : ' — các tên đã có sẵn, giá trị giữ nguyên'));
  if (configResult.migration.found) { report.push('Đã chuyển hai bộ đếm cũ vào khối tham số và xóa hai cột bộ đếm cũ.'); }

  setupColumnFormats().forEach(function (line) { report.push(line); });

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
 * Đặt khuôn hiển thị cho **cả cột** của các cột lõi, ở mọi sheet có khai khuôn — hai sheet kho và `Category`. Bảng khuôn ở `server/data/ColumnFormat.js`.
 *
 * Đặt cho cả cột chứ không cho từng hàng, để hàng mới do `insertRowsAfter` thêm vào tự thừa hưởng khuôn. Cửa ghi còn đặt lại khuôn cột chữ ngay trước mỗi lệnh ghi, vì khuôn đặt một lần lúc dựng khung không sống nổi qua một lượt người dùng tự đổi định dạng cột trên sheet.
 *
 * Gộp các cột liền nhau cùng khuôn thành một lệnh, theo luật gộp lệnh ghi của tài liệu 06.
 *
 * **Không sửa được dữ liệu đã hỏng.** Ô nào trước đó đã bị Sheets đổi thành số thì giá trị trong ô đã là số rồi; đặt khuôn văn bản chỉ chặn lần sau, không mọc lại số 0 đã mất.
 */
function setupColumnFormats() {
  var lines = [''];

  columnFormatSheets().forEach(function (sheetName) {
    var sheet = shinOpenSheet(sheetName);
    var firstDataRow = SHEET_LAYOUT[sheetName].firstDataRow;
    var maxRows = sheet.getMaxRows();

    if (maxRows < firstDataRow) {
      lines.push('⚠️ ' + sheetName + ': lưới chưa có hàng dữ liệu nào, chưa đặt khuôn hiển thị');
      return;
    }

    var formatByCode = columnFormatMap(sheetName);
    var columnMap = readColumnMap(sheetName);
    var cols = Object.keys(formatByCode).map(function (code) {
      return { at: columnIndex(columnMap, code), format: formatByCode[code] };
    }).sort(function (a, b) { return a.at - b.at; });

    var groups = [];
    cols.forEach(function (col) {
      var last = groups[groups.length - 1];
      if (last && last.format === col.format && last.at + last.count === col.at) {
        last.count += 1;
        return;
      }
      groups.push({ at: col.at, count: 1, format: col.format });
    });

    groups.forEach(function (group) {
      sheet.getRange(firstDataRow, group.at, maxRows - firstDataRow + 1, group.count).setNumberFormat(group.format);
    });

    lines.push('✅ ' + sheetName + ': đặt khuôn hiển thị cho ' + cols.length + ' cột lõi bằng ' + groups.length + ' lệnh, hàng ' + firstDataRow + '–' + maxRows);
  });

  return lines;
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

  // Khuôn hiển thị: đọc một hàng dữ liệu là đủ, vì khuôn đặt cho cả cột. Đây là phép kiểm duy nhất cho biết chỗ chống Sheets tự đổi chuỗi số thành số có thật đang bật trên tệp hay không.
  columnFormatSheets().forEach(function (sheetName) {
    var formatByCode = columnFormatMap(sheetName);

    try {
      var sheet = shinOpenSheet(sheetName);
      var firstDataRow = SHEET_LAYOUT[sheetName].firstDataRow;

      if (sheet.getMaxRows() < firstDataRow) {
        lines.push('⚠️ ' + sheetName + ', khuôn hiển thị — lưới chưa có hàng dữ liệu nào để đọc khuôn');
        return;
      }

      var columnMap = readColumnMap(sheetName);
      var formats = sheet.getRange(firstDataRow, 1, 1, columnMap.lastColumn).getNumberFormats()[0];
      var wrong = Object.keys(formatByCode).filter(function (code) {
        return formats[columnIndex(columnMap, code) - 1] !== formatByCode[code];
      });

      if (wrong.length) {
        problems.push(sheetName + ', khuôn hiển thị: sai ở ' + wrong.join(', '));
        lines.push('❌ ' + sheetName + ', khuôn hiển thị — sai ở ' + wrong.join(', ') + '. Chạy setupSheets để đặt lại.');
      } else {
        lines.push('✅ ' + sheetName + ', khuôn hiển thị — ' + Object.keys(formatByCode).length + ' cột lõi đúng khuôn, cột chữ ở khuôn văn bản thuần nên số 0 đầu không bị cắt');
      }
    } catch (loiKhuon) {
      problems.push(sheetName + ', khuôn hiển thị: ' + loiKhuon.message);
      lines.push('❌ ' + sheetName + ', khuôn hiển thị — ' + loiKhuon.message);
    }
  });

  lines.push('');
  lines.push(problems.length ? '❌ KHÔNG ĐẠT — ' + problems.length + ' vấn đề' : '✅ ĐẠT — khung sheet đúng thiết kế');

  var text = lines.join('\n');
  console.log(text);
  return text;
}
