/** Gói quét và hai lớp phát hiện giao dịch mới: lớp 2 so giao dịch cuối trên danh sách khách, lớp 3 quét từ khách mới nhất xuống dừng sau chuỗi khách im lặng. */
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

const ngayFbm = (y, m, d) => '/Date(' + Date.UTC(y, m - 1, d) + ')/';
const giaoDich = (customer, fbmId, workDate, taskType) => ({ id: 'ACT-' + fbmId, customerId: customer, fbmId, workDate, taskType });
const macDinh = (key) => ({ id: 'A-' + key, details: 'Gọi ' + key, end_date: '2026-09-20', owner: 'Owner', datetime0: '2026-09-20T03:00:00', line_nbr: 1 });

/** Lượt đầu "Quét toàn bộ" để Sheet có đủ khách và giao dịch, rồi chạy lượt cần kiểm trên đúng dữ liệu đó. */
async function sauLuotDau(options, pack, activityFor) {
  const opt = Object.assign({}, options);
  let doiLuot = null;
  opt.activityFor = (key) => (doiLuot ? doiLuot(key) : [macDinh(key)]);
  const h = scanHarness(opt);
  await h.run({ pack: 'all' });
  doiLuot = activityFor || ((key) => [macDinh(key)]);
  h.trace.activityCustomers.length = 0; h.trace.kinds.length = 0; h.logs.length = 0;
  const end = await h.run({ pack });
  return { h, end, state: h.F.stateRead() };
}

