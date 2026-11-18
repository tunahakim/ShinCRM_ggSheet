/**
 * Kiểm người điều phối lần hỏi GAS của Extension (`heartbeatRun`) theo từng nhánh của bảng quyết: công tắc tắt, máy không được giao, chỉ kiểm, lượt đang sống, lượt bỏ dở quá hạn, phiên chưa gắn, không có gì đến hạn, mở tiến trình đến hạn; cùng kho máy chạy nền (tự nhận thay máy im, thông báo) và sổ tiến trình khi lượt nền đóng.
 * Mọi lần hỏi đi qua cửa lệnh `controlDispatch('heartbeat', …, 'relay')` như Extension gọi thật.
 */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');
const { datCongTac, datNen, datPhan, datLichNen, vaSoNen } = require('../../lib/fbm/cai-dat-thu');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { datState } = require('../../lib/fbm/dat-state');

/** Bảng loại thông báo thật, để thông báo đồng bộ phát ra chắc chắn dùng loại đã khai. */
function loaiThongBao() {
  const hop = taoHopCat({});
  napServer(hop, 'server/data/NoticeTopics.js');
  return hop.NOTICE_TOPICS;
}

const MAY_A = 'may-A', MAY_B = 'may-B';
const LICH = { direction: 'write', heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false, minutes: 480 }, detail: { enabled: false, minutes: 30, customersPerRun: 30 } };

/** Hộp GAS đã gắn tài khoản FBM, lịch nền chỉ còn Giữ phiên đến hạn, máy A được giao chạy nền (trừ khi `giao: false`). */
function hopNen(options) {
  const opt = options || {}, logs = [], notices = [];
  const flow = workflowGas({ logEvent: (event) => logs.push(event), LOG_WARN: 'warn', noticeRaise: (notice) => { notices.push(notice); return true; } });
  const hop = flow.hop, F = hop.FbmSync;
  F.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  datLichNen(hop, LICH);
  vaSoNen(F, { customerFull: { doneAt: Date.now() }, heartbeat: { doneAt: 1 } });
  if (opt.giao !== false) { F.backgroundMachineWrite(F.machineAssigned(MAY_A, 'Máy A', Date.now())); }
  const hoi = (machineId, trigger, extra) => F.controlDispatch('heartbeat', Object.assign({ trigger: trigger || 'alarm', machineId }, extra || {}), 'relay');
  return { flow, hop, F, logs, notices, hoi };
}

const maCua = (logs, action) => logs.filter((line) => line.action === action);

