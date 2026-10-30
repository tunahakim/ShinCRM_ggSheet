/** Kiểm nộp lặp qua relay: lần nộp đầu GAS đã xử lý nhưng câu trả lời mất trên đường về, Extension thử lại cùng thân. GAS phát lại request đang chờ chứ không coi là response cũ, và không chạy lại nghiệp vụ. */
const { section, check } = require('../../lib/assert');
const { workflowGas } = require('./Workflow');

function maLoi(fn) {
  try { const result = fn(); return String(result && result.code || ''); } catch (error) { return String(error && error.code || ''); }
}

async function chay(so) {
  section('FBM sync — relay nộp lặp: phát lại request đang chờ, không chạy lại nghiệp vụ');
  const { hop } = workflowGas();
  const FbmSync = hop.FbmSync;
  const logs = [];
  hop.logEvent = (line) => { logs.push(line); };
  FbmSync.setMasterEnabled(true);
  // Bộ xử lý nghiệp vụ giả đi qua đúng hai cổng thật: nhận ra response (`requestAnswered`) rồi cấp request kế (`nextEnvelope`); đếm số lần chạy để biết nộp lặp có chạy lại nghiệp vụ không.
  let nghiepVu = 0;
  FbmSync.continue = function (response) {
    nghiepVu += 1;
    const state = FbmSync.stateRead();
    if (!FbmSync.requestAnswered(state, FbmSync.responseRequestId(response))) { return { ok: false, code: 'STALE_RESPONSE', request: null, status: FbmSync.statusView() }; }
    state.activeRequestId = '';
    FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.requestForCursor(state)), status: FbmSync.statusView() };
  };
  const traLoi = (id) => ({ ok: true, status: 200, body: '{}', trace: [{ stage: 'fbm_tab_replied', requestId: id }] });
  const nop = (fields) => FbmSync.controlDispatch('continue', Object.assign({ machineId: 'may-A' }, fields), 'relay');

  const started = FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A' });
  const r1 = nop({ runId: started.runId }).request;
  const r2 = nop({ response: traLoi(r1.id) }).request;
  const sau = FbmSync.stateRead();
  check(so, 'lần nộp đầu được xử lý: GAS cấp request kế, ô lượt nhớ request vừa trả lời và request cấp ngay sau nó', [!!r2, sau.activeRequestId === r2.id, sau.resubmit], [true, true, { answered: r1.id, issued: r2.id }]);

  check(so, 'lần nộp đầu chạy nghiệp vụ đúng một lần', nghiepVu, 1);
  const lap = nop({ response: traLoi(r1.id) });
  const sauLap = FbmSync.stateRead();
  check(so, 'nộp lặp đúng thân lần đầu: GAS phát lại request đang chờ (cùng bước, mã mới), không trả STALE_RESPONSE, không chạy lại nghiệp vụ', [lap.ok, lap.code || '', lap.request && lap.request.meta.kind, lap.request && lap.request.url === r2.url, lap.request && lap.request.id !== r2.id, sauLap.activeRequestId === lap.request.id, sauLap.resubmit, nghiepVu], [true, '', r2.meta.kind, true, true, true, { answered: r1.id, issued: lap.request.id }, 1]);
  const lapNua = nop({ error: { requestId: r1.id, code: 'RELAY_FETCH_FAILED', message: 'mạng hỏng' } });
  check(so, 'nộp lặp lần nữa (lần này là lỗi kèm mã request đã trả lời) vẫn được nhận ra và phát lại, không chạy nghiệp vụ', [lapNua.request && lapNua.request.meta.kind, FbmSync.stateRead().activeRequestId === lapNua.request.id, nghiepVu], [r2.meta.kind, true, 1]);
  check(so, 'request bị thay khi phát lại (Extension chưa từng nhận) nộp về thì là response cũ', nop({ response: traLoi(r2.id) }).code, 'STALE_RESPONSE');

  check(so, 'response mang mã không phải request vừa trả lời vẫn là response cũ', nop({ response: traLoi('ma-la') }).code, 'STALE_RESPONSE');

  const sig = FbmSync.stateRead();
  FbmSync.stateWrite(Object.assign(sig, { activeRequestSig: 'login https://fbo.com.vn:8888/Login' }));
  check(so, 'request dựng lại từ cursor khác request đang chờ: báo REISSUE_CURSOR_MISMATCH, không phát nhầm bước', maLoi(() => nop({ response: traLoi(r1.id) })), 'REISSUE_CURSOR_MISMATCH');

  // Lượt đã đóng sau lần nộp đầu: nộp lặp nhận status, không ghi thêm Log lỗi.
  const again = FbmSync.controlDispatch('start', { kind: 'identity_probe', machineId: 'may-A', force: true });
  const r9 = nop({ runId: again.runId }).request;
  const blocked = { requestId: r9.id, code: 'FBM_SITE_ACCESS_BLOCKED', message: 'Chrome đang chặn Extension truy cập site FBM.' };
  nop({ error: blocked });
  const logTruoc = logs.filter((line) => JSON.stringify(line).indexOf('FBM_SITE_ACCESS_BLOCKED') >= 0).length;
  const dong = nop({ error: blocked });
  check(so, 'nộp lặp sau khi lần đầu đã đóng lượt: trả status không request, lượt giữ lỗi cũ, không thêm dòng Log', [dong.ok, dong.request || null, FbmSync.stateRead().lastFailureCode, logs.filter((line) => JSON.stringify(line).indexOf('FBM_SITE_ACCESS_BLOCKED') >= 0).length === logTruoc], [true, null, 'FBM_SITE_ACCESS_BLOCKED', true]);
}

module.exports = { chay };
