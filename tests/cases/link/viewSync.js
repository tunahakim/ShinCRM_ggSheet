/** Đồng bộ sheet quản trị từ Sidebar: bốn thời điểm đi qua một lời hỏi chung, dòng báo chưa cập nhật, màn thông báo lỗi vẽ, công tắc tự làm mới. */

const { section, check } = require('../../lib/assert');
const { docTep } = require('../../lib/load-gas');
const { napTheoSidebar } = require('../../lib/sidebar/nap-sidebar');
const { syncValue, dungHopLienKet, batDauLienKet } = require('../../lib/sidebar/hop-lien-ket');

/** Hộp cát cho phần sheet quản trị: ghi lại từng lời gọi máy chủ kèm lý do lời hỏi, trả câu trả lời dựng theo tên hàm. */
function dungHopView(answers) {
  const hop = dungHopLienKet(); batDauLienKet(hop);
  hop.SHEET_LINK_LAST_ACK = 5000; hop._clock.now = 5001;
  hop._log = [];
  hop._answers = answers || {};
  hop.callServer = (name, args) => {
    hop._log.push({ name, reason: name === 'probeSelectionAndReload' ? args[0].reason : '', input: name === 'probeSelectionAndReload' ? args[0] : null, options: name === 'renderViewIfDirty' ? args[1] : null });
    const answer = hop._answers[name];
    return Promise.resolve(typeof answer === 'function' ? answer(args) : (answer || { ok: true, reload: { revision: 0 } }));
  };
  return hop;
}

function tenGoi(hop, name) { return hop._log.filter((item) => item.name === name); }

