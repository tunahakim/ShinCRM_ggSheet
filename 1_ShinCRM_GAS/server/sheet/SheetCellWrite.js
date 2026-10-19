/**
 * Ghi ô thô (tầng 1 đọc/ghi Sheet, tài liệu 06 Phần 2): chỉ biết sheet, tọa độ và giá trị; không biết trường, mã hay thực thể. Mọi lệnh Google làm đổi ô đi qua đây để hai việc không ai phải nhớ: chặn ghi sai chỗ theo chính sách loại sheet, và quên đúng vùng vừa ghi trong tờ nháp của lần gọi.
 * Quên trong `finally`: lệnh ghi ném lỗi giữa chừng vẫn có thể đã ghi một phần, nên phần tờ nháp đó không còn đáng tin.
 */

/** Ghi ma trận giá trị bắt đầu từ ô (`firstRow`, `firstColumn`), mọi số 1-based. Ma trận rỗng không tốn lệnh nào. */
function sheetCellsWrite(sheet, firstRow, firstColumn, matrix) {
  if (!matrix.length || !matrix[0].length) { return; }
  sheetPolicyAssertWritable(sheet);
  try {
    sheet.getRange(firstRow, firstColumn, matrix.length, matrix[0].length).setValues(matrix);
  } finally {
    sheetReadCopyForget(sheet, firstRow, matrix.length, true, firstColumn, matrix[0].length);
  }
}

/** Đặt khuôn số cho một vùng. Không đổi giá trị đọc về nên không phải quên tờ nháp. */
function sheetCellsFormat(sheet, firstRow, firstColumn, rowCount, columnCount, format) {
  if (rowCount <= 0 || columnCount <= 0) { return; }
  sheetPolicyAssertWritable(sheet);
  sheet.getRange(firstRow, firstColumn, rowCount, columnCount).setNumberFormat(format);
}

/** Chữ đậm và màu nền cho một vùng (hàng mã, hàng nhãn). `style.bold` và `style.background` thiếu khóa nào thì không đổi thứ đó. Không đổi giá trị đọc về nên không phải quên tờ nháp. */
function sheetCellsStyle(sheet, firstRow, firstColumn, rowCount, columnCount, style) {
  if (rowCount <= 0 || columnCount <= 0) { return; }
  sheetPolicyAssertWritable(sheet);
  var range = sheet.getRange(firstRow, firstColumn, rowCount, columnCount);
  if (style.bold !== undefined) { range.setFontWeight(style.bold ? 'bold' : 'normal'); }
  if (style.background !== undefined) { range.setBackground(style.background); }
}

/** Gắn quy tắc kiểm dữ liệu (danh sách chọn) cho một vùng; `rule` là `null` thì gỡ. Không đổi giá trị đọc về nên không phải quên tờ nháp. */
function sheetCellsValidate(sheet, firstRow, firstColumn, rowCount, columnCount, rule) {
  if (rowCount <= 0 || columnCount <= 0) { return; }
  sheetPolicyAssertWritable(sheet);
  sheet.getRange(firstRow, firstColumn, rowCount, columnCount).setDataValidation(rule);
}

/** Xóa nội dung (giữ khuôn) một vùng. Có thể làm dòng cuối co lại nên quên luôn số dòng cuối đã nhớ. */
function sheetCellsClear(sheet, firstRow, firstColumn, rowCount, columnCount) {
  if (rowCount <= 0 || columnCount <= 0) { return; }
  sheetPolicyAssertWritable(sheet);
  try {
    sheet.getRange(firstRow, firstColumn, rowCount, columnCount).clearContent();
  } finally {
    sheetReadCopyForget(sheet, firstRow, rowCount, false);
  }
}

/** Đặt note cho một vùng từ ma trận chữ (chuỗi rỗng là gỡ note). Không đổi giá trị đọc về nên không phải quên tờ nháp; note luôn đọc thẳng (`sheetReadNotes`). */
function sheetCellsSetNotes(sheet, firstRow, firstColumn, notes) {
  if (!notes.length || !notes[0].length) { return; }
  sheetPolicyAssertWritable(sheet);
  sheet.getRange(firstRow, firstColumn, notes.length, notes[0].length).setNotes(notes);
}

/** Chèn `count` cột trước cột `column`. Cột bên phải dịch chỗ nên bỏ cả phần tờ nháp của sheet. */
function sheetColumnsInsertBefore(sheet, column, count) {
  if (count <= 0) { return; }
  sheetPolicyAssertWritable(sheet);
  try {
    sheet.insertColumnsBefore(column, count);
  } finally {
    sheetReadCopyForget(sheet, 1, null, false);
  }
}

/**
 * Xóa hẳn các dòng theo số dòng, gom dải liền nhau thành một lệnh và xóa từ dưới lên để số dòng chưa xóa không trượt. Dòng dưới dịch lên nên bỏ cả phần tờ nháp của sheet.
 * Google từ chối xóa hết các hàng không đóng băng và ném lỗi giữa chừng, khi đã xóa xong vài dải: lưới sát dữ liệu (sheet mới dựng, sheet vừa bị dọn) gặp đúng ca này. Nên tính trước, sắp xóa hết thì chèn bù hàng trống ở cuối lưới rồi mới xóa.
 */
function sheetRowsDelete(sheet, rowNumbers) {
  if (!rowNumbers.length) { return; }
  sheetPolicyAssertWritable(sheet);
  var spans = sheetRegionsSpans(rowNumbers);
  var count = spans.reduce(function (sum, span) { return sum + span.length; }, 0);
  try {
    var left = sheet.getMaxRows() - sheet.getFrozenRows() - count;
    if (left < 1) { sheet.insertRowsAfter(sheet.getMaxRows(), 1 - left); }
    spans.reverse().forEach(function (span) { sheet.deleteRows(span[0], span.length); });
  } finally {
    sheetReadCopyForget(sheet, 1, null, false);
  }
}
