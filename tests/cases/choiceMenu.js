/** Kiểm tra control menu chọn: không dùng input combo và giữ popup dùng chung. */
const { napClient, taoHopCat } = require('../lib/load-gas');
const { domGia } = require('../lib/dom-gia');
const { section, check, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('UI — menu chọn dùng trigger button');
  const dom = domGia();
  const body = dom.document.createElement('div');
  body.id = 'sidebar-body';
  body.rect = { top: 0, bottom: 700, left: 0, right: 300 };
  dom.root.appendChild(body);
  const hop = napClient(taoHopCat({ document: dom.document, window: dom.window }),
    'client/ui/uiBuilder.html', 'client/ui/renderEngine.html', 'client/ui/popupList.html', 'client/ui/choiceMenu.html');
  hop.RENDER_REGIONS = { body: 'sidebar-body' };

  const html = hop.renderNode(hop.StandaloneControl({
    id: 'choice-mode',
    kind: 'menu',
    options: [{ value: 'read', label: 'Lấy từ FBM → ShinCRM' }, { value: 'push', label: 'Đẩy từ ShinCRM → FBM' }],
    value: 'read',
    ariaLabel: 'Loại đồng bộ'
  }), null);
  check(so, 'menu chọn render thành button, không phải input combo', [html.indexOf('data-standalone-menu="1"') > 0, html.indexOf('class="shin-choice-trigger"') > 0, html.indexOf('<input') === -1, html.indexOf('shin-popup-list shin-choice-list') > 0], [true, true, true, true]);

  body.innerHTML = html;
  const trigger = dom.document.getElementById('choice-mode');
  const list = dom.root.querySelector('.shin-choice-list');
  list.hidden = true;
  hop.choiceMenuInstall();
  hop.root = dom.root;
  dom.root.listeners.click({ target: trigger, preventDefault() {} });
  check(so, 'click trigger mở popup và không bôi đen/chọn text input', [list.hidden, trigger.getAttribute('aria-expanded'), list.children.length, trigger.tagName], [false, 'true', 2, 'BUTTON']);

  const second = list.children[1];
  dom.root.listeners.click({ target: second, preventDefault() {} });
  check(so, 'click một dòng cập nhật data-value và nhãn trigger', [trigger.getAttribute('data-value'), trigger.querySelector('.shin-choice-label').textContent, list.hidden, trigger.getAttribute('aria-expanded')], ['push', 'Đẩy từ ShinCRM → FBM', true, 'false']);

  dom.root.listeners.keydown({ target: trigger, key: 'ArrowDown', keyCode: 40, preventDefault() {} });
  check(so, 'mũi tên bàn phím mở lại menu dùng chung', [list.hidden, trigger.getAttribute('aria-expanded')], [false, 'true']);
  dom.root.listeners.keydown({ target: trigger, key: 'Escape', keyCode: 27, preventDefault() {} });
  check(so, 'Escape đóng menu mà không làm đổi lựa chọn', [list.hidden, trigger.getAttribute('data-value')], [true, 'push']);
  dom.root.listeners.click({ target: trigger, preventDefault() {} });
  const outside = dom.document.createElement('div');
  dom.document.listeners.click({ target: outside });
  check(so, 'PopupList tu dong dong popup khi click ra ngoai', [list.hidden, trigger.getAttribute('aria-expanded')], [true, 'false']);
}

module.exports = { chay };
