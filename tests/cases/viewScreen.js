/**
 * Ca kiểm của `client/screen/viewScreen.html` — màn xem khách. Tài liệu 03 Phần 8, tài liệu 04 Phần 6.
 *
 * Bốn thứ đáng kiểm nhất, cả bốn đều là loại hỏng-trong-im-lặng: mã card lịch sử ở hai tệp lệch nhau nên nút đổi nấc xem không vẽ lại gì; đổi khách mà chỉ vẽ lại một trong ba vùng nên hai vùng kia đứng ở khách cũ; đổi khách lúc đang mở form nên bản nháp bay mất; và tệp màn tự chạm DOM thay vì đi qua engine.
 */

const { napClient, taoHopCat, catRuotScript, docTep } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { khungGia } = require('../lib/khung-gia');
const { stripComments } = require('../lib/strip-comments');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

const KHACH = [
  { id: 'CUS-000001', companyName: 'Công ty Thép Hòa Phát', phone: '0912345678', province: 'Hà Nội', contactPerson: 'Anh Tuấn', note: 'Khách quen, gọi buổi sáng', recordStatus: 'active' },
  { id: 'CUS-000002', companyName: 'Thép Việt Đức', phone: '0987654321', note: '', recordStatus: 'deleted' }
];

const GIAO_DICH = [
  { id: 'ACT-000001', customerId: 'CUS-000001', workDate: '2026-09-01', taskType: 'Gọi điện', content: 'Chào hàng lần đầu', recordStatus: 'active' },
  { id: 'ACT-000002', customerId: 'CUS-000001', workDate: '2026-09-03', taskType: 'Chốt đơn', content: 'Khách đồng ý giá', recordStatus: 'deleted' }
];

/** Hộp cát đủ cả tầng dữ liệu, bộ máy vẽ, bảng khai bố cục và khung giả — đúng những gì màn xem cần và không hơn. */
function dungCanh() {
  const hop = napClient(taoHopCat(),
    'client/util/textNormalize.html', 'client/schema/schemaAccess.html', 'client/ram/store.html',
    'client/ram/prefs.html', 'client/ram/screenState.html', 'client/util/valueText.html',
    'client/ui/icons.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html',
    'client/ui/renderEngine.html', 'client/ui/slots.html', 'client/schema/uiSchema.html',
    'client/screen/viewScreen.html');

  hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  hop.document = khungGia([hop.SCREEN_VIEW_HISTORY_ID]);
  hop.storeReset();
  hop.prefsReset();
  hop.screenStateReset();
  KHACH.forEach((c) => hop.Store.upsertRecord('customer', c));
  GIAO_DICH.forEach((a) => hop.Store.upsertRecord('activity', a));
  hop.Store.activityState = hop.STORE_READY;
  return hop;
}

