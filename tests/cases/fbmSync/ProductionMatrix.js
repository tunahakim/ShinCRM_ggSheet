/** Ma trận offline cho kỳ đồng bộ nhiều Customer/Activity và lỗi vận chuyển. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');

function propertyStore() {
  const data = {};
  return {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setProperty(key, value) { data[key] = String(value); },
    deleteProperty(key) { delete data[key]; },
    data
  };
}

function clone(value) { return JSON.parse(JSON.stringify(value)); }

function makeSync() {
  const documentProperties = propertyStore();
  const local = { customer: [], activity: [] };
  const writes = [];
  const logs = [];
  const hop = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, SETTINGS: { CHUNK_ROWS: 2000 }, Date,
    PropertiesService: { getDocumentProperties: () => documentProperties, getScriptProperties: () => documentProperties },
    logEvent(event) { logs.push(event); }, logTrace() {}, LOG_OK: 'ok', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict', flushLog() {},
    Utilities: { getUuid: () => 'production-matrix-uuid' },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    shinOpenBook: () => ({ getId: () => 'production-matrix-sheet' })
  });
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    'fbm_sync/state/State.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Conflict.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/Pull.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js',
    'fbm_sync/transport/PullFlow.js',
    'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  hop.FbmSync.readLocal = (entity) => local[entity].map(clone);
  hop.writeGateSave = (request) => {
    writes.push(request);
    const entity = request.entity;
    (request.records || []).forEach((patch) => {
      const id = String(patch.id || '');
      let index = local[entity].findIndex((item) => String(item.id || '') === id);
      if (index < 0) {
        index = local[entity].length;
        local[entity].push(Object.assign({}, patch, { id: id || (entity === 'customer' ? 'CUS-' : 'ACT-') + String(index + 1).padStart(6, '0') }));
      } else {
        local[entity][index] = Object.assign({}, local[entity][index], patch);
      }
    });
    return { ok: true };
  };
  hop.FbmSync.configValue = () => '';
  hop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [] });
  return { hop, local, writes, logs, documentProperties };
}

function customer(id, code, name) {
  return { fbmId: id, fbmCustomerCode: code, companyName: name, taxNumber: '010000' + code.slice(-2), phone: '0900000000', email: code.toLowerCase() + '@example.test', address: 'Hà Nội', province: 'Hà Nội', contactPerson: 'Người liên hệ', leadSource: '', product: '', allowFbmPush: 'Cho phép', syncStatus: 'đã đồng bộ' };
}

function activity(id, customerCode, content) {
  return { fbmId: id, customerFbmCode: customerCode, workDate: '2026-09-19', taskType: 'Gọi điện', content, owner: 'Le Tuan Anh', allowFbmPush: 'Cho phép', syncStatus: 'đã đồng bộ' };
}

async function chay(so) {
  section('FBM sync — ma trận production nhiều bản ghi');

  const protocol = makeSync().hop;
  const fixedNow = 1700000000000;
  const originalNow = protocol.Date.now;
  protocol.Date.now = () => fixedNow;
  const first = protocol.FbmSync.nextEnvelope({ url: 'https://fbm.test/request', body: {}, meta: { kind: 'grid' } });
  const second = protocol.FbmSync.nextEnvelope({ url: 'https://fbm.test/request', body: {}, meta: { kind: 'grid' } });
  protocol.Date.now = originalNow;
  check(so, 'hai envelope cung mili-giay van co requestId khac nhau', [first.id, second.id, first.id !== second.id], [first.id, second.id, true]);

  const sync = makeSync();
  const state = sync.hop.FbmSync.stateStart('', 'pull_customer', 0);
  state.mode = 'read';
  state.metadata.categoryGate = { map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true }, '@CAT_CONG_VIEC': { 'Gọi điện': true } }, warnings: [] };
  sync.hop.FbmSync.stateWrite(state);
  const customers = [customer('FBM-C1', 'ALT00001', 'Công ty 1'), customer('FBM-C2', 'ALT00002', 'Công ty 2'), customer('FBM-C3', 'ALT00003', 'Công ty 3')];
  const firstPull = sync.hop.FbmSync.pullWrite('customer', customers);
  const secondPull = sync.hop.FbmSync.pullWrite('customer', customers);
  check(so, 'pull nhieu Customer tao dung ba dong', [firstPull.ok, firstPull.written, sync.local.customer.length], [true, 3, 3]);
  check(so, 'pull lap lai cung tap Customer khong tao dong trung', [secondPull.ok, secondPull.written, sync.local.customer.length, new Set(sync.local.customer.map((item) => item.fbmId)).size], [true, 0, 3, 3]);

  const activities = [
    activity('FBM-A1', 'ALT00001', 'Cuoc goi 1'), activity('FBM-A2', 'ALT00001', 'Cuoc goi 2'),
    activity('FBM-A3', 'ALT00002', 'Cuoc goi 3'), activity('FBM-A4', 'ALT00002', 'Cuoc goi 4'),
    activity('FBM-A5', 'ALT00003', 'Cuoc goi 5'), activity('FBM-A6', 'ALT00003', 'Cuoc goi 6')
  ];
  const activityPull = sync.hop.FbmSync.pullWrite('activity', activities);
  const activityAgain = sync.hop.FbmSync.pullWrite('activity', activities);
  check(so, 'pull nhieu Activity noi dung vao dung ba Customer cha', [activityPull.ok, activityPull.written, sync.local.activity.length, new Set(sync.local.activity.map((item) => item.customerId)).size], [true, 6, 6, 3]);
  check(so, 'pull lap lai Activity giu idempotency', [activityAgain.ok, activityAgain.written, sync.local.activity.length], [true, 0, 6]);

  const pageState = sync.hop.FbmSync.stateRead();
  pageState.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2 };
  sync.hop.FbmSync.stateWrite(pageState);
  const pageRows = [{ stt_rec_kh: 'FBM-C1', ma_kh: 'ALT00001', ngay_gd: '2026-09-19', datetime0: '2026-09-19T01:00:00', xorder: 1 }, { stt_rec_kh: 'FBM-C2', ma_kh: 'ALT00002', ngay_gd: '2026-09-18', datetime0: '2026-09-18T01:00:00', xorder: 2 }];
  const nextPage = sync.hop.FbmSync.customerNext(sync.hop.FbmSync.stateRead(), pageRows, 3);
  check(so, 'cursor Customer nhieu trang dung composite key va trang ke tiep', [nextPage.body.type, nextPage.body.gridPageIndex, nextPage.body.gridPageValue], [1, 0, ['2026-09-18', '2026-09-18T01:00:00', 2]]);

  const bulkLocal = [];
  for (let index = 0; index < 2505; index += 1) {
    const id = 'ACT-' + String(index).padStart(6, '0');
    bulkLocal.push({ id, fbmId: 'FBM-' + id, workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  }
  const bulk = makeSync();
  bulk.local.activity.push(...bulkLocal);
  bulk.hop.FbmSync.seenStoreBegin('activity_bulk', bulkLocal);
  bulk.hop.FbmSync.seenStoreMark('activity_bulk', bulkLocal, bulkLocal.slice(0, 5));
  const beforeBulkWrites = bulk.writes.length;
  const missing = bulk.hop.FbmSync.writeActivityBulkMissing(bulkLocal);
  const bulkWrites = bulk.writes.slice(beforeBulkWrites);
  check(so, 'missing Activity lon hon 2000 dong duoc cat thanh hai lan cua ghi', [missing.total, missing.written, bulkWrites.length, bulkWrites[0].records.length, bulkWrites[1].records.length], [2500, 2500, 2, 2000, 500]);

  const retry = makeSync();
  const retryState = retry.hop.FbmSync.stateStart('', 'pull_customer', 0);
  retryState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 4, pageValue: ['x', 'y', 'z'], count: 2000 };
  retryState.retryLimit = 2;
  retry.hop.FbmSync.stateWrite(retryState);
  const transient = { ok: false, status: 500, body: '{"Message":"server busy"}' };
  const retry1 = retry.hop.FbmSync.retryRead(retry.hop.FbmSync.stateRead(), retry.hop.FbmSync.protocol.classifyFailure(transient));
  const retry2 = retry.hop.FbmSync.retryRead(retry.hop.FbmSync.stateRead(), retry.hop.FbmSync.protocol.classifyFailure(transient));
  const retry3 = retry.hop.FbmSync.retryRead(retry.hop.FbmSync.stateRead(), retry.hop.FbmSync.protocol.classifyFailure(transient));
  check(so, 'loi mang doc chi retry toi da hai lan va giu nguyen cursor', [retry1 && retry1.body.gridPageIndex, retry2 && retry2.body.gridPageIndex, retry3, retry.hop.FbmSync.stateRead().retryCount], [4, 4, null, 2]);

  const empty = makeSync();
  const emptyState = empty.hop.FbmSync.stateStart('', 'pull_customer', 0);
  emptyState.mode = 'read';
  empty.hop.FbmSync.stateWrite(emptyState);
  const emptyCustomer = empty.hop.FbmSync.pullWrite('customer', []);
  const emptyActivity = empty.hop.FbmSync.pullWrite('activity', []);
  const finishedEmpty = empty.hop.FbmSync.stateRead();
  finishedEmpty.phase = 'done'; finishedEmpty.cursor = {}; finishedEmpty.counts = { total: 0, completed: 0, succeeded: 0, skipped: 0, conflict: 0, error: 0 };
  empty.hop.FbmSync.stateWrite(finishedEmpty);
  empty.hop.FbmSync.logStatus(empty.hop.FbmSync.statusView(), 'empty_run');
  const emptyCounts = empty.hop.FbmSync.stateRead().counts;
  check(so, 'phiên rỗng hai phía kết thúc với mọi bộ đếm bằng 0 và chỉ một tổng kết', [emptyCustomer.written, emptyActivity.written, empty.writes.length, [emptyCounts.total, emptyCounts.completed, emptyCounts.succeeded, emptyCounts.skipped, emptyCounts.conflict, emptyCounts.error], empty.logs.length, empty.logs[0] && empty.logs[0].action], [0, 0, 0, [0, 0, 0, 0, 0, 0], 1, 'empty_run']);
}

module.exports = { chay };
