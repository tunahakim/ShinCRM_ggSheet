/**
 * Ca kiểm của `client/ui/renderEngine.html` — nửa dựng chuỗi HTML của bộ máy vẽ. Tài liệu 04 Phần 5, 6, 9.
 *
 * Kiểm được offline vì engine cố ý tách hai nửa: nửa dựng chuỗi không chạm DOM, nửa gán thì chỉ có ba hàm. Bốn thứ đáng kiểm nhất, và cả bốn đều là loại hỏng-trong-im-lặng: ký tự đặc biệt trong tên công ty, `spatialConfig` khai rồi mà bố cục không đổi, `data-field` thiếu đường dẫn đầy đủ nên bộ thu thập lúc lưu bỏ sót ô, và luật chỉ-đọc bị dòng `UI_SCHEMA` mở khóa.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');
const { khungGia } = require('../lib/khung-gia');

function chay(so) {
  section('renderEngine — thoát ký tự và spatialConfig thành style');

  let hop;
  try {
    hop = napClient(taoHopCat(),
      'client/ui/uiBuilder.html', 'client/ui/screenBuild.html', 'client/ui/icons.html',
      'client/util/valueText.html', 'client/schema/schemaAccess.html', 'client/ui/renderEngine.html');
    hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  } catch (err) {
    return ghiLoiNap(so, 'nạp renderEngine cùng bảng khai trường thật', err);
  }

  const kg = hop.renderSpatialStyle;

  check(so, 'năm ký tự phá HTML đều bị thoát',
    hop.renderEscape('Cty "A" & <b>\'x\'</b>'), 'Cty &quot;A&quot; &amp; &lt;b&gt;&#39;x&#39;&lt;/b&gt;');

  check(so, 'thuộc tính rỗng thì không sinh ra, để `data-field=""` không lừa được bộ thu thập',
    [hop.renderAttr('data-field', ''), hop.renderAttr('data-field', null), hop.renderAttr('id', 'a"b')],
    ['', '', ' id="a&quot;b"']);

  check(so, 'khai rỗng thì không sinh style, vì mặc định đã nói một lần ở components.html', kg({}), '');
  check(so, 'width là số hiểu là px, là chuỗi thì giữ nguyên đơn vị',
    [kg({ width: 120 }), kg({ width: '70%' })],
    ['flex: 0 0 120px; max-width: 120px', 'flex: 0 0 70%; max-width: 70%']);
  check(so, 'width "auto" là chia đều phần dư nên không sinh style', kg({ width: 'auto' }), '');

  // Màn `view` khai trần ghi chú bằng chuỗi `"160px"`, còn tài liệu 04 Phần 5 ghi đơn vị là px — nên cả hai dạng phải đi được.
  check(so, 'maxHeight nhận cả số và chuỗi, và sinh ra vùng cuộn được',
    [kg({ maxHeight: 160 }), kg({ maxHeight: '160px' })],
    ['max-height: 160px; overflow-y: auto', 'max-height: 160px; overflow-y: auto']);

  check(so, 'autoExpand false ghim chiều cao đúng bằng maxHeight',
    kg({ autoExpand: false, maxHeight: 200 }), 'height: 200px; overflow-y: auto');
  checkThrows(so, 'autoExpand false mà không có maxHeight thì chặn, không lặng lẽ bỏ qua',
    () => kg({ autoExpand: false }), 'cần `maxHeight`');

  check(so, 'thu gọn có khai trần thì trần là maxHeight',
    kg({ maxHeight: '160px', overflow: 'collapse', collapsedLines: 3 }), 'overflow: hidden; max-height: 160px');
  check(so, 'thu gọn không khai trần thì trần tính theo số dòng, mặc định 3',
    [kg({ overflow: 'collapse' }), kg({ overflow: 'collapse', collapsedLines: 5 })],
    ['overflow: hidden; max-height: calc(3em * var(--shin-line-height))',
      'overflow: hidden; max-height: calc(5em * var(--shin-line-height))']);

  checkThrows(so, 'overflow giá trị lạ bị chặn', () => kg({ overflow: 'hidden' }), 'chỉ nhận "scroll" hoặc "collapse"');
  checkThrows(so, 'collapsedLines không phải số dòng dương bị chặn', () => kg({ overflow: 'collapse', collapsedLines: 0 }), 'lớn hơn 0');

  check(so, 'chỉ khối thu gọn mới mang dấu data-collapse cho phép đo',
    [hop.renderSpatialAttrs({ overflow: 'collapse', collapsedLines: 4 }).indexOf('data-collapse="4"') > 0,
      hop.renderSpatialAttrs({ maxHeight: 100 }).indexOf('data-collapse') === -1],
    [true, true]);

  section('renderEngine — cây Block thành chuỗi HTML');

  check(so, 'chữ thuần: một thẻ, một lớp theo vai, không style rác',
    hop.renderNode(hop.Text('Ghi chú "gấp"'), null), '<div class="shin-text">Ghi chú &quot;gấp&quot;</div>');

  check(so, 'nút chữ mang type="button" để khỏi tự gửi form, và lớp align đi cùng lớp trang trí',
    hop.renderNode(hop.Button({ label: 'LƯU', action: 'saveForm', className: 'shin-primary', align: 'right' }), null),
    '<button type="button" class="shin-button shin-primary shin-align-right" data-action="saveForm"><span class="shin-btn-label">LƯU</span></button>');

  const nutIcon = hop.renderNode(hop.Icon({ icon: 'close', tooltip: 'Hủy', action: 'cancelForm' }), null);
  check(so, 'nút glyph: tooltip vào cả title lẫn aria-label, glyph nội tuyến ngay trong nút',
    [nutIcon.indexOf('title="Hủy" aria-label="Hủy"') > 0, nutIcon.indexOf('<svg class="shin-glyph"') > 0], [true, true]);
  checkThrows(so, 'tên glyph lạ thì nổ kèm danh sách tên đúng, chứ không vẽ nút trống',
    () => hop.renderNode(hop.Icon('bánh-xe'), null), 'Chín tên hiện có');

  // Mục menu **không** được nhồi vào thuộc tính HTML: nó ở lại sổ tra, tệp menu tra theo khóa.
  const nutMenu = hop.renderNode(hop.Icon({ id: 'nut-khac', icon: 'more', tooltip: 'Khác', menu: [{ label: 'Bám theo ô đang chọn', action: 'toggleFollowSelection', toggle: true }] }), null);
  check(so, 'Block có menu: thêm lớp, thêm khóa tra, thêm mũi nhọn — và mục menu không lọt vào HTML',
    [nutMenu.indexOf('class="shin-icon shin-has-menu"') > 0, nutMenu.indexOf('data-menu="nut-khac"') > 0,
      nutMenu.indexOf('shin-caret') > 0, nutMenu.indexOf('toggleFollowSelection') === -1,
      hop.RENDER_INDEX.menus['nut-khac'].length],
    [true, true, true, true, 1]);

  check(so, 'menu ở Block không có id thì engine tự sinh khóa',
    hop.renderNode(hop.Icon({ icon: 'more', menu: [{ label: 'A', action: 'a' }] }), null).indexOf('data-menu="shin-menu-') > 0, true);

  // Ca `{ label: "Đang xem", menu: [...] }` của card lịch sử: nút glyph vắng glyph vẫn hợp lệ.
  check(so, 'nút glyph không khai icon thì bày chữ, không nổ',
    hop.renderNode(hop.Icon({ label: 'Đang xem', menu: [{ label: 'A', action: 'a' }] }), null).indexOf('<span class="shin-btn-label">Đang xem</span>') > 0, true);

  checkThrows(so, 'vai lạ bị chặn ngay ở engine, không chỉ ở tệp dựng cây',
    () => hop.renderNode({ role: 'bảng' }, null), 'Block phải có `role` thuộc');

  check(so, 'hàng bày đủ con theo đúng thứ tự khai',
    hop.renderNode(hop.Row([hop.Text('a'), hop.Text('b')]), null),
    '<div class="shin-row"><div class="shin-text">a</div><div class="shin-text">b</div></div>');

  // Bảng SLOTS chưa nạp phải nói đúng là thiếu bảng, vì đó là lỗi thiếu một dòng `include` chứ không phải lỗi gõ sai tên.
  checkThrows(so, 'gọi slot khi chưa có bảng SLOTS thì nói rõ thiếu bảng',
    () => hop.renderNode(hop.Card({ elements: 'activityList' }), null), 'bảng SLOTS chưa có');

  hop.SLOTS = {
    activityList: (ctx) => [hop.Text('Giao dịch của ' + ctx.entity)],
    infoBarContent: () => [hop.Text('KH-0007 · Công ty A')],
    hong: () => '<div>chuỗi HTML</div>'
  };

  check(so, 'elements là tên slot thì engine gọi hàm slot và vẽ node nó dựng',
    hop.renderNode(hop.Card({ elements: 'activityList' }), { entity: 'customer' }).indexOf('Giao dịch của customer') > 0, true);
  checkThrows(so, 'tên slot lạ bị chặn kèm danh sách tên đúng',
    () => hop.renderNode(hop.Card({ elements: 'activityLists' }), null), 'Các tên hiện có');
  checkThrows(so, 'slot trả về chuỗi HTML thì bị chặn — slot trả node, không trả HTML',
    () => hop.renderNode(hop.Card({ elements: 'hong' }), null), 'phải trả về mảng Block');

  const card = hop.renderNode(hop.Card({
    title: 'LỊCH SỬ LÀM VIỆC',
    titleActions: [{ icon: 'refresh', tooltip: 'Làm mới', action: 'refreshData' }],
    elements: 'activityList',
    spatialConfig: { maxHeight: '160px', overflow: 'collapse', collapsedLines: 3 }
  }), { entity: 'activity' });

  check(so, 'card: style không gian nằm ở thẻ ruột nên hàng tiêu đề không bị cuộn mất',
    [card.indexOf('<section class="shin-card">') === 0,
      card.indexOf('<div class="shin-card-body" style="overflow: hidden; max-height: 160px" data-collapse="3">') > 0,
      card.indexOf('shin-card-title">LỊCH SỬ LÀM VIỆC') > 0,
      card.indexOf('shin-card-actions') > 0],
    [true, true, true, true]);

  check(so, 'card không tiêu đề và không hành động thì không sinh hàng tiêu đề rỗng',
    hop.renderNode(hop.Card({ elements: [hop.Text('x')] }), null).indexOf('shin-card-head') === -1, true);

  section('renderEngine — trường và bảy control');

  const ctx = {
    entity: 'customer',
    records: {
      customer: { id: 'KH-0007', companyName: 'Cty "Xanh" & Co', bidClosingDate: '2026-09-20', note: 'dòng 1\ndòng 2', province: 'Hà Nội', recordStatus: 'active' },
      activity: { contractValue: 1500000, dueAt: '2026-09-06 14:30', priority: 'Cao' }
    }
  };
  const o = (spec) => hop.renderNode(hop.Field(spec), ctx);

  // Một phép so nguyên chuỗi, vì bốn luật cùng nằm trong nó: đường dẫn đầy đủ ở `data-field`, nhãn lấy từ bảng khai, `for` khớp `id`, và tên công ty có dấu ngoặc kép không phá được thuộc tính.
  check(so, 'trường khai cụt lấy entity của màn, và `data-field` mang đủ đường dẫn',
    o({ field: 'companyName' }),
    '<div class="shin-field"><div class="shin-field-head"><label class="shin-label" for="shin-f-customer-companyName">Tên công ty</label></div>'
    + '<input type="text" class="shin-input" id="shin-f-customer-companyName" data-field="customer.companyName" value="Cty &quot;Xanh&quot; &amp; Co"></div>');

  check(so, 'nhãn khai ở UI_SCHEMA thắng nhãn ở bảng khai trường',
    o({ field: 'companyName', label: 'Tên KH' }).indexOf('>Tên KH</label>') > 0, true);

  checkThrows(so, 'đường dẫn ba đoạn bị chặn', () => o({ field: 'a.b.c' }), 'phải là `tên trường` hoặc');
  checkThrows(so, 'khai cụt mà ngữ cảnh không có entity thì bị chặn',
    () => hop.renderNode(hop.Field({ field: 'companyName' }), { records: {} }), 'không có `entity`');
  checkThrows(so, 'tên trường gõ sai thì chính Schema nổ kèm gợi ý', () => o({ field: 'taxNo' }), 'taxNumber');

  check(so, 'trường của thực thể khác lấy đúng bản ghi của nó, và NUMBER bày theo nếp Việt Nam',
    [o({ field: 'activity.contractValue' }).indexOf('data-field="activity.contractValue"') > 0,
      o({ field: 'activity.contractValue' }).indexOf('value="1.500.000"') > 0,
      o({ field: 'activity.contractValue' }).indexOf('inputmode="numeric"') > 0],
    [true, true, true]);

  check(so, 'DATE theo precision: ngày thì đi nguyên chuỗi, phút thì đổi dấu cách thành T cho trình duyệt',
    [o({ field: 'bidClosingDate' }).indexOf('type="date"') > 0,
      o({ field: 'bidClosingDate' }).indexOf('value="2026-09-20"') > 0,
      o({ field: 'activity.dueAt' }).indexOf('type="datetime-local"') > 0,
      o({ field: 'activity.dueAt' }).indexOf('value="2026-09-06T14:30"') > 0],
    [true, true, true, true]);

  const combo = o({ field: 'province' });
  check(so, 'SELECT thành ô gõ-để-lọc, mang tên danh mục và một hộp danh sách đóng sẵn',
    [combo.indexOf('data-source="@CAT_TINH_THANH"') > 0, combo.indexOf('role="combobox"') > 0,
      combo.indexOf('<div class="shin-combo-list" hidden></div>') > 0],
    [true, true, true]);

  check(so, 'customerPicker là ô gõ-để-lọc mang dấu riêng để phần bàn phím biết đường tra khách',
    o({ field: 'parentCompanyName', control: 'customerPicker' }).indexOf('data-picker="customer"') > 0, true);

  const ta = o({ field: 'note', control: 'textarea' });
  check(so, 'textarea đặt nội dung trong ruột thẻ, không có thuộc tính value',
    [ta.indexOf('>dòng 1\ndòng 2</textarea>') > 0, ta.indexOf('value=') === -1], [true, true]);

  // Màu chip theo **danh mục**, nên thêm một mức ưu tiên mới vào sheet `Category` không phải sửa CSS.
  check(so, 'badge lấy lớp màu theo danh mục, còn trường khai bằng options thì chip xám',
    [o({ field: 'activity.priority', control: 'badge' }).indexOf('class="shin-badge shin-badge-uu-tien"') > 0,
      o({ field: 'recordStatus', control: 'badge' }).indexOf('class="shin-badge"') > 0],
    [true, true]);

  checkThrows(so, 'tên control lạ bị chặn kèm bảy tên đúng',
    () => o({ field: 'companyName', control: 'toggle' }), 'Bảy control');

  // Luật một chiều của tài liệu 03 Phần 7: UI siết thêm được, mở khóa thì không.
  check(so, 'chỉ-đọc: bảng khai khóa thì khóa, UI siết thêm được, UI mở khóa thì không',
    [o({ field: 'id' }).indexOf(' readonly>') > 0,
      o({ field: 'id' }).indexOf('data-readonly="1"') > 0,
      o({ field: 'companyName', readonly: true }).indexOf(' readonly>') > 0,
      o({ field: 'id', readonly: false }).indexOf(' readonly>') > 0],
    [true, true, true, true]);

  check(so, 'trường khai action thì mọc nút bút chì cạnh nhãn, chứ không biến cả ô thành chỗ bấm',
    [o({ field: 'companyName', action: 'openParentPicker' }).indexOf('<button type="button" class="shin-field-edit" title="Sửa" data-action="openParentPicker">') > 0,
      o({ field: 'companyName', action: 'openParentPicker' }).indexOf('shin-field" data-action') === -1],
    [true, true]);

  check(so, 'không có bản ghi thì ô rỗng — đó là ca form thêm mới, không phải lỗi',
    hop.renderNode(hop.Field({ field: 'companyName' }), { entity: 'customer', records: {} }),
    '<div class="shin-field"><div class="shin-field-head"><label class="shin-label" for="shin-f-customer-companyName">Tên công ty</label></div>'
    + '<input type="text" class="shin-input" id="shin-f-customer-companyName" data-field="customer.companyName"></div>');

  section('renderEngine — gán vào khung, chống nháy, và vẽ lại một vùng');

  const man = hop.screenBuild({
    entity: 'customer',
    infoBar: true,
    header: [{ icon: 'close', tooltip: 'Đóng', action: 'closeSidebar' }],
    body: [hop.Card({ id: 'the-lich-su', title: 'LỊCH SỬ LÀM VIỆC', elements: 'activityList' })],
    footer: [{ button: 'LƯU', action: 'saveForm' }]
  }, 'view');

  hop.document = khungGia(['the-lich-su']);
  hop.renderScreen(man, { records: {} });
  const els = hop.document._els;
  check(so, 'bốn vùng nhận đúng phần của nó, và infoBar true thì vùng thông tin bày slot infoBarContent',
    [els['sidebar-header'].innerHTML.indexOf('data-action="closeSidebar"') > 0,
      els['sidebar-info'].innerHTML, els['sidebar-body'].innerHTML.indexOf('id="the-lich-su"') > 0,
      els['sidebar-footer'].innerHTML.indexOf('LƯU') > 0, els['sidebar-info'].hidden, els['sidebar-footer'].hidden],
    [true, '<div class="shin-text">KH-0007 · Công ty A</div>', true, true, false, false]);

  hop.renderScreen(hop.screenBuild({ entity: 'customer', body: [hop.Text('x')] }, 'trơ'), {});
  check(so, 'màn không khai infoBar và không có vùng chân thì hai vùng đó bị ẩn hẳn',
    [els['sidebar-info'].hidden, els['sidebar-footer'].hidden, els['sidebar-info'].innerHTML], [true, true, '']);

  // Vẽ lại một vùng: thay ruột, giữ thẻ ngoài — nên hàng tiêu đề của card vẫn còn sau khi vẽ lại.
  hop.renderScreen(man, { records: {} });
  hop.SLOTS.activityList = () => [hop.Text('Đã làm mới')];
  hop.renderTarget('the-lich-su');
  check(so, 'renderTarget vẽ lại đúng một vùng theo id, và vẽ lại ruột chứ không vẽ lại chính thẻ',
    [els['the-lich-su'].innerHTML.indexOf('Đã làm mới') > 0,
      els['the-lich-su'].innerHTML.indexOf('shin-card-head') >= 0,
      els['the-lich-su'].innerHTML.indexOf('<section') === -1],
    [true, true, true]);

  checkThrows(so, 'vẽ lại một id không có trong màn thì nói rõ Block phải khai id',
    () => hop.renderTarget('khong-co-dau'), 'phải khai `id`');

  hop.document = khungGia();
  hop.renderScreen(man, { records: {} });
  checkThrows(so, 'Block có trong sổ tra mà không có trên màn thì nói rõ sổ tra đã lệch',
    () => hop.renderTarget('the-lich-su'), 'sổ tra');

  // `[RÀNG BUỘC CỨNG]` tài liệu 04 Phần 6: dựng đủ trong RAM rồi mới gán. Vùng chân lỗi thì vùng đầu cũng không được gán.
  hop.document = khungGia();
  try {
    hop.renderScreen(hop.screenBuild({ entity: 'customer', header: [{ icon: 'close' }], footer: [{ icon: 'bánh-xe' }] }, 'hỏng'), {});
  } catch (err) { /* lỗi này là điều đang kiểm */ }
  check(so, 'một vùng dựng lỗi thì không vùng nào bị gán, màn không có trạng thái nửa cũ nửa mới',
    [hop.document._els['sidebar-header'].innerHTML, hop.document._els['sidebar-body'].innerHTML], ['', '']);
}

module.exports = { chay };
