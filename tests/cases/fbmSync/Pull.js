/** Kiểm tra pull Customer/Activity, identity, hash và missing. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer, giuBanGhi, giuBanGhiDongBo, soBan } = require("../../lib/load-gas");
const { TEP_NEN } = require("../../lib/dung-hop");
const fs = require("fs");
const path = require("path");
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

async function chay(so) {
  section("FBM sync — pull và identity");
  let verifyDefault = 'Chưa xác thực';
  const builders = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    FBM_VERIFY_STATUS_CONFIG_NAME: 'FBM_VERIFY_STATUS_DEFAULT', configGet: (name, fallback) => name === 'FBM_VERIFY_STATUS_DEFAULT' ? verifyDefault : fallback,
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => '', setProperty: () => {}, deleteProperty: () => {} }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  check(so, 'mode tach quyen ghi Sheet khoi quyen ghi FBM', [
    builders.FbmSync.canWriteSheet('check'), builders.FbmSync.canWriteFbm('check'),
    builders.FbmSync.canWriteSheet('read'), builders.FbmSync.canWriteFbm('read'),
    builders.FbmSync.canWriteSheet('push'), builders.FbmSync.canWriteFbm('push'),
    builders.FbmSync.canWriteSheet('write'), builders.FbmSync.canWriteFbm('write')
  ], [false, false, true, false, false, true, true, true]);
  let readModeState = { mode: 'read', counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }, metadata: {} };
  let readModeSheetWrites = 0;
  const realPullWrite = builders.FbmSync.pullWrite;
  builders.FbmSync.stateRead = () => readModeState;
  builders.FbmSync.stateWrite = (next) => { readModeState = next; return next; };
  builders.FbmSync.pullWrite = (entity, records) => { readModeSheetWrites += 1; return { ok: true, written: records.length, conflicts: 0, skipped: 0 }; };
  const readModeResult = builders.FbmSync.pullRecords('customer', [{ id: 'CUS-000001' }], 'read');
  check(so, 'mode read ghi ket qua pull vao ShinCRM nhung khong co quyen ghi FBM', [readModeResult.written, readModeSheetWrites, readModeState.counts.succeeded, builders.FbmSync.canWriteFbm('read')], [1, 1, 1, false]);
  builders.FbmSync.pullWrite = realPullWrite;
  readModeState = { mode: 'check', counts: builders.FbmSync.countsDefault(), metadata: {} };
  builders.FbmSync.pullRecords('customer', [{ id: 'CUS-000001' }, { id: 'CUS-000002' }], 'check');
  check(so, 'Lượt chỉ kiểm tra đếm bản ghi đã đọc nhưng không tính chúng là bỏ qua', [readModeState.counts.completed, readModeState.counts.skipped], [2, 0]);
  const loiKhach = { customerErrors: { total: 2, recent: [] } };
  check(so, 'Thông báo kết thúc lượt Hai chiều giữ ghi chú khách lỗi khi đọc giao dịch như lượt Lấy, và không đếm lỗi đọc thành lỗi đẩy', [
    builders.FbmSync.runDoneMessage({ mode: 'write', scan: 'full', counts: Object.assign(builders.FbmSync.countsDefault(), { error: 2 }), metadata: loiKhach }),
    builders.FbmSync.runDoneMessage({ mode: 'read', scan: 'full', counts: Object.assign(builders.FbmSync.countsDefault(), { error: 2 }), metadata: loiKhach })
  ], [
    'Đồng bộ hoàn tất; không có bản ghi nào được đẩy. Có 2 khách lỗi khi đọc giao dịch (xem danh sách lỗi); lượt này chưa đánh dấu giao dịch "không thấy bên FBM".',
    'Đồng bộ hoàn tất. Có 2 khách lỗi khi đọc giao dịch (xem danh sách lỗi); lượt này chưa đánh dấu giao dịch "không thấy bên FBM".'
  ]);
  const transportSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8');
  check(so, 'khong con co ghi FBM an ngoai mode va cac cong an theo co cu', transportSource.indexOf('FBM_SYNC_ALLOW_WRITES') < 0 && transportSource.indexOf('writeAllowed') < 0, true);

  let readFinishState = {
    runId: 'read-run', origin: 'manual', mode: 'read', scan: 'full', phase: 'pull_customer', entity: 'customer',
    cursor: { kind: 'scan_job', entity: 'customer', jobId: 'read-run:customer:0:0', page: 0, next: 0, chunkCount: 0 }, activeRequestId: 'read-request', deadlineAt: Date.now() + 60000,
    lastProgressAt: Date.now(), session: {}, metadata: {},
    counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }
  };
  let readFinishMissing = 0;
  let readFinishPushRequests = 0;
  const readFinish = taoHopCat({
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => null, getProperties: () => ({}), setProperty: () => {}, setProperties: () => {}, deleteProperty: () => {} }) },
    FbmSync: {
      stateRead: () => readFinishState,
      stateWrite: (next) => { readFinishState = next; return next; },
      recoverStaleRun: (state) => ({ state, recovered: false }),
      responseRequestId: () => 'read-request', requestAnswered: (state, id) => !!id && String(state.activeRequestId || '') === id,
      protocol: { parse: (value) => value, assertSuccess: () => ({ ok: true }), contractMismatch: () => null },
      traceImport: () => {}, traceEvent: () => {}, traceResponse: () => ({}), applyTransportSession: () => false,
      rowsToRecords: () => ({ rows: [], fields: [], total: 0 }), isTemporaryRecord: () => false, customerPageItem: () => '', customerPageValue: () => [], seenStoreReader: () => () => true, seenStoreMark: () => {}, readLocal: () => [],
      pullWrite: () => ({ ok: true, written: 0, conflicts: 0, skipped: 0 }), previewRecords: () => {}, customerNext: () => false,
      canWriteSheet: (mode) => mode === 'read' || mode === 'write', canWriteFbm: (mode) => mode === 'push' || mode === 'write',
      nextPushRequest: () => { readFinishPushRequests += 1; return {}; },
      runDoneMessage: () => 'Đồng bộ hoàn tất.',
      statusView: () => ({ phase: readFinishState.phase, mode: readFinishState.mode })
    }
  });
  napServer(readFinish, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  // Chỉ kiểm chặng chính của lượt; bước đếm cuối lượt có test riêng.
  readFinish.FbmSync.customerAbsentMark = () => { readFinishMissing += 1; };
  readFinish.FbmSync.readListClear = () => {};
  readFinish.FbmSync.customerBaselineWrite = () => {};
  readFinish.FbmSync.activityStageNext = () => null;
  const readFinished = readFinish.FbmSync.continueStep({ job: { jobId: 'read-run:customer:0:0', chunkIndex: 0, chunkCount: 1, rowCount: 0, totalRowCount: 0, oversize: [] }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'read-request' }] } });
  check(so, 'Lượt Lấy hết danh sách khách thì gắn khách vắng vào danh sách đọc một lần, không mở chiều đẩy', [readFinished.ok, readFinishState.phase, readFinishMissing, readFinishPushRequests], [true, 'done', 1, 0]);
  builders.FbmSync.stateRead = () => ({ session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } });
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  builders.FbmSync.readCategoryGate = () => gate;
  readFinish.FbmSync.readCategoryGate = () => gate;
  let recoveryWrite;
  let recoveryState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: {} };
  builders.FbmSync.stateRead = () => recoveryState;
  giuBanGhiDongBo(builders, 'activity', 'ACT-9');
  builders.FbmSync.stateWrite = (next) => { recoveryState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: '', customerId: 'KH-1', syncStatus: builders.FbmSync.SYNC_STATUS.pushing }];
  builders.writeGateSave = (request) => { recoveryWrite = request; return { ok: true }; };
  const recovered = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 77, ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9' }, gate, { sttRec: 'S9' })], 'write');
  check(so, 'Activity marker recovery vá FBM ID không tạo dòng mới và nhả bản ghi đồng bộ đang giữ', [recovered.written, recoveryWrite.records[0].id, recoveryWrite.records[0].fbmId, soBan(builders)['activity:ACT-9']], [1, 'ACT-9', '77', undefined]);
  let markerConflictWrite, markerState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: { seen: { customer: {}, activity: {} } }, counts: { conflict: 0 } };
  builders.FbmSync.stateRead = () => markerState;
  builders.FbmSync.stateWrite = (next) => { markerState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash' }];
  builders.writeGateSave = (request) => { markerConflictWrite = request; return { ok: true }; };
  const markerConflict = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate, { sttRec: 'S9' })]);
  check(so, 'Activity marker trỏ FBM ID khác ghi trạng thái xung đột chờ quyết lên Sheet, không cất bản ghi vào state', [markerConflict.conflicts, 'conflicts' in markerState.metadata, markerConflictWrite.records[0].syncStatus], [1, false, builders.FbmSync.SYNC_STATUS.conflict]);
  // Xung đột định danh không so được bằng hash: lượt sau bản FBM của chính dòng về khớp hai phía vẫn không được gỡ xung đột, vì một FBM ID khác vẫn mang dấu trỏ vào dòng đó.
  const markerOwnFbm = builders.FbmSync.activityRecord({ id: 'OLD-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung cũ' }, gate, { sttRec: 'S9' });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash', syncStatus: builders.FbmSync.SYNC_STATUS.conflict }];
  markerConflictWrite = null;
  const markerAgain = builders.FbmSync.pullWrite('activity', [markerOwnFbm, builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate, { sttRec: 'S9' })]);
  check(so, 'Activity đang xung đột định danh (dấu của FBM ID khác trỏ vào) không bị nhánh so ba chiều gỡ, không ghi trạng thái khác lên dòng; ô Xung đột của phiên đếm dòng đó đúng một lần dù cả nhánh dấu và nhánh so cùng chạm', [markerAgain.conflicts, markerAgain.conflictsKept, markerAgain.skipped, ((markerConflictWrite && markerConflictWrite.records) || []).filter((r) => r.id === 'ACT-9' && r.syncStatus !== builders.FbmSync.SYNC_STATUS.conflict).length], [0, 1, 0, 0]);
  // G12: giao dịch đã đồng bộ của chính tài khoản mà FBM còn dấu #SC thì xếp đẩy sửa để bỏ dấu; của tài khoản khác thì không đụng.
  const settingsBeforeMarker = builders.FbmSync.scriptSettings;
  gate.map['@CAT_CONG_VIECGọi'] = 'GOI'; gate.valid['@CAT_CONG_VIEC'] = { 'Gọi': true, GOI: true };
  const markedIncoming = builders.FbmSync.activityRecord({ id: 'FBM-9', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9', owner: 'Chủ tài khoản' }, gate, { sttRec: 'S9' });
  let markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ accountName: 'Chủ tài khoản' });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'FBM-9', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: 'Chủ tài khoản', fbmHash: markedIncoming.fbmHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { markedWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('activity', [Object.assign({}, markedIncoming)]);
  const ownMarked = markedWrite && markedWrite.records[0].syncStatus;
  markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ accountName: 'Đồng nghiệp' });
  builders.FbmSync.pullWrite('activity', [Object.assign({}, markedIncoming)]);
  check(so, 'G12: lượt kéo xếp "chờ đối soát" cho giao dịch của mình còn dấu #SC trên FBM, không đụng giao dịch tài khoản khác', [ownMarked, markedWrite && markedWrite.records[0].syncStatus], [builders.FbmSync.SYNC_STATUS.pending, null]);
  // Người tạo trên FBM đứng ngoài fingerprint: nội dung không đổi thì hash không lộ, lượt kéo vẫn phải ghi tên người tạo xuống ShinCRM.
  const ownerIncoming = builders.FbmSync.activityRecord({ id: 'FBM-10', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung', owner: 'Sale Cũ' }, gate, { sttRec: 'S9' });
  let ownerWrite = null;
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-10', fbmId: 'FBM-10', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: '', fbmHash: ownerIncoming.fbmHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { ownerWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('activity', [Object.assign({}, ownerIncoming)]);
  check(so, 'Người tạo trên FBM: lượt kéo ghi owner FBM vào enteredBy khi nội dung không đổi, không đổi trạng thái đồng bộ', [ownerIncoming.enteredBy, ownerWrite && ownerWrite.records.length, ownerWrite && ownerWrite.records[0].id, ownerWrite && ownerWrite.records[0].enteredBy, ownerWrite && ownerWrite.records[0].syncStatus], ['Sale Cũ', 1, 'ACT-10', 'Sale Cũ', undefined]);
  // Người dùng lỡ xóa mã khách ở dòng giao dịch: quan hệ cha đứng ngoài fingerprint nên hash không lộ; lượt kéo phải nối lại theo FBM và để dấu ở Log, nếu không ngày giao dịch cuối của khách lệch FBM mãi.
  const linkIncoming = builders.FbmSync.activityRecord({ id: 'FBM-11', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung', owner: 'Sale Cũ' }, gate, { sttRec: 'S9' });
  let linkWrite = null;
  const linkLogged = [];
  const recordIssueAddBefore = builders.FbmSync.recordIssueAdd;
  builders.FbmSync.recordIssueAdd = (stage, entity, status, id, reason) => { linkLogged.push(id + '|' + reason); return null; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-11', fbmId: 'FBM-11', customerId: '', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: 'Sale Cũ', fbmHash: linkIncoming.fbmHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { linkWrite = request; return { ok: true }; };
  const linkResult = builders.FbmSync.pullWrite('activity', [Object.assign({}, linkIncoming)]);
  builders.FbmSync.recordIssueAdd = recordIssueAddBefore;
  check(so, 'Giao dịch mất mã khách trên Sheet: lượt kéo nối lại vào khách ShinCRM theo FBM, ghi một dòng Log, tính vào số bản ghi đã ghi Sheet, không đổi nội dung hay trạng thái đồng bộ', [linkResult && linkResult.written, linkWrite && linkWrite.records.length, linkWrite && linkWrite.records[0].id, linkWrite && linkWrite.records[0].customerId, linkWrite && linkWrite.records[0].syncStatus, linkLogged.filter((line) => /ACT-11\|.*KH-1/.test(line)).length], [1, 1, 'ACT-11', 'KH-1', undefined, 1]);
  // FBM trả mới nhất trước; cửa ghi cấp ACT- theo thứ tự mảng ghi, nên lô phải được sắp theo mã FBM tăng dần (thứ tự nhập thật) trước khi ghi. Mã đổi độ dài (99999 → 100000) phải so như số.
  const fbmOrderIncoming = (fbmId, day) => builders.FbmSync.activityRecord({ id: fbmId, ma_kh: 'ALT99999', end_date: day, ten_cv: 'Gọi', details: 'GD ' + fbmId }, gate, { sttRec: 'S9' });
  let orderWrite = null;
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmId: 'S9', fbmCustomerCode: 'ALT99999' }] : [];
  builders.writeGateSave = (request) => { orderWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('activity', [fbmOrderIncoming('177397', '/Date(1791828000000)/'), fbmOrderIncoming('177396', '/Date(1791828000000)/'), fbmOrderIncoming('177388', '/Date(1791828000000)/'), fbmOrderIncoming('177398', '/Date(1791655200000)/'), fbmOrderIncoming('100000', '/Date(1791828000000)/'), fbmOrderIncoming('99999', '/Date(1791828000000)/')]);
  check(so, 'Pull Activity mới: lô FBM trả mới nhất trước vẫn được ghi theo mã FBM tăng dần (số, không phải chuỗi) để ACT- tăng theo thứ tự nhập thật', orderWrite && orderWrite.records.map((record) => record.fbmId), ['99999', '100000', '177388', '177396', '177397', '177398']);
  check(so, 'FbmSync.compareFbmId: toàn chữ số so như số, mã không phải số coi là hòa', [builders.FbmSync.compareFbmId('99999', '100000'), builders.FbmSync.compareFbmId('177397', '177396'), builders.FbmSync.compareFbmId('7', '007'), builders.FbmSync.compareFbmId('FBM-9', '12')], [-1, 1, 0, 0]);
  builders.FbmSync.scriptSettings = settingsBeforeMarker;
  delete gate.map['@CAT_CONG_VIECGọi']; delete gate.valid['@CAT_CONG_VIEC'];
  const edit = builders.FbmSync.customerEditRequest({ fbmId: 'A1', companyName: 'Đổi tên' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Cũ', dien_thoai: '0123' }, gate);
  check(so, 'Customer sửa giữ OldValue field không đụng tới', edit.body.memvars.filter((item) => item.Name === 'dien_thoai')[0].NewValue, '0123');
  const editWithShinId = builders.FbmSync.customerEditRequest({ id: 'CUS-020059', fbmId: 'A1', website: 'Mới' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', id: 0 }, gate).body.memvars.filter((item) => item.Name === 'id')[0];
  check(so, 'FBM-046: Customer sửa không gửi mã CUS-* của Sheet vào memvar id của FBM', [editWithShinId.OldValue, editWithShinId.NewValue], [0, 0]);
  const editNote = builders.FbmSync.customerEditRequest({ fbmId: 'A1', note: 'nội bộ ShinCRM' }, { stt_rec_kh: 'A1', ghi_chu: 'Ghi chú FBM' }, gate).body.memvars.filter((item) => item.Name === 'ghi_chu')[0];
  const editGrids = builders.FbmSync.customerEditRequest({ fbmId: 'A1' }, { stt_rec_kh: 'A1' }, gate).body.memvars.filter((item) => Array.isArray(item.Items)).map((item) => [item.Name, item.Modified, item.Items.length]);
  check(so, 'FBM-046: Customer lưu form kèm hai bảng con rỗng, không đổi', editGrids, [['chiasekh', false, 0], ['crlhkh', false, 0]]);
  const editProduct = builders.FbmSync.customerEditRequest({ fbmId: 'A1', product: 'Sản phẩm ShinCRM' }, { stt_rec_kh: 'A1', ma_sp: 'F1' }, gate).body.memvars.filter((item) => item.Name === 'ma_sp')[0];
  check(so, 'FBM-051: sản phẩm Customer không đồng bộ, lệnh sửa gửi lại đúng ma_sp FBM đang có, không lấy sản phẩm ShinCRM', editProduct.NewValue, 'F1');
  check(so, 'FBM-046: Customer sửa giữ nguyên ghi chú FBM, không gửi ghi chú ShinCRM', [editNote.OldValue, editNote.NewValue], ['Ghi chú FBM', 'Ghi chú FBM']);
  const emptyDate = builders.FbmSync.customerEditRequest({ fbmId: 'A1' }, { stt_rec_kh: 'A1', ngay_tl: '' }, gate).body.memvars.filter((item) => item.Name === 'ngay_tl')[0];
  check(so, 'FBM-046: field ngày trống gửi null như form FBM, không gửi chuỗi rỗng', [emptyDate.OldValue, emptyDate.NewValue], [null, null]);
  check(so, 'fixture session giữ cookie và userId', [builders.FbmSync.stateRead().session.cookie, builders.FbmSync.stateRead().session.userId], ['461020379855cFHN_CRM_App', '2037']);
  check(so, 'Customer grid gắn điều kiện phân quyền theo userId trong payload cookie', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[0].Name, "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1");
  builders.FbmSync.scope = () => ({ fbm: ['ALT00010', 'ALT00011'], shin: ['CUS-020061'] });
  const customerGridKeys = builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey;
  check(so, 'Phạm vi giới hạn: chiều lấy lọc grid Customer theo các mã FBM GAS đã đổi ra, không đưa mã ShinCRM vào điều kiện grid', [customerGridKeys.length, customerGridKeys[1] && customerGridKeys[1].Name, customerGridKeys[1] && customerGridKeys[1].Value], [2, "ma_kh in ('ALT00010','ALT00011') and 1", 1]);
  builders.FbmSync.scope = () => ({ fbm: [], shin: ['CUS-020061'] });
  const emptyScopeKeys = builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey;
  check(so, 'Phạm vi giới hạn mà không có mã FBM nào: grid Customer lọc ra không khách nào, không rơi thành quét toàn bộ', [emptyScopeKeys.length, emptyScopeKeys[1] && emptyScopeKeys[1].Name], [2, "ma_kh in ('') and 1"]);
  builders.FbmSync.scope = () => null;
  check(so, 'Không giới hạn phạm vi: grid Customer chỉ còn điều kiện phân quyền', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey.length, 1);
  builders.FbmSync.scope = () => ({ fbm: ['ALT00010'], shin: [] });

  const bulkActivity = builders.FbmSync.activityBulkRequest({ type: 0 });
  check(so, 'Request giao dịch mọi khách không gắn mốc thời gian vào externalKey hay Customer đơn lẻ', [bulkActivity.body.controller, bulkActivity.body.externalKey.some((item) => item.Name === 'end_date' && item.Opr === '>='), bulkActivity.body.externalKey.some((item) => item.Name === 'stt_rec')], ['zccrAccountTask', false, false]);
  const activityCustomer = builders.FbmSync.activityGridRequest('CUS-FBM-1', { type: 0 });
  check(so, 'Request giao dịch mọi khách và từng khách không gắn bộ lọc ngày', [bulkActivity.body.filter, activityCustomer.body.filter, activityCustomer.body.externalKey[0].Name], [[], [], 'stt_rec']);
  check(so, 'Đổi ngày cửa sổ sang filter FBM: ngày hợp lệ ra DD/MM/YYYY, ngày không hợp lệ ra rỗng', [builders.FbmSync.fbmFilterDate('2024-10-07'), builders.FbmSync.fbmFilterDate('2024-02-31')], ['07/10/2024', '']);
  const tracked = (records) => records.filter(builders.FbmSync.activityBulkTracker()).map((record) => record.id);
  check(so, 'Lấy toàn bộ giao dịch chỉ theo dõi giao dịch có FBM ID còn hiệu lực: bỏ tombstone, dòng tạm, dòng chưa có FBM ID', tracked([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'TMP-3', fbmId: 'F-3', recordStatus: 'active' }, { id: 'A-4', fbmId: 'F-4', recordStatus: 'active' }, { id: 'A-5', fbmId: 'TMP-F-5', recordStatus: 'active' }, { id: 'A-6', fbmId: '', recordStatus: 'active' }]), ['A-1', 'A-4']);
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn', builders.FbmSync.validateLookupGate(lookupState, lookupGate).length, 0);

  let bulkState = { mode: 'read', scan: 'activity_bulk', phase: 'pull_activity', entity: 'activity', metadata: {}, cursor: {} };
  builders.FbmSync.stateRead = () => bulkState;
  builders.FbmSync.stateWrite = (next) => { bulkState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'ACT-000001', fbmId: 'F-LOCAL', recordStatus: 'active' }];
  const bulkStart = builders.FbmSync.beginActivityBulkPull(bulkState);
  check(so, 'Lấy toàn bộ giao dịch mở một việc quét chỉ giữ FBM ID đã có trên Sheet, có trần cỡ response, không gắn Customer; cursor không mang danh sách id', [bulkState.cursor.kind, bulkState.cursor.entity, bulkStart.meta.kind, bulkStart.meta.job.keepIds, bulkStart.meta.job.maxResponseBytes, bulkStart.body.externalKey.some((item) => item.Name === 'stt_rec'), JSON.stringify(bulkState.cursor).indexOf('F-LOCAL')], ['scan_job', 'activity', 'scan_job', ['F-LOCAL'], 64 * 1024 * 1024, false, -1]);

  // Danh sách khách lấy trọn bằng việc quét; cursor không mang danh sách khách nên state không phình theo số khách (lỗi thật: 1.312 khách làm state 76 KB).
  let pageState = { mode: 'read', scan: 'full', phase: 'lookup', metadata: {}, session: {}, cursor: {} };
  builders.FbmSync.stateRead = () => pageState;
  builders.FbmSync.stateWrite = (next) => { pageState = next; return next; };
  builders.FbmSync.prepareCategoryGate = () => {};
  builders.FbmSync.seenStoreBegin = () => {};
  builders.FbmSync.readLocal = () => [];
  const firstPage = builders.FbmSync.beginCustomerPull(pageState);
  check(so, 'quét toàn bộ lấy cả danh sách khách bằng một việc quét có số dòng mỗi request theo cấu hình, Extension cắt gói', [pageState.cursor.kind, pageState.cursor.count, firstPage.meta.kind, firstPage.body.count, firstPage.meta.job.chunkMaxBytes], ['scan_job', builders.FbmSync.BUDGET.scanCustomerRows, 'scan_job', builders.FbmSync.BUDGET.scanCustomerRows, builders.FbmSync.BUDGET.chunkMaxBytes]);
  // Cursor cửa ghi giữ tối đa một lô mã khách. stt_rec_kh của FBM là 'A' + 9 chữ số.
  const pageRows = builders.FbmSync.BUDGET.activityBatchCustomers;
  const fullPage = Array.from({ length: pageRows }, (_, i) => ({ sttRec: 'A' + String(100000000 + i) }));
  pageState.cursor = { kind: 'activity_grid', layer: 'list', customers: fullPage.map((item) => item.sttRec), batchId: 'b'.repeat(40) };
  const cursorBytes = Buffer.byteLength(JSON.stringify(pageState.cursor));
  check(so, 'cursor một lô cửa ghi đầy vẫn dưới nửa trần DocumentProperty và không chép đôi danh sách mã', [cursorBytes < builders.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT / 2, pageState.cursor.customerIds, pageState.cursor.customers.length], [true, undefined, pageRows]);
  // Cả state (không chỉ cursor) của một trang đầy cộng lastError dài nhất phải chừa khoảng trống dưới trần một khóa kho: nhánh lỗi ghi thêm lastError mà chạm trần thì lỗi quota che mất lỗi thật.
  const khoState = {};
  const stateHop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => ({ getProperty: (k) => khoState[k] === undefined ? null : khoState[k], setProperty: (k, v) => { khoState[k] = String(v); }, deleteProperty: (k) => { delete khoState[k]; } }) } });
  napServer(stateHop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/state/State.js');
  const macDinh = stateHop.FbmSync.stateDefault();
  const loiDaiNhat = 'Đ'.repeat(240);
  stateHop.FbmSync.stateWrite(Object.assign(macDinh, {
    runId: 'run-dai', phase: 'pull_activity', entity: 'activity', cursor: pageState.cursor, lastError: loiDaiNhat, message: loiDaiNhat, lastFailureCode: 'FBM_DOCUMENT_PROPERTIES_QUOTA',
    session: Object.assign(macDinh.session, { cookie: 'c'.repeat(300), userId: 'u'.repeat(20), accountUsername: 'tai-khoan', accountName: 'Tên tài khoản FBM' }),
    metadata: Object.assign(macDinh.metadata, {
      customerFields: Array.from({ length: 30 }, (_, i) => 'truong_' + i), activityFields: Array.from({ length: 20 }, (_, i) => 'truong_gd_' + i),
      businessSteps: { run: { at: 1, detail: 'b'.repeat(1400) } }, preflightIssues: [{ code: 'FBM_X', severity: 'warn', scope: 'fbm_sync', message: 'Cảnh báo '.repeat(40), blocking: false }],
      customerScan: { total: 1312, seen: 50 },
      // Hai thứ này từng nằm trong state và đẩy nó lên 8,9/9 KB; cửa ghi state phải bỏ chúng.
      preview: { customers: Array.from({ length: 10 }, () => ({ code: 'M'.repeat(32), name: 'Tên khách '.repeat(16), fbmId: 'A100000000' })), activities: [], truncated: true },
      preflight: { ok: true, issues: [{ code: 'FBM_X', message: 'Cảnh báo '.repeat(40) }], hashSummary: { checked: 1312 } }
    })
  }));
  const stateBytes = Buffer.byteLength(khoState[stateHop.FbmSync.STATE_KEY] || '');
  check(so, 'state một trang Customer đầy (cả lô giao dịch của trang) cộng lastError dài nhất dưới 70% trần một khóa kho, không chứa bản xem trước và preflight đầy đủ',
    [stateBytes > 0 && stateBytes < stateHop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT * 0.7 ? 'dưới 70%' : stateBytes + ' byte'], ['dưới 70%']);
  // Mẫu số tiến trình là số khách của lượt (FBM đã lọc theo phạm vi), tử số là số khách đã quét xong; số bản ghi nhận được không chen vào.
  const tienTrinh = { scan: 'full', mode: 'read', metadata: {}, counts: { completed: 0 } };
  builders.FbmSync.customerScanRecord(tienTrinh, { total: 50, rows: Array.from({ length: 50 }, () => ({})) }, true);
  builders.FbmSync.progressCustomersDone(tienTrinh, 3);
  tienTrinh.counts.completed = 1312;
  check(so, 'tiến trình lượt 50 khách là x/50 theo khách đã quét xong', tienTrinh.progress, { done: 3, total: 50 });
  // Chuỗi mong đợi lấy từ request chuyển trang do giao diện FBM gửi (bắt 2026-10-08). Dòng thứ hai mang ngày FBM thật trả cho A000080085 (18:00 UTC ngày 27): giao diện ghi 20260928, tức phải tính theo giờ Việt Nam.
  const customerFields = builders.FbmSync.GRID_FIELDS.customer, dongFbm = builders.FbmSync.rowsToRecords('customer', JSON.stringify({ d: { TotalRowCount: 1312, ViewPage: { Fields: customerFields.map((AliasName) => ({ AliasName })) }, Rows: [
    customerFields.map((field) => ({ stt_rec_kh: 'A000079388', ngay_gd: '/Date(1787101200000)/', datetime0: '/Date(1787156031523)/', xorder: '000000000345' })[field] || ''),
    customerFields.map((field) => ({ stt_rec_kh: 'A000080085', ngay_gd: '/Date(1790532000000)/', datetime0: '/Date(1790298817497)/', xorder: '000000000311' })[field] || '')
  ] } }));
  check(so, 'mô tả trang đang đứng gửi FBM khớp đúng chuỗi giao diện FBM gửi khi chuyển trang Customer', builders.FbmSync.customerPageItems(dongFbm.rows, dongFbm.total),
    { firstPageItem: '2026081920260819000000000345A000079388', lastPageItem: '2026092820260925000000000311A000080085', lastRowCount: 1312 });
  // Khách chưa có giao dịch FBM trả ngày 01/01/1999 là 915123600000; giao diện FBM gửi lại 915148800000 (cộng 7 giờ, bắt 2026-10-08). Gửi nguyên thì FBM trả trang rỗng ở khách thứ 1.000/1.312.
  const dongChuaGd = builders.FbmSync.rowsToRecords('customer', JSON.stringify({ d: { TotalRowCount: 1312, ViewPage: { Fields: customerFields.map((AliasName) => ({ AliasName })) }, Rows: [
    customerFields.map((field) => ({ stt_rec_kh: 'A000069569', ngay_gd: '/Date(915123600000)/', datetime0: '/Date(1751273601493)/', xorder: '000000010624' })[field] || '')
  ] } })).rows[0];
  check(so, 'khóa trang Customer cộng 7 giờ vào ngày như giao diện FBM gửi, chuỗi mô tả trang vẫn là ngày Việt Nam', [builders.FbmSync.customerPageValue(dongChuaGd), builders.FbmSync.customerPageItems([dongChuaGd], 1312).lastPageItem],
    [['/Date(915148800000)/', '/Date(1751298801493)/', '000000010624', 'A000069569'], '1999010120250630000000010624A000069569']);
  // Lượt dừng sớm (phân trang Customer hỏng) mà vẫn xét khách vắng thì mọi khách chưa quét tới bị coi là vắng (gặp thật: 1.262/1.312 khách).
  const marked = [];
  const savedScanEnd = { absent: builders.FbmSync.customerAbsentMark, baseline: builders.FbmSync.customerBaselineWrite, stages: builders.FbmSync.activityStagesContinue };
  builders.FbmSync.customerAbsentMark = () => { marked.push('vắng'); };
  builders.FbmSync.customerBaselineWrite = () => { marked.push('mốc'); };
  builders.FbmSync.activityStagesContinue = () => { marked.push('cửa ghi'); return { ok: true }; };
  const scanRun = (pages) => { const st = { mode: 'read', scan: 'full', phase: 'pull_customer', metadata: {}, session: {}, cursor: {} }; pages.forEach((grid, i) => builders.FbmSync.customerScanRecord(st, grid, i === 0)); marked.length = 0; builders.FbmSync.customerScanEnd(st); return [st.phase, st.lastFailureCode || '', marked.slice()]; };
  const rowsOf = (n) => Array.from({ length: n }, () => ({}));
  check(so, 'chỉ xét khách vắng và sang cửa ghi khi đã nhận đủ số khách FBM báo ở trang đầu; dừng ở 50/1312 hoặc FBM không báo tổng thì phiên lỗi FBM_SCAN_INCOMPLETE, chưa ghi gì',
    [scanRun([{ total: 1312, rows: rowsOf(50) }, { total: 0, rows: [] }]), scanRun([{ total: 0, rows: rowsOf(50) }]), scanRun([{ total: 60, rows: rowsOf(50) }, { total: 0, rows: rowsOf(10) }]), scanRun([{ total: 0, rows: [] }])],
    [['error', 'FBM_SCAN_INCOMPLETE', []], ['error', 'FBM_SCAN_INCOMPLETE', []], ['pull_customer', '', ['mốc', 'vắng', 'cửa ghi']], ['pull_customer', '', ['mốc', 'vắng', 'cửa ghi']]]);
  const savedScope = builders.FbmSync.scope;
  builders.FbmSync.scope = () => ({ codes: ['ALT0010', 'alt00099', 'ALT00010'], fbm: ['ALT0010', 'alt00099', 'ALT00010'], shin: ['CUS-1'], fbmNew: ['ALT0010', 'alt00099'], notFound: [] });
  const scopeScan = { mode: 'read', scan: 'full', phase: 'pull_customer', metadata: {}, session: {}, cursor: {} };
  marked.length = 0;
  builders.FbmSync.customerScanRecord(scopeScan, { total: 2, rows: [{ ma_kh: 'ALT00010' }] }, true);
  builders.FbmSync.customerScanRecord(scopeScan, { total: 0, rows: [{ ma_kh: 'ALT00099' }] }, false);
  builders.FbmSync.customerScanEnd(scopeScan);
  builders.FbmSync.scope = savedScope;
  check(so, 'Mã khách chỉ định chưa có trên Sheet mà danh sách khách FBM không trả về (gộp mọi trang, không phân biệt hoa thường) thành cảnh báo không chặn ở kết quả phiên, phiên vẫn sang cửa ghi',
    [(scopeScan.metadata.preflightIssues || []).map((item) => [item.code, item.blocking, /ALT0010\b/.test(item.message), /00099/.test(item.message)]), marked.slice()],
    [[['FBM_SCOPE_CODE_NOT_ON_FBM', false, true, false]], ['mốc', 'vắng', 'cửa ghi']]);
  builders.FbmSync.customerAbsentMark = savedScanEnd.absent; builders.FbmSync.customerBaselineWrite = savedScanEnd.baseline; builders.FbmSync.activityStagesContinue = savedScanEnd.stages;

  const identityCheckState = { session: { userId: '2037', accountName: 'ANHLT' }, metadata: {} };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }, { id: 'CUS-2', fbmId: 'FBM-2', fbmCustomerCode: 'ALT00011' }];
  builders.FbmSync.identityCheckBegin(identityCheckState);
  builders.FbmSync.identityCheckPage(identityCheckState, [{ stt_rec_kh: 'FBM-1' }, { stt_rec_kh: 'FBM-OTHER' }]);
  const identityCheckResult = builders.FbmSync.identityCheckFinish(identityCheckState);
  const identityCheckRequest = builders.FbmSync.identityCheckCustomerRequest({ type: 0 });
  check(so, 'Kiem tra lien ket Customer chi doc ID da lien ket va tra n/N', [identityCheckResult.total, identityCheckResult.matched, identityCheckResult.missing, identityCheckResult.missingSample[0].fbmId, identityCheckRequest.body.externalKey.some((item) => item.Name === 'ma_kh'), identityCheckRequest.body.sortExpression], [2, 1, 1, 'FBM-2', false, 'stt_rec_kh']);
  let identityFlowState = { mode: 'check', scan: 'identity_check', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037' }, metadata: {} };
  builders.FbmSync.stateRead = () => identityFlowState;
  builders.FbmSync.stateWrite = (next) => {
    var fallback = builders.FbmSync.stateDefault();
    identityFlowState = Object.assign(fallback, next || {}, {
      session: Object.assign(fallback.session, next && next.session || {}),
      metadata: Object.assign(fallback.metadata, next && next.metadata || {}),
      counts: Object.assign(fallback.counts, next && next.counts || {})
    });
    return identityFlowState;
  };
  builders.FbmSync.extractAuthorized = () => 'auth-customer';
  const identityStarted = builders.FbmSync.authContinue('customer', {});
  check(so, 'Identity check sau authorize chi mo Customer grid, khong mo Activity', [identityStarted.meta.kind, identityFlowState.scan, identityFlowState.phase, identityFlowState.metadata.identityCheck.total], ['grid', 'identity_check', 'pull_customer', 2]);
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const identityProbeStarted = builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' });
  const identityUserRequest = identityProbeStarted.request;
  check(so, 'Identity probe chi doc User grid, khong lay Authorized thua', [identityProbeStarted.ok, identityUserRequest.meta.kind, identityFlowState.phase, identityFlowState.cursor.kind, identityUserRequest.body.controller], [true, 'identity_user_grid', 'checking_session', 'identity_user_grid', 'User']);
  const identityProbeFinished = builders.FbmSync.continue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }, Authorized: true }, transport: { contract: MA_HOP_DONG, trace: [{ requestId: identityUserRequest.id }] } });
  check(so, 'Identity probe nhan dien du ma so va ten day du, cho xac nhan luu', [identityProbeFinished.ok, identityFlowState.phase, identityFlowState.cursor, identityFlowState.metadata.identityProbe.userId, identityFlowState.metadata.identityProbe.accountName], [true, 'done', {}, '2037', 'Le Tuan Anh']);
  check(so, 'Identity probe thieu dong User thi fail ro rang', builders.FbmSync.identityUser({ d: { Rows: [], ViewPage: { Fields: [{ AliasName: 'id' }] } } }).code, 'IDENTITY_PROBE_INCOMPLETE');

  let identityWrite;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmId: 'OLD-ID', fbmCustomerCode: 'ALT99999', companyName: 'Cũ' }] : [];
  builders.writeGateSave = (request) => { identityWrite = request; return { ok: true }; };
  const identityIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-ID', ma_kh: 'ALT99999', ten_kh: 'Mới' }, gate);
  const identityResult = builders.FbmSync.pullWrite('customer', [identityIncoming]);
  check(so, 'Customer lech stt_rec_kh van cap nhat dung dong theo ma_kh', [identityResult.written, identityWrite.records[0].id, identityWrite.records[0].fbmId], [1, 'CUS-1', 'NEW-ID']);

  // FBM đổi ma_kh mà nội dung giữ nguyên: hash không đổi nhưng mã FBM phải theo FBM, nếu không Activity mới mang mã mới sẽ mồ côi.
  let codeWrite;
  const codeIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'CODE-ID', ma_kh: 'ALT00777', ten_kh: 'Giữ nguyên' }, gate);
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [Object.assign({}, codeIncoming, { id: 'CUS-CODE', fbmCustomerCode: 'ALT00111', fbmHash: codeIncoming.fbmHash, syncStatus: 'đã đồng bộ' })] : [];
  builders.writeGateSave = (request) => { codeWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('customer', [codeIncoming]);
  check(so, 'FBM-054: FBM đổi ma_kh mà nội dung không đổi thì lượt kéo vẫn ghi mã FBM mới xuống ShinCRM', [codeWrite && codeWrite.records.length, codeWrite && codeWrite.records[0].id, codeWrite && codeWrite.records[0].fbmCustomerCode], [1, 'CUS-CODE', 'ALT00777']);
  let taxWrite;
  let taxState = { metadata: {} };
  builders.FbmSync.stateRead = () => taxState;
  builders.FbmSync.stateWrite = (next) => { taxState = next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST', taxNumber: '010.012 3456', fbmId: '', fbmCustomerCode: '', note: 'Nội bộ' }];
  builders.writeGateSave = (request) => { taxWrite = request; return { ok: true }; };
  const taxIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'MST-ID', ma_kh: 'ALT00011', ma_so_thue: '0100123456', ten_kh: 'FBM cùng MST' }, gate);
  const taxResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer cùng MST nối vào dòng ShinCRM chưa liên kết', [taxResult.written, taxWrite.records[0].id, taxWrite.records[0].fbmId, taxWrite.records[0].note], [1, 'CUS-MST', 'MST-ID', 'Nội bộ']);

  let ambiguousWrite = false;
  taxState = { metadata: {} };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST-1', taxNumber: '0100123456' }, { id: 'CUS-MST-2', taxNumber: '0100123456' }];
  builders.writeGateSave = () => { ambiguousWrite = true; return { ok: true }; };
  const ambiguousResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi', [ambiguousResult.written, ambiguousResult.skipped, ambiguousWrite, taxState.metadata.identityBlocks[0].reason], [0, 1, false, 'duplicate_tax_number']);
  let newPullWrite, newPullCalls = 0, dirtyMarkCalls = 0;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.readLocal = () => [];
  builders.dirtyStateMarkSignal = () => { dirtyMarkCalls += 1; };
  builders.writeGateSave = (request) => { newPullCalls += 1; newPullWrite = request; return { ok: true, fields: ['id'], rows: [['CUS-NEW']] }; };
  const newPullResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-C', ma_kh: 'ALT00012', ten_kh: 'Khách mới', ma_so_thue: '001' }, gate)]);
  check(so, 'Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi', [newPullResult.written, newPullWrite.source, newPullWrite.schemas.length, newPullWrite.records[0].fbmId, newPullWrite.records[0].fbmHash !== '', newPullWrite.records[0].parentCompanyName, newPullWrite.records[0].fbmSyncPermission, dirtyMarkCalls], [1, 'pull', 2, 'NEW-C', true, '', builders.FbmSync.pullDefaultPermission(), 0]);
  check(so, 'Pull gộp nội dung và trạng thái vào một lượt cửa ghi', newPullCalls, 1);
  // Đổi tên giá trị ở Category rồi chọn lại ô Config: khách mới mang đúng tên mới, không còn chuỗi gõ cứng nào.
  verifyDefault = 'Đã kiểm tra tên mới';
  builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-V', ma_kh: 'ALT00013', ten_kh: 'Khách đổi tên', ma_so_thue: '002' }, gate)]);
  check(so, 'khách mới kéo từ FBM mang giá trị Xác thực đang chọn ở Config', newPullWrite.records[0].verifyStatus, 'Đã kiểm tra tên mới');
  const oldVerify = builders.FbmSync.customerRecord({ stt_rec_kh: 'OLD-V', ma_kh: 'ALT00014', ten_kh: 'Cũ', ma_so_thue: '003' }, gate);
  builders.FbmSync.readLocal = () => [Object.assign({}, oldVerify, { id: 'CUS-OLD', fbmHash: oldVerify.fbmHash, syncStatus: 'đã đồng bộ', verifyStatus: 'Đã xác minh tay' })];
  newPullWrite = null;
  builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'OLD-V', ma_kh: 'ALT00014', ten_kh: 'Cũ đổi tên', ma_so_thue: '003' }, gate)]);
  check(so, 'khách đã có giữ giá trị Xác thực của mình khi lấy từ FBM', [newPullWrite && newPullWrite.records[0].companyName, newPullWrite && newPullWrite.records[0].verifyStatus], ['Cũ đổi tên', 'Đã xác minh tay']);
  verifyDefault = '';
  builders.FbmSync.readLocal = () => [];
  newPullCalls = 0;
  let verifyMissing = null;
  try { builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-E', ma_kh: 'ALT00015', ten_kh: 'Khách thiếu Config', ma_so_thue: '004' }, gate)]); } catch (error) { verifyMissing = error; }
  check(so, 'ô Xác thực mặc định trống thì chiều lấy dừng, không ghi khách mới', [verifyMissing && verifyMissing.code, newPullCalls], ['FBM_VERIFY_STATUS_DEFAULT_MISSING', 0]);
  verifyDefault = 'Chưa xác thực';
  const pullLogs = [];
  builders.logEvent = (event) => pullLogs.push(event);
  builders.FbmSync.readLocal = () => [];
  builders.writeGateSave = () => ({ ok: true });
  builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'LOG-C', ma_kh: 'ALT00015', ten_kh: 'Có log', ma_so_thue: '002' }, gate)]);
  check(so, 'Pull không ghi Log từng record; PullFlow sẽ tổng hợp tại bước nghiệp vụ', pullLogs.length, 0);
  let reconcileWrite;
  const reconcileIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'Gốc' }, gate);
  const reconcileLocal = Object.assign({}, reconcileIncoming, { id: 'CUS-REC', syncStatus: builders.FbmSync.SYNC_STATUS.synced });
  reconcileLocal.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = () => [reconcileLocal];
  builders.writeGateSave = (request) => { reconcileWrite = request; return { ok: true }; };
  const unchangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'ba hash khong doi khong ghi noi dung', [unchangedResult.written, reconcileWrite], [0, undefined]);
  builders.FbmSync.readLocal = () => [Object.assign({}, reconcileLocal, { fbmHash: '' })];
  const healedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'baseline rong tu lanh chi ghi hash', [healedResult.written, reconcileWrite.records[0].fbmHash !== '', reconcileWrite.records[0].companyName], [0, true, undefined]);
  const fbmChanged = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'FBM đổi' }, gate);
  builders.FbmSync.readLocal = () => [reconcileLocal];
  const fbmChangedResult = builders.FbmSync.pullWrite('customer', [fbmChanged]);
  check(so, 'chi FBM doi thi pull noi dung', [fbmChangedResult.written, reconcileWrite.records[0].companyName], [1, 'FBM đổi']);
  const shinChanged = Object.assign({}, reconcileLocal, { companyName: 'Shin đổi' });
  shinChanged.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.readLocal = () => [shinChanged];
  const shinChangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'chi ShinCRM doi thi khong pull de', [shinChangedResult.written, reconcileWrite.records[0].syncStatus], [0, builders.FbmSync.SYNC_STATUS.pending]);
  let conflictState = { metadata: {}, counts: { conflict: 0 } }, conflictWrite, conflictLog = [];
  builders.LOG_CONFLICT = 'conflict';
  builders.logEvent = (event) => { conflictLog.push(event); };
  builders.FbmSync.stateRead = () => conflictState;
  builders.FbmSync.stateWrite = (next) => { conflictState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-2', fbmId: 'C-2', fbmCustomerCode: 'ALT99999', companyName: 'Shin', fbmHash: builders.FbmSync.hash({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'Base' }, 'customer', gate) }];
  builders.writeGateSave = (request) => { conflictWrite = request; return { ok: true }; };
  builders.FbmSync.recordIssues = {};
  const conflictResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'FBM' }, gate)]);
  check(so, 'conflict chỉ ghi trạng thái xung đột chờ quyết, không ghi nội dung FBM và không cất diff vào state', [conflictResult.conflicts, 'conflicts' in conflictState.metadata, conflictWrite.records[0].syncStatus, conflictWrite.records[0].companyName], [1, false, builders.FbmSync.SYNC_STATUS.conflict, undefined]);
  builders.FbmSync.recordIssuesFlush();
  const conflictEntries = conflictLog.filter((event) => event.action === 'pull_record_issue');
  check(so, 'conflict theo bản ghi có đúng một dòng Log gom ở ranh giới lát, mang mã bản ghi và trạng thái xung đột',
    [conflictEntries.length, conflictEntries[0] && conflictEntries[0].outcome, conflictEntries[0] && conflictEntries[0].recordId, conflictEntries[0] && conflictEntries[0].detail.status],
    [1, 'conflict', 'CUS-2', builders.FbmSync.SYNC_STATUS.conflict]);

  const bindingStore = {};
  const identity = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => bindingStore[key] || null, setProperty: (key, value) => { bindingStore[key] = String(value); } }) }
  });
  napServer(identity, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  identity.FbmSync.currentSpreadsheetId = () => 'sheet-a';
  identity.FbmSync.configValue = () => '';
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED', fbmId: 'FBM-A' }];
  check(so, 'file co FBM ID nhung chua lien ket phai yeu cau REBIND', [identity.FbmSync.identityStatus().status, identity.FbmSync.identityPreflight('read').blocking, identity.FbmSync.identityPreflight('write').blocking, identity.FbmSync.identityPreflight('background').blocking, identity.FbmSync.identityPreflight('identity_check').blocking], ['REBIND_REQUIRED', true, true, true, false]);
  const savedBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'luu lien ket dung Spreadsheet va tai khoan', [savedBinding.ok, identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status], [true, 'BOUND']);
  bindingStore[identity.FbmSync.BINDING_KEY] = JSON.stringify({ spreadsheetId: 'sheet-a', userId: 'user-a', accountName: 'Tai khoan A' });
  const legacyBeforeRead = bindingStore[identity.FbmSync.BINDING_KEY];
  const legacyStatus = identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'doc binding cu thieu username khong tu ghi nang cap', [legacyStatus.status, bindingStore[identity.FbmSync.BINDING_KEY]], ['REBIND_REQUIRED', legacyBeforeRead]);
  const upgradedLegacyBinding = identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' });
  check(so, 'chi thao tac luu ro rang moi nang cap username cho binding cu', [upgradedLegacyBinding.ok, JSON.parse(bindingStore[identity.FbmSync.BINDING_KEY]).username], [true, 'ANHLT']);
  check(so, 'khong cho ghi de lien ket khi du lieu FBM cu van con', [identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok, identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).code], [false, 'REBIND_REQUIRED']);
  identity.FbmSync.readLocal = () => [];
  check(so, 'sau khi xu ly du lieu cu moi cho doi lien ket', identity.FbmSync.bindingWrite({ spreadsheetId: 'sheet-a', userId: 'user-b', username: 'USERB', accountName: 'Tai khoan B' }).ok, true);
  identity.FbmSync.readLocal = () => [{ id: 'CUS-LINKED-NEW', fbmId: 'FBM-B' }];
  check(so, 'runtime tai khoan lech lien ket moi thi fail-closed', identity.FbmSync.identityStatus({ userId: 'user-a', username: 'ANHLT', accountName: 'Tai khoan A' }).status, 'REBIND_REQUIRED');

  const edgeProperties = {};
  const edges = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => edgeProperties[key] || null, setProperty: (key, value) => { edgeProperties[key] = String(value); }, deleteProperty: (key) => { delete edgeProperties[key]; } }) } });
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  edges.FbmSync.readCategoryGate = () => gate;
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh', edges.FbmSync.normalize('/Date(1757386800000+0700)/'), edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint', edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'), edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'));
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000320' }, { id: 'CUS-000321' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000321', fbmId: 'FBM-SEEN' }], [{ fbmId: 'FBM-SEEN' }]);
  check(so, 'bitmap seen bam theo ma noi bo nen sap xep lai dong khong lam mat dau', edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000321', fbmId: 'FBM-SEEN' }), true);
  check(so, 'bitmap fail closed voi ID cu, sai khuon hoac sai namespace', [edges.FbmSync.seenStoreHas('customer', { id: 'KH000321', fbmId: 'FBM-OLD' }), edges.FbmSync.seenStoreHas('customer', { id: 'khach-cu', fbmId: 'FBM-UNKNOWN' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-1', fbmId: 'FBM-SHORT' }), edges.FbmSync.seenStoreHas('customer', { id: 'ACT-000321', fbmId: 'FBM-WRONG-SCOPE' })], [true, true, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', [{ id: 'CUS-000019' }, { id: 'CUS-000020' }]);
  edges.FbmSync.seenStoreMark('customer', [{ id: 'CUS-000019', fbmId: 'FBM-19' }, { id: 'CUS-000020', fbmId: 'FBM-20' }], [{ fbmId: 'FBM-20' }]);
  check(so, 'pham vi missing co dinh tai dau ky va bo qua record tao sau high-water', [edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000019' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000020' }), edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000021' })], [false, true, true]);
  edges.FbmSync.seenStoreClear('customer');
  edges.FbmSync.seenStoreBegin('customer', []);
  check(so, 'pham vi rong dau ky bo qua moi record tao trong khi request dang bay', edges.FbmSync.seenStoreHas('customer', { id: 'CUS-000001' }), true);

  let lockedWrite = false;
  const lockedState = { mode: 'write', metadata: { seen: { customer: {}, activity: {} } } };
  edges.FbmSync.stateRead = () => lockedState;
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.validateIncomingCategories = () => [];
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000010', fbmId: 'FBM-LOCK', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmHash: '' }];
  giuBanGhi(edges, 'khac', 'customer', 'CUS-000010');
  edges.writeGateSave = () => { lockedWrite = true; return { ok: true }; };
  const lockedPull = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-LOCK', ma_kh: 'ALT00010', ten_kh: 'Mới' }, {})]);
  check(so, 'pull bỏ qua bản ghi tiến trình khác đang giữ trong sổ bận, để lượt sau', [lockedPull.written, lockedPull.skipped, lockedWrite], [0, 1, false]);

  let activityPullWrite;
  edges.FbmSync.stateRead = () => ({ metadata: { seen: { customer: {}, activity: {} } } });
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmId: 'S14', fbmCustomerCode: 'ALT00014' }] : [];
  edges.writeGateSave = (request) => { activityPullWrite = request; return { ok: true }; };
  const newActivity = edges.FbmSync.activityRecord({ id: 88, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Nội dung', end_date: '/Date(1757386800000)/' }, gate, { sttRec: 'S14' });
  const activityPull = edges.FbmSync.pullWrite('activity', [newActivity]);
  check(so, 'Activity pull moi noi dung vao Customer noi bo va cho phep day', [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId, activityPullWrite.records[0].fbmSyncPermission], [1, 'CUS-ACT', 88, edges.FbmSync.pullDefaultPermission()]);
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmId: 'S14', fbmCustomerCode: 'ALT00014' }] : [];
  const orphanActivity = edges.FbmSync.activityRecord({ id: 89, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Mồ côi #SC-ACT-UNKNOWN', end_date: '/Date(1757386800000)/' }, gate, { sttRec: 'S14' });
  const orphanActivityResult = edges.FbmSync.pullWrite('activity', [orphanActivity]);
  check(so, 'Activity marker mo coi khong tao dong moi', orphanActivityResult.written, 0);
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate, { sttRec: 'S14' });
  const invalidActivityResult = edges.FbmSync.pullWrite('activity', [invalidActivity]);
  check(so, 'Activity thieu ngay bi chan an toan', invalidActivityResult.written, 0);

  edges.FbmSync.scope = () => null;
  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmSyncPermission: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', {});
  edges.FbmSync.stateRead = () => ({ metadata: {} });
  edges.FbmSync.pushFailuresRead = () => ({ hashes: { 'customer:C-FAIL': failedHash }, details: {} });
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', edges.FbmSync.pushCandidates('customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', edges.FbmSync.pushCandidates('customer').length, 1);

  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', {});
  const notAppliedState = { metadata: { seen: { customer: {}, activity: {} } } };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord(oldFbm, {})]);
  check(so, 'FBM khong doi sau push thanh notApplied, chặn đẩy bằng trạng thái Sheet', [notApplied.skipped, notAppliedWrite.records[0].syncStatus], [1, edges.FbmSync.SYNC_STATUS.notApplied]);

  // FBM-023 (chủ dự án chốt 2026-10-06): khi cửa ghi Sheet từ chối một bản ghi kéo về, pull chặn CẢ TRANG chứ không bỏ riêng bản ghi đó.
  // Chặn cả trang chỉ an toàn vì cửa ghi hiện KHÔNG có luật nào từ chối được nội dung một trường FBM (chỉ dữ liệu người dùng nhập mới bị kiểm bắt buộc/định dạng/trùng).
  // Nếu test này đỏ: ai đó vừa thêm luật kiểm (ví dụ đổi một trường FBM sang kiểu số, hoặc bật kiểm trùng cho nguồn pull). Khi đó một khách FBM có dữ liệu "lạ" sẽ chặn đồng bộ nền mãi mãi.
  // Đừng chỉ sửa test cho xanh: phải quyết định lại FBM-023 — bỏ luật kiểm đó cho nguồn pull, hoặc làm phương án (b) "bỏ riêng bản ghi lỗi, ghi phần còn lại, đặt trạng thái lỗi" kèm ngưỡng dừng đặt trong file config.
  const gateBox = napServer(taoHopCat({ FbmSync: {} }), ...TEP_NEN, 'fbm_sync/SyncSchema.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js');
  const strangeText = 'abc ### 12,3,4 ngày 99/99 xyz';
  const strangeFbm = {};
  gateBox.FbmSync.GRID_FIELDS.customer.concat(gateBox.FbmSync.GRID_FIELDS.activity, Object.values(gateBox.FbmSync.FIELD_ALIASES.customer), Object.values(gateBox.FbmSync.FIELD_ALIASES.activity)).forEach((field) => { strangeFbm[field] = strangeText; });
  const pullRejects = (entity, record) => {
    const fields = gateBox.writeGateFields(entity, [gateBox.DATA_SCHEMA, gateBox.SYNC_SCHEMA]);
    const names = Object.keys(record).filter((name) => fields[name]);
    const strange = {};
    names.forEach((name) => { strange[name] = strangeText; });
    const invalid = [];
    const plans = [record, strange].map((source) => ({ record: source, values: {}, moi: true, row: 0 }));
    plans.forEach((plan) => gateBox.writeGateBuild(plan, names, fields, 'pull', invalid, null));
    gateBox.writeGateUniqueCheck(plans, names, fields, 'pull', { sheetName: entity, rowCount: 0 }, invalid);
    return invalid.map((item) => item.field + ': ' + item.reason);
  };
  check(so, 'FBM-023: cửa ghi Sheet không có luật nào từ chối nội dung trường kéo từ FBM về (Customer và Activity, kể cả giá trị lạ và hai bản ghi trùng nhau) — đỏ thì phải quyết lại FBM-023, xem chú thích',
    [pullRejects('customer', gateBox.FbmSync.customerRecord(strangeFbm, {})), pullRejects('activity', gateBox.FbmSync.activityRecord(strangeFbm, {}, null))], [[], []]);
}

module.exports = { chay };
