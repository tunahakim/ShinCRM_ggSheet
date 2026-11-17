/** Lượt nền đang chạy khi người dùng bấm lệnh (popup hỏi, nút X) và chỗ chờ lượt tay (đồng hồ chờ, lượt nối tiếp, lượt kẹt). Quyết định mở hay đóng lượt là của GAS; Sidebar chỉ hỏi và chuyển lệnh. */
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');

function demHen(hop) {
  const hen = [];
  hop.setTimeout = (fn, ms) => { hen.push({ fn, ms, cleared: false }); return hen.length; };
  hop.clearTimeout = (id) => { if (hen[id - 1]) { hen[id - 1].cleared = true; } };
  return hen;
}

const luot = () => new Promise((resolve) => setImmediate(resolve));

/** Lượt nền đang chạy do GAS báo, kèm giờ bắt đầu để popup nêu. */
function nenDangChay() { return statusGas(stateDangChay({ origin: 'background', phase: 'pull_activity', entity: 'activity', startedAt: new Date(2026, 9, 19, 15, 3).getTime() })); }

async function chayVoiNen(choice, dungChua) {
  const { hop } = taoSidebarDongBo();
  const nen = nenDangChay();
  const ghi = { popup: null, goi: [], start: 0, rpc: [], ve: [] };
  hop.fbmSyncPaint = (status) => { ghi.ve.push(status.phase); };
  hop.fbmSyncExtensionRpc = (action) => { ghi.rpc.push(action); return Promise.resolve(action === 'CRM_FBM_MACHINE_ID' ? { machineId: 'may-A' } : { accepted: true }); };
  hop.uiDecisionChoose = (opts) => { ghi.popup = opts; return Promise.resolve(choice); };
  hop.callServer = (name) => {
    if (name === 'fbmDriveCommand') { ghi.start += 1; return Promise.resolve(ghi.start === 1 ? { ok: false, code: 'SYNC_BACKGROUND_RUNNING', status: nen } : { ok: false, code: 'TEST_STOP', status: statusGas({ phase: 'done' }) }); }
    ghi.goi.push(name);
    return Promise.resolve(dungChua ? { ok: true, code: 'SYNC_STOP_PENDING', status: nen } : { ok: true, code: 'SYNC_BACKGROUND_STOPPED', status: statusGas({ phase: 'paused' }) });
  };
  ghi.ket = await hop.fbmSyncRun('read');
  ghi.nen = nen;
  ghi.dongBao = Object.keys(hop.NOTICES).filter((key) => key !== 'fbmBackgroundMachine');
  return ghi;
}

async function testPopupNen(so) {
  const huy = await chayVoiNen('cancel'), dung = await chayVoiNen('stop'), cho = await chayVoiNen('wait'), dungHong = await chayVoiNen('stop', true);
  check(so, 'Chạy tay gặp lượt nền: popup nêu bước đang chạy và giờ bắt đầu, hai nút dừng ngay / để nền chạy tiếp',
    [huy.popup.title, huy.popup.lines, huy.popup.choices.map((c) => c.id + ':' + c.label)],
    ['Đồng bộ nền đang chạy', ['Bước đang chạy: Đang đọc giao dịch — Giao dịch.', 'Bắt đầu lúc 2026-10-19 15:03.'], ['stop:Dừng đồng bộ nền và chạy đồng bộ ngay', 'wait:Để đồng bộ nền chạy tiếp, tôi sẽ chạy đồng bộ sau']]);
  check(so, 'Nút X của popup nền: không gọi dừng nền, không gọi lại lệnh gốc, màn về như vừa mở bằng status GAS, không dòng báo',
    [huy.goi, huy.start, huy.ket.code, huy.ve, huy.dongBao], [[], 1, 'SYNC_BACKGROUND_SKIPPED', ['pull_activity'], []]);
  check(so, 'Chọn để nền chạy tiếp: không gọi dừng nền, không gọi lại lệnh gốc',
    [cho.goi, cho.start, cho.ket.code],
    [[], 1, 'SYNC_BACKGROUND_SKIPPED']);
  check(so, 'Chọn dừng nền: đúng một lệnh dừng nền, vẽ status GAS trả về rồi gọi lại lệnh gốc ngay không chờ không dò; kết quả của lệnh gốc đi thẳng ra',
    [dung.goi, dung.ve, dung.start, dung.ket.code], [['fbmStopBackground'], ['paused', 'done'], 2, 'TEST_STOP']);
  check(so, 'Dừng nền khi lát nền đang giữ khóa (SYNC_STOP_PENDING): vẫn gọi lại lệnh gốc ngay (GAS đóng lượt nền khi mở lượt); Extension được báo cắt lô ở cả hai trường hợp',
    [dungHong.goi, dungHong.start, dungHong.rpc.indexOf('CRM_FBM_CANCEL') >= 0, dung.rpc.indexOf('CRM_FBM_CANCEL') >= 0], [['fbmStopBackground'], 2, true, true]);
}

