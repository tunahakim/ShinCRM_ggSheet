/**
 * Cửa duy nhất đặt hàng tiêu đề cho sheet dữ liệu: dựng sheet mới, chạy lại `setupSheets`, Config và module đồng bộ thêm cột riêng đều đi qua đây, để luật "đối chiếu theo mã, không theo vị trí" chỉ có một chỗ.
 */

/**
 * Đặt hàng tiêu đề của một sheet theo bảng khai `columns` (mảng cặp `[mã, nhãn]`) mà **không bao giờ đổi chỗ cột đã có**.
 *
 * Cạm bẫy đã gặp thật (FBM-056): ghi lại hàng mã theo thứ tự bảng khai trên một sheet xếp cột khác làm dữ liệu cũ mang nhãn của cột khác — điện thoại thành email, địa chỉ thành tỉnh thành — mà không có lỗi nào nổ. Vì vậy sheet đã có mã thì chỉ đối chiếu theo mã: mã có rồi giữ nguyên cột và chỉ ghi lại nhãn tại chính cột đó, mã thiếu thì thêm vào sau cột cuối, mã lạ để yên. Sheet trắng thì dựng theo thứ tự bảng khai.
 *
 * Trả về `{ appended, extra }` để bên gọi báo cho người dùng. Mã trùng trên sheet thì ném lỗi trước khi ghi gì, cùng luật với `readColumnMap`.
 */
function sheetEnsureHeader(sheet, columns, headerRows) {
  var width = sheet.getLastColumn();
  var labelRows = Math.min(headerRows, 2);
  var current = width ? sheet.getRange(1, 1, labelRows, width).getValues().map(function (row) {
    return row.map(function (cell) { return cell === null || cell === undefined ? '' : String(cell).trim(); });
  }) : [];
  while (current.length < labelRows) { current.push([]); }

  var at = {};
  var duplicates = [];
  (current[0] || []).forEach(function (code, index) {
    if (!code) { return; }
    if (at[code]) { duplicates.push(code + ' (cột ' + at[code] + ' và cột ' + (index + 1) + ')'); } else { at[code] = index + 1; }
  });
  if (duplicates.length) {
    throw new Error('Sheet "' + sheet.getName() + '" có mã cột trùng nhau: ' + duplicates.join(', ') + '. Sửa hàng 1 rồi chạy lại.');
  }

  var known = {};
  var appended = [];
  columns.forEach(function (column) {
    known[column[0]] = true;
    var col = at[column[0]];
    if (!col) {
      appended.push(column[0]);
      col = width + appended.length;
      current[0][col - 1] = column[0];
    }
    if (labelRows >= 2) { current[1][col - 1] = column[1]; }
  });

  var total = width + appended.length;
  if (sheet.getMaxColumns() < total) { sheet.insertColumnsAfter(sheet.getMaxColumns(), total - sheet.getMaxColumns()); }
  var rows = current.map(function (row) {
    var full = [];
    for (var i = 0; i < total; i += 1) { full.push(row[i] === undefined ? '' : row[i]); }
    return full;
  });
  // Một lệnh ghi cho cả khối tiêu đề, theo luật gộp lệnh ghi của tài liệu 06. Ô của cột lạ được ghi lại đúng giá trị vừa đọc.
  sheet.getRange(1, 1, labelRows, total).setValues(rows);

  return {
    appended: appended,
    extra: Object.keys(at).filter(function (code) { return !known[code]; }),
    width: total
  };
}
