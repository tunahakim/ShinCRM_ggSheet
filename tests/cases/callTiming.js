/**
 * Nhóm ca kiểm của `callTiming` — sổ đo thời gian mỗi vòng gọi máy chủ ở phía sidebar.
 *
 * Tệp này kiểm được offline vì sổ không chạm DOM và không chạm `google`. Nó đáng kiểm bởi con số nó tính ra là con số dùng để quyết cỡ gói: nếu phép trừ "client đo được trừ máy chủ báo" sai thì tiền đi đường hiện ra sai, và cỡ gói bị chọn theo một con số bịa.
 *
 * Đồng hồ truyền vào từng hàm chứ không đọc `Date.now()` bên trong — nhờ vậy ca kiểm dựng được một lượt chạy 40 giây mà chỉ mất một phần nghìn giây.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('callTiming — tách tổng thời gian thành máy chủ, đi đường và trình duyệt');

  let hop = null;
  try {
    hop = napClient(taoHopCat(), 'client/util/callTiming.html');
  } catch (err) {
    return ghiLoiNap(so, 'nạp callTiming', err);
  }

  // Một lượt khởi động thật: nạp lõi rồi năm gói giao dịch. Mốc thời gian đặt tay để con số ra tròn và đọc được.
  hop.callTimingReset(1000);
  hop.callTimingRecord('loadCore', 8000, 3600);
  hop.callTimingFirstPaint(9500);
  [1, 2, 3, 4, 5].forEach(function () { hop.callTimingRecord('loadActivityChunk', 6000, 3500); });
  const bc = hop.callTimingReport(41000);

  check(so, 'đếm đủ sáu vòng: một lõi và năm gói', bc.soVong, 6);
  check(so, 'tổng là hiệu hai đầu đồng hồ, không phải tổng các vòng', bc.msTong, 40000);
  check(so, 'mốc khung hình đầu tiên tính từ lúc mở sổ', bc.msKhungHinhDau, 8500);
  check(so, 'phần máy chủ là tổng các con số máy chủ tự báo', bc.msMayChu, 3600 + 3500 * 5);
  check(so, 'tiền đi đường là hiệu từng vòng cộng lại — phần log cũ không thấy',
    bc.msDiDuong, (8000 - 3600) + (6000 - 3500) * 5);
  check(so, 'tiền đi đường mỗi vòng là con số quyết cỡ gói', bc.msDiDuongMoiVong, Math.round(16900 / 6));
  check(so, 'phần trình duyệt bung và vẽ là phần dư sau khi trừ mọi vòng', bc.msKhachLamViec, 40000 - 38000);
  check(so, 'ba phần cộng lại bằng tổng', bc.msMayChu + bc.msDiDuong + bc.msKhachLamViec, bc.msTong);

  check(so, 'khóa `vong` ghi từng vòng dạng client trên máy chủ', bc.vong[0], 'loadCore 8000/3600');

  // Vòng gãy: máy chủ không trả `ms` nào. Nó phải đếm vào số vòng mà không làm phồng phần tiền đi đường.
  hop.callTimingReset(0);
  hop.callTimingRecord('loadCore', 2000, 800);
  hop.callTimingRecord('loadActivityChunk', 5000, undefined);
  const gay = hop.callTimingReport(9000);

  check(so, 'vòng không có số máy chủ vẫn được đếm', gay.soVong, 2);
  check(so, 'nhưng không bị coi như máy chủ tính toán 0 ms', gay.msMayChu, 800);
  check(so, 'và không bị tính thành tiền đi đường', gay.msDiDuong, 1200);
  check(so, 'trung bình chia cho số vòng CÓ đo được, không chia cho tổng số vòng', gay.msDiDuongMoiVong, 1200);
  check(so, 'thời gian vòng gãy vẫn trừ khỏi phần trình duyệt', gay.msKhachLamViec, 9000 - 7000);
  check(so, 'vòng không đo được thì đánh dấu bằng dấu hỏi', gay.vong[1], 'loadActivityChunk 5000/?');

  // Số rác và đồng hồ nhảy. Một con số âm trong log làm người đọc nghi ngờ chính phép đo, nên chặn ngay ở đây.
  hop.callTimingReset(0);
  hop.callTimingRecord('a', -5, 100);
  hop.callTimingRecord('b', 'không phải số', 100);
  hop.callTimingRecord('c', 1000, 4000);
  const rac = hop.callTimingReport(500);

  check(so, 'thời gian client âm hoặc không phải số thì về 0', [rac.vong[0], rac.vong[1]], ['a 0/100', 'b 0/100']);
  check(so, 'máy chủ báo lâu hơn client đo được thì tiền đi đường của vòng đó là 0, không phải số âm', rac.msDiDuong, 0);
  check(so, 'tổng nhỏ hơn các vòng thì phần trình duyệt về 0, không ra số âm', rac.msKhachLamViec, 0);

  hop.callTimingReset(0);
  hop.callTimingFirstPaint(300);
  hop.callTimingFirstPaint(900);
  check(so, 'mốc khung hình đầu tiên chỉ nhận lần đặt đầu, vì chỉ có một khung hình đầu',
    hop.callTimingReport(1000).msKhungHinhDau, 300);

  hop.callTimingReset(0);
  check(so, 'chưa vẽ được khung nào thì mốc là null chứ không phải 0',
    hop.callTimingReport(100).msKhungHinhDau, null);
  check(so, 'không có vòng nào thì không bịa ra trung bình',
    hop.callTimingReport(100).msDiDuongMoiVong, null);

  check(so, 'mở sổ mới thì lượt trước không dính vào lượt sau', hop.callTimingReport(100).soVong, 0);
}

module.exports = { chay };
