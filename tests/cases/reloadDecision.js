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
    source: 'edit', entity: 'customer', surface: 'record', recordIds: [' KH1 ', 'KH1', 'KH2'], autoRenderView: true
  });
  check(so, 'sửa Customer hợp lệ gom mã, debounce RAM và vẽ toàn bộ view',
    [edit.kind, edit.signal.records, edit.signal.allViews, edit.ram.action, edit.ram.mode, edit.ram.waitMs, edit.ram.flushOnLeave, edit.views.action, edit.views.mode, edit.views.immediate, edit.notifySidebar],
    ['records', ['KH1', 'KH2'], true, 'reload', 'records', 3000, true, 'render', 'all', true, true]);

  const draft = hop.reloadDecisionForChange({
    source: 'edit', entity: 'customer', surface: 'record', recordIds: ['KH1', 'KH2'],
    localDraft: { recordIds: ['KH2'] }
  });
  check(so, 'localDraft chỉ trì hoãn đúng mã đang có bản nháp, không chặn view',
    [draft.ram.action, draft.ram.recordIds, draft.ram.deferredRecordIds, draft.views.action, draft.views.immediate],
    ['defer', ['KH1', 'KH2'], ['KH2'], 'render', true]);

  const applied = hop.reloadDecisionForChange({
    source: 'user', entity: 'activity', surface: 'record', recordIds: ['GD1'], appliedByCaller: true
  });
  check(so, 'Sidebar đã áp dụng bản ghi đọc lại thì không reload RAM lần hai nhưng vẫn phát signal và vẽ view',
    [applied.ram.action, applied.signal.records, applied.signal.allViews, applied.views.action],
    ['none', ['GD1'], true, 'render']);

  const category = hop.reloadDecisionForChange({ entity: 'category', surface: 'category', autoRenderView: false });
  check(so, 'Category bật scope riêng và giữ cờ view khi chính sách tắt',
    [category.kind, category.ram.mode, category.signal.category, category.signal.allViews, category.views.action, category.views.immediate],
    ['category', 'category', true, true, 'defer', false]);

  const config = hop.reloadDecisionForChange({ entity: 'config', surface: 'config' });
  check(so, 'Config dùng full core và đánh dấu toàn bộ view',
    [config.kind, config.ram.mode, config.signal.config, config.signal.allViews, config.views.action],
    ['config', 'fullCore', true, true, 'render']);

  const schema = hop.reloadDecisionForChange({ surface: 'schema', schema: true });
  check(so, 'Schema luôn bật full core và toàn bộ view',
    [schema.kind, schema.ram.mode, schema.signal.schema, schema.signal.allCore, schema.signal.allViews, schema.views.policyBypass],
    ['schema', 'fullCore', true, true, true, false]);

  const viewControl = hop.reloadDecisionForChange({ surface: 'view-control', autoRenderView: false });
  check(so, 'hàng điều khiển view render ngay và bypass công tắc tự động',
    [viewControl.kind, viewControl.ram.action, viewControl.signal.allViews, viewControl.views.action, viewControl.views.immediate, viewControl.views.policyBypass],
    ['view-control', 'none', true, 'render', true, true]);

  const viewData = hop.reloadDecisionForChange({ surface: 'view-data', entity: 'customer', recordIds: ['KH1'] });
  check(so, 'dữ liệu sinh ở sheet quản trị không làm bẩn RAM hoặc view',
    [viewData.kind, viewData.signal.records, viewData.signal.allViews, viewData.views.action],
    ['none', [], false, 'none']);
}

module.exports = { chay };
