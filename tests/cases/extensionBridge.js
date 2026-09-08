const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const BRIDGE_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'bridge', 'iframe_bridge.js');

function napBridge() {
  let onMessage = null;
  const hop = {
    console: { log() {} },
    Date,
    window: {
      addEventListener(name, fn) {
        if (name === 'message') { onMessage = fn; }
      }
    }
  };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(BRIDGE_FILE, 'utf8'), hop, { filename: BRIDGE_FILE });
  hop._onMessage = onMessage;
  return hop;
}

function nguonTin() {
  const sent = [];
  return {
    sent,
    source: {
      postMessage(data, targetOrigin) {
        sent.push({ data, targetOrigin });
      }
    }
  };
}

function chay(so) {
  section('Extension bridge — nonce đi trọn từ bắt tay tới CRM_CONTEXT');
  let hop;
  try { hop = napBridge(); } catch (err) { return ghiLoiNap(so, 'nạp iframe_bridge.js', err); }

  const dung = nguonTin();
  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-kiem-thu' }
  });
  check(so, 'ACK trả đúng nonce về đúng origin đã bắt tay',
    [dung.sent[0].data.action, dung.sent[0].data.nonce, dung.sent[0].targetOrigin],
    ['CRM_HANDSHAKE_ACK', 'nonce-kiem-thu', 'https://abc-123.googleusercontent.com']);

  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4 });
  check(so, 'CRM_CONTEXT mang cùng nonce nên sidebar không loại tin hợp lệ',
    [dung.sent[1].data.action, dung.sent[1].data.nonce, dung.sent[1].data.spreadsheetId, dung.sent[1].targetOrigin],
    ['CRM_CONTEXT', 'nonce-kiem-thu', 'sheet-1', 'https://abc-123.googleusercontent.com']);

  const la = nguonTin();
  hop._onMessage({
    origin: 'https://example.com',
    source: la.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-la' }
  });
  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 5 });
  check(so, 'bắt tay sai origin bị bỏ và không chiếm kênh đang dùng',
    [la.sent.length, dung.sent[2].data.nonce, dung.sent[2].targetOrigin],
    [0, 'nonce-kiem-thu', 'https://abc-123.googleusercontent.com']);
}

module.exports = { chay };
