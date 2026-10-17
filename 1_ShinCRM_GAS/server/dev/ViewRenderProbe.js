/** Probe DEV tách lượt vẽ một sheet quản trị thành từng đoạn. Chạy trong một lần gọi như đường thật (bản đọc kho và tờ nháp đang mở). */

var VIEW_RENDER_PROBE_PARTS = [
  'documentLockRun', 'viewRenderSheetLocked', 'viewReadInputs', 'configReadAll', 'entityReadContext', 'viewReadFormulaColumns', 'viewRenderPlan',
  'viewRenderRows', 'viewEntityRows', 'viewWritePlan', 'viewWriteApply',
  'sheetReadBlock', 'sheetReadLastRow', 'sheetGridReadBlock', 'sheetReadRows', 'sheetReadFormulas', 'sheetCellsWrite', 'viewLedgerEntry', 'viewLedgerWrite', 'viewTabColorSync', 'reloadStateRead', 'filterCellMatches'
];

function measureViewRender() {
  var out = [];
  var names = shinViewSheetNames(shinOpenBook());
  out.push('Sheet quản trị trên DEV: ' + names.length + ' (' + names.join(', ') + ')');
  if (!names.length) { return out; }
  for (var round = 1; round <= 3; round++) {
    var times = {};
    var restore = saveBreakdownProbeWrap(VIEW_RENDER_PROBE_PARTS, times);
    var started = Date.now();
    var result;
    documentStoreBegin();
    try { result = renderViewSheet(names[0]); } finally { documentStoreEnd(); restore(); }
    var line = Object.keys(times).map(function (name) { return name + ' ' + times[name].ms + (times[name].n > 1 ? '×' + times[name].n : ''); }).join(', ');
    out.push('Vẽ "' + names[0] + '" lượt ' + round + ' (' + (result && result.ok ? 'đạt' : 'KHÔNG ĐẠT ' + viewProblemsText(result && result.problems).slice(0, 200)) + ', ' + (Date.now() - started) + ' ms' + (result && result.rows !== undefined ? ', ' + result.rows + ' dòng' : '') + '): ' + line);
  }
  return out;
}

/** Probe DEV đo giá từng lệnh Google của tầng 1 trên các sheet bộ vẽ đọc, để chọn kế hoạch đọc ít lệnh nhất. */
function measureSheetReadCalls() {
  var book = shinOpenBook();
  var names = ['Customer', 'Activity', 'Config'].concat(shinViewSheetNames(book).slice(0, 1));
  var out = [];
  function time(label, fn) { var t = Date.now(); var r = fn(); out.push('  ' + label + ' ' + (Date.now() - t) + ' ms' + (r !== undefined ? ' → ' + r : '')); return r; }
  for (var round = 1; round <= 2; round++) {
    out.push('Lượt ' + round);
    names.forEach(function (name) {
      var sheet = book.getSheetByName(name);
      time(name + ' getLastRow', function () { return sheet.getLastRow(); });
      time(name + ' getLastColumn', function () { return sheet.getLastColumn(); });
      time(name + ' getMaxRows', function () { return sheet.getMaxRows(); });
      time(name + ' getMaxColumns', function () { return sheet.getMaxColumns(); });
      time(name + " getRange('1:13')", function () { var v = sheet.getRange('1:13').getValues(); return v.length + '×' + v[0].length; });
      time(name + ' getDataRange().getValues()', function () { var v = sheet.getDataRange().getValues(); return v.length + '×' + (v[0] || []).length; });
      time(name + " getRange('1:5000')", function () { try { return sheet.getRange('1:5000').getValues().length; } catch (e) { return 'ném: ' + e.message; } });
    });
  }
  return out;
}
