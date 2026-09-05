/**
 * Danh mục núm vặn của khối tham số hệ thống ở sheet `Config`: có những tham số nào, mỗi tham số làm gì, gõ giá trị gì là hợp lệ.
 *
 * Vì sao tách khỏi `Settings.gs`: tệp đó biết một tham số **đang là bao nhiêu**, còn đây biết **có những tham số nào**. Hai câu hỏi khác nhau, và câu thứ hai là câu người dùng hỏi lúc mở sheet `Config` ra xem. `setupSheets` gieo danh sách này vào cột `Tham số` với ô giá trị để trống, nên chủ dự án mở `Config` là thấy ngay các núm có thể vặn thay vì phải đoán tên.
 *
 * Còn một lý do nữa để nó không nằm trong `Settings.gs`: tệp đó tự đặt cho mình một tính chất — nó nằm dưới đường ghi log nên phải nạp được cả khi mọi thứ khác đổ. Danh mục này hỏi `CellBudget.gs` tên và trần mặc định của tham số ngân sách ô, tức một chiều phụ thuộc ngược lên tầng trên. Vô hại vì đường ghi log không bao giờ gọi tới đây, nhưng nhét vào `Settings.gs` thì người đọc sau phải tự đi kiểm điều đó.
 *
 * **Luật vào danh sách: có code đọc tham số đó thì tên nó vào đây, chưa có code đọc thì chưa vào.** Bốn tham số của module đồng bộ — `FBM_ACCOUNT_NAME`, `FBM_MA_KH_PREFIX`, `FBM_MA_KH_LENGTH`, `FBM_ACTIVITY_SINCE` ở tài liệu 02 Phần 10 và tài liệu 09 Phần 12 — cố ý chưa có, và lý do không phải "để sau cho gọn". Với hai tham số dưới đây, ô để trống nghĩa là **dùng mặc định**; với bốn tham số kia, ô để trống nghĩa là **kỳ đồng bộ dừng lại**. Gieo chung một danh sách mà hai nửa hiểu ô trống theo hai nghĩa trái nhau là dựng sẵn một chỗ để hiểu sai. Chặng đồng bộ gieo phần của nó, kèm lời giải thích của nó.
 */

/**
 * Danh mục tham số: mảng `{ name, note }` theo thứ tự gieo xuống sheet.
 *
 * Là hàm chứ không phải hằng vì nó nhắc tới hằng của tệp khác. Apps Script nạp các tệp theo thứ tự nó tự chọn, nên một mảng dựng ở tầng ngoài cùng có thể đọc phải `undefined` của tệp chưa nạp; gói trong hàm thì tới lúc gọi mọi tệp đã nạp xong.
 *
 * `note` đi vào ghi chú của ô tên. Khối này chỉ có hai cột và tài liệu 02 Phần 10 chốt cứng hình dáng đó, nên không có cột mô tả để thêm — ghi chú ô là chỗ duy nhất còn lại để nói cho người dùng biết giá trị nào hợp lệ.
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

/** Tên các tham số trong danh mục, theo thứ tự gieo. Dùng cho phép gieo và phép nghiệm thu, để hai bên không có bản sao danh sách nào lệch nhau. */
function configParamNames() {
  return configParamCatalog().map(function (item) { return item.name; });
}
