/** Probe DEV tách lượt vẽ một sheet quản trị thành từng đoạn. Chạy trong một lần gọi như đường thật (bản đọc kho và tờ nháp đang mở). */

var VIEW_RENDER_PROBE_PARTS = [
  'documentLockRun', 'viewRenderSheetLocked', 'viewControls', 'configReadAll', 'entityReadContext', 'viewRenderPlan', 'viewFormulaProblem',
  'viewReadEntity', 'viewLatestActivity', 'viewSortRows', 'viewKeepFilterRowText', 'viewWriteRows',
  'sheetGridReadBlock', 'sheetReadRows', 'sheetReadFormulas', 'sheetCellsWrite', 'viewLedgerEntry', 'viewLedgerWrite', 'viewTabColorSync', 'reloadStateRead', 'filterCellMatches'
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
