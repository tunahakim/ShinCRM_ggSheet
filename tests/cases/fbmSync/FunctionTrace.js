/** Chốt Log FBM chỉ ghi theo bước nghiệp vụ, không tăng theo số lần gọi hàm/record. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');

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
  napServer(hop, 'fbm_sync/diagnostic/Trace.js');

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
  const dungState = () => {
    const kho = {}, dong = [];
    const nen = taoHopCat({
      FbmSync: {}, LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error',
      PropertiesService: { getDocumentProperties: () => ({ getProperty: (k) => (k in kho ? kho[k] : null), setProperty: (k, v) => { kho[k] = String(v); }, deleteProperty: (k) => { delete kho[k]; }, getKeys: () => Object.keys(kho) }) },
      logTrace: (entry) => dong.push(entry), logEvent: (entry) => dong.push(entry)
    });
    napServer(nen, 'fbm_sync/state/State.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
    const st = nen.FbmSync.stateStart('', 'checking_session', 0);
    nen.FbmSync.businessStepStart(st, 'run', {});
    nen.FbmSync.businessStepStart(st, 'session', {});
    nen.FbmSync.businessStepFinish(st, 'session', 'ok', {});
    nen.FbmSync.businessStepStart(st, 'pull_customer', {});
    nen.FbmSync.businessStepStart(st, 'reconcile_customer', {});
    nen.FbmSync.businessStepAdd(st, 'pull_customer', { received: 50 });
    st.phase = 'pull_customer';
    return { nen, dong, st: nen.FbmSync.stateWrite(st) };
  };
  const dongDong = (dong) => dong.filter((e) => /_finished$/.test(e.action)).map((e) => e.detail.step + '|' + e.outcome + '|' + e.reason.split(' - ')[0]);

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
  huy.nen.fbmSyncCancel();
  check(so, 'hủy phiên: mọi bước mở ghi "Tạm dừng" cùng cycleId của phiên dù runId đã bị xóa',
    [dongDong(huy.dong.slice(truocHuy)), huy.dong.slice(truocHuy).every((e) => e.cycleId === runIdHuy), huy.nen.FbmSync.stateRead().runId],
    [['pull_customer|warn|Tạm dừng đọc Customer từ FBM', 'reconcile_customer|warn|Tạm dừng đối soát và cập nhật Customer ShinCRM', 'run|warn|Tạm dừng phiên đồng bộ'], true, '']);

  const treo = dungState();
  const truocTreo = treo.dong.length;
  treo.nen.FbmSync.recoverStaleRun(treo.nen.FbmSync.stateRead(), Date.now() + treo.nen.FbmSync.STALE_RUN_MS + 1000);
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
  thay.nen.FbmSync.stateStart('', 'checking_session', 0);
  check(so, 'phiên mới thay phiên đang mở: các bước của phiên cũ được đóng trước khi metadata bị xóa',
    dongDong(thay.dong.slice(truocThay)).map((d) => d.split('|').slice(0, 2).join('|')),
    ['pull_customer|warn', 'reconcile_customer|warn', 'run|warn']);

  // FBM-003: exception giữa lát phải chuyển phiên sang lỗi ngay trong lần chạy đó, khi còn giữ khóa; lỗi gốc vẫn được ném lại.
  const vo = dungState();
  napServer(vo.nen, 'fbm_sync/control/ControlPort.js');
  const runIdVo = vo.st.runId, truocVo = vo.dong.length;
  vo.nen.FbmSync.continue = () => { throw new Error('Cannot read properties of undefined'); };
  let nemLai = '';
  try { vo.nen.FbmSync.controlDispatchLocked('continue', { response: {} }); } catch (err) { nemLai = err.message; }
  const sauVo = vo.nen.FbmSync.stateRead();
  check(so, 'exception giữa lát: lỗi gốc được ném lại, phiên chuyển sang error ngay, giữ cursor',
    [nemLai, sauVo.phase, sauVo.lastError, sauVo.runId],
    ['Cannot read properties of undefined', 'error', 'Lỗi khi đọc Customer từ FBM: Cannot read properties of undefined', runIdVo]);
  check(so, 'exception giữa lát: Log có "Kết thúc <bước> với lỗi" cùng runId của phiên',
    vo.dong.slice(truocVo).filter((e) => e.outcome === 'error').map((e) => e.detail.step + '|' + (e.cycleId === runIdVo) + '|' + e.reason.split(' - ')[0]),
    ['pull_customer|true|Kết thúc đọc Customer từ FBM với lỗi', 'run|true|Kết thúc phiên đồng bộ với lỗi']);
  const truocHuyLoi = vo.dong.length;
  vo.nen.fbmSyncCancel();
  const sauHuyLoi = vo.nen.FbmSync.stateRead();
  check(so, 'client hủy sau lỗi: phiên vẫn là error với lý do cũ, không đổi thành "Đã dừng" và không ghi thêm dòng bước',
    [sauHuyLoi.phase, sauHuyLoi.lastError.indexOf('Cannot read properties') >= 0, vo.dong.length - truocHuyLoi],
    ['error', true, 0]);

  const nenHb = dungState();
  napServer(nenHb.nen, 'fbm_sync/control/ControlPort.js', 'fbm_sync/state/Scheduler.js');
  nenHb.nen.fbmSyncHeartbeatLocked = () => { throw new Error('Lỗi lát nền'); };
  let nemNen = '';
  try { nenHb.nen.fbmSyncHeartbeat({}, {}); } catch (err) { nemNen = err.message; }
  check(so, 'exception ở đường nền (heartbeat tự giữ khóa): lỗi gốc ném lại và phiên chuyển sang error',
    [nemNen, nenHb.nen.FbmSync.stateRead().phase], ['Lỗi lát nền', 'error']);

  const client = dungState();
  napServer(client.nen, 'fbm_sync/report/Report.js');
  client.nen.FbmSync.statusView = () => ({ phase: client.nen.FbmSync.stateRead().phase, lastError: client.nen.FbmSync.stateRead().lastError });
  const truocClient = client.dong.length;
  client.nen.FbmSync.logTransportError('Extension không trả response');
  check(so, 'Sidebar báo lỗi khi phiên đang chạy: phiên chuyển error, bước đang chạy đóng với đúng lý do',
    [client.nen.FbmSync.stateRead().phase, client.dong.slice(truocClient).filter((e) => e.outcome === 'error').map((e) => e.detail.step).join(','), client.dong.slice(truocClient)[0].reason.indexOf('Extension không trả response') >= 0],
    ['error', 'pull_customer,run', true]);
  const truocLan2 = client.dong.length;
  client.nen.FbmSync.logTransportError('Extension không trả response');
  client.nen.FbmSync.logTransportError('Lỗi khác sau khi phiên đã dừng');
  check(so, 'Sidebar báo lỗi khi phiên đã lỗi: lỗi trùng không ghi lại, lỗi mới vẫn có một dòng Log',
    client.dong.slice(truocLan2).map((e) => e.outcome + '|' + e.reason), ['error|Sidebar báo lỗi phiên đồng bộ: Lỗi khác sau khi phiên đã dừng']);
  // FBM-009/FBM-020: lỗi theo bản ghi gom trong RAM, xả ra Sheet Log ở ranh giới lát, kể cả khi lát bị exception.
  const gom = dungState();
  napServer(gom.nen, 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/SheetSave.js');
  const runIdGom = gom.st.runId;
  gom.nen.FbmSync.continue = () => {
    for (let i = 1; i <= 25; i += 1) { gom.nen.FbmSync.recordIssueAdd('pull', 'customer', 'xung đột', 'CUS-' + i, 'FBM và ShinCRM cùng đổi', 'conflict'); }
    gom.nen.FbmSync.recordIssueAdd('pull', 'activity', 'lỗi', 'ACT-1', 'Activity thiếu ngày làm việc hợp lệ.', 'error');
    throw new Error('Hỏng giữa lát');
  };
  const truocGom = gom.dong.length;
  try { gom.nen.FbmSync.controlDispatchLocked('continue', { response: {} }); } catch (ignore) { /* lỗi gốc đã kiểm ở ca exception giữa lát */ }
  const issueGom = gom.dong.slice(truocGom).filter((e) => e.action === 'pull_record_issue');
  check(so, 'lát bị exception vẫn xả lỗi theo bản ghi: mỗi loại đúng một dòng cùng runId, giữ tối đa 20 mã và đếm phần còn lại',
    [issueGom.length, issueGom.map((e) => e.outcome + '|' + e.entity + '|' + e.detail.count + '|' + e.detail.ids.length + '|' + (e.cycleId === runIdGom)), /và 5 bản ghi khác$/.test(issueGom[0] && issueGom[0].reason), issueGom[1] && issueGom[1].recordId],
    [2, ['conflict|customer|25|20|true', 'error|activity|1|1|true'], true, 'ACT-1']);
  check(so, 'bộ gom rỗng sau khi xả: lát sau không ghi lại lỗi cũ', [gom.nen.FbmSync.recordIssuesFlush()], [0]);

  gom.nen.FbmSync.logPushRecord({ entity: 'customer', id: 'CUS-7' }, 'edit', 'ok', 'Đã ghi FBM', { syncStatus: 'đã đồng bộ' });
  gom.nen.FbmSync.logPushRecord({ entity: 'customer', id: 'CUS-8' }, 'edit', 'error', 'FBM từ chối ghi', { syncStatus: 'lỗi' });
  const truocPush = gom.dong.length;
  gom.nen.FbmSync.recordIssuesFlush();
  check(so, 'push: bản ghi thành công không sinh Log, bản ghi lỗi có một dòng push_record_issue mang mã bản ghi',
    gom.dong.slice(truocPush).map((e) => e.action + '|' + e.outcome + '|' + e.recordId + '|' + e.detail.status), ['push_record_issue|error|CUS-8|lỗi']);

  const pf = taoHopCat({ FbmSync: {}, LOG_WARN: 'warn', LOG_ERROR: 'error', logEvent: (entry) => pf.dong.push(entry) });
  pf.dong = [];
  napServer(pf, 'fbm_sync/report/Report.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Preflight.js');
  const pfIssues = [];
  for (let i = 1; i <= 3; i += 1) { pfIssues.push({ code: 'FBM_DUP_CODE', scope: 'customer', blocking: true, message: 'Trùng mã khách ALT0000' + i }); }
  pfIssues.push({ code: 'FBM_OWNER_MISSING', scope: 'activity', blocking: false, message: 'Thiếu người phụ trách ACT-9' });
  const pfDong = pf.FbmSync.logPreflight({ issues: pfIssues });
  check(so, 'preflight: mỗi mã vấn đề đúng một dòng Log, chặn ghi là error, cảnh báo là warn, giữ số lượng',
    [pfDong, pf.dong.map((e) => e.action + '|' + e.outcome + '|' + e.entity + '|' + e.detail.count)],
    [2, ['preflight_issue|error|customer|3', 'preflight_issue|warn|activity|1']]);
  // FBM-004: cửa ghi Sheet chặn trang pull thì phiên phải lỗi, không được tổng kết "Hoàn tất", cursor đứng nguyên trang đó.
  const ghi = dungState();
  napServer(ghi.nen, 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/write/SheetSave.js');
  ghi.nen.FbmSync.SYNC_STATUS = { error: 'lỗi' };
  ghi.nen.FbmSync.canWriteSheet = () => true;
  ghi.nen.DATA_SCHEMA = {}; ghi.nen.SYNC_SCHEMA = {};
  ghi.nen.writeGateSave = () => ({ ok: false, invalid: [{ id: 'CUS-3', field: 'fbmCustomerCode', label: 'Mã KH FBM', reason: 'Đã có bản ghi khác mang mã kh fbm "ALT00010".' }] });
  ghi.nen.FbmSync.pullWrite = (entity, records) => { ghi.nen.FbmSync.sheetSave(entity, records, 'pull'); return { ok: true, written: records.length, conflicts: 0, skipped: 0 }; };
  const cursorGhi = JSON.stringify(ghi.nen.FbmSync.stateRead().cursor || {});
  ghi.nen.FbmSync.continue = () => { ghi.nen.FbmSync.pullRecords('customer', [{ fbmId: 'C-3' }, { fbmId: 'C-4' }], 'read'); return { ok: true }; };
  const truocGhi = ghi.dong.length;
  let nemGhi = '';
  try { ghi.nen.FbmSync.controlDispatchLocked('continue', { response: {} }); } catch (err) { nemGhi = err.code; }
  const sauGhi = ghi.nen.FbmSync.stateRead(), viewGhi = ghi.nen.FbmSync.statusView ? ghi.nen.FbmSync.statusView() : sauGhi;
  check(so, 'ghi Sheet bị chặn khi pull: phiên chuyển error có lý do đọc được, cursor đứng nguyên, không cộng số thành công',
    [nemGhi, sauGhi.phase, sauGhi.lastFailureCode, /Không ghi được 2 bản ghi customer vào Sheet.*Mã KH FBM của CUS-3/.test(sauGhi.lastError), JSON.stringify(sauGhi.cursor || {}) === cursorGhi, Number(sauGhi.counts.succeeded || 0), viewGhi.phase],
    ['FBM_SHEET_WRITE_FAILED', 'error', 'FBM_SHEET_WRITE_FAILED', true, true, 0, 'error']);
  const dongGhi = ghi.dong.slice(truocGhi);
  check(so, 'ghi Sheet bị chặn khi pull: Log có dòng kết thúc bước với lỗi và dòng lỗi bản ghi mang mã CUS-3',
    [dongGhi.some((e) => e.outcome === 'error' && e.detail && e.detail.step === 'run'), dongGhi.filter((e) => e.action === 'pull_record_issue').map((e) => e.recordId + '|' + e.outcome)],
    [true, ['CUS-3|error']]);
  return so;
}

module.exports = { chay };
