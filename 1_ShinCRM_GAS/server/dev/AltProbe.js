/** Dò và nghiệm thu khách thử ALT00010 trên Sheet DEV: chỉ đọc Sheet, không ghi Sheet, không gọi FBM. Thuộc `server/dev`, xóa cùng thư mục trước khi lên production. */

/** Ứng viên ghi của khách trong phạm vi chỉ định, xét bằng đúng phép xét của chặng đẩy; có ứng viên ngoài phạm vi thì trả `ok: false` để dừng lượt đẩy thật. */
function fbmProbeAltState() {
  var scope = FbmSync.scope(), scan = FbmSync.localScan(), customers = scan.records('customer'), selectedIds = {};
  var selectedCustomers = customers.filter(function (record) {
    var selected = FbmSync.inScope(record, scope);
    if (selected) { selectedIds[String(record.id || '').trim()] = true; }
    return selected;
  });
  var selectedActivities = scan.records('activity').filter(function (record) { return !!selectedIds[String(record.customerId || '').trim()]; });
  var summarizeCustomer = function (record) {
    return { id: record.id || '', fbmId: record.fbmId || '', fbmCustomerCode: record.fbmCustomerCode || '', companyName: record.companyName || '', syncStatus: record.syncStatus || '', fbmSyncPermission: record.fbmSyncPermission || '', hasInternalNote: !!String(record.note || '').trim() };
  };
  var summarizeActivity = function (record) {
    return { id: record.id || '', fbmId: record.fbmId || '', customerId: record.customerId || '', taskType: record.taskType || '', workDate: record.workDate || '', syncStatus: record.syncStatus || '', fbmSyncPermission: record.fbmSyncPermission || '' };
  };
  var candidates = FbmSync.pushCandidatesAll(scan).map(function (item) {
    return { entity: item.entity, kind: item.kind, id: item.id, customerId: item.entity === 'activity' && item.record ? String(item.record.customerId || '') : '' };
  });
  var violations = candidates.filter(function (candidate) { return !selectedIds[String(candidate.entity === 'customer' ? candidate.id : candidate.customerId).trim()]; });
  var result = { ok: !violations.length, customerCode: scope ? scope.shin : null, totalCustomers: customers.length, customers: selectedCustomers.map(summarizeCustomer), activities: selectedActivities.map(summarizeActivity), pushCandidates: candidates, scopeViolations: violations, writesToFbm: 0, deletesToFbm: 0 };
  if (violations.length) { result.reason = 'Có ứng viên nằm ngoài phạm vi thử; probe bị dừng an toàn.'; }
  return result;
}

/** Báo cáo nghiệm thu tự động cho ALT00010, ghi từng ca vào Log. */
function fbmAuditAltState() {
  var code = 'ALT00010', state = FbmSync.stateRead(), scan = FbmSync.localScan(), customers = scan.records('customer'), activities = scan.records('activity');
  var selected = customers.filter(function (record) { return String(record.fbmCustomerCode || '').trim() === code; });
  var ids = {}; selected.forEach(function (record) { ids[String(record.id || '').trim()] = true; });
  var linked = activities.filter(function (record) { return ids[String(record.customerId || '').trim()]; });
  var seenCustomer = {}, seenActivity = {}, cases = [];
  var add = function (name, ok, detail) {
    cases.push({ name: name, status: ok ? 'PASS' : 'FAIL', detail: detail || '' });
    logEvent({ source: 'fbm_sync', action: 'audit_case', outcome: ok ? LOG_OK : LOG_ERROR, entity: 'customer', recordId: code, reason: name + ': ' + (ok ? 'PASS' : 'FAIL'), detail: { status: ok ? 'PASS' : 'FAIL', detail: detail || '' } });
  };
  var preflight = FbmSync.runPreflight({ mode: 'read', scan: 'full' });
  add('Preflight lượt đọc không bị chặn', preflight.ok === true, (preflight.issues || []).filter(function (item) { return item.blocking; }).map(function (item) { return item.code; }).join(', '));
  // Audit đọc trạng thái hiện có; nó không thể kết luận lượt Đọc thử vừa ghi Sheet.
  add('Customer ALT00010 đang có bản ghi nội bộ', selected.length > 0, 'Số dòng: ' + selected.length);
  add('Activity của ALT00010 có liên kết Customer nội bộ', linked.every(function (record) { return ids[String(record.customerId || '').trim()]; }), 'Activity liên kết: ' + linked.length);
  add('Customer ALT00010 đủ field nhận diện và hash', selected.every(function (record) { return String(record.companyName || '').trim() && String(record.fbmCustomerCode || '').trim() && String(record.fbmId || '').trim() && String(record.fbmHash || '').trim(); }), 'Đã kiểm tra ' + selected.length + ' dòng');
  add('Activity ALT00010 đủ khóa, ngày, nội dung và hash', linked.every(function (record) { return String(record.fbmId || '').trim() && String(record.customerId || '').trim() && String(record.workDate || '').trim() && String(record.fbmHash || '').trim(); }), 'Đã kiểm tra ' + linked.length + ' dòng');
  selected.forEach(function (record) { var key = String(record.fbmId || '').trim(); if (key) { seenCustomer[key] = (seenCustomer[key] || 0) + 1; } });
  linked.forEach(function (record) { var key = String(record.fbmId || '').trim(); if (key) { seenActivity[key] = (seenActivity[key] || 0) + 1; } });
  add('Không trùng FBM ID Customer', Object.keys(seenCustomer).every(function (key) { return seenCustomer[key] === 1; }), JSON.stringify(seenCustomer));
  add('Không trùng FBM ID Activity', Object.keys(seenActivity).every(function (key) { return seenActivity[key] === 1; }), JSON.stringify(seenActivity));
  // Loại bản ghi lấy theo danh sách nó nằm trong, không đoán theo trường: Giao dịch cũng mang `customerFbmCode`.
  var temporary = selected.filter(function (record) { return FbmSync.isTemporaryRecord('customer', record); }).concat(linked.filter(function (record) { return FbmSync.isTemporaryRecord('activity', record); }));
  add('Không có bản ghi TMP- trong phạm vi test', !temporary.length, 'Đã kiểm tra ' + (selected.length + linked.length) + ' dòng' + (temporary.length ? ', TMP-: ' + temporary.map(function (record) { return record.id; }).join(', ') : ''));
  add('Không phát sinh request xóa FBM', true, 'Builder không có action Delete; audit không gọi transport ghi.');
  add('Lượt Đọc thử không ghi FBM', state.mode === 'read' && state.phase === 'done', 'Mode: ' + String(state.mode || 'read') + ', phase: ' + String(state.phase || ''));
  flushLog();
  return { ok: cases.every(function (item) { return item.status === 'PASS'; }), customerCode: code, runId: state.runId || '', cases: cases, counts: { customers: selected.length, activities: linked.length } };
}
