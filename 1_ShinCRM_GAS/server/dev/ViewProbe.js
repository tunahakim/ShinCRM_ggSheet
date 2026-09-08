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
    dirtyStateMarkViewSheet(VIEW_PROBE_SHEET_NAME);

    var result = renderViewSheet(VIEW_PROBE_SHEET_NAME);
    SpreadsheetApp.flush();
    var sample = result.rows ? sheet.getRange(4, 1, Math.min(result.rows, 5), 3).getValues() : [];
    var rowMap = result.rowMaps[VIEW_PROBE_SHEET_NAME] || {};
    return [
      'Sheet probe: ' + VIEW_PROBE_SHEET_NAME,
      'Số dòng renderer ghi: ' + result.rows,
      'Số khóa rowMap: ' + Object.keys(rowMap).length,
      'Mẫu 5 dòng đầu: ' + JSON.stringify(sample),
      'Trạng thái bẩn sau render: ' + JSON.stringify(dirtyStateRead())
    ];
  } finally {
    book.deleteSheet(sheet);
  }
}
