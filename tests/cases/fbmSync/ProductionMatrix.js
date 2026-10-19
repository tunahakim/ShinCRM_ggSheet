/** Ma trận offline cho kỳ đồng bộ nhiều Customer/Activity và lỗi vận chuyển. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, giuBanGhi } = require('../../lib/load-gas');

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
    'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Conflict.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/Pull.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js',
    'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js',
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
  return { fbmId: id, fbmCustomerCode: code, companyName: name, taxNumber: '010000' + code.slice(-2), phone: '0900000000', email: code.toLowerCase() + '@example.test', address: 'Hà Nội', province: 'Hà Nội', contactPerson: 'Người liên hệ', leadSource: '', product: '', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ' };
}

function activity(id, customerCode, content) {
  return { fbmId: id, customerFbmCode: customerCode, customerFbmId: 'FBM-C' + Number(customerCode.slice(3)), workDate: '2026-09-19', taskType: 'Gọi điện', content, owner: 'Le Tuan Anh', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ' };
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
  sync.hop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true }, '@CAT_CONG_VIEC': { 'Gọi điện': true } }, warnings: [] });
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
  pageState.cursor = { kind: 'scan_job', entity: 'customer', type: 0, pageIndex: -1, pageValue: null, count: 2 };
  sync.hop.FbmSync.stateWrite(pageState);
  const pageRows = [{ stt_rec_kh: 'FBM-C1', ma_kh: 'ALT00001', ngay_gd: '2026-09-19', datetime0: '2026-09-19T01:00:00', xorder: 1 }, { stt_rec_kh: 'FBM-C2', ma_kh: 'ALT00002', ngay_gd: '2026-09-18', datetime0: '2026-09-18T01:00:00', xorder: 2 }];
  const pageNextState = sync.hop.FbmSync.stateRead(), hasNextPage = sync.hop.FbmSync.customerNext(pageNextState, sync.hop.FbmSync.customerPageOf(pageRows), 3);
  sync.hop.FbmSync.scanJobOpen(pageNextState, pageNextState.cursor);
  const nextPage = sync.hop.FbmSync.scanJobRequest(pageNextState);
  check(so, 'cursor Customer nhieu trang dung composite key bốn giá trị kèm stt_rec_kh (Nghiên cứu FBM ch04 mục 4.10) va trang ke tiep là chỉ số 1, đang đứng ở chỉ số 0', [hasNextPage, nextPage.meta.kind, nextPage.body.type, nextPage.body.gridPageIndex, nextPage.body.lastPageIndex, nextPage.body.gridPageValue], [true, 'scan_job', 1, 1, 0, ['2026-09-18', '2026-09-18T01:00:00', 2, 'FBM-C2']]);

  // Cửa ghi gắn cờ hàng loạt (khách chuyển quyền kéo theo mọi giao dịch): cắt theo gói CHUNK_ROWS dòng, đếm đủ.
  const bulkLocal = [];
  for (let index = 0; index < 2500; index += 1) {
    const id = 'ACT-' + String(index).padStart(6, '0');
    bulkLocal.push({ id, fbmId: String(700000 + index), workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  }
  const bulk = makeSync();
  bulk.local.activity.push(...bulkLocal);
  const beforeBulkWrites = bulk.writes.length;
  const bulkState = bulk.hop.FbmSync.stateRead();
  const bulkWritten = bulk.hop.FbmSync.gateFlagWrite(bulkState, 'activity', bulkLocal.map((record) => ({ record, status: bulk.hop.FbmSync.SYNC_STATUS.missing, reason: 'thử' })));
  const bulkWrites = bulk.writes.slice(beforeBulkWrites);
  check(so, 'Cửa ghi gắn cờ 2.500 giao dịch được cắt thành hai lần qua cửa ghi Sheet (2.000 và 500), đếm đủ 2.500', [bulkWritten, bulkState.counts.missingActivity, bulkWrites.length, bulkWrites[0].records.length, bulkWrites[1].records.length], [2500, 2500, 2, 2000, 500]);

  // Cờ ghi hai Sheet (khách, giao dịch) bằng hai lần qua cửa ghi. Lần thứ hai hỏng thì lượt ném lỗi; lần chạy lại không ghi lại khách đã mang cờ nhưng vẫn đếm đúng một.
  const haiCua = makeSync();
  haiCua.local.customer.push({ id: 'CUS-000001', fbmId: 'FC-1', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  haiCua.local.activity.push({ id: 'ACT-000001', customerId: 'CUS-000001', fbmId: '700001', workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'đã đồng bộ' });
  const haiCuaLuot = () => {
    const F = haiCua.hop.FbmSync, st = F.stateRead(), co = F.SYNC_STATUS.missing;
    st.counts = F.countsDefault();
    F.gateFlagWrite(st, 'customer', [{ record: haiCua.local.customer[0], status: co, reason: 'thử' }]);
    F.gateFlagWrite(st, 'activity', [{ record: haiCua.local.activity[0], status: co, reason: 'thử' }]);
    return st;
  };
  const ghiThat = haiCua.hop.writeGateSave;
  haiCua.hop.writeGateSave = (request) => { if (request.entity === 'activity') { throw new Error('Sheet Activity đang bận'); } return ghiThat(request); };
  let loiLuot1 = '';
  try { haiCuaLuot(); } catch (error) { loiLuot1 = error.message; }
  haiCua.hop.writeGateSave = ghiThat;
  const ghiLuot1 = haiCua.writes.map((item) => item.entity + ':' + item.records.map((record) => record.id).join(','));
  const truocLuot2 = haiCua.writes.length, luot2 = haiCuaLuot();
  const ghiLuot2 = haiCua.writes.slice(truocLuot2).map((item) => item.entity + ':' + item.records.map((record) => record.id).join(','));
  check(so, 'Gắn cờ ở cửa ghi: lần ghi giao dịch hỏng sau khi khách đã mang cờ thì lượt ném lỗi; lần chạy lại chỉ ghi giao dịch, khách đã mang cờ không ghi lại và vẫn đếm đúng một', [
    loiLuot1, ghiLuot1, ghiLuot2, luot2.counts.missingCustomer, luot2.counts.missingActivity
  ], ['Sheet Activity đang bận', ['customer:CUS-000001'], ['activity:ACT-000001'], 1, 1]);

  // Phạm vi "Chỉ khách chỉ định": khách trong phạm vi mà danh sách FBM không trả vào danh sách đọc để cửa ghi xét; khách ngoài phạm vi không được xét.
  const phamVi = makeSync();
  phamVi.local.customer.push({ id: 'CUS-000001', fbmId: 'FC-1', fbmCustomerCode: 'ALT1', recordStatus: 'active', syncStatus: 'đã đồng bộ', fbmSyncPermission: 'Cho phép' }, { id: 'CUS-000002', fbmId: 'FC-2', fbmCustomerCode: 'ALT2', recordStatus: 'active', syncStatus: 'đã đồng bộ', fbmSyncPermission: 'Cho phép' });
  phamVi.hop.FbmSync.scopeLimited = () => true;
  phamVi.hop.FbmSync.scope = () => ({ codes: ['ALT1'], fbm: ['ALT1'], shin: ['CUS-000001'], notFound: [] });
  phamVi.hop.FbmSync.readListClear();
  phamVi.hop.FbmSync.seenStoreBegin('customer', phamVi.local.customer);
  const phamViState = phamVi.hop.FbmSync.stateRead();
  phamViState.mode = 'read';
  const vaoDanhSach = phamVi.hop.FbmSync.customerAbsentMark(phamViState), docTrongLuot = phamVi.hop.FbmSync.seenStoreReader(phamVi.hop.FbmSync.READ_LIST_STORE);
  check(so, 'Phạm vi khách chỉ định: khách trong phạm vi vắng ở danh sách FBM vào danh sách đọc, khách ngoài phạm vi không vào, không ghi cờ nào trước cửa ghi', [vaoDanhSach, docTrongLuot(phamVi.local.customer[0]), docTrongLuot(phamVi.local.customer[1]), phamVi.writes.length], [1, true, false, 0]);

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
    F.scriptSettings = () => ({ accountName: 'Le Tuan Anh', userId: '2037', customerPrefix: 'ALT', customerCodeLength: 8 });
    F.validatePushCategories = () => [];
    F.nextEnvelope = (request) => request;
    const st = F.stateStart('', 'push', 0);
    st.mode = 'write'; st.phase = 'push'; 
    st.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    // Lượt đẩy luôn bắt đầu sau lô danh mục vừa đọc.
    st.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
    F.stateWrite(st);
    return { run, F };
  }
  const editCustomer = (x) => ({ id: 'CUS-' + x, fbmId: 'F-' + x, fbmCustomerCode: 'ALT0000' + x, companyName: 'Cty ' + x, taxNumber: '010' + x, contactPerson: 'Người liên hệ', phone: '0900000000', leadSource: 'Web', address: 'Hà Nội', province: 'Hà Nội', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ', fbmHash: 'cũ' });

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

  const stuckActivity = { id: 'ACT-STUCK', customerId: 'CUS-A', fbmId: '', workDate: '2026-09-19', taskType: 'Gọi điện', content: 'Gọi lại', owner: 'Le Tuan Anh', fbmSyncPermission: 'Cho phép', syncStatus: 'đang đẩy' };
  const stuck = pushQueue([editCustomer('A')], [stuckActivity]);
  stuck.run.local.customer[0].fbmHash = stuck.F.hash(stuck.run.local.customer[0], 'customer', {});
  const stuckRequest = stuck.F.nextPushRequest(stuck.F.stateRead());
  stuck.F.recordIssuesFlush();
  const stuckState = stuck.F.stateRead(), stuckLog = stuck.run.logs.find((event) => event.action === 'push_record_issue');
  check(so, 'FBM-027: Activity "đang đẩy" chưa có ID FBM không được gửi lại lệnh tạo; giữ "đang đẩy", phiên báo lỗi và Log có ID bản ghi',
    [stuckRequest, stuck.run.local.activity[0].syncStatus, stuckState.phase, stuckState.counts.error, Object.keys(stuck.F.pushFailuresRead().hashes), /ACT-STUCK/.test(JSON.stringify(stuckLog)), /Mở lại bản ghi lỗi/.test(JSON.stringify(stuckLog))],
    [null, 'đang đẩy', 'done', 1, ['activity:ACT-STUCK'], true, true]);

  const lostCustomer = Object.assign(editCustomer('N'), { id: 'CUS-LOST', fbmId: '', fbmCustomerCode: '', taxNumber: '0101234567', syncStatus: 'đang đẩy', fbmHash: '' });
  const customerGridFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
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

  // Chế độ xung đột (FBM-024): hàng đợi là các dòng Sheet "xung đột chờ quyết", state chỉ giữ số đếm và một bản ghi đang mở.
  const conflictGridFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
  const fbmRow = (id, code, name) => ({ stt_rec_kh: id, ma_kh: code, ten_kh: name, ma_so_thue: '010000' + code.slice(-2), ong_ba: 'Người liên hệ', dc_lh: 'Hà Nội', dien_thoai: '0900000000', email: code.toLowerCase() + '@example.test', ten_dclh_tinh: 'Hà Nội' });
  const gridResponse = (requestId, rows) => ({ trace: [{ requestId, stage: 'fetch' }], d: { TotalRowCount: rows.length, Rows: rows.map((row) => conflictGridFields.map((field) => row[field] === undefined ? '' : row[field])), ViewPage: { Fields: conflictGridFields.map((AliasName) => ({ AliasName })) } } });
  const nameDiff = (dto) => ((dto && dto.fields) || []).filter((item) => /Tên/.test(String(item.left)))[0] || {};
  const cf = makeSync(), CF = cf.hop.FbmSync;
  CF.masterEnabled = () => true;
  const cfState = CF.stateStart('', 'pull_customer', 0);
  const cfGate = { map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true } }, warnings: [] };
  cfState.mode = 'read'; CF.readCategoryGate = () => cfGate; CF.stateWrite(cfState);
  const cfIds = [1, 2, 3];
  CF.pullWrite('customer', cfIds.map((n) => CF.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên gốc ' + n), {})));
  cf.local.customer.forEach((row) => { row.companyName = 'Tên Shin ' + row.fbmCustomerCode.slice(-1); });
  const cfPull = CF.pullWrite('customer', cfIds.map((n) => CF.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên FBM ' + n), {})));
  const cfAfterPull = CF.stateRead();
  check(so, 'FBM-024: pull gặp xung đột chỉ ghi trạng thái "xung đột chờ quyết" lên Sheet; state không giữ danh sách hay giá trị hai bên',
    [cfPull.conflicts, cf.local.customer.map((row) => row.syncStatus), cf.local.customer.map((row) => row.companyName), 'conflicts' in cfAfterPull.metadata, Object.keys(cfAfterPull.locks || {}).length],
    [3, ['xung đột chờ quyết', 'xung đột chờ quyết', 'xung đột chờ quyết'], ['Tên Shin 1', 'Tên Shin 2', 'Tên Shin 3'], false, 0]);
  const cfRepull = CF.pullWrite('customer', cfIds.map((n) => CF.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên FBM khác ' + n), {})));
  check(so, 'FBM-024: pull lần sau so lại dòng đang xung đột chờ quyết; còn xung đột thì giữ nguyên, không ghi đè, không cộng vào số chờ quyết nhưng vẫn báo là xung đột, không tính Bỏ qua',
    [cfRepull.conflicts, cfRepull.conflictsKept, cfRepull.skipped, cf.local.customer.map((row) => row.companyName), cf.local.customer[0].syncStatus], [0, 3, 0, ['Tên Shin 1', 'Tên Shin 2', 'Tên Shin 3'], 'xung đột chờ quyết']);
  CF.scriptSettings = () => ({ accountName: 'Le Tuan Anh', userId: '2037', customerPrefix: 'ALT', customerCodeLength: 8, baseUrl: 'https://fbm.test' });
  check(so, 'FBM-024: dòng đang xung đột chờ quyết không vào danh sách đẩy', CF.pushCandidates('customer').length, 0);

  // Xung đột không khóa đồng bộ: mỗi kỳ pull so ba chiều lại với baseline cũ. Bốn khách: FBM đổi cho khớp ShinCRM, FBM quay về gốc, ShinCRM quay về gốc, vẫn khác nhau.
  const rv = makeSync(), RV = rv.hop.FbmSync;
  RV.masterEnabled = () => true;
  const rvState = RV.stateStart('', 'pull_customer', 0);
  rvState.mode = 'read'; RV.readCategoryGate = () => cfGate; RV.stateWrite(rvState);
  const rvIds = [1, 2, 3, 4];
  RV.pullWrite('customer', rvIds.map((n) => RV.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên gốc ' + n), {})));
  const rvBase = rv.local.customer.map((row) => row.fbmHash);
  rv.local.customer.forEach((row) => { row.companyName = 'Tên Shin ' + row.fbmCustomerCode.slice(-1); });
  RV.pullWrite('customer', rvIds.map((n) => RV.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên FBM ' + n), {})));
  rv.local.customer[2].companyName = 'Tên gốc 3';
  const rvFbm = ['Tên Shin 1', 'Tên gốc 2', 'Tên FBM 3', 'Tên FBM khác 4'];
  const rvPull = RV.pullWrite('customer', rvIds.map((n) => RV.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, rvFbm[n - 1]), {})));
  check(so, 'Xung đột được so lại mỗi kỳ: khớp nhau thì đã đồng bộ, FBM về gốc thì chờ đẩy, ShinCRM về gốc thì lấy FBM, còn khác thì vẫn xung đột; ba dòng gỡ được trừ khỏi số chờ quyết, dòng chờ đẩy không tính Bỏ qua',
    [rv.local.customer.map((row) => row.syncStatus), rv.local.customer.map((row) => row.companyName), rvPull.conflicts, rvPull.conflictsKept, rvPull.conflictsCleared, rvPull.skipped],
    [['đã đồng bộ', 'chờ đối soát', 'đã đồng bộ', 'xung đột chờ quyết'], ['Tên Shin 1', 'Tên Shin 2', 'Tên FBM 3', 'Tên Shin 4'], 0, 1, 3, 0]);
  const rvFlow = makeSync(), RVF = rvFlow.hop.FbmSync;
  RVF.pullWrite = () => ({ ok: true, written: 2, conflicts: 1, conflictsKept: 2, conflictsCleared: 3, skipped: 0 });
  const rvFlowState = RVF.stateStart('', 'pull_customer', 0);
  rvFlowState.mode = 'read'; rvFlowState.metadata.conflictCount = 5; RVF.stateWrite(rvFlowState);
  RVF.pullRecords('customer', [{}], 'write');
  const rvFlowAfter = RVF.stateRead();
  check(so, 'Sau lượt lấy về: ô Xung đột của phiên cộng xung đột mới và dòng vẫn xung đột; số chờ quyết trên Sidebar cộng mới, trừ dòng đã gỡ',
    [rvFlowAfter.counts.conflict, rvFlowAfter.metadata.conflictCount], [3, 3]);
  const fl = makeSync(), FL = fl.hop.FbmSync;
  fl.local.activity.push({ id: 'ACT-000001', fbmId: '700001', workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'xung đột chờ quyết' });
  const flState = FL.stateRead();
  flState.counts = FL.countsDefault(); flState.metadata.conflictCount = 1;
  const flWritten = FL.gateFlagWrite(flState, 'activity', [{ record: fl.local.activity[0], status: FL.SYNC_STATUS.missing, reason: 'thử' }]);
  check(so, 'Giao dịch đang xung đột chờ quyết mà FBM đã xóa vẫn nhận cờ không thấy bên FBM, rời hàng đợi xung đột và được đếm',
    [flWritten, fl.local.activity[0].syncStatus, flState.counts.missingActivity, flState.metadata.conflictCount], [1, FL.SYNC_STATUS.missing, 1, 0]);
  check(so, 'Gỡ xung đột ghi baseline mới bằng hash FBM khi hai phía khớp hoặc lấy FBM; FBM về gốc và dòng còn xung đột giữ baseline cũ',
    [rv.local.customer[0].fbmHash !== rvBase[0], rv.local.customer[1].fbmHash === rvBase[1], rv.local.customer[2].fbmHash !== rvBase[2], rv.local.customer[3].fbmHash === rvBase[3]], [true, true, true, true]);
  check(so, 'Dòng xung đột chờ quyết luôn được đọc lại từ FBM, kể cả khi FBM đã quay về gốc nên danh sách không lộ thay đổi', RV.readAgainStatus({ syncStatus: 'xung đột chờ quyết' }), true);

  const cfNewRun = CF.stateStart('', 'checking_session', 0);
  cfNewRun.phase = 'done'; CF.stateWrite(cfNewRun);
  CF.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const cfOpen = CF.openConflict();
  check(so, 'FBM-024: phiên mới không làm mất hàng đợi xung đột; mở chế độ xung đột chỉ phát request đọc bản ghi FBM đầu hàng đợi',
    [cfOpen.ok, cfOpen.remaining, cfOpen.request && cfOpen.request.meta.kind, cfOpen.request && cfOpen.request.meta.conflictId, CF.stateRead().metadata.conflictRefresh.stage],
    [true, 3, 'conflict_refresh_grid', 'CUS-000001', 'open']);
  const cfOpened = CF.conflictOpened(gridResponse(cfOpen.request.id, [fbmRow('F-1', 'ALT00001', 'Tên FBM khác 1')]));
  check(so, 'FBM-024: response đọc FBM về thì GAS tính diff tại chỗ, trả DTO một bản ghi gồm giá trị ShinCRM và FBM mới nhất',
    [cfOpened.ok, cfOpened.conflict && cfOpened.conflict.id, cfOpened.conflict && cfOpened.conflict.remaining, nameDiff(cfOpened.conflict).left, nameDiff(cfOpened.conflict).right, CF.stateRead().metadata.conflictRefresh.stage],
    [true, 'CUS-000001', 3, 'Tên Shin 1', 'Tên FBM khác 1', 'review']);
  // Lệnh chốt không đọc lại FBM: Sidebar gửi lại giá trị FBM các trường lệch như màn đã hiện.
  const fbmValuesOf = (dto) => Object.fromEntries(((dto && dto.fields) || []).map((item) => [item.field, item.right]));
  const cfReopen = (rows) => { const opened = CF.openConflict(); return CF.conflictOpened(gridResponse(opened.request.id, rows)); };
  check(so, 'FBM-024: chưa mở bản ghi thì không được chốt', CF.confirmConflict('customer', 'CUS-000002', 'fbm', null, {}).code, 'CONFLICT_NOT_OPEN');
  check(so, 'Chốt xung đột không phát request đọc lại FBM: lệnh chốt không còn hàm chuẩn bị đọc lại', typeof CF.prepareConflictResolution, 'undefined');

  cf.logs.length = 0;
  const cfMismatch = CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, { ten_kh: 'Tên FBM bị sửa ở trình duyệt' });
  check(so, 'Giá trị FBM gửi kèm lệnh chốt khác bản FBM lúc mở thì không ghi, trả mở lại, bỏ bản đang mở và ghi Log',
    [cfMismatch.code, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus, CF.stateRead().metadata.conflictRefresh, cf.logs.some((event) => event.action === 'conflict_reopen' && event.recordId === 'CUS-000001')],
    ['CONFLICT_REOPEN', 'Tên Shin 1', 'xung đột chờ quyết', null, true]);
  const cfOpenedAgain = cfReopen([fbmRow('F-1', 'ALT00001', 'Tên FBM khác 1')]);
  const cfStray = CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, Object.assign(fbmValuesOf(cfOpenedAgain.conflict), { note: 'ghi lén' }));
  check(so, 'Giá trị FBM gửi kèm có trường ngoài fingerprint thì không ghi, trả mở lại', [cfStray.code, cf.local.customer[0].companyName, /note/.test(cfStray.message)], ['CONFLICT_REOPEN', 'Tên Shin 1', true]);
  const cfNoValues = (cfReopen([fbmRow('F-1', 'ALT00001', 'Tên FBM khác 1')]), CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, null));
  check(so, 'Lệnh chốt thiếu giá trị FBM thì không ghi, trả mở lại', [cfNoValues.code, cf.local.customer[0].companyName], ['CONFLICT_REOPEN', 'Tên Shin 1']);

  const cfOpenedNewer = cfReopen([fbmRow('F-1', 'ALT00001', 'Tên FBM mới hơn 1')]);
  cf.local.customer[0].companyName = 'Tên Shin sửa 1';
  const cfLocalChanged = CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, fbmValuesOf(cfOpenedNewer.conflict));
  check(so, 'FBM-024: ShinCRM đổi giữa lúc mở và lúc chốt thì không ghi, trả mở lại để đọc FBM mới và xem bản ShinCRM vừa sửa',
    [cfLocalChanged.code, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus, CF.stateRead().metadata.conflictRefresh],
    ['CONFLICT_REOPEN', 'Tên Shin sửa 1', 'xung đột chờ quyết', null]);
  const cfOpenedBusy = cfReopen([fbmRow('F-1', 'ALT00001', 'Tên FBM mới hơn 1')]);
  check(so, 'FBM-024: mở lại sau khi ShinCRM đổi thì màn xung đột hiện giá trị ShinCRM vừa sửa', nameDiff(cfOpenedBusy.conflict).left, 'Tên Shin sửa 1');
  giuBanGhi(cf.hop, 'khac', 'customer', 'CUS-000001', 'Tiến trình khác đang giữ.');
  const cfBusy = CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, fbmValuesOf(cfOpenedBusy.conflict));
  check(so, 'FBM-024: bản ghi đang bị tiến trình khác giữ lúc chốt thì báo bận, không ghi gì, vẫn ở bước xem để chốt lại',
    [cfBusy.code, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus, CF.stateRead().metadata.conflictRefresh.stage], ['CONFLICT_RECORD_BUSY', 'Tên Shin sửa 1', 'xung đột chờ quyết', 'review']);
  cf.hop.recordGateRun({ by: 'khac', decide: () => ({ release: [{ entity: 'customer', ids: ['CUS-000001'] }] }) });
  const cfFbm = CF.confirmConflict('customer', 'CUS-000001', 'fbm', null, fbmValuesOf(cfOpenedBusy.conflict));
  check(so, 'FBM-024 PA1: lấy FBM ghi giá trị FBM vào ShinCRM, baseline là hash FBM lúc mở, trạng thái đã đồng bộ, còn 2 xung đột',
    [cfFbm.ok, cf.local.customer[0].companyName, cf.local.customer[0].syncStatus, cf.local.customer[0].fbmHash === CF.hash(CF.customerRecord(fbmRow('F-1', 'ALT00001', 'Tên FBM mới hơn 1'), {}), 'customer', {}), cfFbm.remaining, CF.stateRead().metadata.conflictCount],
    [true, 'Tên FBM mới hơn 1', 'đã đồng bộ', true, 2, 2]);

  const cfOpen2 = CF.openConflict();
  const cfOpened2 = CF.conflictOpened(gridResponse(cfOpen2.request.id, [fbmRow('F-2', 'ALT00002', 'Tên FBM 2')]));
  const cfShin = CF.confirmConflict('customer', 'CUS-000002', 'shin', null, fbmValuesOf(cfOpened2.conflict));
  const cfShinRow = cf.local.customer[1];
  check(so, 'FBM-024 PA2: lấy ShinCRM giữ giá trị ShinCRM, baseline là hash FBM mới, trạng thái chờ đối soát và vào danh sách đẩy',
    [cfShin.ok, cfOpen2.request.meta.conflictId, cfShinRow.companyName, cfShinRow.syncStatus, cfShinRow.fbmHash === CF.hash(CF.customerRecord(fbmRow('F-2', 'ALT00002', 'Tên FBM 2'), {}), 'customer', {}), CF.pushCandidates('customer').map((item) => item.id)],
    [true, 'CUS-000002', 'Tên Shin 2', 'chờ đối soát', true, ['CUS-000002']]);

  const cfOpen3 = CF.openConflict();
  const cfOpened3 = CF.conflictOpened(gridResponse(cfOpen3.request.id, [fbmRow('F-3', 'ALT00003', 'Tên FBM 3')]));
  const cfMergeField = nameDiff(cfOpened3.conflict).field;
  const cfManual = CF.confirmConflict('customer', 'CUS-000003', 'manual', { [cfMergeField]: { choice: 'manual', value: 'Tên tự nhập 3' } }, fbmValuesOf(cfOpened3.conflict));
  const cfManualState = CF.stateRead();
  check(so, 'FBM-024 PA3: tùy chỉnh ghi giá trị tự nhập vào ShinCRM, trạng thái chờ đối soát; hết hàng đợi thì số đếm về 0 và không còn bản ghi đang mở',
    [cfManual.ok, cf.local.customer[2].companyName, cf.local.customer[2].syncStatus, cfManual.remaining, cfManualState.metadata.conflictCount, cfManualState.metadata.conflictRefresh],
    [true, 'Tên tự nhập 3', 'chờ đối soát', 0, 0, null]);
  const cfEmpty = CF.openConflict();
  check(so, 'FBM-024: hàng đợi rỗng thì mở chế độ xung đột báo không còn xung đột, không phát request', [cfEmpty.empty, cfEmpty.request], [true, undefined]);

  // FBM-053: đọc xác nhận lệch nhưng bản đọc lại đã khớp mọi trường thì không còn gì để người dùng chọn.
  const sm = makeSync(), SM = sm.hop.FbmSync;
  SM.masterEnabled = () => true;
  const smState = SM.stateStart('', 'pull_customer', 0); smState.mode = 'read'; SM.readCategoryGate = () => cfGate; SM.stateWrite(smState);
  SM.pullWrite('customer', [SM.customerRecord(fbmRow('F-1', 'ALT00001', 'Tên gốc 1'), {})]);
  sm.local.customer[0].companyName = 'Tên Shin 1';
  SM.pullWrite('customer', [SM.customerRecord(fbmRow('F-1', 'ALT00001', 'Tên FBM 1'), {})]);
  const smDone = SM.stateStart('', 'checking_session', 0); smDone.phase = 'done'; SM.stateWrite(smDone);
  SM.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const smOpen = SM.openConflict();
  const smSame = SM.conflictOpened(gridResponse(smOpen.request.id, [fbmRow('F-1', 'ALT00001', 'Tên Shin 1')]));
  check(so, 'FBM-053: đọc lại FBM thấy khớp ShinCRM mọi trường thì tự đóng xung đột (đã đồng bộ, baseline là hash FBM), không trả màn xung đột rỗng',
    [smOpen.remaining, smSame.ok, smSame.conflict, sm.local.customer[0].syncStatus, sm.local.customer[0].fbmHash === SM.hash(SM.customerRecord(fbmRow('F-1', 'ALT00001', 'Tên Shin 1'), {}), 'customer', {}), smSame.remaining, SM.stateRead().metadata.conflictRefresh],
    [1, true, null, 'đã đồng bộ', true, 0, null]);

  // FBM-033: bản ghi đầu hàng đợi không đọc được trên FBM thì rời hàng đợi, không chặn các xung đột phía sau.
  const un = makeSync(), UN = un.hop.FbmSync;
  UN.masterEnabled = () => true;
  const unState = UN.stateStart('', 'pull_customer', 0); unState.mode = 'read'; UN.readCategoryGate = () => cfGate; UN.stateWrite(unState);
  const unIds = [1, 2, 3, 4];
  UN.pullWrite('customer', unIds.map((n) => UN.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên gốc ' + n), {})));
  un.local.customer.forEach((row) => { row.companyName = 'Tên Shin ' + row.fbmCustomerCode.slice(-1); });
  UN.pullWrite('customer', unIds.map((n) => UN.customerRecord(fbmRow('F-' + n, 'ALT0000' + n, 'Tên FBM ' + n), {})));
  const unDone = UN.stateStart('', 'checking_session', 0); unDone.phase = 'done'; UN.stateWrite(unDone);
  UN.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  un.logs.length = 0;
  const unOpen = UN.openConflict();
  const unMissing = UN.conflictOpened(gridResponse(unOpen.request.id, []));
  const unLog = un.logs.find((event) => event.action === 'pull_record_issue' && /rời hàng đợi xung đột/.test(String(event.reason)));
  check(so, 'FBM-033: FBM không trả bản ghi đầu hàng đợi thì dòng đó chuyển "không thấy bên FBM", rời hàng đợi, Sidebar nhận lý do và Log có dòng ghi mã bản ghi',
    [unMissing.code, un.local.customer[0].syncStatus, unMissing.remaining, /CUS-000001.*bị xóa hoặc chuyển quyền/.test(unMissing.message), !!unLog && unLog.recordId, UN.stateRead().metadata.conflictRefresh],
    ['CONFLICT_RECORD_UNREADABLE', 'không thấy bên FBM', 3, true, 'CUS-000001', null]);
  const unNext = UN.openConflict();
  check(so, 'FBM-033: mở lại chế độ xung đột thì tới lượt bản ghi kế tiếp, không kẹt ở bản ghi không đọc được', [unNext.ok, unNext.request && unNext.request.meta.conflictId, unNext.remaining], [true, 'CUS-000002', 3]);
  const unOpened2 = UN.conflictOpened(gridResponse(unNext.request.id, [fbmRow('F-2', 'ALT00002', 'Tên FBM 2')]));
  const unSettled = UN.confirmConflict('customer', 'CUS-000002', 'fbm', null, Object.fromEntries(unOpened2.conflict.fields.map((item) => [item.field, item.right])));
  check(so, 'FBM-033: chốt bản ghi kế tiếp theo bản đã mở thì rời hàng đợi', [unSettled.ok, un.local.customer[1].companyName, unSettled.remaining], [true, 'Tên FBM 2', 2]);
  un.local.customer[2].fbmId = '';
  const unNoId = UN.openConflict();
  check(so, 'FBM-033: bản ghi xung đột thiếu ID FBM cũng rời hàng đợi ngay, không phát request', [unNoId.code, unNoId.request, un.local.customer[2].syncStatus, UN.openConflict().request.meta.conflictId], ['CONFLICT_RECORD_UNREADABLE', undefined, 'không thấy bên FBM', 'CUS-000004']);

  const cfBig = makeSync(), CB = cfBig.hop.FbmSync;
  const cfBigState = CB.stateStart('', 'pull_customer', 0); cfBigState.mode = 'read'; CB.readCategoryGate = () => cfGate; CB.stateWrite(cfBigState);
  const cfBigIds = Array.from({ length: 80 }, (_, index) => index + 10);
  const longName = (prefix, n) => prefix + ' ' + n + ' ' + 'x'.repeat(400);
  CB.pullWrite('customer', cfBigIds.map((n) => CB.customerRecord(fbmRow('F-' + n, 'ALT000' + n, longName('Gốc', n)), {})));
  cfBig.local.customer.forEach((row, index) => { row.companyName = longName('Shin', cfBigIds[index]); });
  const cfBigPull = CB.pullRecords('customer', cfBigIds.map((n) => CB.customerRecord(fbmRow('F-' + n, 'ALT000' + n, longName('FBM', n)), {})), 'read');
  CB.pullRecords('customer', cfBigIds.map((n) => CB.customerRecord(fbmRow('F-' + n, 'ALT000' + n, longName('FBM', n)), {})), 'read');
  const cfStateBytes = Object.keys(cfBig.documentProperties.data).filter((key) => /^FBM_SYNC_STATE/.test(key)).reduce((sum, key) => sum + Buffer.byteLength(cfBig.documentProperties.data[key], 'utf8'), 0);
  check(so, 'FBM-024: 80 xung đột nội dung dài, pull lặp lại hai lần, state vẫn dưới 3KB và số đếm không nhân bản',
    [cfBigPull.conflicts, cfStateBytes > 0 && cfStateBytes < 3000, CB.stateRead().metadata.conflictCount], [80, true, 80]);

  // FBM-025/026/028: DocumentProperties đọc lỗi hoặc JSON hỏng phải ném lỗi có mã lên lát, không coi như "chưa có" rồi ghi đè.
  const thrownCode = (work) => { try { work(); return 'không ném'; } catch (error) { return String(error && error.code || ''); } };
  const dp = makeSync(), DP = dp.hop.FbmSync, dpData = dp.documentProperties.data;
  napServer(dp.hop, 'fbm_sync/auth/AutoLogin.js');
  const dpStart = DP.stateStart('', 'pull_customer', 0); dpStart.cursor = { pageIndex: 7 }; DP.stateWrite(dpStart);
  dpData.FBM_SYNC_STATE_V1 = '{"runId":"r1","cursor":{"pageIndex":7'; // JSON đứt giữa chừng
  const corruptStateRaw = dpData.FBM_SYNC_STATE_V1;
  dp.logs.length = 0;
  const corruptSliceCode = thrownCode(() => DP.runSlice(() => DP.stateRead()));
  const corruptLog = dp.logs.find((event) => event.action === 'state_fail_run');
  check(so, 'FBM-025: state đồng bộ JSON hỏng thì lát ném FBM_DOCUMENT_PROPERTY_CORRUPT, Log có dòng lỗi và state hỏng giữ nguyên để khôi phục, không bị đè bằng state rỗng',
    [corruptSliceCode, !!corruptLog && /DocumentProperties/.test(String(corruptLog.reason)), dpData.FBM_SYNC_STATE_V1 === corruptStateRaw],
    ['FBM_DOCUMENT_PROPERTY_CORRUPT', true, true]);

  const dpPending = makeSync(), PP = dpPending.hop.FbmSync, ppData = dpPending.documentProperties.data;
  const ppStart = PP.stateStart('', 'push', 0); ppStart.mode = 'write'; PP.stateWrite(ppStart);
  ppData.FBM_SYNC_PENDING_PUSHES_V1 = '["không phải object"]';
  const pendingSliceCode = thrownCode(() => PP.runSlice(() => PP.pendingPushSet('customer', 'CUS-000001', { hash: 'mới' })));
  const ppState = PP.stateRead();
  check(so, 'FBM-026: hash chờ xác nhận hỏng thì không ghi đè bằng bản chỉ có một hash mới; phiên chuyển lỗi có mã để Sidebar hiện',
    [pendingSliceCode, ppData.FBM_SYNC_PENDING_PUSHES_V1, ppState.phase, ppState.lastFailureCode, /hash chờ xác nhận/.test(ppState.lastError)],
    ['FBM_DOCUMENT_PROPERTY_CORRUPT', '["không phải object"]', 'error', 'FBM_DOCUMENT_PROPERTY_CORRUPT', true]);

  const dpDown = makeSync(), DD = dpDown.hop.FbmSync, ddProps = dpDown.documentProperties, ddGet = ddProps.getProperty;
  napServer(dpDown.hop, 'fbm_sync/auth/AutoLogin.js');
  ddProps.getProperty = () => { throw new Error('Service invoked too many times: properties'); };
  check(so, 'FBM-025/026/028: dịch vụ DocumentProperties lỗi thì state, hash chờ xác nhận, cấu hình đăng nhập và công tắc tổng đều ném FBM_DOCUMENT_PROPERTIES_READ_FAILED, công tắc không mở theo mặc định',
    [thrownCode(() => DD.stateRead()), thrownCode(() => DD.pendingPushesRead()), thrownCode(() => DD.loginConfigRead()), thrownCode(() => DD.masterEnabled())],
    ['FBM_DOCUMENT_PROPERTIES_READ_FAILED', 'FBM_DOCUMENT_PROPERTIES_READ_FAILED', 'FBM_DOCUMENT_PROPERTIES_READ_FAILED', 'FBM_DOCUMENT_PROPERTIES_READ_FAILED']);
  ddProps.getProperty = ddGet;
  check(so, 'FBM-028: Spreadsheet chưa có công tắc tổng vẫn coi là bật; chỉ "false" rõ ràng mới khóa', [DD.masterEnabled(), (DD.setMasterEnabled(false), DD.masterEnabled())], [true, false]);

  const secretEnvelope = '{"ciphertext":"BI-MAT-ENVELOPE","password":"mat-khau-that"';
  dpData.FBM_LOGIN_CONFIG_V1 = secretEnvelope;
  let loginError = null;
  try { DP.loginConfigRead(); } catch (error) { loginError = error; }
  check(so, 'FBM-028: cấu hình đăng nhập JSON hỏng thì ném lỗi có mã, thông báo không chứa envelope hay mật khẩu, không ghi đè cấu hình',
    [loginError && loginError.code, /BI-MAT|mat-khau/.test(String(loginError && loginError.message)), dpData.FBM_LOGIN_CONFIG_V1 === secretEnvelope],
    ['FBM_DOCUMENT_PROPERTY_CORRUPT', false, true]);

  // G9.3: PA3 cho Activity đi đúng đường confirmConflict; trường FBM `details`/`end_date` ghi về `content`/`workDate` của ShinCRM.
  const activityGridFields = ['id', 'ten_loai', 'ten_cv', 'details', 'start_date', 'end_date', 'ten_tt', 'owner', 'nguoi_sua', 'datetime0', 'line_nbr'];
  const activityGrid = (requestId, rows) => ({ trace: [{ requestId, stage: 'fetch' }], d: { TotalRowCount: rows.length, Rows: rows.map((row) => activityGridFields.map((field) => row[field] === undefined ? '' : row[field])), ViewPage: { Fields: activityGridFields.map((AliasName) => ({ AliasName })) } } });
  const fbmActivity = (details, endDate) => ({ id: 'FBM-A1', ma_kh: 'ALT00001', ten_cv: 'Gọi điện', details, end_date: endDate });
  const ac = makeSync(), AC = ac.hop.FbmSync;
  AC.masterEnabled = () => true;
  AC.scriptSettings = () => ({ baseUrl: 'https://fbm.test', userId: '2037', accountName: 'Le Tuan Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
  const acState = AC.stateStart('', 'pull_activity', 0); acState.mode = 'read';
  AC.readCategoryGate = () => ({ map: {}, names: {}, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true }, '@CAT_CONG_VIEC': { 'Gọi điện': true } }, warnings: [] });
  AC.stateWrite(acState);
  const acGate = AC.stateCategoryGate(acState);
  AC.pullWrite('customer', [customer('FBM-C1', 'ALT00001', 'Công ty 1')]);
  AC.pullRecords('activity', [AC.activityRecord(fbmActivity('Nội dung gốc', '/Date(1757386800000)/'), acGate, { sttRec: 'FBM-C1' })], 'read');
  ac.local.activity[0].content = 'Nội dung Shin';
  const acPull = AC.pullRecords('activity', [AC.activityRecord(fbmActivity('Nội dung FBM', '/Date(1757473200000)/'), acGate, { sttRec: 'FBM-C1' })], 'read');
  const acDone = AC.stateRead(); acDone.phase = 'done'; AC.stateWrite(acDone);
  AC.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const acOpen = AC.openConflict();
  const acLatest = fbmActivity('Nội dung FBM', '/Date(1757473200000)/');
  const acOpened = AC.conflictOpened(activityGrid(acOpen.request && acOpen.request.id, [acLatest]));
  const acFields = ((acOpened.conflict && acOpened.conflict.fields) || []).map((item) => item.field);
  // DTO cho màn chọn giá trị (G9.1) đọc nhãn và kiểu từ DATA_SCHEMA thật; hộp test mặc định để DATA_SCHEMA rỗng nên nạp bảng khai thật rồi trả lại.
  const realSchema = napServer(taoHopCat({}), 'server/data/DataSchema.js').DATA_SCHEMA;
  ac.hop.DATA_SCHEMA = realSchema;
  const acView = AC.conflictView({ entity: 'activity', id: ac.local.activity[0].id, local: ac.local.activity[0], latest: AC.activityRecord(acLatest, acGate), gate: acGate }, 1);
  check(so, 'G9.1: DTO xung đột mang mã · tên bản ghi, nhãn trường theo DATA_SCHEMA; trường chữ tự do cho sửa, trường ngày chỉ chọn và hiện dạng ISO',
    [acView.code, acView.name, acView.fields.map((item) => [item.field, item.label, item.editable, item.right])],
    ['ALT00001', 'Gọi điện', [['details', 'Nội dung công việc', true, 'Nội dung FBM'], ['end_date', 'Ngày làm việc', false, '2025-09-10']]]);
  const cvView = AC.conflictView({ entity: 'customer', id: 'CUS-X', local: { fbmCustomerCode: 'ALT00009', companyName: 'Cty X', taxNumber: '0101', phone: '090' }, latest: { fbmCustomerCode: 'ALT00009', companyName: 'Cty X', taxNumber: '0202', phone: '091' }, gate: acGate }, 1);
  check(so, 'G9.1: mã số thuế (có validate và unique) chỉ được chọn một bên, điện thoại được gõ tay', (cvView.fields || []).map((item) => [item.label, item.editable]), [['Điện thoại', true], ['Mã số thuế', false]]);
  ac.hop.DATA_SCHEMA = {};
  const acManual = AC.confirmConflict('activity', ac.local.activity[0].id, 'manual', { details: { choice: 'manual', value: 'Nội dung tự nhập' }, end_date: { choice: 'fbm' } }, Object.fromEntries(acOpened.conflict.fields.map((item) => [item.field, item.right])));
  const acRow = ac.local.activity[0];
  check(so, 'G9.3: Activity xung đột hai trường thì DTO mở ra đúng hai trường FBM details và end_date', [acPull.conflicts, acFields], [1, ['details', 'end_date']]);
  check(so, 'G9.3: PA3 Activity ghi giá trị tự nhập vào content, lấy end_date FBM vào workDate, giữ liên kết Customer, chờ đối soát và hết hàng đợi',
    [acManual.ok, acRow.content, acRow.workDate, acRow.customerId, acRow.syncStatus, acRow.fbmHash === AC.activityRecord(acLatest, acGate).fbmHash, acManual.remaining],
    // Ngày FBM về dạng chữ ISO như màn xung đột đã hiện; cửa ghi thật đổi sang ngày (`textToDate`), hộp test để DATA_SCHEMA rỗng nên giữ chữ.
    [true, 'Nội dung tự nhập', '2025-09-10', 'CUS-000001', 'chờ đối soát', true, 0]);
}

module.exports = { chay };
