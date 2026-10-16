/**
 * Tính quyết định reload từ một thay đổi đã được tầng gọi xác nhận.
 *
 * Module này cố ý không đọc Sheet, Properties hoặc UserPrefs. Trigger/cửa ghi
 * phải truyền phân loại đã xác nhận; Sidebar truyền thêm localDraft khi cần
 * bảo vệ bản nháp. Nhờ vậy RAM và renderer dùng cùng một bảng luật nhưng
 * không biến hàm quyết định thành một cửa ghi ẩn.
 *
 * Sheet quản trị vẽ khi có người xem: dữ liệu kho đổi chỉ làm view cũ
 * (`signal.allViews`). Trigger chỉ vẽ khi người dùng sửa bộ điều khiển: hàng
 * 1/hàng 3/cột sắp xếp của một sheet `!` thì vẽ đúng sheet đó, cột sắp xếp
 * chung trong Config thì vẽ mọi sheet `!`. Hai nhánh này bỏ qua công tắc
 * người dùng vì đó là lệnh trực tiếp.
 */

function reloadDecisionBlank(reason) {
  return {
    kind: 'none',
    ram: { action: 'none', mode: 'none', recordIds: [], deferredRecordIds: [], reason: reason || '' },
    views: { action: 'none', mode: 'none', sheetName: '', reason: reason || '' },
    signal: { records: [], entities: [], category: false, config: false, schema: false, allCore: false, allViews: false },
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

function reloadDecisionWithRam(decision, mode, ids, input, reason) {
  var normalized = reloadDecisionIds(ids);
  var draftIds = reloadDecisionDraftIds(input && input.localDraft);
  var draft = {};
  draftIds.forEach(function (id) { draft[id] = true; });
  var deferred = normalized.filter(function (id) { return draft[id]; });
  // Nạp trọn thực thể thay mọi bản ghi của nó như full core, nên bản nháp chặn cả hai.
  var fullCoreBlocked = (mode === 'fullCore' || mode === 'entity') && draftIds.length > 0;
  var action = deferred.length || fullCoreBlocked ? 'defer' : 'reload';
  decision.ram = {
    action: action,
    mode: mode,
    recordIds: normalized,
    deferredRecordIds: fullCoreBlocked ? draftIds : deferred,
    reason: fullCoreBlocked ? 'Bảo vệ bản nháp Sidebar trước khi nạp trọn dữ liệu.' : (deferred.length ? 'Bảo vệ bản nháp Sidebar của mã đang sửa.' : reason)
  };
}

function reloadDecisionEntities(values) {
  return reloadDecisionIds(values).filter(function (entity) { return entity === 'customer' || entity === 'activity'; });
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
  var source = String(change.source || '').trim().toLowerCase();
  var isViewControl = surface === 'view-control' || change.viewControl === true;

  if (isViewControl) {
    var sheetName = String(change.sheetName || '').trim();
    decision.kind = 'view-control';
    if (sheetName) { decision.views = { action: 'render', mode: 'sheet', sheetName: sheetName, reason: 'Thay đổi điều khiển trực tiếp sheet quản trị.' }; }
    decision.reason = 'Thay đổi điều khiển view.';
    return decision;
  }

  if (surface === 'view-source') {
    decision.kind = 'view-source';
    decision.signal.allViews = true;
    decision.reason = 'Cột @ ngoài DATA_SCHEMA trên sheet kho đổi: RAM không giữ cột đó nên chỉ làm view cũ.';
    return decision;
  }

  if (surface === 'view-data' || change.viewData === true) {
    return reloadDecisionBlank('Dữ liệu sinh ở sheet quản trị không phải nguồn sự thật.');
  }

  if (change.allCore === true || change.structure === true) {
    decision.kind = 'structure';
    decision.signal.allCore = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'fullCore', [], change, 'Thay đổi cấu trúc cần nạp lại full core.');
    decision.notifySidebar = true;
    decision.reason = 'Thay đổi cấu trúc.';
    return decision;
  }

  var entities = reloadDecisionEntities(change.entities);
  if (surface === 'entity' && entities.length) {
    decision.kind = 'entity';
    decision.signal.entities = entities;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, entities.length === 1 ? 'entity' : 'fullCore', [], change, 'Sheet kho có thể đổi vị trí hoặc số hàng nên nạp trọn thực thể đó.');
    if (entities.length === 1) { decision.ram.entity = entities[0]; }
    decision.notifySidebar = true;
    decision.reason = 'Thực thể đổi trọn.';
    return decision;
  }

  if (surface === 'schema' || change.schema === true) {
    decision.kind = 'schema';
    decision.signal.schema = true;
    decision.signal.allCore = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'fullCore', [], change, 'Schema đổi nên phải nạp lại full core.');
    decision.notifySidebar = true;
    decision.reason = 'Schema đổi.';
    return decision;
  }

  if (surface === 'category' || entity === 'category') {
    decision.kind = 'category';
    decision.signal.category = true;
    decision.signal.allViews = true;
    reloadDecisionWithRam(decision, 'category', [], change, 'Category đổi.');
    decision.notifySidebar = true;
    decision.reason = 'Category đổi.';
    return decision;
  }

  if (surface === 'config' || entity === 'config') {
    decision.kind = 'config';
    decision.signal.config = true;
    decision.signal.allViews = true;
    var configNeedsFullCore = change.configAffectsSchema === true || change.forceFullCore === true;
    reloadDecisionWithRam(decision, configNeedsFullCore ? 'fullCore' : 'config', [], change, configNeedsFullCore
      ? 'Config ảnh hưởng Schema nên phải nạp lại full core.'
      : 'Config đổi, nạp riêng toàn bộ khối Config.');
    if (change.configSort === true) { decision.views = { action: 'render', mode: 'all', sheetName: '', reason: 'Sắp xếp chung trong Config là bộ điều khiển của mọi sheet quản trị.' }; }
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
    decision.notifySidebar = true;
    decision.reason = 'Customer/Activity đổi.';
    return decision;
  }

  return decision;
}

