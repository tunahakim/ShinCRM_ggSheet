/** Lỗi từng bản ghi của chặng đẩy: sổ lỗi giữ hash và nguyên nhân, mở lại bản ghi lỗi, một bản ghi lỗi không dừng bản ghi kế, dừng phiên nhả sổ bận, HTTP lỗi và hết phiên, và Log lỗi qua bộ gom của lát. */
const { section, check } = require('../../lib/assert');
const { soBan, giuBanGhi, giuBanGhiDongBo } = require('../../lib/load-gas');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();
const { dungHopDay } = require('../../lib/fbm/hop-day');
const { datUngVienDay } = require('../../lib/fbm/ung-vien-day');
const { buocDayLoi } = require('../../lib/fbm/buoc-day');
const { noiLat } = require('../../lib/fbm/hop-dong-bo');

async function chay(so) {
  section('FBM sync — push: lỗi từng bản ghi');
  const hop = dungHopDay(), push = hop.push;
  push.logEvent = () => {};
  const errorState = { runId: 'R-ERR', counts: { error: 0 }, metadata: { pushFailures: {} } };
  push.FbmSync.markPushError(errorState, { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', companyName: 'Lỗi' } }, 'FBM từ chối', 'customer_edit_save');
  check(so, 'push loi luu hash local de chan lap lai',
    push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'],
    push.FbmSync.hash({ id: 'C-ERR', companyName: 'Lỗi' }, 'customer', { map: {} }));
  check(so, 'push loi luu nguyen nhan hien thi rieng voi hash',
    push.FbmSync.pushFailuresRead().details['customer:C-ERR'].reason,
    'FBM từ chối');
  check(so, 'push loi luu dung buoc request gay loi',
    push.FbmSync.pushFailuresRead().details['customer:C-ERR'].requestKind,
    'customer_edit_save');
  let retryPatch;
  push.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-FAIL', fbmId: '174813', syncStatus: push.FbmSync.SYNC_STATUS.error, content: 'Nội dung cũ' }]
    : [];
  push.writeGateSave = (request) => { retryPatch = request.records; return { ok: true }; };
  push.FbmSync.stateWrite(push.FbmSync.runOpen({ phase: 'done' }));
  push.FbmSync.pushFailuresWrite({ hashes: { 'activity:ACT-FAIL': 'failed-hash', 'activity:ACT-GONE': 'gone-hash' }, details: { 'activity:ACT-FAIL': { reason: 'HTTP 500' } } });
  const retryEnabled = push.FbmSync.pushFailuresClearCommand();
  check(so, 'retry push mo lai ca lo cung payload khong doi du lieu',
    [retryEnabled.ok, retryPatch[0].syncStatus, push.FbmSync.pushFailuresRead().hashes['activity:ACT-FAIL']],
    [true, push.FbmSync.SYNC_STATUS.pending, undefined]);
  check(so, 'mở lại bản ghi lỗi xóa luôn dấu lỗi của bản ghi không còn trên Sheet, để nó không chiếm chỗ cầu dao lỗi đẩy',
    [retryEnabled.missing, Object.keys(push.FbmSync.pushFailuresRead().hashes)],
    [1, []]);
  // Từ đây Sheet giả chứa đúng các ứng viên đang được chọn: chiều đẩy đọc lại dòng trong cửa trước khi đánh dấu "đang đẩy".
  push.FbmSync.readLocal = () => [];
  datUngVienDay(push, () => [
    { kind: 'edit', id: 'C-ERR', position: 0, record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } },
    { kind: 'edit', id: 'C-NEXT', position: 1, record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ]);
  const pushErrorProps = push.FbmSync.runOpen({ phase: 'push' });
  pushErrorProps.session = hop.session;
  pushErrorProps.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(pushErrorProps);
  const continuedPush = buocDayLoi(push.FbmSync, 'Owner sai');
  check(so, 'push loi mot record van tiep tuc record ke',
    [continuedPush.ok, continuedPush.request.meta.kind, push.FbmSync.stateRead().cursor.candidate.id, push.FbmSync.stateRead().counts.error],
    [true, 'customer_edit_open', 'C-NEXT', 1]);
  giuBanGhiDongBo(push, 'customer', 'C-2');
  push.FbmSync.runStopCommand('any');
  check(so, 'Dừng phiên nhả mọi bản ghi đồng bộ đang giữ trong sổ bận', Object.keys(soBan(push)), []);

  push.FbmSync.pushEligibilityErrors = hop.dieuKienThat;
  push.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Chu tai khoan dung' });
  {
    const savedGate = push.writeGateSave, savedRead = push.FbmSync.readLocal, savedLog = push.FbmSync.logPushRecord, sheetRows = [], logRows = [];
    push.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'X-GIA', fbmId: 'FBM-GIA' }] : [];
    push.writeGateSave = (request) => { sheetRows.push(...request.records); return { ok: true }; };
    push.FbmSync.logPushRecord = (candidate, op, outcome, reason, detail) => { logRows.push([outcome, detail.syncStatus, detail.failureCode]); };
    const missingState = push.FbmSync.runOpen({ phase: 'push' });
    push.FbmSync.markPushError(missingState, { entity: 'customer', id: 'X-GIA', kind: 'edit', record: { id: 'X-GIA', fbmId: 'FBM-GIA' } }, Object.assign(new Error('FBM không trả bản ghi FBM-GIA'), { code: 'FBM_RECORD_NOT_FOUND' }), 'customer_edit_open');
    push.writeGateSave = savedGate; push.FbmSync.readLocal = savedRead; push.FbmSync.logPushRecord = savedLog;
    check(so, 'FBM-048: không thấy bản ghi khi mở form ghi Sheet "không thấy bên FBM" và Log lỗi kèm mã',
      [sheetRows.map((row) => row.syncStatus), logRows],
      [[push.FbmSync.SYNC_STATUS.missing], [['error', push.FbmSync.SYNC_STATUS.missing, 'FBM_RECORD_NOT_FOUND']]]);
  }
  // Chỉ còn bản ghi lỗi trong danh sách: sau khi ghi nhận lỗi, lần quét lại không chọn lại nó nên không phát request nào.
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } }]);
  const bugState = push.FbmSync.runOpen({ phase: 'push' });
  bugState.mode = 'push'; bugState.activeRequestId = 'test-bug-request'; bugState.cursor = { kind: 'push_wait', operation: 'customer_edit_save', entity: 'customer', index: 0, candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(bugState);
  const bugResult = push.FbmSync.runSlice(() => push.FbmSync.continue({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-bug-request' }] } }));
  check(so, 'Bugs HTTP 200 danh dau loi record va khong retry request da gui',
    [bugResult.ok, push.FbmSync.stateRead().counts.error, push.FbmSync.pushFailuresRead().hashes['customer:C-ERR'] !== undefined],
    [true, 1, true]);
  const transportState = push.FbmSync.runOpen({ phase: 'read' });
  push.FbmSync.scriptSettings = () => ({ cookie: 'cookie', customerAuthorized: '', activityAuthorized: '' });
  transportState.phase = 'pull_customer'; transportState.activeRequestId = 'test-transport-request'; transportState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 3, pageValue: ['x'] };
  push.FbmSync.stateWrite(transportState);
  const http500 = noiLat(push.FbmSync, { ok: false, status: 500, body: '{"Message":"server"}', transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-transport-request' }] } });
  check(so, 'HTTP 500 cua request nghiep vu fail-closed va giu cursor',
    [http500.ok, http500.request, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind],
    [false, null, 'error', 'customer_grid']);
  [{ status: 401, body: '' }, { status: 403, body: '' }, { status: 200, body: '<form action="Login.aspx"></form>' }].forEach((failure) => {
    const sessionState = push.FbmSync.runOpen({ phase: 'read' });
    sessionState.phase = 'pull_customer'; sessionState.activeRequestId = 'test-session-request'; sessionState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['x'] };
    push.FbmSync.stateWrite(sessionState);
    const sessionResult = noiLat(push.FbmSync, { ok: failure.status === 200, status: failure.status, body: failure.body, transport: { contract: MA_HOP_DONG, trace: [{ requestId: 'test-session-request' }] } });
    const suspicious = failure.status === 401 || failure.status === 403;
    check(so, 'Session error ' + failure.status + ' duoc probe lai hoac fail-closed',
      [sessionResult.ok, sessionResult.request && sessionResult.request.meta.kind, push.FbmSync.stateRead().phase, push.FbmSync.stateRead().cursor.kind],
      suspicious ? [true, 'session_probe', 'checking_session', 'session'] : [false, null, 'error', 'customer_grid']);
  });

  // Log của chặng đẩy qua bộ gom của lát: mỗi nhóm đúng một dòng.
  const issueLogs = [];
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
  check(so, 'markPushError: cửa ghi trả bận, đổi hay vắng thì sổ lỗi và số đếm đã cộng nên Log vẫn phải có, kèm lý do chưa ghi lên dòng',
    [results, [busyState, changedState, goneState].map((item) => item.counts.error), errorLogs.map((event) => event.outcome), ['Người dùng đang sửa dòng này', 'vừa được sửa sau lúc chọn', 'không còn trên Sheet'].map((text, index) => errorLogs[index] && errorLogs[index].reason.indexOf(text) >= 0 && errorLogs[index].reason.indexOf('FBM từ chối ghi') >= 0)],
    [['busy', 'changed', 'gone'], [1, 1, 1], ['error', 'error', 'error'], [true, true, true]]);
}

module.exports = { chay };
