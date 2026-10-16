/**
 * Đọc khối trạng thái bẩn (dirty state — dấu hiệu cho biết chỗ nào cần vẽ lại hoặc nạp lại). Tài liệu 07 Phần 2.
 *
 * Khối này sống ở DocumentProperties (qua `documentProps()`, server/state/DocumentStore.js) chứ không ở RAM, vì nó phải sống sót giữa các lần gọi máy chủ — mỗi lần gọi Apps Script là một lượt chạy mới, không nhớ gì lượt trước — và phải chung cho mọi phiên làm việc trên cùng một tệp.
 *
 * Hai khóa: `dirtyRecords` (mã bản ghi bị sửa tay thẳng trên sheet kho), `dirtyConfig` (`Config` hoặc `Category` đã đổi). Thêm một cờ bẩn toàn bộ, dùng khi danh sách bản ghi vượt ngưỡng.
 *
 * Sheet quản trị không có cờ bẩn: dữ liệu kho đổi chỉ nâng `viewsStaleRevision`, mỗi sheet vẽ xong ghi revision đã dùng để vẽ. Sheet cũ khi revision đó nhỏ hơn mốc cũ, nên mỗi sheet tự sạch khi được vẽ mà không xóa dấu của sheet khác, và revision tăng giữa lúc vẽ vẫn để sheet cũ.
 *
 * Chiều ghi nằm cùng module để mọi đường kích hoạt dùng chung luật hợp nhất và ngưỡng, thay vì tự thao tác JSON ở từng trigger/cửa ghi.
 *
 * Vì sao chiều đọc phải có **ngay từ bây giờ**, dù chưa có gì ghi vào: tài liệu 07 Phần 2 và tài liệu 05 Phần 12 đều là ràng buộc cứng rằng **mọi phản hồi của máy chủ đính kèm khối này**. Đó là cơ chế duy nhất giữ hệ thống khỏi phải polling (hỏi lặp theo chu kỳ). Nếu bây giờ phản hồi không mang khối đó, thì đường nhận dữ liệu bên client sẽ được viết theo một hình dạng thiếu, và tới chặng làm mới thì mọi chỗ nhận phản hồi phải sửa lại một lượt — đúng loại việc mà sửa sót một chỗ thì không có gì báo.
 */

/** Khóa của `DocumentProperties`, cộng cờ bẩn toàn bộ. Khai một chỗ để chiều ghi ở chặng sau không gõ lại chuỗi khóa. */
var DIRTY_KEYS = {
  records: 'dirtyRecords',
  config: 'dirtyConfig',
  all: 'dirtyAll'
};
Object.defineProperties(DIRTY_KEYS, {
  category: { value: 'dirtyCategory', enumerable: false },
  schema: { value: 'dirtySchema', enumerable: false },
  allCore: { value: 'dirtyAllCore', enumerable: false },
  entities: { value: 'dirtyEntities', enumerable: false },
  viewsStaleRevision: { value: 'viewsStaleRevision', enumerable: false },
  revision: { value: 'reloadRevision', enumerable: false },
  changedAt: { value: 'reloadChangedAt', enumerable: false },
  recordRevisionLog: { value: 'dirtyRecordRevisionLog', enumerable: false }
});

/** Một khóa dạng danh sách. Rỗng, thiếu, hay hỏng đều trả về mảng rỗng. */
function dirtyStateList(props, key) {
  var raw = props.getProperty(key);
  if (!raw) { return []; }

  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch (khongPhaiJson) {
    return String(raw).split(',').map(function (item) { return item.trim(); }).filter(function (item) { return item; });
  }
}

/**
 * Khối trạng thái bẩn hiện tại. Trả về `{ records, config, all }`.
 *
 * **Không bao giờ ném lỗi.** Cùng lý do như `logTraceCoversSource`: hàm này nằm trên đường phản hồi của *mọi* lời gọi máy chủ, nên nó hỏng là mọi thứ hỏng. Không đọc được thì trả về khối rỗng, và khối rỗng là chiều an toàn — nó chỉ có nghĩa "không biết có gì bẩn", dẫn tới việc không vẽ lại gì cả, chứ không dẫn tới việc ghi đè dữ liệu nào.
 *
 * Đọc `JSON.parse` có đường đỡ vì khóa này người ta xóa và sửa được bằng tay khi gỡ lỗi, và một dấu ngoặc thiếu không được phép làm sập lượt mở sidebar.
 */
