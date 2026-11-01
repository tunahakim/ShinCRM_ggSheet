/** Kiểm response của lệnh ghi FBM về muộn: khung lát bỏ nó, không áp kết quả đẩy, không ghi Sheet và không phát lại lệnh ghi (gửi lại có thể tạo trùng trên FBM). */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('../../lib/fbm/hop-dong-bo');

const MA_GHI = 'R-ghi-muon';

/** Lượt đẩy đang chờ response của request lưu khách; đếm số lần áp kết quả đẩy và ghi Sheet. */
function hopChoGhi() {
  const logs = [], dem = { apKetQua: 0, ghiSheet: 0 };
  const { hop } = workflowGas({ logEvent: (line) => logs.push(line) });
  const F = hop.FbmSync;
  F.markPushResult = () => { dem.apKetQua += 1; };
  hop.writeGateSave = () => { dem.ghiSheet += 1; return { ok: true }; };
  const state = F.runOpen({ phase: 'push', mode: 'write' });
  state.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-1', record: { id: 'C-1', fbmId: 'A-1' } } };
  state.activeRequestId = MA_GHI;
  state.deadlineAt = Date.now() + 60000;
  F.stateWrite(state);
  const traLoi = { ok: true, status: 200, body: '{"d":{"InternalValues":[]}}', transport: { contract: F.protocol.contract, trace: [{ stage: 'executor_response_sent', requestId: MA_GHI }] } };
  return { F, logs, dem, traLoi };
}

async function chay(so) {
  section('FBM sync — LateReply: response lệnh ghi về muộn');

  const dung = hopChoGhi();
  dung.F.runStopCommand('any');
  const truoc = JSON.stringify(dung.F.stateRead());
  const muon = dung.F.continue(dung.traLoi);
  check(so, 'bấm Dừng khi lệnh ghi đang bay, response về sau: bỏ, không cấp request, không áp kết quả đẩy, không ghi Sheet, ô lượt giữ nguyên', [
    muon.code, muon.request, dung.dem.apKetQua, dung.dem.ghiSheet, JSON.stringify(dung.F.stateRead()) === truoc
  ], ['STALE_RESPONSE', null, 0, 0, true]);
  check(so, 'response bị bỏ của lượt vừa Dừng ghi Log mức ok, không báo lỗi giả', dung.logs.filter((line) => line.action === 'closed_run_response_dropped').map((line) => line.outcome), ['ok']);

  // Quá hạn an toàn mà response mới về: không biết FBM đã lưu hay chưa, nên đóng lượt chứ không áp kết quả hay gửi lại.
  const quaHan = hopChoGhi();
  quaHan.F.statePatch({ deadlineAt: Date.now() - 1000 });
  quaHan.F.STALE_RUN_MS = -1;
  const tre = quaHan.F.continue(quaHan.traLoi);
  check(so, 'response lệnh ghi về sau hạn an toàn: lượt đóng SYNC_STALE_WRITE, không áp kết quả, không ghi Sheet, không phát lại lệnh ghi', [
    tre.code, tre.request, quaHan.dem.apKetQua, quaHan.dem.ghiSheet, quaHan.F.stateRead().phase, quaHan.F.stateRead().activeRequestId
  ], ['SYNC_STALE_WRITE', null, 0, 0, 'error', '']);
}

module.exports = { chay };
