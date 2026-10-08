/**
 * Bộ đo thời gian của phiên đồng bộ FBM (chỉ dùng lúc phát triển, xóa cùng `server/dev/`).
 *
 * Vì sao bọc hàm thay vì rải `Date.now()` vào code nghiệp vụ: đo là việc tạm, rải mốc vào nghiệp vụ thì gỡ sót là thành rác lâu dài. Ở đây mỗi lần gọi GAS bọc tạm một danh sách hàm có sẵn, đo thời gian tự thân (trừ thời gian các hàm con cũng được bọc) nên các ô cộng lại đúng bằng tổng thời gian lần gọi, không đếm trùng.
 * Cạm bẫy: chỉ đo khi đã bật bằng `fbmPerfOn`; tắt thì `runEntryPoint` chỉ tốn một lần đọc Cache. Kết quả nằm trong CacheService (hết hạn sau 6 giờ) chứ không nằm trong DocumentProperties, vì state đã sát trần 9 KB và chính phép đo không được làm đổi state.
 * Thời gian phía Sidebar/Extension lấy từ trace client gửi kèm mỗi lần gọi; các mốc đó cùng đồng hồ máy người dùng nên trừ nhau được. Thời gian đường truyền GAS = (Sidebar thấy GAS trả về − lúc Sidebar gọi) − thời gian GAS tự đo, nên không phụ thuộc lệch đồng hồ hai máy.
 */
var FBM_PERF_FLAG_KEY = 'FBM_PERF_ON';
var FBM_PERF_STORE_KEY = 'FBM_PERF_STORE';
var FBM_PERF_TTL_SECONDS = 21600;
/** Hàm của FbmSync được bọc; thêm tên ở đây khi cần chẻ nhỏ một ô còn lớn. */
var FBM_PERF_FBM_FUNCTIONS = [
  'stateRead', 'stateWrite', 'documentPropertySet', 'documentPropertyJson', 'compactStatePreview', 'stateWriteMinimal',
  'traceEvent', 'traceImport', 'traceAppend', 'traceContext', 'traceRead',
  'statusView', 'recoverStaleRun', 'shouldLogStatus', 'logStatus', 'recordIssuesFlush', 'limitRelayResult', 'transportValue',
  'withOrchestrationLock', 'nextEnvelope', 'requestForCursor',
  'rowsToRecords', 'customerRecord', 'activityRecord', 'isTemporaryRecord', 'stateCategoryGate', 'readCategoryGate',
  'pullRecords', 'pullWrite', 'readLocal', 'seenStoreBegin', 'seenStoreMark', 'seenStoreHas', 'sheetSave', 'previewRecords',
  'hash', 'threeWay', 'canonical', 'activitySinceAllows',
  'businessStepStart', 'businessStepAdd', 'businessStepFinish',
  'customerScanRecord', 'customerNext', 'activityForCustomers', 'finishPullRun', 'beginCustomerPull',
  'runPreflight', 'preflightEvaluate', 'preflightLocalScan', 'preflightHashSummary', 'preflightCandidates', 'preflightPushPermissions', 'logPreflight', 'identityPreflight', 'pushCandidates',
  'continueSessionGate', 'sessionGateResponseStarted', 'applyTransportSession', 'authContinue', 'lookupPairs',
  'sessionGateStart', 'sessionGateWaitRequest', 'sessionGateHandleFailure', 'sessionGateProbeRequest', 'sessionGateResumeProbeRequest', 'sessionGateHandleProbeFailure', 'sessionGateTransportRetry', 'sessionGateRecordFailure', 'sessionGateResumeAfterWaitProbe',
  'activityBatchContinue', 'activityBatchRequest', 'activityParentCodes', 'activityPagesRead', 'activityCustomerErrors'
];
var FBM_PERF_PROTOCOL_FUNCTIONS = ['parse', 'assertSuccess', 'isLiveSessionResponse'];
/** Hàm toàn cục của lõi ShinCRM mà đồng bộ gọi tới: đọc Sheet, cửa ghi, Log. */
var FBM_PERF_GLOBAL_FUNCTIONS = ['entityReadAllCombined', 'entityReadAll', 'writeGateSave', 'logEvent', 'logTrace', 'flushLog', 'flushLogIfTraced', 'shinCorePreflight'];
/** Cặp mốc phía client: [tên đoạn, mốc bắt đầu, mốc kết thúc, thuộc lần gọi trước?]. */
var FBM_PERF_CLIENT_SEGMENTS = [
  ['sidebar_to_extension', 'client_next_request_started', 'executor_started', false],
  ['extension_fetch_fbm', 'fetch_started', 'fetch_finished', false],
  ['extension_to_gas_call', 'fetch_finished', 'client_gas_call_started', false],
  ['gas_roundtrip', 'client_gas_call_started', 'client_gas_success', true],
  ['sidebar_after_gas', 'client_gas_success', 'client_next_request_started', true]
];

