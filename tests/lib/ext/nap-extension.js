/**
 * Nạp một tệp của Extension vào hộp cát riêng, với các biến toàn cục mà tệp đó có trong trình duyệt.
 *
 * Vì sao một chỗ: trước đây mỗi tệp ca tự đọc tệp Extension và tự dựng hộp, mỗi bản một bộ biến toàn cục khác nhau (có bản có `Uint8Array`, `btoa`, có bản không), nên cùng một tệp Extension được kiểm trên những trình duyệt giả khác nhau. Đường dẫn tệp cũng khai một lần ở đây.
 *
 * `globals` là phần riêng của cảnh thử (`window`, `chrome`, `fetch` giả...). `console` luôn có vì trình duyệt thật luôn có; các lớp dựng sẵn của JavaScript (`WeakSet`, `Uint8Array`...) hộp `vm` tự có.
 */

const fs = require('fs');
const path = require('path');
const vm = require('vm');

const EXT_DIR = path.join(__dirname, '..', '..', '..', '2_ShinCRM_Extension');

/** Tệp Extension mà test nạp, theo tên ngắn. Thêm tệp thì thêm một dòng ở đây. */
const TEP_EXT = {
  manifest: 'manifest.json',
  serviceWorker: 'background/service_worker.js',
  credentialVault: 'background/credential_vault.js',
  bridge: 'content_scripts/bridge/iframe_bridge.js',
  scout: 'content_scripts/scout/sheet_scout.js',
  executor: 'content_scripts/fbm_sync/executor.js',
  liveModelReader: 'content_scripts/model/live_model_reader.js',
  bindWatcher: 'content_scripts/model/bind_watcher.js'
};

function duongDanExt(ten) {
  if (!Object.prototype.hasOwnProperty.call(TEP_EXT, ten)) { throw new Error('Tệp Extension "' + ten + '" chưa khai trong TEP_EXT của tests/lib/ext/nap-extension.js.'); }
  const day = path.join(EXT_DIR, TEP_EXT[ten]);
  if (!fs.existsSync(day)) { throw new Error('Không thấy tệp Extension ' + TEP_EXT[ten] + '. Đã đổi tên hoặc xóa thì sửa TEP_EXT.'); }
  return day;
}

function docTepExt(ten) {
  return fs.readFileSync(duongDanExt(ten), 'utf8');
}

/** `manifest.json` thật, để Chrome giả trả đúng phiên bản Extension đang có trong repo. */
function manifestThat() {
  return JSON.parse(docTepExt('manifest'));
}

/** Tệp `importScripts` của service worker nạp, theo thứ tự trong mã (đường dẫn tính từ gốc Extension như Chrome). */
function tepWorkerNap() {
  return (docTepExt('serviceWorker').match(/importScripts\(([^)]*)\)/g) || []).map((goi) => goi.match(/'([^']+)'/)[1].replace(/^\//, ''));
}

/** Mã service worker đủ như Chrome chạy: tệp chính cùng các tệp nó `importScripts`. Phép quét chữ đọc bản này, nên chuyển hàm sang tệp nạp kèm không làm phép quét mù. */
function nguonWorkerDu() {
  return [docTepExt('serviceWorker')].concat(tepWorkerNap().map((tep) => fs.readFileSync(path.join(EXT_DIR, tep), 'utf8'))).join('\n');
}

/** Tệp content script đứng trước `ten` trong cùng mục `content_scripts` của manifest: Chrome nạp chúng trước vào cùng tab, nên test cũng nạp như vậy. */
function tepNapTruoc(ten) {
  const muc = (manifestThat().content_scripts || []).find((m) => (m.js || []).indexOf(TEP_EXT[ten]) >= 0);
  return muc ? muc.js.slice(0, muc.js.indexOf(TEP_EXT[ten])) : [];
}

/** Mã content script đủ như tab chạy: các tệp nạp trước nó cùng tệp đó. Phép quét chữ đọc bản này, nên chuyển hàm sang tệp nạp kèm không làm phép quét mù. */
function nguonContentDu(ten) {
  return tepNapTruoc(ten).map((tep) => fs.readFileSync(path.join(EXT_DIR, tep), 'utf8')).concat([docTepExt(ten)]).join('\n');
}

/** Dựng hộp với `globals`, chạy tệp `ten` trong đó, trả hộp. Truyền `hop` đã dựng để nạp thêm tệp vào cùng hộp. Service worker có `importScripts` nạp tệp theo đường dẫn từ gốc Extension; content script nạp kèm các tệp đứng trước nó trong manifest, như trong Chrome. */
function napExtension(ten, globals, hop) {
  const h = hop || vm.createContext(Object.assign({ console: console }, globals || {}));
  if (ten === 'serviceWorker' && typeof h.importScripts !== 'function') {
    h.importScripts = (...tep) => tep.forEach((t) => vm.runInContext(fs.readFileSync(path.join(EXT_DIR, String(t).replace(/^\//, '')), 'utf8'), h, { filename: String(t) }));
  }
  tepNapTruoc(ten).forEach((tep) => vm.runInContext(fs.readFileSync(path.join(EXT_DIR, tep), 'utf8'), h, { filename: tep }));
  vm.runInContext(docTepExt(ten), h, { filename: TEP_EXT[ten] });
  return h;
}

module.exports = { EXT_DIR, TEP_EXT, duongDanExt, docTepExt, manifestThat, napExtension, nguonWorkerDu, nguonContentDu };
