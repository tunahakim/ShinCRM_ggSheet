/** Kiểm use case xuyên GAS -> Extension -> GAS theo hợp đồng tài liệu 09. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { WORKFLOWS, PIPELINE_CATALOG } = require('../../contracts/fbmSyncPipeline');
const { taoBoTest } = require('./Sidebar');
const MA_HOP_DONG = require('../../contracts/gasExtensionContract').extensionContractVersion();

const ROOT = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const WORKER = path.join(ROOT, '2_ShinCRM_Extension', 'background', 'service_worker.js');

/**
 * Trần số lần gọi kho DocumentProperties của một lát Activity sau đợt 1 bước A: nạp cả kho trước khóa, nạp lại trong khóa, ghi gộp, ghi trace (đo 2026-10-07 trước refactor: 83).
 * Lát kết thúc lượt được cộng thêm số lần xóa dấu "đã thấy", vì kho Google không có lệnh xóa nhiều khóa một lần.
 */
const FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX = 5;
const FBM_SEEN_STORE_RESET_DELETES = 8;

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
    LOG_OK: 'ok', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
    logEvent: () => {},
    logTrace: () => {},
    runEntryPoint: (name, source, channel, fn) => fn()
  }, opt));
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js',
    'fbm_sync/state/AccountSettings.js',
    'fbm_sync/control/ControlPort.js',
    'fbm_sync/state/Scheduler.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/Conflict.js',
    'fbm_sync/report/Report.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/auth/AutoLogin.js',
    'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js',
    'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js',
    'fbm_sync/transport/EntryPoints.js',
    'server/service/FbmSyncService.js',
    'server/dev/FbmSyncStateProbe.js'
  , 'fbm_sync/write/SheetSave.js', ...(opt.extraFiles || []));
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-workflow';
  hop.FbmSync.configValue = () => '';
  // `readLocal: 'sheet'` giữ readLocal thật (đi qua bản chụp Sheet) để đếm số lần đọc Sheet.
  if (opt.readLocal !== 'sheet') { hop.FbmSync.readLocal = opt.readLocal || (() => []); }
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

/** Một tab FBM giả: executor thật chạy trong một context giữ nguyên giữa các request, nên RAM việc quét còn đến khi gọi `reload()`. */
function executorSession() {
  let listener = null, responseBody = '', fetches = 0, sent = null;
  const source = fs.readFileSync(EXECUTOR, 'utf8');
  const load = () => {
    listener = null;
    const context = {
      console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
      Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
      document: { documentElement: { innerHTML: '<script>var payload={"cookie":"safeFHN_CRM_App"};</script>', textContent: '' } },
      fetch(url, options) {
        fetches += 1;
        sent = { url: String(url), body: options && options.body };
        return Promise.resolve(fbmResponse(responseBody));
      },
      chrome: { runtime: { onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
    };
    vm.createContext(context);
    vm.runInContext(source, context, { filename: EXECUTOR });
  };
  load();
  return {
    reload: load,
    fetches: () => fetches,
    send(request, body) {
      responseBody = body; sent = null;
      return new Promise((resolve, reject) => {
        if (!listener) { reject(new Error('Executor không đăng ký kênh FBM_EXECUTE_V2.')); return; }
        listener({ type: 'FBM_EXECUTE_V2', request }, null, (reply) => resolve({ reply, sent }));
      });
    }
  };
}

function sendThroughExecutor(request, responseBody) {
  return executorSession().send(request, responseBody);
}

function executorRaw(reply, requestId) {
  const result = reply && reply.result || {};
  return {
    ok: result.ok === true,
    status: Number(result.status || 0),
    body: String(result.body || ''),
    job: result.job,
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: String(requestId) }] }
  };
}