function fbmPerfCache() { return CacheService.getDocumentCache(); }

/** Mở phiên đo của một lần gọi GAS; trả `null` khi chưa bật để `runEntryPoint` chạy như thường. */
function devPerfBegin(name, args) {
  if (!/^fbm/i.test(String(name || ''))) { return null; }
  try { return fbmPerfBeginUnsafe(name, args); } catch (error) { fbmPerfRecordError('bắt đầu', error); return null; }
}

/** Bộ đo hỏng không được làm hỏng lần gọi đồng bộ; lỗi được cất lại để `fbmPerfReport` hiện ra, không nuốt im. */
function fbmPerfRecordError(where, error) {
  var text = 'Bộ đo DEV lỗi lúc ' + where + ': ' + String(error && error.message || error);
  if (typeof console !== 'undefined' && console.error) { console.error(text); }
  fbmPerfCache().put('FBM_PERF_ERROR', text, FBM_PERF_TTL_SECONDS);
}

function fbmPerfBeginUnsafe(name, args) {
  var startedAt = Date.now(), cache = fbmPerfCache(), raw = cache.getAll([FBM_PERF_FLAG_KEY, FBM_PERF_STORE_KEY]);
  if (raw[FBM_PERF_FLAG_KEY] !== '1') { return null; }
  var perf = { name: String(name), startedAt: startedAt, flagMs: Date.now() - startedAt, stack: [], buckets: {}, callers: {}, restore: [], runId: '', kind: '', store: null, args: args || {} };
  try { perf.store = raw[FBM_PERF_STORE_KEY] ? JSON.parse(raw[FBM_PERF_STORE_KEY]) : null; } catch (parseError) { perf.store = null; perf.storeError = String(parseError && parseError.message || parseError); }
  if (!perf.store || typeof perf.store !== 'object') { perf.store = { runs: {}, order: [], client: { lastAt: 0, lastStage: {}, lastKind: '', lastServerMs: 0 } }; }
  FBM_PERF_FBM_FUNCTIONS.forEach(function (fn) { fbmPerfWrap(perf, FbmSync, fn, fn); });
  if (FbmSync.protocol) { FBM_PERF_PROTOCOL_FUNCTIONS.forEach(function (fn) { fbmPerfWrap(perf, FbmSync.protocol, fn, 'protocol.' + fn); }); }
  FBM_PERF_GLOBAL_FUNCTIONS.forEach(function (fn) { fbmPerfWrap(perf, globalThis, fn, fn); });
  fbmPerfWrapProps(perf);
  fbmPerfWrapLock(perf);
  return perf;
}

/** Bọc một hàm: cộng thời gian tự thân và đếm hàm gọi nó; giữ nguyên `this`, giá trị trả về và lỗi ném ra. */
function fbmPerfWrap(perf, owner, key, label) {
  if (!owner || typeof owner[key] !== 'function' || owner[key].__fbmPerf) { return; }
  var original = owner[key];
  var wrapped = function () {
    var frame = fbmPerfEnter(perf, label), result;
    try {
      result = original.apply(this, arguments);
      if (label === 'stateRead' && !perf.kind && result) { perf.runId = String(result.runId || ''); perf.kind = String(result.cursor && result.cursor.kind || result.phase || ''); }
      return result;
    } finally { fbmPerfExit(perf, frame); }
  };
  wrapped.__fbmPerf = true;
  owner[key] = wrapped;
  perf.restore.push(function () { owner[key] = original; });
}

