/** Kiểm thử fallback selection khi không có Extension và các kênh đánh thức reload. */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function syncValue(value) {
  return {
    then(onValue, onError) {
      try {
        const next = onValue ? onValue(value) : value;
        return next && typeof next.then === 'function' ? next : syncValue(next);
      } catch (err) { return syncError(err); }
    }
  };
}

function syncError(error) {
  return {
    then(onValue, onError) {
      if (!onError) { return syncError(error); }
      try {
        const next = onError(error);
        return next && typeof next.then === 'function' ? next : syncValue(next);
      } catch (err) { return syncError(err); }
    }
  };
}

function dungHopPoll() {
  const clock = { now: 0 };
  const timers = new Map();
  const intervals = new Map();
  const documentListeners = {};
  const windowListeners = {};
  const rootListeners = {};
  let nextTimer = 1;
  const banner = { hidden: true };
  const viewNotice = { hidden: true };
  const root = { addEventListener: (name, fn) => { rootListeners[name] = fn; } };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => { documentListeners[name] = fn; },
    getElementById: (id) => ({ 'sidebar-root': root, 'shin-extension-warning': banner, 'shin-view-stale': viewNotice })[id] || null,
    querySelector: () => null
  };
  const window = { addEventListener: (name, fn) => { windowListeners[name] = fn; } };
  window.top = window;

  const hop = taoHopCat({
    Date: { now: () => clock.now }, document, window,
    setTimeout: (fn, delay) => { const id = nextTimer++; timers.set(id, { fn, delay }); return id; },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => { const id = nextTimer++; intervals.set(id, { fn, delay }); return id; },
    clearInterval: (id) => intervals.delete(id),
    Prefs: { followSelection: true }, SAVE_FLOW: { dangGui: false },
    ScreenState: { screen: 'view', currentCustomerId: '' }, SCREEN_VIEW: 'view',
    SETTINGS: { SELECTION_POLL_MS: 2000, SELECTION_POLL_IDLE_MS: 6000, POSITION_WAKE_MS: 1000, HANDSHAKE_PING_MS: 1000, EXTENSION_ACK_TIMEOUT_MS: 3000, RELOAD_SAFETY_POLL_MS: 60000, RELOAD_SAFETY_POLL_DEAD_MS: 15000, CHANGE_SIGNAL_DELAYS_MS: [4000, 12000], CHANNEL_ALIVE_RELAY_MS: 20000, CHANNEL_SILENCE_MS: 180000 },
    ACTIONS: { setCurrentCustomer: () => null }, screenViewSetSelectionMiss: () => null
  });
  hop.Store = { hasCustomer: () => false };
  hop._clock = clock; hop._timers = timers; hop._intervals = intervals;
  hop._documentListeners = documentListeners; hop._windowListeners = windowListeners; hop._rootListeners = rootListeners;
  hop._banner = banner; hop._viewNotice = viewNotice; hop._calls = []; hop._options = [];
  hop.callServer = (name, args, options) => {
    hop._calls.push(name);
    hop._options.push(options || {});
    return syncValue({ ok: true, spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '', reload: { revision: 0 } });
  };
  napClient(hop, 'client/ram/refresh.html', 'client/link/sheetLink.html', 'client/link/selectionPoll.html', 'client/link/changeSignal.html');
  // Các phép kiểm request giữ hợp đồng bàn giao im lặng; bản chạy DEV trực quan bật cờ này ở runtime.
  hop.SETTINGS.SHOW_PROBE_PROGRESS_DEBUG = true;
  return hop;
}

function batDau(hop) {
  hop.selectionPollInstall(); hop.sheetLinkInstall(); hop.changeSignalInstall(); hop.SHEET_LINK_SPREADSHEET_ID = 'sheet-1'; hop.selectionPollSetReady(true);
}

function runTimer(hop, delay) {
  const entry = Array.from(hop._timers.entries()).find((item) => item[1].delay === delay);
  if (!entry) { return null; }
  hop._timers.delete(entry[0]); entry[1].fn(); return entry[1].delay;
}

