/** Sổ tiến trình nền và công cụ tính lịch (đến hạn, thử lại). Không biết gì về chặng hay ô lượt; người điều phối lần hỏi là `heartbeatRun` (`Heartbeat.js`). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
/**
 * Sổ tiến trình nền, một khóa: mỗi tiến trình `{ doneAt, failures, retryAt }`; `customerFull` thêm `baseline` (số khách mốc, `null` khi chưa có) và `baselineScope` (dấu phạm vi lúc lấy mốc, `scopeMark`; rỗng ở mốc cũ nên mốc cũ không so được), `detail` thêm `cursor` (số CUS cuối của Vòng xoay, `-1` khi chưa có).
 * - Đến hạn khi giờ hiện tại >= `doneAt` + chu kỳ; chưa từng chạy xong thì đến hạn ngay. Chỉ ghi `doneAt` khi tiến trình chạy hết lượt; lượt hỏng giữa chừng không ghi nên tiến trình vẫn quá hạn và lần hỏi sau chạy lại.
 * - Lỗi thì dời `retryAt` của riêng tiến trình đó (nhân đôi tới trần), nên tiến trình khác vẫn chạy thay vì bị một tiến trình lỗi liên tục chặn mãi.
 * - Số khách mốc và con trỏ Vòng xoay chỉ ghi khi lượt xong (`runBookCommit` của `runClose`), không ghi giữa lượt.
 * Một cổng đọc, một cổng ghi; hàm tính sổ mới là hàm thuần.
 */
FbmSync.PROCESS_BOOK_KEY = 'FBM_SYNC_PROCESS_BOOK_V1';
FbmSync.PROCESS_KINDS = ['customerFull', 'activityFull', 'detail', 'heartbeat'];
/** Chuẩn hóa sổ đã lưu (thiếu mục nào thì mục đó là "chưa từng chạy"). Hàm thuần. */
FbmSync.processBookShape = function (stored) {
  var book = {}, source = stored || {}, count = function (value) { var n = Number(value); return isFinite(n) && n > 0 ? n : 0; };
  FbmSync.PROCESS_KINDS.forEach(function (kind) {
    var entry = source[kind] || {};
    book[kind] = { doneAt: count(entry.doneAt), failures: Math.floor(count(entry.failures)), retryAt: count(entry.retryAt) };
  });
  var baseline = source.customerFull && source.customerFull.baseline, cursor = source.detail && source.detail.cursor;
  book.customerFull.baseline = typeof baseline === 'number' && isFinite(baseline) && baseline >= 0 ? baseline : null;
  book.customerFull.baselineScope = book.customerFull.baseline === null ? '' : String((source.customerFull || {}).baselineScope || '');
  book.detail.cursor = typeof cursor === 'number' && isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : -1;
  book.identityStop = count(source.identityStop);
  return book;
};
/** Cổng đọc duy nhất của sổ. Đọc một lần mỗi lời gọi rồi truyền cho các công cụ tính. */
FbmSync.processBookRead = function () {
  return FbmSync.processBookShape(documentPropertyJson(FbmSync.props(), FbmSync.PROCESS_BOOK_KEY, 'Sổ tiến trình nền', 'object'));
};
/** Cổng ghi duy nhất của sổ. */
FbmSync.processBookWrite = function (book) { return FbmSync.propertyJsonWrite(FbmSync.PROCESS_BOOK_KEY, FbmSync.processBookShape(book)); };
/** Vị trí Vòng xoay đã lưu: số CUS của khách cuối cùng đã ghi xong giao dịch; `-1` khi chưa có, lượt bắt đầu từ khách số nhỏ nhất. */
FbmSync.detailCursorRead = function () { return FbmSync.processBookRead().detail.cursor; };
/** Tên tiến trình trong câu báo lỗi và câu xác nhận, đúng nhãn ở `Cài đặt phiên` (09/02 Phần 3). */
/** Tên tiến trình nền là tên kiểu lượt nó mở trong `RUN_PLANS`; không khai tên lần thứ hai. */
FbmSync.scheduleLabel = function (kind) { return FbmSync.runPlanOfStart(FbmSync.SCHEDULE_SCANS[kind]).label; };
/** Loại quét nền luôn quét đẩy dù dấu lần đẩy sạch còn khớp: lưới an toàn cho sửa Sheet mà trigger không chạy nên sổ nạp lại không tăng (chủ dự án chốt Quét nhanh 2026-10-19). Lượt tay luôn quét. */
FbmSync.PUSH_GATE_BYPASS_SCANS = ['full'];
FbmSync.PUSH_GATE_CLOSED_TRACE = 'Bỏ qua kiểm dữ liệu ShinCRM và chặng đẩy: từ lần đẩy sạch trước không có gì đổi.';
/** Dòng `Mức quét` của lượt Giữ phiên có đẩy; `Chiều chạy` lấy theo chiều lịch nền (chủ dự án chốt 2026-10-20). */
FbmSync.KEEPALIVE_SCAN_LABEL = 'Giữ phiên FBM (chỉ đẩy bản ghi vừa sửa)';
/** Kiểu quét của lượt mà mỗi tiến trình nền mở (Giữ phiên là lượt `keepalive`: chỉ đếm khách, hoặc đẩy bản ghi vừa sửa khi cổng chặng đẩy mở). */
FbmSync.SCHEDULE_SCANS = { customerFull: 'full', activityFull: 'activity_bulk', detail: 'detail', heartbeat: 'keepalive' };