/** DocumentProperties: đo từng lần gọi kho thật (lõi lẫn đồng bộ), bọc ở cửa kho dùng chung nên lần đọc trúng bản đọc trong bộ nhớ không bị tính. */
function fbmPerfWrapProps(perf) {
  if (typeof documentStoreReal !== 'function') { return; }
  var originalReal = documentStoreReal;
  var timed = function (props) {
    return {
      getProperty: function (key) { var f = fbmPerfEnter(perf, 'props.getProperty'); try { return props.getProperty(key); } finally { fbmPerfExit(perf, f); } },
      setProperty: function (key, value) { var f = fbmPerfEnter(perf, 'props.setProperty'); try { return props.setProperty(key, value); } finally { fbmPerfExit(perf, f); } },
      deleteProperty: function (key) { var f = fbmPerfEnter(perf, 'props.deleteProperty'); try { return props.deleteProperty(key); } finally { fbmPerfExit(perf, f); } },
      getProperties: function () { var f = fbmPerfEnter(perf, 'props.getProperties'); try { return props.getProperties(); } finally { fbmPerfExit(perf, f); } },
      getKeys: function () { var f = fbmPerfEnter(perf, 'props.getKeys'); try { return props.getKeys(); } finally { fbmPerfExit(perf, f); } },
      setProperties: function (values, deleteOthers) { var f = fbmPerfEnter(perf, 'props.setProperties'); try { return props.setProperties(values, deleteOthers); } finally { fbmPerfExit(perf, f); } }
    };
  };
  documentStoreReal = function () { return timed(originalReal()); };
  perf.propsServiceWrapped = true;
  perf.restore.push(function () { documentStoreReal = originalReal; });
}

/** Thời gian chờ khóa điều phối tách riêng khỏi thời gian xử lý. */
function fbmPerfWrapLock(perf) {
  if (typeof FbmSync.orchestrationLock !== 'function') { return; }
  var original = FbmSync.orchestrationLock;
  FbmSync.orchestrationLock = function () {
    var lock = original.apply(FbmSync, arguments);
    return { tryLock: function (ms) { var f = fbmPerfEnter(perf, 'lock.tryLock'); try { return lock.tryLock(ms); } finally { fbmPerfExit(perf, f); } }, releaseLock: function () { return lock.releaseLock(); } };
  };
  perf.restore.push(function () { FbmSync.orchestrationLock = original; });
}

function fbmPerfEnter(perf, label) {
  var parent = perf.stack.length ? perf.stack[perf.stack.length - 1].label : '(gốc)';
  var frame = { label: label, at: Date.now(), childMs: 0 };
  perf.stack.push(frame);
  var edge = label + ' ← ' + parent;
  perf.callers[edge] = Number(perf.callers[edge] || 0) + 1;
  return frame;
}

function fbmPerfExit(perf, frame) {
  var total = Date.now() - frame.at, bucket = perf.buckets[frame.label] || (perf.buckets[frame.label] = { n: 0, selfMs: 0, totalMs: 0 });
  // Lỗi ném giữa chừng có thể để lại frame con chưa đóng; cắt stack về đúng frame này.
  var index = perf.stack.lastIndexOf(frame);
  if (index >= 0) { perf.stack.length = index; }
  bucket.n += 1; bucket.selfMs += Math.max(0, total - frame.childMs); bucket.totalMs += total;
  if (perf.stack.length) { perf.stack[perf.stack.length - 1].childMs += total; }
}

/** Đóng phiên đo: gỡ bọc, cộng vào bảng tổng theo lượt và loại lần gọi, ghi Cache một lần. */
function devPerfEnd(perf, failed) {
  if (!perf) { return; }
  try { fbmPerfEndUnsafe(perf, failed); } catch (error) { fbmPerfRecordError('kết thúc', error); }
}

