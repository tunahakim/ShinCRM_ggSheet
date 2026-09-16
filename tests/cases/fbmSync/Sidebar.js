/** Smoke test DOM cho toàn bộ màn hình và nhánh thao tác chính của Sidebar Đồng bộ FBM. */
const { napClient, taoHopCat } = require('../../lib/load-gas');
const { domGia } = require('../../lib/dom-gia');
const { section, check, ghiLoiNap } = require('../../lib/assert');

function taoBoTest() {
  const dom = domGia();
  const header = dom.document.createElement('div'); header.id = 'sidebar-header'; dom.root.appendChild(header);
  const info = dom.document.createElement('div'); info.id = 'sidebar-info'; info.hidden = true; dom.root.appendChild(info);
  const content = dom.document.createElement('div'); content.id = 'sidebar-body'; dom.root.appendChild(content);
  const footer = dom.document.createElement('div'); footer.id = 'sidebar-footer'; footer.hidden = true; dom.root.appendChild(footer);

  const hop = taoHopCat({ document: dom.document, window: { top: null, confirm: () => true, addEventListener: () => {} } });
  hop.FBM_SYNC_CLIENT = {
    active: true, running: false, statusReady: true, mode: 'read', resultPages: {}, resultsTab: 'summary', identityStatus: {},
    subscreen: 'run',
    identityDraft: { spreadsheetId: '', userId: '', accountName: '' }, loginDraft: { username: '' },
    identityAction: '', identityLastAction: '', loginStatus: null, syncSettings: null, lastStatus: null,
    traceEvents: [], installed: false, waiting: {}, relayWaiters: {}, credentialWaiters: {}
  };
  hop.FBM_SYNC_UI_SCHEMA = {
    screens: [
      { id: 'run', label: 'Chạy đồng bộ' }, { id: 'account', label: 'Tài khoản FBM' },
      { id: 'results', label: 'Kết quả & xử lý' },
      { id: 'settings', label: 'Cài đặt phiên' }
    ],
    modes: [
      { value: 'check', label: 'Kiểm tra an toàn' }, { value: 'read', label: 'Lấy từ FBM → ShinCRM' },
      { value: 'push', label: 'Đẩy từ ShinCRM → FBM' }, { value: 'write', label: 'Đồng bộ hai chiều' }
    ]
  };

  // Renderer giả chỉ tạo cây DOM đủ để kiểm tra màn hình, không thay đổi code sản phẩm.
  hop.fbmSyncAppendBox = null;
  hop.renderBlockInto = (parent, node) => {
    const element = dom.document.createElement(node && node.kind === 'text' ? 'span' : 'div');
    if (node && node.className) { element.className = node.className; }
    if (node && node.id) { element.id = node.id; }
    if (node && node.text !== undefined) { element.textContent = node.text; }
    return parent.appendChild(element);
  };
  hop.fbmSyncAppendBox = (parent, className, id) => {
    const box = dom.document.createElement('div'); box.className = className || ''; if (id) { box.id = id; }
    box.classList = { add: (name) => { box.className = (box.className + ' ' + name).trim(); } };
    return parent.appendChild(box);
  };
  hop.fbmSyncPaintError = null;
  napClient(hop,
    'client/ui/icons.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html', 'client/ui/renderEngine.html', 'client/sync/fbmSyncUiSchema.html',
    'client/sync/screens/account.html',
    'client/sync/screens/run.html', 'client/sync/screens/results.html',
    'client/sync/screens/settings.html', 'client/sync/fbmSyncSettingsScreen.html',
    'client/sync/fbmSyncStatusScreen.html', 'client/sync/fbmSyncAuditScreen.html', 'client/sync/fbmSyncShell.html', 'client/sync/fbmSync.html');
  hop.FBM_SYNC_CLIENT.active = true;
  return { hop, dom, screen: dom.root, content };
}

function render(hop, content, fn, status) {
  content.textContent = '';
  hop.RENDER_INDEX = { nodes: {}, menus: {}, ctx: null, dem: 0 };
  fn(content, status || {});
  return content;
}

function demTheoThuocTinh(node, attribute) {
  let count = 0;
  (node.children || []).forEach((child) => {
    if (child.hasAttribute && child.hasAttribute(attribute)) { count += 1; }
    count += demTheoThuocTinh(child, attribute);
  });
  return count;
}

