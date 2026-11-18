/**
 * Phân trang theo khóa của FBM (khách nhiều trang, khách nhiều giao dịch, FBM bỏ qua khóa), cột lệch tiêu đề, chạy lại cùng lô không trùng dòng và đường truyền đứt ở lô đọc giao dịch được gửi lại đúng lô.
 */
const { section, check } = require('../../lib/assert');
const { chayLuotDayDu, LOI_HTTP_500, khoaLoGiaoDich } = require('../../lib/fbm/luot-day-du');

async function chay(so) {
  section('FBM sync — phân trang, cột lệch và đường truyền đứt');
  const nhieuTrang = await chayLuotDayDu(false, 'read', { customers: 120, scanCustomerRows: 50 });
  check(so, 'quét toàn bộ nhiều trang Customer: số trang tăng dần, khóa trang đúng dạng FBM, ghi đủ khách và giao dịch, phiên kết thúc done; chưa biết tên cột giao dịch thì chỉ các khách của lô đầu xin tiêu đề, các lô sau đọc trang không tiêu đề', [
    nhieuTrang.activityItemTypes.filter((type) => type === 0).length === nhieuTrang.fullBatches[0].items.length - 1, nhieuTrang.activityItemTypes.length, nhieuTrang.customerPageIndexes, nhieuTrang.fullLocal.customer.length, nhieuTrang.fullLocal.activity.length, nhieuTrang.fullStep.status.phase, nhieuTrang.fullStep.status.lastFailureCode || ''
  ], [true, 120, [[-1, -1], [1, 0], [2, 1]], 120, 120, 'done', '']);
  check(so, 'lô đọc chi tiết: gói đầu việc quét mang tên cột gốc nên không lô nào của lượt xin lại tiêu đề cột khách, vẫn ghi đủ khách', [
    nhieuTrang.customerItemTypes.filter((type) => type === 0).length, nhieuTrang.customerItemTypes.length > 1, nhieuTrang.fullLocal.customer.length
  ], [0, true, 120]);
  const lechCotKhach = await chayLuotDayDu(false, 'read', { customers: 120, scanCustomerRows: 50, cutCustomerColumn: true });
  check(so, 'phần đọc khách không tiêu đề có số cột khác tiêu đề đã lưu: dừng phiên FBM_GRID_SHAPE_CHANGED, Log báo, không ghi thêm khách nào sau lô đầu', [
    lechCotKhach.fullStep.status.phase, lechCotKhach.fullStep.status.lastFailureCode, lechCotKhach.fullLogs.some((event) => event.action === 'activity_batch_mismatch' && event.detail.code === 'FBM_GRID_SHAPE_CHANGED'), lechCotKhach.fullLocal.customer.length < 120
  ], ['error', 'FBM_GRID_SHAPE_CHANGED', true, true]);
  const tieuDeLoi = await chayLuotDayDu(false, 'read', { customers: 5, failing: { 'FBM-C1': LOI_HTTP_500 } });
  check(so, 'khách đầu lô lỗi khi lô còn xin tiêu đề: mỗi khách tự mang tiêu đề nên các khách còn lại đọc xong ngay trong lô đó, không xếp lại lô sau, đủ giao dịch của khách còn lại', [
    tieuDeLoi.fullBatches.map(khoaLoGiaoDich), tieuDeLoi.activityItemTypes, tieuDeLoi.fullLocal.activity.map((item) => item.fbmId).sort(), tieuDeLoi.fullStep.status.phase
  ], [[['FBM-C1', 'FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5']], [0, 0, 0, 0], ['FBM-A2', 'FBM-A3', 'FBM-A4', 'FBM-A5'], 'done']);
  // Khách C2 có 1.200 giao dịch: lô đầu đọc 1.000 dòng, lô sau chỉ xin trang kế của riêng C2. Sheet có sẵn giao dịch 900005 (nằm ở trang đầu) và 777777 (FBM không còn) dưới khách C2 (CUS-000002).
  const coSan = [{ id: 'ACT-000501', fbmId: '900005', customerId: 'CUS-000002', recordStatus: 'active', syncStatus: 'đã đồng bộ' }, { id: 'ACT-000502', fbmId: '777777', customerId: 'CUS-000002', recordStatus: 'active', syncStatus: 'đã đồng bộ' }];
  const haiTrang = await chayLuotDayDu(false, 'read', { customers: 3, manyActivities: { 'FBM-C2': 1200 }, localActivity: coSan.map((item) => Object.assign({}, item)) });
  const trangGd = (run) => run.fullBatches.map((batch) => batch.items.slice(1).map((item) => [item.body.externalKey[0].Value, item.body.gridPageIndex]));
  const vang = (run) => run.fullLocal.activity.filter((item) => item.syncStatus === 'không thấy bên FBM').map((item) => item.fbmId);
  check(so, 'khách có 1.200 giao dịch: đọc 2 trang (lô sau chỉ xin trang kế của riêng khách đó), ghi đủ 1.200 giao dịch, không báo lỗi khách, giao dịch thấy ở trang đầu không bị coi là vắng khi đọc trang sau, giao dịch FBM không còn thì bị gắn cờ', [
    trangGd(haiTrang), haiTrang.fullLocal.activity.filter((item) => /^9\d{5}$/.test(item.fbmId)).length, haiTrang.fullStep.status.phase, (haiTrang.fullStep.status.metadata.customerErrors || { total: 0 }).total, vang(haiTrang)
  ], [[[['FBM-C1', -1], ['FBM-C2', -1], ['FBM-C3', -1]], [['FBM-C2', 1]]], 1200, 'done', 0, ['777777']]);
  const lapTrang = await chayLuotDayDu(false, 'read', { customers: 3, manyActivities: { 'FBM-C2': 1200 }, ignoreActivityKey: true, localActivity: coSan.map((item) => Object.assign({}, item)) });
  check(so, 'FBM bỏ qua khóa trang và trả lại đúng trang đã đọc: báo lỗi khách FBM_ACTIVITY_PAGE_STUCK, không xin lặp, ghi phần đã đọc, không gắn cờ vắng cho giao dịch của khách đó', [
    trangGd(lapTrang), lapTrang.fullLocal.activity.filter((item) => /^9\d{5}$/.test(item.fbmId)).length, lapTrang.fullStep.status.phase, lapTrang.fullStep.status.metadata.customerErrors.recent.map((item) => item.code), vang(lapTrang)
  ], [[[['FBM-C1', -1], ['FBM-C2', -1], ['FBM-C3', -1]], [['FBM-C2', 1]]], 1000, 'done', ['FBM_ACTIVITY_PAGE_STUCK'], []]);
  const lechCot = await chayLuotDayDu(false, 'read', { customers: 5, cutColumn: 'FBM-C3' });
  check(so, 'trang không tiêu đề có số cột khác tiêu đề đã lưu: dừng phiên FBM_GRID_SHAPE_CHANGED, không ghi giao dịch nào, Sidebar và Log đều báo', [
    lechCot.fullLocal.activity.length, lechCot.fullStep.status.phase, lechCot.fullStep.status.lastFailureCode, lechCot.fullStep.status.message.indexOf('số cột khác 11 cột') >= 0,
    lechCot.fullLogs.some((event) => event.action === 'activity_batch_mismatch' && event.detail.code === 'FBM_GRID_SHAPE_CHANGED')
  ], [0, 'error', 'FBM_GRID_SHAPE_CHANGED', true, true]);
  // Chạy lại: ghi lại cùng lô không tạo dòng trùng; mất tab giữa lượt thì lượt mới quét lại từ đầu, không đánh vắng mặt nhầm.
  const chayLai = await chayLuotDayDu(false, 'read', { customers: 5, rounds: 2 });
  const matTab = await chayLuotDayDu(false, 'read', { customers: 5, rounds: 2, loseTab: true });
  const matMotLan = await chayLuotDayDu(false, 'read', { customers: 5, loseTab: 1 });
  const daDanhVang = (run) => run.fullLocal.activity.concat(run.fullLocal.customer).filter((item) => item.syncStatus === 'không thấy bên FBM').length;
  check(so, 'chạy lại cùng lô không tạo dòng trùng; lô đọc cứ đứt đường truyền thì mỗi lần GAS hỏi phiên rồi gửi lại, chạm trần gửi lại của lượt thì lượt đó dừng lỗi (lượt đầu 4 lô = 1 + 3 lần gửi lại, lượt sau 1 lô), lượt sau quét lại cả lượt, không trùng dòng và không đánh vắng mặt nhầm', [
    chayLai.fullLocal.customer.length, chayLai.fullLocal.activity.length, daDanhVang(chayLai), chayLai.fullStep.status.phase,
    matTab.fullStatuses.some((status) => status && status.phase === 'error'), matTab.fullLocal.customer.length, matTab.fullLocal.activity.length, daDanhVang(matTab), matTab.fullStep.status.phase, matTab.fullBatches.length
  ], [5, 5, 0, 'done', true, 5, 5, 0, 'done', 5]);
  check(so, 'đường truyền đứt một lần ở lô đọc giao dịch: GAS gửi lại đúng lô đó (cùng các khách) một lần, lượt đi tiếp đến xong, đủ khách và giao dịch, Log ghi lần gửi lại, đếm 1 lần vào trần gửi lại của lượt', [
    matMotLan.fullStep.status.phase, matMotLan.fullBatches.length, JSON.stringify(matMotLan.fullBatches[0].items.map((item) => item.body)) === JSON.stringify(matMotLan.fullBatches[1].items.map((item) => item.body)), matMotLan.fullBatches[0].id !== matMotLan.fullBatches[1].id,
    matMotLan.fullLocal.customer.length, matMotLan.fullLocal.activity.length, matMotLan.fullLogs.filter((event) => event.action === 'transport_retry').length, matMotLan.fullFlow.hop.FbmSync.stateRead().metadata.transportReplays
  ], ['done', 2, true, true, 5, 5, 1, 1]);
}

module.exports = { chay };
