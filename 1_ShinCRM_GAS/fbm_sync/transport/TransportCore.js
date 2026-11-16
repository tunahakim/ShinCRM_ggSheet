/** Hop dong request va retry an toan cho transport FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

// FBM có thể đặt dấu nháy trong script trang dưới dạng \" hoặc ". GAS cấp pattern,
// Extension chỉ áp dụng nguyên trạng nên không được để hai nơi tự giữ pattern riêng.
FbmSync.PAYLOAD_COOKIE_CAPTURE_PATTERN = String.raw`\\?['"]cookie\\?['"]\s*[:=]\s*\\?['"]([^'"\\]+FHN_CRM_App)\\?['"]`;
/** Trường `cookie` trong body FBM là tùy chọn: đo 2026-10-06 trên FBM thật, đọc grid, xin quyền mở form và lưu Customer (ALT00010) đều thành công với mã cũ,
 * mã giả, mã người khác hoặc rỗng; FBM chỉ xác thực bằng cookie trình duyệt. Có mã trên tab thì gửi, không có thì để rỗng; không bao giờ chặn request vì
 * thiếu mã, vì chặn như vậy chỉ làm phiên đồng bộ hỏng tùy tab đang hiện trang nào (FBM-037). */
FbmSync.payloadCookieTransport = function () {
  return {
    captures: [
      { name: 'payloadCookie', source: 'page_html', pattern: FbmSync.PAYLOAD_COOKIE_CAPTURE_PATTERN, flags: 'i', group: 1 },
      { name: 'pageUserId', source: 'page_html', pattern: FbmSync.PAGE_USER_ID_CAPTURE_PATTERN, flags: 'i', group: 1 },
      { name: 'pageAccountName', source: 'page_html', pattern: FbmSync.PAGE_ACCOUNT_NAME_CAPTURE_PATTERN, flags: '', group: 1 }
    ],
    replacements: [{ token: '{{FBM_PAYLOAD_COOKIE}}', capture: 'payloadCookie', source: 'page_html', required: false, fallback: '' }]
  };
};
// Nơi thứ hai có danh tính người đăng nhập, ngoài grid User (Nghiên cứu FBM ch02 "Thuật toán trích xuất userId", "Tên đầy đủ của người đăng nhập"):
// HTML trang chính sau đăng nhập. Mã người dùng nằm giữa 4 ký tự đầu và 5 ký tự cuối của payload cookie; tên đầy đủ nằm ở `"username":"…"` của khối cấu hình menu (tên trường là username nhưng giá trị là tên đầy đủ).
FbmSync.PAGE_USER_ID_CAPTURE_PATTERN = String.raw`\\?['"]cookie\\?['"]\s*[:=]\s*\\?['"][^'"\\]{4}([^'"\\]+)[^'"\\]{5}FHN_CRM_App\\?['"]`;
FbmSync.PAGE_ACCOUNT_NAME_CAPTURE_PATTERN = String.raw`\\?['"]username\\?['"]\s*:\s*\\?['"]([^'"\\]+)\\?['"]`;
/** Danh tính Extension trích từ HTML tab FBM ngay lúc gửi request này (`payloadCookieTransport`). Chỉ đọc từ response hiện tại, không lưu: HTML tab là ảnh chụp lúc tải trang, giá trị chỉ đúng cho lần đọc này. */
FbmSync.pageIdentity = function (rawResponse) {
  var parsed = FbmSync.protocol.parse(rawResponse) || {}, transport = parsed._transport || {}, captures = transport.captures || {};
  return { userId: String(captures.pageUserId || ''), accountName: String(captures.pageAccountName || '') };
};
/** URL GAS ra lệnh tab FBM tải lại trước khi gửi request (`meta.reloadFbmPage`): trang khách hàng là trang mặc định sau đăng nhập và có đủ hai giá trị của `pageIdentity`. */
FbmSync.FBM_IDENTITY_PAGE_PATH = '/Main/zccrAccount.aspx';
/**
 * Phát lại đúng request vừa gửi của cursor hiện tại (probe User hoặc grid User sau đăng nhập), kèm lệnh tải tab về trang khách hàng.
 * Cờ `pageReloaded` trong cursor đánh dấu đã tải lại, để lần đọc sau vẫn thiếu thì `pageIdentityCheck` báo lỗi chứ không tải lại mãi.
 */
