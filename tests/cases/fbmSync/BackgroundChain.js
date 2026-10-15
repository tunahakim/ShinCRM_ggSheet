/** Chuỗi nền trong một lần hỏi: mọi tiến trình đến hạn chạy lần lượt theo ưu tiên, mỗi tiến trình tối đa một lần mỗi chuỗi, mốc chỉ dời khi chạy xong. Đồng hồ GAS là đồng hồ giả để mô phỏng nhiều giờ. */
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { scanHarness } = require('./ScanJob');

const PHUT = 60000;

/** Harness có đồng hồ giả và sổ ghi tiến trình chạy xong (mốc được dời) của từng lần hỏi. */
function chuoiHarness(lich, options) {
  const h = scanHarness(Object.assign({ customers: 12 }, options || {}));
  const clock = { now: Date.UTC(2026, 9, 15, 0, 0) };
  h.flow.hop.__now = () => clock.now;
  vm.runInContext('Date.now = function () { return __now(); };', h.flow.hop);
  h.F.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  h.F.backgroundScheduleSave(Object.assign({ enabled: true, direction: 'read' }, lich));
  const xong = [], advance = h.F.scheduleMarkerAdvance;
  h.F.scheduleMarkerAdvance = function (kind) { xong.push(kind); return advance.apply(this, arguments); };
  /** Hỏi một lần sau `phut` phút; mỗi request FBM tốn `moiRequest` mili-giây. Trả các tiến trình chạy xong trong lần hỏi đó. */
  async function hoi(phut, moiRequest, hooks) {
    clock.now += phut * PHUT; xong.length = 0;
    const end = await h.poll(Object.assign({ beforeSend: () => { clock.now += moiRequest || 1000; } }, hooks || {}));
    return { xong: xong.slice(), end };
  }
  return Object.assign(h, { clock, hoi });
}

const dem = (list, kind) => list.filter((item) => item === kind).length;

