const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'model', 'live_model_reader.js');

function napReader(grid) {
  let onMessage = null;
  const sent = [];
  const hop = {
    console,
    location: { origin: 'https://docs.google.com' },
    window: {
      trixApp: { Jc: { za: { oa: { oa: { oa: { xa: { ma: { ma: grid } } } } } } } },
      addEventListener(name, fn) { if (name === 'message') { onMessage = fn; } },
      postMessage(data, targetOrigin) { sent.push({ data, targetOrigin }); }
    }
  };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(FILE, 'utf8'), hop, { filename: FILE });
  hop.request = (data) => onMessage({
    source: hop.window,
    origin: 'https://docs.google.com',
    data
  });
  hop.sent = sent;
  return hop;
}

function cell(value) {
  return value === undefined ? {} : { oa: value };
}

function chay(so) {
  section('Extension live model reader — header động, hàng xa và fail-closed');
  let hop;
  try {
    hop = napReader([
      [cell('@CUS_MA_KH'), cell('@CUS_TEN_CT')],
      [cell('KH000006'), cell('Công ty 6')],
      [cell(''), cell('Công ty trống')]
    ]);
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
  hop.request(base);
  check(so, 'trả giá trị đọc thô theo địa chỉ, không tạo customerId',
    [hop.sent[0].data.status, hop.sent[0].data.reads[0].value, Object.prototype.hasOwnProperty.call(hop.sent[0].data, 'customerId'), hop.sent[0].targetOrigin],
    ['ok', 'KH000006', false, 'https://docs.google.com']);

  hop.request(Object.assign({}, base, { requestId: 'plan-1' }));
  check(so, 'read plan tra hang 1 tho va ket qua doi chieu toa do',
    [hop.sent[1].data.complete, hop.sent[1].data.rawHeaderRow[0].address, hop.sent[1].data.reads[0].status, hop.sent[1].data.reads[0].value],
    [true, 'A1', 'ok', 'KH000006']);

  hop.request(Object.assign({}, base, { requestId: 'live-2', row: 3 }));
  check(so, 'ô trống trả reads rỗng thay vì suy đoán mã',
    [hop.sent[2].data.status, hop.sent[2].data.reads[0].value, Object.prototype.hasOwnProperty.call(hop.sent[2].data, 'customerId')], ['ok', '', false]);

  const duplicate = napReader([
    [cell('@CUS_MA_KH'), cell('@CUS_MA_KH')],
    [cell('KH000001'), cell('KH000002')]
  ]);
  duplicate.request(base);
  check(so, 'hàng 1 trả địa chỉ vật lý kể cả khi có header trùng',
    [duplicate.sent[0].data.rawHeaderRow[0].address, duplicate.sent[0].data.rawHeaderRow[1].address, Object.prototype.hasOwnProperty.call(duplicate.sent[0].data, 'customerId')],
    ['A1', 'B1', false]);

  hop.request(Object.assign({}, base, { requestId: 'live-3', readPlan: { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@KHONG_CO', valueAddressTemplate: 'A{row}' }] } }));
  check(so, 'giá trị kỳ vọng không khớp bị trả về rõ ràng',
    [hop.sent[3].data.status, hop.sent[3].data.reason, hop.sent[3].data.reads[0].status], ['mismatch', 'READ_PLAN_MISMATCH', 'mismatch']);
}

module.exports = { chay };
