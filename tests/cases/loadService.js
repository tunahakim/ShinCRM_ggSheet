/**
 * Ca kiểm cho `server/service/LoadService.js`: hai đường nạp `loadCore` và `loadActivityChunk`.
 *
 * Tệp này không kiểm phép đọc ô — việc đó thuộc `entityRead.js`, `categoryRead.js`, `configRead.js`. Nó kiểm ba thứ mà chỉ tầng gom lượt nạp mới có:
 *
 * **Hình dạng gói trả về.** Client dựng cả tầng dữ liệu theo hình dạng này, nên thiếu một khóa là mọi chỗ nhận phản hồi phải sửa lại một lượt — đúng loại việc mà sót một chỗ thì không có gì báo.
 *
 * **Thứ tự: đo ngân sách ô TRƯỚC khi đọc ô nào.** Vượt trần thì gói trả về không được có `customer` — nếu vẫn có nghĩa là code đã đọc dữ liệu rồi mới nhớ ra là bị chặn.
 *
 * **Con trỏ gói đi ngược từ hàng cuối lên, và phải dừng.** Một con trỏ không tiến làm trình duyệt treo với dải tiến trình chạy mãi, nên phép kiểm ở đây tự chạy hết vòng lặp thật thay vì tin vào `done`.
 */

const { dungHop, ghiO } = require('../lib/dung-hop');
const { formatDateGia } = require('../lib/gas-stubs');
const { section, check, ghiLoiNap } = require('../lib/assert');

const NAM_SHEET = ['Customer', 'Activity', 'Category', 'Config', 'Log'];

