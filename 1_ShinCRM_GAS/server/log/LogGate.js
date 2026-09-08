/**
 * Cửa ghi log: gom dòng trong RAM rồi ghi xuống sheet `Log` bằng đúng một lệnh, kèm luật che bí mật và luật cắt cửa sổ. Tài liệu 10 Phần 2 tới Phần 7.
 *
 * Tên `LogGate` tránh trùng `Logger` có sẵn của Apps Script, và nằm cùng họ với `WriteGate`, `IdGate`, `DeleteGate`.
 *
 * Ba luật của tệp này, cả ba đều là ràng buộc cứng của tài liệu 10 và cả ba đều dễ bị vi phạm lúc sửa nhanh:
 *   1. **Không bao giờ lấy `LockService`.** Khóa của dự án không tái nhập (not reentrant — cùng một lượt chạy xin lại khóa mình đang giữ thì vẫn bị chặn), nên một lời gọi log từ trong vùng đã khóa sẽ chờ hết hạn rồi ném lỗi, tức là việc ghi log tự tay giết công việc chính.
 *   2. **Không bao giờ ném lỗi ra ngoài.** Đổi một dòng log lấy một khách là đổi lỗ. Hỏng thì `console.error` rồi đi tiếp.
 *   3. **Không kiểm giá trị của bên gọi.** Gõ sai một giá trị enum thì giá trị sai được ghi thẳng ra sheet để nó lộ ra khi lọc, chứ không ném lỗi. Chỗ này cố ý ngược với luật "sai schema thì báo lỗi ngay", vì luật 2 đứng trên.
 *
 * Tệp này chỉ sở hữu việc ghi. `ErrorReport.js` chọn kênh hiển thị, còn `EntryPoint.js` bảo đảm mọi cửa vào nhả bộ đệm trong `finally`; ranh giới này giữ lỗi giao diện khỏi làm hỏng việc ghi log.
 */

/** Múi giờ ghi cột `Lúc`. Chốt cứng theo tài liệu 10 Phần 2 chứ không lấy múi giờ của tệp Sheet, vì múi giờ của tệp là thứ người dùng đổi được, mà cột `Lúc` thì phải đọc được như nhau ở mọi bản. */
var LOG_TIMEZONE = 'Asia/Ho_Chi_Minh';

/** Khuôn ngày giờ của cột `Lúc`. Rộng cố định, nên so hai chuỗi bằng phép so chữ cũng ra đúng thứ tự thời gian — chính nhờ vậy mà luật cắt theo tuổi không phải phân tích ngày tháng. */
var LOG_TIME_FORMAT = 'yyyy-MM-dd HH:mm:ss';

/** Bốn giá trị của cột `Kết quả`, tài liệu 10 Phần 2. Emoji nằm trong giá trị, không dùng định dạng có điều kiện (conditional formatting — luật tô màu theo nội dung ô). */
var LOG_OK = '✅ ok';
var LOG_WARN = '⚠️ warn';
var LOG_ERROR = '❌ error';
var LOG_CONFLICT = '🔀 conflict';

/** Khóa `DocumentProperties` chặn việc quét tuổi log quá một lần mỗi ngày dương lịch. Tài liệu 10 Phần 11. */
var LOG_CLEANUP_KEY = 'LOG_LAST_CLEANUP';

/** Số hàng nới thừa mỗi lần lưới sheet `Log` hết chỗ. Nới thừa để một lượt nới đủ cho vài trăm lượt nhả sau đó, chứ nới vừa đủ thì gần như mọi lượt nhả đều tốn thêm một lệnh gọi. */
var LOG_GRID_SLACK = 500;

/** Dòng luôn ghi: mọi thứ vào đây sẽ ra sheet ở lần nhả tới. */
var LOG_BUFFER = [];

/**
 * Vòng đệm dòng vết, giữ `SETTINGS.LOG_TRACE_BUFFER` dòng gần nhất, cũ nhất bị đẩy ra trước.
 *
 * Đây là điểm đáng giá nhất của thiết kế tài liệu 10 Phần 3: các bước dẫn tới một lỗi có sẵn mà không phải bật gì trước đó. Nó quan trọng vì lỗi phía FBM thường không tái tạo lại được theo yêu cầu — đến lúc bật công tắc lên thì hoàn cảnh gây lỗi đã qua.
 */
