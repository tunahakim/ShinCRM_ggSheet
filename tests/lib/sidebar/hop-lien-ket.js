/**
 * Hộp cát cho tầng liên kết của Sidebar (`client/link/`): đồng hồ, hẹn giờ và DOM giả, `callServer` trả ngay, nạp các tệp liên kết theo thứ tự Sidebar.
 *
 * Một chỗ cho các tệp ca `tests/cases/link/`, để ba bộ thăm dò chọn ô, kênh báo thay đổi và đồng bộ sheet quản trị được kiểm trên cùng một hộp.
 */

const { taoHopCat } = require('../load-gas');
const { napTheoSidebar } = require('./nap-sidebar');

/** Lời hứa chạy đồng bộ: `then` gọi ngay, để phép kiểm đọc kết quả mà không phải chờ vòng sự kiện. */
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

/** Hộp có đồng hồ `_clock`, hẹn giờ `_timers`/`_intervals`, nghe sự kiện, dòng báo đáy, và `callServer` ghi lại tên lời gọi. */
function dungHopLienKet() {
  const clock = { now: 0 };
  const timers = new Map();
  const intervals = new Map();
  const documentListeners = {};
  const windowListeners = {};
  const rootListeners = {};
  let nextTimer = 1;
  // Dòng báo ở đáy: `_banner.textContent` đọc chữ của nó để các phép kiểm Extension giữ nguyên cách viết.
  const noticeText = { textContent: '' };
  const noticeButton = { hidden: true, textContent: '', setAttribute(name, value) { this[name] = value; } };
  const banner = { hidden: true, get textContent() { return noticeText.textContent; } };
  const root = { addEventListener: (name, fn) => { rootListeners[name] = fn; } };
  const document = {
    hidden: false,
    addEventListener: (name, fn) => { documentListeners[name] = fn; },
    getElementById: (id) => ({ 'sidebar-root': root, 'shin-notice': banner, 'shin-notice-text': noticeText, 'shin-notice-btn': noticeButton, 'shin-notice-screen': hop && hop._noticeScreen ? {} : null })[id] || null,
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
  hop._banner = banner; hop._noticeButton = noticeButton; hop._calls = []; hop._options = [];
  // Màn thông báo: chỉ ghi lại lần vẽ, cờ `_noticeScreen` đứng thay cho khối gốc trong DOM.
  hop._screens = [];
  hop.UI_SCHEMA = { view: {} };
  hop.screenBuild = () => ({ header: [] });
  hop.statusNotices = (infoText, blocks) => { hop._noticeScreen = true; hop._screens.push({ infoText, titles: blocks.map((block) => block.title) }); return null; };
  hop.screenViewRender = () => { hop._noticeScreen = false; hop._screens.push('view'); return null; };
  hop.callServer = (name, args, options) => {
    hop._calls.push(name);
    hop._options.push(options || {});
    return syncValue({ ok: true, spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '', reload: { revision: 0 } });
  };
  napTheoSidebar(['client/ram/refresh.html', 'client/ui/notices.html', 'client/link/sheetLink.html', 'client/link/selectionPoll.html', 'client/link/changeSignal.html'], hop);
  // Các phép kiểm request giữ hợp đồng bàn giao im lặng; bản chạy DEV trực quan bật cờ này ở runtime.
  hop.SETTINGS.SHOW_PROBE_PROGRESS_DEBUG = true;
  return hop;
}

/** Cài ba bộ liên kết và đánh dấu Sidebar sẵn sàng. */
function batDauLienKet(hop) {
  hop.selectionPollInstall(); hop.sheetLinkInstall(); hop.changeSignalInstall(); hop.SHEET_LINK_SPREADSHEET_ID = 'sheet-1'; hop.selectionPollSetReady(true);
}

/** Chạy một hẹn giờ có độ trễ `delay`; không có thì trả null. */
function chayHenGio(hop, delay) {
  const entry = Array.from(hop._timers.entries()).find((item) => item[1].delay === delay);
  if (!entry) { return null; }
  hop._timers.delete(entry[0]); entry[1].fn(); return entry[1].delay;
}

module.exports = { syncValue, syncError, dungHopLienKet, batDauLienKet, chayHenGio };
