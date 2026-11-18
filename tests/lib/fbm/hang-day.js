/**
 * Hộp thử chiều đẩy dùng chung: hộp GAS nạp đủ tệp đồng bộ thật với Sheet giả trong RAM (cửa ghi bản ghi kiểm xung đột như cửa thật), và hàng đợi đẩy dựng sẵn ở đầu chặng đẩy. Ma trận production và ca cổng chặng đẩy cùng dựng từ đây.
 */
const { trongLat } = require('./hop-dong-bo');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { taoKhoThuocTinh } = require('../gas/kho-thuoc-tinh');

/** Kho chung của hộp thử kèm `data` để ca soi thẳng các khóa. */
function propertyStore() {
  const data = {};
  return Object.assign(taoKhoThuocTinh(data), { data });
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
    Utilities: { getUuid: () => 'production-matrix-uuid', newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') }) },
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    shinOpenBook: () => ({ getId: () => 'production-matrix-sheet' })
  });
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Conflict.js', 'fbm_sync/control/ConflictCommands.js', 'fbm_sync/reconcile/ConflictStage.js',
    'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/RecordMap.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js',
    'fbm_sync/reconcile/Pull.js',
    'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js',
    'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushRecover.js', 'fbm_sync/transport/PushApply.js', 'fbm_sync/transport/PushStage.js',
    'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js',
    'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/control/PushCommands.js');
  hop.FbmSync.readLocal = (entity) => local[entity].map(clone);
  hop.writeGateSave = (request) => {
    writes.push(request);
    const entity = request.entity;
    const conflicts = [];
    (request.records || []).forEach((patch, i) => {
      const old = request.old && request.old[i];
      const row = local[entity].find((item) => String(item.id || '') === String(patch.id || ''));
      if (!old || !row) { return; }
      Object.keys(old).forEach((field) => {
        if (!Object.prototype.hasOwnProperty.call(patch, field)) { return; }
        const current = String(row[field] === undefined || row[field] === null ? '' : row[field]);
        const mine = String(patch[field] === undefined || patch[field] === null ? '' : patch[field]);
        if (current !== String(old[field]) && mine !== current) { conflicts.push({ index: i, id: patch.id, field, label: field, old: old[field], current, mine }); }
      });
    });
    if (conflicts.length) { return { ok: false, conflicts }; }
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

function pushQueue(customers, activities) {
  const run = makeSync(), F = run.hop.FbmSync;
  run.local.customer.push(...customers); run.local.activity.push(...(activities || []));
  F.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Le Tuan Anh', userId: '2037', customerPrefix: 'ALT', customerCodeLength: 8 });
  F.categoryGateCheck = () => [];
  F.sliceIssue = (state, request) => request;
  // Hộp kiểm hàng đợi đẩy: chặng đếm khách cuối dãy có test riêng nên tắt điều kiện của nó để lượt đóng ngay sau chặng đẩy.
  F.customerCountApplies = () => false;
  const st = F.runOpen({ phase: 'push' });
  st.mode = 'write'; st.phase = 'push'; 
  st.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  // Lượt đẩy luôn bắt đầu sau lô danh mục vừa đọc.
  st.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  F.stateWrite(st);
  return { run, F };
}

const editCustomer = (x) => ({ id: 'CUS-' + x, fbmId: 'F-' + x, fbmCustomerCode: 'ALT0000' + x, companyName: 'Cty ' + x, taxNumber: '010' + x, contactPerson: 'Người liên hệ', phone: '0900000000', leadSource: 'Web', address: 'Hà Nội', province: 'Hà Nội', fbmSyncPermission: 'Cho phép', syncStatus: 'đã đồng bộ', fbmHash: 'cũ' });

/** Giả lập FBM ghi thành công bản ghi đang mở: ghi Sheet trạng thái đã đồng bộ kèm dấu vân mới, sang mã kế và xin request kế. */
const pushOk = (q) => {
  const st = q.F.stateRead(), id = st.cursor.candidate.id;
  q.F.pushRowChange('', 'customer', id, { release: true, build: (local) => ({ patch: { id, syncStatus: 'đã đồng bộ', fbmHash: q.F.hash(local, 'customer', q.F.stateCategoryGate(st)) } }) });
  const after = q.F.stateRead(); after.cursor = q.F.pushCursorNext(after.cursor, true); after.current = ''; q.F.stateWrite(after);
  return trongLat(q.F, () => q.F.pushStageResume(q.F.stateRead()));
};

/** Đẩy liên tục tới khi chặng hết request; `onStep(id, lần)` chạy trước khi bản ghi đó ghi xong, để ca kiểm chen sửa Sheet giữa lượt. */
const pushDrive = (q, onStep) => {
  const tried = [];
  let request = trongLat(q.F, () => q.F.pushStageResume(q.F.stateRead()));
  for (let guard = 0; guard < 20 && request; guard += 1) {
    const id = q.F.stateRead().cursor.candidate.id; tried.push(id);
    if (onStep) { onStep(id, tried.length); }
    request = pushOk(q);
  }
  return { tried, request };
};

module.exports = { propertyStore, clone, makeSync, pushQueue, editCustomer, pushOk, pushDrive };
