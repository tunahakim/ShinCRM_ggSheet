/** Ba đường UI có DOM riêng: phát click, menu nổi và khối thu gọn. */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { domGia } = require('../lib/dom-gia');
const { section, check, ghiLoiNap } = require('../lib/assert');

function dungCanh() {
  const dom = domGia();
  const progress = dom.document.createElement('div');
  progress.id = 'sidebar-progress';
  progress.rect = { left: 0, top: 50, bottom: 53, right: 300 };
  dom.root.appendChild(progress);
  const overlay = dom.document.createElement('div');
  overlay.id = 'shin-busy-overlay';
  overlay.hidden = true;
  const notice = dom.document.createElement('div');
  notice.id = 'shin-busy-notice';
  notice.hidden = true;
  notice.rect = { left: 0, top: 53, bottom: 81, right: 300 };
  dom.root.appendChild(notice);
  dom.document.body.appendChild(overlay);
  const hop = napClient(taoHopCat({ document: dom.document, window: dom.window }),
    'client/ui/progress.html', 'client/ui/dispatch.html', 'client/ui/menu.html', 'client/ui/collapse.html');
  hop._alerts = [];
  hop.alert = (message) => { hop._alerts.push(String(message)); };
  hop.console = { error: () => {} };
  return { hop, dom, overlay, notice, progress };
}

