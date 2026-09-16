// Apps Script does not guarantee file evaluation order; preserve modules already loaded.
var FbmSync = (typeof FbmSync === 'undefined' || !FbmSync) ? {} : FbmSync;

/** Cột metadata riêng của đồng bộ; lõi chỉ nhận DATA_SCHEMA, không đọc ngược SYNC_SCHEMA. */

/** Cột sync đặt sau cột lõi; Activity giữ ít cột vì mã khách là khóa tra cứu. */
var SYNC_SCHEMA = {

  customer: {
    fbmId: { code: '@CUS_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmCustomerCode: { code: '@CUS_MA_KH_FBM', type: 'TEXT', label: 'Mã khách FBM' },
    fbmHash: { code: '@CUS_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@CUS_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' },
    syncedAt: { code: '@CUS_SYNC_LUC', type: 'DATE', label: 'Đồng bộ lúc', precision: 'minute' }
  },

  activity: {
    fbmId: { code: '@ACT_FBM_ID', type: 'TEXT', label: 'FBM ID' },
    fbmHash: { code: '@ACT_HASH_FBM', type: 'TEXT', label: 'Dấu vân FBM' },
    syncStatus: { code: '@ACT_SYNC_TT', type: 'TEXT', label: 'Tình trạng đồng bộ' }
  }

};

/** Trả danh sách cột sync theo tên sheet, giữ đúng thứ tự hiển thị. */
function syncColumnsForSheet(sheetName) {
  var entity = { Customer: 'customer', Activity: 'activity' }[sheetName];
  if (!entity) { return []; }

  var fields = SYNC_SCHEMA[entity];
  return Object.keys(fields).map(function (fieldName) {
    return [fields[fieldName].code, fields[fieldName].label];
  });
}

/** Tự bổ sung cột sync còn thiếu; không đụng dữ liệu hoặc thứ tự cột lõi. */
function fbmEnsureSyncColumns(source) {
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
      var sheet = book.getSheetByName(sheetName), expected = syncColumnsForSheet(sheetName);
      if (!sheet || !expected.length) { return; }
      var map = readColumnMap(sheetName), missing = expected.filter(function (item) { return !map.map[item[0]]; });
      if (!missing.length) { return; }
      var start = map.lastColumn + 1;
      if (sheet.getMaxColumns() < start + missing.length - 1) { sheet.insertColumnsAfter(sheet.getMaxColumns(), start + missing.length - 1 - sheet.getMaxColumns()); }
      sheet.getRange(1, start, 2, missing.length).setValues([
        missing.map(function (item) { return item[0]; }),
        missing.map(function (item) { return item[1]; })
      ]);
      sheet.getRange(1, start, 1, missing.length).setFontWeight('bold');
      sheet.getRange(SHEET_FIRST_DATA_ROW, start, Math.max(1, sheet.getMaxRows() - SHEET_FIRST_DATA_ROW + 1), missing.length).setNumberFormat('@');
      changed = true;
      report.push(sheetName + ': thêm ' + missing.length + ' cột sync');
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
