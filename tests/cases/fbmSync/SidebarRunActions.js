/** Nút của màn Chạy đồng bộ: Bắt đầu, Dừng, Đặt lại, Hủy phiên cũ, Chấp thuận. Sidebar gửi lệnh, vẽ status GAS trả về và báo lỗi; không giữ cờ chạy hay dừng riêng. */
const { taoSidebarDongBo, dongBao } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');
const { bamNut, choVong } = require('../../lib/sidebar/hanh-trinh');

/** Sidebar đã có status đầu tiên, kho dòng báo thật đủ để thấy lời báo, Extension trả lời mã máy và nhận lượt. */
function taoBo() {
  const bo = taoSidebarDongBo();
  const { hop } = bo;
  hop.fbmSyncExtensionRpc = (action) => Promise.resolve(action === 'CRM_FBM_MACHINE_ID' ? { machineId: 'may-A' } : { accepted: true });
  return bo;
}


async function testChayGuiGoi(so) {
  const { hop } = taoBo();
  const guis = [], ve = [];
  hop.fbmSyncDrive = (command, payload) => { guis.push([payload.mode, payload.pack, command, payload.kind]); return Promise.resolve({ ok: true, status: statusGas({ phase: 'done' }) }); };
  hop.fbmSyncPaint = (status) => { ve.push(status); };
  hop.FBM_SYNC_CLIENT.pack = 'deep';
  await hop.fbmSyncRun('write');
  await hop.fbmSyncRun('push');
  check(so, 'Bắt đầu đồng bộ gửi Mức quét đã chọn cho Hai chiều, gửi rỗng cho Đẩy, và vẽ status GAS trả về',
    [guis, ve.length],
    [[['write', 'deep', 'start', 'sync'], ['push', '', 'start', 'sync']], 2]);
  hop.FBM_SYNC_CLIENT.statusReady = false;
  const chuaSan = await hop.fbmSyncRun('read');
  check(so, 'status đầu tiên chưa về thì bấm chạy không gửi gì', [chuaSan, guis.length], [null, 2]);
}

async function testChayLoi(so) {
  // GAS từ chối mở lượt hoặc lượt kết thúc lỗi: status GAS được vẽ, câu báo là chữ của GAS; không ghi thêm Log vì lỗi là của GAS. Lỗi chưa tới GAS (thiếu status) thì báo và ghi Log.
  const { hop } = taoBo();
  const ve = [], log = [];
  hop.fbmSyncPaint = (status) => { ve.push(status.phase); };
  hop.callServer = (name, args) => { log.push(name === 'fbmLogSyncError' ? [name, args[2]] : name); return Promise.resolve({ ok: true }); };
  hop.fbmSyncDrive = () => Promise.resolve({ ok: false, code: 'FBM_TAB_NOT_FOUND', error: 'Không thấy tab FBM', status: statusGas({ phase: 'error', lastError: 'Không thấy tab FBM' }) });
  await hop.fbmSyncRun('read');
  check(so, 'GAS từ chối mở lượt: vẽ status lỗi của GAS và hiện chữ GAS ở dòng báo, không ghi Log thêm',
    [ve, dongBao(hop), log],
    [['error'], ['fbmClient:Không thấy tab FBM'], []]);
  hop.fbmSyncDrive = () => Promise.resolve({ ok: false, code: 'X' });
  await hop.fbmSyncRun('read');
  check(so, 'kết quả không kèm status là hợp đồng GAS sai: báo lỗi và ghi Log, không kết thúc im lặng',
    [dongBao(hop), log],
    [['fbmClient:GAS không trả kết quả đồng bộ.'], [['fbmLogSyncError', 'sync_run']]]);
}

