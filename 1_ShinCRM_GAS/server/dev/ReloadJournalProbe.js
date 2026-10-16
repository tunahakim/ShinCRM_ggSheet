/** Probe DEV đo chi phí tín hiệu nạp lại và các mức nạp, để có số trước/sau khi đổi cờ bẩn sang sổ nhật ký. Tăng revision thật trên Sheet DEV. */

/** Bọc kho DocumentProperties thật để đếm lệnh gửi đi; trả hàm gỡ bọc. */
function reloadJournalProbeCountStore(counter) {
  var original = documentStoreReal;
  documentStoreReal = function () {
    var real = original();
    var wrap = {};
    ['getProperty', 'getProperties', 'setProperty', 'setProperties', 'deleteProperty'].forEach(function (method) {
      wrap[method] = function () {
        counter[method] = (counter[method] || 0) + 1;
        return real[method].apply(real, arguments);
      };
    });
    return wrap;
  };
  return function () { documentStoreReal = original; };
}

function reloadJournalProbeMeasure(out, label, fn) {
  var counter = {};
  var restore = reloadJournalProbeCountStore(counter);
  var started = Date.now();
  try { fn(); } finally { restore(); }
  out.push(label + ': ' + (Date.now() - started) + ' ms, lệnh kho ' + JSON.stringify(counter));
}

function measureReloadJournalBaseline() {
  var out = [];
  var book = shinOpenBook();
  var firstId = function (entity) {
    var sheet = book.getSheetByName(ENTITY_SHEETS[entity]);
    var column = selectionColumnIndex(sheet, DATA_SCHEMA[entity].id.code);
    return String(sheet.getRange(SHEET_FIRST_DATA_ROW, column).getValue());
  };
  var customerId = firstId('customer');
  out.push('Mã thử: ' + customerId);
  reloadJournalProbeMeasure(out, 'Ghi nhận tín hiệu một khách', function () {
    dirtyStateMarkSignal({ customer: [customerId], allViews: true, fromSidebar: true });
    recordChangesAfterWrite();
  });
  reloadJournalProbeMeasure(out, 'Ghi nhận tín hiệu một khách lần 2', function () {
    dirtyStateMarkSignal({ customer: [customerId], allViews: true, fromSidebar: true });
    recordChangesAfterWrite();
  });
  var journal = reloadJournalRead();
  out.push('Sổ: revision ' + journal.rev + ', floor ' + journal.floor + ', ' + journal.entries.length + ' dòng, ' + JSON.stringify(journal).length + ' ký tự');
  reloadJournalProbeMeasure(out, 'reloadRecords một khách', function () { reloadRecords([customerId], { internal: true }); });
  reloadJournalProbeMeasure(out, 'reloadEntityAll customer', function () { reloadEntityAll('customer'); });
  reloadJournalProbeMeasure(out, 'reloadCategory', function () { reloadCategory({ internal: true }); });
  reloadJournalProbeMeasure(out, 'reloadConfig', function () { reloadConfig({ internal: true }); });
  reloadJournalProbeMeasure(out, 'loadCore', function () { loadCore({ internal: true }); });
  reloadJournalProbeMeasure(out, 'Lời hỏi nạp một khách (kế hoạch từng phần)', function () { probeSelectionAndReload({ lastSeenRevision: journal.rev - 1, skipPosition: true }); });
  return out;
}

/** Tách bước ghi nhận thay đổi thành từng đoạn (tính sheet đang mới, ghi sổ, tô tab, phần cầm–flush–gửi kho–nhả của người giữ khóa) để biết lần cầm khóa thứ hai của lượt lưu (V26) và số lệnh kho (V6). Tăng revision thật trên Sheet DEV. */
function measureBasketFlushBreakdown() {
  var out = [];
  for (var round = 1; round <= 3; round++) {
    var counter = {};
    var restore = reloadJournalProbeCountStore(counter);
    var times = {};
    var mark = function (label, fn) { var started = Date.now(); var value = fn(); times[label] = Date.now() - started; return value; };
    try {
      var flushMark = dirtyStateBlankMark();
      flushMark.customer = ['DEV-FLUSH-' + round];
      flushMark.allViews = true;
      flushMark.fromSidebar = true;
      var inside = 0;
      mark('cả lượt trong người giữ khóa', function () {
        return documentLockRun(function () {
          var started = Date.now();
          var turningStale = mark('tính sheet đang mới từ sổ vẽ view', function () { return viewLedgerFreshNames(); });
          mark('ghi sổ (kèm nạp lại kho)', function () { return reloadJournalAppend(flushMark); });
          mark('tô tab (' + turningStale.length + ' sheet vừa thành cũ)', function () { return viewTabColorSyncNames(turningStale, { fromSidebar: true }); });
          inside = Date.now() - started;
        });
      });
      times['cầm + flush + gửi kho + nhả'] = times['cả lượt trong người giữ khóa'] - inside;
    } finally { restore(); }
    out.push('Lượt ' + round + ': ' + JSON.stringify(times) + ' · lệnh kho ' + JSON.stringify(counter));
  }
  return out;
}
