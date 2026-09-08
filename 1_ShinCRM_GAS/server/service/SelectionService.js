/**
 * `SelectionService` — hai đường tra nguồn chọn qua tọa độ, cho vòng dò khi không có Extension.
 *
 * Hai đường cùng một câu hỏi, khác mức trả lời:
 *   - `probeSelectionCheap` — chỉ cần tọa độ: sheet, ô đang chọn, row/col.
 *   - `probeSelectionFull` — thêm tra mã khách tại hàng đó (qua bản đồ dòng).
 *
 * Chung tiền đề: ô mỏng của `Range.getRow/getColumn` rẻ hơn ô dày của việc đọc cả hàng.
 * Vòng dò gọi cheap trước, có hàng thật mới gọi full.
 */

function selectionProbeCore() {
  // Mở tệp bằng `shinOpenBook` chứ không lấy tệp đang hoạt động: vòng dò chạy trong lượt thực thi riêng,
  // ở đó không có "tệp đang hoạt động" nào cả, và cửa vào này phải chỉ vào đúng tệp đã khai.
  var book = shinOpenBook();
  var sheet = book.getActiveSheet();
  return {
    spreadsheetId: book.getId(),
    gid: String(sheet.getSheetId()),
    sheetName: sheet.getName(),
    range: sheet.getActiveRange()
  };
}

/** Tọa độ ô đang chọn — rẻ, không đọc giá trị. */
function probeSelectionCheap() {
  return runEntryPoint('probeSelectionCheap', 'sidebar', 'throw', function () {
    var core = selectionProbeCore();
    var r = core.range;

    return {
      ok: true,
      spreadsheetId: core.spreadsheetId,
      gid: core.gid,
      sheetName: core.sheetName,
      cellRef: r ? r.getA1Notation() : '',
      row: r ? r.getRow() : 0,
      col: r ? r.getColumn() : 0,
      rowEnd: r ? r.getLastRow() : 0,
      colEnd: r ? r.getLastColumn() : 0,
      selectionKind: 'range',
      dirty: dirtyStateRead(),
      ms: 0
    };
  });
}

/** Tọa độ kèm mã khách tại hàng đang chọn — nhờ bản đồ dòng của máy chủ. */
function probeSelectionFull() {
  return runEntryPoint('probeSelectionFull', 'sidebar', 'throw', function () {
    var cheap = probeSelectionCheap();
    var map = {};
    try { map = loadRowMap(entityReadAll('customer')); } catch (e) { map = {}; }
    var customerId = (cheap.row && cheap.sheetName) ? String(map[String(cheap.row)] || '') : '';

    return {
      ok: cheap.ok,
      spreadsheetId: cheap.spreadsheetId,
      gid: cheap.gid,
      sheetName: cheap.sheetName,
      cellRef: cheap.cellRef,
      row: cheap.row,
      col: cheap.col,
      rowEnd: cheap.rowEnd,
      colEnd: cheap.colEnd,
      customerId: customerId,
      dirty: cheap.dirty,
      ms: cheap.ms
    };
  });
}

/** Nghiệm thu trên Google: đứng ở hàng khách thì ra mã, đứng ở hàng 2 thì rỗng. */
function viewProbeSelection() {
  return runEntryPoint('viewProbeSelection', 'sidebar', 'throw', function () {
    var cheap = probeSelectionCheap();
    var full = probeSelectionFull();
    var report = [];
    report.push('cheap: row=' + cheap.row + ' col=' + cheap.col + ' sheet="' + cheap.sheetName + '" cellRef="' + cheap.cellRef + '"');
    report.push('full: customerId="' + full.customerId + '"');
    report.push('spreadsheetId: ' + cheap.spreadsheetId);
    report.push('dirty: ' + JSON.stringify(cheap.dirty));
    return report;
  });
}
