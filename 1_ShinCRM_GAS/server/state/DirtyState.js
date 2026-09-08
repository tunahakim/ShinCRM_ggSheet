/**
 * Đọc khối trạng thái bẩn (dirty state — dấu hiệu cho biết chỗ nào cần vẽ lại hoặc nạp lại). Tài liệu 07 Phần 2.
 *
 * Khối này sống ở `PropertiesService.getDocumentProperties()` chứ không ở RAM, vì nó phải sống sót giữa các lần gọi máy chủ — mỗi lần gọi Apps Script là một lượt chạy mới, không nhớ gì lượt trước — và phải chung cho mọi phiên làm việc trên cùng một tệp.
 *
 * Ba khóa: `dirtyViewSheets` (sheet quản trị cần vẽ lại), `dirtyRecords` (mã bản ghi bị sửa tay thẳng trên sheet kho), `dirtyConfig` (`Config` hoặc `Category` đã đổi). Thêm một cờ bẩn toàn bộ, dùng khi danh sách bản ghi vượt ngưỡng.
 *
 * Chiều ghi nằm cùng module để mọi đường kích hoạt dùng chung luật hợp nhất và ngưỡng, thay vì tự thao tác JSON ở từng trigger/cửa ghi.
 *
 * Vì sao chiều đọc phải có **ngay từ bây giờ**, dù chưa có gì ghi vào: tài liệu 07 Phần 2 và tài liệu 05 Phần 12 đều là ràng buộc cứng rằng **mọi phản hồi của máy chủ đính kèm khối này**. Đó là cơ chế duy nhất giữ hệ thống khỏi phải polling (hỏi lặp theo chu kỳ). Nếu bây giờ phản hồi không mang khối đó, thì đường nhận dữ liệu bên client sẽ được viết theo một hình dạng thiếu, và tới chặng làm mới thì mọi chỗ nhận phản hồi phải sửa lại một lượt — đúng loại việc mà sửa sót một chỗ thì không có gì báo.
 */

/** Ba khóa của `DocumentProperties`, cộng cờ bẩn toàn bộ. Khai một chỗ để chiều ghi ở chặng sau không gõ lại chuỗi khóa. */
var DIRTY_KEYS = {
  viewSheets: 'dirtyViewSheets',
  records: 'dirtyRecords',
  config: 'dirtyConfig',
  all: 'dirtyAll'
};

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
 * Khối trạng thái bẩn hiện tại. Trả về `{ viewSheets, records, config, all }`.
 *
 * **Không bao giờ ném lỗi.** Cùng lý do như `logTraceCoversSource`: hàm này nằm trên đường phản hồi của *mọi* lời gọi máy chủ, nên nó hỏng là mọi thứ hỏng. Không đọc được thì trả về khối rỗng, và khối rỗng là chiều an toàn — nó chỉ có nghĩa "không biết có gì bẩn", dẫn tới việc không vẽ lại gì cả, chứ không dẫn tới việc ghi đè dữ liệu nào.
 *
 * Đọc `JSON.parse` có đường đỡ vì khóa này người ta xóa và sửa được bằng tay khi gỡ lỗi, và một dấu ngoặc thiếu không được phép làm sập lượt mở sidebar.
 */
function dirtyStateRead() {
  var empty = { viewSheets: [], records: [], config: false, all: false };

  try {
    var props = PropertiesService.getDocumentProperties();
    return {
      viewSheets: dirtyStateList(props, DIRTY_KEYS.viewSheets),
      records: dirtyStateList(props, DIRTY_KEYS.records),
      config: props.getProperty(DIRTY_KEYS.config) === 'true',
      all: props.getProperty(DIRTY_KEYS.all) === 'true'
    };
  } catch (khongDocDuocProps) {
    return empty;
  }
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

/** Đánh dấu một sheet quản trị cần vẽ lại, không lặp tên sheet. */
function dirtyStateMarkViewSheet(sheetName) {
  var name = String(sheetName === null || sheetName === undefined ? '' : sheetName).trim();
  if (!name) { return dirtyStateRead(); }
  var props = PropertiesService.getDocumentProperties();
  var state = dirtyStateRead();
  dirtyStateWriteList(props, DIRTY_KEYS.viewSheets, state.viewSheets.concat([name]));
  return dirtyStateRead();
}

/** Đánh dấu các mã bản ghi; vượt ngưỡng thì bỏ danh sách và bật cờ toàn bộ. */
function dirtyStateMarkRecords(recordIds) {
  var state = dirtyStateRead();
  if (state.all) { return state; }
  var props = PropertiesService.getDocumentProperties();
  var existing = state.records.slice();
  var incoming = Array.isArray(recordIds) ? recordIds : [recordIds];
  var merged = dirtyStateWriteList({
    setProperty: function (key, value) { props.setProperty(key, value); },
    deleteProperty: function (key) { props.deleteProperty(key); }
  }, DIRTY_KEYS.records, existing.concat(incoming));
  var limit = Number(SETTINGS.DIRTY_RECORD_LIMIT) || 500;
  if (merged.length > limit) {
    props.deleteProperty(DIRTY_KEYS.records);
    props.setProperty(DIRTY_KEYS.all, 'true');
  }
  return dirtyStateRead();
}

/** Đánh dấu Config/Category đã đổi. */
function dirtyStateMarkConfig() {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty(DIRTY_KEYS.config, 'true');
  return dirtyStateRead();
}

/** Đánh dấu mọi dữ liệu cần nạp lại. */
function dirtyStateMarkAll() {
  var props = PropertiesService.getDocumentProperties();
  props.setProperty(DIRTY_KEYS.all, 'true');
  props.deleteProperty(DIRTY_KEYS.records);
  return dirtyStateRead();
}

/** Xóa đúng các cờ đã xử lý; gọi không tham số để xóa toàn bộ trạng thái. */
function dirtyStateClear(options) {
  var props = PropertiesService.getDocumentProperties();
  var opts = options || {};
  if (!Object.keys(opts).length) {
    Object.keys(DIRTY_KEYS).forEach(function (name) { props.deleteProperty(DIRTY_KEYS[name]); });
  } else {
    if (opts.viewSheets) { props.deleteProperty(DIRTY_KEYS.viewSheets); }
    if (opts.records) { props.deleteProperty(DIRTY_KEYS.records); }
    if (opts.config) { props.deleteProperty(DIRTY_KEYS.config); }
    if (opts.all) { props.deleteProperty(DIRTY_KEYS.all); }
  }
  return dirtyStateRead();
}

function dirtyStateClearViewSheet(sheetName) {
  var target = String(sheetName === null || sheetName === undefined ? '' : sheetName).trim();
  var props = PropertiesService.getDocumentProperties();
  var remaining = dirtyStateRead().viewSheets.filter(function (name) { return name !== target; });
  dirtyStateWriteList(props, DIRTY_KEYS.viewSheets, remaining);
  return dirtyStateRead();
}

/** Phép nghiệm thu chạy được trên Google: in khối trạng thái bẩn hiện có trên tệp thật. Sheet mới thì cả bốn đều rỗng, và đó là câu trả lời đúng cần nhìn thấy. */
function probeDirtyState() {
  var state = dirtyStateRead();
  var report = [
    'dirtyViewSheets: ' + (state.viewSheets.length ? state.viewSheets.join(', ') : 'rỗng'),
    'dirtyRecords: ' + (state.records.length ? state.records.length + ' mã' : 'rỗng'),
    'dirtyConfig: ' + state.config,
    'dirtyAll: ' + state.all
  ];

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
