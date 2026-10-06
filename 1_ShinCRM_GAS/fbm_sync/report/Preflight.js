/** Bộ kiểm tra riêng của module FBM; chỉ gọi checker Core qua hợp đồng kết quả. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.preflightIssue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'fbm_sync', message: String(message || ''), blocking: blocking === true });
};

FbmSync.preflightCategories = function (issues, category, mode) {
  var allowValues = category && category.categories && category.categories['@CAT_CHO_PHEP_FBM'] || [];
  if (allowValues.indexOf(String(FbmSync.PUSH_ALLOW_VALUE || 'Cho phép')) < 0) {
    FbmSync.preflightIssue(issues, 'FBM_CATEGORY_PUSH_PERMISSION_MISSING', 'error', 'Category', 'Category chưa có giá trị "Cho phép" ở @CAT_CHO_PHEP_FBM; không thể cấu hình quyền đẩy rõ ràng.', mode === 'write');
  }
};

FbmSync.preflightPushPermissions = function (issues, mode, gate) {
  var customers = {}, counts = { customer: 0, activity: 0 };
  try { (FbmSync.readLocal('customer') || []).forEach(function (record) { customers[String(record.id || '')] = record; }); } catch (ignoreCustomers) {}
  ['customer', 'activity'].forEach(function (entity) {
    var records = [];
    try { records = FbmSync.readLocal(entity) || []; } catch (ignoreRecords) { return; }
    records.forEach(function (record) {
      var parent = entity === 'activity' ? customers[String(record.customerId || '')] : null;
      var permission = typeof FbmSync.pushPermission === 'function' ? FbmSync.pushPermission(record, entity, parent) : { push: true };
      if (permission.push) { return; }
      var currentHash = typeof FbmSync.hash === 'function' ? FbmSync.hash(record, entity, gate || {}) : '';
      var changed = !String(record.fbmHash || '').trim() || currentHash !== String(record.fbmHash || '').trim() || String(record.syncStatus || '') === String(FbmSync.SYNC_STATUS && FbmSync.SYNC_STATUS.pending || 'chờ đối soát');
      if (!changed) { return; }
      counts[entity] += 1;
    });
  });
  Object.keys(counts).forEach(function (entity) {
    if (counts[entity]) { FbmSync.preflightIssue(issues, 'FBM_RECORD_PUSH_PERMISSION_MISSING', 'warn', entity, 'Có ' + counts[entity] + ' bản ghi ' + (entity === 'activity' ? 'Activity' : 'Customer') + ' đã thay đổi nhưng chưa bật "Cho phép đẩy FBM".', false); }
  });
};

/** Tổng hợp đúng một lần số liệu hash local cho log bước preflight, không ghi theo record. */
FbmSync.preflightHashSummary = function (gate) {
  var summary = { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0, customer: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 }, activity: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 } };
  ['customer', 'activity'].forEach(function (entity) {
    var records = [];
    try { records = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal(entity) || [] : []; } catch (ignore) { records = []; }
    records.forEach(function (record) {
      var item = summary[entity], baseline = String(record && record.fbmHash || '').trim(), linked = entity === 'customer'
        ? !!String(record && (record.fbmId || record.fbmCustomerCode) || '').trim()
        : !!String(record && record.fbmId || '').trim();
      summary.localRecords += 1; item.localRecords += 1;
      if (!baseline) {
        summary.withoutBaseline += 1; item.withoutBaseline += 1;
        if (!linked) { summary.newRecords += 1; item.newRecords += 1; }
        return;
      }
      var current = typeof FbmSync.hash === 'function' ? String(FbmSync.hash(record, entity, gate || {})) : '';
      summary.baselineComparable += 1; item.baselineComparable += 1;
      if (current === baseline) { summary.unchanged += 1; item.unchanged += 1; }
      else { summary.changed += 1; item.changed += 1; }
    });
  });
  return summary;
};

