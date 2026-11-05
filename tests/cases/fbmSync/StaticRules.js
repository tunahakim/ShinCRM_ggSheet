/**
 * Quét mã nguồn đồng bộ FBM (GAS `fbm_sync/`, Sidebar `client/sync`, Extension) theo quy tắc kiến trúc cứng; ngoại lệ chỉ được co lại.
 *
 * Mỗi quy tắc là hàm thuần `(đường dẫn, mã đã bỏ comment) => [{ line, text }]`; vi phạm hiện có là ngoại lệ (tệp -> số). Đỏ khi có vi phạm mới, số ghi lớn hơn số thật (phải hạ) hoặc tệp đã hết vi phạm (xóa dòng).
 * Bỏ comment trước khi quét, giữ số dòng và chuỗi ký tự (nhiều quy tắc đọc chuỗi).
 */

const fs = require('fs');
const path = require('path');
const { section, check } = require('../../lib/assert');
const { stripComments } = require('../../lib/strip-comments');
const { compareExceptions } = require('../../lib/quet/ngoai-le');

const REPO = path.join(__dirname, '..', '..', '..');

/** Phạm vi quét, tính từ gốc repo. `kind` quyết định quy tắc nào áp: gas, client hoặc ext. */
const SCOPE = [
  { kind: 'gas', dir: '1_ShinCRM_GAS/fbm_sync', exts: ['.js'] },
  { kind: 'gas', file: '1_ShinCRM_GAS/server/service/FbmSyncService.js' },
  { kind: 'client', dir: '1_ShinCRM_GAS/client/sync', exts: ['.html', '.js'] },
  { kind: 'client', dir: '1_ShinCRM_GAS/client/schema/sync', exts: ['.html', '.js'] },
  { kind: 'ext', file: '2_ShinCRM_Extension/background/service_worker.js' },
  { kind: 'ext', dir: '2_ShinCRM_Extension/content_scripts/fbm_sync', exts: ['.js'] },
  { kind: 'ext', file: '2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js' }
];

/** Tên phase lấy từ `fbm_sync/state/State.js` (ACTIVE_PHASES, TERMINAL_PHASES, `idle`, `awaiting_approval`); chỉ tệp đó được giữ danh sách phase. */
const PHASE_NAMES = ['idle', 'checking_session', 'waiting_session', 'pull_customer', 'pull_activity', 'reconcile', 'push', 'awaiting_approval', 'done', 'error', 'paused', 'conflict'];
const PHASE_OWNER = '1_ShinCRM_GAS/fbm_sync/state/State.js';

/** Tệp cổng kho DocumentProperties của luồng FBM: chỉ nó được `setProperty`/`deleteProperty` trực tiếp. */
const PROPERTY_GATE_FILES = ['1_ShinCRM_GAS/fbm_sync/state/PropertyBuffer.js'];

/**
 * Tệp được nhắc tới bí mật phiên FBM (`cookie`, `customerAuthorized`, `activityAuthorized`): nơi đọc duy nhất (`scriptSettings`), các bộ dựng request đặt chúng vào body gửi FBM, các nơi ghi phiên và lớp gỡ cuối ở cửa ra.
 * Cửa ra không lọc theo tên trường nên đây là chỗ chặn bí mật lọt vào kết quả, Log hay thông báo: tệp mới cần biết phiên đã có chưa thì hỏi `sessionAuthorized`.
 */
const SESSION_SECRET_FILES = [
  '1_ShinCRM_GAS/fbm_sync/read/GridRead.js', '1_ShinCRM_GAS/fbm_sync/write/RequestBuilders.js', '1_ShinCRM_GAS/fbm_sync/state/State.js',
  '1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js', '1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js', '1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js',
  '1_ShinCRM_GAS/fbm_sync/control/ControlPort.js'
];

/** Người điều phối (thiết kế 2.3): khung lượt, lệnh dừng, khung lát, lần hỏi của Extension và cửa lệnh. Chỉ chúng được đọc/ghi state và ghi `logEvent`; chỗ gọi khác là ngoại lệ. */
const STATE_ORCHESTRATORS = ['state/Run', 'state/RunStop', 'state/Slice', 'state/Heartbeat', 'control/ControlPort'].map((ten) => '1_ShinCRM_GAS/fbm_sync/' + ten + '.js');
// Thêm bước đóng lời gọi `fbm_sync`, người điều phối các lệnh cài đặt và hàm chuyển cài đặt một lần.
const LOG_WRITERS = STATE_ORCHESTRATORS.concat(['1_ShinCRM_GAS/server/service/FbmSyncService.js', '1_ShinCRM_GAS/fbm_sync/control/SettingsCommands.js', '1_ShinCRM_GAS/fbm_sync/state/FbmSettingsMigrate.js']);

