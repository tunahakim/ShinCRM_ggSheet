/**
 * Hằng số phía code (`SETTINGS`) và công tắc vết `LOG_TRACE`.
 *
 * `SETTINGS` là thứ gõ sai thì hỏng code nên chỉ sửa bằng cách đẩy code lại (tài liệu 01 Phần 2.8). Cài đặt người dùng chỉnh được nằm ở cổng cài đặt (`server/settings/`), không ở đây.
 *
 * Đây là nơi duy nhất biết `LOG_TRACE` đang bật cho nguồn nào. `LogGate` chỉ hỏi `logTraceCoversSource('fbm_sync')` và không biết công tắc nằm ở đâu.
 */

/**
 * Hằng số phía code, một chỗ duy nhất theo tài liệu 01 Phần 2.8.
 *
 * Ở đây **chỉ có** những tham số mà tài liệu đã cho con số, cộng những tham số mà chặng đang làm buộc phải có một con số để chạy được. Điền số đoán trước lúc cần là dựng một hằng số trông như đã được quyết định, mà thực ra chưa ai quyết.
 */
var SETTINGS = {
  /**
   * Thời gian chờ khóa tệp trước khi bỏ cuộc, tính theo milli giây (millisecond — một phần nghìn giây). Tài liệu 06 Phần 2 chỉ định tên hằng này mà không cho con số.
   *
   * **15.000 là con số bản cũ đã chạy thật.** `9_Code_cu_tham_chieu/src/core/Api.js` gọi `lock.waitLock(15000)` và chủ dự án đã đi bán hàng bằng con số đó, nên nó là con số đã có người dùng chấp nhận chứ không phải con số vừa nghĩ ra.
   *
   * Vì sao không ngắn hơn: một lượt lưu bình thường giữ khóa dưới hai giây, nên chờ 15 giây chỉ xảy ra khi có một lượt lưu khác đang thật sự chạy. Ngắn hơn thì hai người bấm Lưu gần nhau sẽ thấy "hệ thống bận" trong khi chỉ cần chờ thêm một nhịp. Vì sao không dài hơn: Apps Script cho mỗi lượt chạy sáu phút, và một người ngồi nhìn nút Lưu quay quá 15 giây sẽ bấm lại — mà bấm lại lúc đang chờ khóa là cách chắc chắn nhất để xếp thêm một lượt chờ nữa.
   */
  LOCK_WAIT_MS: 15000,
  /**
   * Thời gian đếm ngược trước khi lệnh xóa thật sự được gửi đi, tính theo milli giây. Tài liệu 06 Phần 6.
   *
   * Bản cũ **không có** phép xóa và không có Hoàn tác, nên con số này không có tiền lệ nào để dựa vào. 5.000 là khoảng đủ để mắt đọc xong dòng "Đã xóa — Hoàn tác" và tay kịp với tới nút, và đủ ngắn để không ai ngồi chờ nó. Đây là con số quy ước của loại thông báo này ở phần lớn phần mềm, không phải con số đo được.
   */
  UNDO_DELAY_MS: 5000,
  /**
   * Hai dòng cần đọc cách nhau không quá ngần này dòng thì bản đọc Sheet chung đọc chung một lệnh (kể cả các dòng giữa), xa hơn thì đọc riêng. Tài liệu 06 Phần 2 "Bản đọc Sheet của một lần gọi".
   *
   * Đo trên GAS DEV 2026-10-17: một lệnh `getValues` lạnh tốn 70–130 ms dù 1 hay 100 dòng, mỗi dòng thêm chỉ 0,2–0,4 ms; hòa vốn khoảng 100 ms / 0,3 ms ≈ 300 dòng.
   */
  SHEET_READ_MERGE_GAP_ROWS: 300,
  /** Trần số thông báo đang còn trong kho; vượt thì gỡ cái cũ nhất. Tài liệu 10 Phần 8. */
  NOTICE_MAX: 20,
  /** Trần ký tự của một thông báo, tính chung tiêu đề, các dòng và gợi ý; giữ mỗi khóa DocumentProperties dưới 9 KB kể cả chữ tiếng Việt ba byte. Tài liệu 10 Phần 8. */
  NOTICE_CHARS_MAX: 2500,
  /** Hạn giữ log, tính theo ngày. Tài liệu 10 Phần 6. */
  LOG_RETENTION_DAYS: 30,
  /** Trần số dòng của sheet `Log`. Tài liệu 10 Phần 6. */
  LOG_MAX_ROWS: 1000,
  /** Số dòng vết giữ trong vòng đệm RAM. Tài liệu 10 Phần 3. */
  LOG_TRACE_BUFFER: 100,
  /** Tên khóa phải che khi ghi log. Khớp theo chuỗi con, không phân biệt hoa thường. Tài liệu 10 Phần 7. */
  LOG_SECRET_KEYS: ['cookie', 'token', 'key', 'secret', 'password', 'session', 'authorization'],
  /**
   * Số hàng mỗi gói khi nạp `activity` theo gói. Tài liệu 05 Phần 4 chỉ định tên hằng này mà không cho con số.
   *
   * **Con số 2.000 là con số đo được, không phải con số đoán.** Đo trên tệp DEV với 1.700 khách và 10.000 giao dịch giả, mỗi ô đều có dữ liệu, đọc đúng đường nạp thật. Hai lượt chạy cách nhau ít phút cho cùng một hình dáng, dù con số tuyệt đối của Google lượt sau chậm gấp đôi lượt trước:
   *
   * | Cỡ gói | Lượt 1 | Lượt 2 | So với 2.000 |
   * |---|---|---|---|
   * | 1.000 | 21,4 s | 48,0 s | chậm hơn 32–41 phần trăm |
   * | 2.000 | 16,2 s | 34,0 s | nhanh nhất cả hai lượt |
   * | 5.000 | 19,9 s | 39,2 s | chậm hơn 15–23 phần trăm |
   * | 10.000 | 27,0 s | 51,0 s | chậm hơn 50–66 phần trăm |
   *
   * Đường cong hình chữ U, và hai đầu đắt vì hai lý do khác nhau. Gói nhỏ trả tiền cho số vòng gọi. Gói lớn trả tiền cho việc Google phải dựng một khối kết quả 2,2 MB trong một lượt — chi phí đó không tăng theo đường thẳng.
   *
   * **Lượt đo đầu, chạy trên sheet rỗng rồi tự ghi hàng giả, cho kết quả phẳng và kết luận đó sai.** Hàng giả lúc ấy nội dung ngắn và cả tệp chỉ có sheet `Activity` có dữ liệu. Sai số đó là lý do phép đo bây giờ chỉ đọc dữ liệu có thật trên sheet.
   *
   * **Bảng trên chỉ đo phần máy chủ.** Phần còn thiếu — tiền đi đường của `google.script.run` — đo được ngày 05/09/2026 từ phía sidebar: **2.208 ms mỗi vòng**. Một lượt mở sidebar thật mất 43,9 s, chia ra máy chủ 30,6 s (70 phần trăm), đi đường 13,2 s (30 phần trăm), trình duyệt bung và vẽ 0,075 s. Con số cuối nhỏ tới mức không cần bàn: bung dữ liệu vào RAM gần như miễn phí.
   *
   * Cộng cả hai phần thì 2.000 vẫn thắng, và đây là phép cộng đầy đủ cuối cùng chốt con số này. Gói 10.000 tiết kiệm bốn vòng gọi, tức 8,5 s tiền đi đường, nhưng trả thêm 13–17 s ở phần máy chủ. Tổng ước tính 48–54 s so với 43,9 s đo được. **Chốt hẳn 2.000.**
   *
   * Lượt đo đó còn cho một lý do thứ hai để không dùng gói to: năm gói cùng cỡ 2.000 hàng mất 4,66 / 4,49 / **9,02** / 3,70 / 3,85 giây phía máy chủ. Cùng số hàng, cùng số cột, mà một gói đắt gấp 1,75 lần bốn gói kia. Phương sai đó không mất đi khi gói to hơn — nó chỉ chuyển thành một lượt gọi duy nhất không có đường lùi.
   */
  CHUNK_ROWS: 2000,
  /**
   * Bậc thang lùi khi một gói gọi thất bại: thử lại **đúng con trỏ đó** với cỡ nhỏ hơn, lần lượt theo danh sách này.
   *
   * Chủ dự án yêu cầu có đường lùi 05/09/2026. Lý do nó cần thiết dù 2.000 đã đo là an toàn: phép đo nói lên chi phí **trung bình**, còn thứ giết một lượt nạp là ca xấu nhất — một giao dịch có ô ghi chú dài vài nghìn chữ thì gói chứa nó nặng gấp nhiều lần gói bình thường, và trần sáu phút mỗi lượt thực thi của Apps Script không quan tâm gói đó là ngoại lệ.
   *
   * Lùi chứ không bỏ: gói thất bại ở 2.000 hàng gần như luôn thành công ở 500. Bỏ cuộc ngay nghĩa là mất toàn bộ lịch sử làm việc vì một bản ghi.
   */
  CHUNK_ROWS_FALLBACK: [500, 200],

  /** Sổ nhật ký nạp lại (07A mục 4): số dòng tối đa và dung lượng tối đa (ký tự JSON, dưới 9KB mỗi khóa của Google). Vượt thì cắt dòng cũ nhất; Sidebar tụt dưới phần đã cắt thì nạp lõi một lần. */
  RELOAD_JOURNAL_MAX_ENTRIES: 100,
  RELOAD_JOURNAL_MAX_BYTES: 8000,

  /** Số mã tối đa của một phần (Customer hoặc Activity) trong một dòng sổ hoặc một lượt nạp; vượt thì phần đó nạp cả sheet. 100 mã khoảng 1,1KB, giữ chỗ cho các dòng khác trong sổ. */
  RELOAD_JOURNAL_PART_IDS: 100,

  /** Chu kỳ lịch nền (phút) dưới mức này thì Sidebar hỏi xác nhận trước khi lưu, trừ Giữ phiên. Không chặn: chỉ nhắc rằng Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay chạy dày thì tốn hạn mức FBM và GAS. Tài liệu 09/08 "Màn hình Cài đặt phiên". */
  FBM_SCHEDULE_LOW_MINUTES: 30,

  /** Tiến trình nền chạy lỗi thì chờ bấy nhiêu phút mới thử lại, nhân đôi mỗi lần lỗi liền nhau tới trần; trong lúc chờ các tiến trình khác (nhất là Giữ phiên) vẫn chạy. Tài liệu 09/02 "Tiến trình lỗi không chặn chuỗi". */
  FBM_SCHEDULE_RETRY_BASE_MINUTES: 5,
  FBM_SCHEDULE_RETRY_MAX_MINUTES: 60,

  /** Nhịp dò chọn ô khi Extension vắng mặt. Chỉ cần khi không có Extension — có Extension thì tin tới liền, không dò. */
  SELECTION_POLL_MS: 2000,
  SELECTION_POLL_IDLE_MS: 6000,
  POSITION_WAKE_MS: 1000,
  HANDSHAKE_PING_MS: 1000,
  EXTENSION_ACK_TIMEOUT_MS: 3000,
  /**
   * Kênh `/bind`: Extension nghe kênh đẩy của Google Sheets và báo Sidebar "có thể vừa đổi". Tín hiệu đến gần như tức thì nhưng trigger GAS cần vài giây mới ghi xong signal, nên Sidebar hỏi theo lịch trễ tính từ tín hiệu cuối: mốc đầu bù thời gian trigger ghi signal, mốc sau bù trigger xếp hàng. Hỏi ngay lúc nhận gói gần như luôn nhận "không có gì" rồi không ai hỏi lại. Đo trên Sheet DEV: trigger ghi signal 2,6–3,8 giây sau gói đầu, nên mốc đầu 5 giây chừa khoảng 1 giây cho trigger chậm; mốc đầu sát số đo thì lần chậm nhất lọt sang mốc 12 giây.
   */
  CHANGE_SIGNAL_DELAYS_MS: [5000, 12000],
  /** Cầu nối Extension gộp nhịp sống của kênh, tối đa một tin mỗi khoảng này. Phải nhỏ hơn nhiều so với `CHANNEL_SILENCE_MS`. */
  CHANNEL_ALIVE_RELAY_MS: 20000,
  /** Kênh im quá ngưỡng này (tab hiện, mạng có) thì coi là chết. Google gửi `noop` khoảng 33 giây/lần và mở lại kênh khoảng 140 giây/lần, 180 giây phủ được một lần mở lại cộng một nhịp. */
  CHANNEL_SILENCE_MS: 180000,
  /** Nhịp hỏi an toàn khi kênh sống (chỉ để vớt thứ kênh bỏ sót) và khi kênh chết (thay kênh). Kênh sống để 5 phút vì mỗi lượt là một lần chạy GAS 1,5–2,7 giây: 60 giây là khoảng 60 lượt mỗi giờ cho mỗi Sidebar dù không ai sửa gì. Đánh đổi: thay đổi kênh bỏ sót có thể trễ tới 5 phút. */
  RELOAD_SAFETY_POLL_MS: 300000,
  RELOAD_SAFETY_POLL_DEAD_MS: 15000,
  /** Bật để thấy thanh tiến trình ở mọi lời hỏi GAS, kể cả lời hỏi nền (kênh báo thay đổi, nhịp an toàn, chuyển sheet), phục vụ nghiệm thu. Tắt (`false`) thì lời hỏi nền chạy im lặng đúng tài liệu 05. Đổi xong đẩy lên bằng `node tests/gas.js probeSelectionAndReload --push` rồi tải lại tab Sheet. */
  SHOW_PROBE_PROGRESS_DEBUG: true,
  /** Màu tab sheet quản trị đang cũ (dữ liệu đã đổi nhưng sheet chưa vẽ lại). Cam để khác các màu nhóm sheet thường dùng. */
  VIEW_STALE_TAB_COLOR: '#ff9900',
  /** Lượt vẽ sheet quản trị hỏng thì không tự thử lại với cùng dữ liệu và cùng ô điều khiển, để lỗi không tự đánh thức thành vòng lặp; quá khoảng này thì thử lại một lần, phòng lỗi tạm của Google. Bấm làm mới luôn thử ngay. */
  VIEW_FAILED_RETRY_MS: 600000,
  /** Số dòng chi tiết tối đa mỗi khối lỗi vẽ sheet quản trị giữ trong sổ vẽ. Sổ của mọi sheet `!` nằm chung một DocumentProperty (trần khoảng 9 KB), nên lỗi dài (công thức ở hàng trăm cột) phải cắt bớt và báo số dòng còn lại. */
  VIEW_PROBLEM_MAX_LINES: 20
};

