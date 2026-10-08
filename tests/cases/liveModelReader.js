const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'model', 'live_model_reader.js');

/** Tên thuộc tính cố ý khác bản Google thật: bộ đọc phải tự dò, không được dựa vào tên rút gọn nào. */
function napReader(trixApp) {
  let onMessage = null;
  const sent = [];
  const timers = [];
  const hop = {
    console,
    WeakSet,
    location: { origin: 'https://docs.google.com' },
    setTimeout(fn) { timers.push(fn); return timers.length; },
    window: {
      trixApp,
      addEventListener(name, fn) { if (name === 'message') { onMessage = fn; } },
      postMessage(data, targetOrigin) { sent.push({ data, targetOrigin }); }
    }
  };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), hop, { filename: FILE });
  hop.request = (data) => {
    onMessage({ source: hop.window, origin: 'https://docs.google.com', data });
    return sent[sent.length - 1].data;
  };
  hop.flush = () => { while (timers.length) { timers.shift()(); } };
  hop.sent = sent;
  return hop;
}

function cell(value) {
  return value === undefined ? {} : { vv: value, khac: 'x' };
}

function grid(rows) {
  return rows.map((row) => row.map(cell));
}

/** Bảng lưới khóa theo gid như Google; gid 10 là một sheet View cũng có cột mã khách và dài hơn. */
function trixVoiHaiSheet() {
  return {
    lop: {
      bang: {
        9: { aa: { bb: grid([['@CUS_MA_KH', '@CUS_TEN_CT'], ['KH000006', 'Công ty 6'], ['', 'Công ty trống']]) } },
        10: { aa: { bb: grid([['@CUS_MA_KH'], ['KH999999'], ['KH999998'], ['KH999997'], ['KH999996']]) } }
      }
    }
  };
}

function chay(so) {
  section('Extension live model reader — tự dò lưới theo gid, header động, fail-closed');
  let hop;
  try {
    hop = napReader(trixVoiHaiSheet());
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

  const dangDo = hop.request(base);
  check(so, 'lần đọc đầu trả unavailable trong lúc dò, không đoán giá trị',
    [dangDo.status, dangDo.reason, dangDo.reads.length], ['unavailable', 'LIVE_GRID_SEARCHING', 0]);

  hop.flush();
  const docDuoc = hop.request(Object.assign({}, base, { requestId: 'live-2' }));
  check(so, 'dò xong thì đọc thô theo địa chỉ, không tạo customerId',
    [docDuoc.status, docDuoc.reads[0].value, Object.prototype.hasOwnProperty.call(docDuoc, 'customerId'), hop.sent[1].targetOrigin],
    ['ok', 'KH000006', false, 'https://docs.google.com']);
  check(so, 'đọc lưới của đúng gid đang mở, không lấy lưới sheet khác dài hơn có cùng cột mã',
    docDuoc.reads[0].value, 'KH000006');

  const sheetKhac = hop.request(Object.assign({}, base, { requestId: 'live-3', gid: '10', sheetName: '!View', row: 3, readPlan: { '!': base.readPlan.Customer } }));
  check(so, 'đổi sheet thì cùng đường dẫn điền gid mới, đọc đúng lưới của sheet đó',
    [sheetKhac.status, sheetKhac.reads[0].value], ['ok', 'KH999998']);

  const oTrong = hop.request(Object.assign({}, base, { requestId: 'live-4', row: 3 }));
  check(so, 'ô trống trả reads rỗng thay vì suy đoán mã',
    [oTrong.status, oTrong.reads[0].value, Object.prototype.hasOwnProperty.call(oTrong, 'customerId')], ['ok', '', false]);

  const lech = hop.request(Object.assign({}, base, { requestId: 'live-5', readPlan: { Customer: [{ token: 'id', headerAddress: 'B1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'B{row}' }] } }));
  check(so, 'giá trị kỳ vọng không nằm ở địa chỉ khai báo bị trả về rõ ràng',
    [lech.status, lech.reason, lech.reads[0].status], ['mismatch', 'READ_PLAN_MISMATCH', 'mismatch']);

  const thieuCot = hop.request(Object.assign({}, base, { requestId: 'live-6', readPlan: { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@KHONG_CO', valueAddressTemplate: 'A{row}' }] } }));
  hop.flush();
  const sauThieuCot = hop.request(Object.assign({}, base, { requestId: 'live-7' }));
  check(so, 'một sheet thiếu cột mã không làm mất đường đã dò của các sheet khác',
    [thieuCot.status, sauThieuCot.status, sauThieuCot.reads[0].value], ['unavailable', 'ok', 'KH000006']);

  const trung = napReader({ lop: { bang: { 9: { aa: { bb: grid([['@CUS_MA_KH', '@CUS_MA_KH'], ['KH000001', 'KH000002']]) } } } } });
  trung.request(base);
  trung.flush();
  const trungDoc = trung.request(Object.assign({}, base, { requestId: 'dup-2' }));
  check(so, 'hàng 1 trả địa chỉ vật lý kể cả khi có header trùng',
    [trungDoc.rawHeaderRow[0].address, trungDoc.rawHeaderRow[1].address, Object.prototype.hasOwnProperty.call(trungDoc, 'customerId')],
    ['A1', 'B1', false]);

  const khongLuoi = napReader({ lop: { bang: { 10: { aa: { bb: grid([['@CUS_MA_KH'], ['KH999999']]) } } } } });
  khongLuoi.request(base);
  khongLuoi.flush();
  const khongThay = khongLuoi.request(Object.assign({}, base, { requestId: 'none-2' }));
  check(so, 'không có lưới nào gắn với gid đang mở thì trả LIVE_GRID_NOT_FOUND, không mượn lưới sheet khác',
    [khongThay.status, khongThay.reason, khongThay.reads.length], ['unavailable', 'LIVE_GRID_NOT_FOUND', 0]);

  let getterDaChay = 0;
  const coGetter = trixVoiHaiSheet();
  Object.defineProperty(coGetter, 'nguyHiem', { enumerable: true, get() { getterDaChay += 1; return { 9: {} }; } });
  const docGetter = napReader(coGetter);
  docGetter.request(base);
  docGetter.flush();
  const quaGetter = docGetter.request(Object.assign({}, base, { requestId: 'getter-2' }));
  check(so, 'phép dò không gọi getter của trang Google',
    [getterDaChay, quaGetter.status], [0, 'ok']);
}

module.exports = { chay };
