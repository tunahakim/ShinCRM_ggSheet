/**
 * Tham số của hệ thống: hằng số phía code (`SETTINGS`) và khối tham số hệ thống của sheet `Config`.
 *
 * Vì sao hai thứ này ở chung một tệp, dù tài liệu 01 Phần 2.8 coi chúng là hai nơi khác nhau: cái tài liệu 01 phân biệt là **ai sửa và sửa xong thì bao giờ có hiệu lực** — `SETTINGS` phải đẩy code lại, `Config` thì nạp lại là xong. Còn phía bên gọi thì cả hai trả lời đúng một câu: "tham số này đang là bao nhiêu". Để hai tệp thì mỗi chỗ gọi phải tự biết núm nào nằm ở tệp nào, và đó là thứ chắc chắn có ngày nhớ sai.
 *
 * Đây cũng là nơi duy nhất biết `LOG_TRACE` đang bật cho nguồn nào. `LogGate` chỉ hỏi `logTraceCoversSource('fbm_sync')` và không biết công tắc nằm ở đâu — nên sau này có đổi chỗ công tắc thì `LogGate` không phải sửa.
 *
 * Điều tệp này cố tình KHÔNG làm: nó chỉ đọc khối tham số hệ thống, không đọc bốn khối còn lại của `Config`. Bốn khối kia đọc ở `ConfigRead.gs`, và ranh giới đó là cố ý: khối tham số nằm **dưới đường ghi log** nên nó phải đọc được cả khi mọi thứ khác đổ, còn bốn khối kia chỉ cần đọc được lúc nạp. Gộp chung thì một dấu ngoặc thiếu ở khối bộ đếm sẽ làm tắt luôn cả log.
 */

/**
 * Hằng số phía code, một chỗ duy nhất theo tài liệu 01 Phần 2.8.
 *
 * Ở đây **chỉ có** những tham số mà tài liệu đã cho con số, cộng những tham số mà chặng đang làm buộc phải có một con số để chạy được. Tài liệu còn nhắc tên `LOCK_WAIT_MS` và `UNDO_DELAY_MS` mà không cho giá trị; chúng vào đây cùng chặng dùng đến chúng, với con số do chủ dự án chốt. Điền số đoán trước lúc cần là dựng một hằng số trông như đã được quyết định, mà thực ra chưa ai quyết.
 */
var SETTINGS = {
  /** Hạn giữ log, tính theo ngày. Tài liệu 10 Phần 6. */
  LOG_RETENTION_DAYS: 30,
  /** Trần số dòng của sheet `Log`. Tài liệu 10 Phần 6. */
  LOG_MAX_ROWS: 5000,
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
  CHUNK_ROWS_FALLBACK: [500, 200]
};

/**
 * Nhớ tạm khối tham số trong một lượt chạy. Đặt lại bằng `resetSettingsCache()`.
 *
 * Nhớ tạm ở đây không phải để nhanh mà để **nhất quán**: một lượt chạy đọc `LOG_TRACE` ở đầu rồi đọc lại ở cuối, mà giữa hai lần đó người dùng vừa sửa ô, thì cùng một lượt chạy sẽ hành xử theo hai luật khác nhau — và đó là loại lỗi không ai tái tạo được.
 */
var SETTINGS_CONFIG_CACHE = null;

/** Bỏ phần nhớ tạm. Dùng cho phép kiểm và cho lượt chạy vừa tự tay sửa `Config`. */
function resetSettingsCache() {
  SETTINGS_CONFIG_CACHE = null;
}

/**
 * Đọc khối tham số hệ thống của `Config` thành bảng tra `{ tên tham số: giá trị chuỗi }`.
 *
 * Đọc cả vùng dữ liệu bằng một lệnh rồi tự nhặt hai cột cần, thay vì gọi hai lệnh đọc hai cột. Không phải để tiết kiệm mà vì hai cột này **không được giả định là đứng cạnh nhau**: người dùng chèn cột vào giữa là quyền của họ, và luật hàng 1 nói vị trí cột suy ra từ mã chứ không suy ra từ thứ tự.
 *
 * Trùng tên tham số thì ném lỗi kèm tên bị trùng, không tự chọn một dòng. Đây là áp dụng đúng luật tài liệu 02 Phần 10 đã đặt cho bảng ngầm định: tự chọn một dòng nghĩa là người dùng sửa một dòng, thấy không có tác dụng gì, rồi ngồi đoán.
 */
