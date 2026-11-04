/** Kiểm cầu nối iframe của Extension: bắt tay với Sidebar, chuyển lệnh sang worker, chuyển trạng thái lượt về Sidebar, không chép mật khẩu. */
const { section, check } = require('../../lib/assert');
const { MANIFEST, SHEET } = require('../../lib/fbm/worker-nap');
const { bridgeNap } = require('../../lib/fbm/tab-nap');

async function cauNoi(so) {
  const b = bridgeNap(SHEET);
  b.sidebar({ action: 'CRM_HANDSHAKE', nonce: 'n-1' });
  const session = b.hop.extensionSessionId;
  check(so, 'Ping cầu nối trả số bản trong manifest',
    b.fromWorker({ type: 'CRM_BRIDGE_PING' }),
    { ready: true, version: MANIFEST.version });
  b.hop.workerReply = (message) => (message.type === 'FBM_RUN_NOW' ? { ok: true, accepted: true } : { ok: false, code: 'RUN_ID_REQUIRED', error: 'thiếu' });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q1', nonce: 'n-1', sessionId: session, runId: 'L1', retryMs: [5, 10], password: 'khong-chep' });
  const traLoi = b.posts[b.posts.length - 1].data;
  check(so, 'Lệnh CRM_FBM_RUN_NOW qua bảng lệnh: worker chỉ nhận lịch thử lại và lý do đánh thức, thiếu lý do là run_now (mã lượt, mật khẩu Sidebar gửi kèm bị bỏ); trả lời một dạng kèm nonce và phiên', [
    b.toWorker[0], [traLoi.action, traLoi.id, traLoi.ok, traLoi.result, traLoi.code, traLoi.nonce, traLoi.sessionId === session], b.posts[b.posts.length - 1].origin
  ], [{ type: 'FBM_RUN_NOW', retryMs: [5, 10], trigger: 'run_now' }, ['CRM_FBM_RUN_NOW_RESULT', 'q1', true, { ok: true, accepted: true }, '', 'n-1', true], b.origin]);
  const truoc = b.toWorker.length;
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q2', nonce: 'sai', sessionId: session, runId: 'L1' });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q3', nonce: 'n-1', sessionId: 'phien-cu', runId: 'L1' });
  check(so, 'Lệnh sai nonce hoặc của phiên Extension cũ không tới worker', b.toWorker.length, truoc);

  const daGui = b.posts.length;
  const giao = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1', phase: 'done' }, code: '', done: true, extra: 'bo' });
  const tin = b.posts[b.posts.length - 1].data;
  check(so, 'Status của đúng Sheet chuyển vào Sidebar với đúng các trường hợp đồng, kèm nonce và phiên',
    [giao, b.posts.length - daGui, Object.keys(tin).sort(), tin.done, tin.status.runId],
    [{ delivered: true }, 1, ['action', 'code', 'conflict', 'done', 'error', 'failure', 'nonce', 'ok', 'sessionId', 'status'], true, 'L1']);
  const khac = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: 'sheet-khac', status: { runId: 'X' }, done: true });
  check(so, 'Status của Sheet khác không vào Sidebar này', [khac, b.posts.length - daGui], [{ delivered: false }, 1]);

  b.hop.postThrows = true;
  const hong = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: false });
  const baoHong = b.toWorker[b.toWorker.length - 1];
  check(so, 'Cầu nối gửi Sidebar hỏng: trả delivered false, báo worker FBM_BRIDGE_FAILURE kèm mã và chữ lỗi, không im lặng',
    [hong, baoHong.type, baoHong.code, /Blocked a frame/.test(baoHong.message)],
    [{ delivered: false }, 'FBM_BRIDGE_FAILURE', 'BRIDGE_STATUS_POST_FAILED', true]);
  b.hop.postThrows = false;
  const sauHong = b.toWorker.length;
  const lanSau = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: true });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q4', nonce: 'n-1', sessionId: session, runId: 'L1' });
  check(so, 'Kênh đã hỏng coi như đóng: status sau không gửi, lệnh cũ không tới worker cho tới khi Sidebar bắt tay lại',
    [lanSau, b.toWorker.length - sauHong],
    [{ delivered: false }, 0]);
  b.sidebar({ action: 'CRM_HANDSHAKE', nonce: 'n-2' });
  check(so, 'Bắt tay lại thì kênh mở lại',
    b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: true }),
    { delivered: true });

  b.hop.workerReply = null;
  b.hop.chrome.runtime.sendMessage = (message, done) => { b.hop.chrome.runtime.lastError = { message: 'Extension context invalidated.' }; done(undefined); b.hop.chrome.runtime.lastError = null; };
  b.sidebar({ action: 'CRM_FBM_MACHINE_ID', id: 'q5', nonce: 'n-2', sessionId: session });
  const loiWorker = b.posts[b.posts.length - 1].data;
  check(so, 'Worker không nhận lệnh (Extension vừa tải lại): Sidebar nhận ok false kèm mã EXTENSION_CONTEXT_INVALIDATED, không treo',
    [loiWorker.action, loiWorker.ok, loiWorker.code],
    ['CRM_FBM_MACHINE_ID_RESULT', false, 'EXTENSION_CONTEXT_INVALIDATED']);
}

async function chay(so) {
  section('FBM sync — cầu nối iframe của Extension');
  await cauNoi(so);
}

module.exports = { chay };
