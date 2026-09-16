/** Probe DEV cho renderer sheet quản trị; tạo và xóa một sheet tên độc quyền trong cùng lượt. */

var VIEW_PROBE_SHEET_NAME = '!__CRM_VIEW_PROBE';
var WRITE_RENDER_PROBE_SHEET_NAME = '!__CRM_WRITE_RENDER_PROBE';

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
    return [
      'Sheet probe: ' + VIEW_PROBE_SHEET_NAME,
      'Số dòng renderer ghi: ' + result.rows,
      'Mẫu 5 dòng đầu: ' + JSON.stringify(sample),
      'Trạng thái bẩn sau render: ' + JSON.stringify(dirtyStateRead())
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
    var after = shinOnEdit({ range: sheet.getRange(3, 1) });
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

/**
 * Nghiệm thu cổng ghi tự vẽ view khi Sidebar đóng. Probe tạo một view và hai
 * bản ghi tạm, kiểm tra sau từng lần ghi rồi dọn bằng chính các cửa xóa; nếu
 * dọn lỗi thì giữ view để người kiểm tra thấy trạng thái cần xử lý.
 */
function viewProbeWriteRenderWithoutSidebar() {
  var book = shinOpenBook();
  if (book.getSheetByName(WRITE_RENDER_PROBE_SHEET_NAME)) {
    throw new Error('Đã có sheet ' + WRITE_RENDER_PROBE_SHEET_NAME + '. Không tự xóa probe cũ để tránh che dữ liệu chưa dọn.');
  }

  var prefs = typeof userPrefsRead === 'function' ? userPrefsRead() : { autoRenderView: true };
  if (prefs.autoRenderView === false) {
    throw new Error('autoRenderView đang tắt. Bật công tắc rồi chạy lại probe để kiểm đường tự vẽ.');
  }

  var sheet = book.insertSheet(WRITE_RENDER_PROBE_SHEET_NAME);
  var customerId = '';
  var activityId = '';
  var cleanupErrors = [];
  var report = [];
  var stamp = String(Date.now()).slice(-7);

  try {
    sheet.getRange(1, 1, 1, 3).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY', '@ACT_NGAY_LAM_VIEC']]);
    var before = renderViewSheet(WRITE_RENDER_PROBE_SHEET_NAME);
    report.push('Trước ghi: ' + before.rows + ' dòng');

    var customer = writeGateSave({
      entity: 'customer',
      source: 'background',
      records: [{ companyName: 'DEV probe ' + stamp, taxNumber: '999' + stamp }]
    });
    if (!customer.ok || !customer.recordIds || !customer.recordIds.length) {
      throw new Error('Ghi Customer probe không thành công: ' + JSON.stringify(customer));
    }
    customerId = String(customer.recordIds[0] || '').trim();
    var viewRowCount = Math.max(0, sheet.getLastRow() - SHEET_FIRST_DATA_ROW + 1);
    var customerViewRows = viewRowCount ? sheet.getRange(SHEET_FIRST_DATA_ROW, 1, viewRowCount, 3).getValues() : [];
    var customerViewIndex = -1;
    for (var customerAt = 0; customerAt < customerViewRows.length; customerAt++) {
      if (String(customerViewRows[customerAt][0] || '').trim() === customerId) { customerViewIndex = customerAt; break; }
    }
    var customerViewId = customerViewIndex >= 0 ? String(customerViewRows[customerViewIndex][0] || '').trim() : '';
    report.push('Sau ghi Customer: mã trên view = ' + customerViewId + ', khớp = ' + (customerViewId === customerId));
    if (customerViewId !== customerId) {
      var customerRender = customer.viewRender || {};
      throw new Error('View không được cập nhật sau ghi Customer. Kết quả renderer: ' + JSON.stringify({ ok: customerRender.ok, skipped: customerRender.skipped, rendered: customerRender.rendered && customerRender.rendered.length, failed: customerRender.failed && customerRender.failed.map(function (item) { return item.sheetName + ': ' + item.error; }) }));
    }

    var activity = writeGateSave({
      entity: 'activity',
      source: 'background',
      records: [{ customerId: customerId, workDate: '2026-09-16', taskType: 'DEV probe', content: 'DEV probe', product: 'DEV probe', allowFbmPush: 'DEV probe' }]
    });
    if (!activity.ok || !activity.recordIds || !activity.recordIds.length) {
      throw new Error('Ghi Activity probe không thành công: ' + JSON.stringify(activity));
    }
    activityId = String(activity.recordIds[0] || '').trim();
    viewRowCount = Math.max(0, sheet.getLastRow() - SHEET_FIRST_DATA_ROW + 1);
    var activityViewRows = viewRowCount ? sheet.getRange(SHEET_FIRST_DATA_ROW, 1, viewRowCount, 3).getValues() : [];
    var activityViewIndex = -1;
    for (var activityAt = 0; activityAt < activityViewRows.length; activityAt++) {
      if (String(activityViewRows[activityAt][0] || '').trim() === customerId) { activityViewIndex = activityAt; break; }
    }
    var activityDate = activityViewIndex >= 0 ? String(activityViewRows[activityViewIndex][2] || '').trim() : '';
    report.push('Sau ghi Activity: ngày trên view không rỗng = ' + (activityDate !== ''));
    if (!activityDate) { throw new Error('View không được cập nhật sau ghi Activity.'); }

    report.push('Không cần Sidebar: WriteGate đã gọi renderer sau cả hai lần ghi.');
    return report;
  } finally {
    if (activityId) {
      try { deleteGateRemove({ entity: 'activity', ids: [activityId] }); }
      catch (error) { cleanupErrors.push('Activity ' + errorMessage(error)); }
    }
    if (customerId) {
      try { deleteGateRemove({ entity: 'customer', ids: [customerId] }); }
      catch (error) { cleanupErrors.push('Customer ' + errorMessage(error)); }
    }
    if (!cleanupErrors.length) {
      try { book.deleteSheet(sheet); }
      catch (error) { cleanupErrors.push('view probe ' + errorMessage(error)); }
    }
    if (cleanupErrors.length) {
      throw new Error('Probe không dọn sạch được: ' + cleanupErrors.join('; ') + '. Giữ sheet ' + WRITE_RENDER_PROBE_SHEET_NAME + ' để xử lý thủ công.');
    }
  }
}
