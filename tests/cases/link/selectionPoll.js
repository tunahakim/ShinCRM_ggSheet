/** `client/link/selectionPoll.html` và `sheetLink.html`: dự phòng chọn ô khi vắng Extension, một lời hỏi chọn ô và nạp lại, debounce tín hiệu, safety poll. */

const { section, check, ghiLoiNap } = require('../../lib/assert');
const { syncValue, dungHopLienKet, batDauLienKet, chayHenGio } = require('../../lib/sidebar/hop-lien-ket');

async function chay(so) {
  section('selectionPoll — một request selection/reload, debounce hint và safety poll');
  let hop;
  try { hop = dungHopLienKet(); } catch (err) { return ghiLoiNap(so, 'nạp máy trạng thái polling', err); }

  batDauLienKet(hop);
  check(so, 'probe selection debug hiện loading', hop.sheetLinkShowProbeProgress(), true);
  check(so, 'mouseenter Sidebar không còn là tín hiệu đánh thức', hop._rootListeners.mouseenter, undefined);
  hop._clock.now = 4000; hop.selectionPollClearTimer(); hop.selectionPollTick();
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'fallback không có Extension gọi đúng một request GAS', hop._calls, ['probeSelectionAndReload']);
  check(so, 'cờ nghiệm thu loading bật: lời hỏi nền fallback cũng hiện loading ngay khi gửi',
    hop._options[0].silent,
    false);
  check(so, 'fallback giữ nhịp nhanh khi vị trí thay đổi', chayHenGio(hop, 2000), 2000);

  const chong = dungHopLienKet(); batDauLienKet(chong); chong._clock.now = 4000; chong.selectionPollClearTimer();
  let resolveProbe = null;
  chong.callServer = (name, args, options) => { chong._calls.push({ name, args, options }); return { then: (ok) => { resolveProbe = ok; return { then: () => null }; } }; };
  chong.selectionPollTick(); chong.selectionPollTick();
  check(so, 'request selection đang bay thì nhịp sau không tạo request chồng',
    [chong._calls.length, chong.SELECTION_POLL.inFlight, typeof resolveProbe],
    [1, true, 'function']);

  const stable = dungHopLienKet(); batDauLienKet(stable); stable._clock.now = 4000;
  for (let i = 0; i < 4; i += 1) { stable.selectionPollClearTimer(); stable.selectionPollTick(); await new Promise((resolve) => setImmediate(resolve)); }
  check(so, 'vị trí ổn định chuyển fallback sang nhịp nghỉ sáu giây',
    [stable.SELECTION_POLL.stableCount, stable.SELECTION_POLL.intervalMs],
    [3, 6000]);

  const safety = dungHopLienKet(); batDauLienKet(safety);
  const safetyTimer = Array.from(safety._timers.values()).find((item) => item.delay === 60000);
  check(so, 'safety polling được lập lịch độc lập với Extension', Boolean(safetyTimer), true);
  safety._calls = [];
  safety.callServer = (name, args, options) => { safety._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  safetyTimer.fn();
  check(so, 'cờ nghiệm thu loading bật: safety request hiện loading ngay khi gửi',
    [safety._calls[0].name, safety._calls[0].options.silent],
    ['probeSelectionAndReload', false]);

  const safetyVisibleProbe = dungHopLienKet(); batDauLienKet(safetyVisibleProbe); safetyVisibleProbe.SETTINGS.SHOW_PROBE_PROGRESS_DEBUG = false;
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.callServer = (name, args, options) => { safetyVisibleProbe._calls.push({ name, args, options }); return syncValue({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' } }); };
  const visibleSafetyTimer = Array.from(safetyVisibleProbe._timers.values()).find((item) => item.delay === 60000);
  visibleSafetyTimer.fn();
  check(so, 'cờ nghiệm thu loading tắt: safety request chạy im lặng (tài liệu 05)',
    safetyVisibleProbe._calls[0].options.silent,
    true);
  safetyVisibleProbe._calls = [];
  safetyVisibleProbe.SHEET_LINK_SELECTION_PENDING = null;
  safetyVisibleProbe.sheetLinkProbeSelectionAndReload('position', { needsSelection: true });
  check(so, 'cờ nghiệm thu loading tắt: lời hỏi đổi vị trí cũng im lặng',
    [safetyVisibleProbe._calls.length, safetyVisibleProbe._calls[0].options.silent],
    [1, true]);

  const plan = { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' }] };
  const quiet = dungHopLienKet(); batDauLienKet(quiet); quiet._calls = [];
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
    const h = dungHopLienKet(); batDauLienKet(h); h._calls = [];
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
  check(so, 'rời Customer khi kênh chết: vẫn hỏi ngay',
    (await roiKho((h) => { h.CHANGE_SIGNAL.dead = true; })).calls,
    1);

  const appFocus = dungHopLienKet(); batDauLienKet(appFocus); appFocus._calls = [];
  appFocus.SHEET_LINK_LAST_ACK = 5000; appFocus._clock.now = 5001;
  appFocus.selectionPollWake();
  check(so, 'focus/chuyển app không tự gọi GAS khi Extension còn sống', appFocus._calls, []);
  appFocus._documentListeners.visibilitychange();
  check(so, 'tab hiện lại sinh đúng một lời hỏi qua cổng chung, kể cả khi Extension sống',
    appFocus._calls,
    ['probeSelectionAndReload']);
  appFocus.SHEET_LINK_SELECTION_PENDING = null;
  appFocus._windowListeners.online();
  check(so, 'mạng nối lại sinh đúng một lời hỏi qua cổng chung',
    appFocus._calls,
    ['probeSelectionAndReload', 'probeSelectionAndReload']);

  const gasSelection = (customerId, cellRef) => ({ ok: true, reload: { revision: 0 }, selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', cellRef, row: 4, col: 3, rowEnd: 4, colEnd: 3, customerId } });
  const readerDown = dungHopLienKet(); batDauLienKet(readerDown); readerDown._calls = [];
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
    [chayHenGio(readerDown, 1000), readerDown._calls.length], [1000, 1]);
  check(so, 'Extension đọc hỏng: Sidebar mở khách do GAS đọc thay và báo Log mã lỗi',
    [pickedDown, readerDown._calls[0].args[0].extensionReadFailure], [['CUS-000004'], 'LIVE_GRID_NOT_FOUND']);
  check(so, 'Extension đọc hỏng: băng cảnh báo hiện câu riêng, không nhầm với thiếu Extension',
    [readerDown._banner.hidden, readerDown._banner.textContent], [false, readerDown.SELECTION_POLL_BANNER_TEXT.readerDown]);
  readerDown.sheetLinkRecordExtensionRead(Object.assign({}, downContext, { readReason: 'LIVE_AXIS_NOT_FOUND' }));
  check(so, 'Extension có lưới nhưng không ghép được bảng quy đổi hàng/cột cũng là bộ đọc hỏng: hỏi GAS, băng cảnh báo, Log',
    [readerDown.sheetLinkExtensionReaderDown(5001), readerDown.SHEET_LINK_EXTENSION_READ.reason], [true, 'LIVE_AXIS_NOT_FOUND']);
  readerDown.sheetLinkRecordExtensionRead(downContext);
  nextGas = gasSelection('CUS-000005', 'C5');
  // syncValue chạy đồng bộ nên mốc "đang bay" được gán sau khi lượt đã xong; Promise thật tự dọn mốc này.
  readerDown.SHEET_LINK_SELECTION_PENDING = null;
  readerDown.sheetLinkOnMessage({ origin: readerDown.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { seq: 2, cellRef: 'C5' }) });
  chayHenGio(readerDown, 1000);
  check(so, 'Extension đọc hỏng: lần click sau vẫn mở đúng khách nhưng chỉ báo Log một lần mỗi phiên',
    [pickedDown, readerDown._calls[1].args[0].extensionReadFailure], [['CUS-000004', 'CUS-000005'], '']);

  // Sheet xem tự do: Sidebar chép mẫu `!` thành khóa theo tên sheet để Extension dò lưới; không hỏi GAS, không báo bộ đọc hỏng.
  const mauView = [
    { token: '!:@CUS_MA_KH', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' },
    { token: '!:@ACT_MA_KH', headerAddress: 'B1', expectedValue: '@ACT_MA_KH', valueAddressTemplate: 'B{row}' }];
  const planCoBan = Object.assign({ Activity: [], Category: [], Config: [], '!': mauView }, plan);
  const free = dungHopLienKet(); batDauLienKet(free); free._calls = [];
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
    [free.sheetLinkPlanForSheet('Bao cao'), free._calls.length, chayHenGio(free, 1000), free._banner.hidden], [mauView, 0, null, true]);
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
    [free._calls.length, chayHenGio(free, 1000), free._banner.hidden, free.sheetLinkReaderFailureInput(), pickedFree], [0, null, true, '', ['CUS-000005']]);
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

  const readerResend = dungHopLienKet(); batDauLienKet(readerResend); readerResend._calls = [];
  readerResend.SHEET_LINK_READ_PLAN = plan;
  readerResend.SHEET_LINK_LAST_ACK = 5000; readerResend._clock.now = 5001;
  readerResend.Store = { hasCustomer: (id) => id === 'CUS-000004' };
  const pickedResend = [];
  readerResend.ACTIONS.setCurrentCustomer = (input) => { pickedResend.push(input.pick); };
  let finishProbe = null;
  readerResend.callServer = (name, args, options) => { readerResend._calls.push({ name, args, options }); return { then: (ok) => { finishProbe = ok; return { then: () => null }; } }; };
  readerResend.sheetLinkOnMessage({ origin: readerResend.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { nonce: readerResend.SHEET_LINK_NONCE }) });
  chayHenGio(readerResend, 1000);
  readerResend.sheetLinkOnMessage({ origin: readerResend.SHEET_LINK_ORIGIN, data: Object.assign({}, downContext, { nonce: readerResend.SHEET_LINK_NONCE, seq: 2, hint: '' }) });
  finishProbe(gasSelection('CUS-000004', 'C4'));
  check(so, 'Extension gửi lại cùng vị trí trong lúc GAS đang đọc thì câu trả lời GAS vẫn được áp',
    pickedResend, ['CUS-000004']);

  const readerOk = dungHopLienKet(); batDauLienKet(readerOk); readerOk._calls = [];
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

  const writeResponse = dungHopLienKet(); batDauLienKet(writeResponse); writeResponse._calls = [];
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 3 } }, 'saveRecord');
  writeResponse.sheetLinkObserveReloadPayload({ reload: { revision: 4 } }, 'deleteRecords');
  check(so, 'save/delete đã trả kết quả thì không probe reload lần hai', writeResponse._calls, []);

  const queuedWake = dungHopLienKet(); batDauLienKet(queuedWake);
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
  check(so, 'wake thứ hai trong lúc request bay chỉ được giữ như tín hiệu vận chuyển',
    [probeCalls, queuedWake.SHEET_LINK_SELECTION_WAKE_QUEUED],
    [1, true]);
  releaseFirstProbe({
    ok: true,
    reload: { revision: 1 },
    selection: { spreadsheetId: 'sheet-1', gid: '1', sheetName: 'Customer', row: 4, col: 1, rowEnd: 4, colEnd: 1, customerId: '' },
    decision: { ram: { action: 'none' } }
  });
  await new Promise((resolve) => setImmediate(resolve));
  await new Promise((resolve) => setImmediate(resolve));
  check(so, 'wake thứ hai được gửi thành request mới để GAS đọc ReloadState mới nhất',
    [probeCalls, queuedWake.SHEET_LINK_SELECTION_WAKE_QUEUED],
    [2, false]);

  const staleSelection = dungHopLienKet(); batDauLienKet(staleSelection);
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

  const direct = dungHopLienKet(); batDauLienKet(direct); direct.Store.hasCustomer = () => true; direct._picked = [];
  direct.ACTIONS.setCurrentCustomer = ({ pick }) => { direct._picked.push(pick); };
  direct.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 4, col: 2, reads: [{ status: 'ok', matched: true, value: 'KH000001' }] });
  check(so, 'context Extension gửi reads được Sidebar đối chiếu thành mã khách', direct._picked, ['KH000001']);
  check(so, 'thiếu reads thì không đoán khách từ tọa độ',
    direct.sheetLinkCustomerIdFromContext({ sheetName: '!Lead', row: 4, col: 2 }),
    '');

  const immediate = dungHopLienKet(); batDauLienKet(immediate); immediate.SHEET_LINK_LAST_SHEET = 'Customer';
  immediate.Store.hasCustomer = () => true; immediate._picked = [];
  immediate.ACTIONS.setCurrentCustomer = ({ pick }) => { immediate._picked.push(pick); };
  immediate.callServer = () => new Promise(() => {});
  immediate.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Activity', row: 4, col: 2, reads: [{ status: 'ok', matched: true, value: 'KH000002' }] });
  check(so, 'đổi sheet áp dụng khách ngay dù RPC kiểm tra dirty chưa trả', immediate._picked, ['KH000002']);

  const syncOpen = dungHopLienKet(); batDauLienKet(syncOpen); syncOpen.FBM_SYNC_CLIENT = { active: true };
  syncOpen.Store.hasCustomer = () => true; syncOpen._picked = [];
  syncOpen.ACTIONS.setCurrentCustomer = ({ pick }) => { syncOpen._picked.push(pick); };
  syncOpen.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4, col: 1, reads: [{ status: 'ok', matched: true, value: 'KH-SYNC' }] });
  check(so, 'click ô khi đang ở module Đồng bộ không vẽ đè màn chính', syncOpen._picked, []);

  // Nhấp hàng không ra khách: báo đúng lý do thay vì giữ khách của hàng trước.
  const missHop = (sheetName) => {
    const h = dungHopLienKet(); batDauLienKet(h);
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
  check(so, 'nhấp hàng có mã chưa có trong RAM báo không tìm thấy đúng mã, không đổi khách',
    [notFound._misses, notFound._picked],
    [[{ kind: 'notFound', code: 'CUS-999999' }], []]);
  notFound.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A6', row: 6, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  check(so, 'nhấp lại hàng cùng mã thiếu không vẽ lại lần hai', notFound._misses.length, 1);

  const header = missHop('Customer');
  header.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A1', row: 1, col: 1, reads: [codeRead('ok', '@CUS_MA_KH')] });
  check(so, 'một luật cho mọi hàng: hàng tiêu đề mang giá trị không phải mã có trong RAM thì báo không tìm thấy đúng giá trị đó, không giữ khách cũ',
    [header._misses, header._picked],
    [[{ kind: 'notFound', code: '@CUS_MA_KH' }], []]);
  const viewHeader = missHop('!lead');
  viewHeader.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!lead', cellRef: 'I3', row: 3, col: 9, readStatus: 'ok', reads: [codeRead('ok', '')] });
  check(so, 'ô mã của hàng đang chọn rỗng (hàng lọc sheet quản trị) thì báo rỗng',
    viewHeader._misses,
    [{ kind: 'empty' }]);
  const categoryHeader = missHop('Category');
  categoryHeader.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Category', cellRef: 'A1', row: 1, col: 1, readStatus: 'ok', reads: [] });
  check(so, 'sheet không có cột mã khách (Category), Extension đọc trọn: giá trị rỗng nên báo rỗng',
    categoryHeader._misses,
    [{ kind: 'empty' }]);
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
  check(so, 'GAS đọc được mã chưa có trong RAM thì báo không tìm thấy',
    gasMiss._misses,
    [{ kind: 'notFound', code: 'CUS-777777' }]);

  const freeEmpty = missHop('Nháp');
  freeEmpty.SHEET_LINK_READ_PLAN = { Customer: [], '!': [] };
  freeEmpty.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Nháp', cellRef: 'C7', row: 7, col: 3, readStatus: 'unavailable', reads: [codeRead('unavailable', '')] });
  check(so, 'sheet tự do: ô mã vắng dưới cột mã đúng tiêu đề là hàng không có khách',
    freeEmpty._misses,
    [{ kind: 'empty' }]);

  const missForm = missHop('Customer'); missForm.ScreenState.screen = 'customerForm';
  missForm.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A5', row: 5, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  const missSync = missHop('Customer'); missSync.FBM_SYNC_CLIENT = { active: true };
  missSync.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A5', row: 5, col: 1, reads: [codeRead('ok', 'CUS-999999')] });
  check(so, 'form đang mở hoặc đang đồng bộ FBM thì nhấp hàng không ra khách không đổi màn',
    [missForm._misses, missSync._misses],
    [[], []]);

  const taiLai = dungHopLienKet(); batDauLienKet(taiLai); taiLai.SHEET_LINK_SEQ = 99;
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_HANDSHAKE_ACK', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi' } });
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-moi', spreadsheetId: 'sheet-1', seq: 1, sheetName: 'Customer', row: 4, col: 1 } });
  const seqSauContextMoi = taiLai.SHEET_LINK_SEQ;
  taiLai.sheetLinkOnMessage({ origin: taiLai.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: taiLai.SHEET_LINK_NONCE, sessionId: 'extension-cu', spreadsheetId: 'sheet-1', seq: 200, sheetName: 'Customer', row: 5, col: 1 } });
  check(so, 'Extension tải lại đặt lại seq và bỏ context của phiên cũ',
    [seqSauContextMoi, taiLai.SHEET_LINK_SEQ],
    [1, 1]);

  const noPayload = dungHopLienKet(); batDauLienKet(noPayload);
  noPayload.SHEET_LINK_LAST_SEEN_REVISION = 3;
  await noPayload.sheetLinkApplyDecisionResult({ reload: { revision: 7 }, decision: { ram: { action: 'defer' } }, processedRevision: 0 });
  check(so, 'không có gói (hoãn vì bản nháp, hoặc không gì mới) thì giữ nguyên revision đã thấy để lời hỏi sau nhận đủ',
    noPayload.SHEET_LINK_LAST_SEEN_REVISION,
    3);

  {
    // Form đang mở là đang khóa: mã của mọi khung trong ngăn xếp, kể cả form chưa gõ và form thêm mới, chứ không chỉ khung đã cất bản nháp.
    const khoa = dungHopLienKet(); batDauLienKet(khoa);
    khoa.ScreenState.formStack = [
      { record: { id: 'ACT-000035' }, draft: {}, themMoi: true },
      { record: { id: 'CUS-000001' }, draft: {} },
      { record: { id: 'CUS-000001' }, draft: { note: 'x' } }
    ];
    check(so, 'mã gửi GAS là mọi form đang mở, không trùng, kể cả form chưa gõ và mã xem trước của form thêm mới',
      khoa.sheetLinkLocalDraftInput(),
      { recordIds: ['ACT-000035', 'CUS-000001'] });

    khoa._calls = [];
    await khoa.sheetLinkApplyDecisionResult({ reload: { revision: 7 }, decision: { ram: { action: 'defer', mode: 'parts', deferKind: 'records', deferredRecordIds: ['CUS-000001'] } }, processedRevision: 0 });
    const dongHoan = [khoa._banner.hidden, khoa._banner.textContent, khoa._calls.length];
    await khoa.sheetLinkApplyDecisionResult({ reload: { revision: 7 }, decision: { ram: { action: 'defer', mode: 'fullCore', deferKind: 'whole', deferredRecordIds: ['CUS-000001'] } }, processedRevision: 0 });
    const dongTron = khoa._banner.textContent;
    khoa.ScreenState.formStack = [];
    khoa.sheetLinkFormClosed();
    const goiKhiDong = khoa._calls.slice();
    await khoa.sheetLinkApplyDecisionResult({ reload: { revision: 7 }, decision: { ram: { action: 'none', mode: 'none', deferredRecordIds: [] } }, processedRevision: 0 });
    khoa._calls = [];
    khoa.sheetLinkFormClosed();
    check(so, 'GAS hoãn thì dòng đáy báo ngay từ chính kết quả lời hỏi, không thêm lời gọi; đóng form lúc đang hoãn thì hỏi lại ngay; hết hoãn thì bỏ dòng báo và đóng form không tốn lời gọi nào',
      [dongHoan, dongTron, goiKhiDong, khoa._banner.hidden, khoa._calls],
      [[false, 'Khách này vừa được sửa trên Sheet, khi lưu sẽ hỏi lại', 0], 'Dữ liệu vừa đổi trên Sheet, sẽ nạp lại khi đóng form', ['probeSelectionAndReload'], true, []]);
  }

  const directPayload = dungHopLienKet(); batDauLienKet(directPayload);
  directPayload.SHEET_LINK_LAST_SEEN_REVISION = 0;
  directPayload._payloads = [];
  directPayload.refreshReloadPayload = (payload) => { directPayload._payloads.push(payload.parts.map((part) => part.mode).join('+')); return payload; };
  directPayload.callServer = (name) => { directPayload._calls.push(name); return syncValue({ ok: true }); };
  await directPayload.sheetLinkApplyDecisionResult({
    reload: { revision: 10 },
    processedRevision: 10,
    payload: { parts: [{ mode: 'records', customer: { fields: [], rows: [] }, activity: { fields: [], rows: [] } }] }
  });
  check(so, 'payload probe được Sidebar áp dụng trực tiếp, không gọi reloadRecords lần hai',
    [directPayload._payloads, directPayload._calls, directPayload.SHEET_LINK_LAST_SEEN_REVISION],
    [['records'], [], 10]);

  directPayload._payloads = [];
  await directPayload.sheetLinkApplyDecisionResult({
    reload: { revision: 10 },
    processedRevision: 9,
    payload: { parts: [{ mode: 'records', customer: { fields: [], rows: [] }, activity: { fields: [], rows: [] } }] }
  });
  check(so, 'response payload cũ về muộn không ghi đè revision đã áp dụng',
    [directPayload._payloads, directPayload.SHEET_LINK_LAST_SEEN_REVISION], [[], 10]);

  const failedReload = dungHopLienKet(); batDauLienKet(failedReload);
  failedReload.SHEET_LINK_LAST_SEEN_REVISION = 0;
  failedReload.refreshReloadPayload = () => null;
  await failedReload.sheetLinkApplyDecisionResult({ reload: { revision: 8 }, processedRevision: 8, payload: { parts: [{ mode: 'fullCore', core: { ok: false } }] } });
  check(so, 'gói áp không thành công không đánh dấu revision đã xử lý', failedReload.SHEET_LINK_LAST_SEEN_REVISION, 0);

  const failedEvent = dungHopLienKet(); batDauLienKet(failedEvent);
  failedEvent.SHEET_LINK_LAST_SEEN_REVISION = 0;
  failedEvent.sheetLinkSyncDirtyData = () => syncValue({ ok: false, error: 'reload failed' });
  failedEvent.sheetLinkOnMessage({
    origin: failedEvent.SHEET_LINK_ORIGIN,
    data: { action: 'CRM_RELOAD', nonce: failedEvent.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', revision: 9 }
  });
  check(so, 'CRM_RELOAD không đánh dấu revision trước khi công việc thành công',
    failedEvent.SHEET_LINK_LAST_SEEN_REVISION,
    0);
}

module.exports = { chay: chay };
