/**
 * Hàm khai trong mã đồng bộ FBM (GAS `fbm_sync/`, Sidebar `client/sync`, Extension) mà không mã chạy thật nào nhắc tới tên là mã chết: test gọi nó không tính, vì test chỉ giữ cho mã chết trông như còn sống.
 *
 * "Nhắc tới" là tên đứng riêng ở bất kỳ đâu trong `1_ShinCRM_GAS/` và `2_ShinCRM_Extension/` ngoài chỗ khai (gọi thẳng, truyền làm tham số, chuỗi tên hàm của trigger, `google.script.run`, `DEV_RUNNER_ALLOWED`). Phép dò rộng tay: tên trùng một từ khác thì coi như còn dùng, nên chỉ bắt được hàm chết thật chứ không báo nhầm.
 * Không có danh sách ngoại lệ: hàm chết thì xóa. Chỉ tên mà nền tảng Apps Script tự gọi theo tên mới được bỏ qua.
 */

const { section, check } = require('../../lib/assert');
const { stripComments } = require('../../lib/strip-comments');
const { lietTrong } = require('../../lib/quet/liet-tep');
const { REPO, collectFiles, readSource } = require('../../lib/quet/pham-vi-fbm');

/** Tên Apps Script tự gọi (Web App, trigger đơn giản), không mã nào gọi chúng bằng tên. */
const PLATFORM_ENTRY = ['doGet', 'doPost', 'onOpen', 'onEdit', 'onInstall', 'onSelectionChange'];
/** Ba dạng khai: `function ten(`, `A.b.ten = function`, `var|let|const ten = function | (..) => | x =>`. */
const DEFINITION = /(?:^|[^\w.$])function\s+([A-Za-z_$][\w$]*)\s*\(|(?:^|[^\w$])(?:[A-Za-z_$][\w$]*\.)+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?function\b|(?:var|let|const)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s+)?(?:function\b|\([^)]*\)\s*=>|[A-Za-z_$][\w$]*\s*=>)/g;

function definedNames(source) {
  const names = [];
  const re = new RegExp(DEFINITION.source, 'g');
  let match;
  while ((match = re.exec(source)) !== null) { names.push(match[1] || match[2] || match[3]); }
  return names;
}

function mentions(name, sources) {
  const re = new RegExp('(?<![\\w$])' + name.replace(/\$/g, '\\$') + '(?![\\w$])', 'g');
  return sources.reduce((total, source) => total + (source.match(re) || []).length, 0);
}

/** `{ tệp: [tên] }` của hàm trong `files` mà cả kho mã chỉ nhắc tên một lần (chính chỗ khai). */
function unusedFunctions(files, sourceOf, corpus) {
  const out = {};
  files.forEach((file) => {
    const dead = definedNames(sourceOf(file)).filter((name) => PLATFORM_ENTRY.indexOf(name) < 0 && mentions(name, corpus) <= 1);
    if (dead.length) { out[file] = dead; }
  });
  return out;
}

function chay(so) {
  section('Hàm không ai gọi trong mã đồng bộ FBM');
  const code = (ten) => /\.(?:js|html|json)$/.test(ten);
  const allFiles = lietTrong(REPO, '1_ShinCRM_GAS', code).concat(lietTrong(REPO, '2_ShinCRM_Extension', code));
  const stripped = {};
  allFiles.forEach((file) => { stripped[file] = stripComments(readSource(file)); });
  const corpus = allFiles.map((file) => stripped[file]);
  const scoped = collectFiles().files.map((item) => item.file);
  check(so, 'mọi tệp trong phạm vi quét đều thuộc kho mã được dò lời gọi', scoped.filter((file) => !stripped[file]), []);
  check(so, 'mọi hàm khai trong GAS fbm_sync, Sidebar đồng bộ và Extension đều có mã chạy thật nhắc tới (không có ngoại lệ)', unusedFunctions(scoped, (file) => stripped[file], corpus), {});

  section('Hàm không ai gọi — kiểm chính phép dò trên mã mẫu');
  const sample = 'function a() { b(); }\nfunction b() {}\nFbmSync.c = function () {};\nvar d = (x) => x;\nconst e = function () {};\nfunction doGet() {}\n// function f() {}\n';
  const sampleCorpus = [stripComments(sample), 'a(); "e";'];
  check(so, 'khai bốn dạng mà không ai gọi thì bị bắt; gọi thẳng, nhắc trong chuỗi và tên nền tảng thì không; hàm trong comment không tính',
    unusedFunctions(['m.js'], () => stripComments(sample), sampleCorpus), { 'm.js': ['c', 'd'] });
}

module.exports = { chay };
