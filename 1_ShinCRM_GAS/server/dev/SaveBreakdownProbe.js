/** Probe DEV tách một lần lưu khách từ Sidebar (`saveRecord`) thành từng đoạn, để biết 1,5–3,2 giây nằm ở đâu trước khi sửa V4, V7, V27. Sửa ghi chú của khách đầu tiên rồi trả lại giá trị cũ trên Sheet DEV. */

/** Bọc tạm các hàm toàn cục để cộng dồn thời gian và số lần gọi; trả hàm gỡ bọc. Hàm lồng nhau thì thời gian của hàm ngoài đã gồm hàm trong. */
function saveBreakdownProbeWrap(names, times) {
  var global = Function('return this')();
  var originals = {};
  names.forEach(function (name) {
    var path = name.split('.');
    var owner = path.length > 1 ? global[path[0]] : global;
    var key = path[path.length - 1];
    if (!owner || typeof owner[key] !== 'function') { return; }
    originals[name] = { owner: owner, key: key, fn: owner[key] };
    owner[key] = function () {
      var started = Date.now();
      try { return originals[name].fn.apply(this, arguments); } finally {
        var slot = times[name] || (times[name] = { ms: 0, n: 0 });
        slot.ms += Date.now() - started;
        slot.n += 1;
      }
    };
  });
  return function () { Object.keys(originals).forEach(function (name) { originals[name].owner[originals[name].key] = originals[name].fn; }); };
}

var SAVE_BREAKDOWN_PROBE_PARTS = [
  'saveRecord',
  'FbmSync.withOrchestrationLock', 'fbmSyncSaveAllowed',
  'documentLockRun', 'documentLockSettle',
  'entityReadContext', 'writeGateRowById', 'writeGateSelectCatalog', 'writeGateUniqueCheck', 'idGateIssue',
  'writeGateRowSnapshot', 'writeGateWriteNew', 'writeGateWriteExisting', 'writeGateReadBack', 'logEvent',
  'dirtyStateBasketFlush', 'reloadStateRead'
];

function measureSaveBreakdown() {
  var out = [];
  var book = shinOpenBook();
  var sheet = book.getSheetByName(ENTITY_SHEETS.customer);
  var id = String(sheet.getRange(SHEET_FIRST_DATA_ROW, selectionColumnIndex(sheet, DATA_SCHEMA.customer.id.code)).getValue());
  var noteCol = selectionColumnIndex(sheet, DATA_SCHEMA.customer.note.code);
  var original = sheet.getRange(SHEET_FIRST_DATA_ROW, noteCol).getDisplayValue();
  out.push('Khách thử: ' + id + ', ghi chú gốc dài ' + original.length + ' ký tự');
  try {
    for (var round = 1; round <= 3; round++) {
      var times = {};
      var counter = {};
      var restoreStore = reloadJournalProbeCountStore(counter);
      var restore = saveBreakdownProbeWrap(SAVE_BREAKDOWN_PROBE_PARTS, times);
      var result;
      try { result = saveRecord('customer', { id: id, note: original + ' [đo ' + round + ']' }); } finally { restore(); restoreStore(); }
      var line = Object.keys(times).map(function (name) { return name + ' ' + times[name].ms + (times[name].n > 1 ? '×' + times[name].n : ''); }).join(', ');
      out.push('Lượt ' + round + ' (' + (result && result.ok ? 'đạt' : 'KHÔNG ĐẠT ' + JSON.stringify(result)) + '): ' + line + ' · lệnh kho ' + JSON.stringify(counter));
    }
    var context = entityReadContext('customer');
    var started = Date.now();
    writeGateRowById(context);
    var rowByIdMs = Date.now() - started;
    started = Date.now();
    var max = idGateMaxOnSheet(context);
    out.push('Cấp mã trên cùng bối cảnh (' + context.rowCount + ' dòng): tìm dòng theo mã ' + rowByIdMs + ' ms, rồi lưới an toàn idGateMaxOnSheet ' + (Date.now() - started) + ' ms, max ' + max);
  } finally {
    saveRecord('customer', { id: id, note: original });
    out.push('Đã trả ghi chú gốc: ' + (sheet.getRange(SHEET_FIRST_DATA_ROW, noteCol).getDisplayValue() === original));
  }
  return out;
}
