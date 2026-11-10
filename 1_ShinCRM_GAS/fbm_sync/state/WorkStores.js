/**
 * Kho làm việc của một Lượt: tập "đã thấy" theo bit, danh sách nhiều khóa và khóa đơn chỉ sống từ lúc mở tới lúc đóng lượt. Mọi tên kho làm việc khai ở đây và chỉ ở đây; `workStoreClear` xóa hẳn đúng các khóa này ở `runOpen` và `runClose`, nên lượt hỏng giữa chừng hay đóng ở đường nào cũng không để lại gì cho lượt sau.
 * Kho sống qua nhiều lượt (sổ chờ đẩy, sổ lỗi đẩy, bản xem trước) không nằm ở đây.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SEEN_SHARD_HEX_LENGTH = 8000;
// Kho bit: tên → loại mã đánh số bit. Tên bắt đầu `customer_` đánh theo số CUS của khách cha kể cả kho về giao dịch; `activity_bulk` đánh theo số ACT.
FbmSync.ACTIVITY_BULK_STORE = 'activity_bulk';
FbmSync.READ_LIST_STORE = 'customer_read_list';
FbmSync.READ_DONE_STORE = 'customer_read_done';
FbmSync.ACTIVITY_READ_STORE = 'customer_activity_read';
FbmSync.ACTIVITY_FRESH_STORE = 'customer_activity_fresh';
// Khách chưa có trên Sheet chưa có số CUS: danh sách theo FBM giữ `stt_rec_kh`, một danh sách chờ đọc và một danh sách đã đọc.
FbmSync.READ_NEW_PREFIX = 'FBM_SYNC_READ_NEW_';
FbmSync.READ_NEW_DONE_PREFIX = 'FBM_SYNC_READ_NEW_DONE_';
// Số CUS theo thứ tự FBM trả (`ngay_gd` giảm dần) của lớp quét từ khách mới nhất xuống.
FbmSync.TOP_ORDER_PREFIX = 'FBM_SYNC_TOP_ORDER_';
// Mỗi phần tử là `c:<stt_rec_kh>` (khách vắng, kiểm tra còn tồn tại) hoặc `a:<id giao dịch>` (giao dịch vắng, hỏi khách đang giữ).
FbmSync.GATE_LOOKUP_PREFIX = 'FBM_SYNC_GATE_LOOKUP_';
// Mã giao dịch đã thấy ở các trang trước của khách đang đọc dở nhiều trang, dạng `<stt_rec_kh>:<id>`: trang cuối đối chiếu vắng mặt trên cả các trang này, không chỉ trang cuối.
FbmSync.ACTIVITY_PAGED_SEEN_PREFIX = 'FBM_SYNC_PAGED_SEEN_';
// Danh sách đẩy của chặng đẩy (State.js).
FbmSync.PUSH_LIST_PREFIX = 'FBM_SYNC_PUSH_LIST_';
// Ghi chú "giao dịch chờ nối": khách B chưa đọc → các id giao dịch FBM báo B đang giữ.
FbmSync.READ_WAIT_KEY = 'FBM_SYNC_READ_WAIT';

/** Bảng kho làm việc: `bits` tên kho bit → loại mã; `lists` tiền tố danh sách nhiều khóa (`shardListWrite`); `keys` khóa đơn. */
FbmSync.RUN_WORK_STORES = {
  bits: { customer: 'CUS', activity_bulk: 'ACT', customer_read_list: 'CUS', customer_read_done: 'CUS', customer_activity_read: 'CUS', customer_activity_fresh: 'CUS' },
  lists: [FbmSync.READ_NEW_PREFIX, FbmSync.READ_NEW_DONE_PREFIX, FbmSync.TOP_ORDER_PREFIX, FbmSync.GATE_LOOKUP_PREFIX, FbmSync.ACTIVITY_PAGED_SEEN_PREFIX, FbmSync.PUSH_LIST_PREFIX],
  keys: [FbmSync.READ_WAIT_KEY]
};

