/** Kiểm vòng chở lát duy nhất của Extension (`relayLoop`), cửa gọi GAS duy nhất (`relayCall`), cầu nối trạng thái lượt sang Sidebar và `replyPick` trong tab FBM, bằng hành vi thật của tệp Extension chạy trong vm với Chrome giả. */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');
const { section, check } = require('../../lib/assert');

const ROOT = path.join(__dirname, '..', '..', '..');
const WORKER_FILE = path.join(ROOT, '2_ShinCRM_Extension', 'background', 'service_worker.js');
const BRIDGE_FILE = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'bridge', 'iframe_bridge.js');
const EXECUTOR_FILE = path.join(ROOT, '2_ShinCRM_Extension', 'content_scripts', 'fbm_sync', 'executor.js');
const MANIFEST = JSON.parse(fs.readFileSync(path.join(ROOT, '2_ShinCRM_Extension', 'manifest.json'), 'utf8'));
const SAMPLE_FILE = path.join(ROOT, '0_Documentation', 'Nghiên cứu FBM', 'RequestFBM', 'Lấy trang khách hàng có cả tiêu đề.txt');
const RELAY_URL = 'https://script.google.com/macros/s/relay-test/exec';
const SHEET = 'sheet-test';

const nghi = (ms) => new Promise((resolve) => setTimeout(resolve, ms || 0));

/**
 * Service worker thật với Chrome giả. `opt.gas(body, lan)` là GAS: trả object JSON, hoặc ném lỗi để giả mạng hỏng. `opt.tab` mô tả tab FBM: `ping` (trả lời ping hay không), `pingAfterReload`, `reloadCompletes`, `inject` (hàm thay `executeScript`), `result(request)` (kết quả executor).
 */
