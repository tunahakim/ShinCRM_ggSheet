/**
 * Ca kiểm của `client/ui/slots.html` — ba vùng nội dung tùy lúc chạy. Tài liệu 04 Phần 7.
 *
 * Slot trả về **cây Block**, không trả chuỗi HTML, nên kiểm được offline mà không cần DOM: mỗi phép kiểm dưới đây soi vào node chứ soi vào chữ đã vẽ. Trọng tâm là ba điều: dòng lịch sử giữ đúng thứ tự thời gian kể cả khi có bản ghi đã xóa mềm chen giữa, mỗi dòng mang đủ mã bản ghi để hành động biết bấm vào đâu, và **không dòng nào mang `field`** — `renderFieldValue` tra một bản ghi cho một thực thể nên một `Field` lặp xuống danh sách sẽ đọc sai bản ghi.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

/** Ba khách và ba giao dịch dùng cho cả nhóm ca. Giao dịch ở giữa theo thứ tự thời gian là bản ghi đã xóa mềm, để chứng minh nó không bị dồn xuống cuối. */
const KHACH = [
  { id: 'CUS-000001', companyName: 'Công ty Thép Hòa Phát', taxNumber: '0900123456', phone: '0912345678', province: 'Hà Nội', contactPerson: 'Anh Tuấn', recordStatus: 'active' },
  { id: 'CUS-000002', companyName: 'Thép Việt Đức', taxNumber: '0900999888', phone: '0987654321', province: 'Hải Phòng', recordStatus: 'deleted' },
  { id: 'CUS-000003', companyName: '', taxNumber: '', recordStatus: 'active' }
];

const GIAO_DICH = [
  { id: 'ACT-000001', customerId: 'CUS-000001', workDate: '2026-09-01', taskType: 'Gọi điện', content: 'Chào hàng lần đầu', contractValue: '', recordStatus: 'active' },
  { id: 'ACT-000002', customerId: 'CUS-000001', workDate: '2026-09-03', taskType: 'Chốt đơn', content: 'Khách đồng ý giá', contractValue: 1200000, recordStatus: 'active' },
  { id: 'ACT-000003', customerId: 'CUS-000001', workDate: '2026-09-02', taskType: 'Gửi báo giá', content: 'Gửi bản chào\nkèm chiết khấu', contractValue: 0, recordStatus: 'deleted' }
];

/** Mọi node trong một mảng Block, kể cả con của con. */
function moiNode(nodes, ra) {
  (nodes || []).forEach((n) => {
    if (!n || !n.role) { return; }
    ra.push(n);
    if (Array.isArray(n.elements)) { moiNode(n.elements, ra); }
  });
  return ra;
}

/** Chữ của mọi node có chữ, ghép lại theo thứ tự — dùng để đọc một dòng như người dùng thấy. */
function chuCua(nodes) {
  return moiNode(nodes, []).filter((n) => n.text).map((n) => n.text);
}

/** Dựng hộp cát client đã có Schema thật và kho đã nạp ba khách, ba giao dịch. */
function dungCanh(nac) {
  const hop = napClient(taoHopCat(),
    'client/util/textNormalize.html', 'client/schema/schemaAccess.html', 'client/ram/store.html',
    'client/ram/prefs.html', 'client/util/valueText.html', 'client/ui/uiBuilder.html', 'client/ui/slots.html');

  hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  hop.storeReset();
  hop.prefsReset();
  KHACH.forEach((c) => hop.Store.upsertRecord('customer', c));
  GIAO_DICH.forEach((a) => hop.Store.upsertRecord('activity', a));
  hop.Store.activityState = hop.STORE_READY;
  if (nac) { hop.prefsSet('activityView', nac); }
  return hop;
}

/** `ctx` mà engine truyền vào slot: `{entity, records, screen}`. */
function ctxCua(hop, khachId, them) {
  const records = them || {};
  if (khachId) { records.customer = hop.Store.getCustomer(khachId); }
  return { entity: 'customer', records: records, screen: 'view' };
}