FbmSync.preflightCandidates = function (issues, mode) {
  var gate = { valid: {} }, candidates = [], settings = {};
  try { settings = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {}; } catch (ignoreSettings) {}
  try {
    // Gộp một issue có số đếm: số dòng xung đột tồn đọng không làm phình danh sách issue hay Log.
    var pending = FbmSync.conflictQueue().length;
    if (pending) {
      FbmSync.preflightIssue(issues, 'FBM_RECORD_CONFLICT_PENDING', 'error', 'fbm_sync', 'Có ' + pending + ' bản ghi đang xung đột chờ quyết; mở chế độ xử lý xung đột để quyết từng bản ghi.', mode === 'write');
    }
  } catch (localConflictError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CONFLICT_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được conflict cục bộ: ' + String(localConflictError && localConflictError.message || localConflictError), mode === 'write');
  }
  try {
    var savedState = typeof FbmSync.stateRead === 'function' ? FbmSync.stateRead() : {}, savedFailures = savedState.metadata && savedState.metadata.pushFailures || {}, savedDetails = savedState.metadata && savedState.metadata.pushFailureDetails || {};
    Object.keys(savedFailures).forEach(function (key) {
      var detail = savedDetails[key] || {}, reason = detail.reason || 'Bản ghi đã từng lỗi đẩy; hệ đang chặn gửi lại khi dữ liệu local chưa đổi.';
      FbmSync.preflightIssue(issues, 'FBM_PREVIOUS_PUSH_FAILURE', 'error', String(key).split(':')[0] || 'fbm_sync', 'Bản ghi ' + key + ' có lỗi đẩy trước đó: ' + reason, mode === 'write');
    });
  } catch (savedFailureError) {
    FbmSync.preflightIssue(issues, 'FBM_FAILURE_STATE_READ_FAILED', 'error', 'fbm_sync', 'Không đọc được trạng thái lỗi đẩy trước đó: ' + String(savedFailureError && savedFailureError.message || savedFailureError), mode === 'write');
  }
  try { if (typeof FbmSync.readCategoryGate === 'function') { gate = FbmSync.readCategoryGate() || gate; } } catch (gateError) {
    FbmSync.preflightIssue(issues, 'FBM_CATEGORY_GATE_FAILED', 'error', 'Category', 'Không dựng được ánh xạ Category FBM: ' + String(gateError && gateError.message || gateError), mode === 'write');
  }
  try {
    if (typeof FbmSync.pushCandidates !== 'function') { return { candidates: candidates, gate: gate, settings: settings, hashSummary: FbmSync.preflightHashSummary(gate) }; }
    ['customer', 'activity'].forEach(function (entity) {
      (FbmSync.pushCandidates(entity) || []).forEach(function (candidate) {
        candidate.entity = entity;
        candidates.push(candidate);
        var record = candidate.record || {};
        var ownerError = typeof FbmSync.pushOwnerError === 'function' ? FbmSync.pushOwnerError(candidate, settings) : '';
        if (ownerError) {
          FbmSync.preflightIssue(issues, 'FBM_ACTIVITY_OWNER_MISMATCH', 'error', entity, ownerError, mode === 'write');
        }
        var fields = entity === 'customer'
          ? [['@CAT_TINH_THANH', FbmSync.value(record, 'province', '')], ['@CAT_NGUON_KH', FbmSync.value(record, 'leadSource', '')], ['@CAT_SAN_PHAM', FbmSync.value(record, 'product', '')]]
          : [['@CAT_CONG_VIEC', FbmSync.value(record, 'taskType', '')]];
        fields.forEach(function (field) {
          var value = String(field[1] === null || field[1] === undefined ? '' : field[1]).trim();
          var valid = gate.valid && gate.valid[field[0]];
          if (value && (!valid || !valid[value])) {
            FbmSync.preflightIssue(issues, 'FBM_CATEGORY_MAPPING_MISSING', 'error', entity, 'Bản ghi ' + String(candidate.id || '') + ' dùng danh mục "' + value + '" nhưng Category chưa có ánh xạ FBM cho ' + field[0] + '.', mode === 'write');
          }
        });
        if (candidate.kind === 'create' && entity === 'customer' && (!String(settings.customerPrefix || '').trim() || !String(settings.customerCodeLength || '').trim())) {
          FbmSync.preflightIssue(issues, 'FBM_CUSTOMER_CODE_CONFIG_MISSING', 'error', 'Config', 'Ứng viên tạo Customer ' + String(candidate.id || '') + ' cần tiền tố và độ dài mã khách FBM.', mode === 'write');
        }
      });
    });
  } catch (candidateError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CANDIDATE_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được ứng viên local trước phiên: ' + String(candidateError && candidateError.message || candidateError), mode === 'write');
  }
  return { candidates: candidates, gate: gate, settings: settings, hashSummary: FbmSync.preflightHashSummary(gate) };
};