async function chay(so) {
  section('DOM UI — phát click, menu và thu gọn dùng đúng vùng DOM');

  let canh;
  try { canh = dungCanh(); } catch (err) { return ghiLoiNap(so, 'nạp ba tệp UI DOM', err); }
  const { hop, dom, overlay, notice } = canh;
  const menuCloseReal = hop.menuClose;

  const nut = dom.document.createElement('button');
  nut.setAttribute('data-action', 'save');
  nut.setAttribute('data-pick', 'CUS-000001');
  nut.setAttribute('data-value', 'all');
  dom.root.appendChild(nut);
  check(so, 'dispatchPayload giữ đúng pick/value và đổi thuộc tính vắng thành hình dạng hợp đồng',
    [hop.dispatchPayload(nut), hop.dispatchPayload(dom.document.createElement('button'))],
    [{ pick: 'CUS-000001', value: 'all' }, { pick: '', value: undefined }]);

  const nhan = dom.document.createElement('span');
  nhan.className = 'shin-btn-label';
  nhan.textContent = 'Lưu';
  const nutBan = dom.document.createElement('button');
  nutBan.setAttribute('data-busy', 'Đang lưu…');
  nutBan.appendChild(nhan);
  const moKhoa = hop.dispatchBusy(nutBan);
  check(so, 'dispatchBusy khóa nút và chỉ đổi nhãn, không làm mất phần tử con',
    [nutBan.disabled, nhan.textContent, nutBan.children.length], [true, 'Đang lưu…', 1]);
  moKhoa();
  check(so, 'dispatchBusy khôi phục đúng trạng thái sau khi xong', [nutBan.disabled, nhan.textContent], [false, 'Lưu']);

  const moToanBo = hop.sidebarBusyBegin('Đang lưu khách hàng…');
  const moLong = hop.sidebarBusyBegin('Đang đồng bộ dữ liệu…');
  check(so, 'trạng thái bận lồng nhau khóa toàn gốc, đẩy lời báo vào luồng và phủ từ dưới lời báo',
    [dom.root.getAttribute('inert'), dom.root.getAttribute('aria-busy'), overlay.hidden, notice.hidden, notice.textContent, overlay.style.top],
    ['', 'true', false, false, 'Đang đồng bộ dữ liệu…', '81px']);
  moLong();
  check(so, 'xong việc lồng chỉ trở về lời báo trước, chưa mở sidebar sớm',
    [dom.root.hasAttribute('inert'), overlay.hidden, notice.textContent], [true, false, 'Đang lưu khách hàng…']);
  moToanBo();
  check(so, 'xong hết mới mở tương tác và ẩn lớp loading',
    [dom.root.hasAttribute('inert'), dom.root.getAttribute('aria-busy'), overlay.hidden, notice.hidden], [false, 'false', true, true]);

  const noticeOnly = hop.sidebarBusyBegin('Đang kiểm tra…', { block: false });
  check(so, 'cùng component có thể chỉ hiện thông báo mà không khóa nội dung',
    [dom.root.hasAttribute('inert'), overlay.hidden, notice.hidden, notice.textContent], [false, true, false, 'Đang kiểm tra…']);
  noticeOnly();
  const blockOnly = hop.sidebarBusyBegin('', { block: true });
  check(so, 'cùng component có thể chỉ khóa dưới thanh loading mà không dựng dòng thông báo',
    [dom.root.hasAttribute('inert'), overlay.hidden, notice.hidden, overlay.style.top], [true, false, true, '53px']);
  blockOnly();

  const focus = dom.document.createElement('input');
  focus.id = 'o-can-focus';
  dom.root.appendChild(focus);
  const after = [];
  hop.inputsGrowAll = () => after.push('inputs');
  hop.collapseScan = () => after.push('collapse');
  hop.searchSyncScreen = () => after.push('search');
  hop.menuClose = () => { after.push('menu-close'); return null; };
  hop.ACTIONS = { save: (payload) => Promise.resolve({ focusId: 'o-can-focus', payload }) };
  await hop.dispatchRun('save', { pick: 'CUS-000001' }, nut);
  check(so, 'dispatchRun gọi hành động bất đồng bộ, dọn ba hậu kỳ và đặt con trỏ',
    [focus.focused, after, nut.disabled, hop._alerts], [true, ['inputs', 'collapse', 'search'], false, []]);

  hop.menuClose = menuCloseReal;
  hop.RENDER_INDEX = { menus: { 'menu-1': [
    { label: 'Tự động', action: 'toggleAutoRenderView', toggle: true },
    { label: 'Tất cả', action: 'setActivityView', value: 'all' }
  ] } };
  hop.Prefs = { autoRenderView: true, activityView: 'active' };
  const nutMenu = dom.document.createElement('button');
  nutMenu.setAttribute('data-menu', 'menu-1');
  nutMenu.rect = { left: 280, top: 760, bottom: 780, right: 300 };
  dom.root.appendChild(nutMenu);
  const lop = hop.menuOpen(nutMenu);
  check(so, 'menuOpen dựng đúng hai mục, đánh dấu công tắc và ép menu vào cửa sổ',
    [lop.hidden, lop.children.length, lop.children[0].textContent, lop.children[0].getAttribute('aria-checked'), nutMenu.getAttribute('aria-expanded'), lop.style.left],
    [false, 2, '✓Tự động', 'true', 'true', '136px']);
  hop.menuToggle(nutMenu);
  check(so, 'bấm lại nút menu đang mở thì đóng và dọn mục con', [lop.hidden, lop.children.length, nutMenu.getAttribute('aria-expanded')], [true, 0, 'false']);
  check(so, 'menuInstall chỉ gắn một tai nghe Escape', [hop.menuInstall(), hop.menuInstall()], [true, false]);

  const holder = dom.document.createElement('div');
  const khoi = dom.document.createElement('div');
  khoi.setAttribute('data-collapse', '3');
  khoi.setAttribute('style', 'overflow: hidden; max-height: 40px');
  khoi.clientHeight = 40;
  khoi.scrollHeight = 100;
  holder.appendChild(khoi);
  dom.root.appendChild(holder);
  check(so, 'collapseApply hiện đúng một nút Xem thêm khi nội dung tràn',
    [hop.collapseApply(khoi), holder.children.length, holder.children[1].textContent], ['closed', 2, 'Xem thêm']);
  hop.collapseToggle(holder.children[1]);
  check(so, 'mở khối tràn thì hiện hai nút Thu gọn và đánh dấu đang mở',
    [khoi.getAttribute('data-collapse-open'), holder.children.length, holder.children[0].textContent, holder.children[2].textContent], ['1', 3, 'Thu gọn', 'Thu gọn']);
  hop.collapseToggle(holder.children[0]);
  check(so, 'đóng lại khối tràn thì trở về một nút Xem thêm',
    [khoi.hasAttribute('data-collapse-open'), holder.children.length, holder.children[1].textContent], [false, 2, 'Xem thêm']);

  const vua = dom.document.createElement('div');
  const vuaNoi = dom.document.createElement('div');
  vuaNoi.setAttribute('data-collapse', '3');
  vuaNoi.clientHeight = 40;
  vuaNoi.scrollHeight = 40;
  vua.appendChild(vuaNoi);
  dom.root.appendChild(vua);
  check(so, 'collapseApply không hiện nút khi nội dung vừa khung', [hop.collapseApply(vuaNoi), vua.children.length], ['fit', 1]);
}

module.exports = { chay };
