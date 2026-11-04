/**
 * Kiểm phần máy chạy nền phía Sidebar: khối máy nền ở Cài đặt phiên (tên máy, lần hỏi cuối, lời báo GAS, máy chưa có Extension), lệnh giao/gỡ máy và đánh thức Extension với lý do `config`, lời báo trên màn Chạy và thông báo chung, nhịp hỏi GAS khi máy này không chở lượt đang chạy.
 */
const { section, check } = require('../../lib/assert');
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');
const { goiCaiDat } = require('../../lib/sidebar/fbm-cai-dat');

const nghi = () => new Promise((resolve) => setTimeout(resolve, 0));
const MAY_NEN = { assigned: true, machineId: 'may-A-123456', name: 'Máy Windows · 123456', assignedAt: 1000, lastAskAt: 0, silent: false, notice: null };

/** Sidebar thật với Extension và GAS giả: `rpc` ghi lệnh gửi Extension, `calls` ghi lời gọi GAS, `notices` ghi thông báo chung. */
function taoMay(machineReply, gas) {
  const { hop } = taoSidebarDongBo();
  const rpc = [], calls = [], notices = [], errors = [];
  hop.fbmSyncExtensionRpc = (action, fields) => {
    rpc.push([action, fields]);
    if (action === 'CRM_FBM_MACHINE_ID') { return machineReply instanceof Error ? Promise.reject(machineReply) : Promise.resolve(machineReply); }
    return Promise.resolve({ ok: true, accepted: true });
  };
  hop.callServer = (name, args) => { calls.push([name, args]); return Promise.resolve().then(() => gas(name, args)); };
  hop.noticeSet = (key, value) => { notices.push([key, value]); };
  hop.fbmSyncPaintError = (error) => { errors.push(String(error && error.message || error)); };
  hop.fbmSyncSettingsMachineRepaint = () => false;
  hop.FBM_SYNC_CLIENT.syncSettings = goiCaiDat();
  return { hop, rpc, calls, notices, errors };
}