function chay(so) {
  section('slots — ba vùng nội dung tùy lúc chạy');

  let hop;
  try {
    hop = dungCanh();
  } catch (err) {
    return ghiLoiNap(so, 'nạp slots cùng kho và bộ dựng Block', err);
  }

  check(so, 'đúng ba slot như tài liệu 04 Phần 7 khai',
    Object.keys(hop.SLOTS).sort(), ['activityList', 'infoBarContent', 'searchSuggestions']);

  check(so, 'cả ba slot đều trả về mảng Block, không trả chuỗi HTML',
    Object.keys(hop.SLOTS).map((ten) => Array.isArray(hop.SLOTS[ten](ctxCua(hop, 'CUS-000001', { search: [] })))),
    [true, true, true]);

  // Ba dòng chữ rỗng nói ba chuyện khác nhau.
  check(so, 'chưa chọn khách thì nói chưa chọn khách',
    chuCua(hop.SLOTS.activityList(ctxCua(hop, ''))), ['Chưa chọn khách hàng nào.']);

  const dangNap = dungCanh();
  dangNap.Store.activityState = dangNap.STORE_LOADING;
  check(so, 'đang nạp lịch sử thì nói đang nạp, không nói khách chưa có giao dịch',
    chuCua(dangNap.SLOTS.activityList(ctxCua(dangNap, 'CUS-000001'))), ['Đang nạp lịch sử làm việc…']);

  check(so, 'khách không có giao dịch nào thì nói chưa có giao dịch',
    chuCua(hop.SLOTS.activityList(ctxCua(hop, 'CUS-000002'))), ['Khách này chưa có giao dịch nào.']);

  const nacXoa = dungCanh('deleted');
  check(so, 'nấc "chỉ đã xóa" mà khách không có bản ghi đã xóa thì nói riêng chuyện đó',
    chuCua(nacXoa.SLOTS.activityList(ctxCua(nacXoa, 'CUS-000002'))), ['Khách này không có giao dịch nào đã xóa.']);

  // Ba nấc lọc, trên cùng một khách có ba giao dịch mà một đã xóa mềm. Mã dòng đọc ở nút bút chì — dòng không còn ô đánh dấu.
  const dem = (h) => {
    const ra = h.SLOTS.activityList(ctxCua(h, 'CUS-000001'));
    return ra.filter((n) => n.role === 'box').map((row) => moiNode([row], []).filter((n) => n.role === 'icon')[0].pick);
  };

  check(so, 'nấc "chỉ còn dùng" bỏ bản ghi đã xóa mềm', dem(hop), ['ACT-000002', 'ACT-000001']);
  check(so, 'nấc "chỉ đã xóa" chỉ còn bản ghi đã xóa mềm', dem(dungCanh('deleted')), ['ACT-000003']);
  check(so, 'nấc "tất cả" giữ bản ghi đã xóa ở đúng chỗ của nó theo thời gian, không dồn xuống cuối',
    dem(dungCanh('all')), ['ACT-000002', 'ACT-000003', 'ACT-000001']);

  const tatCa = dungCanh('all').SLOTS.activityList(ctxCua(dungCanh('all'), 'CUS-000001'));

  // Chủ dự án bỏ việc xóa hàng loạt ngày 06/09/2026: ô đánh dấu ăn chỗ ở mọi dòng để phục vụ một việc hiếm.
  check(so, 'danh sách không còn ô đánh dấu nào và không còn nút xóa hàng loạt — mỗi dòng tự có thùng rác của nó',
    [moiNode(tatCa, []).filter((n) => n.role === 'check').length, tatCa.filter((n) => n.role === 'button').length],
    [0, 0]);

  // Một dòng đầy đủ: ba mẩu chữ đầu dòng là **ba node riêng**, vì ba màu của bản cũ nằm ở ba lớp khác nhau.
  check(so, 'dòng đầy đủ: ngày kiểu Việt, loại việc, tiền có dấu chấm nghìn, rồi nội dung ở dòng riêng',
    chuCua([tatCa[0]]), ['03/09/2026', 'Chốt đơn', '1.200.000 đ', 'Khách đồng ý giá']);
  check(so, 'giá trị hợp đồng rỗng thì không sinh node giá trị',
    chuCua([tatCa[2]]), ['01/09/2026', 'Gọi điện', 'Chào hàng lần đầu']);
  check(so, 'giá trị hợp đồng bằng 0 cũng không sinh node — 0 đồng là chưa có hợp đồng',
    chuCua([tatCa[1]]), ['02/09/2026', 'Gửi báo giá', 'Đã xóa', 'Gửi bản chào\nkèm chiết khấu']);

  check(so, 'ba mẩu chữ đầu dòng mang ba lớp riêng — gộp chúng thành một chuỗi là mất luôn ba màu',
    moiNode([tatCa[0]], []).filter((n) => n.role === 'text').map((n) => n.className),
    ['shin-act-date', 'shin-act-type', 'shin-act-value', 'shin-act-content']);

  check(so, 'nội dung giao dịch nằm ở dòng riêng, giữ nguyên dấu xuống dòng người dùng gõ',
    chuCua([tatCa[1]]).slice(-1)[0], 'Gửi bản chào\nkèm chiết khấu');

  check(so, 'dòng đã xóa mềm mang class gạch ngang, và có chip "Đã xóa"',
    [tatCa[1].className, chuCua([tatCa[1]])[2]], ['shin-act-row shin-act-deleted', 'Đã xóa']);
  check(so, 'dòng còn dùng không mang class gạch ngang và không có chip',
    [tatCa[0].className, chuCua([tatCa[0]]).indexOf('Đã xóa')], ['shin-act-row', -1]);

  check(so, 'bút sửa của mỗi dòng mang mã giao dịch của chính dòng đó, nằm bên phải',
    (() => { const b = moiNode([tatCa[0]], []).filter((n) => n.role === 'icon')[0]; return [b.icon, b.action, b.pick, b.align]; })(),
    ['pencil', 'openActivityForm', 'ACT-000002', 'right']);

  check(so, 'cạnh bút sửa là thùng rác của chính dòng đó — xóa một dòng là một cú bấm, không phải tích rồi bấm',
    (() => { const b = moiNode([tatCa[0]], []).filter((n) => n.role === 'icon')[1]; return [b.icon, b.action, b.pick]; })(),
    ['trash', 'deleteActivity', 'ACT-000002']);

  // Luật cứng của danh sách: không node nào mang `field`, vì engine tra một bản ghi cho một thực thể.
  check(so, 'không dòng nào mang field — bộ thu thập lúc lưu không bao giờ thấy danh sách này',
    moiNode(tatCa, []).filter((n) => n.field).length, 0);

  // Hộp gợi ý tìm khách.
  check(so, 'không khách nào khớp thì nói rõ, không trả hộp trống',
    chuCua(hop.SLOTS.searchSuggestions(ctxCua(hop, '', { search: [] }))), ['Không có khách nào khớp.']);

  const goiY = hop.SLOTS.searchSuggestions(ctxCua(hop, '', { search: hop.Store.searchCustomers('thép', 10) }));
  check(so, 'khách còn dùng lên trước khách đã xóa, đúng thứ tự Store trả về',
    goiY.map((n) => n.pick), ['CUS-000001', 'CUS-000002']);
  check(so, 'mỗi dòng gợi ý là một cửa gọi setCurrentCustomer, mang mã khách của dòng',
    goiY.map((n) => n.action), ['setCurrentCustomer', 'setCurrentCustomer']);
  check(so, 'dòng khách đã xóa mang class riêng để người dùng thấy trước khi bấm',
    goiY.map((n) => n.className), ['shin-suggest', 'shin-suggest shin-suggest-deleted']);
  check(so, 'dòng gợi ý hiện tên công ty, rồi mã khách • điện thoại • tỉnh thành',
    chuCua([goiY[0]]), ['Công ty Thép Hòa Phát', 'CUS-000001 • 0912345678 • Hà Nội']);

  check(so, 'khách chưa có tên công ty vẫn hiện được, không hiện dòng trắng',
    chuCua(hop.SLOTS.searchSuggestions(ctxCua(hop, '', { search: [hop.Store.getCustomer('CUS-000003')] }))),
    ['(chưa có tên)', 'CUS-000003']);

  // Khối thông tin chung: tên công ty một hàng, rồi hai hàng hai cột. Cột phải giữ mã số thuế và điện thoại — hai thứ hay phải chép ra nhất.
  check(so, 'chưa chọn khách thì khối thông tin chung cũng nói chưa chọn khách',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, ''))), ['Chưa chọn khách hàng nào.']);

  check(so, 'khối thông tin chung: tên công ty, rồi hàng mã khách với mã số thuế, rồi hàng người liên hệ với điện thoại',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001'))),
    ['Công ty Thép Hòa Phát', 'CUS-000001', '0900123456', 'Anh Tuấn', '0912345678']);

  check(so, 'mã số thuế và điện thoại nằm ở cột phải, nhận đúng lớp ghim mép phải',
    moiNode(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001')), [])
      .filter((n) => n.className === 'shin-info-right').map((n) => n.text),
    ['0900123456', '0912345678']);

  check(so, 'khách đã xóa mềm thì khối thông tin chung có chip "Đã xóa"',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000002'))),
    ['Thép Việt Đức', 'Đã xóa', 'CUS-000002', '0900999888', '0987654321']);

  // Rỗng cả hai cột thì bỏ hẳn hàng: một hàng trắng vẫn ăn chiều cao của khối, mà khối này ghim trên đầu mọi màn.
  check(so, 'hàng nào rỗng cả hai cột thì không sinh ra — khách chưa có người liên hệ và điện thoại chỉ còn hai hàng',
    [hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000003')).length,
      chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000003')))],
    [2, ['(chưa có tên)', 'CUS-000003']]);

  check(so, 'khối thông tin chung cũng không mang field nào',
    moiNode(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001')), []).filter((n) => n.field).length, 0);
}

module.exports = { chay };