var LOG_TRACE_RING = [];

/** Lượt chạy này đã có dòng `❌ error` nào chưa. Đây là công tắc quyết định vòng đệm vết có được ghi ra hay bị bỏ đi. */
var LOG_RUN_HAS_ERROR = false;

/** Số thứ tự tăng dần, để hai dòng cùng một giây vẫn giữ đúng thứ tự xảy ra sau khi sắp lại. */
var LOG_SEQ = 0;

/** Đếm số lệnh `setValues` mà tệp này đã gọi. Chỉ dùng cho phép nghiệm thu "một lượt chỉ tốn một lệnh ghi" — không có nó thì luật đó là lời hứa không đo được. */
var LOG_WRITE_CALLS = 0;

/** Xóa cả hai bộ đệm và cờ lỗi. Gọi sau mỗi lần nhả, và gọi ở đầu phép nghiệm thu để nó không phụ thuộc thứ đã đệm trước đó. */
function logResetBuffers() {
  LOG_BUFFER = [];
  LOG_TRACE_RING = [];
  LOG_RUN_HAS_ERROR = false;
}

/** Số lệnh ghi đã tốn. Phép nghiệm thu đọc số này trước và sau một lượt để biết một lượt tốn mấy lệnh. */
function logGateWriteCount() {
  return LOG_WRITE_CALLS;
}

/** Mốc thời gian hiện tại theo khuôn của cột `Lúc`. */
function logNow() {
  return Utilities.formatDate(new Date(), LOG_TIMEZONE, LOG_TIME_FORMAT);
}

/**
 * Đệm một dòng. Không bao giờ ném lỗi, kể cả khi bên gọi đưa vào thứ không phải đối tượng.
 *
 * Mốc thời gian chốt ở đây chứ không chốt lúc nhả, vì thứ cần biết là **việc xảy ra lúc nào**, không phải bộ đệm được ghi lúc nào — hai mốc đó cách nhau cả một lượt chạy, và nhầm chúng là làm sai đúng cái thứ tự nhân quả mà log tồn tại để giữ.
 *
 * `console.log` phản chiếu mọi dòng ở cả hai chế độ. Nó miễn phí, và nó là thứ duy nhất còn sót lại khi một lượt chạy bị Google giết giữa đường.
 */
function logPush(entry, isTrace) {
  try {
    var safe = (entry && typeof entry === 'object') ? entry : { reason: String(entry) };
    var line = {
      at: logNow(),
      seq: (LOG_SEQ += 1),
      source: safe.source,
      action: safe.action,
      outcome: safe.outcome,
      entity: safe.entity,
      recordId: safe.recordId,
      reason: safe.reason,
      cycleId: safe.cycleId,
      detail: safe.detail
    };

    console.log('[ShinCRM] ' + line.at + ' ' + String(line.source) + ' ' + String(line.action) + ' ' + String(line.outcome) + ' — ' + String(line.reason));

    if (String(line.outcome) === LOG_ERROR) {
      LOG_RUN_HAS_ERROR = true;
    }

    // Chế độ vết cho nguồn này: dòng vết thành dòng luôn ghi, và ghi ra mỗi khoảng LOG_TRACE_BUFFER dòng chứ không đợi hết lượt.
    // Lý do ở tài liệu 10 Phần 3: lượt chạm trần sáu phút có thể bị cắt mà không chạy `finally`, và đó lại chính là lượt cần xem vết.
    if (isTrace && !logTraceCoversSource(line.source)) {
      LOG_TRACE_RING.push(line);
      while (LOG_TRACE_RING.length > SETTINGS.LOG_TRACE_BUFFER) { LOG_TRACE_RING.shift(); }
      return;
    }

    LOG_BUFFER.push(line);
    if (isTrace && LOG_BUFFER.length >= SETTINGS.LOG_TRACE_BUFFER) {
      flushLog();
    }
  } catch (khongDemDuoc) {
    console.error('logPush thất bại: ' + (khongDemDuoc && khongDemDuoc.stack ? khongDemDuoc.stack : khongDemDuoc));
  }
}