async function testDung(so) {
  const { hop } = taoBo();
  const rpc = [], ve = [];
  hop.fbmSyncExtensionRpc = (action, fields) => { rpc.push([action, fields]); return Promise.resolve({}); };
  hop.fbmSyncPaint = (status) => { ve.push(status.phase); };
  let ketChoLuot = null;
  hop.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-dang-chay', resolve: (value) => { ketChoLuot = value; }, reject: () => {}, timer: null };
  hop.callServer = () => Promise.resolve({ ok: true, status: statusGas({ phase: 'paused', message: 'Đã dừng phiên đồng bộ.' }) });
  await hop.fbmSyncCancel();
  check(so, 'Dừng báo Extension cắt lô qua cổng RPC duy nhất; GAS đóng được lượt thì kết thúc chỗ chờ bằng status GAS, không chờ response lô đang bay',
    [rpc.map((item) => [item[0], item[1]]), hop.FBM_SYNC_CLIENT.runWaiter, ketChoLuot && ketChoLuot.ok, ketChoLuot && ketChoLuot.status.phase, ve], [[['CRM_FBM_CANCEL', {}]], null, true, 'paused', ['paused']]);

  const cho = { runId: 'run-2', resolve: () => { throw new Error('không được kết thúc chỗ chờ'); }, reject: () => {}, timer: null };
  hop.FBM_SYNC_CLIENT.runWaiter = cho;
  hop.callServer = () => Promise.resolve({ ok: true, code: 'SYNC_STOP_PENDING', status: statusGas(stateDangChay({ runId: 'run-2' }), { stopFlag: { runId: 'run-2', verdict: 'cancelled' } }) });
  const khiCho = await hop.fbmSyncCancel();
  check(so, 'SYNC_STOP_PENDING có chỗ chờ: vẽ status GAS (nút Đang dừng theo `actions.run`), giữ chỗ chờ để status đóng lượt về qua relay',
    [khiCho.actions.run, hop.FBM_SYNC_CLIENT.runWaiter === cho],
    ['stopping', true]);

  hop.FBM_SYNC_CLIENT.runWaiter = null;
  hop.callServer = (name) => (name === 'fbmCancelSync' ? Promise.reject(new Error('GAS_TEST_FAILURE')) : Promise.resolve({ ok: true }));
  await hop.fbmSyncCancel();
  check(so, 'Dừng thất bại vẫn hiện lỗi ở dòng báo', dongBao(hop), ['fbmClient:GAS_TEST_FAILURE']);
}

async function testDatLaiVaHuyPhien(so) {
  const { hop } = taoBo();
  const calls = [], ve = [];
  hop.fbmSyncPaint = (status) => { ve.push(status.phase); };
  hop.callServer = (name) => { calls.push(name); return Promise.resolve({ ok: true, status: statusGas({ phase: 'idle' }) }); };
  hop.uiDecisionOpen = () => Promise.resolve(false);
  await hop.fbmSyncResetState();
  hop.uiDecisionOpen = () => Promise.resolve(true);
  await hop.fbmSyncResetState();
  check(so, 'FBM-044: bấm Quay lại ở hộp xác nhận không gọi GAS; bấm Đặt lại mới gọi fbmResetSyncState và vẽ status GAS trả về',
    [calls, ve],
    [['fbmResetSyncState'], ['idle']]);

  calls.length = 0;
  hop.fbmSyncDrive = (command, payload) => { calls.push('drive:' + payload.kind); return Promise.resolve({ ok: true, code: 'LOGIN_OK', status: statusGas({ phase: 'done', message: 'Đã hủy phiên cũ' }) }); };
  hop.fbmSyncRun = (mode) => { calls.push('run:' + mode); return Promise.resolve(null); };
  hop.uiDecisionOpen = () => Promise.resolve(false);
  await hop.fbmSyncForceLogin();
  hop.uiDecisionOpen = () => Promise.resolve(true);
  await hop.fbmSyncForceLogin();
  check(so, 'FBM-057: bấm Quay lại không gọi GAS; xác nhận mới gửi login_force; xong thì Sidebar không tự mở lượt đồng bộ (GAS quyết có mở lại lượt bị chặn hay không)',
    calls,
    ['drive:login_force']);

  const log = [];
  const that = taoBo().hop;
  that.callServer = (name, args) => { log.push(name === 'fbmLogSyncError' ? 'log:' + args[2] : name); return Promise.resolve({ ok: false, code: 'LOGIN_FORCE_NOT_OFFERED', message: 'không mở' }); };
  that.uiDecisionOpen = () => Promise.resolve(true);
  await that.fbmSyncForceLogin();
  check(so, 'GAS từ chối hủy phiên cũ mà không kèm status: báo lỗi và ghi Log việc force_login',
    [log, dongBao(that)],
    [['fbmDriveCommand', 'log:force_login'], ['fbmClient:không mở']]);

  const gas = taoBo().hop, logGas = [];
  gas.callServer = (name) => { logGas.push(name); return Promise.resolve({}); };
  gas.uiDecisionOpen = () => Promise.resolve(true);
  gas.fbmSyncDrive = () => Promise.resolve({ ok: false, code: 'LOGIN_FAILED', error: 'FBM từ chối đăng nhập', status: statusGas({ phase: 'paused', lastError: 'FBM từ chối đăng nhập' }) });
  await gas.fbmSyncForceLogin();
  check(so, 'lượt hủy phiên cũ kết thúc lỗi do GAS: chỉ hiện chữ GAS, không ghi Log lại lỗi của chính GAS',
    [dongBao(gas), logGas],
    [['fbmClient:FBM từ chối đăng nhập'], []]);
}

