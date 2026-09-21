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
  const runUi = docTep('client/sync/fbmSyncUiSchema.html');
  const shell = docTep('client/sync/fbmSyncShell.html');
  const settings = docTep('client/sync/screens/settings.html');
  const row = rule(components, '.shin-row {');
  const stack = rule(components, '.shin-box.shin-stack,');
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
  check(so, 'Stack và ActionStack sở hữu nhịp dọc, reset margin của con trực tiếp',
      [stack.indexOf('gap: var(--shin-gap-2);') >= 0,
      components.indexOf('.shin-stack > *,\n.shin-action-stack > * { margin: 0; }') >= 0,
      components.indexOf('.shin-stack > * + *') === -1,
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
  check(so, 'Button và Icon không sở hữu margin bên ngoài',
    [button.indexOf('margin') === -1, icon.indexOf('margin') === -1],
    [true, true]);
  check(so, 'Sync layout đặc thù vẫn dùng gap cho sibling trong wrapper',
    [shell.indexOf('.shin-sync-connection-section { display:grid; gap:var(--shin-gap-2);') >= 0,
      shell.indexOf('.shin-sync-schedule-row { display:grid;') >= 0 && shell.indexOf('gap:var(--shin-gap-2);') >= 0,
      settings.indexOf('.shin-sync-detail-field { display: grid; gap: var(--shin-gap-1);') >= 0],
    [true, true, true]);
}

module.exports = { chay };
