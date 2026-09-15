/**
 * Hành trình UI dựa trên Tài liệu 09.08: thao tác qua listener thật của
 * Sidebar, sau đó kiểm lệnh công khai gửi sang GAS và trạng thái người dùng thấy.
 */
const { section, check } = require('../../lib/assert');
const { taoBoTest } = require('./Sidebar');

function tick() { return new Promise((resolve) => setTimeout(resolve, 0)); }

function click(dom, target) {
  const listener = dom.document.listeners.click;
  if (!listener) throw new Error('Sidebar chưa đăng ký listener click.');
  listener({ target, preventDefault() {} });
}

function change(dom, target) {
  const listener = dom.document.listeners.change;
  if (!listener) throw new Error('Sidebar chưa đăng ký listener change.');
  listener({ target });
}

function idle() {
  return { phase: 'idle', label: 'Sẵn sàng', mode: 'read', counts: {}, masterEnabled: true, backgroundEnabled: true };
}

async function chay(so) {
  section('FBM sync — hành trình người dùng Sidebar');
  const { hop, dom, content } = taoBoTest();
  const calls = [];
  let masterEnabled = true;
  hop.callServer = (name, args) => {
    calls.push({ name, args: args || [] });
    if (name === 'fbmGetSyncStatus') return Promise.resolve(Object.assign(idle(), { masterEnabled }));
    if (name === 'fbmSetMasterSwitch') { masterEnabled = args && args[0] === true; return Promise.resolve(Object.assign(idle(), { masterEnabled })); }
    return Promise.resolve({ ok: true, settings: {}, status: idle() });
  };
  hop.fbmSyncInstall();
  hop.FBM_SYNC_CLIENT.lastStatus = idle();
  hop.fbmSyncPaint(idle());
  const overviewNode = content.children[0];
  hop.fbmSyncPaint(Object.assign(idle(), { label: 'Snapshot Tổng quan mới', counts: { completed: 3, succeeded: 2 } }));
  check(so, 'snapshot GAS vá Tổng quan tại chỗ, không thay node màn hình', [content.children[0] === overviewNode, content.textContent.indexOf('Snapshot Tổng quan mới') >= 0], [true, true]);

  ['overview', 'account', 'run', 'results', 'settings'].forEach((screen) => {
    const button = dom.document.createElement('button');
    button.setAttribute('data-sync-screen', screen);
    click(dom, button);
    check(so, 'menu mo dung man hinh ' + screen, [hop.FBM_SYNC_CLIENT.subscreen, content.getAttribute('data-fbm-sync-screen')], [screen, screen]);
  });
  const menu = dom.document.getElementById('fbm-sync-module-menu');
  click(dom, menu);
  const nav = dom.document.getElementById('fbm-sync-nav');
  const menuOpened = nav.hidden === false;
  click(dom, menu);
  const menuClosed = nav.hidden === true;
  click(dom, dom.document.getElementById('fbm-sync-back'));
  check(so, 'header mo dong menu va nut quay lai dong man dong bo', [menuOpened, menuClosed, dom.document.getElementById('fbm-sync-screen').hidden], [true, true, true]);
  dom.document.getElementById('fbm-sync-screen').hidden = false;

  const master = dom.document.createElement('button');
  master.id = 'fbm-sync-master-switch';
  click(dom, master);
  await tick();
  check(so, 'cong tac tong gui dung mot lenh GAS va cap nhat trang thai', [calls.filter((item) => item.name === 'fbmSetMasterSwitch').length, hop.FBM_SYNC_CLIENT.lastStatus.masterEnabled], [1, false]);

  hop.FBM_SYNC_CLIENT.lastStatus = idle();
  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  const selectedModes = [];
  hop.fbmSyncRun = (mode) => { selectedModes.push(mode); return Promise.resolve({ ok: true }); };
  ['check', 'read', 'push', 'write'].forEach((mode) => {
    hop.fbmSyncPaint(idle());
    const select = dom.document.getElementById('fbm-sync-mode');
    select.value = mode;
    change(dom, select);
    click(dom, dom.document.getElementById('fbm-sync-start'));
  });
  check(so, 'nguoi dung chon bon loai dong bo thi Sidebar gui dung mode da chon', selectedModes, ['check', 'read', 'push', 'write']);

  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  const awaiting = Object.assign(idle(), { phase: 'awaiting_approval', mode: 'push', runId: 'approval-1' });
  let approved = 0;
  hop.fbmSyncApprovePush = () => { approved += 1; return Promise.resolve({ ok: true }); };
  hop.fbmSyncPaint(awaiting);
  click(dom, dom.document.getElementById('fbm-sync-approve'));
  const active = Object.assign(idle(), { phase: 'pull_customer', mode: 'read', runId: 'run-1', cursor: { kind: 'customer_grid' } });
  let cancelled = 0;
  hop.fbmSyncCancel = () => { cancelled += 1; return Promise.resolve({ ok: true }); };
  hop.fbmSyncPaint(active);
  click(dom, dom.document.getElementById('fbm-sync-cancel'));
  check(so, 'run co nut chap thuan va dung dung theo phase GAS', [approved, cancelled], [1, 1]);

  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  hop.FBM_SYNC_CLIENT.lastStatus = idle();
  hop.fbmSyncPaint(idle());
  const accountPassword = dom.document.getElementById('fbm-login-password');
  accountPassword.value = 'mat-khau-khong-duoc-mat';
  const accountRoot = content.children[0];
  hop.fbmSyncPaint(Object.assign(idle(), { message: 'Snapshot Tài khoản mới' }));
  check(so, 'snapshot GAS vá Tài khoản mà giữ nguyên form và mật khẩu bản nháp', [content.children[0] === accountRoot, dom.document.getElementById('fbm-login-password') === accountPassword, accountPassword.value], [true, true, 'mat-khau-khong-duoc-mat']);
  const accountActions = [];
  hop.fbmSyncAutoFillAndCheck = () => { accountActions.push('autofill'); return Promise.resolve(null); };
  hop.fbmSyncCheckIdentity = () => { accountActions.push('check'); return Promise.resolve(null); };
  hop.fbmSyncSaveIdentityManual = () => { accountActions.push('save-binding'); return Promise.resolve(null); };
  hop.fbmSyncTestLogin = () => { accountActions.push('test-login'); return Promise.resolve(null); };
  hop.fbmSyncSaveLoginConfig = () => { accountActions.push('save-credential'); return Promise.resolve(null); };
  ['fbm-sync-probe-identity', 'fbm-sync-check-identity', 'fbm-sync-save-identity', 'fbm-sync-login-test', 'fbm-sync-login-save'].forEach((id) => click(dom, dom.document.getElementById(id)));
  check(so, 'tai khoan FBM gui dung tung thao tac ma nguoi dung bam', accountActions, ['autofill', 'check', 'save-binding', 'test-login', 'save-credential']);
  check(so, 'tai khoan FBM khong nhan doi cong tac tu dang nhap, chinh sach chi nam o Cai dat phien', content.querySelector('#fbm-sync-auto-login'), null);

  hop.FBM_SYNC_CLIENT.subscreen = 'settings';
  hop.FBM_SYNC_CLIENT.loginStatus = { enabled: true, autoOpenTab: false, retryEnabled: true, retryMinutes: 30 };
  hop.FBM_SYNC_CLIENT.syncSettings = { extension: { pollMinutes: 5, runOnStartup: true }, background: { heartbeat: { enabled: true, minutes: 5 }, customer: { enabled: true, minutes: 60 }, activity: { enabled: true, minutes: 30 } } };
  hop.FBM_SYNC_CLIENT.lastStatus = idle();
  hop.fbmSyncPaint(idle());
  const settingsRoot = content.children[0];
  const pollMinutes = dom.document.getElementById('fbm-extension-poll-minutes');
  pollMinutes.value = '17';
  hop.fbmSyncPaint(Object.assign(idle(), { message: 'Snapshot Cài đặt mới' }));
  check(so, 'snapshot GAS vá Cài đặt mà không ghi đè nhịp Extension người dùng đang sửa', [content.children[0] === settingsRoot, dom.document.getElementById('fbm-extension-poll-minutes') === pollMinutes, pollMinutes.value], [true, true, '17']);
  const settingsActions = [];
  hop.fbmSyncSaveExtensionSettings = () => { settingsActions.push('extension'); return Promise.resolve(null); };
  hop.fbmSyncSaveBackgroundSettings = () => { settingsActions.push('background'); return Promise.resolve(null); };
  hop.fbmSyncSaveLoginPolicy = () => { settingsActions.push('login-policy'); return Promise.resolve(null); };
  hop.fbmSyncRotateRelay = () => { settingsActions.push('rotate-relay'); return Promise.resolve(null); };
  const toggles = ['fbm-sync-run-on-startup', 'fbm-sync-process-heartbeat', 'fbm-sync-process-customer', 'fbm-sync-process-activity', 'fbm-sync-policy-auto-login', 'fbm-sync-policy-auto-open', 'fbm-sync-policy-retry'];
  toggles.forEach((id) => click(dom, dom.document.getElementById(id)));
  ['fbm-sync-save-extension', 'fbm-sync-save-background', 'fbm-sync-save-login-policy', 'fbm-sync-rotate-relay'].forEach((id) => click(dom, dom.document.getElementById(id)));
  check(so, 'cai dat phien doi dung tung cong tac va gui tung lenh luu theo nut bam', [settingsActions, toggles.map((id) => dom.document.getElementById(id).getAttribute('aria-pressed'))], [['extension', 'background', 'login-policy', 'rotate-relay'], ['false', 'false', 'false', 'false', 'false', 'true', 'false']]);
  const background = dom.document.getElementById('fbm-sync-background-switch');
  click(dom, background);
  await tick();
  check(so, 'cai dat phien bat tat lich nen gui lenh GAS doc lap voi phien thu cong', calls.filter((item) => item.name === 'fbmSetBackgroundSwitch').map((item) => item.args[0]), [false]);

  hop.FBM_SYNC_CLIENT.subscreen = 'results';
  hop.FBM_SYNC_CLIENT.resultsTab = 'summary';
  hop.FBM_SYNC_CLIENT.resultPages = {};
  hop.fbmSyncPaint(Object.assign(idle(), { metadata: { traceTail: Array.from({ length: 21 }, (_, index) => ({ stage: String(index) })) } }));
  const resultTabsNode = content.querySelector('.shin-sync-tab-row');
  hop.fbmSyncPaint(Object.assign(idle(), { counts: { completed: 9, succeeded: 8 }, metadata: { traceTail: Array.from({ length: 21 }, (_, index) => ({ stage: String(index) })) } }));
  check(so, 'snapshot GAS vá Kết quả tại chỗ, giữ nguyên hàng tab', [content.querySelector('.shin-sync-tab-row') === resultTabsNode, content.textContent.indexOf('Đã xử lý 9') >= 0], [true, true]);
  const resultTabs = ['summary', 'conflict', 'errors', 'log', 'audit'];
  resultTabs.forEach((tab) => {
    const button = dom.document.createElement('button');
    button.setAttribute('data-sync-results-tab', tab);
    click(dom, button);
    check(so, 'ket qua chuyen dung tab ' + tab, hop.FBM_SYNC_CLIENT.resultsTab, tab);
  });
  const page = dom.document.createElement('button');
  page.setAttribute('data-sync-page', 'log:1');
  click(dom, page);
  check(so, 'ket qua phan trang theo nut bam ma khong doi pipeline', [hop.FBM_SYNC_CLIENT.resultPages.log, hop.FBM_SYNC_CLIENT.subscreen], [1, 'results']);
  let retries = 0;
  let conflictChoice = '';
  hop.fbmSyncRetryPushFailures = () => { retries += 1; return Promise.resolve(null); };
  hop.fbmSyncResolveConflict = (entity, id, choice) => { conflictChoice = entity + ':' + id + ':' + choice; return Promise.resolve(null); };
  const retry = dom.document.createElement('button'); retry.setAttribute('data-fbm-push-retry-all', 'true');
  const conflict = dom.document.createElement('button'); conflict.setAttribute('data-fbm-conflict-choice', 'shin'); conflict.setAttribute('data-fbm-conflict-entity', 'customer'); conflict.setAttribute('data-fbm-conflict-id', 'CUS-1');
  click(dom, retry);
  click(dom, conflict);
  await tick();
  check(so, 'ket qua chuyen dung retry va lua chon conflict cua nguoi dung', [retries, conflictChoice], [1, 'customer:CUS-1:shin']);
}

module.exports = { chay };