function dirtyStateRead() {
  var empty = { records: [], config: false, all: false };

  try {
    var props = documentProps();
    var category = props.getProperty(DIRTY_KEYS.category) === 'true';
    var config = props.getProperty(DIRTY_KEYS.config) === 'true';
    return {
      records: dirtyStateList(props, DIRTY_KEYS.records),
      config: config || category,
      all: props.getProperty(DIRTY_KEYS.allCore) === 'true' || props.getProperty(DIRTY_KEYS.all) === 'true'
    };
  } catch (khongDocDuocProps) {
    return empty;
  }
}

/**
 * Hình dạng đầy đủ của trạng thái reload. `dirtyStateRead` giữ hợp đồng cũ cho các hàm render, còn client mới dùng khối này để
 * biết phiên bản thay đổi và chọn đúng scope. Một lần ghi làm tăng revision; vì vậy hai Sidebar không được xóa tín hiệu của nhau.
 */
function reloadStateRead() {
  var empty = {
    revision: 0, changedAt: 0, records: [], entities: [], category: false, config: false, schema: false,
    allCore: false, all: false, viewsStaleRevision: 0
  };
  try {
    var props = documentProps();
    var allCore = props.getProperty(DIRTY_KEYS.allCore) === 'true' || props.getProperty(DIRTY_KEYS.all) === 'true';
    var category = props.getProperty(DIRTY_KEYS.category) === 'true';
    var config = props.getProperty(DIRTY_KEYS.config) === 'true';
    var schema = props.getProperty(DIRTY_KEYS.schema) === 'true';
    var revision = Number(props.getProperty(DIRTY_KEYS.revision) || 0);
    return {
      revision: isFinite(revision) && revision >= 0 ? revision : 0,
      changedAt: Number(props.getProperty(DIRTY_KEYS.changedAt) || 0) || 0,
      records: dirtyStateList(props, DIRTY_KEYS.records),
      entities: dirtyStateEntityList(props),
      category: category,
      config: config,
      schema: schema,
      allCore: allCore,
      all: allCore,
      viewsStaleRevision: Number(props.getProperty(DIRTY_KEYS.viewsStaleRevision) || 0) || 0
    };
  } catch (khongDocDuocProps) {
    return empty;
  }
}

/** Thực thể cần nạp trọn (sắp xếp, thêm/xóa hàng trên sheet kho). Chỉ nhận hai thực thể có sheet riêng; khóa hỏng thì coi như không có. */
function dirtyStateEntityList(props) {
  return dirtyStateList(props, DIRTY_KEYS.entities).filter(function (entity, index, list) {
    return (entity === 'customer' || entity === 'activity') && list.indexOf(entity) === index;
  });
}

function dirtyStateBumpRevision(props) {
  var state = reloadStateRead();
  var next = state.revision + 1;
  props.setProperty(DIRTY_KEYS.revision, String(next));
  props.setProperty(DIRTY_KEYS.changedAt, String(Date.now()));
  return next;
}

function dirtyStateRecordRevisionLogRead(props) {
  var raw = props.getProperty(DIRTY_KEYS.recordRevisionLog);
  if (!raw) { return []; }
  try {
    var parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter(function (entry) { return entry && Number(entry.revision) > 0 && Array.isArray(entry.records); }) : [];
  } catch (ignore) { return []; }
}

function dirtyStateRecordRevisionLogWrite(props, entries) {
  if (entries && entries.length) { props.setProperty(DIRTY_KEYS.recordRevisionLog, JSON.stringify(entries)); }
  else { props.deleteProperty(DIRTY_KEYS.recordRevisionLog); }
}

function dirtyStateRecordRevisionLogAppend(props, revision, recordIds) {
  var ids = [];
  var seen = {};
  (recordIds || []).forEach(function (value) {
    var id = String(value === null || value === undefined ? '' : value).trim();
    if (id && !seen[id]) { seen[id] = true; ids.push(id); }
  });
  if (!ids.length) { return; }
  var entries = dirtyStateRecordRevisionLogRead(props);
  entries.push({ revision: revision, records: ids });
  dirtyStateRecordRevisionLogWrite(props, entries.slice(-100));
}

function dirtyStateRecordIdsAfterRevision(props, revision) {
  var seen = {};
  dirtyStateRecordRevisionLogRead(props).forEach(function (entry) {
    if (Number(entry.revision) <= Number(revision || 0)) { return; }
    entry.records.forEach(function (id) { var key = String(id || '').trim(); if (key) { seen[key] = true; } });
  });
  return Object.keys(seen);
}

