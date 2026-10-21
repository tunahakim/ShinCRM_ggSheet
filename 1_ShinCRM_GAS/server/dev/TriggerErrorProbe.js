/**
 * Nghiệm thu DEV: lỗi trong trigger sửa ô phải vào kho câu chờ để Sidebar đang mở hiện ra.
 *
 * Chạy đúng `shinOnEdit` trên ô mã khách đầu tiên của Customer, chỉ thay tạm `shinReloadDecision` bằng hàm ném lỗi rồi trả lại ngay. Không đọc kho bằng `takePendingMessages` để câu chờ còn nguyên cho Sidebar lấy ở lời hỏi kế tiếp.
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
  return ['Trigger ném: ' + thrown, 'Kho câu chờ: ' + documentProps().getProperty(ERROR_PENDING_KEY)].join('\n');
}
