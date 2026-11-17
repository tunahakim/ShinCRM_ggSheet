/** Kiểm nhịp khoảng cách của component lõi (Card, RowGroup, ActionStack, Section, vùng cuộn) và việc Sync dùng chúng: mỗi khoảng chỉ có một chủ sở hữu bằng gap, component con không cộng margin lần hai. */
const { docTep } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');
const { nguonDongBo } = require('../../lib/sidebar/tep-dong-bo');

function chay(so) {
  section('Component lõi — nhịp khoảng cách');
  const { source, all } = nguonDongBo();
  const common = docTep('client/ui/uiBuilder.html');
  const frame = docTep('client/style/frame.html');
  const styles = docTep('client/style/components.html');
  const cardCss = styles.slice(styles.indexOf('.shin-card {'), styles.indexOf('/*\n * Hàng tiêu đề nằm ngoài thẻ ruột'));
  const cardHeadCss = styles.slice(styles.indexOf('.shin-card-head {'), styles.indexOf('.shin-card-title {'));
  const cardBodyCss = styles.slice(styles.indexOf('.shin-card-body {'), styles.indexOf('/* --- Trường và nhãn'));
  const sidebar = docTep('client/Sidebar.html');
  check(so, 'Card và RowGroup dùng gap dọc, component con không cộng margin lần hai',
    [cardCss.indexOf('padding: var(--shin-card-pad);') >= 0, cardHeadCss.indexOf('padding:') === -1,
      cardBodyCss.indexOf('padding:') === -1, styles.indexOf('.shin-box.shin-row-group {') >= 0,
      styles.indexOf('.shin-card-body > * { margin: 0; }') >= 0,
      styles.indexOf('.shin-row-group > * + *') === -1,
      styles.indexOf('.shin-form-field > * + *') === -1],
    [true, true, true, true, true, true, true]);
  check(so, 'Nhóm action dùng RowGroup lõi và vẫn giữ owner riêng',
    [styles.indexOf('align-items: stretch;') >= 0, styles.indexOf('align-self: stretch;') >= 0, styles.indexOf('width: 100%;') >= 0,
      styles.indexOf('.shin-box.shin-action-stack') >= 0,
      styles.indexOf('gap: var(--shin-gap-2);') >= 0,
      styles.indexOf('.shin-row-group > * { margin: 0; }') >= 0],
    [true, true, true, true, true, true]);
  check(so, 'Nút action dài được xếp dọc trong Sidebar hẹp',
    [styles.indexOf('.shin-single-action-row { justify-content: center; flex-wrap: wrap; }') >= 0,
      styles.indexOf('width: min(220px, 100%); max-width: 100%; min-width: 0;') >= 0,
      styles.indexOf('white-space: normal; overflow-wrap: anywhere;') >= 0,
      styles.indexOf('.shin-single-action-row > .shin-button { white-space: normal; text-align: center; overflow-wrap: anywhere; }') >= 0,
      styles.indexOf('.shin-single-action-row > .shin-button .shin-btn-label { min-width: 0; overflow-wrap: anywhere; white-space: normal; }') >= 0,
      styles.indexOf('.shin-single-action-row > * + *') === -1],
    [true, true, true, true, true, true]);
  check(so, 'ActionStack căn giữa ở đúng độ ưu tiên của component lõi',
    [styles.indexOf('.shin-box.shin-action-stack { align-items: center; }') >= 0,
      !/(^|\n)\.shin-action-stack \{ align-items: center; \}/.test(styles)],
    [true, true]);
  check(so, 'Box rỗng giữ vùng callback nhưng không tạo khoảng cách giả trong Card',
    styles.indexOf('.shin-box:empty { display: none; }') >= 0,
    true);
  check(so, 'Section sở hữu khoảng giữa các Card bằng gap',
    [styles.indexOf('.shin-section { display: flex; flex-direction: column; gap: var(--shin-gap-2);') >= 0,
      styles.indexOf('.shin-section > * + *') === -1,
      styles.indexOf('.shin-card {') >= 0],
    [true, true, true]);
  check(so, 'các vùng cột chung dùng gap làm owner spacing',
    [frame.indexOf('#sidebar-body {') >= 0 && frame.indexOf('gap: var(--shin-gap-2);', frame.indexOf('#sidebar-body {')) >= 0,
      styles.indexOf('.shin-section { display: flex; flex-direction: column; gap: var(--shin-gap-2);') >= 0,
      source['client/sync/fbmSyncShell.html'].indexOf("uiSyncClass('shell', 'navItem')") >= 0],
    [true, true, true]);
  check(so, 'ActionStack lõi tự sở hữu nhịp, không cần fallback margin',
    [common.indexOf('function ActionStack(') >= 0, styles.indexOf('.shin-box > .shin-single-action-row + .shin-single-action-row') === -1,
      source['client/sync/fbmSyncUiSchema.html'].indexOf('actionStack: function') >= 0],
    [true, true, true]);
  check(so, 'các vùng cuộn giữ trục hai mép bằng gutter ổn định, section không cộng lề lệch',
    [frame.indexOf('.shin-scroll-region {') >= 0 && frame.indexOf('overflow-y: auto;') >= 0 && frame.indexOf('scrollbar-gutter: stable both-edges;') >= 0,
      sidebar.indexOf('id="sidebar-body" class="shin-scroll-region"') >= 0,
      sidebar.indexOf('id="sidebar-body" class="shin-scroll-region"') >= 0,
      frame.indexOf('#sidebar-body {') >= 0 && frame.indexOf('padding: 0 0 var(--shin-gap-4);') >= 0,
      styles.indexOf('.shin-section { display: flex; flex-direction: column; gap: var(--shin-gap-2); min-width: 0; padding: 0 0 var(--shin-gap-4); }') >= 0],
    [true, true, true, true, true]);
  check(so, 'Sync dùng Notice lõi thay vì tự lặp bảng ánh xạ lớp thông báo',
    [common.indexOf('function Notice(') >= 0, all.indexOf('noticeClasses') >= 0, all.indexOf('noticeClass =') >= 0],
    [true, false, false]);
  check(so, 'frame chung không còn chứa style component Sync legacy',
    ['shin-sync-form-field', 'shin-sync-form-actions', 'shin-sync-muted', 'shin-sync-preview-row', 'shin-sync-login-row'].filter((name) => frame.indexOf(name) >= 0),
    []);
  check(so, 'shared layout contracts',
    [frame.indexOf('#sidebar-root {') >= 0 && frame.indexOf('background: var(--shin-bg-sunken);') > frame.indexOf('#sidebar-root {'),
      frame.indexOf('#sidebar-info {') >= 0 && frame.indexOf('margin-bottom: var(--shin-gap-2);') > frame.indexOf('#sidebar-info {'),
      styles.indexOf('.shin-loading-track.is-idle { visibility: hidden; background: transparent; }') >= 0],
    [true, true, true]);
  check(so, 'RowGroup dùng gap và reset margin con trực tiếp',
    [styles.indexOf('.shin-box.shin-row-group {') >= 0, styles.indexOf('gap: var(--shin-gap-2);', styles.indexOf('.shin-box.shin-row-group {')) > styles.indexOf('.shin-box.shin-row-group {'), styles.indexOf('.shin-row-group > * { margin: 0; }') >= 0],
    [true, true, true]);
}

module.exports = { chay };
