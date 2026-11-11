/**
 * Chuyển một lần các khóa kho đời cũ sang sổ tiến trình `FBM_SYNC_PROCESS_BOOK_V1` và kho kết nối `FBM_CONNECTION_V1`, rồi xóa khóa cũ, khóa bỏ dùng và kho làm việc còn sót. Chạy ngay sau lần đẩy code đọc kho mới (`node tests/gas.js fbmStoresMigrate --push` trên Sheet DEV): từ lúc đẩy tới lúc chạy, cổng đọc kho mới ném `FBM_STORES_MIGRATION_PENDING`, đồng bộ dừng chứ không đọc thành rỗng.
 *
 * Thứ tự: lần cầm khóa điều phối thứ nhất đọc khóa cũ theo đúng nghĩa của code cũ, dựng giá trị mới và ghi; nhả khóa thì ghi gộp xuống kho; đọc lại từ kho thật so với giá trị đã dựng; khớp mới xóa trong lần cầm khóa thứ hai. Hỏng ở bước nào thì ném, khóa cũ còn nguyên. Kho mới đã có thì không ghi đè (code mới đã ghi nó, khóa cũ là bản cũ hơn), chỉ xóa khóa cũ. Chạy lại không đổi gì.
 * Đang có lượt chạy thì chặn: xóa kho làm việc giữa lượt là mất tiến độ của lượt đó.
 *
 * Tệp này là công cụ một lần: xóa cùng `server/dev/` trước khi đưa dữ liệu thật vào production, sau khi tệp production đã chạy nó.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa cũ của sổ tiến trình theo tiến trình; DONE là số mili giây chạy xong, RETRY là `{ failures, retryAt }`. */
var FBM_STORES_OLD_DONE = { customerFull: 'FBM_SYNC_DONE_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_DONE_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_DONE_DETAIL_SCAN', heartbeat: 'FBM_SYNC_DONE_HEARTBEAT' };
var FBM_STORES_OLD_RETRY = { customerFull: 'FBM_SYNC_RETRY_CUSTOMER_FULL_SCAN', activityFull: 'FBM_SYNC_RETRY_ACTIVITY_FULL_SCAN', detail: 'FBM_SYNC_RETRY_DETAIL_SCAN', heartbeat: 'FBM_SYNC_RETRY_HEARTBEAT' };
/** Khóa không còn code nào đọc: dấu lần đẩy sạch đời cũ (thay bằng `FBM_SYNC_PUSH_GATE_V1`); sổ chờ xác nhận (trạng thái `đang đẩy`/`đã đẩy chờ xác nhận` trên dòng thay sổ, hash đã gửi nằm trong dấu trang của chặng). */
var FBM_STORES_RETIRED_KEYS = ['FBM_SYNC_PUSH_CLEAN_V1', 'FBM_SYNC_PENDING_PUSHES_V1'];

/** Công cụ tính (thuần): `stored` là khóa cũ → giá trị đã đọc (DONE là chuỗi số, khóa JSON đã parse). Trả `{ book, connection }`; phần không còn khóa cũ nào thì `null`. */
function fbmStoresMigratePlan(stored) {
  var has = function (key) { return stored[key] !== undefined; }, plan = { book: null, connection: null };
  if (FbmSync.PROCESS_BOOK_OLD_KEYS.some(has)) {
    var raw = {};
    FbmSync.PROCESS_KINDS.forEach(function (kind) {
      var retry = stored[FBM_STORES_OLD_RETRY[kind]] || {};
      raw[kind] = { doneAt: Number(stored[FBM_STORES_OLD_DONE[kind]] || 0), failures: Number(retry.failures), retryAt: Number(retry.retryAt) };
    });
    var baseline = stored.FBM_SYNC_CUSTOMER_BASELINE_V1, cursor = stored.FBM_SYNC_DETAIL_CURSOR_V1;
    raw.customerFull.baseline = baseline ? Number(baseline.total) : null;
    raw.detail.cursor = cursor ? Number(cursor.cus) : -1;
    plan.book = FbmSync.processBookShape(raw);
  }
  if (FbmSync.CONNECTION_OLD_KEYS.some(has)) {
    plan.connection = { binding: stored.FBM_SYNC_BINDING_V1 || {}, clearedFrom: stored.FBM_SYNC_BINDING_CLEAR_V1 || {} };
  }
  return plan;
}

