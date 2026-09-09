/**
 * Ca kiểm của `client/schema/uiSchema.html` — bản khai bố cục bốn màn. Tài liệu 03 Phần 8, Phần 9.
 *
 * Tệp khai chỉ có dữ liệu nên không có hành vi để kiểm; điều đáng kiểm là **bản khai khớp hợp đồng**: mọi tên trường có thật trong `DATA_SCHEMA`, mọi tên hành động nằm trong bảng tên, mọi mục menu tuân hai luật của tài liệu 03 Phần 9, và cả bốn màn dịch được qua `screenBuild` mà không nổ. Sai một chuỗi ở đây thì lỗi hiện ra lúc vẽ, cách xa dòng khai gây ra nó.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { section, check, ghiDat, ghiTruot, ghiLoiNap } = require('../lib/assert');

/** Bốn màn, để duyệt chứ không gõ lại tên ở từng phép kiểm. */
const MAN = ['view', 'customerForm', 'activityForm', 'noteForm'];

/** Tên hành động của tài liệu 04 Phần 7, trừ `deleteSelectedActivities` mà chủ dự án bỏ ngày 06/09/2026, cộng `setCurrentCustomer` mà tài liệu 04 Phần 2 khai riêng. */
const TEN_HANH_DONG = [
  'toggleFollowSelection', 'toggleAutoRenderView', 'toggleSearchPanel', 'toggleSyncPanel', 'showFbmAutoSyncComingSoon', 'setActivityView',
  'renderActiveViewSheet', 'reloadAll', 'openCustomerForm', 'openCustomerFormBlank',
  'openActivityForm', 'openNoteForm', 'saveForm', 'cancelForm',
  'deleteActivity', 'undoDelete', 'setCurrentCustomer'
];

/** Mọi node trong một cây Block, kể cả con của con. */
function moiNode(nodes, ra) {
  (nodes || []).forEach((n) => {
    if (!n || !n.role) { return; }
    ra.push(n);
    if (Array.isArray(n.elements)) { moiNode(n.elements, ra); }
  });
  return ra;
}

/** Mọi ô trường của một màn, ở cả hai lối khai: cây Block của màn view, và cụm `{ group, rows }` của ba màn form. */
function moiTruong(man) {
  const ra = [];
  moiNode(man.body, []).forEach((n) => { if (n.field) { ra.push(n.field); } });
  (man.body || []).forEach((cum) => {
    (cum.rows || []).forEach((hang) => {
      hang.forEach((o) => { ra.push(typeof o === 'string' ? o : o.field); });
    });
  });
  return ra;
}

/** Mọi mảng `menu` của một màn: menu ở hàng header, và menu ở `titleActions` của một card. */
function moiMenu(man) {
  const ra = [];
  (man.header || []).forEach((m) => { if (m.menu) { ra.push(m.menu); } });
  moiNode(man.body, []).forEach((n) => {
    (n.titleActions || []).forEach((m) => { if (m.menu) { ra.push(m.menu); } });
  });
  return ra;
}

/** Mọi tên hành động một màn nhắc tới, ở bất cứ tầng nào — kể cả trên một ô trường, như bút sửa ghi chú của form giao dịch. */
function moiAction(man) {
  const ra = [];
  const nhan = (m) => {
    if (!m) { return; }
    if (m.action) { ra.push(m.action); }
    (m.menu || []).forEach((con) => { if (con.action) { ra.push(con.action); } });
  };

  (man.header || []).forEach(nhan);
  (man.footer || []).forEach(nhan);
  moiNode(man.body, []).forEach((n) => {
    nhan(n);
    (n.titleActions || []).forEach(nhan);
  });
  (man.body || []).forEach((cum) => {
    (cum.rows || []).forEach((hang) => { hang.forEach((o) => { if (typeof o !== 'string') { nhan(o); } }); });
  });
  return ra;
}

