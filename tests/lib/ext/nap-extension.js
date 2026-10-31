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

/** Dựng hộp với `globals`, chạy tệp `ten` trong đó, trả hộp. Truyền `hop` đã dựng để nạp thêm tệp vào cùng hộp. */
function napExtension(ten, globals, hop) {
  const h = hop || vm.createContext(Object.assign({ console: console }, globals || {}));
  vm.runInContext(docTepExt(ten), h, { filename: TEP_EXT[ten] });
  return h;
}

module.exports = { EXT_DIR, TEP_EXT, duongDanExt, docTepExt, manifestThat, napExtension };
