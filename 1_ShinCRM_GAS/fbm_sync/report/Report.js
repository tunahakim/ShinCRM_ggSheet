/** Snapshot tiến độ công khai cho Sidebar; không tự tạo request FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đổi phase nội bộ thành nhãn hiển thị ngắn. */
FbmSync.statusLabel = function (phase) {
  return ({ idle: 'Sẵn sàng', checking_session: 'Đang kiểm tra phiên FBM', pull_customer: 'Đang đọc khách hàng', pull_activity: 'Đang đọc giao dịch', reconcile: 'Đang đối chiếu', push: 'Đang ghi dữ liệu', paused: 'Tạm dừng', conflict: 'Có xung đột', error: 'Có lỗi', done: 'Hoàn tất' })[phase] || String(phase || '');
};
/** Trả về snapshot đầy đủ để Sidebar render một lần. */
FbmSync.statusView = function () {
  var state = FbmSync.stateRead();
  return { ok: true, runId: state.runId, phase: state.phase, label: FbmSync.statusLabel(state.phase), entity: state.entity, cursor: state.cursor, session: { customer: !!state.session.customerAuthorized, activity: !!state.session.activityAuthorized }, metadata: state.metadata, counts: state.counts, current: state.current, message: state.message, startedAt: state.startedAt, updatedAt: state.updatedAt, nextRunAt: state.nextRunAt, lastError: state.lastError, locks: state.locks };
};
/** API tương thích cho caller GAS cũ. */
function fbmSyncStatus() { return FbmSync.statusView(); }
