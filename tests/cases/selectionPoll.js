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
    ACTIONS: { setCurrentCustomer: () => null }
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
  hop.SHEET_LINK_SHOW_PROBE_PROGRESS_DEBUG = true;
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
  check(so, 'probe selection debug hiện loading', hop.SHEET_LINK_SHOW_PROBE_PROGRESS_DEBUG, true);
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

  const safetyVisibleProbe = dungHopPoll(); batDau(safetyVisibleProbe); safetyVisibleProbe.SHEET_LINK_SHOW_PROBE_PROGRESS_DEBUG = false;
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.callServer = (name, args, options) => { safetyVisibleProbe._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  const visibleSafetyTimer = Array.from(safetyVisibleProbe._timers.values()).find((item) => item.delay === 60000);
  visibleSafetyTimer.fn();
  check(so, 'cờ nghiệm thu loading tắt: safety request chạy im lặng (tài liệu 05)', safetyVisibleProbe._calls[0].options.silent, true);
  safetyVisibleProbe._calls = [];
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

  // Sheet xem tự do: Sidebar chưa biết sheet có cột mã hay không thì hỏi GAS đúng một lần, nhớ plan GAS trả về rồi để Extension đọc tiếp.
  const freePlanItems = [{ token: 'Bao cao:@CUS_MA_KH', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }];
  const free = dungHopPoll(); batDau(free); free._calls = [];
  free.SHEET_LINK_READ_PLAN = Object.assign({ Activity: [], Category: [], Config: [], '!': [] }, plan);
  free.SHEET_LINK_LAST_ACK = 5000; free._clock.now = 5001;
  free.Store = { hasCustomer: (id) => /^CUS-00000[4-6]$/.test(id) };
  const pickedFree = [];
  free.ACTIONS.setCurrentCustomer = (input) => { pickedFree.push(input.pick); };
  let freeReply = { ok: true, reload: { revision: 0 }, sheetPlan: { sheetName: 'Bao cao', items: freePlanItems }, selection: { spreadsheetId: 'sheet-1', gid: '9', sheetName: 'Bao cao', cellRef: 'C4', row: 4, col: 3, rowEnd: 4, colEnd: 3, customerId: 'CUS-000004' } };
  free.callServer = (name, args, options) => { free._calls.push({ name, args, options }); return syncValue(freeReply); };
  const freeContext = (seq, row, extra) => Object.assign({ action: 'CRM_CONTEXT', nonce: free.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq, gid: '9', sheetName: 'Bao cao', cellRef: 'C' + row, row, col: 3, readStatus: 'unavailable', readReason: 'LIVE_GRID_NOT_FOUND', rawHeaderRow: [], reads: [] }, extra || {});
  check(so, 'sheet tự do chưa phân loại: sheetLinkPlanForSheet trả mảng rỗng và được coi là chưa phân loại',
    [free.sheetLinkPlanForSheet('Bao cao'), free.sheetLinkSheetUnclassified('Bao cao'), free.sheetLinkSheetUnclassified('Customer'), free.sheetLinkSheetUnclassified('!lead')], [[], true, false, false]);
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(1, 4) });
  check(so, 'sheet tự do chưa phân loại: đúng một lời hỏi sau nhịp đổi vị trí, mang needsSelection, không báo Log hỏng bộ đọc',
    [runTimer(free, 1000), free._calls.length, free._calls[0].args[0].needsSelection, free._calls[0].args[0].extensionReadFailure], [1000, 1, true, '']);
  check(so, 'sheet tự do: Sidebar nhớ plan GAS trả về theo đúng tên sheet và mở khách GAS đọc thay',
    [free.sheetLinkPlanForSheet('Bao cao'), free.sheetLinkSheetUnclassified('Bao cao'), pickedFree], [freePlanItems, false, ['CUS-000004']]);

  free.SHEET_LINK_SELECTION_PENDING = null; free._calls = [];
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(2, 5, { readStatus: 'ok', readReason: '', rawHeaderRow: [{ address: 'B1', column: 2, value: '@CUS_MA_KH' }], reads: [{ token: 'Bao cao:@CUS_MA_KH', status: 'ok', matched: true, value: 'CUS-000005' }] }) });
  check(so, 'sheet tự do có plan, Extension đọc ok: 0 lời hỏi, 0 hẹn giờ đánh thức, mở đúng khách Extension đọc',
    [free._calls.length, runTimer(free, 1000), pickedFree], [0, null, ['CUS-000004', 'CUS-000005']]);

  freeReply = Object.assign({}, freeReply, { sheetPlan: { sheetName: 'Bao cao', items: freePlanItems }, selection: Object.assign({}, freeReply.selection, { cellRef: 'C6', row: 6, customerId: 'CUS-000006' }) });
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(3, 6) });
  check(so, 'sheet tự do có plan, Extension đọc hỏng ở vị trí mới: đúng một lời hỏi mang extensionReadFailure và needsSelection',
    [runTimer(free, 1000), free._calls.length, free._calls[0].args[0].extensionReadFailure, free._calls[0].args[0].needsSelection, pickedFree[2]], [1000, 1, 'LIVE_GRID_NOT_FOUND', true, 'CUS-000006']);

  free.SHEET_LINK_SELECTION_PENDING = null; free._calls = [];
  freeReply = { ok: true, reload: { revision: 0 }, sheetPlan: { sheetName: 'Ghi chu', items: [] }, selection: { spreadsheetId: 'sheet-1', gid: '10', sheetName: 'Ghi chu', cellRef: 'A4', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } };
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(4, 4, { gid: '10', sheetName: 'Ghi chu', cellRef: 'A4', col: 1 }) });
  runTimer(free, 1000);
  free.SHEET_LINK_SELECTION_PENDING = null;
  free.sheetLinkOnMessage({ origin: free.SHEET_LINK_ORIGIN, data: freeContext(5, 7, { gid: '10', sheetName: 'Ghi chu', cellRef: 'A7', col: 1 }) });
  check(so, 'sheet không có cột mã: hỏi GAS đúng một lần, nhớ plan rỗng, lần đổi vị trí sau không hỏi và không hẹn giờ',
    [free._calls.length, free.sheetLinkSheetUnclassified('Ghi chu'), runTimer(free, 1000)], [1, false, null]);

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
    hop._log.push({ name, reason: name === 'probeSelectionAndReload' ? args[0].reason : '', options: name === 'renderViewIfDirty' ? args[1] : null });
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

  // Lượt đồng bộ đang chạy: hoãn payload và vẽ, giữ mốc revision.
  const syncing = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { reload: { revision: 12, records: ['KH1'] }, processedRevision: 12, payload: { mode: 'records' } }), renderViewIfDirty: drawn });
  syncing.FBM_SYNC_CLIENT = { running: true, active: false };
  syncing._payloads = [];
  syncing.refreshReloadPayload = (payload) => { syncing._payloads.push(payload.mode); return payload; };
  syncing.SHEET_LINK_LAST_SEEN_REVISION = 3;
  await syncing.sheetLinkProbeSelectionAndReload('dirty-state');
  check(so, 'lượt đồng bộ đang chạy: payload reload bị hoãn, không vẽ view, SHEET_LINK_LAST_SEEN_REVISION giữ nguyên',
    [syncing._payloads, tenGoi(syncing, 'renderViewIfDirty').length, syncing.SHEET_LINK_LAST_SEEN_REVISION], [[], 0, 3]);
  syncing.FBM_SYNC_CLIENT.running = false;
  await syncing.sheetLinkSyncFinished();
  check(so, 'lượt kết thúc hỏi lại sync-finished và nhận phần đã hoãn',
    [tenGoi(syncing, 'probeSelectionAndReload').map((item) => item.reason), syncing._payloads, syncing.SHEET_LINK_LAST_SEEN_REVISION, tenGoi(syncing, 'renderViewIfDirty').length],
    [['dirty-state', 'sync-finished'], ['records'], 12, 1]);

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
