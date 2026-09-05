/**
 * Đo ngân sách ô của cả tệp Sheet và so với trần. Tài liệu 05 Phần 6.
 *
 * Ngân sách ô là tổng `getMaxRows() × getMaxColumns()` trên **mọi** sheet, **kể cả ô rỗng**. Đây là con số quyết định độ ì của tệp và là con số Google dùng cho hạn mức của họ; nội dung ô không liên quan. Một sheet 1000 hàng trắng tinh vẫn tốn đúng 26.000 ô như một sheet 1000 hàng đầy chữ.
 *
 * Đo rất rẻ vì **không đọc một ô nào** — chỉ hỏi kích thước lưới. Nhờ vậy nó chạy được ở đầu mỗi lần `loadCore()` mà không tốn gì đáng kể, và đó là chỗ nó phải chạy: vượt trần thì chặn hoàn toàn, không đọc dữ liệu, vì đọc dữ liệu trong một tệp đã quá ì là cách chắc nhất để lượt chạy chết ở giữa đường.
 *
 * Vì sao tệp này ra đời ngay bây giờ, khi sheet còn trắng và chưa có gì để đo: hình dạng của **kết quả chặn** là thứ client phải biết bung ngay từ lượt code đầu tiên. Thêm một dạng trả về thứ hai vào sau nghĩa là đường nhận dữ liệu bên client phải học lại một hình dạng nữa, ở đúng lúc nó đã chạy quen. Việc còn lại thật sự thuộc Giai đoạn 3 là **đo khối lượng thật** ngay sau lượt nạp đầu từ FBM, không phải viết phép đo.
 */

/** Trần mặc định khi `Config` chưa khai: năm trăm nghìn ô. Tài liệu 05 Phần 6. */
var CELL_BUDGET_DEFAULT = 500000;

/** Tên tham số ở khối tham số hệ thống của sheet `Config`. Trần ở `Config` chứ không ở `SETTINGS` vì đây là quyết định vận hành mà người dùng được phép đổi mà không cần mở code. */
var CELL_BUDGET_CONFIG_NAME = 'TRAN_SO_O';

/**
 * Trần đang có hiệu lực, kèm lý do nếu phải rơi về mặc định.
 *
 * Trả về `{ ceiling, source, warning }`. `source` là `'config'` hoặc `'default'`.
 *
 * Đọc con số này rất dễ và rất đáng lo, vì người dùng gõ số vào một ô sheet theo cách người Việt vẫn gõ: `500.000`. `parseInt('500.000')` trả về `500`. Nếu tin con số đó thì hệ thống chặn ở 500 ô, tức là **chặn mãi mãi** — và màn chặn chiếm trọn khung sidebar, nên người dùng mất luôn đường vào để sửa lại con số đã gõ sai. Một cổng chặn tự khóa người giữ chìa khóa ở ngoài là cổng chặn hỏng.
 *
 * Nên hàm này bỏ hết dấu chấm, dấu phẩy và khoảng trắng trước khi đọc số, và mọi ca còn lại không ra một số dương thì **rơi về mặc định kèm lời cảnh báo** chứ không ném lỗi và cũng không chặn. Cảnh báo đi theo kết quả nạp để hiện lên cho người dùng thấy mình gõ sai.
 */
function cellBudgetCeiling() {
  var raw = '';
  try {
    raw = configGet(CELL_BUDGET_CONFIG_NAME);
  } catch (khongDocDuocConfig) {
    return { ceiling: CELL_BUDGET_DEFAULT, source: 'default', warning: 'Không đọc được sheet Config nên dùng trần mặc định ' + CELL_BUDGET_DEFAULT + ' ô.' };
  }

  if (!raw) { return { ceiling: CELL_BUDGET_DEFAULT, source: 'default', warning: '' }; }

  var digits = String(raw).replace(/[.,\s]/g, '');
  var so = /^[0-9]+$/.test(digits) ? Number(digits) : NaN;

  if (!so || !isFinite(so) || so <= 0) {
    return { ceiling: CELL_BUDGET_DEFAULT, source: 'default', warning: 'Tham số ' + CELL_BUDGET_CONFIG_NAME + ' ở sheet Config gõ là "' + raw + '", không đọc ra một số dương, nên đang dùng trần mặc định ' + CELL_BUDGET_DEFAULT + ' ô.' };
  }

  return { ceiling: so, source: 'config', warning: '' };
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
    var rows = sheet.getMaxRows();
    var columns = sheet.getMaxColumns();
    return { name: sheet.getName(), rows: rows, columns: columns, cells: rows * columns };
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
  var lines = ['Ngân sách ô: ' + measure.total + ' / trần ' + measure.ceiling + ' (' + (measure.ceilingSource === 'config' ? 'lấy từ Config' : 'mặc định') + ')' + (measure.exceeded ? ' — VƯỢT TRẦN' : ' — trong ngưỡng')];

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