function fbmPerfEndUnsafe(perf, failed) {
  perf.restore.reverse().forEach(function (undo) { undo(); });
  var serverMs = Date.now() - perf.startedAt, store = perf.store, kind = perf.name === 'fbmContinueSync' || perf.name === 'fbmRelay' ? perf.name + ':' + (perf.kind || '?') : perf.name;
  var runKey = perf.runId || '(không runId)';
  if (!store.runs[runKey]) { store.runs[runKey] = { firstAt: perf.startedAt, kinds: {} }; store.order.push(runKey); }
  while (store.order.length > 3) { delete store.runs[store.order.shift()]; }
  var run = store.runs[runKey];
  run.lastAt = Date.now();
  var agg = run.kinds[kind] || (run.kinds[kind] = { calls: 0, failed: 0, serverMs: 0, maxServerMs: 0, minServerMs: 0, measuredMs: 0, buckets: {}, callers: {}, client: {} });
  agg.calls += 1; agg.failed += failed ? 1 : 0; agg.serverMs += serverMs; agg.maxServerMs = Math.max(agg.maxServerMs, serverMs); agg.minServerMs = agg.minServerMs ? Math.min(agg.minServerMs, serverMs) : serverMs;
  Object.keys(perf.buckets).forEach(function (label) {
    var src = perf.buckets[label], dst = agg.buckets[label] || (agg.buckets[label] = { n: 0, selfMs: 0 });
    dst.n += src.n; dst.selfMs += src.selfMs; agg.measuredMs += src.selfMs;
  });
  Object.keys(perf.callers).forEach(function (edge) { agg.callers[edge] = Number(agg.callers[edge] || 0) + perf.callers[edge]; });
  if (perf.propsServiceWrapped === false) { agg.propsServiceNotWrapped = true; }
  fbmPerfClientSegments(perf, run, kind);
  store.client.lastKind = kind;
  store.client.lastServerMs = serverMs;
  var text = JSON.stringify(store);
  fbmPerfCache().put(FBM_PERF_STORE_KEY, text, FBM_PERF_TTL_SECONDS);
}

/** Ghép mốc client mới (chưa xử lý ở lần gọi trước) thành các đoạn thời gian Sidebar/Extension. */
function fbmPerfClientSegments(perf, run, kind) {
  var store = perf.store, client = store.client, args = perf.args || {}, events = [], seen = {};
  var add = function (list) { (Array.isArray(list) ? list : []).forEach(function (item) { if (!item || !item.stage || !item.at) { return; } var key = item.stage + '|' + item.at; if (seen[key]) { return; } seen[key] = true; events.push({ stage: String(item.stage), at: Number(item.at) }); }); };
  add(args.clientTrace);
  add(args.response && args.response.transport && args.response.transport.trace);
  events = events.filter(function (item) { return item.at > Number(client.lastAt || 0); }).sort(function (a, b) { return a.at - b.at; });
  events.forEach(function (event) {
    FBM_PERF_CLIENT_SEGMENTS.forEach(function (segment) {
      if (segment[2] !== event.stage || !client.lastStage[segment[1]] || client.lastStage[segment[1]] > event.at) { return; }
      var ms = event.at - client.lastStage[segment[1]], targetKind = segment[3] ? client.lastKind || kind : kind, target = run.kinds[targetKind] || run.kinds[kind];
      fbmPerfAddClient(target, segment[0], ms);
      if (segment[0] === 'gas_roundtrip' && client.lastServerMs) { fbmPerfAddClient(target, 'gas_transit (khứ hồi − GAS tự đo)', Math.max(0, ms - client.lastServerMs)); }
      client.lastStage[segment[1]] = 0;
    });
    client.lastStage[event.stage] = event.at;
    client.lastAt = Math.max(Number(client.lastAt || 0), event.at);
  });
}

