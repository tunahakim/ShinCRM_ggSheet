/**
 * Nghiệm thu dừng đồng bộ nền trên DEV bằng đúng các cửa Sidebar gọi, không chờ nhịp hỏi của Extension. Chế độ đọc nên không gửi gì lên FBM; request cấp ra không có Extension gửi đi thì `fbmDevReleaseUnsentRequest` đóng lại.
 */

/** Mở ngay một lượt nền chỉ đọc trong khóa điều phối và ranh giới lát như cửa lệnh làm (lệnh `start` của Sidebar chỉ mở lượt tay), để nghiệm thu nút dừng nền mà không chờ nhịp hỏi của Extension. Lượt nằm ở bước kiểm phiên tới khi Extension hỏi; chế độ đọc nên không gửi gì lên FBM. Chỉ DEV. */
function fbmDevOpenBackgroundRun() {
  var opened = FbmSync.withOrchestrationLock(function () { return FbmSync.runSlice(function () { return FbmSync.start({ mode: 'read', scan: 'full', origin: 'background', manual: false }, FbmSync.stateRead()); }); });
  var state = FbmSync.stateRead();
  return { ok: opened && opened.ok !== false, code: opened && opened.code || '', running: FbmSync.runInProgress(state), origin: state.origin, phase: state.phase, message: state.message };
}

/** Nghiệm thu dừng nền bằng đúng các hàm Sidebar gọi: mở lượt nền, lệnh tay bị chặn bằng `SYNC_BACKGROUND_RUNNING`, dừng nền thì kênh rảnh ngay, lệnh tay gọi lại mở được lượt tay; cuối cùng hủy lượt tay để DEV về rảnh. Chế độ đọc nên không gửi gì lên FBM. Chỉ DEV. */
function fbmDevProbeStopBackground() {
  var view = function (status) { var s = status || {}; return { running: s.running, origin: s.origin, phase: s.phase }; };
  var opened = fbmDevOpenBackgroundRun();
  var blocked = fbmDriveCommand('start', { kind: 'sync', mode: 'read', machineId: 'dev-probe' });
  var stopped = fbmStopBackground();
  var restarted = fbmDriveCommand('start', { kind: 'sync', mode: 'read', machineId: 'dev-probe' });
  var cancelled = fbmCancelSync();
  var released = fbmDevReleaseUnsentRequest();
  return {
    opened: opened,
    blocked: { ok: blocked.ok, code: blocked.code || '', status: view(blocked.status) },
    stopped: { ok: stopped.ok, code: stopped.code || '', status: view(stopped.status) },
    restarted: { ok: restarted.ok, code: restarted.code || '', status: view(restarted.status), runId: restarted.runId || '' },
    cancelled: { ok: cancelled.ok, code: cancelled.code || '', status: view(cancelled.status || cancelled) },
    released: released
  };
}

/** Request do hàm dò dòng lệnh cấp không có Extension nào gửi đi; báo lỗi truyền tải qua đúng cửa Sidebar dùng để lượt đang chờ đóng lại thay vì treo. Chỉ DEV. */
function fbmDevReleaseUnsentRequest() {
  var requestId = String(FbmSync.stateRead().activeRequestId || '');
  if (!requestId) { return { released: false, status: FbmSync.stateRead().phase }; }
  var state = FbmSync.stateRead();
  var result = FbmSync.controlDispatch('continue', { machineId: String(state.driverMachineId || ''), error: { requestId: requestId, code: 'DEV_PROBE_NOT_SENT', message: 'Hàm dò DEV cấp request nhưng không gửi qua Extension.' } }, 'relay');
  var status = result && (result.status || result) || {};
  return { released: true, code: result && result.code || '', running: status.running, phase: status.phase };
}

/** Đo lệnh mở lượt tay khi ô lượt đang giữ một lượt nền đã kẹt (không còn request trong hạn, quá `STALE_RUN_MS`): mở lượt nền, làm già ô lượt, gọi đúng cửa Sidebar gọi và bấm giờ, rồi hủy lượt tay. Chế độ đọc nên không gửi gì lên FBM. Chỉ DEV. */
function fbmDevProbeStartAfterStale() {
  var opened = fbmDevOpenBackgroundRun();
  FbmSync.withOrchestrationLock(function () {
    var state = FbmSync.stateRead();
    state.updatedAt = Date.now() - FbmSync.STALE_RUN_MS - 60000; state.activeRequestId = ''; state.deadlineAt = 0;
    FbmSync.stateStore(state);
  });
  var t0 = Date.now(), started = fbmDriveCommand('start', { kind: 'sync', mode: 'read', machineId: 'dev-probe' }), t1 = Date.now();
  var trace = FbmSync.traceRead(60).filter(function (row) { return Number(row.at || 0) >= t0; }).map(function (row) { return { ms: Number(row.at) - t0, stage: row.stage, operation: row.operation, error: row.error }; });
  var cancelled = fbmCancelSync(), released = fbmDevReleaseUnsentRequest();
  return { opened: opened, startMs: t1 - t0, started: { ok: started.ok, code: started.code || '', runId: started.runId || '', phase: started.status && started.status.phase }, trace: trace, cancelled: { ok: cancelled.ok, code: cancelled.code || '' }, released: released };
}
