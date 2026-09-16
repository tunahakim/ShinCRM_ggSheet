/** Kiểm hợp đồng component: Sync phải dùng lõi UI chung, chỉ giữ lớp đặc thù cho pipeline. */
const { docTep } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');

const SYNC_FILES = [
  'client/sync/fbmSyncUiSchema.html',
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

function chay(so) {
  section('FBM sync — component dùng chung');
  const source = Object.fromEntries(SYNC_FILES.map((file) => [file, docTep(file)]));
  const all = Object.values(source).join('\n');
  const common = docTep('client/ui/uiBuilder.html');
  const engine = docTep('client/ui/renderEngine.html');
  const frame = docTep('client/style/frame.html');
  const styles = docTep('client/style/components.html');

  check(so, 'core khai đủ Block helper dùng chung cho Sync',
    ['Box', 'Stack', 'Card', 'Row', 'Text', 'Field', 'Button', 'Icon', 'Check', 'StandaloneControl', 'StandaloneField'].every((name) => common.indexOf('function ' + name + '(') >= 0),
    true);
  check(so, 'renderer StandaloneControl dùng lớp input/toggle chung, không có lớp Sync riêng',
    [engine.indexOf("'shin-input'") >= 0, engine.indexOf("'shin-toggle-control'") >= 0, engine.indexOf('shin-sync-') === -1],
    [true, true, true]);
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
  check(so, 'Card dùng một nhịp gap chung cho các Block con và không cộng margin cho field trực tiếp',
    [styles.indexOf('.shin-card-body {') >= 0, styles.indexOf('flex-direction: column;') >= 0, styles.indexOf('gap: var(--shin-gap-2);') >= 0, styles.indexOf('.shin-card-body > * { margin-top: 0; margin-bottom: 0; }') >= 0],
    [true, true, true, true]);
  check(so, 'Nhóm action chỉ chọn biến thể, không tự sở hữu layout dọc',
    [styles.indexOf('.shin-stack { display: flex; flex-direction: column; gap: var(--shin-gap-2); min-width: 0; }') >= 0,
      styles.indexOf('.shin-action-stack { display: flex;') >= 0],
    [true, false]);
  check(so, 'Sync dùng Notice lõi thay vì tự lặp bảng ánh xạ lớp thông báo',
    [common.indexOf('function Notice(') >= 0, all.indexOf('noticeClasses') >= 0, all.indexOf('noticeClass =') >= 0],
    [true, false, false]);
  check(so, 'frame chung không còn chứa style component Sync legacy',
    ['shin-sync-form-field', 'shin-sync-form-actions', 'shin-sync-muted', 'shin-sync-preview-row', 'shin-sync-login-row'].filter((name) => frame.indexOf(name) >= 0),
    []);
}

module.exports = { chay };
