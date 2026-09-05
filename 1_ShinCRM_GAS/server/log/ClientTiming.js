/**
 * Cửa nhận bản đo thời gian **từ phía sidebar** rồi đệm một dòng vết cho sheet `Log`. Tài liệu 10 Phần 3. Dòng chỉ ra sheet khi công tắc `LOG_TRACE` bật — xem docstring của `logClientTiming`.
 *
 * Vì sao phải có cửa riêng thay vì để `loadCore` tự ghi: máy chủ không đo được thứ đáng đo. Một lượt chạy Apps Script chỉ biết thời gian tính toán bên trong chính nó; nó không thấy tiền đi đường của `google.script.run`, không thấy trình duyệt bung khối kết quả mất bao lâu, và không biết lượt khởi động cần mấy vòng. Cộng lại thì con số máy chủ tự báo có thể chỉ bằng một nửa thời gian người dùng thật sự chờ — và một cột thời gian nói sai một nửa còn tệ hơn không có cột nào, vì người đọc tin nó.
 *
 * **Không tin số client gửi.** Đây là cửa nhận dữ liệu ngoài, nên mọi khóa đều bị kẹp về số hữu hạn trong khoảng hợp lý, khóa lạ bị bỏ, và mảng chi tiết bị cắt cả số phần tử lẫn độ dài mỗi phần tử. Client của dự án thì lành, nhưng cửa vào không tin bên gọi — và một chuỗi dài vô hạn đi thẳng vào một ô sheet là đường làm vỡ đúng cái công cụ chẩn đoán.
 */

/** Trần kẹp cho mọi con số thời gian: 30 phút. Cao hơn trần sáu phút mỗi lượt thực thi rất nhiều, nên số thật không bao giờ chạm; nó chỉ chặn số rác. */
var CLIENT_TIMING_MS_MAX = 30 * 60 * 1000;

/** Các khóa số nhận vào, đúng theo `callTimingReport`. Khóa nào không có tên ở đây thì không vào sheet. */
var CLIENT_TIMING_KEYS = ['soVong', 'msTong', 'msKhungHinhDau', 'msMayChu', 'msDiDuong', 'msDiDuongMoiVong', 'msKhachLamViec'];

/** Kẹp một con số client gửi về khoảng dùng được. Không phải số thì trả `null`, để dòng log nói "không đo được" thay vì nói một con số bịa. */
function clientTimingNumber(value) {
  var so = Number(value);
  if (!isFinite(so) || so < 0) { return null; }
  return Math.min(Math.round(so), CLIENT_TIMING_MS_MAX);
}

/** Danh sách vòng gọi, đã cắt còn tối đa 20 phần tử và mỗi phần tử 60 ký tự. Đủ để đọc một lượt khởi động, không đủ để một mảng rác làm phồng ô. */
function clientTimingRounds(value) {
  if (!Array.isArray(value)) { return []; }
  return value.slice(0, 20).map(function (v) { return String(v).slice(0, 60); });
}

/**
 * Ghi bản đo của một lượt khởi động sidebar. Trả về `{ ok: true }` để client biết dòng đã ra.
 *
 * Ghi **một** dòng cho cả lượt, không phải một dòng mỗi vòng. Lý do giống chỗ chọn ghi log ở gói cuối của `loadActivityChunk`: sáu dòng cho một lượt mở sidebar sẽ làm loãng sheet `Log` tới mức không tìm ra thứ đáng xem, mà thứ đáng xem ở đây là bản tổng — riêng từng vòng thì đã nằm trong khóa `vong` của cùng dòng đó.
 *
 * **Dòng vết, không phải dòng luôn ghi.** Chủ dự án chốt ngày 05/09/2026: bật debug thì ghi chi tiết, ngày thường ẩn hết. Nên dòng này chỉ ra sheet khi tham số `LOG_TRACE` ở sheet `Config` phủ nguồn `sidebar`. Tắt công tắc thì một lượt mở sidebar trơn không tốn dòng log nào — và vì đây là lượt gọi riêng, không nằm trong lượt chạy đã lỗi, nên tắt là tắt hẳn chứ không có đường tự bung ra như các dòng vết khác.
 */