function configParams() {
  if (SETTINGS_CONFIG_CACHE) {
    return SETTINGS_CONFIG_CACHE;
  }

  var columnMap = readColumnMap('Config');
  var keyColumn = columnIndex(columnMap, '@CFG_THAM_SO');
  var valueColumn = columnIndex(columnMap, '@CFG_THAM_SO_GIA_TRI');
  var firstDataRow = SHEET_LAYOUT.Config.firstDataRow;
  var sheet = shinOpenSheet('Config');
  var lastRow = sheet.getLastRow();
  var params = {};

  // Sheet mới dựng thì chưa có hàng dữ liệu nào, và đó là trạng thái bình thường chứ không phải hỏng.
  if (lastRow < firstDataRow) {
    SETTINGS_CONFIG_CACHE = params;
    return params;
  }

  var rows = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, columnMap.lastColumn).getValues();
  var duplicates = [];

  rows.forEach(function (row) {
    var name = String(row[keyColumn - 1] === null || row[keyColumn - 1] === undefined ? '' : row[keyColumn - 1]).trim();
    if (!name) { return; }
    if (Object.prototype.hasOwnProperty.call(params, name)) {
      duplicates.push(name);
      return;
    }
    var value = row[valueColumn - 1];
    params[name] = String(value === null || value === undefined ? '' : value).trim();
  });

  if (duplicates.length) {
    throw new Error('Sheet Config có tham số khai trùng: ' + duplicates.join(', ') + '. Mỗi tham số chỉ được một dòng — xóa dòng thừa rồi chạy lại.');
  }

  SETTINGS_CONFIG_CACHE = params;
  return params;
}

/** Lấy một tham số của `Config` dưới dạng chuỗi đã cắt khoảng trắng. Không có thì trả về `fallback`, mặc định là chuỗi rỗng. */
function configGet(name, fallback) {
  var params = configParams();
  var missing = arguments.length < 2 ? '' : fallback;
  return Object.prototype.hasOwnProperty.call(params, name) ? params[name] : missing;
}

/**
 * `LOG_TRACE` có phủ nguồn này không. Rỗng là tắt, `all` là bật hết, còn lại là danh sách tên nguồn cách nhau bằng dấu phẩy. Tài liệu 10 Phần 3.
 *
 * Hàm này **không bao giờ ném lỗi**, và khi có chuyện thì trả về `false`. Hai lý do, cả hai đều quan trọng. Một, nó nằm trên đường ghi log, mà tài liệu 10 Phần 5 cấm việc ghi log giết công việc chính — sheet `Config` bị xóa thì hệ vẫn phải lưu được khách. Hai, `false` là chiều an toàn: chế độ vết ghi bí mật ra nguyên văn, nên đọc lỗi mà đoán sang "bật" là tự dựng một đường rò bí mật từ một sự cố không liên quan.
 */
function logTraceCoversSource(source) {
  var value = '';
  try {
    value = configGet('LOG_TRACE');
  } catch (khongDocDuocConfig) {
    return false;
  }

  if (!value) { return false; }
  if (value.toLowerCase() === 'all') { return true; }

  var wanted = String(source === null || source === undefined ? '' : source).trim().toLowerCase();
  if (!wanted) { return false; }

  return value.split(',').some(function (item) {
    return item.trim().toLowerCase() === wanted;
  });
}

/**
 * In `SETTINGS` và khối tham số của `Config` ra để người ngồi ngoài xem.
 *
 * Có phép nghiệm thu này vì ca đáng lo nhất lúc này là ca **rỗng**: `Config` chưa có dòng tham số nào, và một hàm đọc bảng chỉ hỏng ở ca rỗng thì phải bắt ngay bây giờ, chứ không phải bắt vào lúc nó đang nằm dưới đường ghi log.
 */
function dumpSettings() {
  var report = [];
  var params = configParams();
  var names = Object.keys(params);

  report.push('SETTINGS (hằng phía code):');
  Object.keys(SETTINGS).forEach(function (key) {
    report.push('  ' + key + ' = ' + JSON.stringify(SETTINGS[key]));
  });

  report.push('Config — khối tham số hệ thống: ' + (names.length ? names.length + ' tham số' : 'chưa có dòng nào (đúng với sheet mới dựng)'));
  names.forEach(function (name) {
    report.push('  ' + name + ' = "' + params[name] + '"');
  });

  report.push('LOG_TRACE phủ core? ' + logTraceCoversSource('core') + ' — phủ fbm_sync? ' + logTraceCoversSource('fbm_sync'));

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
