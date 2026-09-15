/** Snapshot tiến độ công khai cho Sidebar; không tự tạo request FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đổi phase nội bộ thành nhãn hiển thị ngắn. */
FbmSync.statusLabel = function (phase) {
  return ({ idle: 'Sẵn sàng', checking_session: 'Đang kiểm tra phiên FBM', pull_customer: 'Đang đọc khách hàng', pull_activity: 'Đang đọc giao dịch', reconcile: 'Đang đối chiếu', push: 'Đang ghi dữ liệu', awaiting_approval: 'Chờ người dùng chấp thuận', paused: 'Tạm dừng', conflict: 'Có xung đột', error: 'Có lỗi', done: 'Hoàn tất' })[phase] || String(phase || '');
};
/** Nhãn hướng dữ liệu để Sidebar không phải suy diễn từ cursor nội bộ. */
FbmSync.syncDirection = function (state) {
  var phase = String(state && state.phase || ''), mode = String(state && state.mode || 'read');
  if (phase === 'checking_session') { return 'Kết nối FBM'; }
  if (phase === 'push') { return 'ShinCRM → FBM'; }
  if (phase === 'done' && mode === 'write') { return 'Hai chiều'; }
  if (mode === 'push') { return 'ShinCRM → FBM'; }
  if (mode === 'check') { return 'Kiểm tra'; }
  return 'FBM → ShinCRM';
};
/** Nhãn thực thể hiện tại; dùng "Chuẩn bị phiên" khi chưa có bản ghi. */
FbmSync.syncEntityLabel = function (entity, phase) {
  if (entity === 'customer') { return 'Khách hàng'; }
  if (entity === 'activity') { return 'Giao dịch'; }
  if (phase === 'checking_session') { return 'Chuẩn bị phiên'; }
  return 'Tổng hợp';
};
/** Chỉ đưa dữ liệu render sang Sidebar; state nội bộ có lookup, cursor form và khóa vẫn ở GAS. */
FbmSync.statusMetadata = function (metadata) {
  var data = metadata || {}, keys = ['audit', 'categoryBlocks', 'identityBlocks', 'identityProbe', 'identityCheck', 'activityBulkMissing', 'activityBulkMissingCount', 'preflight', 'preflightIssues', 'preview', 'pushFailures', 'pushFailureDetails', 'callbackTrace'];
  var out = keys.reduce(function (result, key) {
    if (data[key] !== undefined) { result[key] = data[key]; }
    return result;
  }, {});
  // GAS giữ cả hàng đợi conflict; Sidebar chỉ cần một bản ghi để đối chiếu và quyết định.
  var conflicts = Array.isArray(data.conflicts) ? data.conflicts : [];
  out.conflictCount = conflicts.length;
  out.conflicts = conflicts.length ? [conflicts[0]] : [];
  var failures = data.pushFailures && typeof data.pushFailures === 'object' ? data.pushFailures : {}, failureKeys = Object.keys(failures), details = data.pushFailureDetails && typeof data.pushFailureDetails === 'object' ? data.pushFailureDetails : {};
  out.pushFailureCount = failureKeys.length;
  out.pushFailures = {};
  out.pushFailureDetails = {};
  failureKeys.slice(0, 20).forEach(function (key) { out.pushFailures[key] = failures[key]; if (details[key] !== undefined) { out.pushFailureDetails[key] = details[key]; } });
  return out;
};
/** Cursor công khai chỉ dùng để chẩn đoán trạng thái; không trả bản ghi, OldValue hay khóa về trình duyệt. */
FbmSync.statusCursor = function (cursor) {
  var value = cursor || {};
  return { kind: String(value.kind || ''), operation: String(value.operation || ''), entity: String(value.entity || ''), index: Number(value.index || 0) };
};
/** Chuyển state GAS thành các chặng hiển thị cố định; Sidebar không tự đoán từ cursor. */
FbmSync.pipelineDefinition = function (state) {
  var value = state || {}, scan = String(value.scan || 'full'), mode = String(value.mode || 'read'), cursor = value.cursor || {};
  if (scan === 'identity_probe') { return { kind: 'identity_probe', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'identity', label: 'Đọc nhận diện tài khoản' }] }; }
  if (scan === 'identity_check') { return { kind: 'identity_check', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'customer', label: 'Quét Customer' }, { id: 'reconcile', label: 'Đối chiếu liên kết' }] }; }
  if (String(cursor.kind || '') === 'login' || /^login_identity_/.test(String(cursor.kind || ''))) {
    return { kind: 'login_test', steps: [{ id: 'login', label: 'Đăng nhập FBM' }, { id: 'session', label: 'Kiểm tra phiên' }, { id: 'identity', label: 'Xác minh tài khoản' }] };
  }
  if (scan === 'activity_bulk') { return { kind: 'activity_bulk', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'activity', label: 'Đọc Activity' }, { id: 'reconcile', label: 'Đối soát' }, { id: 'sheet', label: 'Cập nhật Sheet' }] }; }
  if (scan === 'detail') { return { kind: 'detail', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'customer', label: 'Đọc Customer theo lô' }, { id: 'activity', label: 'Đọc Activity chi tiết' }, { id: 'reconcile', label: 'Đối soát' }] }; }
  if (mode === 'push') { return { kind: 'push', steps: [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'record', label: 'Kiểm tra bản ghi' }, { id: 'form', label: 'Mở form FBM' }, { id: 'write', label: 'Ghi FBM' }, { id: 'verify', label: 'Đọc xác nhận' }, { id: 'baseline', label: 'Cập nhật baseline' }] }; }
  var pull = [{ id: 'session', label: 'Kiểm tra phiên FBM' }, { id: 'category', label: 'Category' }, { id: 'customer', label: 'Đọc Customer' }, { id: 'activity', label: 'Đọc Activity' }, { id: 'reconcile', label: 'Đối soát' }];
  if (mode !== 'check') { pull.push({ id: 'sheet', label: 'Cập nhật Sheet' }); }
  if (mode === 'write') {
    pull = pull.concat([{ id: 'record', label: 'Kiểm tra bản ghi' }, { id: 'form', label: 'Mở form FBM' }, { id: 'write', label: 'Ghi FBM' }, { id: 'verify', label: 'Đọc xác nhận' }, { id: 'baseline', label: 'Cập nhật baseline' }]);
  }
  return { kind: mode === 'check' ? 'check' : mode === 'write' ? 'write' : 'read', steps: pull };
};
/** Xác định duy nhất một chặng đang chờ/xử lý từ state đã có trên GAS. */
FbmSync.pipelineCurrentStep = function (state, definition) {
  var value = state || {}, phase = String(value.phase || ''), cursor = value.cursor || {}, kind = String(cursor.kind || ''), operation = String(cursor.operation || ''), available = {};
  (definition.steps || []).forEach(function (step) { available[step.id] = true; });
  if (phase === 'done' || phase === 'idle') { return ''; }
  if (kind === 'lookup') { return available.category ? 'category' : ''; }
  if (kind === 'login_identity_authorize') { return available.session ? 'session' : 'login'; }
  if (kind === 'identity_user_grid' || kind === 'login_identity_user') { return available.identity ? 'identity' : 'session'; }
  if (kind === 'customer_grid' || kind === 'activity_rotation_customer_grid') { return available.customer ? 'customer' : ''; }
  if (kind === 'activity_grid' || kind === 'activity_bulk_grid') { return available.activity ? 'activity' : ''; }
  if (kind === 'push_scan') { return available.record ? 'record' : ''; }
  if (/(?:customer|activity)_(?:create|edit)_open$/.test(kind)) { return available.form ? 'form' : ''; }
  if (kind === 'push_wait') {
    if (/verify/.test(operation)) { return available.verify ? 'verify' : 'write'; }
    return available.write ? 'write' : '';
  }
  if (phase === 'pull_customer') { return available.customer ? 'customer' : ''; }
  if (phase === 'pull_activity') { return available.activity ? 'activity' : ''; }
  if (phase === 'reconcile' || phase === 'conflict') { return available.reconcile ? 'reconcile' : ''; }
  if (phase === 'push') { return available.record ? 'record' : ''; }
  if (phase === 'checking_session') { return available.login && (kind === 'login' || /^login_/.test(kind)) ? 'login' : 'session'; }
  return '';
};
/** DTO tiến độ chỉ dùng để vẽ; marker hoàn tất luôn xuất phát từ state GAS cùng lượt. */
FbmSync.pipelineView = function (state) {
  var value = state || {}, phase = String(value.phase || 'idle'), definition = FbmSync.pipelineDefinition(value), current = FbmSync.pipelineCurrentStep(value, definition), currentIndex = -1;
  (definition.steps || []).forEach(function (step, index) { if (step.id === current) { currentIndex = index; } });
  var title = phase === 'idle' ? 'Pipeline sẽ chạy' : phase === 'done' ? 'Pipeline đã hoàn tất' : phase === 'error' ? 'Pipeline dừng vì lỗi' : phase === 'paused' ? 'Pipeline đã tạm dừng' : phase === 'conflict' ? 'Pipeline dừng để xử lý xung đột' : phase === 'awaiting_approval' ? 'Pipeline chờ người dùng chấp thuận' : 'Pipeline đang chạy';
  return {
    kind: definition.kind,
    title: title,
    steps: (definition.steps || []).map(function (step, index) {
      var stepState = phase === 'done' ? 'done' : index < currentIndex ? 'done' : index === currentIndex ? (phase === 'error' || phase === 'conflict' ? 'error' : phase === 'paused' ? 'paused' : 'current') : 'pending';
      return { id: step.id, label: step.label, state: stepState };
    })
  };
};
/** Trả về snapshot gọn để Sidebar render một lần. */
FbmSync.statusView = function () {
  var state = FbmSync.stateRead();
  var metadata = FbmSync.statusMetadata(state.metadata);
  if (typeof FbmSync.traceRead === 'function') { metadata.traceTail = FbmSync.traceRead(20); }
  var enabled = typeof FbmSync.masterEnabled === 'function' ? FbmSync.masterEnabled() : true;
  var background = typeof FbmSync.backgroundEnabled === 'function' ? FbmSync.backgroundEnabled() : true;
  return { ok: true, enabled: enabled, masterEnabled: enabled, backgroundEnabled: background, runId: state.runId, mode: state.mode, scan: state.scan || 'full', scheduledScan: state.scheduledScan ? state.scheduledScan : '', login: typeof FbmSync.loginConfigPublic === 'function' ? FbmSync.loginConfigPublic() : null, phase: state.phase, label: FbmSync.statusLabel(state.phase), direction: FbmSync.syncDirection(state), entity: state.entity, entityLabel: FbmSync.syncEntityLabel(state.entity, state.phase), pipeline: FbmSync.pipelineView(state), cursor: FbmSync.statusCursor(state.cursor), session: { customer: !!state.session.customerAuthorized, activity: !!state.session.activityAuthorized, expired: state.session.expired === true, lastHeartbeatAt: Number(state.session.lastHeartbeatAt || 0) }, metadata: metadata, counts: state.counts, current: state.current, message: state.message, startedAt: state.startedAt, updatedAt: state.updatedAt, nextRunAt: state.nextRunAt, lastError: state.lastError, lastFailureCode: state.lastFailureCode || '', retryable: state.retryable === true };
};

