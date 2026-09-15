/** Kiểm trigger mở tệp bằng UI giả, vì Apps Script không có UI khi chạy Node. */

const { taoHopCat, napServer } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function dungCanh() {
  const events = [];
  const menuEntries = [];
  const sidebar = [];
  const entryCalls = [];
  const triggers = [];
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
  const triggerBuilder = (handler) => ({
    forSpreadsheet: () => triggerBuilder(handler),
    onOpen: () => triggerBuilder(handler),
    create: () => { events.push('trigger-created:' + handler); triggers.push({ getHandlerFunction: () => handler }); }
  });
  const hop = taoHopCat({
    ERROR_CHANNEL_ALERT: 'alert',
    ERROR_CHANNEL_THROW: 'throw',
    SpreadsheetApp: { getUi: () => ui, getActiveSpreadsheet: () => ({ id: 'book' }) },
    ScriptApp: { getProjectTriggers: () => triggers, newTrigger: triggerBuilder },
    HtmlService: { createTemplateFromFile: (path) => { events.push('template-created:' + path); return template; } },
    runEntryPoint: (name, source, channel, fn) => { entryCalls.push([name, source, channel]); return fn(); }
  });
  napServer(hop, 'server/entry/Menu.js');
  return { hop, events, menuEntries, sidebar, entryCalls, triggers };
}

function chay(so) {
  section('Menu — trigger đơn dựng menu, trigger cài đặt mở sidebar');

  let canh;
  try { canh = dungCanh(); } catch (err) { return ghiLoiNap(so, 'nạp server/entry/Menu.js với UI giả', err); }

  canh.hop.onOpen();
  check(so, 'onOpen đơn chỉ thêm menu, không cố mở Sidebar khi thiếu quyền UI',
    [canh.events, canh.menuEntries[0], canh.sidebar.length, canh.triggers.length],
    [['menu-created', 'menu-added'], ['title', 'ShinCRM'], 0, 0]);

  canh.hop.shinShowSidebar();
  check(so, 'lệnh mở Sidebar cài đúng một trigger mở tệp rồi dựng cùng khung Sidebar',
    [canh.triggers.map((trigger) => trigger.getHandlerFunction()), canh.sidebar.length, canh.sidebar[0].title, canh.entryCalls],
    [['shinAutoShowSidebar'], 1, 'ShinCRM', [['shinShowSidebar', 'core', 'alert']]]);

  canh.hop.shinShowSidebar();
  canh.hop.shinAutoShowSidebar();
  check(so, 'lượt mở sau không tạo trigger trùng và trigger cài đặt dùng kênh không alert',
    [canh.triggers.length, canh.sidebar.length, canh.entryCalls],
    [1, 3, [['shinShowSidebar', 'core', 'alert'], ['shinShowSidebar', 'core', 'alert'], ['shinShowSidebar', 'core', 'throw']]]);
}

module.exports = { chay };
