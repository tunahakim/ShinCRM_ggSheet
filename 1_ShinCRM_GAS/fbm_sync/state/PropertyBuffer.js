/**
 * Phần riêng của đồng bộ FBM trên cửa kho dùng chung `server/state/DocumentStore.js`.
 *
 * Luật kho (bản đọc theo lần gọi, nạp cả kho một lần, bỏ bản đọc khi lấy khóa) nằm ở `DocumentStore.js`. Phần riêng ở đây:
 * - Trong khóa điều phối, ghi qua `FbmSync.props()` chỉ chờ và được ghi gộp một lần trước khi nhả khóa, nên lượt khác chỉ thấy bản hoàn chỉnh. Ngoài khóa thì ghi ngay.
 * - Hash chờ xác nhận (ghi trước khi gửi lệnh ghi FBM) vẫn bền trước khi Extension gửi lệnh, vì kho được ghi trước khi nhả khóa và trước khi GAS trả response.
 * - Ghi gộp hỏng thì ghi Log kèm runId/phase/cursor của state còn trong kho để biết phiên nào kẹt.
 * Trace là chẩn đoán: gom trong bộ nhớ suốt lần gọi và ghi một lần ở `propertyBufferEnd`; ghi trace hỏng không làm hỏng nghiệp vụ.
 * Bản chụp Sheet sống cùng phạm vi lần gọi: Customer/Activity/Category đọc một lần mỗi lần gọi; cửa ghi `FbmSync.sheetSave` bỏ bản chụp của thực thể vừa ghi, nên không có đường đọc lại dữ liệu cũ sau khi ghi.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.propertyBuffer = { callDepth: 0, snapshotDepth: 0, tracePending: [] };

/** Bản chụp Sheet của phạm vi hiện tại; khóa là `customer`, `activity` hoặc `category`. */
FbmSync.sheetCache = {};

FbmSync.propertyBufferActive = function () { return documentStoreActive(); };

/** Đọc Sheet qua bản chụp: trong phạm vi một lần gọi (hoặc `withLocalSnapshot`) chỉ đọc một lần; ngoài phạm vi thì đọc mới mỗi lần. */
FbmSync.sheetCacheRead = function (key, read) {
  if (!FbmSync.propertyBufferActive() && FbmSync.propertyBuffer.snapshotDepth === 0) { return read(); }
  if (!Object.prototype.hasOwnProperty.call(FbmSync.sheetCache, key)) { FbmSync.sheetCache[key] = read(); }
  return FbmSync.sheetCache[key];
};
FbmSync.sheetCacheDrop = function (key) { delete FbmSync.sheetCache[key]; };

/**
 * Bản chụp cho khối chỉ đọc chạy ngoài một lần gọi (preflight gọi từ hàm dò, test): preflight gọi `readLocal` ở nhiều kiểm tra, mỗi lần đọc nghìn dòng mất vài giây và từng làm lượt khởi động vượt hạn chờ 30 giây của Sidebar.
 * Trong một lần gọi thì bản chụp đã có sẵn, hàm này không làm gì thêm.
 */
FbmSync.withLocalSnapshot = function (fn) {
  var buffer = FbmSync.propertyBuffer, outer = !FbmSync.propertyBufferActive() && buffer.snapshotDepth === 0;
  if (outer) { FbmSync.sheetCache = {}; }
  buffer.snapshotDepth += 1;
  try { return fn(); } finally {
    buffer.snapshotDepth -= 1;
    if (outer) { FbmSync.sheetCache = {}; }
  }
};

/** Kho mà code đồng bộ dùng: trong khóa điều phối ghi chờ tới lúc nhả khóa; ngoài khóa như `documentProps()`. */
FbmSync.props = function () { return documentPropsDeferred(); };

/** Ghi gộp hỏng: thêm một dòng Log mang runId/phase/cursor (đọc thêm kho một lần chỉ ở nhánh hỏng) rồi trả lỗi có mã để bên gọi ném. */
FbmSync.propertyFlushFailed = function (err) {
  var failure = new Error('Không thể lưu state đồng bộ vào DocumentProperties.');
  failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
  var stored = null;
  try { stored = JSON.parse(documentStoreReal().getProperty(FbmSync.STATE_KEY) || 'null'); } catch (ignoreStored) { stored = null; }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_write', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: failure.code, detail: { context: 'flush', error: String(err && err.message || err), runId: stored && String(stored.runId || ''), phase: stored && String(stored.phase || ''), cursor: stored && stored.cursor || {} } }); }
  return failure;
};

/**
 * Bọc phần việc chạy trong khóa điều phối. Khóa không tái nhập nhưng vẫn đếm độ sâu để lỡ lồng thì chỉ lớp ngoài cùng ghi.
 * Lấy khóa thì bỏ bản chụp Sheet cùng bản đọc kho, vì lượt khác có thể vừa ghi Sheet trong lúc chờ khóa.
 * Phần việc ném lỗi mà ghi gộp cũng hỏng thì giữ lỗi gốc, lỗi ghi chỉ thêm một dòng Log.
 */
FbmSync.withPropertyBuffer = function (work) {
  if (DOCUMENT_STORE.lockDepth === 0) { FbmSync.sheetCache = {}; }
  return withDocumentStoreDeferred(work, FbmSync.propertyFlushFailed);
};

FbmSync.traceKey = function (item) { return [item.stage, item.runId, item.requestId, item.at].join('|'); };
FbmSync.traceGathering = function () { return FbmSync.propertyBuffer.callDepth > 0; };

/** Mở phạm vi đồng bộ cho một lần gọi (kho dùng chung do `runEntryPoint` mở trước); trả `true` nếu đây là lớp ngoài cùng. */
FbmSync.propertyBufferBegin = function () {
  var buffer = FbmSync.propertyBuffer;
  documentStoreBegin();
  if (buffer.callDepth === 0) { buffer.tracePending = []; FbmSync.sheetCache = {}; }
  buffer.callDepth += 1;
  return buffer.callDepth === 1;
};

/** Đóng phạm vi: ghi trace đã gom bằng một lần đọc và một lần ghi, rồi bỏ bản chụp Sheet. */
FbmSync.propertyBufferEnd = function () {
  var buffer = FbmSync.propertyBuffer;
  if (buffer.callDepth > 1) { buffer.callDepth -= 1; documentStoreEnd(); return 0; }
  var pending = buffer.tracePending, stored = 0;
  buffer.tracePending = [];
  // Ghi trace khi kho còn mở để phần đọc dùng bản đã nạp; ngoài khóa nên lệnh ghi đi thẳng xuống kho.
  try { stored = pending.length ? FbmSync.traceStore(pending) : 0; } finally {
    buffer.callDepth = 0;
    FbmSync.sheetCache = {};
    documentStoreEnd();
  }
  return stored;
};
