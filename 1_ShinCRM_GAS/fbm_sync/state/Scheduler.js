/** Sổ tiến trình nền và công cụ tính lịch (đến hạn, thử lại). Không biết gì về chặng hay ô lượt; người điều phối lần hỏi là `heartbeatRun` (`Heartbeat.js`). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
/**
 * Sổ tiến trình nền, một khóa: mỗi tiến trình `{ doneAt, failures, retryAt }`; `customerFull` thêm `baseline` (số khách mốc, `null` khi chưa có), `detail` thêm `cursor` (số CUS cuối của Vòng xoay, `-1` khi chưa có).
 * - Đến hạn khi giờ hiện tại >= `doneAt` + chu kỳ; chưa từng chạy xong thì đến hạn ngay. Chỉ ghi `doneAt` khi tiến trình chạy hết lượt; lượt hỏng giữa chừng không ghi nên tiến trình vẫn quá hạn và lần hỏi sau chạy lại.
 * - Lỗi thì dời `retryAt` của riêng tiến trình đó (nhân đôi tới trần), nên tiến trình khác vẫn chạy thay vì bị một tiến trình lỗi liên tục chặn mãi.
 * - Số khách mốc và con trỏ Vòng xoay chỉ ghi khi lượt xong (`runMarksCommit`), không ghi giữa lượt.
 * Một cổng đọc, một cổng ghi; hàm tính sổ mới là hàm thuần.
 */
FbmSync.PROCESS_BOOK_KEY = 'FBM_SYNC_PROCESS_BOOK_V1';
FbmSync.PROCESS_KINDS = ['customerFull', 'activityFull', 'detail', 'heartbeat'];
/** Khóa cũ trước khi gộp sổ; còn khóa nào mà sổ chưa có thì cổng đọc ném, không đọc thành sổ rỗng (lịch nền sẽ chạy lại hết, mốc khách mất). Xóa cùng hàm chuyển `fbmStoresMigrate`. */
FbmSync.PROCESS_BOOK_OLD_KEYS = ['FBM_SYNC_DONE_CUSTOMER_FULL_SCAN', 'FBM_SYNC_DONE_ACTIVITY_FULL_SCAN', 'FBM_SYNC_DONE_DETAIL_SCAN', 'FBM_SYNC_DONE_HEARTBEAT', 'FBM_SYNC_RETRY_CUSTOMER_FULL_SCAN', 'FBM_SYNC_RETRY_ACTIVITY_FULL_SCAN', 'FBM_SYNC_RETRY_DETAIL_SCAN', 'FBM_SYNC_RETRY_HEARTBEAT', 'FBM_SYNC_CUSTOMER_BASELINE_V1', 'FBM_SYNC_DETAIL_CURSOR_V1'];
/** Chuẩn hóa sổ đã lưu (thiếu mục nào thì mục đó là "chưa từng chạy"). Hàm thuần. */
FbmSync.processBookShape = function (stored) {
  var book = {}, source = stored || {}, count = function (value) { var n = Number(value); return isFinite(n) && n > 0 ? n : 0; };
  FbmSync.PROCESS_KINDS.forEach(function (kind) {
    var entry = source[kind] || {};
    book[kind] = { doneAt: count(entry.doneAt), failures: Math.floor(count(entry.failures)), retryAt: count(entry.retryAt) };
  });
  var baseline = source.customerFull && source.customerFull.baseline, cursor = source.detail && source.detail.cursor;
  book.customerFull.baseline = typeof baseline === 'number' && isFinite(baseline) && baseline >= 0 ? baseline : null;
  book.detail.cursor = typeof cursor === 'number' && isFinite(cursor) && cursor >= 0 ? Math.floor(cursor) : -1;
  return book;
};
/** Cổng đọc duy nhất của sổ. Đọc một lần mỗi lời gọi rồi truyền cho các công cụ tính. */
FbmSync.processBookRead = function () {
  var stored = FbmSync.documentPropertyJson(FbmSync.PROCESS_BOOK_KEY, 'sổ tiến trình nền');
  if (!stored) {
    var props = FbmSync.props(), left = FbmSync.PROCESS_BOOK_OLD_KEYS.filter(function (key) { return props.getProperty(key) !== null; });
    if (left.length) { var pending = new Error('Sổ tiến trình nền chưa được chuyển từ ' + left.length + ' khóa cũ; chạy hàm chuyển fbmStoresMigrate trước.'); pending.code = 'FBM_STORES_MIGRATION_PENDING'; pending.detail = { keys: left }; throw pending; }
  }
  return FbmSync.processBookShape(stored);
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
/** Sổ mới với mốc bền của lượt vừa xong (hàm thuần): `customerTotal` → số khách mốc, `rotationCursor` → vị trí Vòng xoay. Mốc không phải số thì giữ nguyên. */
FbmSync.processBookMarks = function (book, marks) {
  var next = FbmSync.processBookShape(book), source = marks || {};
  if (typeof source.customerTotal === 'number') { next.customerFull.baseline = source.customerTotal; }
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

/**
 * Handler của các trigger hẹn giờ phía GAS ở thiết kế cũ. Nhịp nền nay chỉ do alarm `gas_poll` của Extension (09/02), GAS không cài trigger hẹn giờ nào cho đồng bộ.
 * Google không tự gỡ trigger đã cài khi code đổi, nên tên hàm phải còn: trigger sót gọi tới thì tự xóa mọi trigger cũ và ghi Log, không làm việc nghiệp vụ nào. Bỏ tên hàm thì trigger sót báo lỗi "không tìm thấy hàm" mãi.
 */
FbmSync.LEGACY_TRIGGER_HANDLERS = ['fbmHeartbeatTrigger', 'fbmCustomerScanTrigger', 'fbmActivityScanTrigger', 'fbmSupervisorTrigger'];
FbmSync.removeLegacyTriggers = function () {
  var removed = [];
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (FbmSync.LEGACY_TRIGGER_HANDLERS.indexOf(handler) >= 0) { ScriptApp.deleteTrigger(trigger); removed.push(handler); }
  });
  if (removed.length && typeof logEvent === 'function') {
    logEvent({ source: 'fbm_sync', action: 'legacy_trigger_removed', outcome: typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', reason: 'Đã gỡ ' + removed.length + ' trigger hẹn giờ của thiết kế cũ (' + removed.join(', ') + '); nhịp nền chỉ còn do Extension hỏi GAS.' });
  }
  return { ok: true, removed: removed };
};
function fbmLegacyTriggerEntry(name) {
  return runEntryPoint(name, 'fbm_sync', function () { return FbmSync.removeLegacyTriggers(); });
}
function fbmHeartbeatTrigger() { return fbmLegacyTriggerEntry('fbmHeartbeatTrigger'); }
function fbmCustomerScanTrigger() { return fbmLegacyTriggerEntry('fbmCustomerScanTrigger'); }
function fbmActivityScanTrigger() { return fbmLegacyTriggerEntry('fbmActivityScanTrigger'); }
function fbmSupervisorTrigger() { return fbmLegacyTriggerEntry('fbmSupervisorTrigger'); }
