/** Kiểm use case xuyên GAS -> Extension -> GAS theo hợp đồng tài liệu 09. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { WORKFLOWS } = require('../../contracts/fbmSyncPipeline');

const ROOT = path.join(__dirname, '..', '..', '..');
const EXECUTOR = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');

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
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/report/Report.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/write/RequestBuilders.js',
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

async function chay(so) {
  section('FBM sync — workflow theo tài liệu');
  const ids = WORKFLOWS.map((item) => item.id);
  check(so, 'charter workflow co 14 use case doc lap va khong trung ID', [WORKFLOWS.length, new Set(ids).size], [14, 14]);
  check(so, 'charter bao phu relay, nhan dien, nen, ghi, dung va UI/log', WORKFLOWS.map((item) => item.id).sort(), [
    'relay-sidebar-open', 'identity-autofill', 'identity-clear-binding', 'background-noop', 'manual-transport-failure',
    'identity-login-test', 'background-transport-failure', 'master-off-in-flight', 'read-vs-check-write-gate', 'push-write-safety', 'stale-response-and-cancel', 'ui-status-and-log', 'conflict-resolution', 'full-pull-missing'
  ].sort());

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

  const cancelling = workflowGas();
  const cancellingStarted = cancelling.hop.FbmSync.start({ mode: 'check', scan: 'identity_probe', origin: 'manual', manual: true });
  const cancelPending = cancelling.hop.fbmSyncCancel();
  const cancelState = cancelling.hop.FbmSync.stateRead();
  check(so, 'dung khi request dang bay: chi danh dau cho response, khong xoa reservation hay cursor', [
    cancelPending.code, cancelState.activeRequestId === cancellingStarted.request.id, cancelState.cursor.kind, cancelState.metadata.cancelPending
  ], ['SYNC_CANCEL_PENDING', true, 'identity_user_grid', true]);
}

module.exports = { chay };
