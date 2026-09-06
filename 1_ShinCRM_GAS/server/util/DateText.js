/**
 * Biên giới duy nhất giữa đối tượng `Date` và hai dạng chuỗi thời gian của dự án. Tài liệu 05 Phần 11.
 *
 * Vì sao cần một biên giới, và vì sao nó phải là một tệp riêng nhỏ tới mức này: `google.script.run` **không truyền được `Date`**. Một `Date` đi qua đường đó tới client biến thành chuỗi ISO theo múi giờ UTC, tức là một mốc `2026-01-05` gõ ở Việt Nam sẽ tới client thành `2026-01-04T17:00:00.000Z`. Lỗi này không ném ra ở đâu cả — nó chỉ làm ngày lùi một hôm ở đúng những bản ghi buổi sáng. Loại lỗi không ném ra là loại phải chặn bằng cấu trúc chứ không bằng sự cẩn thận.
 *
 * Nên hệ thống có **đúng hai dạng chuỗi**, cả hai đều rộng cố định nên so hai chuỗi bằng phép so chữ là ra đúng thứ tự thời gian:
 *   - `precision: 'day'`    → `YYYY-MM-DD`
 *   - `precision: 'minute'` → `YYYY-MM-DD HH:mm`
 *
 * Nhờ tính chất rộng cố định đó, dự án **không có** hàm so sánh hai mốc thời gian. Sắp `workDate` giảm dần là `b.workDate < a.workDate`, không cần phân tích ngày tháng, không cần thư viện. Viết một hàm bọc quanh phép so chữ chỉ để trông có vẻ nghiêm túc là thêm một chỗ để lỗi nằm im.
 *
 * Tệp này giữ **cả hai chiều**. Chiều ra — ô sheet thành chuỗi — là `dateToText`. Chiều vào — chuỗi người dùng gõ thành giá trị ghi xuống ô — là `textToDate`, thêm ở chặng lưu. Hai chiều ở chung một tệp vì chúng phải đối xứng: sửa khuôn ở một chiều mà quên chiều kia là cách chắc chắn nhất để một ngày lưu xuống rồi đọc lên thành một ngày khác.
 */

/** Khuôn của `precision: 'day'`. */
var DATE_TEXT_DAY_FORMAT = 'yyyy-MM-dd';

/** Khuôn của `precision: 'minute'`. Cố ý **không có giây**: không một trường thời gian nào của dự án cần tới giây, mà chuỗi có giây thì mỗi lần lưu lại sinh ra một giá trị khác nhau, làm phép so ba chiều của module đồng bộ báo bẩn ở bản ghi không ai sửa. */
var DATE_TEXT_MINUTE_FORMAT = 'yyyy-MM-dd HH:mm';

/**
 * Múi giờ dùng khi bên gọi không truyền múi giờ.
 *
 * Đây là đường dự phòng, không phải đường chính. Đường chính là bên gọi truyền vào múi giờ của **tệp Sheet** (`getSpreadsheetTimeZone()`), vì đó là múi giờ người dùng gõ ngày trong đó và là múi giờ Sheets bày ngày ra. Đổi múi giờ giữa lúc ghi và lúc đọc sẽ đẩy `2026-01-05 07:00` sang ngày hôm trước — lệch giờ thì còn nhìn thấy, chứ lệch ngày thì trông vẫn như một ngày hợp lệ.
 *
 * Chỗ này cố ý khác `LOG_TIMEZONE`, thứ chốt cứng không cho đổi. Cột `Lúc` của sheet `Log` là mốc máy sinh ra để đọc giống nhau ở mọi bản, còn ngày trong bản ghi là **giá trị người dùng gõ**, nên nó phải quay về đúng như đã gõ.
 */
var DATE_TEXT_TIMEZONE = 'Asia/Ho_Chi_Minh';

/**
 * Có phải `Date` không, hỏi theo cách chịu được nhiều realm.
 *
 * Không dùng `value instanceof Date` vì phép đó so nguyên mẫu (prototype — bản mẫu dùng chung của một họ đối tượng), nên một `Date` sinh ra ở vùng chạy khác sẽ trả về `false` trong khi nó là `Date` thật. Hộp cát của bộ kiểm thử offline chính là một vùng chạy khác, nên đây không phải phòng xa lý thuyết.
 */
