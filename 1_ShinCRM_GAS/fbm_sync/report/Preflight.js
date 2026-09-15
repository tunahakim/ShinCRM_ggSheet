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

FbmSync.preflightCandidates = function (issues, mode) {
  var gate = { valid: {} }, candidates = [], settings = {};
  try { settings = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {}; } catch (ignoreSettings) {}
  var reportedConflicts = {};
  try {
    if (typeof FbmSync.readLocal === 'function') {
      ['customer', 'activity'].forEach(function (entity) {
        (FbmSync.readLocal(entity) || []).forEach(function (record) {
          var id = String(record && record.id || '').trim();
          if (!id || String(record.syncStatus || '') !== String(FbmSync.SYNC_STATUS && FbmSync.SYNC_STATUS.conflict || 'xung đột chờ quyết')) { return; }
          reportedConflicts[entity + ':' + id] = true;
          FbmSync.preflightIssue(issues, 'FBM_RECORD_CONFLICT_PENDING', 'error', entity, 'Bản ghi ' + id + ' đang xung đột chờ quyết; không được tự động ghi đè.', mode === 'write');
        });
      });
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
    if (typeof FbmSync.pushCandidates !== 'function') { return { candidates: candidates, gate: gate, settings: settings }; }
    ['customer', 'activity'].forEach(function (entity) {
      (FbmSync.pushCandidates(entity) || []).forEach(function (candidate) {
        candidate.entity = entity;
        candidates.push(candidate);
        var record = candidate.record || {};
        var ownerError = typeof FbmSync.pushOwnerError === 'function' ? FbmSync.pushOwnerError(candidate, settings) : '';
        if (ownerError) {
          FbmSync.preflightIssue(issues, 'FBM_ACTIVITY_OWNER_MISMATCH', 'error', entity, ownerError, mode === 'write');
        }
        if (String(record.syncStatus || '') === String(FbmSync.SYNC_STATUS && FbmSync.SYNC_STATUS.conflict || 'xung đột chờ quyết') && !reportedConflicts[entity + ':' + String(candidate.id || '')]) {
          FbmSync.preflightIssue(issues, 'FBM_RECORD_CONFLICT_PENDING', 'error', entity, 'Bản ghi ' + String(candidate.id || '') + ' đang xung đột chờ quyết; không được tự động ghi đè.', mode === 'write');
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
          FbmSync.preflightIssue(issues, 'FBM_CUSTOMER_CODE_CONFIG_MISSING', 'error', 'Config', 'Ứng viên tạo Customer ' + String(candidate.id || '') + ' cần FBM_MA_KH_PREFIX và FBM_MA_KH_LENGTH.', mode === 'write');
        }
      });
    });
  } catch (candidateError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CANDIDATE_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được ứng viên local trước phiên: ' + String(candidateError && candidateError.message || candidateError), mode === 'write');
  }
  return { candidates: candidates, gate: gate, settings: settings };
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
  if (!String(params.FBM_MA_KH_PREFIX || '').trim() || !String(params.FBM_MA_KH_LENGTH || '').trim()) { FbmSync.preflightIssue(issues, 'FBM_CUSTOMER_CODE_CONFIG_INCOMPLETE', 'warn', 'Config', 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH; chỉ ảnh hưởng khi tạo Customer mới.', false); }
  if (!String(params.FBM_ACTIVITY_SINCE || '').trim()) { FbmSync.preflightIssue(issues, 'FBM_ACTIVITY_SINCE_MISSING', 'warn', 'Config', 'Thiếu FBM_ACTIVITY_SINCE; hệ sẽ dùng phạm vi đọc mặc định hiện tại.', false); }
  FbmSync.preflightCategories(issues, core.category || {}, writeMode ? 'write' : mode);
  var candidateReport = FbmSync.preflightCandidates(issues, writeMode ? 'write' : mode);
  FbmSync.preflightPushPermissions(issues, writeMode ? 'write' : mode, candidateReport.gate || {});
  var blocking = issues.filter(function (item) { return item.blocking; });
  return { ok: blocking.length === 0, mode: mode, issues: issues, blocking: blocking, warnings: issues.filter(function (item) { return !item.blocking; }), candidateCount: candidateReport.candidates.length };
};

FbmSync.logPreflight = function (result) {
  if (!result || !Array.isArray(result.issues) || typeof logEvent !== 'function') { return; }
  result.issues.forEach(function (item) {
    logEvent({ source: 'fbm_sync', action: 'preflight', outcome: item.blocking ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn'), entity: item.scope || '', recordId: '', reason: item.message, detail: { code: item.code, severity: item.severity, blocking: item.blocking, mode: result.mode } });
  });
};
