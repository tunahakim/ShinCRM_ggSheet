/** Kiểm đường lượt tay phía Sidebar (`fbmSyncDrive`): GAS chỉ trả `runId`, Sidebar chờ đúng lượt đó qua tin `CRM_FBM_STATUS` của Extension, kết thúc bằng cờ `done`; Extension im lặng thì hỏi GAS một lần chứ không chờ vô hạn. */
const { section, check } = require('../../lib/assert');
const { taoBoTest } = require('./Sidebar');

const nghi = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

/** Sidebar thật với Extension và GAS giả: `rpc` ghi lệnh gửi Extension, `calls` ghi lời gọi GAS. */
function taoSidebar(gas, rpcOverride) {
  const { hop } = taoBoTest();
  hop.setTimeout = setTimeout; hop.clearTimeout = clearTimeout;
  const rpc = [], calls = [], notices = [];
  hop.fbmSyncExtensionRpc = (action, fields) => {
    rpc.push([action, fields]);
    if (rpcOverride && rpcOverride[action]) { return rpcOverride[action](fields); }
    if (action === 'CRM_FBM_MACHINE_ID') { return Promise.resolve({ ok: true, machineId: 'may-A' }); }
    return Promise.resolve({ ok: true, accepted: true });
  };
  hop.callServer = (name, args) => { calls.push([name, args]); return Promise.resolve().then(() => gas(name, args, calls.length)); };
  hop.noticeSet = (key, value) => { notices.push([key, value]); };
  return { hop, rpc, calls, notices };
}

const moLuot = (runId) => ({ ok: true, runId, relayRetryMs: [5000, 15000], status: { runId, phase: 'running', running: true } });

