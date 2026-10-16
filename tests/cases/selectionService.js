/**
 * Ca rủi ro cao của SelectionService: cùng một số hàng phải tra theo đúng sheet, còn vùng không chắc chắn phải trả rỗng thay vì mở nhầm khách.
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { trongLanChay } = require('../lib/load-gas');
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

  check(so, 'Customer tra cột mã khách của Customer', hop.probeSelectionAndReload({}).customerId, 'CUS-000004');

  state.sheetName = 'Activity';
  check(so, 'Activity tra @ACT_MA_KH, không lấy khách cùng số hàng bên Customer', hop.probeSelectionAndReload({}).customerId, 'CUS-000099');

  state.sheetName = 'Customer';
  state.row = 2;
  check(so, 'hàng tiêu đề 1-3 luôn rỗng', hop.probeSelectionAndReload({}).customerId, '');

  state.sheetName = 'Category';
  state.row = 4;
  check(so, 'sheet ngoài kho trả rỗng, không dùng nhầm dữ liệu Customer', hop.probeSelectionAndReload({}).customerId, '');

  state.sheetName = 'Customer';
  state.row = 5;
  check(so, 'hàng dữ liệu trống trả rỗng', hop.probeSelectionAndReload({}).customerId, '');

  state.sheetName = '!Lead';
  state.row = 7;
  const rendered = [];
  hop.viewRenderIfStale = (sheetName) => { rendered.push(sheetName); };
  const viewReport = hop.viewProbeSelection();
  check(so, 'polling trên sheet quản trị đọc trực tiếp cột mã sau khi render',
    [rendered, viewReport.some((line) => line.indexOf('customerId="CUS-000007"') >= 0)],
    [['!Lead'], true]);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ allViews: true }));
  const staleOn = hop.probeSelectionAndReload({}).view;
  hop.userPrefsWrite('autoRenderView', false);
  const staleOff = hop.probeSelectionAndReload({}).view;
  hop.viewLedgerWrite('!Lead', { data: hop.reloadStateRead().revision, ok: true });
  const fresh = hop.probeSelectionAndReload({}).view;
  hop.userPrefsWrite('autoRenderView', true);
  check(so, 'lời hỏi mang trạng thái sheet ! đang xem: cũ + núm bật → render, cũ + núm tắt → notify, đã vẽ → none; lời hỏi không tự vẽ',
    [staleOn.sheetName, staleOn.action, staleOff.action, fresh.action, rendered],
    ['!Lead', 'render', 'notify', 'none', ['!Lead']]);

  state.sheetName = 'Customer';
  state.row = 6;
  state.col = 3;
  state.rowEnd = 6;
  state.colEnd = 3;
  const snapshot = hop.selectionSnapshotFromContext(hop.selectionProbeContext());
  check(so, 'ảnh chụp vị trí chỉ mang tọa độ, không tự mang dirty, ms hay ok', Object.keys(snapshot).sort(), ['cellRef', 'col', 'colEnd', 'gid', 'row', 'rowEnd', 'selectionKind', 'sheetName', 'spreadsheetId'].sort());

  // Một request duy nhất trả selection + ReloadState + quyết định. GAS chỉ
  // đọc mã khách khi vị trí thay đổi; Sidebar truyền lại context trước đó.
  let customerReads = 0;
  const readCustomerCell = hop.selectionCustomerCell;
  hop.selectionCustomerCell = function (context, snapshot) {
    customerReads += 1;
    return readCustomerCell(context, snapshot);
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

  check(so, 'một luật cho mọi hàng: GAS đọc ô mã ở cả hàng tiêu đề, chỗ không có cột mã trả rỗng, chỉ không đọc khi không có vị trí',
    [firstProbe.selection.customerCell,
      hop.selectionCustomerCell({ sheet: { getLastColumn: () => 1, getRange: (r) => ({ getValues: () => [['@CUS_MA_KH']], getValue: () => (r === 1 ? '@CUS_MA_KH' : '') }) } }, { sheetName: 'Customer', row: 1 }),
      hop.selectionCustomerCell({ sheet: { getLastColumn: () => 0 } }, { sheetName: 'Category', row: 5 }),
      hop.selectionCustomerCell({ sheet: {} }, { sheetName: '', row: 0 })],
    ['value', { read: true, value: '@CUS_MA_KH' }, { read: true, value: '' }, { read: false, value: '' }]);
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

  // Sidebar giữ revision đã thấy và chỉ nâng lên processedRevision sau khi áp gói (07A bất biến 4); `seen` đóng vai Sidebar đó.
  let seen = hop.reloadStateRead().revision;
  const hoi = (extra, prev) => {
    const reply = hop.probeSelectionAndReload(Object.assign({ lastSeenRevision: seen, previousSelectionContext: prev.selection, previousCustomerId: prev.customerId }, extra));
    if (reply.payload) { seen = reply.processedRevision; }
    return reply;
  };
  const maKhach = (part) => part.customer.rows.map((row) => row[0]);

  // Không chờ theo thời gian và không hoãn theo lượt đồng bộ: lời hỏi ngay sau thay đổi nhận payload trong cùng phản hồi, kể cả khi Sidebar còn gửi cờ đồng bộ cũ.
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['CUS-000004'] }));
  const ready = hoi({ requestId: 'r11-ready', syncRunning: true }, movedProbe);
  check(so, 'lời hỏi ngay sau sửa nhận gói một phần records, không defer, không waitMs; processedRevision là revision sổ',
    [ready.requestId, ready.decision.ram.action, ready.payload.parts.map((part) => part.mode), ready.payload.parts[0].customer.rows.length, ready.processedRevision, ready.reload.revision, 'waitMs' in ready],
    ['r11-ready', 'reload', ['records'], 1, ready.reload.revision, ready.reload.revision, false]);
  check(so, 'lời hỏi lại cùng revision không nhận gói nào: sổ không bị tiêu, Sidebar tự biết đã thấy',
    hoi({}, ready).payload, null);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ core: true }));
  const fullCore = hoi({ requestId: 'r11-core' }, ready);
  check(so, 'R11 full core mang Activity trong cùng payload',
    [fullCore.requestId, fullCore.payload.parts.map((part) => part.mode), Array.isArray(fullCore.payload.parts[0].core.activity.rows), fullCore.payload.parts[0].core.activity.fields.length > 0],
    ['r11-core', ['fullCore'], true, true]);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ category: true }));
  const categoryPayload = hoi({ requestId: 'r11-category' }, fullCore);
  check(so, 'R11 Category trả đúng một phần Category',
    [categoryPayload.requestId, categoryPayload.payload.parts.map((part) => part.mode), categoryPayload.decision.ram.mode],
    ['r11-category', ['category'], 'parts']);

  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ config: true }));
  const configPayload = hoi({ requestId: 'r11-config' }, categoryPayload);
  check(so, 'R11 Config trả đúng một phần Config trong cùng request',
    [configPayload.requestId, configPayload.payload.parts.map((part) => part.mode), !!configPayload.payload.parts[0].config],
    ['r11-config', ['config'], true]);

  // Sidebar tụt lại nhiều lượt: Config, Category và mã khách gộp trong một lời gọi, mỗi phần một mức, không nạp lõi (V29).
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ config: true }));
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ category: true }));
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['CUS-000004'] }));
  const gop = hoi({}, configPayload);
  check(so, 'R11 ba dòng sổ khác loại gộp thành một gói ba phần, Config trước dữ liệu',
    [gop.payload.parts.map((part) => part.mode), gop.processedRevision], [['config', 'category', 'records'], hop.reloadStateRead().revision]);

  // R11 A-E: một lần chạy GAS ghi năm mã thành một tín hiệu, một revision, một payload.
  const burstIds = ['KH-A', 'KH-B', 'KH-C', 'KH-D', 'KH-E'];
  burstIds.forEach((id, i) => { ghiO(nen, 'Customer', 10 + i, '@CUS_MA_KH', id); ghiO(nen, 'Customer', 10 + i, '@CUS_TEN_CTY', id); });
  const burstRevision = hop.reloadStateRead().revision;
  trongLanChay(hop, () => { burstIds.forEach((id) => { hop.dirtyStateMarkSignal({ customer: [id] }); }); });
  const burstReady = hoi({}, gop);
  check(so, 'R11 A-E năm lần ghi trong một lần chạy: một revision, một payload gồm toàn bộ mã',
    [burstReady.processedRevision - burstRevision, burstReady.payload.parts.map((part) => part.mode), maKhach(burstReady.payload.parts[0]).filter((id) => burstIds.indexOf(id) >= 0).sort()],
    [1, ['records'], burstIds.slice().sort()]);

  // Lưu chen giữa: một lần ghi khác vào sổ trong lúc lời hỏi đang đọc Sheet. Gói hiện tại chỉ hứa tới revision lúc bắt đầu; dòng mới lời hỏi sau nhận.
  ghiO(nen, 'Customer', 20, '@CUS_MA_KH', 'KH-F');
  ghiO(nen, 'Customer', 20, '@CUS_TEN_CTY', 'KH-F');
  ghiO(nen, 'Customer', 21, '@CUS_MA_KH', 'KH-NEW');
  ghiO(nen, 'Customer', 21, '@CUS_TEN_CTY', 'KH-NEW');
  trongLanChay(hop, () => hop.dirtyStateMarkSignal({ customer: ['KH-F'] }));
  const duringRevision = hop.reloadStateRead().revision;
  const readRows = hop.entityReadRowsAt;
  let injected = false;
  hop.entityReadRowsAt = function (context, rows) {
    if (!injected) { injected = true; hop.reloadJournalAppend({ customer: ['KH-NEW'] }); }
    return readRows(context, rows);
  };
  const duringRead = hoi({}, burstReady);
  hop.entityReadRowsAt = readRows;
  check(so, 'R11 lưu chen giữa lúc đọc: processedRevision dừng ở revision lúc bắt đầu, dòng mới còn nguyên trong sổ',
    [duringRead.processedRevision, maKhach(duringRead.payload.parts[0]), hop.reloadStateRead().revision, hop.reloadJournalRead().entries.slice(-1)[0].customer],
    [duringRevision, ['KH-F'], duringRevision + 1, ['KH-NEW']]);
  const afterDuringRead = hoi({}, duringRead);
  check(so, 'R11 lời hỏi kế tiếp nhận đúng thay đổi chen giữa',
    [afterDuringRead.payload.parts.map((part) => part.mode), maKhach(afterDuringRead.payload.parts[0])], [['records'], ['KH-NEW']]);

  const logged = [];
  const logEventGoc = hop.logEvent;
  hop.logEvent = (entry) => { logged.push(entry); };
  hop.probeSelectionAndReload({ extensionReadFailure: 'LIVE_GRID_NOT_FOUND' });
  hop.probeSelectionAndReload({ extensionReadFailure: '=HYPERLINK("x")' });
  hop.probeSelectionAndReload({});
  hop.logEvent = logEventGoc;
  check(so, 'Sidebar báo Extension đọc hỏng thì GAS ghi đúng một dòng cảnh báo, bỏ chuỗi lạ không phải mã hằng',
    [logged.length, logged[0] && logged[0].action, logged[0] && logged[0].outcome === hop.LOG_WARN, logged[0] && logged[0].reason.indexOf('LIVE_GRID_NOT_FOUND') >= 0],
    [1, 'extension_read', true, true]);

  const channelLogged = [];
  hop.logEvent = (entry) => { channelLogged.push(entry); };
  hop.probeSelectionAndReload({ channelSilence: true });
  hop.probeSelectionAndReload({ channelSilence: false });
  hop.probeSelectionAndReload({ reason: 'channel-signal' });
  hop.logEvent = logEventGoc;
  check(so, 'Sidebar báo kênh báo thay đổi im thì GAS ghi đúng một dòng cảnh báo change_channel',
    channelLogged.map((entry) => [entry.action, entry.outcome === hop.LOG_WARN]), [['change_channel', true]]);

  const demTruoc = JSON.stringify(nen.dem);
  const normalLogged = [];
  hop.logEvent = (entry) => { normalLogged.push(entry); };
  const logWritesTruoc = hop.logGateWriteCount();
  ['channel-signal', 'visible', 'online', 'safety'].forEach((reason) => { hop.probeSelectionAndReload({ reason }); });
  hop.logEvent = logEventGoc;
  check(so, 'lời hỏi thay đổi khi không có gì bẩn không ghi Sheet, không ghi Log',
    [JSON.parse(demTruoc), normalLogged.length, hop.logGateWriteCount() - logWritesTruoc], [JSON.parse(JSON.stringify(nen.dem)), 0, 0]);
  check(so, 'phép đếm ghi Sheet giả thật sự tăng khi có ghi (chống phép kiểm rỗng)',
    (ghiO(nen, 'Customer', 9, '@CUS_MA_KH', 'CUS-000009'), nen.dem.setValues > JSON.parse(demTruoc).setValues), true);

  const calls = [];
  hop.runEntryPoint = function (name, source, channel, fn) {
    calls.push([name, source, channel]);
    return fn();
  };
  const finalViewReport = hop.viewProbeSelection();
  check(so, 'chỉ giữ một cổng selection/reload và cửa nghiệm thu view',
    [typeof hop.probeSelectionFull, typeof hop.probeSelectionCheap, calls, typeof finalViewReport[finalViewReport.length - 1]],
    ['undefined', 'undefined', [['viewProbeSelection', 'sidebar', 'throw']], 'string']);

  section('SelectionService — sheet xem tự do: GAS đọc hộ cột mã khi không có Extension, chỉ đọc');
  const tuDo = (ten, hang1, dong) => {
    const sheet = nen.book.insertSheet(ten);
    hang1.forEach((ma, i) => sheet.getRange(1, i + 1).setValue(ma));
    Object.keys(dong || {}).forEach((hang) => dong[hang].forEach((v, i) => sheet.getRange(Number(hang), i + 1).setValue(v)));
  };
  tuDo('Bao cao', ['Ghi chú', '@CUS_MA_KH', '@ACT_MA_KH'], { 5: ['x', 'CUS-000005', 'CUS-000050'] });
  tuDo('Chi giao dich', ['@ACT_MA_KH', 'Tiền'], { 4: ['CUS-000041', '100'] });
  tuDo('Trung ma', ['@CUS_MA_KH', '@CUS_MA_KH', '@ACT_MA_KH'], { 4: ['CUS-000001', 'CUS-000002', 'CUS-000043'] });
  tuDo('Khong ma', ['Tên', 'Ghi chú'], { 4: ['CUS-000004', 'y'] });
  const demTuDo = JSON.stringify(nen.dem);
  Object.assign(state, { sheetName: 'Bao cao', row: 5, col: 1, rowEnd: 5, colEnd: 1 });
  const baoCao = hop.probeSelectionAndReload({});
  check(so, 'sheet tự do có cả hai mã: đọc @CUS_MA_KH trước, không trả plan (plan sheet tự do do Sidebar dựng)', [baoCao.customerId, baoCao.sheetPlan], ['CUS-000005', undefined]);
  Object.assign(state, { sheetName: 'Chi giao dich', row: 4, rowEnd: 4 });
  check(so, 'sheet tự do thiếu @CUS_MA_KH thì đọc @ACT_MA_KH', hop.probeSelectionAndReload({}).customerId, 'CUS-000041');
  state.sheetName = 'Trung ma';
  const trung = hop.probeSelectionAndReload({});
  check(so, 'sheet tự do có @CUS_MA_KH bị nhân đôi: không đoán cột, dùng @ACT_MA_KH', trung.customerId, 'CUS-000043');
  state.sheetName = 'Khong ma';
  const khongMa = hop.probeSelectionAndReload({});
  check(so, 'sheet tự do không có cột mã: mã rỗng, không lấy nhầm ô trông giống mã', khongMa.customerId, '');
  Object.assign(state, { sheetName: 'Bao cao', row: 5, rowEnd: 5 });
  const truoc = hop.probeSelectionAndReload({});
  const dungYen = hop.probeSelectionAndReload({ previousSelectionContext: truoc.selection, previousCustomerId: 'CUS-CU' });
  const canDoc = hop.probeSelectionAndReload({ previousSelectionContext: truoc.selection, previousCustomerId: 'CUS-CU', needsSelection: true });
  check(so, 'vị trí không đổi thì không đọc; Sidebar báo needsSelection (Extension đọc hỏng ở sheet kho) thì GAS đọc thay',
    [dungYen.customerId, canDoc.customerId, canDoc.selection.customerIdChanged], ['CUS-CU', 'CUS-000005', true]);
  check(so, 'chỉ sheet ngoài kho và ngoài ! mới là sheet tự do', [hop.selectionIsFreeSheet('Customer'), hop.selectionIsFreeSheet('Config'), hop.selectionIsFreeSheet('!Lead'), hop.selectionIsFreeSheet('Bao cao')], [false, false, false, true]);
  check(so, 'mọi lời hỏi trên sheet tự do không ghi ô nào: bộ đếm lệnh ghi của tệp giả không đổi', JSON.parse(JSON.stringify(nen.dem)), JSON.parse(demTuDo));

  section('SelectionService — signal entities nạp trọn đúng một thực thể trong cùng lời hỏi');
  const truocEntity = hop.reloadStateRead().revision;
  trongLanChay(hop, () => hop.dirtyStateMarkDecision(hop.reloadDecisionForChange({ source: 'change', surface: 'entity', entities: ['customer'] })));
  const traEntity = hop.probeSelectionAndReload({ lastSeenRevision: truocEntity });
  const entityPart = traEntity.payload ? traEntity.payload.parts[0] : {};
  const payloadIds = entityPart.customer ? entityPart.customer.rows.map((row) => row[entityPart.customer.fields.indexOf('id')]) : [];
  check(so, 'signal entities [customer]: lời hỏi trả đúng một phần entity đọc trọn Customer, không đụng Activity',
    [traEntity.decision.ram.mode, traEntity.payload.parts.length, entityPart.mode, entityPart.entity, payloadIds.indexOf('CUS-000004') >= 0, entityPart.activity],
    ['parts', 1, 'entity', 'customer', true, undefined]);
  const truocDraft = hop.reloadStateRead().revision;
  trongLanChay(hop, () => hop.dirtyStateMarkDecision(hop.reloadDecisionForChange({ source: 'change', surface: 'entity', entities: ['customer'] })));
  check(so, 'nạp trọn thực thể bị chặn khi Sidebar giữ bản nháp, như full core',
    hop.probeSelectionAndReload({ lastSeenRevision: truocDraft, localDraft: { recordIds: ['CUS-000004'] } }).decision.ram.action, 'defer');

  section('SelectionService — lời hỏi rẻ: Extension đã đọc được vị trí thì GAS không chạm bảng tính');
  const daThay = hop.reloadStateRead().revision;
  const daBiet = hop.probeSelectionAndReload({ lastSeenRevision: daThay }).selection;
  const goc = { app: hop.SpreadsheetApp, mo: hop.shinOpenBook, sheet: nen.book.getActiveSheet };
  const cham = [];
  const camCham = (ten) => function () { cham.push(ten); throw new Error('lời hỏi rẻ chạm ' + ten); };
  hop.SpreadsheetApp = new Proxy({}, { get: (_, ten) => camCham('SpreadsheetApp.' + String(ten)) });
  hop.shinOpenBook = camCham('shinOpenBook');
  nen.book.getActiveSheet = camCham('getActiveSheet');
  let re;
  try {
    re = hop.probeSelectionAndReload({ skipPosition: true, lastSeenRevision: daThay, previousSelectionContext: daBiet, previousCustomerId: 'CUS-EXT', reason: 'signal' });
  } catch (err) {
    re = { loi: err.message };
  }
  Object.assign(hop, { SpreadsheetApp: goc.app, shinOpenBook: goc.mo });
  nen.book.getActiveSheet = goc.sheet;
  check(so, 'skipPosition: không gọi SpreadsheetApp, giữ mã khách Extension đọc, không trả vị trí, vẫn quyết định sheet theo vị trí Sidebar gửi',
    [cham, re.loi, re.ok, re.customerId, re.selection, !!re.view], [[], undefined, true, 'CUS-EXT', null, true]);
  const reCanDoc = hop.probeSelectionAndReload({ skipPosition: true, needsSelection: true, previousSelectionContext: daBiet, previousCustomerId: 'CUS-EXT' });
  check(so, 'skipPosition kèm needsSelection (Extension đọc hỏng) thì GAS vẫn mở bảng tính đọc thay', [reCanDoc.customerId, reCanDoc.selection && reCanDoc.selection.customerIdChanged], ['CUS-000005', true]);

  // Chụp vị trí tốn 0,1–0,3 giây mỗi lần; Sidebar chỉ đọc vị trí ở probeSelectionAndReload nên phản hồi khác không được chụp.
  const fs = require('fs');
  const path = require('path');
  const gocGas = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');
  const quet = (thuMuc) => fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((muc) => {
    const day = path.join(thuMuc, muc.name);
    if (muc.isDirectory()) { return muc.name === 'dev' ? [] : quet(day); }
    return muc.name.endsWith('.js') ? [path.relative(gocGas, day).split(path.sep).join('/')] : [];
  });
  const chupNgoai = quet(gocGas).filter((tep) => tep !== 'server/service/SelectionService.js').filter((tep) => {
    const nguon = fs.readFileSync(path.join(gocGas, tep), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /selectionProbeContext\s*\(|selectionSnapshotFromContext\s*\(|getActiveRange\s*\(/.test(nguon);
  });
  check(so, 'chỉ SelectionService.js chụp vị trí ô đang chọn (phản hồi lưu, xóa, nạp không chụp)', chupNgoai, []);

  return so;
}

module.exports = { chay };