/**
 * `LOG_TRACE` có phủ nguồn này không. Rỗng là tắt, `all` là bật hết, còn lại là danh sách tên nguồn cách nhau bằng dấu phẩy. Tài liệu 10 Phần 3.
 *
 * Hàm này **không bao giờ ném lỗi**, và khi có chuyện thì trả về `false`. Hai lý do, cả hai đều quan trọng. Một, nó nằm trên đường ghi log, mà tài liệu 10 Phần 5 cấm việc ghi log giết công việc chính — kho cài đặt hỏng thì hệ vẫn phải lưu được khách. Hai, `false` là chiều an toàn: chế độ vết ghi bí mật ra nguyên văn, nên đọc lỗi mà đoán sang "bật" là tự dựng một đường rò bí mật từ một sự cố không liên quan.
 */
function logTraceCoversSource(source) {
  var value = '';
  try {
    value = String(settingsValue('core_ops', LOG_TRACE_SETTING));
  } catch (khongDocDuocCaiDat) {
    return false;
  }

  if (!value || value.toLowerCase() === 'off') { return false; }
  if (value.toLowerCase() === 'all') { return true; }

  var wanted = String(source === null || source === undefined ? '' : source).trim().toLowerCase();
  if (!wanted) { return false; }

  return value.split(',').some(function (item) {
    return item.trim().toLowerCase() === wanted;
  });
}
