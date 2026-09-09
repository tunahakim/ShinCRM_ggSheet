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
    header: '@CUS_MA_KH'
  };
  hop.request(base);
  check(so, 'đọc đúng mã theo header động và hàng đang chọn',
    [hop.sent[0].data.status, hop.sent[0].data.customerId, hop.sent[0].data.column, hop.sent[0].targetOrigin],
    ['ok', 'KH000006', 1, 'https://docs.google.com']);

  hop.request(Object.assign({}, base, { requestId: 'live-2', row: 3 }));
  check(so, 'ô trống trả empty thay vì suy đoán mã',
    [hop.sent[1].data.status, hop.sent[1].data.customerId], ['empty', '']);

  const duplicate = napReader([
    [cell('@CUS_MA_KH'), cell('@CUS_MA_KH')],
    [cell('KH000001'), cell('KH000002')]
  ]);
  duplicate.request(base);
  check(so, 'header trùng bị đóng an toàn', duplicate.sent[0].data.reason, 'DUPLICATE_HEADER');

  hop.request(Object.assign({}, base, { requestId: 'live-3', header: '@KHONG_CO' }));
  check(so, 'header không tồn tại bị đóng an toàn', hop.sent[2].data.reason, 'HEADER_NOT_FOUND');
}

module.exports = { chay };
