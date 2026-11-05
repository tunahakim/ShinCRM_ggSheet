/** Phần preflight của chặng đẩy: đếm đúng tập ứng viên chặng đẩy sẽ dựng, dòng bị chặn quyền và dấu vân lệch mốc. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Một lần duyệt mọi dòng bằng đúng phép xét của chặng đẩy (`pushEligible`, `pushReview`) trên cổng danh mục và dấu vân của `context`: ứng viên, dòng bị chặn đẩy và dấu vân cho tóm tắt hash đều từ cùng một lần xét, nên số preflight báo là đúng tập chặng đẩy dựng.
 * Trả `{ candidates, rows, noPermission, frozen, invalid }`; `rows[entity]` là `{ record, baseline, hash }` của mọi dòng (dấu vân chỉ tính cho dòng có mốc). Đọc lỗi đã ném ở `localScan`: coi như Sheet trống thì phiên chạy tiếp trên dữ liệu sai (FBM-022).
 */
FbmSync.preflightPushReview = function (scan, context) {
  var result = { candidates: [], rows: {}, noPermission: { customer: 0, activity: 0 }, frozen: { customer: [], activity: [] }, invalid: { customer: [], activity: [] } };
  ['customer', 'activity'].forEach(function (entity) {
    result.rows[entity] = FbmSync.pushScanRows(entity, scan).map(function (row) {
      var record = row.record, id = String(record.id || ''), baseline = String(record.fbmHash || '').trim(), verdict = FbmSync.pushEligible(entity, record, row.parent, context);
      if (verdict.eligible) {
        var candidate = FbmSync.pushCandidateBuild(entity, record, row.parent, verdict, context);
        if (candidate) { result.candidates.push(candidate); }
      } else if (verdict.reason === 'permissionInvalid') {
        result.invalid[entity].push(id);
      } else if ((verdict.reason === 'noPermission' || verdict.reason === 'frozen') && FbmSync.pushChanged(record, context.hash(record, entity))) {
        if (verdict.reason === 'noPermission') { result.noPermission[entity] += 1; } else { result.frozen[entity].push(id); }
      }
      return { record: record, baseline: baseline, hash: baseline ? context.hash(record, entity) : '' };
    });
  });
  return result;
};

