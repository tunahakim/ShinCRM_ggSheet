/**
 * Cửa duy nhất của cả repo vào DocumentProperties và vào khóa, kèm bản đọc trong bộ nhớ theo một lần gọi GAS.
 *
 * Vì sao có: mỗi lệnh gọi kho mất 10–50 ms, trong khi một lần ghi Sheet từng đọc lại cùng các khóa hàng trăm lần.
 * Luật:
 * - Bản đọc chỉ sống trong một lần gọi (`runEntryPoint` mở/đóng), trong khóa tài liệu hoặc trong khóa điều phối của đồng bộ; ngoài đó `documentProps()` là kho thật.
 * - Lần đọc đầu lấy cả kho bằng một `getProperties()`; khóa không có trong bản đó nghĩa là chưa có.
 * - Khóa tài liệu chỉ có một người giữ là `documentLockRun`: code nghiệp vụ khai "việc này cần khóa", không tự cầm/trả. Lần chạy đang cầm thì gọi lồng chỉ chạy tiếp (khóa của Google không tái nhập, tự cầm lại là tự chờ chính mình tới hết giờ). Trả khóa luôn qua `SpreadsheetApp.flush()` (tài liệu 06 Phần 2) rồi gửi kho.
 * - Trong khóa tài liệu, `documentProps()` ghi chờ và người giữ khóa gửi mọi khóa đã ghi bằng một `setProperties` ngay trước khi nhả: mỗi module vẫn tự ghi khóa của mình, kho chỉ nhận một lệnh, và lượt chờ khóa chỉ thấy bản đã ghi xong. Ngoài khóa tài liệu thì ghi thẳng.
 * - Đồng bộ FBM ghi gộp riêng (`documentPropsDeferred()` trong `withDocumentStoreDeferred`): ghi chờ tới lúc nhả khóa điều phối (khóa script), kể cả khi đang lồng trong khóa tài liệu. Mỗi khóa chờ ghi gắn với lớp khóa của nó, nên nhả khóa tài liệu không gửi sớm phần của đồng bộ.
 * - Vừa lấy được khóa (khóa tài liệu hoặc khóa điều phối) thì gọi `documentStoreRefresh()` để bỏ bản đọc: tiến trình khác có thể vừa ghi trong lúc chờ khóa; đọc-sửa-ghi trên bản cũ là mất tín hiệu của họ. Phần đang chờ ghi gộp được giữ.
 * - Bản đọc giữ chuỗi chứ không giữ object, nên người đọc sửa object mà không ghi thì không làm bẩn bản đọc.
 * Cạm bẫy: gọi thẳng `PropertiesService.getDocumentProperties()` hay `LockService.getDocumentLock()` ở chỗ khác là đọc trượt bản đọc hoặc tự khóa chính mình; test chặn việc này.
 * GAS bị cắt giữa chừng (trần 6 phút) thì `finally` không chạy, phần ghi chờ chưa gửi bị mất; chấp nhận vì cửa ghi FBM idempotent (lượt sau chạy lại đúng khách đang xử lý) và bộ đếm cấp mã tự nhảy theo số lớn nhất trên sheet (`idGateIssue`).
 */
var DOCUMENT_STORE = { lockDepth: 0, callDepth: 0, docLockDepth: 0, loaded: false, values: {}, dirty: {} };

/** Lớp khóa của một khóa chờ ghi: gửi lúc nhả khóa tài liệu, hay lúc nhả khóa điều phối của đồng bộ. */
var DOCUMENT_STORE_DIRTY_DOC = 'doc';
var DOCUMENT_STORE_DIRTY_COORD = 'coord';

var DOCUMENT_LOCK_BUSY_MESSAGE = 'Hệ thống bận. Vui lòng thử lại!';

function documentStoreReal() { return PropertiesService.getDocumentProperties(); }
function documentStoreActive() { return DOCUMENT_STORE.lockDepth > 0 || DOCUMENT_STORE.callDepth > 0 || DOCUMENT_STORE.docLockDepth > 0; }
function documentStoreClear() { DOCUMENT_STORE.loaded = false; DOCUMENT_STORE.values = {}; DOCUMENT_STORE.dirty = {}; sheetReadCopyClear(); }

