/**
 * Lô đọc giao dịch gặp lỗi giữa lượt: một khách lỗi không chặn khách khác, phần tử nghi phiên không ghi cả lô, lô lệch kế hoạch (id lạ, thiếu phần tử, yêu cầu khách chung hỏng) đóng lượt lỗi và không ghi gì.
 */
const { section, check } = require('../../lib/assert');
const { taoSidebarDongBo } = require('../../lib/sidebar/bo-dong-bo');
const { chayLuotDayDu, LOI_HTTP_500, khoaLoGiaoDich } = require('../../lib/fbm/luot-day-du');

async function chay(so) {
  section('FBM sync — lô giao dịch lỗi giữa lượt');
  // Một khách lỗi HTTP giữa lô: khách khác vẫn ghi; giao dịch đã có của khách lỗi không bị đánh "không thấy bên FBM" vì chưa được quét.
  const giaoDichCu = { id: 'ACT-000099', fbmId: 'FBM-A3', recordStatus: 'active', syncStatus: 'đã đồng bộ' };
  const coKhachLoi = await chayLuotDayDu(false, 'read', { customers: 5, failing: { 'FBM-C3': LOI_HTTP_500 }, localActivity: [giaoDichCu] });
  const khachLoiStatus = coKhachLoi.fullFlow.hop.FbmSync.statusView(), khachLoiLog = coKhachLoi.fullLogs.find((event) => event.action === 'activity_customer_failed') || {};
  const khachLoiUi = taoSidebarDongBo();
  const khachLoiTheLoi = JSON.stringify(khachLoiUi.hop.fbmSyncRecordIssueBlocks(khachLoiStatus.metadata));
  check(so, 'khách lỗi giữa lô: các khách khác vẫn ghi, lượt kết thúc "done" kèm số khách lỗi, Log và Sidebar có mã khách, lượt không đánh giao dịch "không thấy bên FBM"', [
    khachLoiStatus.phase, coKhachLoi.fullLocal.activity.filter((item) => item.fbmId !== 'FBM-A3').map((item) => item.fbmId).sort(), (coKhachLoi.fullLocal.activity.find((item) => item.id === 'ACT-000099') || {}).syncStatus,
    khachLoiLog.detail && khachLoiLog.detail.customer, khachLoiLog.detail && khachLoiLog.detail.status, String(khachLoiLog.reason || '').indexOf('Lỗi máy chủ FBM') >= 0,
    khachLoiStatus.metadata.customerErrors.total,
    khachLoiStatus.message.indexOf('1 khách lỗi khi đọc giao dịch') >= 0, khachLoiTheLoi.indexOf('Khách lỗi giao dịch ALT00003') >= 0
  ], ['done', ['FBM-A1', 'FBM-A2', 'FBM-A4', 'FBM-A5'], 'đã đồng bộ', 'ALT00003', 500, true, 1, true, true]);
  // Một phần tử nghi phiên (401) giữa lô: cả lô không ghi, đi probe; cursor giữ nguyên nên dựng lại đúng lô.
  const nghiPhien = await chayLuotDayDu(false, 'read', { customers: 5, failing: { 'FBM-C3': { ok: false, status: 401, headers: {}, body: '' } } });
  const nghiState = nghiPhien.fullFlow.hop.FbmSync.stateRead();
  check(so, 'phần tử nghi phiên giữa lô: không ghi giao dịch nào của lô, probe thấy phiên sống thì gửi lại đúng lô cũ một lần, lại nghi thì dừng SESSION_SUSPECTED_LIVE', [
    nghiPhien.fullWrites.filter((item) => item.entity === 'activity').length, nghiPhien.fullKinds.slice(-4), nghiState.phase, nghiState.lastFailureCode,
    nghiPhien.fullBatches.length, khoaLoGiaoDich(nghiPhien.fullBatches[1])
  ], [0, ['batch:activity', 'session_probe:user', 'batch:activity', 'session_probe:user'], 'error', 'SESSION_SUSPECTED_LIVE', 2, khoaLoGiaoDich(nghiPhien.fullBatches[0])]);
  // Response lô lệch kế hoạch: id lạ hay thiếu phần tử (Extension dừng vì trần dung lượng) đều là lỗi hợp đồng cả lô, vì thiếu phần tử thì không biết khách nào vắng thật.
  const idLa = await chayLuotDayDu(false, 'read', { customers: 5, editBatch: (raw) => Object.assign(raw, { items: raw.items.map((item, index) => index === 1 ? Object.assign({}, item, { id: '99' }) : item) }) });
  const idLaState = idLa.fullFlow.hop.FbmSync.stateRead();
  const thieu = await chayLuotDayDu(false, 'read', { customers: 5, editBatch: (raw, lan) => lan === 1 ? Object.assign(raw, { items: raw.items.slice(0, 3) }) : raw });
  check(so, 'lô có id lạ hoặc thiếu phần tử thì dừng phiên FBM_BATCH_ITEM_MISMATCH, không ghi khách hay giao dịch nào, Log ghi', [
    idLaState.phase, idLaState.lastFailureCode, idLa.fullWrites.filter((item) => item.entity === 'activity').length, idLa.fullLogs.some((event) => event.action === 'activity_batch_mismatch'),
    thieu.fullBatches.map(khoaLoGiaoDich), thieu.fullLocal.customer.length + thieu.fullLocal.activity.length, thieu.fullStep.status.phase, thieu.fullStep.status.lastFailureCode
  ], ['error', 'FBM_BATCH_ITEM_MISMATCH', 0, true, [['FBM-C1', 'FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5']], 0, 'error', 'FBM_BATCH_ITEM_MISMATCH']);
  // Yêu cầu đọc khách chung của lô hỏng (HTTP 500): sự cố của FBM hoặc phiên, không phải lỗi từng khách; dừng cả lô một dòng Log, ô lượt không giữ danh sách khách lỗi.
  const khachChungLoi = await chayLuotDayDu(false, 'read', { customers: 5, editBatch: (raw, lan) => lan === 1 ? Object.assign(raw, { items: raw.items.map((item, index) => index === 0 ? Object.assign({}, item, { ok: false, status: 500, body: LOI_HTTP_500.body }) : item) }) : raw });
  const khachChungState = khachChungLoi.fullFlow.hop.FbmSync.stateRead();
  check(so, 'yêu cầu đọc khách chung của lô hỏng: lượt đóng lỗi, không ghi giao dịch, một dòng activity_batch_mismatch, không dòng activity_customer_failed nào', [
    khachChungState.phase, khachChungLoi.fullWrites.filter((item) => item.entity === 'activity').length, khachChungLoi.fullLogs.filter((event) => event.action === 'activity_batch_mismatch').length, khachChungLoi.fullLogs.filter((event) => event.action === 'activity_customer_failed').length, !!(khachChungState.metadata.customerErrors)
  ], ['error', 0, 1, 0, false]);
}

module.exports = { chay };
