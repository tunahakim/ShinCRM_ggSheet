/** Vòng xoay: đọc giao dịch của đủ N khách trên Sheet theo số CUS, theo lô, nối tiếp phiên trước và quay vòng; cursor bền chỉ đi qua lô đã ghi xong. */
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

/** Sheet có 12 khách sau một lượt Quét nhanh; lô Vòng xoay 2 khách để thấy rõ việc chia lô. */
async function vongHarness() {
  const h = scanHarness({ customers: 12, budget: { activityBatchCustomers: 2 } });
  await h.run();
  const fbmOf = (cus) => h.local.customer.find((item) => item.id === 'CUS-' + String(cus).padStart(6, '0')).fbmId;
  /** Một phiên Vòng xoay N khách; trả danh sách số CUS đã đọc giao dịch theo đúng thứ tự gửi. */
  async function xoay(n, hooks) {
    h.trace.activityCustomers.length = 0; h.trace.kinds.length = 0;
    const end = await h.run(Object.assign({ startOptions: { origin: 'background', scan: 'detail', detail: { customersPerRun: n } } }, hooks || {}));
    const cusOf = {};
    h.local.customer.forEach((item) => { cusOf[item.fbmId] = Number(String(item.id).slice(4)); });
    return { doc: h.trace.activityCustomers.map((key) => cusOf[key]), end };
  }
  return Object.assign(h, { fbmOf, xoay });
}

async function chay(so) {
  section('fbmSync — Vòng xoay giao dịch');

  const deu = await vongHarness();
  const mot = await deu.xoay(5);
  check(so, 'Vòng xoay 5 khách, lô 2 khách: đọc đúng CUS 1–5 theo thứ tự trong 3 lô, không đọc danh sách khách FBM, cursor dừng ở CUS 5, tiến trình 5/5', [
    mot.doc, deu.trace.kinds.filter((kind) => kind === 'batch').length, deu.trace.kinds.indexOf('scan_job') < 0, deu.F.detailCursorRead(), deu.F.stateRead().progress, mot.end.status.phase
  ], [[1, 2, 3, 4, 5], 3, true, 5, { done: 5, total: 5 }, 'done']);
  const hai = await deu.xoay(5), ba = await deu.xoay(5);
  check(so, 'Phiên sau nối tiếp từ CUS 6; hết danh sách thì quay về CUS nhỏ nhất và vẫn đọc đủ 5 khách', [hai.doc, ba.doc, deu.F.detailCursorRead()], [[6, 7, 8, 9, 10], [11, 12, 1, 2, 3], 3]);

  // Khách không đủ điều kiện bị bỏ qua mà không trừ vào N: thiếu mã FBM, đã xóa, mang cờ "không thấy bên FBM", không cho phép lấy về.
  const loc = await vongHarness();
  loc.local.customer.forEach((item) => {
    const cus = Number(String(item.id).slice(4));
    if (cus === 2) { item.fbmId = ''; }
    if (cus === 3) { item.recordStatus = 'deleted'; }
    if (cus === 4) { item.syncStatus = loc.F.SYNC_STATUS.missing; }
    item.fbmSyncPermission = cus === 6 ? 'Chờ đồng bộ' : 'Cho phép';
  });
  const locDoc = await loc.xoay(5);
  check(so, 'Khách thiếu mã FBM, đã xóa, không thấy bên FBM hoặc "Chờ đồng bộ" bị bỏ qua; Vòng xoay vẫn đọc đủ 5 khách đủ điều kiện', locDoc.doc, [1, 5, 7, 8, 9]);

  // Lỗi giữa lô: cursor bền chỉ ghi khi cả lô đã ghi xong, phiên sau đọc lại đúng lô hỏng và vẫn đủ N khách.
  const loi = await vongHarness();
  await loi.xoay(5);
  const hong = loi.fbmOf(8);
  let daHong = false;
  const loiDoc = await loi.xoay(5, { fail: (request) => { if (daHong || request.meta.kind !== 'batch' || JSON.stringify(request).indexOf(hong) < 0) { return ''; } daHong = true; return 'SYNC_TRANSPORT_FAILED'; } });
  const cursorSauLoi = loi.F.detailCursorRead(), phaseSauLoi = loi.F.stateRead().phase;
  const sau = await loi.xoay(5);
  check(so, 'Lỗi vận chuyển ở lô chứa CUS 8: phiên dừng lỗi, cursor giữ CUS 7; phiên sau đọc lại từ CUS 8 và đủ 5 khách', [loiDoc.doc.indexOf(9) < 0, phaseSauLoi, cursorSauLoi, sau.doc], [true, 'error', 7, [8, 9, 10, 11, 12]]);
}

module.exports = { chay };
