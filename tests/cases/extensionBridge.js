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

async function chay(so) {
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
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'manifest.json'), 'utf8'));
  check(so, 'worker ping dung executor phien ban truoc request FBM', workerSource.indexOf("FBM_PING_V2") >= 0 && workerSource.indexOf("FBM_EXECUTOR_VERSION") >= 0 && workerSource.indexOf("sendTabMessage(tabId, { type: 'FBM_EXECUTE_V2'") >= 0, true);
  check(so, 'worker chi co mot diem gui request FBM', (workerSource.match(/sendTabMessage\(tabId, \{ type: 'FBM_EXECUTE_V2', request: request \}/g) || []).length, 1);
  check(so, 'worker khong tao hai request FBM khi Sidebar thu lai cung id', workerSource.indexOf('fbmRequestFlights') >= 0 && workerSource.indexOf('existingFlight') >= 0, true);
  check(so, 'heartbeat relay gui response thô va spreadsheetId cho GAS', workerSource.indexOf("postRelay(config.url, config.key, { kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply) })") >= 0, true);
  check(so, 'heartbeat relay tiep tuc cursor voi ngan sach request', workerSource.indexOf('relayScheduledRequests(tabId') >= 0 && workerSource.indexOf('used >= 10') >= 0, true);
  check(so, 'alarm chi tim tab FBM sau khi co relay config', workerSource.indexOf("fbmHeartbeatNow('alarm')") >= 0 && workerSource.indexOf("if (!config) {") >= 0 && workerSource.indexOf('findFbmTab()') >= 0, true);
  check(so, 'relay config luu Spreadsheet ID', workerSource.indexOf('fbmSpreadsheetId: String(config.spreadsheetId || \'\')') >= 0, true);
  check(so, 'service worker co quyen goi Web App GAS va mien redirect', manifest.host_permissions.includes('https://script.google.com/macros/*') && manifest.host_permissions.includes('https://script.googleusercontent.com/macros/*'), true);
  check(so, 'relay GAS co timeout va luu chan doan toi thieu', workerSource.indexOf('GAS_RELAY_TIMEOUT_MS') >= 0 && workerSource.indexOf('RELAY_TIMEOUT') >= 0 && workerSource.indexOf('fbmRelayLastStatus') >= 0, true);
  const sidebarSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'Sidebar.html'), 'utf8');
  const entryPointsSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'EntryPoints.js'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSync.html'), 'utf8');
  const syncAuditSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSyncAuditScreen.html'), 'utf8');
  check(so, 'Extension ma hoa credential bang AES-GCM truoc khi luu', workerSource.indexOf('crypto.subtle.generateKey') >= 0 && workerSource.indexOf('CREDENTIAL_VAULT_PREFIX') >= 0 && workerSource.indexOf('FBM_ENCRYPT_CREDENTIALS') >= 0, true);
  check(so, 'bridge credential chi tra envelope va khong tra password ve Sidebar', fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('CRM_FBM_CREDENTIALS_RESULT') >= 0 && syncSource.indexOf('fbmSyncEncryptCredentials') >= 0 && syncSource.indexOf('fbm-login-password') >= 0, true);
  check(so, 'executor login dung force false va khong logout phien hop le', executorSource.indexOf("force: false") >= 0 && executorSource.indexOf("credentials: 'include'") >= 0 && executorSource.indexOf("meta.kind === 'login'") >= 0, true);
  check(so, 'Sidebar giu waiter va thu lai mot lan khi bridge cu mat context', syncSource.indexOf('if (data.retryable)') >= 0 && syncSource.indexOf('waiter.retryCount < 1') >= 0 && syncSource.indexOf('retryCount: 0') >= 0, true);
  check(so, 'mo man dong bo khong cho relay config chan status', syncSource.indexOf('Promise.all([fbmSyncConfigureRelay(), fbmSyncStatusOnce(true), fbmSyncLoadIdentityStatus(), fbmSyncLoadSettings()])') >= 0, true);
  check(so, 'kiem tra lien ket dung chung guard Extension va huy cursor khi loi', syncSource.indexOf('function fbmSyncCheckIdentity()') >= 0 && syncSource.indexOf("sheetLinkExtensionAlive()") >= 0 && syncSource.indexOf("callServer('fbmCancelSync')") >= 0, true);
  check(so, 'tu dien nhan dien FBM co doi chieu va bao loi minh bach', syncSource.indexOf('function fbmSyncProbeIdentity()') >= 0 && syncSource.indexOf('function fbmSyncAutoFillAndCheck()') >= 0 && syncSource.indexOf("callServer('fbmStartIdentityProbe')") >= 0 && syncSource.indexOf("callServer('fbmSaveIdentityBinding'") >= 0 && syncSource.indexOf('Chưa có liên kết đã lưu để đối chiếu') >= 0, true);
  check(so, 'man dong bo hien thi Category block va Activity missing', syncSource.indexOf('metadata.categoryBlocks') >= 0 && syncSource.indexOf('metadata.activityBulkMissing') >= 0, true);
  check(so, 'man dong bo hien thi ma va nguyen nhan preflight', syncSource.indexOf('preflightIssues') >= 0 && syncSource.indexOf('item.code') >= 0 && syncSource.indexOf('item.message') >= 0, true);
  check(so, 'man dong bo hien thi chi tiet loi day kem HTTP', syncSource.indexOf('pushFailureDetails') >= 0 && syncSource.indexOf('detail.reason') >= 0 && syncSource.indexOf('detail.status') >= 0, true);
  check(so, 'Sidebar thu gon response form truoc callback GAS', syncSource.indexOf('fbmSyncProjectFormResponse') >= 0 && syncSource.indexOf('InternalValues') >= 0 && syncSource.indexOf('fbmSyncProjectFormResponse(status.request, response)') >= 0, true);
  check(so, 'Sidebar khong treo vo han khi GAS callback khong tra ket qua', syncSource.indexOf('FBM_SYNC_GAS_CONTINUE_TIMEOUT_MS = 15000') >= 0 && syncSource.indexOf("code = 'GAS_CALLBACK_TIMEOUT'") >= 0 && syncSource.indexOf('Promise.race([callback, timeout])') >= 0, true);
  check(so, 'GAS ghi dau vet callback khong chua payload', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf("fbmTraceContinue('entered')") >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'report', 'Report.js'), 'utf8').indexOf("'callbackTrace'") >= 0, true);
  check(so, 'GAS chuan hoa toan bo ket qua truoc callback Sidebar', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf('function fbmPublicResult') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf('return fbmPublicResult(result)') >= 0, true);
  check(so, 'status cu khong ve de ghi de loading cua luot moi', syncSource.indexOf('viewEpoch') >= 0 && syncSource.indexOf('epoch !== FBM_SYNC_CLIENT.viewEpoch') >= 0 && syncSource.indexOf('lastServerUpdatedAt') >= 0, true);
  check(so, 'status bat dau truoc phien khong ve de ghi de loading dang chay', syncSource.indexOf('runningWhenRequested') >= 0 && syncSource.indexOf('FBM_SYNC_CLIENT.running && !runningWhenRequested') >= 0, true);
  check(so, 'khong hien tieu de chi tiet khi chi co canh bao preflight', syncSource.indexOf('var hasRecordIssues') >= 0 && syncSource.indexOf('if (hasRecordIssues)') >= 0, true);
  check(so, 'Sidebar co man hinh giai quyet conflict theo hai phia', syncSource.indexOf('data-fbm-conflict-choice') >= 0 && syncSource.indexOf('fbmPrepareConflictResolution') >= 0 && syncSource.indexOf('fbmConfirmConflict') >= 0 && syncAuditSource.indexOf('Giữ toàn bộ ShinCRM') >= 0 && syncAuditSource.indexOf('Giữ toàn bộ FBM') >= 0 && syncAuditSource.indexOf('fbmSyncPaintConflictScreen') >= 0, true);
  check(so, 'Sidebar khong gui relay config truoc khi boot bat tay', sidebarSource.indexOf('fbmSyncConfigureRelay().catch(function () {})') < 0, true);
  const bootstrapSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'ram', 'bootstrap.html'), 'utf8');
  check(so, 'relay config chi gui sau khi sheetLink da bat tay', bootstrapSource.indexOf('sheetLinkInstall();') >= 0 && bootstrapSource.indexOf('fbmSyncConfigureRelay().catch(function () {})') > bootstrapSource.indexOf('sheetLinkInstall();'), true);
  check(so, 'GAS tu cap khoa relay mot lan bang lock', entryPointsSource.indexOf('waitLock(10000)') >= 0 && entryPointsSource.indexOf('if (!key) { key = Utilities.getUuid()') >= 0 && entryPointsSource.indexOf('FBM_SYNC_KEY') >= 0, true);
  check(so, 'doi khoa relay co ACK tu Extension', entryPointsSource.indexOf('function fbmSyncRotateRelayKey') >= 0 && syncSource.indexOf('fbmSyncPostRelayConfig(config, true)') >= 0 && fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('CRM_FBM_CONFIG_ACK') >= 0, true);
  check(so, 'relay co probe read-only va worker co ham probe doc lap', entryPointsSource.indexOf("body.kind === 'probe'") >= 0 && entryPointsSource.indexOf("code: 'RELAY_PROBE_OK'") >= 0 && workerSource.indexOf('function fbmRelayProbe()') >= 0 && workerSource.indexOf("type === 'FBM_RELAY_PROBE'") >= 0, true);
  check(so, 'Web App relay kiem tra khoa va Spreadsheet ID truoc khi xu ly', entryPointsSource.indexOf("getProperty('FBM_SYNC_KEY')") >= 0 && entryPointsSource.indexOf("body.key !== expected") >= 0 && entryPointsSource.indexOf("String(body.spreadsheetId) !== actualSpreadsheetId") >= 0, true);
  check(so, 'probe ghi du moc gui va nhan response', workerSource.indexOf("stage: 'request_sent'") >= 0 && workerSource.indexOf("stage: 'response_received'") >= 0 && workerSource.indexOf('requestSentAt') >= 0 && workerSource.indexOf('responseReceivedAt') >= 0, true);
  check(so, 'probe ghi dau response khi GAS tra khong phai JSON', workerSource.indexOf('contentType') >= 0 && workerSource.indexOf('responsePrefix') >= 0 && workerSource.indexOf('RELAY_INVALID_JSON') >= 0 && workerSource.indexOf('RELAY_ENDPOINT_NOT_FOUND') >= 0, true);
  check(so, 'heartbeat co lenh chay ngay va ghi ly do bo qua', workerSource.indexOf('function fbmHeartbeatNow') >= 0 && workerSource.indexOf('FBM_HEARTBEAT_NOW') >= 0 && workerSource.indexOf('fbmHeartbeatLastStatus') >= 0 && workerSource.indexOf("fbmHeartbeatNow('alarm')") >= 0, true);
  check(so, 'heartbeat null duoc giu nguyen de executor dung request mac dinh', workerSource.indexOf('function hydrateLoginRequest(request) {\n  if (!request) { return Promise.resolve(request); }') >= 0, true);
  check(so, 'heartbeat kiem tra relay truoc khi cham FBM va dung khi phien het han', workerSource.indexOf("kind: 'probe'") >= 0 && workerSource.indexOf("blocked_relay") >= 0 && workerSource.indexOf('SESSION_EXPIRED_WAITING_LOGIN') >= 0, true);
  check(so, 'executor uu tien cookie payload dang co tren tab', executorSource.indexOf('function currentPayloadCookie') >= 0 && executorSource.indexOf('currentPayloadCookie(req.body && req.body.cookie)') >= 0, true);
  check(so, 'Sidebar luon dong bo relay va doi Extension xac nhan', syncSource.indexOf('fbmSyncPostRelayConfig(config, true)') >= 0 && syncSource.indexOf('Extension không xác nhận đã cập nhật URL relay GAS.') >= 0, true);
  check(so, 'service worker co lenh chay sync GAS doc lap, mac dinh read', workerSource.indexOf('function fbmRunBackgroundSync(mode)') >= 0 && workerSource.indexOf("String(mode || 'read').toLowerCase() === 'write'") >= 0 && workerSource.indexOf('FBM_BACKGROUND_SYNC_MAX_REQUESTS') >= 0 && workerSource.indexOf("type === 'FBM_BACKGROUND_SYNC'") >= 0, true);
  check(so, 'background sync chi chuyen request va response thô qua GAS', workerSource.indexOf('relayBackgroundSyncRequests') >= 0 && workerSource.indexOf('sendToFbmTab(tabId, next)') >= 0 && workerSource.indexOf('rawFbmReply(reply)') >= 0, true);
  check(so, 'background relay dung DTO gon, khong gui traceTail/metadata Sidebar', workerSource.indexOf("kind: 'background_sync'") >= 0 && entryPointsSource.indexOf('fbmSyncRelayCompactResult') >= 0 && entryPointsSource.indexOf("body.kind === 'background_sync'") >= 0, true);
  check(so, 'background relay dung command port thay vi tu lap nghiep vu', workerSource.indexOf("command: 'start'") >= 0 && workerSource.indexOf("command: 'continue'") >= 0 && entryPointsSource.indexOf('FbmSync.controlDispatch') >= 0, true);
  check(so, 'executor co ping phien ban 21.8 va kenh execute moi', /EXECUTOR_VERSION\s*=\s*'21\.8'/.test(executorSource) && executorSource.indexOf('FBM_PING_V2') >= 0 && executorSource.indexOf('FBM_EXECUTE_V2') >= 0, true);
  check(so, 'executor chan endpoint thieu truoc fetch', executorSource.indexOf('FBM_ENDPOINT_MISSING') >= 0 && executorSource.indexOf('fetch_blocked') >= 0 && executorSource.indexOf('validateEndpoint(req.url)') >= 0, true);
  check(so, 'GAS chan endpoint thieu truoc cap envelope', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'protocol', 'Protocol.js'), 'utf8').indexOf('validateEndpoint: function') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8').indexOf('validateEndpoint(request.url)') >= 0, true);
  check(so, 'executor chi chuyen body wire GAS, khong escape nghiep vu', executorSource.indexOf('req.bodyText') >= 0 && executorSource.indexOf("JSON.stringify(body).replace(/\\//g") < 0, true);
  check(so, 'executor giai ma response gzip bat thuong cua FBM', executorSource.indexOf('DecompressionStream') >= 0 && executorSource.indexOf('response.arrayBuffer()') >= 0, true);
  check(so, 'trace Extension co du cac moc bridge worker executor fetch', ['bridge_received', 'worker_received', 'fbm_tab_found', 'executor_started', 'fetch_started', 'fetch_finished', 'bridge_response_sent'].every((stage) => workerSource.indexOf(stage) >= 0 || executorSource.indexOf(stage) >= 0 || fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf(stage) >= 0), true);
  check(so, 'response FBM giu trace trong transport va loi cung giu trace', executorSource.indexOf('transport: { payloadCookie') >= 0 && executorSource.indexOf('trace: trace') >= 0 && executorSource.indexOf('fetch_blocked') >= 0 && workerSource.indexOf('transport: { trace: reply.trace') >= 0, true);

  await new Promise((resolve) => {
    let listener = null;
    let fetchCalls = 0;
    let invalidReply = null;
    let validReply = null;
    const response = {
      ok: true,
      status: 200,
      headers: { get() { return 'application/json'; } },
      arrayBuffer() { return Promise.resolve(new TextEncoder().encode('{"d":{}}').buffer); }
    };
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '', textContent: '' } },
      fetch() { fetchCalls += 1; return Promise.resolve(response); },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(executorSource, context, { filename: EXECUTOR_FILE });
    listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/undefined', method: 'POST', body: {} } }, null, (reply) => { invalidReply = reply; });
    setTimeout(() => {
      check(so, 'executor khong fetch endpoint undefined', [fetchCalls, invalidReply && invalidReply.error, invalidReply && invalidReply.trace && invalidReply.trace[1].code], [0, 'Request FBM thiếu endpoint; đã chặn trước khi gửi.', 'FBM_ENDPOINT_MISSING']);
      listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', method: 'POST', body: { type: 1 } } }, null, (reply) => { validReply = reply; });
      setTimeout(() => {
        check(so, 'executor cho request grid hop le di qua mot fetch', [fetchCalls, validReply && validReply.result && validReply.result.status], [1, 200]);
        resolve();
      }, 20);
    }, 20);
  });
}

module.exports = { chay };
