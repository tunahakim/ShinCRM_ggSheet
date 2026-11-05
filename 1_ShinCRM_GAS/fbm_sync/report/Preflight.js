/** Bộ kiểm tra riêng của module FBM; chỉ gọi checker Core qua hợp đồng kết quả. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.preflightIssue = function (issues, code, severity, scope, message, blocking) {
  issues.push({ code: String(code || ''), severity: severity || 'error', scope: scope || 'fbm_sync', message: String(message || ''), blocking: blocking === true });
};

/** Số mã bản ghi tối đa nêu trong một cảnh báo preflight. */
FbmSync.PREFLIGHT_ID_LIST_MAX = 8;

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
  return { ok: blocking.length === 0, mode: mode, issues: issues, blocking: blocking, warnings: issues.filter(function (item) { return !item.blocking; }), candidateCount: local ? local.candidateCount : 0, hashSummary: local ? local.hashSummary : null, conflictPending: local ? local.conflictPending : null };
};

/** Phần rẻ: Category lõi, cài đặt kéo từ FBM, liên kết tài khoản, phạm vi khách; không đọc bản ghi Customer/Activity. */
FbmSync.preflightGates = function (options) {
  var opt = options || {}, mode = FbmSync.modeOf(opt.mode), writeMode = FbmSync.canWriteFbm(mode), core = typeof shinCorePreflight === 'function' ? shinCorePreflight({ mode: writeMode ? 'write' : mode }) : { issues: [], category: { categories: {} } }, issues = (core.issues || []).slice();
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
  if (mode === 'read' || mode === 'write') { FbmSync.preflightVerifyStatus(issues, core.category); }
  return FbmSync.preflightResult(mode, issues, null);
};

/** Phần đắt; `issues` là vấn đề của phần rẻ để kết quả trả về đủ cả hai. Hai Sheet đọc đúng một lần qua `localScan` và mọi bước dùng chung bản đọc đó. */
FbmSync.preflightLocal = function (options, issues) {
  var mode = FbmSync.modeOf(options && options.mode), checkMode = FbmSync.canWriteFbm(mode) ? 'write' : mode, list = (issues || []).slice(), scan = null;
  try { scan = FbmSync.localScan(); scan.records('customer'); scan.records('activity'); } catch (localError) {
    FbmSync.preflightIssue(list, 'FBM_LOCAL_READ_FAILED', 'error', 'fbm_sync', 'Không đọc được Sheet Customer/Activity trước phiên: ' + String(localError && localError.message || localError), true);
    return FbmSync.preflightResult(mode, list, null);
  }
  var report = FbmSync.preflightCandidates(list, checkMode, scan);
  if (report.review) { FbmSync.preflightPushPermissions(list, report.review); }
  return FbmSync.preflightResult(mode, list, { candidateCount: report.candidates.length, hashSummary: report.review ? FbmSync.preflightHashSummary(report.review.rows) : null, conflictPending: report.conflictPending });
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
FbmSync.preflightVerifyStatus = function (issues, category) {
  var stored = (settingsValue('defaults_fbm_pull', 'values').customer || {}).verifyStatus;
  var checked = (settingsDefaultsChecked('defaults_fbm_pull', category).customer || {}).verifyStatus;
  if (!String(stored === undefined || stored === null ? '' : stored).trim()) { FbmSync.preflightIssue(issues, 'FBM_VERIFY_STATUS_DEFAULT_MISSING', 'error', 'Cài đặt', 'Chưa chọn giá trị Xác thực cho khách mới kéo từ FBM. Vào Cài đặt › Ngầm định khi kéo từ FBM, chọn giá trị rồi chạy lại.', true); return; }
  if (!checked) { FbmSync.preflightIssue(issues, 'FBM_VERIFY_STATUS_DEFAULT_INVALID', 'error', 'Cài đặt', 'Giá trị Xác thực "' + stored + '" cho khách mới kéo từ FBM không còn trong danh mục Xác thực ở sheet Category. Vào Cài đặt › Ngầm định khi kéo từ FBM, chọn lại rồi chạy lại.', true); }
};
