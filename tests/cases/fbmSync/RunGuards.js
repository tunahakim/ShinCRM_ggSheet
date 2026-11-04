/**
 * Kiểm các rào của ô lượt dùng chung cho mọi lượt (nền hay tay): câu hộp đen Extension trong Log, nhãn lượt trong Log theo tiến trình nền, lát bỏ lượt mở mà không còn request (RUN_LEFT_OPEN), dừng lượt nền và response đến muộn sau khi dừng, danh sách pha "đang chạy" của màn trạng thái.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

function chay(so) {
  section('FBM sync - rào ô lượt: hộp đen, nhãn lượt, lượt bỏ mở, dừng nền');
  const logs = [];
  const flow = workflowGas({ logEvent: (event) => logs.push(event), LOG_WARN: 'warn' }), F = flow.hop.FbmSync;
  const contract = F.protocol.contract;

  check(so, 'Hộp đen Extension: không có hộp đen thì nói rõ, worker chạy liền thì nói không bị tắt', [
    F.extensionTrailText(null, Date.now()), F.extensionTrailText({ stage: 'gas_response_sent', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 50 }, 1000)
  ], ['Hộp đen Extension: không có (Extension bản cũ hoặc chưa ghi được bước nào).', 'Hộp đen Extension: bước cuối (cách đây 0 phút) là đã gửi kết quả về GAS, chưa nhận trả lời. Phần chạy nền của Extension vẫn chạy liền từ bước đó, không khởi động lại.']);
  check(so, 'Hộp đen Extension: Extension đã chạy hết lượt thì không nói bị Chrome tắt dù worker dựng lại sau đó, chỉ ra lỗi phía GAS', F.extensionTrailText({ stage: 'chain_finished', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 900 }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là Extension đã chạy hết lượt vì GAS trả lời không còn request tiếp. Lượt còn mở là lỗi phía GAS, không phải Extension bỏ dở.');
  check(so, 'Hộp đen Extension: GAS trả lỗi thì Log nêu mã lỗi Extension nhận được, chỉ giữ ký tự an toàn', F.extensionTrailText({ stage: 'gas_reply_failed', at: 1000, code: 'RELAY_TIMEOUT<script>' }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là GAS trả lời lỗi hoặc Extension không gọi được GAS, Extension dừng lượt. Mã lỗi: RELAY_TIMEOUTscript.');
  check(so, 'Hộp đen Extension: relay 404 thì Log nêu mã RELAY_ENDPOINT_NOT_FOUND kèm HTTP 404', F.extensionTrailText({ stage: 'gas_reply_failed', at: 1000, code: 'RELAY_ENDPOINT_NOT_FOUND', httpStatus: 404 }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là GAS trả lời lỗi hoặc Extension không gọi được GAS, Extension dừng lượt. Mã lỗi: RELAY_ENDPOINT_NOT_FOUND (HTTP 404).');
  check(so, 'Hộp đen Extension: lượt dừng lúc đổi tab FBM về trang GAS yêu cầu thì Log nói rõ bước đó, mã lỗi và việc phần chạy nền khởi động lại', F.extensionTrailText({ stage: 'fbm_page_reloading', requestId: 'r-1', code: 'FBM_TAB_NOT_READY', at: 1000, workerStartedAt: 50, currentWorkerStartedAt: 900 }, 1000),
    'Hộp đen Extension: bước cuối (cách đây 0 phút) là Extension đang đổi tab FBM về trang GAS yêu cầu tải lại, request r-1. Mã lỗi: FBM_TAB_NOT_READY. Phần chạy nền của Extension đã khởi động lại sau bước đó nên lượt bị cắt giữa chừng (Chrome tắt phần chạy nền hoặc Extension được tải lại).');

  const nhan = (patch) => F.runLabelOf(Object.assign({ runId: 'r', phase: 'pull_customer' }, patch));
  check(so, 'Lượt trong Log: Giữ phiên là Nền; Quét nhanh do Giữ phiên mở ghi cả hai; tiến trình nền ghi tên nó; lượt bấm tay ghi Tay và kiểu quét, không ghi tiến trình nền sót',
    [nhan({ origin: 'background', process: 'heartbeat', scan: 'keepalive' }), nhan({ origin: 'background', process: 'heartbeat', scan: 'full' }), nhan({ origin: 'background', process: 'detail', scan: 'detail' }), nhan({ origin: 'manual', process: 'heartbeat', scan: 'full' })],
    ['Nền · Giữ phiên FBM', 'Nền · Giữ phiên FBM · Quét nhanh', 'Nền · Vòng xoay giao dịch', 'Tay · Quét nhanh']);
  F.runOpen({ phase: 'checking_session', origin: 'background', mode: 'read', scan: 'detail', process: 'detail', pollAt: Date.now() });
  F.logContextNote(F.stateRead());
  check(so, 'Mở lượt ghi ngay nguồn, kiểu quét và tiến trình: đọc lại kho giữa chừng vẫn thấy lượt nền Vòng xoay',
    [F.stateRead().origin, F.stateRead().process, F.logContextText()],
    ['background', 'detail', 'Nền · Vòng xoay giao dịch']);

  F.statePatch({ runId: 'left-open-run', origin: 'background', phase: 'pull_customer', cursor: { kind: 'scan_job' }, activeRequestId: 'in-flight', deadlineAt: Date.now() + 60000 });
  const inFlightReply = F.runSlice(() => ({ ok: true, request: null }));
  const inFlightPhase = F.stateRead().phase;
  F.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const leftOpenReply = F.runSlice(() => ({ ok: true, request: null })), leftOpenState = F.stateRead();
  check(so, 'Lát trả hết việc khi lượt còn ở pha đang chạy và không request nào chờ: đóng lượt ngay với RUN_LEFT_OPEN và Log ghi lỗi phía GAS; còn request đang chờ thì không đụng', [
    inFlightReply.ok, inFlightPhase, leftOpenReply.ok, leftOpenReply.code, leftOpenState.phase, leftOpenState.lastFailureCode, logs.filter((entry) => entry.action === 'run_left_open').length
  ], [true, 'pull_customer', false, 'RUN_LEFT_OPEN', 'error', 'RUN_LEFT_OPEN', 1]);

  const nen = F.stateRead();
  Object.assign(nen, { runId: 'background-run', origin: 'background', process: 'customerFull', phase: 'pull_customer', entity: 'customer', activeRequestId: 'background-request', deadlineAt: Date.now() + 60000, cursor: { kind: 'customer_grid', type: 0, pageIndex: 0, pageValue: null, count: 2000 } });
  nen.metadata.manualPending = null;
  F.stateWrite(nen);
  check(so, 'trạng thái gửi Sidebar nêu lượt đang chạy là của ai và của tiến trình nào',
    [F.statusView().origin, F.statusView().process],
    ['background', 'customerFull']);
  const manualRequest = F.start({ mode: 'read', manual: true });
  check(so, 'chạy tay giữa lượt nền không tự dừng nền mà trả mã để Sidebar hỏi người dùng',
    [manualRequest.ok, manualRequest.code, !!manualRequest.status, F.stateRead().runId],
    [false, 'SYNC_BACKGROUND_RUNNING', true, 'background-run']);
  const stopRequest = F.runStopCommand('background'), afterStop = F.stateRead();
  check(so, 'lệnh dừng nền đóng lượt nền ngay: tạm dừng, running:false, giữ runId để vẽ kết quả, nhớ request đang bay, giữ tên tiến trình để lần hỏi sau ghi sổ',
    [stopRequest.ok, stopRequest.code, stopRequest.status.running, afterStop.phase, afterStop.runId, afterStop.activeRequestId, afterStop.closedRequestId, afterStop.process],
    [true, 'SYNC_BACKGROUND_STOPPED', false, 'paused', 'background-run', '', 'background-request', 'customerFull']);
  const beforeLate = JSON.stringify(F.stateRead());
  const late = F.continue({ d: { Rows: [] }, transport: { contract, trace: [{ requestId: 'background-request' }] } });
  check(so, 'response đến muộn của lượt nền đã dừng bị loại STALE_RESPONSE, không cấp request và không đổi state',
    [late.ok, late.code, late.request, JSON.stringify(F.stateRead()) === beforeLate],
    [false, 'STALE_RESPONSE', null, true]);

  const running = (phase) => { F.statePatch({ runId: 'status-run', phase }); return F.statusView().running; };
  check(so, 'statusView().running lấy từ danh sách pha ở State.js, có waiting_session và không có awaiting_approval/paused',
    ['waiting_session', 'checking_session', 'push', 'awaiting_approval', 'paused', 'idle'].map(running),
    [true, true, true, false, false, false]);
  F.statePatch({ runId: 'manual-run', origin: 'manual', process: '', phase: 'pull_customer' });
  const stopManual = F.runStopCommand('background');
  check(so, 'lệnh dừng nền gặp lượt tay thì không đóng gì',
    [stopManual.code, F.stateRead().runId],
    ['SYNC_BACKGROUND_IDLE', 'manual-run']);
}

module.exports = { chay };
