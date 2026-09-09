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
  hop.lastContextKey = 'ảnh cũ';
  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-kiem-thu' }
  });
  check(so, 'ACK trả đúng nonce về đúng origin đã bắt tay',
    [dung.sent[0].data.action, dung.sent[0].data.nonce, Boolean(dung.sent[0].data.sessionId), dung.sent[0].targetOrigin, hop.lastContextKey],
    ['CRM_HANDSHAKE_ACK', 'nonce-kiem-thu', true, 'https://abc-123.googleusercontent.com', '']);

  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: {
      action: 'CRM_COLUMN_HINTS',
      nonce: 'nonce-kiem-thu',
      columnHints: { targets: [{ sheetName: 'Customer', header: '@CUS_MA_KH' }, { prefix: '!', header: '@CUS_MA_KH' }] }
    }
  });
  check(so, 'schema mã cột động đi qua đúng kênh đã bắt tay',
    [hop.CRM_COLUMN_HINTS.targets.length, hop.CRM_COLUMN_HINTS.targets[0].header], [2, '@CUS_MA_KH']);

  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_COLUMN_HINTS', nonce: 'nonce-sai', columnHints: { targets: [{ sheetName: 'Customer', header: '@SAI' }] } }
  });
  check(so, 'column hints sai nonce không ghi đè hints đang dùng', hop.CRM_COLUMN_HINTS.targets[0].header, '@CUS_MA_KH');

  hop.lastContextKey = 'ảnh vừa gửi';
  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-kiem-thu' }
  });
  check(so, 'nhịp bắt tay lặp lại không ép gửi CRM_CONTEXT thừa mỗi giây', hop.lastContextKey, 'ảnh vừa gửi');

  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: 'Customer', row: 4 });
  check(so, 'CRM_CONTEXT mang cùng nonce nên sidebar không loại tin hợp lệ',
    [dung.sent[2].data.action, dung.sent[2].data.nonce, dung.sent[2].data.sessionId, dung.sent[2].data.spreadsheetId, dung.sent[2].targetOrigin],
    ['CRM_CONTEXT', 'nonce-kiem-thu', dung.sent[0].data.sessionId, 'sheet-1', 'https://abc-123.googleusercontent.com']);

  const la = nguonTin();
  hop._onMessage({
    origin: 'https://example.com',
    source: la.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-la' }
  });
  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 5 });
  check(so, 'bắt tay sai origin bị bỏ và không chiếm kênh đang dùng',
    [la.sent.length, dung.sent[3].data.nonce, dung.sent[3].targetOrigin],
    [0, 'nonce-kiem-thu', 'https://abc-123.googleusercontent.com']);

  const rong = nguonTin();
  hop._onMessage({
    origin: 'https://valid.googleusercontent.com',
    source: rong.source,
    data: { action: 'CRM_HANDSHAKE', nonce: '' }
  });
  check(so, 'bắt tay thiếu nonce bị bỏ thay vì làm rơi kênh hợp lệ', rong.sent.length, 0);
}

module.exports = { chay };
