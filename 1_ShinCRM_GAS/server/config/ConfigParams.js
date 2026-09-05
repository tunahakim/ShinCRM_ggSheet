/**
 * Danh mục núm vặn của khối tham số hệ thống ở sheet `Config`: có những tham số nào, gõ giá trị gì là hợp lệ. `Settings.gs` biết một tham số **đang là bao nhiêu**, tệp này biết **có những tham số nào**.
 *
 * Luật vào danh mục: có code đọc tham số đó thì tên nó mới vào. Bốn tham số đồng bộ (`FBM_ACCOUNT_NAME`, `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE`) cố ý chưa có, vì ở đó ô trống nghĩa là kỳ đồng bộ dừng, không phải dùng mặc định.
 */

/**
 * Danh mục `{ name, note }` theo thứ tự gieo xuống sheet.
 *
 * Là hàm chứ không phải hằng vì nó nhắc tới hằng của tệp khác, mà Apps Script tự chọn thứ tự nạp tệp. `note` đi vào ghi chú của ô tên — khối chỉ có hai cột nên không có cột mô tả để thêm.
 */
function configParamCatalog() {
  return [
    {
      name: LOG_TRACE_CONFIG_NAME,
      note: 'Bật chế độ ghi log chi tiết ra sheet Log.\n\n'
        + 'Để trống = tắt. Ngày thường để trống.\n'
        + '"all" = bật cho mọi nguồn.\n'
        + 'Hoặc kể tên nguồn, cách nhau bằng dấu phẩy: core, sidebar, fbm_sync, bot.\n\n'
        + 'CẢNH BÁO: đang bật thì log ghi cả bí mật ra nguyên văn. Tắt trước khi chia sẻ tệp.'
    },
    {
      name: CELL_BUDGET_CONFIG_NAME,
      note: 'Trần tổng số ô của cả tệp, tính cả ô rỗng. Vượt trần thì sidebar chặn hẳn, không nạp dữ liệu.\n\n'
        + 'Để trống = dùng mặc định ' + CELL_BUDGET_DEFAULT + ' ô.\n'
        + 'Gõ số bình thường; dấu chấm hay dấu phẩy phân cách nghìn cũng đọc được.'
    }
  ];
}

/** Tên các tham số theo thứ tự gieo. Phép gieo và phép nghiệm thu dùng chung hàm này nên không có hai bản sao lệch nhau. */
function configParamNames() {
  return configParamCatalog().map(function (item) { return item.name; });
}
