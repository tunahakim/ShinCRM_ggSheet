/** Bước đếm khách cuối lượt: FBM không đổi thì lượt kết thúc sau một request đếm; số khách đổi hoặc chưa có mốc thì chạy đúng một lượt Quét nhanh rồi dừng. */
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

const dem = (h, kind) => h.trace.kinds.filter((item) => item === kind).length;

async function chay(so) {
  section('fbmSync — Bước đếm khách cuối lượt');

  const khongDoi = scanHarness({ customers: 12 });
  const ketThuc = await khongDoi.run({ pack: 'quick' });
  check(so, 'FBM không đổi: sau Quét nhanh chỉ một request đếm, số đếm khớp mốc vừa ghi và lượt kết thúc, không quét lại', [
    ketThuc.status.phase, dem(khongDoi, 'scan_job'), dem(khongDoi, 'customer_count'), khongDoi.trace.kinds[khongDoi.trace.kinds.length - 1], khongDoi.F.customerBaselineRead(), khongDoi.logs.filter((item) => item.action === 'customer_count_changed').length
  ], ['done', 1, 1, 'customer_count', 12, 0]);

  const tang = scanHarness({ customers: 12 });
  let daThem = false;
  const sauTang = await tang.run({ pack: 'quick', beforeSend: (request) => { if (request.meta.kind === 'customer_count' && !daThem) { daThem = true; tang.themKhach(13); } } });
  check(so, 'Lượt chạy tay, tổng khách FBM tăng giữa hai lần đếm: Sidebar hiện "Số khách FBM vừa đổi, quét thêm một lần...", chạy thêm đúng một Quét nhanh, nhận khách mới, đếm lại khớp rồi dừng', [
    tang.F.stateRead().origin, tang.trace.statuses.some((status) => status && status.message === 'Số khách FBM vừa đổi, quét thêm một lần...'),
    sauTang.status.phase, dem(tang, 'scan_job'), dem(tang, 'customer_count'), tang.local.customer.length, tang.F.customerBaselineRead(), tang.logs.filter((item) => item.action === 'customer_count_changed').length
  ], ['manual', true, 'done', 2, 2, 13, 13, 1]);

  const chuaMoc = scanHarness({ customers: 12 });
  await chuaMoc.run({ pack: 'quick' });
  chuaMoc.F.props().deleteProperty(chuaMoc.F.CUSTOMER_BASELINE_KEY);
  chuaMoc.trace.kinds.length = 0;
  const sauBulk = await chuaMoc.run({ startOptions: { scan: 'activity_bulk' } });
  const sauLop1 = chuaMoc.trace.kinds.slice(chuaMoc.trace.kinds.indexOf('scan_job:activity') + 1);
  check(so, 'Chưa có số khách mốc: lượt lấy toàn bộ giao dịch đếm xong thì chạy Quét nhanh để lấy mốc, đếm lại khớp rồi dừng', [
    sauBulk.status.phase, sauLop1[0], dem(chuaMoc, 'scan_job'), dem(chuaMoc, 'customer_count'), chuaMoc.F.customerBaselineRead()
  ], ['done', 'customer_count', 1, 2, 12]);
}

module.exports = { chay };
