/** Service worker thật của Extension chạy trong vm với Chrome giả, dùng chung cho các tệp kiểm vòng chở lát và quyền trang. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

const ROOT = path.join(__dirname, '..', '..', '..');
const WORKER_FILE = path.join(ROOT, '2_ShinCRM_Extension', 'background', 'service_worker.js');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, '2_ShinCRM_Extension', 'manifest.json'), 'utf8'));
const RELAY_URL = 'https://script.google.com/macros/s/relay-test/exec';
const SHEET = 'sheet-test';

const nghi = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

/**
 * Service worker thật với Chrome giả. `opt.gas(body, lan)` là GAS: trả object JSON, hoặc ném lỗi để giả mạng hỏng. `opt.tab` mô tả tab FBM: `ping` (trả lời ping hay không), `pingAfterReload`, `reloadCompletes`, `inject` (hàm thay `executeScript`), `result(request)` (kết quả executor).
 */
function workerNap(opt) {
  const st = { bodies: [], executes: [], statuses: [], fbmQueries: 0, reloads: 0, injects: 0, worker: null, storage: Object.assign({ fbmWebAppUrl: RELAY_URL, fbmSyncKey: 'relay-key', fbmSpreadsheetId: SHEET }, opt.storage || {}), listeners: [], trails: [], permissionAsks: [] };
  const tab = Object.assign({ id: 5, status: 'complete', autoDiscardable: false }, opt.tab && opt.tab.info || {});
  const tabOpt = opt.tab || {};
  const pingAnswers = () => tabOpt.ping !== false && (tabOpt.ping === true || tabOpt.ping === undefined) ? true : (tabOpt.pingAfterReload && st.reloads > 0);
  const context = {
    console: { log() {}, warn() {}, info() {} }, Date, URL, Promise, Error, AbortController, WeakMap, Uint8Array, setTimeout, clearTimeout,
    crypto: globalThis.crypto || nodeCrypto.webcrypto, btoa, atob,
    chrome: {
      tabs: {
        query(info) {
          const url = String(info && info.url && info.url[0] || '');
          if (url.indexOf('https://fbo.com.vn:8888/') === 0) { st.fbmQueries += 1; return Promise.resolve(opt.noFbmTab ? [] : [tab]); }
          return Promise.resolve([{ id: 90 }]);
        },
        update(tabId, options, done) { setImmediate(() => done(Object.assign({}, tab, options))); },
        reload(tabId, options, done) {
          st.reloads += 1;
          setImmediate(() => { done(); if (tabOpt.reloadCompletes) { setTimeout(() => st.listeners.forEach((fn) => fn(tabId, { status: 'complete' }, { id: tabId, status: 'complete' })), 5); } });
        },
        onUpdated: { addListener(fn) { st.listeners.push(fn); }, removeListener(fn) { st.listeners = st.listeners.filter((item) => item !== fn); } },
        sendMessage(tabId, message, done) {
          if (message.type === 'CRM_BRIDGE_PING') { done({ ready: true }); return; }
          if (message.type === 'CRM_FBM_STATUS') { st.statuses.push(message); done({ delivered: true }); return; }
          if (message.type === 'FBM_PING_V2') { if (pingAnswers()) { done({ ready: true, version: MANIFEST.version }); } else if (tabOpt.pingRefused) { done({ error: 'Could not establish connection. Receiving end does not exist.' }); } return; }
          if (message.type === 'FBM_EXECUTE_V2') { st.executes.push(message.request); done({ result: tabOpt.result ? tabOpt.result(message.request) : { ok: true, status: 200, headers: { contentType: 'application/json' }, body: '{"d":{}}', transport: { trace: [] } } }); }
        }
      },
      scripting: { executeScript() { st.injects += 1; return tabOpt.inject ? tabOpt.inject() : Promise.resolve(); } },
      permissions: { contains(query) { st.permissionAsks.push(query.origins.join(',')); return Promise.resolve(!(opt.blocked || tabOpt.blocked || []).some((origin) => query.origins.indexOf(origin) >= 0)); } },
      runtime: { lastError: null, getManifest: () => MANIFEST, onMessage: { addListener(fn) { st.worker = fn; } }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
      alarms: { create() {}, get(name, done) { done(null); }, clear: () => Promise.resolve(true), onAlarm: { addListener() {} } },
      storage: { local: {
        get(keys, done) { const value = {}; (Array.isArray(keys) ? keys : [keys]).forEach((key) => { if (st.storage[key] !== undefined) { value[key] = st.storage[key]; } }); done(value); },
        set(value, done) { Object.assign(st.storage, value); if (value.fbmChainTrail) { st.trails.push(value.fbmChainTrail.stage + (value.fbmChainTrail.code ? ':' + value.fbmChainTrail.code : '')); } if (done) { done(); } },
        remove(keys, done) { (Array.isArray(keys) ? keys : [keys]).forEach((key) => { delete st.storage[key]; }); if (done) { done(); } }
      } }
    },
    fetch(url, options) {
      const body = JSON.parse(options.body);
      st.bodies.push(body);
      return Promise.resolve().then(() => opt.gas(body, st.bodies.length)).then((reply) => ({ ok: true, status: 200, headers: { get() { return 'application/json'; } }, text() { return Promise.resolve(JSON.stringify(reply)); } }));
    }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(WORKER_FILE, 'utf8'), context, { filename: WORKER_FILE });
  return { ctx: context, st };
}

/** Phong bì GAS cấp: mặc định một request đọc an toàn, đúng miền và đúng mã hợp đồng của worker. */
function phongBi(ctx, id, extra) {
  const base = { protocol: 'shincrm-fbm', id, contract: ctx.FBM_CONTRACT_VERSION, url: 'https://fbo.com.vn:8888/Main/service', bodyText: '{}', meta: { kind: 'session_probe', timeoutMs: 600, fetchMs: 1000, gasReplyMs: 5000 } };
  return Object.assign(base, extra || {}, { meta: Object.assign({}, base.meta, extra && extra.meta || {}) });
}

/** Đánh thức như Sidebar gửi `CRM_FBM_RUN_NOW` sau khi mở lượt tay, chờ vòng chạy hết. */
async function chayLuot(ctx, retryMs) {
  const accepted = await ctx.fbmRunNow(retryMs || []);
  const flight = ctx.relayLoopFlight;
  const ketQua = flight ? await flight : null;
  await nghi(5);
  return { accepted, ketQua };
}

module.exports = { workerNap, phongBi, chayLuot, MANIFEST, SHEET };
