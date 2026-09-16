/** Kiểm hợp đồng component: Sync phải dùng lõi UI chung, chỉ giữ lớp đặc thù cho pipeline. */
const { docTep } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');

const SYNC_FILES = [
  'client/sync/fbmSyncUiSchema.html',
  'client/sync/fbmSyncConfigEditor.html',
  'client/sync/fbmSyncShell.html',
  'client/sync/fbmSyncStatusScreen.html',
  'client/sync/fbmSyncSettingsScreen.html',
  'client/sync/fbmSyncAuditScreen.html',
  'client/sync/fbmSync.html',
  'client/sync/screens/account.html',
  'client/sync/screens/run.html',
  'client/sync/screens/results.html',
  'client/sync/screens/settings.html'
];

const LEGACY_GENERIC_CLASSES = [
  'shin-sync-form-field',
  'shin-sync-form-label',
  'shin-sync-form-actions',
  'shin-sync-muted',
  'shin-sync-preview-row',
  'shin-sync-toggle',
  'shin-sync-switch',
  'shin-sync-pass-row',
  'shin-sync-warning',
  'shin-sync-error-message',
  'shin-sync-settings-label'
];

const REMOVED_DUPLICATE_LAYOUT_CLASSES = [
  'shin-sync-section',
  'shin-sync-content-disabled',
  'shin-sync-loading',
  'shin-sync-preview',
  'shin-sync-audit',
  'shin-sync-status-card',
  'shin-sync-issues-card',
  'shin-sync-results-body',
  'shin-sync-run-details',
  'shin-sync-conflict-screen'
];

