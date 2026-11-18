/**
 * Lần hỏi của máy nền chọn tiến trình đến hạn, không mở lượt thứ hai khi lượt cũ còn chờ, và Giữ phiên chọn đường keepalive (đẩy hoặc đếm) ở đúng một chỗ quyết cho cả hai đường cấp.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas, trongLat } = require('../../lib/fbm/hop-dong-bo');
const { datPhan, datLichNen, docLichNen, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { datState } = require('../../lib/fbm/dat-state');

async function chay(so) {
  section('FBM sync — lượt nền theo lịch và Giữ phiên có đẩy');
  const scheduleFlow = workflowGas();
  const SH = scheduleFlow.hop, NEN = SH.FbmSync.SETTING_SECTIONS.background;
  // Lịch nền Hai chiều, Extension hỏi 15 phút và không chạy khi mở trình duyệt; chu kỳ từng tiến trình được ca đặt lại trước khi đo.
  datPhan(SH, 'extension', { pollMinutes: 15, runOnStartup: false });
  datLichNen(SH, { enabled: true, direction: 'write', heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 480 }, activityFull: { enabled: false, minutes: 1440 }, detail: { enabled: true, minutes: 60, customersPerRun: 300 } });
  scheduleFlow.hop.FbmSync.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  const now = Date.now();
  vaSoNen(scheduleFlow.hop.FbmSync, { detail: { doneAt: now }, customerFull: { doneAt: 1 }, activityFull: { doneAt: 1 }, heartbeat: { doneAt: 1 } });
  // Máy A là máy được giao chạy nền; mọi lần hỏi dưới đây là lần hỏi của Extension máy đó.
  const SFB = scheduleFlow.hop.FbmSync, hoiNen = (F, trigger) => F.heartbeatRun({ trigger: trigger || 'alarm', machineId: 'may-A' });
  SFB.backgroundMachineWrite(SFB.machineAssigned('may-A', 'Máy A', now));
  check(so, 'Lịch nền ưu tiên Quét nhanh khi nhiều tiến trình cùng đến hạn',
    SFB.processDue(now, docLichNen(SH), SFB.processBookRead(), 0)[0],
    'customerFull');
  const pickedCustomer = hoiNen(SFB), pickedRun = SFB.stateRead();
  check(so, 'Lần hỏi của máy nền mở lượt nền của tiến trình đến hạn đầu tiên, ô lượt mang tên tiến trình',
    [pickedCustomer.ok, !!pickedCustomer.request, pickedRun.origin, pickedRun.process, pickedRun.pollAt > 0],
    [true, true, 'background', 'customerFull', true]);
  const busyAsk = hoiNen(SFB);
  check(so, 'Lần hỏi khi lượt nền còn request chờ trong hạn không mở lượt thứ hai, vẫn giữ chuông',
    [busyAsk.code, busyAsk.request, SFB.stateRead().runId === pickedRun.runId, !!(busyAsk.poll && busyAsk.poll.minutes)],
    ['SYNC_BUSY', null, true, true]);
  datState(scheduleFlow.hop.FbmSync, { runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, process: '' });
  vaSoNen(scheduleFlow.hop.FbmSync, { customerFull: { doneAt: now }, activityFull: { doneAt: now }, heartbeat: { doneAt: now } });
  const noDue = hoiNen(SFB);
  check(so, 'Không có tiến trình đến hạn thì không mở lượt, vẫn giữ chuông',
    [noDue.ok, noDue.code, noDue.request, !!(noDue.poll && noDue.poll.minutes)],
    [true, 'NO_PROCESS_DUE', null, true]);
  datLichNen(SH, { heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: true, minutes: 30 } });
  vaSoNen(scheduleFlow.hop.FbmSync, { customerFull: { doneAt: now }, activityFull: { doneAt: now }, heartbeat: { doneAt: 1 } });
  check(so, 'Lịch nền chỉ chọn Giữ phiên khi không có tiến trình dữ liệu đến hạn',
    SFB.processDue(now, docLichNen(SH), SFB.processBookRead(), 0),
    ['heartbeat']);
  check(so, 'cau hinh scheduler tu choi chu ky ngoai gioi han',
    [SH.settingsSave({ fbm_extension: { pollMinutes: 0 } }).ok, SH.settingsSave({ [NEN]: { customerFullMinutes: 10081 } }).problems[0].field],
    [false, 'customerFullMinutes']);
  datPhan(SH, 'extension', { pollMinutes: 15, runOnStartup: false });
  const startupOff = hoiNen(SFB, 'startup');
  datPhan(SH, 'extension', { pollMinutes: 15, runOnStartup: true });
  datLichNen(SH, { heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: true, minutes: 30 } });
  const startup = hoiNen(SFB, 'startup');
  check(so, 'Mở trình duyệt: tắt "Hỏi GAS khi mở trình duyệt" thì chỉ kiểm máy; bật thì chạy một lượt Giữ phiên, request đầu là bước kiểm phiên, chuông theo nhịp 15 phút',
    [startupOff.code, startupOff.request, startup.ok, startup.request && startup.request.meta.kind, SFB.stateRead().scan, SFB.stateRead().process, startup.poll.minutes],
    ['ASK_CHECK_ONLY', null, true, 'session_probe', 'keepalive', 'heartbeat', 15]);
  // Giữ phiên có đẩy (C2): một chỗ quyết cho hai đường cấp; cổng mở thì mở lượt Chỉ đẩy nền `keepalive`, đếm và Quét nhanh bù theo chiều lịch nền.
  const keepaliveFlow = (direction, options) => {
    const opt = options || {}, flow = workflowGas({ extraFiles: ['fbm_sync/diagnostic/Trace.js'] }), F = flow.hop.FbmSync, traces = [];
    F.scheduleTrace = (action) => traces.push(action);
    F.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
    datLichNen(flow.hop, { direction, heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false, minutes: 480 }, detail: { enabled: false, minutes: 30, customersPerRun: 30 } });
    vaSoNen(F, { customerFull: { doneAt: now }, heartbeat: { doneAt: 1 } });
    if (opt.cleanMark) { F.pushGateWrite({ status: 'clean', mark: F.pushGateMark(), at: now }); }
    F.backgroundMachineWrite(F.machineAssigned('may-A', 'Máy A', now));
    const result = opt.viaChain ? F.runSlice(() => F.backgroundNext({ now, pollAt: now, book: F.processBookRead() })) : F.heartbeatRun({ trigger: 'alarm', machineId: 'may-A' });
    return { flow, F, traces, result, state: F.stateRead() };
  };
  {
    const two = keepaliveFlow('write'), view = two.F.statusView();
    check(so, 'C2: Giữ phiên Hai chiều chưa có dấu lần đẩy sạch: mở lượt Chỉ đẩy nền keepalive (request đầu là kiểm phiên), mang cổng đã quyết, đánh dấu đếm cuối lượt theo chiều Hai chiều; màn trạng thái hiện chiều lịch nền và nhãn Giữ phiên',
      [two.result.ok, two.result.request && two.result.request.meta.kind, two.state.origin, two.state.mode, two.state.scan, two.state.scheduleMode, two.state.pushGate, two.state.metadata.countTail, two.state.process, view.direction, view.scanLabel],
      [true, 'session_probe', 'background', 'push', 'keepalive', 'write', { open: true, reason: 'no_gate' }, { pending: true, mode: 'write' }, 'heartbeat', 'Hai chiều', 'Giữ phiên FBM (chỉ đẩy bản ghi vừa sửa)']);
    const viaChain = keepaliveFlow('write', { viaChain: true });
    check(so, 'C2: đường đuôi chuỗi (tiến trình kế trong cùng lần hỏi) và đường hỏi nền đi qua cùng một chỗ quyết, ra cùng lượt keepalive',
      [viaChain.state.scan, viaChain.state.mode, viaChain.result.request && viaChain.result.request.meta.kind],
      ['keepalive', 'push', two.result.request && two.result.request.meta.kind]);
    const recountModes = [];
    two.F.recountStart = (mode, origin) => { recountModes.push([mode, origin]); return { ok: true, request: null }; };
    const counted = two.F.stateRead(); counted.metadata.countTail = { pending: false, mode: 'write', message: 'Đồng bộ hoàn tất; không có bản ghi nào được đẩy.' }; counted.phase = 'pull_customer'; counted.cursor = { kind: 'customer_count' }; two.F.stateWrite(counted);
    trongLat(two.F, () => two.F.stageRun(two.F.CURSOR_TABLE.customer_count, two.F.stateRead(), JSON.stringify({ d: { TotalRowCount: 999 } })));
    check(so, 'C2: số khách lệch sau lượt Giữ phiên có đẩy thì Quét nhanh bù chạy theo chiều lịch nền (Hai chiều), không theo mode push của lượt',
      recountModes,
      [['write', 'background']]);
  }
  {
    const pushOnly = keepaliveFlow('push');
    check(so, 'C2: Giữ phiên Chỉ đẩy cổng mở thì mở lượt keepalive nhưng không đếm cuối lượt (chiều không ghi Sheet); màn trạng thái hiện ShinCRM → FBM',
      [pushOnly.state.scan, pushOnly.state.mode, pushOnly.state.scheduleMode, !!(pushOnly.state.metadata && pushOnly.state.metadata.countTail), pushOnly.F.statusView().direction], ['keepalive', 'push', 'push', false, 'ShinCRM → FBM']);
  }
  {
    const closed = keepaliveFlow('write', { cleanMark: true });
    const read = keepaliveFlow('read');
    check(so, 'C2: cổng đóng (dấu khớp) thì Giữ phiên mở đường đếm như cũ (phiên chưa xác minh nên request đầu là probe) và ghi vết cổng đóng; chiều Lấy không đọc cổng, cũng đi đường đếm',
      [closed.result.request && closed.result.request.meta.kind, closed.state.process, closed.state.mode, closed.state.cursor.kind, closed.state.scan, closed.traces.filter((a) => a === 'push_gate_closed').length,
        read.result.request && read.result.request.meta.kind, read.state.process, read.state.scan, read.traces.filter((a) => a === 'push_gate_closed').length],
      ['session_probe', 'heartbeat', 'write', 'session', 'keepalive', 1, 'session_probe', 'heartbeat', 'keepalive', 0]);
  }
}

module.exports = { chay };