function fbmPerfAddClient(agg, name, ms) {
  var item = agg.client[name] || (agg.client[name] = { n: 0, ms: 0, maxMs: 0 });
  item.n += 1; item.ms += ms; item.maxMs = Math.max(item.maxMs, ms);
}

/** Bật đo; xóa số liệu cũ để bảng chỉ chứa lượt chạy sắp tới. */
function fbmPerfOn() { var cache = fbmPerfCache(); cache.remove(FBM_PERF_STORE_KEY); cache.put(FBM_PERF_FLAG_KEY, '1', FBM_PERF_TTL_SECONDS); return 'Đã bật đo thời gian đồng bộ FBM trong 6 giờ; số liệu cũ đã xóa.'; }
function fbmPerfOff() { fbmPerfCache().remove(FBM_PERF_FLAG_KEY); return 'Đã tắt đo thời gian đồng bộ FBM; số liệu vẫn giữ tới khi Cache hết hạn.'; }

/** Bảng đo đọc được bằng chữ: theo lượt, theo loại lần gọi, các ô xếp từ tốn nhất xuống. */
function fbmPerfReport() {
  var raw = fbmPerfCache().get(FBM_PERF_STORE_KEY);
  if (!raw) { return 'Chưa có số liệu đo (chưa bật fbmPerfOn, chưa chạy lượt nào, hoặc Cache đã hết hạn).'; }
  var store = JSON.parse(raw), lines = [], perfError = fbmPerfCache().get('FBM_PERF_ERROR');
  if (perfError) { lines.push('!!! ' + perfError); }
  store.order.forEach(function (runKey) {
    var run = store.runs[runKey];
    lines.push('=== Lượt ' + runKey + ' (' + Math.round((run.lastAt - run.firstAt) / 1000) + ' giây từ lần gọi đầu đến lần cuối) ===');
    Object.keys(run.kinds).sort(function (a, b) { return run.kinds[b].serverMs - run.kinds[a].serverMs; }).forEach(function (kind) {
      var agg = run.kinds[kind];
      lines.push('-- ' + kind + ': ' + agg.calls + ' lần gọi' + (agg.failed ? ' (' + agg.failed + ' lỗi)' : '') + ', GAS tổng ' + agg.serverMs + ' ms, TB ' + Math.round(agg.serverMs / agg.calls) + ' ms (min ' + agg.minServerMs + ', max ' + agg.maxServerMs + '), chưa bọc ' + (agg.serverMs - agg.measuredMs) + ' ms' + (agg.propsServiceNotWrapped ? ' [PropertiesService của trace không bọc được]' : ''));
      Object.keys(agg.client).forEach(function (name) { var c = agg.client[name]; lines.push('   [client] ' + name + ': ' + c.n + ' lần, TB ' + Math.round(c.ms / c.n) + ' ms, max ' + c.maxMs + ' ms, tổng ' + c.ms + ' ms'); });
      Object.keys(agg.buckets).sort(function (a, b) { return agg.buckets[b].selfMs - agg.buckets[a].selfMs; }).forEach(function (label) {
        var b = agg.buckets[label];
        if (b.selfMs < agg.calls * 5 && b.selfMs < 50) { return; }
        lines.push('   ' + label + ': ' + b.n + ' lần (' + (Math.round(b.n / agg.calls * 10) / 10) + '/lần gọi), tự thân ' + b.selfMs + ' ms, TB ' + Math.round(b.selfMs / agg.calls) + ' ms/lần gọi');
      });
      var hot = Object.keys(agg.callers).filter(function (edge) { return /^(props\.|stateRead|stateWrite|traceEvent|entityRead)/.test(edge); }).sort(function (a, b) { return agg.callers[b] - agg.callers[a]; }).slice(0, 14);
      if (hot.length) { lines.push('   gọi bởi: ' + hot.map(function (edge) { return edge + ' ×' + agg.callers[edge]; }).join('; ')); }
    });
  });
  return lines;
}

