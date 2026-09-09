/** Ghi các cột kho không thuộc DATA_SCHEMA bằng một cổng dùng chung. */
function sheetWriteColumns(sheet, columnMap, firstRow, finalRows, data, changed) {
  if (!sheet || !columnMap || !data || !changed) { return { ok: false, written: 0, reason: 'Thiếu ngữ cảnh ghi sheet.' }; }
  var codes = Object.keys(changed).filter(function (code) { return changed[code]; });
  if (!codes.length || finalRows <= 0) { return { ok: true, written: 0 }; }
  sheetGridEnsureRoom(sheet, firstRow + finalRows - 1, 0);
  codes.forEach(function (code) {
    var col = columnIndex(columnMap, code), values = (data[code] || []).slice();
    while (values.length < finalRows) { values.push(''); }
    sheet.getRange(firstRow, col, finalRows, 1).setValues(values.map(function (value) { return [value]; }));
    sheet.getRange(firstRow, col, finalRows, 1).setNumberFormat('@');
  });
  SpreadsheetApp.flush();
  return { ok: true, written: codes.length };
}
