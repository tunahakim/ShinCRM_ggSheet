/** Kiểm trigger mở tệp bằng UI giả, vì Apps Script không có UI khi chạy Node. */

const { taoHopCat, napServer } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function dungCanh() {
  const events = [];
  const menuEntries = [];
  const sidebar = [];
  const entryCalls = [];
  const notices = [];
  const logs = [];
  const menu = {
    addItem: (label, handler) => { menuEntries.push(['item', label, handler]); return menu; },
    addSeparator: () => { menuEntries.push(['separator']); return menu; },
    addToUi: () => { events.push('menu-added'); return menu; }
  };
  const ui = {
    createMenu: (title) => { events.push('menu-created'); menuEntries.push(['title', title]); return menu; },
    showSidebar: (html) => { events.push('sidebar-shown'); sidebar.push(html); }
  };
  const template = {
    evaluate: () => {
      events.push('template-evaluated');
      return {
        title: '',
        setTitle(title) { this.title = title; return this; }
      };
    }
  };
  const hop = taoHopCat({
    SpreadsheetApp: { getUi: () => ui, getActiveSpreadsheet: () => ({ id: 'book' }) },
    HtmlService: { createTemplateFromFile: (path) => { events.push('template-created:' + path); return template; } },
    runEntryPoint: (name, source, fn) => { entryCalls.push([name, source]); return fn(); },
    triggersEnsure: () => { events.push('triggers-ensured'); if (canh.ensureFails) { throw Object.assign(new Error('Không xác định được chủ tệp'), { code: 'TRIGGER_OWNER_UNKNOWN' }); } return canh.ensureResult; },
    noticeRaise: (input) => { notices.push(['raise', input.topic, input.title]); return canh.raiseChanged; },
    noticeResolve: (topic) => { notices.push(['resolve', topic]); return null; },
    errorMessage: (err) => err.message,
    logEvent: (entry) => logs.push([entry.action, entry.outcome]),
    LOG_ERROR: 'error'
  });
  const canh = { hop, events, menuEntries, sidebar, entryCalls, notices, logs, ensureFails: false, raiseChanged: true, ensureResult: { ok: true, installed: [] } };
  napServer(hop, 'server/entry/Menu.js');
  return canh;
}

function chay(so) {
  section('Menu — trigger đơn dựng menu, mở Sidebar qua người điều phối đảm bảo trigger');

  let canh;
  try { canh = dungCanh(); } catch (err) { return ghiLoiNap(so, 'nạp server/entry/Menu.js với UI giả', err); }

  canh.hop.onOpen();
  check(so, 'onOpen đơn chỉ thêm menu, không cố mở Sidebar khi thiếu quyền UI',
    [canh.events, canh.menuEntries[0], canh.sidebar.length],
    [['menu-created', 'menu-added'], ['title', 'ShinCRM'], 0]);

  canh.hop.shinShowSidebar();
  check(so, 'lệnh mở Sidebar đảm bảo trigger trước rồi dựng khung, trigger đủ thì gỡ thông báo cài trigger',
    [canh.events.slice(2), canh.sidebar.length, canh.sidebar[0].title, canh.entryCalls, canh.notices],
    [['triggers-ensured', 'template-created:client/Sidebar', 'template-evaluated', 'sidebar-shown'], 1, 'ShinCRM', [['shinShowSidebar', 'core']], [['resolve', 'trigger_setup']]]);

  canh.hop.shinAutoShowSidebar();
  check(so, 'trigger mở tệp đi cùng người điều phối và không bật hộp thoại',
    [canh.events.filter((e) => e === 'triggers-ensured').length, canh.sidebar.length, canh.entryCalls[1]],
    [2, 2, ['shinAutoShowSidebar', 'core']]);

  canh.ensureResult = { ok: true, skipped: 'not_owner', installed: [] };
  canh.notices.length = 0;
  canh.hop.shinShowSidebar();
  check(so, 'người khác chủ tệp mở Sidebar không gỡ thông báo lỗi trigger của chủ tệp',
    [canh.notices, canh.sidebar.length], [[], 3]);

  canh.ensureFails = true;
  canh.hop.shinShowSidebar();
  check(so, 'cài trigger hỏng: Sidebar vẫn mở, phát thông báo và ghi một dòng Log',
    [canh.sidebar.length, canh.notices, canh.logs], [4, [['raise', 'trigger_setup', 'Không xác định được chủ tệp']], [['triggersEnsure', 'error']]]);

  canh.raiseChanged = false;
  canh.hop.shinShowSidebar();
  check(so, 'mở lại khi lỗi trigger không đổi: vẫn phát thông báo nhưng không ghi Log trùng',
    [canh.sidebar.length, canh.notices.length, canh.logs.length], [5, 2, 1]);
}

module.exports = { chay };
