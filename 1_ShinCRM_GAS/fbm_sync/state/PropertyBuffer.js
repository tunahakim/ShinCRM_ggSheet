/**
 * Phần riêng của đồng bộ FBM trên cửa kho dùng chung `server/state/DocumentStore.js`.
 *
 * Luật kho (bản đọc theo lần gọi, nạp cả kho một lần, bỏ bản đọc khi lấy khóa) nằm ở `DocumentStore.js`. Phần riêng ở đây:
 * - Trong khóa điều phối, ghi qua `FbmSync.props()` chỉ chờ và được ghi gộp một lần trước khi nhả khóa, nên lượt khác chỉ thấy bản hoàn chỉnh. Ngoài khóa thì ghi ngay.
 * - Hash chờ xác nhận (ghi trước khi gửi lệnh ghi FBM) vẫn bền trước khi Extension gửi lệnh, vì kho được ghi trước khi nhả khóa và trước khi GAS trả response.
 * - Ghi gộp hỏng thì ghi Log kèm runId/phase/cursor của state còn trong kho để biết phiên nào kẹt.
 * Trace là chẩn đoán: gom trong bộ nhớ suốt lần gọi và ghi một lần ở `propertyBufferEnd`; ghi trace hỏng không làm hỏng nghiệp vụ.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.propertyBuffer = { callDepth: 0, tracePending: [] };

FbmSync.propertyBufferActive = function () { return documentStoreActive(); };

/**
 * Mở một lần gọi cho khối chỉ đọc chạy ngoài `runEntryPoint` (preflight gọi từ hàm dò, test), để các lần `readLocal` dùng chung bản đọc Sheet: preflight gọi `readLocal` ở nhiều kiểm tra, mỗi lần đọc nghìn dòng mất vài giây và từng làm lượt khởi động vượt hạn chờ 30 giây của Sidebar.
 * Trong một lần gọi thì bản đọc đã có sẵn; mở lồng chỉ tăng độ sâu.
 */
FbmSync.withLocalSnapshot = function (fn) {
  documentStoreBegin();
  try { return fn(); } finally { documentStoreEnd(); }
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
 * Lấy khóa thì bỏ bản đọc kho cùng bản đọc Sheet (`documentStoreRefresh`), vì lượt khác có thể vừa ghi trong lúc chờ khóa.
 * Phần việc ném lỗi mà ghi gộp cũng hỏng thì giữ lỗi gốc, lỗi ghi chỉ thêm một dòng Log.
 */
FbmSync.withPropertyBuffer = function (work) {
  return withDocumentStoreDeferred(work, FbmSync.propertyFlushFailed);
};

FbmSync.traceKey = function (item) { return [item.stage, item.runId, item.requestId, item.at].join('|'); };
FbmSync.traceGathering = function () { return FbmSync.propertyBuffer.callDepth > 0; };

/** Mở phạm vi đồng bộ cho một lần gọi (kho dùng chung do `runEntryPoint` mở trước); trả `true` nếu đây là lớp ngoài cùng. */
FbmSync.propertyBufferBegin = function () {
  var buffer = FbmSync.propertyBuffer;
  documentStoreBegin();
  if (buffer.callDepth === 0) { buffer.tracePending = []; }
  buffer.callDepth += 1;
  return buffer.callDepth === 1;
};

/** Đóng phạm vi: ghi trace đã gom bằng một lần đọc và một lần ghi. */
FbmSync.propertyBufferEnd = function () {
  var buffer = FbmSync.propertyBuffer;
  if (buffer.callDepth > 1) { buffer.callDepth -= 1; documentStoreEnd(); return 0; }
  var pending = buffer.tracePending, stored = 0;
  buffer.tracePending = [];
  // Ghi trace khi kho còn mở để phần đọc dùng bản đã nạp; ngoài khóa nên lệnh ghi đi thẳng xuống kho.
  try { stored = pending.length ? FbmSync.traceStore(pending) : 0; } finally {
    buffer.callDepth = 0;
    documentStoreEnd();
  }
  return stored;
};