async function chay(so) {
  section('selectionPoll — một request selection/reload, debounce hint và safety poll');
  let hop;
  try { hop = dungHopPoll(); } catch (err) { return ghiLoiNap(so, 'nạp máy trạng thái polling', err); }

  batDau(hop);
  check(so, 'probe selection debug hiện loading', hop.sheetLinkShowProbeProgress(), true);
  check(so, 'mouseenter Sidebar không còn là tín hiệu đánh thức', hop._rootListeners.mouseenter, undefined);
  hop._clock.now = 4000; hop.selectionPollClearTimer(); hop.selectionPollTick();
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'fallback không có Extension gọi đúng một request GAS', hop._calls, ['probeSelectionAndReload']);
  check(so, 'cờ nghiệm thu loading bật: lời hỏi nền fallback cũng hiện loading ngay khi gửi', hop._options[0].silent, false);
  check(so, 'fallback giữ nhịp nhanh khi vị trí thay đổi', runTimer(hop, 2000), 2000);

  const chong = dungHopPoll(); batDau(chong); chong._clock.now = 4000; chong.selectionPollClearTimer();
  let resolveProbe = null;
  chong.callServer = (name, args, options) => { chong._calls.push({ name, args, options }); return { then: (ok) => { resolveProbe = ok; return { then: () => null }; } }; };
  chong.selectionPollTick(); chong.selectionPollTick();
  check(so, 'request selection đang bay thì nhịp sau không tạo request chồng', [chong._calls.length, chong.SELECTION_POLL.inFlight, typeof resolveProbe], [1, true, 'function']);

  const stable = dungHopPoll(); batDau(stable); stable._clock.now = 4000;
  for (let i = 0; i < 4; i += 1) { stable.selectionPollClearTimer(); stable.selectionPollTick(); await new Promise((resolve) => setImmediate(resolve)); }
  check(so, 'vị trí ổn định chuyển fallback sang nhịp nghỉ sáu giây', [stable.SELECTION_POLL.stableCount, stable.SELECTION_POLL.intervalMs], [3, 6000]);

  const safety = dungHopPoll(); batDau(safety);
  const safetyTimer = Array.from(safety._timers.values()).find((item) => item.delay === 60000);
  check(so, 'safety polling được lập lịch độc lập với Extension', Boolean(safetyTimer), true);
  safety._calls = [];
  safety.callServer = (name, args, options) => { safety._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  safetyTimer.fn();
  check(so, 'cờ nghiệm thu loading bật: safety request hiện loading ngay khi gửi', [safety._calls[0].name, safety._calls[0].options.silent], ['probeSelectionAndReload', false]);

  const safetyVisibleProbe = dungHopPoll(); batDau(safetyVisibleProbe); safetyVisibleProbe.SETTINGS.SHOW_PROBE_PROGRESS_DEBUG = false;
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.callServer = (name, args, options) => { safetyVisibleProbe._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  const visibleSafetyTimer = Array.from(safetyVisibleProbe._timers.values()).find((item) => item.delay === 60000);
  visibleSafetyTimer.fn();
  check(so, 'cờ nghiệm thu loading tắt: safety request chạy im lặng (tài liệu 05)', safetyVisibleProbe._calls[0].options.silent, true);
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.SHEET_LINK_SELECTION_PENDING = null;
  safetyVisibleProbe.sheetLinkProbeSelectionAndReload('position', { needsSelection: true });
  check(so, 'cờ nghiệm thu loading tắt: lời hỏi đổi vị trí cũng im lặng', [safetyVisibleProbe._calls.length, safetyVisibleProbe._calls[0].options.silent], [1, true]);

  const plan = { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' }] };
  const quiet = dungHopPoll(); batDau(quiet); quiet._calls = [];
  quiet.SHEET_LINK_READ_PLAN = plan;
  quiet.SHEET_LINK_LAST_ACK = 5000; quiet._clock.now = 5001;
  quiet.Store = { hasCustomer: () => true };
  quiet.callServer = (name, args, options) => { quiet._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 } }); };
  const timersBefore = quiet._timers.size;
  const okContext = (seq, cellRef, row, hint) => ({ action: 'CRM_CONTEXT', nonce: quiet.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq, sheetName: 'Customer', cellRef, row, col: 1, hint, readStatus: 'ok', readReason: '', headerComplete: true, rawHeaderRow: [{ address: 'A1', column: 1, value: '@CUS_MA_KH' }], reads: [{ token: 'id', status: 'ok', matched: true, value: 'CUS-00000' + row }] });
  quiet.sheetLinkOnMessage({ origin: quiet.SHEET_LINK_ORIGIN, data: okContext(1, 'A4', 4, 'keydown') });
  quiet.sheetLinkOnMessage({ origin: quiet.SHEET_LINK_ORIGIN, data: okContext(2, 'A4', 4, 'keyboardHint') });
  quiet.sheetLinkOnMessage({ origin: quiet.SHEET_LINK_ORIGIN, data: okContext(3, 'A5', 5, 'canvasClick') });
  quiet.sheetLinkOnMessage({ origin: quiet.SHEET_LINK_ORIGIN, data: okContext(4, 'A1:A9', 9, '') });
  check(so, 'Extension đọc được: keydown, canvasClick, đổi vị trí, chọn vùng đều không hỏi GAS và không đặt hẹn giờ đánh thức',
    [quiet._calls.length, quiet._timers.size - timersBefore], [0, 0]);

  // Rời sheet kho chỉ hỏi ngay khi còn việc chờ; kênh sống và không có gì chờ thì không tốn lượt GAS.
  const roiKho = async (setup) => {
    const h = dungHopPoll(); batDau(h); h._calls = [];
    h.SHEET_LINK_READ_PLAN = plan;
    h.SHEET_LINK_LAST_ACK = 5000; h._clock.now = 5001;
    h.Store = { hasCustomer: () => true };
    h.callServer = (name, args, options) => { h._calls.push(name); return syncValue({ ok: true, reload: { revision: 0 } }); };
    const tin = (seq, sheetName, cellRef, row) => ({ action: 'CRM_CONTEXT', nonce: h.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq, sheetName, cellRef, row, col: 1, readStatus: 'ok', readReason: '', headerComplete: true, rawHeaderRow: [{ address: 'A1', column: 1, value: '@CUS_MA_KH' }], reads: [{ token: 'id', status: 'ok', matched: true, value: 'CUS-000004' }] });
    h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: tin(1, 'Customer', 'A4', 4) });
    await new Promise((resolve) => setImmediate(resolve));
    h._calls = [];
    if (setup) { setup(h); }
    h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: tin(2, 'Bao cao', 'A1', 1) });
    await new Promise((resolve) => setImmediate(resolve));
    return { calls: h._calls.length, hen: Array.from(h._timers.values()).filter((item) => item.delay === 4000 || item.delay === 12000).map((item) => item.delay).sort() };
  };
  check(so, 'rời Customer khi kênh sống và không có tín hiệu chờ: không hỏi GAS', (await roiKho()).calls, 0);
  check(so, 'rời Customer khi còn tín hiệu chờ: hỏi ngay một lượt thay mốc đầu, giữ mốc sau để tự xét',
    await roiKho((h) => h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: h.SHEET_LINK_NONCE, signal: 'channel' } })), { calls: 1, hen: [12000] });
  check(so, 'rời Customer khi kênh chết hoặc còn lượt nạp hoãn: vẫn hỏi ngay',
    [(await roiKho((h) => { h.CHANGE_SIGNAL.dead = true; })).calls, (await roiKho((h) => { h.SHEET_LINK_RELOAD_TIMER = 99; })).calls], [1, 1]);

  const appFocus = dungHopPoll(); batDau(appFocus); appFocus._calls = [];
  appFocus.SHEET_LINK_LAST_ACK = 5000; appFocus._clock.now = 5001;
  appFocus.selectionPollWake();
  check(so, 'focus/chuyển app không tự gọi GAS khi Extension còn sống', appFocus._calls, []);
  appFocus._documentListeners.visibilitychange();
  check(so, 'tab hiện lại sinh đúng một lời hỏi qua cổng chung, kể cả khi Extension sống', appFocus._calls, ['probeSelectionAndReload']);
  appFocus.SHEET_LINK_SELECTION_PENDING = null;
  appFocus._windowListeners.online();
  check(so, 'mạng nối lại sinh đúng một lời hỏi qua cổng chung', appFocus._calls, ['probeSelectionAndReload', 'probeSelectionAndReload']);

  const gasSelection = (customerId, cellRef) => ({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', cellRef, row: 4, col: 3, rowEnd: 4, colEnd: 3, customerId } });
  const readerDown = dungHopPoll(); batDau(readerDown); readerDown._calls = [];
  readerDown.SHEET_LINK_READ_PLAN = plan;
  readerDown.SHEET_LINK_LAST_ACK = 5000; readerDown._clock.now = 5001;
  readerDown.Store = { hasCustomer: (id) => id === 'CUS-000004' || id === 'CUS-000005' };
  const pickedDown = [];
  readerDown.ACTIONS.setCurrentCustomer = (input) => { pickedDown.push(input.pick); };
  let nextGas = gasSelection('CUS-000004', 'C4');
  readerDown.callServer = (name, args, options) => { readerDown._calls.push({ name, args, options }); return syncValue(nextGas); };
  const downContext = { action: 'CRM_CONTEXT', nonce: readerDown.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', cellRef: 'C4', hint: 'canvasClick', readStatus: 'unavailable', readReason: 'LIVE_GRID_NOT_FOUND', headerComplete: false, rawHeaderRow: [], reads: [] };
  readerDown.sheetLinkOnMessage({ origin: readerDown.SHEET_LINK_ORIGIN, data: downContext });
  check(so, 'Extension sống nhưng đọc hỏng: click ô đặt wake theo nhịp đổi vị trí một giây, không chờ ba giây',
    [runTimer(readerDown, 1000), readerDown._calls.length], [1000, 1]);
  check(so, 'Extension đọc hỏng: Sidebar mở khách do GAS đọc thay và báo Log mã lỗi',
    [pickedDown, readerDown._calls[0].args[0].extensionReadFailure], [['CUS-000004'], 'LIVE_GRID_NOT_FOUND']);
  check(so, 'Extension đọc hỏng: băng cảnh báo hiện câu riêng, không nhầm với thiếu Extension',
    [readerDown._banner.hidden, readerDown._banner.textContent], [false, readerDown.SELECTION_POLL_BANNER_TEXT.readerDown]);
  nextGas = gasSelection('CUS-000005', 'C5');
  // syncValue chạy đồng bộ nên mốc "đang bay" được gán sau khi lượt đã xong; Promise thật tự dọn mốc này.
  readerDown.SHEET_LINK_SELECTION_PENDING = null;
  readerDown.sheetLinkOnMessage({ origin: readerDown.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { seq: 2, cellRef: 'C5' }) });
  runTimer(readerDown, 1000);
  check(so, 'Extension đọc hỏng: lần click sau vẫn mở đúng khách nhưng chỉ báo Log một lần mỗi phiên',
    [pickedDown, readerDown._calls[1].args[0].extensionReadFailure], [['CUS-000004', 'CUS-000005'], '']);

  // Sheet xem tự do: Sidebar chép mẫu `!` thành khóa theo tên sheet để Extension dò lưới; không hỏi GAS, không báo bộ đọc hỏng.
  const mauView = [
    { token: '!:@CUS_MA_KH', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' },
    { token: '!:@ACT_MA_KH', headerAddress: 'B1', expectedValue: '@ACT_MA_KH', valueAddressTemplate: 'B{row}' }];
  const planCoBan = Object.assign({ Activity: [], Category: [], Config: [], '!': mauView }, plan);
  const free = dungHopPoll(); batDau(free); free._calls = [];
  free.SHEET_LINK_READ_PLAN = JSON.parse(JSON.stringify(planCoBan));
  free.SHEET_LINK_LAST_ACK = 5000; free._clock.now = 5001;
  free.Store = { hasCustomer: (id) => /^CUS-00000[4-6]$/.test(id) };
  const pickedFree = [];
  free.ACTIONS.setCurrentCustomer = (input) => { pickedFree.push(input.pick); };
  free.callServer = (name, args, options) => { free._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 } }); };
  const freeContext = (seq, row, extra) => Object.assign({ action: 'CRM_CONTEXT', nonce: free.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq, gid: '9', sheetName: 'Bao cao', cellRef: 'C' + row, row, col: 3, readStatus: 'unavailable', readReason: 'LIVE_GRID_SEARCHING', rawHeaderRow: [], reads: [] }, extra || {});
  check(so, 'chỉ sheet ngoài kho và ngoài ! là sheet tự do',
    [free.sheetLinkIsFreeSheet('Bao cao'), free.sheetLinkIsFreeSheet('Customer'), free.sheetLinkIsFreeSheet('Category'), free.sheetLinkIsFreeSheet('!lead')], [true, false, false, false]);
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(1, 4) });
  check(so, 'sheet tự do lần đầu: plan có khóa đúng tên sheet chép từ mẫu !, 0 lời hỏi GAS, 0 hẹn giờ, không băng cảnh báo',
    [free.sheetLinkPlanForSheet('Bao cao'), free._calls.length, runTimer(free, 1000), free._banner.hidden], [mauView, 0, null, true]);
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(2, 5, { readStatus: 'ok', readReason: '', rawHeaderRow: [{ address: 'C1', column: 3, value: '@CUS_MA_KH' }], reads: [{ token: '!:@CUS_MA_KH', status: 'ok', matched: true, value: 'CUS-000005' }] }) });
  check(so, 'sheet tự do có hàng 1: plan chỉ giữ mã có thật, đúng cột theo hàng 1; mẫu ! không đổi; mở đúng khách, 0 lời hỏi',
    [free.sheetLinkPlanForSheet('Bao cao'), free.SHEET_LINK_READ_PLAN['!'], pickedFree, free._calls.length],
    [[{ token: '!:@CUS_MA_KH', headerAddress: 'C1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'C{row}' }], mauView, ['CUS-000005'], 0]);
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(3, 5, { readStatus: 'ok', readReason: '', rawHeaderRow: [{ address: 'C1', column: 3, value: '@CUS_MA_KH' }, { address: 'AB1', column: 28, value: '@ACT_MA_KH' }], reads: [] }) });
  check(so, 'sheet tự do được thêm cột mã sau đó: plan dựng lại từ mẫu ! nên có thêm mã mới, đúng cột AB',
    free.sheetLinkPlanForSheet('Bao cao').map((item) => item.valueAddressTemplate), ['C{row}', 'AB{row}']);
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(4, 6, { gid: '10', sheetName: 'Ghi chu', readReason: 'LIVE_GRID_NOT_FOUND' }) });
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(5, 7, { gid: '10', sheetName: 'Ghi chu', readReason: 'LIVE_GRID_NOT_FOUND' }) });
  check(so, 'sheet tự do không có cột mã (Extension không tìm thấy lưới): đổi vị trí 0 lời hỏi, 0 hẹn giờ, không báo bộ đọc hỏng, giữ khách đang xem',
    [free._calls.length, runTimer(free, 1000), free._banner.hidden, free.sheetLinkReaderFailureInput(), pickedFree], [0, null, true, '', ['CUS-000005']]);
  free.sheetLinkApplyCoreHints({ spreadsheetId: 'sheet-1', selectionHints: { readPlan: JSON.parse(JSON.stringify(planCoBan)) } });
  check(so, 'nạp core xong thì bỏ khóa sheet tự do cũ, lần ghé sau chép lại từ mẫu mới',
    [Object.prototype.hasOwnProperty.call(free.SHEET_LINK_READ_PLAN, 'Bao cao'), free.SHEET_LINK_FREE_SHEETS, free.sheetLinkIsFreeSheet('Bao cao')], [false, {}, true]);

  // Lời hỏi rẻ: Extension đang đọc được ở sheet hiện tại thì Sidebar bảo GAS khỏi mở bảng tính.
  const hoiRe = () => { free._calls = []; free.SHEET_LINK_SELECTION_PENDING = null; free.sheetLinkProbeSelectionAndReload('signal', { silent: true }); return free._calls[0].args[0].skipPosition; };
  const reKhongMa = hoiRe();
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(6, 5, { readStatus: 'ok', readReason: '', rawHeaderRow: [{ address: 'C1', column: 3, value: '@CUS_MA_KH' }], reads: [{ token: '!:@CUS_MA_KH', status: 'ok', matched: true, value: 'CUS-000005' }] }) });
  const reDocDuoc = hoiRe();
  free._clock.now = 5001 + 60000;
  const reExtChet = hoiRe();
  free._clock.now = 5001;
  check(so, 'skipPosition chỉ bật khi Extension còn sống và đọc được mã ở sheet đang đứng; sheet không mã hoặc Extension mất tín hiệu thì GAS tự đọc vị trí',
    [reKhongMa, reDocDuoc, reExtChet], [false, true, false]);

  free.SHEET_LINK_SELECTION_PENDING = { then: () => null };
  free.sheetLinkProbeSelectionAndReload('position', { needsSelection: true });
  check(so, 'lời đánh thức xếp hàng khi lời hỏi trước còn bay giữ cờ needsSelection đúng một lần',
    [free.sheetLinkTakeQueuedWake(), free.sheetLinkTakeQueuedWake()], [{ needsSelection: true }, undefined]);
  free.SHEET_LINK_SELECTION_PENDING = null;

  const readerResend = dungHopPoll(); batDau(readerResend); readerResend._calls = [];
  readerResend.SHEET_LINK_READ_PLAN = plan;
  readerResend.SHEET_LINK_LAST_ACK = 5000; readerResend._clock.now = 5001;
  readerResend.Store = { hasCustomer: (id) => id === 'CUS-000004' };
  const pickedResend = [];
  readerResend.ACTIONS.setCurrentCustomer = (input) => { pickedResend.push(input.pick); };
  let finishProbe = null;
  readerResend.callServer = (name, args, options) => { readerResend._calls.push({ name, args, options }); return { then: (ok) => { finishProbe = ok; return { then: () => null }; } }; };
  readerResend.sheetLinkOnMessage({ origin: readerResend.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { nonce: readerResend.SHEET_LINK_NONCE }) });
  runTimer(readerResend, 1000);
  readerResend.sheetLinkOnMessage({ origin: readerResend.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { nonce: readerResend.SHEET_LINK_NONCE, seq: 2, hint: '' }) });
  finishProbe(gasSelection('CUS-000004', 'C4'));
  check(so, 'Extension gửi lại cùng vị trí trong lúc GAS đang đọc thì câu trả lời GAS vẫn được áp',
    pickedResend, ['CUS-000004']);

  const readerOk = dungHopPoll(); batDau(readerOk); readerOk._calls = [];
  readerOk.SHEET_LINK_READ_PLAN = plan;
  readerOk.SHEET_LINK_LAST_ACK = 5000; readerOk._clock.now = 5001;
  readerOk.Store = { hasCustomer: () => true };
  const pickedOk = [];
  readerOk.ACTIONS.setCurrentCustomer = (input) => { pickedOk.push(input.pick); };
  readerOk.callServer = (name, args, options) => { readerOk._calls.push({ name, args, options }); return syncValue(gasSelection('CUS-000009', 'A4')); };
  readerOk.sheetLinkOnMessage({
    origin: readerOk.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: readerOk.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', cellRef: 'A4', hint: 'canvasClick', readStatus: 'ok', readReason: '', headerComplete: true, rawHeaderRow: [{ address: 'A1', column: 1, value: '@CUS_MA_KH' }], reads: [{ token: 'id', status: 'ok', matched: true, value: 'CUS-000004' }] }
  });
  check(so, 'Extension tự đọc được thì giữ quyền chọn khách, không hỏi GAS, không hiện băng',
    [pickedOk, readerOk._calls.length, readerOk._banner.hidden], [['CUS-000004'], 0, true]);

  const writeResponse = dungHopPoll(); batDau(writeResponse); writeResponse._calls = [];
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 3, records: ['CUS-1'] } }, 'saveRecord');
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 4, records: ['CUS-2'] } }, 'deleteRecords');
  check(so, 'save/delete đã trả kết quả thì không probe reload lần hai', writeResponse._calls, []);

  const queuedWake = dungHopPoll(); batDau(queuedWake);
  let releaseFirstProbe;
  let probeCalls = 0;
  const firstProbe = new Promise((resolve) => { releaseFirstProbe = resolve; });
  queuedWake.callServer = () => {
    probeCalls += 1;
    return probeCalls === 1 ? firstProbe : Promise.resolve({
      ok: true,
      reload: { revision: 2 },
      selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' },
      decision: { ram: { action: 'none' } }
    });
  };
  queuedWake.sheetLinkProbeSelectionAndReload('first-wake');
  queuedWake.sheetLinkProbeSelectionAndReload('second-wake');
  check(so, 'wake thứ hai trong lúc request bay chỉ được giữ như tín hiệu vận chuyển', [probeCalls, queuedWake.SHEET_LINK_SELECTION_WAKE_QUEUED], [1, true]);
  releaseFirstProbe({
    ok: true,
    reload: { revision: 1 },
    selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' },
    decision: { ram: { action: 'none' } }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'wake thứ hai được gửi thành request mới để GAS đọc ReloadState mới nhất', [probeCalls, queuedWake.SHEET_LINK_SELECTION_WAKE_QUEUED], [2, false]);

  const staleSelection = dungHopPoll(); batDau(staleSelection);
  staleSelection.Store.hasCustomer = () => true;
  staleSelection._picked = [];
  staleSelection.ACTIONS.setCurrentCustomer = ({ pick }) => { staleSelection._picked.push(pick); };
  staleSelection.SHEET_LINK_LAST_ACK = Date.now();
  let releaseStaleProbe;
  staleSelection.callServer = () => new Promise((resolve) => { releaseStaleProbe = resolve; });
  const context108 = { action: 'CRM_CONTEXT', nonce: staleSelection.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, reads: [{ status: 'ok', matched: true, value: 'CUS-108' }] };
  const context113 = Object.assign({}, context108, { seq: 2, row: 5, reads: [{ status: 'ok', matched: true, value: 'CUS-113' }] });
  staleSelection.sheetLinkOnMessage({ origin: staleSelection.SHEET_LINK_ORIGIN, data: context108 });
  staleSelection.sheetLinkProbeSelectionAndReload('old-selection');
  staleSelection.sheetLinkOnMessage({ origin: staleSelection.SHEET_LINK_ORIGIN, data: context113 });
  releaseStaleProbe({
    ok: true,
    reload: { revision: 0 },
    selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: 'CUS-108' },
    decision: { ram: { action: 'none' } }
  });
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'response GAS cũ không ghi đè context Extension mới', staleSelection._picked, ['CUS-108', 'CUS-113']);

  const direct = dungHopPoll(); batDau(direct); direct.Store.hasCustomer = () => true; direct._picked = [];
  direct.ACTIONS.setCurrentCustomer = ({ pick }) => { direct._picked.push(pick); };
  direct.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 4, col: 2, reads: [{ status: 'ok', matched: true, value: 'KH000001' }] });
  check(so, 'context Extension gửi reads được Sidebar đối chiếu thành mã khách', direct._picked, ['KH000001']);
  check(so, 'thiếu reads thì không đoán khách từ tọa độ', direct.sheetLinkCustomerIdFromContext({ sheetName: '!Lead', row: 4, col: 2 }), '');

  const immediate = dungHopPoll(); batDau(immediate); immediate.SHEET_LINK_LAST_SHEET = 'Customer';
  immediate.Store.hasCustomer = () => true; immediate._picked = [];
  immediate.ACTIONS.setCurrentCustomer = ({ pick }) => { immediate._picked.push(pick); };
  immediate.callServer = () => new Promise(() => {});
  immediate.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Activity', row: 4, col: 2, reads: [{ status: 'ok', matched: true, value: 'KH000002' }] });
  check(so, 'đổi sheet áp dụng khách ngay dù RPC kiểm tra dirty chưa trả', immediate._picked, ['KH000002']);

  const syncOpen = dungHopPoll(); batDau(syncOpen); syncOpen.FBM_SYNC_CLIENT = { active: true };
  syncOpen.Store.hasCustomer = () => true; syncOpen._picked = [];
  syncOpen.ACTIONS.setCurrentCustomer = ({ pick }) => { syncOpen._picked.push(pick); };
  syncOpen.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4, col: 1, reads: [{ status: 'ok', matched: true, value: 'KH-SYNC' }] });
  check(so, 'click ô khi đang ở module Đồng bộ không vẽ đè màn chính', syncOpen._picked, []);

  // Nhấp hàng không ra khách: báo đúng lý do thay vì giữ khách của hàng trước.
  const missHop = (sheetName) => {
    const h = dungHopPoll(); batDau(h);
    h.SHEET_LINK_LAST_SHEET = sheetName; h.SHEET_LINK_READ_PLAN = { Customer: [{ valueAddressTemplate: 'A{row}' }], Category: [{ valueAddressTemplate: '' }], '!': [{ valueAddressTemplate: 'A{row}' }] };
    h.Store.hasCustomer = (id) => id === 'CUS-000001';
    h._picked = []; h._misses = [];
    h.ACTIONS.setCurrentCustomer = ({ pick }) => { h._picked.push(pick); };
    h.screenViewSetSelectionMiss = (miss) => { h._misses.push(miss); h.ScreenState.selectionMiss = miss; };
    h.callServer = () => new Promise(() => {});
    return h;
  };
  const codeRead = (status, value) => ({ token: 'Customer:@CUS_MA_KH', status, matched: true, valueAddress: 'A5', value });
  const notFound = missHop('Customer');
  notFound.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A5', row: 5, col: 1, reads: [codeRead('ok', 'cus-999999')] });
  check(so, 'nhấp hàng có mã chưa có trong RAM báo không tìm thấy đúng mã, không đổi khách', [notFound._misses, notFound._picked], [[{ kind: 'notFound', code: 'CUS-999999' }], []]);
  notFound.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A6', row: 6, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  check(so, 'nhấp lại hàng cùng mã thiếu không vẽ lại lần hai', notFound._misses.length, 1);

  const header = missHop('Customer');
  header.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A1', row: 1, col: 1, reads: [codeRead('ok', '@CUS_MA_KH')] });
  check(so, 'một luật cho mọi hàng: hàng tiêu đề mang giá trị không phải mã có trong RAM thì báo không tìm thấy đúng giá trị đó, không giữ khách cũ', [header._misses, header._picked], [[{ kind: 'notFound', code: '@CUS_MA_KH' }], []]);
  const viewHeader = missHop('!lead');
  viewHeader.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!lead', cellRef: 'I3', row: 3, col: 9, readStatus: 'ok', reads: [codeRead('ok', '')] });
  check(so, 'ô mã của hàng đang chọn rỗng (hàng lọc sheet quản trị) thì báo rỗng', viewHeader._misses, [{ kind: 'empty' }]);
  const categoryHeader = missHop('Category');
  categoryHeader.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Category', cellRef: 'A1', row: 1, col: 1, readStatus: 'ok', reads: [] });
  check(so, 'sheet không có cột mã khách (Category), Extension đọc trọn: giá trị rỗng nên báo rỗng', categoryHeader._misses, [{ kind: 'empty' }]);
  const unread = missHop('Category');
  unread.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Category', cellRef: 'A1', row: 1, col: 1, readStatus: 'unavailable', reads: [] });
  check(so, 'Extension chưa đọc được hàng thì chưa báo gì, chờ GAS đọc thay', unread._misses, []);

  const dataEmpty = missHop('Customer');
  dataEmpty.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A7', row: 7, col: 1, readStatus: 'unavailable', reads: [codeRead('unavailable', '')] });
  check(so, 'sheet kho: ô mã vắng khỏi lưới Extension chưa báo trống, chờ GAS đọc thay', dataEmpty._misses, []);
  dataEmpty.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 7, col: 1, rowEnd: 7, colEnd: 1, customerId: '', customerIdChanged: true, customerCell: 'empty' }, { fromProbe: true });
  check(so, 'GAS đọc thay thấy ô mã trống thì báo hàng không có khách', dataEmpty._misses, [{ kind: 'empty' }]);

  const gasMiss = missHop('Customer');
  gasMiss.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 2, col: 1, rowEnd: 2, colEnd: 1, customerId: '', customerIdChanged: true, customerCell: '' }, { fromProbe: true });
  check(so, 'GAS không đọc ô mã (customerCell rỗng) thì chưa báo gì', gasMiss._misses, []);
  gasMiss._misses = []; gasMiss.ScreenState.selectionMiss = null;
  gasMiss.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 9, col: 1, rowEnd: 9, colEnd: 1, customerId: 'CUS-777777', customerIdChanged: true, customerCell: 'value' }, { fromProbe: true });
  check(so, 'GAS đọc được mã chưa có trong RAM thì báo không tìm thấy', gasMiss._misses, [{ kind: 'notFound', code: 'CUS-777777' }]);

  const freeEmpty = missHop('Nháp');
  freeEmpty.SHEET_LINK_READ_PLAN = { Customer: [], '!': [] };
  freeEmpty.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Nháp', cellRef: 'C7', row: 7, col: 3, readStatus: 'unavailable', reads: [codeRead('unavailable', '')] });
  check(so, 'sheet tự do: ô mã vắng dưới cột mã đúng tiêu đề là hàng không có khách', freeEmpty._misses, [{ kind: 'empty' }]);

  const missForm = missHop('Customer'); missForm.ScreenState.screen = 'customerForm';
  missForm.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A5', row: 5, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  const missSync = missHop('Customer'); missSync.FBM_SYNC_CLIENT = { active: true };
  missSync.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A5', row: 5, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  check(so, 'form đang mở hoặc đang đồng bộ FBM thì nhấp hàng không ra khách không đổi màn', [missForm._misses, missSync._misses], [[], []]);

  const taiLai = dungHopPoll(); batDau(taiLai); taiLai.SHEET_LINK_SEQ = 99;
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_HANDSHAKE_ACK', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi' } });
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi', spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1 } });
  const seqSauContextMoi = taiLai.SHEET_LINK_SEQ;
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-cu', spreadsheetId: 'sheet-1', seq: 200, sheetName: 'Customer', row: 5, col: 1 } });
  check(so, 'Extension tải lại đặt lại seq và bỏ context của phiên cũ', [seqSauContextMoi, taiLai.SHEET_LINK_SEQ], [1, 1]);

  const successfulReload = dungHopPoll(); batDau(successfulReload);
  successfulReload.SHEET_LINK_LAST_SEEN_REVISION = 0;
  successfulReload.refreshDirtyRecords = (ids, revision) => syncValue({ ok: true, ids, processedRevision: revision });
  await successfulReload.sheetLinkApplyDecisionResult({
    reload: { revision: 7, records: ['KH1'] },
    decision: { ram: { action: 'reload', mode: 'records', waitMs: 0 } }
  });
  check(so, 'chỉ ghi nhận revision sau khi reload Store thành công', successfulReload.SHEET_LINK_LAST_SEEN_REVISION, 7);

  const directPayload = dungHopPoll(); batDau(directPayload);
  directPayload.SHEET_LINK_LAST_SEEN_REVISION = 0;
  directPayload._payloads = [];
  directPayload.refreshReloadPayload = (payload) => { directPayload._payloads.push(payload.mode); return payload; };
  directPayload.callServer = (name) => { directPayload._calls.push(name); return syncValue({ ok: true }); };
  await directPayload.sheetLinkApplyDecisionResult({
    reload: { revision: 10, records: ['KH1'] },
    processedRevision: 10,
    payload: { mode: 'records', customer: { fields: [], rows: [] }, activity: { fields: [], rows: [] } }
  });
  check(so, 'payload probe được Sidebar áp dụng trực tiếp, không gọi reloadRecords lần hai',
    [directPayload._payloads, directPayload._calls, directPayload.SHEET_LINK_LAST_SEEN_REVISION],
    [['records'], [], 10]);

  directPayload._payloads = [];
  await directPayload.sheetLinkApplyDecisionResult({
    reload: { revision: 9, records: ['KH-OLD'] },
    processedRevision: 9,
    payload: { mode: 'records', customer: { fields: [], rows: [] }, activity: { fields: [], rows: [] } }
  });
  check(so, 'response payload cũ về muộn không ghi đè revision đã áp dụng',
    [directPayload._payloads, directPayload.SHEET_LINK_LAST_SEEN_REVISION], [[], 10]);

  const failedReload = dungHopPoll(); batDau(failedReload);
  failedReload.SHEET_LINK_LAST_SEEN_REVISION = 0;
  failedReload.refreshDirtyRecords = () => syncValue({ ok: false, error: 'reload failed' });
  await failedReload.sheetLinkApplyDecisionResult({
    reload: { revision: 8, records: ['KH2'] },
    decision: { ram: { action: 'reload', mode: 'records', waitMs: 0 } }
  });
  check(so, 'reload lỗi không đánh dấu revision đã xử lý', failedReload.SHEET_LINK_LAST_SEEN_REVISION, 0);

  const failedEvent = dungHopPoll(); batDau(failedEvent);
  failedEvent.SHEET_LINK_LAST_SEEN_REVISION = 0;
  failedEvent.sheetLinkSyncDirtyData = () => syncValue({ ok: false, error: 'reload failed' });
  failedEvent.sheetLinkOnMessage({
    origin: failedEvent.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_RELOAD', nonce: failedEvent.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', revision: 9 }
  });
  check(so, 'CRM_RELOAD không đánh dấu revision trước khi công việc thành công', failedEvent.SHEET_LINK_LAST_SEEN_REVISION, 0);

  await chayKenhBaoThayDoi(so);
}

