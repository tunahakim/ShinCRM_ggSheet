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
    signal: { records: [], recordEntity: '', entities: [], category: false, config: false, schema: false, allCore: false, allViews: false },
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

/** `replacesWholeSheet`: kế hoạch nạp có phần thay cả một sheet, nên bản nháp chặn như nạp trọn. */
function reloadDecisionWithRam(decision, mode, ids, input, reason, replacesWholeSheet) {
  var normalized = reloadDecisionIds(ids);
  var draftIds = reloadDecisionDraftIds(input && input.localDraft);
  var draft = {};
  draftIds.forEach(function (id) { draft[id] = true; });
  var deferred = normalized.filter(function (id) { return draft[id]; });
  // Nạp trọn thực thể thay mọi bản ghi của nó như full core, nên bản nháp chặn cả hai.
  var fullCoreBlocked = (mode === 'fullCore' || mode === 'entity' || replacesWholeSheet === true) && draftIds.length > 0;
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
    if (configNeedsFullCore) { decision.signal.allCore = true; }
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
    decision.signal.recordEntity = entity;
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
 * Kế hoạch nạp cho một Sidebar từ sổ nhật ký (07A mục 4): gộp các dòng có revision lớn hơn revision Sidebar đã thấy, mỗi phần lấy mức cao nhất. Tụt dưới `floor` thì nạp lõi, vì không còn biết thay đổi nào đã bị cắt khỏi sổ.
 * Không nâng lên nạp lõi chỉ vì hai phần cùng đổi: mỗi phần nạp riêng trong cùng một lời gọi.
 */
function reloadPlanFromJournal(journal, lastSeenRevision) {
  var lastSeen = Number(lastSeenRevision || 0);
  var plan = { revision: journal.rev, core: false, customer: null, activity: null, category: false, config: false };
  if (lastSeen >= journal.rev) { return plan; }
  if (lastSeen < journal.floor) { plan.core = true; return plan; }
  journal.entries.forEach(function (entry) {
    if (Number(entry.r) <= lastSeen) { return; }
    RELOAD_RECORD_PARTS.forEach(function (part) { plan[part] = reloadJournalMergePart(plan[part], entry[part]); });
    RELOAD_FLAG_PARTS.forEach(function (part) { if (entry[part] === true) { plan[part] = true; } });
  });
  return plan;
}

/** Kế hoạch không có phần nào cần nạp (revision tăng chỉ vì view cũ). */
function reloadPlanEmpty(plan) {
  return !plan.core && !plan.customer && !plan.activity && !plan.category && !plan.config;
}

/**
 * Quyết định dành cho Sidebar từ sổ nhật ký. Hàm thuần: không ghi signal, không đọc kho; bên gọi truyền sổ đã đọc và `lastSeenRevision` của chính Sidebar đó.
 * `ram.mode`: `fullCore` khi phải nạp lõi, `parts` khi nạp từng phần theo `ram.plan`.
 */
function reloadDecisionForState(input) {
  var change = input || {};
  var decision = reloadDecisionBlank('Không có signal mới cho Sidebar.');
  if (!change.journal) { return decision; }
  var plan = reloadPlanFromJournal(change.journal, change.lastSeenRevision);
  if (reloadPlanEmpty(plan)) { return decision; }
  var common = { source: 'sidebar', localDraft: change.localDraft };
  var ids = plan.core ? [] : [].concat(Array.isArray(plan.customer) ? plan.customer : [], Array.isArray(plan.activity) ? plan.activity : []);
  var reason = plan.core ? 'Sổ nhật ký yêu cầu nạp lõi.' : 'Sổ nhật ký có phần dữ liệu cần nạp.';
  reloadDecisionWithRam(decision, plan.core ? 'fullCore' : 'parts', ids, common, reason, plan.customer === true || plan.activity === true);
  decision.ram.plan = plan;
  decision.kind = plan.core ? 'state-full-core' : 'state-parts';
  decision.notifySidebar = true;
  decision.reason = decision.ram.reason;
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
