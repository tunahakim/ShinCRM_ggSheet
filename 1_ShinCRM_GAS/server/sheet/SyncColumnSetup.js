/** Bổ sung các cột do module gọi cung cấp qua cửa ghi chung. */
function ensureColumnsThroughWriteGate(source, columnsForSheet) {
  if (typeof writeCommitAssertAvailable !== 'function') {
    throw new Error('Thiếu WriteCommit; không ghi schema để tránh mất signal reload.');
  }
  writeCommitAssertAvailable();
  var book = shinOpenBook(), report = [], changed = false;
  var commit = null;
  documentLockRun(function () {
    ['Customer', 'Activity'].forEach(function (sheetName) {
      var sheet = book.getSheetByName(sheetName), expected = columnsForSheet(sheetName);
      if (!sheet || !expected.length) { return; }
      var map = readColumnMap(sheetName), missing = expected.filter(function (item) { return !map.map[item[0]]; });
      if (!missing.length) { return; }
      var header = sheetEnsureHeader(sheet, expected, 2);
      var start = header.width - header.appended.length + 1;
      sheetCellsStyle(sheet, 1, start, 1, missing.length, { bold: true });
      sheetCellsFormat(sheet, SHEET_FIRST_DATA_ROW, start, Math.max(1, sheetGridSize(sheet).rows - SHEET_FIRST_DATA_ROW + 1), missing.length, '@');
      changed = true;
      report.push(sheetName + ': thêm ' + missing.length + ' cột');
    });
    if (changed) {
      commit = writeCommitAfterSuccess({
        source: source === 'background' ? 'background' : (source || 'pull'),
        surface: 'schema',
        schema: true
      });
    }
  });

  return { ok: true, changed: changed, report: report, reload: commit && commit.reloadDecision };
}