/** Phạm vi đo có giới hạn: bật chế độ thử với tối đa `FbmSync.TEST_CODES_MAX` mã FBM (`fbmCustomerCode`, vì bộ lọc chiều lấy so với `ma_kh` bên FBM chứ không so với mã ShinCRM). Ưu tiên khách đã có giao dịch trong Sheet Activity để đo cả nhánh ghi Sheet, bù bằng khách cuối Sheet Customer đã có FBM ID. Chỉ đọc FBM nên an toàn; cất cài đặt cũ để `fbmPerfTestScopeOff` trả lại. */
function fbmPerfTestScopeOn() {
  var before = FbmSync.syncSettingsRead(), codes = [], shinCodes = [], withActivity = {};
  FbmSync.readLocal('activity').forEach(function (record) { var id = String(record.customerId || '').trim(); if (id) { withActivity[id] = true; } });
  var customers = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmId || '').trim() && FbmSync.TEST_CODE_PATTERN.test(String(record.fbmCustomerCode || '').trim()); });
  var ordered = customers.filter(function (record) { return withActivity[String(record.id || '').trim()]; }).concat(customers.slice().reverse());
  ordered.forEach(function (record) {
    var id = String(record.fbmCustomerCode).trim(), shinId = String(record.id || '').trim();
    if (codes.length < FbmSync.TEST_CODES_MAX && codes.indexOf(id) < 0) { codes.push(id); if (idGateMatches('customer', shinId)) { shinCodes.push(shinId); } }
  });
  if (!fbmPerfCache().get('FBM_PERF_PREVIOUS_SETTINGS')) { fbmPerfCache().put('FBM_PERF_PREVIOUS_SETTINGS', JSON.stringify({ testMode: before.testMode, testFbmCodes: before.testFbmCodes, testShinCodes: before.testShinCodes }), FBM_PERF_TTL_SECONDS); }
  var saved = FbmSync.syncSettingsSave({ testMode: true, testFbmCodes: codes, testShinCodes: shinCodes });
  return saved.ok ? 'Đã bật chế độ thử với ' + codes.length + ' mã FBM và ' + shinCodes.length + ' mã ShinCRM (' + Object.keys(withActivity).length + ' khách có giao dịch trong Sheet).' : 'LỖI ' + saved.code + ': ' + saved.message;
}
function fbmPerfTestScopeOff() {
  var raw = fbmPerfCache().get('FBM_PERF_PREVIOUS_SETTINGS');
  if (!raw) { return 'Không còn bản cài đặt cũ trong Cache; hãy sửa chế độ thử bằng tay ở Sidebar.'; }
  var saved = FbmSync.syncSettingsSave(JSON.parse(raw));
  return saved.ok ? 'Đã trả chế độ thử và danh sách mã thử về như trước khi đo.' : 'LỖI ' + saved.code + ': ' + saved.message;
}

/** Số dòng Activity của khách thử bị xóa khỏi Sheet DEV để lượt Lấy kế tiếp đi nhánh ghi giao dịch mới (`fbmPerfDropScopeActivities`). */
var FBM_PERF_DROP_ACTIVITY_ROWS = 10;

/**
 * Chuẩn bị đo nhánh ghi Sheet mà không tạo giao dịch thật trên FBM: xóa vài dòng Activity đã liên kết FBM của khách trong phạm vi thử khỏi Sheet DEV; lượt "Lấy từ FBM → ShinCRM" kế tiếp thấy chúng là giao dịch mới và ghi lại.
 * Chỉ chạy khi chế độ thử đang bật (gọi `fbmPerfTestScopeOn` trước). Xóa từ dưới lên để vị trí dòng phía trên không dịch.
 */
