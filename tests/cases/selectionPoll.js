/**
 * Ca kiểm nhịp dò dự phòng. Đồng hồ và lời gọi máy chủ đều là đồ giả, vì chỗ cần khóa là số vòng gọi trong nhiều phút chứ không phải bắt bộ kiểm ngồi chờ thời gian thật.
 */

const { napClient, taoHopCat } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function syncValue(value) {
  return {
    then(onValue, onError) {
      try {
        const next = onValue ? onValue(value) : value;
        return next && typeof next.then === 'function' ? next : syncValue(next);
      } catch (err) {
        return syncError(err);
      }
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
      } catch (err) {
        return syncError(err);
      }
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
    Date: { now: () => clock.now },
    document,
    window,
    setTimeout: (fn, delay) => {
      const id = nextTimer++;
      timers.set(id, { fn, delay });
      return id;
    },
    clearTimeout: (id) => timers.delete(id),
    setInterval: (fn, delay) => {
      const id = nextTimer++;
      intervals.set(id, { fn, delay });
      return id;
    },
    Prefs: { followSelection: true },
    SAVE_FLOW: { dangGui: false },
    ScreenState: { screen: 'view', currentCustomerId: '' },
    SCREEN_VIEW: 'view',
    SETTINGS: {
      SELECTION_POLL_MS: 2000,
      SELECTION_POLL_IDLE_MS: 6000,
      HANDSHAKE_PING_MS: 1000,
      EXTENSION_ACK_TIMEOUT_MS: 3000
    },
    ACTIONS: { setCurrentCustomer: () => null }
  });

  hop._clock = clock;
  hop._timers = timers;
  hop._intervals = intervals;
  hop._documentListeners = documentListeners;
  hop._windowListeners = windowListeners;
  hop._rootListeners = rootListeners;
  hop._banner = banner;
  hop._calls = [];
  hop.callServer = (name) => {
    hop._calls.push(name);
    if (name === 'probeSelectionCheap') {
      return syncValue({ spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1 });
    }
    return syncValue({ spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' });
  };

  napClient(hop, 'client/link/sheetLink.html', 'client/link/selectionPoll.html');
  return hop;
}

function timerDau(hop) {
  const first = hop._timers.entries().next();
  if (first.done) { return null; }
  const id = first.value[0];
  const timer = first.value[1];
  hop._timers.delete(id);
  timer.fn();
  return timer.delay;
}

function batDau(hop) {
  hop.selectionPollInstall();
  hop.sheetLinkInstall();
  hop.SHEET_LINK_SPREADSHEET_ID = 'sheet-1';
  hop.selectionPollSetReady(true);
}

function chay(so) {
  section('selectionPoll — ACK loại trừ polling và nhịp dự phòng không gọi chồng');

  let hop;
  try {
    hop = dungHopPoll();
  } catch (err) {
    return ghiLoiNap(so, 'nạp máy trạng thái polling', err);
  }

  batDau(hop);
  for (let giay = 1; giay <= 120; giay += 1) {
    hop._clock.now = giay * 1000;
    hop.sheetLinkOnMessage({ origin: hop.SHEET_LINK_ORIGIN, data: { action: 'CRM_HANDSHAKE_ACK', nonce: hop.SHEET_LINK_NONCE } });
  }
  check(so, 'ACK đều suốt hai phút thì không gọi máy chủ dù không có CRM_CONTEXT', [hop._calls.length, hop._timers.size, hop._banner.hidden], [0, 0, true]);

  hop._clock.now += 3001;
  hop.sheetLinkHandshakePing();
  timerDau(hop);
  check(so, 'ACK hết hạn thì bật cheap/full; ACK trở lại dừng ngay nhịp kế', hop._calls, ['probeSelectionCheap', 'probeSelectionFull']);
  hop._clock.now += 1;
  hop.sheetLinkOnMessage({ origin: hop.SHEET_LINK_ORIGIN, data: { action: 'CRM_HANDSHAKE_ACK', nonce: hop.SHEET_LINK_NONCE } });
  check(so, 'ACK trở lại xóa bộ đếm và ẩn cảnh báo', [hop._timers.size, hop._banner.hidden], [0, true]);

  const chan = dungHopPoll();
  batDau(chan);
  chan._clock.now = 4000;
  chan.Prefs.followSelection = false;
  chan.selectionPollEvaluate();
  const tat = chan._timers.size;
  chan.Prefs.followSelection = true;
  chan.document.hidden = true;
  chan.selectionPollEvaluate();
  const an = chan._timers.size;
  chan.document.hidden = false;
  chan.SAVE_FLOW.dangGui = true;
  chan.selectionPollEvaluate();
  const luu = chan._timers.size;
  check(so, 'tắt công tắc, tab ẩn hoặc đang lưu đều dừng hẳn bộ đếm', [tat, an, luu, chan._calls.length], [0, 0, 0, 0]);

  const chong = dungHopPoll();
  batDau(chong);
  chong._clock.now = 4000;
  chong.selectionPollClearTimer();
  let resolveCheap = null;
  chong.callServer = (name) => {
    chong._calls.push(name);
    return { then: (ok) => { resolveCheap = ok; return { then: () => null }; } };
  };
  chong.selectionPollTick();
  chong.selectionPollTick();
  check(so, 'lời gọi trước chưa về thì nhịp sau bị bỏ, không có hai vòng chồng nhau', [chong._calls, chong.SELECTION_POLL.inFlight, typeof resolveCheap], [['probeSelectionCheap'], true, 'function']);

  const bac = dungHopPoll();
  batDau(bac);
  bac._clock.now = 4000;
  bac.selectionPollClearTimer();
  bac.selectionPollTick();
  bac.selectionPollClearTimer();
  bac.selectionPollTick();
  bac.selectionPollClearTimer();
  bac.selectionPollTick();
  bac.selectionPollClearTimer();
  bac.selectionPollTick();
  check(so, 'ba câu trả lời không đổi chuyển sang nhịp nghỉ và chặn ở 6 giây', [bac.SELECTION_POLL.stableCount, bac.SELECTION_POLL.intervalMs, bac._calls], [3, 6000, ['probeSelectionCheap', 'probeSelectionFull', 'probeSelectionCheap', 'probeSelectionCheap', 'probeSelectionCheap']]);

  bac.SELECTION_POLL.intervalMs = 6000;
  bac.SELECTION_POLL.lastPosition = 'vị trí cũ';
  bac.selectionPollClearTimer();
  bac.selectionPollTick();
  const viTriDoi = Array.from(bac._timers.values())[0].delay;
  bac.selectionPollClearTimer();
  bac.SELECTION_POLL.intervalMs = 6000;
  bac._documentListeners.visibilitychange();
  const hienLai = Array.from(bac._timers.values())[0].delay;
  bac.selectionPollClearTimer();
  bac.SELECTION_POLL.intervalMs = 6000;
  bac._windowListeners.focus();
  const focus = Array.from(bac._timers.values())[0].delay;
  bac.selectionPollClearTimer();
  bac.SELECTION_POLL.intervalMs = 6000;
  bac._rootListeners.mouseenter();
  const mouse = Array.from(bac._timers.values())[0].delay;
  check(so, 'vị trí đổi, tab hiện lại, focus và chuột vào sidebar đều kéo về nhịp nhanh', [viTriDoi, hienLai, focus, mouse], [2000, 2000, 2000, 2000]);
}

module.exports = { chay };
