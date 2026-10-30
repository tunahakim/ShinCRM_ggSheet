/** Kiểm đường mở lượt tay mới: Sidebar chỉ nhận `runId`, Extension của đúng máy đến nhận lượt qua relay; máy khác, lần nhận thứ hai và response đến sau khi lượt đóng không chạm ô lượt. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('./Workflow');

function loi(fn) {
  try { fn(); return null; } catch (error) { return String(error && error.code || ''); }
}

async function chay(so) {
  section('FBM sync — mở lượt bằng runId, Extension nhận lượt');
  const { hop, documentProperties } = workflowGas();
  const FbmSync = hop.FbmSync;
  const logs = [];
  hop.logEvent = (line) => { logs.push(line); };
  FbmSync.setMasterEnabled(true);
  const anh = () => JSON.stringify(documentProperties.data);

  const before = anh();
  const noMachine = FbmSync.controlDispatch('start', { kind: 'identity_probe' });
  check(so, 'mở lượt từ Sidebar thiếu mã máy thì từ chối trước khi chạy, không đổi ô lượt', [noMachine.code, anh() === before], ['SYNC_MACHINE_ID_REQUIRED', true]);

  const started = FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A' });
  const held = FbmSync.stateRead();
  check(so, 'start trên kênh Sidebar trả runId và giãn cách thử lại, không trả phong bì; ô lượt giữ chỗ nhận cho đúng máy', [
    started.ok, typeof started.runId, started.runId === held.runId, Object.prototype.hasOwnProperty.call(started, 'request'), started.relayRetryMs, held.activeRequestId, held.driverMachineId, held.deadlineAt > Date.now()
  ], [true, 'string', true, false, FbmSync.BUDGET.relayRetryMs, 'pickup:' + held.runId, 'may-A', true]);

  const beforeForeign = anh();
  const foreign = FbmSync.controlDispatch('continue', { runId: started.runId, machineId: 'may-B' }, 'relay');
  check(so, 'continue từ máy khác bị từ chối RUN_DRIVER_MISMATCH và không ghi gì', [foreign.code, foreign.request || null, anh() === beforeForeign], ['RUN_DRIVER_MISMATCH', null, true]);
  const foreignReply = FbmSync.controlDispatch('continue', { machineId: 'may-B', response: { ok: true, status: 200, body: '{}' } }, 'relay');
  check(so, 'máy khác nộp response cũng bị từ chối trước khi chạm ô lượt', [foreignReply.code, anh() === beforeForeign], ['RUN_DRIVER_MISMATCH', true]);
  const wrongRun = FbmSync.controlDispatch('continue', { runId: 'luot-khac', machineId: 'may-A' }, 'relay');
  check(so, 'nhận lượt sai runId bị từ chối, không ghi', [wrongRun.code, anh() === beforeForeign], ['RUN_PICKUP_REJECTED', true]);

  const picked = FbmSync.controlDispatch('continue', { runId: started.runId, machineId: 'may-A' }, 'relay');
  const issued = FbmSync.stateRead();
  check(so, 'đúng máy nhận lượt thì GAS phát phong bì đầu dựng từ cursor, chỗ giữ thành request thật', [picked.ok, picked.request && picked.request.meta.kind, issued.activeRequestId === picked.request.id, issued.driverMachineId], [true, 'identity_user_grid', true, 'may-A']);

  const beforeTwice = anh();
  const twice = FbmSync.controlDispatch('continue', { runId: started.runId, machineId: 'may-A' }, 'relay');
  check(so, 'nhận lượt lần hai bị từ chối RUN_PICKUP_REJECTED, không phát phong bì trùng, không ghi', [twice.code, twice.request || null, anh() === beforeTwice], ['RUN_PICKUP_REJECTED', null, true]);

  // Lượt đóng (dừng) rồi response của request cũ mới về: GAS bỏ, không cấp request mới.
  FbmSync.stateWrite(FbmSync.runCloseNow(FbmSync.stateRead(), { phase: 'paused', message: 'Dừng để thử response muộn.' }));
  const late = FbmSync.controlDispatch('continue', { machineId: 'may-A', response: { ok: true, status: 200, body: '{"d":{}}', trace: [{ stage: 'fbm_tab_replied', requestId: picked.request.id }] } }, 'relay');
  const afterLate = FbmSync.stateRead();
  check(so, 'response đến sau khi lượt đã đóng thì không cấp request mới và lượt vẫn đóng', [late.request || null, afterLate.activeRequestId, afterLate.phase], [null, '', 'paused']);

  // Chrome chặn quyền site FBM: GAS không thử lại, đóng lượt bằng lỗi, ghi Log và để status mang chữ gốc cho Sidebar.
  const blockedRun = FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A', force: true });
  const blockedPick = blockedRun.runId ? FbmSync.controlDispatch('continue', { runId: blockedRun.runId, machineId: 'may-A' }, 'relay') : blockedRun;
  logs.length = 0;
  const blocked = blockedPick.request ? FbmSync.controlDispatch('continue', { machineId: 'may-A', error: { requestId: blockedPick.request.id, code: 'FBM_SITE_ACCESS_BLOCKED', message: 'Chrome đang chặn Extension truy cập site FBM: Cannot access contents of url.' } }, 'relay') : blockedPick;
  const blockedState = FbmSync.stateRead();
  check(so, 'Extension báo FBM_SITE_ACCESS_BLOCKED: GAS không cấp request thử lại, lượt về lỗi mang đúng mã, chữ Chrome hiện ở status và có dòng Log', [
    blocked.code, blocked.request || null, blockedState.phase, blockedState.lastFailureCode, /Cannot access/.test(blocked.status && blocked.status.lastError || blockedState.lastError), logs.some((line) => JSON.stringify(line).indexOf('FBM_SITE_ACCESS_BLOCKED') >= 0)
  ], ['FBM_SITE_ACCESS_BLOCKED', null, 'error', 'FBM_SITE_ACCESS_BLOCKED', true, true]);

  // Bật tự mở tab FBM mà Extension không thấy tab: GAS cấp lại đúng request một lần kèm lệnh mở tab; không thấy lần nữa thì đóng lượt bằng lỗi.
  const policy = FbmSync.sessionGatePolicy;
  FbmSync.sessionGatePolicy = () => Object.assign(policy(), { autoOpenTab: true });
  const tabRun = FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A', force: true });
  const tabPick = FbmSync.controlDispatch('continue', { runId: tabRun.runId, machineId: 'may-A' }, 'relay').request;
  const noTab = (id) => FbmSync.controlDispatch('continue', { machineId: 'may-A', error: { requestId: id, code: 'FBM_TAB_NOT_FOUND', message: 'Không thấy tab FBM.' } }, 'relay');
  const retry = noTab(tabPick.id);
  check(so, 'tự mở tab bật, Extension không thấy tab: GAS trả request thử lại cùng bước kèm lệnh mở tab, qua được cửa ra của GAS', [retry.ok, retry.code, retry.request && retry.request.meta.kind, !!(retry.request && retry.request.meta.openFbmContext)], [true, 'FBM_TAB_RETRY_REQUEST_READY', tabPick.meta.kind, true]);
  const twiceNoTab = noTab(retry.request.id);
  check(so, 'thử lại vẫn không thấy tab: không thử lần nữa, lượt về lỗi FBM_TAB_NOT_FOUND', [twiceNoTab.request || null, FbmSync.stateRead().phase, FbmSync.stateRead().lastFailureCode], [null, 'error', 'FBM_TAB_NOT_FOUND']);
  FbmSync.sessionGatePolicy = policy;

  check(so, 'phong bì thật lọt ra kênh Sidebar là lỗi lập trình, ném ENVELOPE_CHANNEL_VIOLATION', loi(() => FbmSync.channelResult({ ok: true, request: { id: 'x', url: 'https://fbo.com.vn:8888/a' } }, 'sidebar')), 'ENVELOPE_CHANNEL_VIOLATION');
  check(so, 'cửa mở lượt của Sidebar chỉ nhận lệnh có cờ drives', [loi(() => FbmSync.driveCommandName('continue')), loi(() => FbmSync.driveCommandName('heartbeat')), FbmSync.driveCommandName('open_conflict')], ['DRIVE_COMMAND_REJECTED', 'DRIVE_COMMAND_REJECTED', 'open_conflict']);
  check(so, 'payload không tự xưng được là relay: kênh do lối vào đặt', (() => { let seen = ''; const spec = FbmSync.COMMANDS.status, real = spec.run; spec.run = (input) => { seen = input.source; return { ok: true }; }; FbmSync.controlDispatch('status', { source: 'relay' }); spec.run = real; return seen; })(), 'sidebar');

  // Relay: thiếu mã máy thì từ chối; ô lỗi gọi relay trong hộp đen được ghi Log một lần và trả mốc để Extension xóa.
  const contract = FbmSync.protocol.contract;
  check(so, 'relay không mang mã máy thì từ chối RELAY_MACHINE_ID_REQUIRED', loi(() => FbmSync.relayHandle({ spreadsheetId: 'sheet-workflow', contract, command: 'heartbeat', payload: { trigger: 'startup' } })), 'RELAY_MACHINE_ID_REQUIRED');
  logs.length = 0;
  const failureAt = Date.now() - 60000;
  const acked = FbmSync.relayHandle({ spreadsheetId: 'sheet-workflow', contract, command: 'heartbeat', payload: { trigger: 'startup', machineId: 'may-A', trail: { stage: 'chain_finished', at: Date.now(), relayFailure: { at: failureAt, code: 'RELAY_ENDPOINT_NOT_FOUND', httpStatus: 404, attempts: 3, command: 'continue', cookie: 'bi-mat' } } } });
  const failureLog = logs.find((line) => line.action === 'relay_call_failed');
  check(so, 'hộp đen có ô lỗi gọi relay thì GAS ghi Log mang mã và HTTP, trả trailAck đúng mốc, không chép khóa lạ', [acked.trailAck, !!failureLog, failureLog && failureLog.detail.code, failureLog && failureLog.detail.httpStatus, JSON.stringify(failureLog || {}).indexOf('bi-mat') < 0], [failureAt, true, 'RELAY_ENDPOINT_NOT_FOUND', 404, true]);
  check(so, 'relay trả statusView đầy đủ cho Extension chuyển sang Sidebar', [!!acked.status, typeof acked.status.label], [true, 'string']);

  check(so, 'phong bì mang URL ngoài miền FBM bị GAS từ chối trước khi phát', loi(() => FbmSync.nextEnvelope({ url: 'https://evil.test/Main/x', body: {}, meta: { kind: 'session_probe' } })) !== null, true);

  // Request mở lượt phải dựng lại được từ cursor: đăng nhập thử giữ testOnly/force, xung đột giữ fbmId.
  check(so, 'cursor đăng nhập thử và hủy phiên cũ dựng lại đúng request login', [
    FbmSync.requestForCursor({ cursor: { kind: 'login', credentialRef: 'cred-1', testOnly: true, purpose: 'test' } }).meta,
    FbmSync.requestForCursor({ cursor: { kind: 'login', credentialRef: 'cred-1', testOnly: true, purpose: 'force' } }).meta.force
  ].map((meta) => typeof meta === 'object' ? [meta.kind, meta.testOnly, meta.force] : meta), [['login', true, false], true]);
  check(so, 'cursor đọc lại xung đột dựng lại đúng request đọc theo ID FBM', FbmSync.requestForCursor({ cursor: { kind: 'conflict_refresh', entity: 'customer', id: 'KH1', fbmId: 'F1' } }).meta.kind, 'conflict_refresh_grid');

  FbmSync.loginConfigRead = () => ({ configured: true, credentialRef: 'cred-test-1234' });
  documentProperties.deleteProperty(FbmSync.STATE_KEY);
  const login = FbmSync.controlDispatch('start', { kind: 'login_test', machineId: 'may-A' });
  const loginPicked = FbmSync.controlDispatch('continue', { runId: login.runId, machineId: 'may-A' }, 'relay');
  check(so, 'Đăng nhập thử trên Sheet chưa từng chạy lượt vẫn có runId; nhận lượt ra request login thử', [typeof login.runId, !!login.runId, loginPicked.request && loginPicked.request.meta.kind, loginPicked.request && loginPicked.request.meta.testOnly], ['string', true, 'login', true]);
}

module.exports = { chay };
