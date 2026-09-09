/**
 * Nhóm ca kiểm của `client/ram/bootstrap.html` — nhưng chỉ hai hàm thuần của nó: bậc thang cỡ gói và lời báo cuối lượt nạp.
 *
 * `sidebarBoot` không kiểm được ở đây và cố ý không cố: nó `await` máy chủ và vẽ vào DOM, tức đúng hai thứ hộp cát này không có. Bù lại, hai hàm dưới đây là hai chỗ ra quyết định — chọn cỡ gói nào, và nói gì với người dùng — nên hỏng ở đây là hỏng im lặng.
 *
 * Lý do có tệp này: `bootTellProblems` từng trộn `warnings` với `skipped` vào cùng một hộp thoại. Hai danh sách đó khác người đọc — một cái nói về dữ liệu trong sheet, một cái nói về bộ kiểm — nên trộn lại lần nữa là một cú lùi mà không ai nhìn ra bằng mắt.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

async function chay(so) {
  section('bootstrap — cảnh báo nổ hộp thoại, phép kiểm bị bỏ qua thì xuống console');

  let hop = null;
  try {
    hop = napClient(taoHopCat(), 'client/ram/bootstrap.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp bootstrap', err);
  }

  // Bắt lấy hai đường ra thay vì để chúng nổ ra màn hình thật.
  const hopThoai = [];
  const console_ = [];
  hop.alert = (chu) => hopThoai.push(chu);
  hop.console = { info: (chu) => console_.push(chu), error: () => {} };

  const loiCho = [];
  hop.dispatchError = (err) => loiCho.push(err.message);
  check(so, 'kho lỗi chờ dùng đúng kênh hộp thoại lớn và gộp thành một lần hiện',
    [hop.bootTellPendingMessages([]), hop.bootTellPendingMessages(['lỗi một', 'lỗi hai']), loiCho.length, loiCho[0].includes('lỗi một') && loiCho[0].includes('lỗi hai')],
    [null, 'ShinCRM ghi nhận 2 lỗi từ các lượt chạy nền trước đó:\n\n• lỗi một\n• lỗi hai', 1, true]);

  check(so, 'lượt nạp sạch thì không hộp thoại nào chắn đường',
    [hop.bootTellProblems({}), hopThoai.length, console_.length], [null, 0, 0]);

  // Hai phép kiểm này bỏ qua ở **mọi** lượt nạp tới hết chặng 1.3, vì `NORMALIZERS` và `VALIDATORS` chỉ có một bản phía máy chủ. Nếu chúng nổ hộp thoại thì tới tuần thứ hai người dùng bấm OK mà không đọc, và cái cảnh báo thật chịu chung số phận.
  hop.bootTellProblems({ skipped: ['tên hàm khai ở `normalize` có trong bảng NORMALIZERS'] });
  check(so, 'phép kiểm bị bỏ qua chỉ xuống console, không nổ hộp thoại',
    [hopThoai.length, console_.length, console_[0].indexOf('NORMALIZERS') !== -1], [0, 1, true]);

  const chu = hop.bootTellProblems({ warnings: ['sheet Category có 2 hàng trắng'] });
  check(so, 'cảnh báo về dữ liệu thì chắn đường bằng hộp thoại, và đếm đúng số dòng',
    [hopThoai.length, chu.indexOf('có 1 điều cần biết') !== -1, chu.indexOf('hàng trắng') !== -1],
    [0, true, true]);

  hopThoai.length = 0;
  console_.length = 0;
  hop.bootTellProblems({ warnings: ['một cảnh báo'], skipped: ['một phép bỏ qua'] });
  check(so, 'có cả hai loại thì mỗi loại đi một đường, và hộp thoại không kể tên phép kiểm bị bỏ qua',
    [hopThoai.length, console_.length, hopThoai.length === 0], [0, 1, true]);

  section('bootstrap — bậc thang cỡ gói đọc từ SETTINGS, không gõ cứng');

  hop.SETTINGS = { CHUNK_ROWS: 30, CHUNK_ROWS_FALLBACK: [15, 5] };
  check(so, 'bậc thang là cỡ chuẩn rồi tới các cỡ lùi', hop.bootChunkLadder(), [30, 15, 5]);

  hop.SETTINGS = null;
  check(so, 'chưa có SETTINGS thì một bậc null để máy chủ tự chọn, chứ không gõ cứng một con số ở client',
    hop.bootChunkLadder(), [null]);

  section('bootstrap — gói lỗi thì lùi đúng cỡ và giữ nguyên con trỏ');

  hop.SETTINGS = { CHUNK_ROWS: 30, CHUNK_ROWS_FALLBACK: [15, 5] };
  const calls = [];
  const retries = [];
  hop.callServer = (name, args) => {
    calls.push([name, args]);
    if (calls.length === 1) { return Promise.reject(new Error('gói quá nặng')); }
    return Promise.resolve({ ok: true, nextCursor: null });
  };
  const cursor = { endRow: 100 };
  const ket = await hop.bootChunkWithFallback(cursor, (hong, nho) => retries.push([hong, nho]));
  check(so, 'gói thất bại được gọi lại cùng con trỏ ở bậc lùi kế tiếp',
    [ket.ok, calls, retries],
    [true, [['loadActivityChunk', [cursor, 30]], ['loadActivityChunk', [cursor, 15]]], [[30, 15]]]);

  calls.length = 0;
  let loiCuoi = null;
  hop.callServer = (name, args) => {
    calls.push([name, args]);
    return Promise.reject(new Error('máy chủ vẫn lỗi'));
  };
  try {
    await hop.bootChunkWithFallback(cursor);
  } catch (err) {
    loiCuoi = err;
  }
  check(so, 'hết mọi bậc lùi thì ném đúng lỗi cuối cùng, không nuốt lỗi',
    [calls.map((call) => call[1][1]), loiCuoi && loiCuoi.message],
    [[30, 15, 5], 'máy chủ vẫn lỗi']);
}

module.exports = { chay };