FbmSync.pageIdentityReloadRequest = function (state, cursor) {
  state.cursor = Object.assign({}, cursor || {}, { pageReloaded: true });
  state.message = 'Trang FBM trên tab chưa có mã và tên người đăng nhập; đang tải lại trang khách hàng để đối chiếu.';
  FbmSync.stateWrite(state);
  var request = FbmSync.cursorRequest(state);
  if (!request) { return { ok: false, code: 'SESSION_RESUME_FAILED', request: null, status: FbmSync.statusView(), error: 'Không dựng lại được request để đối chiếu trang FBM.' }; }
  request.meta = Object.assign({}, request.meta || {}, { reloadFbmPage: FbmSync.FBM_BASE_URL + FbmSync.FBM_IDENTITY_PAGE_PATH });
  return { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() };
};
/** Cổng tự giữ dấu hiệu cho request login do chính cổng khởi động. */
FbmSync.sessionGateToken = function () {
  return 'sg_' + Utilities.getUuid().replace(/[^A-Za-z0-9_-]/g, '');
};
FbmSync.sessionGatePolicy = function () {
  var policy = settingsValues(FbmSync.SETTING_SECTIONS.loginPolicy);
  // Tự mở tab là mục con của Tự đăng nhập: mục cha tắt thì không còn hiệu lực.
  return { autoLogin: policy.enabled && FbmSync.loginConfigRead().configured === true, autoOpenTab: policy.enabled && policy.autoOpenTab };
};
FbmSync.sessionGateMeta = function (state) {
  state.metadata = state.metadata || {};
  state.metadata.sessionGate = state.metadata.sessionGate || {};
  return state.metadata.sessionGate;
};
/** Nhóm request hệ thống chỉ cổng phiên được quyền dựng và phát. */
FbmSync.SESSION_SYSTEM_KINDS = ['login_step', 'authorize', 'identity_user_grid', 'session_probe', 'heartbeat'];
/** Request hệ thống được đi khi phiên chưa xác minh: chính các bước xác minh. Giữ phiên đọc dữ liệu khách (request đếm mang điều kiện quyền) nên không thuộc nhóm này. */
FbmSync.SESSION_PROBE_EXEMPT_KINDS = ['login_step', 'identity_user_grid', 'session_probe'];
FbmSync.isSessionSystemRequest = function (request) {
  var kind = String(request && request.meta && request.meta.kind || '');
  return FbmSync.SESSION_SYSTEM_KINDS.indexOf(kind) >= 0;
};
FbmSync.sessionIdentityIsVerified = function (state) {
  var session = state && state.session || {};
  return session.expired !== true && session.identityVerified === true && !!String(session.sessionId || '') && String(session.identitySessionId || '') === String(session.sessionId || '');
};
/** Ghi danh tính tab FBM vừa đọc từ grid User vào phiên, chưa đánh dấu đã xác minh (dùng khi chỉ đọc để tự điền liên kết). */
FbmSync.sessionIdentityRecord = function (state, identity) {
  var value = identity || {};
  state.session = state.session || {};
  state.session.userId = String(value.userId || '');
  state.session.accountUsername = String(value.username || '');
  state.session.accountName = String(value.accountName || '');
  return state;
};
/** Đánh dấu phiên đã xác minh đúng tài khoản liên kết; bên gọi đã đối chiếu `identity` với liên kết trước khi gọi. Cổng phát request chỉ cho request nghiệp vụ đi khi có dấu này (`sessionIdentityIsVerified`). */
FbmSync.sessionIdentityVerify = function (state, identity) {
  FbmSync.sessionIdentityRecord(state, identity);
  var session = state.session;
  session.expired = false;
  if (!String(session.sessionId || '')) { session.sessionId = FbmSync.sessionGateToken(); }
  session.identityVerified = true;
  session.identitySessionId = String(session.sessionId);
  session.identityVerifiedAt = Date.now();
  return state;
};
/**
 * Danh tính tài khoản FBM dùng trong request nghiệp vụ (điều kiện quyền đọc khách, `owner` khi ghi): giá trị đọc từ FBM của phiên đã xác minh, không phải liên kết. Liên kết là giá trị khai báo, chỉ để đối chiếu.
 * Phiên chưa xác minh thì trả rỗng, nên request đọc khách không dựng được trước bước kiểm tra phiên.
 */
FbmSync.sessionVerifiedIdentity = function (state) {
  var session = state && state.session || {}, verified = FbmSync.sessionIdentityIsVerified(state);
  return { userId: verified ? String(session.userId || '') : '', username: verified ? String(session.accountUsername || '') : '', accountName: verified ? String(session.accountName || '') : '' };
};
FbmSync.sessionIdentityClear = function (state) {
  var session = (state || {}).session || {};
  session.identityVerified = false;
  session.identitySessionId = '';
  session.identityVerifiedAt = 0;
  session.expired = true;
  if (state) { state.session = session; }
  return state;
};
/** Request hệ thống của cổng phiên. `cfg` là `scriptSettings(state)` của ô lượt bên gọi. Request các bước đăng nhập do lượt đăng nhập dựng (`loginStepRequest`). */
FbmSync.sessionSystemRequest = function (kind, value, cfg) {
  var request, options = value && typeof value === 'object' ? value : {};
  if (kind === 'authorize') { request = FbmSync.authorizeRequest(value && value.entity || value || 'customer', cfg); }
  else if (kind === 'session_probe') { request = FbmSync.identityUserRequest(cfg); request.meta.kind = 'session_probe'; }
  else if (kind === 'identity_user_grid') { request = FbmSync.identityUserRequest(cfg); }
  else { return null; }
  request.meta = Object.assign({}, request.meta || {}, { systemRequest: true });
  if (options.requireIdentityProbe === true) { request.meta.requireIdentityProbe = true; }
  return request;
};
FbmSync.sessionSystemEnvelope = function (kind, value, cfg) {
  var request = FbmSync.sessionSystemRequest(kind, value, cfg);
  return request ? FbmSync.nextEnvelope(request) : null;
};
/** Ô lượt đang là lượt đăng nhập: request của nó (bước trang Login, authorize, grid User) đi qua cổng mà không bị đổi thành hỏi thử hay mở đăng nhập lồng. Chỉ người mở lượt đăng nhập đặt được ô lượt này. */
FbmSync.sessionGateCursorIsInternal = function (state) {
  return String(state && state.cursor && state.cursor.kind || '') === 'login';
};
FbmSync.sessionGateRequestCode = function (request, state) {
  if (!request && state && state.lastFailureCode) { return String(state.lastFailureCode); }
  return FbmSync.sessionGateOwnsRequest(request, state) ? 'AUTO_' + 'LOGIN_REQUEST_READY' : 'HEARTBEAT_REQUEST_READY';
};
FbmSync.sessionGateOwnsRequest = function (request, state) {
  return String(request && request.meta && request.meta.kind || '') === 'login_step' && FbmSync.sessionGateCursorIsInternal(state);
};
/**
 * Mọi sự kiện cổng phiên, kể cả sự kiện không kết thúc phiên (hết hạn đang đăng nhập lại, thử lại tìm tab), đều có một dòng Log riêng (FBM-029).
 * Ghi state lỗi thì ném lên lát để `runSlice` chuyển phiên sang lỗi; nuốt ở đây thì Sidebar thấy state cũ còn Log không có gì.
 */
