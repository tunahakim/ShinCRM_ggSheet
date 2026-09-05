/**
 * Ca kiểm của `client/ram/screenState.html` — ba thứ làm nên trạng thái giao diện. Tài liệu 04 Phần 8.
 *
 * Trọng tâm là ngăn xếp form, vì nó là chỗ duy nhất có thể lệch: `screen` là một trường thật chứ không suy ra từ đỉnh ngăn xếp, nên push và pop phải giữ hai bên khớp nhau. Kiểm luôn cái bẫy `window.screen` — nếu ai đó đổi `ScreenState.screen` thành một biến toàn cục rời thì phép kiểm này đỏ.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('screenState — ba thứ của trạng thái và ngăn xếp form');

  let hop;
  try {
    hop = napClient(taoHopCat(), 'client/ram/screenState.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp screenState', err);
  }

  check(so, 'trạng thái trắng: không khách, màn view, ngăn xếp rỗng',
    [hop.ScreenState.currentCustomerId, hop.ScreenState.screen, hop.ScreenState.formStack.length], ['', 'view', 0]);

  check(so, 'bốn màn đúng như tài liệu khai', hop.SCREEN_NAMES, ['view', 'customerForm', 'activityForm', 'noteForm']);

  // Bẫy `window.screen`: giữ trong một object thì gán mới ăn. Đây là lý do tệp không dùng ba biến rời.
  hop.ScreenState.screen = 'customerForm';
  check(so, 'gán màn vào object thì ăn thật, không bị getter của trình duyệt chặn', hop.ScreenState.screen, 'customerForm');
  hop.screenStateReset();

  check(so, 'đổi khách trả về mã đã chuẩn hóa thành chuỗi', hop.screenStateSetCustomer(17), '17');
  check(so, 'null và undefined thành chuỗi rỗng chứ không thành chữ "null"',
    [hop.screenStateSetCustomer(null), hop.screenStateSetCustomer(undefined)], ['', '']);

  // Ngăn xếp: mở hai form lồng nhau rồi đóng dần, kiểm `screen` bám theo đỉnh ở từng bước.
  hop.screenStateReset();
  hop.screenStateSetCustomer('CUS-000004');
  const dinh1 = hop.screenStateOpenForm('activityForm', 'activity', { id: 'ACT-000009' });
  check(so, 'mở form: đỉnh mang màn, thực thể, bản ghi gốc và bản nháp rỗng',
    [dinh1.screen, dinh1.entity, dinh1.record.id, Object.keys(dinh1.draft).length], ['activityForm', 'activity', 'ACT-000009', 0]);
  check(so, 'mở form thì trường screen bám theo đỉnh', hop.ScreenState.screen, 'activityForm');

  hop.screenStateSetDraft({ content: 'đang gõ dở' });
  hop.screenStateOpenForm('noteForm', 'customer', { note: 'ghi chú cũ' });
  check(so, 'form lồng: ngăn xếp hai tầng, màn là tầng trên', [hop.ScreenState.formStack.length, hop.ScreenState.screen], [2, 'noteForm']);

  const conLai = hop.screenStateCloseForm();
  check(so, 'đóng form lồng thì đỉnh mới là form cần vẽ lại, mang theo bản nháp của chính nó',
    [conLai.screen, conLai.draft.content, hop.ScreenState.screen], ['activityForm', 'đang gõ dở', 'activityForm']);

  check(so, 'đóng form cuối trả về null và về màn view', hop.screenStateCloseForm(), null);
  check(so, 'đóng hết thì màn là view', hop.ScreenState.screen, 'view');

  check(so, 'đổi khách KHÔNG dọn ngăn xếp form — cấm hay cho phép là việc của hành động',
    (() => { hop.screenStateOpenForm('noteForm', 'customer', {}); hop.screenStateSetCustomer('CUS-000002'); return hop.ScreenState.formStack.length; })(), 1);

  check(so, 'goView bỏ hết form đang mở', [hop.screenStateGoView(), hop.ScreenState.formStack.length], ['view', 0]);

  // Bản nháp đè lên bản ghi gốc, không sửa bản gốc.
  hop.screenStateOpenForm('customerForm', 'customer', { id: 'CUS-000001', companyName: 'Tên cũ', phone: '0900' });
  hop.screenStateSetDraft({ companyName: 'Tên mới' });
  const de = hop.screenStateFormRecord();
  check(so, 'dữ liệu vẽ form: bản nháp đè lên bản ghi gốc, trường không gõ thì giữ nguyên',
    [de.companyName, de.phone, de.id], ['Tên mới', '0900', 'CUS-000001']);
  check(so, 'bản ghi gốc không bị bản nháp làm bẩn', hop.screenStateTop().record.companyName, 'Tên cũ');

  hop.screenStateGoView();
  check(so, 'không có form nào mở thì không có dữ liệu form để vẽ', hop.screenStateFormRecord(), null);

  checkThrows(so, 'mở màn không có tên trong bốn màn thì nói rõ bốn màn là gì',
    () => hop.screenStateOpenForm('khachForm', 'customer', {}), 'Bốn màn');
  checkThrows(so, 'view không đẩy vào ngăn xếp được, và câu lỗi chỉ đúng hàm phải gọi',
    () => hop.screenStateOpenForm('view', 'customer', {}), 'screenStateGoView');
  checkThrows(so, 'mở form mà thiếu thực thể thì chặn — thực thể quyết định form ghi vào sheet nào',
    () => hop.screenStateOpenForm('noteForm', '', {}), 'thiếu tên thực thể');
  checkThrows(so, 'cất bản nháp khi không có form nào mở thì chặn',
    () => hop.screenStateSetDraft({ a: 1 }), 'Không có form nào đang mở để cất');
  checkThrows(so, 'đóng form khi không có form nào mở thì chặn và nói màn hiện tại',
    () => hop.screenStateCloseForm(), 'Không có form nào đang mở để đóng');
}

module.exports = { chay };
