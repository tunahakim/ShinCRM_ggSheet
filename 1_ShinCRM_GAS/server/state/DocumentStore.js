/**
 * Cửa duy nhất của cả repo vào DocumentProperties và vào khóa, kèm bản đọc trong bộ nhớ theo một lần gọi GAS.
 *
 * Vì sao có: mỗi lệnh gọi kho mất 10–50 ms, trong khi một lần ghi Sheet từng đọc lại cùng các khóa hàng trăm lần.
 * Luật:
 * - Bản đọc chỉ sống trong một lần gọi (`runEntryPoint` mở/đóng) hoặc trong khóa điều phối của đồng bộ; ngoài đó `documentProps()` là kho thật.
 * - Lần đọc đầu lấy cả kho bằng một `getProperties()`; khóa không có trong bản đó nghĩa là chưa có.
 * - `documentProps()` ghi thẳng xuống kho (write-through) rồi cập nhật bản đọc: lõi cần tín hiệu reload và bộ đếm mã nằm trong kho trước khi nhả khóa tài liệu.
 * - Chỉ đồng bộ FBM dùng kiểu ghi gộp (`documentPropsDeferred()` trong `withDocumentStoreDeferred`): ghi chờ và được ghi một lần trước khi nhả khóa điều phối, nên lượt khác chỉ thấy bản hoàn chỉnh.
 * - Vừa lấy được khóa (khóa tài liệu hoặc khóa điều phối) thì gọi `documentStoreRefresh()` để bỏ bản đọc: tiến trình khác có thể vừa ghi trong lúc chờ khóa; đọc-sửa-ghi trên bản cũ là mất tín hiệu của họ. Phần đang chờ ghi gộp được giữ.
 * - Bản đọc giữ chuỗi chứ không giữ object, nên người đọc sửa object mà không ghi thì không làm bẩn bản đọc.
 * Cạm bẫy: gọi thẳng `PropertiesService.getDocumentProperties()` ở chỗ khác là đọc trượt bản đọc và thấy giá trị cũ; test chặn việc này.
 * GAS bị cắt giữa chừng (trần 6 phút) thì `finally` không chạy, phần ghi gộp chưa ghi bị mất; chấp nhận vì cửa ghi FBM idempotent, lượt sau chạy lại đúng khách đang xử lý.
 */
var DOCUMENT_STORE = { lockDepth: 0, callDepth: 0, loaded: false, values: {}, dirty: {} };

function documentStoreReal() { return PropertiesService.getDocumentProperties(); }
function documentStoreActive() { return DOCUMENT_STORE.lockDepth > 0 || DOCUMENT_STORE.callDepth > 0; }
function documentStoreClear() { DOCUMENT_STORE.loaded = false; DOCUMENT_STORE.values = {}; DOCUMENT_STORE.dirty = {}; }

/** Bỏ bản đọc nhưng giữ phần đang chờ ghi gộp; lần đọc sau nạp lại kho thật rồi phủ phần chờ lên. */
function documentStoreRefresh() {
  var keep = {};
  Object.keys(DOCUMENT_STORE.dirty).forEach(function (key) { keep[key] = DOCUMENT_STORE.values[key]; });
  DOCUMENT_STORE.values = keep;
  DOCUMENT_STORE.loaded = false;
}

/** Cửa duy nhất để lấy khóa (khóa tài liệu hay khóa script): lấy được thì bỏ bản đọc ngay, nên không có chỗ nào lấy khóa mà quên đọc lại. Trả `false` khi hết giờ chờ. */
function documentStoreTryLock(lock, waitMs) {
  if (!lock.tryLock(waitMs)) { return false; }
  documentStoreRefresh();
  return true;
}

/** Như `documentStoreTryLock` nhưng hết giờ thì ném lỗi của Google (dùng ở chỗ vốn gọi `waitLock`). */
function documentStoreWaitLock(lock, waitMs) {
  lock.waitLock(waitMs);
  documentStoreRefresh();
}

/** Nạp cả kho một lần; giá trị đã có trong bản đọc (vừa ghi hoặc đang chờ ghi) được giữ đè lên. Kho giả trong test có thể thiếu `getProperties`. */
function documentStoreLoad() {
  var store = documentStoreReal();
  if (DOCUMENT_STORE.loaded || typeof store.getProperties !== 'function') { return false; }
  var all = store.getProperties() || {};
  Object.keys(DOCUMENT_STORE.values).forEach(function (key) { all[key] = DOCUMENT_STORE.values[key]; });
  DOCUMENT_STORE.values = all;
  DOCUMENT_STORE.loaded = true;
  return true;
}

