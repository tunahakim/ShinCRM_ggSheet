/** Probe DEV tách lượt vẽ sheet quản trị thành từng đoạn: vẽ một sheet (V12) và "Làm mới tất cả" (V13). Chạy trong một lần gọi như đường thật (bản đọc kho và bản đọc Sheet chung đang mở). */

var VIEW_RENDER_PROBE_PARTS = [
  'documentLockRun', 'viewInputSignature', 'viewRenderSheetLocked', 'configReadAll', 'entityReadContext', 'viewReadEntity', 'viewLatestActivity',
  'viewReadSortPairs', 'viewHeaderRow', 'viewSortRows', 'viewAssertNoFormulas', 'viewKeepFilterRowText', 'viewClearErrorNotes',
  'sheetGridReadBlock', 'viewLedgerEntry', 'viewLedgerWrite', 'viewTabColorSync', 'reloadStateRead', 'filterCellMatches'
];

function measureViewRender() {
  var out = [];
  var names = shinViewSheetNames(shinOpenBook());
  out.push('Sheet quản trị trên DEV: ' + names.length + ' (' + names.join(', ') + ')');
  if (!names.length) { return out; }
  var job = function (label, run) {
    for (var round = 1; round <= 2; round++) {
      var times = {};
      var restore = saveBreakdownProbeWrap(VIEW_RENDER_PROBE_PARTS, times);
      var started = Date.now();
      var result;
      documentStoreBegin();
      try { result = run(); } finally { documentStoreEnd(); restore(); }
      var line = Object.keys(times).map(function (name) { return name + ' ' + times[name].ms + (times[name].n > 1 ? '×' + times[name].n : ''); }).join(', ');
      out.push(label + ' lượt ' + round + ' (' + (result && result.ok ? 'đạt' : 'KHÔNG ĐẠT ' + String(result && (result.error || JSON.stringify(result.failed))).slice(0, 200)) + ', ' + (Date.now() - started) + ' ms' + (result && result.rows !== undefined ? ', ' + result.rows + ' dòng' : '') + '): ' + line);
    }
  };
  job('Vẽ "' + names[0] + '"', function () { return renderViewSheet(names[0]); });
  job('Làm mới tất cả', function () { return renderAllManagedViews(); });

  // Thêm hai sheet quản trị thử (tên riêng, xóa trong lượt) để đo "Làm mới tất cả" với nhiều sheet.
  var book = shinOpenBook();
  var probeNames = ['!__CRM_VIEW_PROBE_2', '!__CRM_VIEW_PROBE_3'];
  probeNames.forEach(function (name) { if (book.getSheetByName(name)) { throw new Error('Đã có sheet ' + name + ', không tự xóa.'); } });
  var created = [];
  try {
    probeNames.forEach(function (name) {
      var sheet = book.insertSheet(name);
      created.push(sheet);
      sheet.getRange(1, 1, 1, 5).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']]);
      sheet.getRange(4, 4, 1, 2).setValues([['@CUS_TEN_CTY', 'Tăng dần (A → Z)']]);
    });
    SpreadsheetApp.flush();
    job('Làm mới tất cả 3 sheet', function () { return renderAllManagedViews([names[0]].concat(probeNames)); });
  } finally {
    created.forEach(function (sheet) { book.deleteSheet(sheet); });
    viewRenderProbeForgetLedger(probeNames);
  }
  return out;
}

/** Sổ vẽ không tự bỏ mục của sheet đã xóa, nên probe tự dọn mục của sheet thử. */
function viewRenderProbeForgetLedger(names) {
  documentLockRun(function () {
    var map = viewLedgerRead();
    names.forEach(function (name) { delete map[name]; });
    documentProps().setProperty(VIEW_LEDGER_KEY, JSON.stringify(map));
  });
  return Object.keys(viewLedgerRead());
}

function measureViewRenderCleanup() { return viewRenderProbeForgetLedger(['!__CRM_VIEW_PROBE_2', '!__CRM_VIEW_PROBE_3']); }
