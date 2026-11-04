/** Cầu nối iframe và executor trong tab FBM của Extension thật, chạy trong hộp với Chrome giả; dùng chung cho các tệp kiểm vòng chở lát. */
const { napExtension, manifestThat } = require('../ext/nap-extension');

const MANIFEST = manifestThat();

/** Cầu nối iframe với Chrome giả: `posts` là tin gửi Sidebar, `toWorker` là tin gửi worker. Đặt `hop.workerReply` để worker giả trả lời, `hop.postThrows` để giả trình duyệt chặn `postMessage`. */
function bridgeNap(spreadsheetId) {
  const windowListeners = [], runtimeListeners = [], toWorker = [];
  let hop = null;
  hop = napExtension('bridge', {
    console: { log() {} }, Date, setTimeout, location: { origin: 'https://docs.google.com' },
    readSpreadsheetId: () => spreadsheetId,
    chrome: { runtime: { id: 'shincrm-test', lastError: null, getManifest: () => MANIFEST, onMessage: { addListener(fn) { runtimeListeners.push(fn); } }, sendMessage(message, done) { toWorker.push(message); if (hop.workerReply) { done(hop.workerReply(message)); } } } },
    window: { addEventListener(name, fn) { if (name === 'message') { windowListeners.push(fn); } }, removeEventListener() {} }
  });
  const posts = [];
  const source = { postMessage(data, origin) { if (hop.postThrows) { throw new Error('Blocked a frame with origin'); } posts.push({ data, origin }); } };
  const origin = 'https://n-abc-0lu-script.googleusercontent.com';
  const sidebar = (data) => windowListeners[0]({ origin, source, data });
  const fromWorker = (message) => { let reply; runtimeListeners.forEach((fn) => fn(message, null, (value) => { reply = value; })); return reply; };
  return { hop, posts, toWorker, sidebar, fromWorker, origin };
}

/** Executor thật trong tab FBM với `fetch` giả trả `state.response`; `send(meta)` gửi một request và trả lời executor. */
function executorNap() {
  let listener = null;
  const state = { response: { ok: true, status: 200, text: '{}' } };
  napExtension('executor', {
    console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout, Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
    document: { documentElement: { innerHTML: '', textContent: '' } },
    fetch() { const r = state.response; return Promise.resolve({ ok: r.ok, status: r.status, headers: { get() { return r.contentType || 'application/json'; } }, arrayBuffer() { return Promise.resolve(new TextEncoder().encode(r.text).buffer); } }); },
    chrome: { runtime: { getManifest: () => MANIFEST, onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
  });
  const send = (meta) => new Promise((resolve) => listener({ type: 'FBM_EXECUTE_V2', request: { id: 'e', url: 'https://fbo.com.vn:8888/AppService/x', method: 'POST', bodyText: '{}', meta: Object.assign({ kind: 'customer_grid', fetchMs: 5000 }, meta || {}) } }, null, resolve));
  return { state, send };
}

module.exports = { bridgeNap, executorNap };
