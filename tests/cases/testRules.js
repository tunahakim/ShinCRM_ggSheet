/**
 * Luật tĩnh cho chính bộ test: môi trường giả chỉ dựng ở `tests/lib/`, mỗi khung một bản, tệp ca không lấy khung của tệp ca khác.
 *
 * Vì sao: khi mỗi tệp ca tự dựng môi trường giả, các bản lệch nhau và lệch môi trường thật, và test xanh trên một môi trường không tồn tại. Luật 2 bắt theo dấu hiệu dựng hộp chứ không theo tên, nên bắt được cả bản chép đã đổi tên mà luật 1 không bắt.
 *
 * Ngoại lệ ghi các chỗ đang có lúc dựng luật, chỉ được co lại (`tests/lib/quet/ngoai-le.js`). Bước nào tách tệp test của mình thì chuyển sang khung chung và hạ số ở đây.
 */

const fs = require('fs');
const path = require('path');
const { section, check } = require('../lib/assert');
const { stripComments } = require('../lib/strip-comments');
const { compareExceptions } = require('../lib/quet/ngoai-le');

const TESTS_DIR = path.join(__dirname, '..');
const LIB_DIR = path.join(TESTS_DIR, 'lib');
const CASES_DIR = path.join(TESTS_DIR, 'cases');

function listJs(dir) {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const day = path.join(dir, e.name);
    if (e.isDirectory()) { return listJs(day); }
    return e.name.endsWith('.js') ? [day] : [];
  });
}

const tuongDoi = (day) => path.relative(TESTS_DIR, day).split(path.sep).join('/');

/** Tệp này chứa mẫu vi phạm dạng chuỗi để tự kiểm luật, nên không quét chính nó. */
const TU_KIEM = 'cases/testRules.js';

/** Mọi tên mà `tests/lib/` xuất ra. */
function tenKhung() {
  const ra = {};
  listJs(LIB_DIR).forEach((tep) => { Object.keys(require(tep)).forEach((ten) => { ra[ten] = tuongDoi(tep); }); });
  return ra;
}

/** Tìm theo từng dòng; `mau(dong)` trả danh sách chuỗi khớp. */
function timTheoDong(source, mau) {
  const ra = [];
  source.split('\n').forEach((dong, i) => { mau(dong).forEach((text) => ra.push({ line: i + 1, text: text })); });
  return ra;
}

