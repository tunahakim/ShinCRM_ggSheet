/** Khung Sidebar Đồng bộ FBM: vòng đời mở và đóng màn, header và vùng báo đầu màn (cảnh báo, issue, lệch username). */
const { taoSidebarDongBo: taoBoTest, dongBao } = require('../../lib/sidebar/bo-dong-bo');
const { section, check, ghiLoiNap } = require('../../lib/assert');
const { goiCaiDat } = require('../../lib/sidebar/fbm-cai-dat');
const { statusGas, stateDangChay, hangGas } = require('../../lib/fbm/status-gas');


async function testVongDoiMoDong(so) {
  const { hop, dom, content } = taoBoTest();
  const header = dom.document.getElementById('sidebar-header');
  const info = dom.document.getElementById('sidebar-info');
  const footer = dom.document.getElementById('sidebar-footer');
  const search = dom.document.createElement('div'); search.id = 'shin-search'; search.hidden = false; dom.root.appendChild(search);
  const undo = dom.document.createElement('div'); undo.id = 'shin-undo'; undo.hidden = true; dom.root.appendChild(undo);
  const warning = dom.document.createElement('div'); warning.id = 'shin-notice'; warning.hidden = false; dom.root.appendChild(warning);
  const lifecycleCalls = [];
  hop.ScreenState = { screen: 'activityForm', formStack: [{ screen: 'activityForm' }] };
  hop.screenStateTop = () => hop.ScreenState.formStack[hop.ScreenState.formStack.length - 1] || null;
  hop.screenFormStash = () => { lifecycleCalls.push('stash'); return true; };
  hop.screenFormRender = () => {
    lifecycleCalls.push('form-render');
    header.textContent = 'Man form da phuc hoi';
    content.textContent = 'Noi dung form da phuc hoi';
    info.hidden = false;
    footer.hidden = false;
    return 'form-rendered';
  };
  hop.screenViewRender = () => { lifecycleCalls.push('view-render'); return 'view-rendered'; };
  hop.FBM_SYNC_CLIENT.active = false;
  hop.FBM_SYNC_CLIENT.viewEpoch = 0;
  hop.FBM_SYNC_CLIENT.statusRequestSeq = 0;
  hop.FBM_SYNC_CLIENT.lastServerUpdatedAt = 0;
  const openCalls = [];
  hop.callServer = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));
  hop.fbmSyncCommand = (name) => {
    openCalls.push(name);
    if (name === 'status') { return Promise.resolve({ ok: true, status: statusGas({ phase: 'idle' }), identity: { status: 'UNBOUND', binding: { userId: 'u-1' } }, settings: goiCaiDat({ fbm_run: { approvalThreshold: 7 } }), login: { configured: false } }); }
    return Promise.resolve({ ok: true });
  };

  await hop.syncPanelToggle();
  check(so, 'Mở màn Đồng bộ FBM chỉ gọi GAS một lần và nạp đủ bốn phần của gói',
    [openCalls, hop.FBM_SYNC_CLIENT.statusReady, hop.FBM_SYNC_CLIENT.identityDraft.userId, hop.FBM_SYNC_CLIENT.syncSettings.fbm_run.approvalThreshold, hop.FBM_SYNC_CLIENT.loginStatus.configured, hop.FBM_SYNC_CLIENT.loginPasswordMode],
    [['status'], true, 'u-1', 7, false, 'draft']);
  check(so, 'mo FBM dung chung header body va an info footer cua man truoc',
    [hop.FBM_SYNC_CLIENT.active,
      dom.document.getElementById('sidebar-root').classList.contains('shin-sync-active'),
      !!dom.document.getElementById('fbm-sync-module-title'),
      info.hidden,
      footer.hidden,
      content.getAttribute('data-fbm-sync-screen'),
      lifecycleCalls],
    [true, true, true, true, true, 'run', ['stash']]);
  check(so, 'mo FBM cat cac dai ngoai shell de khong chong len man dong bo',
    [search.hidden, undo.hidden, warning.hidden],
    [true, true, true]);

  const closeResult = hop.syncScreenClose();
  check(so, 'dong FBM phuc hoi dung form va footer, khong con class man dong bo',
    [closeResult,
      hop.FBM_SYNC_CLIENT.active,
      dom.document.getElementById('sidebar-root').classList.contains('shin-sync-active'),
      header.textContent,
      content.textContent,
      info.hidden,
      footer.hidden,
      lifecycleCalls],
    ['form-rendered', false, false, 'Man form da phuc hoi', 'Noi dung form da phuc hoi', false, false, ['stash', 'form-render']]);
  check(so, 'dong FBM phuc hoi trang thai an hien ban dau cua cac dai ngoai shell',
    [search.hidden, undo.hidden, warning.hidden],
    [false, true, false]);

  const restoredBody = content.textContent;
  hop.fbmSyncPaint(statusGas(stateDangChay()));
  check(so, 'status den muon sau khi dong khong ve de len man form da phuc hoi', content.textContent, restoredBody);

  hop.FBM_SYNC_CLIENT.active = true;
  hop.FBM_SYNC_CLIENT.lastStatus = statusGas({ phase: 'idle' });
  let remountStatus = null;
  hop.fbmSyncPaint = (status) => { remountStatus = status; };
  await hop.syncPanelToggle();
  check(so, 'cờ active lệch với DOM vẫn cho phép icon Đồng bộ tự gắn lại shell',
    remountStatus,
    hop.FBM_SYNC_CLIENT.lastStatus);
}

