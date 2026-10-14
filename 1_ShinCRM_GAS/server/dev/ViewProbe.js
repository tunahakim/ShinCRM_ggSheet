/** Probe DEV cho renderer sheet quản trị; tạo và xóa một sheet tên độc quyền trong cùng lượt. */

var VIEW_PROBE_SHEET_NAME = '!__CRM_VIEW_PROBE';

function viewProbeCreateRender() {
  var book = shinOpenBook();
  if (book.getSheetByName(VIEW_PROBE_SHEET_NAME)) {
    throw new Error('Đã có sheet ' + VIEW_PROBE_SHEET_NAME + '. Không tự xóa sheet probe cũ để tránh chạm dữ liệu ngoài ý muốn.');
  }

  var sheet = book.insertSheet(VIEW_PROBE_SHEET_NAME);
  try {
    sheet.getRange(1, 1, 1, 5).setValues([[
      '@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL'
    ]]);
    sheet.getRange(3, 1, 1, 5).setValues([[ '<>""', '', '', '', '' ]]);
    sheet.getRange(4, 4, 1, 2).setValues([[ '@CUS_TEN_CTY', 'Tăng dần (A → Z)' ]]);

    var result = renderViewSheet(VIEW_PROBE_SHEET_NAME);
    SpreadsheetApp.flush();
    var sample = result.rows ? sheet.getRange(4, 1, Math.min(result.rows, 5), 3).getValues() : [];
    return [
      'Sheet probe: ' + VIEW_PROBE_SHEET_NAME,
      'Số dòng renderer ghi: ' + result.rows,
      'Mẫu 5 dòng đầu: ' + JSON.stringify(sample),
      'Sheet còn cũ sau render: ' + viewIsStale(VIEW_PROBE_SHEET_NAME)
    ];
  } finally {
    book.deleteSheet(sheet);
  }
}

/** Probe đường onEdit trên Google; script tự gọi handler vì thao tác ghi bằng script không phát sinh trigger. */
function viewProbeAutoRender() {
  var book = shinOpenBook();
  if (book.getSheetByName(VIEW_PROBE_SHEET_NAME)) {
    throw new Error('Đã có sheet ' + VIEW_PROBE_SHEET_NAME + '. Không tự xóa sheet probe cũ để tránh chạm dữ liệu ngoài ý muốn.');
  }

  var sheet = book.insertSheet(VIEW_PROBE_SHEET_NAME);
  try {
    sheet.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
    var before = renderViewSheet(VIEW_PROBE_SHEET_NAME);
    var firstId = sheet.getRange(SHEET_FIRST_DATA_ROW, 1).getValue();
    sheet.getRange(3, 1).setValue('"' + firstId + '"');
    var after = shinOnEdit({ range: sheet.getRange(3, 1) }).results[0];
    SpreadsheetApp.flush();
    var firstAfter = sheet.getRange(SHEET_FIRST_DATA_ROW, 1).getValue();
    return [
      'Trước lọc: ' + before.rows + ' dòng',
      'Sau onEdit: ' + after.rows + ' dòng',
      'Mã giữ lại: ' + firstAfter,
      'Đúng một dòng và đúng mã: ' + (after.rows === 1 && String(firstAfter) === String(firstId))
    ];
  } finally {
    book.deleteSheet(sheet);
  }
}


/** In cờ tô cam đã lưu và màu tab thật của từng sheet quản trị, để nghiệm thu tab cam mà không phải nhìn ảnh. */
function viewProbeTabTint() {
  var report = ['viewsStaleRevision: ' + reloadStateRead().viewsStaleRevision + ' · đã vẽ: ' + JSON.stringify(viewRenderedRead()), 'Cờ tô: ' + JSON.stringify(viewTabTintRead())];
  shinOpenBook().getSheets().forEach(function (sheet) {
    if (sheet.getName().charAt(0) !== '!') { return; }
    report.push(sheet.getName() + ' (id ' + sheet.getSheetId() + '): màu tab ' + (sheet.getTabColor() || 'không màu'));
  });
  return report;
}