FbmSync.sessionGateRecordFailure = function (state, code, message, action, cause, facts) {
  var current = state || FbmSync.stateRead(), reason = String(message || 'Cổng phát request FBM đã dừng vì lỗi.').slice(0, 240), detail;
  current.lastFailureCode = String(code || 'FBM_SESSION_GATE_FAILED');
  current.lastError = reason;
  current.message = reason;
  FbmSync.stateWrite(current);
  detail = { code: current.lastFailureCode, phase: String(current.phase || ''), runId: String(current.runId || '') };
  // Chỉ ghi mã/loại lỗi gốc, không ghi message: exception trong cổng có thể mang nội dung cấu hình đăng nhập.
  if (cause) { detail.causeCode = String(cause.code || cause.name || 'Error'); }
  // `facts` chỉ nhận dấu hiệu đã lọc sẵn (mã, độ dài, tên khóa), không nhận giá trị response.
  if (facts) { detail.response = facts; }
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: action || 'session_gate_error', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', reason: reason, detail: detail }); }
  if (typeof flushLog === 'function') { flushLog(); }
  return current;
};
/** Lỗi nội bộ của cổng phải dừng trước khi cấp envelope; mã lỗi gốc đi vào Log để còn điều tra. */
FbmSync.sessionGateFailClosed = function (state, cause) {
  var current = state || {};
  current.activeRequestId = '';
  current.deadlineAt = 0;
  current.phase = 'error';
  current.retryable = false;
  current.cursor = {};
  FbmSync.sessionGateRecordFailure(current, 'FBM_SESSION_GATE_EXCEPTION', 'Cổng phiên FBM gặp lỗi nội bộ; request đã bị chặn an toàn.', 'session_gate_exception', cause);
  return null;
};
/** Tự đăng nhập bị chặn hoặc bị FBM từ chối: ghi Log trước để dòng mang nhãn lượt, rồi đóng lượt lỗi qua `runFail` (không "Tạm dừng"); ngoài lượt thì không để phase đang chạy treo. */
FbmSync.sessionGateBlock = function (current, code, message, opts) {
  var opt = opts || {};
  current.retryable = false;
  FbmSync.sessionGateRecordFailure(current, code, message, opt.action || 'session_gate_blocked', null, opt.facts);
  if (FbmSync.runInProgress(current)) { FbmSync.runFail(current, code, current.message, opt.cursor ? { cursor: opt.cursor } : null); }
  else if (FbmSync.ACTIVE_PHASES.indexOf(String(current.phase)) >= 0) { current.phase = 'error'; current.activeRequestId = ''; current.cursor = opt.cursor || current.cursor; }
  return FbmSync.stateWrite(current);
};
/** Khởi động owner login từ cổng; flow không cần biết cách đăng nhập. */
FbmSync.sessionGateStart = function (state, failedCursor) {
  var current = state || FbmSync.stateRead(), policy = FbmSync.sessionGatePolicy(), cursor = failedCursor || current.cursor || {}, allowed, request, gate;
  if (cursor.kind === 'login' && current.activeRequestId) {
    current.phase = 'waiting_session';
    current.retryable = true;
    current.lastFailureCode = 'AUTO_LOGIN_IN_PROGRESS';
    current.message = 'Đang chờ tiến trình xác thực FBM hiện tại; chưa gửi request song song.';
    FbmSync.stateWrite(current);
    return null;
  }
  if (cursor.kind === 'push_wait') {
    FbmSync.sessionGateBlock(current, 'SESSION_EXPIRED_AT_WRITE', 'Phiên FBM hết hạn trong lúc chờ ghi; đã chặn gửi lại để tránh ghi trùng.');
    return null;
  }
  if (typeof FbmSync.beginAutoLogin !== 'function') { return null; }
  if (!policy.autoLogin) {
    var canAttempt = typeof FbmSync.autoLoginCanAttempt === 'function' ? FbmSync.autoLoginCanAttempt() : { code: 'AUTO_LOGIN_NOT_CONFIGURED' };
    var code = String(canAttempt.code || 'AUTO_LOGIN_NOT_CONFIGURED');
    FbmSync.sessionGateBlock(current, code, FbmSync.autoLoginBlockMessage(code, canAttempt));
    return null;
  }
  allowed = FbmSync.beginAutoLogin(current, cursor, { heartbeat: cursor.kind === 'heartbeat' });
  if (!allowed) {
    var blocked = typeof FbmSync.autoLoginCanAttempt === 'function' ? FbmSync.autoLoginCanAttempt(null, FbmSync.autoLoginAttemptOptions(current, cursor)) : { code: 'AUTO_LOGIN_NOT_CONFIGURED' };
    FbmSync.sessionGateBlock(current, blocked.code || 'AUTO_LOGIN_NOT_CONFIGURED', FbmSync.autoLoginBlockMessage(blocked.code, blocked));
    return null;
  }
  gate = FbmSync.sessionGateMeta(current);
  gate.loginStartedAt = Date.now();
  FbmSync.stateWrite(current);
  return allowed;
};
/** Phản ứng tập trung khi response xác nhận phiên đã hết hạn. */
FbmSync.sessionGateHandleFailure = function (state, cursor, failure) {
  var value = failure || {};
  if (String(value.code || '') !== 'SESSION_EXPIRED' || (cursor && cursor.kind === 'push_wait')) { return null; }
  if (typeof FbmSync.beginAutoLogin !== 'function') { return null; }
  state.session = state.session || {};
  FbmSync.sessionIdentityClear(state);
  state.session.customerAuthorized = '';
  state.session.activityAuthorized = '';
  FbmSync.stateWrite(state);
  if (typeof FbmSync.sessionGateRecordFailure === 'function') {
    FbmSync.sessionGateRecordFailure(state, 'SESSION_EXPIRED', 'Phiên FBM đã hết hạn; cổng đang xử lý đăng nhập lại an toàn.', 'session_expired');
  }
  var request, envelope;
  try { request = FbmSync.sessionGateStart(state, cursor); } catch (gateError) { return FbmSync.sessionGateFailClosed(state, gateError); }
  if (!request) { return { ok: false, code: String(state.lastFailureCode || 'SESSION_EXPIRED'), request: null, status: FbmSync.statusView(), error: state.lastError }; }
  try { envelope = FbmSync.nextEnvelope(request); } catch (envelopeError) { return FbmSync.sessionGateFailClosed(state, envelopeError); }
  if (!envelope) { return { ok: false, code: String(state.lastFailureCode || 'FBM_SESSION_GATE_FAILED'), request: null, status: FbmSync.statusView(), error: state.lastError }; }
  return { ok: true, request: envelope, status: FbmSync.statusView() };
};
/**
 * Chuyển state sang bước probe phiên và ghi lại chỗ quay về: cursor, phase và entity luôn đi cùng nhau.
 * Thiếu phase thì sau probe hay đăng nhập, việc không thuộc lượt nào (Giữ phiên) bị trả về `checking_session` — một phase đang chạy — và lượt treo không request nào chờ.
 */
