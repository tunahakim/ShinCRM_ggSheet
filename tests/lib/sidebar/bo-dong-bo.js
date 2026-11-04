/**
 * Sidebar Đồng bộ FBM thật nạp trong hộp cát với DOM giả: renderer giả chỉ dựng cây DOM đủ để kiểm màn, đồng hồ giả không tự nổ, dòng thông báo chung nuốt im. Dùng chung cho các tệp ca kiểm Sidebar đồng bộ.
 */
const { napClient, taoHopCat } = require('../load-gas');
const { domGia } = require('../dom-gia');

function taoSidebarDongBo() {
  const dom = domGia();
  const header = dom.document.createElement('div'); header.id = 'sidebar-header'; dom.root.appendChild(header);
  const info = dom.document.createElement('div'); info.id = 'sidebar-info'; info.hidden = true; dom.root.appendChild(info);
  const content = dom.document.createElement('div'); content.id = 'sidebar-body'; dom.root.appendChild(content);
  const footer = dom.document.createElement('div'); footer.id = 'sidebar-footer'; footer.hidden = true; dom.root.appendChild(footer);

  const hop = taoHopCat({ document: dom.document, window: { top: null, innerWidth: 300, innerHeight: 800, confirm: () => true, addEventListener: () => {} } });
  // Hằng của sheetLink.html, bộ test fbmSync không nạp tệp đó.
  hop.SHEET_LINK_ORIGIN = 'https://docs.google.com';
  // Dòng thông báo của notices.html; bộ test không nạp tệp đó, test cần xem thông báo thì tự thay hàm này.
  hop.noticeSet = () => {};
  // Đồng hồ giả không tự nổ: ca cần chạy đồng hồ lấy hàm trong `hop.timers` rồi gọi.
  hop.timers = []; hop.setTimeout = (fn, ms) => hop.timers.push({ fn, ms }); hop.clearTimeout = (id) => { if (hop.timers[id - 1]) { hop.timers[id - 1].cleared = true; } };
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
    'client/ui/icons.html', 'client/ui/fieldInvalid.html', 'client/ui/uiClassMap.html', 'client/ui/uiBuilder.html', 'client/ui/screenBuild.html', 'client/ui/renderEngine.html', 'client/util/valueText.html', 'client/schema/fieldLogic.html',
    'client/schema/sync/screens/run.html', 'client/schema/sync/screens/account.html', 'client/schema/sync/screens/results.html', 'client/schema/sync/screens/settings.html', 'client/schema/sync/screens/index.html',
    'client/schema/sync/results/status.html', 'client/schema/sync/results/issues.html', 'client/schema/sync/results/audit.html', 'client/schema/sync/results/conflict.html',
    'client/sync/fbmSyncUiSchema.html', 'client/sync/fbmSyncConfigEditor.html',
    'client/sync/screens/account.html',
    'client/sync/screens/run.html', 'client/sync/screens/results.html',
    'client/sync/screens/settings.html', 'client/sync/fbmSyncSettingsScreen.html',
    'client/sync/fbmSyncStatusScreen.html', 'client/sync/fbmSyncAuditScreen.html', 'client/sync/fbmSyncShell.html', 'client/sync/fbmSyncMachine.html', 'client/ui/popupList.html', 'client/ui/recordDecision.html', 'client/sync/fbmSync.html');
  hop.FBM_SYNC_CLIENT.active = true;
  return { hop, dom, screen: dom.root, content };
}

module.exports = { taoSidebarDongBo };
