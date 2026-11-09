/** Chặng đẩy: phát request ghi, giữ sổ bận, áp kết quả hai pha, lỗi từng bản ghi, dựng form sửa/tạo Activity, dọn dấu #SC và cứu lệnh tạo mất phản hồi. */
const { section, check } = require("../../lib/assert");
const { buocDay, buocDayLoi } = require('../../lib/fbm/buoc-day');
const { taoHopCat, napServer, TEP_KHUNG_LUOT, giuBanGhi, giuBanGhiDongBo, soBan } = require('../../lib/load-gas');
const { datUngVienDay, boUngVienDay } = require('../../lib/fbm/ung-vien-day');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { luoiDaCat } = require('../../lib/fbm/tab-fbm-gia');

async function chay(so) {
  section("FBM sync — push");
  const pushProps = { data: {} };
  const pushPropertyApi = { getProperty: (key) => pushProps.data[key] || null, setProperty: (key, value) => { pushProps.data[key] = String(value); } };
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => pushPropertyApi, getScriptProperties: () => pushPropertyApi }, writeGateSave: () => ({ ok: true }) });
  napServer(push, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushStage.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/control/PushCommands.js', 'fbm_sync/write/SheetSave.js');
  push.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const pushCandidatesImpl = push.FbmSync.pushCandidates;
  // Hộp này kiểm hàng đợi đẩy; lịch kiểm lại danh mục có test riêng.
  const pushLookupDueImpl = push.FbmSync.pushLookupDue;
  push.FbmSync.pushLookupDue = () => false;
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'FBM test' });
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh' });
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }]);
  push.FbmSync.categoryGateCheck = () => [];
  const pushEligibilityErrors = push.FbmSync.pushEligibilityErrors;
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.customerEditOpenRequest = () => ({ url: 'https://fbm.test/edit', body: {}, meta: { kind: 'customer_edit_open' } });
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' }, { id: 'C-ERR', companyName: 'Lỗi' }, { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }] : [{ id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' }];
  const pushState = push.FbmSync.runOpen({ phase: 'push' });
  pushState.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
  pushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(pushState);
  const pushRequest = push.FbmSync.pushStageResume(pushState);
  const pushedState = push.FbmSync.stateRead();
  check(so, 'Trước request ghi FBM, bản ghi được giữ trong sổ bận dưới tên đồng bộ', soBan(push)['customer:C-1'].by, 'fbm');
  check(so, 'push request luu dung cursor cho phan hoi tiep', pushedState.cursor.kind, 'push_wait');
  check(so, 'push request co envelope protocol', pushRequest.meta.kind, 'customer_edit_open');
  datUngVienDay(push, () => [
    { kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, raw: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1', companyName: 'Bản lúc chọn' } },
    { kind: 'edit', id: 'C-NEXT', position: 3, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }, raw: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ]);
  const changedState = push.FbmSync.runOpen({ phase: 'push' });
  changedState.session = pushState.session;
  changedState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(changedState);
  const changedRequest = push.FbmSync.pushStageResume(changedState);
  check(so, 'ứng viên bị sửa sau lúc chọn thì hoãn tới lượt sau, không giữ, không gửi; lượt chuyển sang ứng viên kế tiếp', [
    !!changedRequest, push.FbmSync.stateRead().counts.skipped, Object.keys(soBan(push)), push.FbmSync.stateRead().current
  ], [true, 1, ['customer:C-NEXT'], 'C-NEXT']);
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }]);
  const conflictPushState = push.FbmSync.runOpen({ phase: 'push' });
  conflictPushState.counts.conflict = 1;
  conflictPushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(conflictPushState);
  const conflictPushRequest = push.FbmSync.pushStageResume(conflictPushState);
  check(so, 'pull phát hiện xung đột giữa lượt không dừng chiều đẩy: bản ghi khác vẫn được phát request đẩy', [!!conflictPushRequest, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().current], [true, 'push', 'C-1']);
  datUngVienDay(push, () => []);
  const emptyWriteState = push.FbmSync.runOpen({ phase: 'push' }); emptyWriteState.mode = 'write'; emptyWriteState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; push.FbmSync.stateWrite(emptyWriteState);
  push.FbmSync.pushStageResume(emptyWriteState);
  check(so, 'push khong co ung vien hien thong bao khong co ban ghi day', push.FbmSync.stateRead().message, 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.');
  let pushPatch, pushWriteRequest;
  const pushLogs = [];
  push.logEvent = (event) => pushLogs.push(event);
  push.writeGateSave = (request) => { pushWriteRequest = request; pushPatch = request.records[0]; return { ok: true }; };
  push.FbmSync.pushResultSent({ entity: 'customer', record: { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' } }, { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-OLD' }, { Name: 'ma_kh', Value: 'ALT00010' }] } }, 'customer_edit_save', { map: {} });
  check(so, 'push thanh cong giu baseline cu cho ky xac nhan va dung source push', [pushPatch.fbmHash, pushWriteRequest.source], ['BASE', 'push']);
  check(so, 'push thành công không ghi Log từng record', pushLogs.length, 0);
  let pendingSet;
  const realPendingSet = push.FbmSync.pendingPushSet;
  push.FbmSync.pendingPushSet = (entity, id, value) => { pendingSet = value; };
  const createdActivity = { id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' };
  push.FbmSync.pushResultSent({ entity: 'activity', record: createdActivity }, { d: { InternalValues: [{ Name: 'id', Value: 174900 }] } }, 'activity_new_save', { map: {} });
  check(so, 'FBM-050: tạo Activity lưu hash đã gửi kèm ID FBM vừa cấp, khớp bản đọc xác nhận', pendingSet.hSHIN, push.FbmSync.hash(Object.assign({}, createdActivity, { fbmId: '174900' }), 'activity', { map: {} }));
  push.FbmSync.pendingPushSet = realPendingSet;
  const errorState = { counts: { error: 0 }, metadata: { pushFailures: {} } };
  push.FbmSync.markPushError(errorState, { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', companyName: 'Lỗi' } }, 'FBM từ chối', 'customer_edit_save');
  check(so, 'push loi luu hash local de chan lap lai', push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'], push.FbmSync.hash({ id: 'C-ERR', companyName: 'Lỗi' }, 'customer', { map: {} }));
  check(so, 'push loi luu nguyen nhan hien thi rieng voi hash', push.FbmSync.pushFailuresRead().details['customer:C-ERR'].reason, 'FBM từ chối');
  check(so, 'push loi luu dung buoc request gay loi', push.FbmSync.pushFailuresRead().details['customer:C-ERR'].requestKind, 'customer_edit_save');
  let retryPatch;
  push.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-FAIL', fbmId: '174813', syncStatus: push.FbmSync.SYNC_STATUS.error, content: 'Nội dung cũ' }]
    : [];
  push.writeGateSave = (request) => { retryPatch = request.records; return { ok: true }; };
  const retryState = push.FbmSync.runOpen({ phase: 'done' });
  push.FbmSync.stateWrite(retryState);
  push.FbmSync.pushFailuresWrite({ hashes: { 'activity:ACT-FAIL': 'failed-hash', 'activity:ACT-GONE': 'gone-hash' }, details: { 'activity:ACT-FAIL': { reason: 'HTTP 500' } } });
  const retryEnabled = push.FbmSync.pushFailuresClearCommand();
  check(so, 'retry push mo lai ca lo cung payload khong doi du lieu', [retryEnabled.ok, retryPatch[0].syncStatus, push.FbmSync.pushFailuresRead().hashes['activity:ACT-FAIL']], [true, push.FbmSync.SYNC_STATUS.pending, undefined]);
  check(so, 'mở lại bản ghi lỗi xóa luôn dấu lỗi của bản ghi không còn trên Sheet, để nó không chiếm chỗ cầu dao lỗi đẩy', [retryEnabled.missing, Object.keys(push.FbmSync.pushFailuresRead().hashes)], [1, []]);
  // Từ đây Sheet giả chứa đúng các ứng viên đang được chọn: chiều đẩy đọc lại dòng trong cửa trước khi đánh dấu "đang đẩy".
  push.FbmSync.readLocal = () => [];
  datUngVienDay(push, () => [
    { kind: 'edit', id: 'C-ERR', position: 0, record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } },
    { kind: 'edit', id: 'C-NEXT', position: 1, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ]);
  const pushErrorProps = push.FbmSync.runOpen({ phase: 'push' });
  pushErrorProps.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
  pushErrorProps.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(pushErrorProps);
  const continuedPush = buocDayLoi(push.FbmSync, 'Owner sai');
  check(so, 'push loi mot record van tiep tuc record ke', [continuedPush.ok, continuedPush.request.meta.kind, push.FbmSync.stateRead().cursor.candidate.id, push.FbmSync.stateRead().counts.error], [true, 'customer_edit_open', 'C-NEXT', 1]);
  push.FbmSync.pushEligibilityErrors = pushEligibilityErrors;
  push.FbmSync.stateWrite(pushedState);
  giuBanGhiDongBo(push, 'customer', 'C-2');
  push.FbmSync.runStopCommand('any');
  check(so, 'Dừng phiên nhả mọi bản ghi đồng bộ đang giữ trong sổ bận', Object.keys(soBan(push)), []);

  const requiredCustomer = { companyName: 'Company', taxNumber: '0100123456', contactPerson: 'Contact', phone: '0900000000', leadSource: 'Source', address: 'Ha Noi', province: 'HNI' };
  check(so, 'Customer du bay field FBM bat buoc', push.FbmSync.pushEligibilityErrors(requiredCustomer, 'customer').length, 0);
  ['companyName', 'taxNumber', 'contactPerson', 'phone', 'leadSource', 'address', 'province'].forEach((field) => {
    const invalid = Object.assign({}, requiredCustomer); delete invalid[field];
    check(so, 'Customer thieu field bat buoc ' + field, push.FbmSync.pushEligibilityErrors(invalid, 'customer').some((message) => message.indexOf('Thi') === 0), true);
  });
  check(so, 'Customer vuot gioi han do dai bi chan', push.FbmSync.pushEligibilityErrors(Object.assign({}, requiredCustomer, { companyName: 'x'.repeat(1001) }), 'customer').length > 0, true);
  check(so, 'Activity vuot gioi han noi dung bi chan', push.FbmSync.pushEligibilityErrors({ taskType: 'Goi', content: 'x'.repeat(4001), workDate: '2026-09-09' }, 'activity').length > 0, true);
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Chu tai khoan dung' });
  let ownerMismatch = '';
  try {
    push.FbmSync.pushOperationStep({ metadata: {}, cursor: { operation: 'activity_edit_open', entity: 'activity', candidate: { entity: 'activity', id: 'ACT-OWNER', record: { id: 'ACT-OWNER', fbmId: 'A-OWNER' } } } }, { d: { Row: ['A-OWNER'], InternalValues: [{ Name: 'owner', NewValue: 'Chu tai khoan khac' }] } }, push.FbmSync.scriptSettings());
  } catch (error) { ownerMismatch = String(error && error.message || error); }
  check(so, 'Activity sai owner bi chan truoc request sua', ownerMismatch.indexOf('khác tài khoản FBM đang đăng nhập') >= 0, true);
  ['customer', 'activity'].forEach((entity) => {
    let notFound = null;
    try {
      push.FbmSync.pushOperationStep({ metadata: {}, cursor: { operation: entity + '_edit_open', entity, candidate: { entity, id: 'X-GIA', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } } } }, { d: { Row: null, InternalValues: [{ Name: 'nguoi_sua', NewValue: '' }] } }, push.FbmSync.scriptSettings());
    } catch (error) { notFound = error; }
    check(so, 'FBM-048: ' + entity + ' mở form không thấy đúng bản ghi thì không phát lệnh lưu', [notFound && notFound.code, push.FbmSync.stateRead().cursor && push.FbmSync.stateRead().cursor.operation === entity + '_edit_save'], ['FBM_RECORD_NOT_FOUND', false]);
  });
  {
    const savedGate = push.writeGateSave, savedRead = push.FbmSync.readLocal, savedLog = push.FbmSync.logPushRecord, sheetRows = [], logRows = [];
    push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'X-GIA', fbmId: 'FBM-GIA' }] : [];
    push.writeGateSave = (request) => { sheetRows.push(...request.records); return { ok: true }; };
    push.FbmSync.logPushRecord = (candidate, op, outcome, reason, detail) => { logRows.push([outcome, detail.syncStatus, detail.failureCode]); };
    const missingState = push.FbmSync.runOpen({ phase: 'push' });
    push.FbmSync.markPushError(missingState, { entity: 'customer', id: 'X-GIA', kind: 'edit', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } }, Object.assign(new Error('FBM không trả bản ghi FBM-GIA'), { code: 'FBM_RECORD_NOT_FOUND' }), 'customer_edit_open');
    push.writeGateSave = savedGate; push.FbmSync.readLocal = savedRead; push.FbmSync.logPushRecord = savedLog;
    check(so, 'FBM-048: không thấy bản ghi khi mở form ghi Sheet "không thấy bên FBM" và Log lỗi kèm mã', [sheetRows.map((row) => row.syncStatus), logRows], [[push.FbmSync.SYNC_STATUS.missing], [['error', push.FbmSync.SYNC_STATUS.missing, 'FBM_RECORD_NOT_FOUND']]]);
  }
  // Chỉ còn bản ghi lỗi trong danh sách: sau khi ghi nhận lỗi, lần quét lại không chọn lại nó nên không phát request nào.
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } }]);
  const bugState = push.FbmSync.runOpen({ phase: 'push' });
  bugState.mode = 'push'; bugState.activeRequestId = 'test-bug-request'; bugState.cursor = { kind: 'push_wait', operation: 'customer_edit_save', entity: 'customer', index: 0, candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(bugState);
  const bugResult = push.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-bug-request' }] } });
  check(so, 'Bugs HTTP 200 danh dau loi record va khong retry request da gui', [bugResult.ok, push.FbmSync.stateRead().counts.error, push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'] !== undefined], [true, 1, true]);
  const transportState = push.FbmSync.runOpen({ phase: 'read' });
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', cookie: 'cookie' });
  transportState.phase = 'pull_customer'; transportState.activeRequestId = 'test-transport-request'; transportState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] };
  push.FbmSync.stateWrite(transportState);
  const http500 = push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"server"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-transport-request' }] } });
  check(so, 'HTTP 500 cua request nghiep vu fail-closed va giu cursor', [http500.ok, http500.request, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], [false, null, 'error', 'customer_grid']);
  [{ status: 401, body: '' }, { status: 403, body: '' }, { status: 200, body: '<form action="Login.aspx"></form>' }].forEach((failure) => {
    const sessionState = push.FbmSync.runOpen({ phase: 'read' });
    sessionState.phase = 'pull_customer'; sessionState.activeRequestId = 'test-session-request'; sessionState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'] };
    push.FbmSync.stateWrite(sessionState);
    const sessionResult = push.FbmSync.continue({ ok: failure.status === 200, status: failure.status, body: failure.body, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-session-request' }] } });
  const suspicious = failure.status === 401 || failure.status === 403;
  check(so, 'Session error ' + failure.status + ' duoc probe lai hoac fail-closed', [sessionResult.ok, sessionResult.request && sessionResult.request.meta.kind, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind], suspicious ? [true, 'session_probe', 'checking_session', 'session_probe'] : [false, null, 'error', 'customer_grid']);
  });
  const skippedLogs = [];
  push.logEvent = (event) => skippedLogs.push(event);
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-SKIP' }] : [];
  const skippedState = { counts: { skipped: 0 }, metadata: {} };
  push.FbmSync.markPushSkippedBatch(skippedState, [{ entity: 'activity', id: 'ACT-SKIP', hold: { status: push.FbmSync.SYNC_STATUS.unknownCategory, reason: 'Category chua khop' } }]);
  check(so, 'Push record bị hoãn chỉ tăng state, không ghi Log chi tiết', [skippedState.counts.skipped, skippedLogs.length], [1, 0]);
  push.FbmSync.readLocal = () => [];
  push.logEvent = (event) => {
    pushLogs.push(event);
    skippedLogs.push(event);
  };
  check(so, 'Xung đột phát hiện giữa lượt không còn công tắc dừng cả chiều đẩy: chỉ dòng xung đột bị pushCandidates loại', typeof push.FbmSync.stopPushOnConflicts, 'undefined');
  {
    // Log của chặng đẩy qua bộ gom của lát: mỗi nhóm đúng một dòng.
    const savedLogEvent = push.logEvent, savedRead = push.FbmSync.readLocal, savedGate = push.writeGateSave, savedPendingSet = push.FbmSync.pendingPushSet, issueLogs = [];
    const flush = () => { issueLogs.length = 0; push.logEvent = (event) => issueLogs.push(event); push.FbmSync.recordIssuesFlush(); return issueLogs.slice(); };
    push.logEvent = () => {}; push.FbmSync.recordIssuesFlush();
    const errorCandidate = (id, raw) => ({ entity: 'customer', kind: 'edit', id, raw, record: { id, fbmId: 'F-' + id } });
    const failure = { code: 'FBM_ERROR', reason: 'FBM từ chối ghi' };
    push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'X-BAN' }, { id: 'X-DOI', ten: 'mới' }] : [];
    giuBanGhi(push, 'nguoidung', 'customer', 'X-BAN', 'Người dùng đang sửa dòng này');
    const busyState = push.FbmSync.runOpen({ phase: 'push' }), changedState = push.FbmSync.runOpen({ phase: 'push' }), goneState = push.FbmSync.runOpen({ phase: 'push' });
    const results = [push.FbmSync.markPushError(busyState, errorCandidate('X-BAN'), failure, 'customer_edit_save'), push.FbmSync.markPushError(changedState, errorCandidate('X-DOI', { id: 'X-DOI', ten: 'cũ' }), failure, 'customer_edit_save'), push.FbmSync.markPushError(goneState, errorCandidate('X-MAT'), failure, 'customer_edit_save')];
    push.recordGateRun({ by: 'nguoidung', run: 'run-thu', decide: () => ({ release: [{ entity: 'customer', ids: ['X-BAN'] }] }) });
    const errorLogs = flush();
    check(so, 'markPushError: cửa ghi trả bận, đổi hay vắng thì sổ lỗi và số đếm đã cộng nên Log vẫn phải có, kèm lý do chưa ghi lên dòng', [results, [busyState, changedState, goneState].map((item) => item.counts.error), errorLogs.map((event) => event.outcome), ['Người dùng đang sửa dòng này', 'vừa được sửa sau lúc chọn', 'không còn trên Sheet'].map((text, index) => errorLogs[index] && errorLogs[index].reason.indexOf(text) >= 0 && errorLogs[index].reason.indexOf('FBM từ chối ghi') >= 0)], [['busy', 'changed', 'gone'], [1, 1, 1], ['error', 'error', 'error'], [true, true, true]]);

    // Nhiều bản ghi bị giữ trong một lát: câu cho người dùng nêu mã (mỗi mã một câu khác nhau), câu cho Log là một câu chung nên bộ gom ra đúng một dòng.
    push.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-1' }, { id: 'ACT-2' }, { id: 'ACT-3' }] : [];
    const holdContext = { settings: () => ({ accountName: 'Lê Tuấn Anh' }), categoryGate: {} };
    const skipState = { counts: { skipped: 0 }, metadata: {} }, messages = [], held = [];
    ['ACT-1', 'ACT-2', 'ACT-3'].forEach((id) => {
      const candidate = { entity: 'activity', kind: 'edit', id, record: { id, owner: 'Người khác' } }, hold = push.FbmSync.pushHold(candidate, holdContext);
      candidate.hold = hold; held.push(candidate);
    });
    push.FbmSync.markPushSkippedBatch(skipState, held); messages.push(skipState.message);
    const skipLogs = flush();
    check(so, 'FBM-021: lát có nhiều bản ghi bị giữ thì Log đúng một dòng loại đó, kèm số lượng và danh sách mã; câu trên Sidebar vẫn nêu mã bản ghi', [skipState.counts.skipped, skipLogs.length, skipLogs[0] && skipLogs[0].detail.count, skipLogs[0] && skipLogs[0].detail.ids, skipLogs[0] && skipLogs[0].reason.indexOf('ACT-1, ACT-2, ACT-3') >= 0, messages[0].indexOf('ACT-3') >= 0], [3, 1, 3, ['ACT-1', 'ACT-2', 'ACT-3'], true, true]);

    // Sổ chờ xác nhận ghi trước Sheet: ghi Sheet hỏng thì mục chờ vẫn còn, lượt sau không mất dấu lệnh đã tới FBM (FBM-027).
    const order = [];
    push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-THU-TU', fbmId: '', fbmHash: '' }] : [];
    push.FbmSync.pendingPushSet = (entity, id, value) => { order.push('so-cho'); return savedPendingSet(entity, id, value); };
    push.writeGateSave = () => { order.push('sheet'); return { ok: true }; };
    const orderResponse = { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-THU-TU' }, { Name: 'ma_kh', Value: 'ALT00077' }] } };
    push.FbmSync.pushResultSent({ entity: 'customer', record: { id: 'C-THU-TU', companyName: 'Thứ tự' } }, orderResponse, 'customer_create_save', { map: {} });
    check(so, 'FBM-027: áp kết quả đẩy ghi sổ chờ xác nhận trước, ghi Sheet sau', order, ['so-cho', 'sheet']);
    push.FbmSync.pendingPushClear('customer', 'C-THU-TU');
    push.writeGateSave = () => { throw new Error('Sheet hỏng'); };
    let sheetFailure = '';
    try { push.FbmSync.pushResultSent({ entity: 'customer', record: { id: 'C-THU-TU', companyName: 'Thứ tự' } }, orderResponse, 'customer_create_save', { map: {} }); } catch (error) { sheetFailure = String(error && error.message || error); }
    const keptPending = push.FbmSync.pendingPushGet('customer', 'C-THU-TU');
    check(so, 'FBM-027: ghi Sheet ném lỗi sau khi FBM đã lưu thì lỗi nổi lên và mục chờ xác nhận vẫn còn đủ hash, mã FBM', [sheetFailure !== '', keptPending && typeof keptPending.hSHIN, keptPending && keptPending.fbmId], [true, 'string', 'A-THU-TU']);
    push.FbmSync.pendingPushClear('customer', 'C-THU-TU');
    push.FbmSync.pendingPushSet = savedPendingSet; push.writeGateSave = savedGate; push.FbmSync.readLocal = savedRead; push.logEvent = savedLogEvent;
  }
  {
    // FBM-021: ba bản ghi bị giữ rồi một bản ghi đẩy được thì ba bản ghi giữ chỉ tốn một lần ghi Sheet, lần ghi kế là "đang đẩy" của bản ghi đẩy được.
    const savedGate = push.writeGateSave, savedRead = push.FbmSync.readLocal, savedLogEvent = push.logEvent, writes = [], skipLogs = [];
    const hold = (cause) => ({ status: push.FbmSync.SYNC_STATUS.skipped, reason: 'Bỏ qua customer: ' + cause, cause: 'Bỏ qua customer: ' + cause });
    push.FbmSync.readLocal = () => [];
    datUngVienDay(push, () => [
      { kind: 'edit', id: 'H-1', record: { id: 'H-1', fbmId: 'F-H1' }, hold: hold('Thiếu Mã số thuế.') },
      { kind: 'edit', id: 'H-2', record: { id: 'H-2', fbmId: 'F-H2' }, raw: { id: 'H-2', fbmId: 'F-H2', ten: 'bản lúc chọn' }, hold: hold('Thiếu Mã số thuế.') },
      { kind: 'edit', id: 'H-3', record: { id: 'H-3', fbmId: 'F-H3' }, hold: hold('Thiếu Mã số thuế.') },
      { kind: 'edit', id: 'P-1', record: { id: 'P-1', fbmId: 'F-P1', fbmHash: 'h-p1' } }
    ]);
    const savedSettings = push.FbmSync.scriptSettings; push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh' });
    push.writeGateSave = (request) => { writes.push(request.records.map((row) => row.id + ':' + row.syncStatus)); return { ok: true }; };
    push.logEvent = (event) => skipLogs.push(event);
    const batchState = push.FbmSync.runOpen({ phase: 'push' });
    batchState.session = pushState.session;
    batchState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    push.FbmSync.stateWrite(batchState);
    const batchRequest = push.FbmSync.pushStageResume(batchState), batchAfter = push.FbmSync.stateRead();
    push.FbmSync.recordIssuesFlush();
    check(so, 'FBM-021: ba bản ghi giữ (một dòng đã đổi giữa chừng) chỉ một lần ghi Sheet, rồi mới tới lần ghi "đang đẩy"; dòng đã đổi không được tính', [writes, batchRequest && batchRequest.meta.kind, batchAfter.counts.skipped, batchAfter.cursor.progress, batchAfter.current], [[['H-1:' + push.FbmSync.SYNC_STATUS.skipped, 'H-3:' + push.FbmSync.SYNC_STATUS.skipped], ['P-1:' + push.FbmSync.SYNC_STATUS.pushing]], 'customer_edit_open', 2, 2, 'P-1']);
    check(so, 'FBM-021: lô giữ đó ra đúng một dòng Log kèm hai mã', [skipLogs.length, skipLogs[0] && skipLogs[0].detail.ids], [1, ['H-1', 'H-3']]);
    push.FbmSync.pushRelease('customer', 'P-1');
    push.FbmSync.scriptSettings = savedSettings; push.writeGateSave = savedGate; push.FbmSync.readLocal = savedRead; push.logEvent = savedLogEvent;
  }

  const activityCandidate = { entity: 'activity', kind: 'create', id: 'ACT-NEW', position: 0, record: { id: 'ACT-NEW', fbmId: '', customerFbmCode: 'ALT00010', stt_rec: 'A-CUS', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09', fbmSyncPermission: push.FbmSync.pullDefaultPermission() } };
  datUngVienDay(push, () => [activityCandidate]);
  push.FbmSync.categoryGateCheck = () => [];
  push.FbmSync.pushEligibilityErrors = () => [];
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh', activityAuthorized: '1.test' });
  const activityEditOpen = push.FbmSync.activityEditOpenRequest('174813', push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit mo form dung type 0 va token activity', [activityEditOpen.body.type, activityEditOpen.body.viewPage, activityEditOpen.body.authorized, activityEditOpen.meta.kind], [0, true, '1.test', 'activity_edit_open']);
  const activityEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, ma_cv: 'GD', details: 'Noi dung cu', start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T00:00:00Z'), fileticket: 'ticket' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit gui id FBM thay vi id noi bo', activityEdit.body.memvars.filter((item) => item.Name === 'id')[0].NewValue, 174813);
  check(so, 'Activity edit khong tra Date trong ket qua GAS', JSON.stringify(activityEdit).indexOf('2026-09-09T00:00:00.000Z') < 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue || '').indexOf('/Date(') === 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue || '').indexOf('/Date(') === 0 && String(activityEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue || '').indexOf('/Date(') === 0, true);
  check(so, 'Activity edit doi ngay Sheet thanh Date .NET dung fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue, activityEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue], ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const unchangedDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'Gọi', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-09T00:00:00Z'), end_date: new Date('2026-09-09T16:59:59Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit Sheet không đổi ngày thì gửi lại đúng ngày của form ở dạng 0 giờ UTC', [unchangedDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue, unchangedDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue], ['/Date(1788912000000)/', '/Date(1788912000000)/']);
  const formDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit gửi ngày form dạng 0 giờ UTC theo ngày VN như giao diện FBM, không gửi lại mốc FBM trả (lùi 7 tiếng)', [
    formDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].OldValue,
    formDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/']);
  const changedWorkDateEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008601', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-10-11' }, { id: 174813, start_date: new Date('2026-09-08T17:00:00Z'), end_date: new Date('2026-09-09T16:59:00Z'), details: 'Noi dung cu', fileticket: 'ticket' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit doi ngay phat sinh nhung giu ngay bat dau', [
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].OldValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'start_date')[0].NewValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].OldValue,
    changedWorkDateEdit.body.memvars.filter((item) => item.Name === 'end_date')[0].NewValue
  ], ['/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1788912000000)/', '/Date(1791676800000)/']);
  // Ca gặp thật 2026-10-07: form trả 22/09 01:00 VN thành 21/09 18:00 UTC; gửi lại nguyên mốc thì FBM lưu thành 21/09.
  const shiftedEdit = push.FbmSync.activityEditRequest({ id: 'ACT-008616', fbmId: '176920', content: 'Noi dung', taskType: 'GD', workDate: '2026-09-22' }, { id: 176920, start_date: '/Date(1790010000000)/', end_date: '/Date(1790013600000)/', details: 'Noi dung #SC-ACT-008616', fileticket: 'ticket' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'Activity edit không lùi ngày khi form FBM trả mốc giờ VN lùi 7 tiếng (ACT-008616)', ['start_date', 'end_date'].map((name) => shiftedEdit.body.memvars.filter((item) => item.Name === name)[0].NewValue), ['/Date(1790035200000)/', '/Date(1790035200000)/']);
  check(so, 'Activity edit gui fileticket theo OldValue/NewValue cua fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'fileticket')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'fileticket')[0].NewValue], ['', 'ticket']);
  check(so, 'Activity edit cap nhat datetime0 moi', activityEdit.body.memvars.filter((item) => item.Name === 'datetime0')[0].NewValue !== activityEdit.body.memvars.filter((item) => item.Name === 'datetime0')[0].OldValue, true);
  check(so, 'Activity edit de comment rong thanh null', activityEdit.body.memvars.filter((item) => item.Name === 'comment')[0].NewValue, null);
  check(so, 'Activity edit comment rong van co NewValue', Object.prototype.hasOwnProperty.call(activityEdit.body.memvars.filter((item) => item.Name === 'comment')[0], 'NewValue'), true);
  check(so, 'Activity edit giu OldValue rong cho field form khong co Row', [activityEdit.body.memvars.filter((item) => item.Name === 'ma_kh')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'fileupload')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'filekey')[0].OldValue], ['', '', '']);
  check(so, 'Activity edit giu null cho field nullable cua fixture', [activityEdit.body.memvars.filter((item) => item.Name === 'ngay_nhac')[0].OldValue, activityEdit.body.memvars.filter((item) => item.Name === 'ma_nhom')[0].OldValue], [null, null]);
  const activityEditState = push.FbmSync.runOpen({ phase: 'push' });
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Owner', activityAuthorized: '1.test' });
  // Mốc là bản FBM đang có (FBM chưa đổi từ lần đồng bộ trước), nên bước mở form được phép lưu.
  const activityEditBase = push.FbmSync.hash({ fbmId: '174813', content: 'Noi dung cu', taskType: 'GD', workDate: '2026-09-09' }, 'activity', { map: {} });
  activityEditState.cursor = { kind: 'push_wait', operation: 'activity_edit_open', entity: 'activity', index: 0, candidate: { entity: 'activity', id: 'ACT-008600', record: { id: 'ACT-008600', fbmId: '174813', content: 'Noi dung moi', taskType: 'GD', workDate: '2026-09-09', fbmHash: activityEditBase } } };
  push.FbmSync.stateWrite(activityEditState);
  const activitySave = buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: (function () { const row = []; row[0] = 174813; row[3] = 'GD'; row[10] = '2026-09-09'; row[15] = 'Noi dung cu'; row[21] = 'Owner'; return row; }()), Showing: "_ticket = 'ticket-1';" } });
  check(so, 'Activity edit tu response mo form tao request type 1', [activitySave.body.type, activitySave.body.memvars.length, push.FbmSync.stateRead().cursor.operation, Object.prototype.hasOwnProperty.call(push.FbmSync.stateRead().cursor, 'oldValues')], [1, 36, 'activity_edit_save', false]);
  const activityPushState = push.FbmSync.runOpen({ phase: 'push' });
  activityPushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  push.FbmSync.stateWrite(activityPushState);
  const activityCreate = push.FbmSync.pushStageResume(activityPushState);
  check(so, 'Activity moi dung request New va marker', [activityCreate.meta.kind, activityCreate.body.action, activityCreate.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, push.FbmSync.stateRead().cursor.operation], ['activity_create', 'New', 'Nội dung #SC-ACT-NEW', 'activity_create']);
  const activityResponse = buocDay(push.FbmSync, { d: { InternalValues: [{ Name: 'id', Value: 42 }] } });
  check(so, 'Activity New nhan ID FBM va tao request doc xac nhan', [activityResponse.meta.kind, activityResponse.meta.id, push.FbmSync.stateRead().counts.succeeded, push.FbmSync.stateRead().phase], ['activity_edit_open', '42', 0, 'push']);
  const verifyRecord = { id: 'ACT-VERIFY', fbmId: '42', customerFbmCode: 'ALT00010', taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09', owner: 'Owner', fbmHash: 'base', syncStatus: push.FbmSync.SYNC_STATUS.pushed };
  push.FbmSync.pendingPushSet('activity', verifyRecord.id, { hSHIN: push.FbmSync.hash(verifyRecord, 'activity', { map: {} }), fbmId: '42' });
  push.FbmSync.readLocal = () => [verifyRecord];
  push.writeGateSave = () => ({ ok: true });
  const verifyState = push.FbmSync.runOpen({ phase: 'push' });
  verifyState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(verifyState);
  const verifyRow = []; verifyRow[0] = 42; verifyRow[3] = 'Goi'; verifyRow[10] = new Date('2026-09-09T00:00:00Z'); verifyRow[15] = 'Noi dung #SC-ACT-VERIFY';
  const markerClean = buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: verifyRow } });
  const markerCleanDetails = markerClean && markerClean.body.memvars.filter((item) => item.Name === 'details')[0];
  check(so, 'G12: lệnh tạo Activity xác nhận xong mà FBM còn dấu #SC thì gửi ngay lệnh sửa Edit theo ID FBM với nội dung sạch', [markerClean && markerClean.body.action, markerClean && markerClean.body.values[0], markerCleanDetails && markerCleanDetails.OldValue, markerCleanDetails && markerCleanDetails.NewValue, push.FbmSync.stateRead().cursor.operation], ['Edit', '42', 'Noi dung #SC-ACT-VERIFY', 'Noi dung', 'activity_marker_clean']);
  check(so, 'Activity chỉ tính đã đẩy sau khi đọc xác nhận khớp hash', [push.FbmSync.stateRead().counts.pushed, push.FbmSync.pendingPushGet('activity', verifyRecord.id), pushLogs.some((event) => event.action === 'push_record')], [1, null, false]);
  const cleanWrites = [];
  push.writeGateSave = (request) => { cleanWrites.push(request); return { ok: true }; };
  push.FbmSync.recordIssues = {};
  buocDay(push.FbmSync, { d: {} });
  check(so, 'G12: lệnh bỏ dấu thành công thì không ghi lại Sheet, không có cảnh báo và đi tiếp', [cleanWrites.length, Object.keys(push.FbmSync.recordIssues).length, push.FbmSync.stateRead().cursor.operation === 'activity_marker_clean'], [0, 0, false]);
  const cleanFailState = push.FbmSync.runOpen({ phase: 'push' });
  cleanFailState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_marker_clean', candidate: { entity: 'activity', kind: 'create', id: verifyRecord.id, record: verifyRecord } };
  push.FbmSync.stateWrite(cleanFailState);
  const truocBoDau = pushLogs.length;
  buocDayLoi(push.FbmSync, { code: 'FBM_ERROR', reason: 'Lỗi thử' });
  // Lượt đóng ở cửa ghi state nên nhóm cảnh báo đã được xả ra Log ngay lúc đó.
  const cleanIssue = pushLogs.slice(truocBoDau).filter((event) => /_record_issue$/.test(event.action))[0] || {};
  check(so, 'G12: lệnh bỏ dấu hỏng chỉ cảnh báo ở Log và câu chốt Sidebar, không đánh lỗi giao dịch', [cleanIssue.outcome, /Chưa bỏ được dấu nhận diện #SC/.test(cleanIssue.reason || ''), cleanWrites.length, push.FbmSync.stateRead().counts.error, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)], ['warn', true, 0, 0, true]);
  const keptRecord = Object.assign({}, verifyRecord, { id: 'ACT-KEPT', syncStatus: push.FbmSync.SYNC_STATUS.pushed });
  push.FbmSync.pendingPushSet('activity', keptRecord.id, { hSHIN: push.FbmSync.hash(keptRecord, 'activity', { map: {} }), fbmId: '42' });
  push.FbmSync.readLocal = () => [keptRecord];
  const keptState = push.FbmSync.runOpen({ phase: 'push' });
  keptState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_verify', candidate: { entity: 'activity', kind: 'edit', id: keptRecord.id, record: keptRecord } };
  push.FbmSync.stateWrite(keptState);
  const keptRow = verifyRow.slice(); keptRow[15] = 'Noi dung #SC-ACT-KEPT';
  buocDay(push.FbmSync, { d: { Controller: 'zccrAccountTask', Row: keptRow } });
  check(so, 'G12: lệnh sửa không mang dấu mà FBM vẫn giữ dấu thì ghi "đẩy không ăn" để không xếp dọn lại mỗi lượt', [cleanWrites.slice(-1)[0].records[0].syncStatus, /chưa bỏ được dấu #SC/.test(push.FbmSync.stateRead().message)], [push.FbmSync.SYNC_STATUS.notApplied, true]);
  const cleanEdit = push.FbmSync.activityEditRequest({ id: 'ACT-1', fbmId: 5, content: 'Nội dung' }, { id: 5, details: 'Nội dung #SC-ACT-1' }, {}, push.FbmSync.scriptSettings(push.FbmSync.stateRead()));
  check(so, 'G12: lệnh sửa Activity không gắn dấu #SC, chỉ lệnh tạo gắn', cleanEdit.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, 'Nội dung');
  const createLocal = { id: 'CUS-CREATE', fbmId: '', fbmCustomerCode: '', companyName: 'Khach tao lai', taxNumber: '0100123456', contactPerson: 'Nguoi lien he', phone: '0900000000', email: 'a@example.com', address: 'Ha Noi', province: 'HNI', website: '', leadSource: 'Source', product: '', fbmSyncPermission: push.FbmSync.pullDefaultPermission() };
  const createCandidate = { entity: 'customer', kind: 'create', id: createLocal.id, autoCode: 'ALT00020', record: createLocal };
  push.FbmSync.readLocal = (entity) => entity === 'customer' ? [createLocal] : [];
  boUngVienDay(push);
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Owner', userId: '2037', cookie: 'cookie', customerAuthorized: '1.test' });
  push.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const createState = push.FbmSync.runOpen({ phase: 'push' }); createState.session = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' }; createState.activeRequestId = 'test-create-request'; createState.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_create_save', candidate: createCandidate }; push.FbmSync.stateWrite(createState);
  const recoveryStart = push.FbmSync.continue({ ok: false, status: 500, body: '{"Message":"timeout"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-create-request' }] } });
  check(so, 'Customer create mat response chuyen sang request doc MST contains, khong ghi lai', [recoveryStart.ok, recoveryStart.request.meta.kind, recoveryStart.request.body.gridPageIndex, recoveryStart.request.body.filter, recoveryStart.request.body.externalKey.some((item) => item.Name === 'ma_kh' && item.Value === 'ALT00010'), push.FbmSync.stateRead().cursor.operation], [true, 'grid', -2, ['ma_so_thue:**0100123456'], false, 'customer_create_recover']);
  const customerFields = push.FbmSync.GRID_FIELDS.customer.slice();
  const customerRow = []; customerRow[0] = 'FBM-CREATE'; customerRow[1] = 'ALT00020'; customerRow[2] = 'Khach tao lai'; customerRow[3] = '0100123456'; customerRow[4] = 'Nguoi lien he'; customerRow[5] = 'Ha Noi'; customerRow[6] = '0900000000'; customerRow[7] = 'a@example.com'; customerRow[9] = ''; customerRow[12] = 'HNI'; customerRow[18] = 'Source'; customerRow[21] = '';
  push.writeGateSave = (request) => { push._recoveryPatch = request.records[0]; return { ok: true }; };
  // FBM trả đủ cột của lưới khách; ô không đặt là chuỗi rỗng.
  const recoveryGrid = await luoiDaCat(push.FbmSync, 'customer', customerFields, [customerFields.map((_, index) => customerRow[index] === undefined ? '' : customerRow[index])], 1);
  const recoveryParsed = push.FbmSync.rowsToRecords('customer', recoveryGrid);
  check(so, 'fixture recovery doc dung stt_rec_kh va ma_kh', [recoveryParsed.rows[0].stt_rec_kh, recoveryParsed.rows[0].ma_kh], ['FBM-CREATE', 'ALT00020']);
  buocDay(push.FbmSync, recoveryGrid);
  check(so, 'Customer create recovery doi chieu exact va vach ID baseline', [push._recoveryPatch.fbmId, push._recoveryPatch.fbmCustomerCode, push._recoveryPatch.syncStatus, push.FbmSync.stateRead().counts.pushed], ['FBM-CREATE', 'ALT00020', push.FbmSync.SYNC_STATUS.synced, 1]);
  const lostState = push.FbmSync.runOpen({ phase: 'push' });
  lostState.cursor = { kind: 'push_wait', entity: 'activity', index: 0, operation: 'activity_create', candidate: activityCandidate };
  push.FbmSync.stateWrite(lostState);
  giuBanGhiDongBo(push, 'activity', 'ACT-NEW');
  push.FbmSync.readLocal = (entity) => entity === 'activity' ? [activityCandidate.record] : [];
  let lostPatch;
  push.writeGateSave = (request) => { lostPatch = request.records[0]; return { ok: true }; };
  const lost = buocDayLoi(push.FbmSync, 'Mất phản hồi');
  check(so, 'Activity mat phan hoi giu dang day va khoa cho marker', [lost.ok, lost.request, lostPatch.syncStatus, push.FbmSync.stateRead().counts.error, !!push.FbmSync.pushFailuresRead().hashes['activity:ACT-NEW'], soBan(push)['activity:ACT-NEW'].by], [true, null, push.FbmSync.SYNC_STATUS.pushing, 1, true, 'fbm']);
}

module.exports = { chay };