/**
 * Giỏ thay đổi của một lần chạy GAS: mọi cửa ghi chỉ bỏ dấu vào giỏ, `runEntryPoint` đổ giỏ một lần ở cuối (kể cả khi lần chạy lỗi sau khi đã ghi), nên một lần chạy dù ghi bao nhiêu lần cũng chỉ tăng revision một lần và Sidebar chỉ nạp một lần.
 * Đánh dấu ngoài `runEntryPoint` thì ném lỗi: dấu không có giỏ là dấu không bao giờ được đổ, Sidebar sẽ giữ RAM cũ mà không ai biết.
 * Cạm bẫy: GAS bị cắt ở trần 6 phút thì `finally` không chạy và dấu trong giỏ mất; các lượt chạy dài (đồng bộ FBM) phải tự dừng trước trần như hiện nay.
 */
var DIRTY_STATE_BASKET = { depth: 0, mark: null };

function dirtyStateBasketBegin() {
  if (DIRTY_STATE_BASKET.depth === 0) { DIRTY_STATE_BASKET.mark = null; }
  DIRTY_STATE_BASKET.depth += 1;
}

/** Đóng giỏ; lớp ngoài cùng đổ giỏ. Đổ hỏng thì vẫn đóng giỏ rồi ném lỗi để cửa vào ghi Log và báo người dùng. */
function dirtyStateBasketEnd() {
  if (DIRTY_STATE_BASKET.depth > 1) { DIRTY_STATE_BASKET.depth -= 1; return null; }
  try {
    return dirtyStateBasketFlush();
  } finally {
    DIRTY_STATE_BASKET.depth = 0;
    DIRTY_STATE_BASKET.mark = null;
  }
}

/**
 * Đổ giỏ ngay: ghi một tín hiệu cho mọi thay đổi đã gom rồi tô tab sheet quản trị cũ. Giỏ rỗng thì không làm gì.
 * Ngoài cuối lần chạy, chỉ gọi ở chỗ phải đọc kết quả tín hiệu trong cùng lần chạy (trả trạng thái nạp kèm phản hồi lưu, vẽ sheet quản trị theo lệnh trigger); gọi giữa một chuỗi ghi là tách một lần chạy thành nhiều tín hiệu.
 */
function dirtyStateBasketFlush() {
  var mark = DIRTY_STATE_BASKET.mark;
  if (!mark) { return null; }
  DIRTY_STATE_BASKET.mark = null;
  var lock = LockService.getDocumentLock();
  if (!documentStoreTryLock(lock, SETTINGS.LOCK_WAIT_MS)) {
    throw new Error('Hệ thống bận, chưa ghi được tín hiệu nạp lại cho thay đổi vừa lưu. Bấm Nạp lại để Sidebar thấy dữ liệu mới.');
  }
  try {
    var state = dirtyStateApplySignal(mark);
    viewTabTintStaleLocked(null, { fromSidebar: mark.fromSidebar === true });
    return state;
  } finally {
    lock.releaseLock();
  }
}

/** Bỏ một dấu vào giỏ của lần chạy hiện tại. */
function dirtyStateMarkSignal(mark) {
  if (DIRTY_STATE_BASKET.depth === 0) {
    throw new Error('Đánh dấu nạp lại ngoài runEntryPoint: không có giỏ thay đổi để đổ, Sidebar sẽ không biết dữ liệu đã đổi. Bọc cửa vào bằng runEntryPoint.');
  }
  var basket = DIRTY_STATE_BASKET.mark || { records: [], entities: [], category: false, config: false, schema: false, allCore: false, allViews: false, fromSidebar: false };
  basket.records = basket.records.concat(mark.records || []);
  basket.entities = basket.entities.concat(mark.entities || []);
  ['category', 'config', 'schema', 'allCore', 'allViews', 'fromSidebar'].forEach(function (key) { if (mark[key] === true) { basket[key] = true; } });
  DIRTY_STATE_BASKET.mark = basket;
}