FbmSync.sessionGateEnterProbe = function (current, resumeCursor, message) {
  var gate = FbmSync.sessionGateMeta(current);
  gate.resumeCursor = Object.assign({}, resumeCursor || {});
  gate.resumePhase = String(current.phase || 'checking_session');
  gate.resumeEntity = String(current.entity || '');
  current.cursor = { kind: 'session_probe' };
  current.phase = 'checking_session';
  current.entity = '';
  current.message = String(message);
  return gate;
};
/** Tạo probe hệ thống sau một response nghiệp vụ đáng ngờ; không retry nghiệp vụ. */
FbmSync.sessionGateProbeRequest = function (state, failedCursor, reason) {
  var current = state || FbmSync.stateRead(), gate = FbmSync.sessionGateEnterProbe(current, failedCursor, reason || 'Đang probe lại phiên FBM để xác minh phản hồi đáng ngờ.');
  gate.probeOnly = true;
  gate.probeRetryCount = 0;
  FbmSync.stateWrite(current);
  return FbmSync.nextEnvelope(FbmSync.sessionSystemRequest('session_probe', null, FbmSync.scriptSettings(current)));
};
/** Ép probe ở đầu một lượt/lát mới rồi mới trả lại cursor nghiệp vụ. */
FbmSync.sessionGateResumeProbeRequest = function (state, resumeCursor, reason) {
  var current = state || FbmSync.stateRead();
  FbmSync.sessionGateEnterProbe(current, resumeCursor || current.cursor, reason || 'Đang kiểm tra lại phiên FBM trước khi tiếp tục lát mới...');
  current.activeRequestId = '';
  current.deadlineAt = 0;
  FbmSync.stateWrite(current);
  return FbmSync.sessionSystemEnvelope('session_probe', null, FbmSync.scriptSettings(current));
};
/**
 * Mở request đầu của cursor đã lưu (Giữ phiên). Request đọc khách mang mã người dùng của phiên đã xác minh nên không dựng được trước khi xác minh:
 * phiên chưa xác minh thì mở bằng probe, nhánh probe dựng lại request từ cursor sau khi xác minh.
 */
FbmSync.cursorStartEnvelope = function (state) {
  var current = state || FbmSync.stateRead();
  if (FbmSync.sessionIdentityIsVerified(current)) { return FbmSync.nextEnvelope(FbmSync.cursorRequest(current)); }
  return FbmSync.sessionGateResumeProbeRequest(current, current.cursor, 'Đang kiểm tra tab và tài khoản FBM...');
};
/**
 * Dấu "phiên hết hạn" và cờ cổng phiên còn lại từ lượt đã kết thúc: người dùng có thể đã tự đăng nhập trên tab FBM từ đó (09/06 không đăng nhập lại khi phiên còn hợp lệ).
 * Không tốn request hỏi riêng: bỏ dấu và cờ cổng của lượt cũ, request việc thật của lượt mới tự nhận diện phiên; phiên chết thì cổng đăng nhập theo chu kỳ chờ như mọi response khác.
 * Cờ "đã thử đăng nhập" chỉ chặn lặp đăng nhập trong một lượt; để sót sang lần hỏi sau thì phiên chết lần nữa bị dừng nhầm thay vì đăng nhập lại. Giãn cách giữa các lần đăng nhập do chu kỳ thử lại giữ, không do cờ này.
 * Chỉ sửa state trong bộ nhớ; nơi gọi tự ghi.
 */
FbmSync.sessionGateForgetStale = function (state) {
  if (!state) { return; }
  var gate = FbmSync.sessionGateMeta(state);
  if (state.session) { state.session.expired = false; }
  gate.probeOnly = false; gate.loginAttempted = false; gate.probeRetryCount = 0;
};
/**
 * Xử lý probe không đạt; chỉ probe được phép khởi động auto-login, tối đa một lần.
 * Probe sau request nghiệp vụ đáng ngờ mà FBM trả lời rõ "chưa xác thực" là phiên đã chết thật (người dùng đăng nhập nơi khác): đi cổng đăng nhập theo chu kỳ chờ như probe đầu lượt, không dừng lỗi chờ lượt sau.
 */
