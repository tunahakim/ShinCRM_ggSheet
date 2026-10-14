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
  viewsStaleRevision: { value: 'viewsStaleRevision', enumerable: false },
  viewRendered: { value: 'viewRenderedRevisions', enumerable: false },
  revision: { value: 'reloadRevision', enumerable: false },
  changedAt: { value: 'reloadChangedAt', enumerable: false },
  recordsReadyAt: { value: 'dirtyRecordsReadyAt', enumerable: false },
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
    revision: 0, changedAt: 0, recordsReadyAt: 0, records: [], category: false, config: false, schema: false,
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
      recordsReadyAt: Number(props.getProperty(DIRTY_KEYS.recordsReadyAt) || 0) || 0,
      records: dirtyStateList(props, DIRTY_KEYS.records),
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

function dirtyStateMarkSignal(mark) {
  var props = documentProps();
  var state = reloadStateRead();
  var hasRecords = !!(mark.records && mark.records.length);
  var explicitReadyAt = mark.recordsReadyAt !== undefined && mark.recordsReadyAt !== null;
  var readyAt = explicitReadyAt ? Number(mark.recordsReadyAt) || 0 : 0;
  var debounceMs = Number(mark.recordsDebounceMs) || 0;
  if (hasRecords) {
    dirtyStateWriteList(props, DIRTY_KEYS.records, state.records.concat(mark.records));
  }
  if (mark.category) { props.setProperty(DIRTY_KEYS.category, 'true'); }
  if (mark.config) { props.setProperty(DIRTY_KEYS.config, 'true'); }
  if (mark.schema) { props.setProperty(DIRTY_KEYS.schema, 'true'); }
  if (mark.allCore) {
    props.setProperty(DIRTY_KEYS.allCore, 'true');
    props.setProperty(DIRTY_KEYS.all, 'true');
    props.deleteProperty(DIRTY_KEYS.records);
    props.deleteProperty(DIRTY_KEYS.recordsReadyAt);
  }
  var bumpedRevision = dirtyStateBumpRevision(props);
  if (mark.allViews) { props.setProperty(DIRTY_KEYS.viewsStaleRevision, String(bumpedRevision)); }
  if (hasRecords && !mark.allCore) { dirtyStateRecordRevisionLogAppend(props, bumpedRevision, mark.records); }
  // Tính mốc debounce sau cùng một mốc changedAt của signal. Nếu một lần ghi
  // ô phát thêm onEdit trong lúc xử lý, signal cuối vẫn có đủ ba giây trọn vẹn.
  if (hasRecords && !mark.allCore) {
    var changedAt = reloadStateRead().changedAt;
    if (explicitReadyAt) {
      if (readyAt > 0) { props.setProperty(DIRTY_KEYS.recordsReadyAt, String(readyAt)); }
      else { props.deleteProperty(DIRTY_KEYS.recordsReadyAt); }
    } else if (debounceMs > 0) {
      props.setProperty(DIRTY_KEYS.recordsReadyAt, String(changedAt + debounceMs));
    } else {
      props.deleteProperty(DIRTY_KEYS.recordsReadyAt);
    }
  }
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

/** Ghi phần signal do ReloadDecision trả về; không để từng trigger/cửa ghi tự dựng mark riêng. Không có signal thì trả `null` mà không đọc DocumentProperties, vì trigger sửa bộ điều khiển view đi qua đây mỗi lần gõ. */
function dirtyStateMarkDecision(decision) {
  var signal = decision && decision.signal;
  if (!signal) { return null; }
  var records = Array.isArray(signal.records) ? signal.records : [];
  var hasSignal = records.length || signal.category || signal.config || signal.schema || signal.allCore || signal.allViews;
  if (!hasSignal) { return null; }
  return dirtyStateMarkSignal({
    records: records,
    category: signal.category === true,
    config: signal.config === true,
    schema: signal.schema === true,
    allCore: signal.allCore === true,
    allViews: signal.allViews === true,
    recordsReadyAt: signal.recordsReadyAt,
    recordsDebounceMs: signal.recordsDebounceMs
  });
}

/** Một cổng tín hiệu dùng chung cho mọi nguồn ghi thành công xuống Customer/Activity. */
function dirtyStateMarkRecordChange(entity, recordIds) {
  if (entity !== 'customer' && entity !== 'activity') { return reloadStateRead(); }
  return dirtyStateMarkSignal({ records: recordIds || [], allViews: true, recordsReadyAt: 0 });
}

/** Làm mọi sheet quản trị thành cũ mà không đổi dữ liệu RAM nào. */
function dirtyStateMarkAllViews() {
  return dirtyStateMarkSignal({ allViews: true });
}

/** Revision đã dùng để vẽ từng sheet quản trị, theo tên sheet. Theo tên chứ không theo sheetId để lời hỏi của Sidebar biết sheet đang xem cũ hay mới mà không phải mở bảng tính; đổi tên sheet chỉ làm sheet đó bị coi là cũ và vẽ lại một lần. */
function viewRenderedRead() {
  try {
    var parsed = JSON.parse(documentProps().getProperty(DIRTY_KEYS.viewRendered) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (khongDocDuoc) {
    return {};
  }
}

/** Chỉ gọi sau `flush` của lượt vẽ và trong DocumentLock, với revision đọc lúc bắt đầu vẽ. */
function viewRenderedWrite(sheetName, revision) {
  var map = viewRenderedRead();
  map[String(sheetName)] = Number(revision) || 0;
  documentProps().setProperty(DIRTY_KEYS.viewRendered, JSON.stringify(map));
}

function viewIsStale(sheetName) {
  return reloadDecisionViewStale(reloadStateRead().viewsStaleRevision, viewRenderedRead()[String(sheetName)]);
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
    [DIRTY_KEYS.records, DIRTY_KEYS.recordsReadyAt, DIRTY_KEYS.category, DIRTY_KEYS.config, DIRTY_KEYS.schema, DIRTY_KEYS.allCore, DIRTY_KEYS.all].forEach(function (key) { props.deleteProperty(key); });
  } else {
    if (opts.records) { props.deleteProperty(DIRTY_KEYS.records); props.deleteProperty(DIRTY_KEYS.recordsReadyAt); props.deleteProperty(DIRTY_KEYS.recordRevisionLog); }
    if (opts.config) { props.deleteProperty(DIRTY_KEYS.config); }
    if (opts.category) { props.deleteProperty(DIRTY_KEYS.category); }
    if (opts.schema) { props.deleteProperty(DIRTY_KEYS.schema); }
    if (opts.allCore || opts.all) { props.deleteProperty(DIRTY_KEYS.allCore); props.deleteProperty(DIRTY_KEYS.all); props.deleteProperty(DIRTY_KEYS.recordsReadyAt); props.deleteProperty(DIRTY_KEYS.recordRevisionLog); }
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
    props.deleteProperty(DIRTY_KEYS.recordsReadyAt);
    props.deleteProperty(DIRTY_KEYS.recordRevisionLog);
  } else if (expectedRevision !== undefined && expectedRevision !== null && expectedRevision !== '') {
    var keepLog = dirtyStateRecordRevisionLogRead(props).filter(function (entry) { return Number(entry.revision) > Number(expectedRevision); });
    dirtyStateRecordRevisionLogWrite(props, keepLog);
  }
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
  dirtyStateClear({ records: true, category: true, config: true, schema: true, allCore: true, all: true });
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
    'viewsStaleRevision: ' + reloadStateRead().viewsStaleRevision + ' · đã vẽ: ' + JSON.stringify(viewRenderedRead()),
    'dirtyRecords: ' + (state.records.length ? state.records.length + ' mã' : 'rỗng'),
    'dirtyConfig: ' + state.config,
    'dirtyAll: ' + state.all
  ];

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
