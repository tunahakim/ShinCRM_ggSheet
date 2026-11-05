/** So ba bản khi kéo khách: hash không đổi thì không ghi, chỉ FBM đổi thì kéo nội dung, chỉ ShinCRM đổi thì không đè, xung đột chỉ ghi trạng thái và một dòng Log. */
const { section, check } = require('../../lib/assert');
const { keoVe } = require('../../lib/fbm/keo-ve');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — So ba bản khi kéo khách');
  const builders = hopKeoVe();
  const gate = congDanhMucThu();
  builders.FbmSync.readCategoryGate = () => gate;
  let reconcileWrite;
  const reconcileIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'Gốc' }, gate);
  const reconcileLocal = Object.assign({}, reconcileIncoming, { id: 'CUS-REC', syncStatus: builders.FbmSync.SYNC_STATUS.synced });
  reconcileLocal.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = () => [reconcileLocal];
  builders.writeGateSave = (request) => { reconcileWrite = request; return { ok: true }; };
  const unchangedResult = keoVe(builders.FbmSync, 'customer', [reconcileIncoming]);
  check(so, 'ba hash khong doi khong ghi noi dung', [unchangedResult.written, reconcileWrite], [0, undefined]);
  builders.FbmSync.readLocal = () => [Object.assign({}, reconcileLocal, { fbmHash: '' })];
  const healedResult = keoVe(builders.FbmSync, 'customer', [reconcileIncoming]);
  check(so, 'baseline rong tu lanh chi ghi hash',
    [healedResult.written, reconcileWrite.records[0].fbmHash !== '', reconcileWrite.records[0].companyName],
    [0, true, undefined]);
  const fbmChanged = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'FBM đổi' }, gate);
  builders.FbmSync.readLocal = () => [reconcileLocal];
  const fbmChangedResult = keoVe(builders.FbmSync, 'customer', [fbmChanged]);
  check(so, 'chi FBM doi thi pull noi dung',
    [fbmChangedResult.written, reconcileWrite.records[0].companyName],
    [1, 'FBM đổi']);
  const shinChanged = Object.assign({}, reconcileLocal, { companyName: 'Shin đổi' });
  shinChanged.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.readLocal = () => [shinChanged];
  const shinChangedResult = keoVe(builders.FbmSync, 'customer', [reconcileIncoming]);
  check(so, 'chi ShinCRM doi thi khong pull de',
    [shinChangedResult.written, reconcileWrite.records[0].syncStatus],
    [0, builders.FbmSync.SYNC_STATUS.pending]);
  let conflictState = { metadata: {}, counts: { conflict: 0 } }, conflictWrite, conflictLog = [];
  builders.LOG_CONFLICT = 'conflict';
  builders.logEvent = (event) => { conflictLog.push(event); };
  builders.FbmSync.stateRead = () => conflictState;
  builders.FbmSync.stateWrite = (next) => { conflictState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-2', fbmId: 'C-2', fbmCustomerCode: 'ALT99999', companyName: 'Shin', fbmHash: builders.FbmSync.hash({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'Base' }, 'customer', gate) }];
  builders.writeGateSave = (request) => { conflictWrite = request; return { ok: true }; };
  builders.FbmSync.recordIssues = {};
  const conflictResult = keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'FBM' }, gate)]);
  check(so, 'conflict chỉ ghi trạng thái xung đột chờ quyết, không ghi nội dung FBM và không cất diff vào state',
    [conflictResult.conflicts, 'conflicts' in conflictState.metadata, conflictWrite.records[0].syncStatus, conflictWrite.records[0].companyName],
    [1, false, builders.FbmSync.SYNC_STATUS.conflict, undefined]);
  builders.FbmSync.recordIssuesFlush();
  const conflictEntries = conflictLog.filter((event) => event.action === 'pull_record_issue');
  check(so, 'conflict theo bản ghi có đúng một dòng Log gom ở ranh giới lát, mang mã bản ghi và trạng thái xung đột',
    [conflictEntries.length, conflictEntries[0] && conflictEntries[0].outcome, conflictEntries[0] && conflictEntries[0].recordId, conflictEntries[0] && conflictEntries[0].detail.status],
    [1, 'conflict', 'CUS-2', builders.FbmSync.SYNC_STATUS.conflict]);

  return so;
}

module.exports = { chay };
