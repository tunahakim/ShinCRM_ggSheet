/**
 * Cửa ghi log: gom dòng trong RAM rồi ghi xuống sheet `Log` bằng đúng một lệnh, Tài liệu 10 Phần 2 tới Phần 7.
 *
 * Tên `LogGate` tránh trùng `Logger` có sẵn của Apps Script, và nằm cùng họ với `WriteGate`, `IdGate`, `DeleteGate`.
 *
 * Ba luật của tệp này, cả ba đều là ràng buộc cứng của tài liệu 10 và cả ba đều dễ bị vi phạm lúc sửa nhanh:
 *   1. **Không bao giờ lấy `LockService`.** Khóa của dự án không tái nhập (not reentrant — cùng một lượt chạy xin lại khóa mình đang giữ thì vẫn bị chặn), nên một lời gọi log từ trong vùng đã khóa sẽ chờ hết hạn rồi ném lỗi, tức là việc ghi log tự tay giết công việc chính.
 *   2. **Không bao giờ ném lỗi ra ngoài.** Đổi một dòng log lấy một khách là đổi lỗ. Hỏng thì `console.error` rồi đi tiếp.
 *   3. **Không kiểm giá trị của bên gọi.** Gõ sai một giá trị enum thì giá trị sai được ghi thẳng ra sheet để nó lộ ra khi lọc, chứ không ném lỗi. Chỗ này cố ý ngược với luật "sai schema thì báo lỗi ngay", vì luật 2 đứng trên.
 *
 * Tệp này giữ bộ đệm, định dạng dòng và người điều phối `flushLog`; che bí mật ở `LogMask.js`, thao tác sheet `Log` ở `LogSheet.js`. `ErrorReport.js` chọn kênh hiển thị, còn `EntryPoint.js` bảo đảm mọi cửa vào nhả bộ đệm trong `finally`; ranh giới này giữ lỗi giao diện khỏi làm hỏng việc ghi log.
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

/** Ngữ cảnh theo nguồn: hàm trả một câu ngắn gắn vào cột Chi tiết kỹ thuật của mọi dòng thuộc nguồn đó (khóa `luot`). Module đăng ký lúc chạy, không lúc nạp tệp, vì Apps Script nạp tệp theo tên và nhiều module nạp trước tệp này. */
var LOG_SOURCE_CONTEXT = {};

/** Xóa cả hai bộ đệm và cờ lỗi. Gọi sau mỗi lần nhả, và gọi ở đầu phép nghiệm thu để nó không phụ thuộc thứ đã đệm trước đó. */
function logResetBuffers() {
  LOG_BUFFER = [];
  LOG_TRACE_RING = [];
  LOG_RUN_HAS_ERROR = false;
}

/** Câu lỗi ngắn cho mắt người đọc. Lấy `message` chứ không lấy cả `stack`: `stack` thuộc sheet `Log`, nơi có chỗ và có người đi tìm nó. */
function errorMessage(err) {
  if (!err) { return 'Lỗi không rõ nguyên nhân.'; }
  if (err.message) { return String(err.message); }
  return String(err);
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
      detail: logWithContext(safe.source, safe.detail)
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

/** Đăng ký ngữ cảnh cho một nguồn; đăng ký lại thì thay hàm cũ. */
function logRegisterContext(source, provider) {
  LOG_SOURCE_CONTEXT[String(source)] = provider;
}

/** Gắn ngữ cảnh của nguồn vào `detail`. Hàm ngữ cảnh hỏng thì ghi rõ trong chính dòng đó, không làm mất dòng (luật 2 của tệp). */
function logWithContext(source, detail) {
  var provider = LOG_SOURCE_CONTEXT[String(source)];
  if (typeof provider !== 'function') { return detail; }
  var context;
  try { context = provider(); } catch (hong) { context = 'không đọc được ngữ cảnh: ' + String(hong && hong.message || hong); }
  if (!context) { return detail; }
  if (detail && typeof detail === 'object' && !Array.isArray(detail)) { return Object.assign({ luot: context }, detail); }
  return detail === undefined || detail === null || detail === '' ? { luot: context } : { luot: context, detail: detail };
}

/** Đệm một dòng luôn ghi. Bốn khóa bắt buộc: `source`, `action`, `outcome`, `reason`. Bốn khóa tùy chọn: `entity`, `recordId`, `cycleId`, `detail`. */
function logEvent(entry) {
  logPush(entry, false);
}

/** Đệm một dòng vết. Chỉ ra sheet nếu lượt chạy này có lỗi, hoặc nếu `LOG_TRACE` phủ nguồn đó. */
function logTrace(entry) {
  logPush(entry, true);
}

/**
 * Nhả bộ đệm ngay nếu `LOG_TRACE` phủ nguồn này; chế độ thường thì không làm gì để giữ luật một lượt một lệnh ghi.
 *
 * Dùng cho mốc bắt đầu và kết thúc bước nghiệp vụ. Lượt bị Google cắt ở trần sáu phút không chạy `finally`, nên mốc "Bắt đầu bước X" chỉ còn trên sheet nếu đã được nhả ngay lúc đó — mà đó lại là dòng duy nhất cho biết lượt chết ở bước nào. Tài liệu 10 Phần 3.
 */
function flushLogIfTraced(source) {
  return logTraceCoversSource(source) ? flushLog() : 0;
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
    logSheetAppend(sheet, rows);
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
  var before = sheetReadLastRow(sheet);
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
    var grew = sheetReadLastRow(sheet) - before;

    report.push(written === 3 ? '✅ Nhả bộ đệm ghi đúng 3 dòng, dòng vết bị bỏ đi đúng luật' : '❌ Nhả bộ đệm ghi ' + written + ' dòng, đáng ra 3. Dòng vết có thể đã lọt ra sheet.');
    report.push(grew === 3 ? '✅ Sheet Log tăng đúng 3 dòng' : '❌ Sheet Log tăng ' + grew + ' dòng, đáng ra 3 (trước ' + before + ', sau ' + sheetReadLastRow(sheet) + '). Nếu luật cắt log vừa xóa dòng cũ thì con số này lệch mà không phải lỗi.');
    report.push(writes === 1 ? '✅ Cả lượt tốn đúng 1 lệnh ghi' : '❌ Cả lượt tốn ' + writes + ' lệnh ghi, đáng ra 1.');

    var detailCell = String(sheetGridReadBlock(sheet, before + 2, 1, 1, 9)[0][0]);
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
    var now = sheetReadLastRow(sheet);
    if (now > before) {
      sheetRowsDelete(sheet, logRowRange(before + 1, now - before));
    }
    logResetBuffers();
    report.push(sheetReadLastRow(sheet) === before ? '✅ Đã xóa hết dòng của phép kiểm, sheet Log về đúng ' + before + ' dòng' : '❌ CHƯA dọn hết: sheet Log còn ' + sheetReadLastRow(sheet) + ' dòng, đáng ra ' + before + '.');
  }

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