async function testNutXMoiThaoTac(so) {
  // Nút X ở mọi thao tác: màn về như vừa mở (không dòng báo, không cờ thao tác, tab Xung đột về Tóm tắt), vẽ bằng status thật GAS trả, chỉ một lần gọi lệnh gốc.
  const ban = async (chuanBi, bam) => {
    const { hop } = taoSidebarDongBo();
    const nen = nenDangChay(), ghi = { goi: [], ve: [] };
    hop.fbmSyncPaint = (status) => { ghi.ve.push(status); };
    hop.fbmSyncExtensionRpc = (action) => Promise.resolve(action === 'CRM_FBM_MACHINE_ID' ? { machineId: 'may-A' } : { accepted: true });
    hop.uiDecisionChoose = () => Promise.resolve('cancel');
    hop.callServer = (name) => { ghi.goi.push(name); return Promise.resolve(name === 'fbmDriveCommand' ? { ok: false, code: 'SYNC_BACKGROUND_RUNNING', status: nen } : null); };
    chuanBi(hop);
    await bam(hop);
    const c = hop.FBM_SYNC_CLIENT;
    ghi.sau = [c.mode, c.identityAction, c.identityLastAction, c.resultsTab, c.conflictNote, c.accountNotices.identity, c.accountNotices.login];
    ghi.veCuoi = ghi.ve[ghi.ve.length - 1] === nen;
    ghi.dangMo = c.conflictOpening;
    return ghi;
  };
  const sach = ['read', '', '', 'summary', '', null, null];
  const lienKet = await ban((hop) => {
    hop.FBM_SYNC_CLIENT.accountNotices = { identity: { kind: 'success', message: 'cũ' }, accountSettings: null, login: { kind: 'info', message: 'cũ' } };
    hop.FBM_SYNC_CLIENT.identityStatus = { status: 'BOUND', binding: { spreadsheetId: 's', userId: 'u', username: 'n', accountName: 'a' } };
  }, (hop) => hop.fbmSyncCheckIdentity());
  const tuDien = await ban(() => {}, (hop) => hop.fbmSyncAutoFill());
  const xungDot = await ban((hop) => {
    hop.FBM_SYNC_CLIENT.conflict = null; hop.FBM_SYNC_CLIENT.conflictOpening = false;
    hop.FBM_SYNC_CLIENT.lastStatus = statusGas({ phase: 'conflict', metadata: { conflictCount: 2 } });
    hop.FBM_SYNC_CLIENT.resultsTab = 'conflict';
  }, (hop) => hop.fbmSyncConflictTabLoad());
  check(so, 'Nút X: màn quay về như vừa mở và vẽ bằng status thật GAS, chỉ một lần gọi lệnh gốc (kiểm liên kết, tự điền, tab Xung đột)',
    [lienKet.goi, lienKet.sau, lienKet.veCuoi, tuDien.goi, tuDien.sau, tuDien.veCuoi, xungDot.goi, xungDot.sau, xungDot.veCuoi, xungDot.dangMo],
    [['fbmDriveCommand'], sach, true, ['fbmDriveCommand'], sach, true, ['fbmDriveCommand'], sach, true, false]);
}

async function testDocTrangThai(so) {
  const { hop } = taoSidebarDongBo();
  hop.callServer = () => Promise.resolve({ ok: true, status: statusGas({ phase: 'idle', runId: '', updatedAt: Date.now() + 1000 }) });
  hop.fbmSyncPaint = () => undefined;
  const docThat = await hop.fbmSyncStatusOnce();
  check(so, 'Đọc trạng thái luôn trả status GAS kể cả khi đã vẽ',
    [docThat && docThat.phase, docThat && docThat.runId],
    ['idle', '']);
  hop.callServer = (name) => (name === 'fbmGetSyncStatus' ? Promise.reject(new Error('Mất kết nối tới GAS')) : Promise.resolve({ ok: true }));
  const loi = await hop.fbmSyncStatusOnce().then(() => null, (error) => error.message);
  check(so, 'Đọc trạng thái hỏng: ném lại lỗi cho nơi gọi và báo ở dòng báo, không vẽ status giả',
    [loi, Object.keys(hop.NOTICES).indexOf('fbmClient') >= 0],
    ['Mất kết nối tới GAS', true]);
}

