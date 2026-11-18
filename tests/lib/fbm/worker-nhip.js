/** Service worker thật của Extension với Chrome giả cho các ca nhịp nền (`fbmHeartbeatNow`): GAS giả trả lần lượt `relayReplies`, tab FBM giả do `fbmTabs` và `tabReply` quyết định, và đếm số lần tìm tab, mở tab, gửi tin để ca kiểm chốt Extension không làm thừa. */
const vm = require('vm');
const { napExtension } = require('../ext/nap-extension');

function traLoiRelay(value) {
  const body = JSON.stringify(value);
  return { ok: true, status: 200, headers: { get: () => 'application/json' }, text: () => Promise.resolve(body) };
}

function workerNhip(relayReplies, fbmTabs, tabReply) {
  const storage = {
    fbmWebAppUrl: 'https://script.google.com/macros/s/workflow-relay/exec',
    fbmSyncKey: 'workflow-key',
    fbmSpreadsheetId: 'sheet-workflow',
    fbmPollMinutes: 5
  };
  const relayCalls = [];
  let fbmTabQueries = 0;
  let fbmTabCreates = 0;
  let fbmMessages = 0;
  const context = {
    console: { log() {}, warn() {}, info() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout,
    TextEncoder, TextDecoder, Uint8Array, crypto: globalThis.crypto, btoa: (value) => Buffer.from(value, 'binary').toString('base64'), atob: (value) => Buffer.from(value, 'base64').toString('binary'),
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
      scripting: { executeScript: () => Promise.resolve() }, permissions: { contains: () => Promise.resolve(true) },
      runtime: { getManifest: () => ({ version: '22.0' }), lastError: null, onMessage: { addListener() {} }, onInstalled: { addListener() {} }, onStartup: { addListener() {} } },
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
      return Promise.resolve(traLoiRelay(relayReplies.shift() || { ok: false, code: 'RELAY_REPLY_MISSING' }));
    }
  };
  napExtension('serviceWorker', null, vm.createContext(context));
  return { context, relayCalls, storage, metrics: () => ({ fbmTabQueries, fbmTabCreates, fbmMessages }) };
}

module.exports = { workerNhip };
