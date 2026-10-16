/** Cửa ghi Sheet duy nhất của module đồng bộ: mọi lần ghi dữ liệu hoặc trạng thái đồng bộ xuống Sheet đi qua đây. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * `writeGateSave` báo thất bại theo hai kiểu: lỗi hệ thống thì ném exception, trường không đạt thì trả `ok:false` kèm `invalid`.
 * Kiểu thứ hai từng bị bỏ qua ở nhiều chỗ nên luồng đi tiếp như đã ghi (FBM-001, FBM-002, FBM-004). Ở đây cả hai kiểu đều thành exception để `runSlice` chuyển phiên sang lỗi trước khi cursor tiến hoặc request ghi FBM được phát.
 * `source` là `pull` hoặc `push`, quyết định quy tắc kiểm trường của cửa ghi và chiều của dòng Log lỗi bản ghi.
 */
FbmSync.sheetSave = function (entity, records, source) {
  var saved = writeGateSave({ entity: entity, records: records, source: source, schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (saved && saved.ok) { return saved; }
  var invalid = saved && Array.isArray(saved.invalid) ? saved.invalid : [];
  invalid.forEach(function (item) {
    FbmSync.recordIssueAdd(source, entity, FbmSync.SYNC_STATUS.error, String(item.id || ''), 'Cửa ghi Sheet chặn trường ' + String(item.label || item.field || ''), typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error');
  });
  var first = invalid[0];
  var detail = first ? String(first.label || first.field || '') + ' của ' + String(first.id || 'bản ghi mới') + ': ' + String(first.reason || '') : String(saved && saved.error || 'cửa ghi trả kết quả không thành công');
  var error = new Error('Không ghi được ' + (records || []).length + ' bản ghi ' + entity + ' vào Sheet (' + invalid.length + ' trường không đạt). ' + detail);
  error.code = 'FBM_SHEET_WRITE_FAILED';
  throw error;
};
