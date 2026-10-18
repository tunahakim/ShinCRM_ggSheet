/** Bộ kiểm tra riêng của module FBM; chỉ gọi checker Core qua hợp đồng kết quả. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.preflightIssue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'fbm_sync', message: String(message || ''), blocking: blocking === true });
};

/** Số mã bản ghi tối đa nêu trong một cảnh báo preflight. */
FbmSync.PREFLIGHT_ID_LIST_MAX = 8;

/** Hash mỗi bản ghi có baseline trên bản đọc chung `localScan`; quyền đẩy và tóm tắt hash dùng chung kết quả. Đọc lỗi đã ném ở `localScan`: coi như Sheet trống thì phiên chạy tiếp trên dữ liệu sai (FBM-022). */
FbmSync.preflightLocalScan = function (scan, gate) {
  var result = {};
  ['customer', 'activity'].forEach(function (entity) {
    result[entity] = scan.records(entity).map(function (record) {
      var baseline = String(record && record.fbmHash || '').trim();
      return { record: record, baseline: baseline, hash: baseline ? scan.hash(record, entity, gate || {}) : '' };
    });
  });
  return result;
};

FbmSync.preflightPushPermissions = function (issues, mode, scan) {
  var customers = {}, counts = { customer: 0, activity: 0 }, frozen = { customer: [], activity: [] }, invalid = { customer: [], activity: [] }, pending = String(FbmSync.SYNC_STATUS && FbmSync.SYNC_STATUS.pending || 'chờ đối soát');
  scan.customer.forEach(function (item) { customers[String(item.record.id || '')] = item.record; });
  ['customer', 'activity'].forEach(function (entity) {
    scan[entity].forEach(function (item) {
      var record = item.record, parent = entity === 'activity' ? customers[String(record.customerId || '')] : null;
      var own = FbmSync.syncPermission(record, entity);
      if (own.invalid) { invalid[entity].push(String(record.id || '')); return; }
      var changed = !item.baseline || item.hash !== item.baseline || String(record.syncStatus || '') === pending;
      if (!changed) { return; }
      if (!FbmSync.syncPermission(record, entity, parent).push) { counts[entity] += 1; return; }
      if (FbmSync.isPushFrozen(record, parent)) { frozen[entity].push(String(record.id || '')); }
    });
  });
  Object.keys(counts).forEach(function (entity) {
    var label = entity === 'activity' ? 'Activity' : 'Customer';
    if (counts[entity]) { FbmSync.preflightIssue(issues, 'FBM_RECORD_PUSH_PERMISSION_MISSING', 'warn', entity, 'Có ' + counts[entity] + ' bản ghi ' + label + ' đã thay đổi nhưng ô "Cho phép đồng bộ FBM" không cho đẩy lên FBM.', false); }
    if (frozen[entity].length) {
      var frozenShown = frozen[entity].slice(0, FbmSync.PREFLIGHT_ID_LIST_MAX).join(', ') + (frozen[entity].length > FbmSync.PREFLIGHT_ID_LIST_MAX ? '…' : '');
      FbmSync.preflightIssue(issues, 'FBM_RECORD_PUSH_FROZEN', 'warn', entity, frozen[entity].length + ' bản ghi ' + label + ' đã sửa trên Sheet nhưng không đẩy lên FBM vì bản ghi hoặc khách của nó đang mang "' + FbmSync.SYNC_STATUS.missing + '" hoặc "' + FbmSync.SYNC_STATUS.transferred + '": ' + frozenShown + '. Nội dung sửa vẫn giữ trên Sheet.', false);
    }
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

/** `scan` là bản đọc `localScan` của lần kiểm tra; ứng viên đẩy và hàng xung đột đều xét trên đó, không đọc lại Sheet. */
FbmSync.preflightCandidates = function (issues, mode, scan) {
  var gate = { valid: {} }, candidates = [], settings = {};
  try { settings = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {}; } catch (ignoreSettings) {}
  try {
    // Gộp một issue có số đếm: số dòng xung đột tồn đọng không làm phình danh sách issue hay Log.
    var pending = FbmSync.conflictQueue(scan).length;
    if (pending) {
      FbmSync.preflightIssue(issues, 'FBM_RECORD_CONFLICT_PENDING', 'error', 'fbm_sync', 'Có ' + pending + ' bản ghi đang xung đột chờ quyết; mở chế độ xử lý xung đột để quyết từng bản ghi.', mode === 'write');
    }
  } catch (localConflictError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CONFLICT_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được conflict cục bộ: ' + String(localConflictError && localConflictError.message || localConflictError), mode === 'write');
  }
  try {
    var savedStore = FbmSync.pushFailuresRead(), savedFailures = savedStore.hashes, savedDetails = savedStore.details;
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
      (FbmSync.pushCandidates(entity, scan) || []).forEach(function (candidate) {
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

/**
 * Kiểm tra trước phiên tách theo chi phí (tài liệu 09/02 Phần 3 "Thứ tự trong một kỳ"): phần rẻ (`preflightGates`) chạy trước mọi request FBM vì cấu hình sai thì không được chạm FBM; phần đắt (`preflightLocal`) đọc cả hai Sheet và tính hash, chỉ chạy khi chiều chạy cần và sau khi phiên FBM đã xác thực, để FBM lỗi thì không phí công tính.
 * Lệnh chẩn đoán gọi hàm này để chạy cả hai liền nhau.
 */
FbmSync.runPreflight = function (options) {
  return FbmSync.withLocalSnapshot(function () {
    var gates = FbmSync.preflightGates(options);
    return FbmSync.preflightNeedsLocal(options) ? FbmSync.preflightLocal(options, gates.issues) : gates;
  });
};

/** Kết quả quét local chỉ có người dùng ở chiều đẩy lên FBM và Kiểm tra an toàn; chiều Lấy và hai lệnh kiểm liên kết không đẩy gì nên không quét. */
FbmSync.preflightNeedsLocal = function (options) {
  var opt = options || {};
  return FbmSync.modeOf(opt.mode) !== 'read' && opt.scan !== 'identity_check' && opt.scan !== 'identity_probe';
};

/** Gói kết quả kiểm tra; `local` là số liệu của phần đắt nếu đã chạy. */
FbmSync.preflightResult = function (mode, issues, local) {
  var blocking = issues.filter(function (item) { return item.blocking; });
  return { ok: blocking.length === 0, mode: mode, issues: issues, blocking: blocking, warnings: issues.filter(function (item) { return !item.blocking; }), candidateCount: local ? local.candidateCount : 0, hashSummary: local ? local.hashSummary : null };
};

/** Phần rẻ: Config, Category lõi, liên kết tài khoản, phạm vi khách; không đọc bản ghi Customer/Activity. */
FbmSync.preflightGates = function (options) {
  var opt = options || {}, mode = FbmSync.modeOf(opt.mode), writeMode = FbmSync.canWriteFbm(mode), core = typeof shinCorePreflight === 'function' ? shinCorePreflight({ mode: writeMode ? 'write' : mode }) : { issues: [], params: {}, category: { categories: {} } }, issues = (core.issues || []).slice(), params = core.params || {};
  if (typeof FbmSync.identityPreflight === 'function') {
    // Both identity actions are recovery tools: they must remain usable when
    // existing FBM IDs require a rebind. Ordinary read/write/background runs
    // stay fail-closed until the binding has been checked.
    var identityMode = (opt.scan === 'identity_check' || opt.scan === 'identity_probe') ? 'identity_check' : (opt.origin === 'background' ? 'background' : mode);
    var identity = FbmSync.identityPreflight(identityMode);
    if (identity.blocking) { FbmSync.preflightIssue(issues, identity.status && identity.status.status === 'UNBOUND' ? 'FBM_IDENTITY_UNBOUND' : 'REBIND_REQUIRED', 'error', 'Identity', identity.message, true); }
    else if (identity.status && identity.status.status === 'REBIND_REQUIRED') { FbmSync.preflightIssue(issues, 'REBIND_REQUIRED', 'warn', 'Identity', identity.message, false); }
  }
  // Hai lệnh kiểm liên kết chỉ đọc toàn bộ để đối chiếu danh tính, không ghi bản ghi nào, nên không cần phạm vi khách chỉ định.
  if (opt.scan !== 'identity_check' && opt.scan !== 'identity_probe' && typeof FbmSync.scope === 'function') {
    var scope = FbmSync.scope();
    if (scope && !scope.codes.length) { FbmSync.preflightIssue(issues, 'FBM_SCOPE_EMPTY', 'error', 'fbm_sync', 'Phạm vi đồng bộ đang là "Chỉ khách chỉ định" nhưng danh sách khách chỉ định còn trống. Vào Cài đặt phiên, thêm mã khách hoặc bỏ giới hạn rồi chạy lại.', true); }
    // Khách bị xóa khỏi Sheet sau khi lưu danh sách: lượt vẫn chạy cho phần còn lại nhưng phải báo, không bỏ qua im lặng.
    if (scope && scope.notFound.length) { FbmSync.preflightIssue(issues, 'FBM_SCOPE_CODE_NOT_FOUND', 'warn', 'fbm_sync', 'Mã khách ShinCRM trong danh sách khách chỉ định không còn trên Sheet Customer, lượt này bỏ qua: ' + scope.notFound.join(', ') + '.', false); }
  }
  if (mode === 'read' || mode === 'write') { FbmSync.preflightVerifyStatus(issues, params, core.category); }
  return FbmSync.preflightResult(mode, issues, null);
};

/** Phần đắt; `issues` là vấn đề của phần rẻ để kết quả trả về đủ cả hai. Hai Sheet đọc đúng một lần qua `localScan` và mọi bước dùng chung bản đọc đó. */
FbmSync.preflightLocal = function (options, issues) {
  var mode = FbmSync.modeOf(options && options.mode), checkMode = FbmSync.canWriteFbm(mode) ? 'write' : mode, list = (issues || []).slice(), scan = null;
  try { scan = FbmSync.localScan(); scan.records('customer'); scan.records('activity'); } catch (localError) {
    FbmSync.preflightIssue(list, 'FBM_LOCAL_READ_FAILED', 'error', 'fbm_sync', 'Không đọc được Sheet Customer/Activity trước phiên: ' + String(localError && localError.message || localError), true);
    return FbmSync.preflightResult(mode, list, null);
  }
  var report = FbmSync.preflightCandidates(list, checkMode, scan), local = FbmSync.preflightLocalScan(scan, report.gate || {});
  FbmSync.preflightPushPermissions(list, checkMode, local);
  return FbmSync.preflightResult(mode, list, { candidateCount: report.candidates.length, hashSummary: FbmSync.preflightHashSummary(local) });
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

/** Chiều lấy cần giá trị Xác thực mặc định hợp lệ trước khi ghi khách mới; thiếu thì dừng lượt, không ghi giá trị sai. */
FbmSync.preflightVerifyStatus = function (issues, params, category) {
  var value = String(params && params[FBM_VERIFY_STATUS_CONFIG_NAME] || '').trim(), source = DATA_SCHEMA.customer.verifyStatus.source;
  var allowed = category && category.categories && category.categories[source] || [];
  if (!value) { FbmSync.preflightIssue(issues, 'FBM_VERIFY_STATUS_DEFAULT_MISSING', 'error', 'Config', 'Chưa chọn giá trị Xác thực mặc định cho khách kéo từ FBM. Vào sheet Config, chọn ô ' + FBM_VERIFY_STATUS_CONFIG_NAME + ' rồi chạy lại.', true); return; }
  if (allowed.indexOf(value) < 0) { FbmSync.preflightIssue(issues, 'FBM_VERIFY_STATUS_DEFAULT_INVALID', 'error', 'Config', 'Giá trị Xác thực mặc định "' + value + '" không còn trong danh mục Xác thực ở sheet Category. Vào sheet Config, chọn lại ô ' + FBM_VERIFY_STATUS_CONFIG_NAME + ' rồi chạy lại.', true); }
};
