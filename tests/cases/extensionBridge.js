const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check, ghiLoiNap } = require('../lib/assert');

const BRIDGE_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'bridge', 'iframe_bridge.js');
const SCOUT_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'scout', 'sheet_scout.js');
const WORKER_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'background', 'service_worker.js');
const EXECUTOR_FILE = path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const TRANSPORT_CORE_FILE = path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js');

function payloadCookieCapturePattern() {
  const hop = { FbmSync: {} };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(TRANSPORT_CORE_FILE, 'utf8'), hop, { filename: TRANSPORT_CORE_FILE });
  return hop.FbmSync.PAYLOAD_COOKIE_CAPTURE_PATTERN;
}

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
  const scoutSource = fs.readFileSync(SCOUT_FILE, 'utf8');
  check(so, 'Extension chỉ quan sát selection, không đọc formula bar hoặc suy isEditing',
    [scoutSource.indexOf('readFormulaBar') < 0, scoutSource.indexOf('cachedFormulaBar') < 0, scoutSource.indexOf('isEditing') < 0, scoutSource.indexOf("addEventListener('keydown'") >= 0, scoutSource.indexOf("addEventListener('beforeinput'") >= 0, scoutSource.indexOf("addEventListener('click'") >= 0, scoutSource.indexOf('reloadRelevant') < 0, scoutSource.indexOf('customerId') < 0],
    [true, true, true, true, true, true, true, true]);
  const scoutHop = {
    console: { log() {} },
    Date,
    document: { addEventListener() {} },
    window: { addEventListener() {} },
    setInterval() { return 1; },
    setTimeout,
    clearTimeout,
    location: { pathname: '/spreadsheets/d/sheet-1/edit', hash: '#gid=1' }
  };
  vm.createContext(scoutHop);
  vm.runInContext(scoutSource, scoutHop, { filename: SCOUT_FILE });
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

  const readPlan = { Customer: [{ token: 'id', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' }] };
  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-kiem-thu', readPlan: readPlan }
  });
  check(so, 'read plan tọa độ đi qua đúng kênh đã bắt tay', hop.CRM_READ_PLAN.Customer[0].headerAddress, 'A1');

  hop.lastContextKey = 'ảnh vừa gửi';
  hop._onMessage({
    origin: 'https://abc-123.googleusercontent.com',
    source: dung.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-kiem-thu' }
  });
  check(so, 'nhịp bắt tay lặp lại không ép gửi CRM_CONTEXT thừa mỗi giây', hop.lastContextKey, 'ảnh vừa gửi');

  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: 'Customer', cellRef: 'A4' });
  check(so, 'CRM_CONTEXT mang cùng nonce nên sidebar không loại tin hợp lệ',
    [dung.sent[3].data.action, dung.sent[3].data.nonce, dung.sent[3].data.sessionId, dung.sent[3].data.spreadsheetId, dung.sent[3].targetOrigin],
    ['CRM_CONTEXT', 'nonce-kiem-thu', dung.sent[0].data.sessionId, 'sheet-1', 'https://abc-123.googleusercontent.com']);

  const la = nguonTin();
  hop._onMessage({
    origin: 'https://example.com',
    source: la.source,
    data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-la' }
  });
  hop.sendContextToSidebar({ spreadsheetId: 'sheet-1', sheetName: '!Lead', row: 5 });
  check(so, 'bắt tay sai origin bị bỏ và không chiếm kênh đang dùng',
    [la.sent.length, dung.sent[4].data.nonce, dung.sent[4].targetOrigin],
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
  check(so, 'bridge bao ro context Extension het hieu luc thay vi im lang', fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('EXTENSION_CONTEXT_INVALIDATED') >= 0 && fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('bridgeErrorMessage') >= 0, true);
  const unavailable = nguonTin();
  invalidBridge._onMessage({ origin: 'https://abc-123.googleusercontent.com', source: unavailable.source, data: { action: 'CRM_HANDSHAKE', nonce: 'nonce-loi' } });
  const unavailableSession = unavailable.sent[0].data.sessionId;
  invalidBridge._onMessage({ origin: 'https://abc-123.googleusercontent.com', source: unavailable.source, data: { action: 'CRM_FBM_CONFIG', nonce: 'nonce-loi', sessionId: unavailableSession, id: 'config-loi', config: { url: 'https://script.google.com/macros/s/test/exec', key: 'k', spreadsheetId: 'sheet' } } });
  check(so, 'bridge tra ACK loi ro rang khi context Extension het hieu luc', [unavailable.sent[1].data.action, unavailable.sent[1].data.ok, unavailable.sent[1].data.code], ['CRM_FBM_CONFIG_ACK', false, 'EXTENSION_CONTEXT_INVALIDATED']);
  const ignoredBefore = unavailable.sent.length;
  invalidBridge._onMessage({ origin: 'https://abc-123.googleusercontent.com', source: unavailable.source, data: { action: 'CRM_FBM_CONFIG', nonce: 'nonce-loi', sessionId: 'phien-cu', id: 'config-cu', config: {} } });
  check(so, 'bridge cu bo qua message khac session thay vi chen ACK', unavailable.sent.length, ignoredBefore);

  const workerSource = fs.readFileSync(WORKER_FILE, 'utf8');
  const executorSource = fs.readFileSync(EXECUTOR_FILE, 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '..', '..', '2_ShinCRM_Extension', 'manifest.json'), 'utf8'));
  check(so, 'worker ping dung executor phien ban truoc request FBM', workerSource.indexOf("FBM_PING_V2") >= 0 && workerSource.indexOf("FBM_EXECUTOR_VERSION") >= 0 && workerSource.indexOf("sendTabMessage(tabId, { type: 'FBM_EXECUTE_V2'") >= 0, true);
  check(so, 'worker chi co mot diem gui request FBM', (workerSource.match(/sendTabMessage\(tabId, \{ type: 'FBM_EXECUTE_V2', request: request \}/g) || []).length, 1);
  check(so, 'Extension chi co mot alarm ky thuat gas_poll va khong co alarm theo tien trinh', [workerSource.indexOf("var GAS_POLL_ALARM = 'gas_poll'") >= 0, workerSource.indexOf("'fbm-heartbeat'") < 0, workerSource.indexOf("periodInMinutes: minutes") >= 0, workerSource.indexOf("fbmHeartbeatNow('startup')") >= 0], [true, true, true, true]);
  check(so, 'worker khong tao hai request FBM khi Sidebar thu lai cung id', workerSource.indexOf('fbmRequestFlights') >= 0 && workerSource.indexOf('existingFlight') >= 0, true);
  check(so, 'heartbeat relay gui response thô, Spreadsheet ID va hop cho GAS', workerSource.indexOf("kind: 'heartbeat'") >= 0 && workerSource.indexOf('spreadsheetId: config.spreadsheetId') >= 0 && workerSource.indexOf('response: rawFbmReply(reply)') >= 0 && workerSource.indexOf('hop: used + 1') >= 0, true);
  check(so, 'heartbeat relay tiep tuc cursor do GAS quyet dinh diem dung', workerSource.indexOf('relayScheduledRequests(tabId') >= 0 && workerSource.indexOf('used >= 10') < 0, true);
  check(so, 'heartbeat relay request dau qua cong heartbeat GAS', workerSource.indexOf("kind: 'heartbeat', spreadsheetId: config.spreadsheetId, response: rawFbmReply(reply)") >= 0 && workerSource.indexOf("relayScheduledRequests(tabId") >= 0, true);
  check(so, 'heartbeat relay request tiep theo qua cong background_sync chung', workerSource.indexOf("kind: 'background_sync'") >= 0 && workerSource.indexOf("command: 'continue'") >= 0 && workerSource.indexOf('payload: { response: raw }') >= 0, true);
  check(so, 'alarm chi tim tab FBM sau khi co relay config', workerSource.indexOf("fbmHeartbeatNow('alarm')") >= 0 && workerSource.indexOf("if (!config) {") >= 0 && workerSource.indexOf('findFbmTab()') >= 0, true);
  check(so, 'relay config luu Spreadsheet ID', workerSource.indexOf('fbmSpreadsheetId: spreadsheetId') >= 0, true);
  check(so, 'relay config luu nhịp gas_poll va tuy chon startup', workerSource.indexOf('fbmPollMinutes') >= 0 && workerSource.indexOf('fbmRunOnStartup') >= 0 && workerSource.indexOf('config.extension') >= 0, true);
  check(so, 'service worker co quyen goi Sheets va Web App GAS', manifest.host_permissions.includes('https://docs.google.com/*') && manifest.host_permissions.includes('https://script.google.com/macros/*') && manifest.host_permissions.includes('https://script.googleusercontent.com/macros/*'), true);
  check(so, 'manifest Extension dong bo cung phien ban phat hanh moi', [manifest.version, manifest.name], ['21.15', 'CRM Local Pro V21.15']);
  check(so, 'relay GAS co timeout va luu chan doan toi thieu', workerSource.indexOf('GAS_RELAY_TIMEOUT_MS') >= 0 && workerSource.indexOf('RELAY_TIMEOUT') >= 0 && workerSource.indexOf('fbmRelayLastStatus') >= 0, true);
  const sidebarSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'Sidebar.html'), 'utf8');
  const entryPointsSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'EntryPoints.js'), 'utf8');
  const syncSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSync.html'), 'utf8');
  const syncStatusSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSyncStatusScreen.html'), 'utf8');
  const syncAuditSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'sync', 'fbmSyncAuditScreen.html'), 'utf8');
  const syncConflictSchema = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'schema', 'sync', 'results', 'conflict.html'), 'utf8');
  check(so, 'Extension ma hoa credential bang AES-GCM truoc khi luu', workerSource.indexOf('crypto.subtle.generateKey') >= 0 && workerSource.indexOf('CREDENTIAL_VAULT_PREFIX') >= 0 && workerSource.indexOf('FBM_ENCRYPT_CREDENTIALS') >= 0, true);
  check(so, 'bridge credential chi tra envelope va khong tra password ve Sidebar', fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('CRM_FBM_CREDENTIALS_RESULT') >= 0 && syncSource.indexOf('fbmSyncEncryptCredentials') >= 0 && syncSource.indexOf('fbm-login-password') >= 0, true);
  check(so, 'executor login dung force false va khong logout phien hop le', executorSource.indexOf("force: false") >= 0 && executorSource.indexOf("credentials: 'include'") >= 0 && executorSource.indexOf("meta.kind === 'login'") >= 0, true);
  check(so, 'executor login tai Login.aspx de lay salt truoc khi goi Login', executorSource.indexOf("fetch(base.slice(0, -1)") >= 0 && executorSource.indexOf('login_page_loaded') >= 0 && executorSource.indexOf('Không đọc được mã phiên đăng nhập từ trang FBM.') >= 0, true);
  check(so, 'executor login nhan du lieu database va don vi theo cac shape FBM', executorSource.indexOf('function loginListValue') >= 0 && executorSource.indexOf("'FHN_CRM_App'") >= 0 && executorSource.indexOf("'CTY'") >= 0, true);
  check(so, 'executor login doc lai trang tai khoan de lay payload cookie', executorSource.indexOf("/Main/zccrAccount.aspx") >= 0 && executorSource.indexOf('payload_cookie_page_read') >= 0, true);
  check(so, 'Sidebar ket thuc waiter bang loi bridge ro rang, khong gui lai request FBM', syncSource.indexOf('if (data.retryable)') < 0 && syncSource.indexOf('retryCount: 0') < 0 && syncSource.indexOf('client_extension_failure') >= 0, true);
  check(so, 'mo man dong bo gui cau hinh local nhung khong chan status', syncSource.indexOf('fbmSyncConfigureRelay();') >= 0 && syncSource.indexOf('Promise.all([fbmSyncStatusOnce(true), fbmSyncLoadIdentityStatus(), fbmSyncLoadSettings()])') >= 0, true);
  check(so, 'kiem tra lien ket dung chung guard Extension va huy cursor khi loi', syncSource.indexOf('function fbmSyncCheckIdentity()') >= 0 && syncSource.indexOf("sheetLinkExtensionAlive()") >= 0 && syncSource.indexOf("callServer('fbmCancelSync')") >= 0, true);
  const autoFillStart = syncSource.indexOf('function fbmSyncAutoFill()');
  const autoFillEnd = syncSource.indexOf('function fbmSyncConfirmIdentity()');
  const autoFillSource = autoFillStart >= 0 && autoFillEnd > autoFillStart ? syncSource.slice(autoFillStart, autoFillEnd) : '';
  const probeStart = syncSource.indexOf('function fbmSyncProbeIdentity()');
  const probeSource = probeStart >= 0 && autoFillStart > probeStart ? syncSource.slice(probeStart, autoFillStart) : '';
  check(so, 'tu dien nhan dien FBM chi doc User va giu ban nhap de nguoi dung tu kiem tra lien ket', probeStart >= 0 && autoFillStart >= 0 && syncSource.indexOf('function fbmSyncAutoFillAndCheck()') < 0 && autoFillSource.indexOf('fbmSyncCheckIdentity()') < 0 && probeSource.indexOf("return fbmSyncLoadIdentityStatus().then(function () { return value; });") < 0 && probeSource.indexOf("callServer('fbmStartIdentityProbe')") >= 0 && syncSource.indexOf("callServer('fbmSaveIdentityBinding'") >= 0 && syncSource.indexOf('IDENTITY_DRAFT_READY') >= 0, true);
  check(so, 'render status khong lam roi form tai khoan dang go', syncSource.indexOf('function fbmSyncCaptureActiveAccountDraft()') >= 0 && syncSource.indexOf('function fbmSyncRestoreActiveAccountDraft(snapshot)') >= 0 && syncSource.indexOf('active.setSelectionRange') >= 0, true);
  check(so, 'man dong bo hien thi Category block va Activity missing', syncStatusSource.indexOf('metadata.categoryBlocks') >= 0 && syncStatusSource.indexOf('metadata.activityBulkMissing') >= 0, true);
  check(so, 'man dong bo hien thi ma va nguyen nhan preflight', syncStatusSource.indexOf('preflightIssues') >= 0 && syncStatusSource.indexOf('item.code') >= 0 && syncStatusSource.indexOf('item.message') >= 0, true);
  check(so, 'man dong bo hien thi chi tiet loi day kem HTTP', syncStatusSource.indexOf('pushFailureDetails') >= 0 && syncStatusSource.indexOf('detail.reason') >= 0 && syncStatusSource.indexOf('detail.status') >= 0, true);
  check(so, 'Sidebar chi chuyen nguyen response FBM', syncSource.indexOf('fbmSyncProjectFormResponse') < 0 && syncSource.indexOf('InternalValues') < 0 && syncSource.indexOf('function fbmSyncRelayResponse(response) { return response; }') >= 0, true);
  check(so, 'Sidebar khong cat callback GAS som va giu cursor khi timeout', syncSource.indexOf('FBM_SYNC_GAS_CONTINUE_TIMEOUT_MS = 120000') >= 0 && syncSource.indexOf("code = 'GAS_CALLBACK_TIMEOUT'") >= 0 && syncSource.indexOf('Promise.race([callback, timeout])') >= 0 && syncSource.indexOf("error.code !== 'GAS_CALLBACK_TIMEOUT'") >= 0, true);
  check(so, 'GAS ghi dau vet callback khong chua payload', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf("fbmTraceContinue('entered')") >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'report', 'Report.js'), 'utf8').indexOf("'callbackTrace'") >= 0, true);
  check(so, 'GAS chuan hoa toan bo ket qua truoc callback Sidebar', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf('function fbmPublicResult') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'service', 'FbmSyncService.js'), 'utf8').indexOf('return fbmPublicResult(result)') >= 0, true);
  check(so, 'status cu khong ve de ghi de loading cua luot moi', syncSource.indexOf('viewEpoch') >= 0 && syncSource.indexOf('epoch !== FBM_SYNC_CLIENT.viewEpoch') >= 0 && syncSource.indexOf('lastServerUpdatedAt') >= 0, true);
  check(so, 'status bat dau truoc phien khong ve de ghi de loading dang chay', syncSource.indexOf('runningWhenRequested') >= 0 && syncSource.indexOf('FBM_SYNC_CLIENT.running && !runningWhenRequested') >= 0, true);
  check(so, 'khong hien tieu de chi tiet khi chi co canh bao preflight', syncStatusSource.indexOf('var hasRecordIssues') >= 0 && syncStatusSource.indexOf('if (!hasRecordIssues)') >= 0, true);
  check(so, 'Sidebar co man hinh giai quyet conflict theo hai phia', syncSource.indexOf('data-fbm-conflict-choice') >= 0 && syncSource.indexOf('fbmPrepareConflictResolution') >= 0 && syncSource.indexOf('fbmConfirmConflict') >= 0 && syncConflictSchema.indexOf('keepAllShin') >= 0 && syncConflictSchema.indexOf('keepAllFbm') >= 0 && syncAuditSource.indexOf('function fbmSyncConflictContentBlocks') >= 0, true);
  check(so, 'Sidebar khong gui relay config truoc khi boot bat tay', sidebarSource.indexOf('fbmSyncConfigureRelay().catch(function () {})') < 0, true);
  const bootstrapSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'client', 'ram', 'bootstrap.html'), 'utf8');
  check(so, 'mo Sidebar gui relay mot lan sau bat tay local, khong doi mo man Dong bo', bootstrapSource.indexOf('sheetLinkInstall();') >= 0 && bootstrapSource.indexOf('fbmSyncPrepareRelayForSidebarOpen();') >= 0 && syncSource.indexOf('function fbmSyncPrepareRelayForSidebarOpen()') >= 0 && syncSource.indexOf('FBM_SYNC_RELAY_OPEN_PREPARED') >= 0 && syncSource.indexOf('CRM_FBM_HEARTBEAT_NOW') < 0, true);
  check(so, 'GAS tu cap khoa relay mot lan bang lock', entryPointsSource.indexOf('waitLock(10000)') >= 0 && entryPointsSource.indexOf('if (!key) { key = Utilities.getUuid()') >= 0 && entryPointsSource.indexOf('FBM_SYNC_KEY') >= 0, true);
  check(so, 'GAS cap relay tu deployment co dinh, khong lay URL @HEAD theo context', entryPointsSource.indexOf('FBM_SYNC_RELAY_WEB_APP_URL') >= 0 && entryPointsSource.indexOf('ScriptApp.getService().getUrl()') < 0, true);
  check(so, 'doi khoa relay co ACK tu Extension', entryPointsSource.indexOf('function fbmSyncRotateRelayKey') >= 0 && syncSource.indexOf('fbmSyncPostRelayConfig(config, true)') >= 0 && fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('CRM_FBM_CONFIG_ACK') >= 0, true);
  check(so, 'relay tu choi probe ngoai nhip nen; Extension khong con ham probe rieng', entryPointsSource.indexOf("body.kind === 'probe'") < 0 && entryPointsSource.indexOf('RELAY_KIND_UNSUPPORTED') >= 0 && workerSource.indexOf('function fbmRelayProbe()') < 0 && workerSource.indexOf("type === 'FBM_RELAY_PROBE'") < 0, true);
  check(so, 'Web App relay kiem tra khoa va Spreadsheet ID truoc khi xu ly', entryPointsSource.indexOf("getProperty('FBM_SYNC_KEY')") >= 0 && entryPointsSource.indexOf("body.key !== expected") >= 0 && entryPointsSource.indexOf("String(body.spreadsheetId) !== actualSpreadsheetId") >= 0, true);
  check(so, 'relay nền ghi du moc gui va nhan response', workerSource.indexOf("stage: 'request_sent'") >= 0 && workerSource.indexOf("stage: 'response_received'") >= 0 && workerSource.indexOf('requestSentAt') >= 0 && workerSource.indexOf('responseReceivedAt') >= 0, true);
  check(so, 'relay nền ghi dau response khi GAS tra khong phai JSON', workerSource.indexOf('contentType') >= 0 && workerSource.indexOf('responsePrefix') >= 0 && workerSource.indexOf('RELAY_INVALID_JSON') >= 0 && workerSource.indexOf('RELAY_ENDPOINT_NOT_FOUND') >= 0, true);
  check(so, 'heartbeat co lenh chay ngay va ghi ly do bo qua', workerSource.indexOf('function fbmHeartbeatNow') >= 0 && workerSource.indexOf('FBM_HEARTBEAT_NOW') >= 0 && workerSource.indexOf('fbmHeartbeatLastStatus') >= 0 && workerSource.indexOf("fbmHeartbeatNow('alarm')") >= 0, true);
  check(so, 'heartbeat chi duoc chuyen sau khi GAS cap envelope', workerSource.indexOf("kind: 'heartbeat_request'") >= 0 && workerSource.indexOf('if (!gasRequest || gasRequest.ok !== true)') >= 0 && workerSource.indexOf('if (!gasRequest.request)') >= 0 && workerSource.indexOf('sendToFbmTab(tab.id, gasRequest.request)') >= 0, true);
  check(so, 'executor khong tu dung request heartbeat khi GAS khong cap', executorSource.indexOf('FBM_REQUEST_MISSING') >= 0 && executorSource.indexOf('HEARTBEAT_URL') < 0 && executorSource.indexOf('function heartbeat()') < 0, true);
  check(so, 'heartbeat chi chay sau khi GAS cap request va dung khi phien het han', workerSource.indexOf("kind: 'heartbeat_request'") >= 0 && workerSource.indexOf('blocked_gas_request') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'state', 'Scheduler.js'), 'utf8').indexOf('SESSION_EXPIRED_WAITING_LOGIN') >= 0, true);
  check(so, 'executor ap dung bo loc response do GAS chi dinh', executorSource.indexOf('function captureTransport') >= 0 && executorSource.indexOf('request.meta && request.meta.transport') >= 0, true);
  check(so, 'Sidebar gui relay mot lan va doi Extension ACK local', syncSource.indexOf('fbmSyncPostRelayConfig(config, true)') >= 0 && syncSource.indexOf('Extension không xác nhận đã lưu cấu hình kết nối.') >= 0 && syncSource.indexOf('sessionId: FBM_SYNC_RELAY_SESSION') >= 0, true);
  check(so, 'Sidebar khong ve lai form Tai khoan khi dang go', syncSource.indexOf('function fbmSyncAccountIsEditing') >= 0 && syncSource.indexOf('if (fbmSyncAccountIsEditing())') >= 0, true);
  check(so, 'Extension doi phien khong lam Sidebar gui lai relay trong cung luot mo', syncSource.indexOf('FBM_SYNC_RELAY_SESSION') >= 0 && syncSource.indexOf('FBM_SYNC_CLIENT.relayConfigured = false') >= 0 && syncSource.indexOf('SHEET_LINK_EXTENSION_SESSION') >= 0 && syncSource.indexOf('FBM_SYNC_RELAY_OPEN_PREPARED') >= 0 && syncSource.indexOf('fbmSyncConfigureRelay();\n  return Promise.all') < 0, true);
  check(so, 'Extension chi kiem tra cau truc roi luu relay local, khong probe Web App', workerSource.indexOf('function configureRelay(config)') >= 0 && workerSource.indexOf('normalizeRelayUrl(value.url)') >= 0 && workerSource.indexOf("kind: 'probe'") < 0 && workerSource.indexOf('configureRelay(config).then(sendResponse)') >= 0, true);
  check(so, 'relay loi khong yeu cau Sidebar tu lam moi hoac tao retry ngoai lich', workerSource.indexOf('function requestRelayRefresh') < 0 && fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf('CRM_REFRESH_RELAY') < 0 && syncSource.indexOf('CRM_FBM_RELAY_REFRESH') < 0, true);
  check(so, 'alarm la nhip ky thuat; GAS moi quyet dinh co viec nen', workerSource.indexOf('function restoreHeartbeatSchedule') >= 0 && workerSource.indexOf('getRelayConfig().then(function (config)') >= 0 && workerSource.indexOf('fbmRelayBackgroundEnabled') < 0 && workerSource.indexOf('function applyRelaySchedule') < 0, true);
  check(so, 'relay config trung khop da xac nhan khong probe lai GAS', workerSource.indexOf('function relayConfigAlreadyConfirmed') >= 0 && workerSource.indexOf("code: 'RELAY_CONFIG_UNCHANGED'") >= 0 && workerSource.indexOf('if (relayConfigureFlight)') >= 0, true);
  check(so, 'service worker chi giu mot pipeline nen qua heartbeat', workerSource.indexOf('function fbmRunBackgroundSync()') < 0 && workerSource.indexOf("type === 'FBM_BACKGROUND_SYNC'") < 0 && workerSource.indexOf('relayBackgroundSyncRequests') < 0, true);
  check(so, 'heartbeat coi GAS noop hop le la thanh cong va khong tim tab FBM', workerSource.indexOf("noteHeartbeatStatus('gas_noop'") >= 0 && workerSource.indexOf('if (!gasRequest.request)') >= 0, true);
  check(so, 'background relay dung DTO gon, khong gui traceTail/metadata Sidebar', workerSource.indexOf("kind: 'background_sync'") >= 0 && entryPointsSource.indexOf('fbmSyncRelayCompactResult') >= 0 && entryPointsSource.indexOf("body.kind === 'background_sync'") >= 0, true);
  check(so, 'background relay chi tiep tuc command GAS da cap tu heartbeat', workerSource.indexOf("command: 'start'") < 0 && workerSource.indexOf("command: 'continue'") >= 0 && entryPointsSource.indexOf('FbmSync.controlDispatch') >= 0, true);
  check(so, 'executor co ping phien ban 21.14 va kenh execute moi', /EXECUTOR_VERSION\s*=\s*'21\.14'/.test(executorSource) && workerSource.indexOf("FBM_EXECUTOR_VERSION = '21.14'") >= 0 && executorSource.indexOf('FBM_PING_V2') >= 0 && executorSource.indexOf('FBM_EXECUTE_V2') >= 0, true);
  check(so, 'GAS la noi duy nhat kiem tra endpoint FBM', executorSource.indexOf('validateEndpoint(req.url)') < 0 && executorSource.indexOf('FBM_ENDPOINT_UNALLOWED') < 0, true);
  check(so, 'GAS chan endpoint thieu truoc cap envelope', fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'protocol', 'Protocol.js'), 'utf8').indexOf('validateEndpoint: function') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'transport', 'TransportCore.js'), 'utf8').indexOf('validateEndpoint(request.url)') >= 0, true);
  check(so, 'GAS tu dung envelope heartbeat va relay co cong cap request', entryPointsSource.indexOf("body.kind === 'heartbeat_request'") >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'state', 'Scheduler.js'), 'utf8').indexOf('function fbmSyncHeartbeatRequest') >= 0 && fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'fbm_sync', 'read', 'GridRead.js'), 'utf8').indexOf('FbmSync.heartbeatCustomerRequest') >= 0, true);
  check(so, 'executor chi chuyen body wire GAS, khong escape nghiep vu', executorSource.indexOf('req.bodyText') >= 0 && executorSource.indexOf("JSON.stringify(body).replace(/\\//g") < 0, true);
  check(so, 'executor giai ma response gzip bat thuong cua FBM', executorSource.indexOf('DecompressionStream') >= 0 && executorSource.indexOf('response.arrayBuffer()') >= 0, true);
  check(so, 'trace Extension co du cac moc bridge worker executor fetch', ['bridge_received', 'worker_received', 'fbm_tab_found', 'executor_started', 'fetch_started', 'fetch_finished', 'bridge_response_sent'].every((stage) => workerSource.indexOf(stage) >= 0 || executorSource.indexOf(stage) >= 0 || fs.readFileSync(BRIDGE_FILE, 'utf8').indexOf(stage) >= 0), true);
  check(so, 'response FBM giu trace trong transport va loi cung giu trace', executorSource.indexOf('transport: Object.assign') >= 0 && executorSource.indexOf('trace: trace') >= 0 && workerSource.indexOf('transport: { trace: reply.trace') >= 0, true);
  const bridgeSource = fs.readFileSync(BRIDGE_FILE, 'utf8');
  check(so, 'bridge khong ghi de requestId GAS bang id waiter Sidebar', bridgeSource.indexOf("stage: 'bridge_received', clientRequestId") >= 0 && bridgeSource.indexOf("stage: 'bridge_received', requestId") < 0, true);

  let relayFetches = 0;
  let relayAlarms = 0;
  let relayAlarm = null;
  let workerMessageListener = null;
  const relayStorage = {};
  const workerContext = {
    console: { log() {}, warn() {}, info() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
    chrome: {
      tabs: { query: () => Promise.resolve([]), sendMessage() {} },
      scripting: { executeScript: () => Promise.resolve() },
      runtime: { lastError: null, onMessage: { addListener(fn) { workerMessageListener = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
      alarms: {
        create(name, info) { relayAlarms += 1; relayAlarm = { name, periodInMinutes: info && info.periodInMinutes }; },
        get(name, done) { done(relayAlarm && relayAlarm.name === name ? relayAlarm : null); },
        clear: () => Promise.resolve(true),
        onAlarm: { addListener() {} }
      },
      storage: { local: {
        get(keys, done) { const value = {}; (Array.isArray(keys) ? keys : [keys]).forEach((key) => { value[key] = relayStorage[key]; }); done(value); },
        set(value, done) { Object.assign(relayStorage, value); done(); }
      } }
    },
    fetch() { relayFetches += 1; return Promise.reject(new Error('configureRelay không được fetch')); }
  };
  vm.createContext(workerContext);
  vm.runInContext(workerSource, workerContext, { filename: WORKER_FILE });
  const localRelay = await workerContext.configureRelay({ url: 'https://script.google.com/macros/s/relay-test/exec', key: 'relay-key', spreadsheetId: 'sheet-test' });
  const unchangedRelay = await workerContext.configureRelay({ url: 'https://script.google.com/macros/s/relay-test/exec', key: 'relay-key', spreadsheetId: 'sheet-test' });
  const changedRelay = await workerContext.configureRelay({ url: 'https://script.google.com/macros/s/relay-test/exec', key: 'relay-key', spreadsheetId: 'sheet-test', extension: { pollMinutes: 6, runOnStartup: true } });
  check(so, 'cau hinh relay chi luu local va khong phat sinh /exec probe', [localRelay.code, unchangedRelay.code, changedRelay.code, relayFetches, relayStorage.fbmWebAppUrl, relayAlarms, relayAlarm.periodInMinutes, typeof workerMessageListener], ['RELAY_CONFIG_SAVED', 'RELAY_CONFIG_UNCHANGED', 'RELAY_CONFIG_SAVED', 0, 'https://script.google.com/macros/s/relay-test/exec', 2, 6, 'function']);

  let updatedListener = null;
  let updatedRemoved = false;
  let createdUrl = '';
  workerContext.chrome.tabs.query = () => Promise.resolve([]);
  workerContext.chrome.tabs.create = (options) => { createdUrl = options.url; return Promise.resolve({ id: 77, status: 'loading' }); };
  workerContext.chrome.tabs.onUpdated = {
    addListener(fn) { updatedListener = fn; },
    removeListener() { updatedRemoved = true; }
  };
  let openedTab = null;
  const pendingTab = workerContext.ensureFbmTab({ meta: { openFbmContext: { url: 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', active: false } } }).then((tab) => { openedTab = tab; return tab; });
  await new Promise((resolve) => setTimeout(resolve, 0));
  check(so, 'auto-open chi mo URL GAS cap va doi trang FBM tai xong', [openedTab, createdUrl, typeof updatedListener], [null, 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', 'function']);
  updatedListener(77, { status: 'complete' }, { id: 77, status: 'complete' });
  await pendingTab;
  check(so, 'auto-open tiep tuc sau khi tab FBM ready va thao listener', [openedTab && openedTab.id, openedTab && openedTab.status, updatedRemoved], [77, 'complete', true]);

  await new Promise((resolve) => {
    let listener = null;
    let fetchCalls = 0;
    let invalidReply = null;
    let validReply = null;
    let sentBody = null;
    let responseText = '{"d":{}}';
    const response = {
      ok: true,
      status: 200,
      headers: { get() { return 'application/json'; } },
      arrayBuffer() { return Promise.resolve(new TextEncoder().encode(responseText).buffer); }
    };
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '', textContent: String.raw`var payload={\"cookie\":\"461020379855cFHN_CRM_App\"};` } },
      fetch(url, options) { fetchCalls += 1; sentBody = options && options.body; return Promise.resolve(response); },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(executorSource, context, { filename: EXECUTOR_FILE });
    listener({ type: 'FBM_EXECUTE_V2', request: null }, null, (reply) => { invalidReply = reply; });
    setTimeout(() => {
      check(so, 'executor khong fetch khi GAS khong cap envelope', [fetchCalls, invalidReply && invalidReply.error, invalidReply && invalidReply.trace && invalidReply.trace.length], [0, 'GAS chưa cấp request FBM; executor chỉ là cầu nối.', 0]);
      listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/undefined', method: 'POST', bodyText: '{"gas":true}' } }, null, (reply) => { validReply = reply; });
      setTimeout(() => {
        check(so, 'executor chuyen nguyen body GAS ma khong hieu endpoint', [fetchCalls, sentBody, validReply && validReply.result && validReply.result.status], [1, '{"gas":true}', 200]);
        listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/customer', method: 'POST', bodyText: '{"cookie":"{{FBM_PAYLOAD_COOKIE}}"}', meta: { transport: { captures: [{ name: 'payloadCookie', source: 'page_html', pattern: payloadCookieCapturePattern(), flags: 'i', group: 1 }], replacements: [{ token: '{{FBM_PAYLOAD_COOKIE}}', capture: 'payloadCookie', source: 'page_html' }] } } } }, null, (reply) => {
          setTimeout(() => {
            check(so, 'executor lay capture generic do GAS cap tu text trang co dau nhay escape', [fetchCalls, sentBody, reply && reply.result && reply.result.status], [2, '{"cookie":"461020379855cFHN_CRM_App"}', 200]);
            responseText = JSON.stringify({ d: { Authorized: 'auth-c', UserId: '2037', UserName: 'ANHLT', AccountName: 'Le Tuan Anh', Huge: 'x'.repeat(5000) } });
            listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/authorize', method: 'POST', bodyText: '{}', meta: { transport: { jsonPaths: ['d.Authorized', 'd.UserId', 'd.UserName', 'd.AccountName'] } } } }, null, (projectedReply) => {
              setTimeout(() => {
                const body = JSON.parse(projectedReply.result.body);
                check(so, 'executor projection generic giu du field GAS yeu cau va bo payload lon', [body.d.Authorized, body.d.UserId, body.d.UserName, body.d.AccountName, body.d.Huge, projectedReply.result.body.length < responseText.length], ['auth-c', '2037', 'ANHLT', 'Le Tuan Anh', undefined, true]);
                const rawBeforeFallback = responseText;
                listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/authorize', method: 'POST', bodyText: '{}', meta: { transport: { jsonPaths: ['d.NotPresent'] } } } }, null, (fallbackReply) => {
                  setTimeout(() => {
                    check(so, 'projection khong khop path phai fail closed thay vi tra payload lon', [fallbackReply && fallbackReply.code, fallbackReply && fallbackReply.error, fallbackReply && fallbackReply.result], ['FBM_TRANSPORT_PROJECTION_MISSING', 'Response FBM không chứa path projection nào do GAS yêu cầu.', undefined]);
                    resolve();
                  }, 20);
                });
              }, 20);
            });
          }, 20);
        });
      }, 20);
    }, 20);
  });

  await new Promise((resolve) => {
    let listener = null;
    let responseText = JSON.stringify({ d: { Rows: [[1, 'keep'], [2, 'drop'], [3, 'keep']] } });
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '', textContent: '' } },
      fetch() { return Promise.resolve({ ok: true, status: 200, headers: { get() { return 'application/json'; } }, arrayBuffer() { return Promise.resolve(new TextEncoder().encode(responseText).buffer); } }); },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(executorSource, context, { filename: EXECUTOR_FILE });
    listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/activity', method: 'POST', bodyText: '{}', meta: { transport: { arrayFilters: [{ path: 'd.Rows', keyIndex: 0, values: ['1', '3'] }] } } } }, null, (reply) => {
      setTimeout(() => {
        const body = JSON.parse(reply.result.body);
        check(so, 'executor loc mang generic theo tap khoa GAS cap', [body.d.Rows.length, body.d.Rows.map((row) => row[0]).join(','), reply.result.transport.trace.some((item) => item.stage === 'fetch_finished')], [2, '1,3', true]);
        responseText = 'not-json';
        listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/activity', method: 'POST', bodyText: '{}', meta: { transport: { arrayFilters: [{ path: 'd.Rows', keyIndex: 0, values: ['1'] }] } } } }, null, (invalid) => {
          setTimeout(() => {
            check(so, 'executor loc JSON loi theo chi dan phai fail closed', [invalid.code, invalid.result], ['FBM_TRANSPORT_FILTER_INVALID_JSON', undefined]);
            responseText = JSON.stringify({ d: { Rows: [[1, 'A', 'drop'], [2, 'B', 'drop']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'ma_kh' }, { AliasName: 'details' }] } } });
            listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/activity', method: 'POST', bodyText: '{}', meta: { transport: { arrayProjections: [{ paths: ['d.Rows', 'd.ViewPage.Fields'], indices: [0, 2] }] } } } }, null, (projectionReply) => {
              setTimeout(() => {
                const projected = projectionReply && projectionReply.result ? JSON.parse(projectionReply.result.body) : null;
                check(so, 'executor chieu cot generic theo vi tri GAS cap cho ca rows va metadata', [projected && projected.d.Rows[0].join(','), projected && projected.d.ViewPage.Fields.map((field) => field.AliasName).join(','), projectionReply && projectionReply.result && projectionReply.result.transport.trace.some((item) => item.stage === 'fetch_finished'), projectionReply && projectionReply.code, projectionReply && projectionReply.error], ['1,drop', 'id,details', true, undefined, undefined]);
                responseText = JSON.stringify({ d: { Rows: [], ViewPage: { Fields: [] } } });
                listener({ type: 'FBM_EXECUTE_V2', request: { url: 'https://fbo.com.vn:8888/Main/activity', method: 'POST', bodyText: '{}', meta: { transport: { arrayProjections: [{ paths: ['d.Rows', 'd.ViewPage.Fields'], indices: [0, 2] }] } } } }, null, (emptyReply) => {
                  setTimeout(() => {
                    const empty = emptyReply && emptyReply.result ? JSON.parse(emptyReply.result.body) : null;
                    check(so, 'executor chieu cot khong tao dong gia khi mang FBM rong', [empty && empty.d.Rows.length, empty && empty.d.ViewPage.Fields.length], [0, 0]);
                    resolve();
                  }, 20);
                });
              }, 20);
            });
          }, 20);
        });
      }, 20);
    });
  });

  await new Promise((resolve) => {
    let listener = null;
    const calls = [];
    function response(text) {
      return {
        ok: true,
        status: 200,
        headers: { get() { return 'application/json'; } },
        arrayBuffer() { return Promise.resolve(new TextEncoder().encode(text).buffer); }
      };
    }
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '', textContent: '' } },
      fetch(url, options) {
        calls.push({ url: String(url), method: options && options.method || 'GET', body: options && options.body });
        if (String(url).endsWith('/Main/Login.aspx')) { return Promise.resolve(response(String.raw`<script>{"ChallengeScript":"eval(\u0027\\\u0027a2838e\\\u0027+\\\u00276f471b\\\u0027\u0027)"}</script>`)); }
        if (String(url).endsWith('/GetEntityData')) { return Promise.resolve(response('{"d":[["01","Fast FBM Online","FHN_CRM_App"]]}')); }
        if (String(url).endsWith('/GetUnitData')) { return Promise.resolve(response('{"d":[["CTY","Công ty","Company"]]}')); }
        if (String(url).endsWith('/Login')) { return Promise.resolve(response('{"d":true}')); }
        if (String(url).endsWith('/zccrAccount.aspx')) { return Promise.resolve(response('<script>var payload={"cookie":"461020379855cFHN_CRM_App"};</script>')); }
        return Promise.resolve(response('{}'));
      },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(executorSource, context, { filename: EXECUTOR_FILE });
    listener({ type: 'FBM_EXECUTE_V2', request: { meta: { kind: 'login', loginCredentials: { username: 'anhlt', password: 'mat-khau', language: 'v' } } } }, null, (reply) => {
      setTimeout(() => {
        const loginBody = calls[3] && JSON.parse(calls[3].body);
        check(so, 'executor login chay du trang salt, database, don vi, Login va trang tai khoan', [calls.map((item) => item.url.replace('https://fbo.com.vn:8888/Main/', '')).join('|'), reply && reply.result && reply.result.ok], ['Login.aspx|Login.aspx/GetEntityData|Login.aspx/GetUnitData|Login.aspx/Login|zccrAccount.aspx', true]);
        check(so, 'executor login doc salt ChallengeScript HTML live, force false va khong dua mat khau goc len FBM', [loginBody.value, loginBody.force, loginBody.password === 'mat-khau', loginBody.database, loginBody.unit], ['a2838e6f471b', false, false, 'FHN_CRM_App', 'CTY']);
        resolve();
      }, 20);
    });
  });
}

module.exports = { chay };