/** Dựng mặt kho có bản đọc. `defer` = ghi chờ khi đang trong khóa điều phối; không thì ghi thẳng. Giá trị `null` trong bản đọc nghĩa là khóa chưa có hoặc đã xóa. */
function documentStoreFacade(defer) {
  function deferNow() { return defer && DOCUMENT_STORE.lockDepth > 0; }
  return {
    getProperty: function (key) {
      var values = DOCUMENT_STORE.values;
      if (Object.prototype.hasOwnProperty.call(values, key)) { return values[key]; }
      if (DOCUMENT_STORE.loaded || documentStoreLoad()) { return Object.prototype.hasOwnProperty.call(DOCUMENT_STORE.values, key) ? DOCUMENT_STORE.values[key] : null; }
      var raw = documentStoreReal().getProperty(key);
      DOCUMENT_STORE.values[key] = raw;
      return raw;
    },
    setProperty: function (key, value) {
      var text = String(value);
      if (deferNow()) { DOCUMENT_STORE.dirty[key] = true; } else { documentStoreReal().setProperty(key, text); delete DOCUMENT_STORE.dirty[key]; }
      DOCUMENT_STORE.values[key] = text;
      return this;
    },
    deleteProperty: function (key) {
      if (deferNow()) { DOCUMENT_STORE.dirty[key] = true; } else { documentStoreReal().deleteProperty(key); delete DOCUMENT_STORE.dirty[key]; }
      DOCUMENT_STORE.values[key] = null;
      return this;
    },
    /** Ghi thẳng thì gửi một lệnh cho cả khối thay vì một lệnh mỗi khóa. */
    setProperties: function (values) {
      var self = this;
      var keys = Object.keys(values || {});
      var store = documentStoreReal();
      if (deferNow() || typeof store.setProperties !== 'function') {
        keys.forEach(function (key) { self.setProperty(key, values[key]); });
        return this;
      }
      var texts = {};
      keys.forEach(function (key) { texts[key] = String(values[key]); });
      if (keys.length) { store.setProperties(texts, false); }
      keys.forEach(function (key) { DOCUMENT_STORE.values[key] = texts[key]; delete DOCUMENT_STORE.dirty[key]; });
      return this;
    },
    getProperties: function () {
      var all = {};
      if (!DOCUMENT_STORE.loaded) { documentStoreLoad(); }
      Object.keys(DOCUMENT_STORE.values).forEach(function (key) { if (DOCUMENT_STORE.values[key] !== null) { all[key] = DOCUMENT_STORE.values[key]; } });
      return all;
    }
  };
}

var DOCUMENT_STORE_THROUGH = documentStoreFacade(false);
var DOCUMENT_STORE_DEFERRED = documentStoreFacade(true);

/** Kho cho mọi code: trong một lần gọi là kho có bản đọc và ghi thẳng, ngoài đó là kho thật. */
function documentProps() { return documentStoreActive() ? DOCUMENT_STORE_THROUGH : documentStoreReal(); }

/** Kho cho đồng bộ FBM: như `documentProps()` nhưng trong khóa điều phối thì ghi chờ tới lúc nhả khóa. */
function documentPropsDeferred() { return documentStoreActive() ? DOCUMENT_STORE_DEFERRED : documentStoreReal(); }

/** Ghi mọi khóa chờ ghi: một lần `setProperties`, cộng một lần xóa cho mỗi khóa bị xóa. Lỗi ném nguyên để bên gọi (đồng bộ FBM) ghi Log theo ngữ cảnh của nó. */
function documentStoreFlush() {
  var keys = Object.keys(DOCUMENT_STORE.dirty), batch = {}, removed = [];
  if (!keys.length) { return 0; }
  keys.forEach(function (key) { if (DOCUMENT_STORE.values[key] === null) { removed.push(key); } else { batch[key] = DOCUMENT_STORE.values[key]; } });
  var store = documentStoreReal();
  // Kho giả trong test có thể thiếu `setProperties`; kho thật của Google luôn có.
  if (typeof store.setProperties === 'function') { if (Object.keys(batch).length) { store.setProperties(batch, false); } } else { Object.keys(batch).forEach(function (key) { store.setProperty(key, batch[key]); }); }
  removed.forEach(function (key) { store.deleteProperty(key); });
  DOCUMENT_STORE.dirty = {};
  return keys.length;
}

/**
 * Bọc phần việc chạy trong khóa điều phối của đồng bộ: ghi qua `documentPropsDeferred()` chờ tới lúc ra khỏi lớp ngoài cùng.
 * `onFlushError(error, failed)` do bên gọi cấp để ghi Log; phần việc đã ném lỗi thì lỗi ghi gộp không thay lỗi gốc.
 */
function withDocumentStoreDeferred(work, onFlushError) {
  var failed = false;
  if (DOCUMENT_STORE.lockDepth === 0) { documentStoreRefresh(); }
  DOCUMENT_STORE.lockDepth += 1;
  try { return work(); } catch (error) { failed = true; throw error; } finally {
    DOCUMENT_STORE.lockDepth -= 1;
    if (DOCUMENT_STORE.lockDepth === 0) {
      try { documentStoreFlush(); } catch (flushError) {
        documentStoreClear();
        var reported = typeof onFlushError === 'function' ? onFlushError(flushError, failed) : flushError;
        if (!failed) { throw reported || flushError; }
      }
    }
  }
}

/** Mở bản đọc cho một lần gọi; trả `true` nếu đây là lớp ngoài cùng. */
function documentStoreBegin() {
  if (DOCUMENT_STORE.callDepth === 0 && DOCUMENT_STORE.lockDepth === 0) { documentStoreClear(); }
  DOCUMENT_STORE.callDepth += 1;
  return DOCUMENT_STORE.callDepth === 1;
}

/** Đóng bản đọc của lần gọi: lớp ngoài cùng bỏ bản đọc để lần gọi sau đọc lại từ kho. */
function documentStoreEnd() {
  if (DOCUMENT_STORE.callDepth > 1) { DOCUMENT_STORE.callDepth -= 1; return; }
  DOCUMENT_STORE.callDepth = 0;
  if (DOCUMENT_STORE.lockDepth === 0) { documentStoreClear(); }
}
