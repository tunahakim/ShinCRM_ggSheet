/**
 * Ca kiểm của `client/ui/actions.html` — bảng mười lăm hành động. Tài liệu 04 Phần 7.
 *
 * Chỗ đáng kiểm nhất ở đây là loại hỏng-trong-im-lặng: một tên rơi khỏi bảng thì nút bấm không làm gì; ba cửa mở form không tự đóng khi khách đã xóa mềm; nút chưa dựng của chặng sau lặng lẽ không phản hồi. Cả ba đều không làm bộ kiểm nào khác đỏ.
 *
 * `callServer` thật trả về Promise, ở đây thay bằng một thenable gọi ngay. Thứ tự "đổi RAM trước, gửi sau" vẫn quan sát được, mà không phải biến cả bộ kiểm thành bất đồng bộ.
 */

const { napClient, taoHopCat, catRuotScript, docTep } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { khungGia } = require('../lib/khung-gia');
const { stripComments } = require('../lib/strip-comments');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');
const { TEN_HANH_DONG } = require('./uiSchema');

const KHACH = [
  { id: 'CUS-000001', companyName: 'Công ty Thép Hòa Phát', phone: '0912345678', contactPerson: 'Anh Tuấn', note: 'Khách quen, gọi buổi sáng', recordStatus: 'active' },
  { id: 'CUS-000002', companyName: 'Thép Việt Đức', phone: '0987654321', note: '', recordStatus: 'deleted' }
];

const GIAO_DICH = [
  { id: 'ACT-000001', customerId: 'CUS-000001', workDate: '2026-09-01', taskType: 'Gọi điện', content: 'Chào hàng lần đầu', priority: 'Cao', dueAt: '2026-09-10 09:00', recordStatus: 'active' },
  { id: 'ACT-000002', customerId: 'CUS-000001', workDate: '2026-09-03', taskType: 'Chốt đơn', content: 'Khách đồng ý giá', recordStatus: 'deleted' }
];

/** Thenable gọi ngay, thay cho Promise của `callServer`. */
function loiHua(giaTri) {
  return { then: (fn) => loiHua(fn(giaTri)) };
}

/** Hộp cát: cả tầng dữ liệu, bộ máy vẽ, hai tệp màn, cộng hai cửa ra ngoài được thay bằng bản ghi lại. */
function dungCanh() {
  const hop = napClient(taoHopCat(),
    'client/util/textNormalize.html', 'client/schema/schemaAccess.html', 'client/ram/store.html',
    'client/ram/prefs.html', 'client/ram/screenState.html', 'client/util/valueText.html',
    'client/ui/icons.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html',
    'client/ui/renderEngine.html', 'client/ui/slots.html', 'client/schema/uiSchema.html',
    'client/schema/fieldLogic.html', 'client/screen/viewScreen.html', 'client/screen/formScreen.html',
    'client/ui/actions.html');

  hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  hop.document = khungGia([hop.SCREEN_VIEW_HISTORY_ID]);
  hop.storeReset();
  hop.prefsReset();
  hop.screenStateReset();
  KHACH.forEach((c) => hop.Store.upsertRecord('customer', c));
  GIAO_DICH.forEach((a) => hop.Store.upsertRecord('activity', a));
  hop.Store.config = { counters: { customer: 12, activity: 34 } };
  hop.Store.activityState = hop.STORE_READY;

  hop._daGui = [];
  hop._ramLucGui = [];
  hop.callServer = (name, args) => {
    hop._daGui.push(name + '(' + JSON.stringify(args) + ')');
    if (!args || !args.length) { return loiHua({ ok: true, rowMaps: {} }); }
    hop._ramLucGui.push(hop.Prefs[args[0]]);
    const tra = { followSelection: hop.Prefs.followSelection, autoRenderView: hop.Prefs.autoRenderView, activityView: hop.Prefs.activityView };
    tra[args[0]] = args[1];
    return loiHua({ ok: true, prefs: tra });
  };

  hop._daNapLai = [];
  hop.sidebarBoot = () => {
    hop._daNapLai.push(hop.ScreenState.screen + ':' + hop.ScreenState.formStack.length);
    return 'đã nạp lại';
  };

  // Hộp tìm khách sống ngoài hộp cát này vì nó chạm DOM thật. Thay bằng bản ghi lại để `toggleSearchPanel` chạy tới cuối
  // thân hàm — không có nó thì hành động nổ "not defined" và ca kiểm đếm việc chưa dựng lại tưởng đó là một việc đã xong.
  hop._daMoHop = [];
  hop.searchToggle = () => {
    hop._daMoHop.push('toggle');
    return { focusId: 'shin-search-input' };
  };
  hop.syncPanelToggle = () => 'fbm-panel';

  return hop;
}

