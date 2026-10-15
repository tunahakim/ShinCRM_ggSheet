/** Hop dong request va retry an toan cho transport FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa tổng của module; Spreadsheet cũ chưa có thuộc tính được coi là bật. */
FbmSync.MASTER_SWITCH_KEY = 'FBM_SYNC_ENABLED';
FbmSync.masterEnabled = function () {
  // Chưa có thuộc tính thì coi là bật (Spreadsheet có trước công tắc). Đọc lỗi thì ném lên: công tắc an toàn không được hỏng theo hướng mở (FBM-028).
  var value;
  try { value = FbmSync.props().getProperty(FbmSync.MASTER_SWITCH_KEY); } catch (err) {
    var failure = new Error('Không đọc được công tắc đồng bộ FBM; đã dừng để an toàn, thử lại sau ít phút.');
    failure.code = 'FBM_DOCUMENT_PROPERTIES_READ_FAILED';
    throw failure;
  }
  return value !== 'false';
};
FbmSync.setMasterEnabled = function (enabled) {
  var value = enabled === true;
  FbmSync.props().setProperty(FbmSync.MASTER_SWITCH_KEY, value ? 'true' : 'false');
  if (!value && typeof FbmSync.stateRead === 'function' && typeof FbmSync.stateWrite === 'function') {
    var state = FbmSync.stateRead();
    if (!state.activeRequestId) {
      state.phase = 'paused';
      state.message = 'Đồng bộ đang tắt; không cấp request FBM mới.';
      FbmSync.stateWrite(state);
    }
  }
  return { ok: true, enabled: value, status: typeof FbmSync.statusView === 'function' ? FbmSync.statusView() : null };
};

// FBM có thể đặt dấu nháy trong script trang dưới dạng \" hoặc ". GAS cấp pattern,
// Extension chỉ áp dụng nguyên trạng nên không được để hai nơi tự giữ pattern riêng.
FbmSync.PAYLOAD_COOKIE_CAPTURE_PATTERN = String.raw`\\?['"]cookie\\?['"]\s*[:=]\s*\\?['"]([^'"\\]+FHN_CRM_App)\\?['"]`;
/** Trường `cookie` trong body FBM là tùy chọn: đo 2026-10-06 trên FBM thật, đọc grid, xin quyền mở form và lưu Customer (ALT00010) đều thành công với mã cũ,
 * mã giả, mã người khác hoặc rỗng; FBM chỉ xác thực bằng cookie trình duyệt. Có mã trên tab thì gửi, không có thì để rỗng; không bao giờ chặn request vì
 * thiếu mã, vì chặn như vậy chỉ làm phiên đồng bộ hỏng tùy tab đang hiện trang nào (FBM-037). */
