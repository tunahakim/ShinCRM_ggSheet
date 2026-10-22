/**
 * Ca kiểm cho `server/sheet/CellBudget.js`: phép đo ngân sách ô và cái trần chặn cả sidebar.
 *
 * Chỗ đáng lo nhất của tệp này là **khi không đọc được con số trần**: màn chặn chiếm trọn khung sidebar, nên trần đọc lỗi mà ném hay chặn là khóa người dùng ở ngoài, mất luôn đường vào màn Cài đặt để sửa. Cách đọc `500.000` kiểu người Việt thuộc bộ kiểm kiểu `number` của cổng cài đặt (kiểm ở `tests/cases/settings.js`).
 *
 * Điều thứ hai được canh: bảng chỉ mặt thủ phạm **sắp giảm dần**. Đó là ràng buộc cứng của tài liệu 05 Phần 6, không phải phần trang trí — nguyên nhân vượt trần thường gặp nhất là một sheet còn nguyên hàng và cột trống thừa, nên thiếu bảng này thì người dùng biết mình vượt trần mà không biết phải xóa gì.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkContains, ghiLoiNap } = require('../lib/assert');

/** Dựng hộp cát có trần số ô đã lưu qua cổng cài đặt. Truyền `null` nghĩa là chưa ai lưu. */
function dungTran(giaTri) {
  return dungHop({ sheets: [], caiDat: giaTri === null ? {} : { core_ops: { CELL_BUDGET: giaTri } } });
}

function chay(so) {
  section('Ngân sách ô — con số trần và bảng chỉ mặt thủ phạm');

  let nen;
  try {
    nen = dungTran(null);
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/CellBudget.js', err);
  }

  check(so, 'chưa ai lưu CELL_BUDGET thì dùng trần mặc định, không cảnh báo gì',
    nen.hop.cellBudgetCeiling(), { ceiling: 500000, source: 'default', warning: '' });
  check(so, 'trần mặc định đúng tài liệu 05 Phần 6', nen.hop.CELL_BUDGET_DEFAULT, 500000);
  check(so, 'đã lưu thì source là settings', dungTran(750000).hop.cellBudgetCeiling(), { ceiling: 750000, source: 'settings', warning: '' });
  check(so, 'ô Cài đặt để trống thì dùng mặc định', dungTran('').hop.cellBudgetCeiling().source, 'default');

  // Kho hỏng: rơi về mặc định KÈM cảnh báo, không ném và không chặn.
  const hong = dungTran(null);
  hong.props['SETTINGS:core_ops'] = '{hỏng';
  const tranHong = hong.hop.cellBudgetCeiling();
  check(so, 'đọc cài đặt lỗi thì rơi về mặc định kèm cảnh báo, không ném lỗi',
    [tranHong.ceiling, tranHong.source, tranHong.warning.length > 0], [500000, 'default', true]);

  // Phép đo. Ba sheet lưới khác nhau, cố ý dựng theo thứ tự tăng dần để nếu code quên sắp thì phép kiểm đỏ.
  const doNen = dungTran(null);
  doNen.book.insertSheet('Nho')._datLuoi(100, 10);
  doNen.book.insertSheet('To')._datLuoi(2000, 30);
  doNen.book.insertSheet('Vua')._datLuoi(500, 20);
  doNen.book.insertSheet('Bao cao')._datLuoi(1000, 26);

  // Phép đo chạy ở đầu MỌI lượt `loadCore`, nên luật "không đọc một ô nào" là luật phải đo được chứ không phải lời hứa
  // trong docstring. Cách đo: bọc `getRange` của từng sheet lại rồi đếm. Gọi `cellBudgetCeiling()` một lần trước khi bọc
  // là để phần đọc cài đặt — việc của cổng cài đặt, không phải việc của phép đo — nằm ngoài con số đếm được.
  doNen.hop.cellBudgetCeiling();
  let soLanGetRange = 0;
  doNen.book.getSheets().forEach((s) => {
    const goc = s.getRange;
    s.getRange = function () { soLanGetRange += 1; return goc.apply(s, arguments); };
  });

  const doDuoc = doNen.hop.cellBudgetMeasure(doNen.book);

  check(so, 'phép đo không chạm một vùng ô nào — chỉ hỏi kích thước lưới', soLanGetRange, 0);
  check(so, 'tổng ô là tổng hàng nhân cột của MỌI sheet, kể cả ô rỗng',
    doDuoc.total, 1000 * 26 + 100 * 10 + 2000 * 30 + 500 * 20);
  check(so, 'bảng thủ phạm sắp giảm dần theo số ô — ràng buộc cứng tài liệu 05 Phần 6',
    doDuoc.sheets.map((item) => item.name), ['To', 'Bao cao', 'Vua', 'Nho']);
  check(so, 'mỗi dòng bảng thủ phạm có đủ tên, hàng, cột, số ô',
    doDuoc.sheets[0], { name: 'To', rows: 2000, columns: 30, cells: 60000 });
  check(so, 'trong ngưỡng thì exceeded là false', doDuoc.exceeded, false);

  const vuot = dungTran(50000);
  vuot.book.insertSheet('Phinh')._datLuoi(3000, 26);
  const doVuot = vuot.hop.cellBudgetMeasure(vuot.book);
  check(so, 'vượt trần thì exceeded là true và trần là con số đã lưu',
    [doVuot.exceeded, doVuot.ceiling, doVuot.ceilingSource], [true, 50000, 'settings']);

  const dong = vuot.hop.cellBudgetLines(doVuot);
  checkContains(so, 'dòng đầu nói rõ đã vượt trần', dong, 'VƯỢT TRẦN');
  checkContains(so, 'bảng thủ phạm có sheet phình to, kèm hàng và cột', dong, 'Phinh: 3000 hàng × 26 cột');
  check(so, 'mỗi sheet đúng một dòng trong bảng thủ phạm', dong.length, 1 + doVuot.sheets.length);

  const canhBao = dungTran(null);
  canhBao.props['SETTINGS:core_ops'] = '{hỏng';
  const dongCanhBao = canhBao.hop.cellBudgetLines(canhBao.hop.cellBudgetMeasure(canhBao.book));
  checkContains(so, 'đọc trần lỗi thì lời cảnh báo cũng ra dòng chữ, không nằm im trong dữ liệu', dongCanhBao, 'Cảnh báo:');

  return so;
}

module.exports = { chay };