/** Tệp được ghi baseline (`fbmHash`): tương lai chỉ pushResultApply, pullPageApply, conflictSettle; hiện để trống. */
const BASELINE_WRITERS = [];

function lineAt(source, index) { return source.slice(0, index).split('\n').length; }

/** Gom mọi chỗ khớp của một regex thành danh sách `{ line, text }`; `accept` (nếu có) lọc bớt chỗ khớp không phải vi phạm. */
function matchAll(source, regex, accept) {
  const re = new RegExp(regex.source, regex.flags.indexOf('g') >= 0 ? regex.flags : regex.flags + 'g');
  const lines = source.split('\n');
  const found = [];
  let match;
  while ((match = re.exec(source)) !== null) {
    if (match[0] === '') { re.lastIndex += 1; continue; }
    if (accept && !accept(match, source)) { continue; }
    const line = lineAt(source, match.index);
    found.push({ line: line, text: String(lines[line - 1] || '').trim().slice(0, 140) });
  }
  return found;
}

const EMPTY_VALUE = "(?:null|undefined|\\{\\}|\\[\\]|''|\"\"|false)";
const SWALLOW_BODY = '\\{\\s*(?:return\\s*(?:' + EMPTY_VALUE + ')?\\s*;?\\s*)?\\}';
const SWALLOW_FN = 'function\\s*\\w*\\s*\\([^)]*\\)\\s*' + SWALLOW_BODY;
const SWALLOW_ARROW = '(?:\\([^)]*\\)|\\w+)\\s*=>\\s*(?:' + SWALLOW_BODY + '|\\(?\\s*' + EMPTY_VALUE + '\\s*\\)?)';

const notDefinition = (match, source) => !/function\s+$/.test(source.slice(Math.max(0, match.index - 12), match.index));