FbmSync.payloadCookieTransport = function () {
  return {
    captures: [{ name: 'payloadCookie', source: 'page_html', pattern: FbmSync.PAYLOAD_COOKIE_CAPTURE_PATTERN, flags: 'i', group: 1 }],
    replacements: [{ token: '{{FBM_PAYLOAD_COOKIE}}', capture: 'payloadCookie', source: 'page_html', required: false, fallback: '' }]
  };
};
/** Chỉ trả dữ liệu JSON thuần qua google.script.run; Date phải về dạng .NET của FBM. */
if (typeof FbmSync.transportValue !== 'function') {
  FbmSync.transportValue = function (value) {
    if (value && Object.prototype.toString.call(value) === '[object Date]') { return '/Date(' + value.getTime() + ')/'; }
    if (Array.isArray(value)) { return value.map(function (item) { return FbmSync.transportValue(item); }); }
    if (value && typeof value === 'object') {
      var out = {};
      Object.keys(value).forEach(function (key) { out[key] = FbmSync.transportValue(value[key]); });
      return out;
    }
    return value;
  };
}
/** Cổng tự giữ dấu hiệu cho request login do chính cổng khởi động. */
FbmSync.sessionGateToken = function () {
  var uuid = '';
  try { uuid = typeof Utilities !== 'undefined' && Utilities.getUuid ? Utilities.getUuid() : ''; } catch (ignore) {}
  return 'sg_' + String(uuid || (Date.now().toString(36) + '_' + Math.random().toString(36).slice(2))).replace(/[^A-Za-z0-9_-]/g, '');
};
FbmSync.sessionGatePolicy = function () {
  var value = typeof FbmSync.loginConfigRead === 'function' ? FbmSync.loginConfigRead() : {};
  return { autoLogin: value.enabled === true && value.configured === true, autoOpenTab: value.autoOpenTab === true };
};
FbmSync.sessionGateMeta = function (state) {
  state.metadata = state.metadata || {};
  state.metadata.sessionGate = state.metadata.sessionGate || {};
  return state.metadata.sessionGate;
};
/** Nhóm request hệ thống chỉ cổng phiên được quyền dựng và phát. */
FbmSync.SESSION_SYSTEM_KINDS = ['login', 'authorize', 'identity_user_grid', 'session_probe', 'heartbeat'];
FbmSync.isSessionSystemRequest = function (request) {
  var kind = String(request && request.meta && request.meta.kind || '');
  return FbmSync.SESSION_SYSTEM_KINDS.indexOf(kind) >= 0;
};
FbmSync.sessionIdentityIsVerified = function (state) {
  var session = state && state.session || {};
  return session.expired !== true && session.identityVerified === true && !!String(session.sessionId || '') && String(session.identitySessionId || '') === String(session.sessionId || '');
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
FbmSync.sessionSystemRequest = function (kind, value) {
  var request, options = value && typeof value === 'object' ? value : {};
  if (kind === 'login') { request = FbmSync.loginRequest(value && value.credentialRef, value && value.testOnly === true, value && value.force === true); }
  else if (kind === 'authorize') { request = FbmSync.authorizeRequest(value && value.entity || value || 'customer'); }
  else if (kind === 'session_probe') { request = FbmSync.identityUserRequest(); request.meta.kind = 'session_probe'; }
  else if (kind === 'identity_user_grid') { request = FbmSync.identityUserRequest(); }
  else if (kind === 'heartbeat') { request = FbmSync.customerCountRequest('heartbeat'); }
  else { return null; }
  request.meta = Object.assign({}, request.meta || {}, { systemRequest: true });
  if (options.requireIdentityProbe === true) { request.meta.requireIdentityProbe = true; }
  return request;
};
FbmSync.sessionSystemEnvelope = function (kind, value) {
  var request = FbmSync.sessionSystemRequest(kind, value);
  return request ? FbmSync.nextEnvelope(request) : null;
};
FbmSync.sessionGateCursorIsInternal = function (state) {
  var cursor = state && state.cursor || {};
  return cursor.kind === 'login' || cursor.kind === 'login_identity_authorize' || cursor.kind === 'login_identity_user';
};
FbmSync.sessionGateRequestCode = function (request, state) {
  if (!request && state && state.lastFailureCode) { return String(state.lastFailureCode); }
  return FbmSync.sessionGateOwnsRequest(request, state) ? 'AUTO_' + 'LOGIN_REQUEST_READY' : 'HEARTBEAT_REQUEST_READY';
};
FbmSync.sessionGateAttachLoginToken = function (request, state) {
  var value = request || {}, meta = value.meta || {}, gate = FbmSync.sessionGateMeta(state), token = String(gate.loginToken || '');
  if (String(meta.kind || '') === 'login' && token) {
    value.meta = Object.assign({}, meta, { sessionGateToken: token });
  }
  return value;
};
FbmSync.sessionGateOwnsRequest = function (request, state) {
  var value = request || {}, meta = value.meta || {}, cursor = state && state.cursor || {}, gate = state && state.metadata && state.metadata.sessionGate || {};
  if (String(meta.kind || '') !== 'login' || cursor.kind !== 'login') { return false; }
  return !!gate.loginToken && String(meta.sessionGateToken || '') === String(gate.loginToken);
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
FbmSync.sessionGateBlock = function (state, code, message) {
  var current = state || FbmSync.stateRead();
  current.phase = 'paused';
  current.retryable = false;
  return FbmSync.sessionGateRecordFailure(current, code, message, 'session_gate_blocked');
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
  gate.loginToken = FbmSync.sessionGateToken();
  gate.loginStartedAt = Date.now();
  current.metadata.sessionGate = gate;
  FbmSync.stateWrite(current);
  request = FbmSync.sessionGateAttachLoginToken(allowed, current);
  return request;
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
  return { ok: true, request: envelope, status: FbmSync.statusView(), autoLogin: true };
};
/** Tạo probe hệ thống sau một response nghiệp vụ đáng ngờ; không retry nghiệp vụ. */
FbmSync.sessionGateProbeRequest = function (state, failedCursor, reason) {
  var current = state || FbmSync.stateRead(), gate = FbmSync.sessionGateMeta(current);
  gate.resumeCursor = Object.assign({}, failedCursor || {});
  gate.probeOnly = true;
  gate.probeRetryCount = 0;
  current.cursor = { kind: 'session_probe' };
  current.phase = 'checking_session';
  current.entity = '';
  current.message = String(reason || 'Đang probe lại phiên FBM để xác minh phản hồi đáng ngờ.');
  FbmSync.stateWrite(current);
  return FbmSync.nextEnvelope(FbmSync.sessionSystemRequest('session_probe'));
};
/** Ép probe ở đầu một lượt/lát mới rồi mới trả lại cursor nghiệp vụ. */
FbmSync.sessionGateResumeProbeRequest = function (state, resumeCursor, reason) {
  var current = state || FbmSync.stateRead(), gate = FbmSync.sessionGateMeta(current), resume = Object.assign({}, resumeCursor || current.cursor || {});
  gate.resumeCursor = resume;
  gate.resumePhase = String(current.phase || 'checking_session');
  gate.resumeEntity = String(current.entity || '');
  current.cursor = { kind: 'session_probe' };
  current.phase = 'checking_session';
  current.entity = '';
  current.activeRequestId = '';
  current.deadlineAt = 0;
  current.message = String(reason || 'Đang kiểm tra lại phiên FBM trước khi tiếp tục lát mới...');
  FbmSync.stateWrite(current);
  return FbmSync.sessionSystemEnvelope('session_probe');
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
    return FbmSync.nextEnvelope(FbmSync.sessionSystemRequest('session_probe'));
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
  return envelope ? { ok: true, request: envelope, status: FbmSync.statusView(), autoLogin: true } : { ok: false, code: 'AUTO_LOGIN_REQUEST_UNAVAILABLE', request: null, status: FbmSync.statusView(), error: current.lastError };
};
/** Chỉ thử lại một lần khi Extension báo không có tab; policy vẫn do GAS quyết định. */
FbmSync.sessionGateTransportRetry = function (state, requestId, code, message) {
  var value = String(code || ''), retryable = ['FBM_TAB_NOT_FOUND', 'FBM_TAB_NOT_READY'].indexOf(value) >= 0, policy = FbmSync.sessionGatePolicy(), gate = FbmSync.sessionGateMeta(state), request, envelope;
  if (!retryable || !policy.autoOpenTab || String(gate.noTabRetryRequestId || '') === String(requestId || '')) { return null; }
  state.activeRequestId = '';
  state.deadlineAt = 0;
  gate.noTabRetryRequestId = String(requestId || '');
  state.message = 'Chưa tìm thấy tab FBM; GAS yêu cầu Extension mở tab và thử lại một lần.';
  state.lastError = String(message || state.message).slice(0, 240);
  FbmSync.stateWrite(state);
  request = typeof FbmSync.requestForCursor === 'function' ? FbmSync.requestForCursor(state) : null;
  if (!request) { return null; }
  request = FbmSync.sessionGateAttachLoginToken(request, state);
  envelope = FbmSync.nextEnvelope(request);
  if (!envelope) { return null; }
  state = FbmSync.stateRead();
  gate = FbmSync.sessionGateMeta(state);
  gate.noTabRetryRequestId = String(envelope.id || '');
  state.message = 'Đang thử lại request sau khi GAS yêu cầu mở tab FBM.';
  FbmSync.sessionGateRecordFailure(state, value, message || 'Không tìm thấy tab FBM. Đang thử lại đúng một lần.', 'transport_retry');
  return { ok: true, code: 'FBM_TAB_RETRY_REQUEST_READY', request: envelope, status: FbmSync.statusView(), retrying: true };
};
FbmSync.sessionGateResponseStarted = function (state) {
  var gate = state && state.metadata && state.metadata.sessionGate;
  if (gate && gate.noTabRetryRequestId) { gate.noTabRetryRequestId = ''; }
  return state;
};
FbmSync.pauseForRuntimeLimit = function (state) {
  var current = state || (FbmSync.stateRead ? FbmSync.stateRead() : {});
  current.activeRequestId = '';
  current.deadlineAt = 0;
  current.phase = 'paused';
  current.lastFailureCode = 'GAS_RUNTIME_LIMIT';
  current.lastError = 'Lát GAS đã chạm trần thời gian; đã dừng trước request kế tiếp và giữ cursor an toàn.';
  current.message = current.lastError;
  current.retryable = true;
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'slice_limit', outcome: typeof LOG_ERROR === 'undefined' ? 'error' : LOG_ERROR, reason: current.lastFailureCode, detail: { runId: String(current.runId || ''), phase: String(current.phase || ''), cursor: current.cursor || {} } }); }
  if (FbmSync.stateWrite) { FbmSync.stateWrite(current); }
  return null;
};
/** Bọc request nội bộ thành envelope gửi qua Extension. */
FbmSync.nextEnvelope = function (request) {
  if (!request) { return null; }
  // Đang tắt thì không cấp request kế tiếp. Request đã gửi trước đó không thể thu hồi;
  // state được chuyển sang paused để người dùng xem và chủ động tiếp tục sau khi bật lại.
  if (!FbmSync.masterEnabled()) {
    var stopped = FbmSync.stateRead ? FbmSync.stateRead() : {};
    stopped.phase = 'paused';
    stopped.message = 'Đồng bộ đang tắt; không cấp request FBM mới. Request đang bay vẫn được giữ để không mất cursor.';
    stopped.lastError = '';
    if (FbmSync.stateWrite) { FbmSync.stateWrite(stopped); }
    return null;
  }
  var pendingState = FbmSync.stateRead ? FbmSync.stateRead() : {};
  if (FbmSync.budgetCallExhausted()) { return FbmSync.pauseForRuntimeLimit(pendingState); }
  if (pendingState.metadata && pendingState.metadata.cancelPending === true) {
    pendingState.phase = 'paused';
    pendingState.activeRequestId = '';
    pendingState.deadlineAt = 0;
    pendingState.message = 'Đã nhận xong response đang bay và dừng phiên; không cấp request FBM kế tiếp.';
    pendingState.metadata.cancelPending = false;
    if (FbmSync.stateWrite) { FbmSync.stateWrite(pendingState); }
    return null;
  }
  try {
    var internalLogin = FbmSync.sessionGateOwnsRequest(request, pendingState);
    // Login test cũng phải nhận token do cổng cấp; không dùng cờ trong request
    // để caller tự né cổng. Mục đích test chỉ được đọc từ cursor owner đã lưu.
    if (String(request.meta && request.meta.kind || '') === 'login' && !internalLogin && pendingState.cursor && pendingState.cursor.kind === 'login' && pendingState.cursor.purpose === 'test' && String(pendingState.cursor.credentialRef || '') === String(request.meta && request.meta.credentialRef || '')) {
      var testGate = FbmSync.sessionGateMeta(pendingState);
      testGate.loginToken = FbmSync.sessionGateToken();
      FbmSync.stateWrite(pendingState);
      request = FbmSync.sessionGateAttachLoginToken(request, pendingState);
      internalLogin = true;
    }
    // Mọi request nghiệp vụ và authorize đầu lượt phải qua probe User.
    // Probe là request hệ thống nên không quay lại nhánh này.
    var gateCursorKinds = ['customer_count', 'customer_grid', 'activity_grid', 'activity_recheck', 'lookup', 'push_lookup', 'push_scan', 'push_wait'];
    var requestKind = String(request.meta && request.meta.kind || ''), cursorNeedsGate = gateCursorKinds.indexOf(String(pendingState.cursor && pendingState.cursor.kind || '')) >= 0 && String(pendingState.cursor && pendingState.cursor.kind || '') !== 'push_wait';
    // Mọi request không thuộc nhóm hệ thống đều phải qua cổng; không cho
    // caller né cổng bằng cách đặt một tên meta.kind lạ.
    var requestNeedsGate = !FbmSync.isSessionSystemRequest(request) || cursorNeedsGate || requestKind === 'authorize';
    var loginFlowOwnsSystemRequest = typeof FbmSync.sessionGateCursorIsInternal === 'function' && FbmSync.sessionGateCursorIsInternal(pendingState);
    if (requestKind !== 'session_probe' && !internalLogin && !loginFlowOwnsSystemRequest && !FbmSync.sessionIdentityIsVerified(pendingState) && requestNeedsGate) {
      var gate = FbmSync.sessionGateMeta(pendingState), originalCursor = Object.assign({}, pendingState.cursor || {});
      if (originalCursor.kind !== 'session_probe') {
        gate.resumeCursor = originalCursor;
        gate.resumePhase = String(pendingState.phase || 'checking_session');
        gate.resumeEntity = String(pendingState.entity || '');
        pendingState.cursor = { kind: 'session_probe' };
        pendingState.phase = 'checking_session';
        pendingState.entity = '';
        pendingState.message = 'Đang kiểm tra tab và tài khoản FBM...';
        FbmSync.stateWrite(pendingState);
        request = FbmSync.sessionSystemRequest('session_probe');
      }
    }
    if (pendingState.session && pendingState.session.expired === true && !internalLogin && (!FbmSync.isSessionSystemRequest(request) || String(request.meta && request.meta.kind || '') === 'heartbeat')) {
      var gateRequest = FbmSync.sessionGateStart(pendingState, pendingState.cursor || {});
      if (!gateRequest) { return null; }
      request = gateRequest;
      pendingState = FbmSync.stateRead();
    }
    // Cổng có thể thay request authorize/nghiệp vụ bằng probe; transport phải
    // được chọn theo request thực tế sẽ gửi, không theo request caller ban đầu.
    requestKind = String(request.meta && request.meta.kind || requestKind);
  } catch (gateError) {
    return FbmSync.sessionGateFailClosed(pendingState, gateError);
  }
  (request.items || [request]).forEach(function (item) {
    var endpoint = FbmSync.protocol.validateEndpoint(item.url);
    if (!endpoint.ok) {
      if (FbmSync.traceEvent) { FbmSync.traceEvent('request_blocked', { operation: item.meta && item.meta.kind || '', endpoint: item.url, code: endpoint.code }); }
      throw new Error(endpoint.message + ' (' + endpoint.code + ')');
    }
  });
  // Một lượt relay có thể dựng nhiều envelope trong cùng một mili-giây. Bộ đếm
  // trong vùng tên GAS giữ các ID đó khác nhau trong cùng một lượt chạy.
  var now = Date.now(), sequence = Number(FbmSync._requestIdAt || 0) === now ? Number(FbmSync._requestIdSequence || 0) + 1 : 0;
  FbmSync._requestIdAt = now;
  FbmSync._requestIdSequence = sequence;
  // Giữ dạng ID cũ khi không có nguy cơ trùng để DTO/trace không phình theo số
  // bước; chỉ thêm hậu tố tuần tự cho các envelope cùng mili-giây.
  var id = now.toString(36) + (sequence ? '-' + sequence.toString(36) : ''), state = FbmSync.stateRead ? FbmSync.stateRead() : {}, meta = Object.assign({}, request.meta || {});
  meta.trace = Object.assign({}, meta.trace || {}, { runId: String(state.runId || ''), requestId: id });
  // Extension chỉ có bộ lọc generic; GAS quyết định rõ dữ liệu phụ trợ cần lấy từ tab.
  var defaultTransport = FbmSync.payloadCookieTransport();
  meta.transport = Object.assign(defaultTransport, meta.transport || {});
  var requestGap = state.requestGap && Number(state.requestGap.maxMs) > 0 ? { minMs: Number(state.requestGap.minMs || 0), maxMs: Number(state.requestGap.maxMs) } : null;
  if (requestGap) { meta.requestGap = requestGap; }
  try {
    var sessionPolicy = FbmSync.sessionGatePolicy();
    if (sessionPolicy.autoOpenTab) {
      var script = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {};
      meta.openFbmContext = { url: String(script.baseUrl || 'https://fbo.com.vn:8888') + '/Main/zccrAccount.aspx', active: false };
    } else {
      delete meta.openFbmContext;
    }
  } catch (gateError) {
    return FbmSync.sessionGateFailClosed(pendingState, gateError);
  }
  meta.timeoutMs = FbmSync.budgetTimeoutMs(request, requestGap);
  meta.fetchMs = FbmSync.budgetFetchMs(meta);
  meta.extensionReplyMs = FbmSync.budgetExtensionReplyMs(meta.timeoutMs);
  meta.gasReplyMs = FbmSync.budgetGasReplyMs();
  if (request.items) { meta.batch = { maxBytes: FbmSync.BUDGET.batchMaxBytes }; }
  if (FbmSync.stateWrite) {
    state.activeRequestId = id;
    state.lastProgressAt = Date.now();
    state.deadlineAt = FbmSync.budgetDeadlineAt(state.lastProgressAt, meta.timeoutMs);
    FbmSync.stateWrite(state);
  }
  if (FbmSync.traceEvent) { FbmSync.traceEvent('response_built', { requestId: id, operation: meta.kind, entity: meta.entity, recordId: meta.id || meta.shinId || meta.stt_rec_kh, items: request.items ? request.items.length : undefined }); }
  if (request.items) { return FbmSync.protocol.batch(id, request.items.map(function (item) { return { url: item.url, body: FbmSync.transportValue(item.body), meta: item.meta }; }), FbmSync.transportValue(meta)); }
  return FbmSync.protocol.request(id, request.url, FbmSync.transportValue(request.body), FbmSync.transportValue(meta));
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
/** Dựng lại request đọc từ cursor; không lưu payload/cookie để retry không làm lộ bí mật. */
FbmSync.requestForCursor = function (state) {
  var cursor = state && state.cursor || {};
  if (cursor.kind === 'heartbeat') { return FbmSync.sessionSystemRequest('heartbeat'); }
  if (cursor.kind === 'login') { return FbmSync.sessionSystemRequest('login', { credentialRef: cursor.credentialRef, testOnly: false }); }
  if (cursor.kind === 'login_identity_authorize') { return FbmSync.sessionSystemRequest('authorize', { entity: 'customer' }); }
  if (cursor.kind === 'login_identity_user') { return FbmSync.sessionSystemRequest('identity_user_grid'); }
  if (cursor.kind === 'session_probe') { return FbmSync.sessionSystemRequest('session_probe'); }
  if (cursor.kind === 'authorize_customer') { return FbmSync.sessionSystemRequest('authorize', { entity: 'customer' }); }
  if (cursor.kind === 'authorize_activity') { return FbmSync.sessionSystemRequest('authorize', { entity: 'activity' }); }
  if (cursor.kind === 'identity_user_grid') { return FbmSync.sessionSystemRequest('identity_user_grid'); }
  if (cursor.kind === 'lookup' || cursor.kind === 'push_lookup') { return FbmSync.lookupBatchRequest(); }
  if (cursor.kind === 'customer_grid') {
    return FbmSync.customerGridRequest({ type: Number(cursor.type || 0), count: Number(cursor.count || 2000), gridPageIndex: cursor.pageIndex === undefined ? -1 : cursor.pageIndex, gridPageValue: cursor.pageValue === undefined ? null : cursor.pageValue, pageItems: cursor.pageItems, gridRefresh: false });
  }
  if (cursor.kind === 'scan_job') { return FbmSync.scanJobRequest(state); }
  if (cursor.kind === 'customer_count') { return FbmSync.customerCountRequest(); }
  if (cursor.kind === 'activity_grid') { return FbmSync.activityBatchRequest(state); }
  if (cursor.kind === 'activity_recheck') { return FbmSync.activityRecheckRequest(state); }
  return null;
};
