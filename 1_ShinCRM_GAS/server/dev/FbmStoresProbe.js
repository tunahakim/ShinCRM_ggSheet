/**
 * Hàm dò cho việc gộp kho FBM: đo chi phí lệnh DocumentProperties thật và chụp các khóa FBM để so trước và sau hàm chuyển.
 * Không bao giờ trả giá trị của ô lượt (cookie, `authorized`) hay cấu hình đăng nhập (bản mã); khóa không nằm trong danh sách giá trị chỉ trả tên và cỡ.
 */

var FBM_STORES_PROBE_PREFIX = 'DEV_FBM_STORES_PROBE_';

/** Khóa được trả cả giá trị: lịch nền, mốc, con trỏ, cổng, sổ chờ, sổ lỗi, sổ mới sau gộp. Liên kết chỉ trả cỡ. */
var FBM_STORES_PROBE_VALUE_KEYS = /^(FBM_SYNC_DONE_|FBM_SYNC_RETRY_|FBM_SYNC_CUSTOMER_BASELINE_V1$|FBM_SYNC_DETAIL_CURSOR_V1$|FBM_SYNC_PUSH_CLEAN_V1$|FBM_SYNC_PUSH_GATE_V1$|FBM_SYNC_PENDING_PUSHES_V1$|FBM_SYNC_PUSH_FAILURES_V1$|FBM_SYNC_PROCESS_BOOK_V1$)/;

function fbmStoresProbeBytes(text) { return Utilities.newBlob(String(text)).getBytes().length; }

/** Ảnh chụp mọi khóa bắt đầu bằng `FBM_`: tên, cỡ, giá trị khi khóa được phép, dấu băm ngắn để so khóa không trả giá trị. */
function fbmProbeStoreSnapshot() {
  var all = documentStoreReal().getProperties(), keys = Object.keys(all).filter(function (key) { return key.indexOf('FBM_') === 0; }).sort(), rows = [], total = 0;
  keys.forEach(function (key) {
    var value = String(all[key]), bytes = fbmStoresProbeBytes(value), digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, value).slice(0, 4).map(function (b) { return ((b + 256) % 256).toString(16); }).join('');
    total += bytes;
    rows.push(FBM_STORES_PROBE_VALUE_KEYS.test(key) ? { key: key, bytes: bytes, digest: digest, value: value } : { key: key, bytes: bytes, digest: digest });
  });
  return { count: keys.length, bytes: total, keys: rows };
}

/** Đo thời gian thật (ms) của từng loại lệnh trên khóa tạm, dọn sạch trước khi trả. */
function fbmProbeStoreCost() {
  var props = documentStoreReal(), result = {}, time = function (fn) { var at = Date.now(); fn(); return Date.now() - at; };
  var batch = function (n) { var values = {}; for (var i = 0; i < n; i += 1) { values[FBM_STORES_PROBE_PREFIX + i] = 'x'; } return values; };
  try {
    result.getPropertiesMs = [time(function () { props.getProperties(); }), time(function () { props.getProperties(); })];
    result.getPropertyMs = [time(function () { props.getProperty('FBM_SYNC_STATE_V1'); }), time(function () { props.getProperty('FBM_SYNC_STATE_V1'); })];
    [1, 10, 40].forEach(function (n) { result['setProperties' + n + 'Ms'] = time(function () { props.setProperties(batch(n), false); }); });
    var deletes = [];
    for (var i = 0; i < 10; i += 1) { deletes.push(time(function () { props.deleteProperty(FBM_STORES_PROBE_PREFIX + i); })); }
    result.deletePropertyMs = deletes;
    result.setEmptyBatch30Ms = time(function () { var values = {}; for (var j = 10; j < 40; j += 1) { values[FBM_STORES_PROBE_PREFIX + j] = ''; } props.setProperties(values, false); });
  } finally {
    var left = Object.keys(props.getProperties()).filter(function (key) { return key.indexOf(FBM_STORES_PROBE_PREFIX) === 0; });
    left.forEach(function (key) { props.deleteProperty(key); });
    result.cleaned = left.length;
  }
  return result;
}

/** Cỡ xấu nhất của hai danh sách khách mới (`READ_NEW`, `READ_NEW_DONE`): số khách trên Sheet, số khách mốc FBM, độ dài mã FBM dài nhất trên Sheet. */
function fbmProbeReadNewSize() {
  var records = FbmSync.withLocalSnapshot(function () { return FbmSync.readLocal('customer'); }), longest = 0;
  records.forEach(function (record) { longest = Math.max(longest, String(record.fbmId || '').length); });
  var fbmTotal = FbmSync.customerBaselineRead();
  return { sheetCustomers: records.length, fbmBaseline: fbmTotal, longestFbmId: longest, worstCaseBytesEachList: (fbmTotal || records.length) * (longest + 1), shardBytes: FbmSync.SHARD_LIST_BYTES };
}