/** Giờ đến hạn của một tiến trình; `0` là chưa từng chạy xong nên đến hạn ngay. Tiến trình đang chờ thử lại sau lỗi thì đến hạn muộn nhất là giờ thử lại. Đọc chu kỳ hiện hành nên đổi chu kỳ là có hiệu lực ngay. */
FbmSync.processDueAt = function (kind, schedule, book) {
  var entry = book[kind], dueAt = entry.doneAt ? entry.doneAt + schedule[kind].minutes * 60 * 1000 : 0;
  return Math.max(dueAt, entry.retryAt);
};
/**
 * Tiến trình bật và đã đến hạn, theo ưu tiên (Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay, cuối cùng Giữ phiên).
 * `pollAt`: giờ bắt đầu lần hỏi đang chạy chuỗi; tiến trình đã chạy xong từ giờ đó không chạy lại trong cùng lần hỏi, nên chuỗi luôn dừng dù chu kỳ ngắn hơn thời gian chạy. Tiến trình vừa lỗi có giờ thử lại ở tương lai nên cũng không chạy lại.
 */
FbmSync.processDue = function (now, schedule, book, pollAt) {
  return FbmSync.PROCESS_KINDS.filter(function (kind) {
    return schedule[kind].enabled && FbmSync.processDueAt(kind, schedule, book) <= now && !(pollAt && book[kind].doneAt >= pollAt);
  }).sort(function (a, b) { return schedule[a].priority - schedule[b].priority; });
};
/** Số phút chờ trước lần thử lại thứ `failures` (lỗi liền nhau): nhân đôi từ `SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES` tới trần `SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES`. */
FbmSync.retryDelay = function (failures) {
  var base = Number(SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES), cap = Number(SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES);
  return Math.min(cap, base * Math.pow(2, Math.min(Math.max(1, failures) - 1, 30)));
};
/**
 * Sổ mới sau kết quả một lượt của tiến trình nền (hàm thuần, bên gọi ghi): `done` ghi giờ chạy xong và bỏ lần thử lại; `failed` dời giờ thử lại của riêng tiến trình đó (không ghi giờ chạy xong, nên tới hạn là chạy lại). Trả `{ book, failures, minutes }`; hai số sau để người điều phối ghi Log.
 */
