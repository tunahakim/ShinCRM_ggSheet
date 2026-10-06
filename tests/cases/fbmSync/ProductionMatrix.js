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

  // Hàng đợi push: Sheet giả trong bộ nhớ, danh sách ứng viên dựng lại từ Sheet sau mỗi bản ghi như GAS thật.
  function pushQueue(customers, activities) {
    const run = makeSync(), F = run.hop.FbmSync;
    run.local.customer.push(...customers); run.local.activity.push(...(activities || []));
    F.scriptSettings = () => ({ accountName: 'Le Tuan Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
    F.validatePushCategories = () => [];
    F.nextEnvelope = (request) => request;
    const st = F.stateStart('', 'push', 0);
    st.mode = 'write'; st.phase = 'push'; st.metadata.categoryGate = { map: {}, names: {}, valid: {}, blocked: {} };
    st.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    F.stateWrite(st);
    return { run, F };
  }
  const editCustomer = (x) => ({ id: 'CUS-' + x, fbmId: 'F-' + x, fbmCustomerCode: 'ALT0000' + x, companyName: 'Cty ' + x, taxNumber: '010' + x, contactPerson: 'Người liên hệ', phone: '0900000000', leadSource: 'Web', address: 'Hà Nội', province: 'Hà Nội', allowFbmPush: 'Cho phép', syncStatus: 'đã đồng bộ', fbmHash: 'cũ' });

  const skipOnError = pushQueue(['A', 'B', 'C'].map(editCustomer));
  const triedOnError = [];
  let errorRequest = skipOnError.F.nextPushRequest(skipOnError.F.stateRead());
  for (let guard = 0; guard < 5 && errorRequest; guard += 1) {
    const current = skipOnError.F.stateRead(); triedOnError.push(current.cursor.candidate.id);
    errorRequest = skipOnError.F.continueAfterPushError(current, current.cursor, { reason: 'FBM từ chối', code: 'FBM_ERROR' }).request;
  }
  check(so, 'FBM-032: ba Customer liên tiếp bị FBM từ chối thì phiên vẫn thử đủ cả ba, không bỏ sót bản ghi ở giữa', triedOnError, ['CUS-A', 'CUS-B', 'CUS-C']);

  const skipOnSuccess = pushQueue(['A', 'B', 'C'].map(editCustomer));
  const triedOnSuccess = [];
  let successRequest = skipOnSuccess.F.nextPushRequest(skipOnSuccess.F.stateRead());
  for (let guard = 0; guard < 5 && successRequest; guard += 1) {
    const current = skipOnSuccess.F.stateRead(), id = current.cursor.candidate.id;
    triedOnSuccess.push(id);
    // Như finishPushVerification: bản ghi đã đồng bộ rời danh sách ứng viên, cursor tiến qua dòng của nó.
    const row = skipOnSuccess.run.local.customer.find((item) => item.id === id);
    row.syncStatus = 'đã đồng bộ'; row.fbmHash = skipOnSuccess.F.hash(row, 'customer', {});
    current.cursor = { kind: 'push_scan', entity: 'customer', index: current.cursor.index + 1 };
    skipOnSuccess.F.stateWrite(current);
    successRequest = skipOnSuccess.F.nextPushRequest(skipOnSuccess.F.stateRead());
  }
  check(so, 'FBM-032: bản ghi vừa đẩy xong rời danh sách ứng viên thì bản ghi kế tiếp vẫn được đẩy', triedOnSuccess, ['CUS-A', 'CUS-B', 'CUS-C']);

  const stuckActivity = { id: 'ACT-STUCK', customerId: 'CUS-A', fbmId: '', workDate: '2026-09-19', taskType: 'Gọi điện', content: 'Gọi lại', owner: 'Le Tuan Anh', allowFbmPush: 'Cho phép', syncStatus: 'đang đẩy' };
  const stuck = pushQueue([editCustomer('A')], [stuckActivity]);
  stuck.run.local.customer[0].fbmHash = stuck.F.hash(stuck.run.local.customer[0], 'customer', {});
  const stuckRequest = stuck.F.nextPushRequest(stuck.F.stateRead());
  stuck.F.recordIssuesFlush();
  const stuckState = stuck.F.stateRead(), stuckLog = stuck.run.logs.find((event) => event.action === 'push_record_issue');
  check(so, 'FBM-027: Activity "đang đẩy" chưa có ID FBM không được gửi lại lệnh tạo; giữ "đang đẩy", phiên báo lỗi và Log có ID bản ghi',
    [stuckRequest, stuck.run.local.activity[0].syncStatus, stuckState.phase, stuckState.counts.error, Object.keys(stuckState.metadata.pushFailures), /ACT-STUCK/.test(JSON.stringify(stuckLog)), /Mở lại bản ghi lỗi/.test(JSON.stringify(stuckLog))],
    [null, 'đang đẩy', 'done', 1, ['activity:ACT-STUCK'], true, true]);

  const lostCustomer = Object.assign(editCustomer('N'), { id: 'CUS-LOST', fbmId: '', fbmCustomerCode: '', taxNumber: '0101234567', syncStatus: 'đang đẩy', fbmHash: '' });
  const customerGridFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ngay_gd', 'datetime0', 'xorder'];
  const taxRows = (rows) => ({ d: { TotalRowCount: rows.length, Rows: rows.map((row) => customerGridFields.map((field) => row[field] === undefined ? '' : row[field])), ViewPage: { Fields: customerGridFields.map((AliasName) => ({ AliasName })) } } });
  const recoverFound = pushQueue([lostCustomer]);
  const lookup = recoverFound.F.nextPushRequest(recoverFound.F.stateRead());
  check(so, 'FBM-027: Customer "đang đẩy" chưa có ID FBM ở phiên sau chỉ phát request tra theo MST, không phát lệnh tạo',
    [lookup && lookup.meta && lookup.meta.kind, JSON.stringify(lookup && lookup.body && lookup.body.filter), recoverFound.F.stateRead().cursor.operation],
    ['grid', JSON.stringify(['ma_so_thue:**0101234567']), 'customer_create_recover']);
  const afterFound = recoverFound.F.continuePush(recoverFound.F.stateRead(), taxRows([{ stt_rec_kh: 'FBM-OTHER', ma_kh: 'ALT00078', ma_so_thue: '01012345678' }, { stt_rec_kh: 'FBM-LOST', ma_kh: 'ALT00077', ma_so_thue: '0101234567', ten_kh: 'Tên đã sửa bên FBM' }]));
  const foundRow = recoverFound.run.local.customer[0];
  check(so, 'FBM-027: tra thấy đúng một Customer khớp chính xác MST thì vá stt_rec_kh và ma_kh, chuyển "chờ đối soát", baseline rỗng, không tạo lại',
    [foundRow.fbmId, foundRow.fbmCustomerCode, foundRow.syncStatus, foundRow.fbmHash, afterFound, recoverFound.F.stateRead().counts.error],
    ['FBM-LOST', 'ALT00077', 'chờ đối soát', '', null, 0]);

  const recoverMissing = pushQueue([Object.assign({}, lostCustomer)]);
  recoverMissing.F.nextPushRequest(recoverMissing.F.stateRead());
  let missingError = null;
  try { recoverMissing.F.continuePush(recoverMissing.F.stateRead(), taxRows([{ stt_rec_kh: 'FBM-OTHER', ma_kh: 'ALT00078', ma_so_thue: '01012345678' }])); } catch (error) { missingError = error; }
  const missingState = recoverMissing.F.stateRead();
  const afterMissing = recoverMissing.F.continueAfterPushError(missingState, missingState.cursor, missingError && missingError.message);
  check(so, 'FBM-027: tra không thấy Customer khớp chính xác MST thì báo lỗi, giữ "đang đẩy" và không phát lệnh tạo lại',
    [/không tự tạo lại/i.test(missingError && missingError.message), recoverMissing.run.local.customer[0].syncStatus, afterMissing.request, recoverMissing.F.stateRead().counts.error],
    [true, 'đang đẩy', null, 1]);

  const openFailed = pushQueue([Object.assign({}, lostCustomer)]);
  openFailed.F.markPushError(openFailed.F.stateRead(), { entity: 'customer', kind: 'create', id: 'CUS-LOST', record: lostCustomer }, { reason: 'Không mở được form tạo', code: 'FBM_ERROR' }, 'customer_create_open');
  const sentFailed = pushQueue([Object.assign({}, lostCustomer)]);
  sentFailed.F.markPushError(sentFailed.F.stateRead(), { entity: 'customer', kind: 'create', id: 'CUS-LOST', record: lostCustomer }, { reason: 'Mất phản hồi', code: 'FBM_ERROR' }, 'customer_create_save');
  check(so, 'FBM-027: lỗi ở bước mở form tạo (lệnh lưu chưa phát) thì chuyển "đẩy lỗi"; lỗi sau khi đã phát lệnh lưu thì giữ "đang đẩy"',
    [openFailed.run.local.customer[0].syncStatus, sentFailed.run.local.customer[0].syncStatus], ['đẩy lỗi', 'đang đẩy']);
}

module.exports = { chay };