function chay(so) {
  section('actions — bảng mười lăm tên, và ranh giới của tệp');

  let hop;
  try {
    hop = dungCanh();
  } catch (err) {
    return ghiLoiNap(so, 'nạp bảng hành động cùng bộ máy vẽ, bốn màn và kho RAM thật', err);
  }

  check(so, 'đủ mười lăm tên và đúng thứ tự bảng tài liệu 04 Phần 7 — bảng này là chỗ nhìn một phát thấy hết việc sidebar làm được',
    Object.keys(hop.ACTIONS), TEN_HANH_DONG);

  check(so, '`ACTIONS_NAMES` tính từ chính bảng nên không có bản danh sách thứ hai để lệch',
    hop.ACTIONS_NAMES, Object.keys(hop.ACTIONS));

  check(so, 'mọi ô trong bảng là hàm — một tên trỏ vào `undefined` hiện ra đúng dạng "bấm nút không có gì xảy ra"',
    TEN_HANH_DONG.filter((ten) => typeof hop.ACTIONS[ten] !== 'function'), []);

  check(so, 'tệp hành động không chạm DOM và không gọi `google.script.run` — đặt con trỏ và hiện lỗi là việc của bộ phát click',
    /google\.script|document\./.test(stripComments(catRuotScript(docTep('client/ui/actions.html'), 'actions'))), false);

  section('actions — bốn núm đổi cách xem: đổi RAM trước, gửi sau');

  hop.ACTIONS.toggleFollowSelection();
  check(so, 'lật núm bám theo ô: RAM đã đổi **trước** lúc gọi máy chủ — tài liệu 07 Phần 6 chốt đúng thứ tự này',
    [hop.Prefs.followSelection, hop._ramLucGui[0], hop._daGui[0], hop.document._els['sidebar-header'].innerHTML.indexOf('aria-pressed="false"') > 0],
    [false, false, 'userPrefsWrite(["followSelection",false])', true]);

  hop.ACTIONS.toggleAutoRenderView();
  check(so, 'lật núm tự sắp xếp sheet: cùng đường, và khối núm máy chủ trả về được nhận lại',
    [hop.Prefs.autoRenderView, hop._ramLucGui[1], hop._daGui[1]],
    [false, false, 'userPrefsWrite(["autoRenderView",false])']);

  hop.screenStateSetCustomer('CUS-000001');
  hop.screenViewRender();
  const els = hop.document._els;
  const infoTruoc = els['sidebar-info'].innerHTML;

  hop.ACTIONS.setActivityView({ value: 'all' });
  check(so, 'đổi nấc xem chỉ vẽ lại card lịch sử: giao dịch đã xóa hiện ra mà khối thông tin chung không bị dựng lại',
    [hop.Prefs.activityView,
      els[hop.SCREEN_VIEW_HISTORY_ID].innerHTML.indexOf('ACT-000002') !== -1,
      els['sidebar-info'].innerHTML === infoTruoc,
      hop._daGui[2]],
    ['all', true, true, 'userPrefsWrite(["activityView","all"])']);

  checkThrows(so, 'mục menu thiếu `data-value` là bảng khai hỏng, và nó hét lên chứ không lặng lẽ giữ nấc cũ',
    () => hop.ACTIONS.setActivityView({}), 'data-value');

  checkThrows(so, 'nấc lạ bị `prefsSet` chặn, thông báo kèm đủ ba nấc đúng',
    () => hop.ACTIONS.setActivityView({ value: 'tatca' }), 'all, active, deleted');

  check(so, 'hai lượt hỏng không gửi gì lên máy chủ và không đổi nấc — RAM với `UserProperties` không lệch nhau vì một cú bấm sai',
    [hop._daGui.length, hop.Prefs.activityView], [3, 'all']);

  section('actions — bốn cửa mở form');

  const hop2 = dungCanh();

  checkThrows(so, 'chưa chọn khách mà bấm sửa khách: nói cả hai đường chọn khách chứ không mở một form trắng',
    () => hop2.ACTIONS.openCustomerForm(), 'Chọn khách hàng trước');

  const raTrang = hop2.ACTIONS.openCustomerFormBlank();
  check(so, 'thêm khách mới không cần khách đang xem, ô mã mang mã xem trước từ bộ đếm, tiêu đề là "Thêm"',
    [hop2.ScreenState.screen, hop2.screenStateFormRecord().id, raTrang.focusId, raTrang.header.indexOf('Thêm Khách Hàng') !== -1],
    ['customerForm', 'CUS-000013', 'shin-f-customer-companyName', true]);

  hop2.screenStateGoView();
  hop2.screenStateSetCustomer('CUS-000001');

  const raSua = hop2.ACTIONS.openCustomerForm();
  check(so, 'sửa khách đang xem: cờ thêm-mới tắt nên tiêu đề là "Sửa", con trỏ về ô tên khách',
    [hop2.screenStateTop().themMoi, raSua.focusId, raSua.header.indexOf('Sửa Khách Hàng') !== -1],
    [false, 'shin-f-customer-companyName', true]);

  hop2.screenStateGoView();
  const raThemGd = hop2.ACTIONS.openActivityForm({});
  check(so, 'không có `pick` là thêm giao dịch: `customerId` điền sẵn từ khách đang xem',
    [hop2.screenStateFormRecord().customerId, hop2.screenStateFormRecord().id,
      raThemGd.focusId, raThemGd.header.indexOf('Thêm Giao Dịch') !== -1],
    ['CUS-000001', 'ACT-000035', 'shin-f-activity-workDate', true]);

  hop2.screenStateGoView();
  const raSuaGd = hop2.ACTIONS.openActivityForm({ pick: 'ACT-000001' });
  check(so, 'có `pick` là sửa đúng dòng đó — một tên hành động hai đường, vì `UI_SCHEMA` chỉ khai được một tên cho cùng một form',
    [hop2.screenStateTop().themMoi, hop2.screenStateFormRecord().content, raSuaGd.header.indexOf('Sửa Giao Dịch') !== -1],
    [false, 'Chào hàng lần đầu', true]);

  checkThrows(so, 'mã giao dịch không có trong danh sách của khách đang xem: nói rõ mã nào rồi bảo nạp lại',
    () => hop2.ACTIONS.openActivityForm({ pick: 'ACT-999999' }), 'ACT-999999');

  hop2.screenStateGoView();
  const raGhiChu = hop2.ACTIONS.openNoteForm();
  check(so, 'cửa ghi chú mở màn ghi chú của chính khách đang xem, con trỏ vào ô ghi chú',
    [hop2.ScreenState.screen, raGhiChu.focusId, raGhiChu.header.indexOf('Ghi Chú Khách Hàng') !== -1],
    ['noteForm', 'shin-f-customer-note', true]);

  section('actions — khách đã xóa mềm thì ba cửa sửa đóng lại');

  hop2.screenStateGoView();
  hop2.screenStateSetCustomer('CUS-000002');

  const daDong = ['openCustomerForm', 'openActivityForm', 'openNoteForm'].filter((ten) => {
    try {
      hop2.ACTIONS[ten]({});
      return false;
    } catch (err) {
      return /đã xóa nên không sửa được/.test(String(err.message));
    }
  });
  check(so, 'đúng ba cửa sửa đóng lại khi khách đang xem đã xóa mềm — tài liệu 03 Phần 8',
    daDong, ['openCustomerForm', 'openActivityForm', 'openNoteForm']);

  const raTrangSauXoa = hop2.ACTIONS.openCustomerFormBlank();
  check(so, 'cửa thêm khách vẫn mở: thêm khách mới chẳng liên quan gì tới khách đang xem',
    [hop2.ScreenState.screen, raTrangSauXoa.focusId], ['customerForm', 'shin-f-customer-companyName']);

  section('actions — hủy đóng một lớp, nạp lại dọn hết trước khi gọi');

  const hop3 = dungCanh();
  hop3.screenStateSetCustomer('CUS-000001');
  hop3.ACTIONS.openActivityForm({});
  hop3.ACTIONS.openNoteForm();

  const veGiaoDich = hop3.ACTIONS.cancelForm();
  check(so, 'nút Hủy đóng đúng một form: về form giao dịch bên dưới chứ không rơi thẳng về màn xem',
    [hop3.ScreenState.screen, hop3.ScreenState.formStack.length, veGiaoDich.focusId],
    ['activityForm', 1, 'shin-f-activity-workDate']);

  const raNapLai = hop3.ACTIONS.reloadAll();
  check(so, 'Nạp lại dọn ngăn xếp form **trước** khi gọi `sidebarBoot`, vì lượt nạp dọn sạch `Store` và form đang mở sẽ trỏ vào bản ghi vừa bị bỏ',
    [hop3._daNapLai, hop3.ScreenState.screen, hop3.ScreenState.formStack.length, raNapLai],
    [['view:0'], 'view', 0, 'đã nạp lại']);

  checkThrows(so, 'không có form nào mà bấm Hủy thì hét lên — đó là dấu hiệu màn và ngăn xếp đã lệch nhau',
    () => hop3.ACTIONS.cancelForm(), 'Không có form nào');

  section('actions — nguồn-chọn khách');

  const hop4 = dungCanh();
  const raChon = hop4.ACTIONS.setCurrentCustomer({ pick: 'CUS-000002' });
  check(so, 'chọn khách đã xóa mềm vẫn xem được, và khối thông tin chung mang dấu "Đã xóa" — xem thì cho, sửa thì không',
    [hop4.ScreenState.currentCustomerId,
      raChon.info.indexOf('Thép Việt Đức') !== -1, raChon.info.indexOf('Đã xóa') !== -1],
    ['CUS-000002', true, true]);

  checkThrows(so, 'thiếu `data-pick` là Block khai thiếu, không phải người dùng làm sai',
    () => hop4.ACTIONS.setCurrentCustomer({}), 'data-pick');

  checkThrows(so, 'mã khách không có trong kho thì để lỗi của `Store.getCustomer` bay lên — `[RÀNG BUỘC CỨNG]` tài liệu 05 Phần 9, đổi thành `null` là vẽ ra một khách vừa mất sạch dữ liệu',
    () => hop4.ACTIONS.setCurrentCustomer({ pick: 'CUS-999999' }), 'CUS-999999');

  section('actions — việc của chặng sau, và ba đường vừa nối vào chặng lưu');

  const hop5 = dungCanh();
  hop5.screenStateSetCustomer('CUS-000001');
  hop5.screenViewRender();

  const chuaDung = TEN_HANH_DONG.filter((ten) => {
    try {
      hop5.ACTIONS[ten]({ pick: 'ACT-000001', value: 'all' });
      return false;
    } catch (err) {
      return /chưa dựng/.test(String(err.message));
    }
  });
  check(so, 'mọi hành động sidebar đã có đường xử lý, nút vẽ sheet quản trị gọi máy chủ',
    chuaDung.slice().sort(),
    []);

  checkThrows(so, 'nút xóa một giao dịch kiểm `pick` trước khi chạm bộ chờ, nên lỗi khai Block không bị đường xóa che mất',
    () => hop5.ACTIONS.deleteActivity({}), 'data-pick');

  // Ba đường của chặng lưu sống ở `client/save/*`, ngoài hộp cát này. Thay bằng bản ghi lại để kiểm bảng gọi đúng tên và
  // đúng tham số: phép đếm việc chưa dựng ở trên chỉ thấy "có ném lỗi", nên một tên hàm gõ sai vẫn lọt qua được nó.
  const hop6 = dungCanh();
  hop6._daGoi = [];
  hop6.saveFlowSubmit = () => { hop6._daGoi.push('saveFlowSubmit'); return 'đã lưu'; };
  hop6.pendingDeleteAdd = (entity, id) => { hop6._daGoi.push('pendingDeleteAdd(' + entity + ',' + id + ')'); return 'đã chờ'; };
  hop6.pendingDeleteUndo = () => { hop6._daGoi.push('pendingDeleteUndo'); return 'đã hoàn tác'; };

  check(so, 'nút Lưu giao thẳng cho `saveFlowSubmit` và trả nguyên kết quả về, để bộ phát click lấy được `focusId` của ô sai đầu tiên',
    [hop6.ACTIONS.saveForm(), hop6._daGoi.join(' ')],
    ['đã lưu', 'saveFlowSubmit']);

  hop6._daGoi = [];
  check(so, 'nút thùng rác chỉ đưa mã vào bộ chờ, không gọi máy chủ — xóa ngay lúc bấm thì không còn gì để hoàn tác',
    [hop6.ACTIONS.deleteActivity({ pick: 'ACT-000001' }), hop6._daGoi.join(' '), hop6._daGui.length],
    ['đã chờ', 'pendingDeleteAdd(activity,ACT-000001)', 0]);

  hop6._daGoi = [];
  check(so, 'nút Hoàn tác gọi đúng đường bỏ mặt nạ',
    [hop6.ACTIONS.undoDelete(), hop6._daGoi.join(' ')],
    ['đã hoàn tác', 'pendingDeleteUndo']);
}

module.exports = { chay };
