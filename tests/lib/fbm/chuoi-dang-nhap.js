/**
 * Chuỗi đăng nhập thật ba phía cho test chốt K8: GAS thật (hộp cát) ↔ worker Extension thật ↔ executor thật trong tab FBM giả. FBM giả trả lời theo đường dẫn và ghi lại mọi request nó nhận, để test biết mật khẩu có thật sự đi tới FBM (test không rỗng) và soi mọi chỗ khác.
 * Chỉ dựng và chạy; test tự quyết soi gì.
 */
const nodeCrypto = require('crypto');
const { workflowGas } = require('./hop-dong-bo');
const { workerNap, chayLuot } = require('./worker-nap');
const { napExtension, manifestThat } = require('../ext/nap-extension');

const SHEET = 'sheet-workflow';
const MAY = 'may-K8';
const md5 = (value) => nodeCrypto.createHash('md5').update(String(value), 'utf8').digest('hex');

/** FBM giả: salt cố định, trang tài khoản mang giá trị kiểm khóa trang đúng với mật khẩu; `loginReply` là thân trả cho POST Login; `hetPhien` thì lưới User trả "chưa xác thực" như phiên đã hết, cho tới khi có POST Login. */
function fbmGia(password, loginReply, hetPhien) {
  const salt = 'ab12cd34', cookie = 'pc-k8', pageKey = md5(md5(salt) + md5(password));
  const requests = [];
  let conHetPhien = !!hetPhien;
  const pages = {
    '/Main/Login.aspx': () => '<script>var o = {"ChallengeScript":"eval(\\u0027ab12\\u0027+\\u0027cd34\\u0027)"};</script>',
    '/Main/Login.aspx/GetEntityData': () => '{"d":[{"Ma_DL":"FHN_CRM_App"}]}',
    '/Main/Login.aspx/GetUnitData': () => '{"d":[{"Ma_Dvcs":"CTY"}]}',
    '/Main/Login.aspx/Login': () => { conHetPhien = false; return loginReply || '{"d":true}'; },
    '/Main/zccrAccount.aspx': () => '<script>var a = {"salt":"' + md5(pageKey + cookie) + '\\t","cookie":"' + cookie + '"};</script>',
    // Sau Login GAS hỏi authorize rồi đọc dòng User để đối chiếu danh tính đã lưu.
    '/AppService/FastBusiness.ReportExtenderService.asmx/GetDirViewPage': () => '{"d":{"Authorized":"auth-k8"}}',
    '/AppService/FastBusiness.ReportExtenderService.asmx/GetGridViewPage': () => (conHetPhien ? '{"d":{"Authorized":false,"Rows":[]}}' : JSON.stringify({ d: { TotalRowCount: 1, Rows: [['2037', 'k8user', 'K8 Demo']], ViewPage: { Fields: [{ AliasName: 'id' }, { AliasName: 'name' }, { AliasName: 'ten' }] } } }))
  };
  function handle(url, init) {
    const path = new URL(String(url)).pathname, body = init && init.body !== undefined ? String(init.body) : '';
    requests.push({ path, body });
    const text = pages[path] ? pages[path]() : '{"d":{}}';
    return Promise.resolve({ ok: true, status: 200, url: String(url), headers: { get: () => 'application/json; charset=utf-8' }, arrayBuffer: () => Promise.resolve(new TextEncoder().encode(text).buffer) });
  }
  return { handle, requests, salt, cookie, pageKey, loginHash: md5(salt + md5(password)) };
}

/** Executor thật trong tab FBM giả: `fetch` đi tới FBM giả, `localStorage` là một bảng để test đọc khóa trang. */
function tabGia(fbm) {
  let listener = null;
  const localStore = {}, MANIFEST = manifestThat();
  const storage = (bag) => ({ getItem: (k) => (Object.prototype.hasOwnProperty.call(bag, k) ? bag[k] : null), setItem: (k, v) => { bag[k] = String(v); }, removeItem: (k) => { delete bag[k]; }, clear: () => { Object.keys(bag).forEach((k) => delete bag[k]); } });
  napExtension('executor', {
    console: { log() {}, warn() {} }, Date, URL, Promise, Error, AbortController, setTimeout, clearTimeout, Blob, Response, TextDecoder, TextEncoder, DecompressionStream: undefined,
    // Trang FBM đang mở mang mã và tên người đăng nhập theo đúng mẫu GAS bắt (`pageIdentity`).
    document: { documentElement: { innerHTML: '{"cookie":"abcd2037wxyz1FHN_CRM_App","username":"K8 Demo"}', textContent: '' }, readyState: 'complete' },
    localStorage: storage(localStore), sessionStorage: storage({}),
    fetch: (url, init) => fbm.handle(url, init),
    chrome: { runtime: { getManifest: () => MANIFEST, onMessage: { addListener(fn) { listener = fn; }, removeListener() {} } } }
  });
  const execute = (message) => new Promise((resolve) => { listener(message, null, resolve); });
  return { execute, localStore };
}

/**
 * Dựng ba phía. `gasReplies` gom mọi câu GAS trả worker, `logs` mọi dòng Log, `gas.documentProperties.data` kho thuộc tính; worker gửi gì lên GAS nằm ở `worker.st.bodies`.
 */
function chuoiDangNhap(opt) {
  const o = opt || {}, logs = [], gasReplies = [];
  const gas = workflowGas({ logEvent: (row) => logs.push(row), logTrace: (row) => logs.push(row) });
  const fbm = fbmGia(o.password, o.loginReply, o.hetPhien), tab = tabGia(fbm);
  const worker = workerNap({
    storage: { fbmSpreadsheetId: SHEET, fbmMachineId: MAY },
    gas: (body) => { const reply = gas.hop.FbmSync.relayHandle(body); gasReplies.push(reply); return reply; },
    tab: { execute: tab.execute }
  });
  const sendWorker = (message) => new Promise((resolve) => { worker.st.worker(message, null, resolve); });
  return { gas, worker, fbm, tab, logs, gasReplies, sendWorker, chayLuot: () => chayLuot(worker.ctx), SHEET, MAY, md5 };
}

module.exports = { chuoiDangNhap };
