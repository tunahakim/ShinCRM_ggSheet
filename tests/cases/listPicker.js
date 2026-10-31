/** Hành vi chung của danh sách gợi ý nổi: hộp tìm khách và ô gõ-để-lọc cùng đi qua `ListPicker`. */
const { taoHopCat } = require('../lib/load-gas');
const { napTheoSidebar } = require('../lib/sidebar/nap-sidebar');
const { domGia } = require('../lib/dom-gia');
const { section, check, ghiLoiNap } = require('../lib/assert');

const doi = (ms) => new Promise((xong) => setTimeout(xong, ms));
const PHIM = (key, keyCode) => ({ key, keyCode: keyCode || 0, preventDefault() { this.chan = true; } });

function dungKhung(tep, stubs) {
  const dom = domGia();
  const proto = Object.getPrototypeOf(dom.root);
  proto.click = function () { this.ownerDocument.body.listeners.__root.click({ target: this }); };
  const hop = napTheoSidebar(['client/util/textNormalize.html', 'client/ui/popupList.html', 'client/ui/listPicker.html', ...tep], taoHopCat(Object.assign({ document: dom.document, window: dom.window, setTimeout, clearTimeout, Event: function Event() {} }, stubs)));
  hop.DISPATCH_ROOT_ID = 'sidebar-root';
  hop.RENDER_REGIONS = { body: 'sidebar-body' };
  dom.document.body.listeners.__root = dom.root.listeners;
  return { dom, hop };
}

function dungHopTim() {
  const khach = [
    { id: 'CUS-1', companyName: 'Công ty A' },
    { id: 'CUS-2', companyName: 'Công ty B' },
    { id: 'CUS-3', companyName: 'Công ty C' }
  ];
  const { dom, hop } = dungKhung(['client/ui/search.html'], {
    storeSearchTokens: (q) => String(q).split(/\s+/).filter(Boolean),
    Store: { searchCustomers: (q) => (String(q).indexOf('zzz') >= 0 ? [] : khach) },
    SLOTS: { searchSuggestions: (ctx) => ctx.records.search },
    renderNodes: (ds) => ds.map((c) => '<div class="shin-popup-item" data-action="setCurrentCustomer" data-pick="' + c.id + '">' + c.companyName + '</div>').join(''),
    ScreenState: { screen: 'view' },
    SCREEN_VIEW: 'view'
  });

  const panel = dom.document.createElement('div');
  panel.id = 'shin-search';
  panel.hidden = true;
  const input = dom.document.createElement('input');
  input.id = 'shin-search-input';
  input.className = 'shin-input';
  input.value = '';
  const popup = dom.document.createElement('div');
  popup.id = 'shin-search-popup';
  popup.className = 'shin-popup-list';
  popup.hidden = true;
  panel.appendChild(input);
  panel.appendChild(popup);
  dom.root.appendChild(panel);

  const chon = [];
  dom.root.addEventListener('click', (e) => {
    const dong = e.target.closest ? e.target.closest('[data-action]') : null;
    if (dong) { chon.push(dong.getAttribute('data-pick')); }
  });
  hop.searchInstall();
  return { dom, hop, panel, input, popup, chon };
}

function go(c, chu) {
  c.input.value = chu;
  c.dom.root.listeners.input({ target: c.input });
}