/** Quét điều kiện local; lookup live/owner vẫn được đối chiếu sau response FBM. */
FbmSync.runPreflight = function (options) {
  var opt = options || {}, mode = opt.mode === 'write' || opt.mode === 'push' ? opt.mode : opt.mode === 'check' ? 'check' : 'read', writeMode = mode === 'write' || mode === 'push', core = typeof shinCorePreflight === 'function' ? shinCorePreflight({ mode: writeMode ? 'write' : mode }) : { issues: [], params: {}, category: { categories: {} } }, issues = (core.issues || []).slice(), params = core.params || {};
  if (typeof FbmSync.identityPreflight === 'function') {
    // Both identity actions are recovery tools: they must remain usable when
    // existing FBM IDs require a rebind. Ordinary read/write/background runs
    // stay fail-closed until the binding has been checked.
    var identityMode = (opt.scan === 'identity_check' || opt.scan === 'identity_probe') ? 'identity_check' : (opt.origin === 'background' ? 'background' : mode);
    var identity = FbmSync.identityPreflight(identityMode);
    if (identity.blocking) { FbmSync.preflightIssue(issues, identity.status && identity.status.status === 'UNBOUND' ? 'FBM_IDENTITY_UNBOUND' : 'REBIND_REQUIRED', 'error', 'Identity', identity.message, true); }
    else if (identity.status && identity.status.status === 'REBIND_REQUIRED') { FbmSync.preflightIssue(issues, 'REBIND_REQUIRED', 'warn', 'Identity', identity.message, false); }
  }
  FbmSync.preflightCategories(issues, core.category || {}, writeMode ? 'write' : mode);
  var candidateReport = FbmSync.preflightCandidates(issues, writeMode ? 'write' : mode);
  FbmSync.preflightPushPermissions(issues, writeMode ? 'write' : mode, candidateReport.gate || {});
  var blocking = issues.filter(function (item) { return item.blocking; });
  return { ok: blocking.length === 0, mode: mode, issues: issues, blocking: blocking, warnings: issues.filter(function (item) { return !item.blocking; }), candidateCount: candidateReport.candidates.length, hashSummary: candidateReport.hashSummary || FbmSync.preflightHashSummary(candidateReport.gate || {}) };
};

FbmSync.logPreflight = function (result) {
  // Một dòng cho mỗi mã vấn đề; thông điệp mang mã bản ghi nên gom theo mã để số dòng không tăng theo số bản ghi.
  if (!result || !Array.isArray(result.issues) || !result.issues.length || typeof logEvent !== 'function') { return 0; }
  var groups = {}, order = [];
  result.issues.forEach(function (item) {
    var code = String(item && item.code || 'FBM_PREFLIGHT_ISSUE');
    if (!groups[code]) { groups[code] = { item: item, count: 0, messages: [] }; order.push(code); }
    groups[code].count += 1;
    if (groups[code].messages.length < FbmSync.RECORD_ISSUE_ID_LIMIT) { groups[code].messages.push(String(item && item.message || '')); }
  });
  order.forEach(function (code) {
    var group = groups[code], item = group.item;
    logEvent({ source: 'fbm_sync', action: 'preflight_issue', outcome: item.blocking ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn'), entity: String(item.scope || ''), reason: String(item.message || code) + (group.count > 1 ? ' (và ' + (group.count - 1) + ' vấn đề cùng loại)' : ''), detail: { code: code, blocking: !!item.blocking, count: group.count, messages: group.messages } });
  });
  return order.length;
};
