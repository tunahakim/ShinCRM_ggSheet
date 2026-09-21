/**
 * Ca kiểm của `client/screen/formScreen.html` — ba màn form. Tài liệu 04 Phần 8, tài liệu 03 Phần 9.
 *
 * Những chỗ hỏng-trong-im-lặng đáng kiểm nhất: tiêu đề suy sai nên form sửa đề chữ "Thêm"; ô kế tục không có dấu nên người dùng tưởng mình vừa gõ giá trị đó; form giao dịch thiếu bản ghi khách nên hàng `customer.note` trống trơn; và đóng form lồng thì rơi thẳng về màn xem thay vì về form dưới.
 */

const { napClient, taoHopCat, catRuotScript, docTep } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { khungGia } = require('../lib/khung-gia');
const { stripComments } = require('../lib/strip-comments');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const KHACH = { id: 'CUS-000001', companyName: 'Công ty Thép Hòa Phát', phone: '0912345678', contactPerson: 'Anh Tuấn', note: 'Khách quen, gọi buổi sáng', recordStatus: 'active' };

/** Giao dịch gần nhất còn sống của khách, mang sẵn hai trường kế tục để `fieldLogicNewRecord` có gì mà bê sang bản ghi mới. */
const GIAO_DICH = { id: 'ACT-000001', customerId: 'CUS-000001', workDate: '2026-09-01', taskType: 'Gọi điện', content: 'Chào hàng lần đầu', priority: 'Cao', dueAt: '2026-09-10 09:00', recordStatus: 'active' };

function dungCanh() {
  const hop = napClient(taoHopCat(),
    'client/util/textNormalize.html', 'client/schema/schemaAccess.html', 'client/ram/store.html',
    'client/ram/prefs.html', 'client/ram/screenState.html', 'client/util/valueText.html',
    'client/ui/icons.html', 'client/ui/uiClassMap.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html',
    'client/ui/renderEngine.html', 'client/ui/slots.html', 'client/schema/screens/formHeader.html',
    'client/schema/screens/view.html', 'client/schema/screens/customerForm.html', 'client/schema/screens/activityForm.html',
    'client/schema/screens/noteForm.html', 'client/schema/uiSchema.html',
    'client/schema/fieldLogic.html', 'client/screen/viewScreen.html', 'client/screen/formScreen.html');

  hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  hop.document = khungGia();
  hop.storeReset();
  hop.prefsReset();
  hop.screenStateReset();
  hop.Store.upsertRecord('customer', KHACH);
  hop.Store.upsertRecord('activity', GIAO_DICH);
  hop.Store.config = { counters: { customer: 12, activity: 34 } };
  hop.Store.activityState = hop.STORE_READY;
  hop.screenStateSetCustomer('CUS-000001');
  return hop;
}

