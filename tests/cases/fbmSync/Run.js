/** Kiểm `fbm_sync/state/Run.js`: lệnh Dừng ghi cờ không cần khóa điều phối, lát đang giữ khóa thấy cờ trước khi phát request kế, lệnh mở lượt và lát kế áp cờ còn chờ; mọi đường đóng lượt đi qua `runClose`. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

function loi(fn) {
  try { fn(); return null; } catch (error) { return String(error && error.code || ''); }
}

/** Hộp có khóa script giả bật/tắt được và Log gom theo thứ tự; lượt tay đọc đã mở sẵn (request đầu đang bay). */
function hopCoLuot(origin) {
  const khoa = { ban: false, tryLock() { return !this.ban; }, releaseLock() {} };
  const logs = [];
  const { hop, documentProperties } = workflowGas({ LockService: { getScriptLock: () => khoa }, logEvent: (line) => logs.push(line), LOG_WARN: 'warn' });
  const F = hop.FbmSync;
  F.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  F.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const started = F.start({ mode: 'read', origin: origin || 'manual', manual: origin !== 'background' });
  return { hop, F, khoa, logs, data: documentProperties.data, started };
}

async function chay(so) {
  section('FBM sync — Run.js: đóng lượt và lệnh Dừng không chờ khóa');

  // Khóa đang bị lát khác giữ: Dừng vẫn ghi cờ ngay, không đợi, không chạm state.
  const ban = hopCoLuot();
  const runId = ban.F.stateRead().runId, truocState = ban.data.FBM_SYNC_STATE_V1;
  ban.khoa.ban = true;
  const pending = ban.F.controlDispatch('cancel', {});
  const co = JSON.parse(ban.data.FBM_SYNC_STOP_V1 || '{}');
  check(so, 'khóa bận: Dừng trả SYNC_STOP_PENDING ngay, cờ dừng mang mã lượt đã nằm trong kho thật, state chưa bị đổi', [
    pending.ok, pending.code, co.runId === runId, co.verdict, ban.data.FBM_SYNC_STATE_V1 === truocState, ban.F.statusView().running
  ], [true, 'SYNC_STOP_PENDING', true, 'cancelled', true, true]);

  // Lát kế lấy được khóa: áp cờ trước khi làm gì, không chạy phần việc, không phát request.
  ban.khoa.ban = false;
  let daChay = false;
  const truocLog = ban.logs.length;
  const lat = ban.F.withOrchestrationLock(() => ban.F.runSlice(() => { daChay = true; return { ok: true, request: { id: 'khong-duoc-phat' } }; }));
  const sau = ban.F.stateRead();
  check(so, 'lát kế áp cờ dừng còn chờ: không chạy phần việc, không trả request, lượt tạm dừng và giữ runId, Log đóng bước ghi "Tạm dừng" của đúng lượt', [
    daChay, lat.code, lat.request, sau.phase, sau.runId === runId, sau.activeRequestId,
    ban.logs.slice(truocLog).filter((line) => /_finished$/.test(line.action)).every((line) => line.cycleId === runId && line.outcome === 'warn'),
    ban.logs.slice(truocLog).some((line) => line.action === 'sync_session_finished')
  ], [false, 'SYNC_STOPPED', null, 'paused', true, '', true, true]);
  check(so, 'cờ của lượt đã đóng không chặn lượt mới: lượt sau vẫn phát request đầu', (() => { const lai = ban.F.start({ mode: 'read', origin: 'manual', manual: true }); return [!!lai.request, ban.F.statusView().running]; })(), [true, true]);

  // Lệnh Dừng ghi cờ giữa lúc lát đang chạy (bản chụp trong khóa không thấy): lát vẫn thấy trước khi phát request.
  const giua = hopCoLuot();
  const runGiua = giua.F.stateRead().runId;
  const latGiua = giua.F.withOrchestrationLock(() => giua.F.runSlice(() => {
    // Như một lần thực thi khác ghi thẳng kho thật trong lúc lát này giữ khóa.
    giua.data.FBM_SYNC_STOP_V1 = JSON.stringify({ runId: runGiua, verdict: 'cancelled', at: Date.now() });
    return { ok: true, request: { id: 'request-ke' } };
  }));
  check(so, 'Dừng ghi cờ giữa lát: request vừa dựng không được phát, lượt đóng trong cùng lát', [latGiua.code, latGiua.request, giua.F.stateRead().phase, giua.F.stateRead().activeRequestId], ['SYNC_STOPPED', null, 'paused', '']);

  // Dừng nền khi khóa bận, rồi người dùng mở lượt tay: dòng đóng của lượt nền (nhãn Nền, lý do dừng) có trước lượt tay mở.
  const nen = hopCoLuot('background');
  const runNen = nen.F.stateRead().runId;
  nen.khoa.ban = true;
  const dungNen = nen.F.controlDispatch('stop_background', {});
  nen.khoa.ban = false;
  const truocTay = nen.logs.length;
  const tay = nen.F.controlDispatch('start', { kind: 'sync', mode: 'read', machineId: 'may-A' });
  const dongNen = nen.logs.slice(truocTay).filter((line) => line.action === 'sync_session_finished')[0] || {};
  check(so, 'dừng nền khi khóa bận rồi chạy tay: lượt nền đóng trước với lý do dừng nền, lượt tay qua lệnh start của Sidebar mở sau và đang chạy', [
    dungNen.code, dongNen.cycleId === runNen, dongNen.outcome, /dừng lượt nền/.test(String(dongNen.reason || '')), tay.runId === nen.F.stateRead().runId && tay.runId !== runNen, nen.F.statusView().running, nen.F.stateRead().origin
  ], ['SYNC_STOP_PENDING', true, 'warn', true, true, true, 'manual']);

  // Cờ hỏng không được coi là "không có cờ": lát ném và lượt sang lỗi.
  const hong = hopCoLuot();
  hong.data.FBM_SYNC_STOP_V1 = '{"runId":';
  check(so, 'cờ dừng hỏng thì lát ném DOCUMENT_PROPERTY_CORRUPT và lượt sang lỗi, không chạy tiếp như chưa bấm Dừng', [
    loi(() => hong.F.withOrchestrationLock(() => hong.F.runSlice(() => ({ ok: true, request: { id: 'x' } })))), hong.F.stateRead().phase
  ], ['DOCUMENT_PROPERTY_CORRUPT', 'error']);

  // Nhãn lượt chốt lúc mở: dòng Log của lượt lấy nhãn trong ô lượt, không suy lại từ kênh hay chuỗi nền lúc ghi.
  const tayNhan = hopCoLuot(), nenNhan = hopCoLuot('background');
  tayNhan.F.logContextNote(tayNhan.F.stateRead());
  const nhanTay = tayNhan.F.logContextText();
  tayNhan.F.withOrchestrationLock(() => tayNhan.F.stateWrite(tayNhan.F.runClose(tayNhan.F.stateRead(), 'done')));
  tayNhan.F.issueContext = { channel: 'relay' };
  tayNhan.F.logContextNote(tayNhan.F.stateRead());
  const nhanNgoai = tayNhan.F.logContextText();
  tayNhan.F.issueContext = null;
  check(so, 'nhãn lượt: lượt tay ghi "Tay", lượt nền ghi "Nền" ngay lúc mở; Log trong lượt dùng nhãn đó; ngoài lượt thì theo kênh gọi (relay là Nền)', [
    tayNhan.F.stateRead().runLabel.split(' · ')[0], nenNhan.F.stateRead().runLabel.split(' · ')[0], nhanTay === tayNhan.F.stateRead().runLabel, nhanNgoai
  ], ['Tay', 'Nền', true, 'Nền']);

  // Đăng nhập thử là lượt riêng: mã lượt mới và nhãn của nó, không mượn mã lượt vừa đóng.
  const runCu = tayNhan.F.stateRead().runId;
  const dangNhap = tayNhan.F.loginTestRequest('ref-thu', null);
  check(so, 'đăng nhập thử mở lượt riêng qua runOpen: mã lượt mới, nhãn "Tay · Đăng nhập thử", cursor login', [
    dangNhap.ok, tayNhan.F.stateRead().runId !== runCu, tayNhan.F.stateRead().runLabel, tayNhan.F.stateRead().cursor.kind
  ], [true, true, 'Tay · Đăng nhập thử', 'login']);
  // Gặp khi nghiệm thu 2026-11-01: lượt tay mở ngay sau lượt nền Quét nhanh chỉ mang nhãn "Tay" vì ô lượt còn chuỗi nền cũ.
  tayNhan.F.statePatch({ chain: { current: 'customerFull' } });
  check(so, 'lượt tay mở khi ô lượt còn chuỗi nền Quét nhanh vẫn ghi tên kiểu quét', tayNhan.F.runOpen({ origin: 'manual', scan: 'full' }).runLabel, 'Tay · Quét nhanh');

  // Lượt chết (Extension im giữa lượt): status chỉ báo kẹt, không ghi; lần bấm Đồng bộ kế đóng lượt cũ rồi mở lượt mới.
  const ket = hopCoLuot();
  const runKet = ket.F.stateRead().runId, cu = JSON.parse(ket.data.FBM_SYNC_STATE_V1);
  Object.assign(cu, { activeRequestId: '', deadlineAt: 0, updatedAt: Date.now() - ket.F.STALE_RUN_MS - 1000 });
  ket.data.FBM_SYNC_STATE_V1 = JSON.stringify(cu);
  const truocStatus = ket.data.FBM_SYNC_STATE_V1, xem = ket.F.statusView();
  check(so, 'status gặp lượt chết: báo stuck kèm mã và chữ hướng dẫn, không ghi ô lượt', [xem.stuck, xem.stuckCode, /Bấm Đồng bộ/.test(xem.stuckMessage), ket.data.FBM_SYNC_STATE_V1 === truocStatus], [true, 'SYNC_STALE_RUN', true, true]);
  const truocMoi = ket.logs.length;
  const moi = ket.F.start({ mode: 'read', origin: 'manual', manual: true });
  const thuHoi = ket.logs.slice(truocMoi).filter((line) => line.action === 'stale_run')[0] || {};
  check(so, 'lượt kẹt rồi bấm Đồng bộ: lượt cũ đóng lỗi SYNC_STALE_RUN có dòng Log riêng, lượt mới mở với mã khác và phát request đầu', [
    thuHoi.cycleId === runKet, thuHoi.detail && thuHoi.detail.code, ket.F.stateRead().runId !== runKet, !!moi.request, ket.F.statusView().stuck
  ], [true, 'SYNC_STALE_RUN', true, true, false]);

  // runClose là cửa duy nhất: kết luận lạ và đóng lượt đã đóng là lỗi lập trình.
  const cua = hopCoLuot();
  check(so, 'runClose: kết luận lạ ném RUN_VERDICT_UNKNOWN; đóng lượt không còn chạy ném RUN_NOT_OPEN', [
    loi(() => cua.F.runClose(cua.F.stateRead(), 'xong')), loi(() => cua.F.runClose(cua.F.runClose(cua.F.stateRead(), 'done'), 'done'))
  ], ['RUN_VERDICT_UNKNOWN', 'RUN_NOT_OPEN']);
  const loiLuot = cua.F.runFail(hopCoLuot().F.stateRead(), 'TRANSPORT_ERROR', 'Không gọi được FBM.');
  check(so, 'runFail: phase lỗi, mã lỗi và chữ lỗi người dùng đọc, request đang bay chuyển sang closedRequestId', [loiLuot.phase, loiLuot.lastFailureCode, loiLuot.lastError, loiLuot.activeRequestId, !!loiLuot.closedRequestId], ['error', 'TRANSPORT_ERROR', 'Không gọi được FBM.', '', true]);

  // Công tắc tổng đi đúng tiến trình Dừng: tắt khi request đang bay thì lượt đóng ngay với lý do tắt đồng bộ, có dòng kết thúc lượt; khóa bận thì cờ dừng chờ lát đang chạy áp.
  const tat = hopCoLuot(), runTat = tat.F.stateRead().runId;
  const dangBay = tat.F.stateRead().activeRequestId;
  const lenhTat = tat.F.controlDispatch('set_master', { enabled: false });
  const dong = tat.F.stateRead(), ketThuc = tat.logs.filter((line) => line.action === 'sync_session_finished' && line.cycleId === runTat)[0] || {};
  check(so, 'tắt công tắc tổng khi request đang bay: lượt đóng ngay (tạm dừng, giữ runId), request chuyển sang closedRequestId, dòng kết thúc lượt mang lý do tắt đồng bộ', [
    !!dangBay, lenhTat.code, dong.phase, dong.runId === runTat, tat.F.runInProgress(dong), dong.closedRequestId === dangBay, String(ketThuc.reason || '').indexOf('tắt đồng bộ') >= 0, tat.data[tat.F.MASTER_SWITCH_KEY]
  ], [true, 'SYNC_STOPPED', 'paused', true, false, true, true, 'false']);
  const khoaBan = hopCoLuot(), runBan = khoaBan.F.stateRead().runId;
  khoaBan.khoa.ban = true;
  const lenhBan = khoaBan.F.controlDispatch('set_master', { enabled: false }), conMo = khoaBan.F.runInProgress(khoaBan.F.stateRead());
  khoaBan.khoa.ban = false;
  const apCo = khoaBan.F.withOrchestrationLock(() => khoaBan.F.stopPendingApply(true));
  check(so, 'tắt công tắc tổng khi lát khác giữ khóa: trả SYNC_STOP_PENDING, lượt còn mở tới khi lát áp cờ dừng thì đóng với kết luận tắt đồng bộ', [
    lenhBan.code, conMo, apCo.stopped, khoaBan.F.stateRead().runId === runBan, khoaBan.F.runInProgress(khoaBan.F.stateRead()), khoaBan.F.stateRead().message
  ], ['SYNC_STOP_PENDING', true, true, true, false, khoaBan.F.RUN_VERDICTS.disabled.message]);
}

module.exports = { chay };