/** Đệm một dòng luôn ghi. Bốn khóa bắt buộc: `source`, `action`, `outcome`, `reason`. Bốn khóa tùy chọn: `entity`, `recordId`, `cycleId`, `detail`. */
function logEvent(entry) {
  logPush(entry, false);
}

/** Đệm một dòng vết. Chỉ ra sheet nếu lượt chạy này có lỗi, hoặc nếu `LOG_TRACE` phủ nguồn đó. */
function logTrace(entry) {
  logPush(entry, true);
}

/** Tên khóa này có phải tên khóa giữ bí mật không. Khớp theo chuỗi con và không phân biệt hoa thường, nên `payloadCookie` và `ASP.NET_SessionId` đều trúng. Tài liệu 10 Phần 7. */
function logIsSecretKey(name) {
  var lower = String(name === null || name === undefined ? '' : name).toLowerCase();
  return SETTINGS.LOG_SECRET_KEYS.some(function (word) { return lower.indexOf(word) !== -1; });
}

/**
 * Dựng nhãn che cho một giá trị bí mật: `[132 ký tự · ASP. · #a3f1]`.
 *
 * Nhãn giữ đúng ba thứ hữu ích khi debug — độ dài, vài ký tự đầu, và một mã băm ngắn để so hai lần chạy xem có cùng một bí mật hay không — mà không mang giá trị thật ra ngoài. Nó thay `***` vì `***` không trả lời được câu nào trong ba câu đó.
 *
 * Mã băm ở đây là **dấu nhận dạng ngắn để so hai lần chạy**, không phải một phép bảo vệ. Bốn chữ số hex thì dò ra được, và điều đó không sao: thứ cần bảo vệ là giá trị thật, và giá trị thật không có trong nhãn.
 */
function logMaskLabel(value) {
  var text = String(value === null || value === undefined ? '' : value);
  var hash = '????';

  try {
    var bytes = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, text);
    hash = bytes.slice(0, 2).map(function (b) { return ('0' + (b & 0xFF).toString(16)).slice(-2); }).join('');
  } catch (khongBamDuoc) {
    hash = '????';
  }

  return '[' + text.length + ' ký tự · ' + text.slice(0, 4) + ' · #' + hash + ']';
}

/**
 * Che bí mật nằm trong một chuỗi, dạng `tên khóa: giá trị` hoặc `tên khóa=giá trị`.
 *
 * Phép này là **cố gắng hết sức, không phải bảo đảm**: nó chỉ thấy được bí mật nào đi kèm tên khóa của nó. Một chuỗi chỉ có giá trị trần, không có tên khóa nào cạnh, thì không có gì để nhận ra. Đường an toàn là bên gọi đưa `detail` dạng đối tượng — lúc đó tên khóa là tên khóa thật và phép che ăn chắc.
 */
