/** Bộ kiểm tra riêng của module FBM; chỉ gọi checker Core qua hợp đồng kết quả. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.preflightIssue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'fbm_sync', message: String(message || ''), blocking: blocking === true });
};

/** Số mã bản ghi tối đa nêu trong một cảnh báo preflight. */
FbmSync.PREFLIGHT_ID_LIST_MAX = 8;

/**
 * Đọc Sheet Customer/Activity đúng một lần cho preflight, tính hash mỗi bản ghi có baseline đúng một lần; quyền đẩy và tóm tắt hash dùng chung kết quả.
 * Đọc lỗi thì ném lên: coi như Sheet trống thì preflight báo 0 bản ghi và phiên chạy tiếp trên dữ liệu sai (FBM-022).
 */
FbmSync.preflightLocalScan = function (gate) {
  var scan = {};
  ['customer', 'activity'].forEach(function (entity) {
    scan[entity] = (FbmSync.readLocal(entity) || []).map(function (record) {
      var baseline = String(record && record.fbmHash || '').trim();
      return { record: record, baseline: baseline, hash: baseline ? String(FbmSync.hash(record, entity, gate || {})) : '' };
    });
  });
  return scan;
};

FbmSync.preflightPushPermissions = function (issues, mode, scan) {
  var customers = {}, counts = { customer: 0, activity: 0 }, invalid = { customer: [], activity: [] }, pending = String(FbmSync.SYNC_STATUS && FbmSync.SYNC_STATUS.pending || 'chờ đối soát');
  scan.customer.forEach(function (item) { customers[String(item.record.id || '')] = item.record; });
  ['customer', 'activity'].forEach(function (entity) {
    scan[entity].forEach(function (item) {
      var record = item.record, parent = entity === 'activity' ? customers[String(record.customerId || '')] : null;
      var own = FbmSync.syncPermission(record, entity);
      if (own.invalid) { invalid[entity].push(String(record.id || '')); return; }
      if (FbmSync.syncPermission(record, entity, parent).push) { return; }
      var changed = !item.baseline || item.hash !== item.baseline || String(record.syncStatus || '') === pending;
      if (!changed) { return; }
      counts[entity] += 1;
    });
  });
  Object.keys(counts).forEach(function (entity) {
    var label = entity === 'activity' ? 'Activity' : 'Customer';
    if (counts[entity]) { FbmSync.preflightIssue(issues, 'FBM_RECORD_PUSH_PERMISSION_MISSING', 'warn', entity, 'Có ' + counts[entity] + ' bản ghi ' + label + ' đã thay đổi nhưng ô "Cho phép đồng bộ FBM" không cho đẩy lên FBM.', false); }
    // Nêu mã bản ghi để người dùng tìm được dòng cần sửa; danh sách dài thì cắt bớt để thông báo không bị cổng Log cắt mất phần hướng dẫn.
    if (invalid[entity].length) {
      var shown = invalid[entity].slice(0, FbmSync.PREFLIGHT_ID_LIST_MAX).join(', ') + (invalid[entity].length > FbmSync.PREFLIGHT_ID_LIST_MAX ? '…' : '');
      FbmSync.preflightIssue(issues, 'FBM_SYNC_PERMISSION_INVALID', 'warn', entity, invalid[entity].length + ' bản ghi ' + label + ' có ô "Cho phép đồng bộ FBM" trống hoặc sai giá trị nên không được đẩy lên FBM: ' + shown + '. Hãy chọn lại giá trị trong danh sách.', false);
    }
  });
};

/** Tổng hợp đúng một lần số liệu hash local cho log bước preflight, không ghi theo record. */
FbmSync.preflightHashSummary = function (scan) {
  var summary = { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0, customer: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 }, activity: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 } };
  ['customer', 'activity'].forEach(function (entity) {
    scan[entity].forEach(function (entry) {
      var record = entry.record, item = summary[entity], linked = entity === 'customer'
        ? !!String(record && (record.fbmId || record.fbmCustomerCode) || '').trim()
        : !!String(record && record.fbmId || '').trim();
      summary.localRecords += 1; item.localRecords += 1;
      if (!entry.baseline) {
        summary.withoutBaseline += 1; item.withoutBaseline += 1;
        if (!linked) { summary.newRecords += 1; item.newRecords += 1; }
        return;
      }
      summary.baselineComparable += 1; item.baselineComparable += 1;
      if (entry.hash === entry.baseline) { summary.unchanged += 1; item.unchanged += 1; }
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
        var fields = entity === 'customer'
          ? [['@CAT_TINH_THANH', FbmSync.value(record, 'province', '')], ['@CAT_NGUON_KH', FbmSync.value(record, 'leadSource', '')]]
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
  var candidateReport = FbmSync.preflightCandidates(issues, writeMode ? 'write' : mode);
  var local = null;
  try { local = FbmSync.preflightLocalScan(candidateReport.gate || {}); } catch (localError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_READ_FAILED', 'error', 'fbm_sync', 'Không đọc được Sheet Customer/Activity trước phiên: ' + String(localError && localError.message || localError), true);
  }
  if (local) { FbmSync.preflightPushPermissions(issues, writeMode ? 'write' : mode, local); }
  var blocking = issues.filter(function (item) { return item.blocking; });
  return { ok: blocking.length === 0, mode: mode, issues: issues, blocking: blocking, warnings: issues.filter(function (item) { return !item.blocking; }), candidateCount: candidateReport.candidates.length, hashSummary: local ? FbmSync.preflightHashSummary(local) : null };
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