async function chay(so) {
  section('FBM sync — Sidebar mở lượt bằng runId, chờ Extension báo done');

  const a = taoSidebar((name) => (name === 'fbmDriveCommand' ? moLuot('L1') : { ok: true }));
  let xong = null;
  const luot = a.hop.fbmSyncDrive('start', { kind: 'pull', password: undefined }, 'đồng bộ').then((value) => { xong = value; });
  await nghi(5);
  check(so, 'Sidebar hỏi mã máy rồi gọi GAS fbmDriveCommand kèm mã máy; GAS trả runId thì báo Extension nhận lượt kèm lịch thử lại GAS gửi', [
    a.rpc.map((item) => item[0]), a.calls[0][0], a.calls[0][1][0], a.calls[0][1][1].machineId, a.calls[0][1][1].kind, a.rpc[1][1], xong
  ], [['CRM_FBM_MACHINE_ID', 'CRM_FBM_RUN_NOW'], 'fbmDriveCommand', 'start', 'may-A', 'pull', { runId: 'L1', retryMs: [5000, 15000] }, null]);
  a.hop.fbmSyncStatusReceived({ status: { runId: 'L-khac', phase: 'done' }, done: true });
  a.hop.fbmSyncStatusReceived({ status: { runId: 'L1', phase: 'running' }, done: false });
  await nghi(5);
  check(so, 'Tin done của lượt khác (lượt nền) và tin chưa done của lượt này không kết thúc lượt đang chờ', [xong, !!a.hop.FBM_SYNC_CLIENT.runWaiter], [null, true]);
  a.hop.fbmSyncStatusReceived({ status: { runId: 'L1', phase: 'done' }, conflict: { n: 1 }, done: true });
  await luot;
  check(so, 'Tin done đúng runId kết thúc lượt với status và xung đột Extension chuyển, xóa chỗ chờ', [xong.ok, xong.code, xong.status.phase, xong.conflict, a.hop.FBM_SYNC_CLIENT.runWaiter], [true, '', 'done', { n: 1 }, null]);

  const b = taoSidebar((name) => (name === 'fbmDriveCommand' ? moLuot('L2') : { ok: true }));
  const luotB = b.hop.fbmSyncDrive('start', { kind: 'pull' }, 'đồng bộ');
  await nghi(5);
  b.hop.fbmSyncStatusReceived({ ok: false, status: { runId: 'L2', phase: 'error' }, code: 'RUN_DRIVER_MISMATCH', error: 'Lượt đang do máy khác chở.', done: true });
  const kqB = await luotB;
  check(so, 'Lượt kết thúc bằng mã lỗi GAS: kết quả mang đúng mã và chữ GAS để nơi gọi báo', [kqB.ok, kqB.code, kqB.error], [false, 'RUN_DRIVER_MISMATCH', 'Lượt đang do máy khác chở.']);

  const b2 = taoSidebar((name) => (name === 'fbmDriveCommand' ? moLuot('L2b') : { ok: true }));
  const luotB2 = b2.hop.fbmSyncDrive('start', { kind: 'login_test' }, 'login');
  await nghi(5);
  b2.hop.fbmSyncStatusReceived({ ok: true, status: { runId: 'L2b', phase: 'done' }, code: 'LOGIN_OK', error: '', done: true });
  const kqB2 = await luotB2;
  check(so, 'Lượt đạt mà GAS vẫn kèm mã (LOGIN_OK): Sidebar lấy cờ ok của GAS, không suy thành lỗi từ việc có mã', [kqB2.ok, kqB2.code], [true, 'LOGIN_OK']);

  const c = taoSidebar((name) => (name === 'fbmDriveCommand' ? moLuot('L3') : { ok: true }));
  const luotC = c.hop.fbmSyncDrive('start', { kind: 'pull' }, 'đồng bộ').then(() => 'ok', (error) => error);
  await nghi(5);
  c.hop.fbmSyncStatusReceived({ failure: { code: 'RELAY_FETCH_FAILED', message: 'mạng hỏng', httpStatus: 0 } });
  const loiC = await luotC;
  check(so, 'Extension báo lỗi trong lượt đang chờ: lượt nhận lỗi mang mã Extension, không treo', [typeof loiC.message, loiC.code, /RELAY_FETCH_FAILED/.test(loiC.message), c.hop.FBM_SYNC_CLIENT.runWaiter], ['string', 'RELAY_FETCH_FAILED', true, null]);

  const d = taoSidebar(() => ({ ok: true }));
  d.hop.fbmSyncStatusReceived({ failure: { code: 'ALARM_CREATE_FAILED', message: 'không đặt được chuông', httpStatus: 0 } });
  await nghi(5);
  const baoD = d.notices.filter((item) => item[0] === 'fbmExtension').pop();
  check(so, 'Extension báo lỗi khi không có lượt tay: hiện ở dòng thông báo Sidebar (không popup) và ghi Log GAS', [!!(baoD && baoD[1] && /ALARM_CREATE_FAILED/.test(baoD[1].line)), d.calls.map((item) => item[0]), d.calls[0] && d.calls[0][1][2]], [true, ['fbmLogSyncError'], 'extension_failure']);
  d.hop.fbmSyncStatusReceived({ status: { runId: 'nen', phase: 'running' }, done: false });
  check(so, 'Tin status bình thường sau đó xóa dòng báo lỗi Extension', d.notices[d.notices.length - 1], ['fbmExtension', null]);

  const e = taoSidebar((name) => (name === 'fbmDriveCommand' ? moLuot('L5') : { ok: true }), { CRM_FBM_RUN_NOW: () => Promise.reject(Object.assign(new Error('Extension không trả lời'), { code: 'EXTENSION_RPC_TIMEOUT' })) });
  const loiE = await e.hop.fbmSyncDrive('start', { kind: 'pull' }, 'đồng bộ').then(() => null, (error) => error);
  check(so, 'Extension không nhận lượt: lượt báo lỗi ngay mang mã Extension và bỏ chỗ chờ, không chờ tới hạn im lặng', [loiE && loiE.code, e.hop.FBM_SYNC_CLIENT.runWaiter], ['EXTENSION_RPC_TIMEOUT', null]);

  const f = taoSidebar((name) => (name === 'fbmDriveCommand' ? { ok: false, code: 'SYNC_MACHINE_ID_REQUIRED', status: { phase: 'idle' } } : { ok: true }));
  const kqF = await f.hop.fbmSyncDrive('start', { kind: 'pull' }, 'đồng bộ');
  check(so, 'GAS không mở lượt (không có runId): trả nguyên kết quả GAS, không báo Extension nhận lượt', [kqF.code, f.rpc.map((item) => item[0])], ['SYNC_MACHINE_ID_REQUIRED', ['CRM_FBM_MACHINE_ID']]);

  let lanG = 0;
  const g = taoSidebar((name) => {
    if (name !== 'fbmDriveCommand') { return { ok: true }; }
    lanG += 1;
    if (lanG === 1) { throw new Error('Exception: DEADLINE_EXCEEDED'); }
    return { ok: false, code: 'NO_CONFLICT' };
  });
  const kqG = await g.hop.fbmSyncDrive('open_conflict', {}, 'mở xung đột');
  check(so, 'Apps Script chưa nạp được mã dự án: thử lại đúng một lần với cùng thân', [lanG, kqG.code, JSON.stringify(g.calls[0][1]) === JSON.stringify(g.calls[1][1])], [2, 'NO_CONFLICT', true]);

  // Extension im lặng (worker bị tắt): hỏi GAS; lượt còn chạy thì chờ tiếp, lượt đã đóng thì kết thúc theo status GAS.
  let hoi = 0;
  const h = taoSidebar((name) => {
    if (name === 'fbmDriveCommand') { return moLuot('L7'); }
    if (name === 'fbmGetSyncStatus') { hoi += 1; return hoi === 1 ? { status: { runId: 'L7', running: true, phase: 'running' } } : { status: { runId: 'L7', running: false, phase: 'error', lastFailureCode: 'RUN_ABANDONED', lastError: 'Lượt bị bỏ dở.' } }; }
    return { ok: true };
  });
  h.hop.FBM_SYNC_RUN_SILENCE_MS = 20;
  const kqH = await h.hop.fbmSyncDrive('start', { kind: 'pull' }, 'đồng bộ');
  check(so, 'Extension im quá hạn: Sidebar hỏi GAS, lượt còn chạy thì chờ tiếp, lượt đã đóng thì kết thúc bằng mã và chữ trong status GAS', [hoi, kqH.ok, kqH.code, kqH.error, h.hop.FBM_SYNC_CLIENT.runWaiter], [2, false, 'RUN_ABANDONED', 'Lượt bị bỏ dở.', null]);
}

module.exports = { chay };