/** Loại mã của một kho bit; tên không có trong bảng là lỗi lập trình nên ném (đoán loại theo tên từng đảo CUS/ACT). */
FbmSync.seenStoreKind = function (scope) {
  var kind = Object.prototype.hasOwnProperty.call(FbmSync.RUN_WORK_STORES.bits, String(scope)) ? FbmSync.RUN_WORK_STORES.bits[String(scope)] : '';
  if (!kind) { var unknown = new Error('Kho "đã thấy" "' + String(scope) + '" không có trong RUN_WORK_STORES.'); unknown.code = 'SEEN_STORE_UNKNOWN'; throw unknown; }
  return kind;
};

/** Bộ lọc thuần: trong danh sách tên khóa, các khóa thuộc kho làm việc. So khớp cả đuôi (số mảnh, `SHARDS`, `TOTAL`, `HIGH_WATER`) để tiền tố này không ăn kho khác dài hơn (`READ_NEW_` và `READ_NEW_DONE_`). */
FbmSync.workStoreKeys = function (names) {
  // Tên khóa chỉ gồm chữ hoa, số và gạch dưới nên ghép thẳng vào biểu thức, không cần thoát ký tự.
  var table = FbmSync.RUN_WORK_STORES;
  var patterns = Object.keys(table.bits).map(function (scope) { return new RegExp('^' + FbmSync.seenStorePrefix(scope) + '(\\d+|SHARDS|TOTAL|HIGH_WATER)$'); })
    .concat(table.lists.map(function (prefix) { return new RegExp('^' + prefix + '(\\d+|SHARDS)$'); }));
  return (names || []).filter(function (name) { return table.keys.indexOf(name) >= 0 || patterns.some(function (pattern) { return pattern.test(name); }); });
};

/** Xóa hẳn mọi khóa kho làm việc đang có, lấy tên từ bản đọc kho đã nạp của lần gọi (không đọc thêm). Mỗi khóa xóa là một lần gọi kho (đo DEV khoảng 20 ms); lượt chỉ để lại vài chục khóa. Trả số khóa đã xóa. */
FbmSync.workStoreClear = function () {
  var props = FbmSync.props(), keys = FbmSync.workStoreKeys(Object.keys(props.getProperties()));
  keys.forEach(function (key) { props.deleteProperty(key); });
  return keys.length;
};

