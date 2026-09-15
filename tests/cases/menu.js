/** Kiểm trigger mở tệp bằng UI giả, vì Apps Script không có UI khi chạy Node. */

const { taoHopCat, napServer } = require('../lib/load-gas');
const { section, check, ghiLoiNap } = require('../lib/assert');

function dungCanh() {
  const events = [];
  const menuEntries = [];
  const sidebar = [];
  const entryCalls = [];
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
    ERROR_CHANNEL_ALERT: 'alert',
    ERROR_CHANNEL_THROW: 'throw',
    SpreadsheetApp: { getUi: () => ui },
    HtmlService: { createTemplateFromFile: (path) => { events.push('template-created:' + path); return template; } },
    runEntryPoint: (name, source, channel, fn) => { entryCalls.push([name, source, channel]); return fn(); }
  });
  napServer(hop, 'server/entry/Menu.js');
  return { hop, events, menuEntries, sidebar, entryCalls };
}

function chay(so) {
  section('Menu — onOpen dựng menu rồi tự mở sidebar');

  let canh;
  try { canh = dungCanh(); } catch (err) { return ghiLoiNap(so, 'nạp server/entry/Menu.js với UI giả', err); }

  canh.hop.onOpen();
  check(so, 'onOpen thêm menu trước khi dựng và hiện sidebar', canh.events,
    ['menu-created', 'menu-added', 'template-created:client/Sidebar', 'template-evaluated', 'sidebar-shown']);
  check(so, 'onOpen dùng cùng khung Sidebar và kênh lỗi không bật alert',
    [canh.menuEntries[0], canh.sidebar.length, canh.sidebar[0].title, canh.entryCalls],
    [['title', 'ShinCRM'], 1, 'ShinCRM', [['shinShowSidebar', 'core', 'throw']]]);
}

module.exports = { chay };
