/**
 * Đọc sheet `Category` thành bảng "mã danh mục → danh sách giá trị". Tài liệu 02 Phần 9.
 *
 * Hình dạng của sheet này: **mỗi danh mục là một cột**, và giá trị của nó chạy dọc xuống từ hàng 4, độc lập với các cột khác. Nên các danh mục dài ngắn khác nhau là chuyện thường, và không có khái niệm "hàng" ở sheet này — hàng thứ năm của cột Tỉnh thành không liên quan gì tới hàng thứ năm của cột Sản phẩm.
 *
 * Đọc cả vùng dữ liệu bằng **một lệnh** rồi tự chẻ theo cột, chứ không đọc từng cột một. Mười ba cột đọc riêng là mười ba lệnh gọi mạng cho cùng một câu trả lời.
 *
 * **Cột đi kèm `_FBM` bị loại ra ở đây**, và cố ý chưa được phân tích. Chúng giữ mã của hệ ngoài dưới dạng `MÃ. Tên` ngăn nhau bằng ` | `, kèm ký hiệu `#` đánh dấu cặp chính danh, và cả bộ luật đọc chúng chỉ có nghĩa khi có module đồng bộ để dùng — nó thuộc Giai đoạn 3. Viết trình phân tích đó bây giờ là viết một trình phân tích không ai gọi, trên những ô chưa ai gõ.
 */

/**
 * Cột này có phải cột đi kèm phục vụ đồng bộ không.
 *
 * **Không** được nhận diện bằng hậu tố `_FBM` một mình, và đây là chỗ dễ sai nhất của cả tệp: `@CAT_CHO_PHEP_FBM` — danh mục "Cho phép đẩy FBM" với ba giá trị `Cho phép`, `Chưa cho phép`, `Ngừng đồng bộ` — cũng kết thúc bằng `_FBM`. Loại nó ra thì trường `allowFbmPush` mất sạch giá trị để chọn, mà đó lại là trường bắt buộc ở cả hai thực thể, nên form sẽ không lưu được bản ghi nào và nguyên nhân thì không hiện ra ở đâu.
 *
 * Phép nhận diện đúng là hỏi thêm một câu: bỏ hậu tố ra thì phần còn lại **có phải một danh mục đã khai** không. `@CAT_TINH_THANH_FBM` bỏ hậu tố còn `@CAT_TINH_THANH`, có khai, nên nó là cột đi kèm. `@CAT_CHO_PHEP_FBM` bỏ hậu tố còn `@CAT_CHO_PHEP`, không khai ở đâu, nên nó là một danh mục thật. Luật này chính là luật của tài liệu 02 Phần 9: danh mục nào tham gia đồng bộ được trả lời bằng chính sự tồn tại của cột đi kèm.
 */
function categoryIsCompanion(code) {
  var suffix = CATEGORY_FBM_SUFFIX;
  if (code.length <= suffix.length || code.slice(-suffix.length) !== suffix) { return false; }

  var base = code.slice(0, code.length - suffix.length);
  var declared = CATEGORY_COLUMNS.some(function (pair) { return pair[0] === code; });
  return declared && CATEGORY_COLUMNS.some(function (pair) { return pair[0] === base; });
}

/** Danh sách mã của các danh mục thật, đã bỏ cột đi kèm. */
function categoryCodes() {
  return CATEGORY_COLUMNS.map(function (pair) { return pair[0]; }).filter(function (code) { return !categoryIsCompanion(code); });
}

/**
 * Đọc cả sheet. Trả về `{ categories, warnings }`.
 *
 * `categories` luôn có đủ khóa cho mọi danh mục đã khai, danh mục chưa ai gõ giá trị thì nhận mảng rỗng. Đủ khóa là điều kiện để phía client hỏi thẳng `categories[source]` mà không phải kiểm sự tồn tại ở từng chỗ hỏi — thiếu một khóa thì mỗi chỗ hỏi là một chỗ có thể quên.
 *
 * Giá trị trùng nhau trong cùng một danh mục thì **giữ lại một và ghi cảnh báo**, không ném lỗi. Ném lỗi ở đây là chặn lượt mở sidebar vì một ô gõ lặp, mà màn chặn lại chiếm trọn khung nên người dùng mất luôn đường vào để sửa. Cảnh báo đi kèm kết quả nạp và hiện lên cho người dùng thấy, còn danh sách chọn thì vẫn dùng được ngay.
 */
function categoryReadAll() {
  var sheetName = 'Category';
  var sheet = shinOpenSheet(sheetName);
  var columnMap = readColumnMap(sheetName);
  var codes = categoryCodes();
  var rowCount = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  var block = sheetGridReadBlock(sheet, SHEET_FIRST_DATA_ROW, rowCount, columnMap.lastColumn);

  var categories = {};
  var warnings = [];

  codes.forEach(function (code) {
    var at = columnIndex(columnMap, code) - 1;
    var values = [];
    var seen = {};
    var duplicates = [];

    block.forEach(function (row) {
      var value = row[at];
      var text = String(value === null || value === undefined ? '' : value).trim();
      if (!text) { return; }

      if (Object.prototype.hasOwnProperty.call(seen, text)) {
        duplicates.push(text);
        return;
      }

      seen[text] = true;
      values.push(text);
    });

    if (duplicates.length) {
      warnings.push('Danh mục ' + code + ' có giá trị gõ trùng, mỗi giá trị chỉ giữ lại một: ' + duplicates.join(', ') + '.');
    }

    categories[code] = values;
  });

  return { categories: categories, warnings: warnings };
}

/** Phép nghiệm thu chạy được trên Google: in số giá trị của từng danh mục trên tệp thật, kèm danh sách cột đi kèm đã loại. */
function probeCategoryRead() {
  var report = [];
  var ket = categoryReadAll();
  var companions = CATEGORY_COLUMNS.map(function (pair) { return pair[0]; }).filter(categoryIsCompanion);

  report.push('Danh mục thật: ' + Object.keys(ket.categories).length + ' — cột đi kèm đã loại: ' + (companions.join(', ') || 'không có'));
  report.push('@CAT_CHO_PHEP_FBM có bị nhận nhầm là cột đi kèm không? ' + categoryIsCompanion('@CAT_CHO_PHEP_FBM') + ' (phải là false)');

  Object.keys(ket.categories).forEach(function (code) {
    var values = ket.categories[code];
    report.push('  ' + code + ': ' + values.length + ' giá trị' + (values.length ? ' — ' + values.slice(0, 5).join(' | ') : ' (chưa gõ giá trị nào)'));
  });

  ket.warnings.forEach(function (line) { report.push('Cảnh báo: ' + line); });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