const RULES = [
  {
    // Đọc hay ghi thẳng kho ô lượt là đường tạo ra bản thứ hai bên cạnh bản của lát; chỉ cửa đọc/ghi trong State.js được dùng.
    id: 'stateStoreDirect', title: 'chỉ State.js đọc/ghi thẳng kho ô lượt', scope: ['gas'], allow: [PHASE_OWNER],
    find: (file, src) => matchAll(src, /\bstate(?:Load|Store)\s*\(/, notDefinition)
  },
  {
    id: 'stateReadWrite', title: 'đọc/ghi state chỉ ở người điều phối', scope: ['gas', 'client', 'ext'], allow: STATE_ORCHESTRATORS,
    find: (file, src) => matchAll(src, /\bstate(?:Read|Write)\s*\(/, notDefinition)
  },
  {
    id: 'silentError', title: 'không có lỗi im lặng (catch rỗng, .catch nuốt lỗi)', scope: ['gas', 'client', 'ext'], allow: [],
    find: (file, src) => matchAll(src, /(?<![.\w])catch\s*(?:\([^)]*\))?\s*\{\s*\}/)
      .concat(matchAll(src, new RegExp('\\.catch\\s*\\(\\s*(?:' + SWALLOW_FN + '|' + SWALLOW_ARROW + ')\\s*\\)')))
      .sort((a, b) => a.line - b.line)
  },
  {
    id: 'typeofFunction', title: 'không dò hàm bằng typeof', scope: ['gas', 'client', 'ext'], allow: [],
    find: (file, src) => matchAll(src, /typeof\s+[^;&|?\n]*?[!=]==?\s*['"]function['"]|['"]function['"]\s*[!=]==?\s*typeof\b/)
  },
  {
    id: 'phaseList', title: 'danh sách phase chỉ nằm trong State.js', scope: ['gas', 'client', 'ext'], allow: [PHASE_OWNER],
    find: (file, src) => matchAll(src, /\[[^\[\]]*\]/, (match) => PHASE_NAMES.filter((name) => new RegExp('([\'"])' + name + '\\1').test(match[0])).length >= 2)
  },
  {
    id: 'propertyWrite', title: 'ghi DocumentProperties chỉ qua cổng kho', scope: ['gas', 'client', 'ext'], allow: PROPERTY_GATE_FILES,
    find: (file, src) => matchAll(src, /\.(?:setProperty|setProperties|deleteProperty|deleteAllProperties)\s*\(/)
  },
  {
    id: 'sessionSecret', title: 'bí mật phiên FBM chỉ nhắc ở các tệp được phép', scope: ['gas', 'client', 'ext'], allow: SESSION_SECRET_FILES,
    find: (file, src) => matchAll(src, /\b(?:customerAuthorized|activityAuthorized)\b|\.cookie\b|\bcookie\s*:/)
  },
  {
    id: 'popup', title: 'không popup trình duyệt', scope: ['client', 'ext'], allow: [],
    find: (file, src) => matchAll(src, /(?:window\.|(?<![\w$.]))(?:alert|confirm)\s*\(/, notDefinition)
  },
  {
    id: 'kindBranch', title: 'Extension không rẽ nhánh theo loại việc', scope: ['ext'], allow: [],
    find: (file, src) => matchAll(src, /\bkind\s*[!=]==?(?!=)/)
  },
  {
    id: 'hardcodedNumber', title: 'không con số nghiệp vụ cứng sau || và ??', scope: ['client', 'ext'], allow: [],
    find: (file, src) => matchAll(src, /(?:\|\||\?\?)\s*-?\d[\d._]*/, (match) => !/^(?:\|\||\?\?)\s*0$/.test(match[0].trim()) && !/^(?:\|\||\?\?)\s*0\.0*$/.test(match[0].trim()))
  },
  {
    id: 'logEvent', title: 'logEvent chỉ ở người điều phối lát', scope: ['gas'], allow: LOG_WRITERS,
    find: (file, src) => matchAll(src, /\blogEvent\s*\(/, notDefinition)
  },
  {
    // Mọi đường kết thúc lượt đi qua `runClose`/`runFail`: đặt thẳng phase cuối thì bỏ qua việc đóng bước, nhả sổ bận và loại request đang bay.
    id: 'phaseClose', title: 'phase cuối chỉ đặt trong runClose', scope: ['gas'], allow: STATE_ORCHESTRATORS,
    find: (file, src) => matchAll(src, /\.phase\s*=\s*'(?:done|error|paused|conflict)'/)
  },
  {
    id: 'baselineWrite', title: 'baseline (fbmHash) chỉ được ghi ở ba công cụ áp kết quả', scope: ['gas'], allow: BASELINE_WRITERS,
    // Khóa trong literal `fbmHash: giá_trị` (trừ khai báo schema `fbmHash: {`) và phép gán `.fbmHash = ` (không phải so sánh).
    find: (file, src) => matchAll(src, /\bfbmHash\s*:(?!\s*\{)|\.fbmHash\s*=(?!=)/)
  },
  {
    id: 'sessionVerify', title: 'xác minh phiên chỉ qua sessionVerifiedApply', scope: ['gas'], allow: ['1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js'], find: (file, src) => matchAll(src, /\bsessionIdentityVerify\s*\(/, notDefinition)
  }
];

/** Danh sách ngoại lệ hiện có, mỗi quy tắc một bảng `tệp -> số vi phạm`. Chỉ được co lại. */
const EXCEPTIONS = {
  stateReadWrite: {
    '1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js': 14,
    '1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js': 1,
    '1_ShinCRM_GAS/fbm_sync/read/GridRead.js': 1,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js': 12,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 1,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js': 1,
    '1_ShinCRM_GAS/fbm_sync/report/PreflightPush.js': 1,
    '1_ShinCRM_GAS/fbm_sync/report/Report.js': 4,
    '1_ShinCRM_GAS/fbm_sync/state/State.js': 2,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js': 7,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityScan.js': 6,
    '1_ShinCRM_GAS/fbm_sync/transport/CustomerCount.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/EntryPoints.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js': 43,
    '1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js': 28,
    '1_ShinCRM_GAS/fbm_sync/transport/ScanJob.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js': 30,
    '1_ShinCRM_GAS/fbm_sync/write/PushCandidates.js': 2,
    '1_ShinCRM_GAS/fbm_sync/write/SheetSave.js': 1
  },
  silentError: {
    '2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js': 3
  },
  typeofFunction: {
    '1_ShinCRM_GAS/client/sync/fbmSync.html': 57,
    '1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html': 12,
    '1_ShinCRM_GAS/client/sync/fbmSyncSettingsScreen.html': 1,
    '1_ShinCRM_GAS/client/sync/fbmSyncShell.html': 4,
    '1_ShinCRM_GAS/client/sync/fbmSyncStatusScreen.html': 1,
    '1_ShinCRM_GAS/client/sync/fbmSyncUiSchema.html': 1,
    '1_ShinCRM_GAS/client/sync/screens/run.html': 1,
    '1_ShinCRM_GAS/fbm_sync/SyncSchema.js': 1,
    '1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js': 4,
    '1_ShinCRM_GAS/fbm_sync/read/GridRead.js': 1,
    '1_ShinCRM_GAS/fbm_sync/reconcile/CategoryGate.js': 3,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js': 2,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 12,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js': 1,
    '1_ShinCRM_GAS/fbm_sync/report/Preflight.js': 4,
    '1_ShinCRM_GAS/fbm_sync/report/Report.js': 7,
    '1_ShinCRM_GAS/fbm_sync/state/PropertyBuffer.js': 1,
    '1_ShinCRM_GAS/fbm_sync/state/Scheduler.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js': 6,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityScan.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/CustomerCount.js': 2,
    '1_ShinCRM_GAS/fbm_sync/transport/EntryPoints.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js': 33,
    '1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js': 23,
    '1_ShinCRM_GAS/fbm_sync/transport/ScanJob.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js': 7,
    '1_ShinCRM_GAS/fbm_sync/write/PushCandidates.js': 1,
    '2_ShinCRM_Extension/background/service_worker.js': 11,
    '2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js': 3
  },
  phaseList: {
    '1_ShinCRM_GAS/client/sync/fbmSync.html': 2,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 1,
    '1_ShinCRM_GAS/fbm_sync/schema/FbmFields.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js': 1
  },
  propertyWrite: {
    '1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js': 7,
    '1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js': 3,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 14,
    '1_ShinCRM_GAS/fbm_sync/state/FbmSettingsMigrate.js': 2,
    '1_ShinCRM_GAS/fbm_sync/state/State.js': 13,
    '1_ShinCRM_GAS/fbm_sync/transport/CustomerCount.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/EntryPoints.js': 2
  },
  popup: {
    '1_ShinCRM_GAS/client/sync/fbmSync.html': 3,
    '1_ShinCRM_GAS/client/sync/fbmSyncConfigEditor.html': 1
  },
  kindBranch: {
    '2_ShinCRM_Extension/content_scripts/bridge/iframe_bridge.js': 3,
    '2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js': 7
  },
  hardcodedNumber: {
    '2_ShinCRM_Extension/background/service_worker.js': 4,
    '2_ShinCRM_Extension/content_scripts/fbm_sync/executor.js': 1
  },
  logEvent: {
    '1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js': 2,
    '1_ShinCRM_GAS/fbm_sync/diagnostic/Trace.js': 1,
    '1_ShinCRM_GAS/fbm_sync/read/ActivityLayers.js': 2,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js': 2,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 1,
    '1_ShinCRM_GAS/fbm_sync/report/Preflight.js': 1,
    '1_ShinCRM_GAS/fbm_sync/report/Report.js': 3,
    '1_ShinCRM_GAS/fbm_sync/state/PropertyBuffer.js': 1,
    '1_ShinCRM_GAS/fbm_sync/state/Scheduler.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityScan.js': 3,
    '1_ShinCRM_GAS/fbm_sync/transport/CustomerCount.js': 2,
    '1_ShinCRM_GAS/fbm_sync/transport/EntryPoints.js': 5,
    '1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js': 3,
    '1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/ScanJob.js': 4,
    '1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js': 2
  },
  // Còn lại: Giữ phiên và đăng nhập tự động chạy ngoài lượt (B6 viết thành heartbeatRun mở lượt riêng), chuyển trạng thái xung đột sau khi lượt đóng, và đối tượng status (không phải ô lượt).
  phaseClose: {
    '1_ShinCRM_GAS/fbm_sync/auth/AutoLogin.js': 5,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js': 3,
    '1_ShinCRM_GAS/fbm_sync/report/Report.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/ActivityBatch.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/PullFlow.js': 7,
    '1_ShinCRM_GAS/fbm_sync/transport/ScanJob.js': 1,
    '1_ShinCRM_GAS/fbm_sync/transport/TransportCore.js': 5
  },
  baselineWrite: {
    '1_ShinCRM_GAS/fbm_sync/reconcile/Conflict.js': 1,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Identity.js': 3,
    '1_ShinCRM_GAS/fbm_sync/reconcile/Pull.js': 8,
    '1_ShinCRM_GAS/fbm_sync/transport/PushFlow.js': 5
  }
};

function listFiles(root, exts, prefix) {
  const files = [];
  fs.readdirSync(root, { withFileTypes: true }).forEach((entry) => {
    const relative = prefix + '/' + entry.name;
    if (entry.isDirectory()) { files.push(...listFiles(path.join(root, entry.name), exts, relative)); }
    else if (entry.isFile() && exts.indexOf(path.extname(entry.name)) >= 0) { files.push(relative); }
  });
  return files;
}

/** Mọi tệp trong phạm vi, kèm `kind`; trả thêm danh sách đường dẫn cấu hình mà không tồn tại. */
function collectFiles() {
  const files = [];
  const missing = [];
  SCOPE.forEach((entry) => {
    const target = entry.dir || entry.file;
    if (!fs.existsSync(path.join(REPO, target))) { missing.push(target); return; }
    if (entry.file) { files.push({ file: entry.file, kind: entry.kind }); }
    else { listFiles(path.join(REPO, entry.dir), entry.exts, entry.dir).forEach((file) => files.push({ file: file, kind: entry.kind })); }
  });
  return { files: files, missing: missing };
}

/** Chạy một quy tắc trên mọi tệp thuộc phạm vi của nó; trả `{ tệp: [vi phạm] }` chỉ gồm tệp có vi phạm và không nằm trong danh sách được phép. */
function scanRule(rule, files, readSource) {
  const out = {};
  files.filter((item) => rule.scope.indexOf(item.kind) >= 0 && rule.allow.indexOf(item.file) < 0).forEach((item) => {
    const found = rule.find(item.file, stripComments(readSource(item.file)));
    if (found.length) { out[item.file] = found; }
  });
  return out;
}

function ruleById(id) { return RULES.filter((rule) => rule.id === id)[0]; }
const hits = (id, file, source) => ruleById(id).find(file, stripComments(source)).length;

function chay(so) {
  section('Quét quy tắc kiến trúc FBM — ngoại lệ chỉ được co lại');

  const { files, missing } = collectFiles();
  check(so, 'mọi đường dẫn trong phạm vi quét đều tồn tại', missing, []);
  check(so, 'phạm vi quét có tệp để quét', files.length > 0, true);
  const readSource = (file) => fs.readFileSync(path.join(REPO, file), 'utf8');

  [PHASE_OWNER].concat(PROPERTY_GATE_FILES, SESSION_SECRET_FILES, STATE_ORCHESTRATORS, LOG_WRITERS, BASELINE_WRITERS).forEach((file) => {
    check(so, 'tệp được phép ' + file + ' có trong phạm vi quét', files.some((item) => item.file === file), true);
  });

  RULES.forEach((rule) => {
    const actual = scanRule(rule, files, readSource);
    check(so, 'quy tắc ' + rule.id + ' (' + rule.title + '): không vi phạm mới, ngoại lệ không thừa', compareExceptions(rule.id, actual, EXCEPTIONS[rule.id] || {}), []);
  });

  section('Quét quy tắc kiến trúc FBM — kiểm chính phép quét trên mã mẫu');
  check(so, 'catch rỗng bị bắt', hits('silentError', 'f.js', 'try { a(); } catch (e) {}'), 1);
  check(so, 'catch không tham số, thân chỉ có khoảng trắng bị bắt', hits('silentError', 'f.js', 'try { a(); } catch {\n }'), 1);
  check(so, 'catch có ghi log và ném lại không bị bắt', hits('silentError', 'f.js', 'try { a(); } catch (e) { logEvent(e); throw e; }'), 0);
  check(so, 'catch rỗng nằm trong comment bị bỏ qua', hits('silentError', 'f.js', '// try { a(); } catch (e) {}\n/* catch (e) {} */'), 0);
  check(so, '.catch nuốt lỗi bằng null, hàm rỗng hay mảng rỗng đều bị bắt', hits('silentError', 'f.js', 'p.catch(() => null); p.catch(function () {}); p.catch(() => {}); p.catch((e) => []); p.catch(function (e) { return false; });'), 5);
  check(so, '.catch có xử lý thật không bị bắt', hits('silentError', 'f.js', 'p.catch((e) => { report(e); return null; });'), 0);
  check(so, '`//` trong chuỗi không bị coi là comment', hits('typeofFunction', 'f.js', 'var u = "http://x"; if (typeof y === "function") { go(); }'), 1);
  check(so, 'typeof so với function bằng cả hai kiểu nháy và toán tử lỏng đều bị bắt', hits('typeofFunction', 'f.js', "typeof X === \"function\"; typeof a.b !== 'function'; typeof c == 'function'; typeof d != \"function\";"), 4);
  check(so, 'typeof so với kiểu khác không bị bắt', hits('typeofFunction', 'f.js', "typeof X === 'undefined'"), 0);
  check(so, 'rẽ nhánh theo kind trong Extension bị bắt', hits('kindBranch', 'f.js', "if (job.kind === 'scan') { go(); }"), 1);
  check(so, 'gán kind không bị bắt như rẽ nhánh', hits('kindBranch', 'f.js', "var job = { kind: 'scan' }; job.kind = 'x';"), 0);
  check(so, 'danh sách phase thứ hai ngoài State.js bị bắt, một phase lẻ thì không', [hits('phaseList', 'f.js', "var a = ['done', 'error'];"), hits('phaseList', 'f.js', "var a = ['done', 'other'];")], [1, 0]);
  check(so, 'ghi DocumentProperties trực tiếp bị bắt', hits('propertyWrite', 'f.js', 'props.setProperty(k, v); props.deleteProperty(k);'), 2);
  check(so, 'popup trần và window.* bị bắt, phương thức của đối tượng khác thì không', hits('popup', 'f.js', "alert('x'); window.confirm('y'); ui.alert('z'); function alert() {}"), 2);
  check(so, 'số cứng sau || và ?? bị bắt, số 0 thì không', hits('hardcodedNumber', 'f.js', 'var a = x || 5; var b = y ?? 30000; var c = z || 0;'), 2);
  check(so, 'ghi baseline bằng khóa literal và phép gán bị bắt, đọc, so sánh và khai báo schema thì không', hits('baselineWrite', 'f.js', "w.push({ fbmHash: h }); r.fbmHash = h; if (r.fbmHash === h) {} var x = r.fbmHash || ''; var s = { fbmHash: { code: 'A' } };"), 2);
  check(so, 'stateWrite bị bắt, khai báo hàm thì không', hits('stateReadWrite', 'f.js', 'FbmSync.stateWrite({}); var s = stateRead(); function stateWrite(x) {}'), 2);
  check(so, 'logEvent và gọi sessionIdentityVerify bị bắt, khai báo thì không', [hits('logEvent', 'f.js', "logEvent({ a: 1 });"), hits('sessionVerify', 'f.js', 'F.sessionIdentityVerify(s, i); F.sessionIdentityVerify = function (s, i) {};')], [1, 1]);
  check(so, 'đặt phase cuối ngoài runClose bị bắt', [hits('phaseClose', 'f.js', "state.phase = 'done';"), hits('phaseClose', 'f.js', "if (state.phase === 'done') {}")], [1, 0]);

  section('Quét quy tắc kiến trúc FBM — phép so ngoại lệ chỉ cho co lại');
  const fakeLines = (n) => Array.from({ length: n }, (v, i) => ({ line: i + 1, text: 'x' }));
  check(so, 'đúng số đã ghi thì đạt', compareExceptions('r', { 'a.js': fakeLines(2) }, { 'a.js': 2 }), []);
  check(so, 'số đã ghi lớn hơn số thật thì đỏ và yêu cầu hạ số', compareExceptions('r', { 'a.js': fakeLines(1) }, { 'a.js': 3 }), ['r: a.js đã giảm, hạ số trong danh sách ngoại lệ xuống 1']);
  check(so, 'tệp trong danh sách mà hết vi phạm thì đỏ và yêu cầu xóa', compareExceptions('r', {}, { 'a.js': 1 }), ['r: a.js không còn vi phạm, xóa khỏi danh sách ngoại lệ']);
  check(so, 'vi phạm nhiều hơn số đã ghi thì đỏ', compareExceptions('r', { 'a.js': fakeLines(3) }, { 'a.js': 2 }).length, 1);
  check(so, 'tệp có vi phạm mà chưa có trong danh sách thì đỏ', compareExceptions('r', { 'b.js': fakeLines(1) }, {}).length, 1);

  const injected = (file) => file === PHASE_OWNER ? readSource(file) + '\ntry { a(); } catch (e) {}\n' : readSource(file);
  const injectedProblems = compareExceptions('silentError', scanRule(ruleById('silentError'), files, injected), EXCEPTIONS.silentError);
  check(so, 'chèn một catch rỗng vào bản sao State.js thật thì quét đỏ', injectedProblems.length === 1 && injectedProblems[0].indexOf(PHASE_OWNER) >= 0, true);
}

module.exports = { chay, RULES, EXCEPTIONS, collectFiles, scanRule, stripComments, compareExceptions };
