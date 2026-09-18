/** Kiểm use case xuyên GAS -> Extension -> GAS theo hợp đồng tài liệu 09. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { WORKFLOWS, PIPELINE_CATALOG } = require('../../contracts/fbmSyncPipeline');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const WORKER = path.join(ROOT, '2_ShinCRM_Extension', 'background', 'service_worker.js');

function properties() {
  const data = {};
  return {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setProperty(key, value) { data[key] = String(value); },
    deleteProperty(key) { delete data[key]; },
    data
  };
}

function workflowGas() {
  const documentProperties = properties();
  const scriptProperties = properties();
  const hop = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => documentProperties, getScriptProperties: () => scriptProperties },
    Utilities: { getUuid: () => 'workflow-uuid' },
    shinOpenBook: () => ({ getId: () => 'sheet-workflow' })
  });
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    'fbm_sync/state/State.js',
    'fbm_sync/state/AccountSettings.js',
    'fbm_sync/state/Scheduler.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/report/Report.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/auth/AutoLogin.js',
    'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PullFlow.js',
    'fbm_sync/transport/EntryPoints.js'
  );
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-workflow';
  hop.FbmSync.configValue = () => '';
  hop.FbmSync.readLocal = () => [];
  return { hop, documentProperties, scriptProperties };
}

function fbmResponse(body) {
  return {
    ok: true,
    status: 200,
    headers: { get: () => 'application/json' },
    arrayBuffer: () => Promise.resolve(new TextEncoder().encode(body).buffer)
  };
}

function sendThroughExecutor(request, responseBody) {
  return new Promise((resolve, reject) => {
    let listener = null;
    let sent = null;
    const source = fs.readFileSync(EXECUTOR, 'utf8');
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '<script>var payload={"cookie":"safeFHN_CRM_App"};</script>', textContent: '' } },
      fetch(url, options) {
        sent = { url: String(url), body: options && options.body };
        return Promise.resolve(fbmResponse(responseBody));
      },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: EXECUTOR });
    if (!listener) { reject(new Error('Executor không đăng ký kênh FBM_EXECUTE_V2.')); return; }
    listener({ type: 'FBM_EXECUTE_V2', request }, null, (reply) => resolve({ reply, sent }));
  });
}

function executorRaw(reply, requestId) {
  const result = reply && reply.result || {};
  return {
    ok: result.ok === true,
    status: Number(result.status || 0),
    body: String(result.body || ''),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: String(requestId) }] }
  };
}

function relayResponse(value) {
  const body = JSON.stringify(value);
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve(body) };
}

function workerHarness(relayReplies, fbmTabs, tabReply) {
  const storage = {
    fbmWebAppUrl: 'https://script.google.com/macros/s/workflow-relay/exec',
    fbmSyncKey: 'workflow-key',
    fbmSpreadsheetId: 'sheet-workflow'
  };
  const relayCalls = [];
  let fbmTabQueries = 0;
  let fbmTabCreates = 0;
  let fbmMessages = 0;
  const context = {
    console: { log() {}, warn() {}, info() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
    TextEncoder, TextDecoder, Uint8Array, btoa: (value) => Buffer.from(value, 'binary').toString('base64'), atob: (value) => Buffer.from(value, 'base64').toString('binary'),
    chrome: {
      tabs: {
        query(query) {
          const urls = query && query.url || [];
          const isFbm = urls.some((value) => String(value).indexOf('fbo.com.vn') >= 0);
          if (isFbm) { fbmTabQueries += 1; return Promise.resolve(fbmTabs || []); }
          return Promise.resolve([]);
        },
        create(options) { fbmTabCreates += 1; return Promise.resolve({ id: 99, url: options && options.url, status: 'complete' }); },
        sendMessage(tabId, message, done) {
          fbmMessages += 1;
          if (done) { done(tabReply ? tabReply(tabId, message) : null); }
        }
      },
      scripting: { executeScript: () => Promise.resolve() },
      runtime: { lastError: null, onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
      alarms: { create() {}, clear: () => Promise.resolve(true), onAlarm: { addListener() {} } },
      storage: { local: {
        get(keys, done) {
          const value = {};
          (Array.isArray(keys) ? keys : [keys]).forEach((key) => { value[key] = storage[key]; });
          done(value);
        },
        set(value, done) { Object.assign(storage, value); if (done) { done(); } },
        remove(keys, done) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => delete storage[key]); if (done) { done(); } }
      } }
    },
    fetch(url, options) {
      relayCalls.push({ url: String(url), body: JSON.parse(options.body) });
      return Promise.resolve(relayResponse(relayReplies.shift() || { ok: false, code: 'RELAY_REPLY_MISSING' }));
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(WORKER, 'utf8'), context, { filename: WORKER });
  return { context, relayCalls, storage, metrics: () => ({ fbmTabQueries, fbmTabCreates, fbmMessages }) };
}

async function chay(so) {
  section('FBM sync — workflow theo tài liệu');
  const ids = WORKFLOWS.map((item) => item.id);
  check(so, 'charter workflow co 14 use case doc lap va khong trung ID', [WORKFLOWS.length, new Set(ids).size], [14, 14]);
  check(so, 'charter bao phu relay, nhan dien, nen, ghi, dung va UI/log', WORKFLOWS.map((item) => item.id).sort(), [
    'relay-sidebar-open', 'identity-autofill', 'identity-clear-binding', 'background-noop', 'manual-transport-failure',
    'identity-login-test', 'background-transport-failure', 'master-off-in-flight', 'read-vs-check-write-gate', 'push-write-safety', 'stale-response-and-cancel', 'ui-status-and-log', 'conflict-resolution', 'full-pull-missing'
  ].sort());
  check(so, 'catalog gom du 44 pipeline A-F cua module va khong trung ma', [PIPELINE_CATALOG.length, new Set(PIPELINE_CATALOG.map((item) => item.id)).size], [44, 44]);
  check(so, 'moi pipeline co nguon, trigger, ket qua quan sat va bang chung bat buoc', PIPELINE_CATALOG.every((item) => item.source && item.trigger && item.expect && item.requiredProof.length === 2), true);
  check(so, 'ma tran 44 pipeline deu tro den module test dang chay va khong co pipeline khong co chu so huu kiem thu', PIPELINE_CATALOG.every((item) => item.testModules.length > 0 && item.testModules.every((file) => fs.existsSync(path.join(ROOT, file)))), true);
  check(so, 'ma tran 44 pipeline co trace offline theo hanh vi va phan biet bang chung live', PIPELINE_CATALOG.every((item) => item.offlineScenario && item.layers && item.layers.gas && item.layers.extension && item.layers.ui && item.layers.log && item.requiredProof.indexOf('offline') >= 0 && item.requiredProof.some((proof) => /GAS DEV|live/.test(proof))), true);

  const legacyAccount = workflowGas();
  legacyAccount.hop.FbmSync.configValue = (name) => name === 'FBM_ACCOUNT_NAME' ? 'Tên còn sót trong Config' : '';
  legacyAccount.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Lê Tuấn Anh' });
  check(so, 'ten tai khoan cua binding la nguon owner duy nhat, Config cu khong the rebind hay khoa phien', [
    legacyAccount.hop.FbmSync.scriptSettings().accountName,
    legacyAccount.hop.FbmSync.identityStatus({ userId: '2037', username: 'ANHLT', accountName: 'Lê Tuấn Anh' }).status,
    legacyAccount.hop.FbmSync.identityStatus({ userId: '2037', username: 'ANHLT', accountName: 'Tên còn sót trong Config' }).status
  ], ['Lê Tuấn Anh', 'BOUND', 'REBIND_REQUIRED']);

  const engine = workflowGas();
  const started = engine.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const firstRequest = started.request;
  check(so, 'tu dong dien: GAS cap dung mot grid User va khong xin Authorized khong dung', [
    firstRequest.meta.kind, firstRequest.body.controller, firstRequest.body.type, firstRequest.body.authorized
  ], ['identity_user_grid', 'User', 0, undefined]);
  const userResponse = JSON.stringify({ d: {
    TotalRowCount: 1,
    Rows: [[2037, 'ANHLT', 'Le Tuan Anh']],
    ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] }
  } });
  const transport = await sendThroughExecutor(firstRequest, userResponse);
  check(so, 'tu dong dien: Extension chuyen nguyen envelope GAS toi FBM', [
    transport.sent.url, JSON.parse(transport.sent.body).controller, JSON.parse(transport.sent.body).cookie
  ], [firstRequest.url, 'User', 'safeFHN_CRM_App']);
  const finished = engine.hop.FbmSync.continue(executorRaw(transport.reply, firstRequest.id));
  check(so, 'tu dong dien: GAS nhan response Extension va tra draft chua luu binding', [
    finished.ok, finished.request || null, finished.status.phase, finished.status.metadata.identityProbe, engine.documentProperties.getProperty('FBM_SYNC_BINDING_V1')
  ], [true, null, 'done', { spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' }, null]);

  const incomplete = workflowGas();
  const incompleteStarted = incomplete.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const incompleteResult = incomplete.hop.FbmSync.continue({
    ok: true, status: 200,
    body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2037]], ViewPage: { Fields: [{ AliasName: 'id' }] } } }),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: incompleteStarted.request.id }] }
  });
  check(so, 'tu dong dien: FBM thieu nhan dien phai ket thuc loi ro rang, khong tu luu', [
    incompleteResult.ok, incompleteResult.code, incompleteResult.status.phase, incomplete.documentProperties.getProperty('FBM_SYNC_BINDING_V1')
  ], [false, 'IDENTITY_PROBE_INCOMPLETE', 'error', null]);

  const identityCheck = workflowGas();
  identityCheck.hop.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-000001', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010' }] : [];
  const identityStarted = identityCheck.hop.FbmSync.start({ mode: 'check', scan: 'identity_check', origin: 'manual', manual: true });
  const identityAuthorized = await sendThroughExecutor(identityStarted.request, JSON.stringify({ d: { Authorized: 'identity-auth' } }));
  const identityGridStep = identityCheck.hop.FbmSync.continue(executorRaw(identityAuthorized.reply, identityStarted.request.id));
  const customerFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ngay_gd', 'datetime0', 'xorder'];
  const customerRow = customerFields.map((field) => field === 'stt_rec_kh' ? 'FBM-1' : field === 'ma_kh' ? 'ALT00010' : '');
  const identityGrid = await sendThroughExecutor(identityGridStep.request, JSON.stringify({ d: { TotalRowCount: 1, Rows: [customerRow], ViewPage: { Fields: customerFields.map((AliasName) => ({ AliasName })) } } }));
  const identityDone = identityCheck.hop.FbmSync.continue(executorRaw(identityGrid.reply, identityGridStep.request.id));
  check(so, 'kiem tra lien ket: chi quet Customer va tra tong hop n/N, khong cap Activity hoac ghi binding', [
    identityGridStep.request.meta.entity, identityDone.request || null, identityDone.status.phase,
    identityDone.status.metadata.identityCheck.total, identityDone.status.metadata.identityCheck.matched, identityDone.status.metadata.identityCheck.missing,
    identityCheck.documentProperties.getProperty('FBM_SYNC_BINDING_V1')
  ], ['customer', null, 'done', 1, 1, 0, null]);

  const loginFlow = workflowGas();
  loginFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  loginFlow.hop.FbmSync.loginConfigSave({ credentialRef: 'workflow-credential-ref', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'ANHLT' } });
  const loginStarted = loginFlow.hop.FbmSync.loginTestRequest();
  const afterLogin = loginFlow.hop.FbmSync.loginTestResult({
    ok: true, status: 200, body: JSON.stringify({ d: true }),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: loginStarted.request.id }] }
  });
  const loginAuthorize = await sendThroughExecutor(afterLogin.request, JSON.stringify({ d: { Authorized: 'login-auth' } }));
  const afterAuthorize = loginFlow.hop.FbmSync.loginTestResult(executorRaw(loginAuthorize.reply, afterLogin.request.id));
  const loginUser = await sendThroughExecutor(afterAuthorize.request, userResponse);
  const loginDone = loginFlow.hop.FbmSync.loginTestResult(executorRaw(loginUser.reply, afterAuthorize.request.id));
  check(so, 'dang nhap thu: Login thanh cong phai qua authorize va User grid khop binding moi duoc bao thanh cong', [
    loginStarted.request.meta.kind, afterLogin.request.meta.kind, afterAuthorize.request.meta.kind,
    loginDone.ok, loginDone.code, loginDone.status.phase, loginDone.status.message
  ], ['login', 'authorize', 'identity_user_grid', true, 'LOGIN_OK', 'done', 'Đăng nhập thử thành công và đúng tài khoản FBM đã liên kết.']);

  const wrongLogin = workflowGas();
  wrongLogin.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const wrongStart = wrongLogin.hop.FbmSync.loginTestRequest('workflow-credential-ref');
  const wrongAfterLogin = wrongLogin.hop.FbmSync.loginTestResult({ ok: true, status: 200, body: JSON.stringify({ d: true }), transport: { trace: [{ stage: 'executor_response_sent', requestId: wrongStart.request.id }] } });
  const wrongAuthorize = wrongLogin.hop.FbmSync.loginTestResult({ ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'wrong-auth' } }), transport: { trace: [{ stage: 'executor_response_sent', requestId: wrongAfterLogin.request.id }] } });
  const wrongDone = wrongLogin.hop.FbmSync.loginTestResult({
    ok: true, status: 200,
    body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2038, 'OTHER', 'Tai khoan khac']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } }),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: wrongAuthorize.request.id }] }
  });
  check(so, 'dang nhap thu sai identity: khong coi la thanh cong va khong thay binding', [
    wrongDone.ok, wrongDone.code, wrongDone.status.phase, wrongLogin.hop.FbmSync.bindingRead().userId
  ], [false, 'LOGIN_IDENTITY_MISMATCH', 'paused', '2037']);

  const binding = workflowGas();
  const bindingSaved = binding.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const bindingCleared = binding.hop.FbmSync.bindingWrite({});
  check(so, 'xoa lien ket rong: chi xoa binding, giu Sheet va khoa dong bo thuong', [
    bindingSaved.ok, bindingCleared.code, binding.documentProperties.getProperty('FBM_SYNC_BINDING_V1'), bindingCleared.identityStatus.status
  ], [true, 'IDENTITY_BINDING_CLEARED', null, 'UNBOUND']);
  binding.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const activeBindingState = binding.hop.FbmSync.stateRead();
  activeBindingState.runId = 'binding-request'; activeBindingState.phase = 'checking_session'; activeBindingState.activeRequestId = 'request-binding';
  binding.hop.FbmSync.stateWrite(activeBindingState);
  const rejectedClear = binding.hop.FbmSync.bindingWrite({});
  check(so, 'xoa lien ket bi chan khi request FBM dang bay', [rejectedClear.ok, rejectedClear.code, Boolean(binding.documentProperties.getProperty('FBM_SYNC_BINDING_V1'))], [false, 'SYNC_ALREADY_RUNNING', true]);

  const gates = workflowGas().hop.FbmSync;
  check(so, 'phan quyen ghi theo mode: check khong ghi, read chi ghi Sheet, push chi ghi FBM', [
    ['check', 'read', 'push', 'write'].map((mode) => gates.canWriteSheet(mode)),
    ['check', 'read', 'push', 'write'].map((mode) => gates.canWriteFbm(mode))
  ], [[false, true, false, true], [false, false, true, true]]);

  const scheduleFlow = workflowGas();
  check(so, 'cau hinh Extension mac dinh mot nhip 5 phut va startup bat', [scheduleFlow.hop.FbmSync.extensionConfigPublic().pollMinutes, scheduleFlow.hop.FbmSync.extensionConfigPublic().runOnStartup], [5, true]);
  const scheduleDefaults = scheduleFlow.hop.FbmSync.backgroundScheduleDefault();
  check(so, 'lịch nền mặc định đúng bốn tiến trình và tải nhẹ', [scheduleDefaults.heartbeat.minutes, scheduleDefaults.customerFull.enabled, scheduleDefaults.customerFull.minutes, scheduleDefaults.activityFull.enabled, scheduleDefaults.activityFull.minutes, scheduleDefaults.detail.enabled], [5, true, 480, false, 1440, false]);
  const savedExtension = scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 15, runOnStartup: false });
  check(so, 'cau hinh Extension cho phep doi nhip nhung khong doi lich nghiep vu', [savedExtension.ok, savedExtension.pollMinutes, savedExtension.runOnStartup, scheduleFlow.hop.FbmSync.backgroundSchedulePublic().heartbeat.minutes], [true, 15, false, 5]);
  const savedSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: false, minutes: 10 }, customer: { enabled: true, minutes: 60 }, activity: { enabled: false, minutes: 30 } });
  check(so, 'GAS luu cong tac va chu ky tung tien trinh nen', [savedSchedule.ok, savedSchedule.schedule.heartbeat.enabled, savedSchedule.schedule.heartbeat.minutes, savedSchedule.schedule.activity.enabled], [true, false, 10, false]);
  const disabledSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({ enabled: false });
  check(so, 'luu lich nen dong bo ca cong tac lich va co BACKGROUND_SWITCH_KEY', [disabledSchedule.ok, disabledSchedule.schedule.enabled, scheduleFlow.hop.FbmSync.backgroundEnabled()], [true, false, false]);
  const directionSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({
    enabled: true, direction: 'write',
    heartbeat: { enabled: true, minutes: 5 },
    customerFull: { enabled: true, minutes: 480 },
    activityFull: { enabled: false, minutes: 1440 },
    detail: { enabled: true, minutes: 60, customersPerRun: 50, minDelaySeconds: 0.5, maxDelaySeconds: 2 }
  });
  check(so, 'Lịch nền lưu chiều hai chiều và batch detail cùng khoảng delay', [directionSchedule.schedule.direction, directionSchedule.schedule.detail.enabled, directionSchedule.schedule.detail.customersPerRun, directionSchedule.schedule.detail.minDelaySeconds, directionSchedule.schedule.detail.maxDelaySeconds, scheduleFlow.hop.FbmSync.backgroundEnabled()], ['write', true, 50, 0.5, 2, true]);
  const detailCursor = scheduleFlow.hop.FbmSync.detailCursorWrite({ pageIndex: 1, pageValue: ['2026-09-16', '2026-09-16T10:00:00', 'CUS-50'] });
  check(so, 'Cursor detail được lưu bền vững chỉ với khóa trang', [detailCursor.pageIndex, scheduleFlow.hop.FbmSync.detailCursorRead().pageValue.join('|')], [1, '2026-09-16|2026-09-16T10:00:00|CUS-50']);
  const detailState = { scan: 'detail', detailCustomerLimit: 50, cursor: { pageIndex: 1, count: 50, seen: 0 } };
  const detailRows = Array.from({ length: 50 }, (_, index) => ({ ngay_gd: '2026-09-16', datetime0: String(index), xorder: String(index), stt_rec_kh: 'CUS-' + (index + 1) }));
  const detailNext = scheduleFlow.hop.FbmSync.customerNext(detailState, detailRows, 120);
  check(so, 'Trang detail đủ batch không đánh dấu hết danh sách và lưu trang kế tiếp', [detailNext, scheduleFlow.hop.FbmSync.detailCursorRead().pageIndex, scheduleFlow.hop.FbmSync.detailCursorRead().pageValue[2]], [null, 2, '49']);
  scheduleFlow.hop.FbmSync.customerNext({ scan: 'detail', detailCustomerLimit: 50, cursor: { pageIndex: 2, count: 50, seen: 0 } }, [], 120);
  check(so, 'Trang detail rỗng xóa cursor để lượt sau bắt đầu lại an toàn', scheduleFlow.hop.FbmSync.detailCursorRead(), null);
  scheduleFlow.hop.FbmSync.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  const now = Date.now();
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_SCAN', String(now - 1));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_SCAN', String(now - 1));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now - 1));
  const pickedCustomer = scheduleFlow.hop.FbmSync.schedulerPickDue(now);
  check(so, 'scheduler GAS uu tien Customer khi Customer va Activity cung den han', [pickedCustomer.ok, pickedCustomer.kind, scheduleFlow.hop.FbmSync.stateRead().scheduledScan], [true, 'customerFull', 'customerFull']);
  const duplicateReservation = scheduleFlow.hop.FbmSync.schedulerPickDue(now + 1);
  check(so, 'scheduler GAS lap lai cung nhat khong tao reservation thu hai', [duplicateReservation.ok, duplicateReservation.kind, duplicateReservation.existing], [true, 'customerFull', true]);
  scheduleFlow.hop.FbmSync.statePatch({ runId: 'running-a', phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: '' });
  const blockedOverlap = scheduleFlow.hop.FbmSync.schedulerPickDue(now + 1);
  check(so, 'scheduler GAS khong cap tien trinh song song khi A dang chay', [blockedOverlap.ok, blockedOverlap.code], [false, 'SYNC_ALREADY_RUNNING']);
  scheduleFlow.hop.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', scheduledScan: '' });
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now + 60000));
  const noDue = scheduleFlow.hop.FbmSync.heartbeatRequest({ source: 'alarm' });
  check(so, 'scheduler GAS khong cap heartbeat khi khong co lich den han', [noDue.ok, noDue.code, noDue.request], [true, 'NO_PROCESS_DUE', null]);
  scheduleFlow.hop.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, scheduledScan: '' });
  scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: true, minutes: 5 }, customer: { enabled: true, minutes: 60 }, activity: { enabled: true, minutes: 30 } });
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now - 1));
  const heartbeatLowest = scheduleFlow.hop.FbmSync.schedulerPickDue(now);
  check(so, 'scheduler GAS chi chon giu phien khi khong co tien trinh du lieu den han', [heartbeatLowest.ok, heartbeatLowest.kind], [true, 'heartbeat']);
  check(so, 'cau hinh scheduler tu choi chu ky ngoai gioi han', [scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 0 }).ok, (() => { try { scheduleFlow.hop.FbmSync.backgroundScheduleSave({ customer: { minutes: 0 } }); return false; } catch (ignore) { return true; } })()], [false, true]);
  scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 15, runOnStartup: true });
  scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: true, minutes: 5 }, customer: { enabled: true, minutes: 60 }, activity: { enabled: true, minutes: 30 } });
  const startup = scheduleFlow.hop.FbmSync.heartbeatRequest({ source: 'startup' });
  check(so, 'Chrome startup co the hoi GAS ngay mot luot theo cau hinh', [startup.ok, startup.code, startup.request && startup.request.meta.kind], [true, 'HEARTBEAT_REQUEST_READY', 'heartbeat']);
  const bulkProjection = scheduleFlow.hop.FbmSync.activityBulkProjection(['id', 'ma_kh', 'ma_cv', 'ten_cv', 'details', 'end_date', 'owner', 'datetime0', 'line_nbr']);
  scheduleFlow.hop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-01-01' });
  const bulkProjectionRequest = scheduleFlow.hop.FbmSync.activityBulkRequest({ type: 1, count: 100, gridPageIndex: 1, gridPageValue: ['2026-01-01'], transport: bulkProjection });
  check(so, 'GAS cap chi dan loc cot generic cho bulk Activity, khong hardcode o Extension', [bulkProjection.arrayProjections[0].indices.join(','), bulkProjectionRequest.meta.transport.arrayProjections[0].paths.join('|'), bulkProjectionRequest.body.filter], ['0,3,4,5,6,7,8,1,2', 'd.Rows|d.ViewPage.Fields', ['end_date:>=01/01/2026']]);
  const waitFlow = workflowGas();
  waitFlow.hop.FbmSync.statePatch({ scan: 'detail', backgroundDetail: { minDelaySeconds: 0.5, maxDelaySeconds: 2 }, phase: 'pull_customer', cursor: { kind: 'customer_grid' } });
  const delayed = waitFlow.hop.FbmSync.nextEnvelope(waitFlow.hop.FbmSync.customerGridRequest({ type: 0, count: 50, gridPageIndex: -1, gridRefresh: false }));
  check(so, 'GAS cấp waitMs transport cho lượt detail trong đúng khoảng cấu hình', [delayed.meta.waitMs >= 500, delayed.meta.waitMs <= 2000], [true, true]);

  const noopWorker = workerHarness([{ ok: true, code: 'HEARTBEAT_NOOP', request: null }], []);
  const noopResult = await noopWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm noop: Extension hoi GAS mot lan, khong tim tab va khong fetch FBM', [
    noopResult.code, noopWorker.relayCalls.map((item) => item.body.kind), noopWorker.metrics().fbmTabQueries, noopWorker.metrics().fbmMessages
  ], ['HEARTBEAT_NOOP', ['heartbeat_request'], 0, 0]);

  const noTabWorker = workerHarness([
    { ok: true, request: { id: 'reserved-heartbeat', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}' } },
    { ok: true, code: 'TRANSPORT_RECORDED', request: null }
  ], []);
  const noTabResult = await noTabWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm khong co tab: Extension nop transport failure dung reservation va khong tu fetch FBM', [
    noTabResult.code, noTabWorker.relayCalls.map((item) => [item.body.kind, item.body.requestId || '', item.body.code || '']), noTabWorker.metrics().fbmMessages
  ], ['FBM_TAB_NOT_FOUND', [['heartbeat_request', '', ''], ['heartbeat_transport_failure', 'reserved-heartbeat', 'FBM_TAB_NOT_FOUND']], 0]);

  const autoOpenWorker = workerHarness([
    { ok: true, request: { id: 'open-heartbeat', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}', meta: { openFbmContext: { url: 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', active: false } } } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.14' }; }
    if (message.type === 'FBM_EXECUTE_V2') { return { result: { ok: true, status: 200, body: '{"d":{"TotalRowCount":12,"Rows":[]}}', transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } }; }
    return null;
  });
  const autoOpenResult = await autoOpenWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'GAS cap lenh mo tab: Extension chi mo dung URL duoc cap va moi gui request', [autoOpenResult.ok, autoOpenWorker.metrics().fbmTabQueries, autoOpenWorker.metrics().fbmTabCreates, autoOpenWorker.metrics().fbmMessages], [true, 1, 1, 2]);

  const rawHeartbeat = '{"d":{"TotalRowCount":12,"Rows":[]}}';
  const completeWorker = workerHarness([
    { ok: true, request: { id: 'heartbeat-envelope', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{"from":"gas"}' } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [{ id: 17 }], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.14' }; }
    if (message.type === 'FBM_EXECUTE_V2') {
      return { result: { ok: true, status: 200, body: rawHeartbeat, transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } };
    }
    return null;
  });
  const completeResult = await completeWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm co tab: GAS cap envelope truoc, Extension chuyen response tho ve GAS va dung khi request null', [
    completeResult.ok, completeWorker.relayCalls.map((item) => item.body.kind), completeWorker.relayCalls[1].body.response.body,
    completeWorker.metrics().fbmTabQueries, completeWorker.metrics().fbmMessages
  ], [true, ['heartbeat_request', 'heartbeat'], rawHeartbeat, 1, 2]);

  const readFlow = workflowGas();
  readFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {} });
  readFlow.hop.FbmSync.pullWrite = () => ({ ok: true, written: 0, conflicts: 0, skipped: 0 });
  readFlow.hop.FbmSync.markMissingAfterFullScan = () => ({ total: 0, written: 0 });
  let readStep = readFlow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  const readKinds = [];
  for (let hop = 0; readStep && readStep.request && hop < 12; hop += 1) {
    const request = readStep.request;
    readKinds.push(request.meta.kind + ':' + String(request.meta.entity || request.meta.field || ''));
    let body;
    if (request.meta.kind === 'authorize') { body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } }); }
    else if (request.meta.kind === 'completion') { body = JSON.stringify({ d: [['CODE', 'Tên danh mục']] }); }
    else {
      body = JSON.stringify({ d: {
        TotalRowCount: 0, Rows: [],
        ViewPage: { Fields: ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ngay_gd', 'datetime0', 'xorder'].map((AliasName) => ({ AliasName })) }
      } });
    }
    const throughExtension = await sendThroughExecutor(request, body);
    readStep = readFlow.hop.FbmSync.continue(executorRaw(throughExtension.reply, request.id));
  }
  check(so, 'read rong: pipeline di het session, lookup va Customer grid qua Extension roi ket thuc', [
    readKinds, readStep.ok, readStep.request || null, readStep.status.phase, readFlow.hop.FbmSync.stateRead().counts.succeeded
  ], [[
    'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH',
    'completion:@CAT_CONG_VIEC', 'completion:@CAT_SAN_PHAM', 'grid:customer'
  ], true, null, 'done', 0]);

  const approval = workflowGas();
  approval.hop.FbmSync.runPreflight = () => ({ ok: true, issues: [], blocking: [], candidateCount: 11 });
  const awaitingApproval = approval.hop.FbmSync.start({ mode: 'push', origin: 'manual', manual: true });
  const approved = approval.hop.fbmSyncApprovePush();
  check(so, 'push lon: GAS khong cap request truoc chap thuan, sau chap thuan moi cap authorize', [
    awaitingApproval.approvalRequired, awaitingApproval.request || null, awaitingApproval.status.phase,
    approved.ok, approved.request.meta.kind, approved.status.phase
  ], [true, null, 'awaiting_approval', true, 'authorize', 'checking_session']);

  const stopAfterResponse = workflowGas();
  const stopStarted = stopAfterResponse.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  const stopPending = stopAfterResponse.hop.fbmSyncCancel();
  const stopped = stopAfterResponse.hop.FbmSync.continue({
    ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'auth-customer' } }),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: stopStarted.request.id }] }
  });
  check(so, 'cancel request doc dang bay: nhan response de dong lat roi dung, khong cap authorize Activity', [
    stopPending.code, stopped.ok, stopped.request || null, stopped.status.phase, stopAfterResponse.hop.FbmSync.stateRead().cursor.kind
  ], ['SYNC_CANCEL_PENDING', true, null, 'paused', 'authorize_activity']);

  const masterOff = workflowGas();
  const masterStarted = masterOff.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  masterOff.hop.FbmSync.setMasterEnabled(false);
  const masterStopped = masterOff.hop.FbmSync.continue({
    ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'auth-customer' } }),
    transport: { trace: [{ stage: 'executor_response_sent', requestId: masterStarted.request.id }] }
  });
  check(so, 'master OFF request dang bay: chi chan envelope tiep theo va giu cursor de chan doan', [
    masterStopped.ok, masterStopped.request || null, masterStopped.status.phase, masterOff.hop.FbmSync.stateRead().cursor.kind
  ], [true, null, 'paused', 'authorize_activity']);

  const dto = workflowGas();
  const privateState = dto.hop.FbmSync.stateRead();
  privateState.session.cookie = 'private-cookie-FHN_CRM_App';
  privateState.session.customerAuthorized = 'private-authorized';
  privateState.metadata.lookups = { hidden: 'private-lookup' };
  privateState.locks = { 'customer:CUS-1': { owner: 'sync', oldValues: { hidden: 'private-old-value' } } };
  dto.hop.FbmSync.stateWrite(privateState);
  const publicStatus = dto.hop.FbmSync.statusView();
  check(so, 'DTO Sidebar: khong lo cookie, Authorized, lookup noi bo hay lock qua bien gioi UI', [
    JSON.stringify(publicStatus).indexOf('private-cookie') < 0,
    JSON.stringify(publicStatus).indexOf('private-authorized') < 0,
    JSON.stringify(publicStatus).indexOf('private-lookup') < 0,
    JSON.stringify(publicStatus).indexOf('private-old-value') < 0
  ], [true, true, true, true]);
  const logged = [];
  dto.hop.LOG_OK = 'ok'; dto.hop.LOG_ERROR = 'error'; dto.hop.LOG_CONFLICT = 'conflict';
  dto.hop.logEvent = (event) => logged.push(event); dto.hop.logTrace = (event) => logged.push(event);
  dto.hop.FbmSync.logStatus(Object.assign({}, publicStatus, { current: '', message: 'Lượt tổng hợp' }), 'workflow_summary');
  check(so, 'log tong hop: recordId rong va khong dua session noi bo vao detail', [
    logged.length, logged[0].recordId, JSON.stringify(logged[0]).indexOf('private-cookie') < 0, JSON.stringify(logged[0]).indexOf('private-authorized') < 0
  ], [1, '', true, true]);

  const disabled = workflowGas();
  disabled.hop.FbmSync.masterEnabled = () => false;
  const blocked = disabled.hop.FbmSync.start({ mode: 'read' });
  check(so, 'cong tac tong tat: GAS khong cap envelope FBM moi', [blocked.ok, blocked.code, blocked.request || null], [false, 'SYNC_DISABLED', null]);

  const stale = workflowGas();
  const staleStarted = stale.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const staleResult = stale.hop.FbmSync.continue({ ok: true, status: 200, body: userResponse, transport: { trace: [{ stage: 'executor_response_sent', requestId: 'old-request' }] } });
  check(so, 'response cu khong duoc phep mo bat ky buoc pipeline nao', [
    staleResult.ok, staleResult.code, stale.hop.FbmSync.stateRead().activeRequestId === staleStarted.request.id
  ], [false, 'STALE_RESPONSE', true]);

  const manualTransport = workflowGas();
  const manualStarted = manualTransport.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const transportFailure = manualTransport.hop.FbmSync.heartbeatTransportFailure({ requestId: manualStarted.request.id, code: 'FBM_TAB_NOT_FOUND', message: 'Không tìm thấy tab FBM đang mở.' });
  check(so, 'loi bridge thu cong: GAS chi ghi nhan loi dung reservation, ket thuc ro rang va khong cap request moi', [
    transportFailure.ok, transportFailure.code, transportFailure.request || null, transportFailure.status.phase,
    transportFailure.status.lastError, manualTransport.hop.FbmSync.stateRead().activeRequestId
  ], [false, 'FBM_TAB_NOT_FOUND', null, 'error', 'Không tìm thấy tab FBM đang mở.', '']);

  const cancelling = workflowGas();
  const cancellingStarted = cancelling.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const cancelPending = cancelling.hop.fbmSyncCancel();
  const cancelState = cancelling.hop.FbmSync.stateRead();
  check(so, 'dung khi request dang bay: chi danh dau cho response, khong xoa reservation hay cursor', [
    cancelPending.code, cancelState.activeRequestId === cancellingStarted.request.id, cancelState.cursor.kind, cancelState.metadata.cancelPending
  ], ['SYNC_CANCEL_PENDING', true, 'identity_user_grid', true]);
}

module.exports = { chay };
