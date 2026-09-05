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

  // Ba nấc lọc, trên cùng một khách có ba giao dịch mà một đã xóa mềm.
  const dem = (h) => {
    const ra = h.SLOTS.activityList(ctxCua(h, 'CUS-000001'));
    return ra.filter((n) => n.role === 'box').map((row) => moiNode([row], []).filter((n) => n.role === 'check')[0].pick);
  };

  check(so, 'nấc "chỉ còn dùng" bỏ bản ghi đã xóa mềm', dem(hop), ['ACT-000002', 'ACT-000001']);
  check(so, 'nấc "chỉ đã xóa" chỉ còn bản ghi đã xóa mềm', dem(dungCanh('deleted')), ['ACT-000003']);
  check(so, 'nấc "tất cả" giữ bản ghi đã xóa ở đúng chỗ của nó theo thời gian, không dồn xuống cuối',
    dem(dungCanh('all')), ['ACT-000002', 'ACT-000003', 'ACT-000001']);

  const tatCa = dungCanh('all').SLOTS.activityList(ctxCua(dungCanh('all'), 'CUS-000001'));

  check(so, 'cuối danh sách là nút xóa nhiều dòng, mang class báo nguy',
    (() => { const nut = tatCa[tatCa.length - 1]; return [nut.role, nut.label, nut.action, nut.className]; })(),
    ['button', 'XÓA DÒNG ĐÃ CHỌN', 'deleteSelectedActivities', 'shin-danger shin-act-delete']);

  check(so, 'danh sách rỗng thì không có nút xóa — không có gì để chọn',
    hop.SLOTS.activityList(ctxCua(hop, 'CUS-000002')).filter((n) => n.role === 'button').length, 0);

  // Một dòng đầy đủ: ngày kiểu Việt, loại việc, tiền có dấu chấm nghìn.
  check(so, 'chữ đầu dòng gộp ngày kiểu Việt, loại việc và giá trị hợp đồng',
    chuCua([tatCa[0]]), ['03/09/2026 • Chốt đơn • 1.200.000 đ', 'Khách đồng ý giá']);
  check(so, 'giá trị hợp đồng rỗng thì không hiện dấu chấm giữa trống',
    chuCua([tatCa[2]])[0], '01/09/2026 • Gọi điện');
  check(so, 'giá trị hợp đồng bằng 0 cũng không hiện — 0 đồng là chưa có hợp đồng',
    chuCua([tatCa[1]])[0], '02/09/2026 • Gửi báo giá');

  check(so, 'nội dung giao dịch nằm ở dòng riêng, giữ nguyên dấu xuống dòng người dùng gõ',
    chuCua([tatCa[1]])[2], 'Gửi bản chào\nkèm chiết khấu');

  check(so, 'dòng đã xóa mềm mang class gạch ngang, và có chip "Đã xóa"',
    [tatCa[1].className, chuCua([tatCa[1]])[1]], ['shin-act-row shin-act-deleted', 'Đã xóa']);
  check(so, 'dòng còn dùng không mang class gạch ngang và không có chip',
    [tatCa[0].className, chuCua([tatCa[0]]).indexOf('Đã xóa')], ['shin-act-row', -1]);

  check(so, 'bút sửa của mỗi dòng mang mã giao dịch của chính dòng đó, nằm bên phải',
    (() => { const b = moiNode([tatCa[0]], []).filter((n) => n.role === 'icon')[0]; return [b.icon, b.action, b.pick, b.align]; })(),
    ['pencil', 'openActivityForm', 'ACT-000002', 'right']);

  check(so, 'ô đánh dấu mang mã giao dịch và một nhãn đọc được cho trình đọc màn hình',
    (() => { const o = moiNode([tatCa[0]], []).filter((n) => n.role === 'check')[0]; return [o.pick, o.label]; })(),
    ['ACT-000002', 'Chọn giao dịch ACT-000002']);

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

  // Khối thông tin chung. Hàng phụ chia hai cột để số điện thoại ghim mép phải — mẹo tiết kiệm chiều cao của bản cũ.
  check(so, 'chưa chọn khách thì khối thông tin chung cũng nói chưa chọn khách',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, ''))), ['Chưa chọn khách hàng nào.']);

  check(so, 'khối thông tin chung: tên công ty, rồi mã khách • người liên hệ bên trái và điện thoại ghim mép phải',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001'))),
    ['Công ty Thép Hòa Phát', 'CUS-000001 • Anh Tuấn', '0912345678']);

  check(so, 'điện thoại nằm ở cột phải, nhận đúng lớp ghim mép phải',
    moiNode(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001')), [])
      .filter((n) => n.className && n.className.indexOf('shin-text-right') !== -1).map((n) => n.text),
    ['0912345678']);

  check(so, 'khách đã xóa mềm thì khối thông tin chung có chip "Đã xóa"',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000002'))),
    ['Thép Việt Đức', 'Đã xóa', 'CUS-000002', '0987654321']);

  // Không có điện thoại thì hàng phụ về một cột, chứ không để lại một thẻ rỗng ở mép phải.
  check(so, 'khách chưa có điện thoại thì hàng phụ không sinh cột phải rỗng',
    chuCua(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000003'))).length, 2);

  check(so, 'khối thông tin chung cũng không mang field nào',
    moiNode(hop.SLOTS.infoBarContent(ctxCua(hop, 'CUS-000001')), []).filter((n) => n.field).length, 0);
}

module.exports = { chay };