FbmSync.sessionGateHandleProbeFailure = function (state, cursor, response) {
  var current = state || FbmSync.stateRead(), gate = FbmSync.sessionGateMeta(current), suspicious = FbmSync.protocol.isSessionSuspicious(response);
  if (gate.probeOnly === true && FbmSync.protocol.isUnauthenticatedResponse(response)) { gate.probeOnly = false; }
  if (suspicious && Number(gate.probeRetryCount || 0) < 1) {
    gate.probeRetryCount = 1;
    current.message = 'Phản hồi FBM đáng ngờ; đang probe lại phiên đúng một lần.';
    current.lastFailureCode = 'SESSION_PROBE_RETRY';
    FbmSync.stateWrite(current);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.sessionSystemRequest('session_probe', null, FbmSync.scriptSettings(current))), status: FbmSync.statusView() };
  }
  if (gate.probeOnly === true || gate.loginAttempted === true) {
    var code = gate.probeOnly === true ? 'SESSION_PROBE_UNCERTAIN' : 'SESSION_PROBE_FAILED_AFTER_LOGIN';
    var message = gate.probeOnly === true
      ? 'Không xác minh được phiên FBM sau request đáng ngờ; request nghiệp vụ đã bị dừng.'
      : 'Đăng nhập FBM đã hoàn tất nhưng probe phiên không đạt; đã dừng để tránh lặp đăng nhập.';
    FbmSync.sessionGateRecordFailure(current, code, message, 'session_probe_failure');
    current.phase = 'error'; current.cursor = {}; current.activeRequestId = ''; current.deadlineAt = 0; current.retryable = false; current.lastFailureCode = code; current.lastError = message; current.message = message;
    FbmSync.stateWrite(current);
    return { ok: false, code: code, request: null, status: FbmSync.statusView(), error: message };
  }
  if (gate.resumeCursor && gate.resumeCursor.kind === 'push_wait') {
    FbmSync.sessionGateRecordFailure(current, 'SESSION_EXPIRED_AT_WRITE', 'Phiên FBM không được xác minh trong lúc chờ ghi; đã chặn để tránh ghi trùng.', 'session_expired_at_write');
    current.phase = 'paused'; current.cursor = gate.resumeCursor; current.activeRequestId = ''; current.deadlineAt = 0; current.retryable = false;
    current.lastFailureCode = 'SESSION_EXPIRED_AT_WRITE'; current.lastError = 'Phiên FBM không được xác minh trong lúc chờ ghi; đã chặn để tránh ghi trùng.'; current.message = current.lastError;
    FbmSync.stateWrite(current);
    return { ok: false, code: 'SESSION_EXPIRED_AT_WRITE', request: null, status: FbmSync.statusView(), error: current.lastError };
  }
  FbmSync.sessionIdentityClear(current);
  var request = FbmSync.sessionGateStart(current, cursor), envelope;
  if (!request) { return { ok: false, code: String(current.lastFailureCode || 'SESSION_PROBE_FAILED'), request: null, status: FbmSync.statusView(), error: current.lastError }; }
  envelope = FbmSync.nextEnvelope(request);
  return envelope ? { ok: true, request: envelope, status: FbmSync.statusView() } : { ok: false, code: 'AUTO_LOGIN_REQUEST_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: current.lastError };
};
/**
 * Bảng lỗi đường truyền: nơi duy nhất quyết GAS làm gì khi Extension không gửi được request (không đọc kho, không ghi; chính sách tự mở tab được truyền vào).
 * Mỗi request được phát lại tối đa một lần (`noTabRetryRequestId`), cả lượt tối đa `BUDGET.transportReplaysPerRun` lần; chạm trần thì `replay_budget` (dừng, báo đường truyền chập chờn). `replay`: request đọc thuần mất giữa đường thì gửi lại.
 * `activity_windows`: quét giao dịch quá sức thì chia cửa sổ ngày. `scan_restart`: tab mất việc quét thì chạy lại việc. `reload_page`: tab không sẵn sàng thì phát lại kèm lệnh đổi trang (Extension không tự tải lại). `open_tab`: không có tab và chính sách cho mở. `stop`: còn lại, kể cả lần phát lại của chính request vừa cứu tab.
 */