/**
 * Tính phần quyết định dành cho Sidebar từ ReloadState đã có sẵn. Hàm này chỉ
 * đọc input, không ghi lại signal; signal chỉ được phát bởi trigger/cửa ghi.
 * `lastSeenRevision` ngăn một wake request lặp lại nạp cùng một revision.
 */
function reloadDecisionForState(input) {
  var change = input || {};
  var state = change.reloadState || change.state || {};
  var revision = Number(state.revision || 0);
  var lastSeen = Number(change.lastSeenRevision || 0);
  var decision = reloadDecisionBlank('Không có signal mới cho Sidebar.');
  if (revision && lastSeen >= revision && change.forceReload !== true) { return decision; }

  var common = {
    source: 'sidebar',
    localDraft: change.localDraft
  };

  if (state.allCore || state.all || state.schema) {
    decision.kind = 'state-full-core';
    reloadDecisionWithRam(decision, 'fullCore', [], common, 'ReloadState yêu cầu nạp full core.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState yêu cầu nạp full core.';
    return decision;
  }

  var stateEntities = reloadDecisionEntities(state.entities);
  // Một thực thể đứng riêng nạp trọn thực thể đó; đi cùng scope khác thì dùng full core cho cùng một revision nhất quán, như Category đi cùng records.
  if (stateEntities.length) {
    var alone = stateEntities.length === 1 && !state.config && !state.category && !(state.records && state.records.length);
    decision.kind = alone ? 'state-entity' : 'state-full-core';
    reloadDecisionWithRam(decision, alone ? 'entity' : 'fullCore', [], common, alone ? 'ReloadState yêu cầu nạp trọn ' + stateEntities[0] + '.' : 'ReloadState có thực thể cần nạp trọn cùng scope khác.');
    if (alone) { decision.ram.entity = stateEntities[0]; }
    decision.notifySidebar = true;
    decision.reason = decision.ram.reason;
    return decision;
  }

  if (state.config && ((state.records && state.records.length) || state.category)) {
    decision.kind = 'state-full-core';
    reloadDecisionWithRam(decision, 'fullCore', [], common, 'Config cùng revision với scope khác nên dùng payload full core nhất quán.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState có Config cùng scope khác.';
    return decision;
  }

  if (state.config) {
    decision.kind = 'state-config';
    reloadDecisionWithRam(decision, 'config', [], common, 'ReloadState yêu cầu nạp Config.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState yêu cầu nạp Config.';
    return decision;
  }

  var ids = reloadDecisionIds(state.records);

  // Category and record signals share one revision. A category-only response
  // would clear one scope while making the client mark the whole revision as
  // seen, stranding the records. Use the coherent full-core payload instead.
  if (state.category && ids.length) {
    decision.kind = 'state-full-core';
    reloadDecisionWithRam(decision, 'fullCore', [], common, 'ReloadState co Category va ma ban ghi cung revision.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState co Category va records cung revision.';
    return decision;
  }

  if (state.category) {
    decision.kind = 'state-category';
    reloadDecisionWithRam(decision, 'category', [], common, 'ReloadState yêu cầu nạp Category.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState yêu cầu nạp Category.';
    return decision;
  }

  if (ids.length) {
    decision.kind = 'state-records';
    reloadDecisionWithRam(decision, 'records', ids, common, 'ReloadState có mã Customer/Activity cần nạp.');
    decision.notifySidebar = true;
    decision.reason = 'ReloadState có mã Customer/Activity cần nạp.';
    return decision;
  }

  return decision;
}

/**
 * Quyết định cho sheet `!` người dùng đang xem, theo sổ trạng thái (`entry`): cũ và cần thử thì Sidebar gọi vẽ nếu công tắc bật, tắt thì chỉ báo.
 * Cũ mà lượt hỏng ở đúng dữ liệu này chưa đến hạn thử lại thì chỉ báo: thử lại lúc này cho ra đúng lỗi cũ và tự đánh thức lần nữa.
 */
function reloadDecisionForView(input) {
  var view = input || {};
  var sheetName = String(view.sheetName || '').trim();
  if (sheetName.charAt(0) !== '!') { return { sheetName: sheetName, stale: false, action: 'none' }; }
  var stale = viewLedgerStale(view.entry || null, view.viewsStaleRevision);
  var attempt = stale && viewLedgerDataNeedsAttempt(view.entry || null, view.viewsStaleRevision, Number(view.now) || 0);
  return { sheetName: sheetName, stale: stale, action: !stale ? 'none' : !attempt || view.autoRenderView === false ? 'notify' : 'render' };
}