async function testSharedShellLifecycle(so) {
  const { hop, dom, content } = taoBoTest();
  const header = dom.document.getElementById('sidebar-header');
  const info = dom.document.getElementById('sidebar-info');
  const footer = dom.document.getElementById('sidebar-footer');
  const search = dom.document.createElement('div'); search.id = 'shin-search'; search.hidden = false; dom.root.appendChild(search);
  const undo = dom.document.createElement('div'); undo.id = 'shin-undo'; undo.hidden = true; dom.root.appendChild(undo);
  const warning = dom.document.createElement('div'); warning.id = 'shin-extension-warning'; warning.hidden = false; dom.root.appendChild(warning);
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
  hop.callServer = (name) => {
    if (name === 'fbmGetSyncStatus') { return Promise.resolve({ phase: 'idle', masterEnabled: true, counts: {} }); }
    if (name === 'fbmGetIdentityStatus') { return Promise.resolve({ status: 'UNBOUND', binding: {} }); }
    if (name === 'fbmGetSyncSettings') { return Promise.resolve({ settings: {} }); }
    if (name === 'fbmGetLoginConfig') { return Promise.resolve({ configured: false }); }
    return Promise.resolve({ ok: true });
  };

  await hop.syncPanelToggle();
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
    [search.hidden, undo.hidden, warning.hidden], [true, true, true]);

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
    [search.hidden, undo.hidden, warning.hidden], [false, true, false]);

  const restoredBody = content.textContent;
  hop.fbmSyncPaint({ phase: 'pull_customer', counts: { completed: 1 } });
  check(so, 'status den muon sau khi dong khong ve de len man form da phuc hoi', content.textContent, restoredBody);
}