async function testMoManLoi(so) {
  // Gói mở màn hỏng: lỗi hiện ở dòng báo của màn đồng bộ một lần và ghi Log, không nuốt.
  const { hop } = taoBoTest();
  const calls = [];
  hop.callServer = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));
  hop.fbmSyncCommand = (name, payload) => {
    calls.push([name, name === 'client_error' ? [payload.message, payload.action] : null]);
    return name === 'status' ? Promise.reject(new Error('GAS hỏng')) : Promise.resolve({ ok: true });
  };
  hop.FBM_SYNC_CLIENT.active = false;
  const kq = await hop.syncPanelToggle();
  check(so, 'Gói mở màn lỗi thì báo một lần ở dòng báo và ghi Log một lần, không nuốt lỗi',
    [kq, dongBao(hop), calls.filter((c) => c[0] === 'client_error').map((c) => c[1])], [null, ['fbmClient:GAS hỏng'], [['GAS hỏng', 'sidebar_open']]]);

  // Lượt tay mở rồi mà Sidebar đóng trước khi đánh thức Extension: mở lại màn thấy lượt còn chờ nhận thì đánh thức lại.
  const wake = taoBoTest(), wakes = [];
  wake.hop.fbmSyncExtensionRpc = (action, fields) => { wakes.push([action, fields]); return Promise.resolve({ ok: true, accepted: true }); };
  const dangCho = statusGas(stateDangChay({ activeRequestId: hangGas().PICKUP_PREFIX + 'r-1' }));
  wake.hop.callServer = () => Promise.reject(new Error('Sidebar gọi thẳng callServer, phải đi qua fbmSyncCommand'));
  wake.hop.fbmSyncCommand = (name) => Promise.resolve(name === 'status' ? { ok: true, status: dangCho, identity: { status: 'UNBOUND', binding: { userId: 'u-1' } }, settings: {}, login: { configured: false } } : { ok: true });
  wake.hop.FBM_SYNC_CLIENT.active = false;
  await wake.hop.syncPanelToggle();
  check(so, 'Mở màn thấy lượt tay còn chờ Extension nhận thì đánh thức Extension hỏi GAS',
    [dangCho.awaitingPickup, wakes],
    [true, [['CRM_FBM_RUN_NOW', { retryMs: [], trigger: 'run_now' }]]]);
}