const MO_DINH_NGHIA = /\b(?:function\s+([A-Za-z_$][\w$]*)\s*\(|(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=)/g;
const MO_DUNG_HOP = /\bvm\.(?:createContext|runInContext|runInNewContext|Script)\b|\bget(?:Document|User|Script)Properties\s*[:=]|\bchrome\s*[:=]\s*\{|\bnapClient\s*\(/g;
const MO_REQUIRE = /(?:\}\s*=\s*require|require)\(\s*['"](\.{1,2}\/[^'"]+)['"]\s*\)(\.\w+)?/g;

const RULES = [
  {
    id: 'tenKhung',
    moTa: 'tên hàm hoặc hằng mà tests/lib xuất ra không được định nghĩa lại trong tests/cases',
    find: (file, source, ctx) => timTheoDong(source, (dong) => {
      const ra = [];
      let k;
      MO_DINH_NGHIA.lastIndex = 0;
      while ((k = MO_DINH_NGHIA.exec(dong)) !== null) {
        const ten = k[1] || k[2];
        if (Object.prototype.hasOwnProperty.call(ctx.khung, ten)) { ra.push(ten + ' (khung ở ' + ctx.khung[ten] + ')'); }
      }
      return ra;
    })
  },
  {
    id: 'dungHop',
    moTa: 'chỉ tests/lib được dựng môi trường giả (hộp vm, kho thuộc tính, chrome, nạp tệp client tay)',
    find: (file, source) => timTheoDong(source, (dong) => dong.match(MO_DUNG_HOP) || [])
  },
  {
    id: 'requireCa',
    moTa: 'tệp ca không lấy khung từ tệp ca khác; khung dùng chung đặt ở tests/lib',
    find: (file, source) => timTheoDong(source, (dong) => {
      const ra = [];
      let k;
      MO_REQUIRE.lastIndex = 0;
      while ((k = MO_REQUIRE.exec(dong)) !== null) {
        // Chỉ đếm lời gọi lấy tên ra (`{ x } = require(...)` hoặc `require(...).x`); tệp gom nhóm ca chỉ require cả tệp để chạy.
        const layTen = k[0].charAt(0) === '}' || k[2];
        const dich = path.resolve(path.join(TESTS_DIR, path.dirname(file)), k[1]);
        if (layTen && dich.indexOf(CASES_DIR + path.sep) === 0) { ra.push(k[0]); }
      }
      return ra;
    })
  }
];

/** Chỗ đang có lúc dựng luật. Chỉ được hạ số hoặc xóa dòng. */
const EXCEPTIONS = {
  tenKhung: {
    'cases/fbmSync/StaticRules.js': 2
  },
  dungHop: {
    'cases/extensionBridge.js': 35,
    'cases/fbmSync/ActivityScan.js': 3,
    'cases/fbmSync/Audit.js': 1,
    'cases/fbmSync/AutoLogin.js': 7,
    'cases/fbmSync/BackgroundChain.js': 1,
    'cases/fbmSync/Builders.js': 1,
    'cases/fbmSync/FunctionTrace.js': 2,
    'cases/fbmSync/Orchestration.js': 12,
    'cases/fbmSync/ProductionMatrix.js': 2,
    'cases/fbmSync/Pull.js': 5,
    'cases/fbmSync/Push.js': 8,
    'cases/fbmSync/PushCompare.js': 2,
    'cases/fbmSync/Reconcile.js': 2,
    'cases/fbmSync/RelayLoop.js': 9,
    'cases/fbmSync/Settings.js': 4,
    'cases/fbmSync/Sidebar.js': 1,
    'cases/fbmSync/Workflow.js': 8
  },
  requireCa: {
    'cases/fbmSync/ActivityScan.js': 1,
    'cases/fbmSync/BackgroundChain.js': 1,
    'cases/fbmSync/CommandResults.js': 1,
    'cases/fbmSync/Control.js': 1,
    'cases/fbmSync/CustomerCount.js': 1,
    'cases/fbmSync/EntryPointGate.js': 1,
    'cases/fbmSync/Gate.js': 1,
    'cases/fbmSync/Reconcile.js': 1,
    'cases/fbmSync/RelayResend.js': 1,
    'cases/fbmSync/RelayResubmit.js': 1,
    'cases/fbmSync/Rotation.js': 1,
    'cases/fbmSync/RunPickup.js': 1,
    'cases/fbmSync/ScanJob.js': 1,
    'cases/fbmSync/ScanPack.js': 1,
    'cases/fbmSync/SidebarDrive.js': 1,
    'cases/fbmSync/UserJourneys.js': 1,
    'cases/fbmSync/Workflow.js': 1
  }
};

function quet(ruleId, files, readSource, ctx) {
  const rule = RULES.filter((r) => r.id === ruleId)[0];
  const out = {};
  files.forEach((file) => {
    const found = rule.find(file, stripComments(readSource(file)), ctx);
    if (found.length) { out[file] = found; }
  });
  return out;
}

function chay(so) {
  section('Luật tĩnh của bộ test — môi trường giả chỉ ở tests/lib, ngoại lệ chỉ co lại');

  const files = listJs(CASES_DIR).map(tuongDoi).filter((file) => file !== TU_KIEM);
  const readSource = (file) => fs.readFileSync(path.join(TESTS_DIR, file), 'utf8');
  const ctx = { khung: tenKhung() };
  check(so, 'phạm vi quét có tệp ca', files.length > 0, true);

  RULES.forEach((rule) => {
    check(so, 'luật ' + rule.id + ': ' + rule.moTa,
      compareExceptions(rule.id, quet(rule.id, files, readSource, ctx), EXCEPTIONS[rule.id]),
      []);
  });

  // Mỗi luật phải bắt được mẫu vi phạm của nó, nếu không danh sách ngoại lệ rỗng chỉ là luật không quét gì.
  const mau = {
    tenKhung: 'function check(a) {}\nconst docLog = () => 1;',
    dungHop: "vm.createContext(hop);\nconst kho = { getDocumentProperties: () => ({}) };\nconst g = { chrome: { runtime: {} } };\nnapClient(hop, 'x.html');",
    requireCa: "const { a } = require('./khac');\nconst b = require('../cases/khac').b;\nrequire('./nhom/X');\nconst { c } = require('../lib/assert');"
  };
  const ctxMau = { khung: { check: 'lib/assert.js', docLog: 'lib/gas/doc-log.js' } };
  const demMau = (id) => RULES.filter((r) => r.id === id)[0].find('cases/mau.js', mau[id], ctxMau).length;
  check(so, 'mỗi luật bắt đủ mẫu vi phạm và bỏ qua mẫu hợp lệ',
    [demMau('tenKhung'), demMau('dungHop'), demMau('requireCa')],
    [2, 4, 2]);
}

module.exports = { chay, RULES, EXCEPTIONS };