async function chay(so) {
  section('FBM sync — gói quét, lớp 2 và lớp 3 đọc giao dịch mới');

  const F = scanHarness({ customers: 1 }).F, gate = { map: {} };
  const local = (records) => ({ day: '2026-09-20', records });
  const hai = local([giaoDich('CUS-000001', 'F1', '2026-09-20', 'Gọi điện'), giaoDich('CUS-000001', 'F2', '2026-09-20', 'Gặp mặt')]);
  check(so, 'Cùng ngày có hai công việc: FBM hiện công việc nào trong hai thì vẫn khớp, công việc khác thì lệch ở công việc', [
    F.lastActivityDiff({ ngay_gd: ngayFbm(2026, 9, 20), ten_cv: 'Gọi điện' }, hai, gate, ''),
    F.lastActivityDiff({ ngay_gd: ngayFbm(2026, 9, 20), ten_cv: 'Gặp mặt' }, hai, gate, ''),
    F.lastActivityDiff({ ngay_gd: ngayFbm(2026, 9, 20), ten_cv: 'Báo giá' }, hai, gate, '')
  ], [[], [], ['ma_cv']]);

  const coNoiBo = scanHarness({ customers: 1, localActivities: [giaoDich('CUS-000001', 'F1', '2026-09-20', 'Gọi điện'), { id: 'ACT-NB', customerId: 'CUS-000001', fbmId: '', workDate: '2026-12-01', taskType: 'Gọi điện' }] }).F;
  const chiMuc = coNoiBo.lastActivityIndex(gate)['CUS-000001'];
  check(so, 'Giao dịch nội bộ ngày tương lai (chưa có FBM ID) không che phát sinh FBM: mốc so vẫn là ngày của giao dịch có FBM ID, FBM báo ngày mới hơn thì lệch', [
    chiMuc.day, chiMuc.records.length, coNoiBo.lastActivityDiff({ ngay_gd: ngayFbm(2026, 9, 25), ten_cv: 'Gọi điện' }, chiMuc, gate, '')
  ], ['2026-09-20', 1, ['end_date']]);

  check(so, 'Ngày giao dịch cuối 01/01/1999 là chưa có giao dịch: khớp với khách chưa có giao dịch FBM, lệch với khách đã có', [
    F.lastActivityDiff({ ngay_gd: ngayFbm(1999, 1, 1), ten_cv: '' }, undefined, gate, ''),
    F.lastActivityDiff({ ngay_gd: ngayFbm(1999, 1, 1), ten_cv: '' }, hai, gate, '')
  ], [[], ['end_date']]);

  check(so, 'Giao dịch cuối bên FBM nằm trước mốc giao dịch đã cấu hình thì không đọc khách đó; ShinCRM có giao dịch trong mốc mà FBM lùi về trước mốc thì vẫn đọc', [
    F.lastActivityDiff({ ngay_gd: ngayFbm(2025, 1, 5), ten_cv: '' }, undefined, gate, '2026-01-01'),
    F.lastActivityDiff({ ngay_gd: ngayFbm(2025, 1, 5), ten_cv: '' }, hai, gate, '2026-01-01')
  ], [[], ['end_date']]);

  const goc = { ten_kh: 'Công ty A', ma_so_thue: '0101', ngay_gd: ngayFbm(2026, 9, 20), ten_cv: 'Gọi điện' };
  check(so, 'Hash Customer không chứa ngày giao dịch cuối và công việc: đổi hai trường này không đổi hash, nên chiều đẩy không hiểu nhầm mọi khách đã sửa',
    F.hash(Object.assign({}, goc, { ngay_gd: ngayFbm(2026, 10, 1), ten_cv: 'Báo giá' }), 'customer', gate) === F.hash(goc, 'customer', gate), true);

  // Lớp 3 trên lượt thật: 30 khách, giao dịch cuối đều khớp nên lớp 2 không chọn ai; chuỗi im lặng 5, lô 3 khách; khách thứ 3 có giao dịch mới.
  const lop3 = await sauLuotDau({ customers: 30, budget: { activityTopScanQuietStreak: 5, activityBatchCustomers: 3 } }, 'quick', (key) => (key === 'FBM-C3' ? [macDinh(key), Object.assign(macDinh(key), { id: 'A-NEW', details: 'Mới' })] : [macDinh(key)]));
  const topLog = lop3.h.logs.find((event) => event.action === 'activity_top_scan');
  check(so, 'Quét từ khách mới nhất xuống dừng đúng sau 5 khách liên tiếp không có gì mới tính từ khách có giao dịch mới: đọc 8/30 khách theo thứ tự, ghi giao dịch mới, Log ghi vị trí sâu nhất, tiến trình chốt 8/8 chứ không 8/30', [
    lop3.end.status.phase, lop3.h.trace.activityCustomers, lop3.h.local.activity.some((item) => item.fbmId === 'A-NEW'), topLog && topLog.detail.depth, topLog && topLog.detail.deepestFresh, lop3.state.scanPack, lop3.h.logs.some((event) => event.action === 'activity_due'), lop3.state.progress
  ], ['done', ['FBM-C1', 'FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5', 'FBM-C6', 'FBM-C7', 'FBM-C8'], true, 8, 3, 'quick', false, { done: 8, total: 8 }]);

  // Lớp 2 rồi lớp 3: khách thứ 20 có giao dịch cuối FBM khác ShinCRM thì được đọc dù nằm sâu, và lớp 3 không đọc lại khách đó.
  const doiNgay = await sauLuotDau({ customers: 25, budget: { activityTopScanQuietStreak: 3 } }, 'quick', null);
  const lop2 = scanHarness({ customers: 25, budget: { activityTopScanQuietStreak: 3 } });
  await lop2.run({ pack: 'all' });
  const c20 = lop2.local.customer.find((item) => item.fbmId === 'FBM-C20');
  lop2.local.activity.filter((item) => item.customerId === c20.id).forEach((item) => { item.workDate = '2026-09-10'; });
  lop2.trace.activityCustomers.length = 0; lop2.logs.length = 0;
  const lop2End = await lop2.run({ pack: 'quick' });
  const dueLog = lop2.logs.find((event) => event.action === 'activity_due');
  check(so, 'Khách nằm sâu có giao dịch cuối FBM khác ShinCRM được đọc ở lớp 2, lớp 3 đọc 3 khách đầu rồi dừng và không đọc lại khách đã đọc; Log nêu trường lệch', [
    lop2End.status.phase, lop2.trace.activityCustomers, dueLog && dueLog.detail.count, dueLog && dueLog.detail.fields, doiNgay.h.trace.activityCustomers
  ], ['done', ['FBM-C20', 'FBM-C1', 'FBM-C2', 'FBM-C3'], 1, { end_date: 1 }, ['FBM-C1', 'FBM-C2', 'FBM-C3']]);

  // Đọc giao dịch theo một phần khách: giao dịch ShinCRM không còn bên FBM chỉ bị gắn cờ khi khách cha đã được đọc trong lượt.
  const vang = scanHarness({ customers: 12, budget: { activityTopScanQuietStreak: 2 } });
  await vang.run({ pack: 'all' });
  const cha = (fbmId) => vang.local.customer.find((item) => item.fbmId === fbmId).id;
  vang.local.activity.push({ id: 'ACT-900001', customerId: cha('FBM-C1'), fbmId: 'A-GONE-1', workDate: '2026-09-01', taskType: '', syncStatus: 'đã đồng bộ' });
  vang.local.activity.push({ id: 'ACT-900002', customerId: cha('FBM-C10'), fbmId: 'A-GONE-10', workDate: '2026-09-01', taskType: '', syncStatus: 'đã đồng bộ' });
  vang.trace.activityCustomers.length = 0;
  const vangEnd = await vang.run({ pack: 'quick' });
  const trangThai = (fbmId) => vang.local.activity.find((item) => item.fbmId === fbmId).syncStatus;
  check(so, 'Quét nhanh chỉ đọc 2 khách đầu: giao dịch không còn bên FBM của khách đã đọc bị gắn "không thấy bên FBM", của khách chưa đọc thì giữ nguyên', [
    vangEnd.status.phase, vang.trace.activityCustomers, trangThai('A-GONE-1'), trangThai('A-GONE-10')
  ], ['done', ['FBM-C1', 'FBM-C2'], vang.F.SYNC_STATUS.missing, 'đã đồng bộ']);

  // Hai chiều: phần đọc xong phải gắn cờ "không thấy" trước khi sang bước đẩy, như chiều Lấy.
  const haiChieu = scanHarness({ customers: 6, budget: { activityTopScanQuietStreak: 2 } });
  await haiChieu.run({ pack: 'all' });
  const chaHai = haiChieu.local.customer.find((item) => item.fbmId === 'FBM-C1').id;
  haiChieu.local.activity.push({ id: 'ACT-900003', customerId: chaHai, fbmId: 'A-GONE-2C', workDate: '2026-09-01', taskType: '', syncStatus: 'đã đồng bộ' });
  haiChieu.local.customer.push({ id: 'CUS-900001', fbmId: 'FBM-GONE', fbmCustomerCode: 'ALT-GONE', syncStatus: 'đã đồng bộ' });
  const pushAt = [], pushCounts = [];
  haiChieu.F.canWriteFbm = () => true;
  // Danh mục FBM của chiều đẩy không thuộc phần đang kiểm; harness việc quét không giả lập nó.
  haiChieu.F.needsFbmLookups = () => false;
  haiChieu.F.nextPushRequest = (state) => { pushCounts.push([state.counts.missingCustomer, state.counts.missingActivity]); pushAt.push([haiChieu.local.activity.find((item) => item.fbmId === 'A-GONE-2C').syncStatus, haiChieu.local.customer.find((item) => item.id === 'CUS-900001').syncStatus]); state.phase = 'done'; haiChieu.F.stateWrite(state); return null; };
  await haiChieu.run({ pack: 'quick', startOptions: { mode: 'write' } });
  check(so, 'Đồng bộ hai chiều: giao dịch đã xóa bên FBM của khách đã đọc và khách không còn bên FBM bị gắn "không thấy bên FBM" trước khi sang bước đẩy', pushAt, [[haiChieu.F.SYNC_STATUS.missing, haiChieu.F.SYNC_STATUS.missing]]);
  check(so, 'Đồng bộ hai chiều: bộ đếm phiên có số khách và giao dịch "không thấy bên FBM" để thẻ Trạng thái phiên hiện', pushCounts, [[1, 1]]);

  // Mỗi gói chạy đúng thao tác của nó.
  const nhanh = await sauLuotDau({ customers: 6, budget: { activityTopScanQuietStreak: 2 } }, 'quick', null);
  const ky = await sauLuotDau({ customers: 6, budget: { activityTopScanQuietStreak: 2 } }, 'deep', null);
  const toanBo = await sauLuotDau({ customers: 6, budget: { activityTopScanQuietStreak: 2 } }, 'all', null);
  const la = await sauLuotDau({ customers: 6, budget: { activityTopScanQuietStreak: 2 } }, 'gõ nhầm', null);
  const loai = (run) => Array.from(new Set(run.h.trace.kinds.map((kind) => (kind === 'scan_job:activity' ? kind : kind.split(':')[0])).filter((kind) => kind === 'batch' || kind === 'scan_job:activity' || kind === 'scan_job')));
  check(so, 'Quét nhanh: danh sách khách rồi đọc giao dịch theo khách, không lấy toàn bộ giao dịch', [nhanh.end.status.phase, nhanh.state.scanPack, loai(nhanh), nhanh.h.trace.activityCustomers.length], ['done', 'quick', ['scan_job', 'batch'], 2]);
  check(so, 'Quét kỹ: như Quét nhanh rồi lấy toàn bộ giao dịch (lớp 1) mới chốt lượt', [ky.end.status.phase, ky.state.scanPack, loai(ky), ky.h.trace.activityCustomers.length, ky.h.trace.kinds[ky.h.trace.kinds.length - 1]], ['done', 'deep', ['scan_job', 'batch', 'scan_job:activity'], 2, 'scan_job:activity']);
  check(so, 'Quét toàn bộ: đọc giao dịch của mọi khách dù giao dịch cuối đều khớp', [toanBo.end.status.phase, toanBo.state.scanPack, loai(toanBo), toanBo.h.trace.activityCustomers.length], ['done', 'all', ['scan_job', 'batch'], 6]);
  check(so, 'Gói lạ về Quét nhanh chứ không về Quét toàn bộ', [la.state.scanPack, la.h.trace.activityCustomers.length], ['quick', 2]);

  const dau = scanHarness({ customers: 6, budget: { activityTopScanQuietStreak: 2 } });
  await dau.run({ pack: 'quick' });
  check(so, 'Lượt đầu Sheet chưa có giao dịch: mọi khách lệch giao dịch cuối nên Quét nhanh đọc đủ 6 khách như Quét toàn bộ', [dau.F.stateRead().phase, dau.trace.activityCustomers.length, dau.local.activity.length], ['done', 6, 6]);
}

module.exports = { chay };