/** Ghi một tín hiệu xuống DocumentProperties: một lần tăng revision. Chỉ `dirtyStateBasketFlush` gọi, trong khóa tài liệu. */
function dirtyStateApplySignal(mark) {
  var props = documentProps();
  var state = reloadStateRead();
  var hasRecords = !!(mark.records && mark.records.length);
  if (hasRecords) {
    dirtyStateWriteList(props, DIRTY_KEYS.records, state.records.concat(mark.records));
  }
  if (mark.entities && mark.entities.length) { dirtyStateWriteList(props, DIRTY_KEYS.entities, state.entities.concat(mark.entities)); }
  if (mark.category) { props.setProperty(DIRTY_KEYS.category, 'true'); }
  if (mark.config) { props.setProperty(DIRTY_KEYS.config, 'true'); }
  if (mark.schema) { props.setProperty(DIRTY_KEYS.schema, 'true'); }
  if (mark.allCore) {
    props.setProperty(DIRTY_KEYS.allCore, 'true');
    props.setProperty(DIRTY_KEYS.all, 'true');
    props.deleteProperty(DIRTY_KEYS.records);
    props.deleteProperty(DIRTY_KEYS.entities);
  }
  var bumpedRevision = dirtyStateBumpRevision(props);
  if (mark.allViews) { props.setProperty(DIRTY_KEYS.viewsStaleRevision, String(bumpedRevision)); }
  if (hasRecords && !mark.allCore) { dirtyStateRecordRevisionLogAppend(props, bumpedRevision, mark.records); }
  var next = reloadStateRead();
  var limit = Number(SETTINGS.DIRTY_RECORD_LIMIT) || 500;
  if (!next.allCore && next.records.length > limit) {
    props.deleteProperty(DIRTY_KEYS.records);
    props.deleteProperty(DIRTY_KEYS.recordRevisionLog);
    props.setProperty(DIRTY_KEYS.allCore, 'true');
    props.setProperty(DIRTY_KEYS.all, 'true');
  }
  return reloadStateRead();
}

/** Bỏ phần signal do ReloadDecision trả về vào giỏ; không để từng trigger/cửa ghi tự dựng mark riêng. Không có signal thì không làm gì, vì trigger sửa bộ điều khiển view đi qua đây mỗi lần gõ. `fromSidebar`: lượt ghi do người đứng trước Sidebar bấm, xem `viewTabTintStaleLocked`. */
function dirtyStateMarkDecision(decision, fromSidebar) {
  var signal = decision && decision.signal;
  if (!signal) { return false; }
  var records = Array.isArray(signal.records) ? signal.records : [];
  var entities = Array.isArray(signal.entities) ? signal.entities : [];
  var hasSignal = records.length || entities.length || signal.category || signal.config || signal.schema || signal.allCore || signal.allViews;
  if (!hasSignal) { return false; }
  dirtyStateMarkSignal({
    records: records,
    entities: entities,
    category: signal.category === true,
    config: signal.config === true,
    schema: signal.schema === true,
    allCore: signal.allCore === true,
    allViews: signal.allViews === true,
    fromSidebar: fromSidebar === true
  });
  return true;
}

function dirtyStateWriteList(props, key, values) {
  var unique = [];
  var seen = {};
  (values || []).forEach(function (value) {
    var item = String(value === null || value === undefined ? '' : value).trim();
    if (!item || seen[item]) { return; }
    seen[item] = true;
    unique.push(item);
  });
  if (unique.length) { props.setProperty(key, JSON.stringify(unique)); }
  else { props.deleteProperty(key); }
  return unique;
}

/** Đánh dấu các mã bản ghi; vượt ngưỡng thì bỏ danh sách và bật cờ toàn bộ. */
function dirtyStateMarkRecords(recordIds) {
  dirtyStateMarkSignal({ records: Array.isArray(recordIds) ? recordIds : [recordIds] });
  return dirtyStateRead();
}

/** Đánh dấu Config đã đổi. */
function dirtyStateMarkConfig() {
  dirtyStateMarkSignal({ config: true, allViews: true });
  return dirtyStateRead();
}

function dirtyStateMarkCategory() {
  dirtyStateMarkSignal({ category: true, allViews: true });
  return dirtyStateRead();
}

function dirtyStateMarkSchema() {
  dirtyStateMarkSignal({ schema: true, allCore: true, allViews: true });
  return dirtyStateRead();
}

/** Đánh dấu mọi dữ liệu cần nạp lại. */
function dirtyStateMarkAll() {
  dirtyStateMarkSignal({ allCore: true, allViews: true });
  return dirtyStateRead();
}