/** Tín hiệu kênh `/bind` dồn dập: hẹn giờ theo lịch trễ, mọi lời hỏi qua cổng chung, không bao giờ song song. */
async function chayKenhBaoThayDoi(so) {
  const burst = dungHopPoll(); batDau(burst);
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
  runTimer(burst, 4000);
  tinHieu();
  check(so, 'tín hiệu đến lúc lời hỏi mốc đầu đang bay thì mở lại mốc đầu, không gọi GAS song song', [burst._calls.length, lichKenh().length], [1, 2]);
  runTimer(burst, 4000);
  runTimer(burst, 12000);
  check(so, 'các mốc chín trong lúc lời hỏi đang bay chỉ gộp thành tín hiệu chờ', [burst._calls.length, burst.SHEET_LINK_SELECTION_WAKE_QUEUED], [1, true]);
  traLoi.shift()();
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'lời hỏi xong thì đúng một lượt nối tiếp, cả đợt không lúc nào có hai lời hỏi cùng bay',
    [burst._calls, bayNhieuNhat], [['probeSelectionAndReload', 'probeSelectionAndReload'], 1]);
  traLoi.shift()();

  // Mốc 12 giây chỉ hỏi khi còn lý do; lời hỏi mốc đầu đã nạp trọn thì bỏ.
  const mocSau = async (revisionSau, tinHieuGiuaChung) => {
    const h = dungHopPoll(); batDau(h);
    h.SHEET_LINK_LAST_SEEN_REVISION = 10;
    h.callServer = (name) => { h._calls.push(name); return Promise.resolve({ ok: true, reload: { revision: revisionSau } }); };
    const tin = () => h.sheetLinkOnMessage({ origin: h.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: h.SHEET_LINK_NONCE, signal: 'channel' } });
    tin();
    h._clock.now += 4000; runTimer(h, 4000);
    await new Promise((resolve) => setImmediate(resolve));
    await new Promise((resolve) => setImmediate(resolve));
    if (tinHieuGiuaChung) { h._clock.now += 1000; tin(); }
    runTimer(h, 12000);
    await new Promise((resolve) => setImmediate(resolve));
    return h._calls.length;
  };
  check(so, 'lời hỏi mốc đầu đã thấy revision tăng và không có tín hiệu mới: mốc 12 giây không gọi GAS', await mocSau(11, false), 1);
  check(so, 'lời hỏi mốc đầu chưa thấy revision tăng (trigger chậm): mốc 12 giây vẫn hỏi', await mocSau(10, false), 2);
  check(so, 'có tín hiệu mới sau khi lời hỏi mốc đầu bắt đầu: mốc 12 giây vẫn hỏi', await mocSau(11, true), 2);

  // Kênh tự gửi lại yêu cầu trong cùng phiên không phải thay đổi; phiên mới hoặc Extension cũ vẫn là tín hiệu.
  const noiLai = (messages) => {
    const h = dungHopPoll(); batDau(h);
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

  const lanh = dungHopPoll(); batDau(lanh);
  lanh.SHEET_LINK_RAM_READY = false;
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: lanh.SHEET_LINK_NONCE } });
  lanh.SHEET_LINK_RAM_READY = true;
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_RELOAD', nonce: 'nonce-la' } });
  lanh.sheetLinkOnMessage({ origin: lanh.SHEET_LINK_ORIGIN, data: { action: 'CRM_CHANNEL_ALIVE', nonce: lanh.SHEET_LINK_NONCE } });
  check(so, 'chưa nạp RAM, sai nonce hoặc chỉ là nhịp sống thì không hẹn giờ hỏi GAS',
    Array.from(lanh._timers.values()).filter((item) => item.delay === 4000 || item.delay === 12000).length, 0);

  const canh = dungHopPoll(); batDau(canh);
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

  const an = dungHopPoll(); batDau(an);
  const nhipAn = (now) => { an._clock.now = now; an.SHEET_LINK_LAST_ACK = now; an.changeSignalWatchdog(now); };
  nhipAn(1000);
  an.document.hidden = true; nhipAn(500000);
  an.document.hidden = false; nhipAn(501000);
  an.navigator = { onLine: false }; nhipAn(900000);
  an.navigator = { onLine: true }; nhipAn(901000);
  an._clock.now = 2000000; an.SHEET_LINK_LAST_ACK = 0; an.changeSignalWatchdog(2000000);
  an.SHEET_LINK_LAST_ACK = 2001000; an.changeSignalWatchdog(2001000);
  check(so, 'thời gian tab ẩn, mất mạng hoặc vắng Extension không tính vào khoảng im', an.changeSignalChannelDead(), false);
}

