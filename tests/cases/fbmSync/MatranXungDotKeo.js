/** Ma trận xung đột phía kéo về (FBM-024): chỉ ghi trạng thái lên Sheet, so lại mỗi kỳ, gỡ xung đột, cộng bộ đếm sau lượt lấy về, cờ không thấy bên FBM. */
const { section, check } = require('../../lib/assert');
const { makeSync } = require('../../lib/fbm/hang-day');
const { keoVe, keoLo } = require('../../lib/fbm/keo-ve');
const { ungVienDay } = require('../../lib/fbm/buoc-day');
const { NO_CATEGORY, CONG_HA_NOI, dongKhachFbm, dungXungDot } = require('../../lib/fbm/ma-tran');

async function chay(so) {
  section('FBM sync — ma trận xung đột khi kéo về (FBM-024)');
  const cfIds = [1, 2, 3];
  const { run: cf, F: CF, pull: cfPull } = dungXungDot(cfIds);
  const cfAfterPull = CF.stateRead();
  check(so, 'FBM-024: pull gặp xung đột chỉ ghi trạng thái "xung đột chờ quyết" lên Sheet; state không giữ danh sách hay giá trị hai bên',
    [cfPull.conflicts, cf.local.customer.map((row) => row.syncStatus), cf.local.customer.map((row) => row.companyName), 'conflicts' in cfAfterPull.metadata, Object.keys(cfAfterPull.locks || {}).length],
    [3, ['xung đột chờ quyết', 'xung đột chờ quyết', 'xung đột chờ quyết'], ['Tên Shin 1', 'Tên Shin 2', 'Tên Shin 3'], false, 0]);
  const cfRepull = keoVe(CF, 'customer', cfIds.map((n) => CF.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, 'Tên FBM khác ' + n), NO_CATEGORY)));
  check(so, 'FBM-024: pull lần sau so lại dòng đang xung đột chờ quyết; còn xung đột thì giữ nguyên, không ghi đè, không cộng vào số chờ quyết nhưng vẫn báo là xung đột, không tính Bỏ qua',
    [cfRepull.conflicts, cfRepull.conflictsKept, cfRepull.skipped, cf.local.customer.map((row) => row.companyName), cf.local.customer[0].syncStatus], [0, 3, 0, ['Tên Shin 1', 'Tên Shin 2', 'Tên Shin 3'], 'xung đột chờ quyết']);
  CF.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Le Tuan Anh', userId: '2037', customerPrefix: 'ALT', customerCodeLength: 8 });
  check(so, 'FBM-024: dòng đang xung đột chờ quyết không vào danh sách đẩy', ungVienDay(CF, 'customer').length, 0);

  // Xung đột không khóa đồng bộ: mỗi kỳ pull so ba chiều lại với baseline cũ. Bốn khách: FBM đổi cho khớp ShinCRM, FBM quay về gốc, ShinCRM quay về gốc, vẫn khác nhau.
  const rv = makeSync(), RV = rv.hop.FbmSync;
  const rvState = RV.runOpen({ phase: 'pull_customer' });
  rvState.mode = 'read'; RV.readCategoryGate = () => CONG_HA_NOI; RV.stateWrite(rvState);
  const rvIds = [1, 2, 3, 4];
  keoVe(RV, 'customer', rvIds.map((n) => RV.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, 'Tên gốc ' + n), NO_CATEGORY)));
  const rvBase = rv.local.customer.map((row) => row.fbmHash);
  rv.local.customer.forEach((row) => { row.companyName = 'Tên Shin ' + row.fbmCustomerCode.slice(-1); });
  keoVe(RV, 'customer', rvIds.map((n) => RV.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, 'Tên FBM ' + n), NO_CATEGORY)));
  rv.local.customer[2].companyName = 'Tên gốc 3';
  const rvFbm = ['Tên Shin 1', 'Tên gốc 2', 'Tên FBM 3', 'Tên FBM khác 4'];
  const rvPull = keoVe(RV, 'customer', rvIds.map((n) => RV.customerRecord(dongKhachFbm('F-' + n, 'ALT0000' + n, rvFbm[n - 1]), NO_CATEGORY)));
  check(so, 'Xung đột được so lại mỗi kỳ: khớp nhau thì đã đồng bộ, FBM về gốc thì chờ đẩy, ShinCRM về gốc thì lấy FBM, còn khác thì vẫn xung đột; ba dòng gỡ được trừ khỏi số chờ quyết, dòng chờ đẩy không tính Bỏ qua',
    [rv.local.customer.map((row) => row.syncStatus), rv.local.customer.map((row) => row.companyName), rvPull.conflicts, rvPull.conflictsKept, rvPull.conflictsCleared, rvPull.skipped],
    [['đã đồng bộ', 'chờ đối soát', 'đã đồng bộ', 'xung đột chờ quyết'], ['Tên Shin 1', 'Tên Shin 2', 'Tên FBM 3', 'Tên Shin 4'], 0, 1, 3, 0]);
  const rvFlow = makeSync(), RVF = rvFlow.hop.FbmSync;
  RVF.pullPageApply = () => ({ ok: true, written: 2, conflicts: 1, conflictsKept: 2, conflictsCleared: 3, skipped: 0, identityBlocks: [] });
  const rvFlowState = RVF.runOpen({ phase: 'pull_customer' });
  rvFlowState.mode = 'read'; rvFlowState.metadata.conflictCount = 5; RVF.stateWrite(rvFlowState);
  keoLo(RVF, 'customer', [{}], 'write');
  const rvFlowAfter = RVF.stateRead();
  check(so, 'Sau lượt lấy về: ô Xung đột của phiên cộng xung đột mới và dòng vẫn xung đột; số chờ quyết trên Sidebar cộng mới, trừ dòng đã gỡ',
    [rvFlowAfter.counts.conflict, rvFlowAfter.metadata.conflictCount], [3, 3]);
  const fl = makeSync(), FL = fl.hop.FbmSync;
  fl.local.activity.push({ id: 'ACT-000001', fbmId: '700001', workDate: '2026-09-19', recordStatus: 'active', syncStatus: 'xung đột chờ quyết' });
  const flState = FL.stateRead();
  flState.counts = FL.countsDefault(); flState.metadata.conflictCount = 1;
  const flWritten = FL.gateFlagWrite(flState, 'activity', [{ record: fl.local.activity[0], status: FL.SYNC_STATUS.missing, reason: 'thử' }]);
  check(so, 'Giao dịch đang xung đột chờ quyết mà FBM đã xóa vẫn nhận cờ không thấy bên FBM, rời hàng đợi xung đột và được đếm',
    [flWritten, fl.local.activity[0].syncStatus, flState.counts.missingActivity, flState.metadata.conflictCount], [1, FL.SYNC_STATUS.missing, 1, 0]);
  check(so, 'Gỡ xung đột ghi baseline mới bằng hash FBM khi hai phía khớp hoặc lấy FBM; FBM về gốc và dòng còn xung đột giữ baseline cũ',
    [rv.local.customer[0].fbmHash !== rvBase[0], rv.local.customer[1].fbmHash === rvBase[1], rv.local.customer[2].fbmHash !== rvBase[2], rv.local.customer[3].fbmHash === rvBase[3]], [true, true, true, true]);
  check(so, 'Dòng xung đột chờ quyết luôn được đọc lại từ FBM, kể cả khi FBM đã quay về gốc nên danh sách không lộ thay đổi',
    RV.readAgainStatus({ syncStatus: 'xung đột chờ quyết' }),
    true);
}

module.exports = { chay };