function chay(so) {
  section('FBM sync - lần hỏi GAS của Extension (bảng quyết nhịp nền)');
  {
    const { hop, F, hoi } = hopNen();
    datCongTac(hop, false);
    const off = hoi(MAY_A);
    datCongTac(hop, true); datNen(hop, false);
    const bgOff = hoi(MAY_A);
    check(so, 'công tắc tổng tắt hoặc đồng bộ nền tắt: không mở lượt, tắt chuông kèm mã, kể cả máy được giao',
      [off.code, off.request, off.poll, bgOff.code, bgOff.request, bgOff.poll, F.stateRead().runId || ''],
      ['MASTER_OFF', null, { stop: true, code: 'MASTER_OFF' }, 'BACKGROUND_OFF', null, { stop: true, code: 'BACKGROUND_OFF' }, '']);
  }
  {
    const { F, logs, hoi } = hopNen();
    const la = hoi(MAY_B), refused = maCua(logs, 'background_machine_refused');
    check(so, 'máy lạ hỏi khi máy khác được giao: không mở lượt, tắt chuông tới lần mở trình duyệt kế, ghi Log lý do, không đổi kho máy',
      [la.code, la.request, la.poll.stop, F.stateRead().runId || '', refused.length, refused[0] && refused[0].detail.reason, F.backgroundMachineRead().machineId],
      ['MACHINE_NOT_ASSIGNED', null, true, '', 1, 'other_assigned', MAY_A]);
  }
  {
    const { F, logs, hoi } = hopNen({ giao: false });
    const none = hoi(MAY_A), view = F.statusView().backgroundMachine;
    check(so, 'chưa giao máy nào: máy hỏi bị từ chối none_assigned, tắt chuông; màn trạng thái báo đồng bộ nền bật mà chưa máy nào chạy',
      [none.code, none.poll.stop, maCua(logs, 'background_machine_refused')[0].detail.reason, view.assigned, view.notice && view.notice.code],
      ['MACHINE_NOT_ASSIGNED', true, 'none_assigned', false, 'MACHINE_NOT_ASSIGNED']);
  }
  {
    const { hop, F, hoi } = hopNen();
    const config = hoi(MAY_A, 'config'), runNow = hoi(MAY_A, 'run_now'), install = hoi(MAY_A, 'install');
    datPhan(hop, 'extension', { runOnStartup: false });
    const startupOff = hoi(MAY_A, 'startup');
    let unknown = '';
    try { hoi(MAY_A, 'bat-ky'); } catch (err) { unknown = err.code; }
    check(so, 'lý do hỏi chỉ kiểm (lưu cài đặt, đánh thức sau khi mở lượt tay, vừa cài, mở trình duyệt khi tắt "Hỏi GAS khi mở trình duyệt"): không mở việc nền, giữ chuông; lý do lạ ném ASK_TRIGGER_UNKNOWN',
      [config.code, runNow.code, install.code, startupOff.code, startupOff.request, startupOff.poll.minutes > 0, F.stateRead().runId || '', unknown],
      ['ASK_CHECK_ONLY', 'ASK_CHECK_ONLY', 'ASK_CHECK_ONLY', 'ASK_CHECK_ONLY', null, true, '', 'ASK_TRIGGER_UNKNOWN']);
    check(so, 'lần hỏi của máy được giao ghi lần hỏi cuối vào kho máy', F.backgroundMachineRead().lastAskAt > 0, true);
  }
  {
    const { F, hoi } = hopNen();
    const first = hoi(MAY_A), opened = F.stateRead();
    const busy = hoi(MAY_A);
    check(so, 'Giữ phiên đến hạn: mở một lượt nền (process heartbeat, scan keepalive), request đầu là bước kiểm phiên; lần hỏi kế khi request còn hạn trả SYNC_BUSY, không mở lượt thứ hai, giữ chuông',
      [first.request && first.request.meta.kind, opened.origin, opened.process, opened.scan, opened.pollAt > 0, first.poll.minutes > 0, busy.code, busy.request, F.stateRead().runId === opened.runId, busy.poll.minutes > 0],
      ['session_probe', 'background', 'heartbeat', 'keepalive', true, true, 'SYNC_BUSY', null, true, true]);
  }
  {
    const { F, logs, hoi } = hopNen();
    hoi(MAY_A);
    const opened = F.stateRead();
    datState(F, { deadlineAt: Date.now() - 60000 });
    const trail = { stage: 'fbm_tab_replied', at: Date.now() - 120000, requestId: opened.activeRequestId };
    const after = hoi(MAY_A, 'alarm', { trail }), closed = F.stateRead();
    const findings = F.requestWatchTake(), unanswered = findings.find((line) => line.action === 'request_unanswered');
    const stale = maCua(logs, 'stale_run'), retry = maCua(logs, 'schedule_retry_later');
    check(so, 'lượt nền quá hạn không còn request chờ: đóng SYNC_ABANDONED_RUN, Log request không được trả lời mang hộp đen Extension, dòng stale_run không lặp hộp đen',
      [closed.runId === opened.runId, closed.phase, closed.lastFailureCode, !!unanswered && unanswered.detail.extensionTrail.stage, !!unanswered && /Hộp đen Extension/.test(unanswered.reason), stale.length, stale[0] && /Hộp đen/.test(stale[0].reason)],
      [true, 'error', 'SYNC_ABANDONED_RUN', 'fbm_tab_replied', true, 1, false]);
    check(so, 'lượt nền bỏ dở là một lần lỗi của tiến trình: runClose ghi lần lỗi vào sổ, Log hẹn thử lại, không chạy lại ngay trong lần hỏi này',
      [F.processBookRead().heartbeat.failures, retry.length, retry[0] && retry[0].detail.kind, after.code, after.request],
      [1, 1, 'heartbeat', 'NO_PROCESS_DUE', null]);
  }
  {
    const { F, logs, hoi } = hopNen();
    hoi(MAY_A);
    datState(F, { phase: 'push', cursor: { kind: 'push_wait' }, deadlineAt: Date.now() - 60000 });
    hoi(MAY_A);
    check(so, 'lượt nền mất response lúc chờ ghi FBM: đóng SYNC_STALE_WRITE, không tự ghi lại',
      [F.stateRead().lastFailureCode, maCua(logs, 'stale_run')[0].detail.code],
      ['SYNC_STALE_WRITE', 'SYNC_STALE_WRITE']);
  }
  {
    const { F, hoi } = hopNen();
    F.identityPreflight = () => ({ blocking: true, status: { status: 'UNBOUND' }, message: 'Chưa gắn tài khoản FBM.' });
    const unbound = hoi(MAY_A);
    check(so, 'chưa gắn tài khoản FBM: không mở lượt nền, giữ chuông, báo FBM_IDENTITY_UNBOUND',
      [unbound.code, unbound.request, unbound.poll.minutes > 0, F.stateRead().runId || ''],
      ['FBM_IDENTITY_UNBOUND', null, true, '']);
  }
  {
    const { flow, F, hoi } = hopNen();
    vaSoNen(F, { heartbeat: { doneAt: Date.now() } });
    const idle = hoi(MAY_A);
    check(so, 'không có tiến trình đến hạn: NO_PROCESS_DUE, giữ chuông, không mở lượt',
      [idle.code, idle.request, idle.poll.minutes > 0, F.stateRead().runId || ''],
      ['NO_PROCESS_DUE', null, true, '']);
  }

  // Máy A được giao nhưng im quá ngưỡng (giờ giao lùi quá số phút im tính theo nhịp hỏi); `tuNhan` là công tắc tự nhận; mật khẩu đã lưu với khóa `cred-1`.
  const hopMayIm = (tuNhan) => {
    const dung = hopNen(), F = dung.F, silent = F.machineSilentMinutes(dung.hop.settingsValues(F.SETTING_SECTIONS.extension));
    F.backgroundMachineWrite(F.machineAssigned(MAY_A, 'Máy A', Date.now() - (silent + 60) * 60000));
    datPhan(dung.hop, 'background', { machineAutoTakeover: tuNhan });
    F.credentialRead = () => ({ configured: true, credentialRef: 'cred-1', ciphertext: null, public: {} });
    return dung;
  };
  {
    const { F, logs, notices, hoi } = hopMayIm(true);
    const taken = hoi(MAY_B, 'alarm', { keyRefs: ['fbmCredentialVault:khac', 'cred-1'] }), machine = F.backgroundMachineRead(), view = F.statusView().backgroundMachine;
    const log = maCua(logs, 'background_machine_takeover'), topics = loaiThongBao();
    check(so, 'tự nhận bật, máy được giao im quá ngưỡng, máy hỏi có khóa giải mã mật khẩu đã lưu: máy hỏi thành máy nền, Log BACKGROUND_MACHINE_TAKEOVER, thông báo chung loại bấm ✕ mới hết nói nhận thay máy nào (không hẹn giờ trong khối máy nền), chạy tiếp việc đến hạn',
      [machine.machineId, log.length, log[0] && log[0].detail.code, notices.map((n) => n.topic), /Máy A/.test(notices[0] && notices[0].title), topics.fbm_machine_takeover && topics.fbm_machine_takeover.clear, view.notice, taken.request && taken.request.meta.kind],
      [MAY_B, 1, 'BACKGROUND_MACHINE_TAKEOVER', ['fbm_machine_takeover'], true, 'dismiss', null, 'session_probe']);
  }
  {
    const { F, logs, hoi } = hopMayIm(false);
    const refused = hoi(MAY_B, 'alarm', { keyRefs: ['cred-1'] }), view = F.statusView().backgroundMachine;
    check(so, 'tự nhận tắt, máy được giao im: máy hỏi không nhận việc, chỉ có thông báo máy nền im trên màn trạng thái',
      [refused.code, F.backgroundMachineRead().machineId, maCua(logs, 'background_machine_takeover').length, view.silent, view.notice && view.notice.code],
      ['MACHINE_NOT_ASSIGNED', MAY_A, 0, true, 'MACHINE_SILENT']);
  }
  {
    const { F, logs, hoi } = hopMayIm(true);
    const noKey = hoi(MAY_B, 'alarm', { keyRefs: ['cred-khac'] });
    F.credentialRead = () => ({ configured: false, credentialRef: '', ciphertext: null, public: {} });
    const noSaved = hoi(MAY_B, 'alarm', { keyRefs: [] });
    check(so, 'tự nhận bật nhưng máy hỏi không có khóa giải mã mật khẩu đã lưu (hoặc chưa lưu mật khẩu): không tự nhận, Log lý do no_key',
      [noKey.code, noSaved.code, F.backgroundMachineRead().machineId, maCua(logs, 'background_machine_refused').map((line) => line.detail.reason)],
      ['MACHINE_NOT_ASSIGNED', 'MACHINE_NOT_ASSIGNED', MAY_A, ['no_key', 'no_key']]);
  }
  {
    const { F, hoi } = hopNen();
    F.controlDispatch('start', { kind: 'identity_probe', machineId: MAY_B });
    const pickup = hoi(MAY_B, 'run_now');
    check(so, 'máy không phải máy nền nhưng có lượt tay chờ nó nhận: nhận được lượt và giữ chuông',
      [pickup.request && pickup.request.meta.kind, pickup.poll.minutes > 0, !!pickup.poll.stop],
      ['identity_user_grid', true, false]);
  }
  // Lượt nền đang chạy (ô lượt dựng tay) đóng qua đúng cổng đóng lượt: `runClose` ghi kết quả tiến trình vào sổ ngay lúc đóng, lần hỏi sau không ghi lại.
  const moNen = (F, runId, process) => datState(F, { runId, origin: 'background', process, phase: 'pull_customer', entity: 'customer', cursor: { kind: 'customer_grid' }, activeRequestId: '', deadlineAt: 0 });
  {
    const { F, logs, hoi } = hopNen();
    moNen(F, 'run-nen-1', 'customerFull');
    F.stateWrite(F.runFail(F.stateRead(), 'HTTP_500', 'FBM trả HTTP 500.'));
    const retry = maCua(logs, 'schedule_retry_later');
    check(so, 'lượt nền đóng lỗi: runClose ghi lần lỗi vào sổ của đúng tiến trình, Log hẹn thử lại kèm mã lỗi; ô lượt giữ tên tiến trình cho đuôi chuỗi',
      [F.processBookRead().customerFull.failures, retry.length, retry[0] && /HTTP_500/.test(retry[0].reason), F.stateRead().process], [1, 1, true, 'customerFull']);
    hoi(MAY_A, 'config');
    hoi(MAY_A, 'config');
    check(so, 'các lần hỏi sau không ghi lại lần lỗi đã ghi',
      [F.processBookRead().customerFull.failures, maCua(logs, 'schedule_retry_later').length],
      [1, 1]);
  }
  {
    const { F, hoi } = hopNen();
    const before = Date.now();
    moNen(F, 'run-nen-2', 'heartbeat');
    F.stateWrite(F.runClose(F.stateRead(), 'done', { message: 'Giữ phiên FBM OK.' }));
    const done = hoi(MAY_A);
    check(so, 'lượt Giữ phiên đóng xong: sổ ghi lần xong, Giữ phiên chưa đến hạn lại nên lần hỏi không mở lượt mới',
      [F.processBookRead().heartbeat.doneAt >= before, done.code], [true, 'NO_PROCESS_DUE']);
  }
  {
    const { F, logs, hoi } = hopNen();
    moNen(F, 'run-nen-3', 'customerFull');
    const truoc = F.processBookRead().customerFull.doneAt;
    F.stateWrite(F.runClose(F.stateRead(), 'paused', { message: 'Đã dừng.' }));
    check(so, 'người dùng dừng lượt nền (tạm dừng không mã lỗi): không tính là lỗi, không dời mốc chạy xong, không hẹn thử lại',
      [F.processBookRead().customerFull.failures, F.processBookRead().customerFull.doneAt === truoc, maCua(logs, 'schedule_retry_later').length],
      [0, true, 0]);
  }
}

module.exports = { chay };