async function testChapThuan(so) {
  const { hop } = taoBo();
  const chay = [], gui = [];
  hop.syncPanelToggle = () => null;
  hop.fbmSyncRun = (mode, extra) => { chay.push([mode, extra, hop.FBM_SYNC_CLIENT.mode]); return Promise.resolve(null); };
  await hop.fbmSyncApprovePush('abcd1234-2');
  const that = taoBo().hop;
  that.fbmSyncDrive = (command, payload) => { gui.push([command, payload.kind, payload.mode, payload.approvedFingerprint]); return Promise.resolve({ ok: true, status: statusGas({ phase: 'done' }) }); };
  that.fbmSyncPaint = () => {};
  await that.fbmSyncRun('push', { approvedFingerprint: 'abcd1234-2' });
  check(so, 'K6: bấm Chấp thuận mở ngay lượt tay chiều Đẩy mang dấu tập đang hiện (không có lệnh duyệt riêng); lệnh start gửi dấu xuống GAS',
    [chay, gui], [[['push', { approvedFingerprint: 'abcd1234-2' }, 'push']], [['start', 'sync', 'push', 'abcd1234-2']]]);
}

async function testKhoaNutKhiDangLam(so) {
  // Chống bấm đúp: nút khóa trên DOM tới khi việc của nó xong; mở lại không cần status. Việc của nút tự bắt lỗi nên không bao giờ từ chối.
  const { hop, dom } = taoBo();
  hop.fbmSyncInstall();
  let xong = null;
  hop.fbmSyncRun = () => new Promise((resolve) => { xong = () => resolve(null); });
  const nut = dom.document.createElement('button');
  nut.id = 'fbm-sync-start';
  bamNut(dom, nut);
  const khiDang = nut.disabled;
  xong();
  await choVong();
  check(so, 'nút Bắt đầu khóa trong lúc việc chạy và mở lại khi xong', [khiDang, nut.disabled], [true, false]);
}

async function chay(so) {
  section('FBM sync — Sidebar: nút Chạy, Dừng, Đặt lại, Hủy phiên cũ, Chấp thuận');
  try { taoSidebarDongBo(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testChayGuiGoi(so);
  await testChayLoi(so);
  await testDung(so);
  await testDatLaiVaHuyPhien(so);
  await testChapThuan(so);
  await testKhoaNutKhiDangLam(so);
}

module.exports = { chay };
