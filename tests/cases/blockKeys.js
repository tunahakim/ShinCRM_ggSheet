/**
 * Nhóm ca kiểm luật "vai nhận khóa nào thì lá phải dùng khóa đó" — nửa còn lại của phép kiểm khóa Block.
 *
 * `blockCheckKeys` canh một chiều: khóa **không** có trong bảng thì hét lên. Không ai canh chiều kia — khóa **có** trong bảng mà phần lá của `renderEngine` bỏ qua. Chiều đó hỏng thì bản khai vẫn hợp lệ, `Block` vẫn dựng, không một lời cảnh báo, và hình thức không đổi một pixel.
 *
 * Đúng chuyện đã xảy ra và là lý do tệp này ra đời: vai `icon` nhận `label` (khóa chung), docstring của `Icon` còn hứa "có thể kèm chữ", mà phần lá lại viết `node.icon ? iconSvg(...) : label` — có glyph thì **bỏ hẳn** chữ. Nên `titleActions: [{ icon: 'pencil', label: 'Sửa' }]` ra một cái bút chì trơ trọi thay vì đường dẫn chữ xanh `✎ Sửa` của bản cũ. Sửa bản khai bao nhiêu lần cũng không ra chữ, vì lỗi không nằm ở bản khai.
 *
 * Cách kiểm: với từng cặp (vai, khóa), dựng hai node **chỉ khác nhau ở đúng khóa đó** rồi đòi chuỗi HTML vẽ ra phải khác nhau. Không đọc mã nguồn, không đếm dòng — chỉ hỏi một câu: khai rồi thì có tới được màn hình không.
 *
 * Bảng đầu dò dưới đây phải phủ **hết** bảng khóa của `uiBuilder`, và có một ca kiểm đúng việc phủ hết đó. Nhờ vậy thêm một khóa mới cho một vai mà quên dạy lá dùng nó thì bộ kiểm đỏ ngay, chứ không đợi tới lúc có người nhìn bằng mắt.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiTruot, ghiDat, ghiLoiNap } = require('../lib/assert');

/**
 * Một đầu dò cho mỗi cặp (vai, khóa): `nen` là phần khai tối thiểu để node vẽ được, `khoa` và `gia` là thứ thêm vào.
 *
 * Giá trị đầu dò chọn theo hai luật: phải hợp lệ với `Block` và với engine, và phải khác hẳn mặc định để chuỗi HTML đổi thấy được. Vai `check` bắt buộc có `pick` nên `pick` nằm luôn trong `nen` của nó và đầu dò của cặp (check, pick) đổi sang một mã khác.
 */