/** Ghi snapshot nghiệp vụ; payload/cookie không bao giờ đi vào Log. */
FbmSync.logStatus = function (status, action) {
  if (!status || typeof logEvent !== 'function') { return; }
  var phase = String(status.phase || 'idle');
  var outcome = phase === 'error' || status.lastError ? LOG_ERROR : (phase === 'conflict' ? LOG_CONFLICT : LOG_OK);
  var writer = outcome === LOG_ERROR ? logEvent : logTrace;
  writer({
    source: 'fbm_sync', action: action || 'slice', outcome: outcome,
    entity: status.entity || '', recordId: status.current || '',
    reason: status.message || status.label || phase,
    detail: { phase: phase, direction: status.direction || '', entityLabel: status.entityLabel || '', counts: status.counts || {}, lastError: status.lastError || '' }
  });
};
/** Chỉ ghi khi đổi giai đoạn hoặc kết thúc để không làm chậm từng request FBM. */
FbmSync.shouldLogStatus = function (before, after) {
  if (!after) { return false; }
  var phase = String(after.phase || '');
  return phase === 'error' || phase === 'done' || phase === 'paused' || phase === 'conflict' || !before || String(before.phase || '') !== phase || String(before.entity || '') !== String(after.entity || '');
};
/** Ghi lỗi vận chuyển khi Sidebar không nhận được response từ Extension. */
FbmSync.logTransportError = function (message, action) {
  var status = FbmSync.statusView(), reason = String(message || 'Không nhận được phản hồi từ Extension.');
  status.phase = 'error'; status.lastError = reason; status.message = reason;
  FbmSync.logStatus(status, action || 'transport_error');
  return status;
};
/** Keep a bounded read-only preview for live verification without writing Sheet data. */
FbmSync.previewRecords = function (state, entity, records) {
  state.metadata = state.metadata || {};
  state.metadata.preview = state.metadata.preview || { customers: [], activities: [], truncated: false };
  state.metadata.preview.customers = state.metadata.preview.customers || [];
  state.metadata.preview.activities = state.metadata.preview.activities || [];
  var target = entity === 'customer' ? state.metadata.preview.customers : state.metadata.preview.activities;
  var limit = entity === 'customer' ? 10 : 50;
  (records || []).forEach(function (record) {
    if (target.length >= limit) { state.metadata.preview.truncated = true; return; }
    if (entity === 'customer') {
      target.push({ code: String(record.fbmCustomerCode || ''), name: String(record.companyName || ''), fbmId: String(record.fbmId || '') });
    } else {
      target.push({ customerCode: String(record.customerId || ''), date: String(record.workDate || ''), type: String(record.taskType || ''), content: String(record.content || '') });
    }
  });
  return state;
};
/** API tương thích cho caller GAS cũ. */
function fbmSyncStatus() { return FbmSync.statusView(); }