FbmSync.transportRecoverPlan = function (state, requestId, code, policy) {
  var value = String(code || ''), cursor = state && state.cursor || {}, gate = state && state.metadata && state.metadata.sessionGate || {};
  var reissued = String(gate.noTabRetryRequestId || '') === String(requestId || '');
  if (FbmSync.ACTIVITY_WINDOW_CODES.indexOf(value) >= 0 && cursor.kind === 'scan_job' && cursor.entity === 'activity' && !(Number(cursor.chunkCount || 0) > 0)) { return 'activity_windows'; }
  if (value === 'FBM_SCAN_JOB_GONE' && FbmSync.isScanCursor(cursor)) { return 'scan_restart'; }
  var plan = 'stop';
  if (value === 'FBM_TAB_NOT_READY' && !reissued) { plan = 'reload_page'; }
  if (value === 'FBM_TAB_NOT_FOUND' && !reissued && policy && policy.autoOpenTab === true) { plan = 'open_tab'; }
  // Lỗi sau khi request có thể đã tới FBM (tab tải lại giữa chừng, mạng đứt): chỉ gửi lại request đọc thuần đã khai trong REQUEST_REPLAY.
  if (value === 'FBM_TRANSPORT_UNAVAILABLE' && !reissued && state.activeRequestReplay === true) { plan = 'replay'; }
  if (plan !== 'stop' && Number(state.metadata && state.metadata.transportReplays || 0) >= FbmSync.BUDGET.transportReplaysPerRun) { plan = 'replay_budget'; }
  return plan;
};
/** Phát lại đúng request vừa hỏng một lần theo kế hoạch `reload_page`, `open_tab` hoặc `replay` của `transportRecoverPlan`; ghi dấu request phát lại để lần hỏng kế là `stop` và đếm vào trần gửi lại của lượt. */
FbmSync.transportReissue = function (state, requestId, code, message, plan) {
  var reload = plan === 'reload_page', replay = plan === 'replay', gate = FbmSync.sessionGateMeta(state), request, envelope;
  state.activeRequestId = '';
  state.deadlineAt = 0;
  gate.noTabRetryRequestId = String(requestId || '');
  state.metadata.transportReplays = Number(state.metadata.transportReplays || 0) + 1;
  state.message = replay ? 'Đường truyền tới tab FBM đứt giữa chừng; GAS gửi lại request đọc một lần.' : reload ? 'Tab FBM không phản hồi; GAS yêu cầu Extension tải lại trang khách hàng và thử lại một lần.' : 'Chưa tìm thấy tab FBM; GAS yêu cầu Extension mở tab và thử lại một lần.';
  state.lastError = String(message || state.message).slice(0, 240);
  FbmSync.stateWrite(state);
  request = FbmSync.cursorRequest(state);
  if (!request) { return null; }
  if (reload) { request.meta = Object.assign({}, request.meta || {}, { reloadFbmPage: FbmSync.FBM_BASE_URL + FbmSync.FBM_IDENTITY_PAGE_PATH }); }
  envelope = FbmSync.nextEnvelope(request);
  if (!envelope) { return null; }
  state = FbmSync.stateRead();
  gate = FbmSync.sessionGateMeta(state);
  gate.noTabRetryRequestId = String(envelope.id || '');
  state.message = replay ? 'Đang gửi lại request đọc sau khi đường truyền tới tab FBM đứt.' : reload ? 'Đang thử lại request sau khi GAS yêu cầu tải lại trang FBM.' : 'Đang thử lại request sau khi GAS yêu cầu mở tab FBM.';
  FbmSync.sessionGateRecordFailure(state, String(code || ''), (replay ? 'Gửi lại request đọc đúng một lần: ' : '') + (message || (reload ? 'Tab FBM không phản hồi. Đang tải lại và thử lại đúng một lần.' : 'Không tìm thấy tab FBM. Đang thử lại đúng một lần.')), 'transport_retry');
  return { ok: true, code: 'FBM_TAB_RETRY_REQUEST_READY', request: envelope, status: FbmSync.statusView() };
};
FbmSync.sessionGateResponseStarted = function (state) {
  var gate = state && state.metadata && state.metadata.sessionGate;
  if (gate && gate.noTabRetryRequestId) { gate.noTabRetryRequestId = ''; }
  return state;
};
FbmSync.pauseForRuntimeLimit = function (state) {
  var current = state || FbmSync.stateRead();
  current.activeRequestId = '';
  current.deadlineAt = 0;
  current.phase = 'paused';
  current.lastFailureCode = 'GAS_RUNTIME_LIMIT';
  current.lastError = 'Lát GAS đã chạm trần thời gian; đã dừng trước request kế tiếp và giữ cursor an toàn.';
  current.message = current.lastError;
  current.retryable = true;
  logEvent({ source: 'fbm_sync', action: 'slice_limit', outcome: LOG_ERROR, reason: current.lastFailureCode, detail: { runId: String(current.runId || ''), phase: String(current.phase || ''), cursor: current.cursor || {} } });
  FbmSync.stateWrite(current);
  return null;
};
/**
 * Kênh của lời gọi đang chạy, do cửa lệnh đặt: `relay` (Extension) hoặc `sidebar`. Phong bì chỉ rời GAS qua relay; trên kênh Sidebar `nextEnvelope` giữ chỗ nhận lượt thay vì phát, Extension đến nhận bằng `continue{runId}`.
 * Lời gọi không qua cửa lệnh (test nội bộ) không có kênh và phát thẳng như relay. `logs` gom dòng Log thường của công cụ, cửa lệnh ghi ở cuối lời gọi.
 */
FbmSync.issueContext = null;
/** Tên cũ của bước phát request của lát; chặng cũ còn gọi tên này tới khi chuyển sang hợp đồng chặng. */
FbmSync.nextEnvelope = function (request) { return FbmSync.sliceIssue(request); };
/**
 * Phần cổng phiên của bước phát request: request đăng nhập thử nhận thẻ của cổng; request nghiệp vụ khi danh tính phiên chưa xác minh thì đổi thành hỏi thử; phiên đã hết hạn thì cổng mở đăng nhập. Trả request thật sẽ gửi, hoặc `null` khi cổng đã đóng lượt.
 */
FbmSync.sessionGateGuard = function (pendingState, request) {
  var internalLogin = FbmSync.sessionGateOwnsRequest(request, pendingState);
  // Mọi request nghiệp vụ và authorize đầu lượt phải qua probe User.
  // Probe là request hệ thống nên không quay lại nhánh này.
  var gateCursorKinds = ['customer_count', 'customer_grid', 'activity_grid','lookup', 'push_lookup', 'push_scan', 'push_wait'];
  var requestKind = String(request.meta && request.meta.kind || ''), cursorNeedsGate = gateCursorKinds.indexOf(String(pendingState.cursor && pendingState.cursor.kind || '')) >= 0 && String(pendingState.cursor && pendingState.cursor.kind || '') !== 'push_wait';
  // Mọi request không thuộc nhóm hệ thống đều phải qua cổng; không cho
  // caller né cổng bằng cách đặt một tên meta.kind lạ.
  var requestNeedsGate = FbmSync.SESSION_PROBE_EXEMPT_KINDS.indexOf(requestKind) < 0 || cursorNeedsGate;
  var loginFlowOwnsSystemRequest = FbmSync.sessionGateCursorIsInternal(pendingState);
  if (requestKind !== 'session_probe' && !internalLogin && !loginFlowOwnsSystemRequest && !FbmSync.sessionIdentityIsVerified(pendingState) && requestNeedsGate) {
    var originalCursor = Object.assign({}, pendingState.cursor || {});
    if (originalCursor.kind !== 'session_probe') {
      FbmSync.sessionGateEnterProbe(pendingState, originalCursor, 'Đang kiểm tra tab và tài khoản FBM...');
      FbmSync.stateWrite(pendingState);
      request = FbmSync.sessionSystemRequest('session_probe', null, FbmSync.scriptSettings(pendingState));
    }
  }
  if (pendingState.session && pendingState.session.expired === true && !internalLogin && (!FbmSync.isSessionSystemRequest(request) || String(request.meta && request.meta.kind || '') === 'heartbeat')) {
    return FbmSync.sessionGateStart(pendingState, pendingState.cursor || {});
  }
  return request;
};
/**
 * Bước phát request của lát, sau khi cổng phiên đã chọn request thật sẽ gửi: kiểm miền FBM của từng request, cấp `requestId`, đặt hạn chờ, ghi request đang chờ vào ô lượt và bọc phong bì cho Extension.
 * Không quyết gửi hay không: công tắc tổng, ngân sách và cổng phiên do `nextEnvelope` xét trước.
 */
