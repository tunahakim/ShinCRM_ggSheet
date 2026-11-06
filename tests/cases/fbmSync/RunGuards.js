/**
 * Kiểm các rào của ô lượt dùng chung cho mọi lượt (nền hay tay): câu hộp đen Extension trong Log, nhãn lượt trong Log theo tiến trình nền, lát bỏ lượt mở mà không còn request (RUN_LEFT_OPEN), dừng lượt nền và response đến muộn sau khi dừng, danh sách pha "đang chạy" của màn trạng thái.
 */
const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { taoHopCat } = require('../../lib/load-gas');
const { liet } = require('../../lib/quet/liet-tep');
const { duLieuServer, napTheoSidebar } = require('../../lib/sidebar/nap-sidebar');

/**
 * Tên lượt và tiến trình nền chỉ khai ở GAS; Sidebar nhận qua dữ liệu chèn lúc dựng khung. Kiểm ba đường lệch: dữ liệu chèn khác bảng GAS, schema menu Mức quét để lọt gói thiếu lời giải thích, và tệp client gõ tay lại mã hay tên.
 */
function kiemTenSidebar(so, F) {
  const data = duLieuServer().fbm_sync;
  const packs = Object.keys(F.RUN_PLANS).filter((key) => key.indexOf('sync:full:') === 0).map((key) => ({ value: key.slice('sync:full:'.length), label: F.RUN_PLANS[key].label }));
  check(so, 'Dữ liệu chèn vào Sidebar (chạy sidebarServerData thật) trùng bảng GAS: mức quét và tên theo RUN_PLANS, gói mặc định, tiến trình nền theo SCHEDULE_KINDS và scheduleLabel', [data.packs, data.packDefault, data.processes],
    [packs, F.SCAN_PACK_DEFAULT, F.SCHEDULE_KINDS.map((key) => ({ key, label: F.scheduleLabel(key) }))]);
  // Hộp đã có dữ liệu GAS thì khung nạp không chèn đè, nên thử được danh sách gói khác bảng thật.
  const napRun = (goi) => { try { return napTheoSidebar(['client/schema/sync/screens/run.html'], taoHopCat({ SIDEBAR_SERVER_DATA: { fbm_sync: { packs: goi, packDefault: 'quick', processes: [] } } })).FBM_SYNC_RUN_SCHEMA.pack.options.map((o) => o.label); } catch (e) { return 'ném: ' + e.message; } };
  check(so, 'Menu Mức quét lấy tên từ GAS; GAS thêm gói mà schema chưa có lời giải thích, hoặc bỏ gói mà lời giải thích còn, thì ném lúc nạp', [
    napRun(data.packs), napRun(data.packs.concat([{ value: 'moi', label: 'Gói mới' }])), napRun(data.packs.slice(0, 2))
  ], [data.packs.map((p) => p.label), 'ném: Mức quét "moi" chưa có lời giải thích trong schema màn Chạy đồng bộ.', 'ném: Lời giải thích cho mức quét "all" không còn trong GAS.']);
  // Văn giải thích có thể nhắc tên lượt ("Như Quét nhanh, ..."); chỉ cấm chuỗi đứng riêng làm nhãn và mã tiến trình làm khóa. Phạm vi là tên Sidebar hiện như tên lượt: mức quét và tiến trình nền.
  const ten = data.packs.map((p) => p.label).concat(data.processes.map((p) => p.label));
  const viPham = [];
  liet('client', '.html').forEach((tep) => fs.readFileSync(path.join(__dirname, '..', '..', '..', '1_ShinCRM_GAS', tep), 'utf8').split(/\r?\n/).forEach((dong, i) => {
    if (dong.indexOf('detailCustomersPerRun') >= 0) { return; }
    const lo = ten.filter((t) => dong.indexOf("'" + t + "'") >= 0).concat(F.SCHEDULE_KINDS.filter((k) => dong.indexOf("'" + k + "'") >= 0 || new RegExp('\\b' + k + '(Enabled|Minutes)\\b').test(dong)));
    if (lo.length) { viPham.push(tep + ':' + (i + 1) + ' ' + lo.join(', ')); }
  }));
  check(so, 'Không tệp client nào gõ tay tên lượt làm nhãn hay mã tiến trình nền (trừ dòng số khách mỗi lượt Vòng xoay, khóa riêng của tiến trình detail)', viPham, []);
}

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
  check(so, 'Lượt tay ghi đúng mức quét đã chọn (trước đây mọi lượt quét tay đều ghi Quét nhanh); lượt nền Quét nhanh không nêu gói vẫn là Quét nhanh; lượt nền Lấy toàn bộ giao dịch không lặp tên',
    [nhan({ origin: 'manual', scan: 'full', scanPack: 'quick' }), nhan({ origin: 'manual', scan: 'full', scanPack: 'deep' }), nhan({ origin: 'manual', scan: 'full', scanPack: 'all' }), nhan({ origin: 'background', process: 'customerFull', scan: 'full' }), nhan({ origin: 'background', process: 'activityFull', scan: 'activity_bulk' }), nhan({ origin: 'manual', scan: 'identity_check' })],
    ['Tay · Quét nhanh', 'Tay · Quét kỹ', 'Tay · Quét toàn bộ', 'Nền · Quét nhanh', 'Nền · Lấy toàn bộ giao dịch', 'Tay · Kiểm tra liên kết']);
  // Gặp khi nghiệm thu B8: lượt Quét kỹ bấm tay ghi "Tay · Quét nhanh" vì gói quét được gán sau khi nhãn đã chốt.
  F.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  F.start({ mode: 'read', origin: 'manual', manual: true, scan: 'full', pack: 'deep' });
  check(so, 'Mở lượt tay Quét kỹ qua lệnh start: gói quét vào ô lượt cùng lúc mở lượt nên nhãn chốt là "Tay · Quét kỹ"', [F.stateRead().scanPack, F.stateRead().runLabel], ['deep', 'Tay · Quét kỹ']);
  check(so, 'Mọi dòng RUN_PLANS có tên; tên tiến trình nền lấy từ bảng dãy chặng', [
    Object.keys(F.RUN_PLANS).filter((key) => !F.RUN_PLANS[key].label), F.SCHEDULE_LABELS, ['heartbeat', 'customerFull', 'activityFull', 'detail'].map(F.scheduleLabel)
  ], [[], undefined, ['Giữ phiên FBM', 'Quét nhanh', 'Lấy toàn bộ giao dịch', 'Vòng xoay giao dịch']]);
  kiemTenSidebar(so, F);
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