async function testHeaderVaMenu(so) {
  const { hop, content } = taoBoTest();
  const nghi = statusGas({ phase: 'idle' });
  const shellHeader = hop.fbmSyncShellHeaderBlocks(nghi);
  check(so, 'menu nội bộ bỏ Tổng quan và đặt Chạy đồng bộ lên đầu',
    [hop.FBM_SYNC_UI_SCHEMA.screens.map((item) => item.id), hop.FBM_SYNC_UI_SCHEMA.screens.some((item) => item.id === 'overview')],
    [['run', 'account', 'results', 'settings'], false]);
  check(so, 'header Đồng bộ dùng hai HeaderGroup chung với header Sidebar/form',
    [shellHeader.length, shellHeader[0].className, shellHeader[0].elements.map((node) => node.role + ':' + (node.id || '')).join('|'), shellHeader[1].className, shellHeader[1].elements.map((node) => node.role + ':' + (node.id || '')).join('|'), shellHeader[1].elements[0].disabled, hop.fbmSyncShellTitle()],
    [2, 'shin-header-group shin-header-group-start', 'icon:fbm-sync-back|text:fbm-sync-module-title', 'shin-header-group shin-header-group-end', 'standaloneControl:fbm-sync-master-switch|icon:fbm-sync-module-menu', false, 'Chạy đồng bộ']);
  check(so, 'header Đồng bộ dùng cùng khung và tiêu đề với header Sidebar/form',
    [shellHeader[0].elements[1].className.indexOf('shin-header-title') >= 0],
    [true]);

  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  hop.FBM_SYNC_CLIENT.statusReady = false;
  hop.fbmSyncRenderInitial();
  check(so, 'mở FBM vẽ ngay khung Chạy đồng bộ trước snapshot GAS',
    [content.getAttribute('data-fbm-sync-screen'), content.textContent.indexOf('Chọn loại đồng bộ') >= 0, !!hop.RENDER_INDEX.nodes['fbm-sync-run-root']],
    ['run', true, true]);
  check(so, 'khung ban đầu khóa nút chạy để không dùng trạng thái cũ',
    [hop.fbmSyncRunActionBlock({}).disabled, hop.fbmSyncRunActionBlock({}).label],
    [true, 'Đang tải trạng thái...']);
  hop.fbmSyncPaint(nghi);
  check(so, 'Chạy đồng bộ dựng lại được sau loading mà không dùng node cũ',
    [content.getAttribute('data-fbm-sync-screen'), content.textContent.indexOf('Chọn loại đồng bộ') >= 0],
    ['run', true]);
}

function testVungBaoDauMan(so) {
  const { hop, dom, content } = taoBoTest();
  const info = dom.document.getElementById('sidebar-info');
  hop.FBM_SYNC_CLIENT.active = true;
  const lech = { login: { configured: true, public: { usernameHint: 'other-user' } }, binding: { username: 'anhlt' } };
  const mau = statusGas({ phase: 'idle' }, lech);
  hop.fbmSyncRenderShell(mau);
  check(so, 'GAS báo username lệch thì vùng báo đầu màn hiện câu lệch',
    [mau.usernameMismatch, info.hidden, info.textContent.indexOf(hop.FBM_SYNC_ACCOUNT_SCHEMA.connection.usernameMismatchBanner) >= 0],
    [true, false, true]);
  ['run', 'account', 'results', 'settings'].forEach((man) => {
    hop.FBM_SYNC_CLIENT.subscreen = man;
    hop.fbmSyncRenderShell(mau);
    check(so, 'cảnh báo username lệch giữ nguyên khi chuyển màn ' + man, info.hidden, false);
  });
  hop.fbmSyncRenderShell(statusGas({ phase: 'idle' }, Object.assign({}, lech, { login: { configured: true, public: { usernameHint: 'an***' } } })));
  check(so, 'username đã che thì GAS không báo lệch và vùng báo ẩn', info.hidden, true);
  hop.fbmSyncRenderShell(statusGas({ phase: 'idle' }, Object.assign({}, lech, { enabled: false })));
  check(so, 'module tắt thì không hiện cảnh báo username lệch', info.hidden, true);

  const chet = statusGas(stateDangChay({ activeRequestId: '', deadlineAt: 0, updatedAt: 1 }));
  hop.fbmSyncRenderShell(chet);
  check(so, 'lượt chết: vùng báo hiện đúng chữ cảnh báo của GAS, không chữ nào do Sidebar soạn',
    [chet.warnings.length, info.textContent.indexOf(chet.warnings[0].text) >= 0],
    [1, true]);
  const chan = statusGas({ phase: 'done', metadata: { identityBlocks: [{ fbmCustomerCode: 'ALT00010', reason: 'trùng mã' }] } });
  hop.fbmSyncRenderShell(chan);
  check(so, 'khách bị chặn khi kéo về hiện đúng câu issue GAS dựng',
    [chan.issues.length, info.textContent.indexOf(chan.issues[0].text) >= 0],
    [1, true]);
  hop.fbmSyncRenderShell(statusGas({ phase: 'idle' }));
  check(so, 'không có gì để báo thì vùng báo ẩn', info.hidden, true);
  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  hop.fbmSyncPaint(statusGas({ phase: 'idle' }));
  check(so, 'vẽ lại bằng status sạch thì thân màn vẫn là màn Chạy',
    content.getAttribute('data-fbm-sync-screen'),
    'run');
}

async function chay(so) {
  section('FBM sync — Sidebar: khung và vùng báo đầu màn');
  let bo;
  try { bo = taoBoTest(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  await testVongDoiMoDong(so);
  await testMoManLoi(so);
  await testHeaderVaMenu(so);
  testVungBaoDauMan(so);
}

module.exports = { chay, taoBoTest };
