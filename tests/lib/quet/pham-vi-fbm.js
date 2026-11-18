/** Phạm vi mã nguồn đồng bộ FBM mà các phép quét kiến trúc dùng chung (luật cứng và hàm không ai gọi): một chỗ khai, để thêm tệp vào phạm vi thì mọi phép quét cùng thấy. */

const fs = require('fs');
const path = require('path');
const { lietTrong } = require('./liet-tep');

const REPO = path.join(__dirname, '..', '..', '..');

/** Phạm vi quét, tính từ gốc repo. `kind` quyết định quy tắc nào áp: gas, client hoặc ext. */
const SCOPE = [
  { kind: 'gas', dir: '1_ShinCRM_GAS/fbm_sync', exts: ['.js'] },
  { kind: 'gas', file: '1_ShinCRM_GAS/server/service/FbmSyncService.js' },
  { kind: 'client', dir: '1_ShinCRM_GAS/client/sync', exts: ['.html', '.js'] },
  { kind: 'client', dir: '1_ShinCRM_GAS/client/schema/sync', exts: ['.html', '.js'] },
  { kind: 'ext', file: '2_ShinCRM_Extension/background/service_worker.js' },
  { kind: 'ext', file: '2_ShinCRM_Extension/background/credential_vault.js' },
  { kind: 'ext', dir: '2_ShinCRM_Extension/content_scripts/fbm_sync', exts: ['.js'] },
  { kind: 'ext', file: '2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js' }
];

/** Tệp có đuôi thuộc `exts` trong `dir` (tính từ gốc repo), đường dẫn tính từ gốc repo. */
function listFiles(dir, exts) {
  return lietTrong(REPO, dir, (ten) => exts.indexOf(path.extname(ten)) >= 0);
}

/** Mọi tệp trong phạm vi, kèm `kind`; trả thêm danh sách đường dẫn cấu hình mà không tồn tại. */
function collectFiles() {
  const files = [];
  const missing = [];
  SCOPE.forEach((entry) => {
    const target = entry.dir || entry.file;
    if (!fs.existsSync(path.join(REPO, target))) { missing.push(target); return; }
    if (entry.file) { files.push({ file: entry.file, kind: entry.kind }); }
    else { listFiles(entry.dir, entry.exts).forEach((file) => files.push({ file: file, kind: entry.kind })); }
  });
  return { files: files, missing: missing };
}

const readSource = (file) => fs.readFileSync(path.join(REPO, file), 'utf8');

module.exports = { REPO, SCOPE, listFiles, collectFiles, readSource };
