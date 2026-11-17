/** Sidebar Đồng bộ FBM chỉ vẽ status GAS dựng: nút màn Chạy theo `actions`, icon header theo `tone`, thanh tiến trình theo `progress`, câu kiểm liên kết theo `identityResult`, câu đăng nhập thử theo `message`; lỗi chưa tới GAS (cầu nối Extension) chỉ báo ở dòng báo và ghi Log, không vẽ status giả. */
const { section, check } = require('../../lib/assert');
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');

const tam = () => new Promise((resolve) => setImmediate(resolve));

/** Sidebar đang ở màn `subscreen`, ghi lại thông báo `noticeSet` và lời gọi GAS. */
function dung(subscreen) {
  const { hop, dom, content } = taoSidebarDongBo();
  const notices = {}, calls = [];
  hop.noticeSet = (key, value) => { notices[key] = value; };
  hop.callServer = (name, args) => { calls.push([name, args]); return Promise.resolve({ ok: true }); };
  hop.FBM_SYNC_CLIENT.subscreen = subscreen;
  hop.FBM_SYNC_CLIENT.statusReady = true;
  return { hop, dom, content, notices, calls };
}

/** Nút chạy của màn Chạy sau khi vẽ `status`: id, chữ, khóa. */
function nutChay(hop, dom, status) {
  hop.fbmSyncPaint(status);
  // Tìm trên cây DOM hiện tại: chỉ mục id của DOM giả không gỡ node đã thay.
  let nut = null;
  (function duyet(node) { (node.children || []).forEach((con) => { if (!nut && /^fbm-sync-(start|cancel)$/.test(con.id || '')) { nut = con; } duyet(con); }); })(dom.root);
  return nut ? [nut.id, nut.textContent, !!nut.disabled] : null;
}

function testIconTheoTone(so) {
  // Icon header theo `tone` GAS dựng: Sidebar không tự suy từ phase hay công tắc.
  const { hop, dom } = taoSidebarDongBo();
  const nut = dom.document.createElement('button');
  nut.id = 'fbm-sync-module-menu';
  nut.className = 'shin-sync-status-running';
  nut.classList = {
    add: (name) => { nut.className = (nut.className + ' ' + name).trim(); },
    remove: (name) => { nut.className = nut.className.split(/\s+/).filter((item) => item && item !== name).join(' '); }
  };
  dom.root.appendChild(nut);
  const chay = () => nut.className.indexOf('shin-sync-status-running') >= 0;
  hop.fbmSyncPaintHeaderState(statusGas(stateDangChay(), { enabled: false }));
  check(so, 'công tắc tổng tắt thì tone off: icon không quay, nhãn không kèm trạng thái',
    [chay(), nut.getAttribute('aria-label')],
    [false, 'Đồng bộ FBM']);
  hop.fbmSyncPaintHeaderState(statusGas(stateDangChay()));
  check(so, 'lượt đang chạy thì tone running: icon quay, nhãn kèm đang chạy',
    [chay(), nut.getAttribute('aria-label')],
    [true, 'Đồng bộ FBM — đang chạy']);
  hop.fbmSyncPaintHeaderState(statusGas({ phase: 'error' }));
  check(so, 'lượt lỗi thì tone error: icon thôi quay và mang màu lỗi, nhãn kèm có lỗi',
    [chay(), nut.className.indexOf('shin-sync-status-error') >= 0, nut.getAttribute('aria-label')],
    [false, true, 'Đồng bộ FBM — có lỗi']);
}