const DAU_DO = [
  // Sáu khóa chung. Kiểm trên vai `box` là đủ cho năm khóa đầu vì `renderNodeAttrs` xử lý chúng theo cùng một đường cho mọi vai;
  // ba ngoại lệ có thật của hàm đó thì kiểm riêng ngay dưới, vì mỗi ngoại lệ là một quyết định thiết kế chứ không phải một chỗ bỏ sót.
  { vai: 'box', khoa: 'id', nen: {}, gia: 'shin-thu' },
  { vai: 'box', khoa: 'className', nen: {}, gia: 'shin-thu-lop' },
  { vai: 'box', khoa: 'spatialConfig', nen: {}, gia: { maxHeight: 120 } },
  { vai: 'box', khoa: 'action', nen: {}, gia: 'reloadAll' },
  { vai: 'box', khoa: 'menu', nen: {}, gia: [{ label: 'Một mục', action: 'reloadAll' }] },
  { vai: 'box', khoa: 'pick', nen: {}, gia: 'KH-001' },

  // Ba ngoại lệ của `renderNodeAttrs`: khóa không lên thẻ ngoài, nhưng phải lên thẻ trong — bỏ hẳn thì mới là lỗi.
  { vai: 'card', khoa: 'spatialConfig', nen: {}, gia: { maxHeight: 120 } },
  { vai: 'field', khoa: 'action', nen: { field: 'customer.note' }, gia: 'openNoteForm' },
  { vai: 'check', khoa: 'pick', nen: { pick: 'GD-001' }, gia: 'GD-002' },

  // Khóa riêng của từng vai. Ba vai chứa con nhận `elements`, bốn vai có chữ nhận `label`.
  { vai: 'box', khoa: 'elements', nen: {}, gia: [{ role: 'text', text: 'con' }] },
  { vai: 'row', khoa: 'elements', nen: {}, gia: [{ role: 'text', text: 'con' }] },
  { vai: 'card', khoa: 'elements', nen: {}, gia: [{ role: 'text', text: 'con' }] },
  { vai: 'card', khoa: 'title', nen: {}, gia: 'GHI CHÚ' },
  { vai: 'card', khoa: 'titleActions', nen: {}, gia: [{ icon: 'pencil', label: 'Sửa', action: 'openNoteForm' }] },
  { vai: 'text', khoa: 'text', nen: {}, gia: 'một dòng chữ' },
  { vai: 'field', khoa: 'field', nen: { field: 'customer.note' }, gia: 'customer.phone' },
  { vai: 'field', khoa: 'control', nen: { field: 'customer.note' }, gia: 'readText' },
  { vai: 'field', khoa: 'readonly', nen: { field: 'customer.phone' }, gia: true },
  { vai: 'field', khoa: 'width', nen: { field: 'customer.note' }, gia: '65%' },
  { vai: 'field', khoa: 'label', nen: { field: 'customer.note' }, gia: 'Ghi chú riêng' },
  { vai: 'icon', khoa: 'icon', nen: { icon: 'pencil' }, gia: 'trash' },
  { vai: 'icon', khoa: 'tooltip', nen: { icon: 'pencil' }, gia: 'Sửa khách' },
  { vai: 'icon', khoa: 'align', nen: { icon: 'pencil' }, gia: 'right' },
  { vai: 'icon', khoa: 'label', nen: { icon: 'pencil' }, gia: 'Sửa' },
  { vai: 'button', khoa: 'align', nen: { label: 'LƯU' }, gia: 'right' },
  { vai: 'button', khoa: 'label', nen: {}, gia: 'LƯU DỮ LIỆU' },
  { vai: 'check', khoa: 'label', nen: { pick: 'GD-001' }, gia: 'Chọn dòng này' }
];

/** Ngữ cảnh vẽ tối thiểu: một khách để trường có giá trị mà đổ ra. */
const BOI_CANH = {
  entity: 'customer',
  records: { customer: { id: 'KH-001', companyName: 'Cty Thử', note: 'ghi chú thử', phone: '0900000000' } }
};

/** Một khai thành chuỗi HTML. Trả về thông báo lỗi thay vì để lỗi bay lên, để một đầu dò khai sai không giết cả nhóm ca. */
function ve(hop, vai, khai) {
  try {
    return hop.renderNode(hop.Block(khai, vai), BOI_CANH);
  } catch (err) {
    return 'LỖI: ' + err.message;
  }
}

/** Bảng khai của một đầu dò, đã cộng khóa cần thử vào phần nền. */
function themKhoa(nen, khoa, gia) {
  const ra = {};
  Object.keys(nen).forEach((k) => { ra[k] = nen[k]; });
  ra[khoa] = gia;
  return ra;
}

function chay(so) {
  section('Khóa Block — vai nhận khóa nào thì phần lá phải dùng tới khóa đó');

  let hop;
  try {
    hop = napClient(taoHopCat(),
      'client/ui/uiBuilder.html', 'client/ui/screenBuild.html', 'client/ui/icons.html',
      'client/util/valueText.html', 'client/schema/schemaAccess.html', 'client/ui/renderEngine.html');
    hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  } catch (err) {
    return ghiLoiNap(so, 'nạp uiBuilder cùng engine và bảng khai trường thật', err);
  }

  kiemPhuHetBang(so, hop);
  kiemTungKhoa(so, hop);

  // Ca gốc, viết thẳng ra để người đọc thấy đúng cái đã hỏng chứ không phải suy từ bảng đầu dò.
  const ra = ve(hop, 'icon', { icon: 'pencil', label: 'Sửa', action: 'openNoteForm' });
  check(so, 'mục titleActions khai cả glyph lẫn chữ thì vẽ ra **cả hai** — đây là ca đã hỏng: có glyph thì chữ bị bỏ hẳn',
    [ra.includes('<svg'), ra.includes('Sửa</span>')], [true, true]);

  check(so, 'khai một mình glyph thì không sinh ô chữ rỗng',
    ve(hop, 'icon', { icon: 'pencil' }).includes('shin-btn-label'), false);

  check(so, 'khai một mình chữ thì vẫn vẽ được, vì mục "Đang xem" của card lịch sử là một nút chữ có menu',
    ve(hop, 'icon', { label: 'Đang xem', menu: [{ label: 'Tất cả', action: 'setActivityView', value: 'all' }] }).includes('Đang xem'),
    true);

  check(so, 'không glyph không chữ thì hét lên — nút vẽ ra rỗng mà vẫn nhận cú bấm là một chỗ bấm vô hình',
    ve(hop, 'icon', { action: 'reloadAll' }).startsWith('LỖI: Block vai "icon"'), true);

  // Hai ca canh chính cái vừa sửa. Không có chúng thì dời `label` trở lại bảng khóa chung vẫn xanh: phép phủ ở trên chỉ đòi
  // khóa chung có đầu dò ở **một** vai, mà `field` thì có, nên cái bẫy `Card({ label })` lặng lẽ mở lại.
  checkThrows(so, 'card nhận `title` chứ không nhận `label` — khai lẫn thì chữ không bao giờ hiện, nên chặn ngay lúc dựng',
    () => hop.Card({ label: 'GHI CHÚ' }), 'không có khóa "label"');
  checkThrows(so, 'vai lá không nhận `elements` — con của một cái nút chữ chẳng bao giờ được vẽ',
    () => hop.Text({ text: 'x', elements: [hop.Text('con')] }), 'không có khóa "elements"');
}