function dateTextIsDate(value) {
  return Object.prototype.toString.call(value) === '[object Date]';
}

/** Khuôn ứng với một `precision`. Gõ sai `precision` là sai bảng khai, mà sai bảng khai thì báo lỗi ngay — khác hẳn ca ô dữ liệu có giá trị lạ ở dưới. */
function dateTextFormatOf(precision) {
  if (precision === 'day') { return DATE_TEXT_DAY_FORMAT; }
  if (precision === 'minute') { return DATE_TEXT_MINUTE_FORMAT; }
  throw new Error('Trường DATE khai precision không hợp lệ: ' + JSON.stringify(precision) + '. Chỉ có "day" và "minute" — sửa ở DataSchema.gs.');
}

/**
 * Giá trị một ô kiểu DATE thành chuỗi để gửi sang client. Ô rỗng trả về chuỗi rỗng.
 *
 * **Hàm này không phán xét dữ liệu.** Ô đáng lẽ là ngày mà lại chứa chữ thì nó trả về đúng chữ đó đã cắt khoảng trắng, không ném lỗi. Hai lý do. Một, đây là đường nạp: một ô gõ lạ ở khách thứ chín trăm không được phép làm sập cả lượt mở sidebar, vì lúc đó người dùng mất luôn đường vào để mà sửa. Hai, giá trị lạ hiện lên form là thứ nhìn thấy được và sửa được, còn một lượt nạp vỡ chỉ để lại một câu báo lỗi không chỉ ra ô nào. Việc bắt lỗi giá trị thuộc cửa ghi và phép tự kiểm, không thuộc hàm đổi khuôn.
 *
 * `timezone` nên là múi giờ của tệp Sheet. Thiếu thì rơi về `DATE_TEXT_TIMEZONE`.
 */
function dateToText(value, precision, timezone) {
  var format = dateTextFormatOf(precision);

  if (value === null || value === undefined || value === '') { return ''; }

  if (dateTextIsDate(value)) {
    if (isNaN(value.getTime())) { return ''; }
    return Utilities.formatDate(value, timezone || DATE_TEXT_TIMEZONE, format);
  }

  return String(value).trim();
}

/**
 * Chuỗi thời gian thành giá trị ghi xuống ô. Chiều ngược của `dateToText`. Rỗng trả về chuỗi rỗng, tức là xóa trắng ô.
 *
 * **Trả về `Date` thật chứ không trả về chuỗi**, dù chuỗi trông đơn giản hơn. Lý do: ô chứa `Date` thì Sheets biết nó là ngày, nên sắp xếp đúng, lọc đúng, và sheet quản trị ở chặng sau lọc được theo khoảng ngày. Ô chứa chuỗi `"2026-01-05"` thì mọi phép đó thành phép so chữ, và một cột ngày kiểu chữ là thứ không sửa lại được sau khi đã có nghìn dòng.
 *
 * **Chuỗi trượt khuôn thì đi qua nguyên văn, không ném lỗi và không tự đoán.** Đây là chỗ dễ mắc bẫy nhất của cả tệp: `new Date(2026, 12, 40)` không ném lỗi mà lặng lẽ thành ngày 09/01/2027. Một ngày sai mà trông hợp lệ thì không ai tìm ra, còn một ô hiện đúng chữ người dùng gõ thì nhìn là thấy. Nên phép kiểm khoảng ở đây chặt tới từng con số, và trượt là giữ nguyên chữ.
 *
 * Múi giờ: hàm dựng `Date` theo múi giờ **của script** (`appsscript.json`), còn Sheets bày ô ra theo múi giờ **của tệp**. Hai múi giờ này phải bằng nhau, và đó là lý do `probeDateText` in cả hai ra cạnh nhau — lệch nhau thì mọi mốc nửa đêm rơi sang ngày hôm trước.
 */
