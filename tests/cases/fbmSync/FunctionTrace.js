/** Chốt Log FBM chỉ ghi theo bước nghiệp vụ, không tăng theo số lần gọi hàm/record. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { hopBuoc: dungState, dongDong } = require('../../lib/fbm/hop-buoc');

function chay(so) {
  section('FBM sync - detailed business-step log');
  const events = [];
  const hop = taoHopCat({
    FbmSync: {},
    LOG_OK: 'ok',
    LOG_WARN: 'warn',
    LOG_ERROR: 'error',
    PropertiesService: { getDocumentProperties: () => ({ getProperty: () => '[]', setProperty: () => {} }) },
    logTrace: (entry) => events.push(entry),
    logEvent: (entry) => events.push(entry)
  });
  napServer(hop, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js');

  const state = { runId: 'run-thuc-te', mode: 'read', scan: 'full', origin: 'manual', entity: '', metadata: {}, counts: { completed: 0, succeeded: 0, skipped: 0, conflict: 0, error: 0 } };
  hop.FbmSync.businessStepStart(state, 'preflight_hash', { mode: 'read', scan: 'full', password: 'khong-duoc-ghi' });
  for (let index = 0; index < 1000; index += 1) {
    hop.FbmSync.businessStepAdd(state, 'preflight_hash', { localRecords: 1, changed: 1 });
  }
  hop.FbmSync.businessStepFinish(state, 'preflight_hash', 'ok', { unchanged: 20, candidateCount: 7 });

  const preflight = events.filter((event) => event.detail && event.detail.step === 'preflight_hash');
  const reasons = events.map((event) => String(event.reason || '')).join('\n');
  check(so, '1.000 lần cộng số liệu chỉ tạo đúng một cặp log bước tính hash', [preflight.length, preflight[0].action, preflight[1].action], [2, 'preflight_hash_started', 'preflight_hash_finished']);
  check(so, 'dòng kết thúc tính hash giữ tổng số thực tế', [preflight[1].detail.result.localRecords, preflight[1].detail.result.changed, preflight[1].detail.result.unchanged, preflight[1].detail.result.candidateCount, reasons.indexOf('1000 bản ghi khác baseline') >= 0], [1000, 1000, 20, 7, true]);
  check(so, 'tham số bí mật không xuất hiện trong Log bước nghiệp vụ', reasons.indexOf('khong-duoc-ghi') >= 0, false);

  hop.FbmSync.businessStepStart(state, 'session', { mode: 'read', scan: 'full' });
  hop.FbmSync.businessStepFinish(state, 'session', 'error', { errors: 1, error: 'FBM không phản hồi probe phiên.' });
  const session = events.filter((event) => event.detail && event.detail.step === 'session');
  check(so, 'bước lỗi có đủ dòng bắt đầu và kết thúc lỗi', [session.length, session[1].outcome, session[1].detail.result.errors], [2, 'error', 1]);

  // FBM-019: mọi đường kết thúc phiên đi qua stateWrite nên bước mở được đóng đúng một lần, và lỗi chỉ quy cho bước đang chạy.

  const loi = dungState();
  const truocLoi = loi.dong.length;
  loi.st.phase = 'error'; loi.st.lastError = 'Ghi Sheet thất bại';
  loi.nen.FbmSync.stateWrite(loi.st);
  loi.nen.FbmSync.stateWrite(loi.nen.FbmSync.stateRead());
  check(so, 'phiên lỗi: bước đang chạy ghi "với lỗi", bước mở khác ghi "Dừng ... vì lỗi ở bước", mỗi bước đóng đúng một lần',
    dongDong(loi.dong.slice(truocLoi)),
    ['pull_customer|error|Kết thúc đọc Customer từ FBM với lỗi', 'reconcile_customer|warn|Dừng đối soát và cập nhật Customer ShinCRM vì lỗi ở bước đọc Customer từ FBM', 'run|error|Kết thúc phiên đồng bộ với lỗi']);
  check(so, 'phiên lỗi: dòng lỗi của bước mang lý do lỗi', loi.dong.slice(truocLoi)[0].reason.indexOf('Lỗi: Ghi Sheet thất bại') >= 0, true);

  const huy = dungState();
  const runIdHuy = huy.st.runId, truocHuy = huy.dong.length;
  huy.nen.FbmSync.runStopCommand('any');
  check(so, 'hủy phiên: mọi bước mở ghi "Tạm dừng" cùng cycleId của phiên; runId giữ lại để Sidebar vẽ kết quả lượt vừa đóng',
    [dongDong(huy.dong.slice(truocHuy)), huy.dong.slice(truocHuy).every((e) => e.cycleId === runIdHuy), huy.nen.FbmSync.stateRead().runId],
    [['pull_customer|warn|Tạm dừng đọc Customer từ FBM', 'reconcile_customer|warn|Tạm dừng đối soát và cập nhật Customer ShinCRM', 'run|warn|Tạm dừng phiên đồng bộ'], true, runIdHuy]);

  const treo = dungState();
  const truocTreo = treo.dong.length;
  const oTreo = treo.nen.FbmSync.stateRead();
  treo.nen.FbmSync.staleRunClose(oTreo, treo.nen.FbmSync.staleRunCheck(oTreo, Date.now() + treo.nen.FbmSync.STALE_RUN_MS + 1000));
  check(so, 'thu hồi phiên treo: bước đang chạy và phiên được đóng với lỗi',
    dongDong(treo.dong.slice(truocTreo)).map((d) => d.split('|').slice(0, 2).join('|')),
    ['pull_customer|error', 'reconcile_customer|warn', 'run|error']);

  const xong = dungState();
  const truocXong = xong.dong.length;
  xong.st.phase = 'done'; xong.st.message = 'Hoàn tất';
  xong.nen.FbmSync.stateWrite(xong.st);
  check(so, 'phiên xong: mọi bước mở ghi "Hoàn thành", phiên ghi dòng ok',
    dongDong(xong.dong.slice(truocXong)).map((d) => d.split('|').slice(0, 2).join('|')),
    ['pull_customer|trace', 'reconcile_customer|trace', 'run|ok']);

  const thay = dungState();
  const truocThay = thay.dong.length;
  thay.nen.FbmSync.runOpen({ phase: 'checking_session' });
  check(so, 'phiên mới thay phiên đang mở: các bước của phiên cũ được đóng trước khi metadata bị xóa',
    dongDong(thay.dong.slice(truocThay)).map((d) => d.split('|').slice(0, 2).join('|')),
    ['pull_customer|warn', 'reconcile_customer|warn', 'run|warn']);

  return so;
}

module.exports = { chay };
