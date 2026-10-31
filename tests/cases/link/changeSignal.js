/** `client/link/changeSignal.html`: kênh báo thay đổi từ Extension, lịch hỏi sau tín hiệu dồn dập, watchdog kênh im. */

const { section, check } = require('../../lib/assert');
const { syncValue, dungHopLienKet, batDauLienKet, chayHenGio } = require('../../lib/sidebar/hop-lien-ket');

/** Tín hiệu kênh `/bind` dồn dập: hẹn giờ theo lịch trễ, mọi lời hỏi qua cổng chung, không bao giờ song song. */
async function chay(so) {
  section('changeSignal — tín hiệu kênh dồn dập, lịch hỏi và watchdog kênh im');
  const burst = dungHopLienKet(); batDauLienKet(burst);
  let dangBay = 0; let bayNhieuNhat = 0; const traLoi = [];
  burst.callServer = (name) => {
    burst._calls.push(name);
    dangBay += 1; bayNhieuNhat = Math.max(bayNhieuNhat, dangBay);
    return new Promise((resolve) => traLoi.push(() => { dangBay -= 1; resolve({ ok: true, reload: { revision: 0 } }); }));
  };
  const lichKenh = () => Array.from(burst._timers.values()).filter((item) => item.delay === 4000 || item.delay === 12000);
  const tinHieu = () => burst.sheetLinkOnMessage({ origin: burst.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: burst.SHEET_LINK_NONCE, signal: 'channel' } });
  tinHieu();
  const moc4000 = lichKenh().find((item) => item.delay === 4000);
  for (let i = 0; i < 9; i++) { burst._clock.now += 200; tinHieu(); }
  check(so, '10 tín hiệu trong 2 giây chỉ giữ hai hẹn giờ; mốc đầu vẫn là hẹn giờ của tín hiệu đầu tiên',
    [lichKenh().map((item) => item.delay).sort(), lichKenh().find((item) => item.delay === 4000) === moc4000, burst._calls.length], [[12000, 4000], true, 0]);
  chayHenGio(burst, 4000);
  tinHieu();
  check(so, 'tín hiệu đến lúc lời hỏi mốc đầu đang bay thì mở lại mốc đầu, không gọi GAS song song',
    [burst._calls.length, lichKenh().length],
    [1, 2]);
  chayHenGio(burst, 4000);
  chayHenGio(burst, 12000);
  check(so, 'các mốc chín trong lúc lời hỏi đang bay chỉ gộp thành tín hiệu chờ',
    [burst._calls.length, burst.SHEET_LINK_SELECTION_WAKE_QUEUED],
    [1, true]);
  traLoi.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'lời hỏi xong thì đúng một lượt nối tiếp, cả đợt không lúc nào có hai lời hỏi cùng bay',
    [burst._calls, bayNhieuNhat], [['probeSelectionAndReload', 'probeSelectionAndReload'], 1]);
  traLoi.shift()();

  // Mốc 12 giây chỉ hỏi khi còn lý do; lời hỏi mốc đầu đã nạp trọn thì bỏ.
  const mocSau = async (revisionSau, tinHieuGiuaChung) => {
    const h = dungHopLienKet(); batDauLienKet(h);
    h.SHEET_LINK_LAST_SEEN_REVISION = 10;
    h.callServer = (name) => { h._calls.push(name); return Promise.resolve({ ok: true, reload: { revision: revisionSau } }); };
    const tin = () => h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: h.SHEET_LINK_NONCE, signal: 'channel' } });
    tin();
    h._clock.now += 4000; chayHenGio(h, 4000);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    if (tinHieuGiuaChung) { h._clock.now += 1000; tin(); }
    chayHenGio(h, 12000);
    await new Promise((resolve) => setImmediate(resolve));
    return h._calls.length;
  };
  check(so, 'lời hỏi mốc đầu đã thấy revision tăng và không có tín hiệu mới: mốc 12 giây không gọi GAS',
    await mocSau(11, false),
    1);
  check(so, 'lời hỏi mốc đầu chưa thấy revision tăng (trigger chậm): mốc 12 giây vẫn hỏi', await mocSau(10, false), 2);
  check(so, 'có tín hiệu mới sau khi lời hỏi mốc đầu bắt đầu: mốc 12 giây vẫn hỏi', await mocSau(11, true), 2);

  // Kênh tự gửi lại yêu cầu trong cùng phiên không phải thay đổi; phiên mới hoặc Extension cũ vẫn là tín hiệu.
  const noiLai = (messages) => {
    const h = dungHopLienKet(); batDauLienKet(h);
    messages.forEach((m) => h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: Object.assign({ action: 'CRM_RELOAD', nonce: h.SHEET_LINK_NONCE }, m) }));
    return Array.from(h._timers.values()).filter((item) => item.delay === 4000 || item.delay === 12000).length;
  };
  check(so, 'kênh nối lại cùng phiên và khung đầu không mang thay đổi: không hẹn hỏi GAS',
    noiLai([{ signal: 'channel-open', sameSession: true }, { signal: 'channel', firstChunk: true, hasChange: false }]), 0);
  check(so, 'khung đầu sau lần nối lại mang thay đổi thật vẫn hẹn hỏi GAS',
    noiLai([{ signal: 'channel-open', sameSession: true }, { signal: 'channel', firstChunk: true, hasChange: true }]), 2);
  check(so, 'phiên kênh mới (kênh cũ chết) thì lần mở kênh vẫn là tín hiệu',
    noiLai([{ signal: 'channel-open', sameSession: false }]), 2);
  check(so, 'Extension cũ không gửi sameSession/firstChunk thì giữ hành vi cũ: mở kênh và khung lạ đều là tín hiệu',
    [noiLai([{ signal: 'channel-open' }]), noiLai([{ signal: 'channel' }])], [2, 2]);
  check(so, 'chỉ khung đầu của lần nối lại được bỏ; khung thứ hai không mang dấu thay đổi vẫn là tín hiệu',
    noiLai([{ signal: 'channel-open', sameSession: true }, { signal: 'channel', firstChunk: true, hasChange: false }, { signal: 'channel', firstChunk: false, hasChange: false }]), 2);

  const lanh = dungHopLienKet(); batDauLienKet(lanh);
  lanh.SHEET_LINK_RAM_READY = false;
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: lanh.SHEET_LINK_NONCE } });
  lanh.SHEET_LINK_RAM_READY = true;
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: 'nonce-la' } });
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_CHANNEL_ALIVE', nonce: lanh.SHEET_LINK_NONCE } });
  check(so, 'chưa nạp RAM, sai nonce hoặc chỉ là nhịp sống thì không hẹn giờ hỏi GAS',
    Array.from(lanh._timers.values()).filter((item) => item.delay === 4000 || item.delay === 12000).length, 0);

  const canh = dungHopLienKet(); batDauLienKet(canh);
  const inputs = [];
  canh.callServer = (name, args) => { if (name === 'probeSelectionAndReload') { inputs.push(args[0].channelSilence); } return syncValue({ ok: true, reload: { revision: 0 } }); };
  const nhip = (now) => { canh._clock.now = now; canh.SHEET_LINK_LAST_ACK = now; canh.changeSignalWatchdog(now); };
  const nhipAnToan = () => Array.from(canh._timers.values()).filter((item) => item.delay === 15000 || item.delay === 60000).map((item) => item.delay);
  nhip(10000);
  nhip(10000 + 180000);
  check(so, 'im đúng ngưỡng CHANNEL_SILENCE_MS thì chưa coi kênh chết', canh.changeSignalChannelDead(), false);
  nhip(10000 + 180001);
  check(so, 'kênh im quá ngưỡng khi tab hiện, mạng có, Extension sống: coi kênh chết, hiện băng, nhịp an toàn rút ngắn',
    [canh.changeSignalChannelDead(), canh._banner.hidden, canh._banner.textContent, nhipAnToan()],
    [true, false, canh.SELECTION_POLL_BANNER_TEXT.channelDead, [15000]]);
  canh.sheetLinkProbeSelectionAndReload('safety');
  canh.SHEET_LINK_SELECTION_PENDING = null;
  canh.sheetLinkProbeSelectionAndReload('safety');
  check(so, 'GAS chỉ được báo ghi Log kênh im một lần mỗi phiên', inputs, [true, false]);
  canh.sheetLinkOnMessage({ origin: canh.SHEET_LINK_ORIGIN, data: { action: 'CRM_CHANNEL_ALIVE', nonce: canh.SHEET_LINK_NONCE } });
  check(so, 'có tin lại từ kênh thì hết chết, ẩn băng, nhịp an toàn về bình thường',
    [canh.changeSignalChannelDead(), canh._banner.hidden, nhipAnToan()], [false, true, [60000]]);

  const an = dungHopLienKet(); batDauLienKet(an);
  const nhipAn = (now) => { an._clock.now = now; an.SHEET_LINK_LAST_ACK = now; an.changeSignalWatchdog(now); };
  nhipAn(1000);
  an.document.hidden = true; nhipAn(500000);
  an.document.hidden = false; nhipAn(501000);
  an.navigator = { onLine: false }; nhipAn(900000);
  an.navigator = { onLine: true }; nhipAn(901000);
  an._clock.now = 2000000; an.SHEET_LINK_LAST_ACK = 0; an.changeSignalWatchdog(2000000);
  an.SHEET_LINK_LAST_ACK = 2001000; an.changeSignalWatchdog(2001000);
  check(so, 'thời gian tab ẩn, mất mạng hoặc vắng Extension không tính vào khoảng im',
    an.changeSignalChannelDead(),
    false);
}


module.exports = { chay: chay };
