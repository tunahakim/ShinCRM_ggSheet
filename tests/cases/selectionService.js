/**
 * Ca rủi ro cao của SelectionService: cùng một số hàng phải tra theo đúng sheet, còn vùng không chắc chắn phải trả rỗng thay vì mở nhầm khách.
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function ganLuaChon(nen, state) {
  const gids = { Customer: 101, Activity: 102, Category: 103, '!Lead': 104 };
  nen.book.getActiveSheet = function () {
    const sheet = nen.sheet(state.sheetName);
    sheet.getSheetId = () => gids[state.sheetName] || 999;
    sheet.getActiveRange = () => ({
      getA1Notation: () => state.cellRef || 'A' + state.row,
      getRow: () => state.row,
      getColumn: () => state.col || 1,
      getLastRow: () => state.rowEnd || state.row,
      getLastColumn: () => state.colEnd || state.col || 1
    });
    return sheet;
  };
}

function chay(so) {
  section('SelectionService — không được dùng cùng số hàng để mở nhầm khách ở sheet khác');

  let nen;
  try {
    nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config'], tep: TEP_NEN.concat(['server/service/SelectionService.js']) });
    nen.book.insertSheet('!Lead');
  } catch (err) {
    return ghiLoiNap(so, 'nạp được SelectionService', err);
  }

  const hop = nen.hop;
  const state = { sheetName: 'Customer', row: 4, col: 2 };
  ganLuaChon(nen, state);

  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'CUS-000004');
  ghiO(nen, 'Customer', 6, '@CUS_MA_KH', 'CUS-000006');
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'ACT-000004');
  ghiO(nen, 'Activity', 4, '@ACT_MA_KH', 'CUS-000099');
  const lead = nen.book.getSheetByName('!Lead');
  lead.getRange(1, 1).setValue('@CUS_MA_KH');
  lead.getRange(7, 1).setValue('CUS-000007');

  check(so, 'Customer tra cột mã khách của Customer', hop.probeSelectionFull().customerId, 'CUS-000004');

  state.sheetName = 'Activity';
  check(so, 'Activity tra @ACT_MA_KH, không lấy khách cùng số hàng bên Customer', hop.probeSelectionFull().customerId, 'CUS-000099');

  state.sheetName = 'Customer';
  state.row = 2;
  check(so, 'hàng tiêu đề 1-3 luôn rỗng', hop.probeSelectionFull().customerId, '');

  state.sheetName = 'Category';
  state.row = 4;
  check(so, 'sheet ngoài kho trả rỗng, không dùng nhầm dữ liệu Customer', hop.probeSelectionFull({ Category: { '4': 'CUS-SAI' } }).customerId, '');

  state.sheetName = 'Customer';
  state.row = 5;
  check(so, 'hàng dữ liệu trống trả rỗng', hop.probeSelectionFull().customerId, '');

  state.sheetName = '!Lead';
  state.row = 7;
  const rendered = [];
  hop.renderViewIfDirty = (sheetName) => { rendered.push(sheetName); };
  const viewSelection = hop.probeSelectionFull({ '!Lead': { '7': 'CUS-SAI' } });
  check(so, 'polling trên sheet quản trị đọc trực tiếp cột mã sau khi render',
    [viewSelection.customerId, rendered],
    ['CUS-000007', ['!Lead']]);

  state.sheetName = 'Customer';
  state.row = 6;
  state.col = 3;
  state.rowEnd = 6;
  state.colEnd = 3;
  const snapshot = hop.selectionSnapshot();
  check(so, 'snapshot dùng gắn vào phản hồi không tự mang dirty, ms hay ok', Object.keys(snapshot).sort(), ['cellRef', 'col', 'colEnd', 'gid', 'row', 'rowEnd', 'selectionKind', 'sheetName', 'spreadsheetId'].sort());

  // Một request duy nhất trả selection + ReloadState + quyết định. GAS chỉ
  // đọc mã khách khi vị trí thay đổi; Sidebar truyền lại context trước đó.
  hop.dirtyStateClear();
  let customerReads = 0;
  const readCustomerId = hop.selectionCustomerId;
  hop.selectionCustomerId = function (context, snapshot) {
    customerReads += 1;
    return readCustomerId(context, snapshot);
  };
  state.sheetName = 'Customer';
  state.row = 4;
  state.col = 2;
  state.rowEnd = 4;
  state.colEnd = 2;
  const firstProbe = hop.probeSelectionAndReload({ previousSelectionContext: null, previousCustomerId: '' });
  check(so, 'một request đầu đọc mã khách khi chưa có context trước',
    [firstProbe.selection.positionChanged, firstProbe.customerId, customerReads],
    [true, 'CUS-000004', 1]);

  const readsBeforeStable = customerReads;
  const stableProbe = hop.probeSelectionAndReload({ previousSelectionContext: firstProbe.selection, previousCustomerId: firstProbe.customerId });
  check(so, 'vị trí không đổi trả mã cũ và không đọc lại ô mã khách',
    [stableProbe.selection.positionChanged, stableProbe.customerId, customerReads],
    [false, 'CUS-000004', readsBeforeStable]);

  state.row = 6;
  const movedProbe = hop.probeSelectionAndReload({ previousSelectionContext: firstProbe.selection, previousCustomerId: firstProbe.customerId });
  check(so, 'vị trí đổi đọc lại đúng mã khách trong cùng request',
    [movedProbe.selection.positionChanged, movedProbe.customerId, customerReads],
    [true, 'CUS-000006', readsBeforeStable + 1]);

  // R11: khi chưa đến mốc debounce, GAS chỉ trả defer; request sau mốc đó nhận payload trong cùng response.
  hop.dirtyStateMarkSignal({ records: ['CUS-000004'], allViews: false, recordsDebounceMs: 3000 });
  const defer = hop.probeSelectionAndReload({ requestId: 'r11-defer', previousSelectionContext: movedProbe.selection, previousCustomerId: movedProbe.customerId });
  check(so, 'R11 defer không đọc payload và có waitMs',
    [defer.requestId, defer.decision.ram.action, defer.payload, defer.waitMs > 0, defer.reload.records],
    ['r11-defer', 'defer', null, true, ['CUS-000004']]);
  hop.PropertiesService.getDocumentProperties().setProperty(hop.DIRTY_KEYS.recordsReadyAt, String(Date.now() - 1));
  const ready = hop.probeSelectionAndReload({ requestId: 'r11-ready', previousSelectionContext: movedProbe.selection, previousCustomerId: movedProbe.customerId });
  check(so, 'R11 request sau readyAt nhận payload records và dọn dirty',
    [ready.requestId, ready.payload.mode, ready.payload.customer.rows.length, ready.processedRevision > 0, ready.reload.records],
    ['r11-ready', 'records', 1, true, []]);

  hop.dirtyStateMarkSchema();
  const fullCore = hop.probeSelectionAndReload({ requestId: 'r11-core', previousSelectionContext: ready.selection, previousCustomerId: ready.customerId });
  check(so, 'R11 full core mang Activity trong cùng payload',
    [fullCore.requestId, fullCore.payload.mode, Array.isArray(fullCore.payload.core.activity.rows), fullCore.payload.core.activity.fields.length > 0],
    ['r11-core', 'fullCore', true, true]);

  hop.dirtyStateMarkCategory();
  const categoryPayload = hop.probeSelectionAndReload({ requestId: 'r11-category', previousSelectionContext: fullCore.selection, previousCustomerId: fullCore.customerId });
  check(so, 'R11 Category trả payload Category riêng',
    [categoryPayload.requestId, categoryPayload.payload && categoryPayload.payload.mode, categoryPayload.decision.ram.mode],
    ['r11-category', 'category', 'category']);

  // R11 A-E: nhiều signal trong cùng một cửa sổ debounce được gom thành một payload.
  hop.dirtyStateClear();
  const burstIds = ['KH-A', 'KH-B', 'KH-C', 'KH-D', 'KH-E'];
  burstIds.forEach((id, i) => { ghiO(nen, 'Customer', 10 + i, '@CUS_MA_KH', id); ghiO(nen, 'Customer', 10 + i, '@CUS_TEN_CTY', id); });
  burstIds.forEach((id) => { hop.dirtyStateMarkSignal({ records: [id], allViews: false, recordsReadyAt: Date.now() + 3000 }); });
  const burstDefers = [];
  for (let i = 0; i < 3; i += 1) {
    const deferred = hop.probeSelectionAndReload({ previousSelectionContext: categoryPayload.selection, previousCustomerId: categoryPayload.customerId });
    burstDefers.push([deferred.payload, deferred.decision.ram.action]);
  }
  check(so, 'R11 A-E các request trước readyAt đều defer không có payload', burstDefers, [[null, 'defer'], [null, 'defer'], [null, 'defer']]);
  hop.PropertiesService.getDocumentProperties().setProperty(hop.DIRTY_KEYS.recordsReadyAt, String(Date.now() - 1));
  const burstReady = hop.probeSelectionAndReload({ previousSelectionContext: categoryPayload.selection, previousCustomerId: categoryPayload.customerId });
  check(so, 'R11 A-E request sau readyAt nhận một payload gồm toàn bộ mã',
    [burstReady.payload.mode, burstReady.payload.customer.rows.map((row) => row[0]).filter((id) => burstIds.indexOf(id) >= 0).sort(), burstReady.reload.records],
    ['records', burstIds.slice().sort(), []]);

  // R11 F trong lúc đang đọc A-E: revision mới không bị xóa; request kế tiếp nhận riêng F.
  ghiO(nen, 'Customer', 20, '@CUS_MA_KH', 'KH-F');
  ghiO(nen, 'Customer', 20, '@CUS_TEN_CTY', 'KH-F');
  ghiO(nen, 'Customer', 21, '@CUS_MA_KH', 'KH-NEW');
  ghiO(nen, 'Customer', 21, '@CUS_TEN_CTY', 'KH-NEW');
  hop.dirtyStateMarkRecords(['KH-F']);
  const duringRevision = hop.reloadStateRead().revision;
  const readRows = hop.entityReadRowsAt;
  let injected = false;
  hop.entityReadRowsAt = function (context, rows) {
    if (!injected) { injected = true; hop.dirtyStateMarkRecords(['KH-NEW']); }
    return readRows(context, rows);
  };
  const duringRead = hop.probeSelectionAndReload({ previousSelectionContext: burstReady.selection, previousCustomerId: burstReady.customerId });
  hop.entityReadRowsAt = readRows;
  check(so, 'R11 signal F phát sinh trong lúc đọc không bị mất',
    [duringRead.revisionMatched, duringRead.processedRevision, duringRead.reload.records, duringRead.remainingRevision > 0],
    [false, duringRevision, ['KH-NEW'], true]);
  const afterDuringRead = hop.probeSelectionAndReload({ previousSelectionContext: duringRead.selection, previousCustomerId: duringRead.customerId });
  check(so, 'R11 request kế tiếp nhận payload của signal mới',
    [afterDuringRead.payload.mode, afterDuringRead.payload.customer.rows.map((row) => row[0]), afterDuringRead.reload.records],
    ['records', ['KH-NEW'], []]);

  ghiO(nen, 'Customer', 22, '@CUS_MA_KH', 'KH-SAME');
  ghiO(nen, 'Customer', 22, '@CUS_TEN_CTY', 'KH-SAME');
  hop.dirtyStateMarkRecords(['KH-SAME']);
  const sameRevision = hop.reloadStateRead().revision;
  injected = false;
  hop.entityReadRowsAt = function (context, rows) {
    if (!injected) { injected = true; hop.dirtyStateMarkRecords(['KH-SAME']); }
    return readRows(context, rows);
  };
  const sameDuringRead = hop.probeSelectionAndReload({ previousSelectionContext: afterDuringRead.selection, previousCustomerId: afterDuringRead.customerId });
  hop.entityReadRowsAt = readRows;
  check(so, 'R11 cùng mã phát sinh lại trong lúc đọc vẫn giữ signal mới',
    [sameDuringRead.revisionMatched, sameDuringRead.processedRevision, sameDuringRead.reload.records],
    [false, sameRevision, ['KH-SAME']]);
  const sameNext = hop.probeSelectionAndReload({ previousSelectionContext: sameDuringRead.selection, previousCustomerId: sameDuringRead.customerId });
  check(so, 'R11 signal cùng mã được dọn sau request kế tiếp', [sameNext.payload.mode, sameNext.reload.records], ['records', []]);

  const calls = [];
  hop.runEntryPoint = function (name, source, channel, fn) {
    calls.push([name, source, channel]);
    return fn();
  };
  const full = hop.probeSelectionFull();
  hop.probeSelectionCheap();
  hop.viewProbeSelection();
  check(so, 'các cửa selection chỉ mở một runEntryPoint và phản hồi đầy đủ báo ms bằng số', [calls, typeof full.ms], [[['probeSelectionFull', 'sidebar', 'throw'], ['probeSelectionCheap', 'sidebar', 'throw'], ['viewProbeSelection', 'sidebar', 'throw']], 'number']);

  return so;
}

module.exports = { chay };
