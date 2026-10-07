/** Kiểm tra pull Customer/Activity, identity, hash và missing. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");
const { TEP_NEN } = require("../../lib/dung-hop");
const fs = require("fs");
const path = require("path");

async function chay(so) {
  section("FBM sync — pull và identity");
  const builders = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => '', setProperty: () => {} }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/write/SheetSave.js');
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
  const transportSource = fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8');
  check(so, 'khong con co ghi FBM an ngoai mode va cac cong an theo co cu', transportSource.indexOf('FBM_SYNC_ALLOW_WRITES') < 0 && transportSource.indexOf('writeAllowed') < 0, true);

  let readFinishState = {
    runId: 'read-run', origin: 'manual', mode: 'read', scan: 'full', phase: 'pull_customer', entity: 'customer',
    cursor: { kind: 'customer_grid' }, activeRequestId: 'read-request', deadlineAt: Date.now() + 60000,
    lastProgressAt: Date.now(), session: {}, metadata: {},
    counts: { total: 0, completed: 0, succeeded: 0, conflict: 0, skipped: 0, error: 0 }
  };
  let readFinishMissing = 0;
  let readFinishPushRequests = 0;
  const readFinish = taoHopCat({
    FbmSync: {
      stateRead: () => readFinishState,
      stateWrite: (next) => { readFinishState = next; return next; },
      recoverStaleRun: (state) => ({ state, recovered: false }),
      responseRequestId: () => 'read-request',
      protocol: { parse: (value) => value, assertSuccess: () => ({ ok: true }) },
      traceImport: () => {}, traceEvent: () => {}, traceResponse: () => ({}), applyTransportSession: () => false,
      rowsToRecords: () => ({ rows: [], fields: [], total: 0 }), isTemporaryRecord: () => false,
      pullWrite: () => ({ ok: true, written: 0, conflicts: 0, skipped: 0 }), previewRecords: () => {}, customerNext: () => null, activityForCustomers: () => null,
      canWriteSheet: (mode) => mode === 'read' || mode === 'write', canWriteFbm: (mode) => mode === 'push' || mode === 'write',
      markMissingAfterFullScan: () => { readFinishMissing += 1; return { written: 0 }; },
      stopPushOnConflicts: () => false, nextPushRequest: () => { readFinishPushRequests += 1; return {}; },
      statusView: () => ({ phase: readFinishState.phase, mode: readFinishState.mode })
    }
  });
  napServer(readFinish, 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/write/SheetSave.js');
  const readFinished = readFinish.FbmSync.continue({ transport: { trace: [{ requestId: 'read-request' }] } });
  check(so, 'mode read ket thuc pull thi ghi missing vao Sheet va khong mo chieu push FBM', [readFinished.ok, readFinishState.phase, readFinishMissing, readFinishPushRequests], [true, 'done', 2, 0]);
  builders.FbmSync.stateRead = () => ({ session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } });
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  builders.FbmSync.readCategoryGate = () => gate;
  readFinish.FbmSync.readCategoryGate = () => gate;
  let recoveryWrite;
  let recoveryState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: {}, locks: { 'activity:ACT-9': { owner: 'sync' } } };
  builders.FbmSync.stateRead = () => recoveryState;
  builders.FbmSync.stateWrite = (next) => { recoveryState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: '', customerId: 'KH-1', syncStatus: builders.FbmSync.SYNC_STATUS.pushing }];
  builders.writeGateSave = (request) => { recoveryWrite = request; return { ok: true }; };
  const recovered = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 77, ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9' }, gate)], 'write');
  check(so, 'Activity marker recovery vá FBM ID không tạo dòng mới', [recovered.written, recoveryWrite.records[0].id, recoveryWrite.records[0].fbmId, recoveryState.locks['activity:ACT-9']], [1, 'ACT-9', '77', undefined]);
  let markerConflictWrite, markerState = { session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' }, metadata: { seen: { customer: {}, activity: {} } }, locks: {}, counts: { conflict: 0 } };
  builders.FbmSync.stateRead = () => markerState;
  builders.FbmSync.stateWrite = (next) => { markerState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash' }];
  builders.writeGateSave = (request) => { markerConflictWrite = request; return { ok: true }; };
  const markerConflict = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate)]);
  check(so, 'Activity marker trỏ FBM ID khác ghi trạng thái xung đột chờ quyết lên Sheet, không cất bản ghi vào state', [markerConflict.conflicts, 'conflicts' in markerState.metadata, markerConflictWrite.records[0].syncStatus, Object.keys(markerState.locks)], [1, false, builders.FbmSync.SYNC_STATUS.conflict, []]);
  // G12: giao dịch đã đồng bộ của chính tài khoản mà FBM còn dấu #SC thì xếp đẩy sửa để bỏ dấu; của tài khoản khác thì không đụng.
  const settingsBeforeMarker = builders.FbmSync.scriptSettings;
  gate.map['@CAT_CONG_VIECGọi'] = 'GOI'; gate.valid['@CAT_CONG_VIEC'] = { 'Gọi': true, GOI: true };
  const markedIncoming = builders.FbmSync.activityRecord({ id: 'FBM-9', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9', owner: 'Chủ tài khoản' }, gate);
  let markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ accountName: 'Chủ tài khoản' });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'FBM-9', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: 'Chủ tài khoản', fbmHash: markedIncoming.fbmHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { markedWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('activity', [Object.assign({}, markedIncoming)]);
  const ownMarked = markedWrite && markedWrite.records[0].syncStatus;
  markedWrite = null;
  builders.FbmSync.scriptSettings = () => ({ accountName: 'Đồng nghiệp' });
  builders.FbmSync.pullWrite('activity', [Object.assign({}, markedIncoming)]);
  check(so, 'G12: lượt kéo xếp "chờ đối soát" cho giao dịch của mình còn dấu #SC trên FBM, không đụng giao dịch tài khoản khác', [ownMarked, markedWrite && markedWrite.records[0].syncStatus], [builders.FbmSync.SYNC_STATUS.pending, null]);
  // Người tạo trên FBM đứng ngoài fingerprint: nội dung không đổi thì hash không lộ, lượt kéo vẫn phải ghi tên người tạo xuống ShinCRM.
  const ownerIncoming = builders.FbmSync.activityRecord({ id: 'FBM-10', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung', owner: 'Sale Cũ' }, gate);
  let ownerWrite = null;
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-10', fbmId: 'FBM-10', customerId: 'KH-1', content: 'Nội dung', taskType: 'Gọi', workDate: '/Date(1757386800000)/', enteredBy: '', fbmHash: ownerIncoming.fbmHash, syncStatus: builders.FbmSync.SYNC_STATUS.synced }];
  builders.writeGateSave = (request) => { ownerWrite = request; return { ok: true }; };
  builders.FbmSync.pullWrite('activity', [Object.assign({}, ownerIncoming)]);
  check(so, 'Người tạo trên FBM: lượt kéo ghi owner FBM vào enteredBy khi nội dung không đổi, không đổi trạng thái đồng bộ', [ownerIncoming.enteredBy, ownerWrite && ownerWrite.records.length, ownerWrite && ownerWrite.records[0].id, ownerWrite && ownerWrite.records[0].enteredBy, ownerWrite && ownerWrite.records[0].syncStatus], ['Sale Cũ', 1, 'ACT-10', 'Sale Cũ', undefined]);
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
  builders.FbmSync.testScopeCodes = () => ['ALT00010', 'CUS-020061'];
  const customerGridKeys = builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey;
  check(so, 'Chế độ thử: grid Customer chỉ đọc khách có mã trong danh sách thử', [customerGridKeys.length, customerGridKeys[1] && customerGridKeys[1].Name, customerGridKeys[1] && customerGridKeys[1].Value], [2, "ma_kh in ('ALT00010','CUS-020061') and 1", 1]);
  builders.FbmSync.testScopeCodes = () => [];
  const emptyScopeKeys = builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey;
  check(so, 'Chế độ thử với danh sách rỗng: grid Customer lọc ra không khách nào, không rơi thành quét toàn bộ', [emptyScopeKeys.length, emptyScopeKeys[1] && emptyScopeKeys[1].Name], [2, "ma_kh in ('') and 1"]);
  builders.FbmSync.testScopeCodes = () => null;
  check(so, 'Tắt chế độ thử: grid Customer chỉ còn điều kiện phân quyền', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey.length, 1);
  builders.FbmSync.testScopeCodes = () => ['ALT00010'];

  const bulkActivity = builders.FbmSync.activityBulkRequest({ type: 0 });
  check(so, 'Bulk Activity không gắn mốc thời gian hay Customer đơn lẻ', [bulkActivity.meta.kind, bulkActivity.body.externalKey.some((item) => item.Name === 'end_date' && item.Opr === '>='), bulkActivity.body.externalKey.some((item) => item.Name === 'stt_rec')], ['activity_bulk_grid', false, false]);
  builders.FbmSync.accountSettingsRead = () => ({ activitySince: '2024-10-07' });
  const activitySinceBulk = builders.FbmSync.activityBulkRequest({ type: 0 });
  const activitySinceCustomer = builders.FbmSync.activityGridRequest('CUS-FBM-1', { type: 0 });
  const activityHistory = builders.FbmSync.activityBulkRequest({ type: 0, includeHistory: true });
  check(so, 'Mốc Activity dùng filter FBM đúng định dạng cho bulk và từng Customer', [activitySinceBulk.body.filter, activitySinceCustomer.body.filter, activitySinceCustomer.body.externalKey[0].Name, activityHistory.body.filter], [['end_date:>=07/10/2024'], ['end_date:>=07/10/2024'], 'stt_rec', []]);
  check(so, 'Mốc Activity đổi ngày không hợp lệ thì không tự gắn filter', builders.FbmSync.activitySinceFilterDate('2024-02-31'), '');
  const activityMissing = builders.FbmSync.activityBulkMissing([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'TMP-3', fbmId: 'F-3', recordStatus: 'active' }], { 'F-1': true });
  check(so, 'Bulk Activity chỉ trả dòng active vắng ID FBM', [activityMissing.length, activityMissing[0] && activityMissing[0].id, activityMissing[0] && activityMissing[0].syncStatus], [0, undefined, undefined]);
  const activityMissingOnly = builders.FbmSync.activityBulkMissing([{ id: 'A-1', fbmId: 'F-1', recordStatus: 'active' }, { id: 'A-2', fbmId: 'F-2', recordStatus: 'deleted' }, { id: 'A-4', fbmId: 'F-4', recordStatus: 'active' }, { id: 'TMP-3', fbmId: 'TMP-F-3', recordStatus: 'active' }], { 'F-1': true });
  check(so, 'Bulk Activity vắng được đánh dấu missing khi ID không xuất hiện', [activityMissingOnly.length, activityMissingOnly[0].id, activityMissingOnly[0].syncStatus], [1, 'A-4', builders.FbmSync.SYNC_STATUS.missing]);
  const activityMissingBeforeSince = builders.FbmSync.activityBulkMissing([{ id: 'A-OLD', fbmId: 'F-OLD', workDate: '2024-10-06', recordStatus: 'active' }, { id: 'A-SINCE', fbmId: 'F-SINCE', workDate: '2024-10-07', recordStatus: 'active' }], {});
  check(so, 'Activity trước mốc không bị đánh dấu missing còn đúng ngày mốc thì vẫn kiểm tra', [activityMissingBeforeSince.length, activityMissingBeforeSince[0] && activityMissingBeforeSince[0].id], [1, 'A-SINCE']);
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn', builders.FbmSync.validateLookupGate(lookupState, lookupGate).length, 0);

  let bulkState = { mode: 'read', scan: 'activity_bulk', phase: 'pull_activity', entity: 'activity', metadata: {}, cursor: {} };
  builders.FbmSync.stateRead = () => bulkState;
  builders.FbmSync.stateWrite = (next) => { bulkState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'ACT-000001', fbmId: 'F-LOCAL', recordStatus: 'active' }];
  const bulkStart = builders.FbmSync.beginActivityBulkPull(bulkState);
  bulkState.cursor.count = 1;
  check(so, 'Bulk Activity khoi tao cursor ben vung va request khong gan Customer', [bulkState.cursor.kind, bulkStart.meta.kind, bulkStart.body.externalKey.some((item) => item.Name === 'stt_rec')], ['activity_bulk_grid', 'activity_bulk_grid', false]);
  const bulkNext = builders.FbmSync.activityBulkNext(bulkState, { rows: [{ id: 'F-1', end_date: '2026-09-09', datetime0: '2026-09-09T01:00:00', line_nbr: 1 }], total: 2 });
  check(so, 'Bulk Activity tiep tuc bang composite key ma khong nhet ID vao cursor', [bulkNext.meta.kind, bulkNext.body.type, bulkNext.body.gridPageValue, bulkState.cursor.seenIds], ['activity_bulk_grid', 1, ['2026-09-09', '2026-09-09T01:00:00', 'F-1', 1], undefined]);
  const bulkDone = builders.FbmSync.activityBulkNext(bulkState, { rows: [{ id: 'F-2', end_date: '2026-09-10', datetime0: '2026-09-10T01:00:00', line_nbr: 1 }], total: 2 });
  check(so, 'Bulk Activity ket thuc, luu ID local vang va chuyen sang vong xoay Customer', [bulkDone && bulkDone.meta.kind, bulkState.cursor.kind, bulkState.metadata.activityBulkMissing.length, bulkState.metadata.activityBulkMissing[0].fbmId], ['activity_rotation_customer_grid', 'activity_rotation_customer_grid', 1, 'F-LOCAL']);
  const finishedSupplementState = { cursor: { kind: 'activity_grid' }, phase: 'pull_activity', entity: 'activity', metadata: {}, session: {} };
  check(so, 'Trang thai done xoa cursor Activity da ket thuc', [builders.FbmSync.activitySupplementNext(finishedSupplementState, { kind: 'done', rows: [] }), finishedSupplementState.phase, finishedSupplementState.cursor], [null, 'done', {}]);

  // Cursor Activity mang danh sách khách của trang Customer vừa đọc; trang phải đủ nhỏ để state không vượt trần một DocumentProperty dù tổng số khách là bao nhiêu (lỗi thật: 1.312 khách làm state 76 KB).
  const pageRows = builders.FbmSync.CUSTOMER_PAGE_ROWS;
  let pageState = { mode: 'read', scan: 'full', phase: 'lookup', metadata: {}, session: {}, cursor: {} };
  builders.FbmSync.stateRead = () => pageState;
  builders.FbmSync.stateWrite = (next) => { pageState = next; return next; };
  builders.FbmSync.prepareCategoryGate = () => {};
  builders.FbmSync.seenStoreBegin = () => {};
  builders.FbmSync.readLocal = () => [];
  const firstPage = builders.FbmSync.beginCustomerPull(pageState);
  check(so, 'quet toan bo doc Customer theo trang nho co dinh, khong doc 2000 khach mot trang', [pageState.cursor.count, firstPage.body.count, pageRows <= 50], [pageRows, pageRows, true]);
  // stt_rec_kh của FBM là 'A' + 9 chữ số; ma_kh lấy dài tối đa 32 ký tự như luật mã thử.
  const fullPage = Array.from({ length: pageRows }, (_, i) => ({ sttRec: 'A' + String(100000000 + i), maKh: 'M'.repeat(32) }));
  const nextCustomerPage = builders.FbmSync.customerGridRequest({ type: 1, count: pageRows, gridPageIndex: 7, gridPageValue: ['2026-10-07', '2026-10-07T00:00:00', 'X'.repeat(20)], gridRefresh: false });
  builders.FbmSync.activityForCustomers(pageState, fullPage, nextCustomerPage, 0);
  const cursorBytes = Buffer.byteLength(JSON.stringify(pageState.cursor));
  check(so, 'cursor Activity cua mot trang Customer day voi ma dai nhat van duoi nua tran DocumentProperty va khong chep doi danh sach ma', [cursorBytes < builders.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT / 2, pageState.cursor.customerIds, pageState.cursor.customerContexts.length], [true, undefined, pageRows]);
  const rotationRows = Array.from({ length: builders.FbmSync.ACTIVITY_SUPPLEMENT_CUSTOMERS }, (_, i) => ({ stt_rec_kh: 'R' + i, ngay_gd: '2026-10-0' + (i % 9 + 1), datetime0: 'T' + i, xorder: i, ten_kh: 'Ten dai '.repeat(20) }));
  check(so, 'vong xoay chi giu vi tri trang ke tiep, khong giu cac dong Customer; trang thieu thi quay ve dau', [builders.FbmSync.activityRotationNext(rotationRows), builders.FbmSync.activityRotationNext(rotationRows.slice(1))], [{ pageIndex: 0, pageValue: ['2026-10-03', 'T29', 29, 'R29'] }, { pageIndex: -1, pageValue: null }]);
  // Lượt dừng sớm (phân trang Customer hỏng) mà vẫn đánh vắng mặt thì mọi khách chưa quét tới bị đánh "không thấy bên FBM" (gặp thật: 1.262/1.312 khách).
  const marked = [];
  const savedMark = builders.FbmSync.markMissingAfterFullScan;
  builders.FbmSync.markMissingAfterFullScan = (entity) => { marked.push(entity); return { written: 0 }; };
  const scanRun = (pages) => { const st = { mode: 'read', scan: 'full', phase: 'pull_activity', metadata: {}, session: {}, cursor: {} }; pages.forEach((grid, i) => builders.FbmSync.customerScanRecord(st, grid, i === 0)); marked.length = 0; builders.FbmSync.finishPullRun(st); return [st.phase, st.lastFailureCode || '', marked.slice()]; };
  const rowsOf = (n) => Array.from({ length: n }, () => ({}));
  check(so, 'chỉ đánh không thấy bên FBM khi đã nhận đủ số khách FBM báo ở trang đầu; dừng ở 50/1312 hoặc FBM không báo tổng thì phiên lỗi FBM_SCAN_INCOMPLETE và không đánh',
    [scanRun([{ total: 1312, rows: rowsOf(50) }, { total: 0, rows: [] }]), scanRun([{ total: 0, rows: rowsOf(50) }]), scanRun([{ total: 60, rows: rowsOf(50) }, { total: 0, rows: rowsOf(10) }]), scanRun([{ total: 0, rows: [] }])],
    [['error', 'FBM_SCAN_INCOMPLETE', []], ['error', 'FBM_SCAN_INCOMPLETE', []], ['done', '', ['customer', 'activity']], ['done', '', ['customer', 'activity']]]);
  builders.FbmSync.markMissingAfterFullScan = savedMark;
  builders.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'A-NEW', fbmId: 'F-NEW', workDate: '2026-09-10' }] : [];
  const catchup = builders.FbmSync.activityCatchupCustomerRequest();
  check(so, 'Lop catchup tao Customer grid theo ngay_gd moi hon Activity local', [catchup.meta.kind, catchup.meta.activityMaxDate, catchup.body.externalKey.some((item) => item.Name === 'ngay_gd' && item.Opr === '>')], ['activity_catchup_customer_grid', '2026-09-10', true]);

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
  builders.FbmSync.extractSessionIdentity = () => ({ userId: '2037', accountName: 'ANHLT' });
  const identityStarted = builders.FbmSync.authContinue('customer', {});
  check(so, 'Identity check sau authorize chi mo Customer grid, khong mo Activity', [identityStarted.meta.kind, identityFlowState.scan, identityFlowState.phase, identityFlowState.metadata.identityCheck.total], ['grid', 'identity_check', 'pull_customer', 2]);
  identityFlowState = { mode: 'check', scan: 'identity_probe', session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: false, activityAuthorized: false }, metadata: {} };
  identityFlowState.runId = ''; identityFlowState.phase = 'idle'; identityFlowState.cursor = {};
  const identityProbeStarted = builders.FbmSync.start({ mode: 'check', scan: 'identity_probe' });
  const identityUserRequest = identityProbeStarted.request;
  check(so, 'Identity probe chi doc User grid, khong lay Authorized thua', [identityProbeStarted.ok, identityUserRequest.meta.kind, identityFlowState.phase, identityFlowState.cursor.kind, identityUserRequest.body.controller], [true, 'identity_user_grid', 'checking_session', 'identity_user_grid', 'User']);
  const identityProbeFinished = builders.FbmSync.continue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }, Authorized: true }, transport: { trace: [{ requestId: identityUserRequest.id }] } });
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
  let baselineWrite;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.readLocal = () => [{ id: 'CUS-BASE', fbmId: 'FBM-BASE', companyName: 'Baseline' }];
  builders.writeGateSave = (request) => { baselineWrite = request; return { ok: true }; };
  const baselineResult = builders.FbmSync.recalculateBaseline('customer');
  check(so, 'tinh lai baseline chi ghi cot sync noi bo', [baselineResult.ok, baselineResult.written, baselineWrite.records[0].fbmHash !== '', baselineWrite.source], [true, 1, true, 'pull']);
  let newPullWrite, newPullCalls = 0, dirtyMarkCalls = 0;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.readLocal = () => [];
  builders.dirtyStateMarkRecords = () => { dirtyMarkCalls += 1; };
  builders.writeGateSave = (request) => { newPullCalls += 1; newPullWrite = request; return { ok: true, fields: ['id'], rows: [['CUS-NEW']] }; };
  const newPullResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-C', ma_kh: 'ALT00012', ten_kh: 'Khách mới', ma_so_thue: '001' }, gate)]);
  check(so, 'Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi', [newPullResult.written, newPullWrite.source, newPullWrite.schemas.length, newPullWrite.records[0].fbmId, newPullWrite.records[0].fbmHash !== '', newPullWrite.records[0].parentCompanyName, newPullWrite.records[0].fbmSyncPermission, dirtyMarkCalls], [1, 'pull', 2, 'NEW-C', true, '', builders.FbmSync.pullDefaultPermission(), 0]);
  check(so, 'Pull gộp nội dung và trạng thái vào một lượt cửa ghi', newPullCalls, 1);
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
  builders.FbmSync.stateRead = () => ({ metadata: {}, locks: {} });
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
  napServer(identity, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
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
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
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
  const lockedState = { mode: 'write', metadata: { seen: { customer: {}, activity: {} } }, locks: { 'customer:CUS-000010': { owner: 'user', revision: 'r1' } } };
  edges.FbmSync.stateRead = () => lockedState;
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.validateIncomingCategories = () => [];
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000010', fbmId: 'FBM-LOCK', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmHash: '' }];
  edges.writeGateSave = () => { lockedWrite = true; return { ok: true }; };
  const lockedPull = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-LOCK', ma_kh: 'ALT00010', ten_kh: 'Mới' }, {})]);
  check(so, 'pull khong ghi record dang bi user khoa', [lockedPull.written, lockedPull.skipped, lockedWrite], [0, 1, false]);

  let missingWrite = false;
  const missingState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: { 'customer:CUS-000011': { owner: 'user' } } };
  edges.FbmSync.stateRead = () => missingState;
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000011', fbmId: 'FBM-MISSING', recordStatus: 'active' }];
  edges.writeGateSave = () => { missingWrite = true; return { ok: true }; };
  check(so, 'missing scan bo qua record dang user sua', [edges.FbmSync.markMissingAfterFullScan('customer', missingState).written, missingWrite], [0, false]);
  let missingBatch;
  const fullScanState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: {} };
  edges.FbmSync.scriptSettings = () => ({ testCodes: null });
  edges.FbmSync.stateRead = () => fullScanState;
  edges.FbmSync.readLocal = () => [{ id: 'CUS-000011', fbmId: 'FBM-MISSING', recordStatus: 'active' }, { id: 'CUS-000012', fbmId: 'FBM-TOMBSTONE', recordStatus: 'deleted' }];
  edges.writeGateSave = (request) => { missingBatch = request; return { ok: true }; };
  const missingResult = edges.FbmSync.markMissingAfterFullScan('customer', fullScanState);
  check(so, 'Customer vang chi danh dau missing va bo qua tombstone', [missingResult.written, missingBatch.records.length, missingBatch.records[0].id, missingBatch.records[0].syncStatus], [1, 1, 'CUS-000011', edges.FbmSync.SYNC_STATUS.missing]);
  edges.FbmSync.seenStoreClear('customer');
  const newRecordState = { mode: 'read', cursor: { kind: 'customer_grid' }, metadata: { seen: { customer: { initialized: true }, activity: {} } }, locks: {} };
  let newLocalRecords = [];
  let newRecordWrites = 0;
  edges.FbmSync.stateRead = () => newRecordState;
  edges.FbmSync.stateWrite = () => newRecordState;
  edges.FbmSync.readLocal = () => newLocalRecords;
  edges.writeGateSave = () => {
    newRecordWrites += 1;
    newLocalRecords = [{ id: 'CUS-000777', fbmId: 'FBM-NEW', recordStatus: 'active' }];
    return { ok: true, fields: ['id', 'fbmId', 'recordStatus'], rows: [['CUS-000777', 'FBM-NEW', 'active']] };
  };
  edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-NEW', ma_kh: 'ALT00777', ten_kh: 'Mới' }, {})]);
  const newRecordMissing = edges.FbmSync.markMissingAfterFullScan('customer', newRecordState);
  check(so, 'record vua pull duoc danh dau seen sau khi cua ghi cap ma', [newRecordMissing.written, newRecordWrites], [0, 1]);
  let activityMissingBatch;
  edges.FbmSync.accountSettingsRead = () => ({ activitySince: '2024-10-07' });
  edges.FbmSync.activityDateKey = (value) => {
    const text = String(value || '');
    const match = text.match(/^\/Date\((-?\d+)/);
    return match ? new Date(Number(match[1])).toISOString().slice(0, 10) : text.slice(0, 10);
  };
  edges.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-000020', fbmId: 'ACT-OLD', workDate: '2024-10-06', recordStatus: 'active' }, { id: 'ACT-000021', fbmId: 'ACT-MISSING', workDate: '2024-10-07', recordStatus: 'active' }, { id: 'ACT-000022', fbmId: 'ACT-TOMBSTONE', workDate: '2024-10-08', recordStatus: 'deleted' }]
    : [];
  edges.writeGateSave = (request) => { activityMissingBatch = request; return { ok: true }; };
  const activityMissingResult = edges.FbmSync.markMissingAfterFullScan('activity', fullScanState);
  check(so, 'Activity truoc moc khong bi danh dau missing trong full scan', [activityMissingResult.written, activityMissingBatch.records[0].id, activityMissingBatch.records[0].syncStatus, activityMissingBatch.records.length], [1, 'ACT-000021', edges.FbmSync.SYNC_STATUS.missing, 1]);
  let activityPullWrite;
  edges.FbmSync.stateRead = () => ({ metadata: { seen: { customer: {}, activity: {} } }, locks: {} });
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  edges.writeGateSave = (request) => { activityPullWrite = request; return { ok: true }; };
  const newActivity = edges.FbmSync.activityRecord({ id: 88, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Nội dung', end_date: '/Date(1757386800000)/' }, gate);
  const activityPull = edges.FbmSync.pullWrite('activity', [newActivity]);
  check(so, 'Activity pull moi noi dung vao Customer noi bo va cho phep day', [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId, activityPullWrite.records[0].fbmSyncPermission], [1, 'CUS-ACT', 88, edges.FbmSync.pullDefaultPermission()]);
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  const orphanActivity = edges.FbmSync.activityRecord({ id: 89, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Mồ côi #SC-ACT-UNKNOWN', end_date: '/Date(1757386800000)/' }, gate);
  const orphanActivityResult = edges.FbmSync.pullWrite('activity', [orphanActivity]);
  check(so, 'Activity marker mo coi khong tao dong moi', orphanActivityResult.written, 0);
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate);
  const invalidActivityResult = edges.FbmSync.pullWrite('activity', [invalidActivity]);
  check(so, 'Activity thieu ngay bi chan an toan', invalidActivityResult.written, 0);

  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmSyncPermission: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', {});
  const failedState = { metadata: { pushFailures: { 'customer:C-FAIL': failedHash } } };
  edges.FbmSync.stateRead = () => failedState;
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', edges.FbmSync.pushCandidates('customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', edges.FbmSync.pushCandidates('customer').length, 1);

  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', {});
  const notAppliedState = { metadata: { seen: { customer: {}, activity: {} } }, locks: {} };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord(oldFbm, {})]);
  check(so, 'FBM khong doi sau push thanh notApplied, chặn đẩy bằng trạng thái Sheet thay vì khóa trong state', [notApplied.skipped, notAppliedWrite.records[0].syncStatus, Object.keys(notAppliedState.locks)], [1, edges.FbmSync.SYNC_STATUS.notApplied, []]);

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
