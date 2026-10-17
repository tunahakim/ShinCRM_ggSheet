const { dungHop } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('ReloadDecision — một bảng luật cho RAM, signal và sheet quản trị');

  let hop;
  try {
    hop = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] }).hop;
  } catch (err) {
    return ghiLoiNap(so, 'nạp ReloadDecision.js', err);
  }

  check(so, 'ghi thất bại không phát signal và không reload',
    hop.reloadDecisionForChange({ entity: 'customer', surface: 'record', recordIds: ['KH1'], writeSucceeded: false }),
    hop.reloadDecisionBlank('Ghi thay đổi không thành công nên không phát tín hiệu reload.'));

  const edit = hop.reloadDecisionForChange({
    source: 'edit', entity: 'customer', surface: 'record', recordIds: [' KH1 ', 'KH1', 'KH2']
  });
  check(so, 'sửa tay Customer gom mã, nạp ngay không chờ, làm mọi view cũ nhưng không vẽ',
    [edit.kind, edit.signal.records, edit.signal.recordEntity, edit.signal.allViews, edit.ram.action, edit.ram.mode, 'waitMs' in edit.ram, edit.signal.viewSheets, edit.notifySidebar],
    ['records', ['KH1', 'KH2'], 'customer', true, 'reload', 'records', false, [], true]);

  const draft = hop.reloadDecisionForChange({
    source: 'edit', entity: 'customer', surface: 'record', recordIds: ['KH1', 'KH2'],
    localDraft: { recordIds: ['KH2'] }
  });
  check(so, 'localDraft chỉ trì hoãn đúng mã đang có bản nháp, view vẫn bị đánh dấu cũ',
    [draft.ram.action, draft.ram.recordIds, draft.ram.deferredRecordIds, draft.signal.allViews],
    ['defer', ['KH1', 'KH2'], ['KH2'], true]);

  const applied = hop.reloadDecisionForChange({
    source: 'user', entity: 'activity', surface: 'record', recordIds: ['GD1'], appliedByCaller: true
  });
  check(so, 'Sidebar đã áp dụng bản ghi đọc lại thì không reload RAM lần hai nhưng vẫn phát signal làm view cũ',
    [applied.ram.action, applied.signal.records, applied.signal.allViews],
    ['none', ['GD1'], true]);

  const category = hop.reloadDecisionForChange({ entity: 'category', surface: 'category' });
  check(so, 'Category bật scope riêng và làm mọi view cũ, không vẽ',
    [category.kind, category.ram.mode, category.signal.category, category.signal.allViews, category.signal.viewSheets],
    ['category', 'category', true, true, []]);

  section('ReloadDecision — kế hoạch nạp từ sổ nhật ký, theo revision riêng của từng Sidebar');

  const so10 = { rev: 12, floor: 7, changedAt: 0, entries: [
    { r: 8, t: 0, customer: ['KH-CU'] }, { r: 9, t: 0, config: true },
    { r: 10, t: 0, customer: true }, { r: 11, t: 0, customer: ['KH-A'] }, { r: 12, t: 0, activity: ['GD-B'] }] };
  const tu7 = hop.reloadDecisionForState({ journal: so10, lastSeenRevision: 7 });
  check(so, 'Sidebar ở 7: gộp mọi dòng sau 7, mỗi phần lấy mức cao nhất (Customer cả sheet bao mã A, Activity chỉ mã B, Config), không nạp lõi',
    [tu7.kind, tu7.ram.mode, tu7.ram.plan.core, tu7.ram.plan.customer, tu7.ram.plan.activity, tu7.ram.plan.config, tu7.ram.plan.category],
    ['state-parts', 'parts', false, true, ['GD-B'], true, false]);
  const tu10 = hop.reloadDecisionForState({ journal: so10, lastSeenRevision: 10 });
  check(so, 'Sidebar khác ở 10 trên cùng sổ: chỉ nhận mã A và mã B; sổ không bị lời hỏi trước làm đổi (hai Sidebar không giành tín hiệu)',
    [tu10.ram.plan.customer, tu10.ram.plan.activity, tu10.ram.plan.config, so10.entries.length], [['KH-A'], ['GD-B'], false, 5]);
  check(so, 'Sidebar đã thấy revision mới nhất thì không nạp gì',
    hop.reloadDecisionForState({ journal: so10, lastSeenRevision: 12 }).ram.action, 'none');
  const sau = { rev: 1300, floor: 1200, changedAt: 0, entries: [{ r: 1300, t: 0, customer: ['KH1'] }] };
  check(so, 'Sidebar tụt dưới floor (sổ đã cắt mất các dòng nó chưa thấy) thì nạp lõi một lần',
    [hop.reloadDecisionForState({ journal: sau, lastSeenRevision: 700 }).ram.mode, hop.reloadDecisionForState({ journal: sau, lastSeenRevision: 1200 }).ram.mode],
    ['fullCore', 'parts']);
  check(so, 'dòng sổ có core thì nạp lõi dù các dòng khác chỉ là mã',
    hop.reloadDecisionForState({ journal: { rev: 2, floor: 0, entries: [{ r: 1, customer: ['KH1'] }, { r: 2, core: true }] }, lastSeenRevision: 0 }).kind, 'state-full-core');
  const catRec = hop.reloadDecisionForState({ journal: { rev: 2, floor: 0, entries: [{ r: 1, category: true }, { r: 2, customer: ['KH1'] }] }, lastSeenRevision: 0 });
  check(so, 'Category và bản ghi cùng lúc: nạp từng phần, không nâng lên lõi',
    [catRec.ram.mode, catRec.ram.plan.category, catRec.ram.plan.customer], ['parts', true, ['KH1']]);
  check(so, 'dòng sổ chỉ làm view cũ (không phần dữ liệu) thì Sidebar không nạp',
    hop.reloadDecisionForState({ journal: { rev: 1, floor: 0, entries: [{ r: 1, t: 0 }] }, lastSeenRevision: 0 }).ram.action, 'none');
  const nhapCaSheet = hop.reloadDecisionForState({ journal: { rev: 1, floor: 0, entries: [{ r: 1, customer: true }] }, lastSeenRevision: 0, localDraft: { recordIds: ['KH9'] } });
  check(so, 'đang có bản nháp mà phần cần nạp thay cả sheet thì hoãn, như nạp lõi', nhapCaSheet.ram.action, 'defer');

  const config = hop.reloadDecisionForChange({ entity: 'config', surface: 'config' });
  check(so, 'Config dùng scope riêng và làm mọi view cũ, không vẽ',
    [config.kind, config.ram.mode, config.signal.config, config.signal.allViews, config.signal.viewSheets, 'views' in config],
    ['config', 'config', true, true, [], false]);

  const configCore = hop.reloadDecisionForChange({ entity: 'config', surface: 'config', configAffectsSchema: true });
  check(so, 'Config được nâng full core khi GAS xác định ảnh hưởng Schema',
    [configCore.ram.mode, configCore.signal.config, configCore.signal.allViews],
    ['fullCore', true, true]);

  const schema = hop.reloadDecisionForChange({ surface: 'schema', schema: true });
  check(so, 'Schema luôn bật full core và toàn bộ view',
    [schema.kind, schema.ram.mode, schema.signal.schema, schema.signal.allCore, schema.signal.allViews],
    ['schema', 'fullCore', true, true, true]);

  const viewControl = hop.reloadDecisionForChange({ surface: 'view-control', sheetName: '!Lead' });
  check(so, 'ô điều khiển view chỉ gắn cờ đúng sheet bị sửa, không vẽ, không phát signal làm sheet khác cũ',
    [viewControl.kind, viewControl.ram.action, viewControl.signal.allViews, viewControl.signal.viewSheets],
    ['view-control', 'none', false, ['!Lead']]);

  const viewData = hop.reloadDecisionForChange({ surface: 'view-data', entity: 'customer', recordIds: ['KH1'] });
  check(so, 'dữ liệu sinh ở sheet quản trị không làm bẩn RAM hoặc view',
    [viewData.kind, viewData.signal.records, viewData.signal.allViews, viewData.signal.viewSheets],
    ['none', [], false, []]);

  const okAt8 = { data: 8, ok: true };
  check(so, 'view đang xem: cũ + núm bật → render; cũ + núm tắt → notify; mới → none; chưa từng vẽ → cũ; sheet không ! → none',
    [
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: okAt8, autoRenderView: true }).action,
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: okAt8, autoRenderView: false }).action,
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: { data: 9, ok: true }, autoRenderView: false }).action,
      hop.reloadDecisionForView({ sheetName: '!Mới', viewsStaleRevision: 0 }).stale,
      hop.reloadDecisionForView({ sheetName: 'Customer', viewsStaleRevision: 9 }).action
    ],
    ['render', 'notify', 'none', true, 'none']);
  const blocks = [{ title: 'Điều kiện lọc sai (hàng 3)', lines: ['Ô B3 (@CUS_TEN_CTY): lỗi lọc'], hint: '' }];
  const failedAt9 = { data: 9, ok: false, problems: blocks, at: 1000 };
  const retryMs = hop.SETTINGS.VIEW_FAILED_RETRY_MS;
  check(so, 'lượt vẽ hỏng ở đúng dữ liệu này: chỉ báo, không xin vẽ lại dù núm bật; dữ liệu đổi hoặc quá hạn thử lại thì xin vẽ',
    [
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: failedAt9, autoRenderView: true, now: 1000 + retryMs - 1 }),
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 10, entry: failedAt9, autoRenderView: true, now: 1001 }).action,
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: failedAt9, autoRenderView: true, now: 1000 + retryMs }).action
    ],
    [{ sheetName: '!Lead', stale: true, action: 'notify', problems: blocks }, 'render', 'render']);
  check(so, 'cờ ô điều khiển buộc vẽ cả khi núm tắt hoặc lượt trước vừa hỏng; sheet mới thì không trả khối lỗi',
    [
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: { data: 9, ok: true, controls: true }, autoRenderView: false }).action,
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: Object.assign({ controls: true }, failedAt9), autoRenderView: true, now: 1001 }).action,
      hop.reloadDecisionForView({ sheetName: '!Lead', viewsStaleRevision: 9, entry: { data: 9, ok: true }, autoRenderView: true }).problems
    ],
    ['render', 'render', []]);
}

module.exports = { chay };
