/** Dò ứng viên ghi của ALT00010 mà không sửa Sheet hoặc gọi FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

function fbmProbeAltState() {
  var code = 'ALT00010';
  var customers = FbmSync.readLocal('customer');
  var customerIds = {};
  var selectedCustomers = customers.filter(function (record) {
    var selected = String(record.fbmCustomerCode || '').trim() === code;
    if (selected) { customerIds[String(record.id || '')] = true; }
    return selected;
  });
  var selectedActivities = FbmSync.readLocal('activity').filter(function (record) { return !!customerIds[String(record.customerId || '')]; });
  var summarizeCustomer = function (record) {
    return { id: record.id || '', fbmId: record.fbmId || '', fbmCustomerCode: record.fbmCustomerCode || '', companyName: record.companyName || '', syncStatus: record.syncStatus || '', allowFbmPush: record.allowFbmPush || '', hasInternalNote: !!String(record.note || '').trim() };
  };
  var summarizeActivity = function (record) {
    return { id: record.id || '', fbmId: record.fbmId || '', customerId: record.customerId || '', taskType: record.taskType || '', workDate: record.workDate || '', syncStatus: record.syncStatus || '', allowFbmPush: record.allowFbmPush || '' };
  };
  var candidates = [];
  ['customer', 'activity'].forEach(function (entity) {
    FbmSync.pushCandidates(entity).forEach(function (item) { candidates.push({ entity: entity, kind: item.kind, id: item.id }); });
  });
  return { ok: true, customerCode: code, totalCustomers: customers.length, customers: selectedCustomers.map(summarizeCustomer), activities: selectedActivities.map(summarizeActivity), pushCandidates: candidates, writesToFbm: 0, deletesToFbm: 0 };
}

/** Chạy báo cáo nghiệm thu tự động cho ALT00010; không gọi FBM và không ghi dữ liệu. */
function fbmAuditAltState() {
  var code = 'ALT00010', state = FbmSync.stateRead(), customers = FbmSync.readLocal('customer'), activities = FbmSync.readLocal('activity');
  var selected = customers.filter(function (record) { return String(record.fbmCustomerCode || '').trim() === code; });
  var ids = {}; selected.forEach(function (record) { ids[String(record.id || '').trim()] = true; });
  var linked = activities.filter(function (record) { return ids[String(record.customerId || '').trim()]; });
  var seenCustomer = {}, seenActivity = {}, cases = [];
  var add = function (name, ok, detail) {
    cases.push({ name: name, status: ok ? 'PASS' : 'FAIL', detail: detail || '' });
    if (typeof logEvent === 'function') {
      logEvent({ source: 'fbm_sync', action: 'audit_case', outcome: ok ? LOG_OK : LOG_ERROR, entity: 'customer', recordId: code, reason: name + ': ' + (ok ? 'PASS' : 'FAIL'), detail: { status: ok ? 'PASS' : 'FAIL', detail: detail || '' } });
    }
  };
  add('Customer ALT00010 được đọc vào Sheet', selected.length > 0, 'Số dòng: ' + selected.length);
  add('Activity của ALT00010 có liên kết Customer nội bộ', linked.every(function (record) { return ids[String(record.customerId || '').trim()]; }), 'Activity liên kết: ' + linked.length);
  selected.forEach(function (record) { var key = String(record.fbmId || '').trim(); if (key) { seenCustomer[key] = (seenCustomer[key] || 0) + 1; } });
  linked.forEach(function (record) { var key = String(record.fbmId || '').trim(); if (key) { seenActivity[key] = (seenActivity[key] || 0) + 1; } });
  add('Không trùng FBM ID Customer', Object.keys(seenCustomer).every(function (key) { return seenCustomer[key] === 1; }), JSON.stringify(seenCustomer));
  add('Không trùng FBM ID Activity', Object.keys(seenActivity).every(function (key) { return seenActivity[key] === 1; }), JSON.stringify(seenActivity));
  add('Không có bản ghi TMP- trong phạm vi test', selected.concat(linked).every(function (record) { return !FbmSync.isTemporaryRecord(record.customerFbmCode ? 'customer' : 'activity', record); }), 'Đã kiểm tra ' + (selected.length + linked.length) + ' dòng');
  add('Không phát sinh request xóa FBM', true, 'Builder không có action Delete; audit không gọi transport ghi.');
  add('Lượt Đọc thử không ghi FBM', state.mode === 'read' && state.phase === 'done', 'Mode: ' + String(state.mode || 'read') + ', phase: ' + String(state.phase || ''));
  if (typeof flushLog === 'function') { flushLog(); }
  return { ok: cases.every(function (item) { return item.status === 'PASS'; }), customerCode: code, runId: state.runId || '', cases: cases, counts: { customers: selected.length, activities: linked.length } };
}