function workerNap(opt) {
  const st = { bodies: [], executes: [], statuses: [], fbmQueries: 0, reloads: 0, injects: 0, worker: null, storage: Object.assign({ fbmWebAppUrl: RELAY_URL, fbmSyncKey: 'relay-key', fbmSpreadsheetId: SHEET }, opt.storage || {}), listeners: [], trails: [] };
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

/** Mở lượt tay như Sidebar gửi `CRM_FBM_RUN_NOW`, chờ vòng chạy hết. */
async function chayLuot(ctx, runId, retryMs) {
  const accepted = await ctx.fbmRunNow(runId, retryMs || []);
  const flight = ctx.relayLoopFlight;
  const ketQua = flight ? await flight : null;
  await nghi(5);
  return { accepted, ketQua };
}

async function vongLuotTay(so) {
  // Trọn một lượt: nhận lượt → một request → nộp → GAS không cấp nữa.
  let ctxRef = null;
  const tron = workerNap({
    gas(body, lan) {
      if (lan === 1) { return { ok: true, request: phongBi(ctxRef, 'r1'), status: { runId: 'L1', phase: 'running' }, retryMs: [5, 10] }; }
      return { ok: true, request: null, status: { runId: 'L1', phase: 'done' } };
    }
  });
  ctxRef = tron.ctx;
  const { accepted, ketQua } = await chayLuot(tron.ctx, 'L1', [5, 10]);
  const [nhan, nop] = tron.st.bodies;
  check(so, 'Lượt tay: Sidebar gửi runId, Extension nhận lượt bằng continue{runId} kèm mã máy, chạy đúng một request rồi nộp response về GAS cùng mã máy và Sheet', [
    accepted, nhan.command, nhan.payload.runId, typeof nhan.payload.machineId, nhan.payload.machineId.length > 4, nhan.spreadsheetId, nhan.key, nhan.contract === tron.ctx.FBM_CONTRACT_VERSION,
    tron.st.executes.map((item) => item.id), nop.command, nop.payload.hop, nop.payload.response.status, nop.payload.machineId === nhan.payload.machineId, Object.prototype.hasOwnProperty.call(nop.payload, 'runId'), tron.st.bodies.length, ketQua.ok
  ], [{ ok: true, accepted: true }, 'continue', 'L1', 'string', true, SHEET, 'relay-key', true, ['r1'], 'continue', 1, 200, true, false, 2, true]);
  check(so, 'Mỗi lần GAS trả lời thì chuyển status sang tab Sheets kèm Sheet; chỉ lần GAS không cấp request mới mang done', tron.st.statuses.map((item) => [item.spreadsheetId, item.status.phase, item.done, item.ok]), [[SHEET, 'running', false, true], [SHEET, 'done', true, true]]);
  check(so, 'Mã máy cất trong kho Extension, lần sau dùng lại đúng mã đó', tron.st.storage.fbmMachineId, nhan.payload.machineId);
  check(so, 'Hộp đen ghi đủ chuỗi bước của lượt tay', tron.st.trails, ['gas_request_received', 'fbm_tab_preparing:complete', 'fbm_tab_sent', 'fbm_tab_replied', 'gas_response_sent', 'chain_finished']);

  // Máy khác: GAS từ chối ngay lần nhận lượt.
  const lech = workerNap({ gas() { return { ok: false, code: 'RUN_DRIVER_MISMATCH', error: 'Lượt đang do máy khác chở.', request: null, status: { runId: 'L2', phase: 'running' } }; } });
  const ketQuaLech = (await chayLuot(lech.ctx, 'L2')).ketQua;
  check(so, 'GAS từ chối RUN_DRIVER_MISMATCH: Extension dừng ngay, không tìm và không chạm tab FBM, Sidebar nhận done kèm đúng mã và chữ GAS', [
    ketQuaLech.code, lech.st.bodies.length, lech.st.fbmQueries, lech.st.executes.length, lech.st.statuses.map((item) => [item.done, item.ok, item.code, item.error])
  ], ['RUN_DRIVER_MISMATCH', 1, 0, 0, [[true, false, 'RUN_DRIVER_MISMATCH', 'Lượt đang do máy khác chở.']]]);

  // Response đến sau khi lượt đã đóng (người dùng bấm Dừng, lượt khác đã thay): GAS trả lỗi, Extension không nộp lại, không thử lại.
  let ctxMuon = null;
  const muon = workerNap({
    gas(body, lan) {
      if (lan === 1) { return { ok: true, request: phongBi(ctxMuon, 'r-muon'), status: { runId: 'L3', phase: 'running' }, retryMs: [5, 10] }; }
      return { ok: false, code: 'RUN_NOT_ACTIVE', error: 'Lượt đã đóng.', request: null, status: { runId: 'L3', phase: 'stopped' } };
    }
  });
  ctxMuon = muon.ctx;
  const ketQuaMuon = (await chayLuot(muon.ctx, 'L3', [5, 10])).ketQua;
  check(so, 'Response nộp sau khi lượt đóng bị GAS từ chối: GAS đã trả lời nên không thử lại, không ghi ô lỗi hộp đen; Sidebar nhận done kèm mã GAS; hộp đen ghi bước cuối bị từ chối', [
    ketQuaMuon.code, muon.st.bodies.length, muon.st.storage.fbmExtensionFailure, muon.st.statuses.map((item) => [item.done, item.code]), muon.st.trails[muon.st.trails.length - 1]
  ], ['RUN_NOT_ACTIVE', 2, undefined, [[false, ''], [true, 'RUN_NOT_ACTIVE']], 'gas_reply_failed:RUN_NOT_ACTIVE']);

  // Response hình dạng lạ (trang HTML, trường lạ) đi nguyên về GAS: Extension không phân loại.
  const la = { ok: true, status: 200, headers: { contentType: 'text/html; charset=utf-8' }, body: '<html><form action="Login.aspx"></form></html>', weird: { nested: [1, { a: null }], text: 'ồ' }, transport: { trace: [{ stage: 'fetch_finished' }] } };
  let ctxLa = null;
  const laNap = workerNap({
    tab: { result: () => JSON.parse(JSON.stringify(la)) },
    gas(body, lan) { return lan === 1 ? { ok: true, request: phongBi(ctxLa, 'r-la') } : { ok: true, request: null }; }
  });
  ctxLa = laNap.ctx;
  await chayLuot(laNap.ctx, 'L4');
  const nopLa = laNap.st.bodies[1].payload.response;
  check(so, 'Response hình dạng lạ đi nguyên về GAS: thân, trường lạ, header và vết giữ nguyên, chỉ thêm mã hợp đồng', [
    nopLa.body, nopLa.weird, nopLa.headers, nopLa.status, nopLa.transport.trace, nopLa.transport.contract === laNap.ctx.FBM_CONTRACT_VERSION
  ], [la.body, la.weird, la.headers, 200, la.transport.trace, true]);

  // Không có runId: không mở vòng, không gọi GAS.
  const khongMa = workerNap({ gas() { throw new Error('không được gọi'); } });
  const tuChoi = await khongMa.ctx.fbmRunNow('', []);
  await nghi(5);
  check(so, 'Sidebar gửi chạy mà không có runId: Extension trả RUN_ID_REQUIRED, không gọi GAS', [tuChoi.code, khongMa.st.bodies.length], ['RUN_ID_REQUIRED', 0]);
}

async function tabVaMien(so) {
  const voiPhongBi = (tabOpt, extra) => {
    let ctxRef = null;
    const nap = workerNap({ tab: tabOpt, gas(body, lan) { return lan === 1 ? { ok: true, request: phongBi(ctxRef, 'r', extra) } : { ok: true, request: null }; } });
    ctxRef = nap.ctx;
    return nap;
  };

  const treo = voiPhongBi({ ping: false, reloadCompletes: true });
  const batDau = Date.now();
  await chayLuot(treo.ctx, 'T1');
  const loiTreo = treo.st.bodies[1].payload.error;
  check(so, 'Tab FBM chưa sẵn sàng (không trả lời ping kể cả sau khi tải lại): tải lại đúng một lần, không gửi request, nộp lỗi FBM_TAB_NOT_READY kèm requestId về GAS trong hạn envelope', [
    loiTreo.code, loiTreo.requestId, treo.st.reloads, treo.st.executes.length, treo.st.bodies[1].command, Date.now() - batDau < 2000, treo.ctx.workerKeepAliveTimer, treo.st.listeners.length
  ], ['FBM_TAB_NOT_READY', 'r', 1, 0, 'continue', true, null, 0]);

  const chan = voiPhongBi({ ping: false, pingRefused: true, inject: () => Promise.reject(new Error('Cannot access contents of url "https://fbo.com.vn:8888/Main/". Extension manifest must request permission to access this host.')) });
  await chayLuot(chan.ctx, 'T2');
  const loiChan = chan.st.bodies[1].payload.error;
  check(so, 'Chrome chặn quyền site FBM: báo FBM_SITE_ACCESS_BLOCKED giữ chữ gốc của Chrome, không tải lại tab, không gửi request', [
    loiChan.code, /must request permission/.test(loiChan.message), chan.st.reloads, chan.st.injects, chan.st.executes.length
  ], ['FBM_SITE_ACCESS_BLOCKED', true, 0, 1, 0]);

  const khongTab = workerNap({ noFbmTab: true, gas(body, lan) { return lan === 1 ? { ok: true, request: phongBi(khongTab.ctx, 'r') } : { ok: true, request: null }; } });
  await chayLuot(khongTab.ctx, 'T3');
  check(so, 'Không có tab FBM và GAS không cho mở: nộp FBM_TAB_NOT_FOUND, không gửi request', [khongTab.st.bodies[1].payload.error.code, khongTab.st.executes.length], ['FBM_TAB_NOT_FOUND', 0]);

  const ngoai = voiPhongBi({}, { url: 'https://example.com/steal' });
  await chayLuot(ngoai.ctx, 'T4');
  check(so, 'Phong bì có URL ngoài miền FBM: từ chối FBM_URL_OUTSIDE_SITE trước khi tìm tab, không gửi request', [ngoai.st.bodies[1].payload.error.code, ngoai.st.fbmQueries, ngoai.st.executes.length], ['FBM_URL_OUTSIDE_SITE', 0, 0]);

  const sai = workerNap({ gas() { return { ok: true, request: null }; } }).ctx;
  const req = (extra) => phongBi(sai, 'x', extra);
  const ma = (request) => { const error = sai.envelopeSiteCheck(request); return error ? error.code : ''; };
  check(so, 'Một phép kiểm miền chặn mọi URL trong phong bì: request, phần tử lô, trang mở tab, trang tải lại, trang sau đăng nhập; chặn cả tên miền giả dạng tiền tố', [
    ma(req()), ma(req({ items: [{ id: '0', url: 'https://fbo.com.vn:8888/a' }, { id: '1', url: 'https://evil.test/' }] })), ma(req({ meta: { openFbmContext: { url: 'https://evil.test/' } } })), ma(req({ meta: { reloadFbmPage: 'http://fbo.com.vn:8888/Main/' } })), ma(req({ meta: { afterLoginUrl: 'https://evil.test/' } })),
    ma(req({ url: 'https://fbo.com.vn:8888.evil.test/' })), ma(req({ url: 'https://fbo.com.vn:8888@evil.test/' })), ma(req({ meta: { reloadFbmPage: 'https://fbo.com.vn:8888/Main/zccrAccount.aspx', afterLoginUrl: 'https://fbo.com.vn:8888/Default.aspx' } }))
  ], ['', 'FBM_URL_OUTSIDE_SITE', 'FBM_URL_OUTSIDE_SITE', 'FBM_URL_OUTSIDE_SITE', 'FBM_URL_OUTSIDE_SITE', 'FBM_URL_OUTSIDE_SITE', 'FBM_URL_OUTSIDE_SITE', '']);

  const lechBan = voiPhongBi({}, { contract: 'ban-cu' });
  await chayLuot(lechBan.ctx, 'T5');
  check(so, 'Phong bì mang mã hợp đồng khác: nộp EXTENSION_PROTOCOL_MISMATCH, không tìm tab', [lechBan.st.bodies[1].payload.error.code, lechBan.st.fbmQueries], ['EXTENSION_PROTOCOL_MISMATCH', 0]);
}

async function cuaGoiGas(so) {
  // Mạng hỏng: thử lại theo lịch GAS gửi, hết lượt thì ghi ô lỗi hộp đen và báo Sidebar.
  let lan = 0;
  const hong = workerNap({ gas() { lan += 1; throw new Error('NETWORK_DOWN'); } });
  const ketQuaHong = (await chayLuot(hong.ctx, 'G1', [5, 10])).ketQua;
  const loiSidebar = hong.st.statuses.filter((item) => item.failure).map((item) => item.failure.code);
  check(so, 'Gọi GAS hỏng mạng: thử lại đúng theo lịch retryMs Sidebar chuyển (2 lần), hết lượt thì ghi ô lỗi hộp đen kèm số lần, báo Sidebar và kết thúc hữu hạn', [
    lan, ketQuaHong.code, hong.st.storage.fbmExtensionFailure && [hong.st.storage.fbmExtensionFailure.command, hong.st.storage.fbmExtensionFailure.code, hong.st.storage.fbmExtensionFailure.attempts], loiSidebar, hong.st.trails[hong.st.trails.length - 1]
  ], [3, 'RELAY_FETCH_FAILED', ['relay_continue', 'RELAY_FETCH_FAILED', 3], ['RELAY_FETCH_FAILED'], 'gas_reply_failed:RELAY_FETCH_FAILED']);

  let lan2 = 0;
  const hoi = workerNap({ gas() { lan2 += 1; if (lan2 === 1) { throw new Error('NETWORK_BLIP'); } return { ok: true, request: null, status: { runId: 'G2', phase: 'done' } }; } });
  const ketQuaHoi = (await chayLuot(hoi.ctx, 'G2', [5, 10])).ketQua;
  check(so, 'Gọi GAS hỏng một lần rồi được: lần thử lại mang đúng thân cũ, không ghi ô lỗi, Sidebar nhận done', [lan2, hoi.st.bodies[0].payload.runId === hoi.st.bodies[1].payload.runId, hoi.st.storage.fbmExtensionFailure, ketQuaHoi.ok, hoi.st.statuses.map((item) => item.done)], [2, true, undefined, true, [true]]);

  // Worker vừa khởi động, chưa nhận lịch thử lại: không tự đặt con số, hỏng là ghi ô lỗi ngay.
  let lan3 = 0;
  const moi = workerNap({ gas() { lan3 += 1; throw new Error('NETWORK_DOWN'); } });
  await moi.ctx.fbmHeartbeatNow('test');
  await nghi(5);
  check(so, 'Chưa có lịch thử lại từ GAS: không thử lại, ghi ô lỗi relay_ask một lần', [lan3, moi.st.storage.fbmExtensionFailure && moi.st.storage.fbmExtensionFailure.command], [1, 'relay_ask']);

  // Ô lỗi đi lên GAS ở lần hỏi sau; GAS ghi Log rồi trả trailAck thì xóa đúng ô đó.
  const o = { at: 4242, command: 'relay_continue', code: 'RELAY_TIMEOUT', httpStatus: 0, attempts: 3 };
  const ack = workerNap({ storage: { fbmExtensionFailure: o }, gas(body) { return { ok: true, request: null, trailAck: body.payload.trail && body.payload.trail.relayFailure ? body.payload.trail.relayFailure.at : 0 }; } });
  await ack.ctx.fbmHeartbeatNow('test');
  await nghi(5);
  check(so, 'Lần hỏi mang ô lỗi lên GAS, không mang mã máy vào hộp đen; GAS trả trailAck thì Extension xóa ô', [ack.st.bodies[0].command, ack.st.bodies[0].payload.trail.relayFailure, typeof ack.st.bodies[0].payload.machineId, ack.st.storage.fbmExtensionFailure], ['heartbeat', o, 'string', undefined]);
  const moiHon = { at: 5000, command: 'bridge', code: 'BRIDGE_STATUS_POST_FAILED', httpStatus: 0, attempts: 1 };
  const ackCu = workerNap({ storage: { fbmExtensionFailure: moiHon }, gas() { return { ok: true, request: null, trailAck: 4242 }; } });
  await ackCu.ctx.fbmHeartbeatNow('test');
  await nghi(5);
  check(so, 'trailAck của ô cũ không xóa ô lỗi mới hơn', ackCu.st.storage.fbmExtensionFailure, moiHon);

  // Cầu nối báo hỏng: worker ghi ô lỗi để GAS ghi Log lần hỏi sau.
  const cau = workerNap({ gas() { return { ok: true, request: null }; } });
  const traLoi = await new Promise((resolve) => { cau.st.worker({ type: 'FBM_BRIDGE_FAILURE', code: 'BRIDGE_STATUS_POST_FAILED', message: 'Blocked a frame' }, null, resolve); });
  check(so, 'Worker nhận FBM_BRIDGE_FAILURE thì ghi ô lỗi bridge kèm mã', [traLoi.ok, cau.st.storage.fbmExtensionFailure.command, cau.st.storage.fbmExtensionFailure.code], [true, 'bridge', 'BRIDGE_STATUS_POST_FAILED']);

  const thieu = workerNap({ storage: { fbmWebAppUrl: undefined }, gas() { throw new Error('không được gọi'); } });
  delete thieu.st.storage.fbmWebAppUrl;
  const thieuKetQua = await thieu.ctx.fbmRunNow('G9', []);
  check(so, 'Thiếu cấu hình relay: không nhận lượt, trả RELAY_CONFIG_MISSING, không gọi GAS', [thieuKetQua.code, thieu.st.bodies.length], ['RELAY_CONFIG_MISSING', 0]);
}

/** Cầu nối iframe với Chrome giả: `posts` là tin gửi Sidebar, `toWorker` là tin gửi worker. */
function bridgeNap(spreadsheetId) {
  const windowListeners = [], runtimeListeners = [], toWorker = [];
  const hop = {
    console: { log() {} }, Date, setTimeout, location: { origin: 'https://docs.google.com' },
    readSpreadsheetId: () => spreadsheetId,
    chrome: { runtime: { id: 'shincrm-test', lastError: null, getManifest: () => MANIFEST, onMessage: { addListener(fn) { runtimeListeners.push(fn); } }, sendMessage(message, done) { toWorker.push(message); if (hop.workerReply) { done(hop.workerReply(message)); } } } },
    window: { addEventListener(name, fn) { if (name === 'message') { windowListeners.push(fn); } }, removeEventListener() {} }
  };
  vm.createContext(hop);
  vm.runInContext(fs.readFileSync(BRIDGE_FILE, 'utf8'), hop, { filename: BRIDGE_FILE });
  const posts = [];
  const source = { postMessage(data, origin) { if (hop.postThrows) { throw new Error('Blocked a frame with origin'); } posts.push({ data, origin }); } };
  const origin = 'https://n-abc-0lu-script.googleusercontent.com';
  const sidebar = (data) => windowListeners[0]({ origin, source, data });
  const fromWorker = (message) => { let reply; runtimeListeners.forEach((fn) => fn(message, null, (value) => { reply = value; })); return reply; };
  return { hop, posts, toWorker, sidebar, fromWorker, origin };
}

async function cauNoi(so) {
  const b = bridgeNap(SHEET);
  b.sidebar({ action: 'CRM_HANDSHAKE', nonce: 'n-1' });
  const session = b.hop.extensionSessionId;
  check(so, 'Ping cầu nối trả số bản trong manifest', b.fromWorker({ type: 'CRM_BRIDGE_PING' }), { ready: true, version: MANIFEST.version });
  b.hop.workerReply = (message) => (message.type === 'FBM_RUN_NOW' ? { ok: true, accepted: true } : { ok: false, code: 'RUN_ID_REQUIRED', error: 'thiếu' });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q1', nonce: 'n-1', sessionId: session, runId: 'L1', retryMs: [5, 10], password: 'khong-chep' });
  const traLoi = b.posts[b.posts.length - 1].data;
  check(so, 'Lệnh CRM_FBM_RUN_NOW qua bảng lệnh: worker chỉ nhận đúng trường khai báo; trả lời một dạng kèm nonce và phiên', [
    b.toWorker[0], [traLoi.action, traLoi.id, traLoi.ok, traLoi.result, traLoi.code, traLoi.nonce, traLoi.sessionId === session], b.posts[b.posts.length - 1].origin
  ], [{ type: 'FBM_RUN_NOW', runId: 'L1', retryMs: [5, 10] }, ['CRM_FBM_RUN_NOW_RESULT', 'q1', true, { ok: true, accepted: true }, '', 'n-1', true], b.origin]);
  const truoc = b.toWorker.length;
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q2', nonce: 'sai', sessionId: session, runId: 'L1' });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q3', nonce: 'n-1', sessionId: 'phien-cu', runId: 'L1' });
  check(so, 'Lệnh sai nonce hoặc của phiên Extension cũ không tới worker', b.toWorker.length, truoc);

  const daGui = b.posts.length;
  const giao = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1', phase: 'done' }, code: '', done: true, extra: 'bo' });
  const tin = b.posts[b.posts.length - 1].data;
  check(so, 'Status của đúng Sheet chuyển vào Sidebar với đúng các trường hợp đồng, kèm nonce và phiên', [giao, b.posts.length - daGui, Object.keys(tin).sort(), tin.done, tin.status.runId], [{ delivered: true }, 1, ['action', 'code', 'conflict', 'done', 'error', 'failure', 'nonce', 'ok', 'sessionId', 'status'], true, 'L1']);
  const khac = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: 'sheet-khac', status: { runId: 'X' }, done: true });
  check(so, 'Status của Sheet khác không vào Sidebar này', [khac, b.posts.length - daGui], [{ delivered: false }, 1]);

  b.hop.postThrows = true;
  const hong = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: false });
  const baoHong = b.toWorker[b.toWorker.length - 1];
  check(so, 'Cầu nối gửi Sidebar hỏng: trả delivered false, báo worker FBM_BRIDGE_FAILURE kèm mã và chữ lỗi, không im lặng', [hong, baoHong.type, baoHong.code, /Blocked a frame/.test(baoHong.message)], [{ delivered: false }, 'FBM_BRIDGE_FAILURE', 'BRIDGE_STATUS_POST_FAILED', true]);
  b.hop.postThrows = false;
  const sauHong = b.toWorker.length;
  const lanSau = b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: true });
  b.sidebar({ action: 'CRM_FBM_RUN_NOW', id: 'q4', nonce: 'n-1', sessionId: session, runId: 'L1' });
  check(so, 'Kênh đã hỏng coi như đóng: status sau không gửi, lệnh cũ không tới worker cho tới khi Sidebar bắt tay lại', [lanSau, b.toWorker.length - sauHong], [{ delivered: false }, 0]);
  b.sidebar({ action: 'CRM_HANDSHAKE', nonce: 'n-2' });
  check(so, 'Bắt tay lại thì kênh mở lại', b.fromWorker({ type: 'CRM_FBM_STATUS', spreadsheetId: SHEET, status: { runId: 'L1' }, done: true }), { delivered: true });

  b.hop.workerReply = null;
  b.hop.chrome.runtime.sendMessage = (message, done) => { b.hop.chrome.runtime.lastError = { message: 'Extension context invalidated.' }; done(undefined); b.hop.chrome.runtime.lastError = null; };
  b.sidebar({ action: 'CRM_FBM_MACHINE_ID', id: 'q5', nonce: 'n-2', sessionId: session });
  const loiWorker = b.posts[b.posts.length - 1].data;
  check(so, 'Worker không nhận lệnh (Extension vừa tải lại): Sidebar nhận ok false kèm mã EXTENSION_CONTEXT_INVALIDATED, không treo', [loiWorker.action, loiWorker.ok, loiWorker.code], ['CRM_FBM_MACHINE_ID_RESULT', false, 'EXTENSION_CONTEXT_INVALIDATED']);
}

