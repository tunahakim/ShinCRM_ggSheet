/**
 * Ca kiểm **nghiệm thu của chặng 1.2**: cả đường nạp, từ ô trên sheet tới bộ nhớ của sidebar.
 *
 * Điều làm nhóm ca này khác mọi nhóm khác: nó dựng **hai hộp cát**, và cho dữ liệu đi qua `JSON.parse(JSON.stringify(...))` ở giữa. Đó là bản mô phỏng đường `google.script.run` — cây cầu duy nhất giữa máy chủ và sidebar, và cũng là chỗ mà một giá trị `Date` sẽ âm thầm biến thành `null`. Nạp cả hai phía vào một hộp thì cây cầu đó không tồn tại, và phép kiểm sẽ xanh trong khi bản thật rơi mất dữ liệu.
 *
 * Ba luật tra cứu **khác nhau** của `Store` là trọng tâm, vì chúng khác nhau có chủ ý và rất dễ bị "dọn cho đồng bộ":
 *   - `getCustomer` thiếu mã thì **ném lỗi** — bên gọi là code đã có mã trong tay, nên tra không ra nghĩa là bản đồ hàng đã cũ, và đó là thứ phải hét lên.
 *   - `getActivities` trả **mảng rỗng** — khách chưa có giao dịch nào là chuyện thường.
 *   - `getCustomerIdByRow` trả **chuỗi rỗng** — bên gọi là một cú click bất kỳ, và click vào hàng tiêu đề thì không mở gì.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { dungClient } = require('../lib/dung-client');
const { formatDateGia } = require('../lib/gas-stubs');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

/** Hộp máy chủ có cả năm sheet, khóa dọn log đặt sẵn để phép quét tuổi log không chen vào. */
function dungMayChu() {
  return dungHop({
    sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'],
    props: { LOG_LAST_CLEANUP: formatDateGia(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') }
  });
}

/** Ghi một khách. `tim` là ô từ khóa tìm kiếm, để phép kiểm chỉ mục có thứ khác tên công ty mà khớp. */
function ghiKhach(nen, hang, ma, ten, mst, tinhTrang, tim) {
  ghiO(nen, 'Customer', hang, '@CUS_MA_KH', ma);
  ghiO(nen, 'Customer', hang, '@CUS_TEN_CTY', ten);
  ghiO(nen, 'Customer', hang, '@CUS_MST', mst || '');
  ghiO(nen, 'Customer', hang, '@CUS_TT_BAN_GHI', tinhTrang || 'active');
  if (tim) { ghiO(nen, 'Customer', hang, '@CUS_TIM_KIEM', tim); }
}

/** Ghi một giao dịch. `ngay` là ô ngày làm việc, nhận cả `Date` để chứng minh nó không đi qua cầu dưới dạng `Date`. */
function ghiGiaoDich(nen, hang, ma, maKhach, ngay, tinhTrang) {
  ghiO(nen, 'Activity', hang, '@ACT_MA_GD', ma);
  ghiO(nen, 'Activity', hang, '@ACT_MA_KH', maKhach);
  ghiO(nen, 'Activity', hang, '@ACT_NGAY_LAM_VIEC', ngay);
  ghiO(nen, 'Activity', hang, '@ACT_TT_BAN_GHI', tinhTrang || 'active');
}

/** Cho một gói đi qua cầu `google.script.run`. Đây là chỗ `Date` chết, nên phép kiểm phải đi qua nó thật. */
function quaCau(goi) {
  return JSON.parse(JSON.stringify(goi));
}

function chay(so) {
  section('Nghiệm thu chặng 1.2 — từ ô trên sheet, qua cầu google.script.run, vào bộ nhớ sidebar');

  let nen;
  let hop;
  try {
    nen = dungMayChu();
    hop = dungClient();
  } catch (err) {
    return ghiLoiNap(so, 'nạp được cả hai hộp cát máy chủ và client', err);
  }

  const hangDau = nen.hop.SHEET_FIRST_DATA_ROW;

  // Ba khách: một thường, một đã xóa mềm, một trùng mã số thuế với khách đã xóa.
  ghiKhach(nen, hangDau, 'KH0001', 'Công ty Xây dựng Đông Á', '0101234567', 'active', 'dong a xd');
  ghiKhach(nen, hangDau + 1, 'KH0002', 'Công ty Đông Á Cũ', '0109999999', 'deleted');
  ghiKhach(nen, hangDau + 3, 'KH0003', 'Thương mại Hải Phòng', '', 'active');

  // Bốn giao dịch của KH0001, cố tình ghi lộn xộn về thời gian, và giao dịch mới nhất bị xóa mềm.
  ghiGiaoDich(nen, hangDau, 'GD0001', 'KH0001', new Date(2026, 8, 1));
  ghiGiaoDich(nen, hangDau + 1, 'GD0002', 'KH0001', new Date(2026, 8, 4));
  ghiGiaoDich(nen, hangDau + 2, 'GD0003', 'KH0001', new Date(2026, 8, 4));
  ghiGiaoDich(nen, hangDau + 3, 'GD0004', 'KH0001', new Date(2026, 8, 5), 'deleted');
  ghiGiaoDich(nen, hangDau + 4, 'GD0005', 'KH0003', new Date(2026, 7, 20));

  const goiGoc = nen.hop.loadCore();
  check(so, 'phía máy chủ: KHÔNG một ô nào còn là Date trước khi qua cầu',
    goiGoc.customer.rows.some((row) => row.some((o) => nen.hop.dateTextIsDate(o))), false);

  const core = quaCau(goiGoc);
  const boQua = hop.ingestCore(core);

  check(so, 'bộ tự kiểm schema chạy trước khi bung bản ghi, và không tìm ra lỗi nào trên bảng khai thật',
    Array.isArray(boQua), true);
  check(so, 'các phép kiểm chưa có đầu vào thì được KỂ TÊN, không bỏ qua trong im lặng',
    boQua.length > 0, true);

  check(so, 'ba khách vào bộ nhớ, khóa là mã khách', Object.keys(hop.Store.customers).sort(), ['KH0001', 'KH0002', 'KH0003']);
  check(so, 'bản ghi là object có khóa là TÊN TRƯỜNG — hình dạng đường truyền chỉ tồn tại tới đây',
    hop.Store.getCustomer('KH0001').companyName, 'Công ty Xây dựng Đông Á');
  check(so, 'SETTINGS đi cùng gói nạp và được gán một lần', hop.SETTINGS.CHUNK_ROWS, nen.hop.SETTINGS.CHUNK_ROWS);
  check(so, 'chín danh mục vào bộ nhớ, và Config bốn khối cộng khối tham số cũng vậy',
    [Object.keys(hop.Store.categories).length, Object.keys(hop.Store.config).sort()],
    [9, ['counters', 'defaults', 'params', 'sheetSchema', 'sort']]);
  check(so, 'cờ nạp giao dịch bật ở loading ngay sau ingestCore, chưa phải ready', hop.Store.activityState, hop.STORE_LOADING);

  return chayTraCuu(so, nen, hop, hangDau);
}

/** Phần hai: ba luật tra cứu khác nhau, cộng cầu nối tọa độ ô. Tách hàm để mỗi phần đọc trong một màn hình. */
function chayTraCuu(so, nen, hop, hangDau) {
  section('Ba đường tra của Store — ba luật khác nhau, và khác nhau là có chủ ý');

  check(so, 'getCustomer tra ra khách còn sống', hop.Store.getCustomer('KH0001').id, 'KH0001');
  check(so, 'getCustomer tra ra cả khách ĐÃ XÓA MỀM — "đã xóa" là một giá trị, không phải sự vắng mặt',
    hop.Store.getCustomer('KH0002').recordStatus, 'deleted');
  checkThrows(so, 'getCustomer thiếu mã thì NÉM LỖI, vì đó là dấu hiệu bản đồ hàng đã cũ',
    () => hop.Store.getCustomer('KH9999'), 'Không có khách mã "KH9999"');
  checkThrows(so, 'lời lỗi nói luôn bộ nhớ đang giữ bao nhiêu khách, để người sửa biết là nạp hụt hay tra sai',
    () => hop.Store.getCustomer('KH9999'), 'đang giữ 3 khách');

  check(so, 'getActivities của khách chưa có giao dịch trả MẢNG RỖNG, không ném — ở đây rỗng là câu trả lời đúng',
    hop.Store.getActivities('KH0002'), []);
  check(so, 'getActivities của mã không tồn tại cũng trả mảng rỗng, không ném', hop.Store.getActivities('KH9999'), []);

  // Cầu nối tọa độ. Ba câu trả lời khác nhau cho ba loại click, và cả ba đều là chuỗi rỗng chứ không phải lỗi.
  check(so, 'getCustomerIdByRow trả đúng mã khách ở hàng đó', hop.Store.getCustomerIdByRow('Customer', hangDau), 'KH0001');
  check(so, 'click vào hàng tiêu đề trả CHUỖI RỖNG, không ném — click vào đó thì không mở gì',
    hop.Store.getCustomerIdByRow('Customer', 1), '');
  check(so, 'click vào hàng trống giữa vùng dữ liệu cũng trả chuỗi rỗng',
    hop.Store.getCustomerIdByRow('Customer', hangDau + 2), '');
  check(so, 'click ở sheet không có bảng tra trả chuỗi rỗng — Activity cố tình không có bảng tra',
    hop.Store.getCustomerIdByRow('Activity', hangDau), '');
  check(so, 'bảng tra là MẢNG THƯA đánh chỉ số theo số hàng thật, đúng hình dạng tài liệu 05 Phần 7',
    [Array.isArray(hop.Store.rowMaps.Customer), hop.Store.rowMaps.Customer[hangDau + 3]], [true, 'KH0003']);

  // Chỉ mục tìm kiếm: khách còn sống trước, khách đã xóa sau, và bỏ dấu thì vẫn khớp.
  check(so, 'tìm không dấu vẫn khớp tên có dấu', hop.Store.searchCustomers('dong a').map((k) => k.id), ['KH0001', 'KH0002']);
  check(so, 'khách còn sống đứng trước khách đã xóa, dù khách đã xóa nằm trước trong chỉ mục',
    hop.Store.searchCustomers('dong a')[0].recordStatus, 'active');
  check(so, 'ô từ khóa tìm kiếm cũng vào chỉ mục, vì nó khai searchable', hop.Store.searchCustomers('xd').map((k) => k.id), ['KH0001']);
  check(so, 'tra bằng mã số thuế khớp, vì mã số thuế cũng khai searchable', hop.Store.searchCustomers('0101234567').map((k) => k.id), ['KH0001']);
  check(so, 'chuỗi rỗng trả về rỗng chứ không trả cả danh sách', hop.Store.searchCustomers('  '), []);
  check(so, 'limit cắt đúng số lượng', hop.Store.searchCustomers('dong a', 1).length, 1);

  check(so, 'mã số thuế của khách ĐÃ XÓA vẫn tính là đã dùng — cửa ghi đếm cả hàng đó trên sheet',
    hop.Store.isTaxNumberTaken('0109999999'), true);
  check(so, 'exceptId cho bản ghi khỏi tự báo trùng với chính nó', hop.Store.isTaxNumberTaken('0109999999', 'KH0002'), false);
  check(so, 'mã số thuế để trống không phải mã số thuế bị chiếm', hop.Store.isTaxNumberTaken(''), false);

  return chayGiaoDich(so, nen, hop);
}

/** Phần ba: nạp giao dịch theo gói rồi sắp một lần, và cửa ghi duy nhất. */
function chayGiaoDich(so, nen, hop) {
  section('Nạp giao dịch vào RAM — sắp một lần sau khi nạp xong, và cửa ghi duy nhất');

  let cursor = null;
  let soGoi = 0;
  let soBanGhi = 0;

  do {
    const goi = JSON.parse(JSON.stringify(nen.hop.loadActivityChunk(cursor)));
    soBanGhi += hop.ingestActivityChunk(goi);
    cursor = goi.nextCursor;
    soGoi += 1;
    if (soGoi > 20) { break; }
  } while (cursor);

  check(so, 'nạp đủ 5 giao dịch qua vòng lặp gói', soBanGhi, 5);
  check(so, 'cờ vẫn ở loading khi chưa gọi ingestActivityDone — vì mảng chưa sắp', hop.Store.activityState, hop.STORE_LOADING);

  const soMang = hop.ingestActivityDone();
  check(so, 'sắp xong hai mảng của hai khách rồi mới bật cờ ready', [soMang, hop.Store.activityState], [2, hop.STORE_READY]);

  check(so, 'giao dịch xếp ngày giảm dần, hòa ngày thì mã giảm dần — so bằng chuỗi, không đổi sang Date',
    hop.Store.getActivities('KH0001').map((g) => g.id), ['GD0004', 'GD0003', 'GD0002', 'GD0001']);
  check(so, 'ngày làm việc qua cầu là chuỗi YYYY-MM-DD, không phải null',
    hop.Store.getActivities('KH0001')[0].workDate, '2026-09-05');
  check(so, 'giao dịch ĐÃ XÓA MỀM vẫn nằm trong mảng, không bị lọc và không bị dồn xuống cuối',
    hop.Store.getActivities('KH0001')[0].recordStatus, 'deleted');
  check(so, 'getLatestActivity BỎ QUA bản ghi đã xóa và trả bản ghi còn sống gần nhất',
    hop.Store.getLatestActivity('KH0001').id, 'GD0003');
  check(so, 'khách không có giao dịch nào thì getLatestActivity trả null', hop.Store.getLatestActivity('KH0002'), null);

  // Cửa ghi duy nhất. Sửa một khách phải cập nhật cả chỉ mục tìm kiếm, không thêm phần tử trùng.
  const truoc = hop.Store.searchIndex.length;
  const khach = hop.Store.getCustomer('KH0003');
  hop.Store.upsertRecord('customer', Object.assign({}, khach, { companyName: 'Thương mại Hải Dương' }));

  check(so, 'sửa một khách không làm chỉ mục dài thêm', hop.Store.searchIndex.length, truoc);
  check(so, 'chỉ mục cập nhật theo tên mới', hop.Store.searchCustomers('hai duong').map((k) => k.id), ['KH0003']);
  check(so, 'và không còn khớp tên cũ', hop.Store.searchCustomers('hai phong'), []);

  hop.Store.upsertRecord('activity', { id: 'GD0006', customerId: 'KH0001', workDate: '2026-09-06', recordStatus: 'active' });
  check(so, 'thêm một giao dịch mới thì nó vào đúng đầu mảng đã sắp', hop.Store.getActivities('KH0001')[0].id, 'GD0006');
  check(so, 'và nó thành lần làm việc gần nhất', hop.Store.getLatestActivity('KH0001').id, 'GD0006');

  hop.Store.upsertRecord('activity', { id: 'GD0006', customerId: 'KH0001', workDate: '2026-09-06', recordStatus: 'deleted' });
  check(so, 'ghi đè cùng mã thì thay tại chỗ, không sinh bản thứ hai',
    hop.Store.getActivities('KH0001').filter((g) => g.id === 'GD0006').length, 1);
  check(so, 'xóa mềm bản ghi mới nhất thì lần gần nhất lùi về bản trước', hop.Store.getLatestActivity('KH0001').id, 'GD0003');

  checkThrows(so, 'upsertRecord với thực thể lạ thì ném lỗi kèm danh sách thực thể có thật',
    () => hop.Store.upsertRecord('khach', { id: 'X' }), 'Chỉ có "customer" và "activity"');

  // Dọn kho: bộ kiểm nào chạy sau cũng phải chạy trên kho sạch.
  hop.storeReset();
  check(so, 'storeReset dọn sạch cả bảy thành viên và đặt cờ về loading',
    [Object.keys(hop.Store.customers).length, hop.Store.searchIndex.length, hop.Store.activityState],
    [0, 0, hop.STORE_LOADING]);

  return so;
}

module.exports = { chay };