/**
 * Bảng đầu dò phải phủ hết bảng khóa của `uiBuilder`.
 *
 * Không có ca này thì tệp đầu dò lặng lẽ lạc hậu: thêm một khóa cho một vai, quên thêm đầu dò, bộ kiểm vẫn xanh, và cái lỗi tệp này ra đời để chặn lại tái diễn nguyên vẹn.
 *
 * Khóa riêng thì đòi phủ **từng cặp** (vai, khóa) — đó là chỗ mỗi vai tự quyết. Khóa chung chỉ đòi phủ ở **một** vai, vì `renderNodeAttrs` xử lý chúng cùng một đường cho tám vai; ba ngoại lệ có thật của hàm đó đã có đầu dò riêng trong bảng.
 */
function kiemPhuHetBang(so, hop) {
  const daPhu = {};
  DAU_DO.forEach((d) => { daPhu[d.vai + '.' + d.khoa] = true; });

  const thieu = [];

  hop.BLOCK_ROLES.forEach((vai) => {
    (hop.BLOCK_KEYS_BY_ROLE[vai] || []).forEach((khoa) => {
      if (!daPhu[vai + '.' + khoa]) { thieu.push('vai "' + vai + '" chưa có đầu dò cho khóa riêng `' + khoa + '`'); }
    });
  });

  hop.BLOCK_KEYS_COMMON.forEach((khoa) => {
    if (!DAU_DO.some((d) => d.khoa === khoa)) { thieu.push('khóa chung `' + khoa + '` chưa có đầu dò ở vai nào'); }
  });

  if (thieu.length) {
    ghiTruot(so, 'bảng đầu dò phủ hết bảng khóa của uiBuilder', thieu);
  } else {
    ghiDat(so, 'bảng đầu dò phủ hết bảng khóa của uiBuilder (' + DAU_DO.length + ' cặp vai–khóa)');
  }
}

/** Từng cặp: thêm khóa vào thì chuỗi HTML phải đổi. Gộp thành một ca kiểm vì một cặp trượt cũng đủ để đòi sửa, và ba mươi dòng ✅ giống nhau thì không ai đọc. */
function kiemTungKhoa(so, hop) {
  const truot = [];

  DAU_DO.forEach((d) => {
    const khong = ve(hop, d.vai, d.nen);
    const co = ve(hop, d.vai, themKhoa(d.nen, d.khoa, d.gia));

    if (khong.startsWith('LỖI:')) { truot.push('vai "' + d.vai + '" phần nền không vẽ được: ' + khong); return; }
    if (co.startsWith('LỖI:')) { truot.push('vai "' + d.vai + '" khóa `' + d.khoa + '` làm engine hét: ' + co); return; }
    if (khong === co) { truot.push('vai "' + d.vai + '" nhận khóa `' + d.khoa + '` mà lá bỏ qua — khai rồi mà HTML không đổi một ký tự'); }
  });

  if (truot.length) {
    ghiTruot(so, 'mọi cặp vai–khóa đều tới được chuỗi HTML', truot);
  } else {
    ghiDat(so, 'mọi cặp vai–khóa đều tới được chuỗi HTML (' + DAU_DO.length + ' cặp)');
  }
}

module.exports = { chay };