/** Executor thật trong tab FBM với `fetch` giả trả `response`. */
function executorNap() {
  let listener = null;
  const state = { response: { ok: true, status: 200, text: '{}' } };
  const context = {
    console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout, Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
    document: { documentElement: { innerHTML: '', textContent: '' } },
    fetch() { const r = state.response; return Promise.resolve({ ok: r.ok, status: r.status, headers: { get() { return r.contentType || 'application/json'; } }, arrayBuffer() { return Promise.resolve(new TextEncoder().encode(r.text).buffer); } }); },
    chrome: { runtime: { getManifest: () => MANIFEST, onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
  };
  vm.createContext(context);
  vm.runInContext(fs.readFileSync(EXECUTOR_FILE, 'utf8'), context, { filename: EXECUTOR_FILE });
  const send = (meta) => new Promise((resolve) => listener({ type: 'FBM_EXECUTE_V2', request: { id: 'e', url: 'https://fbo.com.vn:8888/AppService/x', method: 'POST', bodyText: '{}', meta: Object.assign({ kind: 'customer_grid', fetchMs: 5000 }, meta || {}) } }, null, resolve));
  return { state, send };
}

async function chonCot(so) {
  const raw = fs.readFileSync(SAMPLE_FILE, 'utf8');
  const sampleText = raw.slice(raw.indexOf('====== response ========') + '====== response ========'.length).trim();
  const sample = JSON.parse(sampleText).d;
  const names = sample.ViewPage.Fields.map((field) => field.AliasName);
  const keep = { fields: [names[3], names[0], 'CotKhongCo', names[1]] };
  const ex = executorNap();
  ex.state.response = { ok: true, status: 200, text: sampleText };
  const reply = await ex.send({ keep });
  const picked = JSON.parse(reply.result.body).d;
  const mong = sample.Rows.map((row) => [row[3], row[0], row[1]]);
  check(so, 'replyPick trên mẫu lưới khách hàng thật (~80 KB): giữ đúng cột GAS liệt kê theo thứ tự GAS, bỏ cột FBM không có, đủ mọi dòng, giữ TotalRowCount, thân nhỏ hẳn và vết ghi reply_picked', [
    picked.ViewPage.Fields.map((field) => field.AliasName), picked.Rows.length === sample.Rows.length, JSON.stringify(picked.Rows) === JSON.stringify(mong), picked.TotalRowCount, Object.keys(picked).sort(), reply.result.body.length < sampleText.length / 3, reply.result.transport.trace.some((item) => item.stage === 'reply_picked')
  ], [[names[3], names[0], names[1]], true, true, sample.TotalRowCount, ['Rows', 'TotalRowCount', 'ViewPage'], true, true]);

  const login = '<html><body><form action="Login.aspx"><input name="txtUser"></form></body></html>';
  ex.state.response = { ok: true, status: 200, text: login, contentType: 'text/html' };
  const loginReply = await ex.send({ keep });
  ex.state.response = { ok: false, status: 500, text: sampleText };
  const loiReply = await ex.send({ keep });
  ex.state.response = { ok: true, status: 200, text: sampleText };
  const khongKeep = await ex.send({});
  const vo = '{"d":{"Rows":"khong-phai-mang","ViewPage":{}}}';
  ex.state.response = { ok: true, status: 200, text: vo };
  const voReply = await ex.send({ keep });
  check(so, 'Không phải lưới thì đi nguyên về GAS: trang đăng nhập, lưới mang HTTP 500, request không có keep, JSON lưới hỏng dạng', [
    loginReply.result.body === login, loginReply.result.transport.trace.some((item) => item.stage === 'reply_picked'), loiReply.result.body === sampleText, khongKeep.result.body === sampleText, voReply.result.body === vo
  ], [true, false, true, true, true]);
}

async function chay(so) {
  section('FBM sync — vòng chở lát của Extension, cửa gọi GAS, cầu nối trạng thái, replyPick');
  await vongLuotTay(so);
  await tabVaMien(so);
  await cuaGoiGas(so);
  await cauNoi(so);
  await chonCot(so);
}

module.exports = { chay };
