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

  // Request đếm chỉ cần tổng: không xin tiêu đề cột (nặng hơn cả response), Extension chỉ giữ tổng.
  const hinh = scanHarness({ customers: 12 });
  let demGui = null;
  await hinh.run({ pack: 'quick', beforeSend: (request) => { if (request.meta.kind === 'customer_count') { demGui = request; } } });
  check(so, 'request đếm không xin tiêu đề cột (type 1, trang đầu không tiêu đề) và chỉ giữ tổng (meta.keep rỗng), lượt vẫn đếm khớp', [
    demGui.body.type, demGui.body.gridPageIndex, JSON.stringify(demGui.meta.keep), hinh.F.stateRead().phase
  ], [1, hinh.F.GRID_FIRST_PAGE_NO_HEADER, '{"fields":[]}', 'done']);

  // FBM không trả tổng: lượt đóng lỗi đúng mã qua đường lỗi chung, không đoán số, mốc giữ số của lần quét đủ.
  const thieu = scanHarness({ customers: 12 });
  await thieu.run({ pack: 'quick', afterError: () => null, edit: (raw, request) => { if (request.meta.kind === 'customer_count') { raw.body = JSON.stringify({ d: { Rows: [] } }); } return raw; } });
  check(so, 'FBM không trả số khách ở bước đếm: lượt lỗi FBM_CUSTOMER_COUNT_INVALID, mốc giữ số của lần quét đủ, không mở Quét nhanh bù', [
    thieu.F.stateRead().phase, thieu.F.stateRead().lastFailureCode, thieu.F.customerBaselineRead(), dem(thieu, 'scan_job')
  ], ['error', 'FBM_CUSTOMER_COUNT_INVALID', 12, 1]);

  // Chặng nhận bản sao ô lượt: sửa thẳng bản sao không lọt vào ô lượt thật, chỉ patch được gộp.
  const sao = scanHarness({ customers: 12 });
  sao.F.statePatch({ runId: 'r-sao', phase: 'pull_customer', cursor: { kind: 'customer_count' }, message: 'cũ' });
  const traVe = sao.F.stageRun({ stage: (ctx) => { ctx.state.phase = 'done'; ctx.state.cursor.kind = 'xong'; return { patch: { message: 'mới' }, end: {} }; }, end: (state) => ({ phase: state.phase, kind: state.cursor.kind, message: state.message }) }, sao.F.stateRead(), JSON.stringify({ d: {} }));
  check(so, 'chặng sửa thẳng ô lượt nhận được thì ô lượt thật không đổi; chỉ patch được gộp', [traVe.phase, traVe.kind, traVe.message], ['pull_customer', 'customer_count', 'mới']);

  // Phép kiểm response chung: lỗi HTTP ném có mã, phiên đáng ngờ nhường cổng phiên, response tốt qua.
  const loiMa = (fn) => { try { fn(); return ''; } catch (error) { return error.code; } };
  check(so, 'replyCheck: HTTP 500 ném TRANSPORT_ERROR, FBM báo Bugs ném FBM_BUSINESS_ERROR, response tốt trả ok', [
    loiMa(() => sao.F.replyCheck({ ok: false, status: 500, body: 'x' })), loiMa(() => sao.F.replyCheck({ ok: true, status: 200, body: JSON.stringify({ d: { Bugs: { Message: 'lỗi' } } }) })), sao.F.replyCheck({ ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: 1 } }) }).ok
  ], ['TRANSPORT_ERROR', 'FBM_BUSINESS_ERROR', true]);
}

module.exports = { chay };
