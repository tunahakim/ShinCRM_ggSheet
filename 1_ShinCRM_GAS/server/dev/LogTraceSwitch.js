/**
 * Công tắc chế độ ghi log chi tiết cho **tệp DEV**: bật hoặc tắt tham số `LOG_TRACE` ở sheet `Config`.
 *
 * Vì sao cần hàm này chứ không gõ tay: sheet `Config` có nhiều cặp cột đứng cạnh nhau, nên có nhiều cột trông giống "cột tên". Gõ vào sai khối thì tham số không có tác dụng gì, và cách hỏng đó không để lại dấu vết nào — người gõ chỉ thấy log vẫn trống rồi ngồi đoán. Hàm này tra cột theo mã hàng 1 nên không có đường gõ sai.
 *
 * **Đây là công cụ giai đoạn phát triển, nằm trong `server/dev/` và bị xóa cùng cả thư mục trước khi tệp có dữ liệu thật.** Chỗ đúng cho một công tắc lâu dài là sheet quản trị của chặng 1.5. Trước khi xóa thư mục này thì phải chạy `devLogTraceOff` — vì chế độ vết ghi bí mật ra nguyên văn, và tài liệu 10 Phần 7 cấm chia sẻ tệp trong lúc nó đang bật.
 */

/**
 * Ghi một giá trị vào dòng `LOG_TRACE` của khối tham số hệ thống. Có dòng rồi thì sửa, chưa có thì thêm ngay dưới dòng cuối **của chính cột tham số** — không phải dưới `getLastRow()` của cả sheet, vì mỗi khối chạy dọc độc lập nên lấy dòng cuối của cả sheet là chừa lại một khoảng trống giữa bảng.
 *
 * Tên tham số lấy từ `LOG_TRACE_CONFIG_NAME` ở `Settings.gs`, không giữ bản sao ở đây: một cái tên khai hai chỗ là một chỗ sẽ đổi mà chỗ kia không.
 */
function devLogTraceSet(value) {
  var columnMap = readColumnMap('Config');
  var keyColumn = columnIndex(columnMap, '@CFG_THAM_SO');
  var valueColumn = columnIndex(columnMap, '@CFG_THAM_SO_GIA_TRI');
  var firstDataRow = SHEET_LAYOUT.Config.firstDataRow;
  var sheet = shinOpenSheet('Config');
  var lastRow = sheet.getLastRow();
  var target = 0;
  var lastFilled = firstDataRow - 1;

  if (lastRow >= firstDataRow) {
    var names = sheet.getRange(firstDataRow, keyColumn, lastRow - firstDataRow + 1, 1).getValues();
    names.forEach(function (row, index) {
      var name = String(row[0] === null || row[0] === undefined ? '' : row[0]).trim();
      if (!name) { return; }
      lastFilled = firstDataRow + index;
      if (name === LOG_TRACE_CONFIG_NAME) { target = firstDataRow + index; }
    });
  }

  var added = false;
  if (!target) {
    target = lastFilled + 1;
    added = true;
    sheet.getRange(target, keyColumn).setValue(LOG_TRACE_CONFIG_NAME);
  }
  sheet.getRange(target, valueColumn).setValue(value);

  // Bộ nhớ tạm của `configParams` giữ giá trị cũ trong cùng lượt chạy, nên không xóa thì dòng nghiệm thu ngay dưới sẽ đọc lại giá trị trước khi ghi.
  resetSettingsCache();

  var report = [
    (added ? 'Đã thêm' : 'Đã sửa') + ' dòng ' + LOG_TRACE_CONFIG_NAME + ' ở hàng ' + target + ' của sheet Config.',
    'Giá trị mới: "' + value + '"' + (value ? '' : ' (rỗng nghĩa là tắt)'),
    'Đọc lại qua chính đường chương trình dùng — LOG_TRACE phủ nguồn "sidebar"? ' + logTraceCoversSource('sidebar'),
    'Phủ nguồn "fbm_sync"? ' + logTraceCoversSource('fbm_sync')
  ];

  report.forEach(function (line) { Logger.log(line); });
  return report;
}

/** Bật chế độ ghi log chi tiết cho **mọi** nguồn. Chủ dự án chốt ngày 05/09/2026: giai đoạn phát triển thì ghi chi tiết, ngày thường ẩn hết. */
function devLogTraceOn() {
  return devLogTraceSet('all');
}

/** Tắt hẳn chế độ ghi log chi tiết. Phải chạy trước khi xóa `server/dev/` và trước khi tệp có dữ liệu thật. */
function devLogTraceOff() {
  return devLogTraceSet('');
}
