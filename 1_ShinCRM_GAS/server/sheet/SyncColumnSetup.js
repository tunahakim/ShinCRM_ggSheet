/** Bổ sung các cột do module gọi cung cấp qua cửa ghi chung. */
function ensureColumnsThroughWriteGate(source, columnsForSheet) {
  if (typeof writeCommitAssertAvailable !== 'function') {
    throw new Error('Thiếu WriteCommit; không ghi schema để tránh mất signal reload.');
  }
  writeCommitAssertAvailable();
  var book = shinOpenBook(), report = [], changed = false;
  var lock = null;
  var commit = null;
  if (typeof LockService !== 'undefined' && LockService.getDocumentLock) {
    lock = LockService.getDocumentLock();
    if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận. Vui lòng thử lại!'); }
  }
  try {
    ['Customer', 'Activity'].forEach(function (sheetName) {
      var sheet = book.getSheetByName(sheetName), expected = columnsForSheet(sheetName);
      if (!sheet || !expected.length) { return; }
      var map = readColumnMap(sheetName), missing = expected.filter(function (item) { return !map.map[item[0]]; });
      if (!missing.length) { return; }
      var header = sheetEnsureHeader(sheet, expected, 2);
      var start = header.width - header.appended.length + 1;
      sheet.getRange(1, start, 1, missing.length).setFontWeight('bold');
      sheet.getRange(SHEET_FIRST_DATA_ROW, start, Math.max(1, sheet.getMaxRows() - SHEET_FIRST_DATA_ROW + 1), missing.length).setNumberFormat('@');
      changed = true;
      report.push(sheetName + ': thêm ' + missing.length + ' cột');
    });
    if (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.flush) { SpreadsheetApp.flush(); }
    if (changed) {
      commit = writeCommitAfterSuccess({
        source: source === 'background' ? 'background' : (source || 'pull'),
        surface: 'schema',
        schema: true,
        viewSheetNames: typeof shinViewSheetNames === 'function' ? shinViewSheetNames(book) : [],
        render: false
      });
    }
  } finally {
    if (lock) { lock.releaseLock(); }
  }

  var reload = commit && commit.reloadDecision;
  var viewRender = commit ? writeCommitRender(commit) : null;
  return { ok: true, changed: changed, report: report, reload: reload, viewRender: viewRender, dirty: commit && commit.dirty };
}