async function chay(so) {
  section('FBM sync — Sidebar: máy chạy nền và nhịp hỏi GAS khi im');

  const a = taoMay({ machineId: 'may-A-123456' }, () => ({ ok: true }));
  await a.hop.fbmSyncLocalMachineLoad();
  const xem = (machine) => JSON.stringify(a.hop.fbmSyncSettingsMachineBlocks({ backgroundMachine: machine }));
  const nut = (machine, id) => { const found = []; JSON.parse(xem(machine), (key, value) => { if (value && value.id === id) { found.push(value); } return value; }); return found[0]; };
  const schema = a.hop.FBM_SYNC_SETTINGS_SCHEMA.machine;
  check(so, 'Chưa giao máy: hiện "chưa giao", lời báo GAS (mức GAS chọn), nút giao mở, nút gỡ khóa', [
    xem({ assigned: false, machineId: '', notice: { code: 'MACHINE_NOT_ASSIGNED', level: 'warning', text: 'Chưa giao máy nào.' } }).indexOf(schema.none) >= 0,
    xem({ assigned: false, machineId: '', notice: { code: 'MACHINE_NOT_ASSIGNED', level: 'warning', text: 'Chưa giao máy nào.' } }).indexOf('shin-notice-warning') >= 0,
    nut({ assigned: false, machineId: '' }, schema.assignId).disabled, nut({ assigned: false, machineId: '' }, schema.releaseId).disabled
  ], [true, true, false, true]);
  check(so, 'Máy này đang được giao: tên kèm "(máy này)", lần hỏi chưa có thì nói rõ, nút giao khóa vì đã là máy này, nút gỡ mở', [
    xem(MAY_NEN).indexOf(schema.nameLabel + MAY_NEN.name + schema.thisMachine) >= 0, xem(MAY_NEN).indexOf(schema.lastAskNever) >= 0,
    nut(MAY_NEN, schema.assignId).disabled, nut(MAY_NEN, schema.releaseId).disabled
  ], [true, true, true, false]);
  const khac = Object.assign({}, MAY_NEN, { machineId: 'may-B', name: 'Máy Mac · may-B', lastAskAt: Date.UTC(2026, 10, 4, 3, 5) });
  check(so, 'Máy khác đang được giao: không có "(máy này)", có giờ hỏi cuối, nút giao mở để chuyển nền sang máy này', [
    xem(khac).indexOf(schema.thisMachine) >= 0, xem(khac).indexOf(schema.lastAskLabel + a.hop.fieldLogicNow(new Date(khac.lastAskAt))) >= 0, nut(khac, schema.assignId).disabled
  ], [false, true, false]);

  const b = taoMay(Object.assign(new Error('Không tìm thấy Extension để đọc mã máy.'), { code: 'EXTENSION_NOT_FOUND' }), () => ({ ok: true }));
  await b.hop.fbmSyncLocalMachineLoad();
  const khongExt = JSON.stringify(b.hop.fbmSyncSettingsMachineBlocks({ backgroundMachine: { assigned: false, machineId: '' } }));
  await b.hop.fbmSyncExtensionWakeConfig();
  check(so, 'Máy chưa cài Extension: báo lỗi rõ kèm chữ lỗi của cầu nối, nút giao khóa; lưu cài đặt không đánh thức gì và không ghi lỗi', [
    khongExt.indexOf(schema.noExtension + 'Không tìm thấy Extension') >= 0, JSON.parse(khongExt).find((node) => node.elements && node.elements.some((child) => child.id === schema.assignId)).elements.find((child) => child.id === schema.assignId).disabled, b.rpc.map((item) => item[0]), b.errors
  ], [true, true, ['CRM_FBM_MACHINE_ID'], []]);

  const status = { phase: 'idle', backgroundMachine: MAY_NEN };
  const c = taoMay({ machineId: 'may-A-123456' }, (name) => ({ ok: true, status }));
  c.hop.navigator = { userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/130' };
  await c.hop.fbmSyncLocalMachineLoad();
  await c.hop.fbmSyncAssignBackgroundMachine();
  check(so, 'Nút "Dùng máy này chạy nền": gửi GAS mã máy Extension và tên máy dựng từ trình duyệt, báo thành công, đánh thức Extension hỏi GAS với lý do config để bật lại chuông, mở khóa nút', [
    c.calls[0], c.hop.FBM_SYNC_CLIENT.settingsNotices.machine.kind, c.rpc.filter((item) => item[0] === 'CRM_FBM_RUN_NOW').map((item) => item[1]), c.hop.FBM_SYNC_CLIENT.machineBusy
  ], [['fbmAssignBackgroundMachine', [{ machineId: 'may-A-123456', name: 'Máy Windows · 123456' }]], 'success', [{ retryMs: [], trigger: 'config' }], false]);

  const d = taoMay({ machineId: 'may-A-123456' }, () => ({ ok: false, code: 'MACHINE_ID_REQUIRED', message: 'Chưa có mã máy Extension.' }));
  d.hop.navigator = { userAgent: '' };
  await d.hop.fbmSyncLocalMachineLoad();
  await d.hop.fbmSyncAssignBackgroundMachine();
  check(so, 'GAS từ chối giao máy: báo lỗi ở khối máy nền kèm chữ GAS, ghi lỗi qua cửa lỗi Sidebar, không đánh thức Extension', [
    d.hop.FBM_SYNC_CLIENT.settingsNotices.machine.kind, d.hop.FBM_SYNC_CLIENT.settingsNotices.machine.message.indexOf('Chưa có mã máy Extension.') >= 0, d.errors.length, d.rpc.filter((item) => item[0] === 'CRM_FBM_RUN_NOW').length
  ], ['error', true, 1, 0]);

  const e = taoMay({ machineId: 'may-A-123456' }, () => ({ ok: true, status }));
  const hoi = [];
  e.hop.uiDecisionOpen = (options) => { hoi.push(options.title); return Promise.resolve(hoi.length > 1); };
  await e.hop.fbmSyncReleaseBackgroundMachine();
  await e.hop.fbmSyncReleaseBackgroundMachine();
  check(so, 'Nút gỡ máy hỏi xác nhận trước; quay lại thì không gọi GAS, đồng ý thì gọi lệnh gỡ',
    [hoi, e.calls.map((item) => item[0])],
    [[schema.releaseConfirm.title, schema.releaseConfirm.title], ['fbmReleaseBackgroundMachine']]);

  const f = taoMay({ machineId: 'may-A-123456' }, () => ({ ok: true }));
  const im = { assigned: true, machineId: 'may-B', name: 'Máy Mac · may-B', notice: { code: 'MACHINE_SILENT', level: 'warning', text: 'Máy chạy nền Máy Mac không hỏi GAS quá 20 phút.' } };
  const runBlocks = JSON.stringify(f.hop.fbmSyncRunMachineBlocks({ backgroundMachine: im }));
  f.hop.fbmSyncMachineNotice({ backgroundMachine: im });
  f.hop.fbmSyncMachineNotice({ phase: 'running' });
  f.hop.fbmSyncMachineNotice({ backgroundMachine: MAY_NEN });
  check(so, 'Lời báo máy nền của GAS: màn Chạy hiện kèm nút mở thẳng khối máy nền ở Cài đặt; thông báo chung đặt khi có, giữ nguyên khi status không mang khối máy nền, bỏ khi GAS hết báo', [
    runBlocks.indexOf(im.notice.text) >= 0, runBlocks.indexOf('"sync-settings-target":"machine"') >= 0, JSON.stringify(f.hop.fbmSyncRunMachineBlocks({ backgroundMachine: MAY_NEN })),
    f.notices.map((item) => [item[0], item[1] && item[1].line])
  ], [true, true, '[]', [['fbmBackgroundMachine', im.notice.text], ['fbmBackgroundMachine', null]]]);

  const g = taoMay({ machineId: 'may-A-123456' }, (name) => (name === 'fbmGetSyncStatus' ? { status: { phase: 'pull_customer', running: true, origin: 'background', updatedAt: 5 } } : { ok: true }));
  const painted = [];
  g.hop.fbmSyncPaint = (value) => { painted.push(value.phase); g.hop.fbmSyncWatchArm(value); };
  g.hop.fbmSyncWatchArm({ running: true, origin: 'background' });
  const timer = g.hop.timers[g.hop.timers.length - 1];
  timer.fn();
  await nghi(); await nghi();
  const sauHoi = g.hop.timers.length;
  g.hop.fbmSyncWatchArm({ running: false });
  const datKhiXong = g.hop.timers.length;
  g.hop.FBM_SYNC_CLIENT.runWaiter = { runId: 'L1' };
  g.hop.fbmSyncWatchArm({ running: true });
  check(so, 'Máy không chở lượt: lượt đang chạy mà Sidebar không chờ lượt nào thì hỏi GAS sau một nhịp im, vẽ status GAS trả và đặt lại đồng hồ; lượt hết hoặc Sidebar đang chờ lượt tay của mình thì không đặt', [
    timer.ms, g.calls.map((item) => item[0]), painted, sauHoi, datKhiXong, g.hop.timers.length
  ], [g.hop.FBM_SYNC_RUN_SILENCE_MS, ['fbmGetSyncStatus'], ['pull_customer'], 2, 2, 2]);
  g.hop.FBM_SYNC_CLIENT.runWaiter = null;
  g.hop.fbmSyncWatchArm({ running: true });
  g.hop.syncScreenClose();
  check(so, 'Đóng màn đồng bộ thì hủy đồng hồ hỏi GAS', g.hop.timers[g.hop.timers.length - 1].cleared, true);
}

module.exports = { chay };