FbmSync.requestIssue = function (state, request, now) {
  (request.items || [request]).forEach(function (item) {
    var endpoint = FbmSync.protocol.validateEndpoint(item.url);
    if (!endpoint.ok) {
      FbmSync.traceEvent(state, 'request_blocked', { operation: item.meta && item.meta.kind || '', endpoint: item.url, code: endpoint.code });
      throw new Error(endpoint.message + ' (' + endpoint.code + ')');
    }
  });
  var replay = FbmSync.requestReplayable(request);
  // Một lượt relay có thể dựng nhiều envelope trong cùng một mili-giây. Bộ đếm
  // trong vùng tên GAS giữ các ID đó khác nhau trong cùng một lượt chạy.
  var sequence = Number(FbmSync._requestIdAt || 0) === now ? Number(FbmSync._requestIdSequence || 0) + 1 : 0;
  FbmSync._requestIdAt = now;
  FbmSync._requestIdSequence = sequence;
  // Giữ dạng ID cũ khi không có nguy cơ trùng để DTO/trace không phình theo số
  // bước; chỉ thêm hậu tố tuần tự cho các envelope cùng mili-giây.
  var id = now.toString(36) + (sequence ? '-' + sequence.toString(36) : ''), meta = Object.assign({}, request.meta || {});
  meta.trace = Object.assign({}, meta.trace || {}, { runId: String(state.runId || ''), requestId: id });
  // Extension chỉ có bộ lọc generic; GAS quyết định rõ dữ liệu phụ trợ cần lấy từ tab.
  var defaultTransport = FbmSync.payloadCookieTransport();
  meta.transport = Object.assign(defaultTransport, meta.transport || {});
  // Gói quét lấy từ RAM tab, không gọi FBM: không gắn khoảng nghỉ để Extension không phải rẽ nhánh theo loại request.
  var requestGap = String(meta.kind || '') !== 'scan_chunk' && state.requestGap && Number(state.requestGap.maxMs) > 0 ? { minMs: Number(state.requestGap.minMs || 0), maxMs: Number(state.requestGap.maxMs) } : null;
  if (requestGap) { meta.requestGap = requestGap; }
  try {
    var sessionPolicy = FbmSync.sessionGatePolicy();
    if (sessionPolicy.autoOpenTab) {
      meta.openFbmContext = { url: FbmSync.FBM_BASE_URL + '/Main/zccrAccount.aspx', active: false };
    } else {
      delete meta.openFbmContext;
    }
  } catch (gateError) {
    return FbmSync.sessionGateFailClosed(state, gateError);
  }
  meta.timeoutMs = FbmSync.budgetTimeoutMs(request, requestGap);
  meta.fetchMs = FbmSync.budgetFetchMs(meta);
  meta.gasReplyMs = FbmSync.budgetGasReplyMs();
  if (request.items) { meta.batch = { maxBytes: FbmSync.BUDGET.batchMaxBytes }; }
  state.activeRequestId = id;
  state.activeRequestSig = FbmSync.requestSig(request);
  state.activeRequestReplay = replay;
  if (state.resubmit && state.resubmit.answered && state.resubmit.answered === FbmSync.requestWatch.lastAnswered) { state.resubmit.issued = id; }
  if (FbmSync.issueContext && FbmSync.issueContext.machineId) { state.driverMachineId = FbmSync.issueContext.machineId; }
  state.lastProgressAt = now;
  state.deadlineAt = FbmSync.budgetDeadlineAt(now, meta.timeoutMs);
  FbmSync.stateWrite(state);
  FbmSync.traceEvent(state, 'response_built', { requestId: id, operation: meta.kind, entity: meta.entity, recordId: meta.id || meta.shinId || meta.stt_rec_kh, items: request.items ? request.items.length : undefined });
  if (request.items) { return FbmSync.protocol.batch(id, request.items.map(function (item) { return { url: item.url, body: FbmSync.transportValue(item.body), meta: item.meta }; }), FbmSync.transportValue(meta)); }
  return FbmSync.protocol.request(id, request.url, FbmSync.transportValue(request.body), FbmSync.transportValue(meta), request.method);
};
/**
 * Giữ chỗ nhận lượt cho máy đang mở lượt từ Sidebar; lần hỏi kế tiếp của Extension máy đó (Sidebar đánh thức hoặc chuông) nhận lượt. Lúc Extension đến nhận, GAS dựng lại request từ cursor, nên request định phát phải dựng lại được từ cursor: lệch là lỗi lập trình, ném ngay chứ không để Extension nhận nhầm bước.
 * Chỗ giữ là một request đang chờ có hạn (`REQUEST_IN_FLIGHT` với nhịp nền máy khác); quá hạn mà không ai nhận thì luật lượt treo đóng lượt như request không được trả lời.
 */
