/**
 * Lượt đồng bộ đầy đủ đi hết GAS -> executor -> cửa ghi: kết thúc done không sinh Log theo bản ghi, nạp danh mục một lô, chi phí kho cố định theo lát và theo lô.
 */
const { section, check } = require('../../lib/assert');
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');
const { chayLuotDayDu } = require('../../lib/fbm/luot-day-du');

/**
 * Trần số lần gọi kho DocumentProperties của một lát Activity: nạp cả kho trước khóa, nạp lại trong khóa, ghi gộp, ghi trace (đo 2026-10-07 trước refactor: 83).
 * Cộng một lần đọc cờ dừng từ kho thật trước khi phát request: lệnh Dừng ghi cờ không cần khóa nên bản chụp trong khóa không thấy nó.
 * Lát kết thúc lượt cộng thêm một lệnh xóa mỗi khóa kho làm việc (`workStoreClear`; kho không xóa nhiều khóa một lần) và một lần đọc sổ bận.
 */
const FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX = 6;
const FBM_RUN_CLOSE_EXTRA_CALLS = 17;

async function chay(so) {
  section('FBM sync — pipeline Customer + Activity qua GAS, Extension và cửa ghi');
  const { fullFlow, fullLogs, fullWrites, fullLocal, fullStep, fullKinds } = await chayLuotDayDu(false);
  const fullFinal = fullFlow.hop.FbmSync.statusView();
  // Lượt có sổ bước nghiệp vụ: dòng tổng kết là dòng đóng bước "run", không còn dòng snapshot `slice`.
  const fullSummaryLog = fullLogs.filter((item) => item.action === 'sync_session_finished').slice(-1)[0] || {};
  const ui = taoSidebarDongBo();
  ui.hop.fbmSyncPaint(fullFinal);
  check(so, 'pipeline giả lập Customer + Activity đi qua GAS, Extension, cửa ghi và kết thúc; bản ghi thành công không sinh dòng Log theo bản ghi', [
    fullStep.ok, fullStep.request || null, fullFinal.phase, fullLocal.customer.length, fullLocal.activity.length,
    fullWrites.filter((item) => item.source === 'pull').length, fullKinds,
    fullLogs.filter((item) => /_record/.test(String(item.action || ''))).length,
    fullSummaryLog.cycleId === fullFinal.runId, fullSummaryLog.detail && fullSummaryLog.detail.result && fullSummaryLog.detail.result.written,
    ui.content.textContent.indexOf('Hoàn tất') >= 0
  ], [
    true, null, 'done', 2, 2, 2,
     ['session_probe:user', 'authorize:customer', 'authorize:activity', 'scan_job:customer', 'batch:activity', 'customer_count:customer'],
    0, true, 4, true
  ]);
  const checkRun = await chayLuotDayDu(false, 'check');
  check(so, '"Kiểm tra an toàn" nạp đủ 3 danh mục FBM trong một lô, một lần gọi GAS, trước khi đọc Customer',
    [checkRun.fullKinds.filter((kind) => kind.indexOf('completion:') === 0 || kind === 'batch:category'), checkRun.fullLookupFields, checkRun.fullKinds.indexOf('batch:category') < checkRun.fullKinds.indexOf('scan_job:customer')],
    [['batch:category'], [['crProvinceCity', 'crLeadSource', 'crJob']], true]);
  // Nhóm 1.3 (2A điểm 12): chiều Lấy không nạp danh mục FBM nên không có mã bị chặn vì FBM đổi tên; phép kiểm từng bản ghi bằng Sheet Category vẫn chặn mã lạ.
  const readCategoryState = fullFlow.hop.FbmSync.stateRead();
  const unknownGate = { map: {}, valid: { '@CAT_CONG_VIEC': { 'Gọi điện': true, CV1: true } }, blocked: {} };
  check(so, 'nhóm 1.3: lượt Lấy từ FBM → ShinCRM không phát request danh mục, không sinh mã danh mục bị chặn, mã lạ không có trong Category vẫn bị chặn theo từng bản ghi',
    [fullKinds.filter((kind) => kind.indexOf('completion:') === 0).length, (readCategoryState.metadata.categoryBlocks || []).length, fullFlow.hop.FbmSync.categoryGateCheck({ taskType: 'CV9' }, 'activity', unknownGate).length],
    [0, 0, 1]);
  const traced = await chayLuotDayDu(true), tracedActivityPropCalls = traced.fullActivityPropCalls;
  const lastActivitySlice = tracedActivityPropCalls.length - 1;
  check(so, 'đợt 1 bước A: mỗi lát Activity gọi kho DocumentProperties không quá ' + FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX + ' lần, lát kết thúc lượt cộng thêm ' + FBM_RUN_CLOSE_EXTRA_CALLS + ' lần (xóa kho làm việc, đọc sổ bận trong khóa) (trước refactor: 83)',
    [tracedActivityPropCalls.length >= 1, tracedActivityPropCalls.every((count, index) => count <= FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX + (index === lastActivitySlice ? FBM_RUN_CLOSE_EXTRA_CALLS : 0)), tracedActivityPropCalls], [true, true, tracedActivityPropCalls]);
  // Lô giao dịch: chi phí cố định của một lần gọi GAS không tăng theo số khách trong lô.
  const lo5 = await chayLuotDayDu(true, 'read', { customers: 5 }), lo50 = await chayLuotDayDu(true, 'read', { customers: 50 });
  const chiPhiLo = (run) => [run.fullActivitySheetReads.length, run.fullActivitySheetReads[0].reads, run.fullActivitySheetReads[0].writes, run.fullActivityPropCalls[0]];
  check(so, 'lô 5 khách và lô 50 khách: cùng một lần gọi GAS cho cả lô, cùng số lần đọc mỗi Sheet, cùng số lần ghi Sheet, cùng số lần gọi kho; lô 50 khách gồm một phần tử đọc thông tin khách và 50 phần tử giao dịch',
    [chiPhiLo(lo5), lo5.fullLocal.activity.length, lo50.fullLocal.activity.length, lo50.fullBatches.length, lo50.fullBatches[0].items.length, lo50.fullStep.status.phase], [chiPhiLo(lo50), 5, 50, 1, 51, 'done']);
}

module.exports = { chay };