/** Cảnh báo dòng đã sửa mà không được đẩy (thiếu quyền, đóng băng) và dòng có ô quyền sai, từ kết quả `preflightPushReview`. */
FbmSync.preflightPushPermissions = function (issues, review) {
  var counts = review.noPermission, frozen = review.frozen, invalid = review.invalid;
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
FbmSync.preflightHashSummary = function (rows) {
  var summary = { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0, customer: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 }, activity: { localRecords: 0, baselineComparable: 0, changed: 0, unchanged: 0, newRecords: 0, withoutBaseline: 0 } };
  ['customer', 'activity'].forEach(function (entity) {
    rows[entity].forEach(function (entry) {
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

/**
 * `scan` là bản đọc `localScan` của lần kiểm tra; ứng viên đẩy và hàng xung đột đều xét trên đó, không đọc lại Sheet.
 * Chỉ lỗi chung (đọc dữ liệu hỏng, không dựng được ánh xạ danh mục, thiếu cấu hình chung) mới chặn phiên. Lỗi của riêng một bản ghi chỉ là cảnh báo: dòng xung đột và bản ghi từng đẩy lỗi bị phép xét một dòng (`pushEligible`) loại, bản ghi lệch người phụ trách, thiếu ánh xạ danh mục hoặc thiếu trường bị chặng đẩy đánh dấu chờ sửa; preflight báo trước và không tính chúng vào số ứng viên.
 * Trả `review` là kết quả `preflightPushReview` (thiếu khi không dựng được phép xét) và `conflictPending` là số dòng xung đột chờ quyết để người điều phối ghi Log; hàm này không tự ghi.
 */
FbmSync.preflightCandidates = function (issues, mode, scan) {
  var candidates = [], review = null, settings = {}, settingsOk = true, conflictPending = 0, blockWrite = mode === 'write';
  try { settings = FbmSync.scriptSettings(); } catch (settingsError) {
    settingsOk = false;
    FbmSync.preflightIssue(issues, 'FBM_SETTINGS_READ_FAILED', 'error', 'Cài đặt', 'Không đọc được cài đặt đồng bộ FBM trước phiên: ' + String(settingsError && settingsError.message || settingsError), blockWrite);
  }
  try {
    conflictPending = FbmSync.conflictQueue(scan).length;
  } catch (localConflictError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CONFLICT_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được conflict cục bộ: ' + String(localConflictError && localConflictError.message || localConflictError), blockWrite);
  }
  try {
    var savedStore = FbmSync.pushFailuresRead(), savedFailures = savedStore.hashes, savedDetails = savedStore.details;
    Object.keys(savedFailures).forEach(function (key) {
      var detail = savedDetails[key] || {}, reason = detail.reason || 'Bản ghi đã từng lỗi đẩy; hệ đang chặn gửi lại khi dữ liệu local chưa đổi.';
      FbmSync.preflightIssue(issues, 'FBM_PREVIOUS_PUSH_FAILURE', 'warn', String(key).split(':')[0] || 'fbm_sync', 'Bản ghi ' + key + ' có lỗi đẩy trước đó, lượt này bỏ qua bản ghi đó: ' + reason, false);
    });
  } catch (savedFailureError) {
    FbmSync.preflightIssue(issues, 'FBM_FAILURE_STATE_READ_FAILED', 'error', 'fbm_sync', 'Không đọc được trạng thái lỗi đẩy trước đó: ' + String(savedFailureError && savedFailureError.message || savedFailureError), blockWrite);
  }
  var context = null;
  try { context = FbmSync.pushReviewContext(FbmSync.stateRead(), scan, settingsOk ? settings : {}); } catch (gateError) {
    FbmSync.preflightIssue(issues, 'FBM_CATEGORY_GATE_FAILED', 'error', 'Category', 'Không dựng được ánh xạ Category FBM: ' + String(gateError && gateError.message || gateError), blockWrite);
    return { candidates: candidates, review: null, settings: settings, conflictPending: conflictPending };
  }
  try {
    // Cùng phép xét với chặng đẩy: dòng chờ người sửa chưa đánh dấu chỉ là cảnh báo; dòng đã đánh dấu thì phép xét coi là không có việc nên không báo lại mỗi lượt.
    var holdCodes = { owner: 'FBM_ACTIVITY_OWNER_MISMATCH', category: 'FBM_CATEGORY_MAPPING_MISSING', eligibility: 'FBM_PUSH_INELIGIBLE' };
    review = FbmSync.preflightPushReview(scan, context);
    review.candidates.forEach(function (candidate) {
      var entity = candidate.entity;
      if (candidate.hold) { FbmSync.preflightIssue(issues, holdCodes[candidate.hold.code], 'warn', entity, candidate.hold.reason, false); } else { candidates.push(candidate); }
      if (settingsOk && candidate.kind === 'create' && entity === 'customer' && (!String(settings.customerPrefix || '').trim() || !String(settings.customerCodeLength || '').trim())) {
        FbmSync.preflightIssue(issues, 'FBM_CUSTOMER_CODE_CONFIG_MISSING', 'error', 'Cài đặt', 'Ứng viên tạo Customer ' + String(candidate.id || '') + ' cần tiền tố và độ dài mã khách FBM.', blockWrite);
      }
    });
  } catch (candidateError) {
    FbmSync.preflightIssue(issues, 'FBM_LOCAL_CANDIDATE_CHECK_FAILED', 'error', 'fbm_sync', 'Không kiểm tra được ứng viên local trước phiên: ' + String(candidateError && candidateError.message || candidateError), blockWrite);
  }
  return { candidates: candidates, review: review, settings: settings, conflictPending: conflictPending };
};
