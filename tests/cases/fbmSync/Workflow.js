/** Kiểm use case xuyên GAS -> Extension -> GAS theo hợp đồng tài liệu 09. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { WORKFLOWS, PIPELINE_CATALOG } = require('../../contracts/fbmSyncPipeline');
const { taoBoTest } = require('./Sidebar');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const WORKER = path.join(ROOT, '2_ShinCRM_Extension', 'background', 'service_worker.js');

function properties() {
  const data = {};
  return {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(data, key) ? data[key] : null; },
    setProperty(key, value) { data[key] = String(value); },
    deleteProperty(key) { delete data[key]; },
    getProperties() { return Object.assign({}, data); },
    data
  };
}

function workflowGas(options) {
  const opt = options || {};
  const documentProperties = opt.documentProperties || properties();
  const scriptProperties = opt.scriptProperties || properties();
  const hop = taoHopCat(Object.assign({
    FbmSync: {},
    DATA_SCHEMA: {},
    SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => documentProperties, getScriptProperties: () => scriptProperties },
    Utilities: { getUuid: () => 'workflow-uuid', newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') }) },
    shinOpenBook: () => ({ getId: () => 'sheet-workflow' }),
    logEvent: () => {},
    logTrace: () => {},
    runEntryPoint: (name, source, channel, fn) => fn()
  }, opt));
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    'fbm_sync/state/State.js',
    'fbm_sync/state/AccountSettings.js',
    'fbm_sync/control/ControlPort.js',
    'fbm_sync/state/Scheduler.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Pull.js',
    'fbm_sync/report/Report.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/auth/AutoLogin.js',
    'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js',
    'fbm_sync/transport/PullFlow.js',
    'fbm_sync/transport/EntryPoints.js',
    'server/service/FbmSyncService.js',
    'server/dev/FbmSyncStateProbe.js'
  , 'fbm_sync/write/SheetSave.js');
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-workflow';
  hop.FbmSync.configValue = () => '';
  hop.FbmSync.readLocal = opt.readLocal || (() => []);
  return { hop, documentProperties, scriptProperties };
}

function gridResponse(fields, rows, total) {
  return JSON.stringify({ d: {
    TotalRowCount: total === undefined ? rows.length : total,
    Rows: rows,
    ViewPage: { Fields: fields.map((AliasName) => ({ AliasName })) }
  } });
}

function row(fields, values) {
  const output = [];
  fields.forEach((field, index) => { output[index] = values[field] === undefined ? '' : values[field]; });
  return output;
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
  identityCheck.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const identityStarted = identityCheck.hop.FbmSync.start({ mode: 'check', scan: 'identity_check', origin: 'manual', manual: true });
  const identityProbe = await sendThroughExecutor(identityStarted.request, userResponse);
  const identityAfterProbe = identityCheck.hop.FbmSync.continue(executorRaw(identityProbe.reply, identityStarted.request.id));
  const identityAuthorized = await sendThroughExecutor(identityAfterProbe.request, JSON.stringify({ d: { Authorized: 'identity-auth' } }));
  const identityGridStep = identityCheck.hop.FbmSync.continue(executorRaw(identityAuthorized.reply, identityAfterProbe.request.id));
  const customerFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ngay_gd', 'datetime0', 'xorder'];
  const customerRow = customerFields.map((field) => field === 'stt_rec_kh' ? 'FBM-1' : field === 'ma_kh' ? 'ALT00010' : '');
  const identityGrid = await sendThroughExecutor(identityGridStep.request, JSON.stringify({ d: { TotalRowCount: 1, Rows: [customerRow], ViewPage: { Fields: customerFields.map((AliasName) => ({ AliasName })) } } }));
  const identityDone = identityCheck.hop.FbmSync.continue(executorRaw(identityGrid.reply, identityGridStep.request.id));
  check(so, 'kiem tra lien ket: chi quet Customer va tra tong hop n/N, khong cap Activity hoac ghi binding', [
    identityGridStep.request.meta.entity, identityDone.request || null, identityDone.status.phase,
    identityDone.status.metadata.identityCheck.total, identityDone.status.metadata.identityCheck.matched, identityDone.status.metadata.identityCheck.missing,
    identityCheck.documentProperties.getProperty('FBM_SYNC_BINDING_V1') === null
  ], ['customer', null, 'done', 1, 1, 0, false]);

  const loginFlow = workflowGas();
  loginFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  loginFlow.hop.FbmSync.loginConfigSave({ credentialRef: 'workflow-credential-ref', enabled: true, envelope: { version: 1, alg: 'AES-GCM', iv: '123456789012', ciphertext: 'ciphertext-long-enough' }, public: { usernameHint: 'ANHLT' } });
  const loginStarted = loginFlow.hop.FbmSync.loginTestRequest();
  const afterLogin = loginFlow.hop.FbmSync.loginTestResult({
    ok: true, status: 200, body: JSON.stringify({ d: true }),
    transport: { captures: { payloadCookie: '461020379855cFHN_CRM_App' }, trace: [{ stage: 'executor_response_sent', requestId: loginStarted.request.id }] }
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
  const wrongAfterLogin = wrongLogin.hop.FbmSync.loginTestResult({ ok: true, status: 200, body: JSON.stringify({ d: true }), transport: { captures: { payloadCookie: '461020379855cFHN_CRM_App' }, trace: [{ stage: 'executor_response_sent', requestId: wrongStart.request.id }] } });
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
  const batchLimitFlow = workflowGas();
  batchLimitFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {}, valid: {}, warnings: [] });
  batchLimitFlow.hop.FbmSync.start({ mode: 'read', origin: 'background', scan: 'detail', detail: { customersPerRun: 3 } });
  const batchState = batchLimitFlow.hop.FbmSync.stateRead();
  const firstBatchRequest = batchLimitFlow.hop.FbmSync.beginCustomerPull(batchLimitFlow.hop.FbmSync.stateRead());
  const batchRows = [1, 2, 3].map((index) => ({ ngay_gd: '2026-09-16', datetime0: String(index), xorder: String(index), stt_rec_kh: 'CUS-' + index }));
  const secondBatchRequest = batchLimitFlow.hop.FbmSync.customerNext(batchLimitFlow.hop.FbmSync.stateRead(), batchRows, 10);
  const batchCursor = batchLimitFlow.hop.FbmSync.detailCursorRead();
  check(so, 'Số Customer mỗi lượt = 3 được áp dụng và cursor đến Customer thứ 4', [batchState.detailCustomerLimit, firstBatchRequest.body.count, secondBatchRequest, batchCursor.pageIndex, batchCursor.pageValue[2]], [3, 3, null, 0, '3']);
  const compactLookupFlow = workflowGas();
  const compactLookupNames = {}, compactLookupMap = {}, compactLookupValid = {}, compactLookupAllNames = {};
  const liveCategoryCounts = [63, 11, 12, 17];
  compactLookupFlow.hop.FbmSync.SYNC_LOOKUPS.forEach((item, index) => {
    compactLookupNames[item.key] = {};
    compactLookupValid[item.key] = {};
    for (let categoryIndex = 0; categoryIndex < liveCategoryCounts[index]; categoryIndex += 1) {
      const code = categoryIndex === 0 ? 'CODE-' + index : 'LIVE-' + index + '-' + categoryIndex;
      const name = 'Tên danh mục live ' + index + ' ' + categoryIndex + ' có tên đủ dài';
      const value = 'Giá trị Sheet ' + index + ' ' + categoryIndex;
      compactLookupNames[item.key][code] = name;
      compactLookupValid[item.key][code] = true;
      compactLookupValid[item.key][value] = true;
      compactLookupMap[item.key + '\u001f' + value] = code;
      compactLookupAllNames[code] = name;
    }
  });
  compactLookupFlow.hop.FbmSync.readCategoryGate = () => ({ map: compactLookupMap, names: compactLookupAllNames, namesBySource: compactLookupNames, valid: compactLookupValid, warnings: [] });
  compactLookupFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  compactLookupFlow.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  compactLookupFlow.hop.FbmSync.start({ mode: 'read', origin: 'manual', scan: 'full' });
  const compactContinue = (body) => {
    const requestId = compactLookupFlow.hop.FbmSync.stateRead().activeRequestId;
    return compactLookupFlow.hop.FbmSync.continue({ ok: true, status: 200, body: JSON.stringify(body), transport: { trace: [{ stage: 'executor_response_sent', requestId }] } });
  };
  compactContinue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
  compactContinue({ d: { Authorized: 'customer-auth' } });
  compactContinue({ d: { Authorized: 'activity-auth' } });
  let compactLast = null;
  let compactPairValue = '';
  compactLookupFlow.hop.FbmSync.SYNC_LOOKUPS.forEach((item, index) => {
    const rows = Object.keys(compactLookupNames[item.key]).map((code) => [code, compactLookupNames[item.key][code]]);
    rows.push(...Array.from({ length: 700 }, (_, rowIndex) => ['NOISE-' + index + '-' + rowIndex, 'Tên dài để mô phỏng danh mục lớn']));
    compactLast = compactContinue({ d: { TotalRowCount: rows.length, Rows: rows } });
    if (index === 0) { const lookup = compactLookupFlow.hop.FbmSync.stateRead().session.lookups['@CAT_TINH_THANH']; compactPairValue = lookup && lookup.pairs && lookup.pairs['CODE-0']; }
  });
  const compactState = compactLookupFlow.hop.FbmSync.stateRead();
  const compactStateBytes = Buffer.byteLength(JSON.stringify(compactState), 'utf8');
  check(so, 'lookup lớn chỉ giữ cặp Category cần dùng, không làm đầy DocumentProperties', [
    compactLast.request && compactLast.request.meta.kind,
    compactStateBytes < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    compactPairValue,
    JSON.stringify(compactState).indexOf('NOISE-') < 0,
    compactState.metadata.categoryGate && compactState.metadata.categoryGate.valid,
    compactState.metadata.categoryGate && compactState.metadata.categoryGate.names,
    compactState.metadata.categoryGate && Object.keys(compactState.metadata.categoryGate.map || {}).length,
    compactState.metadata.categoryGate && Object.keys(compactState.metadata.categoryGate.codesBySource || {}).length,
    Object.keys(compactState.session.lookups || {}).length,
    compactState.metadata.categoryGate && compactLookupFlow.hop.FbmSync.categoryValueAllowed(compactState.metadata.categoryGate, '@CAT_TINH_THANH', 'CODE-0')
  ], ['grid', true, 'Tên danh mục live 0 0 có tên đủ dài', true, undefined, undefined, 103, 4, 0, { ok: true, code: 'CODE-0' }]);
  const pushState = compactLookupFlow.hop.FbmSync.stateRead();
  pushState.metadata.categoryGate = compactLookupFlow.hop.FbmSync.categoryGateForState(compactLookupFlow.hop.FbmSync.readCategoryGate());
  pushState.metadata.categoryBlocks = [];
  pushState.metadata.categoryLookupFailed = false;
  compactLookupFlow.hop.FbmSync.previewRecords(pushState, 'activity', [{ customerId: 'CUS-1', workDate: '2026-09-20', taskType: 'GD', content: 'x'.repeat(4000) }]);
  pushState.mode = 'write'; pushState.phase = 'push'; pushState.entity = 'activity'; pushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  compactLookupFlow.hop.FbmSync.stateWrite(pushState);
  compactLookupFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-QUOTA', position: 0, record: { id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', taskType: 'CODE-3', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', allowFbmPush: 'Cho phép', fbmHash: 'old' } }];
  compactLookupFlow.hop.FbmSync.pushConfigErrors = () => '';
  compactLookupFlow.hop.FbmSync.pushOwnerError = () => '';
  compactLookupFlow.hop.FbmSync.validatePushCategories = () => [];
  compactLookupFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  compactLookupFlow.hop.FbmSync.isRecordLocked = () => false;
  compactLookupFlow.hop.FbmSync.lockRecord = () => pushState;
  compactLookupFlow.hop.writeGateSave = () => ({ ok: true });
  compactLookupFlow.hop.FbmSync.stopPushOnConflicts = () => false;
  compactLookupFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  const pushRequest = compactLookupFlow.hop.FbmSync.nextPushRequest(pushState);
  const pushWaitState = compactLookupFlow.hop.FbmSync.stateRead();
  const pushRawState = compactLookupFlow.documentProperties.data.FBM_SYNC_STATE_V1 || '';
  let pushRawParsed = null; try { pushRawParsed = JSON.parse(pushRawState); } catch (ignorePushRaw) {}
  check(so, 'state push không lưu preview Activity dài hoặc payload candidate', [
    Buffer.byteLength(JSON.stringify(pushWaitState), 'utf8') < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    pushWaitState.cursor.kind,
    pushWaitState.cursor.candidate && Object.prototype.hasOwnProperty.call(pushWaitState.cursor.candidate, 'categoryGate'),
    pushWaitState.cursor.candidate && Object.prototype.hasOwnProperty.call(pushWaitState.cursor.candidate, 'record'),
    pushWaitState.metadata.preview.activities[0].content.length,
    String(pushRawState).indexOf('x'.repeat(4000)),
    pushWaitState.metadata.categoryGate && Object.keys(pushWaitState.metadata.categoryGate.map || {}).length,
    pushState.cursor.kind,
    pushRequest && pushRequest.meta && pushRequest.meta.kind,
    pushRawState.length,
    pushRawParsed && pushRawParsed.cursor && pushRawParsed.cursor.kind
  ], [true, 'push_wait', false, false, 163, -1, 103, 'push_wait', 'activity_edit_open', pushRawState.length, 'push_wait']);
  check(so, 'state push raw size remains below quota after candidate compact', Buffer.byteLength(pushRawState, 'utf8') < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT, true);
  compactLookupFlow.hop.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', content: 'x'.repeat(4000), customerId: 'CUS-1' }]
    : [{ id: 'CUS-1', fbmId: 'FBM-CUS-1', fbmCustomerCode: 'ALT00001' }];
  const hydratedCandidate = compactLookupFlow.hop.FbmSync.hydratePushCandidate(pushWaitState.cursor.candidate);
  check(so, 'candidate compact được dựng lại từ Sheet trước bước push tiếp theo', [hydratedCandidate.record.content.length, hydratedCandidate.record.customerFbmCode, hydratedCandidate.record.stt_rec], [4000, 'ALT00001', 'FBM-CUS-1']);
  const createCursor = { operation: 'customer_create_open', entity: 'customer', candidate: { kind: 'create', id: 'CUS-COMPACT', entity: 'customer' } };
  const createState = compactLookupFlow.hop.FbmSync.stateRead(); createState.cursor = createCursor; createState.metadata.categoryGate = { map: {}, codesBySource: {}, blocked: {} };
  compactLookupFlow.hop.FbmSync.customerCreateRequest = () => ({ url: 'https://example.test', meta: { kind: 'customer_create_save' } });
  compactLookupFlow.hop.FbmSync.extractAutoCustomerCode = () => 'ALT00099';
  compactLookupFlow.hop.FbmSync.validateAutoCustomerCode = () => ({ ok: true });
  compactLookupFlow.hop.FbmSync.continuePush(createState, { d: { ClientScript: "_ma_kh_auto = 'ALT00099';" } });
  check(so, 'candidate compact giữ mã Customer tự sinh cho nhánh khôi phục', compactLookupFlow.hop.FbmSync.stateRead().cursor.candidate.autoCode, 'ALT00099');
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_STATE_V1', pushRawState);
  const previewOverflow = compactLookupFlow.hop.FbmSync.stateRead();
  previewOverflow.metadata.preview = { customers: Array.from({ length: 50 }, () => ({ code: 'C', name: 'N'.repeat(160), fbmId: 'F' })), activities: Array.from({ length: 50 }, () => ({ customerCode: 'C', date: '2026', type: 'GD', content: 'A'.repeat(160) })), truncated: false };
  compactLookupFlow.hop.FbmSync.stateWrite(previewOverflow);
  const compactPreviewState = compactLookupFlow.hop.FbmSync.stateRead();
  check(so, 'preview quá lớn tự cắt và giữ state nghiệp vụ trong quota', [compactPreviewState.metadata.preview.truncated, Buffer.byteLength(compactLookupFlow.documentProperties.data.FBM_SYNC_STATE_V1, 'utf8') <= compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT], [true, true]);
  const probeState = compactLookupFlow.hop.FbmSync.stateRead();
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_PENDING_PUSHES_V1', 'x'.repeat(42));
  const probe = compactLookupFlow.hop.fbmSyncStateProbe();
  check(so, 'probe state chỉ trả kích thước từng nhánh, không trả payload', [
    probe.ok, probe.state.parseOk, probe.state.cursorKind, probe.state.cursorCandidateCategoryGateBytes,
    probe.state.metadataCategoryGateBytes > 0, probe.state.branchBytes.metadata > 0, probe.state.sessionLookupsBytes, Array.isArray(probe.extensionResponses), probe.largestProperties[0].key,
    JSON.stringify(probe).indexOf('ACT-QUOTA') < 0
  ], [true, true, 'push_wait', 0, true, true, 2, true, 'FBM_SYNC_STATE_V1', true]);
  const orderFlow = workflowGas();
  const orderState = orderFlow.hop.FbmSync.stateStart('', 'push', 0);
  orderState.mode = 'write'; orderState.phase = 'push'; orderState.entity = 'activity'; orderState.metadata.categoryGate = { map: {}, codesBySource: {}, blocked: {} };
  orderState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  orderFlow.hop.FbmSync.stateWrite(orderState);
  orderFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-ORDER', position: 0, record: { id: 'ACT-ORDER', fbmId: 'FBM-ACT-ORDER', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', allowFbmPush: 'Cho phép', fbmHash: 'old' } }];
  orderFlow.hop.FbmSync.pushConfigErrors = () => '';
  orderFlow.hop.FbmSync.pushOwnerError = () => '';
  orderFlow.hop.FbmSync.validatePushCategories = () => [];
  orderFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  orderFlow.hop.FbmSync.isRecordLocked = () => false;
  orderFlow.hop.FbmSync.lockRecord = () => orderState;
  orderFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  let orderSheetWrites = 0;
  orderFlow.hop.writeGateSave = () => { orderSheetWrites += 1; return { ok: true }; };
  const orderStateWrite = orderFlow.hop.FbmSync.stateWrite;
  let orderWriteCount = 0;
  orderFlow.hop.FbmSync.stateWrite = (state) => { orderWriteCount += 1; if (orderWriteCount === 1) { const error = new Error('quota'); error.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA'; throw error; } return orderStateWrite(state); };
  let orderError = null;
  try { orderFlow.hop.FbmSync.nextPushRequest(orderState); } catch (error) { orderError = error; }
  check(so, 'state push được chốt trước khi đánh dấu Sheet đang đẩy', [orderError && orderError.code, orderSheetWrites, orderFlow.hop.FbmSync.stateRead().cursor.kind], ['FBM_DOCUMENT_PROPERTIES_QUOTA', 0, 'push_scan']);
  // FBM-002: không ghi được `đang đẩy` xuống Sheet thì không phát lệnh ghi FBM.
  const pushingFlow = workflowGas();
  const pushingState = pushingFlow.hop.FbmSync.stateStart('', 'push', 0);
  pushingState.mode = 'write'; pushingState.phase = 'push'; pushingState.entity = 'activity'; pushingState.metadata.categoryGate = { map: {}, codesBySource: {}, blocked: {} };
  pushingState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  pushingFlow.hop.FbmSync.stateWrite(pushingState);
  ['pushConfigErrors', 'pushOwnerError'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => ''; });
  ['validatePushCategories', 'pushEligibilityErrors'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => []; });
  pushingFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-PUSHING', position: 0, record: { id: 'ACT-PUSHING', fbmId: 'FBM-ACT-PUSHING', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', allowFbmPush: 'Cho phép', fbmHash: 'old' } }];
  pushingFlow.hop.FbmSync.isRecordLocked = () => false;
  pushingFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  pushingFlow.hop.writeGateSave = () => ({ ok: false, invalid: [{ id: 'ACT-PUSHING', field: 'syncStatus', label: 'Trạng thái đồng bộ', reason: 'Giá trị không hợp lệ.' }] });
  let pushingRequest = 'chưa gọi', pushingError = null;
  try { pushingRequest = pushingFlow.hop.FbmSync.nextPushRequest(pushingFlow.hop.FbmSync.stateRead()); } catch (error) { pushingError = error; }
  check(so, 'không ghi được trạng thái "đang đẩy" thì không phát lệnh ghi FBM và báo lỗi có tên bản ghi',
    [pushingError && pushingError.code, pushingRequest, /ACT-PUSHING/.test(pushingError && pushingError.message)],
    ['FBM_SHEET_WRITE_FAILED', 'chưa gọi', true]);
  ['markPushError', 'markPushSkipped'].forEach((name) => {
    let markError = null;
    const candidate = { kind: 'edit', entity: 'activity', id: 'ACT-MARK', record: { id: 'ACT-MARK' } };
    try {
      if (name === 'markPushError') { pushingFlow.hop.FbmSync.markPushError(pushingFlow.hop.FbmSync.stateRead(), candidate, { reason: 'FBM từ chối', code: 'FBM_ERROR' }, 'activity_edit'); }
      else { pushingFlow.hop.FbmSync.markPushSkipped(pushingFlow.hop.FbmSync.stateRead(), candidate, 'bỏ qua', 'Chưa đủ điều kiện'); }
    } catch (error) { markError = error; }
    check(so, name + ': không ghi được trạng thái bản ghi xuống Sheet thì ném lỗi để phiên dừng, không đi tiếp như đã ghi (FBM-001)', markError && markError.code, 'FBM_SHEET_WRITE_FAILED');
  });
  const htmlFailureFlow = workflowGas();
  const htmlLogs = [];
  htmlFailureFlow.hop.LOG_OK = 'ok'; htmlFailureFlow.hop.LOG_ERROR = 'error'; htmlFailureFlow.hop.LOG_CONFLICT = 'conflict';
  htmlFailureFlow.hop.logEvent = (event) => htmlLogs.push(event);
  htmlFailureFlow.hop.logTrace = () => {};
  const htmlStarted = htmlFailureFlow.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  let htmlResult = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const requestId = htmlFailureFlow.hop.FbmSync.stateRead().activeRequestId;
    htmlResult = htmlFailureFlow.hop.FbmSync.continue({ ok: true, status: 200, body: '<html><h1>500 Internal Server Error</h1></html>', transport: { trace: [{ stage: 'executor_response_sent', requestId }] } });
    if (!htmlResult.request) { break; }
  }
  const htmlState = htmlFailureFlow.hop.FbmSync.stateRead();
  check(so, 'HTML lỗi qua continuation bị fail-closed, giữ cursor và ghi Log lỗi', [htmlStarted.request.meta.kind, htmlResult.ok, htmlResult.request || null, htmlState.phase, htmlState.lastFailureCode, htmlState.cursor.kind, htmlLogs.length, htmlLogs[0] && htmlLogs[0].action], ['identity_user_grid', false, null, 'error', 'PARSE_ERROR', 'identity_user_grid', 1, 'business_request_failed']);
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

  const deadlineLogs = [];
  const deadlineFlow = workflowGas({ logEvent: (event) => deadlineLogs.push(event), LOG_ERROR: 'error' });
  deadlineFlow.hop.FbmSync.statePatch({ runId: 'runtime-limit', phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 4, pageValue: ['2026-09-20', 'CUS-000004'] }, activeRequestId: '', deadlineAt: Date.now() - 1 });
  const blockedByDeadline = deadlineFlow.hop.FbmSync.nextEnvelope(deadlineFlow.hop.FbmSync.customerGridRequest({ type: 1, count: 3, gridPageIndex: 5, gridRefresh: false }));
  const deadlineState = deadlineFlow.hop.FbmSync.stateRead();
  const deadlineStatus = deadlineFlow.hop.FbmSync.statusView();
  deadlineFlow.hop.FbmSync.logStatus(deadlineStatus, 'runtime_limit');
  const deadlineLog = deadlineLogs[deadlineLogs.length - 1] || {};
  const deadlineUi = taoBoTest();
  deadlineUi.hop.fbmSyncPaint(deadlineStatus);
  check(so, 'lát GAS chạm trần dừng trước request kế tiếp, DTO Sidebar và Log giữ runId/phase/cursor', [
    blockedByDeadline, deadlineState.phase, deadlineState.lastFailureCode, deadlineState.cursor.pageIndex, deadlineState.activeRequestId,
    deadlineLog.action, deadlineLog.detail && deadlineLog.detail.runId, deadlineLog.detail && deadlineLog.detail.phase, deadlineLog.detail && deadlineLog.detail.cursor,
    deadlineUi.content.textContent.indexOf('Tạm dừng') >= 0
  ], [null, 'paused', 'GAS_RUNTIME_LIMIT', 4, '', 'runtime_limit', 'runtime-limit', 'paused', 'customer_grid', true]);

  const quotaData = {}, quotaLogs = [];
  let quotaFull = false;
  const quotaProperties = {
    getProperty(key) { return Object.prototype.hasOwnProperty.call(quotaData, key) ? quotaData[key] : null; },
    setProperty(key, value) { if (quotaFull) { throw new Error('DocumentProperties quota exceeded'); } quotaData[key] = String(value); },
    deleteProperty(key) { delete quotaData[key]; }
  };
  const quotaFlow = workflowGas({ documentProperties: quotaProperties, logEvent: (event) => quotaLogs.push(event), LOG_ERROR: 'error' });
  quotaFlow.hop.FbmSync.statePatch({ runId: 'quota-run', phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 7, pageValue: ['2026-09-20', 'CUS-000007'] }, metadata: {}, locks: { 'customer:CUS-LOCK': { owner: 'sync', revision: 'r7' } } });
  quotaFull = true;
  const quotaResult = quotaFlow.hop.FbmSync.controlDispatchLocked('cancel', {});
  const quotaLog = quotaLogs.filter((item) => item.reason === 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED').slice(-1)[0] || quotaLogs.filter((item) => item.reason === 'FBM_DOCUMENT_PROPERTIES_QUOTA').slice(-1)[0] || {};
  const quotaUi = taoBoTest();
  quotaUi.hop.fbmSyncPaint(quotaResult.status);
  check(so, 'DocumentProperties đầy trả DTO lỗi Sidebar, giữ cursor và Log runId/phase/cursor', [
    quotaResult.ok, quotaResult.code, quotaResult.status && quotaResult.status.runId, quotaResult.status && quotaResult.status.phase,
    quotaResult.status && quotaResult.status.cursor && quotaResult.status.cursor.kind, quotaLog.detail && quotaLog.detail.runId,
    quotaLog.detail && quotaLog.detail.phase, quotaLog.detail && quotaLog.detail.cursor && quotaLog.detail.cursor.kind,
    quotaUi.content.textContent.indexOf('DocumentProperties') >= 0 || quotaUi.content.textContent.indexOf('lưu trạng thái') >= 0
  ], [false, 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', 'quota-run', 'error', 'customer_grid', 'quota-run', 'pull_customer', 'customer_grid', true]);

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
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.19' }; }
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
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.19' }; }
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

  const fullLogs = [], fullWrites = [], fullLocal = { customer: [], activity: [] };
  const fullFlow = workflowGas({
    logEvent: (event) => fullLogs.push(event),
    LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
    readLocal: (entity) => fullLocal[entity].map((item) => Object.assign({}, item)),
    writeGateSave: (request) => {
      fullWrites.push(request);
      const entity = request.entity;
      (request.records || []).forEach((patch) => {
        let index = fullLocal[entity].findIndex((item) => String(item.id || '') === String(patch.id || ''));
        if (index < 0) {
          index = fullLocal[entity].length;
          const prefix = entity === 'customer' ? 'CUS-' : 'ACT-';
          fullLocal[entity].push(Object.assign({}, patch, { id: patch.id || prefix + String(index + 1).padStart(6, '0') }));
        } else {
          fullLocal[entity][index] = Object.assign({}, fullLocal[entity][index], patch);
        }
      });
      const fields = fullLocal[entity].length ? Object.keys(fullLocal[entity][0]) : [];
      return { ok: true, fields, rows: fullLocal[entity].map((record) => fields.map((field) => record[field])) };
    }
  });
  fullFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [] });
  fullFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  const fullCustomerFields = fullFlow.hop.FbmSync.GRID_FIELDS.customer;
  const fullActivityFields = fullFlow.hop.FbmSync.GRID_FIELDS.activity;
  const customerRows = [
    row(fullCustomerFields, { stt_rec_kh: 'FBM-C1', ma_kh: 'ALT00001', ten_kh: 'Cong ty 1', ma_so_thue: '010001', ong_ba: 'A', dc_lh: 'Ha Noi', dien_thoai: '0901', email: 'c1@example.test', ngay_gd: '2026-09-20', datetime0: '2026-09-20T01:00:00', xorder: 1 }),
    row(fullCustomerFields, { stt_rec_kh: 'FBM-C2', ma_kh: 'ALT00002', ten_kh: 'Cong ty 2', ma_so_thue: '010002', ong_ba: 'B', dc_lh: 'Ha Noi', dien_thoai: '0902', email: 'c2@example.test', ngay_gd: '2026-09-20', datetime0: '2026-09-20T02:00:00', xorder: 2 })
  ];
  const activityRows = {
    'FBM-C1': [row(fullActivityFields, { id: 'FBM-A1', details: 'Goi dien 1', end_date: '2026-09-20', owner: 'Owner 1', datetime0: '2026-09-20T03:00:00', line_nbr: 1 })],
    'FBM-C2': [row(fullActivityFields, { id: 'FBM-A2', details: 'Goi dien 2', end_date: '2026-09-20', owner: 'Owner 2', datetime0: '2026-09-20T04:00:00', line_nbr: 1 })]
  };
  fullFlow.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  let fullStep = fullFlow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  const fullKinds = [], fullStatuses = [];
  for (let hop = 0; fullStep && fullStep.request && hop < 20; hop += 1) {
    const request = fullStep.request;
    const kind = String(request.meta && request.meta.kind || '');
    fullKinds.push(kind + ':' + String(request.meta && (request.meta.entity || request.meta.field) || ''));
    let body;
    if (kind === 'session_probe' || kind === 'identity_user_grid') {
      body = userResponse;
    } else if (kind === 'authorize') {
      body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } });
    } else if (kind === 'completion') {
      body = JSON.stringify({ d: [['CODE', 'Ten danh muc']] });
    } else if (kind === 'grid' && request.meta.entity === 'customer') {
      body = gridResponse(fullCustomerFields, customerRows, customerRows.length);
    } else if (kind === 'grid' && request.meta.entity === 'activity') {
      const key = request.body.externalKey && request.body.externalKey[0] && request.body.externalKey[0].Value;
      body = gridResponse(fullActivityFields, activityRows[key] || [], (activityRows[key] || []).length);
    } else {
      throw new Error('Ca mô phỏng pipeline gặp request không mong đợi: ' + kind);
    }
    const throughExtension = await sendThroughExecutor(request, body);
    const before = fullFlow.hop.FbmSync.statusView();
    fullStep = fullFlow.hop.FbmSync.continue(executorRaw(throughExtension.reply, request.id));
    fullStatuses.push(fullStep.status);
    if (fullStep.status && fullFlow.hop.FbmSync.shouldLogStatus(before, fullStep.status)) {
      fullFlow.hop.FbmSync.logStatus(fullStep.status, 'slice');
    }
  }
  const fullFinal = fullFlow.hop.FbmSync.statusView();
  const fullSummaryLog = fullLogs.filter((item) => item.action === 'slice' && item.detail && item.detail.phase === 'done').slice(-1)[0] || {};
  const ui = taoBoTest();
  ui.hop.fbmSyncPaint(fullFinal);
  check(so, 'pipeline giả lập Customer + Activity đi qua GAS, Extension, cửa ghi và kết thúc; bản ghi thành công không sinh dòng Log theo bản ghi', [
    fullStep.ok, fullStep.request || null, fullFinal.phase, fullLocal.customer.length, fullLocal.activity.length,
    fullWrites.filter((item) => item.source === 'pull').length, fullKinds,
    fullLogs.filter((item) => /_record/.test(String(item.action || ''))).length,
    fullSummaryLog.detail && fullSummaryLog.detail.runId === fullFinal.runId, fullSummaryLog.detail && fullSummaryLog.detail.counts && fullSummaryLog.detail.counts.succeeded,
    ui.content.textContent.indexOf('Hoàn tất') >= 0
  ], [
    true, null, 'done', 2, 2, 3,
     ['session_probe:user', 'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH', 'completion:@CAT_CONG_VIEC', 'completion:@CAT_SAN_PHAM', 'grid:customer', 'grid:activity', 'grid:activity'],
    0, true, 4, true
  ]);

  const readFlow = workflowGas();
  readFlow.hop.FbmSync.prepareCategoryGate = () => ({ map: {} });
  readFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  readFlow.hop.FbmSync.pullWrite = () => ({ ok: true, written: 0, conflicts: 0, skipped: 0 });
  readFlow.hop.FbmSync.markMissingAfterFullScan = () => ({ total: 0, written: 0 });
  readFlow.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  let readStep = readFlow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  const readKinds = [];
  for (let hop = 0; readStep && readStep.request && hop < 12; hop += 1) {
    const request = readStep.request;
    readKinds.push(request.meta.kind + ':' + String(request.meta.entity || request.meta.field || ''));
    let body;
    if (request.meta.kind === 'session_probe') { body = userResponse; }
    else if (request.meta.kind === 'authorize') { body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } }); }
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
  check(so, 'phiên rỗng: Extension chỉ chuyển request đọc, không phát request ghi hoặc xóa và pipeline kết thúc', [
    readKinds, readKinds.length, readKinds.every((kind) => ['session_probe:user', 'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH', 'completion:@CAT_CONG_VIEC', 'completion:@CAT_SAN_PHAM', 'grid:customer'].indexOf(kind) >= 0), readStep.ok, readStep.request || null, readStep.status.phase, readFlow.hop.FbmSync.stateRead().counts.succeeded
  ], [[
     'session_probe:user', 'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH',
    'completion:@CAT_CONG_VIEC', 'completion:@CAT_SAN_PHAM', 'grid:customer'
  ], 8, true, true, null, 'done', 0]);

  const approval = workflowGas();
  approval.hop.FbmSync.runPreflight = () => ({ ok: true, issues: [], blocking: [], candidateCount: 11 });
  const awaitingApproval = approval.hop.FbmSync.start({ mode: 'push', origin: 'manual', manual: true });
  const approved = approval.hop.fbmSyncApprovePush();
  check(so, 'push lon: GAS khong cap request truoc chap thuan, sau chap thuan moi cap authorize', [
    awaitingApproval.approvalRequired, awaitingApproval.request || null, awaitingApproval.status.phase,
    approved.ok, approved.request.meta.kind, approved.status.phase
  ], [true, null, 'awaiting_approval', true, 'session_probe', 'checking_session']);

  const stopAfterResponse = workflowGas();
  stopAfterResponse.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  stopAfterResponse.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const stopStarted = stopAfterResponse.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  const stopPending = stopAfterResponse.hop.fbmSyncCancel();
  const stopped = stopAfterResponse.hop.FbmSync.continue({
    ok: true, status: 200, body: userResponse,
    transport: { trace: [{ stage: 'executor_response_sent', requestId: stopStarted.request.id }] }
  });
  check(so, 'cancel request doc dang bay: nhan response de dong lat roi dung, khong cap authorize Activity', [
    stopPending.code, stopped.ok, stopped.request || null, stopped.status.phase, stopAfterResponse.hop.FbmSync.stateRead().cursor.kind
  ], ['SYNC_CANCEL_PENDING', true, null, 'paused', 'authorize_customer']);

  const masterOff = workflowGas();
  masterOff.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
  masterOff.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
  const masterStarted = masterOff.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true });
  masterOff.hop.FbmSync.setMasterEnabled(false);
  const masterStopped = masterOff.hop.FbmSync.continue({
    ok: true, status: 200, body: userResponse,
    transport: { trace: [{ stage: 'executor_response_sent', requestId: masterStarted.request.id }] }
  });
  check(so, 'master OFF request dang bay: chi chan envelope tiep theo va giu cursor de chan doan', [
    masterStopped.ok, masterStopped.request || null, masterStopped.status.phase, masterOff.hop.FbmSync.stateRead().cursor.kind
  ], [true, null, 'paused', 'authorize_customer']);

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

  const reloaded = workflowGas();
  const orphan = reloaded.hop.FbmSync.stateRead();
  orphan.runId = 'cancelled-orphan'; orphan.phase = 'checking_session'; orphan.cursor = { kind: 'identity_user_grid' };
  orphan.activeRequestId = 'orphan-request'; orphan.metadata.cancelPending = true;
  orphan.updatedAt = Date.now() - reloaded.hop.FbmSync.STALE_RUN_MS - 1;
  orphan.lastProgressAt = orphan.updatedAt;
  reloaded.hop.FbmSync.stateWrite(orphan);
  reloaded.documentProperties.setProperty(reloaded.hop.FbmSync.STATE_KEY, JSON.stringify(orphan));
  const reloadedStatus = reloaded.hop.fbmGetSyncStatus();
  check(so, 'reload sau khi callback dừng bị mất thu hồi phiên treo và không còn nút Dừng đồng bộ', [
    reloadedStatus.phase, reloadedStatus.lastFailureCode, reloadedStatus.runId, reloaded.hop.FbmSync.stateRead().activeRequestId
  ], ['error', 'SYNC_STALE_RUN', 'cancelled-orphan', 'orphan-request']);
}

module.exports = { chay };
