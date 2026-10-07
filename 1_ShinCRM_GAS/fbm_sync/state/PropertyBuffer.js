/**
 * Cửa duy nhất của module đồng bộ FBM vào DocumentProperties, kèm bộ đệm theo một lần gọi GAS (đợt 1 bước A, tài liệu refactor mục 18).
 *
 * Vì sao có: đo ngày 2026-10-07 mỗi lần gọi đọc/ghi kho 83 lần, phần lớn là đọc lại thứ vừa đọc hoặc vừa ghi, mỗi lần 8–50 ms.
 * Luật:
 * - Bộ đệm chỉ sống trong một lần gọi (`runEntryPoint` mở/đóng) hoặc trong khóa điều phối; ngoài đó `FbmSync.props()` là kho thật, đọc/ghi thẳng như trước.
 * - Trong khóa, ghi chỉ đánh dấu chờ và được ghi gộp một lần trước khi nhả khóa, nên lượt khác chỉ thấy bản hoàn chỉnh. Ngoài khóa thì ghi ngay.
 * - Lần đọc đầu tiên trong bộ đệm lấy cả kho bằng một lần `getProperties()`; các khóa sau đọc từ bản đó (khóa không có nghĩa là chưa có).
 * - Lấy khóa thì bỏ bộ đệm để đọc lại từ kho, vì lượt khác có thể vừa ghi trong lúc chờ khóa. Nhả khóa sau khi ghi gộp thành công thì giữ bộ đệm, vì nó đúng bằng kho vừa ghi; phần còn lại của lần gọi chỉ đọc để dựng trạng thái.
 * - Bộ đệm giữ chuỗi chứ không giữ object, nên người đọc sửa object mà không ghi thì không làm bẩn bộ đệm.
 * Cạm bẫy:
 * - Mọi code đồng bộ FBM phải lấy kho qua `FbmSync.props()`; gọi thẳng `PropertiesService` thì đọc trượt bộ đệm và thấy giá trị cũ. Core ShinCRM (IdGate, DirtyState, Log) dùng khóa riêng nên không đi qua đây.
 * - GAS bị Google cắt giữa chừng (trần 6 phút) thì `finally` không chạy, kho quay về lúc lấy khóa; chấp nhận vì cửa ghi idempotent, lượt sau chạy lại đúng khách đang xử lý.
 * - Hash chờ xác nhận (ghi trước khi gửi lệnh ghi FBM) vẫn bền trước khi Extension gửi lệnh, vì kho được ghi trước khi nhả khóa và trước khi GAS trả response.
 * Trace là chẩn đoán: gom trong bộ nhớ suốt lần gọi và ghi một lần ở `propertyBufferEnd`; ghi trace hỏng không làm hỏng nghiệp vụ.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.propertyBuffer = { lockDepth: 0, callDepth: 0, loaded: false, values: {}, dirty: {}, tracePending: [] };

FbmSync.propertyStore = function () { return PropertiesService.getDocumentProperties(); };
FbmSync.propertyBufferActive = function () { var buffer = FbmSync.propertyBuffer; return buffer.lockDepth > 0 || buffer.callDepth > 0; };
FbmSync.propertyBufferClear = function () { var buffer = FbmSync.propertyBuffer; buffer.loaded = false; buffer.values = {}; buffer.dirty = {}; };

/** Nạp cả kho một lần; giá trị đang chờ ghi trong bộ đệm được giữ đè lên bản vừa đọc. Kho giả trong test có thể thiếu `getProperties`. */
FbmSync.propertyBufferLoad = function () {
  var buffer = FbmSync.propertyBuffer, store = FbmSync.propertyStore();
  if (buffer.loaded || typeof store.getProperties !== 'function') { return false; }
  var all = store.getProperties() || {};
  Object.keys(buffer.values).forEach(function (key) { all[key] = buffer.values[key]; });
  buffer.values = all;
  buffer.loaded = true;
  return true;
};

/** Kho mà code đồng bộ dùng: trong một lần gọi là kho có bộ đệm, ngoài đó là kho thật. */
FbmSync.props = function () { return FbmSync.propertyBufferActive() ? FbmSync.bufferedProps : FbmSync.propertyStore(); };

/** Giá trị `null` trong `values` nghĩa là khóa chưa có hoặc đã xóa. Lỗi dịch vụ vẫn ném nguyên như kho thật. */
FbmSync.bufferedProps = {
  getProperty: function (key) {
    var buffer = FbmSync.propertyBuffer;
    if (Object.prototype.hasOwnProperty.call(buffer.values, key)) { return buffer.values[key]; }
    if (buffer.loaded || FbmSync.propertyBufferLoad()) { return Object.prototype.hasOwnProperty.call(buffer.values, key) ? buffer.values[key] : null; }
    var raw = FbmSync.propertyStore().getProperty(key);
    buffer.values[key] = raw;
    return raw;
  },
  setProperty: function (key, value) {
    var buffer = FbmSync.propertyBuffer, text = String(value);
    if (buffer.lockDepth === 0) { FbmSync.propertyStore().setProperty(key, text); } else { buffer.dirty[key] = true; }
    buffer.values[key] = text;
    return this;
  },
  deleteProperty: function (key) {
    var buffer = FbmSync.propertyBuffer;
    if (buffer.lockDepth === 0) { FbmSync.propertyStore().deleteProperty(key); } else { buffer.dirty[key] = true; }
    buffer.values[key] = null;
    return this;
  },
  setProperties: function (values) {
    var self = this;
    Object.keys(values || {}).forEach(function (key) { self.setProperty(key, values[key]); });
    return this;
  },
  getProperties: function () {
    var buffer = FbmSync.propertyBuffer, all = {};
    if (!buffer.loaded) { FbmSync.propertyBufferLoad(); }
    Object.keys(buffer.values).forEach(function (key) { if (buffer.values[key] !== null) { all[key] = buffer.values[key]; } });
    return all;
  }
};