/** Hộp cát có cả năm sheet, kèm khóa dọn log đặt sẵn cho hôm nay để phép quét tuổi log không chen vào. */
function dungNap(thamSo) {
  return dungHop({
    sheets: NAM_SHEET,
    thamSo: thamSo,
    props: { LOG_LAST_CLEANUP: formatDateGia(new Date(), 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') }
  });
}

/** Ghi một khách vào sheet giả. */
function ghiKhach(nen, hang, ma, ten, tinhTrang) {
  ghiO(nen, 'Customer', hang, '@CUS_MA_KH', ma);
  ghiO(nen, 'Customer', hang, '@CUS_TEN_CTY', ten);
  ghiO(nen, 'Customer', hang, '@CUS_TT_BAN_GHI', tinhTrang || 'active');
}

/** Ghi một giao dịch vào sheet giả. */
function ghiGiaoDich(nen, hang, ma, maKhach, ngay) {
  ghiO(nen, 'Activity', hang, '@ACT_MA_GD', ma);
  ghiO(nen, 'Activity', hang, '@ACT_MA_KH', maKhach);
  ghiO(nen, 'Activity', hang, '@ACT_NGAY_LAM_VIEC', ngay);
}

function chay(so) {
  section('Đường nạp — hình dạng gói, thứ tự đo trước đọc sau, và con trỏ gói phải dừng');

  let nen;
  try {
    nen = dungNap();
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/service/LoadService.js', err);
  }

  const hop = nen.hop;
  const hangDau = hop.SHEET_FIRST_DATA_ROW;

  // Ca rỗng đi trước: đây là ca của lượt mở sidebar đầu tiên trên tệp mới dựng.
  const rong = hop.loadCore();
  check(so, 'gói lõi có đúng bộ khóa tài liệu 05 chốt, không thiếu không thừa',
    Object.keys(rong).sort(),
    ['activity', 'blocked', 'budget', 'categories', 'config', 'customer', 'dirty', 'ms', 'ok', 'rowMaps', 'schema', 'settings', 'warnings'].sort());
  check(so, 'sheet trắng nạp trót lọt và không bị chặn', [rong.ok, rong.blocked], [true, false]);
  check(so, 'không khách nào mà vẫn gửi đủ bảng tên trường', [rong.customer.rows.length, rong.customer.fields.length], [0, 20]);
  check(so, 'khối activity chỉ báo số hàng và cỡ gói, không mang bản ghi nào', Object.keys(rong.activity).sort(), ['chunkRows', 'total']);
  check(so, 'cỡ gói lấy đúng từ SETTINGS chứ không gõ cứng ở đây', rong.activity.chunkRows, hop.SETTINGS.CHUNK_ROWS);
  check(so, 'chín danh mục thật đều có khóa dù chưa ai gõ giá trị', Object.keys(rong.categories).length, 9);
  check(so, 'khối trạng thái bẩn có mặt trong MỌI phản hồi, kể cả phản hồi rỗng', Object.keys(rong.dirty).sort(), ['all', 'config', 'records', 'viewSheets']);
  check(so, 'gói lõi mang cả bảng khai để client dựng Schema', Object.keys(rong.schema).sort(), ['activity', 'customer']);
  check(so, 'ms là số, không phải chuỗi', typeof rong.ms, 'number');

  // Bảng tra hàng → mã. Chỉ sheet chứa khách có mặt; sheet Activity cố tình không có.
  ghiKhach(nen, hangDau, 'KH0001', 'Công ty Một');
  ghiKhach(nen, hangDau + 2, 'KH0003', 'Công ty Ba', 'deleted');

  const co = hop.loadCore();
  check(so, 'hai khách đọc ra, hàng trắng ở giữa không thành bản ghi', co.customer.rows.length, 2);
  check(so, 'rowMaps chỉ có khóa của sheet chứa khách — Activity cố tình không có bảng tra', Object.keys(co.rowMaps), ['Customer']);
  check(so, 'bảng tra khóa là số hàng dạng chuỗi, giá trị là mã khách',
    co.rowMaps.Customer, { '4': 'KH0001', '6': 'KH0003' });
  check(so, 'hàng không có bản ghi KHÔNG có khóa trong bảng tra — object chứ không phải mảng thưa',
    Object.prototype.hasOwnProperty.call(co.rowMaps.Customer, '5'), false);
  check(so, 'khách đã xóa mềm vẫn nằm trong bảng tra, vì click vào hàng đó phải mở được',
    co.rowMaps.Customer['6'], 'KH0003');

  // Không một giá trị nào được là `Date`: `google.script.run` không mang `Date` qua, nó thành `null` bên client.
  ghiO(nen, 'Customer', hangDau, '@CUS_NGAY_NHAP_LIEU', new Date(2026, 8, 5, 14, 30, 0));
  const coNgay = hop.loadCore();
  check(so, 'không một ô nào còn là Date sau khi nạp',
    coNgay.customer.rows.some((row) => row.some((o) => hop.dateTextIsDate(o))), false);

  // Đường chặn. Trần đặt thấp hơn kích thước lưới thật của tệp giả nên phép đo phải chặn.
  const chan = dungNap([['TRAN_SO_O', '10']]);
  const bao = chan.hop.loadCore();
  check(so, 'vượt trần thì blocked mang TÊN LÝ DO chứ không phải true', bao.blocked, 'cellBudget');
  check(so, 'gói bị chặn chỉ có bốn khóa, và KHÔNG có customer — bằng chứng là chưa đọc ô dữ liệu nào',
    Object.keys(bao).sort(), ['blocked', 'budget', 'dirty', 'ms', 'ok'].sort());
  check(so, 'gói bị chặn vẫn mang bảng thủ phạm để người dùng biết dọn sheet nào',
    bao.budget.sheets.length > 0, true);
  check(so, 'gói bị chặn vẫn mang khối trạng thái bẩn', Object.keys(bao.dirty).sort(), ['all', 'config', 'records', 'viewSheets']);

  return chayGoi(so, nen, hop, hangDau);
}

/** Phần thứ hai: nạp `activity` theo gói, đi ngược từ hàng cuối lên. Tách hàm cho phần trên đọc còn một màn hình. */
function chayGoi(so, nen, hop, hangDau) {
  section('Nạp giao dịch theo gói — đi ngược từ hàng cuối, và vòng lặp phải dừng');

  const rong = hop.loadActivityChunk(null);
  check(so, 'sheet giao dịch trắng thì gói đầu đã là gói cuối, không ném lỗi',
    [rong.rows.length, rong.done, rong.nextCursor, rong.total], [0, true, null, 0]);
  check(so, 'gói rỗng vẫn gửi đủ bảng tên trường và khối trạng thái bẩn',
    [rong.fields.length, Object.keys(rong.dirty).length], [13, 4]);

  // Năm giao dịch, cỡ gói vặn xuống 2 để chứng minh con trỏ đi đúng đường mà không phải dựng 1.000 hàng.
  for (let i = 0; i < 5; i++) {
    ghiGiaoDich(nen, hangDau + i, 'GD000' + (i + 1), 'KH0001', '2026-09-0' + (i + 1));
  }
  hop.SETTINGS.CHUNK_ROWS = 2;

  const goi1 = hop.loadActivityChunk(null);
  check(so, 'gói đầu đọc từ hàng CUỐI ngược lên, vì bản ghi mới nhất nằm dưới cùng',
    goi1.rows.map((row) => row[0]), ['GD0004', 'GD0005']);
  check(so, 'chưa hết thì done là false và con trỏ trỏ tới hàng ngay TRÊN gói vừa đọc',
    [goi1.done, goi1.nextCursor], [false, { endRow: hangDau + 2 }]);
  check(so, 'mọi gói đều báo tổng số hàng, để dải tiến trình biết mẫu số', goi1.total, 5);

  const goi2 = hop.loadActivityChunk(goi1.nextCursor);
  check(so, 'gói hai đọc tiếp xuống dưới, không đọc lại hàng nào của gói một', goi2.rows.map((row) => row[0]), ['GD0002', 'GD0003']);

  const goi3 = hop.loadActivityChunk(goi2.nextCursor);
  check(so, 'gói cuối chỉ còn một hàng và tự báo done', [goi3.rows.map((row) => row[0]), goi3.done, goi3.nextCursor], [['GD0001'], true, null]);

  // Chạy lại cả vòng lặp thật, đúng như `bootLoadActivities` chạy: đây là phép kiểm cho việc nó DỪNG.
  let cursor = null;
  let soGoi = 0;
  const daDoc = [];
  do {
    const goi = hop.loadActivityChunk(cursor);
    goi.rows.forEach((row) => daDoc.push(row[0]));
    cursor = goi.nextCursor;
    soGoi += 1;
    if (soGoi > 20) { break; }
  } while (cursor);

  check(so, 'cả vòng lặp dừng sau 3 gói và đọc đủ 5 bản ghi, không trùng không sót',
    [soGoi, daDoc.sort()], [3, ['GD0001', 'GD0002', 'GD0003', 'GD0004', 'GD0005']]);

  // Con trỏ trỏ lên trên hàng dữ liệu đầu tiên: ca này xảy ra khi người dùng xóa hàng giữa hai lần gọi.
  const ngoai = hop.loadActivityChunk({ endRow: hangDau - 1 });
  check(so, 'con trỏ trỏ vào vùng tiêu đề thì trả gói rỗng và done, không đọc hàng tiêu đề',
    [ngoai.rows.length, ngoai.done], [0, true]);

  hop.SETTINGS.CHUNK_ROWS = 1000;
  return so;
}

module.exports = { chay };