/** Xóa đúng các cờ đã xử lý; gọi không tham số để xóa toàn bộ trạng thái. */
function dirtyStateClear(options) {
  var props = documentProps();
  var opts = options || {};
  if (opts.expectedRevision !== undefined && reloadStateRead().revision !== Number(opts.expectedRevision)) {
    return dirtyStateRead();
  }
  var clearOptions = Object.keys(opts).filter(function (key) { return key !== 'expectedRevision'; });
  if (!clearOptions.length) {
    [DIRTY_KEYS.records, DIRTY_KEYS.entities, DIRTY_KEYS.category, DIRTY_KEYS.config, DIRTY_KEYS.schema, DIRTY_KEYS.allCore, DIRTY_KEYS.all].forEach(function (key) { props.deleteProperty(key); });
  } else {
    if (opts.records) { props.deleteProperty(DIRTY_KEYS.records); props.deleteProperty(DIRTY_KEYS.recordRevisionLog); }
    if (opts.entities) { props.deleteProperty(DIRTY_KEYS.entities); }
    if (opts.config) { props.deleteProperty(DIRTY_KEYS.config); }
    if (opts.category) { props.deleteProperty(DIRTY_KEYS.category); }
    if (opts.schema) { props.deleteProperty(DIRTY_KEYS.schema); }
    if (opts.allCore || opts.all) { props.deleteProperty(DIRTY_KEYS.allCore); props.deleteProperty(DIRTY_KEYS.all); props.deleteProperty(DIRTY_KEYS.recordRevisionLog); }
  }
  return dirtyStateRead();
}

function dirtyStateClearRecords(recordIds, expectedRevision) {
  if (expectedRevision !== undefined && reloadStateRead().revision !== Number(expectedRevision)) { return dirtyStateRead(); }
  var remove = {};
  (Array.isArray(recordIds) ? recordIds : [recordIds]).forEach(function (id) { remove[String(id || '').trim()] = true; });
  var props = documentProps();
  var remaining = dirtyStateRead().records.filter(function (id) { return !remove[id]; });
  dirtyStateWriteList(props, DIRTY_KEYS.records, remaining);
  if (!remaining.length) {
    props.deleteProperty(DIRTY_KEYS.recordRevisionLog);
  } else if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== '') {
    var keepLog = dirtyStateRecordRevisionLogRead(props).filter(function (entry) { return Number(entry.revision) > Number(expectedRevision); });
    dirtyStateRecordRevisionLogWrite(props, keepLog);
  }
  return dirtyStateRead();
}

/** Xóa cờ nạp trọn của một thực thể; nạp tay Customer không được xóa cờ của Activity. */
function dirtyStateClearEntity(entity, expectedRevision) {
  if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== '' && reloadStateRead().revision !== Number(expectedRevision)) { return dirtyStateRead(); }
  var props = documentProps();
  dirtyStateWriteList(props, DIRTY_KEYS.entities, dirtyStateEntityList(props).filter(function (item) { return item !== entity; }));
  return dirtyStateRead();
}

function dirtyStateClearConfig() {
  var props = documentProps();
  props.deleteProperty(DIRTY_KEYS.config);
  return dirtyStateRead();
}

/** Nhận phần trạng thái mà một lượt nạp toàn bộ sắp xử lý; cờ phát sinh sau thời điểm này vẫn được giữ lại. */
function dirtyStateTakeFullReload() {
  var state = reloadStateRead();
  dirtyStateClear({ records: true, entities: true, category: true, config: true, schema: true, allCore: true, all: true });
  var consumed = { records: state.records, config: state.config || state.category, all: state.allCore };
  Object.defineProperties(consumed, {
    category: { value: state.category, enumerable: false },
    schema: { value: state.schema, enumerable: false },
    revision: { value: state.revision, enumerable: false }
  });
  return consumed;
}

/** Trả lại phần đã nhận nếu lượt nạp lõi thất bại trước khi bàn giao dữ liệu cho client. */
function dirtyStateRestoreFullReload(state) {
  var consumed = state || {};
  if (consumed.category) { dirtyStateMarkCategory(); }
  if (consumed.config && !consumed.category) { dirtyStateMarkConfig(); }
  if (consumed.schema) { dirtyStateMarkSchema(); }
  if (consumed.all) { dirtyStateMarkAll(); }
  else if (consumed.records && consumed.records.length) { dirtyStateMarkRecords(consumed.records); }
  return dirtyStateRead();
}

/** Phép nghiệm thu chạy được trên Google: in khối trạng thái bẩn hiện có trên tệp thật. Sheet mới thì cả bốn đều rỗng, và đó là câu trả lời đúng cần nhìn thấy. */
function probeDirtyState() {
  var state = dirtyStateRead();
  var report = [
    'viewsStaleRevision: ' + reloadStateRead().viewsStaleRevision + ' · sổ sheet quản trị: ' + JSON.stringify(viewLedgerRead()),
    'dirtyRecords: ' + (state.records.length ? state.records.length + ' mã' : 'rỗng'),
    'dirtyConfig: ' + state.config,
    'dirtyAll: ' + state.all
  ];

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
