/**
 * Nhóm ca kiểm của `uiBuilder` và `screenBuild` — hai tệp dựng cây Block ở tài liệu 04 Phần 4 và tài liệu 03 Phần 8.
 *
 * Hai tệp này cố ý không chạm DOM, nên chúng là phần **đầu tiên** của tầng giao diện kiểm được offline. Phần đáng giá không phải "dựng đúng thì ra đúng" mà là "dựng sai thì có chặn không": luật "không có khóa `style` tự do" chỉ có thật nếu một khóa lạ thật sự bị ném lỗi.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('uiBuilder và screenBuild — dựng cây Block');

  let hop = null;
  try {
    hop = napClient(taoHopCat(), 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp uiBuilder và screenBuild', err);
  }

  // Hình dạng node. Mọi node cùng một bộ khóa nên engine không phải hỏi khóa có tồn tại không.
  const hop1 = hop.Block({});
  check(so, 'Block trần có vai box và đủ mười bảy khóa',
    [hop1.role, Object.keys(hop1).length], ['box', 17]);

  check(so, 'sáu hàm dựng chỉ điền vai, không sinh loại node mới',
    [hop.Card({}).role, hop.Row([]).role, hop.Text('x').role, hop.Field({ field: 'a' }).role, hop.Button('L').role, hop.Icon('close').role],
    ['card', 'row', 'text', 'field', 'button', 'icon']);

  check(so, 'Text, Button, Icon nhận thẳng chuỗi cho gọn',
    [hop.Text('chữ').text, hop.Button('LƯU').label, hop.Icon('pencil').icon], ['chữ', 'LƯU', 'pencil']);

  check(so, 'Row nhận thẳng mảng con', hop.Row([hop.Text('a')]).elements.length, 1);

  // Đây là luật "không có khóa `style` tự do" của tài liệu 04 Phần 4, và nó chỉ có thật khi khóa lạ bị chặn.
  checkThrows(so, 'khóa `style` tự do bị chặn',
    () => hop.Block({ style: 'color:red' }), 'không có khóa "style"');
  checkThrows(so, 'khóa gõ sai hoa thường bị chặn chứ không im lặng bỏ qua',
    () => hop.Card({ spatialconfig: {} }), 'không có khóa "spatialconfig"');
  checkThrows(so, 'khóa đúng nhưng đặt ở vai không dùng nó thì bị chặn',
    () => hop.Text({ text: 'x', field: 'a' }), 'vai "text" không có khóa "field"');
  checkThrows(so, 'vai lạ bị chặn', () => hop.Block({}, 'bảng'), 'Vai Block "bảng" không có');

  // `width` là lối viết tắt của tài liệu 03 Phần 8; nó phải chảy vào spatialConfig để mỗi node chỉ có một nơi nói về không gian.
  check(so, 'width viết tắt chảy vào spatialConfig',
    hop.Field({ field: 'a', width: '70%' }).spatialConfig, { width: '70%' });
  checkThrows(so, 'khai độ rộng hai nơi là mâu thuẫn nên bị chặn',
    () => hop.Field({ field: 'a', width: '70%', spatialConfig: { width: '30%' } }), 'hai nơi');

  // Chuỗi trần trong mảng con: một trường gõ sai tên không được lặng lẽ thành một slot không có.
  check(so, 'elements là chuỗi thì giữ nguyên làm tên slot',
    hop.Card({ elements: 'activityList' }).elements, 'activityList');
  checkThrows(so, 'chuỗi trần nằm trong mảng con bị chặn',
    () => hop.Card({ elements: ['activityList'] }), 'không phải Block');
  checkThrows(so, 'elements kiểu lạ bị chặn',
    () => hop.Card({ elements: 42 }), 'phải là mảng Block hoặc một chuỗi');

  section('screenBuild — lối viết tắt của UI_SCHEMA thành cây Block');

  // Đúng bản khai `customerForm` của tài liệu 03 Phần 8, rút bớt cho gọn nhưng giữ đủ cả bốn vùng.
  const form = hop.screenBuild({
    entity: 'customer',
    title: { add: 'Thêm Khách Hàng', edit: 'Sửa Khách Hàng' },
    infoBar: false,
    header: [
      { icon: 'close', tooltip: 'Hủy', action: 'cancelForm' },
      { icon: 'check', tooltip: 'Lưu', action: 'saveForm', align: 'right' }
    ],
    body: [
      { group: '', rows: [['companyName'], ['id', 'taxNumber'], [{ field: 'note', control: 'textarea' }]] }
    ],
    footer: [{ button: 'LƯU DỮ LIỆU', action: 'saveForm', className: 'btn-save-wide' }]
  }, 'customerForm');

  check(so, 'header thành hai nút glyph, giữ nguyên tooltip và align',
    form.header.map((n) => [n.role, n.icon, n.tooltip, n.action, n.align]),
    [['icon', 'close', 'Hủy', 'cancelForm', 'left'], ['icon', 'check', 'Lưu', 'saveForm', 'right']]);

  check(so, 'footer khai bằng khóa `button` thì thành nút chữ, không thành nút glyph',
    [form.footer[0].role, form.footer[0].label, form.footer[0].className],
    ['button', 'LƯU DỮ LIỆU', 'btn-save-wide']);

  check(so, 'một cụm thành một Card, mỗi mảng con thành một Row',
    [form.body.length, form.body[0].role, form.body[0].elements.map((h) => h.role)],
    [1, 'card', ['row', 'row', 'row']]);

  check(so, 'chuỗi trần trong hàng thành Field, cùng hàng thì cùng một Row',
    form.body[0].elements[1].elements.map((o) => [o.role, o.field]),
    [['field', 'id'], ['field', 'taxNumber']]);

  check(so, 'object trong hàng giữ được control khai thêm',
    [form.body[0].elements[2].elements[0].field, form.body[0].elements[2].elements[0].control],
    ['note', 'textarea']);

  check(so, 'title giữ nguyên hình dạng đã khai, việc chọn add hay edit không thuộc tệp này',
    [form.title, form.infoBar, form.entity], [{ add: 'Thêm Khách Hàng', edit: 'Sửa Khách Hàng' }, false, 'customer']);

  // Màn `view` khai thẳng bằng cây Block vì nó không lặp theo trường. Nhận diện theo nội dung, không theo tên màn.
  const view = hop.screenBuild({
    entity: 'customer',
    infoBar: true,
    header: [{ icon: 'more', tooltip: 'Khác', menu: [{ label: 'Bám theo ô đang chọn', action: 'toggleFollowSelection', toggle: true }] }],
    body: [hop.Card({ title: 'LỊCH SỬ LÀM VIỆC', elements: 'activityList' })]
  }, 'view');

  check(so, 'thân khai bằng cây Block thì đi qua nguyên vẹn',
    [view.body.length, view.body[0].title, view.body[0].elements], [1, 'LỊCH SỬ LÀM VIỆC', 'activityList']);

  check(so, 'menu đi qua nguyên trạng, phép kiểm toggle với value thuộc bộ tự kiểm lúc khởi động',
    view.header[0].menu.length, 1);

  checkThrows(so, 'thân trộn cây Block với cụm group/rows thì bị chặn',
    () => hop.screenBuild({ entity: 'customer', body: [hop.Card({}), { group: '', rows: [] }] }, 'lẫn'), 'trộn cây Block');
  checkThrows(so, 'màn thiếu entity thì bị chặn, vì bộ thu thập lúc lưu dựa vào nó',
    () => hop.screenBuild({ body: [] }, 'thiếu'), 'thiếu khóa `entity`');
  checkThrows(so, 'hàng không phải mảng thì bị chặn',
    () => hop.screenBuild({ entity: 'customer', body: [{ group: '', rows: ['companyName'] }] }, 'x'), 'phải là mảng, vì cùng một mảng là cùng một hàng');
  checkThrows(so, 'cụm thiếu rows thì bị chặn',
    () => hop.screenBuild({ entity: 'customer', body: [{ group: 'A' }] }, 'x'), 'phải có khóa `rows`');
  checkThrows(so, 'phần tử trong hàng không phải tên trường thì bị chặn',
    () => hop.screenBuild({ entity: 'customer', body: [{ group: '', rows: [[{ control: 'text' }]] }] }, 'x'), 'phải là tên trường');
  checkThrows(so, 'header khai bằng một mục lẻ thay vì mảng thì bị chặn',
    () => hop.screenBuild({ entity: 'customer', header: { icon: 'close' } }, 'x'), 'phải là mảng, kể cả khi chỉ có một mục');

  check(so, 'vùng không khai thì thành mảng rỗng, để engine ẩn hẳn vùng đó',
    [hop.screenBuild({ entity: 'customer' }, 'trống').header, hop.screenBuild({ entity: 'customer' }, 'trống').footer, hop.screenBuild({ entity: 'customer' }, 'trống').body],
    [[], [], []]);
}

module.exports = { chay };