function chay(so) {
  section('formScreen — tiêu đề suy từ bản ghi và chỗ đứng của nó trong vùng header');

  let hop;
  try {
    hop = dungCanh();
  } catch (err) {
    return ghiLoiNap(so, 'nạp formScreen cùng bộ máy vẽ, bảng khai bố cục và bảng ngầm định thật', err);
  }

  const tieuDe = hop.UI_SCHEMA.customerForm.title;
  check(so, 'đang thêm ra "Thêm", đang sửa ra "Sửa" — tài liệu 04 Phần 8',
    [hop.screenFormTitle(tieuDe, true), hop.screenFormTitle(tieuDe, false)],
    ['Thêm Khách Hàng', 'Sửa Khách Hàng']);

  check(so, 'tiêu đề khai bằng chuỗi trần thì dùng nguyên, vì màn ghi chú luôn là sửa',
    hop.screenFormTitle(hop.UI_SCHEMA.noteForm.title, true), 'Ghi Chú Khách Hàng');

  checkThrows(so, 'khai thiếu một nửa của cặp add/edit thì hét lên chứ không vẽ ra tiêu đề `undefined`',
    () => hop.screenFormTitle({ add: 'Thêm' }, true), 'add');

  const hangDecl = hop.screenFormHeader(hop.UI_SCHEMA.customerForm.header, 'Thêm Khách Hàng');
  const hang = hop.screenBuild({ entity: 'customer', header: hangDecl }, 'customerForm').header;
  check(so, 'tiêu đề nằm ở start, Hủy rồi Lưu nằm ở end theo đúng thứ tự header form',
    [hang.length, hang[0].className, hang[0].elements.length, hang[0].elements[0].text,
      hang[1].className, hang[1].elements.map((node) => [node.icon, node.tooltip, node.action])],
    [2, 'shin-header-group shin-header-group-start', 1, 'Thêm Khách Hàng',
      'shin-header-group shin-header-group-end', [['close', 'Hủy', 'cancelForm'], ['check', 'Lưu', 'saveForm']]]);

  const activityHang = hop.screenBuild({ entity: 'activity', header: hop.screenFormHeader(hop.UI_SCHEMA.activityForm.header, 'Thêm Giao Dịch') }, 'activityForm').header;
  const noteHang = hop.screenBuild({ entity: 'customer', header: hop.screenFormHeader(hop.UI_SCHEMA.noteForm.header, 'Ghi Chú Khách Hàng') }, 'noteForm').header;
  check(so, 'form activity và note giữ cùng HeaderGroup: tiêu đề ở start, Hủy rồi Lưu ở end',
    [activityHang.map((group) => group.className).join('|'), activityHang[0].elements[0].text,
      activityHang[1].elements.map((node) => node.icon).join('|'),
      noteHang.map((group) => group.className).join('|'), noteHang[0].elements[0].text,
      noteHang[1].elements.map((node) => node.icon).join('|')],
    ['shin-header-group shin-header-group-start|shin-header-group shin-header-group-end', 'Thêm Giao Dịch', 'close|check',
      'shin-header-group shin-header-group-start|shin-header-group shin-header-group-end', 'Ghi Chú Khách Hàng', 'close|check']);

  const customerTree = hop.screenBuild(hop.UI_SCHEMA.customerForm, 'customerForm');
  check(so, 'form lõi dùng Card → Row → Field, footer dùng Button save chung',
    [customerTree.body.length, customerTree.body[0].role, customerTree.body[0].elements.every((row) => row.role === 'row'),
      customerTree.body[0].elements[0].elements[0].role, customerTree.footer[0].role, customerTree.footer[0].className.indexOf('shin-save-wide') >= 0],
    [1, 'card', true, 'field', 'button', true]);

  section('formScreen — form sửa khách: bốn vùng và ô nhập đầu tiên');

  const els = hop.document._els;
  const raSua = hop.screenFormOpen('customerForm', hop.Store.getCustomer('CUS-000001'));

  check(so, 'form sửa khách: tiêu đề "Sửa", ô tên khách đổ sẵn giá trị, chân màn có nút lưu rộng, khối thông tin chung ẩn vì form đã hiện khách',
    [els['sidebar-header'].innerHTML.indexOf('Sửa Khách Hàng') > 0,
      els['sidebar-body'].innerHTML.indexOf('Công ty Thép Hòa Phát') > 0,
      els['sidebar-footer'].innerHTML.indexOf('shin-save-wide') > 0,
      els['sidebar-info'].hidden, els['sidebar-footer'].hidden],
    [true, true, true, true, false]);

  const headerHtml = els['sidebar-header'].innerHTML;
  check(so, 'form render giữ thứ tự trực quan tiêu đề, Hủy, Lưu trong cùng header',
    [headerHtml.indexOf('Sửa Khách Hàng') < headerHtml.indexOf('shin-form-cancel'),
      headerHtml.indexOf('shin-form-cancel') < headerHtml.indexOf('shin-form-save')], [true, true]);

  check(so, 'ô nhập đầu tiên bỏ qua trường mà DATA_SCHEMA khóa: mã khách chỉ-đọc nên con trỏ về tên khách',
    raSua.focusId, 'shin-f-customer-companyName');

  check(so, 'mã khách vẫn vẽ ra nhưng mang dấu chỉ-đọc, để bộ thu thập lúc lưu bỏ qua nó',
    els['sidebar-body'].innerHTML.indexOf('id="shin-f-customer-id" data-field="customer.id" data-readonly="1"') > 0, true);

  section('formScreen — form giao dịch: bản ghi khách đi kèm và dấu ô kế tục');

  hop.screenStateGoView();
  const raMoi = hop.screenFormOpenNew('activityForm', { customerId: 'CUS-000001' });
  const top = hop.screenStateTop();

  check(so, 'thêm giao dịch: hai trường kế tục nhận giá trị của lần làm việc gần nhất và được ghi vào danh sách kế tục',
    [top.record.priority, top.record.dueAt, top.carried.slice().sort(), hop.screenStateFormCarried().length],
    ['Cao', '2026-09-10 09:00', ['dueAt', 'priority'], 2]);

  check(so, 'engine đánh dấu đúng hai ô kế tục bằng lớp riêng — tài liệu 03 Phần 4, việc đánh dấu là của engine chứ không của tệp màn',
    [/class="[^"]*shin-carried[^"]*"[^>]*data-field="activity.priority"/.test(els['sidebar-body'].innerHTML),
      /class="[^"]*shin-carried[^"]*"[^>]*data-field="activity.dueAt"/.test(els['sidebar-body'].innerHTML),
      /class="[^"]*shin-carried[^"]*"[^>]*data-field="activity.workDate"/.test(els['sidebar-body'].innerHTML)],
    [true, true, false]);

  check(so, 'form giao dịch được cấp thêm bản ghi khách: hàng cuối đổ đúng ghi chú của khách, và khối thông tin chung hiện tên khách',
    [els['sidebar-body'].innerHTML.indexOf('Khách quen, gọi buổi sáng') > 0,
      els['sidebar-info'].innerHTML.indexOf('Công ty Thép Hòa Phát') > 0,
      els['sidebar-info'].hidden],
    [true, true, false]);

  check(so, 'mã giao dịch chỉ là mã xem trước từ bộ đếm, và tiêu đề vẫn là "Thêm" dù ô mã đã có chữ — đọc `record.id` để suy tiêu đề là sai ở đúng chỗ này',
    [top.record.id, raMoi.focusId, els['sidebar-header'].innerHTML.indexOf('Thêm Giao Dịch') > 0],
    ['ACT-000035', 'shin-f-activity-workDate', true]);

  top.carried = ['note'];
  hop.screenFormRender();
  check(so, 'danh sách kế tục là tên trường của thực thể màn: `customer.note` trên form giao dịch không ăn dấu dù tên trùng',
    /class="[^"]*shin-carried[^"]*"[^>]*data-field="customer.note"/.test(els['sidebar-body'].innerHTML), false);

  section('formScreen — mở lồng rồi đóng từng lớp');

  hop.screenStateSetDraft({ content: 'Đang gõ dở' });
  hop.screenFormOpen('noteForm', hop.Store.getCustomer('CUS-000001'));

  check(so, 'form ghi chú mở lồng lên form giao dịch: ngăn xếp hai lớp, ô ghi chú mang lớp cao riêng của màn này',
    [hop.ScreenState.formStack.length, hop.ScreenState.screen,
      els['sidebar-header'].innerHTML.indexOf('Ghi Chú Khách Hàng') > 0,
      els['sidebar-body'].innerHTML.indexOf('shin-note-tall') > 0],
    [2, 'noteForm', true, true]);

  const veGiaoDich = hop.screenFormClose();
  check(so, 'đóng form lồng thì về form dưới cùng bản nháp của chính nó, không rơi thẳng về màn xem',
    [hop.ScreenState.screen, els['sidebar-header'].innerHTML.indexOf('Thêm Giao Dịch') > 0,
      els['sidebar-body'].innerHTML.indexOf('Đang gõ dở') > 0, veGiaoDich.focusId],
    ['activityForm', true, true, 'shin-f-activity-workDate']);

  hop.screenFormClose();
  check(so, 'đóng lớp cuối thì về màn xem: ngăn xếp rỗng, thân màn lại là hai card của màn xem',
    [hop.ScreenState.formStack.length, hop.ScreenState.screen,
      els['sidebar-body'].innerHTML.indexOf('LỊCH SỬ LÀM VIỆC') > 0],
    [0, 'view', true]);

  checkThrows(so, 'đang ở màn xem mà gọi vẽ form thì hét lên, vì không có form nào để vẽ',
    () => hop.screenFormRender(), 'Không có form nào');

  checkThrows(so, 'tên màn không có trong UI_SCHEMA thì hét ngay kèm ba tên đúng',
    () => hop.screenFormOpen('customerFrm', {}), 'customerForm');

  check(so, 'tệp màn không tự chạm DOM và không tự gọi máy chủ — mọi đường vẽ đi qua engine, `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 6',
    /google\.script|document\./.test(stripComments(catRuotScript(docTep('client/screen/formScreen.html'), 'formScreen'))), false);
}

module.exports = { chay };