async function chay(so) {
  section('fbmSync — Chuỗi nền trong một lần hỏi');

  // gas_poll 60 phút, Quét nhanh 60 phút, Lấy toàn bộ giao dịch 8 giờ, Vòng xoay 60 phút: trước đây Quét nhanh luôn thắng và hai tiến trình kia bị bỏ đói.
  const doi = chuoiHarness({ heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: true, minutes: 480 }, detail: { enabled: true, minutes: 60 } });
  const tamLan = [];
  for (let i = 0; i < 8; i += 1) { tamLan.push((await doi.hoi(60)).xong); }
  check(so, 'Hỏi 60 phút một lần trong 8 lần: Quét nhanh và Vòng xoay chạy ở cả 8 lần, Lấy toàn bộ giao dịch chạy ít nhất một lần, Giữ phiên chạy sau cùng mỗi lần, không lần nào dừng lỗi', [
    tamLan.filter((list) => list.indexOf('customerFull') >= 0).length, tamLan.filter((list) => list.indexOf('detail') >= 0).length, tamLan.some((list) => list.indexOf('activityFull') >= 0), tamLan.every((list) => list[list.length - 1] === 'heartbeat'), doi.F.stateRead().phase, doi.F.stateRead().chain
  ], [8, 8, true, true, 'done', null]);
  const lanCuoi = tamLan[7];
  check(so, 'Trong một chuỗi các tiến trình chạy theo ưu tiên Quét nhanh, Lấy toàn bộ giao dịch, Vòng xoay, Giữ phiên, mỗi tiến trình đúng một lần', lanCuoi, ['customerFull', 'activityFull', 'detail', 'heartbeat']);

  const giuPhien = chuoiHarness({ heartbeat: { enabled: true, minutes: 1 }, customerFull: { enabled: false }, activityFull: { enabled: false }, detail: { enabled: false } });
  const giuPhienLan = [];
  for (let i = 0; i < 3; i += 1) { giuPhienLan.push((await giuPhien.hoi(10)).xong); }
  check(so, 'Hỏi 10 phút một lần, Giữ phiên chu kỳ 1 phút: mỗi lần hỏi Giữ phiên chạy đúng một lần, mốc kế tiếp bám nhịp 1 phút sau giờ hiện tại', [
    giuPhienLan.map((list) => dem(list, 'heartbeat')), Number(giuPhien.flow.documentProperties.getProperty('FBM_SYNC_NEXT_HEARTBEAT')) > giuPhien.clock.now, Number(giuPhien.flow.documentProperties.getProperty('FBM_SYNC_NEXT_HEARTBEAT')) - giuPhien.clock.now <= PHUT
  ], [[1, 1, 1], true, true]);

  const cham = chuoiHarness({ heartbeat: { enabled: false }, customerFull: { enabled: false }, activityFull: { enabled: false }, detail: { enabled: true, minutes: 1 } });
  // Mỗi request 30 giây (dưới ngưỡng thu hồi phiên treo) nên cả lượt Vòng xoay kéo dài hơn 3 phút, gấp ba chu kỳ.
  const batDau = cham.clock.now + 5 * PHUT;
  const chamLan = await cham.hoi(5, 30000);
  check(so, 'Vòng xoay chu kỳ 1 phút mà mỗi lần chạy mất hơn 3 phút: chuỗi vẫn dừng, Vòng xoay chạy đúng một lần trong lần hỏi', [cham.clock.now - batDau >= 3 * PHUT, dem(chamLan.xong, 'detail'), chamLan.end.request || null, cham.F.stateRead().phase, cham.F.stateRead().chain], [true, 1, null, 'done', null]);

  // Lượt tay chen ngang lượt nền: lượt nền dừng sau response đang chờ, mốc không dời, lần hỏi kế tiếp chạy lại.
  const chen = chuoiHarness({ heartbeat: { enabled: false }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false }, detail: { enabled: false } });
  const mocTruoc = chen.flow.documentProperties.getProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN');
  let daChen = false;
  const chenLan = await chen.hoi(60, 1000, { beforeSend: (request) => {
    chen.clock.now += 1000;
    if (!daChen && request.meta.kind === 'scan_job') { daChen = true; chen.F.controlDispatchLocked('start', { mode: 'read', pack: 'quick', manual: true }); }
  } });
  const mocSauChen = chen.flow.documentProperties.getProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN');
  chen.F.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', deadlineAt: 0, metadata: {} });
  const chayLai = await chen.hoi(1);
  check(so, 'Lượt nền bị lượt tay chen ngang: lượt nền dừng, mốc Quét nhanh không dời; lần hỏi kế tiếp chạy lại Quét nhanh và dời mốc', [daChen, chenLan.xong, mocSauChen === mocTruoc, chayLai.xong, chen.flow.documentProperties.getProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN') !== mocTruoc], [true, [], true, ['customerFull'], true]);

  // Công tắc từng tiến trình chỉ bật/tắt lịch hẹn: tắt Quét nhanh, số khách FBM đổi thì Giữ phiên vẫn gọi Quét nhanh.
  const tat = chuoiHarness({ heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: false }, activityFull: { enabled: false }, detail: { enabled: false } });
  tat.F.customerBaselineWrite(11);
  const tatLan = await tat.hoi(10);
  check(so, 'Tắt Quét nhanh mà tổng khách FBM khác số khách mốc: Giữ phiên vẫn chạy Quét nhanh, nhận đủ 12 khách và ghi mốc mới', [tatLan.xong, dem(tat.trace.kinds, 'scan_job'), tat.local.customer.length, tat.F.customerBaselineRead()], [['heartbeat'], 1, 12, 12]);

  // Lượt trước đã kết thúc ở trạng thái tạm dừng (tự đăng nhập bị FBM từ chối) hoặc xung đột: lần hỏi sau vẫn mở chuỗi mới (09/06: chạy nền tự thử lại theo chu kỳ).
  const ketThuc = [];
  for (const phase of ['paused', 'conflict']) {
    const dung = chuoiHarness({ heartbeat: { enabled: false }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false }, detail: { enabled: false } });
    dung.F.statePatch({ runId: 'luot-truoc', phase, origin: 'background', cursor: {}, activeRequestId: '', deadlineAt: 0, lastFailureCode: 'AUTO_LOGIN_FAILED' });
    ketThuc.push((await dung.hoi(60)).xong);
  }
  check(so, 'Lượt trước dừng ở "tạm dừng" hoặc "xung đột": lần hỏi sau vẫn chạy Quét nhanh đến hạn, không bị coi là lượt đang chạy', ketThuc, [['customerFull'], ['customerFull']]);

  // Lượt trước tự đăng nhập bị từ chối nên còn dấu "phiên hết hạn"; người dùng đã tự đăng nhập trên tab FBM. Chuỗi mới phải hỏi FBM trước, không gửi thẳng lệnh đăng nhập (09/06: không đăng nhập lại khi phiên còn hợp lệ).
  const tuDangNhap = chuoiHarness({ heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: false }, activityFull: { enabled: false }, detail: { enabled: false } });
  tuDangNhap.F.statePatch({ runId: 'luot-truoc', phase: 'paused', origin: 'background', cursor: {}, activeRequestId: '', deadlineAt: 0, lastFailureCode: 'AUTO_LOGIN_FAILED', session: { expired: true } });
  tuDangNhap.trace.kinds.length = 0;
  const sauDangNhap = await tuDangNhap.hoi(10);
  check(so, 'Lượt trước còn dấu phiên hết hạn mà phiên FBM thật vẫn sống: chuỗi mới chạy Giữ phiên, không gửi lệnh đăng nhập', [sauDangNhap.xong, tuDangNhap.trace.kinds.indexOf('login') < 0], [['heartbeat'], true]);
}

module.exports = { chay };
