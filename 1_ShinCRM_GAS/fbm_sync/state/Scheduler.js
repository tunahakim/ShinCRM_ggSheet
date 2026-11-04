/** Sổ tiến trình nền và công cụ tính lịch (đến hạn, thử lại). Không biết gì về chặng hay ô lượt; người điều phối lần hỏi là `heartbeatRun` (`Heartbeat.js`). */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }
FbmSync.DETAIL_CURSOR_KEY = 'FBM_SYNC_DETAIL_CURSOR_V1';
/**
 * Giờ chạy xong gần nhất của từng tiến trình nền, mỗi tiến trình đúng một khóa. Đến hạn khi giờ hiện tại >= giờ chạy xong + chu kỳ.
 * Chỉ ghi khi tiến trình chạy hết lượt (kể cả khi vài bản ghi lỗi hay xung đột); lượt hỏng giữa chừng không ghi gì nên tiến trình vẫn quá hạn và lần Extension hỏi sau chạy lại — đó là cơ chế tự phục hồi. Chưa từng chạy xong thì đến hạn ngay.
 */
FbmSync.SCHEDULE_DONE_KEYS = { customerFull: 'FBM_SYNC_DONE_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_DONE_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_DONE_DETAIL_SCAN', heartbeat: 'FBM_SYNC_DONE_HEARTBEAT' };
/**
 * Lần thử lại của tiến trình nền vừa lỗi, mỗi tiến trình một khóa `{ failures, retryAt }`: tiến trình chưa tới `retryAt` thì không đến hạn, nên tiến trình khác trong chuỗi (nhất là Giữ phiên đứng cuối) vẫn chạy thay vì bị một tiến trình lỗi liên tục chặn mãi.
 * Khoảng chờ nhân đôi mỗi lần lỗi liền nhau, từ `SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES` tới trần `SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES`; chạy xong thì xóa khóa.
 */
FbmSync.SCHEDULE_RETRY_KEYS = { customerFull: 'FBM_SYNC_RETRY_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_RETRY_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_RETRY_DETAIL_SCAN', heartbeat: 'FBM_SYNC_RETRY_HEARTBEAT' };
/** Cursor Vòng xoay: số CUS của khách cuối cùng đã ghi xong giao dịch (09/02 "Chuỗi trong một lần hỏi" mục 7 và 9); `-1` khi chưa có, phiên bắt đầu từ khách số nhỏ nhất. Giá trị kiểu cũ (khóa trang FBM) không có `cus` nên cũng là `-1`. */
FbmSync.detailCursorRead = function () {
  var parsed = FbmSync.documentPropertyJson(FbmSync.DETAIL_CURSOR_KEY, 'cursor Vòng xoay'), cus = parsed ? Number(parsed.cus) : NaN;
  return isFinite(cus) && cus >= 0 ? Math.floor(cus) : -1;
};
FbmSync.detailCursorWrite = function (cus) {
  FbmSync.propertyJsonWrite(FbmSync.DETAIL_CURSOR_KEY, { cus: Math.floor(Number(cus)), at: Date.now() });
};
/** Tên tiến trình trong câu báo lỗi và câu xác nhận, đúng nhãn ở `Cài đặt phiên` (09/02 Phần 3). */
FbmSync.SCHEDULE_LABELS = { heartbeat: 'Giữ phiên FBM', customerFull: 'Quét nhanh', activityFull: 'Lấy toàn bộ giao dịch', detail: 'Vòng xoay giao dịch' };
/** Loại quét nền luôn quét đẩy dù dấu lần đẩy sạch còn khớp: lưới an toàn cho sửa Sheet mà trigger không chạy nên sổ nạp lại không tăng (chủ dự án chốt Quét nhanh 2026-10-19). Lượt tay luôn quét. */
FbmSync.PUSH_GATE_BYPASS_SCANS = ['full'];
FbmSync.PUSH_GATE_CLOSED_TRACE = 'Bỏ qua kiểm dữ liệu ShinCRM và chặng đẩy: từ lần đẩy sạch trước không có gì đổi.';
/** Dòng `Mức quét` của lượt Giữ phiên có đẩy; `Chiều chạy` lấy theo chiều lịch nền (chủ dự án chốt 2026-10-20). */
FbmSync.KEEPALIVE_SCAN_LABEL = 'Giữ phiên FBM (chỉ đẩy bản ghi vừa sửa)';
/** Kiểu quét của lượt mà mỗi tiến trình nền mở (Giữ phiên là lượt `keepalive`: chỉ đếm khách, hoặc đẩy bản ghi vừa sửa khi cổng chặng đẩy mở). */
FbmSync.SCHEDULE_SCANS = { customerFull: 'full', activityFull: 'activity_bulk', detail: 'detail', heartbeat: 'keepalive' };