FbmSync.processBookMark = function (book, kind, outcome, now) {
  var next = FbmSync.processBookShape(book), at = Number(now), entry = next[kind];
  if (!entry) { var unknown = new Error('Tiến trình nền "' + String(kind) + '" không có trong PROCESS_KINDS.'); unknown.code = 'PROCESS_KIND_UNKNOWN'; throw unknown; }
  if (outcome === 'done') { entry.doneAt = at; entry.failures = 0; entry.retryAt = 0; return { book: next, failures: 0, minutes: 0 }; }
  var failures = entry.failures + 1, minutes = FbmSync.retryDelay(failures);
  entry.failures = failures; entry.retryAt = at + minutes * 60 * 1000;
  return { book: next, failures: failures, minutes: minutes };
};
/** Sổ mới sau khi lưu lịch nền (hàm thuần, bên gọi ghi): tiến trình đang tắt không giữ số lần lỗi và giờ thử lại, nên bật lại thì lần lỗi kế chờ từ mức đầu; `doneAt`, số khách mốc và con trỏ Vòng xoay giữ nguyên. Trả `cleared` là các tiến trình vừa được xóa (rỗng thì không cần ghi). */
FbmSync.processBookDisabledClear = function (book, schedule) {
  var next = FbmSync.processBookShape(book), cleared = FbmSync.PROCESS_KINDS.filter(function (kind) {
    return !schedule[kind].enabled && (next[kind].failures || next[kind].retryAt);
  });
  cleared.forEach(function (kind) { next[kind].failures = 0; next[kind].retryAt = 0; });
  return { book: next, cleared: cleared };
};
/** Nền đang dừng vì lệch danh tính (thuần): sổ ghi giờ dừng; liên kết được lưu sau giờ đó (`updatedAt` lớn hơn) là hết dừng, không cần ai xóa dấu. Liên kết cũ không có `updatedAt` thì dừng tới khi lưu lại. */
FbmSync.identityStopActive = function (book, binding) {
  return !!book.identityStop && Number(binding && binding.updatedAt || 0) <= book.identityStop;
};
/** Sổ mới với mốc bền của lượt vừa xong (hàm thuần): `customerTotal` → số khách mốc, `rotationCursor` → vị trí Vòng xoay. Mốc không phải số thì giữ nguyên. */
FbmSync.processBookMarks = function (book, marks) {
  var next = FbmSync.processBookShape(book), source = marks || {};
  if (typeof source.customerTotal === 'number') { next.customerFull.baseline = source.customerTotal; next.customerFull.baselineScope = String(source.customerScope || ''); }
  if (typeof source.rotationCursor === 'number') { next.detail.cursor = Math.floor(source.rotationCursor); }
  return next;
};
/** Dòng vết của lịch nền: chỉ ra Sheet `Log` khi `LOG_TRACE` phủ `fbm_sync`, để biết mỗi lần Extension hỏi GAS đã quyết gì. */
FbmSync.scheduleTrace = function (action, reason, detail) {
  logTrace({ source: 'fbm_sync', action: action, outcome: 'trace', reason: reason, detail: detail || {} });
};
/** Câu "sớm nhất là X, còn N phút" cho dòng vết lần hỏi chưa có việc. */
FbmSync.scheduleNextText = function (now, schedule, book) {
  var best = '', bestAt = 0;
  FbmSync.PROCESS_KINDS.forEach(function (kind) {
    var at = FbmSync.processDueAt(kind, schedule, book);
    if (schedule[kind].enabled && (!best || at < bestAt)) { best = kind; bestAt = at; }
  });
  return best ? 'sớm nhất là ' + FbmSync.scheduleLabel(best) + ', còn ' + Math.max(0, Math.ceil((bestAt - now) / 60000)) + ' phút' : 'không có tiến trình nào đang bật';
};
FbmSync.scheduleNextAt = function (schedule, book) {
  var times = FbmSync.PROCESS_KINDS.filter(function (kind) { return schedule[kind].enabled; }).map(function (kind) { return FbmSync.processDueAt(kind, schedule, book); });
  return times.length ? Math.min.apply(null, times) : 0;
};