function fbmPerfDropScopeActivities() {
  var settings = FbmSync.syncSettingsRead(), customers = {};
  if (!settings.testMode || !settings.testShinCodes.length) { return 'LỖI: chế độ thử chưa bật; chạy fbmPerfTestScopeOn trước.'; }
  FbmSync.readLocal('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; });
  var targets = {}, picked = 0;
  FbmSync.readLocal('activity').forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim(), customer = customers[String(record.customerId || '')];
    if (picked < FBM_PERF_DROP_ACTIVITY_ROWS && fbmId && customer && FbmSync.inTestScope(customer, settings)) { targets[fbmId] = true; picked += 1; }
  });
  var sheet = shinOpenSheet('Activity'), columns = readColumnMap('Activity'), at = columnIndex(columns, '@ACT_FBM_ID');
  var count = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW), values = count ? sheet.getRange(SHEET_FIRST_DATA_ROW, at, count, 1).getValues() : [], rows = [];
  values.forEach(function (row, index) { if (targets[String(row[0] || '').trim()]) { rows.push(SHEET_FIRST_DATA_ROW + index); } });
  rows.reverse().forEach(function (row) { sheet.deleteRow(row); });
  return 'Đã xóa ' + rows.length + ' dòng Activity của khách thử khỏi Sheet DEV (FBM ID: ' + Object.keys(targets).join(', ') + ').';
}

/** Kích thước gói (MB) thử ở `fbmProbePayloadBudget`; lớn dần để thấy chỗ GAS bắt đầu chậm hoặc vỡ. */
var FBM_PERF_PAYLOAD_SIZES_MB = [0.5, 1, 5, 10, 20];

/**
 * Đo GAS xử lý một gói Activity cỡ 0,5–20 MB: giải JSON, tính hash từng bản ghi, dựng bảng id → hash. Không gọi FBM, không ghi gì.
 * Bản ghi nhân bản từ Activity thật của Sheet DEV (đổi id) để kích thước và hình dạng giống thật. Chỉ đo phía GAS; thời gian truyền gói từ Sidebar lên GAS phải đo ở lượt chạy thật.
 * GAS không có API đọc bộ nhớ, nên cỡ nào vỡ thì báo lỗi đúng cỡ đó và dừng, các cỡ trước vẫn có số.
 */
function fbmProbePayloadBudget() {
  var templates = FbmSync.readLocal('activity').filter(function (record) { return record.fbmId; });
  if (!templates.length) { return 'Sheet DEV chưa có Activity nào có mã FBM để làm mẫu.'; }
  var gate = FbmSync.readCategoryGate(), lines = ['Mẫu: ' + templates.length + ' Activity thật trên Sheet DEV'];
  for (var s = 0; s < FBM_PERF_PAYLOAD_SIZES_MB.length; s++) {
    var targetBytes = FBM_PERF_PAYLOAD_SIZES_MB[s] * 1024 * 1024, step = 'dựng gói';
    try {
      var t0 = Date.now(), records = [], bytes = 2, i = 0;
      while (bytes < targetBytes) {
        var copy = JSON.parse(JSON.stringify(templates[i % templates.length]));
        copy.fbmId = String(copy.fbmId) + '-' + i;
        records.push(copy);
        bytes += JSON.stringify(copy).length + 1;
        i++;
      }
      var text = JSON.stringify(records);
      records = null;
      var t1 = Date.now(); step = 'giải JSON';
      var parsed = JSON.parse(text);
      var t2 = Date.now(); step = 'tính hash';
      var map = {};
      parsed.forEach(function (record) { map[record.fbmId] = FbmSync.hash(record, 'activity', gate); });
      var t3 = Date.now();
      lines.push(FBM_PERF_PAYLOAD_SIZES_MB[s] + ' MB: ' + parsed.length + ' bản ghi, ' + Math.round(text.length / parsed.length) + ' B/bản ghi | giải JSON ' + (t2 - t1) + ' ms | hash + bảng id→hash ' + (t3 - t2) + ' ms (' + Math.round((t3 - t2) * 1000 / parsed.length) + ' µs/bản ghi) | dựng gói thử ' + (t1 - t0) + ' ms');
      text = null; parsed = null; map = null;
    } catch (error) {
      lines.push(FBM_PERF_PAYLOAD_SIZES_MB[s] + ' MB: VỠ lúc ' + step + ' — ' + String(error && error.message || error));
      break;
    }
  }
  return lines;
}

