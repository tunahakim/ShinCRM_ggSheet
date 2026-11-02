/** Cửa ra của mọi hàm `fbm*` (adapter một dòng vào `controlDispatch`) về Sidebar không mang cookie/token phiên FBM; lệnh `start` giữ nguyên tham số (identity nháp của Kiểm liên kết). */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const SECRETS = ['COOKIE_MAU', 'AUTH_KHACH_MAU', 'AUTH_GIAO_DICH_MAU'];
/** Hàm phải chạy được với ô lượt mẫu, không được phép ném lỗi môi trường giả. */
const REQUIRED = ['fbmCancelSync', 'fbmResetSyncState', 'fbmStopBackground', 'fbmGetSyncStatus'];

function entryPointNames() {
  const source = fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8');
  return source.split(/\r?\n/).map((line) => /^function (fbm\w+)\(.*fbmCommandRun\(/.exec(line)).filter(Boolean).map((match) => match[1]);
}

async function chay(so) {
  section('FBM sync — cửa ra Sidebar và tham số lệnh start');
  const names = entryPointNames();
  const { hop } = workflowGas({ extraFiles: ['fbm_sync/state/SyncSettings.js'] });
  const seed = () => {
    // Hàm trước có thể đổi công tắc hay để lại request đang bay: dựng lại nền sạch cho mỗi hàm.
    hop.FbmSync.setMasterEnabled(true); hop.FbmSync.setBackgroundEnabled(true);
    const state = hop.FbmSync.stateRead();
    state.session = Object.assign(state.session, { cookie: SECRETS[0], customerAuthorized: SECRETS[1], activityAuthorized: SECRETS[2] });
    state.runId = 'run-mau'; state.origin = 'manual'; state.phase = 'pull_customer'; state.cursor = { kind: 'customer_grid' }; state.activeRequestId = '';
    hop.FbmSync.stateWrite(state);
  };
  const leaks = [], threw = [], ran = [];
  names.forEach((name) => {
    seed();
    let result;
    try { result = hop[name](); } catch (error) { threw.push(name); return; }
    ran.push(name);
    // Body request FBM gửi Sidebar chuyển cho Extension cần chính cookie/token, nên chỉ kiểm phần còn lại của kết quả.
    const body = JSON.stringify(result, (key, value) => key === 'request' ? undefined : value) || '';
    if (SECRETS.some((secret) => body.indexOf(secret) >= 0)) { leaks.push(name); }
  });
  check(so, 'mọi hàm fbm* của Sidebar chạy với ô lượt mẫu (cookie, token) trả kết quả không chứa cookie/token', [leaks, REQUIRED.filter((name) => ran.indexOf(name) < 0)], [[], []]);
  check(so, 'danh sách hàm fbm* quét từ nguồn không rỗng (chặn test rỗng vì đổi cách khai báo)', names.length >= 15, true);

  seed();
  const cancelled = hop.fbmCancelSync().status;
  check(so, 'fbmCancelSync trả status công khai chứ không trả ô lượt', [cancelled.phase, cancelled.running, cancelled.session && cancelled.session.cookie, JSON.stringify(cancelled).indexOf('Authorized')], ['paused', false, undefined, -1]);
  const raw = hop.FbmSync.publicResult({ status: { session: { customerAuthorized: 'A', activityAuthorized: 'B', cookie: 'C', userId: '1' } }, request: { body: { cookie: 'C2', authorized: 'A2' } } });
  check(so, 'publicResult gỡ khóa của ô phiên nhưng giữ cookie/authorized trong body request cho Extension', [raw.status.session, raw.request.body], [{ userId: '1' }, { cookie: 'C2', authorized: 'A2' }]);

  // Kiểm liên kết gửi bản nháp: đối chiếu bản nháp người dùng đang xem, không phải liên kết đã lưu.
  const flow = workflowGas();
  flow.hop.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-000001', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }] : [];
  flow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const draft = { spreadsheetId: 'sheet-workflow', userId: '9999', username: 'NHAP', accountName: 'Ban Nhap' };
  const started = flow.hop.fbmDriveCommand('start', { kind: 'identity_check', identity: draft, machineId: 'may-A' });
  check(so, 'Kiểm liên kết với bốn ô nháp: state.identityTarget bằng bản nháp, không phải liên kết đã lưu', [started.ok, flow.hop.FbmSync.stateRead().identityTarget], [true, draft]);

  section('FBM sync — đóng lời gọi: Log của phát hiện và trace do runEntryPoint ghi');
  // Hộp chung giả `runEntryPoint` chạy thẳng phần ruột; ở đây nạp bản thật để có bước đóng lời gọi.
  const close = workflowGas({ extraFiles: ['server/entry/EntryPoint.js'], pendingChangesBegin: () => {}, pendingChangesEnd: () => {}, noticeRaise: () => true, noticeResolve: () => null, flushLog: () => 0, errorMessage: (err) => String(err && err.message || err) }), logs = [];
  close.hop.logEvent = (entry) => logs.push(entry);
  close.hop.FbmSync.stateWrite({ runId: 'run-cu', origin: 'manual', phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: 'req-mat', deadlineAt: Date.now() - 60000 });
  const closed = close.hop.runEntryPoint('thuDongLoiGoi', 'fbm_sync', () => {
    const state = close.hop.FbmSync.stateRead();
    close.hop.FbmSync.stateWrite(Object.assign(state, { activeRequestId: '', deadlineAt: 0 }));
    return { ok: true, pending: close.hop.FbmSync.requestWatch.findings.length, logged: logs.filter((entry) => entry.action === 'request_unanswered').length };
  });
  check(so, 'request quá hạn bị bỏ: cửa ghi ô lượt chỉ ghi phát hiện, dòng Log request_unanswered do lúc đóng lời gọi ghi, đúng một lần', [closed.pending, closed.logged, logs.filter((entry) => entry.action === 'request_unanswered').length, close.hop.FbmSync.requestWatch.findings.length], [1, 0, 1, 0]);
  const traceTrace = [];
  close.hop.FbmSync.documentPropertySet = (key, value, context) => { if (context !== 'trace') { return; } traceTrace.push(key); const err = new Error('Không thể lưu state đồng bộ vì DocumentProperties đã chạm giới hạn dung lượng.'); err.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA'; err.detail = { property: key, context: context }; throw err; };
  logs.length = 0;
  const traced = close.hop.runEntryPoint('thuTraceHong', 'fbm_sync', () => ({ ok: true }));
  const traceLine = logs.find((entry) => entry.action === 'thuTraceHong') || {};
  check(so, 'ghi trace hỏng lúc đóng lời gọi: lời gọi vẫn trả kết quả, Log có dòng lỗi mang mã và khóa trace, mốc trace có tên đúng', [traced.ok, traceTrace[0], traceLine.outcome, traceLine.detail && traceLine.detail.code, traceLine.detail && traceLine.detail.property, close.hop.FbmSync.propertyBuffer.tracePending.length], [true, 'FBM_SYNC_TRACE_V1', 'error', 'FBM_DOCUMENT_PROPERTIES_QUOTA', 'FBM_SYNC_TRACE_V1', 0]);
}

module.exports = { chay };