FbmSync.envelopeHold = function (request) {
  var state = FbmSync.stateRead(), rebuilt = FbmSync.cursorRequest(state), machineId = String(FbmSync.issueContext.machineId || ''), fail = function (code, message) { var error = new Error(message); error.code = code; throw error; };
  if (!machineId) { fail('SYNC_MACHINE_ID_REQUIRED', 'Lệnh mở lượt từ Sidebar thiếu mã máy Extension sẽ chở lượt.'); }
  if (!state.runId) { fail('PICKUP_RUN_ID_MISSING', 'Lượt vừa mở không có mã lượt nên Extension không nhận được.'); }
  if (!rebuilt || String(rebuilt.meta && rebuilt.meta.kind || '') !== String(request.meta && request.meta.kind || '') || String(rebuilt.url || '') !== String(request.url || '')) {
    fail('PICKUP_CURSOR_MISMATCH', 'Request mở lượt (bước ' + String(request.meta && request.meta.kind || '') + ') không dựng lại được từ cursor ' + String(state.cursor && state.cursor.kind || 'trống') + '.');
  }
  state.activeRequestId = FbmSync.PICKUP_PREFIX + state.runId;
  state.activeRequestSig = FbmSync.requestSig(request);
  state.deadlineAt = FbmSync.budgetPickupDeadlineAt(Date.now(), settingsValue(FbmSync.SETTING_SECTIONS.extension, 'pollMinutes'));
  state.driverMachineId = machineId;
  FbmSync.stateWrite(state);
  return { pickup: true, runId: String(state.runId) };
};
/**
 * Bảng khai mỗi loại request (`meta.kind`) có được gửi lại khi đường truyền đứt giữa chừng hay không. Không có giá trị mặc định: loại chưa khai thì `requestIssue` chặn trước khi gửi, nên thêm loại request mới mà quên khai là lỗi lộ ngay chứ không âm thầm gửi lại.
 * `true` chỉ cho request đọc thuần: FBM có nhận rồi cũng không đổi gì. Request mở form, lưu, đăng nhập và cấp quyền form là `false` vì lần gửi đầu có thể đã tới FBM (mở form tạo khách sinh mã khách mới).
 */
FbmSync.REQUEST_REPLAY = {
  login_step: false, authorize: false,
  session_probe: true, grid: true, owner_lookup: true, customer_batch: true, identity_user_grid: true, conflict_refresh_grid: true, completion: true, customer_count: true, scan_job: true, scan_chunk: true,
  // Lô chỉ là vỏ; lô gửi lại được khi mọi phần tử gửi lại được.
  batch: true,
  activity_create: false, activity_edit_open: false, activity_edit_save: false,
  customer_create_open: false, customer_create_save: false, customer_edit_open: false, customer_edit_save: false
};
/** Tra bảng gửi lại cho request và từng phần tử lô; loại chưa khai hoặc giá trị không phải true/false thì ném `FBM_REQUEST_KIND_UNDECLARED`. */
FbmSync.requestReplayable = function (request) {
  var declared = function (meta) {
    var kind = String(meta && meta.kind || ''), value = Object.prototype.hasOwnProperty.call(FbmSync.REQUEST_REPLAY, kind) ? FbmSync.REQUEST_REPLAY[kind] : undefined;
    if (value !== true && value !== false) { var error = new Error('Loại request "' + kind + '" chưa khai có được gửi lại hay không trong FbmSync.REQUEST_REPLAY; đã dừng trước khi gửi (FBM_REQUEST_KIND_UNDECLARED).'); error.code = 'FBM_REQUEST_KIND_UNDECLARED'; throw error; }
    return value;
  };
  return (request.items || []).reduce(function (all, item) { return declared(item.meta) && all; }, declared(request.meta));
};
/** Dấu của request đang chờ (bước và URL) để lần phát lại từ cursor so được với thứ đã phát; không chứa thân request. */
FbmSync.requestSig = function (request) { return String(request && request.meta && request.meta.kind || '') + ' ' + String(request && request.url || ''); };
/**
 * Phát lại request đang chờ bằng cách dựng lại từ cursor, dùng cho hai việc: lần hỏi của Extension nhận lượt Sidebar vừa mở (chỗ giữ `pickup:`) và Extension nộp lặp kết quả GAS đã xử lý (`answeredId`).
 * Request dựng lại phải trùng dấu request đang chờ; lệch là lỗi lập trình nên ném ngay chứ không để Extension chạy nhầm bước. Nộp lặp giữ `resubmit.answered` để lần nộp lặp sau nữa vẫn được nhận ra.
 */
FbmSync.envelopeReissue = function (state, answeredId) {
  var held = String(state.activeRequestId || ''), request = FbmSync.cursorRequest(state), fail = function (code, message) { var error = new Error(message); error.code = code; throw error; };
  if (!request) { fail('REISSUE_CURSOR_EMPTY', 'Không dựng lại được request đang chờ vì cursor ' + String(state.cursor && state.cursor.kind || 'trống') + ' không có request.'); }
  if (state.activeRequestSig && FbmSync.requestSig(request) !== String(state.activeRequestSig)) { fail('REISSUE_CURSOR_MISMATCH', 'Request dựng lại từ cursor (' + FbmSync.requestSig(request) + ') khác request đang chờ (' + String(state.activeRequestSig) + ').'); }
  FbmSync.requestAnswered(state, held);
  if (answeredId) { state.resubmit = { answered: String(answeredId), issued: '' }; FbmSync.requestWatch.lastAnswered = String(answeredId); }
  state.activeRequestId = '';
  state.deadlineAt = 0;
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(request), status: FbmSync.statusView() };
};
/** Nộp lặp: lượt còn request đang chờ thì phát lại nó, lượt đã đóng thì trả status để Extension kết thúc chuỗi. Không chạy lại nghiệp vụ của lần nộp đầu. */
FbmSync.envelopeResubmit = function (state) {
  if (!state.activeRequestId) { return { ok: true, request: null, status: FbmSync.statusView() }; }
  return FbmSync.envelopeReissue(state, state.resubmit.answered);
};
/** Lấy requestId từ trace transport mà GAS đã yêu cầu Extension giữ lại. */
FbmSync.responseRequestId = function (rawResponse) {
  var value = rawResponse || {}, trace = value.trace || value.transport && value.transport.trace || value.result && value.result.transport && value.result.transport.trace || [], item;
  if (!Array.isArray(trace)) { return ''; }
  for (var i = trace.length - 1; i >= 0; i -= 1) {
    item = trace[i];
    // Older bridges used their local Sidebar waiter id in `requestId` on
    // bridge_* trace entries. Those ids are not GAS reservations and must
    // never win stale-response validation.
    if (item && item.requestId && !/^bridge_/.test(String(item.stage || ''))) { return String(item.requestId); }
  }
  return '';
};
