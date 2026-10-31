/** `server/view/ViewTabTint.js`: tab cam khi sheet quản trị cũ, trả màu gốc khi vẽ xong, công tắc tắt hoặc lượt ghi nền thì không tô. */

const { section, check, ghiLoiNap } = require('../../lib/assert');
const { taoNenView, gieoHaiKhach, tieuDeVanDe } = require('../../lib/view/nen-view');
const { trongLanGoi } = require('../../lib/gas/lan-goi');

function chay(so) {
  section('ViewTabTint — tab cam khi sheet quản trị cũ, trả màu gốc khi vẽ xong');
  let base;
  try {
    base = taoNenView(['@CUS_MA_KH', '@CUS_TEN_CTY']);
  } catch (err) { return ghiLoiNap(so, 'nạp ViewTabTint', err); }
  const hop = base.nen.hop;
  gieoHaiKhach(base.nen);
  const care = base.nen.book.insertSheet('!Chăm sóc');
  care.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  const vẽHết = () => { hop.renderViewSheet('!Lead'); hop.renderViewSheet('!Chăm sóc'); };
  vẽHết();
  care.setTabColor('#00ff00');
  const ghi = () => trongLanGoi(hop, () => hop.writeCommitAfterSuccess({ source: 'sidebar', surface: 'record', entity: 'customer', recordIds: ['KH0001'] }));

  ghi();
  check(so, 'chuyển sạch sang cũ: mọi sheet ! tô cam một lần, sheet kho không bị chạm',
    [base.view.getTabColor(), care.getTabColor(), base.view._tabColors.length, care._tabColors.length, base.nen.book.getSheetByName('Customer')._tabColors.length],
    ['#ff9900', '#ff9900', 1, 2, 0]);
  ghi();
  check(so, 'signal thứ hai khi sheet vẫn cũ không gọi setTabColor', [base.view._tabColors.length, care._tabColors.length], [1, 2]);

  hop.renderViewSheet('!Lead');
  check(so, 'vẽ xong trả "không màu" cho sheet vừa vẽ, sheet chưa vẽ giữ cam',
    [base.view.getTabColor(), base.view._tabColors.length, care.getTabColor()], [null, 2, '#ff9900']);

  const realPlan = hop.viewRenderPlan;
  hop.viewRenderPlan = function () { trongLanGoi(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0002'], allViews: true })); return realPlan.apply(this, arguments); };
  hop.renderViewSheet('!Chăm sóc');
  hop.viewRenderPlan = realPlan;
  check(so, 'signal đến giữa lượt vẽ để sheet vẫn cũ thì không trả màu', [hop.viewIsStale('!Chăm sóc'), care.getTabColor()], [true, '#ff9900']);
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'vẽ lại xong trả đúng màu người dùng tự đặt', care.getTabColor(), '#00ff00');

  trongLanGoi(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH0001'], allViews: true }));
  check(so, 'ghi nhận thay đổi cuối lần chạy (tự lấy khóa) tô lại sheet vừa thành cũ sau khi đã trả màu và nhả khóa',
    [base.view.getTabColor(), care.getTabColor(), base.nen.stubs._khoa.dangGiu], ['#ff9900', '#ff9900', false]);
  const before = base.nen.book.getSheets().map((sheet) => sheet._tabColors.length);
  trongLanGoi(hop, () => {});
  check(so, 'lần chạy không có thay đổi không quét sheet nào để tô',
    base.nen.book.getSheets().map((sheet) => sheet._tabColors.length), before);

  // Mọi sheet ! đang cũ: lần ghi tiếp theo không có sheet nào chuyển trạng thái nên không được chạm Sheet để tô.
  const dem = { getTabColor: 0, getSheets: 0 };
  const realGetSheets = base.nen.book.getSheets;
  base.nen.book.getSheets = function () { dem.getSheets += 1; return realGetSheets.apply(this, arguments); };
  const realGetTab = [base.view.getTabColor, care.getTabColor];
  base.view.getTabColor = function () { dem.getTabColor += 1; return realGetTab[0](); };
  care.getTabColor = function () { dem.getTabColor += 1; return realGetTab[1](); };
  ghi();
  base.nen.book.getSheets = realGetSheets;
  base.view.getTabColor = realGetTab[0];
  care.getTabColor = realGetTab[1];
  check(so, 'lần ghi khi không có sheet ! nào đang mới không đọc màu tab, không liệt kê sheet', dem, { getTabColor: 0, getSheets: 0 });

  // Người dùng tự tô tab lúc sheet đang cũ (Google không báo): vẽ xong giữ màu đó làm màu gốc, không đè bằng màu đã cất.
  care.setTabColor('#123456');
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'người dùng tự đổi màu tab lúc sheet cũ: vẽ xong giữ màu người dùng, xóa màu gốc đã cất',
    [care.getTabColor(), Object.prototype.hasOwnProperty.call(hop.viewTabTintRead(), String(care.getSheetId()))], ['#123456', false]);
  care.setTabColor('#00ff00');

  // Lượt vẽ hỏng làm sheet thành cũ (sổ vẽ ghi ok:false) nên tab phải cam, kể cả khi trước đó sheet đang mới.
  vẽHết();
  hop.viewRenderPlan = function () { throw new Error('lượt vẽ thử hỏng'); };
  const hong = hop.renderViewSheet('!Chăm sóc');
  hop.viewRenderPlan = realPlan;
  check(so, 'lỗi ngoài dự kiến cũng thành khối lỗi, tô cam sheet đó, sheet khác vẫn giữ màu',
    [hong.ok, tieuDeVanDe(hong), hong.problems[0].lines, hop.viewIsStale('!Chăm sóc'), care.getTabColor(), base.view.getTabColor()],
    [false, ['Lỗi khi vẽ sheet'], ['lượt vẽ thử hỏng'], true, '#ff9900', null]);
  hop.renderViewSheet('!Chăm sóc');
  check(so, 'vẽ lại thành công sau lượt hỏng trả đúng màu gốc', care.getTabColor(), '#00ff00');

  // Lưu từ Sidebar khi đứng ở sheet ! và công tắc bật: sheet đang xem sẽ được vẽ ngay nên không tô.
  vẽHết();
  base.nen.book.setActiveSheet(base.view);
  const luuSidebar = (source) => trongLanGoi(hop, () => hop.writeCommitAfterSuccess({ source: source, surface: 'record', entity: 'customer', recordIds: ['KH0001'] }));
  luuSidebar('user');
  check(so, 'lưu từ Sidebar, công tắc bật: không tô sheet ! đang xem, vẫn tô sheet ! khác', [base.view.getTabColor(), care.getTabColor()], [null, '#ff9900']);
  vẽHết();
  hop.userPrefsWrite('autoRenderView', false);
  luuSidebar('user');
  const tatNum = [base.view.getTabColor(), care.getTabColor()];
  hop.userPrefsWrite('autoRenderView', true);
  vẽHết();
  luuSidebar('pull');
  check(so, 'công tắc tắt, hoặc lượt ghi nền (đồng bộ) thì tô cả sheet đang đứng',
    [tatNum, [base.view.getTabColor(), care.getTabColor()]], [['#ff9900', '#ff9900'], ['#ff9900', '#ff9900']]);
}

module.exports = { chay: chay };