/** Sổ tiến trình: mỗi tiến trình `{ doneAt, failures, retryAt }` đọc từ khóa chạy xong và khóa thử lại. Đọc một lần mỗi lời gọi rồi truyền cho các công cụ tính. */
FbmSync.processBookRead = function () {
  var props = FbmSync.props(), book = {};
  Object.keys(FbmSync.SCHEDULE_DONE_KEYS).forEach(function (kind) {
    var retry = FbmSync.documentPropertyJson(FbmSync.SCHEDULE_RETRY_KEYS[kind], 'lần thử lại của ' + FbmSync.SCHEDULE_LABELS[kind]) || {};
    book[kind] = { doneAt: Number(props.getProperty(FbmSync.SCHEDULE_DONE_KEYS[kind]) || 0), failures: Math.max(0, Math.floor(Number(retry.failures) || 0)), retryAt: Math.max(0, Number(retry.retryAt) || 0) };
  });
  return book;
};
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
  return Object.keys(FbmSync.SCHEDULE_DONE_KEYS).filter(function (kind) {
    return schedule[kind].enabled && FbmSync.processDueAt(kind, schedule, book) <= now && !(pollAt && book[kind].doneAt >= pollAt);
  }).sort(function (a, b) { return schedule[a].priority - schedule[b].priority; });
};
/** Số phút chờ trước lần thử lại thứ `failures` (lỗi liền nhau): nhân đôi từ `SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES` tới trần `SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES`. */
FbmSync.retryDelay = function (failures) {
  var base = Number(SETTINGS.FBM_SCHEDULE_RETRY_BASE_MINUTES), cap = Number(SETTINGS.FBM_SCHEDULE_RETRY_MAX_MINUTES);
  return Math.min(cap, base * Math.pow(2, Math.min(Math.max(1, failures) - 1, 30)));
};
/**
 * Ghi kết quả một lượt của tiến trình nền vào sổ: `done` ghi giờ chạy xong và bỏ lần thử lại; `failed` dời giờ thử lại của riêng tiến trình đó (không ghi giờ chạy xong, nên tới hạn là chạy lại). Trả `{ failures, minutes }` để người điều phối ghi Log.
 * Chỉ ghi khi tiến trình chạy hết lượt hoặc lượt đã đóng lỗi: lượt hỏng giữa chừng không ghi gì nên tiến trình vẫn quá hạn và lần hỏi sau chạy lại.
 */
FbmSync.processBookMark = function (kind, outcome, now, book) {
  var at = Number(now), entry = book[kind];
  if (outcome === 'done') {
    FbmSync.propertyJsonWrite(FbmSync.SCHEDULE_DONE_KEYS[kind], at);
    if (entry.failures || entry.retryAt) { FbmSync.propertyJsonWrite(FbmSync.SCHEDULE_RETRY_KEYS[kind], null); }
    return { failures: 0, minutes: 0 };
  }
  var failures = entry.failures + 1, minutes = FbmSync.retryDelay(failures);
  FbmSync.propertyJsonWrite(FbmSync.SCHEDULE_RETRY_KEYS[kind], { failures: failures, retryAt: at + minutes * 60 * 1000 });
  return { failures: failures, minutes: minutes };
};
/** Dòng vết của lịch nền: chỉ ra Sheet `Log` khi `LOG_TRACE` phủ `fbm_sync`, để biết mỗi lần Extension hỏi GAS đã quyết gì. */
FbmSync.scheduleTrace = function (action, reason, detail) {
  logTrace({ source: 'fbm_sync', action: action, outcome: 'trace', reason: reason, detail: detail || {} });
};
/** Câu "sớm nhất là X, còn N phút" cho dòng vết lần hỏi chưa có việc. */
FbmSync.scheduleNextText = function (now, schedule, book) {
  var best = '', bestAt = 0;
  Object.keys(FbmSync.SCHEDULE_DONE_KEYS).forEach(function (kind) {
    var at = FbmSync.processDueAt(kind, schedule, book);
    if (schedule[kind].enabled && (!best || at < bestAt)) { best = kind; bestAt = at; }
  });
  return best ? 'sớm nhất là ' + FbmSync.SCHEDULE_LABELS[best] + ', còn ' + Math.max(0, Math.ceil((bestAt - now) / 60000)) + ' phút' : 'không có tiến trình nào đang bật';
};
FbmSync.scheduleNextAt = function (schedule, book) {
  var times = Object.keys(FbmSync.SCHEDULE_DONE_KEYS).filter(function (kind) { return schedule[kind].enabled; }).map(function (kind) { return FbmSync.processDueAt(kind, schedule, book); });
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
