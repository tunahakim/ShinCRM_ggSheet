/** Smoke test DOM cho toàn bộ màn hình và nhánh thao tác chính của Sidebar Đồng bộ FBM. */
const { napClient, taoHopCat } = require('../../lib/load-gas');
const { domGia } = require('../../lib/dom-gia');
const { section, check, ghiLoiNap } = require('../../lib/assert');

function taoBoTest() {
  const dom = domGia();
  const screen = dom.document.createElement('div');
  screen.id = 'fbm-sync-screen';
  const content = dom.document.createElement('div');
  content.id = 'fbm-sync-content';
  screen.appendChild(content);
  dom.root.appendChild(screen);

  const hop = taoHopCat({ document: dom.document, window: { top: null, confirm: () => true, addEventListener: () => {} } });
  hop.FBM_SYNC_CLIENT = {
    running: false, mode: 'read', resultPages: {}, resultsTab: 'summary', identityStatus: {},
    identityDraft: { spreadsheetId: '', userId: '', accountName: '' }, loginDraft: { username: '' },
    identityAction: '', identityLastAction: '', loginStatus: null, syncSettings: null, lastStatus: null,
    traceEvents: [], installed: false, waiting: {}, relayWaiters: {}, credentialWaiters: {}
  };
  hop.FBM_SYNC_UI_SCHEMA = {
    screens: [
      { id: 'overview', label: 'Tổng quan' }, { id: 'account', label: 'Tài khoản FBM' },
      { id: 'run', label: 'Chạy đồng bộ' }, { id: 'results', label: 'Kết quả & xử lý' },
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
  hop.fbmSyncAppendBox = (parent, className) => {
    const box = dom.document.createElement('div'); box.className = className || '';
    box.classList = { add: (name) => { box.className = (box.className + ' ' + name).trim(); } };
    return parent.appendChild(box);
  };
  hop.fbmSyncAppendText = (parent, text, className) => {
    const node = dom.document.createElement('span'); node.className = className || ''; node.textContent = String(text || ''); return parent.appendChild(node);
  };
  hop.fbmSyncAppendCard = (parent, title, className) => {
    const card = hop.fbmSyncAppendBox(parent, ('shin-card ' + (className || '')).trim());
    hop.fbmSyncAppendText(card, title, 'shin-card-title');
    hop.fbmSyncAppendBox(card, 'shin-card-body');
    return card;
  };
  hop.fbmSyncAppendButton = (parent, id, label, primary) => {
    const button = dom.document.createElement('button'); button.id = id || ''; button.textContent = label || ''; button.disabled = false;
    if (primary) { button.className = 'shin-primary'; }
    button.classList = { add: (name) => { button.className = (button.className + ' ' + name).trim(); } };
    return parent.appendChild(button);
  };
  hop.fbmSyncAppendInput = (parent, id, type, value, placeholder) => {
    const input = dom.document.createElement('input'); input.id = id || ''; input.type = type || 'text'; input.value = value || ''; input.placeholder = placeholder || ''; return parent.appendChild(input);
  };
  hop.fbmSyncAppendSelect = (parent, id, options, value) => {
    const select = dom.document.createElement('select'); select.id = id || ''; select.value = value;
    (options || []).forEach((item) => { const option = dom.document.createElement('option'); option.value = item.value; option.textContent = item.label; select.appendChild(option); });
    return parent.appendChild(select);
  };
  hop.fbmSyncMakeToggleButton = (id, enabled, label) => {
    const button = dom.document.createElement('button'); button.id = id; button.className = enabled ? 'shin-sync-toggle is-on' : 'shin-sync-toggle is-off'; button.setAttribute('aria-pressed', enabled ? 'true' : 'false'); button.setAttribute('aria-label', label); return button;
  };
  hop.fbmSyncPaintProgress = () => {};
  hop.fbmSyncPaintError = null;
  napClient(hop,
    'client/sync/screens/overview.html', 'client/sync/screens/account.html',
    'client/sync/screens/run.html', 'client/sync/screens/results.html',
    'client/sync/screens/settings.html', 'client/sync/fbmSyncSettingsScreen.html',
    'client/sync/fbmSyncStatusScreen.html', 'client/sync/fbmSyncAuditScreen.html', 'client/sync/fbmSync.html');
  return { hop, dom, screen, content };
}

function render(hop, content, fn, status) {
  content.textContent = '';
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

async function chay(so) {
  section('FBM sync — Sidebar UI smoke');
  let bo;
  try { bo = taoBoTest(); } catch (error) { return ghiLoiNap(so, 'nạp renderer Sidebar Đồng bộ FBM', error); }
  const { hop, dom, content } = bo;

  const idle = { phase: 'idle', label: 'Sẵn sàng', mode: 'read', counts: {}, masterEnabled: true };
  const active = { phase: 'pull_customer', runId: 'r1', cursor: { kind: 'customer_grid' }, label: 'Đang đọc khách hàng', mode: 'read', counts: {} };
  const preflightError = { phase: 'error', runId: 'r2', cursor: {}, lastFailureCode: 'SYNC_PREFLIGHT_FAILED', label: 'Có lỗi', counts: {} };
  const pushError = { phase: 'error', runId: 'r3', cursor: { kind: 'push_wait' }, lastFailureCode: 'FBM_VERIFY_FAILED', label: 'Có lỗi', counts: {} };

  check(so, 'Overview render được trạng thái rỗng', !!render(hop, content, hop.fbmSyncRenderOverview, idle).querySelector('.shin-sync-overview-state'), true);
  check(so, 'Run render không hiện pipeline khi chưa chạy', render(hop, content, hop.fbmSyncRenderRun, idle).querySelector('.shin-sync-pipeline'), null);
  check(so, 'Run render giữ pipeline khi preflight thất bại để người dùng thấy chặng dừng', !!render(hop, content, hop.fbmSyncRenderRun, preflightError).querySelector('.shin-sync-pipeline'), true);
  check(so, 'Run render hiện pipeline khi đang xử lý', !!render(hop, content, hop.fbmSyncRenderRun, active).querySelector('.shin-sync-pipeline'), true);
  check(so, 'Run render giữ pipeline để chẩn đoán lỗi sau request', !!render(hop, content, hop.fbmSyncRenderRun, pushError).querySelector('.shin-sync-pipeline'), true);

  hop.FBM_SYNC_CLIENT.identityStatus = { status: 'REBIND_REQUIRED', binding: { spreadsheetId: 'sheet', userId: 'u', accountName: 'A' } };
  hop.FBM_SYNC_CLIENT.loginStatus = { configured: false, enabled: true };
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  check(so, 'Account render đủ ba ô nhập liên kết và nút thao tác', [dom.document.getElementById('fbm-identity-spreadsheet') !== null, dom.document.getElementById('fbm-identity-user') !== null, dom.document.getElementById('fbm-identity-account') !== null, dom.document.getElementById('fbm-sync-probe-identity') !== null], [true, true, true, true]);
  check(so, 'Account hien ro mat khau trong luc nhap va khong co gia tri luu san', [dom.document.getElementById('fbm-login-password').type, dom.document.getElementById('fbm-login-password').value], ['text', '']);

  hop.FBM_SYNC_CLIENT.identityLastAction = 'probe';
  hop.fbmSyncApplyIdentityProbeDraft({ metadata: { identityProbe: { spreadsheetId: 'sheet-probe', userId: '2037', accountName: 'ANHLT' } } });
  render(hop, content, hop.fbmSyncRenderAccount, idle);
  check(so, 'Identity probe tự điền bản nháp vào đủ ba ô mà chưa tự lưu', [dom.document.getElementById('fbm-identity-spreadsheet').value, dom.document.getElementById('fbm-identity-user').value, dom.document.getElementById('fbm-identity-account').value, hop.FBM_SYNC_CLIENT.identityStatus.status], ['sheet-probe', '2037', 'ANHLT', 'REBIND_REQUIRED']);
  render(hop, content, hop.fbmSyncRenderAccount, { phase: 'error', message: 'Extension không trả lời yêu cầu FBM.', counts: {} });
  check(so, 'Account hiện lỗi cầu nối tường minh', content.textContent.indexOf('Extension không trả lời yêu cầu FBM.') >= 0, true);

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
  hop.fbmSyncPaint(active);
  const runFirstNode = content.children[0];
  const patchedLiveStatus = hop.fbmSyncPatchLiveStatus(content, Object.assign({}, active, { label: 'Đang đối soát', counts: { completed: 4, succeeded: 3 } }), 'run');
  check(so, 'trạng thái đang chạy được cập nhật tại chỗ, không dựng lại màn hình', [patchedLiveStatus, content.children[0] === runFirstNode, content.textContent.indexOf('Đang đối soát') >= 0], [true, true, true]);

  hop.FBM_SYNC_CLIENT.resultsTab = 'summary';
  const conflictStatus = { phase: 'conflict', counts: { conflict: 1 }, metadata: { conflictCount: 1, conflicts: [{ entity: 'customer', id: 'CUS-1', fbmId: 'ALT00010', fields: [{ field: 'phone', left: '0901', right: '0902' }] }] } };
  render(hop, content, hop.fbmSyncRenderResults, conflictStatus);
  check(so, 'Results summary render được tab và nút mở xung đột', [demTheoThuocTinh(content, 'data-sync-results-tab'), dom.document.getElementById('fbm-sync-open-conflicts') !== null], [5, true]);
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

  hop.FBM_SYNC_CLIENT.syncSettings = { accountName: 'A', approvalThreshold: 10 };
  render(hop, content, hop.fbmSyncRenderSettings, idle);
  check(so, 'Settings render được relay và tham số phiên', content.textContent.indexOf('10') >= 0 && content.textContent.indexOf('Kết nối Extension') >= 0, true);

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
  hop.callServer = (name) => name === 'fbmStartLoginTest' ? Promise.resolve({ ok: true, request: null, message: 'Đã kiểm tra.' }) : Promise.resolve({});
  await hop.fbmSyncTestLogin(testButton);
  check(so, 'Đăng nhập thử không xóa mật khẩu chưa lưu', loginPassword.value, 'mat-khau-can-giu');

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

module.exports = { chay };