async function chay(so) {
  section('UI — danh sách gợi ý dùng chung (hộp tìm khách và ô gõ-để-lọc)');

  let c;
  try { c = dungHopTim(); } catch (err) { return ghiLoiNap(so, 'nạp hộp tìm khách với ListPicker', err); }
  const { dom, hop, panel, input, popup, chon } = c;
  const hang = () => popup.querySelectorAll('.shin-popup-item');
  const sang = () => hang().map((r, i) => (r.classList.contains('is-active') ? i : -1)).filter((i) => i >= 0);
  const phim = (k, code) => { const e = PHIM(k, code); e.target = input; dom.root.listeners.keydown(e); return e; };

  hop.searchOpen();
  input.focus();
  dom.root.listeners.focusin({ target: input });
  check(so, 'mở hộp lần đầu (ô trống) không bung danh sách', popup.hidden, true);

  go(c, 'cong ty');
  check(so, 'gõ chữ thì bung danh sách ba dòng, mỗi dòng role=option, dòng đầu tự sáng',
    [popup.hidden, hang().length, hang().every((r) => r.getAttribute('role') === 'option'), sang()], [false, 3, true, [0]]);

  phim('ArrowDown', 40);
  check(so, 'mũi tên xuống sáng dòng kế', sang(), [1]);
  phim('ArrowUp', 38); phim('ArrowUp', 38);
  check(so, 'mũi tên lên từ dòng đầu chạy vòng về dòng cuối', sang(), [2]);

  const enter = phim('Enter');
  check(so, 'Enter chọn dòng đang sáng bằng một cú click (đi qua bộ phát), ẩn danh sách, giữ chữ và giữ hộp mở',
    [chon.slice(), enter.chan === true, popup.hidden, input.value, panel.hidden], [['CUS-3'], true, true, 'cong ty', false]);

  dom.root.listeners.click({ target: input });
  check(so, 'bấm lại vào ô khi danh sách đã ẩn thì bung lại', [popup.hidden, hang().length], [false, 3]);

  dom.root.listeners.click({ target: hang()[1] });
  check(so, 'bấm chuột vào một dòng thì chọn khách đó và ẩn danh sách ngay, không đợi rời ô', [chon.slice(), popup.hidden], [['CUS-3', 'CUS-2'], true]);

  phim('ArrowDown', 40);
  check(so, 'mũi tên xuống khi danh sách đã ẩn thì bung lại', popup.hidden, false);

  phim('Escape', 27);
  check(so, 'Esc lúc danh sách đang mở chỉ ẩn danh sách, hộp và chữ còn nguyên', [popup.hidden, panel.hidden, input.value], [true, false, 'cong ty']);
  phim('Escape', 27);
  check(so, 'Esc lúc danh sách đã ẩn thì đóng hộp nhưng giữ chữ', [panel.hidden, input.value], [true, 'cong ty']);

  hop.searchOpen();
  input.focus();
  let daBoiDen = 0;
  input.select = () => { daBoiDen += 1; };
  dom.root.listeners.focusin({ target: input });
  await doi(80);
  check(so, 'mở lại hộp có chữ cũ thì danh sách bung theo và chữ được bôi đen', [popup.hidden, hang().length, daBoiDen], [false, 3, 1]);

  phim('Escape', 27); phim('Escape', 27);
  dom.root.listeners.focusout({ target: input });
  hop.searchOpen();
  input.focus();
  dom.root.listeners.focusin({ target: input });
  await doi(260);
  check(so, 'đóng hộp rồi mở lại ngay: hẹn giờ rời ô của lần trước không ẩn nhầm danh sách vừa bung', popup.hidden, false);

  go(c, 'zzz');
  check(so, 'không khách nào khớp thì danh sách vẫn mở (với dòng báo) và không dòng nào sáng', [popup.hidden, hang().length, sang()], [false, 0, []]);
  phim('Enter');
  check(so, 'Enter lúc không dòng nào sáng chỉ ẩn danh sách và không chọn ai', [chon.length, popup.hidden], [2, true]);

  go(c, 'cong');
  dom.root.listeners.focusout({ target: input });
  await doi(260);
  check(so, 'rời ô thì ẩn danh sách sau nhịp chờ', popup.hidden, true);

  await chayCombo(so);
}

async function chayCombo(so) {
  let c;
  try {
    c = dungKhung(['client/ui/customerPicker.html', 'client/ui/combo.html'], { Store: {}, Schema: {} });
  } catch (err) { return ghiLoiNap(so, 'nạp combo với ListPicker', err); }
  const { dom, hop } = c;

  const khung = dom.document.createElement('div');
  khung.className = 'shin-combo';
  const input = dom.document.createElement('input');
  input.className = 'shin-input';
  input.setAttribute('data-standalone-select', '1');
  input.setAttribute('data-standalone-options', JSON.stringify([{ value: 'a', label: 'Mục A' }, { value: 'b', label: 'Mục B' }]));
  input.value = '';
  const popup = dom.document.createElement('div');
  popup.className = 'shin-popup-list';
  popup.hidden = true;
  khung.appendChild(input);
  khung.appendChild(popup);
  dom.root.appendChild(khung);
  hop.customerPickerIsInput = () => false;
  const doiO = [];
  hop.inputsFocusNext = (el) => { doiO.push(el); };
  hop.comboInstall();

  const phim = (k, code) => { const e = PHIM(k, code); e.target = input; dom.root.listeners.keydown(e); return e; };
  const hang = () => popup.querySelectorAll('.shin-popup-item');

  input.focus();
  dom.root.listeners.focusin({ target: input });
  check(so, 'ô danh mục: con trỏ vào ô thì bung đủ danh sách, không dòng nào sáng và role=option',
    [popup.hidden, hang().length, hang().filter((r) => r.classList.contains('is-active')).length, hang().every((r) => r.getAttribute('role') === 'option')], [false, 2, 0, true]);

  const enterTrong = phim('Enter');
  check(so, 'ô danh mục: Enter lúc không dòng nào sáng chỉ ẩn danh sách và nhường phím cho bước nhảy ô', [popup.hidden, enterTrong.chan === true, doiO.length], [true, false, 0]);

  phim('ArrowDown', 40);
  phim('ArrowDown', 40);
  const enter = phim('Enter');
  check(so, 'ô danh mục: mũi tên rồi Enter điền giá trị, ẩn danh sách và nhảy sang ô kế',
    [input.value, input.getAttribute('data-value'), popup.hidden, enter.chan === true, doiO.length], ['Mục A', 'a', true, true, 1]);

  dom.root.listeners.click({ target: input });
  dom.root.listeners.click({ target: hang()[1] });
  check(so, 'ô danh mục: bấm chuột vào dòng điền giá trị đó và ẩn danh sách', [input.value, popup.hidden], ['Mục B', true]);

  phim('ArrowDown', 40);
  phim('Escape', 27);
  check(so, 'ô danh mục: Esc chỉ ẩn danh sách', popup.hidden, true);
}

module.exports = { chay };
