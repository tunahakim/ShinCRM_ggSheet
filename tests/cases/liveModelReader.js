const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'model', 'live_model_reader.js');

/** Tên biến toàn cục và thuộc tính cố ý khác bản Google thật: bộ đọc phải tự dò từ `window`, không dựa vào tên rút gọn nào. */
function napReader(globals) {
  let onMessage = null;
  const sent = [];
  const timers = [];
  const window = Object.assign({
    addEventListener(name, fn) { if (name === 'message') { onMessage = fn; } },
    postMessage(data, targetOrigin) { sent.push({ data, targetOrigin }); }
  }, globals);
  const hop = {
    console,
    WeakSet,
    location: { origin: 'https://docs.google.com' },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    window
  };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), hop, { filename: FILE });
  hop.request = (data) => {
    onMessage({ source: window, origin: 'https://docs.google.com', data });
    return sent[sent.length - 1].data;
  };
  hop.flush = () => { while (timers.length) { timers.shift()(); } };
  hop.sent = sent;
  return hop;
}

function grid(rows, key) {
  return rows.map((row) => row.map((value) => (value === undefined ? {} : { [key || 'vv']: value, khac: 'x' })));
}

/** Bản sao vùng đang hiện: đánh số theo hàng thật nhưng chỉ có vài hàng, giá trị ở thuộc tính khác lưới đầy đủ. */
function banSao(rows) {
  const copy = [];
  Object.keys(rows).forEach((index) => { copy[index] = rows[index].map((value) => ({ dv: value })); });
  return copy;
}

function sheet(gid, rows) {
  return { idx: gid, ea: { ea: grid(rows) } };
}

/**
 * Bảng quy đổi một chiều như Google: vị trí đang hiện → vị trí thật, mảng đánh dấu khác 0 ở vị trí ẩn (2) hoặc bị lọc (1),
 * và gid của sheet nằm ngay dưới object chứa. Tên thuộc tính cố ý khác bản thật.
 */
function truc(gid, real, hidden) {
  const an = hidden || {};
  const marks = [];
  const index = [];
  for (let i = 0; i < real; i += 1) { marks.push(an[i] || 0); if (!an[i]) { index.push(i); } }
  return { kf: false, pos: index, mk: marks, phu: marks.concat([0]), meta: { sid: gid } };
}

/** Hai bảng quy đổi (hàng, cột) của một sheet không ẩn gì. */
function trucDu(gid, rows) {
  return [truc(gid, rows.length), truc(gid, rows[0].length)];
}

/** Lưới gọn chỉ giữ hàng và cột đang hiện, như lưới đầy đủ của Google khi có hàng/cột ẩn. */
function gon(rows, hiddenRows, hiddenCols) {
  return rows.filter((row, i) => !(hiddenRows || {})[i]).map((row) => row.filter((value, j) => !(hiddenCols || {})[j]));
}

const CUSTOMER = [['@CUS_MA_KH', '@CUS_TEN_CT'], ['KH000006', 'Công ty 6'], ['', 'Công ty trống'], ['KH000008', 'Công ty 8']];
const VIEW = [['@CUS_MA_KH', '@CUS_TEN_CT'], ['KH999999', ''], ['KH999998', ''], ['KH999997', ''], ['KH999996', ''], ['KH999995', '']];

/** Sheet đang mở nằm ở một ô cố định; sheet khác (View, dài hơn, cũng có cột mã) nằm trong danh sách. */
function trang(copyRows) {
  return {
    Ap: { act: { slot: sheet('9', CUSTOMER) }, list: [{ wrap: sheet('10', VIEW) }] },
    Ve: { copy: { ji: '9', dc: { ea: { ea: banSao(copyRows || { 0: CUSTOMER[0], 3: CUSTOMER[3] }) } } } },
    Ax: { dims: trucDu('9', CUSTOMER).concat(trucDu('10', VIEW)) }
  };
}

