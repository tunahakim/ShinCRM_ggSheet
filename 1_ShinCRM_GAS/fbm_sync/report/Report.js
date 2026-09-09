/** Snapshot tiến độ công khai cho Sidebar; không tự tạo request FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đổi phase nội bộ thành nhãn hiển thị ngắn. */
FbmSync.statusLabel = function (phase) {
  return ({ idle: 'Sẵn sàng', checking_session: 'Đang kiểm tra phiên FBM', pull_customer: 'Đang đọc khách hàng', pull_activity: 'Đang đọc giao dịch', reconcile: 'Đang đối chiếu', push: 'Đang ghi dữ liệu', paused: 'Tạm dừng', conflict: 'Có xung đột', error: 'Có lỗi', done: 'Hoàn tất' })[phase] || String(phase || '');
};
/** Nhãn hướng dữ liệu để Sidebar không phải suy diễn từ cursor nội bộ. */
FbmSync.syncDirection = function (state) {
  var phase = String(state && state.phase || ''), mode = String(state && state.mode || 'read');
  if (phase === 'checking_session') { return 'Kết nối FBM'; }
  if (phase === 'push') { return 'ShinCRM → FBM'; }
  if (phase === 'done' && mode === 'write') { return 'Hai chiều'; }
  return 'FBM → ShinCRM';
};
/** Nhãn thực thể hiện tại; dùng "Chuẩn bị phiên" khi chưa có bản ghi. */
FbmSync.syncEntityLabel = function (entity, phase) {
  if (entity === 'customer') { return 'Khách hàng'; }
  if (entity === 'activity') { return 'Giao dịch'; }
  if (phase === 'checking_session') { return 'Chuẩn bị phiên'; }
  return 'Tổng hợp';
};
/** Trả về snapshot đầy đủ để Sidebar render một lần. */
FbmSync.statusView = function () {
  var state = FbmSync.stateRead();
  return { ok: true, runId: state.runId, mode: state.mode, writeAllowed: FbmSync.writeAllowed(), phase: state.phase, label: FbmSync.statusLabel(state.phase), direction: FbmSync.syncDirection(state), entity: state.entity, entityLabel: FbmSync.syncEntityLabel(state.entity, state.phase), cursor: state.cursor, session: { customer: !!state.session.customerAuthorized, activity: !!state.session.activityAuthorized }, metadata: state.metadata, counts: state.counts, current: state.current, message: state.message, startedAt: state.startedAt, updatedAt: state.updatedAt, nextRunAt: state.nextRunAt, lastError: state.lastError, locks: state.locks };
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
