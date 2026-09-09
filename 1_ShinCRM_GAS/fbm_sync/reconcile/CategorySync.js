/** Nhập danh mục FBM vào Category trước khi ghi Customer/Activity. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuyển một cặp mã/tên FBM thành giá trị companion có thể đọc lại. */
FbmSync.categoryCompanionText = function (code, name, primary) {
  return String(code || '').trim() + '. ' + String(name || code || '').trim() + (primary ? ' #' : '');
};

/** Tìm mã FBM trong một ô companion, không phá các mã người dùng đã ghép. */
FbmSync.categoryCellHasCode = function (cell, code) {
  return FbmSync.parseCategoryCell(cell).some(function (item) { return item.code === String(code || '').trim(); });
};

/** Ghi vết mã và tên lookup để kiểm tra Category sau mỗi lần nhập. */
FbmSync.logCategoryImport = function (item) {
  if (!item || typeof logEvent !== 'function') { return; }
  logEvent({ source: 'fbm_sync', action: 'category_import', outcome: item.changed ? LOG_OK : LOG_TRACE, entity: 'category', recordId: item.code, reason: (item.changed ? 'Đã cập nhật' : 'Đã kiểm tra') + ' danh mục ' + item.source, detail: { source: item.source, code: item.code, fbmName: item.fbmName, sheetName: item.sheetName, sheetCompanion: item.sheetCompanion } });
};

/** Nhập lookup vào Category; chỉ bổ sung, không xóa hoặc đổi giá trị đã có. */
FbmSync.importLookupCategories = function (state) {
  if (!state || state.mode !== 'write') { return { written: 0, added: 0, warnings: [] }; }
  if (typeof shinOpenSheet !== 'function' || typeof CATEGORY_COLUMNS === 'undefined') { return { written: 0, added: 0, warnings: ['Không có môi trường Sheet để ghi Category.'] }; }

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận khi cập nhật Category. Vui lòng thử lại.'); }
  try {
    var sheet = shinOpenSheet('Category'), columns = readColumnMap('Category');
    var firstRow = SHEET_FIRST_DATA_ROW, rowCount = sheetGridDataRowCount(sheet, firstRow), data = {}, changed = {}, warnings = [], added = 0, logItems = [];
    var lookups = state.session && state.session.lookups || {};

    FbmSync.SYNC_LOOKUPS.forEach(function (lookup) {
      var companionCode = lookup.key + CATEGORY_FBM_SUFFIX;
      var sourceAt = columnIndex(columns, lookup.key) - 1, companionAt = columnIndex(columns, companionCode) - 1;
      if (!data[lookup.key]) { data[lookup.key] = rowCount ? sheet.getRange(firstRow, sourceAt + 1, rowCount, 1).getValues().map(function (row) { return String(row[0] || '').trim(); }) : []; }
      if (!data[companionCode]) { data[companionCode] = rowCount ? sheet.getRange(firstRow, companionAt + 1, rowCount, 1).getValues().map(function (row) { return String(row[0] || '').trim(); }) : []; }
      var pairs = FbmSync.lookupPairs(lookups[lookup.key]), codes = Object.keys(pairs);
      codes.forEach(function (code) {
        var name = String(pairs[code] || code).trim(), sourceIndex = data[lookup.key].indexOf(name), foundIndex = -1;
        data[lookup.key].some(function (value, index) {
          if (FbmSync.categoryCellHasCode(data[companionCode][index] || '', code)) { foundIndex = index; return true; }
          return false;
        });
        if (foundIndex >= 0) {
          if (data[lookup.key][foundIndex] !== name) { data[lookup.key][foundIndex] = name; changed[lookup.key] = true; }
          var liveExisting = FbmSync.mergeLiveCategoryCell(data[companionCode][foundIndex] || '', code, name);
          if (liveExisting !== data[companionCode][foundIndex]) { data[companionCode][foundIndex] = liveExisting; changed[companionCode] = true; }
          logItems.push({ source: lookup.key, code: code, fbmName: name, sheetName: data[lookup.key][foundIndex], sheetCompanion: data[companionCode][foundIndex], changed: true });
          return;
        }
        var target = sourceIndex >= 0 ? sourceIndex : data[lookup.key].length;
        while (data[lookup.key].length <= target) { data[lookup.key].push(''); data[companionCode].push(''); }
        if (!data[lookup.key][target]) { data[lookup.key][target] = name; changed[lookup.key] = true; }
        var current = data[companionCode][target] || '';
        data[companionCode][target] = FbmSync.mergeLiveCategoryCell(current, code, name);
        if (data[companionCode][target] !== current) { changed[companionCode] = true; added += 1; }
        logItems.push({ source: lookup.key, code: code, fbmName: name, sheetName: data[lookup.key][target], sheetCompanion: data[companionCode][target], changed: data[companionCode][target] !== current });
      });
    });

    var keys = Object.keys(data), finalRows = 0;
    keys.forEach(function (code) { finalRows = Math.max(finalRows, data[code].length); });
    if (!finalRows) { return { written: 0, added: 0, warnings: warnings }; }
    var written = typeof sheetWriteColumns === 'function' ? sheetWriteColumns(sheet, columns, firstRow, finalRows, data, changed) : { ok: false, written: 0, reason: 'Thiếu cổng ghi Category.' };
    if (!written.ok) { warnings.push(written.reason); return { written: 0, added: added, warnings: warnings }; }
    logItems.forEach(FbmSync.logCategoryImport);
    if (typeof flushLog === 'function') { flushLog(); }
    return { written: written.written, added: added, warnings: warnings, items: logItems };
  } finally {
    lock.releaseLock();
  }
};
