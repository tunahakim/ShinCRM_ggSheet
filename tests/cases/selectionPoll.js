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
  const root = { addEventListener: (name, fn) => { rootListeners[name] = fn; } };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => { documentListeners[name] = fn; },
    getElementById: (id) => id === 'sidebar-root' ? root : (id === 'shin-extension-warning' ? banner : null),
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
    SETTINGS: { SELECTION_POLL_MS: 2000, SELECTION_POLL_IDLE_MS: 6000, POSITION_WAKE_MS: 1000, EDIT_SETTLE_MS: 3000, HANDSHAKE_PING_MS: 1000, EXTENSION_ACK_TIMEOUT_MS: 3000, RELOAD_SAFETY_POLL_MS: 60000 },
    ACTIONS: { setCurrentCustomer: () => null }
  });
  hop.Store = { hasCustomer: () => false };
  hop._clock = clock; hop._timers = timers; hop._intervals = intervals;
  hop._documentListeners = documentListeners; hop._windowListeners = windowListeners; hop._rootListeners = rootListeners;
  hop._banner = banner; hop._calls = []; hop._options = [];
  hop.callServer = (name, args, options) => {
    hop._calls.push(name);
    hop._options.push(options || {});
    return syncValue({ ok: true, spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '', reload: { revision: 0 } });
  };
  napClient(hop, 'client/ram/refresh.html', 'client/link/sheetLink.html', 'client/link/selectionPoll.html');
  // Các phép kiểm request giữ hợp đồng bàn giao im lặng; bản chạy DEV trực quan bật cờ này ở runtime.
  hop.SHEET_LINK_SHOW_PROBE_PROGRESS_DEBUG = true;
  return hop;
}