/** Bitmap phân mảnh theo mã nội bộ ổn định; thứ tự dòng Sheet có đổi thì dấu vẫn đúng. */
FbmSync.seenStorePrefix = function (scope) { return 'FBM_SYNC_SEEN_' + String(scope || '').toUpperCase().replace(/[^A-Z0-9_]/g, '_') + '_'; };
FbmSync.seenStoreIndex = function (scope, record) {
  var expected = FbmSync.seenStoreKind(scope);
  var value = record && typeof record === 'object' ? record.id : record;
  var text = String(value === null || value === undefined ? '' : value).trim();
  var match = text.match(/^(CUS|ACT)-(\d{6})$/i);
  if (!match) { return -1; }
  if (String(match[1]).toUpperCase() !== expected) { return -1; }
  var digits = match[2];
  var index = Number(digits);
  return isFinite(index) && index >= 0 ? index : -1;
};
FbmSync.seenStoreClear = function (scope) {
  var props = FbmSync.props(), prefix = FbmSync.seenStorePrefix(scope), count = Number(props.getProperty(prefix + 'SHARDS') || 0);
  for (var i = 0; i < count; i += 1) { props.deleteProperty(prefix + i); }
  props.deleteProperty(prefix + 'TOTAL'); props.deleteProperty(prefix + 'HIGH_WATER'); props.deleteProperty(prefix + 'SHARDS');
};
FbmSync.seenStoreBegin = function (scope, recordsOrTotal) {
  FbmSync.seenStoreClear(scope);
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), records = Array.isArray(recordsOrTotal) ? recordsOrTotal : null, highWater = 0;
  if (records) {
    records.forEach(function (record) { highWater = Math.max(highWater, FbmSync.seenStoreIndex(scope, record)); });
  }
  props.setProperty(prefix + 'TOTAL', String(records ? records.length : Math.max(0, Number(recordsOrTotal || 0))));
  props.setProperty(prefix + 'HIGH_WATER', String(Math.max(0, highWater)));
  props.setProperty(prefix + 'SHARDS', '0');
};
/** Kho không có mốc "khách sinh sau đầu lượt coi như đã đánh dấu": bit nào chưa đặt là chưa, dùng cho tập khách cần đọc hoặc đã đọc giao dịch. */
FbmSync.seenStoreBeginExact = function (scope) {
  FbmSync.seenStoreBegin(scope, []);
  FbmSync.props().setProperty(FbmSync.seenStorePrefix(scope) + 'HIGH_WATER', '');
};
FbmSync.seenStoreMark = function (scope, localRecords, incomingRecords) {
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, local = localRecords || [], incoming = incomingRecords || [], positions = {}, shards = {}, maxShard = -1;
  local.forEach(function (record) {
    var id = String(record && record.fbmId || '').trim(), index = FbmSync.seenStoreIndex(scope, record);
    if (id && index >= 0) { positions[id] = index; }
  });
  incoming.forEach(function (record) {
    var id = String(record && (record.fbmId || record.id) || '').trim(), index = positions[id];
    if (index === undefined) { return; }
    var hexIndex = Math.floor(index / 4), shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
    if (!shards[shardIndex]) { shards[shardIndex] = String(props.getProperty(prefix + shardIndex) || '').split(''); }
    while (shards[shardIndex].length <= offset) { shards[shardIndex].push('0'); }
    var nibble = parseInt(shards[shardIndex][offset] || '0', 16) || 0;
    shards[shardIndex][offset] = (nibble | (1 << (index % 4))).toString(16);
    maxShard = Math.max(maxShard, shardIndex);
  });
  Object.keys(shards).forEach(function (key) { props.setProperty(prefix + key, shards[key].join('')); });
  var previous = Number(props.getProperty(prefix + 'SHARDS') || 0);
  props.setProperty(prefix + 'SHARDS', String(Math.max(previous, maxShard + 1)));
};
FbmSync.seenStoreHas = function (scope, record) {
  var index = FbmSync.seenStoreIndex(scope, record), prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), highWaterRaw = props.getProperty(prefix + 'HIGH_WATER'), highWater = Number(highWaterRaw || 0), hasBoundary = highWaterRaw !== null && highWaterRaw !== undefined && String(highWaterRaw) !== '';
  // ID cũ hoặc lạ không đủ an toàn để đánh dấu; coi như đã thấy để không suy ra vắng mặt nhầm.
  if (index < 0 || (hasBoundary && index > highWater)) { return true; }
  var hexIndex = Math.floor(index / 4), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
  var value = String(props.getProperty(prefix + shardIndex) || ''), nibble = parseInt(value.charAt(offset) || '0', 16) || 0;
  return (nibble & (1 << (index % 4))) !== 0;
};
FbmSync.seenStoreReader = function (scope) {
  var prefix = FbmSync.seenStorePrefix(scope), props = FbmSync.props(), shardLength = FbmSync.SEEN_SHARD_HEX_LENGTH, cache = {}, highWaterRaw = props.getProperty(prefix + 'HIGH_WATER'), highWater = Number(highWaterRaw || 0), hasBoundary = highWaterRaw !== null && highWaterRaw !== undefined && String(highWaterRaw) !== '';
  return function (record) {
    var valueIndex = FbmSync.seenStoreIndex(scope, record);
    if (valueIndex < 0 || (hasBoundary && valueIndex > highWater)) { return true; }
    var hexIndex = Math.floor(valueIndex / 4), shardIndex = Math.floor(hexIndex / shardLength), offset = hexIndex % shardLength;
    if (cache[shardIndex] === undefined) { cache[shardIndex] = String(props.getProperty(prefix + shardIndex) || ''); }
    var nibble = parseInt(cache[shardIndex].charAt(offset) || '0', 16) || 0;
    return (nibble & (1 << (valueIndex % 4))) !== 0;
  };
};