/** Bỏ bản đọc nhưng giữ phần đang chờ ghi gộp; lần đọc sau nạp lại kho thật rồi phủ phần chờ lên. Bản đọc Sheet kho bỏ cùng lúc (tài liệu 06 Phần 2). */
function documentStoreRefresh() {
  sheetReadCopyRefresh();
  var keep = {};
  Object.keys(DOCUMENT_STORE.dirty).forEach(function (key) { keep[key] = DOCUMENT_STORE.values[key]; });
  DOCUMENT_STORE.values = keep;
  DOCUMENT_STORE.loaded = false;
}

/** Cửa duy nhất để lấy khóa (khóa tài liệu qua `documentLockRun`, khóa điều phối của đồng bộ): lấy được thì bỏ bản đọc ngay, nên không có chỗ nào lấy khóa mà quên đọc lại. Trả `false` khi hết giờ chờ. */
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

/**
 * Người giữ khóa tài liệu duy nhất: chạy `work` trong khóa; lần chạy chưa cầm thì cầm, đang cầm thì chạy tiếp. Hết giờ chờ thì ném `busyMessage` và không chạy gì.
 * Trả khóa luôn qua `documentLockSettle` kể cả khi `work` ném lỗi, vì phần đã ghi trước lỗi phải nằm thật trong Sheet và kho. Không giữ khóa suốt lần chạy: mỗi việc ghi cầm một lần ngắn, để một lần chạy đồng bộ dài không chặn Sidebar lưu.
 */
function documentLockRun(work, busyMessage) {
  if (DOCUMENT_STORE.docLockDepth > 0) {
    DOCUMENT_STORE.docLockDepth += 1;
    try { return work(); } finally { DOCUMENT_STORE.docLockDepth -= 1; }
  }
  var lock = LockService.getDocumentLock();
  if (!documentStoreTryLock(lock, SETTINGS.LOCK_WAIT_MS)) { throw new Error(busyMessage || DOCUMENT_LOCK_BUSY_MESSAGE); }
  DOCUMENT_STORE.docLockDepth = 1;
  var failed = null;
  try {
    return work();
  } catch (error) {
    failed = error;
    throw error;
  } finally {
    try {
      documentLockSettle();
    } catch (settleError) {
      // Lỗi gốc giữ quyền ném, nhưng lỗi lúc chốt ghi phải đi kèm để không thành lỗi im lặng.
      if (!failed) { throw settleError; }
      failed.message = String(failed.message || failed) + ' (Kèm lỗi khi ghi trước lúc nhả khóa: ' + String((settleError && settleError.message) || settleError) + ')';
    } finally {
      DOCUMENT_STORE.docLockDepth = 0;
      lock.releaseLock();
      if (!documentStoreActive()) { documentStoreClear(); }
    }
  }
}

