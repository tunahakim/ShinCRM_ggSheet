/** Kiểm hợp đồng owner spacing và cấu trúc wrapper layout dùng chung. */
const { docTep } = require('../lib/load-gas');
const { section, check } = require('../lib/assert');

function rule(css, selector) {
  const start = css.indexOf(selector);
  if (start < 0) { return ''; }
  const open = css.indexOf('{', start);
  const close = css.indexOf('}', open);
  return open >= 0 && close >= 0 ? css.slice(start, close + 1) : '';
}

function chay(so) {
  section('Layout spacing — một owner cho mỗi quan hệ sibling');
  const tokens = docTep('client/style/tokens.html');
  const components = docTep('client/style/components.html');
  const frame = docTep('client/style/frame.html');
  const slots = docTep('client/style/slots.html');
  const runUi = docTep('client/sync/fbmSyncUiSchema.html');
  const shell = docTep('client/sync/fbmSyncShell.html');
  const settings = docTep('client/sync/screens/settings.html');
  const builder = docTep('client/ui/uiBuilder.html');
  const renderer = docTep('client/ui/renderEngine.html');
  const row = rule(components, '.shin-row {');
  const rowGroup = rule(components, '.shin-box.shin-row-group,');
  const cardBody = rule(components, '.shin-card-body {');
  const sectionStyle = rule(components, '.shin-section {');
  const formField = rule(components, '.shin-form-field {');
  const toggleRow = rule(components, '.shin-toggle-row {');
  const button = rule(components, '.shin-button {');
  const icon = rule(components, '.shin-icon {');

  check(so, 'spacing token có đúng một nguồn khai báo',
    (tokens.match(/^\s*--shin-gap-[1-5]\s*:/gm) || []).length, 5);
  check(so, 'Row sở hữu khoảng cách ngang bằng gap, không dùng margin sibling',
    [row.indexOf('gap: var(--shin-gap-2);') >= 0, components.indexOf('.shin-row > * + *') === -1],
    [true, true]);
  check(so, 'RowGroup và ActionStack sở hữu nhịp dọc, reset margin của con trực tiếp',
      [rowGroup.indexOf('gap: var(--shin-gap-2);') >= 0,
      components.indexOf('.shin-row-group > *,\n.shin-action-stack > * { margin: 0; }') >= 0,
      components.indexOf('.shin-row-group > * + *') === -1,
      components.indexOf('.shin-action-stack > * + *') === -1],
    [true, true, true, true]);
  check(so, 'ActionStack không còn fallback margin có thể cộng với gap',
    [components.indexOf('.shin-box > .shin-single-action-row + .shin-single-action-row') === -1,
      runUi.indexOf('actionStack: function (elements) { return ActionStack({ elements: elements }); }') >= 0],
    [true, true]);
  check(so, 'CardBody sở hữu khoảng cách giữa block trực tiếp',
    [cardBody.indexOf('gap: var(--shin-gap-2);') >= 0,
      components.indexOf('.shin-card-body > * { margin: 0; }') >= 0,
      components.indexOf('.shin-card-body > * + *') === -1],
    [true, true, true]);
  check(so, 'Page/Section và sidebar body dùng gap thay cho sibling margin',
    [sectionStyle.indexOf('gap: var(--shin-gap-2);') >= 0,
      components.indexOf('.shin-section > * + *') === -1,
      rule(frame, '#sidebar-body {').indexOf('gap: var(--shin-gap-2);') >= 0,
      frame.indexOf('#sidebar-body > * + *') === -1],
    [true, true, true, true]);
  check(so, 'Field/Toggle không tự cộng margin ngoài khi nằm trong layout wrapper',
    [formField.indexOf('gap: var(--shin-gap-1);') >= 0,
      formField.indexOf('margin-bottom') === -1,
      toggleRow.indexOf('gap: var(--shin-gap-2);') >= 0,
      toggleRow.indexOf('margin: var') === -1],
    [true, true, true, true]);
  check(so, 'control-row có căn dọc riêng và không đổi Row generic',
      [components.indexOf('.shin-inline-field-row { align-items: center; }') >= 0,
      row.indexOf('align-items: center') >= 0],
    [true, true]);
  check(so, 'Loading/Empty/Notice/Table dùng preset riêng của chúng',
    [components.indexOf('.shin-loading {') >= 0 && components.indexOf('justify-content: center;') >= 0,
      components.indexOf('.shin-empty-state { display:flex; align-items:center; justify-content:center;') >= 0,
      components.indexOf('.shin-notice {') >= 0 && components.indexOf('margin: 0;') >= 0,
      docTep('client/style/status.html').indexOf('.shin-status-table-num {') >= 0 && docTep('client/style/status.html').indexOf('text-align: right;') >= 0],
    [true, true, true, true]);
  check(so, 'Button và Icon không sở hữu margin bên ngoài',
    [button.indexOf('margin') === -1, icon.indexOf('margin') === -1],
    [true, true]);
  check(so, 'vị trí header do HeaderGroup sở hữu, không còn marker align trên node lá',
    [frame.indexOf('.shin-box.shin-header-group { display: flex;') >= 0,
      frame.indexOf('.shin-header-group-start { flex: 1 1 auto; }') >= 0,
      frame.indexOf('.shin-header-group-end { flex: 0 0 auto; margin-left: auto; }') >= 0,
      components.indexOf('.shin-align-right') === -1,
      frame.indexOf('.shin-align-right') === -1,
      renderer.indexOf('shin-align-right') === -1],
    [true, true, true, true, true, true]);
  check(so, 'HeaderGroup không bị luật display block generic của Box ghi đè',
    [frame.indexOf('.shin-box.shin-header-group { display: flex;') >= 0,
      components.indexOf('.shin-box { display: block; }') >= 0], [true, true]);
  check(so, 'Button/Icon không có API align và Row generic không tự space-between',
    [builder.indexOf("button: ['align'") === -1,
      builder.indexOf("icon: ['icon', 'tooltip', 'align'") === -1,
      row.indexOf('space-between') === -1],
    [true, true, true]);
  check(so, 'ActionStack là wrapper duy nhất căn nhóm action',
    [components.indexOf('.shin-box.shin-action-stack { align-items: center; }') >= 0,
      components.indexOf('.shin-action-stack > * { width: min(100%, 220px); }') >= 0,
      components.indexOf('.shin-button {') >= 0 && button.indexOf('margin') === -1],
    [true, true, true]);
  check(so, 'Sync layout đặc thù dùng Row/RowGroup làm owner spacing',
    [shell.indexOf('.shin-sync-connection-section { display:grid; gap:var(--shin-gap-2);') >= 0,
      shell.indexOf('.shin-sync-schedule-row { display:grid;') === -1,
      shell.indexOf('.shin-sync-schedule-row > .shin-standalone-control:first-child { flex:0 0 var(--shin-sync-schedule-control-width); }') >= 0,
      shell.indexOf('.shin-sync-detail-controls { display:grid;') === -1,
      settings.indexOf('.shin-sync-detail-field { display: grid; gap: var(--shin-gap-1);') >= 0],
    [true, true, true, true, true]);
  check(so, 'Sync layout đặc thù có owner vị trí và token domain duy nhất',
    [shell.indexOf('--shin-sync-schedule-control-width:42px;') >= 0,
      shell.indexOf('.shin-sync-schedule-row > .shin-kv-label { flex:1 1 0; }') >= 0,
      shell.indexOf('margin-left:var(--shin-sync-schedule-control-width)') >= 0,
      shell.indexOf('.shin-sync-tab-trigger') >= 0 && shell.indexOf('text-align:center;') >= 0,
      shell.indexOf('.shin-sync-tab-description') >= 0 && shell.indexOf('text-align:center;') >= 0,
      shell.indexOf('.shin-sync-conflict-head') >= 0 && shell.indexOf('justify-content:space-between;') >= 0,
      components.indexOf('.shin-pagination .shin-button { width: 100%;') >= 0],
    [true, true, true, true, true, true, true]);
  check(so, 'Sync status, pipeline, results và conflict không dùng margin để cộng sibling spacing',
    [shell.indexOf('.shin-sync-phase { margin') === -1,
      shell.indexOf('.shin-sync-operation, .shin-sync-count, .shin-sync-current, .shin-sync-message { margin') === -1,
      shell.indexOf('.shin-sync-progress { display:flex; flex-direction:column; gap:var(--shin-gap-1); }') >= 0,
      shell.indexOf('.shin-sync-pipeline { display:flex; flex-direction:column; gap:var(--shin-gap-1);') >= 0,
      shell.indexOf('.shin-sync-pipeline-title { margin') === -1,
      shell.indexOf('margin-bottom:var(--shin-gap-2)') === -1,
      shell.indexOf('margin-top:3px') === -1],
    [true, true, true, true, true, true, true]);
  check(so, 'Sync results và Settings để wrapper lõi sở hữu nhịp',
    [shell.indexOf('#fbm-sync-results-root > #fbm-sync-results-body-region { margin') === -1,
      shell.indexOf('.shin-sync-conflict-field { display:flex; flex-direction:column; gap:var(--shin-gap-1);') >= 0,
      settings.indexOf('.shin-sync-login-policy-children { margin: 0 0') === -1,
      settings.indexOf('.shin-sync-login-policy-children { margin-left:') === -1,
      settings.indexOf('.shin-sync-login-policy-children .shin-toggle-row') === -1,
      settings.indexOf('.shin-sync-login-policy-retry-group .shin-form-field') === -1,
      settings.indexOf('.shin-sync-detail-inputs > * + *') === -1,
      runUi.indexOf('fieldHelp: function (control, help) { return RowGroup({ elements:') >= 0,
      runUi.indexOf('identityForm, elements: slots.form }), ActionStack') >= 0,
      runUi.indexOf('loginRetryGroup: function (className, elements) { return RowGroup') >= 0,
      runUi.indexOf('loginPolicyChildren, className: FBM_SYNC_SETTINGS_UI.classes.loginChildren, elements: slots.children }), slots.actions') >= 0,
      runUi.indexOf('RowGroup({ id: FBM_SYNC_SETTINGS_SCHEMA.regions.loginPolicyChildren') >= 0,
      runUi.indexOf('page: function (slots) { return Card({ title: slots.title, elements: [RowGroup({ elements:') >= 0,
      runUi.indexOf('Row({ className: FBM_SYNC_RESULTS_UI.classes.pagination') >= 0],
    [true, true, true, true, true, true, true, true, true, true, true, true, true, true]);
  check(so, 'slot lịch sử, info bar và dialog dùng gap thay cho margin sibling',
    [slots.indexOf('.shin-act-row {\n  display: flex;\n  flex-direction: column;\n  gap: var(--shin-gap-1);') >= 0,
      slots.indexOf('margin-bottom: 6px') === -1,
      slots.indexOf('.shin-act-content {\n  margin-top') === -1,
      frame.indexOf('display: flex;\n  flex-direction: column;\n  gap: var(--shin-gap-1);', frame.indexOf('#sidebar-info {')) >= 0,
      frame.indexOf('#sidebar-info .shin-row + .shin-row') === -1,
      components.indexOf('.shin-loading-track { position: relative; overflow: hidden; height: 5px; margin-top') === -1,
      components.indexOf('.shin-box.shin-unsaved-panel { position: relative; z-index: 1; display: flex; flex-direction: column; gap: var(--shin-gap-2);') >= 0,
      components.indexOf('.shin-unsaved-message { margin:') === -1,
      shell.indexOf('.shin-sync-tab-row { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:0; margin-bottom') === -1],
    [true, true, true, true, true, true, true, true, true]);
}

module.exports = { chay };