/** Tách chi phí một lần đọc Sheet của đồng bộ thành: dựng bối cảnh, `getValues`, chuyển ô (riêng ô ngày) để biết tối ưu chỗ nào. Chỉ đọc. */
function fbmProbeSheetReadCost() {
  return ['customer', 'activity'].map(function (entity) {
    var fields = {};
    [DATA_SCHEMA, SYNC_SCHEMA].forEach(function (schema) { var part = schema[entity] || {}; Object.keys(part).forEach(function (name) { fields[name] = part[name]; }); });
    var t0 = Date.now(), context = entityReadContext(entity, fields), t1 = Date.now();
    var block = sheetGridReadBlock(context.sheet, SHEET_FIRST_DATA_ROW, context.rowCount, context.columnMap.lastColumn), t2 = Date.now();
    var dateCells = 0, dateMs = 0, otherMs = 0;
    block.forEach(function (raw) {
      context.indexes.forEach(function (at, k) {
        var spec = context.specs[k], a = Date.now();
        entityReadCell(raw[at], spec, context.timezone);
        if (spec.type === 'DATE') { dateCells += 1; dateMs += Date.now() - a; } else { otherMs += Date.now() - a; }
      });
    });
    var t3 = Date.now(), full = entityReadAllCombined(entity, [DATA_SCHEMA, SYNC_SCHEMA]), t4 = Date.now(), lech = 0, soNgay = 0;
    block.forEach(function (raw) { context.indexes.forEach(function (at, k) { var spec = context.specs[k]; if (spec.type !== 'DATE' || !dateTextIsDate(raw[at]) || isNaN(raw[at].getTime())) { return; } soNgay += 1; if (dateToText(raw[at], spec.precision, context.timezone) !== Utilities.formatDate(raw[at], context.timezone, dateTextFormatOf(spec.precision))) { lech += 1; } }); });
    return entity + ': ' + block.length + ' dòng x ' + context.columnMap.lastColumn + ' cột Sheet, ' + context.names.length + ' trường đọc | bối cảnh ' + (t1 - t0) + ' ms | getValues ' + (t2 - t1) + ' ms | chuyển ô ' + (t3 - t2) + ' ms (ô ngày ' + dateCells + ' ô ~' + dateMs + ' ms, ô khác ~' + otherMs + ' ms) | entityReadAllCombined trọn ' + (t4 - t3) + ' ms, ' + full.rows.length + ' bản ghi | so với Utilities.formatDate: ' + lech + '/' + soNgay + ' ô ngày lệch';
  }).concat(['Múi giờ tệp: ' + shinOpenBook().getSpreadsheetTimeZone() + ' | múi giờ script: ' + Session.getScriptTimeZone() + ' | 10.000 lần ghép giờ địa phương: ' + (function () { var a = Date.now(), d = new Date(); for (var i = 0; i < 10000; i += 1) { dateTextLocal(d, 'minute'); } return Date.now() - a; })() + ' ms']).join('\n');
}

/** Đặt múi giờ tệp Sheet DEV trùng múi giờ script để đổi ô ngày đi đường nhanh (`dateTextLocal`); chỉ đổi khi hai múi giờ cùng giờ ở các mốc thử, không thì báo và giữ nguyên. */
function fbmDevAlignSheetTimezone() {
  var book = shinOpenBook(), before = book.getSpreadsheetTimeZone(), script = Session.getScriptTimeZone();
  if (before === script) { return 'Múi giờ tệp đã trùng script: ' + script; }
  var moc = [new Date(Date.UTC(1976, 0, 1)), new Date(Date.UTC(1999, 0, 1)), new Date(Date.UTC(2026, 6, 1))], lech = moc.filter(function (d) { return Utilities.formatDate(d, before, 'Z') !== Utilities.formatDate(d, script, 'Z'); });
  if (lech.length) { return 'Không đổi: ' + before + ' và ' + script + ' khác giờ ở ' + lech.length + ' mốc thử.'; }
  book.setSpreadsheetTimeZone(script);
  return 'Đã đổi múi giờ tệp từ ' + before + ' sang ' + book.getSpreadsheetTimeZone();
}