/** Chạy lô như service worker: từng phần tử qua executor thật với hạn fetch của lô; `itemReply` trả `{ body }` hoặc `{ raw }` để giả lỗi HTTP một khách. */
async function sendBatchThroughExecutor(envelope, itemReply) {
  const items = [];
  for (const item of envelope.items) {
    const reply = itemReply(item);
    if (reply.raw) { items.push(Object.assign({ id: item.id }, reply.raw)); continue; }
    const result = (await sendThroughExecutor(Object.assign({}, item, { meta: Object.assign({}, item.meta, { fetchMs: envelope.meta.fetchMs }) }), reply.body)).reply.result || {};
    items.push({ id: item.id, ok: result.ok === true, status: Number(result.status || 0), headers: result.headers || {}, body: String(result.body || '') });
  }
  return { ok: true, status: 200, items, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: String(envelope.id) }] } };
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
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: incompleteStarted.request.id }] }
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
  const customerFields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
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
    transport: { contract: MA_HOP_DONG, captures: { payloadCookie: '461020379855cFHN_CRM_App' }, trace: [{ stage: 'executor_response_sent', requestId: loginStarted.request.id }] }
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
  const wrongAfterLogin = wrongLogin.hop.FbmSync.loginTestResult({ ok: true, status: 200, body: JSON.stringify({ d: true }), transport: { contract: MA_HOP_DONG, captures: { payloadCookie: '461020379855cFHN_CRM_App' }, trace: [{ stage: 'executor_response_sent', requestId: wrongStart.request.id }] } });
  const wrongAuthorize = wrongLogin.hop.FbmSync.loginTestResult({ ok: true, status: 200, body: JSON.stringify({ d: { Authorized: 'wrong-auth' } }), transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: wrongAfterLogin.request.id }] } });
  const wrongDone = wrongLogin.hop.FbmSync.loginTestResult({
    ok: true, status: 200,
    body: JSON.stringify({ d: { TotalRowCount: 1, Rows: [[2038, 'OTHER', 'Tai khoan khac']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } }),
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: wrongAuthorize.request.id }] }
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
  check(so, 'Lịch nền mặc định theo bảng tiến trình: Giữ phiên 5 phút, Quét nhanh 60 phút bật, Lấy toàn bộ giao dịch 8 giờ tắt, Vòng xoay 30 phút 30 khách tắt', [scheduleDefaults.heartbeat.minutes, scheduleDefaults.customerFull.enabled, scheduleDefaults.customerFull.minutes, scheduleDefaults.activityFull.enabled, scheduleDefaults.activityFull.minutes, scheduleDefaults.detail.enabled, scheduleDefaults.detail.minutes, scheduleDefaults.detail.customersPerRun], [5, true, 60, false, 480, false, 30, 30]);
  const savedExtension = scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 15, runOnStartup: false });
  check(so, 'cau hinh Extension cho phep doi nhip nhung khong doi lich nghiep vu', [savedExtension.ok, savedExtension.pollMinutes, savedExtension.runOnStartup, scheduleFlow.hop.FbmSync.backgroundSchedulePublic().heartbeat.minutes], [true, 15, false, 5]);
  const savedSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: false, minutes: 10 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: false, minutes: 30 } });
  check(so, 'GAS luu cong tac va chu ky tung tien trinh nen', [savedSchedule.ok, savedSchedule.schedule.heartbeat.enabled, savedSchedule.schedule.heartbeat.minutes, savedSchedule.schedule.activityFull.enabled], [true, false, 10, false]);
  // Công tắc lịch nền chỉ có một nơi lưu: tắt qua cổng điều khiển thì card cũng thấy tắt và lịch nền không cấp việc, bật lại từ card thì cổng điều khiển cũng thấy bật.
  const switchOff = scheduleFlow.hop.FbmSync.setBackgroundEnabled(false);
  const offCard = scheduleFlow.hop.FbmSync.backgroundSchedulePublic().enabled;
  const offPick = scheduleFlow.hop.FbmSync.schedulerPickDue(Date.now() + 7 * 24 * 3600 * 1000);
  scheduleFlow.hop.FbmSync.backgroundScheduleSave({ enabled: true });
  check(so, 'công tắc lịch nền chỉ một nơi lưu, tắt ở cổng điều khiển thì card và lịch nền cùng tắt', [switchOff.enabled, offCard, offPick.code, scheduleFlow.hop.FbmSync.backgroundEnabled(), scheduleFlow.documentProperties.getProperty('FBM_SYNC_BACKGROUND_ENABLED')], [false, false, 'BACKGROUND_DISABLED', true, null]);
  const disabledSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({ enabled: false });
  check(so, 'luu lich nen dong bo ca cong tac lich va co BACKGROUND_SWITCH_KEY', [disabledSchedule.ok, disabledSchedule.schedule.enabled, scheduleFlow.hop.FbmSync.backgroundEnabled()], [true, false, false]);
  const directionSchedule = scheduleFlow.hop.FbmSync.backgroundScheduleSave({
    enabled: true, direction: 'write',
    heartbeat: { enabled: true, minutes: 5 },
    customerFull: { enabled: true, minutes: 480 },
    activityFull: { enabled: false, minutes: 1440 },
    detail: { enabled: true, minutes: 60, customersPerRun: 50, minDelaySeconds: 0.5, maxDelaySeconds: 2 }
  });
  check(so, 'Lịch nền lưu chiều hai chiều và số khách mỗi phiên; khoảng nghỉ cũ của lịch nền bị bỏ, không còn lưu', [directionSchedule.schedule.direction, directionSchedule.schedule.detail.enabled, directionSchedule.schedule.detail.customersPerRun, 'minDelaySeconds' in directionSchedule.schedule.detail, 'maxDelaySeconds' in scheduleFlow.hop.FbmSync.backgroundScheduleRead().detail, scheduleFlow.hop.FbmSync.backgroundEnabled()], ['write', true, 50, false, false, true]);
  const cursorTruoc = scheduleFlow.hop.FbmSync.detailCursorRead();
  scheduleFlow.documentProperties.setProperty(scheduleFlow.hop.FbmSync.DETAIL_CURSOR_KEY, JSON.stringify({ pageIndex: 1, pageValue: ['2026-09-16', '2026-09-16T10:00:00', '50', 'CUS-50'] }));
  const cursorKieuCu = scheduleFlow.hop.FbmSync.detailCursorRead();
  scheduleFlow.hop.FbmSync.detailCursorWrite(42);
  check(so, 'Cursor Vòng xoay là số CUS: chưa có hoặc còn kiểu khóa trang FBM cũ thì là -1 (bắt đầu từ CUS nhỏ nhất), ghi 42 đọc lại 42', [cursorTruoc, cursorKieuCu, scheduleFlow.hop.FbmSync.detailCursorRead()], [-1, -1, 42]);
  const nhieuKhach = scheduleFlow.hop.FbmSync.backgroundScheduleSave({ detail: { enabled: true, minutes: 60, customersPerRun: 300 } });
  let loiSoKhach = '';
  try { scheduleFlow.hop.FbmSync.backgroundScheduleSave({ detail: { enabled: true, minutes: 60, customersPerRun: 0 } }); } catch (error) { loiSoKhach = error.message; }
  check(so, 'Số khách mỗi phiên Vòng xoay không còn trần 50: lưu 300 đọc lại 300; 0 bị từ chối', [nhieuKhach.schedule.detail.customersPerRun, scheduleFlow.hop.FbmSync.backgroundScheduleRead().detail.customersPerRun, loiSoKhach], [300, 300, 'Số khách mỗi lượt vòng xoay phải là số nguyên từ 1 trở lên.']);
  // Chiều đẩy kiểm lại danh mục FBM giữa các lô: FBM đổi tên một mã giữa lượt thì chỉ bản ghi dùng mã đó bị chặn.
  const categoryPushRun = (options) => {
    const flow = workflowGas(), F = flow.hop.FbmSync, logs = [], sheetSaves = [], fbmNames = { WEB: 'Web', HDDV: 'Hóa đơn dịch vụ' }, lookupAt = [], issued = [];
    flow.hop.logEvent = (event) => logs.push(event);
    F.readCategoryGate = () => ({ map: {}, names: {}, valid: {}, warnings: [], namesBySource: { '@CAT_TINH_THANH': {}, '@CAT_NGUON_KH': { WEB: 'Web', HDDV: 'Hóa đơn dịch vụ' }, '@CAT_CONG_VIEC': {} } });
    F.pushCandidates = (entity) => entity !== 'customer' ? [] : Array.from({ length: 25 }, (_, index) => {
      const id = 'C-' + String(index + 1).padStart(2, '0');
      return { kind: 'edit', id, position: index, record: { id, fbmId: 'F-' + id, fbmHash: 'h', leadCode: ['C-03', 'C-22', 'C-23'].indexOf(id) >= 0 ? 'HDDV' : 'WEB' } };
    });
    ['pushConfigErrors', 'pushOwnerError'].forEach((name) => { F[name] = () => ''; });
    F.pushEligibilityErrors = () => [];
    F.isRecordLocked = () => false;
    // Mỗi lệnh đẩy giả lập đều lỗi để đi tiếp hàng đợi; nâng trần cầu dao để không cắt ngang 25 bản ghi.
    if (!(options && options.realBreaker)) { F.BUDGET = Object.assign({}, F.BUDGET, { pushFailuresMax: 100 }); }
    F.validatePushCategories = (record, entity, gate) => {
      const reason = gate.blocked['@CAT_NGUON_KH\u001f' + record.leadCode];
      return reason ? [{ result: { ok: false, reason } }] : [];
    };
    F.customerEditOpenRequest = (fbmId) => ({ url: 'https://fbm.test/edit', body: { id: fbmId }, meta: { kind: 'customer_edit_open' } });
    flow.hop.writeGateSave = (input) => { sheetSaves.push(...input.records); return { ok: true }; };
    const verified = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };
    const state = F.stateStart('', 'push', 0);
    state.mode = 'push'; state.phase = 'push'; state.entity = 'customer'; state.session = verified; state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
    F.stateWrite(state);
    let envelope = F.nextEnvelope(F.nextPushRequest(F.stateRead())), lastStep = null;
    for (let guard = 0; envelope && guard < 60; guard += 1) {
      if (envelope.meta.kind !== 'batch') {
        const current = F.stateRead(); issued.push(current.cursor.candidate.id);
        lastStep = F.continueAfterPushError(current, current.cursor, { reason: options && options.longReason ? 'FBM từ chối trường địa chỉ liên hệ của khách. '.repeat(30) : 'Giả lập FBM từ chối để đi tiếp hàng đợi', code: 'FBM_ERROR' });
        envelope = lastStep.request; continue;
      }
      lookupAt.push(F.stateRead().cursor.index);
      if (lookupAt.length === 2) { fbmNames.HDDV = 'Hóa đơn đầu vào'; }
      const items = [0, 1, 2].map((id) => (lookupAt.length === 2 && options && options.failSecond && id === 1)
        ? { id: String(id), ok: false, status: 500, body: '' }
        : { id: String(id), ok: true, status: 200, body: JSON.stringify({ d: id === 1 ? Object.keys(fbmNames).map((code) => [code, fbmNames[code]]) : [['X', 'x']] }) });
      lastStep = F.continue({ ok: true, status: 200, items, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: envelope.id }] } });
      envelope = lastStep.request;
    }
    return { F, logs, sheetSaves, lookupAt, issued, lastStep };
  };
  const renamed = categoryPushRun();
  const unknownStatus = renamed.F.SYNC_STATUS.unknownCategory;
  check(so, 'FBM đổi tên một mã giữa hai lô đẩy: lô danh mục đọc lại đúng chỗ dừng, bản ghi dùng mã đó bị chặn và vào Log, bản ghi khác vẫn đẩy', [
    renamed.lookupAt,
    renamed.issued,
    renamed.sheetSaves.filter((row) => row.syncStatus === unknownStatus).map((row) => row.id),
    renamed.logs.filter((event) => event.action === 'category_block').map((event) => event.recordId + ':' + event.outcome),
    renamed.F.stateRead().phase
  ], [
    [0, 20],
    Array.from({ length: 21 }, (_, index) => 'C-' + String(index + 1).padStart(2, '0')).concat(['C-24', 'C-25']),
    ['C-22', 'C-23'],
    ['HDDV:warn'],
    'done'
  ]);
  const lookupLost = categoryPushRun({ failSecond: true });
  const lostState = lookupLost.F.stateRead();
  check(so, 'giữa lượt đẩy không lấy được danh mục FBM thì dừng paused, không đẩy tiếp, Sidebar thấy lý do và Log ghi lỗi', [
    lookupLost.issued.length, lostState.phase, lookupLost.lastStep.request, lookupLost.lastStep.status.phase,
    lookupLost.logs.filter((event) => event.action === 'category_block' && event.outcome === 'error').map((event) => event.reason),
    (lookupLost.lastStep.status.metadata.categoryBlocks || []).map((block) => block.source + ': ' + block.reason)
  ], [20, 'paused', null, 'paused', ['@CAT_NGUON_KH: Không lấy được danh mục FBM (TRANSPORT_ERROR). Bỏ toàn bộ chiều đẩy kỳ này.'], ['@CAT_NGUON_KH: Không lấy được danh mục FBM (TRANSPORT_ERROR).']]);
  const breaker = categoryPushRun({ realBreaker: true, longReason: true }), breakerState = breaker.F.stateRead();
  const breakerStoreText = breaker.F.props().getProperty(breaker.F.PUSH_FAILURES_KEY), breakerStore = JSON.parse(breakerStoreText);
  check(so, 'bản ghi đẩy lỗi chạm pushFailuresMax thì dừng paused, không gửi thêm lệnh FBM, Sidebar thấy tổng và lý do, Log ghi lỗi; khóa lỗi đẩy vẫn dưới 9.000 byte dù lý do dài', [
    breaker.issued.length, breakerState.phase, breakerState.lastFailureCode, breaker.lastStep.request, breaker.lastStep.status.metadata.pushFailureCount,
    /20 bản ghi đẩy lỗi/.test(breaker.lastStep.status.message), breaker.logs.filter((event) => event.action === 'push_failures_limit' && event.outcome === 'error').length,
    Buffer.byteLength(breakerStoreText, 'utf8') <= 9000, Object.keys(breakerStore.details).length, Object.keys(breakerStore.details).slice(-1)[0],
    breaker.F.props().getProperty('FBM_SYNC_STATE_V1').indexOf('pushFailure') < 0
  ], [breaker.F.BUDGET.pushFailuresMax, 'paused', 'PUSH_FAILURES_LIMIT', null, 20, true, 1, true, breaker.F.BUDGET.pushFailureDetailsMax, 'customer:C-20', true]);
  const dueState = { metadata: { categoryCheck: { at: 1000, pushed: 3 } } }, dueBudget = renamed.F.BUDGET;
  check(so, 'danh mục đọc quá lookupMaxAgeMs thì phải đọc lại trước bản ghi đẩy kế, kể cả khi chưa đủ pushBatchRecords', [
    renamed.F.pushLookupDue(dueState, 1000 + dueBudget.lookupMaxAgeMs - 1), renamed.F.pushLookupDue(dueState, 1000 + dueBudget.lookupMaxAgeMs), renamed.F.pushLookupDue({ metadata: {} }, 1000)
  ], [false, true, true]);
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
  compactLookupFlow.hop.FbmSync.start({ mode: 'write', origin: 'manual', scan: 'full' });
  const compactContinue = (body, items) => {
    const requestId = compactLookupFlow.hop.FbmSync.stateRead().activeRequestId;
    return compactLookupFlow.hop.FbmSync.continue(Object.assign({ ok: true, status: 200, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId }] } }, items ? { items } : { body: JSON.stringify(body) }));
  };
  compactContinue({ d: { TotalRowCount: 1, Rows: [[2037, 'ANHLT', 'Le Tuan Anh']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } });
  compactContinue({ d: { Authorized: 'customer-auth' } });
  compactContinue({ d: { Authorized: 'activity-auth' } });
  // Chụp state ngay trước khi đối chiếu Category: đó là lúc danh mục FBM còn nằm trong state.
  let compactLookupSnapshot = '';
  const compactPrepare = compactLookupFlow.hop.FbmSync.prepareCategoryGate;
  compactLookupFlow.hop.FbmSync.prepareCategoryGate = (state) => { compactLookupSnapshot = JSON.stringify(state); return compactPrepare(state); };
  const compactLast = compactContinue(null, compactLookupFlow.hop.FbmSync.SYNC_LOOKUPS.map((item, index) => {
    const rows = Object.keys(compactLookupNames[item.key]).map((code) => [code, compactLookupNames[item.key][code]]);
    rows.push(...Array.from({ length: 700 }, (_, rowIndex) => ['NOISE-' + index + '-' + rowIndex, 'Tên dài để mô phỏng danh mục lớn']));
    return { id: String(index), ok: true, status: 200, body: JSON.stringify({ d: { TotalRowCount: rows.length, Rows: rows } }) };
  }));
  const compactPairValue = JSON.parse(compactLookupSnapshot).session.lookups['@CAT_TINH_THANH'].pairs['CODE-0'];
  const compactState = compactLookupFlow.hop.FbmSync.stateRead();
  const compactStateBytes = Buffer.byteLength(compactLookupSnapshot, 'utf8');
  check(so, 'lookup lớn không chép map Category vào state; gate dựng lại từ Sheet Category vẫn đủ mã (FBM-042)', [
    compactLast.request && compactLast.request.meta.kind,
    compactStateBytes < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT,
    compactPairValue,
    compactLookupSnapshot.indexOf('NOISE-') < 0,
    Object.prototype.hasOwnProperty.call(compactState.metadata, 'categoryGate'),
    JSON.stringify(compactState).indexOf('categoryGateOfRun') < 0,
    Object.keys(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState).map || {}).length,
    Object.keys(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState).namesBySource || {}).length,
    Object.keys(compactState.session.lookups || {}).length,
    compactLookupFlow.hop.FbmSync.categoryValueAllowed(compactLookupFlow.hop.FbmSync.stateCategoryGate(compactState), '@CAT_TINH_THANH', 'CODE-0')
  ], ['scan_job', true, 'Tên danh mục live 0 0 có tên đủ dài', true, false, true, 86, 3, 0, { ok: true, code: 'CODE-0' }]);
  const blockFlow = workflowGas(), blockLogs = [];
  blockFlow.hop.logEvent = (event) => blockLogs.push(event);
  blockFlow.hop.FbmSync.readCategoryGate = () => ({ map: {}, names: {}, namesBySource: { '@CAT_NGUON_KH': { HDDV: 'Hóa đơn dịch vụ' } }, valid: {}, warnings: [] });
  const blockLookups = {};
  blockFlow.hop.FbmSync.SYNC_LOOKUPS.forEach((item) => { blockLookups[item.key] = { pairs: item.key === '@CAT_NGUON_KH' ? { HDDV: 'Hóa đơn đầu vào - đầu ra' } : { X: 'x' } }; });
  blockLookups['@CAT_CONG_VIEC'] = { pairs: {} };
  blockFlow.hop.FbmSync.prepareCategoryGate({ mode: 'push', metadata: {}, session: { lookups: blockLookups } });
  const blockRows = blockLogs.filter((event) => event.action === 'category_block');
  check(so, 'mã danh mục bị chặn vào Sheet Log kèm tên FBM hiện tại; thiếu danh sách FBM là lỗi chặn cả chiều đẩy (tài liệu 09/03)',
    [blockRows.length, blockRows.map((event) => event.outcome).sort().join(','), blockRows.some((event) => event.recordId === 'HDDV' && /Hóa đơn đầu vào - đầu ra/.test(event.reason)), blockRows.some((event) => /@CAT_CONG_VIEC/.test(event.reason) && /toàn bộ chiều đẩy/.test(event.reason))],
    [2, 'error,warn', true, true]);
  const legacyGateState = compactLookupFlow.hop.FbmSync.stateRead();
  legacyGateState.metadata.categoryGate = { map: Object.fromEntries(Array.from({ length: 400 }, (_, i) => ['@CAT_TINH_THANH' + String.fromCharCode(31) + 'Tỉnh ' + i, 'CODE-' + i])) };
  let legacyGateError = '';
  try { compactLookupFlow.hop.FbmSync.stateWrite(legacyGateState); } catch (error) { legacyGateError = String(error && error.code || error); }
  check(so, 'state cũ còn bản sao map Category lớn hơn 9 KB vẫn ghi được và bỏ bản sao đó, Sidebar không kẹt (FBM-042)',
    [legacyGateError, Object.prototype.hasOwnProperty.call(compactLookupFlow.hop.FbmSync.stateRead().metadata, 'categoryGate')], ['', false]);
  const pushState = compactLookupFlow.hop.FbmSync.stateRead();
  pushState.metadata.categoryBlocks = [];
  pushState.metadata.categoryLookupFailed = false;
  compactLookupFlow.hop.FbmSync.previewRecords('activity', [{ customerId: 'CUS-1', workDate: '2026-09-20', taskType: 'GD', content: 'x'.repeat(4000) }]);
  pushState.mode = 'write'; pushState.phase = 'push'; pushState.entity = 'activity'; pushState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  compactLookupFlow.hop.FbmSync.stateWrite(pushState);
  compactLookupFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-QUOTA', position: 0, record: { id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', taskType: 'CODE-3', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }];
  compactLookupFlow.hop.FbmSync.pushConfigErrors = () => '';
  compactLookupFlow.hop.FbmSync.pushOwnerError = () => '';
  compactLookupFlow.hop.FbmSync.validatePushCategories = () => [];
  compactLookupFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  compactLookupFlow.hop.FbmSync.isRecordLocked = () => false;
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
    compactLookupFlow.hop.FbmSync.previewRead().activities[0].content.length,
    String(pushRawState).indexOf('x'.repeat(4000)),
    Object.prototype.hasOwnProperty.call(pushWaitState.metadata, 'categoryGate'),
    pushState.cursor.kind,
    pushRequest && pushRequest.meta && pushRequest.meta.kind,
    pushRawState.length,
    pushRawParsed && pushRawParsed.cursor && pushRawParsed.cursor.kind
  ], [true, 'push_wait', false, false, 163, -1, false, 'push_wait', 'activity_edit_open', pushRawState.length, 'push_wait']);
  check(so, 'state push raw size remains below quota after candidate compact', Buffer.byteLength(pushRawState, 'utf8') < compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT, true);
  compactLookupFlow.hop.FbmSync.readLocal = (entity) => entity === 'activity'
    ? [{ id: 'ACT-QUOTA', fbmId: 'FBM-ACT-QUOTA', content: 'x'.repeat(4000), customerId: 'CUS-1' }]
    : [{ id: 'CUS-1', fbmId: 'FBM-CUS-1', fbmCustomerCode: 'ALT00001' }];
  const hydratedCandidate = compactLookupFlow.hop.FbmSync.hydratePushCandidate(pushWaitState.cursor.candidate);
  check(so, 'candidate compact được dựng lại từ Sheet trước bước push tiếp theo', [hydratedCandidate.record.content.length, hydratedCandidate.record.customerFbmCode, hydratedCandidate.record.stt_rec], [4000, 'ALT00001', 'FBM-CUS-1']);
  const createCursor = { operation: 'customer_create_open', entity: 'customer', candidate: { kind: 'create', id: 'CUS-COMPACT', entity: 'customer' } };
  const createState = compactLookupFlow.hop.FbmSync.stateRead(); createState.cursor = createCursor;
  compactLookupFlow.hop.FbmSync.customerCreateRequest = () => ({ url: 'https://example.test', meta: { kind: 'customer_create_save' } });
  compactLookupFlow.hop.FbmSync.extractAutoCustomerCode = () => 'ALT00099';
  compactLookupFlow.hop.FbmSync.validateAutoCustomerCode = () => ({ ok: true });
  compactLookupFlow.hop.FbmSync.continuePush(createState, { d: { ClientScript: "_ma_kh_auto = 'ALT00099';" } });
  check(so, 'candidate compact giữ mã Customer tự sinh cho nhánh khôi phục', compactLookupFlow.hop.FbmSync.stateRead().cursor.candidate.autoCode, 'ALT00099');
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_STATE_V1', pushRawState);
  // Chữ có dấu 3 byte: mười khách đủ dài là vượt trần một khóa; bản xem trước phải tự bỏ bớt dòng chứ không làm hỏng lần ghi.
  compactLookupFlow.hop.FbmSync.previewClear();
  compactLookupFlow.hop.FbmSync.previewRecords('customer', Array.from({ length: 10 }, () => ({ fbmCustomerCode: 'Ữ'.repeat(80), companyName: 'Ữ'.repeat(160), fbmId: 'Ữ'.repeat(80) })));
  const previewRaw = compactLookupFlow.documentProperties.data[compactLookupFlow.hop.FbmSync.PREVIEW_KEY] || '';
  check(so, 'preview quá lớn tự cắt dưới trần khóa riêng và không nằm trong state', [compactLookupFlow.hop.FbmSync.previewRead().truncated, previewRaw.length > 0 && Buffer.byteLength(previewRaw, 'utf8') <= compactLookupFlow.hop.FbmSync.DOCUMENT_PROPERTY_VALUE_LIMIT, String(compactLookupFlow.documentProperties.data.FBM_SYNC_STATE_V1).indexOf('preview')], [true, true, -1]);
  compactLookupFlow.hop.FbmSync.previewClear();
  const probeState = compactLookupFlow.hop.FbmSync.stateRead();
  compactLookupFlow.documentProperties.setProperty('FBM_SYNC_PENDING_PUSHES_V1', 'x'.repeat(42));
  const probe = compactLookupFlow.hop.fbmSyncStateProbe();
  check(so, 'probe state chỉ trả kích thước từng nhánh, không trả payload', [
    probe.ok, probe.state.parseOk, probe.state.cursorKind, 'metadataCategoryGateBytes' in probe.state,
    probe.state.metadataCategoryBlocksBytes > 0, probe.state.branchBytes.metadata > 0, probe.state.sessionLookupsBytes, Array.isArray(probe.extensionResponses), probe.largestProperties[0].key,
    JSON.stringify(probe).indexOf('ACT-QUOTA') < 0
  ], [true, true, 'push_wait', false, true, true, 2, true, 'FBM_SYNC_STATE_V1', true]);
  const orderFlow = workflowGas();
  const orderState = orderFlow.hop.FbmSync.stateStart('', 'push', 0);
  orderState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  orderState.mode = 'write'; orderState.phase = 'push'; orderState.entity = 'activity';
  orderState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  orderFlow.hop.FbmSync.stateWrite(orderState);
  orderFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-ORDER', position: 0, record: { id: 'ACT-ORDER', fbmId: 'FBM-ACT-ORDER', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }];
  orderFlow.hop.FbmSync.pushConfigErrors = () => '';
  orderFlow.hop.FbmSync.pushOwnerError = () => '';
  orderFlow.hop.FbmSync.validatePushCategories = () => [];
  orderFlow.hop.FbmSync.pushEligibilityErrors = () => [];
  orderFlow.hop.FbmSync.isRecordLocked = () => false;
  orderFlow.hop.FbmSync.activityEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'activity_edit_open' } });
  let orderSheetWrites = 0;
  orderFlow.hop.writeGateSave = () => { orderSheetWrites += 1; return { ok: true }; };
  const orderStateWrite = orderFlow.hop.FbmSync.stateWrite;
  let orderWriteCount = 0;
  orderFlow.hop.FbmSync.stateWrite = (state) => { orderWriteCount += 1; if (orderWriteCount === 1) { const error = new Error('quota'); error.code = 'FBM_DOCUMENT_PROPERTIES_QUOTA'; throw error; } return orderStateWrite(state); };
  let orderError = null;
  try { orderFlow.hop.FbmSync.nextPushRequest(orderState); } catch (error) { orderError = error; }
  check(so, 'state push được chốt trước khi đánh dấu Sheet đang đẩy', [orderError && orderError.code, orderSheetWrites, orderFlow.hop.FbmSync.stateRead().cursor.kind], ['FBM_DOCUMENT_PROPERTIES_QUOTA', 0, 'push_scan']);
  // FBM-045: bước nạp Category gọi nextPushRequest rồi tự ghi lại object state của nó; khóa phải đặt trên chính object đó.
  const aliasFlow = workflowGas();
  const aliasState = aliasFlow.hop.FbmSync.stateStart('', 'push', 0);
  aliasState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  aliasState.mode = 'push'; aliasState.phase = 'push'; aliasState.entity = 'customer'; aliasState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  aliasFlow.hop.FbmSync.stateWrite(aliasState);
  aliasFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'CUS-ALIAS', position: 0, record: { id: 'CUS-ALIAS', fbmId: 'FBM-CUS-ALIAS', fbmHash: 'h0', fbmSyncPermission: 'Cho phép' } }];
  ['pushConfigErrors', 'pushOwnerError'].forEach((name) => { aliasFlow.hop.FbmSync[name] = () => ''; });
  ['validatePushCategories', 'pushEligibilityErrors'].forEach((name) => { aliasFlow.hop.FbmSync[name] = () => []; });
  aliasFlow.hop.writeGateSave = () => ({ ok: true });
  aliasFlow.hop.FbmSync.customerEditOpenRequest = () => ({ url: 'https://example.test', meta: { kind: 'customer_edit_open' } });
  const aliasRequest = aliasFlow.hop.FbmSync.nextPushRequest(aliasState);
  aliasFlow.hop.FbmSync.stateWrite(aliasState);
  const aliasStored = aliasFlow.hop.FbmSync.stateRead();
  check(so, 'FBM-045: hàm gọi ghi lại object state sau khi phát lệnh đẩy vẫn giữ cursor push_wait và khóa bản ghi',
    [aliasRequest && aliasRequest.meta.kind, aliasState.cursor.kind, aliasStored.cursor.kind, !!(aliasStored.locks || {})['customer:CUS-ALIAS']], ['customer_edit_open', 'push_wait', 'push_wait', true]);
  // FBM-002: không ghi được `đang đẩy` xuống Sheet thì không phát lệnh ghi FBM.
  const pushingFlow = workflowGas();
  const pushingState = pushingFlow.hop.FbmSync.stateStart('', 'push', 0);
  pushingState.metadata.categoryCheck = { at: Date.now(), pushed: 0 };
  pushingState.mode = 'write'; pushingState.phase = 'push'; pushingState.entity = 'activity';
  pushingState.cursor = { kind: 'push_scan', entity: 'activity', index: 0 };
  pushingFlow.hop.FbmSync.stateWrite(pushingState);
  ['pushConfigErrors', 'pushOwnerError'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => ''; });
  ['validatePushCategories', 'pushEligibilityErrors'].forEach((name) => { pushingFlow.hop.FbmSync[name] = () => []; });
  pushingFlow.hop.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'ACT-PUSHING', position: 0, record: { id: 'ACT-PUSHING', fbmId: 'FBM-ACT-PUSHING', taskType: 'GD', content: 'Nội dung', workDate: '2026-09-20', customerId: 'CUS-1', customerFbmCode: 'ALT00001', fbmSyncPermission: 'Cho phép', fbmHash: 'old' } }];
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
    htmlResult = htmlFailureFlow.hop.FbmSync.continue({ ok: true, status: 200, body: '<html><h1>500 Internal Server Error</h1></html>', transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId }] } });
    if (!htmlResult.request) { break; }
  }
  const htmlState = htmlFailureFlow.hop.FbmSync.stateRead();
  check(so, 'HTML lỗi qua continuation bị fail-closed, giữ cursor và ghi Log lỗi', [htmlStarted.request.meta.kind, htmlResult.ok, htmlResult.request || null, htmlState.phase, htmlState.lastFailureCode, htmlState.cursor.kind, htmlLogs.length, htmlLogs[0] && htmlLogs[0].action], ['identity_user_grid', false, null, 'error', 'PARSE_ERROR', 'identity_user_grid', 1, 'business_request_failed']);
  scheduleFlow.hop.FbmSync.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  const now = Date.now();
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN', String(now - 1));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_FULL_SCAN', String(now - 1));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now - 1));
  const pickedCustomer = scheduleFlow.hop.FbmSync.schedulerPickDue(now);
  check(so, 'scheduler GAS uu tien Customer khi Customer va Activity cung den han', [pickedCustomer.ok, pickedCustomer.kind, scheduleFlow.hop.FbmSync.stateRead().scheduledScan], [true, 'customerFull', 'customerFull']);
  const duplicateReservation = scheduleFlow.hop.FbmSync.schedulerPickDue(now + 1);
  check(so, 'scheduler GAS lap lai cung nhat khong tao reservation thu hai', [duplicateReservation.ok, duplicateReservation.kind, duplicateReservation.existing], [true, 'customerFull', true]);
  scheduleFlow.hop.FbmSync.statePatch({ runId: 'running-a', phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: '' });
  const blockedOverlap = scheduleFlow.hop.FbmSync.schedulerPickDue(now + 1);
  check(so, 'scheduler GAS khong cap tien trinh song song khi A dang chay', [blockedOverlap.ok, blockedOverlap.code], [false, 'SYNC_ALREADY_RUNNING']);
  scheduleFlow.hop.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, activeRequestId: '', scheduledScan: '' });
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_FULL_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now + 60000));
  const noDue = scheduleFlow.hop.FbmSync.heartbeatRequest({ source: 'alarm' });
  check(so, 'scheduler GAS khong cap heartbeat khi khong co lich den han', [noDue.ok, noDue.code, noDue.request], [true, 'NO_PROCESS_DUE', null]);
  scheduleFlow.hop.FbmSync.statePatch({ runId: '', phase: 'idle', cursor: {}, scheduledScan: '' });
  scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: true, minutes: 30 } });
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_CUSTOMER_FULL_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_ACTIVITY_FULL_SCAN', String(now + 60000));
  scheduleFlow.documentProperties.setProperty('FBM_SYNC_NEXT_HEARTBEAT', String(now - 1));
  const heartbeatLowest = scheduleFlow.hop.FbmSync.schedulerPickDue(now);
  check(so, 'scheduler GAS chi chon giu phien khi khong co tien trinh du lieu den han', [heartbeatLowest.ok, heartbeatLowest.kind], [true, 'heartbeat']);
  check(so, 'cau hinh scheduler tu choi chu ky ngoai gioi han', [scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 0 }).ok, (() => { try { scheduleFlow.hop.FbmSync.backgroundScheduleSave({ customerFull: { minutes: 0 } }); return false; } catch (ignore) { return true; } })()], [false, true]);
  scheduleFlow.hop.FbmSync.extensionConfigSave({ pollMinutes: 15, runOnStartup: true });
  scheduleFlow.hop.FbmSync.backgroundScheduleSave({ heartbeat: { enabled: true, minutes: 5 }, customerFull: { enabled: true, minutes: 60 }, activityFull: { enabled: true, minutes: 30 } });
  const startup = scheduleFlow.hop.FbmSync.heartbeatRequest({ source: 'startup' });
  check(so, 'Chrome startup co the hoi GAS ngay mot luot theo cau hinh', [startup.ok, startup.code, startup.request && startup.request.meta.kind], [true, 'HEARTBEAT_REQUEST_READY', 'heartbeat']);
  const waitFlow = workflowGas({ extraFiles: ['server/gate/IdGate.js', 'fbm_sync/state/SyncSettings.js'] });
  waitFlow.hop.FbmSync.syncSettingsSave({ scopeLimited: false });
  waitFlow.hop.FbmSync.syncSettingsSave({ requestGapMinSeconds: 1, requestGapMaxSeconds: 3 });
  waitFlow.hop.FbmSync.start({ mode: 'read' });
  waitFlow.hop.FbmSync.syncSettingsSave({ requestGapMinSeconds: 5, requestGapMaxSeconds: 9 });
  waitFlow.hop.FbmSync.statePatch({ phase: 'pull_customer', cursor: { kind: 'customer_grid' }, activeRequestId: '', deadlineAt: 0 });
  const gapGrid = waitFlow.hop.FbmSync.nextEnvelope(waitFlow.hop.FbmSync.customerGridRequest({ type: 0, count: 50, gridPageIndex: -1, gridRefresh: false }));
  waitFlow.hop.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const gapChunk = waitFlow.hop.FbmSync.nextEnvelope({ url: 'https://fbo.com.vn:8888/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage', body: '', meta: { kind: 'scan_chunk', job: { jobId: 'j', chunkIndex: 1 } } });
  const gapBudget = waitFlow.hop.FbmSync.BUDGET;
  check(so, 'Lượt chạy tay chụp khoảng cách giữa hai request FBM vào state đầu lượt và gửi kèm mọi envelope; đổi cài đặt giữa lượt chỉ áp lượt sau; hạn Extension cộng khoảng nghỉ dài nhất, trừ gói lấy từ RAM tab',
    [JSON.stringify(waitFlow.hop.FbmSync.stateRead().requestGap), JSON.stringify(gapGrid.meta.requestGap), gapGrid.meta.timeoutMs, gapChunk.meta.timeoutMs],
    ['{"minMs":1000,"maxMs":3000}', '{"minMs":1000,"maxMs":3000}', gapBudget.tabReadyMs + gapBudget.fetchMs + 3000, gapBudget.tabReadyMs + gapBudget.fetchMs]);
  const gapInvalid = waitFlow.hop.FbmSync.syncSettingsSave({ requestGapMinSeconds: 4, requestGapMaxSeconds: 2 });
  const gapTooLong = waitFlow.hop.FbmSync.syncSettingsSave({ requestGapMinSeconds: 0, requestGapMaxSeconds: gapBudget.requestGapMaxSeconds + 1 });
  check(so, 'Khoảng cách request FBM: tối đa nhỏ hơn tối thiểu hoặc vượt trần bị từ chối', [gapInvalid.code, gapTooLong.code], ['FBM_REQUEST_GAP_INVALID', 'FBM_REQUEST_GAP_INVALID']);
  waitFlow.hop.FbmSync.syncSettingsSave({ requestGapMinSeconds: 0, requestGapMaxSeconds: 0 });
  waitFlow.hop.FbmSync.statePatch({ scan: 'full', requestGap: null, activeRequestId: '', deadlineAt: 0 });
  const gapNone = waitFlow.hop.FbmSync.nextEnvelope(waitFlow.hop.FbmSync.customerGridRequest({ type: 0, count: 50, gridPageIndex: -1, gridRefresh: false }));
  check(so, 'Mặc định 0 giây: envelope không mang khoảng nghỉ', gapNone.meta.requestGap, undefined);
  waitFlow.hop.FbmSync.statePatch({ activeRequestId: '', deadlineAt: 0 });
  const truocCap = Date.now();
  const loEnvelope = waitFlow.hop.FbmSync.nextEnvelope({ items: ['STT1', 'STT2'].map((stt) => waitFlow.hop.FbmSync.activityGridRequest(stt, { type: 0, count: 100, gridPageIndex: -1, gridRefresh: false })), meta: { kind: 'batch', entity: 'activity' } });
  const loState = waitFlow.hop.FbmSync.stateRead(), B = waitFlow.hop.FbmSync.BUDGET;
  check(so, 'GAS cấp envelope lô: hai phần tử, hạn Extension theo ngân sách, maxBytes, hạn Sidebar chờ GAS và chờ Extension, deadlineAt thu hồi cộng đường về và đường lên', [
    loEnvelope.items.length, loEnvelope.url, loEnvelope.meta.kind, loEnvelope.meta.timeoutMs, loEnvelope.meta.batch.maxBytes, loEnvelope.meta.gasReplyMs, loEnvelope.meta.extensionReplyMs, loState.activeRequestId === loEnvelope.id,
    loState.deadlineAt >= truocCap + loEnvelope.meta.timeoutMs + B.bridgeMs + B.gasTransitMs && loState.deadlineAt <= Date.now() + loEnvelope.meta.timeoutMs + B.bridgeMs + B.gasTransitMs
  ], [2, undefined, 'batch', B.tabReadyMs + 2 * B.fetchMs, B.batchMaxBytes, B.gasHardMs + B.gasTransitMs, B.tabReadyMs + 2 * B.fetchMs + B.bridgeMs, true, true]);

  const deadlineLogs = [];
  const deadlineFlow = workflowGas({ logEvent: (event) => deadlineLogs.push(event), LOG_ERROR: 'error' });
  deadlineFlow.hop.FbmSync.statePatch({ runId: 'runtime-limit', phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 4, pageValue: ['2026-09-20', 'CUS-000004'] }, activeRequestId: '', deadlineAt: Date.now() - 1 });
  // FBM-031: hạn của request vừa nhận đã qua nhưng lời gọi GAS mới bắt đầu thì vẫn cấp request kế; trần tính từ lúc lời gọi bắt đầu.
  deadlineFlow.hop.FbmSync.budgetCallBegin(Date.now());
  const notBlockedByRequestDeadline = deadlineFlow.hop.FbmSync.nextEnvelope(deadlineFlow.hop.FbmSync.customerGridRequest({ type: 1, count: 3, gridPageIndex: 5, gridRefresh: false }));
  check(so, 'trần thời gian GAS tính từ lúc lời gọi bắt đầu, không từ hạn request vừa nhận', [!!notBlockedByRequestDeadline, deadlineFlow.hop.FbmSync.stateRead().lastFailureCode], [true, '']);
  deadlineFlow.hop.FbmSync.statePatch({ phase: 'pull_customer', cursor: { kind: 'customer_grid', pageIndex: 4, pageValue: ['2026-09-20', 'CUS-000004'] }, activeRequestId: '', deadlineAt: 0 });
  deadlineFlow.hop.FbmSync.budgetCallBegin(Date.now() - deadlineFlow.hop.FbmSync.BUDGET.gasSoftMs - 1);
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
    { ok: true, request: { id: 'reserved-heartbeat', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}', meta: { timeoutMs: 30000 } } },
    { ok: true, code: 'TRANSPORT_RECORDED', request: null }
  ], []);
  const noTabResult = await noTabWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm khong co tab: Extension nop transport failure dung reservation va khong tu fetch FBM', [
    noTabResult.code, noTabWorker.relayCalls.map((item) => [item.body.kind, item.body.requestId || '', item.body.code || '']), noTabWorker.metrics().fbmMessages
  ], ['FBM_TAB_NOT_FOUND', [['heartbeat_request', '', ''], ['heartbeat_transport_failure', 'reserved-heartbeat', 'FBM_TAB_NOT_FOUND']], 0]);

  const autoOpenWorker = workerHarness([
    { ok: true, request: { id: 'open-heartbeat', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{}', meta: { timeoutMs: 30000, openFbmContext: { url: 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', active: false } } } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.21' }; }
    if (message.type === 'FBM_EXECUTE_V2') { return { result: { ok: true, status: 200, body: '{"d":{"TotalRowCount":12,"Rows":[]}}', transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } }; }
    return null;
  });
  const autoOpenResult = await autoOpenWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'GAS cap lenh mo tab: Extension chi mo dung URL duoc cap va moi gui request', [autoOpenResult.ok, autoOpenWorker.metrics().fbmTabQueries, autoOpenWorker.metrics().fbmTabCreates, autoOpenWorker.metrics().fbmMessages], [true, 1, 1, 2]);

  const rawHeartbeat = '{"d":{"TotalRowCount":12,"Rows":[]}}';
  const completeWorker = workerHarness([
    { ok: true, request: { id: 'heartbeat-envelope', url: 'https://fbo.com.vn:8888/service', method: 'POST', bodyText: '{"from":"gas"}', meta: { timeoutMs: 30000, gasReplyMs: 390000 } } },
    { ok: true, code: 'HEARTBEAT_COMPLETE', request: null }
  ], [{ id: 17 }], (tabId, message) => {
    if (message.type === 'FBM_PING_V2') { return { ready: true, version: '21.21' }; }
    if (message.type === 'FBM_EXECUTE_V2') {
      return { result: { ok: true, status: 200, body: rawHeartbeat, transport: { trace: [{ stage: 'executor_response_sent', requestId: message.request.id }] } } };
    }
    return null;
  });
  const completeResult = await completeWorker.context.fbmHeartbeatNow('workflow');
  check(so, 'alarm co tab: GAS cap envelope truoc, Extension chuyen response tho kem ma hop dong cua no ve GAS va dung khi request null', [
    completeResult.ok, completeWorker.relayCalls.map((item) => item.body.kind), completeWorker.relayCalls[1].body.response.body,
    completeWorker.relayCalls[1].body.response.transport.contract,
    completeWorker.metrics().fbmTabQueries, completeWorker.metrics().fbmMessages
  ], [true, ['heartbeat_request', 'heartbeat'], rawHeartbeat, MA_HOP_DONG, 1, 2]);

  // Chạy cả pipeline Customer + Activity. `withTrace` nạp thêm Trace.js như GAS thật (có sổ bước nghiệp vụ thay cho dòng Log tóm tắt mỗi lát), dùng cho phép đếm lần gọi kho.
  async function fullPipeline(withTrace, mode, options) {
    const soKhach = options && options.customers || 2, khachLoi = options && options.failing || {};
    const fullLogs = [], fullWrites = [], fullLocal = { customer: [], activity: (options && options.localActivity || []).slice() };
    // Đếm mọi lần gọi kho DocumentProperties để chốt đợt 1 bước A: một lát Activity không được đọc/ghi kho theo số sự kiện.
    const fullProps = properties(), fullPropCalls = { count: 0 }, fullSheetReads = { customer: 0, activity: 0, category: 0 };
    ['getProperty', 'setProperty', 'deleteProperty', 'getProperties'].forEach((name) => { const original = fullProps[name]; fullProps[name] = function () { fullPropCalls.count += 1; return original.apply(this, arguments); }; });
    fullProps.setProperties = function (batch) { fullPropCalls.count += 1; Object.keys(batch).forEach((key) => { fullProps.data[key] = String(batch[key]); }); };
    const fullFlow = workflowGas({
      documentProperties: fullProps,
      extraFiles: withTrace ? ['fbm_sync/diagnostic/Trace.js'] : [],
      logEvent: (event) => fullLogs.push(event),
      LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
      readLocal: 'sheet', DATA_SCHEMA: {}, SYNC_SCHEMA: {},
      entityReadAllCombined: (entity) => {
        fullSheetReads[entity] += 1;
        const fields = Array.from(new Set(fullLocal[entity].flatMap((record) => Object.keys(record))));
        return { fields, rows: fullLocal[entity].map((record) => fields.map((field) => record[field])) };
      },
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
    fullFlow.hop.FbmSync.readCategoryGateSheet = () => { fullSheetReads.category += 1; return { map: {}, names: {}, namesBySource: {}, valid: {}, warnings: [] }; };
    fullFlow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
    if (options && options.scanCustomerRows) { fullFlow.hop.FbmSync.BUDGET.scanCustomerRows = options.scanCustomerRows; }
    if (options && options.activityCustomerRows) { fullFlow.hop.FbmSync.BUDGET.activityCustomerRows = options.activityCustomerRows; }
    const fullCustomerFields = fullFlow.hop.FbmSync.GRID_FIELDS.customer;
    const fullActivityFields = fullFlow.hop.FbmSync.GRID_FIELDS.activity;
    const gio = (i, base) => new Date(Date.UTC(2026, 8, 20, base, 0, 0) + (i - 1) * 60000).toISOString().slice(0, 19);
    const so2 = (i) => String(i).padStart(2, '0');
    const customerRows = Array.from({ length: soKhach }, (_, k) => k + 1).map((i) => row(fullCustomerFields, { stt_rec_kh: 'FBM-C' + i, ma_kh: 'ALT' + String(i).padStart(5, '0'), ten_kh: 'Cong ty ' + i, ma_so_thue: '0100' + so2(i), ong_ba: String.fromCharCode(65 + (i - 1) % 26), dc_lh: 'Ha Noi', dien_thoai: '09' + so2(i), email: 'c' + i + '@example.test', ngay_gd: '/Date(' + Date.UTC(2026, 8, 20) + ')/', datetime0: '/Date(' + Date.parse(gio(i, 1) + 'Z') + ')/', xorder: i }));
    const activityRows = Object.fromEntries(customerRows.map((_, k) => k + 1).map((i) => ['FBM-C' + i, [row(fullActivityFields, { id: 'FBM-A' + i, details: 'Goi dien ' + i, end_date: '2026-09-20', owner: 'Owner ' + i, datetime0: gio(i, 3), line_nbr: 1 })]]));
    const customerPageIndexes = [], activityItemTypes = [], fullKinds = [], fullStatuses = [], fullActivityPropCalls = [], fullActivitySheetReads = [], fullBatches = [], fullLookupFields = [];
    let fullStep = null;
    const fbmTab = executorSession();
    // `rounds` chạy lại cả lượt trên cùng Sheet; `loseTab` làm lượt đầu mất tab FBM ngay ở lô giao dịch đầu tiên.
    for (let round = 0; round < (options && options.rounds || 1); round += 1) {
    fullFlow.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
    fullStep = fullFlow.hop.FbmSync.start({ mode: mode || 'read', origin: 'manual', manual: true });
    for (let hop = 0; fullStep && fullStep.request && hop < 60; hop += 1) {
      const request = fullStep.request;
      const kind = String(request.meta && request.meta.kind || '');
      fullKinds.push(kind + ':' + String(request.meta && (request.meta.entity || request.meta.field) || ''));
      // Lô danh mục chỉ cần đi qua executor; số đo chi phí và các ca phá lô chỉ nhắm lô giao dịch.
      const activityBatch = kind === 'batch' && request.meta.entity === 'activity';
      if (kind === 'batch' && request.meta.entity === 'category') { fullLookupFields.push(request.items.map((item) => item.body.controller)); }
      if (activityBatch) { fullBatches.push(request); }
      if (activityBatch && round === 0 && options && options.loseTab) {
        fullStep = fullFlow.hop.FbmSync.controlDispatchLocked('transport_failure', { requestId: request.id, code: 'FBM_TRANSPORT_UNAVAILABLE', message: 'Mất tab FBM' });
        fullStatuses.push(fullStep.status);
        continue;
      }
      let body;
      if (kind === 'session_probe' || kind === 'identity_user_grid') {
        body = userResponse;
      } else if (kind === 'authorize') {
        body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } });
      } else if (kind === 'completion') {
        body = JSON.stringify({ d: [['CODE', 'Ten danh muc']] });
      } else if (kind === 'scan_chunk') {
        body = '';
      } else if ((kind === 'grid' || kind === 'scan_job' || kind === 'customer_count') && request.meta.entity === 'customer') {
        // FBM phân trang keyset: trang kế bắt đầu sau dòng có đúng bốn giá trị khóa đã gửi, ngày ở dạng `/Date(ms)/`; khóa lệch thì trả trang rỗng. Chỉ trang đầu báo `TotalRowCount` (Nghiên cứu FBM ch03 mục 3.3, ch04 mục 4.10).
        const pageSize = Number(request.body.count), pageValue = request.body.gridPageValue, khoa = ['ngay_gd', 'datetime0', 'xorder', 'stt_rec_kh'].map((field) => fullCustomerFields.indexOf(field));
        // Trang sau chỉ có dữ liệu khi request mô tả đúng dòng cuối trang đang đứng và tổng số dòng, như FBM thật (yyyyMMdd theo giờ Việt Nam).
        const ngayFbm = (value) => new Date(Number(String(value).match(/\d+/)[0]) + 7 * 3600000).toISOString().slice(0, 10).replace(/-/g, '');
        // FBM đọc ngày trong khóa trang như giờ UTC: khóa chỉ khớp khi ngày đã cộng 7 giờ như giao diện FBM gửi.
        const gioMayChu = (value) => '/Date(' + (Number(String(value).match(/\d+/)[0]) + 7 * 3600000) + ')/';
        const keyIndex = pageValue ? customerRows.findIndex((item) => JSON.stringify(khoa.map((index, k) => (k < 2 ? gioMayChu(item[index]) : item[index]))) === JSON.stringify(pageValue)) : -1, keyRow = customerRows[keyIndex];
        const moTaDung = keyRow && request.body.lastPageItem === ngayFbm(keyRow[khoa[0]]) + ngayFbm(keyRow[khoa[1]]) + keyRow[khoa[2]] + keyRow[khoa[3]] && request.body.lastRowCount === customerRows.length;
        const pageStart = !pageValue ? 0 : moTaDung ? keyIndex + 1 : customerRows.length;
        if (kind === 'scan_job') { customerPageIndexes.push([request.body.gridPageIndex, request.body.lastPageIndex]); }
        body = gridResponse(fullCustomerFields, customerRows.slice(pageStart, pageStart + pageSize), pageStart ? 0 : customerRows.length);
      } else if (kind !== 'batch') {
        throw new Error('Ca mô phỏng pipeline gặp request không mong đợi: ' + kind);
      }
      let raw = kind === 'batch' ? await sendBatchThroughExecutor(request, (item) => {
        if (/GetCompletionList/.test(item.url)) { return { body: JSON.stringify({ d: [['CODE', 'Ten danh muc']] }) }; }
        const key = item.body.externalKey && item.body.externalKey[0] && item.body.externalKey[0].Value;
        if (khachLoi[key]) { return { raw: khachLoi[key] }; }
        // FBM chỉ trả tiêu đề cột khi `type: 0`; trang không tiêu đề chỉ có `Rows`.
        activityItemTypes.push(item.body.type);
        const dongs = (activityRows[key] || []).map((dong) => options && options.cutColumn === key ? dong.slice(1) : dong);
        const body = JSON.parse(gridResponse(fullActivityFields, dongs, dongs.length));
        if (item.body.type !== 0) { delete body.d.ViewPage; }
        return { body: JSON.stringify(body) };
      }) : executorRaw((await fbmTab.send(request, body)).reply, request.id);
      if (activityBatch && options && options.editBatch) { raw = options.editBatch(raw, fullBatches.length); }
      if (activityBatch) {
        // Đi đúng đường của fbmContinueSync (bộ đệm một lần gọi, khóa điều phối) để đếm số lần gọi kho của một lát Activity.
        const callsBefore = fullPropCalls.count, readsBefore = Object.assign({}, fullSheetReads), writesBefore = fullWrites.length;
        fullFlow.hop.FbmSync.propertyBufferBegin();
        const before = fullFlow.hop.FbmSync.statusView();
        fullStep = fullFlow.hop.FbmSync.controlDispatchLocked('continue', { response: raw });
        if (withTrace) { fullFlow.hop.FbmSync.traceEvent('engine_after', { operation: 'fbmContinueSync' }); }
        if (fullStep.status && fullFlow.hop.FbmSync.shouldLogStatus(before, fullStep.status)) { fullFlow.hop.FbmSync.logStatus(fullStep.status, 'slice'); }
        fullFlow.hop.FbmSync.propertyBufferEnd();
        fullActivityPropCalls.push(fullPropCalls.count - callsBefore);
        const sliceReads = Object.keys(fullSheetReads).reduce((out, key) => Object.assign(out, { [key]: fullSheetReads[key] - readsBefore[key] }), {});
        const sliceWrites = fullWrites.slice(writesBefore).reduce((out, item) => Object.assign(out, { [item.entity]: (out[item.entity] || 0) + 1 }), {});
        fullActivitySheetReads.push({ reads: sliceReads, writes: sliceWrites });
        fullStatuses.push(fullStep.status);
        continue;
      }
      const before = fullFlow.hop.FbmSync.statusView();
      fullStep = fullFlow.hop.FbmSync.continue(raw);
      fullStatuses.push(fullStep.status);
      if (fullStep.status && fullFlow.hop.FbmSync.shouldLogStatus(before, fullStep.status)) {
        fullFlow.hop.FbmSync.logStatus(fullStep.status, 'slice');
      }
    }
    }
    return { customerPageIndexes, activityItemTypes, fullFlow, fullLogs, fullWrites, fullLocal, fullStep, fullKinds, fullStatuses, fullActivityPropCalls, fullActivitySheetReads, fullBatches, fullLookupFields };
  }
  const { fullFlow, fullLogs, fullWrites, fullLocal, fullStep, fullKinds, fullStatuses } = await fullPipeline(false);
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
    true, null, 'done', 2, 2, 2,
     ['session_probe:user', 'authorize:customer', 'authorize:activity', 'scan_job:customer', 'batch:activity', 'customer_count:customer'],
    0, true, 4, true
  ]);
  const checkRun = await fullPipeline(false, 'check');
  check(so, '"Kiểm tra an toàn" nạp đủ 3 danh mục FBM trong một lô, một lần gọi GAS, trước khi đọc Customer', [checkRun.fullKinds.filter((kind) => kind.indexOf('completion:') === 0 || kind === 'batch:category'), checkRun.fullLookupFields, checkRun.fullKinds.indexOf('batch:category') < checkRun.fullKinds.indexOf('scan_job:customer')], [['batch:category'], [['crProvinceCity', 'crLeadSource', 'crJob']], true]);
  // Nhóm 1.3 (2A điểm 12): chiều Lấy không nạp danh mục FBM nên không có mã bị chặn vì FBM đổi tên; phép kiểm từng bản ghi bằng Sheet Category vẫn chặn mã lạ.
  const readCategoryState = fullFlow.hop.FbmSync.stateRead();
  const unknownGate = { map: {}, valid: { '@CAT_CONG_VIEC': { 'Gọi điện': true, CV1: true } }, blocked: {} };
  check(so, 'nhóm 1.3: lượt Lấy từ FBM → ShinCRM không phát request danh mục, không sinh mã danh mục bị chặn, mã lạ không có trong Category vẫn bị chặn theo từng bản ghi',
    [fullKinds.filter((kind) => kind.indexOf('completion:') === 0).length, (readCategoryState.metadata.categoryBlocks || []).length, fullFlow.hop.FbmSync.validateIncomingCategories({ taskType: 'CV9' }, 'activity', unknownGate).length],
    [0, 0, 1]);
  const traced = await fullPipeline(true), tracedActivityPropCalls = traced.fullActivityPropCalls;
  // Đợt 1 bước C: mỗi Sheet đọc một lần mỗi lần gọi; chỉ được đọc lại sau mỗi lần cửa ghi ghi đúng thực thể đó (bản chụp bị bỏ khi ghi).
  const sheetReadsWithinBudget = traced.fullActivitySheetReads.every((slice) => ['customer', 'activity', 'category'].every((key) => slice.reads[key] <= 1 + (slice.writes[key] || 0)));
  check(so, 'đợt 1 bước C: mỗi lát Activity đọc mỗi Sheet (Customer, Activity, Category) một lần, chỉ đọc lại sau khi cửa ghi ghi đúng Sheet đó',
    [traced.fullActivitySheetReads.length >= 1, sheetReadsWithinBudget, traced.fullActivitySheetReads.map((slice) => slice.reads)], [true, true, traced.fullActivitySheetReads.map((slice) => slice.reads)]);
  const lastActivitySlice = tracedActivityPropCalls.length - 1;
  check(so, 'đợt 1 bước A: mỗi lát Activity gọi kho DocumentProperties không quá ' + FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX + ' lần, lát kết thúc lượt cộng thêm ' + FBM_SEEN_STORE_RESET_DELETES + ' lần xóa dấu đã thấy (trước refactor: 83)',
    [tracedActivityPropCalls.length >= 1, tracedActivityPropCalls.every((count, index) => count <= FBM_ACTIVITY_SLICE_PROPERTY_CALLS_MAX + (index === lastActivitySlice ? FBM_SEEN_STORE_RESET_DELETES : 0)), tracedActivityPropCalls], [true, true, tracedActivityPropCalls]);
  // Lô giao dịch: chi phí cố định của một lần gọi GAS không tăng theo số khách trong lô.
  const lo5 = await fullPipeline(true, 'read', { customers: 5 }), lo50 = await fullPipeline(true, 'read', { customers: 50 });
  const chiPhiLo = (run) => [run.fullActivitySheetReads.length, run.fullActivitySheetReads[0].reads, run.fullActivitySheetReads[0].writes, run.fullActivityPropCalls[0]];
  check(so, 'lô 5 khách và lô 50 khách: cùng một lần gọi GAS cho cả trang, cùng số lần đọc mỗi Sheet, cùng số lần ghi Sheet Activity, cùng số lần gọi kho; đủ giao dịch của mọi khách',
    [chiPhiLo(lo5), lo5.fullLocal.activity.length, lo50.fullLocal.activity.length, lo50.fullBatches.length, lo50.fullBatches[0].items.length, lo50.fullStep.status.phase], [chiPhiLo(lo50), 5, 50, 1, 50, 'done']);
  // Một khách lỗi HTTP giữa lô: khách khác vẫn ghi; giao dịch đã có của khách lỗi không bị đánh "không thấy bên FBM" vì chưa được quét.
  const loiHttp = { ok: false, status: 500, headers: {}, body: JSON.stringify({ d: { Bugs: { Message: 'Lỗi máy chủ FBM' } } }) };
  const giaoDichCu = { id: 'ACT-000099', fbmId: 'FBM-A3', recordStatus: 'active', syncStatus: 'đã đồng bộ' };
  const coKhachLoi = await fullPipeline(false, 'read', { customers: 5, failing: { 'FBM-C3': loiHttp }, localActivity: [giaoDichCu] });
  const khachLoiStatus = coKhachLoi.fullFlow.hop.FbmSync.statusView(), khachLoiLog = coKhachLoi.fullLogs.find((event) => event.action === 'activity_customer_failed') || {};
  const khachLoiUi = taoBoTest();
  const khachLoiTheLoi = JSON.stringify(khachLoiUi.hop.fbmSyncRecordIssueBlocks(khachLoiStatus.metadata));
  check(so, 'khách lỗi giữa lô: các khách khác vẫn ghi, lượt kết thúc "done" kèm số khách lỗi, Log và Sidebar có mã khách, lượt không đánh giao dịch "không thấy bên FBM"', [
    khachLoiStatus.phase, coKhachLoi.fullLocal.activity.filter((item) => item.fbmId !== 'FBM-A3').map((item) => item.fbmId).sort(), (coKhachLoi.fullLocal.activity.find((item) => item.id === 'ACT-000099') || {}).syncStatus,
    khachLoiLog.detail && khachLoiLog.detail.customer, khachLoiLog.detail && khachLoiLog.detail.status, String(khachLoiLog.reason || '').indexOf('Lỗi máy chủ FBM') >= 0,
    coKhachLoi.fullLogs.some((event) => event.action === 'activity_missing_skipped'), khachLoiStatus.metadata.customerErrors.total,
    khachLoiStatus.message.indexOf('1 khách lỗi khi đọc giao dịch') >= 0, khachLoiTheLoi.indexOf('Khách lỗi giao dịch ALT00003') >= 0
  ], ['done', ['FBM-A1', 'FBM-A2', 'FBM-A4', 'FBM-A5'], 'đã đồng bộ', 'ALT00003', 500, true, true, 1, true, true]);
  // Một phần tử nghi phiên (401) giữa lô: cả lô không ghi, đi probe; cursor giữ nguyên nên dựng lại đúng lô.
  const nghiPhien = await fullPipeline(false, 'read', { customers: 5, failing: { 'FBM-C3': { ok: false, status: 401, headers: {}, body: '' } } });
  const nghiState = nghiPhien.fullFlow.hop.FbmSync.stateRead(), nghiResume = nghiPhien.fullFlow.hop.FbmSync.sessionGateMeta(nghiState).resumeCursor || {};
  const khoaLo = (request) => (request && request.items || []).map((item) => item.body.externalKey[0].Value);
  check(so, 'phần tử nghi phiên giữa lô: không ghi giao dịch nào của lô, request kế là probe phiên, cursor giữ dựng lại đúng lô cũ', [
    nghiPhien.fullWrites.filter((item) => item.entity === 'activity').length, nghiPhien.fullKinds.slice(-2), nghiState.lastFailureCode,
    khoaLo(nghiPhien.fullFlow.hop.FbmSync.requestForCursor(Object.assign({}, nghiState, { cursor: nghiResume })))
  ], [0, ['batch:activity', 'session_probe:user'], 'SESSION_SUSPECTED_LIVE', khoaLo(nghiPhien.fullBatches[0])]);
  // Response lô lệch kế hoạch: id lạ là lỗi hợp đồng cả lô; phần tử thiếu (Extension dừng vì trần dung lượng) xếp lại lô sau.
  const idLa = await fullPipeline(false, 'read', { customers: 5, editBatch: (raw) => Object.assign(raw, { items: raw.items.map((item, index) => index === 1 ? Object.assign({}, item, { id: '99' }) : item) }) });
  const idLaState = idLa.fullFlow.hop.FbmSync.stateRead();
  const thieu = await fullPipeline(false, 'read', { customers: 5, editBatch: (raw, lan) => lan === 1 ? Object.assign(raw, { items: raw.items.slice(0, 3) }) : raw });
  check(so, 'lô có id lạ thì dừng phiên FBM_BATCH_ITEM_MISMATCH, không ghi giao dịch, Log ghi; lô thiếu phần tử thì phần thiếu được xếp lại lô sau và đủ giao dịch', [
    idLaState.phase, idLaState.lastFailureCode, idLa.fullWrites.filter((item) => item.entity === 'activity').length, idLa.fullLogs.some((event) => event.action === 'activity_batch_mismatch'),
    thieu.fullBatches.map(khoaLo), thieu.fullLocal.activity.length, thieu.fullStep.status.phase
  ], ['error', 'FBM_BATCH_ITEM_MISMATCH', 0, true, [['FBM-C1', 'FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5'], ['FBM-C4', 'FBM-C5']], 5, 'done']);
  const nhieuTrang = await fullPipeline(false, 'read', { customers: 120, scanCustomerRows: 50 });
  check(so, 'quét toàn bộ nhiều trang Customer: số trang tăng dần, khóa trang đúng dạng FBM, ghi đủ khách và giao dịch, phiên kết thúc done; cả lượt chỉ một khách lấy kèm tiêu đề cột', [
    nhieuTrang.activityItemTypes.filter((type) => type === 0).length, nhieuTrang.activityItemTypes.length, nhieuTrang.customerPageIndexes, nhieuTrang.fullLocal.customer.length, nhieuTrang.fullLocal.activity.length, nhieuTrang.fullStep.status.phase, nhieuTrang.fullStep.status.lastFailureCode || ''
  ], [1, 120, [[-1, -1], [1, 0], [2, 1]], 120, 120, 'done', '']);
  const tieuDeLoi = await fullPipeline(false, 'read', { customers: 5, failing: { 'FBM-C1': loiHttp } });
  check(so, 'khách giữ tiêu đề cột bị lỗi: các khách còn lại xếp sang lô sau, lô sau có đúng một khách lấy tiêu đề, đủ giao dịch của khách còn lại', [
    tieuDeLoi.fullBatches.map(khoaLo), tieuDeLoi.activityItemTypes, tieuDeLoi.fullLocal.activity.map((item) => item.fbmId).sort(), tieuDeLoi.fullStep.status.phase
  ], [[['FBM-C1', 'FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5'], ['FBM-C2', 'FBM-C3', 'FBM-C4', 'FBM-C5']], [1, 1, 1, 1, 0, 1, 1, 1], ['FBM-A2', 'FBM-A3', 'FBM-A4', 'FBM-A5'], 'done']);
  const tranGiaoDich = await fullPipeline(false, 'read', { customers: 3, activityCustomerRows: 1, localActivity: [{ id: 'ACT-000077', fbmId: 'FBM-A-CU', recordStatus: 'active', syncStatus: 'đã đồng bộ' }] });
  check(so, 'khách chạm trần giao dịch một lần đọc: ghi phần đã đọc, báo lỗi khách FBM_ACTIVITY_PAGE_LIMIT ở Sidebar và Log, không đánh dấu giao dịch cũ là không thấy bên FBM', [
    tranGiaoDich.fullLocal.activity.map((item) => [item.fbmId, item.recordStatus]), tranGiaoDich.fullStep.status.phase, tranGiaoDich.fullStep.status.metadata.customerErrors.recent.map((item) => item.code),
    tranGiaoDich.fullLogs.filter((event) => /activity_customer_failed|activity_missing/.test(event.action)).map((event) => [event.action, event.detail && event.detail.code || ''])
  ], [[['FBM-A-CU', 'active'], ['FBM-A1', null], ['FBM-A2', null], ['FBM-A3', null]], 'done', ['FBM_ACTIVITY_PAGE_LIMIT', 'FBM_ACTIVITY_PAGE_LIMIT', 'FBM_ACTIVITY_PAGE_LIMIT'],
    [['activity_customer_failed', 'FBM_ACTIVITY_PAGE_LIMIT'], ['activity_customer_failed', 'FBM_ACTIVITY_PAGE_LIMIT'], ['activity_customer_failed', 'FBM_ACTIVITY_PAGE_LIMIT'], ['activity_missing_skipped', '']]]);
  const lechCot = await fullPipeline(false, 'read', { customers: 5, cutColumn: 'FBM-C3' });
  check(so, 'trang không tiêu đề có số cột khác tiêu đề đã lưu: dừng phiên FBM_GRID_SHAPE_CHANGED, không ghi giao dịch nào, Sidebar và Log đều báo', [
    lechCot.fullLocal.activity.length, lechCot.fullStep.status.phase, lechCot.fullStep.status.lastFailureCode, lechCot.fullStep.status.message.indexOf('số cột khác 11 cột') >= 0,
    lechCot.fullLogs.some((event) => event.action === 'activity_batch_mismatch' && event.detail.code === 'FBM_GRID_SHAPE_CHANGED')
  ], [0, 'error', 'FBM_GRID_SHAPE_CHANGED', true, true]);
  // Chạy lại: ghi lại cùng lô không tạo dòng trùng; mất tab giữa lượt thì lượt mới quét lại từ đầu, không đánh vắng mặt nhầm.
  const chayLai = await fullPipeline(false, 'read', { customers: 5, rounds: 2 });
  const matTab = await fullPipeline(false, 'read', { customers: 5, rounds: 2, loseTab: true });
  const daDanhVang = (run) => run.fullLocal.activity.concat(run.fullLocal.customer).filter((item) => item.syncStatus === 'không thấy bên FBM').length;
  check(so, 'chạy lại cùng lô không tạo dòng trùng; mất tab ở lô đầu thì lượt đó dừng lỗi, lượt sau quét lại cả lượt, không trùng dòng và không đánh vắng mặt nhầm', [
    chayLai.fullLocal.customer.length, chayLai.fullLocal.activity.length, daDanhVang(chayLai), chayLai.fullStep.status.phase,
    matTab.fullStatuses.some((status) => status && status.phase === 'error'), matTab.fullLocal.customer.length, matTab.fullLocal.activity.length, daDanhVang(matTab), matTab.fullStep.status.phase, matTab.fullBatches.length
  ], [5, 5, 0, 'done', true, 5, 5, 0, 'done', 2]);

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
        ViewPage: { Fields: ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'].map((AliasName) => ({ AliasName })) }
      } });
    }
    const throughExtension = await sendThroughExecutor(request, body);
    readStep = readFlow.hop.FbmSync.continue(executorRaw(throughExtension.reply, request.id));
  }
  check(so, 'phiên rỗng: Extension chỉ chuyển request đọc, không phát request ghi hoặc xóa và pipeline kết thúc', [
    readKinds, readKinds.length, readKinds.every((kind) => ['session_probe:user', 'authorize:customer', 'authorize:activity', 'completion:@CAT_TINH_THANH', 'completion:@CAT_NGUON_KH', 'completion:@CAT_CONG_VIEC', 'scan_job:customer', 'customer_count:customer'].indexOf(kind) >= 0), readStep.ok, readStep.request || null, readStep.status.phase, readFlow.hop.FbmSync.stateRead().counts.succeeded
  ], [[
     'session_probe:user', 'authorize:customer', 'authorize:activity', 'scan_job:customer', 'customer_count:customer'
  ], 5, true, true, null, 'done', 0]);

  // Extension cũ không ghi mã hợp đồng vào response; trang Customer có khách thật vẫn không được đi tới cửa ghi Sheet.
  const contractRun = async (contract) => {
    const logs = [];
    const flow = workflowGas({ logEvent: (event) => { logs.push(event); } });
    let sheetWrites = 0;
    flow.hop.FbmSync.prepareCategoryGate = () => ({ map: {} });
    flow.hop.FbmSync.bindingWrite({ spreadsheetId: 'sheet-workflow', userId: '2037', username: 'ANHLT', accountName: 'Le Tuan Anh' });
    flow.hop.FbmSync.pullWrite = (entity, records) => { sheetWrites += records.length; return { ok: true, written: records.length, conflicts: 0, skipped: 0 }; };
    flow.hop.FbmSync.markMissingAfterFullScan = () => { sheetWrites += 1; return { total: 0, written: 0 }; };
    flow.hop.FbmSync.statePatch({ session: { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' } });
    const fields = ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dc_lh', 'dien_thoai', 'email', 'website', 'ten_dclh_tinh', 'ten_nguon_dm', 'ten_sp', 'ten_cv', 'ngay_gd', 'datetime0', 'xorder'];
    let step = flow.hop.FbmSync.start({ mode: 'read', origin: 'manual', manual: true }), last = step;
    for (let hop = 0; step && step.request && hop < 12; hop += 1) {
      const request = step.request, grid = request.meta.kind === 'scan_job';
      let body = userResponse;
      if (request.meta.kind === 'authorize') { body = JSON.stringify({ d: { Authorized: 'auth-' + request.meta.entity } }); }
      if (grid) { body = gridResponse(fields, [row(fields, { stt_rec_kh: 'KH-REC-1', ma_kh: 'KH001', ten_kh: 'Khách thử' })], 1); }
      const raw = executorRaw((await sendThroughExecutor(request, body)).reply, request.id);
      if (grid) { raw.transport.contract = contract; }
      step = flow.hop.FbmSync.continue(raw); last = step;
      if (grid) { break; }
    }
    return { last, logs, sheetWrites, state: flow.hop.FbmSync.stateRead() };
  };
  const oldExtension = await contractRun(undefined), sameContract = await contractRun(MA_HOP_DONG);
  const mismatchLog = oldExtension.logs.find((event) => event.action === 'extension_contract_mismatch') || {};
  check(so, 'Extension lệch mã hợp đồng: GAS dừng phiên, không ghi Sheet, Sidebar nhận lỗi và Log ghi "Extension trên máy này đang dùng bản cũ, hãy tải lại Extension"', [
    oldExtension.last.ok, oldExtension.last.code, oldExtension.last.request, oldExtension.sheetWrites,
    oldExtension.last.status.phase, String(oldExtension.last.status.lastError || '').indexOf('Extension trên máy này đang dùng bản cũ, hãy tải lại Extension') >= 0,
    mismatchLog.reason, mismatchLog.detail && mismatchLog.detail.received, oldExtension.state.activeRequestId,
    sameContract.sheetWrites > 0
  ], [false, 'FBM_EXTENSION_CONTRACT_MISMATCH', null, 0, 'error', true, 'Extension trên máy này đang dùng bản cũ, hãy tải lại Extension.', '(Extension không gửi mã)', '', true]);

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
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: stopStarted.request.id }] }
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
    transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: masterStarted.request.id }] }
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
  const staleResult = stale.hop.FbmSync.continue({ ok: true, status: 200, body: userResponse, transport: { contract: MA_HOP_DONG, trace: [{ stage: 'executor_response_sent', requestId: 'old-request' }] } });
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

  // State do bản cũ ghi (chưa có schemaVersion) mà đang giữa lượt: dù request còn trong hạn, lượt phải dừng và báo chạy lại, dấu chờ đẩy ở khóa riêng còn nguyên.
  for (const [phase, cursorKind] of [['pull_activity', 'activity_grid'], ['awaiting_approval', 'push_plan'], ['push', 'push_wait']]) {
    const nhatKy = [];
    const cu = workflowGas({ logEvent: (row) => nhatKy.push(row) });
    const legacy = cu.hop.FbmSync.stateDefault();
    delete legacy.schemaVersion; legacy.version = 1;
    Object.assign(legacy, { runId: 'legacy-run', phase, cursor: { kind: cursorKind }, activeRequestId: 'req-dang-bay', deadlineAt: Date.now() + 60000, updatedAt: Date.now(), startedAt: Date.now() });
    cu.documentProperties.setProperty(cu.hop.FbmSync.STATE_KEY, JSON.stringify(legacy));
    cu.documentProperties.setProperty('FBM_SYNC_PENDING_PUSHES_V1', JSON.stringify({ 'customer:CUS-000001': { hash: 'h-cho' } }));
    const trangThai = cu.hop.fbmGetSyncStatus();
    const luu = JSON.parse(cu.documentProperties.getProperty(cu.hop.FbmSync.STATE_KEY));
    check(so, 'Lượt dở do bản cũ ghi (' + phase + ') bị dừng, báo chạy lại ở Sidebar và Log, giữ dấu chờ đẩy, state ghi lại theo phiên bản mới', [
      trangThai.phase, trangThai.lastFailureCode, /chạy lại lượt/.test(String(trangThai.lastError || '')), luu.schemaVersion, luu.version, cu.documentProperties.getProperty('FBM_SYNC_PENDING_PUSHES_V1'),
      nhatKy.some((row) => /chạy lại lượt/.test(JSON.stringify(row)))
    ], ['error', 'SYNC_STATE_MIGRATED', true, cu.hop.FbmSync.STATE_SCHEMA_VERSION, undefined, JSON.stringify({ 'customer:CUS-000001': { hash: 'h-cho' } }), true]);
  }
  // Sổ bước trong Log phải theo đúng thứ tự xảy ra: bước đã xong đóng ngay khi luồng chuyển chặng, vấn đề theo bản ghi đứng trước dòng đóng bước và dòng đóng phiên.
  const soBuoc = (mode) => {
    const nhatKy = [], ghi = (row) => nhatKy.push(row.action);
    const luong = workflowGas({ logEvent: ghi, logTrace: ghi });
    // Bộ dựng chung không nạp sổ bước vì các ca khác không xét Log theo bước.
    napServer(luong.hop, 'fbm_sync/diagnostic/Trace.js');
    const F = luong.hop.FbmSync, st = F.stateStart('', 'pull_customer', 0);
    st.mode = mode;
    ['run', 'pull_customer', 'reconcile_customer'].forEach((key) => F.businessStepStart(st, key, { mode }));
    return { nhatKy, F, st };
  };
  const conTrang = soBuoc('read');
  conTrang.F.activityForCustomers(conTrang.st, [{ sttRec: 'S1', maKh: 'K1' }], { body: { gridPageIndex: 1, gridPageValue: [], pageItems: null, count: 50 } }, 50);
  const hetKhach = soBuoc('read');
  hetKhach.F.activityForCustomers(hetKhach.st, [{ sttRec: 'S1', maKh: 'K1' }], null, 0);
  hetKhach.F.recordIssueAdd('pull', 'activity', 'synced', 'ACT-1', 'Nối lại mã khách', 'warn');
  hetKhach.st.phase = 'done'; hetKhach.F.stateWrite(hetKhach.st);
  const viTri = (log, action) => log.indexOf(action);
  check(so, 'Log sổ bước: còn trang khách thì bước khách để mở; hết danh sách thì bước khách đóng trước khi bước giao dịch mở; cảnh báo bản ghi đứng trước dòng đóng phiên', [
    !conTrang.st.metadata.businessSteps.pull_customer.finishedAt,
    viTri(hetKhach.nhatKy, 'reconcile_customer_finished') >= 0 && viTri(hetKhach.nhatKy, 'reconcile_customer_finished') < viTri(hetKhach.nhatKy, 'pull_activity_started'),
    viTri(hetKhach.nhatKy, 'pull_record_issue') >= 0 && viTri(hetKhach.nhatKy, 'pull_record_issue') < viTri(hetKhach.nhatKy, 'reconcile_activity_finished'),
    viTri(hetKhach.nhatKy, 'reconcile_activity_finished') < viTri(hetKhach.nhatKy, 'sync_session_finished')
  ], [true, true, true, true]);
  const sangDay = soBuoc('write');
  ['pull_activity', 'reconcile_activity'].forEach((key) => sangDay.F.businessStepStart(sangDay.st, key, {}));
  sangDay.F.stopPushOnConflicts = () => false; sangDay.F.pullMarkMissing = () => true;
  sangDay.F.nextPushRequest = (state) => { sangDay.F.businessStepStart(state, 'push_customer', {}); return null; };
  sangDay.F.pullFinishOrPush(sangDay.st, {});
  check(so, 'Log sổ bước: lượt hai chiều đóng mọi bước Lấy trước khi mở bước đẩy', ['pull_customer_finished', 'reconcile_customer_finished', 'pull_activity_finished', 'reconcile_activity_finished'].every((action) => viTri(sangDay.nhatKy, action) >= 0 && viTri(sangDay.nhatKy, action) < viTri(sangDay.nhatKy, 'push_customer_started')), true);
}

module.exports = { chay, workflowGas, executorSession, executorRaw, sendBatchThroughExecutor, gridResponse, row };
