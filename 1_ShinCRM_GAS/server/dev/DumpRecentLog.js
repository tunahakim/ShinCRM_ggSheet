/** Đọc giới hạn các dòng Log cuối để chẩn đoán DEV; không ghi, không sửa và không trả payload nhạy cảm nguyên văn. */
function dumpRecentLog() {
  var sheet = shinOpenSheet('Log'), lastRow = sheet.getLastRow(), firstRow = Math.max(2, lastRow - 19), count = lastRow - firstRow + 1;
  if (count <= 0) { return { sheet: 'Log', firstRow: firstRow, lastRow: lastRow, rows: [] }; }
  var values = sheet.getRange(firstRow, 1, count, Math.min(sheet.getLastColumn(), 9)).getDisplayValues();
  return { sheet: 'Log', firstRow: firstRow, lastRow: lastRow, rows: values.map(function (row, index) { return { row: firstRow + index, values: row }; }) };
}
