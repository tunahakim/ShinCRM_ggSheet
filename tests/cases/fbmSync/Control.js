/** Kiểm cửa lệnh duy nhất `controlDispatch`: bảng lệnh đóng, relay chỉ gọi được lệnh của relay, mã giao thức lệch bị chặn, khóa bận không lọt, `status` chỉ đọc. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

function loi(fn) {
  try { fn(); return null; } catch (error) { return String(error && error.code || ''); }
}

async function chay(so) {
  section('FBM sync — cửa lệnh');
  const { hop, documentProperties, scriptLock } = workflowGas({ extraFiles: ['fbm_sync/state/SyncSettings.js'] });
  const FbmSync = hop.FbmSync;
  FbmSync.setMasterEnabled(true);

  check(so, 'lệnh không có trong bảng thì từ chối với COMMAND_UNKNOWN, không có nhánh mặc định', [loi(() => FbmSync.controlDispatch('get_master_switch', {})), loi(() => FbmSync.controlDispatch('transport_failure', {})), loi(() => FbmSync.controlDispatch('', {}))], ['COMMAND_UNKNOWN', 'COMMAND_UNKNOWN', 'COMMAND_UNKNOWN']);
  check(so, 'relay chỉ được gọi heartbeat và continue', Object.keys(FbmSync.COMMANDS).filter((name) => FbmSync.relayCommandAllowed(name)).sort(), ['continue', 'heartbeat']);
  check(so, 'loại lượt lạ của lệnh start thì từ chối', loi(() => FbmSync.controlDispatch('start', { kind: 'bulk', machineId: 'may-A' })), 'SYNC_START_KIND_UNKNOWN');
  check(so, 'mục cài đặt lạ thì từ chối', loi(() => FbmSync.controlDispatch('save_settings', { section: 'all', value: {} })), 'SETTINGS_SECTION_UNKNOWN');

  // Cổng relay: khóa đúng nhưng lệnh ngoài danh sách, mã giao thức lệch hoặc Sheet khác thì ném lỗi có mã trước khi chạm state.
  const contract = FbmSync.protocol.contract;
  const before = JSON.stringify(documentProperties.data);
  check(so, 'relay gửi lệnh ngoài danh sách thì từ chối và không đổi state', [loi(() => FbmSync.relayHandle({ spreadsheetId: 'sheet-workflow', contract, command: 'start', payload: { kind: 'sync', mode: 'write' } })), JSON.stringify(documentProperties.data) === before], ['RELAY_COMMAND_REJECTED', true]);
  check(so, 'relay của Extension khác bản giao thức thì từ chối với EXTENSION_PROTOCOL_MISMATCH', [loi(() => FbmSync.relayHandle({ spreadsheetId: 'sheet-workflow', contract: 'cu', command: 'heartbeat', payload: {} })), loi(() => FbmSync.relayHandle({ spreadsheetId: 'sheet-workflow', command: 'heartbeat', payload: {} }))], ['EXTENSION_PROTOCOL_MISMATCH', 'EXTENSION_PROTOCOL_MISMATCH']);
  check(so, 'relay gửi nhầm Sheet thì từ chối', loi(() => FbmSync.relayHandle({ spreadsheetId: 'sheet-khac', contract, command: 'heartbeat', payload: {} })), 'RELAY_SPREADSHEET_MISMATCH');
  check(so, 'phong bì GAS gửi Extension mang mã giao thức', FbmSync.protocol.request('r1', 'https://fbm.test/x', {}, {}).contract, contract);

  // Lượt khác đang chạy: Đăng nhập thử bị từ chối với SYNC_BUSY và không đổi ô lượt.
  const running = FbmSync.runOpen({ phase: 'pull_customer', total: 1 });
  running.phase = 'pull_customer'; running.cursor = { kind: 'customer_grid' };
  FbmSync.stateWrite(running);
  FbmSync.loginConfigRead = () => ({ configured: true, credentialRef: 'cred-test-1234' });
  const busyState = JSON.stringify(FbmSync.stateRead());
  const loginBusy = FbmSync.controlDispatch('start', { kind: 'login_test', machineId: 'may-A' });
  check(so, 'Đăng nhập thử khi lượt khác đang chạy thì trả SYNC_BUSY, không cấp request và không đổi ô lượt', [loginBusy.code, loginBusy.request || null, JSON.stringify(FbmSync.stateRead()) === busyState], ['SYNC_BUSY', null, true]);

  // Khóa đang bị lượt khác giữ: lệnh ghi không chạy, lệnh nộp kết quả bị bỏ thì phải ghi Log.
  const logs = [];
  hop.logEvent = (line) => { logs.push(line); };
  scriptLock.held = true;
  const locked = FbmSync.controlDispatch('continue', { machineId: 'may-A', response: { ok: true, status: 200, body: '{}' } }, 'relay');
  scriptLock.held = false;
  check(so, 'khóa bận thì lệnh continue không chạy và bỏ kết quả có dòng Log', [locked.code, logs.some((line) => line.action === 'busy_reply_dropped')], ['BUSY', true]);

  // `status` chỉ đọc: không ghi DocumentProperties, kể cả khi lượt đang chạy đã quá hạn.
  const stale = FbmSync.stateRead();
  stale.updatedAt = 1; stale.lastProgressAt = 1; FbmSync.stateWrite(stale);
  const snapshot = JSON.stringify(documentProperties.data);
  let writes = 0;
  const realSet = documentProperties.setProperty, realDelete = documentProperties.deleteProperty;
  documentProperties.setProperty = function (key, value) { writes += 1; return realSet.call(this, key, value); };
  documentProperties.deleteProperty = function (key) { writes += 1; return realDelete.call(this, key); };
  const status = FbmSync.controlDispatch('status', {});
  documentProperties.setProperty = realSet; documentProperties.deleteProperty = realDelete;
  check(so, 'status trả đủ gói một lần đọc và không ghi DocumentProperties', [status.ok, !!status.status, !!status.identity, !!status.settings, !!status.login, writes, JSON.stringify(documentProperties.data) === snapshot], [true, true, true, true, true, 0, true]);

  // Cửa ra không lọc theo tên trường: trường lệnh trả về tới Sidebar nguyên vẹn; ô phiên lọt vào kết quả ở bất kỳ tên nào vẫn mất khóa bí mật, không có dòng Log bỏ trường.
  check(so, 'cửa ra giữ nguyên mọi trường lệnh trả về', FbmSync.publicResult({ ok: false, code: 'CONFLICT_RECORD_BUSY', busy: { id: 'CUS-1', reason: 'r' }, conflicts: [{ field: 'phone' }] }), { ok: false, code: 'CONFLICT_RECORD_BUSY', busy: { id: 'CUS-1', reason: 'r' }, conflicts: [{ field: 'phone' }] });
  logs.length = 0;
  const realStatus = FbmSync.statusRead;
  FbmSync.statusRead = () => ({ ok: true, oLuot: { session: { customerAuthorized: 'x', activityAuthorized: 'y', cookie: 'c', userId: 'u1' } } });
  const leaked = FbmSync.controlDispatch('status', {});
  FbmSync.statusRead = realStatus;
  check(so, 'lệnh lỡ trả ô phiên dưới tên lạ: cửa lệnh vẫn gỡ khóa bí mật, không ghi Log', [leaked, logs.length], [{ ok: true, oLuot: { session: { userId: 'u1' } } }, 0]);
  check(so, 'kết quả gỡ khóa phiên FBM theo hình dạng ô phiên', FbmSync.publicResult({ ok: true, status: { session: { customerAuthorized: 'x', activityAuthorized: 'y', cookie: 'c', userId: 'u1' } } }).status.session, { userId: 'u1' });
}

module.exports = { chay };