const REMOVED_SYNC_SHELL_PATTERNS = [
  /id=["']fbm-sync-screen["']/,
  /id=["']fbm-sync-content["']/,
  /id=["']fbm-sync-shell-header-region["']/,
  /id=["']fbm-sync-shell-nav-region["']/,
  /\.shin-sync-screen(?:[ {,.]|$)/,
  /\.shin-sync-screen-content(?:[ {,.]|$)/
];

function chay(so) {
  section('FBM sync — component dùng chung');
  const source = Object.fromEntries(SYNC_FILES.map((file) => [file, docTep(file)]));
  const all = Object.values(source).join('\n');
  const common = docTep('client/ui/uiBuilder.html');
  const engine = docTep('client/ui/renderEngine.html');
  const frame = docTep('client/style/frame.html');
  const styles = docTep('client/style/components.html');
  const sidebar = docTep('client/Sidebar.html');

  check(so, 'FBM dung shell bon vung chung, khong con overlay hoac vung cuon rieng',
    [REMOVED_SYNC_SHELL_PATTERNS.filter((pattern) => pattern.test(all + '\n' + sidebar)).map((pattern) => pattern.source),
      sidebar.indexOf('id="sidebar-header"') >= 0,
      sidebar.indexOf('id="sidebar-info"') >= 0,
      sidebar.indexOf('id="sidebar-body"') >= 0,
      sidebar.indexOf('id="sidebar-footer"') >= 0],
    [[], true, true, true, true]);
  check(so, 'menu FBM neo duoi header nhung gioi han chieu cao theo viewport, khong theo header',
    [source['client/sync/fbmSyncShell.html'].indexOf('top:var(--shin-header-height)') >= 0,
      source['client/sync/fbmSyncShell.html'].indexOf('max-height:min(66.666vh, calc(100vh - var(--shin-header-height) - var(--shin-gap-2)))') >= 0],
    [true, true]);

  check(so, 'core khai đủ Block helper dùng chung cho Sync',
    ['Box', 'Stack', 'Card', 'Row', 'Text', 'Field', 'Button', 'Icon', 'Check', 'StandaloneControl', 'StandaloneField'].every((name) => common.indexOf('function ' + name + '(') >= 0),
    true);
  check(so, 'renderer StandaloneControl dùng lớp input/toggle chung, không có lớp Sync riêng',
    [engine.indexOf("'shin-input'") >= 0, engine.indexOf("'shin-toggle-control'") >= 0, engine.indexOf('shin-sync-') === -1],
    [true, true, true]);
  check(so, 'các lựa chọn cố định dùng menu trigger, không dùng nhầm combo input',
    [engine.indexOf("kind === 'menu'") >= 0,
      source['client/sync/screens/run.html'].indexOf("id: 'fbm-sync-mode', kind: 'menu'") >= 0,
      source['client/sync/screens/settings.html'].indexOf("id: 'fbm-sync-background-direction', kind: 'menu'") >= 0,
      source['client/sync/fbmSyncAuditScreen.html'].indexOf("controlId, kind: 'menu'") >= 0],
    [true, true, true, true]);
  check(so, 'mọi màn Sync dùng field độc lập chung cho control ngoài DATA_SCHEMA',
    [source['client/sync/screens/account.html'].indexOf('StandaloneField(') >= 0,
      source['client/sync/screens/settings.html'].indexOf('StandaloneField(') >= 0,
      source['client/sync/screens/run.html'].indexOf('StandaloneField(') >= 0,
      source['client/sync/fbmSyncSettingsScreen.html'].indexOf('StandaloneField(') >= 0],
    [true, true, true, true]);
  check(so, 'các hàng thao tác dùng Row chung để tự chia đều',
    [source['client/sync/screens/account.html'].indexOf('Row([') >= 0,
      source['client/sync/fbmSyncSettingsScreen.html'].indexOf("className: 'shin-action-stack'") >= 0,
      source['client/sync/fbmSyncAuditScreen.html'].indexOf('Row([') >= 0,
      source['client/sync/screens/results.html'].indexOf('Row({ className: \'shin-pagination\'') >= 0],
    [true, true, true, true]);
  check(so, 'card cấu hình dùng hàng action và style sửa chung, không tự đặt kích thước từng màn',
    [source['client/sync/fbmSyncConfigEditor.html'].indexOf('function fbmSyncConfigButtonRow(') >= 0,
      source['client/sync/screens/account.html'].indexOf('fbmSyncConfigButtonRow(\'login\'') >= 0,
      source['client/sync/fbmSyncSettingsScreen.html'].indexOf('fbmSyncConfigButtonRow(\'identity\'') >= 0,
      styles.slice(styles.indexOf('.shin-card-actions {'), styles.indexOf('.shin-card-actions {') + 220).indexOf('gap: var(--shin-gap-2);') >= 0,
      styles.indexOf('.shin-button.shin-config-edit') >= 0,
      styles.indexOf('.shin-card-head .shin-icon.shin-config-save') >= 0,
      styles.indexOf('.shin-card-head .shin-icon.shin-config-cancel') >= 0],
    [true, true, true, true, true, true, true]);
  check(so, 'Sync không tạo DOM trực tiếp trong renderer component',
    [all.indexOf('document.createElement') === -1, all.indexOf('.innerHTML') === -1, all.indexOf('.appendChild') === -1],
    [true, true, true]);
  check(so, 'Sync không còn bản sao lớp generic của ShinCRM độc lập',
    LEGACY_GENERIC_CLASSES.filter((name) => all.indexOf(name) >= 0),
    []);
  check(so, 'Sync không còn lớp layout/trạng thái trùng với component dùng chung',
    REMOVED_DUPLICATE_LAYOUT_CLASSES.filter((name) => all.indexOf(name) >= 0),
    []);
  check(so, 'lớp generic notice/form/toggle/value/pagination nằm ở components chung',
    ['shin-form-field', 'shin-toggle-row', 'shin-toggle-control', 'shin-notice', 'shin-kv-row', 'shin-pagination', 'shin-section', 'shin-content-disabled', 'shin-loading'].every((name) => styles.indexOf(name) >= 0),
    true);
  check(so, 'Card và Stack dùng spacing dọc theo token, tương thích môi trường không hỗ trợ flex gap',
    [styles.indexOf('.shin-card-body {') >= 0, styles.indexOf('.shin-box.shin-stack,') >= 0,
      styles.indexOf('.shin-card-body > * + * { margin-top: var(--shin-gap-2); }') >= 0,
      styles.indexOf('.shin-stack > * + *') >= 0,
      styles.indexOf('.shin-form-field > * + * { margin-top: var(--shin-gap-1); }') >= 0,
      styles.indexOf('.shin-card-body > * { margin-top: 0; margin-bottom: 0; }') >= 0],
    [true, true, true, true, true, true]);
  check(so, 'Nhóm action dùng Stack lõi và vẫn tương thích class cũ',
    [styles.indexOf('align-items: stretch;') >= 0, styles.indexOf('align-self: stretch;') >= 0, styles.indexOf('width: 100%;') >= 0,
      styles.indexOf('.shin-box.shin-action-stack') >= 0,
      styles.indexOf('.shin-action-stack > * + * { margin-top: var(--shin-gap-2); }') >= 0],
    [true, true, true, true, true]);
  check(so, 'action Stack căn giữa ở đúng độ ưu tiên của component lõi',
    [styles.indexOf('.shin-box.shin-action-stack { align-items: center; }') >= 0,
      !/(^|\n)\.shin-action-stack \{ align-items: center; \}/.test(styles)],
    [true, true]);
  check(so, 'Box rỗng giữ vùng callback nhưng không tạo khoảng cách giả trong Card',
    styles.indexOf('.shin-box:empty { display: none; }') >= 0,
    true);
  check(so, 'reset Card không xóa khoảng giữa các Card trong section',
    [styles.indexOf('.shin-section > * + * { margin-top: var(--shin-gap-2); }') > styles.indexOf('.shin-card {'),
      styles.indexOf('.shin-section > .shin-card { margin: 0; }') >= 0],
    [true, false]);
  check(so, 'các vùng cột chung không phụ thuộc flex gap để tạo khoảng cách',
    [frame.indexOf('#sidebar-body > * + * { margin-top: var(--shin-gap-2); }') >= 0,
      styles.indexOf('.shin-section > * + * { margin-top: var(--shin-gap-2); }') >= 0,
      source['client/sync/fbmSyncShell.html'].indexOf('.shin-sync-nav button + button { margin-top: 2px; }') >= 0],
    [true, true, true]);
  check(so, 'các vùng cuộn giữ trục hai mép bằng gutter ổn định, section không cộng lề lệch',
    [frame.indexOf('.shin-scroll-region {') >= 0 && frame.indexOf('overflow-y: auto;') >= 0 && frame.indexOf('scrollbar-gutter: stable both-edges;') >= 0,
      sidebar.indexOf('id="sidebar-body" class="shin-scroll-region"') >= 0,
      sidebar.indexOf('id="sidebar-body" class="shin-scroll-region"') >= 0,
      frame.indexOf('#sidebar-body {') >= 0 && frame.indexOf('padding: var(--shin-gap-2) 0 var(--shin-gap-4);') >= 0,
      styles.indexOf('.shin-section { display: flex; flex-direction: column; gap: 0; min-width: 0; padding: var(--shin-gap-1) 0 var(--shin-gap-4); }') >= 0],
    [true, true, true, true, true]);
  check(so, 'Sync dùng Notice lõi thay vì tự lặp bảng ánh xạ lớp thông báo',
    [common.indexOf('function Notice(') >= 0, all.indexOf('noticeClasses') >= 0, all.indexOf('noticeClass =') >= 0],
    [true, false, false]);
  check(so, 'frame chung không còn chứa style component Sync legacy',
    ['shin-sync-form-field', 'shin-sync-form-actions', 'shin-sync-muted', 'shin-sync-preview-row', 'shin-sync-login-row'].filter((name) => frame.indexOf(name) >= 0),
    []);
}

module.exports = { chay };
