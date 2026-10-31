/**
 * Hàm dò DEV cho nạp lại cùng response: đánh dấu một mã Customer có sẵn rồi hỏi như Sidebar. Không ghi ô nào; trả lại thuộc tính tài liệu trước khi về.
 */

/** Kiểm chứng R11 trên dữ liệu DEV đang có, không ghi hay sửa bất kỳ ô nào. */
function reloadPayloadProbe() {
  var propKeys = reloadProbePropKeys();
  var snapshot = reloadProbeSnapshotProperties(propKeys);
  var report = [];
  try {
    var context = entityReadContext('customer');
    var keys = entityReadFieldBlock(context, SHEET_FIRST_DATA_ROW, context.rowCount, ['id']);
    var id = keys.length ? String(keys[0][0] || '').trim() : '';
    if (!id) { throw new Error('DEV không có mã Customer để kiểm payload.'); }

    dirtyStateMarkSignal({ customer: [id], allViews: false });
    var observed = recordChangesAfterWrite().revision;
    var ready = probeSelectionAndReload({ requestId: 'dev-r11-ready', previousCustomerId: '', lastSeenRevision: observed - 1 });
    var parts = ready.payload ? ready.payload.parts : [];
    reloadProbeAssert(report, 'R11 DEV lời hỏi ngay sau thay đổi trả payload cùng response', parts.length === 1 && parts[0].mode === 'records' && ready.processedRevision === observed, JSON.stringify({ modes: parts.map(function (part) { return part.mode; }), processedRevision: ready.processedRevision, observed: observed }));
    report.push('R11 DEV hoàn tất: GAS tự quyết định nạp và trả payload trong cùng request.');
    return report;
  } finally {
    reloadProbeRestoreProperties(snapshot);
  }
}