function logClientTiming(timing) {
  return runEntryPoint('logClientTiming', LOAD_SOURCE, 'throw', function () {
    var nguon = timing && typeof timing === 'object' ? timing : {};
    var detail = {};

    CLIENT_TIMING_KEYS.forEach(function (khoa) { detail[khoa] = clientTimingNumber(nguon[khoa]); });
    detail.vong = clientTimingRounds(nguon.vong);

    logTrace({
      source: LOAD_SOURCE,
      action: 'sidebarBoot',
      outcome: LOG_OK,
      reason: 'Thời gian thật của lượt mở sidebar, đo ở phía trình duyệt',
      detail: detail
    });

    return { ok: true, ghiRaSheet: logTraceCoversSource(LOAD_SOURCE) };
  });
}

/**
 * Phép nghiệm thu chạy được trên Google: gửi một bản đo tử tế và một bản đo toàn rác, rồi đọc lại xem cửa vào đã kẹp đúng chưa.
 *
 * Nó chạy được **không cần mở sidebar**, nên hình dạng dòng log kiểm được ngay ở máy. Còn con số thật thì vẫn phải mở sidebar mới có, vì chỉ trình duyệt đo được cả hai đầu một vòng gọi.
 *
 * Báo cáo nói rõ công tắc `LOG_TRACE` đang bật hay tắt, vì ba dòng này là dòng vết: tắt công tắc thì phép nghiệm thu vẫn đạt mà sheet `Log` không có dòng nào — và một báo cáo nói "đã ghi ba dòng" trong khi sheet trống là báo cáo làm người đọc đi tìm lỗi ở chỗ không có lỗi.
 *
 * Số dòng đếm bằng cách đo hàng cuối của sheet `Log` trước và sau, **không** bằng giá trị `flushLog()` trả về. Lý do: `logClientTiming` chạy trong `runEntryPoint`, mà vỏ bọc đó tự nhả log ở `finally` — nên tới lượt gọi `flushLog()` cuối thì bộ đệm đã rỗng và nó luôn trả về 0, ở cả hai chế độ.
 */
function probeClientTiming() {
  var report = [];
  var raSheet = logTraceCoversSource(LOAD_SOURCE);
  var truoc = logSheet().getLastRow();

  report.push('Công tắc LOG_TRACE phủ nguồn "' + LOAD_SOURCE + '": ' + raSheet + (raSheet ? ' — ba dòng dưới đây sẽ ra sheet Log.' : ' — ba dòng dưới đây CHỈ nằm trong vòng đệm, sheet Log không có dòng nào. Muốn thấy thì chạy devLogTraceOn.'));

  logClientTiming({ soVong: 6, msTong: 40000, msKhungHinhDau: 8500, msMayChu: 21100, msDiDuong: 16900, msDiDuongMoiVong: 2817, msKhachLamViec: 2000, vong: ['loadCore 8000/3600'] });
  report.push('Bản đo tử tế: đã đệm một dòng sidebarBoot.');

  var rac = { soVong: -1, msTong: 'không phải số', msKhungHinhDau: null, msMayChu: 1e12, msDiDuong: undefined, msKhachLamViec: 5, vong: 'không phải mảng', khoaLa: 'phải bị bỏ' };
  logClientTiming(rac);
  report.push('Số âm và chữ thành null: ' + JSON.stringify([clientTimingNumber(-1), clientTimingNumber('không phải số'), clientTimingNumber(undefined)]) + ' (phải là ba chữ null)');
  report.push('Số vượt trần bị kẹp: ' + clientTimingNumber(1e12) + ' (phải là ' + CLIENT_TIMING_MS_MAX + ')');
  report.push('`vong` không phải mảng thành mảng rỗng: ' + JSON.stringify(clientTimingRounds('không phải mảng')));
  report.push('Mảng dài bị cắt còn: ' + clientTimingRounds(new Array(50).join('x').split('x')).length + ' phần tử (phải là 20)');
  report.push('Khóa lạ không vào sheet: danh sách khóa nhận vào là ' + CLIENT_TIMING_KEYS.join(', ') + ' cộng `vong`.');

  logClientTiming(null);
  report.push('Gọi với null không ném: đã đệm một dòng toàn null.');

  var soDong = logSheet().getLastRow() - truoc;
  report.push('Sheet Log nhận thêm ' + soDong + ' dòng' + (raSheet ? ' — phải là 3, mở sheet Log xem ba dòng sidebarBoot.' : ', phải là 0 vì công tắc đang tắt.'));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