async function chay(so) {
  await testSharedShellLifecycle(so);
  section('FBM sync — Sidebar UI smoke');
  let bo;
  try { bo = taoBoTest(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  const { hop, dom, content } = bo;

  const idle = { phase: 'idle', label: 'Sẵn sàng', mode: 'read', counts: {}, masterEnabled: true };
  const active = { phase: 'pull_customer', runId: 'r1', cursor: { kind: 'customer_grid' }, label: 'Đang đọc khách hàng', mode: 'read', counts: {} };
  const preflightError = { phase: 'error', runId: 'r2', cursor: {}, lastFailureCode: 'SYNC_PREFLIGHT_FAILED', label: 'Có lỗi', counts: {} };
  const pushError = { phase: 'error', runId: 'r3', cursor: { kind: 'push_wait' }, lastFailureCode: 'FBM_VERIFY_FAILED', label: 'Có lỗi', counts: {} };

  const shellHeader = hop.fbmSyncShellHeaderBlocks(idle);
  check(so, 'menu nội bộ bỏ Tổng quan và đặt Chạy đồng bộ lên đầu', [hop.FBM_SYNC_UI_SCHEMA.screens.map((item) => item.id), hop.FBM_SYNC_UI_SCHEMA.screens.some((item) => item.id === 'overview')], [['run', 'account', 'results', 'settings'], false]);
  check(so, 'header Đồng bộ dùng đúng dãy Block như header Sidebar/form', [shellHeader.length, shellHeader[0].role, shellHeader[0].className, shellHeader[3].role, shellHeader[3].className, hop.fbmSyncShellTitle()], [4, 'icon', '', 'icon', '', 'Chạy đồng bộ']);
  check(so, 'header Đồng bộ dùng cùng khung và tiêu đề với header Sidebar/form', [shellHeader[1].className.indexOf('shin-header-title') >= 0], [true]);

  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  hop.FBM_SYNC_CLIENT.statusReady = false;
  hop.fbmSyncRenderInitial();
  check(so, 'mở FBM vẽ ngay khung Chạy đồng bộ trước snapshot GAS', [content.getAttribute('data-fbm-sync-screen'), content.textContent.indexOf('Chọn loại đồng bộ') >= 0, !!hop.RENDER_INDEX.nodes['fbm-sync-run-root']], ['run', true, true]);
  check(so, 'khung ban đầu khóa nút chạy để không dùng trạng thái cũ', [hop.fbmSyncRunActionBlock({}).disabled, hop.fbmSyncRunActionBlock({}).label], [true, 'Đang tải trạng thái...']);
  hop.FBM_SYNC_CLIENT.statusReady = true;
  hop.fbmSyncPaint(Object.assign({}, idle, { label: 'Chạy đồng bộ sau loading' }));
  check(so, 'Chạy đồng bộ dựng lại được sau loading mà không dùng node cũ', [content.getAttribute('data-fbm-sync-screen'), content.textContent.indexOf('Chọn loại đồng bộ') >= 0], ['run', true]);
  check(so, 'Run render không hiện pipeline khi chưa chạy', render(hop, content, hop.fbmSyncRenderRun, idle).querySelector('.shin-sync-pipeline'), null);
  const idleProgress = hop.fbmSyncProgressBlocks(idle, {}).elements[1].elements[0];
  check(so, 'Progress idle rỗng hoàn toàn, không tô fill giả', [hop.fbmSyncProgressData(idle, {}).active, idleProgress.spatialConfig.width, idleProgress.className], [false, '0%', 'shin-sync-progress-fill']);
  const appendRun = hop.fbmSyncAppendBox;
  let runBlocks;
  hop.fbmSyncAppendBox = (_panel, _className, _id, elements) => { runBlocks = elements; return content; };
  hop.fbmSyncRenderRun(content, idle);
  hop.fbmSyncAppendBox = appendRun;
  const runCard = runBlocks[0], runActionRegion = runCard.elements.filter((node) => node && node.id === 'fbm-sync-run-action-region')[0];
  check(so, 'Nút bắt đầu đồng bộ đứng trong hàng action dùng chung để căn giữa', [runActionRegion.elements[0].role, runActionRegion.elements[0].className, runActionRegion.elements[0].elements.length], ['row', 'shin-single-action-row', 1]);
  const runDetailsRegion = runBlocks.filter((node) => node && node.id === 'fbm-sync-run-details-region')[0];
  check(so, 'Pipeline và trạng thái phiên nằm trong Stack để giữ khoảng cách dọc', [runDetailsRegion.role, runDetailsRegion.className], ['box', 'shin-stack']);
  check(so, 'Run render giữ pipeline khi preflight thất bại để người dùng thấy chặng dừng', !!render(hop, content, hop.fbmSyncRenderRun, preflightError).querySelector('.shin-sync-pipeline'), true);
  check(so, 'Run render hiện pipeline khi đang xử lý', !!render(hop, content, hop.fbmSyncRenderRun, active).querySelector('.shin-sync-pipeline'), true);
  check(so, 'Run render giữ pipeline để chẩn đoán lỗi sau request', !!render(hop, content, hop.fbmSyncRenderRun, pushError).querySelector('.shin-sync-pipeline'), true);
  const pausedTransport = { phase: 'paused', runId: 'r4', lastError: 'Cầu nối FBM không phản hồi.', label: 'Tạm dừng', counts: {} };
  const pausedRun = render(hop, content, hop.fbmSyncRenderRun, pausedTransport);
  check(so, 'Run render giữ pipeline và lỗi khi phiên tạm dừng', [!!pausedRun.querySelector('.shin-sync-pipeline'), pausedRun.textContent.indexOf('Pipeline đã tạm dừng') >= 0], [true, true]);

  const statusButton = dom.document.createElement('button');
  statusButton.id = 'fbm-sync-module-menu';
  statusButton.className = 'shin-sync-status-running';
  statusButton.classList = {
    add: (name) => { statusButton.className = (statusButton.className + ' ' + name).trim(); },
    remove: (name) => { statusButton.className = statusButton.className.split(/\s+/).filter((item) => item && item !== name).join(' '); }
  };
  dom.root.appendChild(statusButton);
  hop.fbmSyncPaintHeaderState({ phase: 'checking_session', masterEnabled: false });
  check(so, 'icon Đồng bộ không quay khi công tắc tổng tắt', [statusButton.className.indexOf('shin-sync-status-running') >= 0, statusButton.getAttribute('aria-label')], [false, 'Đồng bộ FBM']);

  hop.FBM_SYNC_CLIENT.identityStatus = { status: 'REBIND_REQUIRED', binding: { spreadsheetId: 'sheet', userId: 'u', accountName: 'A' } };
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: false, enabled: true };
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  check(so, 'Account render đủ ba ô nhập liên kết và nút thao tác', [dom.document.getElementById('fbm-identity-spreadsheet') !== null, dom.document.getElementById('fbm-identity-user') !== null, dom.document.getElementById('fbm-identity-account') !== null, dom.document.getElementById('fbm-sync-probe-identity') !== null], [true, true, true, true]);
  check(so, 'Account dùng ô mật khẩu và không có giá trị lưu sẵn', [dom.document.getElementById('fbm-login-password').type, dom.document.getElementById('fbm-login-password').value], ['password', '']);
  const appendAccount = hop.fbmSyncAppendBox;
  let accountBlocks;
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: true, public: { usernameHint: 'anhlt' } };
  hop.FBM_SYNC_CLIENT.loginEditMode = false;
  hop.fbmSyncAppendBox = (_panel, _className, _id, elements) => { accountBlocks = elements; return content; };
  hop.fbmSyncRenderAccount(content, idle);
  hop.fbmSyncAppendBox = appendAccount;
  const savedLoginCard = accountBlocks[1];
  const savedLoginFields = savedLoginCard.elements.filter((node) => node && node.role === 'box' && node.className === 'shin-form-field');
  check(so, 'Credential đã lưu hiện username, mật khẩu **** và hai ô chỉ xem', [savedLoginCard.titleActions[0].icon, savedLoginFields[0].elements[1].disabled, savedLoginFields[0].elements[1].value, savedLoginFields[1].elements[1].disabled, savedLoginFields[1].elements[1].value], ['pencil', true, 'anhlt', true, '****']);
  hop.FBM_SYNC_CLIENT.loginEditMode = true;
  hop.FBM_SYNC_CLIENT.loginDraft.username = 'anhlt';
  hop.fbmSyncAppendBox = (_panel, _className, _id, elements) => { accountBlocks = elements; return content; };
  hop.fbmSyncRenderAccount(content, idle);
  hop.fbmSyncAppendBox = appendAccount;
  const editLoginCard = accountBlocks[1];
  const editLoginFields = editLoginCard.elements.filter((node) => node && node.role === 'box' && node.className === 'shin-form-field');
  check(so, 'Bấm sửa mở lại username và để trống ô mật khẩu', [editLoginCard.titleActions[0].hidden, editLoginFields[0].elements[1].disabled, editLoginFields[0].elements[1].value, editLoginFields[1].elements[1].disabled, editLoginFields[1].elements[1].value], [true, false, 'anhlt', false, '']);
  hop.FBM_SYNC_CLIENT.loginEditMode = false;
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: false, enabled: true };
  const loginActionRow = hop.fbmSyncLoginActionBlocks()[0];
  check(so, 'Hai nút đăng nhập dùng Row chung để chia đều hai cột', [loginActionRow.role, loginActionRow.elements.length, loginActionRow.elements[0].role, loginActionRow.elements[1].role], ['row', 2, 'button', 'button']);
  hop.FBM_SYNC_CLIENT.syncSettings = { account: { customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-01-01' } };
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  check(so, 'Account hien cau hinh ma khach FBM va moc Activity tren FBM tu GAS', [dom.document.getElementById('fbm-account-customer-prefix').value, dom.document.getElementById('fbm-account-customer-length').value, dom.document.getElementById('fbm-account-activity-since').value, content.textContent.indexOf('Mốc ngày Activity trên FBM') >= 0, content.textContent.indexOf('end_date') >= 0, content.textContent.indexOf('không bị coi là bản ghi mất') >= 0], ['ALT', '8', '2026-01-01', true, true, true]);
  hop.FBM_SYNC_CLIENT.accountSettingsInvalid = { customerPrefix: false, customerCodeLength: true, activitySince: false };
  const invalidAccountFields = hop.fbmSyncAccountSettingsBlocks().filter((node) => node && node.role === 'box' && node.className.indexOf('shin-form-field') >= 0);
  check(so, 'Cau hinh ma khach FBM dung StandaloneField va to do o thieu', [invalidAccountFields.length, invalidAccountFields[0].className, invalidAccountFields[1].className, invalidAccountFields[2].className], [3, 'shin-form-field', 'shin-form-field is-invalid', 'shin-form-field']);
  hop.FBM_SYNC_CLIENT.accountSettingsInvalid = {};
  const identityBlock = hop.fbmSyncIdentityBlock(idle);
  const identityActions = identityBlock.elements.filter((node) => node && node.id === 'fbm-sync-identity-actions-region')[0];
  check(so, 'Ba nút liên kết tài khoản dùng Stack lõi và biến thể action dọc', [identityActions.className, identityActions.elements.length, identityActions.elements[0].role], ['shin-stack shin-action-stack', 3, 'button']);

  hop.FBM_SYNC_CLIENT.identityDraft = { spreadsheetId: 'sheet', userId: '', username: 'anhlt', accountName: '' };
  hop.FBM_SYNC_CLIENT.identityInvalid = { spreadsheet: false, user: true, username: false, account: true };
  const invalidIdentityFields = hop.fbmSyncIdentityFormBlocks();
  hop.FBM_SYNC_CLIENT.accountNotices.identity = { kind: 'error', message: 'Vui lòng bổ sung các ô màu đỏ hoặc xóa cả bốn ô để hủy liên kết.' };
  const invalidIdentityNotice = hop.fbmSyncAccountNoticeBlocks('identity');
  check(so, 'Liên kết thiếu trường chỉ tô đỏ đúng các ô thiếu bằng StandaloneField chuẩn', [invalidIdentityFields[0].className, invalidIdentityFields[1].className, invalidIdentityFields[2].className, invalidIdentityFields[3].className], ['shin-form-field', 'shin-form-field is-invalid', 'shin-form-field', 'shin-form-field is-invalid']);
  check(so, 'Thông báo liên kết thiếu trường ngắn gọn và hướng vào ô màu đỏ', invalidIdentityNotice[0].text, 'Vui lòng bổ sung các ô màu đỏ hoặc xóa cả bốn ô để hủy liên kết.');

  hop.FBM_SYNC_CLIENT.identityLastAction = 'probe';
  hop.fbmSyncApplyIdentityProbeDraft({ metadata: { identityProbe: { spreadsheetId: 'sheet-probe', userId: '2037', username: 'anhlt', accountName: 'ANHLT' } } });
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  check(so, 'Identity probe tự điền bản nháp vào đủ bốn ô mà chưa tự lưu', [dom.document.getElementById('fbm-identity-spreadsheet').value, dom.document.getElementById('fbm-identity-user').value, dom.document.getElementById('fbm-identity-username').value, dom.document.getElementById('fbm-identity-account').value, hop.FBM_SYNC_CLIENT.identityStatus.status], ['sheet-probe', '2037', 'anhlt', 'ANHLT', 'REBIND_REQUIRED']);
  hop.FBM_SYNC_CLIENT.accountNotices.identity = { kind: 'success', message: 'Đã lấy thông tin thành công và điền vào form.' };
  check(so, 'Tự điền thành công chỉ hiện một notice, không lặp dòng kết quả bên dưới', hop.fbmSyncIdentityResultBlocks({ phase: 'done', metadata: { identityProbe: { spreadsheetId: 'sheet-probe' } } }).length, 0);
  hop.FBM_SYNC_CLIENT.identityProbeSignature = '';
  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  dom.document.activeElement = dom.document.getElementById('fbm-identity-user');
  hop.fbmSyncPaint({ phase: 'done', counts: {}, metadata: { identityProbe: { spreadsheetId: 'sheet-focused', userId: '3001', username: 'focused-user', accountName: 'Focused Account' } } });
  check(so, 'Identity probe vẫn hiện kết quả khi ô liên kết còn focus', [dom.document.getElementById('fbm-identity-spreadsheet').value, dom.document.getElementById('fbm-identity-user').value, dom.document.getElementById('fbm-identity-username').value, dom.document.getElementById('fbm-identity-account').value], ['sheet-focused', '3001', 'focused-user', 'Focused Account']);
  hop.FBM_SYNC_CLIENT.accountNotices = { login: { kind: 'error', message: 'Extension không trả lời yêu cầu FBM.' } };
  render(hop, content, hop.fbmSyncRenderAccount, { phase: 'error', message: 'Extension không trả lời yêu cầu FBM.', counts: {} });
  check(so, 'Account hiện lỗi cầu nối trong đúng card đăng nhập', [content.textContent.indexOf('Extension không trả lời yêu cầu FBM.') >= 0, content.textContent.indexOf('Đăng nhập tự động') < content.textContent.indexOf('Extension không trả lời yêu cầu FBM.')], [true, true]);
  hop.FBM_SYNC_CLIENT.accountNotices = {
    identity: { kind: 'success', message: 'Kiểm tra liên kết hoàn tất: 2/2 Customer hợp lệ.' },
    login: { kind: 'success', message: 'Đăng nhập thử thành công và đúng tài khoản FBM đã liên kết.' }
  };
  hop.FBM_SYNC_CLIENT.identityLastAction = 'check';
  render(hop, content, hop.fbmSyncRenderAccount, { phase: 'done', counts: {}, metadata: { identityCheck: { total: 2, matched: 2, missing: 0 } } });
  check(so, 'Account giữ thông báo thành công của đăng nhập thử và kiểm tra liên kết', [content.textContent.indexOf('Đăng nhập thử thành công') >= 0, content.textContent.indexOf('Kiểm tra liên kết hoàn tất: 2/2') >= 0, content.textContent.indexOf('Customer hợp lệ: 2/2') >= 0], [true, true, true]);

  let relayConfigurations = 0;
  hop.fbmSyncConfigureRelay = () => { relayConfigurations += 1; return Promise.resolve(null); };
  await hop.fbmSyncPrepareRelayForSidebarOpen();
  await hop.fbmSyncPrepareRelayForSidebarOpen();
  check(so, 'một vòng đời Sidebar chỉ gửi relay config một lần', relayConfigurations, 1);

  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  const accountPassword = dom.document.getElementById('fbm-login-password');
  accountPassword.value = 'mat-khau-dang-go';
  const clickedLoginTest = dom.document.createElement('button');
  dom.document.activeElement = clickedLoginTest;
  hop.fbmSyncPaint(idle);
  check(so, 'repaint sau khi bấm nút vẫn giữ mật khẩu chưa lưu', dom.document.getElementById('fbm-login-password').value, 'mat-khau-dang-go');

  hop.FBM_SYNC_CLIENT.subscreen = 'run';
  hop.FBM_SYNC_CLIENT.running = false;
  hop.fbmSyncPaint(idle);
  const modeSelect = dom.document.getElementById('fbm-sync-mode');
  modeSelect.focus();
  hop.fbmSyncPaint(Object.assign({}, idle, { label: 'Snapshot nền đến trong lúc chọn loại đồng bộ' }));
  check(so, 'dropdown loai dong bo giu nguyen node va focus khi snapshot nen den, khong can hoan ve ca man', [dom.document.getElementById('fbm-sync-mode') === modeSelect, dom.document.activeElement === modeSelect, hop.FBM_SYNC_CLIENT.deferredPaint, hop.FBM_SYNC_CLIENT.lastStatus.label], [true, true, null, 'Snapshot nền đến trong lúc chọn loại đồng bộ']);
  modeSelect.setAttribute('aria-expanded', 'true');
  check(so, 'popup menu dang mo cung duoc coi la control dang thao tac de tri hoan snapshot', hop.fbmSyncInteractiveControlIsEditing(content), true);
  modeSelect.setAttribute('aria-expanded', 'false');
  modeSelect.blur();
  hop.fbmSyncFlushDeferredPaint();
  check(so, 'snapshot nen khong doi trang thai moi sau khi dropdown dong', [hop.FBM_SYNC_CLIENT.deferredPaint, hop.FBM_SYNC_CLIENT.lastStatus.label], [null, 'Snapshot nền đến trong lúc chọn loại đồng bộ']);
  hop.fbmSyncPaint(active);
  const runFirstNode = content.children[0];
  const patchedLiveStatus = hop.fbmSyncPatchLiveStatus(content, Object.assign({}, active, { label: 'Đang đối soát', counts: { completed: 4, succeeded: 3 } }), 'run');
  check(so, 'trạng thái đang chạy được cập nhật tại chỗ, không dựng lại màn hình', [patchedLiveStatus, content.children[0] === runFirstNode, content.textContent.indexOf('Đang đối soát') >= 0], [true, true, true]);
  const previousFinished = { phase: 'done', mode: 'read', counts: {}, pipeline: { kind: 'read', title: 'Pipeline đã hoàn tất', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM', state: 'done' }, { id: 'category', label: 'Category', state: 'done' }, { id: 'customer', label: 'Đọc Customer', state: 'done' }, { id: 'activity', label: 'Đọc Activity', state: 'done' }, { id: 'reconcile', label: 'Đối soát', state: 'done' }, { id: 'sheet', label: 'Cập nhật Sheet', state: 'done' }] } };
  const nextRunChecking = { phase: 'checking_session', mode: 'read', counts: {}, pipeline: { kind: 'read', title: 'Pipeline đang chạy', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM', state: 'current' }, { id: 'category', label: 'Category', state: 'pending' }, { id: 'customer', label: 'Đọc Customer', state: 'pending' }, { id: 'activity', label: 'Đọc Activity', state: 'pending' }, { id: 'reconcile', label: 'Đối soát', state: 'pending' }, { id: 'sheet', label: 'Cập nhật Sheet', state: 'pending' }] } };
  render(hop, content, hop.fbmSyncRenderRun, previousFinished);
  const previousPipeline = content.querySelector('.shin-sync-pipeline');
  const nextRunPatched = hop.fbmSyncPatchLiveStatus(content, nextRunChecking, 'run');
  const nextMarkers = Array.from(content.querySelectorAll('.shin-sync-pipeline-marker')).map((node) => node.textContent);
  check(so, 'lượt mới vá lại cả pipeline cũ đã hoàn tất, không để trạng thái kiểm tra đi với sáu dấu hoàn tất', [nextRunPatched, content.querySelector('.shin-sync-pipeline') === previousPipeline, content.querySelector('.shin-sync-pipeline-title').textContent, nextMarkers], [true, true, 'Pipeline đang chạy', ['●', '○', '○', '○', '○', '○']]);
  render(hop, content, hop.fbmSyncRenderRun, Object.assign({}, nextRunChecking, { counts: { total: 10, completed: 2 } }));
  const progressPatched = hop.fbmSyncPatchLiveStatus(content, Object.assign({}, nextRunChecking, { counts: { total: 10, completed: 7 } }), 'run');
  check(so, 'vá trạng thái đang chạy cũng cập nhật thanh tiến độ, không giữ số đếm của snapshot cũ', [progressPatched, content.querySelector('.shin-sync-progress-label').textContent, content.querySelector('.shin-sync-progress-track').getAttribute('aria-valuenow'), content.querySelector('.shin-sync-progress-fill').style.width], [true, 'Tiến trình: 7/10 (70%)', '70', '70%']);

  hop.FBM_SYNC_CLIENT.resultsTab = 'summary';
  const conflictStatus = { phase: 'conflict', counts: { conflict: 1 }, metadata: { conflictCount: 1, conflicts: [{ entity: 'customer', id: 'CUS-1', fbmId: 'ALT00010', fields: [{ field: 'phone', left: '0901', right: '0902' }] }] } };
  render(hop, content, hop.fbmSyncRenderResults, conflictStatus);
  const resultTabButtons = Array.from(content.querySelectorAll('.shin-sync-tab-trigger'));
  const resultTabLabels = resultTabButtons.map((node) => node.querySelector('.shin-btn-label').textContent);
  check(so, 'Results summary render năm tab chỉ có tên và mô tả nằm riêng bên dưới', [demTheoThuocTinh(content, 'data-sync-results-tab'), resultTabLabels, content.querySelectorAll('.shin-sync-tab-description').length, content.querySelector('#fbm-sync-results-tab-description-region').textContent, dom.document.getElementById('fbm-sync-open-conflicts') !== null], [5, ['Tổng quan', 'Xung đột', 'Lỗi', 'Log', 'Nghiệm thu'], 1, 'Tóm tắt phiên', true]);
  hop.FBM_SYNC_CLIENT.resultsTab = 'conflict';
  render(hop, content, hop.fbmSyncRenderResults, conflictStatus);
  check(so, 'Màn hình xung đột có hai phía và ô tự nhập', [demTheoThuocTinh(content, 'data-fbm-conflict-choice'), demTheoThuocTinh(content, 'data-fbm-conflict-manual')], [2, 1]);

  const logRows = Array.from({ length: 21 }, (_, index) => ({ stage: 'stage-' + index, operation: 'op-' + index }));
  hop.FBM_SYNC_CLIENT.resultsTab = 'log'; hop.FBM_SYNC_CLIENT.resultPages = { log: 0 };
  render(hop, content, hop.fbmSyncRenderResults, { phase: 'done', metadata: { traceTail: logRows }, counts: {} });
  check(so, 'Results Log có phân trang và giới hạn 20 dòng', [demTheoThuocTinh(content, 'data-sync-page'), content.textContent.indexOf('Trang 1/2') >= 0], [2, true]);
  hop.FBM_SYNC_CLIENT.resultsTab = 'errors';
  render(hop, content, hop.fbmSyncRenderResults, { phase: 'error', metadata: { pushFailureDetails: { 'customer:C1': { reason: 'FBM lỗi' } } }, counts: {} });
  check(so, 'Results Lỗi hiển thị chi tiết bản ghi lỗi', content.textContent.indexOf('customer:C1') >= 0, true);
  hop.FBM_SYNC_CLIENT.resultsTab = 'summary';
  const issueResult = render(hop, content, hop.fbmSyncRenderResults, { phase: 'error', metadata: {
    preflightIssues: [{ blocking: true, code: 'PREFLIGHT_X', message: 'Thiếu liên kết' }],
    categoryBlocks: [{ source: 'Customer', code: 'CAT_MISSING', reason: 'Thiếu mapping' }],
    activityBulkMissing: [{ id: 'ACT-1', fbmId: 'F-1' }],
    pushFailures: { 'customer:C1': true },
    pushFailureDetails: { 'customer:C1': { reason: 'FBM lỗi', code: 'HTTP_ERROR', status: 500 } }
  }, counts: {} });
  check(so, 'Results Tổng hợp hiển thị đầy đủ Category, Activity missing, preflight và HTTP', [issueResult.textContent.indexOf('CAT_MISSING') >= 0, issueResult.textContent.indexOf('ACT-1') >= 0, issueResult.textContent.indexOf('PREFLIGHT_X') >= 0, issueResult.textContent.indexOf('HTTP 500') >= 0], [true, true, true, true]);
  const preflightOnly = render(hop, content, hop.fbmSyncRenderResults, { phase: 'error', metadata: { preflightIssues: [{ blocking: false, code: 'WARN_ONLY', message: 'Cảnh báo' }] }, counts: {} });
  check(so, 'Results không hiện tiêu đề chi tiết bản ghi khi chỉ có cảnh báo preflight', preflightOnly.textContent.indexOf('Chi tiết bản ghi') >= 0, false);

  hop.FBM_SYNC_CLIENT.syncSettings = { accountName: 'A', approvalThreshold: 10 };
  render(hop, content, hop.fbmSyncRenderSettings, idle);
  check(so, 'Settings render được relay và tham số phiên', dom.document.getElementById('fbm-sync-setting-approval-threshold').value === '10' && content.textContent.indexOf('Kết nối Extension') >= 0, true);

  hop.FBM_SYNC_CLIENT.subscreen = 'account';
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: false, enabled: true };
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  dom.document.getElementById('fbm-login-username').value = '';
  dom.document.getElementById('fbm-login-password').value = '';
  const paints = [];
  hop.fbmSyncPaint = (status) => paints.push(status);
  hop.FBM_SYNC_CLIENT.lastStatus = { phase: 'idle', counts: {} };
  hop.callServer = () => Promise.reject(new Error('GAS_TEST_FAILURE'));
  await hop.fbmSyncCancel();
  hop.fbmSyncRetryPushFailures().catch(() => {});
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(so, 'Cancel thất bại vẫn hiện lỗi trên UI', paints.some((item) => String(item.message).indexOf('GAS_TEST_FAILURE') >= 0), true);

  const loginButton = dom.document.createElement('button');
  await hop.fbmSyncSaveLoginConfig(loginButton);
  check(so, 'Lưu đăng nhập thiếu thông tin báo lỗi rõ ràng', paints.some((item) => String(item.message).indexOf('username') >= 0), true);
  const testButton = dom.document.createElement('button');
  await hop.fbmSyncTestLogin(testButton);
  check(so, 'Đăng nhập thử thiếu thông tin báo lỗi rõ ràng', paints.some((item) => String(item.message).indexOf('username') >= 0), true);

  const loginPassword = dom.document.getElementById('fbm-login-password');
  const loginUsername = dom.document.getElementById('fbm-login-username');
  loginUsername.value = 'anhlt'; loginPassword.value = 'mat-khau-can-giu';
  hop.fbmSyncEncryptCredentials = () => Promise.resolve({ credentialRef: 'test-ref' });
  hop.fbmSyncLoginTestLoop = () => Promise.resolve({ ok: true, status: { phase: 'done', message: 'Đã kiểm tra.' } });
  hop.callServer = (name) => name === 'fbmStartLoginTest' ? Promise.resolve({ ok: true, request: {} }) : Promise.resolve({});
  await hop.fbmSyncTestLogin(testButton);
  check(so, 'Đăng nhập thử không xóa mật khẩu chưa lưu và báo kết quả thành công', [loginPassword.value, hop.FBM_SYNC_CLIENT.accountNotices.login.kind, hop.FBM_SYNC_CLIENT.accountNotices.login.message], ['mat-khau-can-giu', 'success', 'Đã kiểm tra.']);

  hop.FBM_SYNC_CLIENT.running = false;
  hop.sheetLinkExtensionAlive = () => true;
  hop.fbmSyncLoop = () => Promise.resolve({ ok: true, status: { phase: 'done', metadata: { identityCheck: { total: 3, matched: 2, missing: 1 } } } });
  hop.callServer = (name) => name === 'fbmStartIdentityCheck' ? Promise.resolve({ ok: true, request: {} }) : Promise.resolve({});
  await hop.fbmSyncCheckIdentity();
  check(so, 'Kiểm tra liên kết báo n/N và số không tìm thấy ngay khi hoàn tất', [hop.FBM_SYNC_CLIENT.accountNotices.identity.kind, hop.FBM_SYNC_CLIENT.accountNotices.identity.message], ['warning', 'Kiểm tra liên kết hoàn tất: 2/3 Customer hợp lệ; không tìm thấy: 1.']);

  const nav = dom.document.createElement('nav'); nav.id = 'fbm-sync-nav'; nav.hidden = false; dom.root.appendChild(nav);
  hop.fbmSyncInstall();
  const outside = { closest: () => null };
  dom.document.listeners.click({ target: outside, preventDefault: () => {} });
  check(so, 'Click ra ngoài đóng menu Đồng bộ', nav.hidden, true);

  const makeTarget = (attribute, id) => ({ id: id || '', disabled: false, hasAttribute: (name) => name === attribute, closest: function () { return this; } });
  const backgroundButton = makeTarget('data-sync-background');
  dom.document.listeners.click({ target: backgroundButton, preventDefault: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(so, 'Lỗi bật tắt đồng bộ nền hiện rõ và không khóa nút', [backgroundButton.disabled, paints.some((item) => String(item.message).indexOf('GAS_TEST_FAILURE') >= 0)], [false, true]);

  hop.fbmSyncRetryPushFailures = () => Promise.reject(new Error('RETRY_FAILURE'));
  const retryButton = makeTarget('data-fbm-push-retry-all');
  dom.document.listeners.click({ target: retryButton, preventDefault: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(so, 'Lỗi mở lại bản ghi hiện rõ và không khóa nút', [retryButton.disabled, paints.some((item) => String(item.message).indexOf('RETRY_FAILURE') >= 0)], [false, true]);

  hop.fbmSyncResolveConflict = () => Promise.reject(new Error('CONFLICT_FAILURE'));
  const conflictButton = makeTarget('data-fbm-conflict-choice');
  conflictButton.getAttribute = (name) => name === 'data-fbm-conflict-choice' ? 'shin' : '';
  dom.document.listeners.click({ target: conflictButton, preventDefault: () => {} });
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(so, 'Lỗi xử lý xung đột hiện rõ và không khóa nút', [conflictButton.disabled, paints.some((item) => String(item.message).indexOf('CONFLICT_FAILURE') >= 0)], [false, true]);
}

module.exports = { chay, taoBoTest };
