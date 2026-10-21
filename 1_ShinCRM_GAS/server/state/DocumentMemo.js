/**
 * Đọc bộ nhớ phụ trong DocumentProperties: thứ ShinCRM dựng lại được (sổ vẽ sheet quản trị, màu gốc tab, bộ nhớ lỗi trùng, ảnh chụp hàng 1), mất thì chỉ tốn một lượt làm lại chứ không mất dữ liệu khách.
 * Khóa hỏng thì báo (dòng `Log` mức lỗi và câu trong kho câu chờ để người dùng thấy lúc mở Sidebar), xóa khóa rồi trả `null` để lượt này làm như chưa có. Đọc kho lỗi vẫn ném, vì lúc đó không biết khóa có hỏng thật không.
 * Nguồn sự thật (sổ nạp lại, sổ bận, state và cài đặt đồng bộ) không dùng hàm này: chúng gọi `documentPropertyJson` và dừng hẳn khi hỏng.
 * `props` là mặt kho của bên gọi (`documentProps()` ở lõi, `FbmSync.props()` ở đồng bộ), để lệnh xóa đi cùng lớp ghi chờ với phần còn lại của lượt.
 */
function documentMemoRead(props, key, context, shape) {
  try {
    return documentPropertyJson(props, key, context, shape);
  } catch (error) {
    if (error.code !== 'DOCUMENT_PROPERTY_CORRUPT') { throw error; }
    logEvent({ source: 'document_store', action: 'memo_read', outcome: LOG_ERROR, reason: error.code, detail: { key: String(key), context: String(context) } });
    errorPendingPush('Dữ liệu ' + context + ' trong DocumentProperties bị hỏng (' + key + '); ShinCRM đã xóa để tự dựng lại.');
    props.deleteProperty(key);
    return null;
  }
}
