/** Kiểm lát bị exception, Sidebar báo lỗi và cửa ghi Sheet bị chặn: lượt chuyển lỗi ngay trong lần chạy đó, đóng đúng bước đang mở, lỗi theo bản ghi vẫn được xả ra Log. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { hopBuoc: dungState } = require('../../lib/fbm/hop-buoc');

function chay(so) {
  section('FBM sync - lát lỗi đóng lượt đúng bước');
  // FBM-003: exception giữa lát phải chuyển phiên sang lỗi ngay trong lần chạy đó, khi còn giữ khóa; lỗi gốc vẫn được ném lại.
  const vo = dungState();
  napServer(vo.nen, 'fbm_sync/control/ControlPort.js', 'fbm_sync/transport/TransportCore.js');
  const runIdVo = vo.st.runId, truocVo = vo.dong.length;
  vo.nen.FbmSync.continue = () => { throw new Error('Cannot read properties of undefined'); };
  let nemLai = '';
  try { vo.nen.FbmSync.controlDispatch('continue', { response: {} }); } catch (err) { nemLai = err.message; }
  const sauVo = vo.nen.FbmSync.stateRead();
  check(so, 'exception giữa lát: lỗi gốc được ném lại, phiên chuyển sang error ngay, giữ cursor',
    [nemLai, sauVo.phase, sauVo.lastError, sauVo.runId],
    ['Cannot read properties of undefined', 'error', 'Lỗi khi đọc Customer từ FBM: Cannot read properties of undefined', runIdVo]);
  check(so, 'exception giữa lát: Log có "Kết thúc <bước> với lỗi" cùng runId của phiên',
    vo.dong.slice(truocVo).filter((e) => e.outcome === 'error').map((e) => e.detail.step + '|' + (e.cycleId === runIdVo) + '|' + e.reason.split(' - ')[0]),
    ['pull_customer|true|Kết thúc đọc Customer từ FBM với lỗi', 'run|true|Kết thúc phiên đồng bộ với lỗi']);
  const truocHuyLoi = vo.dong.length;
  vo.nen.FbmSync.runStopCommand('any');
  const sauHuyLoi = vo.nen.FbmSync.stateRead();
  check(so, 'client hủy sau lỗi: phiên vẫn là error với lý do cũ, không đổi thành "Đã dừng" và không ghi thêm dòng bước',
    [sauHuyLoi.phase, sauHuyLoi.lastError.indexOf('Cannot read properties') >= 0, vo.dong.length - truocHuyLoi],
    ['error', true, 0]);

  const nenHb = dungState();
  napServer(nenHb.nen, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/state/Slice.js', 'fbm_sync/state/RunPlan.js');
  nenHb.nen.FbmSync.continue = () => { throw new Error('Lỗi lát nền'); };
  nenHb.nen.FbmSync.replyAdmit = () => null;
  nenHb.nen.FbmSync.statePatch({ origin: 'background', process: 'keepalive', cursor: { kind: 'customer_count' } });
  let nemNen = '';
  try { nenHb.nen.FbmSync.controlDispatch('continue', { source: 'relay', response: {} }); } catch (err) { nemNen = err.message; }
  check(so, 'exception ở đường nền (relay nộp kết quả nhịp Giữ phiên): lỗi gốc ném lại và phiên chuyển sang error',
    [nemNen, nenHb.nen.FbmSync.stateRead().phase], ['Lỗi lát nền', 'error']);

  const client = dungState();
  napServer(client.nen, 'fbm_sync/report/Report.js', 'server/log/ClientError.js');
  client.nen.FbmSync.statusView = () => ({ phase: client.nen.FbmSync.stateRead().phase, lastError: client.nen.FbmSync.stateRead().lastError });
  const maPhien = String(client.nen.FbmSync.stateRead().runId || '');
  const truocLa = client.dong.length;
  client.nen.FbmSync.logTransportError('Lỗi lưu cài đặt', 'save_connection');
  client.nen.FbmSync.logTransportError('Lỗi của vòng chạy cũ', 'sync_run', 'ma-phien-khac');
  check(so, 'Sidebar báo lỗi không kèm đúng mã phiên đang chạy: phiên giữ nguyên, mỗi lỗi một dòng Log nguồn sidebar đúng tên thao tác',
    [maPhien !== '', client.nen.FbmSync.stateRead().phase, client.dong.slice(truocLa).map((e) => e.source + '|' + e.action + '|' + e.reason)],
    [true, 'pull_customer', ['sidebar|save_connection|Lỗi lưu cài đặt', 'sidebar|sync_run|Lỗi của vòng chạy cũ']]);
  const truocClient = client.dong.length;
  client.nen.FbmSync.logTransportError('Extension không trả response', 'sync_run', maPhien);
  check(so, 'Sidebar báo lỗi khi phiên đang chạy: phiên chuyển error, bước đang chạy đóng với đúng lý do',
    [client.nen.FbmSync.stateRead().phase, client.dong.slice(truocClient).filter((e) => e.outcome === 'error').map((e) => e.detail.step).join(','), client.dong.slice(truocClient)[0].reason.indexOf('Extension không trả response') >= 0],
    ['error', 'pull_customer,run', true]);
  const truocLan2 = client.dong.length;
  client.nen.FbmSync.logTransportError('Extension không trả response', 'sync_run', maPhien);
  client.nen.FbmSync.logTransportError('Lỗi khác sau khi phiên đã dừng', 'sync_run', maPhien);
  check(so, 'Sidebar báo lỗi khi phiên đã lỗi: lỗi trùng không ghi lại, lỗi mới vẫn có một dòng Log',
    client.dong.slice(truocLan2).map((e) => e.outcome + '|' + e.reason), ['error|Sidebar báo lỗi phiên đồng bộ: Lỗi khác sau khi phiên đã dừng']);
  // FBM-009/FBM-020: lỗi theo bản ghi gom trong RAM, xả ra Sheet Log ở ranh giới lát, kể cả khi lát bị exception.
  const gom = dungState();
  napServer(gom.nen, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/SheetSave.js');
  const runIdGom = gom.st.runId;
  gom.nen.FbmSync.continue = () => {
    for (let i = 1; i <= 25; i += 1) { gom.nen.FbmSync.recordIssueAdd('pull', 'customer', 'xung đột', 'CUS-' + i, 'FBM và ShinCRM cùng đổi', 'conflict'); }
    gom.nen.FbmSync.recordIssueAdd('pull', 'activity', 'lỗi', 'ACT-1', 'Activity thiếu ngày làm việc hợp lệ.', 'error');
    throw new Error('Hỏng giữa lát');
  };
  const truocGom = gom.dong.length;
  try { gom.nen.FbmSync.controlDispatch('continue', { response: {} }); } catch (ignore) { /* lỗi gốc đã kiểm ở ca exception giữa lát */ }
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
  napServer(pf, 'fbm_sync/report/Report.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/report/PreflightPush.js');
  const pfIssues = [];
  for (let i = 1; i <= 3; i += 1) { pfIssues.push({ code: 'FBM_DUP_CODE', scope: 'customer', blocking: true, message: 'Trùng mã khách ALT0000' + i }); }
  pfIssues.push({ code: 'FBM_OWNER_MISSING', scope: 'activity', blocking: false, message: 'Thiếu người phụ trách ACT-9' });
  const pfDong = pf.FbmSync.logPreflight({ issues: pfIssues });
  check(so, 'preflight: mỗi mã vấn đề đúng một dòng Log, chặn ghi là error, cảnh báo là warn, giữ số lượng',
    [pfDong, pf.dong.map((e) => e.action + '|' + e.outcome + '|' + e.entity + '|' + e.detail.count)],
    [2, ['preflight_issue|error|customer|3', 'preflight_issue|warn|activity|1']]);
  // FBM-004: cửa ghi Sheet chặn trang pull thì phiên phải lỗi, không được tổng kết "Hoàn tất", cursor đứng nguyên trang đó.
  const ghi = dungState();
  napServer(ghi.nen, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/control/ControlPort.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  ghi.nen.FbmSync.SYNC_STATUS = { error: 'lỗi' };
  ghi.nen.FbmSync.canWriteSheet = () => true;
  ghi.nen.DATA_SCHEMA = {}; ghi.nen.SYNC_SCHEMA = {};
  ghi.nen.writeGateSave = () => ({ ok: false, invalid: [{ id: 'CUS-3', field: 'fbmCustomerCode', label: 'Mã KH FBM', reason: 'Đã có bản ghi khác mang mã kh fbm "ALT00010".' }] });
  ghi.nen.FbmSync.pullWrite = (entity, records) => { ghi.nen.FbmSync.recordChange(() => ({ save: [{ entity, records, source: 'pull' }] })); return { ok: true, written: records.length, conflicts: 0, skipped: 0, identityBlocks: [] }; };
  const cursorGhi = JSON.stringify(ghi.nen.FbmSync.stateRead().cursor || {});
  ghi.nen.FbmSync.continue = () => { ghi.nen.FbmSync.pullRecords('customer', [{ fbmId: 'C-3' }, { fbmId: 'C-4' }], 'read'); return { ok: true }; };
  const truocGhi = ghi.dong.length;
  let nemGhi = '';
  try { ghi.nen.FbmSync.controlDispatch('continue', { response: {} }); } catch (err) { nemGhi = err.code; }
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
