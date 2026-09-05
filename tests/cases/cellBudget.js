/**
 * Ca kiểm cho `server/sheet/CellBudget.js`: phép đo ngân sách ô và cái trần chặn cả sidebar.
 *
 * Chỗ đáng lo nhất của tệp này không phải phép nhân hàng với cột — mà là **cách đọc con số trần**. Người dùng gõ vào ô sheet theo cách người Việt vẫn gõ: `500.000`. `parseInt('500.000')` trả về `500`, và khi đó hệ thống chặn ở 500 ô, tức chặn mãi mãi — mà màn chặn chiếm trọn khung sidebar nên người dùng mất luôn đường vào để sửa lại con số vừa gõ. Một cổng chặn tự khóa người giữ chìa khóa ở ngoài là cổng chặn hỏng, nên ca `500.000` là ca quan trọng nhất ở đây.
 *
 * Điều thứ hai được canh: bảng chỉ mặt thủ phạm **sắp giảm dần**. Đó là ràng buộc cứng của tài liệu 05 Phần 6, không phải phần trang trí — nguyên nhân vượt trần thường gặp nhất là một sheet còn nguyên hàng và cột trống thừa, nên thiếu bảng này thì người dùng biết mình vượt trần mà không biết phải xóa gì.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkContains, ghiLoiNap } = require('../lib/assert');

/** Dựng hộp cát có `Config` kèm một giá trị `TRAN_SO_O` đã gõ. Truyền `null` nghĩa là chưa ai gõ tham số đó. */
function dungTran(giaTri) {
  return dungHop({ sheets: ['Config'], thamSo: giaTri === null ? [] : [['TRAN_SO_O', giaTri]] });
}

function chay(so) {
  section('Ngân sách ô — con số trần và bảng chỉ mặt thủ phạm');

  let nen;
  try {
    nen = dungTran(null);
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/CellBudget.js', err);
  }

  check(so, 'chưa ai gõ TRAN_SO_O thì dùng trần mặc định, không cảnh báo gì',
    nen.hop.cellBudgetCeiling(), { ceiling: 500000, source: 'default', warning: '' });
  check(so, 'trần mặc định đúng tài liệu 05 Phần 6', nen.hop.CELL_BUDGET_DEFAULT, 500000);

  // Ca quan trọng nhất của cả tệp: bốn cách gõ mà người Việt thật sự gõ, cả bốn phải ra cùng một con số.
  check(so, 'bốn cách gõ con số của người Việt đều đọc ra 500.000 ô',
    ['500.000', '500,000', '500 000', '500000'].map((raw) => dungTran(raw).hop.cellBudgetCeiling().ceiling),
    [500000, 500000, 500000, 500000]);

  check(so, 'gõ đúng thì source là config chứ không phải default', dungTran('750.000').hop.cellBudgetCeiling(),
    { ceiling: 750000, source: 'config', warning: '' });

  // Mọi ca không ra một số dương đều rơi về mặc định KÈM cảnh báo, chứ không ném lỗi và cũng không chặn.
  // Ném lỗi ở đây là chặn lượt mở sidebar vì một ô gõ sai, mà chặn thì mất luôn đường vào để sửa ô đó.
  ['nhiều', '0', '-5', 'năm trăm nghìn', '1e6'].forEach((raw) => {
    const tran = dungTran(raw).hop.cellBudgetCeiling();
    check(so, 'gõ "' + raw + '" thì rơi về mặc định, không chặn', [tran.ceiling, tran.source, tran.warning.includes('TRAN_SO_O')], [500000, 'default', true]);
  });

  const khongCoConfig = dungHop({ sheets: [] }).hop;
  const tranKhongConfig = khongCoConfig.cellBudgetCeiling();
  check(so, 'mất hẳn sheet Config thì cũng rơi về mặc định kèm cảnh báo, không ném lỗi',
    [tranKhongConfig.ceiling, tranKhongConfig.source, tranKhongConfig.warning.length > 0], [500000, 'default', true]);

  // Phép đo. Ba sheet lưới khác nhau, cố ý dựng theo thứ tự tăng dần để nếu code quên sắp thì phép kiểm đỏ.
  const doNen = dungTran(null);
  doNen.book.insertSheet('Nho')._datLuoi(100, 10);
  doNen.book.insertSheet('To')._datLuoi(2000, 30);
  doNen.book.insertSheet('Vua')._datLuoi(500, 20);
  doNen.sheet('Config')._datLuoi(1000, 26);

  // Phép đo chạy ở đầu MỌI lượt `loadCore`, nên luật "không đọc một ô nào" là luật phải đo được chứ không phải lời hứa
  // trong docstring. Cách đo: bọc `getRange` của từng sheet lại rồi đếm. Gọi `cellBudgetCeiling()` một lần trước khi bọc
  // là để phần đọc `Config` — việc của cổng tham số, không phải việc của phép đo — nằm ngoài con số đếm được.
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
    doDuoc.sheets.map((item) => item.name), ['To', 'Config', 'Vua', 'Nho']);
  check(so, 'mỗi dòng bảng thủ phạm có đủ tên, hàng, cột, số ô',
    doDuoc.sheets[0], { name: 'To', rows: 2000, columns: 30, cells: 60000 });
  check(so, 'trong ngưỡng thì exceeded là false', doDuoc.exceeded, false);

  const vuot = dungTran('50.000');
  vuot.book.insertSheet('Phinh')._datLuoi(3000, 26);
  const doVuot = vuot.hop.cellBudgetMeasure(vuot.book);
  check(so, 'vượt trần thì exceeded là true và trần vẫn là con số đã gõ',
    [doVuot.exceeded, doVuot.ceiling, doVuot.ceilingSource], [true, 50000, 'config']);

  const dong = vuot.hop.cellBudgetLines(doVuot);
  checkContains(so, 'dòng đầu nói rõ đã vượt trần', dong, 'VƯỢT TRẦN');
  checkContains(so, 'bảng thủ phạm có sheet phình to, kèm hàng và cột', dong, 'Phinh: 3000 hàng × 26 cột');
  check(so, 'mỗi sheet đúng một dòng trong bảng thủ phạm', dong.length, 1 + doVuot.sheets.length);

  const canhBao = dungTran('nhiều');
  const dongCanhBao = canhBao.hop.cellBudgetLines(canhBao.hop.cellBudgetMeasure(canhBao.book));
  checkContains(so, 'gõ sai trần thì lời cảnh báo cũng ra dòng chữ, không nằm im trong dữ liệu', dongCanhBao, 'Cảnh báo:');

  return so;
}

module.exports = { chay };