function chay(so) {
  section('viewScreen — khách đang xem và bản ghi cho lượt vẽ');

  let hop;
  try {
    hop = dungCanh();
  } catch (err) {
    return ghiLoiNap(so, 'nạp viewScreen cùng bộ máy vẽ và bảng khai bố cục thật', err);
  }

  check(so, 'mã card lịch sử ở viewScreen khớp id khai trong UI_SCHEMA.view — lệch một chữ là nút đổi nấc xem không vẽ lại gì',
    hop.SCREEN_VIEW_HISTORY_ID, hop.UI_SCHEMA.view.body[1].id);

  check(so, 'chưa chọn khách thì không có bản ghi và không có ai bị coi là đã xóa',
    [hop.screenViewCustomer(), hop.screenViewDeleted()], [null, false]);

  hop.screenStateSetCustomer('CUS-000404');
  checkThrows(so, 'mã trỏ tới khách không còn trong RAM thì hét lên chứ không ra null — đổi thành null là vẽ một khách trắng, tài liệu 05 Phần 9',
    () => hop.screenViewCustomer(), 'CUS-000404');

  hop.screenStateSetCustomer('CUS-000001');
  check(so, 'khách còn dùng: có bản ghi, không mang dấu đã xóa',
    [hop.screenViewCustomer().companyName, hop.screenViewDeleted()], ['Công ty Thép Hòa Phát', false]);

  hop.screenStateSetCustomer('CUS-000002');
  check(so, 'khách đã xóa mềm bị nhận ra — đây là chỗ ba cửa mở form đọc để tự đóng',
    hop.screenViewDeleted(), true);

  hop.screenStateSetCustomer('CUS-000001');
  const banGhi = hop.screenViewRecords();
  check(so, 'bản ghi cho lượt vẽ có cả khóa search dù rỗng, để hộp gợi ý có đúng một chỗ đổ kết quả vào',
    [Object.keys(banGhi).sort(), Array.isArray(banGhi.search), banGhi.search.length],
    [['customer', 'search'], true, 0]);
  section('viewScreen — vẽ cả màn, vẽ lại một card, và đổi khách');

  const els = hop.document._els;
  hop.screenViewRender();
  check(so, 'cả bốn vùng nhận đúng phần của nó: header là hàng icon, thông tin chung là tên khách, thân là hai card, chân bị ẩn vì màn xem không khai',
    [els['sidebar-header'].innerHTML.indexOf('data-action="toggleSearchPanel"') > 0,
      els['sidebar-info'].innerHTML.indexOf('Công ty Thép Hòa Phát') > 0,
      els['sidebar-body'].innerHTML.indexOf('GHI CHÚ') > 0,
      els['sidebar-body'].innerHTML.indexOf('LỊCH SỬ LÀM VIỆC') > 0,
      els['sidebar-info'].hidden, els['sidebar-footer'].hidden],
    [true, true, true, true, false, true]);

  check(so, 'card ghi chú lấy đúng ghi chú của khách đang xem, và ô đó mang dấu chỉ đọc cho bộ thu thập lúc lưu',
    [els['sidebar-body'].innerHTML.indexOf('Khách quen, gọi buổi sáng') > 0,
      els['sidebar-body'].innerHTML.indexOf('data-field="customer.note"') > 0,
      els['sidebar-body'].innerHTML.indexOf('data-readonly="1"') > 0],
    [true, true, true]);

  // Hai đường vẽ ghi vào hai chỗ khác nhau trong khung giả: vẽ cả màn thì chuỗi card nằm trong `sidebar-body`, còn vẽ lại một card thì engine ghi thẳng vào phần tử mang id của card. Khung giả phẳng nên không có chuyện phần tử con bị cha thay nội dung — vì vậy mỗi phép kiểm phải đọc đúng bề mặt mà đường vẽ của nó ghi vào.
  check(so, 'nấc xem ngầm định là "chỉ còn dùng" nên dòng đã xóa không có trên màn',
    [els['sidebar-body'].innerHTML.indexOf('ACT-000001') > 0,
      els['sidebar-body'].innerHTML.indexOf('ACT-000002') > 0],
    [true, false]);

  hop.prefsSet('activityView', 'all');
  hop.screenViewActivityCard();
  check(so, 'đổi nấc xem thì vẽ lại đúng card lịch sử: dòng đã xóa hiện ra mà hàng tiêu đề của card vẫn còn',
    [els[hop.SCREEN_VIEW_HISTORY_ID].innerHTML.indexOf('ACT-000002') > 0,
      els[hop.SCREEN_VIEW_HISTORY_ID].innerHTML.indexOf('shin-card-head') >= 0,
      els['sidebar-info'].innerHTML.indexOf('Công ty Thép Hòa Phát') > 0],
    [true, true, true]);
  hop.screenViewSetCustomer('CUS-000002');
  check(so, 'đổi khách thì vẽ lại cả màn: khối thông tin chung, card ghi chú và card lịch sử đều theo khách mới, không cái nào đứng ở khách cũ',
    [els['sidebar-info'].innerHTML.indexOf('Thép Việt Đức') > 0,
      els['sidebar-info'].innerHTML.indexOf('Công ty Thép Hòa Phát') === -1,
      els['sidebar-body'].innerHTML.indexOf('Khách quen, gọi buổi sáng') === -1,
      els[hop.SCREEN_VIEW_HISTORY_ID].innerHTML.indexOf('ACT-000001') === -1,
      els['sidebar-body'].innerHTML.indexOf('ACT-000001') === -1],
    [true, true, true, true, true]);

  check(so, 'khách đang xem đã xóa mềm thì khối thông tin chung mang thêm chip "Đã xóa"',
    els['sidebar-info'].innerHTML.indexOf('shin-badge-deleted') > 0, true);

  section('viewScreen — đang mở form thì không giật màn dưới chân người đang gõ');

  hop.screenViewSetCustomer('CUS-000001');
  hop.screenStateOpenForm('activityForm', 'activity', {});
  const truoc = els['sidebar-info'].innerHTML;
  const ra = hop.screenViewSetCustomer('CUS-000002');

  check(so, 'đang mở form: đổi khách chỉ đổi số, không vẽ lại gì — bản nháp chỉ cất được khi có bộ thu thập, chưa có thì không được giật màn',
    [ra, hop.ScreenState.currentCustomerId, els['sidebar-info'].innerHTML === truoc],
    [null, 'CUS-000002', true]);

  check(so, 'đang mở form: gọi vẽ lại card lịch sử thì bỏ qua chứ không ném lỗi, vì card đó không có trên màn',
    hop.screenViewActivityCard(), null);

  hop.screenViewGo();
  check(so, 'về màn xem thì ngăn xếp form rỗng, màn là view, và nấc xem chọn dở vẫn còn nguyên',
    [hop.ScreenState.formStack.length, hop.ScreenState.screen, hop.Prefs.activityView,
      els['sidebar-info'].innerHTML.indexOf('Thép Việt Đức') > 0],
    [0, 'view', 'all', true]);

  check(so, 'tệp màn không tự chạm DOM và không tự gọi máy chủ — mọi đường vẽ đi qua engine, `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 6',
    /google\.script|document\./.test(stripComments(catRuotScript(docTep('client/screen/viewScreen.html'), 'viewScreen'))), false);
}

module.exports = { chay };