/** Trước khi nhả khóa tài liệu: `flush` Sheet (tài liệu 06 Phần 2 `[RÀNG BUỘC CỨNG]`) rồi gửi các khóa kho đã ghi trong khóa. Gửi kho hỏng thì bỏ phần chưa gửi khỏi bản đọc, để không ai đọc giá trị chưa có thật trong kho. */
function documentLockSettle() {
  var error = null;
  try { SpreadsheetApp.flush(); } catch (flushError) { error = flushError; }
  try {
    documentStoreFlush(DOCUMENT_STORE_DIRTY_DOC);
  } catch (storeError) {
    Object.keys(DOCUMENT_STORE.dirty).forEach(function (key) { if (DOCUMENT_STORE.dirty[key] === DOCUMENT_STORE_DIRTY_DOC) { delete DOCUMENT_STORE.dirty[key]; } });
    documentStoreRefresh();
    error = error || storeError;
  }
  if (error) { throw error; }
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

/** Dựng mặt kho có bản đọc. `defer` = mặt của đồng bộ, ghi chờ tới lúc nhả khóa điều phối; mọi mặt ghi chờ trong khóa tài liệu; ngoài hai khóa thì ghi thẳng. Giá trị `null` trong bản đọc nghĩa là khóa chưa có hoặc đã xóa. */
function documentStoreFacade(defer) {
  function deferLayer() {
    if (defer && DOCUMENT_STORE.lockDepth > 0) { return DOCUMENT_STORE_DIRTY_COORD; }
    return DOCUMENT_STORE.docLockDepth > 0 ? DOCUMENT_STORE_DIRTY_DOC : '';
  }
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
      var layer = deferLayer();
      if (layer) { DOCUMENT_STORE.dirty[key] = layer; } else { documentStoreReal().setProperty(key, text); delete DOCUMENT_STORE.dirty[key]; }
      DOCUMENT_STORE.values[key] = text;
      return this;
    },
    deleteProperty: function (key) {
      var layer = deferLayer();
      if (layer) { DOCUMENT_STORE.dirty[key] = layer; } else { documentStoreReal().deleteProperty(key); delete DOCUMENT_STORE.dirty[key]; }
      DOCUMENT_STORE.values[key] = null;
      return this;
    },
    /** Ghi thẳng thì gửi một lệnh cho cả khối thay vì một lệnh mỗi khóa. */
    setProperties: function (values) {
      var self = this;
      var keys = Object.keys(values || {});
      var store = documentStoreReal();
      if (deferLayer() || typeof store.setProperties !== 'function') {
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

/** Kho cho mọi code: trong một lần gọi là kho có bản đọc (ghi chờ trong khóa tài liệu, ghi thẳng ngoài khóa), ngoài đó là kho thật. */
function documentProps() { return documentStoreActive() ? DOCUMENT_STORE_THROUGH : documentStoreReal(); }

/** Kho cho đồng bộ FBM: như `documentProps()` nhưng trong khóa điều phối thì ghi chờ tới lúc nhả khóa đó. */
function documentPropsDeferred() { return documentStoreActive() ? DOCUMENT_STORE_DEFERRED : documentStoreReal(); }

/** Gửi các khóa chờ ghi của một lớp (`layer`; bỏ trống là mọi lớp): một lần `setProperties`, cộng một lần xóa cho mỗi khóa bị xóa. Lỗi ném nguyên để bên gọi ghi Log theo ngữ cảnh của nó. */
function documentStoreFlush(layer) {
  var keys = Object.keys(DOCUMENT_STORE.dirty).filter(function (key) { return !layer || DOCUMENT_STORE.dirty[key] === layer; });
  var batch = {}, removed = [];
  if (!keys.length) { return 0; }
  keys.forEach(function (key) { if (DOCUMENT_STORE.values[key] === null) { removed.push(key); } else { batch[key] = DOCUMENT_STORE.values[key]; } });
  var store = documentStoreReal();
  // Kho giả trong test có thể thiếu `setProperties`; kho thật của Google luôn có.
  if (typeof store.setProperties === 'function') { if (Object.keys(batch).length) { store.setProperties(batch, false); } } else { Object.keys(batch).forEach(function (key) { store.setProperty(key, batch[key]); }); }
  removed.forEach(function (key) { store.deleteProperty(key); });
  keys.forEach(function (key) { delete DOCUMENT_STORE.dirty[key]; });
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
  if (DOCUMENT_STORE.callDepth === 0 && DOCUMENT_STORE.lockDepth === 0 && DOCUMENT_STORE.docLockDepth === 0) { documentStoreClear(); }
  DOCUMENT_STORE.callDepth += 1;
  return DOCUMENT_STORE.callDepth === 1;
}

/** Đóng bản đọc của lần gọi: lớp ngoài cùng bỏ bản đọc để lần gọi sau đọc lại từ kho. */
function documentStoreEnd() {
  if (DOCUMENT_STORE.callDepth > 1) { DOCUMENT_STORE.callDepth -= 1; return; }
  DOCUMENT_STORE.callDepth = 0;
  if (DOCUMENT_STORE.lockDepth === 0 && DOCUMENT_STORE.docLockDepth === 0) { documentStoreClear(); }
}
