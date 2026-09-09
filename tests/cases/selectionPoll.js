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

  hop.Store = {
    rowMaps: {},
    applyRowMaps: (maps) => { hop.Store.rowMaps = maps; },
    getCustomerIdByRow: () => '',
    hasCustomer: () => false
  };

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

async function chay(so) {
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

  const khongExtension = dungHopPoll();
  batDau(khongExtension);
  khongExtension._calls = [];
  khongExtension.callServer = (name, args) => {
    khongExtension._calls.push(name + '(' + ((args && args[0]) || '') + ')');
    return syncValue({ ok: true, sheetName: '!Lead', rowMaps: { '!Lead': { '4': 'KH000001' } } });
  };
  khongExtension.selectionPollApplyResult({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 4, col: 2, customerId: 'KH000001', rowMaps: { '!Lead': { '4': 'KH000001' } }, viewMeta: { revision: 1, filterColumns: [1, 2], sortColumns: [] } });
  check(so, 'không có Extension thì kết quả full đã mang rowMap mới nên client không gọi trùng lần nữa',
    [khongExtension._calls, khongExtension.Store.rowMaps],
    [[], { '!Lead': { '4': 'KH000001' } }]);

  const tatSet = dungHopPoll();
  batDau(tatSet);
  tatSet.Prefs.followSelection = false;
  tatSet._calls = [];
  tatSet.callServer = (name, args) => {
    tatSet._calls.push(name + '(' + ((args && args[0]) || '') + ')');
    return syncValue({ ok: true, sheetName: '!Lead', rowMaps: { '!Lead': {} }, viewMeta: { revision: 1, filterColumns: [1], sortColumns: [] } });
  };
  tatSet.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 1, col: 1, customerId: '' });
  check(so, 'tắt nút sét chỉ ngừng đổi khách, không được chặn làm mới sheet quản trị khi Extension báo chuyển sheet',
    tatSet._calls,
    ['renderViewIfDirty(!Lead)']);

  const quaCau = dungHopPoll();
  batDau(quaCau);
  quaCau.Prefs.followSelection = false;
  quaCau._calls = [];
  quaCau.callServer = (name, args) => {
    quaCau._calls.push(name + '(' + ((args && args[0]) || '') + ')');
    return syncValue({ ok: true, sheetName: '!Lead', rowMaps: { '!Lead': {} }, viewMeta: { revision: 1, filterColumns: [1], sortColumns: [] } });
  };
  quaCau.sheetLinkOnMessage({
    origin: quaCau.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: quaCau.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: '!Lead', row: 4, col: 1 }
  });
  quaCau.sheetLinkOnMessage({
    origin: quaCau.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: 'nonce-sai', spreadsheetId: 'sheet-1', seq: 2, sheetName: '!Khac', row: 4, col: 1 }
  });
  check(so, 'CRM_CONTEXT đúng nonce đi trọn tới xử lý view, tin sai nonce bị bỏ',
    quaCau._calls,
    ['renderViewIfDirty(!Lead)']);

  const loiQuaCau = dungHopPoll();
  batDau(loiQuaCau);
  loiQuaCau._errors = [];
  loiQuaCau.dispatchError = (err) => { loiQuaCau._errors.push(err.message); };
  loiQuaCau.sheetLinkApplyContext = () => Promise.reject(new Error('không đồng bộ được context'));
  loiQuaCau.sheetLinkOnMessage({
    origin: loiQuaCau.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: loiQuaCau.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, sheetName: '!Lead', row: 4, col: 1 }
  });
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'Promise xử lý CRM_CONTEXT bị từ chối chỉ đi qua dispatchError đúng một lần',
    loiQuaCau._errors, ['không đồng bộ được context']);

  const cungSheet = dungHopPoll();
  batDau(cungSheet);
  cungSheet._calls = [];
  cungSheet.callServer = (name, args) => {
    cungSheet._calls.push(name + '(' + ((args && args[0]) || '') + ')');
    return syncValue({ ok: true, skipped: true, rowMaps: { '!Lead': { '4': 'KH000001', '7': 'KH000079' } }, viewMeta: { revision: 1, filterColumns: [1, 2], sortColumns: [] } });
  };
  cungSheet.Store.hasCustomer = () => true;
  cungSheet.Store.getCustomerIdByRow = (sheet, row) => cungSheet.Store.rowMaps[sheet] && cungSheet.Store.rowMaps[sheet][row] || '';
  cungSheet._picked = [];
  cungSheet.ACTIONS.setCurrentCustomer = ({ pick }) => { cungSheet._picked.push(pick); };
  cungSheet.sheetLinkApplyContext({ sheetName: '!Lead', row: 4, col: 2 });
  cungSheet.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2 });
  check(so, 'sau lần vào sheet, các lựa chọn dữ liệu cùng sheet dùng RAM ngay và không gọi máy chủ',
    [cungSheet._calls, cungSheet._picked],
    [['renderViewIfDirty(!Lead)'], ['KH000001', 'KH000079']]);

  const bootReplay = dungHopPoll();
  batDau(bootReplay);
  bootReplay.ScreenState.screen = 'customerForm';
  bootReplay.Store.hasCustomer = () => true;
  bootReplay.Store.getCustomerIdByRow = (sheet, row) => bootReplay.Store.rowMaps[sheet] && bootReplay.Store.rowMaps[sheet][row] || '';
  bootReplay._picked = [];
  bootReplay.ACTIONS.setCurrentCustomer = ({ pick }) => { bootReplay._picked.push(pick); };
  bootReplay.callServer = (name) => syncValue(name === 'renderViewIfDirty'
    ? { rowMaps: { '!Lead': { '4': 'KH000079' } }, viewMeta: { revision: 1, filterColumns: [], sortColumns: [] } }
    : {});
  bootReplay.sheetLinkApplyContext({ sheetName: '!Lead', row: 4, col: 2 });
  bootReplay.ScreenState.screen = 'view';
  bootReplay.sheetLinkReplayContext();
  check(so, 'context đến trước khi RAM nạp xong được áp lại sau bootstrap', bootReplay._picked, ['KH000079']);

  const daoThuTu = dungHopPoll();
  batDau(daoThuTu);
  daoThuTu.Store.hasCustomer = () => true;
  daoThuTu.Store.getCustomerIdByRow = (sheet, row) => daoThuTu.Store.rowMaps[sheet] && daoThuTu.Store.rowMaps[sheet][row] || '';
  daoThuTu._picked = [];
  daoThuTu.ACTIONS.setCurrentCustomer = ({ pick }) => { daoThuTu._picked.push(pick); };
  const replies = [];
  daoThuTu.callServer = () => new Promise((resolve) => { replies.push(resolve); });
  daoThuTu.sheetLinkApplyContext({ sheetName: '!Lead', row: 4, col: 2 });
  daoThuTu.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2 });
  const soRequestDangBay = replies.length;
  replies[0]({ ok: true, rowMaps: { '!Lead': { '4': 'KH000094', '7': 'KH000079' } }, viewMeta: { revision: 1, filterColumns: [1, 2], sortColumns: [] } });
  await Promise.resolve();
  await Promise.resolve();
  check(so, 'hai lựa chọn trong lúc đồng bộ dùng chung một request và chỉ lựa chọn mới nhất được mở',
    [soRequestDangBay, daoThuTu.Store.rowMaps, daoThuTu._picked],
    [1, { '!Lead': { '4': 'KH000094', '7': 'KH000079' } }, ['KH000079']]);

  const cauHinh = dungHopPoll();
  batDau(cauHinh);
  cauHinh.Store.hasCustomer = () => true;
  cauHinh.Store.getCustomerIdByRow = (sheet, row) => cauHinh.Store.rowMaps[sheet] && cauHinh.Store.rowMaps[sheet][row] || '';
  cauHinh.sidebarBusyRun = (message, work) => { cauHinh._busy.push(message); return work(); };
  cauHinh._busy = [];
  cauHinh._changed = false;
  cauHinh._calls = [];
  cauHinh.callServer = (name, args) => {
    cauHinh._calls.push(name + '(' + ((args && args[0]) || '') + ')');
    if (name === 'inspectViewState') { return syncValue({ ok: true, changed: cauHinh._changed, needsRender: false, revision: cauHinh._changed ? 2 : 1 }); }
    return syncValue({ ok: true, rowMaps: { '!Lead': { '4': 'KH000094', '7': 'KH000079' } }, viewMeta: { revision: cauHinh._changed ? 2 : 1, filterColumns: [1, 2], sortColumns: [4] } });
  };
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 4, col: 2, rowEnd: 4, colEnd: 2 });
  cauHinh._calls = [];
  cauHinh._busy = [];
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 3, col: 2, rowEnd: 3, colEnd: 2 });
  const callsKhiChiBam = cauHinh._calls.slice();
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2, rowEnd: 7, colEnd: 2 });
  check(so, 'chỉ bấm vào hàng 3 không làm gì; rời ô chỉ kiểm nhẹ và không bật overlay khi phiên bản không đổi',
    [callsKhiChiBam, cauHinh._calls, cauHinh._busy],
    [[], ['inspectViewState(!Lead)'], []]);

  cauHinh._calls = [];
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 3, col: 3, rowEnd: 3, colEnd: 3 });
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2, rowEnd: 7, colEnd: 2 });
  check(so, 'hàng 3 dưới cột không có mã @ không kiểm và không nạp lại', cauHinh._calls, []);

  cauHinh._calls = [];
  cauHinh._changed = true;
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 3, col: 2, rowEnd: 3, colEnd: 2 });
  cauHinh.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2, rowEnd: 7, colEnd: 2 });
  check(so, 'GAS xác nhận phiên bản đổi thì mới bật overlay và lấy rowMap mới đúng một lần',
    [cauHinh._calls, cauHinh._busy],
    [['inspectViewState(!Lead)', 'renderViewIfDirty(!Lead)'], ['Đang cập nhật sheet !Lead…']]);

  const chuyenSheet = dungHopPoll();
  batDau(chuyenSheet);
  chuyenSheet.Store.hasCustomer = () => true;
  chuyenSheet.Store.getCustomerIdByRow = (sheet, row) => chuyenSheet.Store.rowMaps[sheet] && chuyenSheet.Store.rowMaps[sheet][row] || '';
  chuyenSheet._picked = [];
  chuyenSheet._busy = [];
  chuyenSheet.ACTIONS.setCurrentCustomer = ({ pick }) => { chuyenSheet._picked.push(pick); };
  chuyenSheet.sidebarBusyRun = (message, work) => { chuyenSheet._busy.push(message); return work(); };
  chuyenSheet.refreshDirtyRecords = (ids) => {
    chuyenSheet._calls.push('refreshDirtyRecords(' + ids.join(',') + ')');
    return syncValue({ ok: true });
  };
  const transitionReplies = [];
  chuyenSheet.callServer = (name) => {
    chuyenSheet._calls.push(name);
    return new Promise((resolve) => { transitionReplies.push({ name, resolve }); });
  };
  chuyenSheet.sheetLinkApplyContext({ sheetName: 'Customer', row: 4, col: 2 });
  chuyenSheet._calls = [];
  chuyenSheet.sheetLinkApplyContext({ sheetName: '!Lead', row: 4, col: 2 });
  chuyenSheet.sheetLinkApplyContext({ sheetName: '!Lead', row: 7, col: 2 });
  const callsBeforeDirtyReply = chuyenSheet._calls.slice();
  transitionReplies[0].resolve({
    ok: true,
    changed: false,
    needsRender: true,
    revision: 1,
    dirty: { all: false, config: false, records: ['KH000079'], viewSheets: ['!Lead'] }
  });
  await new Promise((resolve) => setImmediate(resolve));
  transitionReplies[1].resolve({ ok: true, rowMaps: { '!Lead': { '4': 'KH000094', '7': 'KH000079' } }, viewMeta: { revision: 2, filterColumns: [1, 2], sortColumns: [] } });
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'rời sheet dữ liệu sang view dùng một overlay cho cả kiểm tra dirty và rowMap; tọa độ mới nhất chờ cùng lượt',
    [callsBeforeDirtyReply, chuyenSheet._calls, chuyenSheet._busy, chuyenSheet._picked],
    [['inspectViewState'], ['inspectViewState', 'refreshDirtyRecords(KH000079)', 'renderViewIfDirty'], ['Đang cập nhật dữ liệu và sheet !Lead…'], ['KH000079']]);

  const taiLai = dungHopPoll();
  batDau(taiLai);
  taiLai.SHEET_LINK_SEQ = 99;
  taiLai.sheetLinkOnMessage({
    origin: taiLai.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_HANDSHAKE_ACK', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi' }
  });
  const seqSauAckMoi = taiLai.SHEET_LINK_SEQ;
  taiLai.sheetLinkOnMessage({
    origin: taiLai.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi', spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1 }
  });
  const seqSauContextMoi = taiLai.SHEET_LINK_SEQ;
  taiLai.sheetLinkOnMessage({
    origin: taiLai.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-cu', spreadsheetId: 'sheet-1', seq: 200, sheetName: 'Customer', row: 5, col: 1 }
  });
  check(so, 'tải lại Extension đặt lại seq đúng một lần và bỏ context sót từ phiên cũ',
    [seqSauAckMoi, seqSauContextMoi, taiLai.SHEET_LINK_SEQ],
    [0, 1, 1]);
}

module.exports = { chay };