async function chay(so) {
  section('Sidebar — vẽ sheet quản trị khi có người xem');
  const probeRender = { ok: true, reload: { revision: 5 }, selection: { spreadsheetId: 'sheet-1', gid: '2', sheetName: '!Lead', row: 4, col: 1, rowEnd: 4, colEnd: 1 }, view: { sheetName: '!Lead', stale: true, action: 'render' } };
  const drawn = { ok: true, sheetName: '!Lead', rows: 3, viewMeta: { revision: 2, filterColumns: [2], sortColumns: [] } };

  const once = dungHopView({ probeSelectionAndReload: probeRender, renderViewIfDirty: drawn });
  await once.sheetLinkProbeSelectionAndReload('wake');
  await once.sheetLinkProbeSelectionAndReload('wake');
  check(so, 'view.action = render: Sidebar gọi renderViewIfDirty đúng một lần cho hai phản hồi cùng revision, chỉ gửi tên sheet',
    [tenGoi(once, 'probeSelectionAndReload').length, tenGoi(once, 'renderViewIfDirty').length, tenGoi(once, 'renderViewIfDirty')[0].options === undefined], [2, 1, true]);
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

  // Tab hiện lại chỉ hỏi khi kênh im quá ngưỡng lúc ẩn, còn việc chờ hoặc Extension không trả lời.
  const anRoiHien = async (frames, visibleAt, extensionAlive) => {
    const hop = dungHopView(); hop.SHEET_LINK_LAST_SHEET = '!Lead';
    hop._clock.now = 10000; hop.changeSignalOnFrame(10000);
    hop.document.hidden = true; hop._clock.now = 11000; hop._documentListeners.visibilitychange();
    frames.forEach((at) => hop.changeSignalOnFrame(at));
    hop._clock.now = visibleAt; hop.SHEET_LINK_LAST_ACK = extensionAlive === false ? 0 : visibleAt; hop.document.hidden = false;
    hop._documentListeners.visibilitychange();
    await new Promise((resolve) => setImmediate(resolve));
    return tenGoi(hop, 'probeSelectionAndReload').filter((item) => item.reason === 'visible').length;
  };
  const deu = Array.from({ length: 29 }, (_, i) => 30000 + i * 20000);
  check(so, 'tab hiện lại: kênh có tin đều lúc ẩn thì không hỏi; im quá CHANNEL_SILENCE_MS (cả khoảng giữa lúc ẩn) hoặc Extension không trả lời thì hỏi đúng một lần',
    [await anRoiHien(deu, 600000), await anRoiHien([], 200000), await anRoiHien([30000, 250000, 260000], 270000), await anRoiHien(deu, 600000, false)],
    [0, 1, 1, 1]);
  check(so, 'vào sheet ! không gọi bộ vẽ riêng ngoài quyết định của lời hỏi', tenGoi(enter, 'renderViewIfDirty'), []);
  enter.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 3, col: 2 });
  enter.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 5, col: 1 });
  check(so, 'nhấp ô điều khiển rồi rời ô trên sheet ! không gọi máy chủ: trigger gắn cờ, lời hỏi chung vẽ',
    [tenGoi(enter, 'renderViewIfDirty').length, enter._log.map((item) => item.name).filter((name) => name !== 'probeSelectionAndReload')], [0, []]);

  // Núm tắt: dòng báo "chưa cập nhật" kèm nút Làm mới; vẽ xong thì mất; rời sheet cũng mất.
  const notify = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { view: { sheetName: '!Lead', stale: true, action: 'notify', problems: [] } }) });
  notify.SHEET_LINK_LAST_SHEET = '!Lead';
  await notify.sheetLinkProbeSelectionAndReload('wake');
  const shown = [notify._banner.hidden, notify._banner.textContent, notify._noticeButton.hidden, notify._noticeButton['data-action'], tenGoi(notify, 'renderViewIfDirty').length, notify._screens];
  notify.sheetLinkViewApplyResult('!Lead', { ok: true, sheetName: '!Lead', rows: 3 });
  const afterRefresh = notify._banner.hidden;
  await notify.sheetLinkProbeSelectionAndReload('wake');
  notify.sheetLinkApplyContext({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4, col: 1 });
  check(so, 'view.action = notify hiện dòng báo kèm nút Làm mới, không vẽ, không thay thân; vẽ thủ công xong thì mất; rời sheet ! thì mất',
    [shown, afterRefresh, notify._banner.hidden], [[false, 'Sheet !Lead chưa cập nhật', false, 'renderActiveViewSheet', 0, []], true, true]);

  // Lỗi vẽ: thân Sidebar thành màn thông báo nhiều khối, tự vẽ lại khi lỗi đổi, hết lỗi tự trả màn xem khách.
  const blocks = [{ title: 'Điều kiện lọc sai (hàng 3)', lines: ['Ô B3 (@CUS_TEN_CTY): sai'], hint: '' }, { title: 'Có công thức trong các cột ShinCRM tự vẽ', lines: ['Cột C, stt: 3, Mã cột: @CUS_MST'], hint: 'Chuyển công thức.' }];
  const failed = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { view: { sheetName: '!Lead', stale: true, action: 'notify', problems: blocks } }) });
  failed.SHEET_LINK_LAST_SHEET = '!Lead';
  await failed.sheetLinkProbeSelectionAndReload('wake');
  const firstScreen = failed._screens.slice();
  const lineFailed = [failed._banner.textContent, failed._noticeButton.hidden];
  let picked = 0;
  failed.ACTIONS.setCurrentCustomer = () => { picked += 1; };
  failed.Store = { hasCustomer: () => true };
  failed.sheetLinkApplyCustomerContext({ sheetName: '!Lead', customerId: 'KH1' });
  failed.sheetLinkViewApplyResult('!Lead', { ok: false, sheetName: '!Lead', problems: blocks.slice(1) });
  failed.sheetLinkViewApplyResult('!Lead', { ok: true, sheetName: '!Lead', rows: 2 });
  check(so, 'lỗi vẽ: thân thành màn thông báo mỗi lỗi một khối, dòng đáy báo sheet chưa vẽ được, nhấp dòng sheet lỗi không thay màn, lỗi đổi thì vẽ lại, hết lỗi trả màn xem khách',
    [firstScreen, lineFailed, picked, failed._screens.slice(1), failed._banner.hidden],
    [[{ infoText: 'Sheet !Lead chưa vẽ được — đang giữ dữ liệu cũ', titles: blocks.map((block) => block.title) }], ['Sheet !Lead chưa vẽ được — đang giữ dữ liệu cũ', true], 0,
      [{ infoText: 'Sheet !Lead chưa vẽ được — đang giữ dữ liệu cũ', titles: [blocks[1].title] }, 'view'], true]);

  // Nhiều việc cùng lúc: dòng đáy báo việc ưu tiên nhất kèm số việc còn lại, màn thông báo xếp khối theo thứ tự ưu tiên.
  const many = dungHopView();
  many.SHEET_LINK_LAST_SHEET = '!Lead';
  many.noticeSet('extension', { line: 'Thiếu Extension', blocks: [{ title: 'Thiếu Extension', lines: [] }] });
  many.sheetLinkViewApplyResult('!Lead', { ok: false, sheetName: '!Lead', problems: blocks });
  many.sheetLinkViewApplyResult('!Other', { ok: false, sheetName: '!Other', problems: blocks });
  check(so, 'lỗi sheet đang đứng xếp trước mất Extension, dòng đáy kèm +N; kết quả của sheet đã rời bị bỏ qua',
    [many._banner.textContent, many._screens], ['Sheet !Lead chưa vẽ được — đang giữ dữ liệu cũ · +1', [{ infoText: 'Sheet !Lead chưa vẽ được — đang giữ dữ liệu cũ', titles: blocks.map((block) => block.title).concat(['Thiếu Extension']) }]]);

  const sidebarHtml = docTep('client/Sidebar.html');
  const actionsHtml = docTep('client/ui/actions.html');
  const sources = ['client/link/sheetLink.html', 'client/link/selectionPoll.html', 'client/sync/fbmSync.html', 'client/ui/actions.html'].map((rel) => docTep(rel)).join(' ');
  check(so, 'đáy Sidebar chỉ còn một dòng báo do tệp thông báo sở hữu; nút Làm mới áp kết quả vào thông báo; không còn đường dò ô điều khiển phía Sidebar',
    [/id="shin-notice"[^>]*data-action="toggleNotices"/.test(sidebarHtml), /shin-extension-warning|shin-view-stale/.test(sidebarHtml + sources),
      /renderActiveViewSheet[\s\S]*?sheetLinkViewApplyResult/.test(actionsHtml), /inspectViewState|controlsOnly|viewMeta/.test(sources)], [true, false, true, false]);

  // Công tắc tự động làm mới.
  const viewSchema = docTep('client/schema/screens/view.html');
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

  // Lượt đồng bộ đang chạy không còn là lý do hoãn: mỗi lần chạy GAS có thay đổi phát một tín hiệu, Sidebar áp ngay và vẽ view cùng lúc.
  const syncing = dungHopView({ probeSelectionAndReload: Object.assign({}, probeRender, { reload: { revision: 12 }, processedRevision: 12, payload: { parts: [{ mode: 'records' }] } }), renderViewIfDirty: drawn });
  syncing.FBM_SYNC_CLIENT = { running: true, active: false };
  syncing._payloads = [];
  syncing._busy = [];
  syncing.refreshReloadPayload = (payload) => { syncing._payloads.push(payload.parts.map((part) => part.mode).join('+')); return payload; };
  syncing.sidebarBusyRun = (message, work, options) => { syncing._busy.push(options); return work(); };
  syncing.SHEET_LINK_LAST_SEEN_REVISION = 3;
  await syncing.sheetLinkProbeSelectionAndReload('dirty-state');
  check(so, 'lượt đồng bộ đang chạy: lời hỏi không gửi cờ syncRunning/forceImmediate, payload áp ngay và view vẽ cùng lượt',
    [tenGoi(syncing, 'probeSelectionAndReload').map((item) => ['syncRunning' in item.input, 'forceImmediate' in item.input]), syncing._payloads, tenGoi(syncing, 'renderViewIfDirty').length, syncing.SHEET_LINK_LAST_SEEN_REVISION],
    [[[false, false]], ['records'], 1, 12]);
  check(so, 'payload và lượt vẽ view từ lời hỏi tín hiệu gọi sidebarBusyRun với block: false, progress: true (thanh loading vẫn chạy, không chặn người đang thao tác)',
    syncing._busy.map((item) => [item.block, item.progress]), [[false, true], [false, true]]);

  const fbm = napTheoSidebar(['client/sync/fbmSync.html']);
  fbm.fbmSyncSetRunning(true); fbm.fbmSyncSetRunning(false);
  const fbmSource = docTep('client/sync/fbmSync.html');
  const sidebarSources = ['client/link/sheetLink.html', 'client/ram/refresh.html', 'client/sync/fbmSync.html'].map((rel) => docTep(rel)).join(' ');
  check(so, 'cờ lượt chạy đổi qua một cửa và không còn đường hoãn nạp theo đồng bộ phía Sidebar (sync-finished, refreshDeferredBySync, hẹn giờ debounce)',
    [fbm.FBM_SYNC_CLIENT.running, (fbmSource.match(/FBM_SYNC_CLIENT\.running\s*=[^=]/g) || []).length, /sheetLinkSyncFinished|refreshDeferredBySync|SHEET_LINK_RELOAD_TIMER|forceImmediate|syncRunning/.test(sidebarSources)],
    [false, 1, false]);

  // Lời hỏi chọn ô mang danh sách thông báo thì Sidebar thay trọn phần thông báo máy chủ ngay ở lời trả đó.
  const cho = dungHopLienKet();
  const daHien = [];
  cho.noticeServerApply = (list) => { daHien.push(list); };
  cho.callServer = () => syncValue({ ok: true, selection: null, customerId: '', reload: { revision: 0 }, notices: [{ key: 'entry_failure:shinOnEdit', title: 'lỗi nền' }] });
  batDauLienKet(cho);
  await cho.sheetLinkProbeSelectionAndReload('wake');
  check(so, 'lời hỏi chọn ô và nạp lại mang thông báo thì Sidebar đưa vào cửa noticeServerApply',
    daHien,
    [[{ key: 'entry_failure:shinOnEdit', title: 'lỗi nền' }]]);
}


module.exports = { chay: chay };