/** Công cụ đọc: khóa cũ còn trong kho. Khóa JSON hỏng thì `documentPropertyJson` ném `DOCUMENT_PROPERTY_CORRUPT` kèm tên khóa, chưa chuyển gì. */
function fbmStoresMigrateRead() {
  var props = FbmSync.props(), stored = {};
  FbmSync.PROCESS_BOOK_OLD_KEYS.concat(FbmSync.CONNECTION_OLD_KEYS).forEach(function (key) {
    var raw = props.getProperty(key);
    if (raw === null || raw === undefined || raw === '') { return; }
    stored[key] = /^FBM_SYNC_DONE_/.test(key) ? raw : FbmSync.documentPropertyJson(key, 'kho FBM đời cũ');
  });
  return stored;
}

/** Ném khi đang có lượt chạy; gọi trong khóa điều phối. */
function fbmStoresMigrateIdle() {
  var phase = String(FbmSync.stateRead().phase || '');
  if (FbmSync.ACTIVE_PHASES.indexOf(phase) >= 0) { var busy = new Error('Đang có lượt đồng bộ ở pha "' + phase + '"; dừng lượt rồi chạy lại hàm chuyển. Chưa chuyển gì.'); busy.code = 'FBM_STORES_MIGRATE_RUN_ACTIVE'; throw busy; }
}

/** Kết quả `withOrchestrationLock` bận thì ném, không coi như đã chạy. */
function fbmStoresMigrateLocked(work) {
  var result = FbmSync.withOrchestrationLock(work);
  if (result && result.code === 'BUSY') { var busy = new Error(result.message); busy.code = 'FBM_STORES_MIGRATE_BUSY'; throw busy; }
  return result;
}

function fbmStoresMigrate() {
  return runEntryPoint('fbmStoresMigrate', 'fbm_sync', function () {
    // Lần cầm khóa thứ nhất: đọc, dựng, ghi phần kho mới chưa có. Ghi gộp xuống kho khi nhả khóa.
    var first = fbmStoresMigrateLocked(function () {
      fbmStoresMigrateIdle();
      var props = FbmSync.props(), plan = fbmStoresMigratePlan(fbmStoresMigrateRead()), expected = {};
      if (plan.book && props.getProperty(FbmSync.PROCESS_BOOK_KEY) === null) {
        FbmSync.processBookWrite(plan.book);
        expected[FbmSync.PROCESS_BOOK_KEY] = props.getProperty(FbmSync.PROCESS_BOOK_KEY);
      }
      if (plan.connection && props.getProperty(FbmSync.CONNECTION_KEY) === null) {
        FbmSync.connectionWrite(plan.connection);
        expected[FbmSync.CONNECTION_KEY] = props.getProperty(FbmSync.CONNECTION_KEY);
      }
      return { expected: expected, book: plan.book, connection: plan.connection };
    });

    // Đọc lại từ kho thật, không tin bản đọc trong bộ nhớ của lần gọi.
    documentStoreRefresh();
    var real = documentStoreReal(), written = Object.keys(first.expected);
    var mismatched = written.filter(function (key) { return real.getProperty(key) !== first.expected[key]; });
    if (mismatched.length) { var differ = new Error('Đọc lại kho không khớp ở ' + mismatched.join(', ') + '; khóa cũ giữ nguyên, chạy lại hàm chuyển.'); differ.code = 'FBM_STORES_MIGRATE_VERIFY_FAILED'; differ.detail = { keys: mismatched }; throw differ; }

    // Lần cầm khóa thứ hai: xóa khóa cũ, khóa bỏ dùng và kho làm việc còn sót.
    var second = fbmStoresMigrateLocked(function () {
      fbmStoresMigrateIdle();
      var props = FbmSync.props();
      var deleted = FbmSync.PROCESS_BOOK_OLD_KEYS.concat(FbmSync.CONNECTION_OLD_KEYS, FBM_STORES_RETIRED_KEYS).filter(function (key) { return props.getProperty(key) !== null; });
      deleted.forEach(function (key) { FbmSync.propertyJsonWrite(key, null); });
      return { deleted: deleted, workStores: FbmSync.workStoreClear() };
    });

    var report = written.length || second.deleted.length || second.workStores
      ? 'Đã ghi ' + (written.join(', ') || 'không khóa mới nào') + '; xóa ' + second.deleted.length + ' khóa cũ và ' + second.workStores + ' khóa kho làm việc còn sót.'
      : 'Không còn khóa kho đời cũ; không có gì để chuyển.';
    logEvent({ source: 'fbm_sync', action: 'fbmStoresMigrate', outcome: LOG_OK, reason: report, detail: { written: written, deleted: second.deleted, workStores: second.workStores } });
    return { ok: true, report: [report], written: written, deleted: second.deleted, workStores: second.workStores, book: first.book, connection: first.connection ? { binding: { userId: String(first.connection.binding.userId || ''), accountName: String(first.connection.binding.accountName || '') }, clearedFrom: { userId: String(first.connection.clearedFrom.userId || '') } } : null };
  });
}