function chay(so) {
  section('uiSchema — bản khai bốn màn khớp hợp đồng schema');

  let hop;
  let DATA;
  try {
    DATA = dungHop().hop.DATA_SCHEMA;
    hop = napClient(taoHopCat(), 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html', 'client/schema/uiSchema.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp uiSchema cùng bộ dựng Block', err);
  }

  check(so, 'khai đúng bốn màn, không thiếu không thừa', Object.keys(hop.UI_SCHEMA).sort(), MAN.slice().sort());

  check(so, 'entity của mỗi màn đúng sheet mà form đó ghi vào',
    MAN.map((m) => hop.UI_SCHEMA[m].entity), ['customer', 'customer', 'activity', 'customer']);

  check(so, 'infoBar tắt ở customerForm và bật ở ba màn còn lại',
    MAN.map((m) => hop.UI_SCHEMA[m].infoBar), [true, false, true, true]);

  check(so, 'ba màn form dùng đúng một hàng header chung: hủy bên trái, lưu bên phải',
    ['customerForm', 'activityForm', 'noteForm'].map((m) => hop.UI_SCHEMA[m].header === hop.UI_FORM_HEADER), [true, true, true]);

  // Mọi tên trường phải có thật, ở đúng thực thể mà đường dẫn chỉ tới.
  const truongLa = [];
  MAN.forEach((tenMan) => {
    const man = hop.UI_SCHEMA[tenMan];
    moiTruong(man).forEach((d) => {
      const phan = String(d).split('.');
      const thucThe = phan.length === 2 ? phan[0] : man.entity;
      const ten = phan.length === 2 ? phan[1] : phan[0];
      if (!DATA[thucThe] || !DATA[thucThe][ten]) { truongLa.push(tenMan + ' → ' + d); }
    });
  });
  if (truongLa.length) { ghiTruot(so, 'mọi tên trường trên bốn màn đều có thật trong DATA_SCHEMA', truongLa); }
  else { ghiDat(so, 'mọi tên trường trên bốn màn đều có thật trong DATA_SCHEMA'); }

  // Mọi tên hành động phải nằm trong bảng tên của tài liệu.
  const actionLa = [];
  MAN.forEach((tenMan) => {
    moiAction(hop.UI_SCHEMA[tenMan]).forEach((a) => {
      if (TEN_HANH_DONG.indexOf(a) === -1) { actionLa.push(tenMan + ' → ' + a); }
    });
  });
  if (actionLa.length) { ghiTruot(so, 'mọi tên hành động đều có trong bảng tên của tài liệu 04', actionLa); }
  else { ghiDat(so, 'mọi tên hành động đều có trong bảng tên của tài liệu 04'); }

  // Hai luật menu của tài liệu 03 Phần 9.
  const menuLoi = [];
  MAN.forEach((tenMan) => {
    moiMenu(hop.UI_SCHEMA[tenMan]).forEach((menu) => {
      menu.forEach((c) => {
        if (c.toggle && c.value !== undefined) { menuLoi.push(tenMan + ' → "' + c.label + '" vừa toggle vừa value'); }
        if (!c.action) { menuLoi.push(tenMan + ' → "' + c.label + '" không có action'); }
      });
    });
  });
  if (menuLoi.length) { ghiTruot(so, 'mục menu nào cũng có action, và không mục nào vừa toggle vừa value', menuLoi); }
  else { ghiDat(so, 'mục menu nào cũng có action, và không mục nào vừa toggle vừa value'); }

  const cards = moiNode(hop.UI_SCHEMA.view.body, []).filter((n) => n.role === 'card');

  check(so, 'menu chế độ xem có ba nấc, cùng một action nên là nhóm loại trừ',
    (() => {
      const dangXem = cards[1].titleActions.filter((m) => m.menu)[0];
      return [dangXem.menu.length, dangXem.menu.map((c) => c.action).join('|'), dangXem.menu.map((c) => c.value)];
    })(),
    [3, 'setActivityView|setActivityView|setActivityView', ['all', 'active', 'deleted']]);

  check(so, 'card lịch sử có id để vẽ lại riêng khi đổi nấc xem', cards[1].id, 'shin-card-history');
  check(so, 'card lịch sử lấy nội dung từ slot activityList, không khai cây con', cards[1].elements, 'activityList');
  check(so, 'card ghi chú cuộn nội bộ theo trần chiều cao, không sinh nút thu gọn',
    [cards[0].spatialConfig.maxHeight, cards[0].spatialConfig.overflow, cards[0].spatialConfig.collapsedLines],
    ['var(--shin-read-max-height)', 'scroll', undefined]);
  check(so, 'ghi chú trên màn view là trường chỉ đọc — sửa nó phải đi qua noteForm',
    moiNode(cards[0].elements, []).map((n) => n.field + ':' + n.readonly), ['customer.note:true']);

  check(so, 'titleActions luôn là mảng, kể cả khi chỉ có một mục',
    cards.map((c) => Array.isArray(c.titleActions)), [true, true]);

  check(so, 'màn view không có vùng chân — nó chỉ đọc, không có gì để lưu', hop.UI_SCHEMA.view.footer, undefined);
  check(so, 'ba màn form đều có đúng một nút chân, và nút đó gọi saveForm',
    ['customerForm', 'activityForm', 'noteForm'].map((m) => hop.UI_SCHEMA[m].footer.length + ':' + hop.UI_SCHEMA[m].footer[0].action),
    ['1:saveForm', '1:saveForm', '1:saveForm']);

  check(so, 'tiêu đề noteForm là chuỗi trơn, hai form kia có hai vế thêm và sửa',
    [typeof hop.UI_SCHEMA.noteForm.title, Object.keys(hop.UI_SCHEMA.customerForm.title).sort(), Object.keys(hop.UI_SCHEMA.activityForm.title).sort()],
    ['string', ['add', 'edit'], ['add', 'edit']]);

  check(so, 'không mã cột @ nào lọt vào bản khai bố cục — mã cột chỉ có ở DATA_SCHEMA',
    JSON.stringify(hop.UI_SCHEMA).indexOf('"@'), -1);

  // Bản khai phải dịch được qua screenBuild: phép kiểm duy nhất chạm cả hai lối viết tắt trên dữ liệu thật.
  const dungLoi = [];
  const daDung = {};
  MAN.forEach((tenMan) => {
    try { daDung[tenMan] = hop.screenBuild(hop.UI_SCHEMA[tenMan], tenMan); }
    catch (err) { dungLoi.push(tenMan + ': ' + err.message); }
  });
  if (dungLoi.length) { return ghiTruot(so, 'cả bốn màn dịch được qua screenBuild', dungLoi); }
  ghiDat(so, 'cả bốn màn dịch được qua screenBuild');

  check(so, 'customerForm dựng thành hai cụm, mỗi cụm là một Card',
    daDung.customerForm.body.map((c) => c.role), ['card', 'card']);
  check(so, 'mỗi hàng khai thành một Row, và mỗi ô trong hàng thành một Field',
    daDung.customerForm.body.map((c) => c.elements.map((r) => r.role + '/' + r.elements.length).join(' ')),
    ['row/1 row/2 row/2 row/2 row/1', 'row/1 row/1 row/2 row/1 row/1 row/2 row/2 row/1']);
  check(so, 'khóa viết tắt width gộp vào spatialConfig lúc dựng',
    daDung.customerForm.body[1].elements[2].elements[0].spatialConfig.width, '65%');
  check(so, 'noteForm chỉ có một trường, và nó mang class riêng để ô gõ cao hơn',
    (() => { const f = daDung.noteForm.body[0].elements[0].elements[0]; return [f.field, f.control, f.className]; })(),
    ['note', 'textarea', 'shin-note-tall']);
  check(so, 'màn view khai bằng cây Block nên screenBuild trả nguyên cây, không bọc thêm Card',
    daDung.view.body === hop.UI_SCHEMA.view.body, true);
  check(so, 'hàng header của màn view dựng thành tám Icon, nút sét là followSelection và icon đồng bộ có hai mục',
    [daDung.view.header.map((n) => n.role).join(','), daDung.view.header[1].icon, daDung.view.header[1].toggle, daDung.view.header[4].icon, daDung.view.header[4].menu.length, daDung.view.header[5].menu.length],
    ['icon,icon,icon,icon,icon,icon,icon,icon', 'bolt', 'followSelection', 'sync', 2, 1]);
  check(so, 'nút chân dựng thành Button có nhãn chữ, không thành Icon',
    [daDung.noteForm.footer[0].role, daDung.noteForm.footer[0].label], ['button', 'LƯU GHI CHÚ']);
}

// `TEN_HANH_DONG` xuất ra ngoài để `cases/actions.js` soi cùng một danh sách. Hai bản chép tay thì lệch được mà không ai đỏ.
module.exports = { chay, TEN_HANH_DONG };