function logMaskText(text) {
  return String(text).replace(/([A-Za-z_][\w.\-]*)\s*[:=]\s*("[^"]*"|'[^']*'|[^\s,;&}]+)/g, function (all, key, raw) {
    if (!logIsSecretKey(key)) { return all; }
    return key + ': ' + logMaskLabel(raw.replace(/^["']/, '').replace(/["']$/, ''));
  });
}

/** Dựng bản sao đã che của một giá trị bất kỳ. Đi sâu vào đối tượng và mảng, dừng ở độ sâu 5 để một cấu trúc tự trỏ vào chính nó không làm treo lượt chạy. */
function logMaskCopy(value, depth) {
  if (value === null || value === undefined) { return value; }
  if (depth > 5) { return '[lồng quá sâu]'; }
  if (typeof value === 'string') { return logMaskText(value); }
  if (typeof value !== 'object') { return value; }
  // Nhận Date bằng `Object.prototype.toString` chứ không bằng `instanceof Date`: `instanceof` trả về false khi đối tượng
  // sinh ra ở một vùng chạy khác (different realm — hai môi trường JavaScript khác nhau). Bộ kiểm offline nạp code trong
  // hộp cát `vm` chính là hoàn cảnh đó, nên với `instanceof` thì luật này không có cách nào kiểm được trên máy — mà một
  // luật không kiểm được là một luật không có ai canh.
  if (Object.prototype.toString.call(value) === '[object Date]') { return Utilities.formatDate(value, LOG_TIMEZONE, LOG_TIME_FORMAT); }
  if (Array.isArray(value)) {
    return value.map(function (item) { return logMaskCopy(item, depth + 1); });
  }

  var out = {};
  Object.keys(value).forEach(function (key) {
    out[key] = logIsSecretKey(key) ? logMaskLabel(value[key]) : logMaskCopy(value[key], depth + 1);
  });
  return out;
}

/**
 * Đổi `detail` thành chuỗi ghi được vào ô, che bí mật nếu chế độ thường và để nguyên văn nếu `LOG_TRACE` phủ nguồn đó.
 *
 * Việc che do chính tệp này làm lúc nhả, không phải do bên gọi làm. Bên gọi cứ đưa nguyên `detail`; đặt luật che ở bên gọi thì mỗi chỗ gọi là một chỗ có thể quên. Tài liệu 10 Phần 7.
 *
 * Chỉ `detail` bị che, `reason` thì không: `reason` là một câu tiếng Việt viết cho người đọc, còn bí mật thì đi theo dữ liệu kỹ thuật.
 */
function logDetailToText(detail, source) {
  if (detail === null || detail === undefined || detail === '') { return ''; }

  var shaped = detail;
  try {
    if (!logTraceCoversSource(source)) {
      shaped = logMaskCopy(detail, 0);
    }
  } catch (khongCheDuoc) {
    // Không che được thì thà mất chi tiết kỹ thuật, chứ không ghi ra thứ chưa biết đã che chưa.
    return '[không che được chi tiết: ' + String(khongCheDuoc) + ']';
  }

  if (typeof shaped === 'string') { return shaped; }
  try { return JSON.stringify(shaped); } catch (khongDoiDuocChuoi) { return String(shaped); }
}

/** Đổi một dòng đã đệm thành chín ô theo đúng thứ tự cột của tài liệu 10 Phần 2. */
function logRowCells(line) {
  var text = function (value) { return value === null || value === undefined ? '' : String(value); };
  return [
    line.at,
    text(line.source),
    text(line.action),
    text(line.outcome),
    text(line.entity),
    text(line.recordId),
    text(line.reason),
    text(line.cycleId),
    logDetailToText(line.detail, line.source)
  ];
}

/**
 * Lấy sheet `Log`, **tạo lại kèm hàng tiêu đề nếu không tìm thấy**.
 *
 * Đây là ca hỏng có thật và hay xảy ra nhất: chủ dự án không phải người viết code, một lúc nào đó sẽ xóa hoặc đổi tên sheet. Tự tạo lại xóa hẳn một lớp lỗi thay vì báo cáo nó. Tài liệu 10 Phần 5.
 *
 * Cố ý không gọi `setupSheets`: hàm đó dựng lại cả năm sheet, mà ở đây chỉ thiếu một sheet không phải nguồn sự thật.
 */
function logSheet() {
  var book = shinOpenBook();
  var sheet = book.getSheetByName('Log');
  if (sheet) { return sheet; }

  sheet = book.insertSheet('Log');
  sheet.getRange(1, 1, 1, LOG_HEADERS.length).setValues([LOG_HEADERS])
    .setFontWeight('bold').setBackground(SHEET_LAYOUT.Log.headerColor);
  sheet.setFrozenRows(SHEET_LAYOUT.Log.headerRows);
  console.error('Sheet Log không tồn tại nên đã dựng lại. Lịch sử log trước đó đã mất.');
  return sheet;
}

/**
 * Nới lưới sheet nếu vùng ghi sắp tới vượt quá số hàng sheet đang có.
 *
 * Vì sao phải có: `setValues` **không** tự nới sheet, và `getRange` chạm quá hàng cuối là ném lỗi ngay. Ghép với việc `flushLog` bắt mọi lỗi
 * rồi đi tiếp, cách hỏng của nó là thứ tệ nhất trong các cách hỏng — log **lặng lẽ tắt hẳn** kể từ dòng đầu tiên vượt lưới, sheet `Log` đứng
 * im ở đúng con số cũ, và không có gì ngoài một dòng trong Cloud logging nói ra. Sheet mới của Google có 1.000 hàng, nên nó tự hỏng đúng vào
 * lúc log bắt đầu có ích.
 *
 * Nới thừa `LOG_GRID_SLACK` hàng chứ không nới vừa đủ: nới vừa đủ nghĩa là gần như mọi lượt nhả sau đó đều tốn thêm một lệnh gọi.
 *
 * Phép nới thật nằm ở `SheetGrid.gs`, vì bài học về lưới hữu hạn phải nằm ở một chỗ duy nhất mà cả đường ghi log lẫn đường nạp dữ liệu đều đi qua. Còn **nới thừa bao nhiêu** thì vẫn là chính sách riêng của sheet `Log`: đây là sheet duy nhất bị ghi thêm vài dòng mỗi lượt chạy, nên nó cần đệm dày hơn các sheet khác.
 */
function logEnsureRoom(sheet, endRow) {
  sheetGridEnsureRoom(sheet, endRow, LOG_GRID_SLACK);
}

/**
 * Ghi cả bộ đệm xuống sheet bằng **đúng một lệnh `setValues`**, rồi áp hai trần cắt log. Trả về số dòng đã ghi.
 *
 * Ghi một lô là lý do các dòng của cùng một lượt luôn nằm liền nhau, nên không cần một cột mã lượt chạy để nhóm chúng lại.
 *
 * Vòng đệm vết chỉ được ghi kèm khi lượt chạy có ít nhất một dòng `❌ error`; lượt chạy trơn thì vết bị bỏ đi.
 *
 * Rủi ro còn lại, chấp nhận và ghi rõ ở tài liệu 10 Phần 4: hai lượt chạy nhả log gần như cùng lúc có thể tính ra cùng một dòng đích và mất dòng của nhau. Một dòng log mất không phải một sự thật mất.
 *
 * Bộ đệm được xóa cả khi ghi thất bại. Nếu không xóa thì một sheet `Log` hỏng sẽ làm bộ đệm phình mãi trong một lượt chạy, tức là một lỗi log biến thành một lỗi hết bộ nhớ.
 */
function flushLog() {
  try {
    var lines = LOG_BUFFER.slice();
    if (LOG_RUN_HAS_ERROR) {
      lines = lines.concat(LOG_TRACE_RING);
    }

    if (!lines.length) {
      logResetBuffers();
      return 0;
    }

    // Sắp lại theo thời gian rồi theo số thứ tự, vì dòng vết và dòng luôn ghi nằm ở hai bộ đệm khác nhau.
    // Một vệt debug phải đọc từ trên xuống theo đúng thứ tự bước 1 → 2 → 3, đảo lại thì rất dễ hiểu sai nhân quả.
    lines.sort(function (a, b) { return a.at === b.at ? a.seq - b.seq : (a.at < b.at ? -1 : 1); });

    var rows = lines.map(function (line) { return logRowCells(line); });
    var sheet = logSheet();
    var startRow = Math.max(sheet.getLastRow() + 1, SHEET_LAYOUT.Log.firstDataRow);

    logEnsureRoom(sheet, startRow + rows.length - 1);
    sheet.getRange(startRow, 1, rows.length, LOG_HEADERS.length).setValues(rows);
    LOG_WRITE_CALLS += 1;

    logTrimRows(sheet);
    logTrimAge(sheet);
    logResetBuffers();
    return rows.length;
  } catch (loiGhiLog) {
    console.error('flushLog thất bại: ' + (loiGhiLog && loiGhiLog.stack ? loiGhiLog.stack : loiGhiLog));
    logResetBuffers();
    return 0;
  }
}

/**
 * Trần số dòng: cắt cũ nhất trước bằng `deleteRows`, kiểm mỗi lần nhả.
 *
 * Kiểm mỗi lần vì nó miễn phí — `getLastRow()` đã có sẵn trong tay lúc tính dòng đích. Vai trò thật của trần này là lưới an toàn cho một vòng lặp lỗi chạy hoang, không phải cái cắt log trong ngày thường.
 *
 * `deleteRows` là một lệnh gọi API bất kể xóa bao nhiêu dòng. Đã đo trên sheet `Log` 5.000 dòng thật: xóa 1 dòng mất 309 ms, xóa 1.000 dòng mất 374 ms. Chi phí phẳng.
 */
function logTrimRows(sheet) {
  var firstDataRow = SHEET_LAYOUT.Log.firstDataRow;
  var excess = sheet.getLastRow() - firstDataRow + 1 - SETTINGS.LOG_MAX_ROWS;
  if (excess > 0) {
    sheet.deleteRows(firstDataRow, excess);
  }
}

/**
 * Trần tuổi dòng: xóa dòng cũ hơn `SETTINGS.LOG_RETENTION_DAYS` ngày, nhiều nhất một lần mỗi ngày dương lịch.
 *
 * Đây là cái thực sự cắt log trong ngày thường. Nó phải đọc cột `Lúc` nên không kiểm mỗi lần nhả; khóa ngày trong `DocumentProperties` chặn việc đó.
 *
 * Khóa ngày đặt **trước** khi quét, không phải sau. Nếu đặt sau thì một lần quét lỗi sẽ quét lại ở mọi lần nhả trong suốt cả ngày — mà một phép quét đã lỗi thì lần sau cũng lỗi đúng như thế, chỉ thêm tốn.
 *
 * Dòng nào ô `Lúc` rỗng hoặc không theo khuôn thì **dừng lại**, không xóa. Không đoán được ngày của một dòng thì không có quyền xóa nó.
 */
function logTrimAge(sheet) {
  var props = PropertiesService.getDocumentProperties();
  var today = Utilities.formatDate(new Date(), LOG_TIMEZONE, 'yyyy-MM-dd');
  if (props.getProperty(LOG_CLEANUP_KEY) === today) { return; }
  props.setProperty(LOG_CLEANUP_KEY, today);

  var firstDataRow = SHEET_LAYOUT.Log.firstDataRow;
  var lastRow = sheet.getLastRow();
  if (lastRow < firstDataRow) { return; }

  var cutoffMs = new Date().getTime() - SETTINGS.LOG_RETENTION_DAYS * 24 * 60 * 60 * 1000;
  var cutoff = Utilities.formatDate(new Date(cutoffMs), LOG_TIMEZONE, LOG_TIME_FORMAT);
  var stamps = sheet.getRange(firstDataRow, 1, lastRow - firstDataRow + 1, 1).getValues();
  var tooOld = 0;

  for (var i = 0; i < stamps.length; i += 1) {
    var stamp = String(stamps[i][0] === null || stamps[i][0] === undefined ? '' : stamps[i][0]).trim();
    if (stamp.length !== LOG_TIME_FORMAT.length || stamp >= cutoff) { break; }
    tooOld += 1;
  }

  if (tooOld > 0) {
    sheet.deleteRows(firstDataRow, tooOld);
  }
}

/**
 * Phép nghiệm thu của cửa ghi log, chạy được khi không có ai ngồi trước máy.
 *
 * Nó kiểm bốn thứ, và cả bốn đều là thứ chỉ nhìn code thì không biết đúng hay sai:
 *   1. Ba dòng trong một lượt ra đúng ba dòng trên sheet, và tốn **đúng một** lệnh ghi. Không có phép đo này thì luật "một lượt một lệnh ghi" là lời hứa, mà cách hỏng của nó — ghi từng dòng một trong vòng lặp — lại không để lại dấu vết nào ngoài hóa đơn hạn mức.
 *   2. Lượt chạy trơn thì dòng vết **không** ra sheet.
 *   3. Lượt chạy có lỗi thì dòng vết ra sheet cùng dòng lỗi.
 *   4. Giá trị đi kèm tên khóa bí mật ra sheet dưới dạng nhãn che, còn khóa thường thì nguyên vẹn.
 *
 * `finally` xóa đúng những dòng phép kiểm này vừa thêm, nên chạy bao nhiêu lần cũng không để lại rác trên sheet.
 */
function probeLogGate() {
  var report = [];
  var sheet = logSheet();
  var before = sheet.getLastRow();
  var biMat = 'ASP.NET_SessionId=abc123def456';

  try {
    logResetBuffers();
    var writesBefore = logGateWriteCount();

    logEvent({ source: 'core', action: 'cleanup', outcome: LOG_OK, reason: 'Nghiệm thu dòng 1', entity: 'customer', recordId: 'CUS-000001' });
    logEvent({ source: 'core', action: 'cleanup', outcome: LOG_WARN, reason: 'Nghiệm thu dòng 2', detail: { cookie: biMat, ghiChu: 'ô này không phải bí mật' } });
    logEvent({ source: 'core', action: 'cleanup', outcome: LOG_OK, reason: 'Nghiệm thu dòng 3' });
    logTrace({ source: 'core', action: 'cleanup', outcome: LOG_OK, reason: 'Dòng vết — lượt này không lỗi nên KHÔNG được ra sheet' });

    var written = flushLog();
    var writes = logGateWriteCount() - writesBefore;
    var grew = sheet.getLastRow() - before;

    report.push(written === 3 ? '✅ Nhả bộ đệm ghi đúng 3 dòng, dòng vết bị bỏ đi đúng luật' : '❌ Nhả bộ đệm ghi ' + written + ' dòng, đáng ra 3. Dòng vết có thể đã lọt ra sheet.');
    report.push(grew === 3 ? '✅ Sheet Log tăng đúng 3 dòng' : '❌ Sheet Log tăng ' + grew + ' dòng, đáng ra 3 (trước ' + before + ', sau ' + sheet.getLastRow() + '). Nếu luật cắt log vừa xóa dòng cũ thì con số này lệch mà không phải lỗi.');
    report.push(writes === 1 ? '✅ Cả lượt tốn đúng 1 lệnh ghi' : '❌ Cả lượt tốn ' + writes + ' lệnh ghi, đáng ra 1.');

    var detailCell = String(sheet.getRange(before + 2, 9).getValue());
    report.push(detailCell.indexOf(biMat) === -1 ? '✅ Bí mật không ra sheet nguyên văn' : '❌ Bí mật RA SHEET NGUYÊN VĂN: ' + detailCell);
    report.push(detailCell.indexOf('ký tự') !== -1 ? '✅ Có nhãn che: ' + detailCell : '❌ Không thấy nhãn che ở ô chi tiết: ' + detailCell);
    report.push(detailCell.indexOf('ghiChu') !== -1 ? '✅ Khóa thường vẫn nguyên vẹn' : '❌ Khóa thường bị che oan: ' + detailCell);

    logResetBuffers();
    logTrace({ source: 'core', action: 'cleanup', outcome: LOG_OK, reason: 'Dòng vết 1 — lượt này CÓ lỗi nên phải ra sheet' });
    logTrace({ source: 'core', action: 'cleanup', outcome: LOG_OK, reason: 'Dòng vết 2 — lượt này CÓ lỗi nên phải ra sheet' });
    logEvent({ source: 'core', action: 'cleanup', outcome: LOG_ERROR, reason: 'Nghiệm thu dòng lỗi' });

    var writtenWithError = flushLog();
    report.push(writtenWithError === 3 ? '✅ Lượt có lỗi nhả kèm cả 2 dòng vết' : '❌ Lượt có lỗi nhả ' + writtenWithError + ' dòng, đáng ra 3. Vòng đệm vết không được ghi kèm — mất đúng thứ đáng giá nhất của thiết kế.');
  } finally {
    var now = sheet.getLastRow();
    if (now > before) {
      // Google từ chối xóa hết các hàng không đóng băng, nên nếu vùng cần xóa đúng bằng phần còn lại của lưới thì phải chèn bù trước.
      // Ca này có thật và đã nổ đúng ở dòng này: sheet Log mới dựng có lưới sát dữ liệu, xóa phần phép kiểm vừa thêm là xóa tới hàng cuối.
      var soXoa = now - before;
      var conLai = sheet.getMaxRows() - sheet.getFrozenRows() - soXoa;
      if (conLai < 1) { sheet.insertRowsAfter(sheet.getMaxRows(), 1 - conLai); }
      sheet.deleteRows(before + 1, soXoa);
    }
    logResetBuffers();
    report.push(sheet.getLastRow() === before ? '✅ Đã xóa hết dòng của phép kiểm, sheet Log về đúng ' + before + ' dòng' : '❌ CHƯA dọn hết: sheet Log còn ' + sheet.getLastRow() + ' dòng, đáng ra ' + before + '.');
  }

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
