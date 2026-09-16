/**
 * Tính quyết định reload từ một thay đổi đã được tầng gọi xác nhận.
 *
 * Module này cố ý không đọc Sheet, Properties hoặc UserPrefs. Trigger/cửa ghi
 * phải truyền phân loại đã xác nhận; Sidebar truyền thêm localDraft khi cần
 * bảo vệ bản nháp. Nhờ vậy RAM và renderer dùng cùng một bảng luật nhưng
 * không biến hàm quyết định thành một cửa ghi ẩn.
 */

var RELOAD_DECISION_DEBOUNCE_MS = 3000;

function reloadDecisionBlank(reason) {
  return {
    kind: 'none',
    ram: { action: 'none', mode: 'none', recordIds: [], deferredRecordIds: [], waitMs: 0, flushOnLeave: false, reason: reason || '' },
    views: { action: 'none', mode: 'none', immediate: false, policyBypass: false, reason: reason || '' },
    signal: { records: [], category: false, config: false, schema: false, allCore: false, allViews: false, viewSheets: [] },
    notifySidebar: false,
    reason: reason || ''
  };
}

function reloadDecisionIds(values) {
  var input = Array.isArray(values) ? values : values === undefined || values === null ? [] : [values];
  var out = [];
  var seen = {};
  input.forEach(function (value) {
    var id = String(value === null || value === undefined ? '' : value).trim();
    if (!id || seen[id]) { return; }
    seen[id] = true;
    out.push(id);
  });
  return out;
}

function reloadDecisionDraftIds(localDraft) {
  if (!localDraft) { return []; }
  if (Array.isArray(localDraft)) { return reloadDecisionIds(localDraft); }
  return reloadDecisionIds(localDraft.recordIds || localDraft.ids || localDraft.id);
}

function reloadDecisionViewSheets(decision, input) {
  var names = input && Array.isArray(input.viewSheetNames) ? input.viewSheetNames : [];
  decision.signal.viewSheets = reloadDecisionIds(names);
  return decision;
}

function reloadDecisionWithRam(decision, mode, ids, input, reason) {
  var normalized = reloadDecisionIds(ids);
  var draftIds = reloadDecisionDraftIds(input && input.localDraft);
  var draft = {};
  draftIds.forEach(function (id) { draft[id] = true; });
  var deferred = normalized.filter(function (id) { return draft[id]; });
  var action = deferred.length ? 'defer' : 'reload';
  decision.ram = {
    action: action,
    mode: mode,
    recordIds: normalized,
    deferredRecordIds: deferred,
    waitMs: input && input.source === 'edit' && (mode === 'records') ? RELOAD_DECISION_DEBOUNCE_MS : 0,
    flushOnLeave: !!(input && input.source === 'edit' && mode === 'records'),
    reason: deferred.length ? 'Bảo vệ bản nháp Sidebar của mã đang sửa.' : reason
  };
}

function reloadDecisionForChange(input) {
  var change = input || {};
  if (change.writeSucceeded === false || change.accepted === false) {
    return reloadDecisionBlank('Ghi thay đổi không thành công nên không phát tín hiệu reload.');
  }

  var surface = String(change.surface || change.kind || '').trim();
  var entity = String(change.entity || '').trim().toLowerCase();
  var decision = reloadDecisionBlank('Không có thay đổi thuộc phạm vi reload.');
  var ids = reloadDecisionIds(change.recordIds || change.ids);
  var autoRender = change.autoRenderView !== false;
  var source = String(change.source || '').trim().toLowerCase();
  var isViewControl = surface === 'view-control' || change.viewControl === true;

  if (isViewControl) {
    decision.kind = 'view-control';
    decision.signal.allViews = true;
    reloadDecisionViewSheets(decision, change);
    decision.views = { action: 'render', mode: 'all', immediate: true, policyBypass: true, reason: 'Thay đổi điều khiển trực tiếp sheet quản trị.' };
    decision.reason = 'Thay đổi điều khiển view.';
    return decision;
  }

  if (surface === 'view-data' || change.viewData === true) {
    return reloadDecisionBlank('Dữ liệu sinh ở sheet quản trị không phải nguồn sự thật.');
  }

  if (surface === 'schema' || change.schema === true) {
    decision.kind = 'schema';
    decision.signal.schema = true;
    decision.signal.allCore = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'fullCore', [], change, 'Schema đổi nên phải nạp lại full core.');
    decision.views = { action: autoRender ? 'render' : 'defer', mode: 'all', immediate: autoRender, policyBypass: false, reason: 'Schema ảnh hưởng mọi view.' };
    reloadDecisionViewSheets(decision, change);
    decision.notifySidebar = true;
    decision.reason = 'Schema đổi.';
    return decision;
  }

  if (surface === 'category' || entity === 'category') {
    decision.kind = 'category';
    decision.signal.category = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'category', [], change, 'Category đổi.');
    decision.views = { action: autoRender ? 'render' : 'defer', mode: 'all', immediate: autoRender, policyBypass: false, reason: 'Category có thể ảnh hưởng filter và dữ liệu hiển thị.' };
    reloadDecisionViewSheets(decision, change);
    decision.notifySidebar = true;
    decision.reason = 'Category đổi.';
    return decision;
  }

  if (surface === 'config' || entity === 'config') {
    decision.kind = 'config';
    decision.signal.config = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'fullCore', [], change, 'Config dùng full core trong giai đoạn an toàn.');
    decision.views = { action: autoRender ? 'render' : 'defer', mode: 'all', immediate: autoRender, policyBypass: false, reason: 'Config có thể ảnh hưởng mọi view.' };
    reloadDecisionViewSheets(decision, change);
    decision.notifySidebar = true;
    decision.reason = 'Config đổi.';
    return decision;
  }

  var isRecordSurface = surface === 'record' || surface === 'default-data' || entity === 'customer' || entity === 'activity';
  if (isRecordSurface && (entity === 'customer' || entity === 'activity') && ids.length) {
    decision.kind = 'records';
    decision.signal.records = ids;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'records', ids, change, 'Customer/Activity đổi.');
    if (source !== 'edit' && change.appliedByCaller === true && !decision.ram.deferredRecordIds.length) {
      decision.ram.action = 'none';
      decision.ram.reason = 'Bên gọi đã áp dụng bản ghi đọc lại vào RAM.';
    }
    decision.views = { action: autoRender ? 'render' : 'defer', mode: 'all', immediate: autoRender, policyBypass: false, reason: 'Nguồn Customer/Activity đổi.' };
    reloadDecisionViewSheets(decision, change);
    decision.notifySidebar = true;
    decision.reason = 'Customer/Activity đổi.';
    return decision;
  }

  return decision;
}
