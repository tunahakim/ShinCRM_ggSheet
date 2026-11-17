/** Cửa `fbmCommand` của Sidebar: mọi lệnh Sidebar trong bảng lệnh trả kết quả không mang cookie/token phiên FBM; lệnh `start` giữ nguyên tham số (identity nháp của Kiểm liên kết). */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datCongTac, datNen } = require('../../lib/fbm/cai-dat-thu');

const SECRETS = ['COOKIE_MAU', 'AUTH_KHACH_MAU', 'AUTH_GIAO_DICH_MAU'];
/** Lệnh nào cần payload mới chạy hết đường thì cho payload mẫu; lệnh khác chạy với payload chỉ có mã máy. */
const PAYLOAD = { start: { kind: 'identity_probe' }, save_settings: { patches: { fbm_run: { approvalThreshold: 5 } } }, reset_settings: { section: 'fbm_run' } };

async function chay(so) {
  section('FBM sync — cửa fbmCommand của Sidebar và tham số lệnh start');
  const { hop } = workflowGas();
  // Lệnh relay_config cần địa chỉ Web App đã ghi; hộp giả không có lần mở Web App nào.
  hop.FbmSync.relayUrlStored = () => 'https://script.test/exec';
  // Lệnh relay không đi qua cửa Sidebar (cửa lệnh ném COMMAND_CHANNEL_REJECTED); mọi lệnh còn lại phải chạy được.
  const names = Object.keys(hop.FbmSync.COMMANDS).filter((name) => hop.FbmSync.COMMANDS[name].relay !== true);
  const seed = () => {
    // Lệnh trước có thể đổi công tắc hay để lại request đang bay: dựng lại nền sạch cho mỗi lệnh.
    datCongTac(hop, true); datNen(hop, true);
    const state = hop.FbmSync.stateRead();
    state.session = Object.assign(state.session, { cookie: SECRETS[0], customerAuthorized: SECRETS[1], activityAuthorized: SECRETS[2] });
    state.runId = 'run-mau'; state.origin = 'manual'; state.phase = 'pull_customer'; state.cursor = { kind: 'customer_grid' }; state.activeRequestId = '';
    hop.FbmSync.stateWrite(state);
  };
  const leaks = [], threw = [];
  names.forEach((name) => {
    seed();
    let result;
    try { result = hop.fbmCommand(name, Object.assign({ machineId: 'may-A' }, PAYLOAD[name])); } catch (error) { threw.push(name + ': ' + String(error.code || error.message).slice(0, 120)); return; }
    // Body request FBM gửi Sidebar chuyển cho Extension cần chính cookie/token, nên chỉ kiểm phần còn lại của kết quả.
    const body = JSON.stringify(result, (key, value) => key === 'request' ? undefined : value) || '';
    if (SECRETS.some((secret) => body.indexOf(secret) >= 0)) { leaks.push(name); }
  });
  check(so, 'mọi lệnh Sidebar qua fbmCommand chạy với ô lượt mẫu (cookie, token), không ném, kết quả không chứa cookie/token', [leaks, threw], [[], []]);
  check(so, 'danh sách lệnh Sidebar lấy từ bảng lệnh không rỗng (chặn test rỗng vì đổi cách khai báo)', names.length >= 15, true);
  check(so, 'Sidebar gọi lệnh relay qua fbmCommand thì bị từ chối', ['continue', 'heartbeat'].map((name) => { try { hop.fbmCommand(name, { machineId: 'may-A' }); return 'chạy'; } catch (error) { return error.code; } }), ['COMMAND_CHANNEL_REJECTED', 'COMMAND_CHANNEL_REJECTED']);

  seed();
  const cancelled = hop.fbmCommand('cancel').status;
  check(so, 'lệnh cancel trả status công khai chứ không trả ô lượt', [cancelled.phase, cancelled.running, cancelled.session && cancelled.session.cookie, JSON.stringify(cancelled).indexOf('Authorized')], ['paused', false, undefined, -1]);
  const raw = hop.FbmSync.publicResult({ status: { session: { customerAuthorized: 'A', activityAuthorized: 'B', cookie: 'C', userId: '1' } }, request: { body: { cookie: 'C2', authorized: 'A2' } } });
  check(so, 'publicResult gỡ khóa của ô phiên nhưng giữ cookie/authorized trong body request cho Extension', [raw.status.session, raw.request.body], [{ userId: '1' }, { cookie: 'C2', authorized: 'A2' }]);

  // Kiểm liên kết gửi bản nháp: đối chiếu bản nháp người dùng đang xem, không phải liên kết đã lưu.
  const flow = workflowGas();
  flow.hop.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-000001', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }] : [];
  flow.hop.FbmSync.connectionSave({ binding: { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' } });
  const draft = { spreadsheetId: 'sheet-workflow', userId: '9999', username: 'NHAP', accountName: 'Ban Nhap' };
  const started = flow.hop.fbmCommand('start', { kind: 'identity_check', identity: draft, machineId: 'may-A' });
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
  close.hop.FbmSync.documentPropertySet = (key, value, context) => { if (context !== 'trace') { return; } traceTrace.push(key); const err = new Error('Không thể lưu state đồng bộ: giá trị khóa quá cỡ.'); err.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA'; err.detail = { property: key, context: context }; throw err; };
  logs.length = 0;
  const traced = close.hop.runEntryPoint('thuTraceHong', 'fbm_sync', () => ({ ok: true }));
  const traceLine = logs.find((entry) => entry.action === 'thuTraceHong') || {};
  check(so, 'ghi trace hỏng lúc đóng lời gọi: lời gọi vẫn trả kết quả, Log có dòng lỗi mang mã và khóa trace, mốc trace có tên đúng', [traced.ok, traceTrace[0], traceLine.outcome, traceLine.detail && traceLine.detail.code, traceLine.detail && traceLine.detail.property, close.hop.FbmSync.propertyBuffer.tracePending.length], [true, 'FBM_SYNC_TRACE_V1', 'error', 'FBM_DOCUMENT_PROPERTIES_QUOTA', 'FBM_SYNC_TRACE_V1', 0]);
}

module.exports = { chay };