function batDau(hop) {
  hop.selectionPollInstall(); hop.sheetLinkInstall(); hop.SHEET_LINK_SPREADSHEET_ID = 'sheet-1'; hop.selectionPollSetReady(true);
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
  check(so, 'fallback probe chạy silent, chỉ payload thật mới hiện loading', hop._options[0].silent, true);
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
  check(so, 'safety request chạy silent không bật loading', [safety._calls[0].name, safety._calls[0].options.silent], ['probeSelectionAndReload', true]);

  const safetyVisibleProbe = dungHopPoll(); batDau(safetyVisibleProbe); safetyVisibleProbe.SHEET_LINK_SHOW_PROBE_PROGRESS_DEBUG = true;
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.callServer = (name, args, options) => { safetyVisibleProbe._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  const visibleSafetyTimer = Array.from(safetyVisibleProbe._timers.values()).find((item) => item.delay === 60000);
  visibleSafetyTimer.fn();
  check(so, 'safety request vẫn silent dù cờ nghiệm thu loading đang bật', safetyVisibleProbe._calls[0].options.silent, true);

  const wake = dungHopPoll(); batDau(wake); wake._calls = [];
  wake.callServer = (name, args, options) => { wake._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  const ctx = { action: 'CRM_CONTEXT', nonce: wake.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, hint: 'keydown' };
  wake.sheetLinkOnMessage({ origin: wake.SHEET_LINK_ORIGIN, data: ctx });
  wake.sheetLinkOnMessage({ origin: wake.SHEET_LINK_ORIGIN, data: Object.assign({}, ctx, { seq: 2 }) });
  const wakeTimer = Array.from(wake._timers.values()).find((item) => item.delay === 3000);
  check(so, 'keydown liên tiếp chỉ giữ một timer debounce ba giây', [Boolean(wakeTimer), wake._timers.size >= 2], [true, true]);
  wakeTimer.fn();
  check(so, 'hết debounce chỉ hỏi GAS một request và loading debug bật', [wake._calls.length, wake._calls[0].name, wake._calls[0].options.silent], [1, 'probeSelectionAndReload', false]);

  const appFocus = dungHopPoll(); batDau(appFocus); appFocus._calls = [];
  appFocus.SHEET_LINK_LAST_ACK = 5000; appFocus._clock.now = 5001;
  appFocus.selectionPollWake();
  check(so, 'focus/chuyển app không tự gọi GAS khi Extension còn sống', appFocus._calls, []);
  appFocus._documentListeners.visibilitychange();
  check(so, 'visibilitychange không tự gọi GAS lần thứ hai', appFocus._calls, []);

  const irrelevant = dungHopPoll(); batDau(irrelevant); irrelevant._calls = [];
  irrelevant.sheetLinkOnMessage({
    origin: irrelevant.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: irrelevant.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Blank', cellRef: 'A4', rawHeaderRow: [], headerComplete: true }
  });
  check(so, 'context sheet trắng không đặt wake request',
    [irrelevant._calls.length, Array.from(irrelevant._timers.values()).some((item) => item.delay === 1000)], [0, false]);

  const knownBlank = dungHopPoll(); batDau(knownBlank); knownBlank._calls = [];
  knownBlank.sheetLinkOnMessage({
    origin: knownBlank.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: knownBlank.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', cellRef: 'A4', rawHeaderRow: [], headerComplete: true }
  });
  check(so, 'sheet mặc định không có mã @ không đặt wake request',
    [knownBlank._calls.length, Array.from(knownBlank._timers.values()).some((item) => item.delay === 1000)], [0, false]);

  const wholeRows = dungHopPoll(); batDau(wholeRows); wholeRows._calls = [];
  wholeRows.SHEET_LINK_READ_PLAN = { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' }] };
  wholeRows.sheetLinkOnMessage({
    origin: wholeRows.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: wholeRows.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', cellRef: '5:7', rawHeaderRow: [{ address: 'A1', column: 1, value: '@CUS_MA_KH' }], headerComplete: true }
  });
  check(so, 'selection nguyên hàng vẫn đặt wake khi sheet có cột mã',
    Array.from(wholeRows._timers.values()).some((item) => item.delay === 3000), true);

  const writeResponse = dungHopPoll(); batDau(writeResponse); writeResponse._calls = [];
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 3, records: ['CUS-1'] } }, 'saveRecord');
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 4, records: ['CUS-2'] } }, 'deleteRecords');
  check(so, 'save/delete đã trả kết quả thì không probe reload lần hai', writeResponse._calls, []);

  const relevant = dungHopPoll(); batDau(relevant); relevant._calls = [];
  relevant.sheetLinkOnMessage({
    origin: relevant.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: relevant.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', cellRef: 'A4', rawHeaderRow: [], headerComplete: false }
  });
  check(so, 'context cột reload hợp lệ vẫn đặt wake debounce', Array.from(relevant._timers.values()).some((item) => item.delay === 1000), true);

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
  const context108 = { action: 'CRM_CONTEXT', nonce: staleSelection.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: 'CUS-108' };
  const context113 = Object.assign({}, context108, { seq: 2, row: 5, customerId: 'CUS-113' });
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
  direct.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 4, col: 2, customerId: 'KH000001' });
  check(so, 'context Extension gửi mã khách được dùng trực tiếp, không suy từ tọa độ', direct._picked, ['KH000001']);
  check(so, 'thiếu customerId thì không đoán khách từ tọa độ', direct.sheetLinkCustomerIdFromContext({ sheetName: '!Lead', row: 4, col: 2 }), '');

  const immediate = dungHopPoll(); batDau(immediate); immediate.SHEET_LINK_LAST_SHEET = 'Customer';
  immediate.Store.hasCustomer = () => true; immediate._picked = [];
  immediate.ACTIONS.setCurrentCustomer = ({ pick }) => { immediate._picked.push(pick); };
  immediate.callServer = () => new Promise(() => {});
  immediate.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Activity', row: 4, col: 2, customerId: 'KH000002' });
  check(so, 'đổi sheet áp dụng khách ngay dù RPC kiểm tra dirty chưa trả', immediate._picked, ['KH000002']);

  const syncOpen = dungHopPoll(); batDau(syncOpen); syncOpen.FBM_SYNC_CLIENT = { active: true };
  syncOpen.Store.hasCustomer = () => true; syncOpen._picked = [];
  syncOpen.ACTIONS.setCurrentCustomer = ({ pick }) => { syncOpen._picked.push(pick); };
  syncOpen.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4, col: 1, customerId: 'KH-SYNC' });
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
}

module.exports = { chay };