/** Ghi mọi khóa chờ ghi: một lần `setProperties`, cộng một lần xóa cho mỗi khóa bị xóa. */
FbmSync.propertyBufferFlush = function () {
  var buffer = FbmSync.propertyBuffer, keys = Object.keys(buffer.dirty), batch = {}, removed = [];
  if (!keys.length) { return 0; }
  keys.forEach(function (key) { if (buffer.values[key] === null) { removed.push(key); } else { batch[key] = buffer.values[key]; } });
  var store = FbmSync.propertyStore();
  try {
    // Kho giả trong test có thể thiếu `setProperties`; kho thật của Google luôn có.
    if (typeof store.setProperties === 'function') { if (Object.keys(batch).length) { store.setProperties(batch, false); } } else { Object.keys(batch).forEach(function (key) { store.setProperty(key, batch[key]); }); }
    removed.forEach(function (key) { store.deleteProperty(key); });
  } catch (err) {
    var failure = new Error('Không thể lưu state đồng bộ vào DocumentProperties.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED';
    // Log mang runId/phase/cursor của state còn nằm trong kho để biết phiên nào kẹt; đọc thêm một lần chỉ ở nhánh hỏng.
    var stored = null;
    try { stored = JSON.parse(store.getProperty(FbmSync.STATE_KEY) || 'null'); } catch (ignoreStored) { stored = null; }
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'state_write', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: failure.code, detail: { keys: keys, context: 'flush', error: String(err && err.message || err), runId: stored && String(stored.runId || ''), phase: stored && String(stored.phase || ''), cursor: stored && stored.cursor || {} } }); }
    throw failure;
  }
  buffer.dirty = {};
  return keys.length;
};

/**
 * Bọc phần việc chạy trong khóa điều phối. Khóa không tái nhập nhưng vẫn đếm độ sâu để lỡ lồng thì chỉ lớp ngoài cùng ghi.
 * Phần việc ném lỗi mà ghi gộp cũng hỏng thì giữ lỗi gốc, lỗi ghi chỉ thêm một dòng Log (ghi trong `propertyBufferFlush`).
 */
FbmSync.withPropertyBuffer = function (work) {
  var buffer = FbmSync.propertyBuffer, failed = false;
  if (buffer.lockDepth === 0) { FbmSync.propertyBufferClear(); }
  buffer.lockDepth += 1;
  try { return work(); } catch (error) { failed = true; throw error; } finally {
    buffer.lockDepth -= 1;
    if (buffer.lockDepth === 0) {
      try { FbmSync.propertyBufferFlush(); } catch (flushError) { FbmSync.propertyBufferClear(); if (!failed) { throw flushError; } }
    }
  }
};

FbmSync.traceKey = function (item) { return [item.stage, item.runId, item.requestId, item.at].join('|'); };
FbmSync.traceGathering = function () { return FbmSync.propertyBuffer.callDepth > 0; };

/** Mở bộ đệm cho một lần gọi; trả `true` nếu đây là lớp ngoài cùng. */
FbmSync.propertyBufferBegin = function () {
  var buffer = FbmSync.propertyBuffer;
  if (buffer.callDepth === 0) { buffer.tracePending = []; if (buffer.lockDepth === 0) { FbmSync.propertyBufferClear(); } }
  buffer.callDepth += 1;
  return buffer.callDepth === 1;
};

/** Đóng bộ đệm của lần gọi: ghi trace đã gom bằng một lần đọc và một lần ghi, rồi bỏ bộ đệm để lần gọi sau đọc lại từ kho. */
FbmSync.propertyBufferEnd = function () {
  var buffer = FbmSync.propertyBuffer;
  if (buffer.callDepth > 1) { buffer.callDepth -= 1; return 0; }
  var pending = buffer.tracePending, stored = 0;
  buffer.tracePending = [];
  // Ghi trace khi bộ đệm còn mở để phần đọc dùng bản đã nạp; ngoài khóa nên lệnh ghi đi thẳng xuống kho.
  try { stored = pending.length ? FbmSync.traceStore(pending) : 0; } finally {
    buffer.callDepth = 0;
    if (buffer.lockDepth === 0) { FbmSync.propertyBufferClear(); }
  }
  return stored;
};
