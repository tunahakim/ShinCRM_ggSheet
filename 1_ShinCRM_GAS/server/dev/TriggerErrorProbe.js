/**
 * Nghiệm thu DEV: lỗi trong trigger sửa ô phải thành thông báo `entry_failure:shinOnEdit` để Sidebar đang mở hiện ra.
 *
 * Chạy đúng `shinOnEdit` trên ô mã khách đầu tiên của Customer, chỉ thay tạm `shinReloadDecision` bằng hàm ném lỗi rồi trả lại ngay. Thông báo còn nguyên tới khi trigger chạy thành công hoặc người dùng bấm ✕.
 */
function probeTriggerErrorPending() {
  var sheet = shinOpenBook().getSheetByName(ENTITY_SHEETS.customer);
  var column = selectionColumnIndex(sheet, DATA_SCHEMA.customer.id.code);
  var real = shinReloadDecision;
  var thrown = '(không ném)';
  shinReloadDecision = function () { throw new Error('Lỗi thử của probeTriggerErrorPending, không phải lỗi thật.'); };
  try {
    shinOnEdit({ range: sheet.getRange(SHEET_FIRST_DATA_ROW, column) });
  } catch (err) {
    thrown = errorMessage(err);
  } finally {
    shinReloadDecision = real;
  }
  return ['Trigger ném: ' + thrown, 'Thông báo: ' + documentProps().getProperty(NOTICE_KEY_PREFIX + noticeKey('entry_failure', 'shinOnEdit'))].join('\n');
}