/** Hộp cát cho phần sheet quản trị: ghi lại từng lời gọi máy chủ kèm lý do lời hỏi, trả câu trả lời dựng theo tên hàm. */
function dungHopView(answers) {
  const hop = dungHopPoll(); batDau(hop);
  hop.SHEET_LINK_LAST_ACK = 5000; hop._clock.now = 5001;
  hop._log = [];
  hop._answers = answers || {};
  hop.callServer = (name, args) => {
    hop._log.push({ name, reason: name === 'probeSelectionAndReload' ? args[0].reason : '', syncRunning: name === 'probeSelectionAndReload' ? args[0].syncRunning : null, options: name === 'renderViewIfDirty' ? args[1] : null });
    const answer = hop._answers[name];
    return Promise.resolve(typeof answer === 'function' ? answer(args) : (answer || { ok: true, reload: { revision: 0 } }));
  };
  return hop;
}

function tenGoi(hop, name) { return hop._log.filter((item) => item.name === name); }

async function chayView(so) {
  section('Sidebar — vẽ sheet quản trị khi có người xem');
  const fs = require('fs');
  const path = require('path');
  const { GAS_DIR } = require('../lib/load-gas');
  const probeRender = { ok: true, reload: { revision: 5 }, selection: { spreadsheetId: 'sheet-1', gid: '2', sheetName: '!Lead', row: 4, col: 1, rowEnd: 4, colEnd: 1 }, view: { sheetName: '!Lead', stale: true, action: 'render' } };
  const drawn = { ok: true, sheetName: '!Lead', rows: 3, viewMeta: { revision: 2, filterColumns: [2], sortColumns: [] } };

  const once = dungHopView({ probeSelectionAndReload: probeRender, renderViewIfDirty: drawn });
  await once.sheetLinkProbeSelectionAndReload('wake');
  await once.sheetLinkProbeSelectionAndReload('wake');
  check(so, 'view.action = render: Sidebar gọi renderViewIfDirty đúng một lần cho hai phản hồi cùng revision, không kèm controlsOnly',
    [tenGoi(once, 'probeSelectionAndReload').length, tenGoi(once, 'renderViewIfDirty').length, tenGoi(once, 'renderViewIfDirty')[0].options], [2, 1, {}]);
  once._answers.probeSelectionAndReload = Object.assign({}, probeRender, { reload: { revision: 6 } });
  await once.sheetLinkProbeSelectionAndReload('wake');
  check(so, 'revision mới thì được xin vẽ lần nữa', tenGoi(once, 'renderViewIfDirty').length, 2);

  // Bốn thời điểm đều đi qua đúng một lời hỏi chung.
  const open = dungHopView();
  await open.sheetLinkReplayContext();
  const enter = dungHopView({ renderViewIfDirty: drawn });
  enter.SHEET_LINK_LAST_SHEET = 'Customer';
  await enter.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 4, col: 1 });
  const visible = dungHopView();
  visible.SHEET_LINK_LAST_SHEET = '!Lead';
  visible._documentListeners.visibilitychange();
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'mở Sidebar, đổi sang sheet !, tab hiện lại: mỗi sự kiện sinh đúng một lời hỏi probeSelectionAndReload',
    [open, enter, visible].map((hop) => tenGoi(hop, 'probeSelectionAndReload').map((item) => item.reason)),
    [['sidebar-open'], ['view-enter'], ['visible']]);
  check(so, 'vào sheet ! không gọi bộ vẽ riêng ngoài quyết định của lời hỏi', tenGoi(enter, 'renderViewIfDirty'), []);
  enter.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 5, col: 1 });
  check(so, 'nhấp tiếp trên sheet ! chưa có metadata chỉ lấy metadata với controlsOnly, không vẽ sheet cũ',
    tenGoi(enter, 'renderViewIfDirty').map((item) => item.options), [{ controlsOnly: true }]);

  // Núm tắt: dòng báo hiện, bấm Làm mới vẽ xong thì mất; rời sheet cũng mất.
  const notify = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { view: { sheetName: '!Lead', stale: true, action: 'notify' } }) });
  notify.SHEET_LINK_LAST_SHEET = '!Lead';
  await notify.sheetLinkProbeSelectionAndReload('wake');
  const shown = [notify._viewNotice.hidden, notify.SHEET_LINK_VIEW_NOTICE_SHEET, tenGoi(notify, 'renderViewIfDirty').length];
  notify.sheetLinkViewApplyResult('!Lead', { ok: true, sheetName: '!Lead', rows: 3 });
  const afterRefresh = notify._viewNotice.hidden;
  await notify.sheetLinkProbeSelectionAndReload('wake');
  notify.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4, col: 1 });
  check(so, 'view.action = notify hiện dòng báo, không vẽ; vẽ thủ công xong thì dòng báo mất; rời sheet ! thì dòng báo mất',
    [shown, afterRefresh, notify._viewNotice.hidden], [[false, '!Lead', 0], true, true]);
  notify.SHEET_LINK_LAST_SHEET = '!Lead';
  notify.sheetLinkViewApplyResult('!Lead', { ok: false, skipped: true, sheetName: '!Lead', error: 'ô B3', viewMeta: { revision: 2, filterColumns: [2], sortColumns: [] } });
  check(so, 'GAS trả lượt thử gần nhất đã hỏng (ok:false) thì hiện dòng báo sheet cũ và thôi xin lấy metadata',
    [notify._viewNotice.hidden, notify.SHEET_LINK_VIEW_NOTICE_SHEET, notify.sheetLinkViewState('!Lead').needsSync], [false, '!Lead', false]);
  const sidebarHtml = fs.readFileSync(path.join(GAS_DIR, 'client', 'Sidebar.html'), 'utf8');
  const noticeHost = (sidebarHtml.match(/<div id="shin-view-stale"[\s\S]*?<\/div>/) || [''])[0];
  const actionsHtml = fs.readFileSync(path.join(GAS_DIR, 'client', 'ui', 'actions.html'), 'utf8');
  check(so, 'dòng báo dùng khuôn chữ + nút dùng chung, nút gọi action làm mới thủ công sẵn có và action đó áp kết quả vào trạng thái view',
    [noticeHost.indexOf('View chưa cập nhật') >= 0, noticeHost.indexOf('data-action="renderActiveViewSheet"') >= 0, noticeHost.indexOf('class="shin-undo"') >= 0,
      /renderActiveViewSheet[\s\S]*?sheetLinkViewApplyResult/.test(actionsHtml)], [true, true, true, true]);

  // Công tắc tự động làm mới.
  const viewSchema = fs.readFileSync(path.join(GAS_DIR, 'client', 'schema', 'screens', 'view.html'), 'utf8');
  const switchOn = dungHopView();
  switchOn.SHEET_LINK_LAST_SHEET = '!Lead';
  await switchOn.sheetLinkOnAutoRenderOn();
  const switchOther = dungHopView();
  switchOther.SHEET_LINK_LAST_SHEET = 'Customer';
  switchOther.sheetLinkOnAutoRenderOn();
  check(so, 'nhãn công tắc theo 03; bật núm khi đứng ở sheet ! hỏi GAS một lần, đứng ở sheet khác thì không gọi',
    [viewSchema.indexOf("label: 'Tự động làm mới sheet quản trị', action: 'toggleAutoRenderView'") >= 0,
      tenGoi(switchOn, 'probeSelectionAndReload').map((item) => item.reason), switchOther._log],
    [true, ['auto-render-on'], []]);
  check(so, 'bật núm chờ ghi UserProperties xong mới hỏi GAS',
    /toggleAutoRenderView[\s\S]*?sent\.then\(function \(value\) \{ sheetLinkOnAutoRenderOn\(\)/.test(actionsHtml), true);

  // Lượt đồng bộ đang chạy: GAS quyết hoãn từ cờ syncRunning; payload đã về thì GAS đã tiêu dấu bẩn nên Sidebar phải áp, chỉ hoãn vẽ view.
  const syncing = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { reload: { revision: 12, records: ['KH1'] }, processedRevision: 12, payload: { mode: 'records' } }), renderViewIfDirty: drawn });
  syncing.FBM_SYNC_CLIENT = { running: true, active: false };
  syncing._payloads = [];
  syncing.refreshReloadPayload = (payload) => { syncing._payloads.push(payload.mode); return payload; };
  syncing.SHEET_LINK_LAST_SEEN_REVISION = 3;
  await syncing.sheetLinkProbeSelectionAndReload('dirty-state');
  check(so, 'lượt đồng bộ đang chạy: lời hỏi báo syncRunning cho GAS; payload đã về vẫn được áp (bỏ là mất dữ liệu vì GAS đã xóa dấu bẩn), không vẽ view',
    [tenGoi(syncing, 'probeSelectionAndReload').map((item) => item.syncRunning), syncing._payloads, tenGoi(syncing, 'renderViewIfDirty').length, syncing.SHEET_LINK_LAST_SEEN_REVISION], [[true], ['records'], 0, 12]);
  syncing.FBM_SYNC_CLIENT.running = false;
  await syncing.sheetLinkSyncFinished();
  check(so, 'lượt kết thúc hỏi lại sync-finished với syncRunning tắt và vẽ view đã hoãn',
    [tenGoi(syncing, 'probeSelectionAndReload').map((item) => item.reason + ':' + item.syncRunning), tenGoi(syncing, 'renderViewIfDirty').length],
    [['dirty-state:true', 'sync-finished:false'], 1]);

  const fbm = taoHopCat({ console });
  napClient(fbm, 'client/sync/fbmSync.html');
  const finished = [];
  fbm.sheetLinkSyncFinished = () => finished.push(1);
  fbm.fbmSyncSetRunning(true); fbm.fbmSyncSetRunning(false); fbm.fbmSyncSetRunning(false);
  const fbmSource = fs.readFileSync(path.join(GAS_DIR, 'client', 'sync', 'fbmSync.html'), 'utf8');
  const directWrites = (fbmSource.match(/FBM_SYNC_CLIENT\.running\s*=[^=]/g) || []).length;
  check(so, 'mọi nhánh kết thúc lượt (xong, lỗi, hủy) đi qua một cửa đổi cờ: chuyển chạy → dừng gọi sync-finished đúng một lần, dừng → dừng không gọi',
    [finished.length, directWrites], [1, 1]);
}

module.exports = { chay: async (so) => { await chay(so); await chayView(so); } };