function chay(so) {
  section('Extension live model reader — tự dò lưới theo object mang gid, đối chiếu mọi lưới, fail-closed');
  let hop;
  let globals;
  try {
    globals = trang();
    hop = napReader(globals);
  } catch (err) {
    return ghiLoiNap(so, 'nạp live_model_reader.js', err);
  }

  const base = {
    action: 'CRM_LIVE_MODEL_READ_REQUEST',
    source: 'SHINCRM_EXTENSION',
    requestId: 'live-1',
    spreadsheetId: 'sheet-1',
    gid: '9',
    sheetName: 'Customer',
    row: 2,
    readPlan: { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' }] }
  };
  const ask = (patch) => hop.request(Object.assign({}, base, patch));

  const dangDo = hop.request(base);
  check(so, 'lần đọc đầu trả unavailable trong lúc dò, không đoán giá trị',
    [dangDo.status, dangDo.reason, dangDo.reads.length], ['unavailable', 'LIVE_GRID_SEARCHING', 0]);

  hop.flush();
  const docDuoc = ask({ requestId: 'live-2' });
  check(so, 'dò từ biến toàn cục bất kỳ (không cần trixApp) rồi đọc thô theo địa chỉ, không tạo customerId',
    [docDuoc.status, docDuoc.reads[0].value, Object.prototype.hasOwnProperty.call(docDuoc, 'customerId'), hop.sent[1].targetOrigin],
    ['ok', 'KH000006', false, 'https://docs.google.com']);

  const quaBanSao = ask({ requestId: 'live-3', row: 4 });
  check(so, 'hàng có cả ở lưới đầy đủ và bản sao vùng đang hiện, hai bên cùng giá trị thì nhận',
    [quaBanSao.status, quaBanSao.reads[0].value], ['ok', 'KH000008']);

  const oTrong = ask({ requestId: 'live-4', row: 3 });
  check(so, 'ô trống trả reads rỗng thay vì suy đoán mã',
    [oTrong.status, oTrong.reads[0].value, Object.prototype.hasOwnProperty.call(oTrong, 'customerId')], ['ok', '', false]);

  const sheetKhac = ask({ requestId: 'live-5', gid: '10', sheetName: '!View', row: 3, readPlan: { '!': base.readPlan.Customer } });
  hop.flush();
  const docView = ask({ requestId: 'live-6', gid: '10', sheetName: '!View', row: 3, readPlan: { '!': base.readPlan.Customer } });
  check(so, 'gid khác dò riêng và đọc đúng lưới của sheet đó, không lấy lưới Customer',
    [sheetKhac.reason, docView.status, docView.reads[0].value], ['LIVE_GRID_SEARCHING', 'ok', 'KH999998']);

  const lech = ask({ requestId: 'live-7', readPlan: { Customer: [{ token: 'id', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }] } });
  check(so, 'giá trị kỳ vọng không nằm ở địa chỉ khai báo bị trả về rõ ràng',
    [lech.status, lech.reason, lech.reads[0].status], ['mismatch', 'READ_PLAN_MISMATCH', 'mismatch']);

  const thieuCot = ask({ requestId: 'live-8', readPlan: { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@KHONG_CO', valueAddressTemplate: 'A{row}' }] } });
  hop.flush();
  const sauThieuCot = ask({ requestId: 'live-9' });
  check(so, 'readPlan nêu cột chưa có không làm mất đường đã dò của sheet',
    [thieuCot.status, sauThieuCot.status, sauThieuCot.reads[0].value], ['unavailable', 'ok', 'KH000006']);

  // Google đổi sheet đang mở: ô cố định giờ giữ View, lưới Customer dời vào danh sách.
  globals.Ap.list.push({ wrap: globals.Ap.act.slot });
  hop.window.Ap.act.slot = hop.window.Ap.list[0].wrap;
  const sauDoiSheet = ask({ requestId: 'live-10', row: 2 });
  hop.flush();
  const daDoLai = ask({ requestId: 'live-11', row: 2 });
  check(so, 'đổi sheet làm ô cố định mang gid khác thì không đọc lưới đó, dò lại và tìm Customer ở chỗ mới',
    [sauDoiSheet.reads.length ? sauDoiSheet.reads[0].value : '', daDoLai.status, daDoLai.reads[0].value], ['', 'ok', 'KH000006']);

  const lechBanSao = napReader(trang({ 0: CUSTOMER[0], 1: ['KH777777'], 3: CUSTOMER[3] }));
  lechBanSao.request(base);
  lechBanSao.flush();
  const xungDot = lechBanSao.request(Object.assign({}, base, { requestId: 'conflict-2' }));
  check(so, 'hai lưới hợp lệ cho hai giá trị khác nhau ở cùng ô thì fail-closed LIVE_GRID_CONFLICT, không chọn bên nào',
    [xungDot.status, xungDot.reason, xungDot.reads[0].status], ['unavailable', 'LIVE_GRID_CONFLICT', 'unavailable']);

  const giuCho = napReader(trang({ 0: CUSTOMER[0], 1: [undefined], 2: [null], 3: CUSTOMER[3] }));
  giuCho.request(base);
  giuCho.flush();
  const quaGiuCho = giuCho.request(Object.assign({}, base, { requestId: 'placeholder-2' }));
  const oTrongQuaGiuCho = giuCho.request(Object.assign({}, base, { requestId: 'placeholder-3', row: 3 }));
  check(so, 'ô giữ chỗ chưa có giá trị trong bản sao vùng đang hiện không bị coi là lệch với lưới đầy đủ, ô trống thật vẫn đọc là rỗng',
    [quaGiuCho.status, quaGiuCho.reads[0].value, oTrongQuaGiuCho.status, oTrongQuaGiuCho.reads[0].value], ['ok', 'KH000006', 'ok', '']);

  const chiBanSao = napReader({ Ve: { copy: { ji: '9', dc: { ea: { ea: banSao({ 0: CUSTOMER[0], 3: CUSTOMER[3] }) } } } }, Ax: { dims: trucDu('9', CUSTOMER) } });
  chiBanSao.request(base);
  chiBanSao.flush();
  const ngoaiVung = chiBanSao.request(Object.assign({}, base, { requestId: 'copy-2', row: 2 }));
  check(so, 'chỉ còn bản sao vùng đang hiện thì hàng ngoài vùng trả unavailable, không mượn hàng khác',
    [ngoaiVung.status, ngoaiVung.reads[0].status, ngoaiVung.reads[0].value], ['unavailable', 'unavailable', '']);

  const TRUNG = [['@CUS_MA_KH', '@CUS_MA_KH'], ['KH000001', 'KH000002'], ['', '']];
  const trung = napReader({ Ap: { slot: sheet('9', TRUNG) }, Ax: { dims: trucDu('9', TRUNG) } });
  trung.request(base);
  trung.flush();
  const trungDoc = trung.request(Object.assign({}, base, { requestId: 'dup-2' }));
  check(so, 'hàng 1 trả địa chỉ vật lý kể cả khi có header trùng',
    [trungDoc.rawHeaderRow[0].address, trungDoc.rawHeaderRow[1].address, Object.prototype.hasOwnProperty.call(trungDoc, 'customerId')],
    ['A1', 'B1', false]);

  const xaQua = napReader({ Ap: { slot: { idx: '9', a: { b: { c: { d: grid(CUSTOMER) } } } } }, Bp: { wrap: sheet('10', VIEW) } });
  xaQua.request(base);
  xaQua.flush();
  const khongThay = xaQua.request(Object.assign({}, base, { requestId: 'none-2' }));
  check(so, 'lưới cách object mang gid quá ba tầng hoặc thuộc gid khác thì LIVE_GRID_NOT_FOUND, không mượn',
    [khongThay.status, khongThay.reason, khongThay.reads.length], ['unavailable', 'LIVE_GRID_NOT_FOUND', 0]);

  const soGid = napReader({ Ap: { slot: { idx: 9, ea: { ea: grid(CUSTOMER) } } } });
  soGid.request(base);
  soGid.flush();
  const gidSo = soGid.request(Object.assign({}, base, { requestId: 'num-2' }));
  check(so, 'chỉ nhận gid dạng chuỗi đúng tuyệt đối, số trùng giá trị không đủ làm object sheet',
    [gidSo.status, gidSo.reason], ['unavailable', 'LIVE_GRID_NOT_FOUND']);

  let getterDaChay = 0;
  const docGetter = napReader(trang());
  Object.defineProperty(docGetter.window, 'nguyHiem', { enumerable: true, get() { getterDaChay += 1; return { idx: '9' }; } });
  docGetter.request(base);
  docGetter.flush();
  const quaGetter = docGetter.request(Object.assign({}, base, { requestId: 'getter-2' }));
  check(so, 'phép dò không gọi getter của trang Google',
    [getterDaChay, quaGetter.status], [0, 'ok']);

  chayAnVaLoc(so, base);
}

/** Sheet `!` có hai cột sắp xếp ẩn không liền nhau kẹp cột mã, một hàng ẩn tay và một hàng bị bộ lọc giấu. */
const LEAD = [
  ['@SORT_1', '@CUS_MA_KH', '@SORT_2', '@CUS_TEN_CT'],
  ['a', 'Mã khách', 'b', 'Tên'],
  ['x', 'CUS-000003', 'x', 'Công ty 3'],
  ['x', 'CUS-000004', 'x', 'Công ty 4'],
  ['x', 'CUS-000005', 'x', 'Công ty 5'],
  ['x', 'CUS-000006', 'x', 'Công ty 6']
];
const AN_HANG = { 2: 2, 4: 1 };
const AN_COT = { 0: 2, 2: 2 };

function trangLead(patch) {
  const dims = [truc('7', LEAD.length, AN_HANG), truc('7', LEAD[0].length, AN_COT)];
  return Object.assign({
    Ap: { slot: { idx: '7', ea: { ea: grid(gon(LEAD, AN_HANG, AN_COT)) } } },
    // Bản sao vùng đang hiện đánh số theo tọa độ thật; không khớp kích thước bảng quy đổi nên không được đọc.
    Ve: { copy: { ji: '7', dc: { ea: { ea: banSao({ 0: LEAD[0], 5: LEAD[5] }) } } } },
    Ax: { dims: dims.concat(trucDu('9', CUSTOMER)) }
  }, patch || {});
}

function docLead(globals, rows, plan) {
  const hop = napReader(globals);
  const ask = (row, i) => hop.request({
    action: 'CRM_LIVE_MODEL_READ_REQUEST', source: 'SHINCRM_EXTENSION', requestId: 'lead-' + i, spreadsheetId: 'sheet-1',
    gid: '7', sheetName: '!lead', row,
    readPlan: { '!': plan || [{ token: 'id', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }] }
  });
  ask(rows[0], 'dau');
  hop.flush();
  return { hop, ask, ketQua: rows.map((row, i) => ask(row, i)) };
}

function chayAnVaLoc(so, base) {
  section('Extension live model reader — hàng, cột ẩn và bộ lọc đọc qua bảng quy đổi của Google');

  const lead = docLead(trangLead(), [4, 6, 3, 5]);
  const [h4, h6, h3, h5] = lead.ketQua;
  check(so, 'cột mã kẹp giữa hai cột sắp xếp ẩn không liền nhau, hàng ẩn tay và hàng bị lọc nằm trước: đọc đúng khách của hàng thật',
    [h4.status, h4.reason, h4.reads[0].status, h4.reads[0].value, h6.status, h6.reads[0].value], ['ok', '', 'ok', 'CUS-000004', 'ok', 'CUS-000006']);
  check(so, 'ô thật đang ẩn tay hoặc bị lọc không đọc ra khách của hàng khác',
    [h3.status, h3.reads[0].status, h3.reads[0].value, h5.status, h5.reads[0].value], ['unavailable', 'unavailable', '', 'unavailable', '']);
  check(so, 'hàng 1 trả địa chỉ thật, không đánh số lại khi cột trước nó bị ẩn',
    h4.rawHeaderRow.map((item) => item.address + '=' + item.value), ['B1=@CUS_MA_KH', 'D1=@CUS_TEN_CT']);

  // Google thay mảng mới sau mỗi lần bỏ ẩn: cùng object chứa, lưới và bảng đổi theo, bộ đọc dùng ngay không cần dò lại.
  const boAn = lead.hop.window.Ap.slot;
  boAn.ea.ea = grid(gon(LEAD, {}, AN_COT));
  Object.assign(lead.hop.window.Ax.dims[0], truc('7', LEAD.length));
  const sauBoAn = lead.ask(3, 'bo-an');
  check(so, 'bỏ ẩn hàng thì bảng quy đổi mới có hiệu lực ngay ở lần đọc kế tiếp',
    [sauBoAn.status, sauBoAn.reads[0].value], ['ok', 'CUS-000003']);

  const hong = (patch, nhan) => {
    const ket = docLead(trangLead(patch), [4]).ketQua[0];
    check(so, nhan + ' thì không đọc được, không trả ok', [ket.status, ket.reason], ['unavailable', 'LIVE_AXIS_NOT_FOUND']);
  };
  hong({ Ax: { dims: trucDu('9', CUSTOMER) } }, 'không có bảng quy đổi của sheet');
  hong({ Ax: { dims: [truc('7', LEAD.length, AN_HANG), truc('7', LEAD[0].length)] } }, 'bảng cột dài khác số cột của lưới');
  hong({ Ax: { dims: [truc('7', LEAD.length, AN_HANG), truc('10', LEAD[0].length, AN_COT)] } }, 'gid gần bảng cột là sheet khác');
  const nhieu = truc('7', LEAD[0].length, AN_COT);
  nhieu.meta.so = '1';
  hong({ Ax: { dims: [truc('7', LEAD.length, AN_HANG), nhieu] } }, 'cạnh gid có chuỗi số khác nên không chắc bảng thuộc sheet nào');
  const lechDau = truc('7', LEAD.length, AN_HANG);
  lechDau.mk = lechDau.mk.slice();
  lechDau.mk[3] = 2;
  hong({ Ax: { dims: [lechDau, truc('7', LEAD[0].length, AN_COT)] } }, 'mảng đánh dấu không khớp bảng quy đổi');
  const giam = truc('7', LEAD.length, AN_HANG);
  giam.pos = giam.pos.slice().reverse();
  hong({ Ax: { dims: [giam, truc('7', LEAD[0].length, AN_COT)] } }, 'bảng quy đổi không tăng dần');
  hong({ Ax: { dims: [truc('7', LEAD.length, AN_HANG), truc('7', LEAD[0].length, AN_COT), truc('7', LEAD[0].length, { 1: 2, 3: 2 })] } }, 'hai bảng cùng khớp số cột của lưới');

  const VUONG = [['@CUS_MA_KH', '@CUS_TEN_CT'], ['CUS-000002', 'Công ty 2']];
  const vuong = napReader({ Ap: { slot: sheet('9', VUONG) }, Ax: { dims: trucDu('9', VUONG) } });
  vuong.request(base);
  vuong.flush();
  const docVuong = vuong.request(Object.assign({}, base, { requestId: 'square-2' }));
  check(so, 'lưới có số hàng bằng số cột thì không phân được bảng hàng và bảng cột, không đọc',
    [docVuong.status, docVuong.reason], ['unavailable', 'LIVE_AXIS_NOT_FOUND']);

  const anDau = napReader(trangLead({ Ax: { dims: [truc('7', LEAD.length, { 0: 2 }), truc('7', LEAD[0].length, AN_COT)] }, Ap: { slot: { idx: '7', ea: { ea: grid(gon([LEAD[0]].concat(LEAD.slice(2)), {}, AN_COT)) } } } }));
  anDau.request(Object.assign({}, base, { gid: '7', sheetName: '!lead', readPlan: { '!': [{ token: 'id', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }] } }));
  anDau.flush();
  const docAnDau = anDau.request(Object.assign({}, base, { requestId: 'hidden-head-2', gid: '7', sheetName: '!lead', row: 4, readPlan: { '!': [{ token: 'id', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }] } }));
  check(so, 'bảng hàng nói hàng 1 thật đang ẩn mà lưới vẫn có mã cột ở đầu thì không tin lưới đó',
    [docAnDau.status, docAnDau.reason], ['unavailable', 'LIVE_AXIS_NOT_FOUND']);

  // Google đổi cấu trúc sau khi đã dò: object chứa mất bảng quy đổi thì dò lại, lúc dò lại xong vẫn hỏng thì báo rõ.
  const doi = docLead(trangLead(), [4]);
  doi.hop.window.Ax.dims[1].pos = 'khac';
  const dangDoLai = doi.ask(4, 'doi-1');
  doi.hop.flush();
  const sauDoLai = doi.ask(4, 'doi-2');
  check(so, 'Google đổi cấu trúc bảng quy đổi thì dò lại trong nền rồi báo LIVE_AXIS_NOT_FOUND, không đọc theo cấu trúc cũ',
    [dangDoLai.status, dangDoLai.reason, sauDoLai.status, sauDoLai.reason], ['unavailable', 'LIVE_GRID_SEARCHING', 'unavailable', 'LIVE_AXIS_NOT_FOUND']);
}

module.exports = { chay };