async function testChoLuot(so) {
  const { hop } = taoSidebarDongBo();
  const hen = demHen(hop);
  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-10', resolve() {}, reject() {}, timer: null };
  hop.fbmSyncRunWaitArm();
  const daDat = hen.length;
  hop.syncScreenClose();
  hop.fbmSyncStatusReceived({ status: statusGas(stateDangChay({ runId: 'run-10' })) });
  check(so, 'đóng màn đồng bộ: đồng hồ chờ bị hủy, status relay về sau không đặt đồng hồ mới, chỗ chờ vẫn giữ',
    [hen[daDat - 1].cleared, hen.length === daDat, hop.FBM_SYNC_CLIENT.runWaiter && hop.FBM_SYNC_CLIENT.runWaiter.runId],
    [true, true, 'run-10']);

  let ketNoi = null;
  hop.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-20', resolve(value) { ketNoi = value; }, reject() {}, timer: null };
  hop.fbmSyncStatusReceived({ status: statusGas(stateDangChay({ runId: 'run-99' })), done: true });
  hop.fbmSyncStatusReceived({ status: statusGas(stateDangChay({ runId: 'run-21', follows: 'run-20' })) });
  const sauNoi = [hop.FBM_SYNC_CLIENT.runWaiter && hop.FBM_SYNC_CLIENT.runWaiter.runId, ketNoi];
  hop.fbmSyncStatusReceived({ status: statusGas({ phase: 'done', runId: 'run-21' }), done: true });
  check(so, 'GAS mở lượt nối tiếp (follows là mã lượt đang chờ) thì chỗ chờ chuyển sang lượt mới và kết thúc khi lượt mới xong; status lượt khác không nối thì bỏ qua',
    [sauNoi, ketNoi && ketNoi.status.runId, hop.FBM_SYNC_CLIENT.runWaiter], [['run-21', null], 'run-21', null]);
}

async function testLuotKep(so) {
  // GAS báo lượt kẹt qua status: Sidebar thôi chờ ngay với mã và chữ của GAS (`warnings`), không gửi lệnh Dừng, không đặt đồng hồ mới.
  const { hop } = taoSidebarDongBo();
  const hen = demHen(hop), calls = [];
  const kep = statusGas(stateDangChay({ runId: 'run-11', activeRequestId: '', deadlineAt: 0, updatedAt: 1 }));
  hop.callServer = (name) => { calls.push(name); return Promise.resolve(name === 'fbmGetSyncStatus' ? { status: kep } : {}); };
  hop.FBM_SYNC_CLIENT.active = true;
  let ketQua = null;
  hop.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-11', resolve(value) { ketQua = value; }, reject() {}, timer: null };
  hop.fbmSyncRunWaitArm();
  const daDat = hen.length;
  hen[daDat - 1].fn();
  await luot();
  check(so, 'status báo lượt kẹt: chỗ chờ kết thúc với mã và chữ của GAS, không gửi lệnh Dừng, không đặt đồng hồ mới',
    [kep.stuck, ketQua && ketQua.ok, ketQua && ketQua.code, ketQua && ketQua.error === kep.warnings[0].text, calls.indexOf('fbmCancelSync'), hop.FBM_SYNC_CLIENT.runWaiter, hen.length === daDat],
    [true, false, 'SYNC_STALE_RUN', true, -1, null, true]);

  // Lượt còn sống thì chờ tiếp bằng đồng hồ mới; lượt đã đóng thì kết thúc theo status GAS.
  const song = taoSidebarDongBo().hop, henSong = demHen(song);
  song.callServer = () => Promise.resolve({ status: statusGas(stateDangChay({ runId: 'run-12' })) });
  song.FBM_SYNC_CLIENT.active = true;
  song.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-12', resolve() { throw new Error('không được kết thúc'); }, reject() {}, timer: null };
  song.fbmSyncRunWaitArm();
  henSong[0].fn();
  await luot();
  check(so, 'lượt vẫn chạy khi hỏi GAS: chỗ chờ giữ và đặt thêm đồng hồ',
    [henSong.length, !!song.FBM_SYNC_CLIENT.runWaiter],
    [2, true]);
  const dong = taoSidebarDongBo().hop, henDong = demHen(dong);
  let dongKet = null;
  dong.callServer = () => Promise.resolve({ status: statusGas({ phase: 'error', runId: 'run-13', lastFailureCode: 'FBM_VERIFY_FAILED', lastError: 'không xác nhận' }) });
  dong.FBM_SYNC_CLIENT.active = true;
  dong.FBM_SYNC_CLIENT.runWaiter = { runId: 'run-13', resolve(value) { dongKet = value; }, reject() {}, timer: null };
  dong.fbmSyncRunWaitArm();
  henDong[0].fn();
  await luot();
  check(so, 'lượt đã đóng lỗi khi hỏi GAS: chỗ chờ kết thúc với mã và chữ lỗi của GAS',
    [dongKet && dongKet.ok, dongKet && dongKet.code, dongKet && dongKet.error, dong.FBM_SYNC_CLIENT.runWaiter],
    [false, 'FBM_VERIFY_FAILED', 'không xác nhận', null]);
}

async function chay(so) {
  section('FBM sync — Sidebar: lượt nền, nút X, chỗ chờ lượt tay');
  try { taoSidebarDongBo(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testPopupNen(so);
  await testNutXMoiThaoTac(so);
  await testDocTrangThai(so);
  await testChoLuot(so);
  await testLuotKep(so);
}

module.exports = { chay };
