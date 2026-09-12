const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const BRIDGE_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'bridge', 'iframe_bridge.js');
const WORKER_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'background', 'service_worker.js');
const EXECUTOR_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');

function napBridge(runtime) {
  let onMessage = null;
  const hop = {
    console: { log() {} },
    Date,
    chrome: runtime ? { runtime } : undefined,
    setTimeout,
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
  let invalidated = '';
  const invalidBridge = napBridge({
    onMessage: { addListener() {} },
    sendMessage() { throw new Error('Extension context invalidated.'); }
  });
  invalidBridge.sendRequestToWorker({ type: 'FBM_EXECUTE_REQUEST' }, function (error) { invalidated = error && error.message || ''; });
  check(so, 'context Extension het hieu luc tra loi ngay', invalidated, 'Extension context invalidated.');
  check(so, 'bridge cu khong phat response loi khi context invalidated', fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('if (isInvalidatedExtensionError(error)) { return; }') >= 0, true);

  const workerSource = fs.readFileSync(WORKER_FILE, 'utf8');
  const executorSource = fs.readFileSync(EXECUTOR_FILE, 'utf8');
  check(so, 'worker ping executor truoc request FBM', workerSource.indexOf("ensureFbmExecutor(tabId).then") < workerSource.indexOf("sendTabMessage(tabId, { type: 'FBM_EXECUTE'"), true);
  check(so, 'worker chi co mot diem gui request FBM', (workerSource.match(/sendTabMessage\(tabId, \{ type: 'FBM_EXECUTE', request: request \}/g) || []).length, 1);
  check(so, 'worker khong tao hai request FBM khi Sidebar thu lai cung id', workerSource.indexOf('fbmRequestFlights') >= 0 && workerSource.indexOf('existingFlight') >= 0, true);
  check(so, 'heartbeat relay gui response thô va spreadsheetId cho GAS', workerSource.indexOf("postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply) })") >= 0, true);
  check(so, 'heartbeat relay tiep tuc cursor voi ngan sach request', workerSource.indexOf('relayScheduledRequests(tabId') >= 0 && workerSource.indexOf('used >= 10') >= 0, true);
  check(so, 'alarm chi tim tab FBM sau khi co relay config', workerSource.indexOf("getRelayConfig().then(function (config) {\n    if (!config) { return null; }\n    return findFbmTab()") >= 0, true);
  check(so, 'relay config luu Spreadsheet ID', workerSource.indexOf('fbmSpreadsheetId: String(config.spreadsheetId || \'\')') >= 0, true);
  const sidebarSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'Sidebar.html'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSync.html'), 'utf8');
  check(so, 'Sidebar giu waiter va thu lai mot lan khi bridge cu mat context', syncSource.indexOf('if (data.retryable)') >= 0 && syncSource.indexOf('waiter.retryCount < 1') >= 0 && syncSource.indexOf('retryCount: 0') >= 0, true);
  check(so, 'mo man dong bo khong cho relay config chan status', syncSource.indexOf('Promise.all([fbmSyncConfigureRelay(), fbmSyncStatusOnce(true)])') >= 0, true);
  check(so, 'man dong bo hien thi Category block va Activity missing', syncSource.indexOf('metadata.categoryBlocks') >= 0 && syncSource.indexOf('metadata.activityBulkMissing') >= 0, true);
  check(so, 'man dong bo hien thi ma va nguyen nhan preflight', syncSource.indexOf('preflightIssues') >= 0 && syncSource.indexOf('item.code') >= 0 && syncSource.indexOf('item.message') >= 0, true);
  check(so, 'man dong bo hien thi chi tiet loi day kem HTTP', syncSource.indexOf('pushFailureDetails') >= 0 && syncSource.indexOf('detail.reason') >= 0 && syncSource.indexOf('detail.status') >= 0, true);
  check(so, 'Sidebar thu gon response form truoc callback GAS', syncSource.indexOf('fbmSyncProjectFormResponse') >= 0 && syncSource.indexOf('InternalValues') >= 0 && syncSource.indexOf('fbmSyncProjectFormResponse(status.request, response)') >= 0, true);
  check(so, 'Sidebar khong treo vo han khi GAS callback khong tra ket qua', syncSource.indexOf('FBM_SYNC_GAS_CONTINUE_TIMEOUT_MS = 15000') >= 0 && syncSource.indexOf("code = 'GAS_CALLBACK_TIMEOUT'") >= 0 && syncSource.indexOf('Promise.race([callback, timeout])') >= 0, true);
  check(so, 'GAS ghi dau vet callback khong chua payload', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf("fbmTraceContinue('entered')") >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'report', 'Report.js'), 'utf8').indexOf("'callbackTrace'") >= 0, true);
  check(so, 'status cu khong ve de ghi de loading cua luot moi', syncSource.indexOf('viewEpoch') >= 0 && syncSource.indexOf('epoch !== FBM_SYNC_CLIENT.viewEpoch') >= 0 && syncSource.indexOf('lastServerUpdatedAt') >= 0, true);
  check(so, 'status bat dau truoc phien khong ve de ghi de loading dang chay', syncSource.indexOf('runningWhenRequested') >= 0 && syncSource.indexOf('FBM_SYNC_CLIENT.running && !runningWhenRequested') >= 0, true);
  check(so, 'khong hien tieu de chi tiet khi chi co canh bao preflight', syncSource.indexOf('var hasRecordIssues') >= 0 && syncSource.indexOf('if (hasRecordIssues)') >= 0, true);
  check(so, 'Sidebar co nut giai quyet conflict theo hai phia', syncSource.indexOf('data-fbm-conflict-choice') >= 0 && syncSource.indexOf('fbmResolveConflict') >= 0 && syncSource.indexOf('Giữ ShinCRM') >= 0 && syncSource.indexOf('Giữ FBM') >= 0, true);
  check(so, 'Sidebar bat tay relay khi khoi dong khong chan boot', sidebarSource.indexOf('fbmSyncConfigureRelay().catch(function () {})') >= 0 && sidebarSource.indexOf('fbmSyncConfigureRelay().catch(function () {})') < sidebarSource.indexOf('sidebarBoot();'), true);
  check(so, 'executor co ping phien ban 21.7', /FBM_PING[\s\S]+version:\s*'21\.7'/.test(executorSource), true);
  check(so, 'executor giai ma response gzip bat thuong cua FBM', executorSource.indexOf('DecompressionStream') >= 0 && executorSource.indexOf('response.arrayBuffer()') >= 0, true);
}

module.exports = { chay };
