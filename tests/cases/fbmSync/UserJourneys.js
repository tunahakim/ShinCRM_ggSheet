/** Hành trình người dùng trên màn Chạy và Tài khoản của Sidebar Đồng bộ FBM: thao tác qua listener thật, kiểm lệnh gửi GAS và thứ người dùng thấy. */
const { section, check } = require('../../lib/assert');
const { statusGas, stateDangChay } = require('../../lib/fbm/status-gas');
const { taoHanhTrinh, bamNut, doiChon, choVong, statusNghi } = require('../../lib/sidebar/hanh-trinh');

async function chay(so) {
  section('FBM sync — hành trình người dùng: màn Chạy, menu, công tắc tổng, Tài khoản');
  const { hop, dom, content, calls } = taoHanhTrinh();
  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  hop.fbmSyncPaint(statusNghi());
  const runNode = content.children[0];
  hop.fbmSyncPaint(statusGas(stateDangChay({ runId: 'run-snapshot', counts: { completed: 3, succeeded: 2 } })));
  check(so, 'snapshot GAS vá Chạy đồng bộ tại chỗ, không thay node màn hình',
    [content.children[0] === runNode, content.textContent.indexOf('Pipeline đang chạy') >= 0],
    [true, true]);

  ['run', 'account', 'results', 'settings'].forEach((screen) => {
    const button = dom.document.createElement('button');
    button.setAttribute('data-sync-screen', screen);
    bamNut(dom, button);
    check(so, 'menu mo dung man hinh ' + screen,
      [hop.FBM_SYNC_CLIENT.subscreen, content.getAttribute('data-fbm-sync-screen')],
      [screen, screen]);
  });
  const menu = dom.document.getElementById('fbm-sync-module-menu');
  bamNut(dom, menu);
  const nav = dom.document.getElementById('fbm-sync-nav');
  const menuOpened = nav.hidden === false;
  bamNut(dom, menu);
  const menuClosed = nav.hidden === true;
  bamNut(dom, dom.document.getElementById('fbm-sync-back'));
  check(so, 'header mo dong menu va nut quay lai dong man dong bo',
    [menuOpened, menuClosed, hop.FBM_SYNC_CLIENT.active, dom.document.getElementById('sidebar-root').classList.contains('shin-sync-active')],
    [true, true, false, false]);
  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.statusReady = true;

  const master = dom.document.createElement('button');
  master.id = 'fbm-sync-master-switch';
  const callsBeforeMaster = calls.length;
  bamNut(dom, master);
  await choVong();
  check(so, 'cong tac tong gui dung mot lenh GAS va cap nhat trang thai',
    [calls.filter((item) => item.name === 'set_master').length, hop.FBM_SYNC_CLIENT.lastStatus.enabled],
    [1, false]);
  check(so, 'Công tắc tổng vẽ trạng thái từ kết quả lệnh, không hỏi lại lệnh status',
    calls.slice(callsBeforeMaster).map((item) => item.name),
    ['set_master']);

  hop.FBM_SYNC_CLIENT.lastStatus = statusNghi();
  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  const selectedModes = [];
  hop.fbmSyncRun = (mode) => { selectedModes.push(mode); return Promise.resolve({ ok: true }); };
  ['check', 'read', 'push', 'write'].forEach((mode) => {
    hop.fbmSyncPaint(statusNghi());
    const select = dom.document.getElementById('fbm-sync-mode');
    select.value = mode;
    doiChon(dom, select);
    bamNut(dom, dom.document.getElementById('fbm-sync-start'));
  });
  check(so, 'nguoi dung chon bon loai dong bo thi Sidebar gui dung mode da chon',
    selectedModes,
    ['check', 'read', 'push', 'write']);

  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  const awaiting = statusGas({ phase: 'paused' }, { gate: { status: 'pending', count: 12, fingerprint: 'abcd1234-12' } });
  const approved = [];
  hop.fbmSyncApprovePush = (fingerprint) => { approved.push(fingerprint); return Promise.resolve({ ok: true }); };
  hop.fbmSyncPaint(awaiting);
  bamNut(dom, dom.document.getElementById('fbm-sync-approve'));
  const active = statusGas(stateDangChay({ runId: 'run-1' }));
  let cancelled = 0;
  hop.fbmSyncCancel = () => { cancelled += 1; return Promise.resolve({ ok: true }); };
  hop.fbmSyncPaint(active);
  bamNut(dom, dom.document.getElementById('fbm-sync-cancel'));
  check(so, 'Màn Chạy có nút Chấp thuận khi GAS báo tập chờ duyệt (gửi đúng dấu tập) và nút Dừng khi lượt tay đang chạy',
    [approved, cancelled],
    [['abcd1234-12'], 1]);

  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  hop.FBM_SYNC_CLIENT.lastStatus = statusNghi();
  hop.fbmSyncPaint(statusNghi());
  const accountPassword = dom.document.getElementById('fbm-login-password');
  accountPassword.value = 'mat-khau-khong-duoc-mat';
  const accountRoot = content.children[0];
  hop.fbmSyncPaint(Object.assign(statusNghi(), { message: 'Snapshot Tài khoản mới' }));
  check(so, 'snapshot GAS vá Tài khoản mà giữ nguyên form và mật khẩu bản nháp',
    [content.children[0] === accountRoot, dom.document.getElementById('fbm-login-password') === accountPassword, accountPassword.value],
    [true, true, 'mat-khau-khong-duoc-mat']);
  bamNut(dom, dom.document.getElementById('fbm-sync-open-login-policy'));
  check(so, 'nút Cài đặt đăng nhập tự động mở đúng màn hình Cài đặt phiên',
    [hop.FBM_SYNC_CLIENT.subscreen, content.getAttribute('data-fbm-sync-screen'), !!dom.document.getElementById('fbm-sync-login-policy-card-region')],
    ['settings', 'settings', true]);
  const accountScreenButton = dom.document.createElement('button'); accountScreenButton.setAttribute('data-sync-screen', 'account'); bamNut(dom, accountScreenButton);
  const accountActions = [];
  hop.fbmSyncAutoFill = () => { accountActions.push('autofill'); return Promise.resolve(null); };
  hop.fbmSyncCheckIdentity = () => { accountActions.push('check'); return Promise.resolve(null); };
  hop.fbmSyncSaveConnection = () => { accountActions.push('save-connection'); return Promise.resolve(null); };
  hop.fbmSyncTestLogin = () => { accountActions.push('test-login'); return Promise.resolve(null); };
  bamNut(dom, dom.document.getElementById('fbm-sync-config-connection-edit'));
  hop.fbmSyncConfigFinishEdit('connection');
  bamNut(dom, dom.document.getElementById('fbm-sync-config-connection-edit'));
  ['fbm-sync-probe-identity', 'fbm-sync-check-identity', 'fbm-sync-login-test', 'fbm-sync-config-connection-save'].forEach((id) => bamNut(dom, dom.document.getElementById(id)));
  check(so, 'tai khoan FBM gui dung tung thao tac sau khi ket thuc surface connection truoc',
    accountActions,
    ['autofill', 'check', 'test-login', 'save-connection']);
  check(so, 'tai khoan FBM khong nhan doi cong tac tu dang nhap, chinh sach chi nam o Cai dat phien',
    content.querySelector('#fbm-sync-auto-login'),
    null);
  hop.fbmSyncConfigFinishEdit('connection');

}

module.exports = { chay };
