/**
 * Đo ngân sách ô của cả tệp Sheet và so với trần. Tài liệu 05 Phần 6.
 *
 * Ngân sách ô là tổng `getMaxRows() × getMaxColumns()` trên **mọi** sheet, **kể cả ô rỗng**. Đây là con số quyết định độ ì của tệp và là con số Google dùng cho hạn mức của họ; nội dung ô không liên quan. Một sheet 1000 hàng trắng tinh vẫn tốn đúng 26.000 ô như một sheet 1000 hàng đầy chữ.
 *
 * Đo rất rẻ vì **không đọc một ô nào** — chỉ hỏi kích thước lưới. Nhờ vậy nó chạy được ở đầu mỗi lần `loadCore()` mà không tốn gì đáng kể, và đó là chỗ nó phải chạy: vượt trần thì chặn hoàn toàn, không đọc dữ liệu, vì đọc dữ liệu trong một tệp đã quá ì là cách chắc nhất để lượt chạy chết ở giữa đường.
 *
 * Vì sao tệp này ra đời ngay bây giờ, khi sheet còn trắng và chưa có gì để đo: hình dạng của **kết quả chặn** là thứ client phải biết bung ngay từ lượt code đầu tiên. Thêm một dạng trả về thứ hai vào sau nghĩa là đường nhận dữ liệu bên client phải học lại một hình dạng nữa, ở đúng lúc nó đã chạy quen. Việc còn lại thật sự thuộc Giai đoạn 3 là **đo khối lượng thật** ngay sau lượt nạp đầu từ FBM, không phải viết phép đo.
 */

/** Trần mặc định khi cài đặt `CELL_BUDGET` để trống: năm trăm nghìn ô. Tài liệu 05 Phần 6. */
var CELL_BUDGET_DEFAULT = 500000;

/**
 * Trần đang có hiệu lực, kèm lý do nếu phải rơi về mặc định. Trả về `{ ceiling, source, warning }`; `source` là `'settings'` hoặc `'default'`.
 *
 * Giá trị đã được bộ kiểm kiểu `number` chuẩn hóa lúc lưu (số nguyên dương, đọc được cả `500.000`), nên ở đây chỉ còn hai ca. Đọc kho lỗi thì **rơi về mặc định kèm cảnh báo** chứ không ném: màn chặn chiếm trọn Sidebar, và một cổng chặn vì không đọc được chính trần của nó là cổng khóa người giữ chìa khóa ở ngoài.
 */
function cellBudgetCeiling() {
  var value;
  try {
    value = settingsValue('core_ops', CELL_BUDGET_SETTING);
  } catch (khongDocDuocCaiDat) {
    return { ceiling: CELL_BUDGET_DEFAULT, source: 'default', warning: 'Không đọc được cài đặt trần số ô (' + String(khongDocDuocCaiDat && khongDocDuocCaiDat.message || khongDocDuocCaiDat) + ') nên dùng trần mặc định ' + CELL_BUDGET_DEFAULT + ' ô.' };
  }
  if (value === '') { return { ceiling: CELL_BUDGET_DEFAULT, source: 'default', warning: '' }; }
  return { ceiling: value, source: 'settings', warning: '' };
}

/**
 * Đo cả tệp. Trả về `{ total, ceiling, ceilingSource, exceeded, warning, sheets }`.
 *
 * `sheets` là bảng chỉ mặt thủ phạm, **sắp giảm dần theo số ô**: mỗi phần tử là `{ name, rows, columns, cells }`. Bảng này là ràng buộc cứng của tài liệu 05 Phần 6, không phải phần trang trí của màn cảnh báo. Nguyên nhân vượt trần thường gặp nhất không phải nhiều dữ liệu mà là một sheet còn nguyên hàng và cột trống thừa — thiếu bảng này thì người dùng biết mình vượt trần mà không biết phải xóa gì.
 *
 * Bảng luôn được dựng, kể cả khi chưa vượt trần, vì nó rẻ và vì cùng con số đó dùng để bày ra ở phép nghiệm thu.
 */
function cellBudgetMeasure(book) {
  var tran = cellBudgetCeiling();
  var sheets = book.getSheets().map(function (sheet) {
    var size = sheetGridSize(sheet);
    return { name: sheet.getName(), rows: size.rows, columns: size.columns, cells: size.rows * size.columns };
  });

  sheets.sort(function (a, b) { return b.cells - a.cells; });

  var total = sheets.reduce(function (sum, item) { return sum + item.cells; }, 0);

  return {
    total: total,
    ceiling: tran.ceiling,
    ceilingSource: tran.source,
    exceeded: total > tran.ceiling,
    warning: tran.warning,
    sheets: sheets
  };
}

/** Bảng thủ phạm thành các dòng chữ đọc được, dùng cho log và cho phép nghiệm thu. Màn cảnh báo bên client tự vẽ bảng từ dữ liệu, không dùng mấy dòng này. */
function cellBudgetLines(measure) {
  var lines = ['Ngân sách ô: ' + measure.total + ' / trần ' + measure.ceiling + ' (' + (measure.ceilingSource === 'settings' ? 'lấy từ Cài đặt' : 'mặc định') + ')' + (measure.exceeded ? ' — VƯỢT TRẦN' : ' — trong ngưỡng')];

  if (measure.warning) { lines.push('Cảnh báo: ' + measure.warning); }

  measure.sheets.forEach(function (item) {
    lines.push('  ' + item.name + ': ' + item.rows + ' hàng × ' + item.columns + ' cột = ' + item.cells + ' ô');
  });

  return lines;
}

/** Phép nghiệm thu chạy được trên Google: in ngân sách ô thật của tệp thật. */
function probeCellBudget() {
  var report = cellBudgetLines(cellBudgetMeasure(shinOpenBook()));
  report.forEach(function (line) { Logger.log(line); });
  return report;
}