function textToDate(value, precision) {
  var format = dateTextFormatOf(precision);

  if (value === null || value === undefined) { return ''; }
  if (dateTextIsDate(value)) { return isNaN(value.getTime()) ? '' : value; }

  var text = String(value).trim();
  if (!text) { return ''; }

  // Nhận cả dấu cách và chữ `T` giữa ngày và giờ. Bộ thu thập gửi dấu cách, còn ô `datetime-local` của trình duyệt sinh ra chữ `T`;
  // nhận cả hai ở đây rẻ hơn nhiều so với việc đi tìm xem một mốc mất giờ là do chỗ nào quên đổi.
  var khop = /^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?$/.exec(text);
  if (!khop) { return text; }

  var nam = Number(khop[1]);
  var thang = Number(khop[2]);
  var ngay = Number(khop[3]);
  var gio = khop[4] === undefined ? 0 : Number(khop[4]);
  var phut = khop[5] === undefined ? 0 : Number(khop[5]);

  if (thang < 1 || thang > 12 || ngay < 1 || ngay > 31 || gio > 23 || phut > 59) { return text; }
  if (format === DATE_TEXT_DAY_FORMAT && khop[4] !== undefined) { gio = 0; phut = 0; }

  var moc = new Date(nam, thang - 1, ngay, gio, phut, 0, 0);

  // Chặn ngày không tồn tại: 31/02 đi qua phép kiểm khoảng ở trên nhưng `Date` sẽ tự đẩy nó thành 03/03. So lại ba con số
  // là cách duy nhất bắt được việc tự đẩy đó, vì `Date` không có cờ nào nói rằng nó vừa sửa hộ.
  if (moc.getFullYear() !== nam || moc.getMonth() !== thang - 1 || moc.getDate() !== ngay) { return text; }

  return moc;
}

/**
 * Phép nghiệm thu chạy được trên Google, in ra để người ngồi ngoài xem.
 *
 * Có phép này vì `dateToText` là chỗ mà bộ kiểm thử offline **không chứng minh được điều quan trọng nhất**: `Utilities.formatDate` giả trong Node bỏ qua tham số múi giờ. Nên câu hỏi "đổi khuôn có đúng giờ Việt Nam không" chỉ trả lời được ở đây, trên Google, với `Utilities` thật.
 */
function probeDateText() {
  var report = [];
  var moc = new Date(2026, 0, 5, 7, 30, 45);
  var muiGioScript = Session.getScriptTimeZone();
  var muiGioTep = shinOpenBook().getSpreadsheetTimeZone();

  report.push('Múi giờ script: ' + muiGioScript + ' — múi giờ tệp Sheet: ' + muiGioTep + ' — dự phòng: ' + DATE_TEXT_TIMEZONE);
  report.push(muiGioScript === muiGioTep ? '  Hai múi giờ bằng nhau: đúng.' : '  ⚠ HAI MÚI GIỜ LỆCH NHAU. Mọi mốc nửa đêm sẽ rơi sang ngày hôm trước. Sửa appsscript.json cho khớp múi giờ tệp.');
  report.push('Mốc thử (7 giờ 30 phút 45 giây sáng ngày 05/01/2026 theo giờ máy chủ script):');
  report.push('  day    → "' + dateToText(moc, 'day') + '"    (chờ đợi: "2026-01-05")');
  report.push('  minute → "' + dateToText(moc, 'minute') + '" (chờ đợi: "2026-01-05 07:30", không có giây)');
  report.push('Ô rỗng: day → "' + dateToText('', 'day') + '" — null → "' + dateToText(null, 'minute') + '"');
  report.push('Ô gõ lạ: "chưa rõ" → "' + dateToText('chưa rõ', 'day') + '" (đi qua nguyên văn, cố ý không ném lỗi)');
  report.push('Vòng tròn ra rồi vào: "2026-01-05 07:30" → ' + dateToText(textToDate('2026-01-05 07:30', 'minute'), 'minute', muiGioTep));
  report.push('Ngày không tồn tại: "2026-02-31" → ' + JSON.stringify(textToDate('2026-02-31', 'day')) + ' (giữ nguyên chữ, không tự đẩy sang 03/03)');

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