async function chay(so) {
  section('FBM sync — Sidebar vẽ đúng status GAS dựng');
  const { hop, dom } = dung('run');
  const nhan = hop.FBM_SYNC_RUN_SCHEMA.action.labels;
  check(so, 'màn Chạy: nút theo actions.run GAS dựng (rảnh, lượt tay, đã bấm dừng, công tắc tổng tắt)', [
    nutChay(hop, dom, statusGas({ phase: 'idle' })),
    nutChay(hop, dom, statusGas(stateDangChay())),
    nutChay(hop, dom, statusGas(stateDangChay(), { stopFlag: { runId: 'r-1', verdict: 'cancelled' } })),
    nutChay(hop, dom, statusGas({ phase: 'idle' }, { enabled: false }))
  ], [
    ['fbm-sync-start', nhan.start, false], ['fbm-sync-cancel', nhan.cancel, false], ['fbm-sync-cancel', nhan.stopping, true], ['fbm-sync-start', nhan.start, true]
  ]);

  testIconTheoTone(so);

  const thanh = hop.fbmSyncProgressData(statusGas(stateDangChay({ progress: { total: 10, done: 7 } })));
  check(so, 'thanh tiến trình đọc thẳng progress GAS dựng',
    [thanh.active, thanh.determinate, thanh.percent, thanh.label],
    [true, true, 70, 'Tiến trình: 7/10 (70%)']);

  // Kiểm liên kết: câu kết quả là identityResult của GAS, Sidebar chỉ đặt vào thẻ Liên kết.
  const tk = dung('account');
  const theTk = [];
  tk.hop.fbmSyncSetAccountNotice = (area, tone, text) => { theTk.push([area, tone, text]); };
  tk.hop.fbmSyncIdentityActionValues = () => ({ spreadsheetId: 's', userId: 'u', username: 'n', accountName: 'a' });
  tk.hop.fbmSyncRequireBridge = () => Promise.resolve(null);
  tk.hop.fbmSyncLoadIdentityStatus = () => Promise.resolve(null);
  const kiem = statusGas({ phase: 'done', scan: 'identity_check', metadata: { identityCheck: { total: 3, matched: 2, missing: 1 } } });
  tk.hop.fbmSyncDrive = () => Promise.resolve({ ok: true, status: kiem });
  await tk.hop.fbmSyncCheckIdentity();
  check(so, 'kiểm liên kết: thẻ Liên kết hiện đúng tone và câu identityResult GAS dựng',
    theTk[theTk.length - 1],
    ['identity', kiem.identityResult.tone, kiem.identityResult.text]);

  // Đăng nhập thử: câu báo là message GAS ghi khi đóng lượt; thiếu message là lỗi hợp đồng, không thay chữ dự phòng.
  tk.hop.FBM_SYNC_CLIENT.loginStatus = { configured: true, credentialRef: 'cred-1' };
  tk.hop.fbmSyncConfigIsEditing = () => false;
  tk.hop.fbmSyncDrive = () => Promise.resolve({ ok: true, status: Object.assign(statusGas({ phase: 'done', scan: 'login_test' }), { message: 'Câu GAS báo đăng nhập.' }) });
  await tk.hop.fbmSyncTestLogin(null);
  const coCau = theTk[theTk.length - 1];
  tk.hop.fbmSyncDrive = () => Promise.resolve({ ok: true, status: Object.assign(statusGas({ phase: 'done', scan: 'login_test' }), { message: '' }) });
  await tk.hop.fbmSyncTestLogin(null); await tam();
  check(so, 'đăng nhập thử: thẻ hiện message GAS; GAS thiếu message thì báo lỗi hợp đồng và ghi Log, không có câu dự phòng', [
    coCau, theTk[theTk.length - 1][1], /GAS không trả câu báo/.test(tk.notices.fbmClient && tk.notices.fbmClient.line), tk.calls.some((c) => c[0] === 'fbmLogSyncError')
  ], [['login', 'success', 'Câu GAS báo đăng nhập.'], 'error', true, true]);

  // Cầu nối Extension chưa bắt tay: lỗi chưa tới GAS nên không có status mới; status GAS gần nhất giữ nguyên.
  const cn = dung('run');
  const gan = statusGas({ phase: 'idle' });
  cn.hop.FBM_SYNC_CLIENT.lastStatus = gan;
  cn.hop.fbmSyncWaitForBridge = () => Promise.resolve(false);
  cn.hop.sheetLinkExtensionAlive = () => false;
  const ve = [];
  cn.hop.fbmSyncPaint = (status) => { ve.push(status); };
  await cn.hop.fbmSyncRun('read'); await tam();
  check(so, 'Extension chưa bắt tay: không gọi GAS mở lượt, không vẽ status giả, lỗi ở dòng báo và ghi Log', [
    cn.calls.map((c) => c[0]), ve.filter((status) => status !== gan).length, cn.hop.FBM_SYNC_CLIENT.lastStatus === gan, /bắt tay từ Extension/.test(cn.notices.fbmClient && cn.notices.fbmClient.line)
  ], [['fbmLogSyncError'], 0, true, true]);
}

module.exports = { chay };
