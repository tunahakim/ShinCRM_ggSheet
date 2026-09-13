/** Kiểm tra cổng lệnh trung lập với Sidebar/relay/bot và DTO thông báo. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — control port");
  const calls = [];
  const hop = taoHopCat({
    FbmSync: {
      start: (input) => { calls.push(['start', input]); return { ok: true, request: null }; },
      continue: (response) => { calls.push(['continue', response]); return { ok: true }; },
      statusView: () => ({ phase: 'idle', counts: {} }),
      writeAllowed: () => false,
      resolveConflict: (...args) => { calls.push(['resolve', args]); return { ok: true }; },
      prepareConflictResolution: (...args) => { calls.push(['prepare', args]); return { ok: true }; },
      confirmConflict: (...args) => { calls.push(['confirm', args]); return { ok: true }; },
      logTransportError: (message) => ({ phase: 'error', message })
    },
    fbmSyncApprovePush: () => { calls.push(['approve']); return { ok: true }; },
    fbmSyncCancel: () => { calls.push(['cancel']); return { ok: true }; },
    fbmSyncRetryPushFailures: () => { calls.push(['retry']); return { ok: true }; },
    fbmSyncSetWriteMode: (enabled) => { calls.push(['write', enabled]); return { enabled }; }
  });
  napServer(hop, 'fbm_sync/control/ControlPort.js');

  hop.FbmSync.controlDispatch('start', { mode: 'read', origin: 'background' });
  hop.FbmSync.controlDispatch('continue', { response: { status: 200 } });
  hop.FbmSync.controlDispatch('set_write_mode', { enabled: true });
  check(so, 'adapter chuyen command thanh payload nghiep vu chuan', calls.slice(0, 3), [
    ['start', { mode: 'read', scan: undefined, origin: 'background', manual: true }],
    ['continue', { status: 200 }],
    ['write', true]
  ]);

  const warning = hop.FbmSync.controlNotification({
    runId: 'r1', phase: 'awaiting_approval', message: 'old',
    counts: { total: 20 }, metadata: { approvalRequired: true, approvalCount: 20 }
  });
  check(so, 'DTO approval co action id khong phu thuoc giao dien', [warning.type, warning.severity, warning.text, warning.actions.map((item) => item.id)], [
    'sync_approval_required', 'warning', 'Cảnh báo: có 20 bản ghi cần người dùng chấp thuận trước khi ghi.', ['approve_push', 'cancel_sync']
  ]);
  check(so, 'notification binh thuong khong tu tao action', hop.FbmSync.controlNotification({ phase: 'done', message: 'x', counts: {} }).actions, []);
  let unknown = false;
  try { hop.FbmSync.controlDispatch('unknown', {}); } catch (error) { unknown = /SYNC_COMMAND_UNKNOWN/.test(String(error.message)); }
  check(so, 'lenh la khong hop le thi fail closed', unknown, true);
}

module.exports = { chay };
