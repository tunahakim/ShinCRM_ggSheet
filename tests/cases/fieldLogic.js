/**
 * Ca kiểm của `client/schema/fieldLogic.html` — bảy hàm ngầm định của tài liệu 03 Phần 6.
 *
 * Ba chỗ đáng kiểm nhất đều là chỗ hỏng-trong-im-lặng: mã xem trước sinh ra từ bộ đếm mà bộ đếm là **chuỗi** trong `Store.config`, ba ngầm định kế tục phải đi qua `Store.getLatestActivity` chứ không phải phần tử đầu mảng — phần tử đầu có thể là một giao dịch đã xóa mềm, và riêng sản phẩm còn phải rơi tiếp về hồ sơ khách khi khách chưa có lần làm việc nào.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('fieldLogic — bảy ngầm định tính được của form');

  let hop;
  try {
    hop = napClient(taoHopCat(), 'client/schema/schemaAccess.html', 'client/ram/store.html', 'client/schema/fieldLogic.html');
    hop.Schema = hop.buildSchema(dungHop().hop.DATA_SCHEMA);
  } catch (err) {
    return ghiLoiNap(so, 'nạp fieldLogic cùng bảng khai trường thật', err);
  }

  const moc = new Date(2026, 8, 5, 14, 7, 3);
  check(so, 'today ra YYYY-MM-DD theo giờ máy, không lệch múi giờ', hop.fieldLogicToday(moc), '2026-09-05');
  check(so, 'now ra YYYY-MM-DD HH:mm, dấu cách chứ không phải chữ T', hop.fieldLogicNow(moc), '2026-09-05 14:07');

  // Mã xem trước: bộ đếm là chuỗi, và mã phải đủ sáu chữ số.
  hop.Store.config = { counters: { customer: '17', activity: '4' } };
  check(so, 'mã xem trước là bộ đếm cộng một, đệm đủ sáu chữ số',
    [hop.DEFAULTS.nextCustomerCode(), hop.DEFAULTS.nextActivityCode()], ['CUS-000018', 'ACT-000005']);

  hop.Store.config = { counters: {} };
  check(so, 'chưa có bộ đếm cho thực thể thì trả chuỗi rỗng, không đoán số 1', hop.DEFAULTS.nextCustomerCode(), '');

  hop.Store.config = { counters: { customer: 'không phải số' } };
  check(so, 'bộ đếm hỏng thì trả chuỗi rỗng chứ không ra CUS-00NaN', hop.DEFAULTS.nextCustomerCode(), '');

  // Hai ngầm định kế tục: giá trị của giao dịch gần nhất của **cùng khách**.
  hop.storeReset();
  hop.Store.config = { counters: { activity: '9' } };
  hop.Store.activitiesByCustomer['CUS-000001'] = [
    { id: 'ACT-000009', customerId: 'CUS-000001', workDate: '2026-09-04', priority: 'Cao', dueAt: '2026-09-10', recordStatus: 'active' },
    { id: 'ACT-000003', customerId: 'CUS-000001', workDate: '2026-08-01', priority: 'Thấp', dueAt: '2026-08-05', recordStatus: 'active' }
  ];

  check(so, 'kế tục lấy giá trị của giao dịch gần nhất cùng khách',
    [hop.DEFAULTS.carryForwardPriority('activity', { customerId: 'CUS-000001' }), hop.DEFAULTS.carryForwardDueAt('activity', { customerId: 'CUS-000001' })],
    ['Cao', '2026-09-10']);

  check(so, 'khách chưa có giao dịch nào thì kế tục ra rỗng — rỗng là câu trả lời đúng, không phải lỗi',
    hop.DEFAULTS.carryForwardPriority('activity', { customerId: 'CUS-000404' }), '');
  check(so, 'chưa biết khách nào thì kế tục ra rỗng',
    hop.DEFAULTS.carryForwardPriority('activity', {}), '');

  // Giao dịch mới nhất là bản đã xóa mềm: `getLatestActivity` bỏ nó, nên kế tục lấy bản còn dùng phía dưới.
  hop.Store.activitiesByCustomer['CUS-000002'] = [
    { id: 'ACT-000020', customerId: 'CUS-000002', workDate: '2026-09-05', priority: 'Khẩn', dueAt: '2026-09-06', recordStatus: 'deleted' },
    { id: 'ACT-000011', customerId: 'CUS-000002', workDate: '2026-09-01', priority: 'Vừa', dueAt: '2026-09-02', recordStatus: 'active' }
  ];
  check(so, 'giao dịch đầu mảng đã xóa mềm thì kế tục lấy bản còn dùng, không lấy bản đã xóa',
    hop.DEFAULTS.carryForwardPriority('activity', { customerId: 'CUS-000002' }), 'Vừa');

  // Sản phẩm là ca duy nhất có hai nguồn: lần làm việc gần nhất trước, hồ sơ khách sau.
  hop.Store.customers['CUS-000001'] = { id: 'CUS-000001', companyName: 'Thép Hòa Phát', product: 'Tôn mạ kẽm' };
  hop.Store.customers['CUS-000005'] = { id: 'CUS-000005', companyName: 'Cơ khí Đà Nẵng', product: 'Ống thép đúc' };
  hop.Store.activitiesByCustomer['CUS-000001'][0].product = 'Thép hình H';

  check(so, 'sản phẩm ưu tiên lấy của lần làm việc gần nhất, không lấy của hồ sơ khách',
    hop.DEFAULTS.carryForwardProduct('activity', { customerId: 'CUS-000001' }), 'Thép hình H');

  check(so, 'khách chưa có lần làm việc nào thì sản phẩm rơi về hồ sơ khách chứ không để trống',
    hop.DEFAULTS.carryForwardProduct('activity', { customerId: 'CUS-000005' }), 'Ống thép đúc');

  check(so, 'mã khách không có trong bộ nhớ thì sản phẩm ra rỗng, không làm sập form',
    hop.DEFAULTS.carryForwardProduct('activity', { customerId: 'CUS-000404' }), '');

  // Hồ sơ khách bỏ trống ô sản phẩm: vẫn phải ra rỗng, chứ không ra `undefined` rồi in ra chữ "undefined".
  hop.Store.customers['CUS-000006'] = { id: 'CUS-000006', companyName: 'Thép Việt Nhật' };
  check(so, 'hồ sơ khách bỏ trống sản phẩm thì ra rỗng chứ không ra undefined',
    hop.DEFAULTS.carryForwardProduct('activity', { customerId: 'CUS-000006' }), '');

  // Dựng bản ghi mới: `seed` vào trước để hai hàm kế tục có mã khách mà tra.
  const moi = hop.fieldLogicNewRecord('activity', { customerId: 'CUS-000001' });
  check(so, 'bản ghi mới nhận seed rồi mới chạy các hàm ngầm định', moi.record.customerId, 'CUS-000001');
  check(so, 'bản ghi mới mang cả ba giá trị kế tục và báo tên ba trường đã kế tục',
    [moi.record.priority, moi.record.dueAt, moi.record.product, moi.carried.sort()],
    ['Cao', '2026-09-10', 'Thép hình H', ['dueAt', 'priority', 'product']]);
  check(so, 'trường khai ngầm định today thì có ngày, không để trống', /^\d{4}-\d{2}-\d{2}$/.test(moi.record.workDate), true);

  const rong = hop.fieldLogicNewRecord('activity', { customerId: 'CUS-000404' });
  check(so, 'khách không có giao dịch thì carried rỗng — không báo kế tục một giá trị rỗng', rong.carried.length, 0);

  check(so, 'seed đè được cả trường có ngầm định, vì bên gọi biết rõ hơn',
    hop.fieldLogicNewRecord('activity', { customerId: 'CUS-000001', workDate: '2026-01-01' }).record.workDate, '2026-01-01');

  // Bảng DEFAULTS thiếu tên là lỗi bảng khai, phải hét lên chứ không im lặng để trống ô.
  const luu = hop.DEFAULTS.today;
  delete hop.DEFAULTS.today;
  checkThrows(so, 'trường khai ngầm định không có trong bảng DEFAULTS thì nói rõ các tên hiện có',
    () => hop.fieldLogicNewRecord('activity', {}), 'không có trong bảng DEFAULTS');
  hop.DEFAULTS.today = luu;

  check(so, 'đệm số giữ nguyên số dài hơn ô đệm chứ không cắt mất chữ số',
    [hop.fieldLogicPad(7, 6), hop.fieldLogicPad(1234567, 6)], ['000007', '1234567']);
}

module.exports = { chay };
