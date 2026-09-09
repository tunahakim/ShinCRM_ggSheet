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

/** Nhập lookup vào Category; chỉ bổ sung, không xóa hoặc đổi giá trị đã có. */
FbmSync.importLookupCategories = function (state) {
  if (!state || state.mode !== 'write') { return { written: 0, added: 0, warnings: [] }; }
  if (typeof shinOpenSheet !== 'function' || typeof CATEGORY_COLUMNS === 'undefined') { return { written: 0, added: 0, warnings: ['Không có môi trường Sheet để ghi Category.'] }; }

  var lock = LockService.getDocumentLock();
  if (!lock.tryLock(SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận khi cập nhật Category. Vui lòng thử lại.'); }
  try {
    var sheet = shinOpenSheet('Category'), columns = readColumnMap('Category');
    var firstRow = SHEET_FIRST_DATA_ROW, rowCount = sheetGridDataRowCount(sheet, firstRow), data = {}, changed = {}, warnings = [], added = 0;
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
          if (!data[lookup.key][foundIndex]) { data[lookup.key][foundIndex] = name; changed[lookup.key] = true; }
          return;
        }
        var target = sourceIndex >= 0 ? sourceIndex : data[lookup.key].length;
        while (data[lookup.key].length <= target) { data[lookup.key].push(''); data[companionCode].push(''); }
        if (!data[lookup.key][target]) { data[lookup.key][target] = name; changed[lookup.key] = true; }
        var current = data[companionCode][target] || '';
        if (current) {
          data[companionCode][target] = current + ' | ' + FbmSync.categoryCompanionText(code, name, false);
          changed[companionCode] = true; added += 1;
          return;
        }
        data[companionCode][target] = FbmSync.categoryCompanionText(code, name, true);
        changed[companionCode] = true; added += 1;
      });
    });

    var keys = Object.keys(data), finalRows = 0;
    keys.forEach(function (code) { finalRows = Math.max(finalRows, data[code].length); });
    if (!finalRows) { return { written: 0, added: 0, warnings: warnings }; }
    sheetGridEnsureRoom(sheet, firstRow + finalRows - 1, 0);
    Object.keys(changed).forEach(function (code) {
      var col = columnIndex(columns, code), values = data[code].slice();
      while (values.length < finalRows) { values.push(''); }
      sheet.getRange(firstRow, col, finalRows, 1).setValues(values.map(function (value) { return [value]; }));
      sheet.getRange(firstRow, col, finalRows, 1).setNumberFormat('@');
    });
    SpreadsheetApp.flush();
    return { written: Object.keys(changed).length, added: added, warnings: warnings };
  } finally {
    lock.releaseLock();
  }
};
