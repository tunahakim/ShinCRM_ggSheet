/**
 * Kiểm kê tĩnh mọi thao tác thay đổi Sheet trong code GAS runtime.
 *
 * Đây là hàng rào chống sinh thêm "cửa ghi" ngoài tài liệu 06. Không cố đoán
 * luật nghiệp vụ bằng tên file: nó quét API mutator thực tế, rồi đối chiếu
 * từng file với inventory đã chốt. `server/dev/` được tách riêng vì chỉ là
 * công cụ nghiệm thu; một writer mới ngoài hai danh sách phải làm bộ kiểm đỏ.
 */

const fs = require('fs');
const path = require('path');
const { section, check } = require('../lib/assert');

const GAS_DIR = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');

const RUNTIME_WRITERS = {
  'server/config/ConfigSheetSetup.js': 'config/setup',
  'server/gate/DeleteGate.js': 'record/delete',
  'server/gate/IdGate.js': 'record/id-helper',
  'server/gate/WriteGate.js': 'record/write',
  'server/log/LogGate.js': 'infrastructure/log',
  'server/sheet/SheetColumnWriter.js': 'helper/column-writer',
  'server/sheet/SheetGrid.js': 'helper/grid',
  'server/sheet/SetupSheets.js': 'infrastructure/setup',
  'server/sheet/SheetIo.js': 'development/probe-only',
  'server/view/ViewSheetRenderer.js': 'view/renderer',
  'server/view/ViewSheetSetup.js': 'view/setup',
  'fbm_sync/SyncSchema.js': 'sync/schema'
};

const MUTATOR_NAMES = [
  'setValue', 'setValues', 'clear', 'clearContent', 'clearDataValidations',
  'clearFormat', 'clearNote', 'setNote', 'setFormula', 'setFormulas',
  'setNumberFormat', 'setDataValidation', 'setFontWeight', 'setBackground',
  'setFrozenRows', 'setHorizontalAlignment', 'setVerticalAlignment',
  'insertSheet', 'deleteSheet', 'insertRows', 'insertRowsAfter',
  'insertRowsBefore', 'deleteRows', 'insertColumns', 'insertColumnsAfter',
  'insertColumnsBefore', 'deleteColumn', 'deleteColumns', 'appendRow'
];

const MUTATOR_RE = new RegExp('\\.(' + MUTATOR_NAMES.join('|') + ')\\s*\\(', 'g');

function listJsFiles(root, prefix) {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  const files = [];
  entries.forEach((entry) => {
    const relative = prefix ? prefix + '/' + entry.name : entry.name;
    const full = path.join(root, entry.name);
    if (entry.isDirectory()) { files.push(...listJsFiles(full, relative)); }
    else if (entry.isFile() && entry.name.endsWith('.js')) { files.push(relative.replace(/\\/g, '/')); }
  });
  return files;
}

/** Xóa comment và literal nhưng giữ nguyên xuống dòng để số dòng báo ra còn dùng được. */
function stripNonCode(source) {
  let out = '';
  let state = 'code';
  for (let i = 0; i < source.length; i += 1) {
    const ch = source[i];
    const next = source[i + 1];
    if (state === 'code') {
      if (ch === '/' && next === '/') { out += '  '; i += 1; state = 'line'; }
      else if (ch === '/' && next === '*') { out += '  '; i += 1; state = 'block'; }
      else if (ch === "'") { out += ' '; state = 'single'; }
      else if (ch === '"') { out += ' '; state = 'double'; }
      else if (ch === '`') { out += ' '; state = 'template'; }
      else { out += ch; }
    } else if (state === 'line') {
      if (ch === '\n') { out += '\n'; state = 'code'; } else { out += ' '; }
    } else if (state === 'block') {
      if (ch === '*' && next === '/') { out += '  '; i += 1; state = 'code'; }
      else if (ch === '\n') { out += '\n'; } else { out += ' '; }
    } else {
      if (ch === '\\') { out += '  '; i += 1; }
      else if ((state === 'single' && ch === "'") || (state === 'double' && ch === '"') || (state === 'template' && ch === '`')) { out += ' '; state = 'code'; }
      else if (ch === '\n') { out += '\n'; }
      else { out += ' '; }
    }
  }
  return out;
}

function mutatorsIn(source) {
  const clean = stripNonCode(source);
  const found = [];
  let match;
  while ((match = MUTATOR_RE.exec(clean)) !== null) {
    found.push({ name: match[1], line: clean.slice(0, match.index).split('\n').length });
  }
  MUTATOR_RE.lastIndex = 0;
  return found;
}

function chay(so) {
  section('Audit cửa ghi — inventory thao tác thay đổi Sheet trong GAS');

  const files = listJsFiles(GAS_DIR, '');
  const runtime = files.filter((file) => !file.startsWith('server/dev/'));
  const violations = [];
  const writers = [];

  runtime.forEach((file) => {
    const source = fs.readFileSync(path.join(GAS_DIR, file), 'utf8');
    const mutators = mutatorsIn(source);
    if (!mutators.length) { return; }
    writers.push(file);
    if (!Object.prototype.hasOwnProperty.call(RUNTIME_WRITERS, file)) {
      violations.push(file + ': chưa có trong inventory');
    }
    if (RUNTIME_WRITERS[file] === 'development/probe-only') {
      const probeAt = source.indexOf('function probeBadColumnCode');
      const probeLine = probeAt < 0 ? 0 : source.slice(0, probeAt).split('\n').length;
      if (probeAt < 0 || mutators.some((item) => item.line < probeLine)) {
        violations.push(file + ': writer probe không nằm rõ trong hàm probeBadColumnCode');
      }
    }
  });

  Object.keys(RUNTIME_WRITERS).forEach((file) => {
    const full = path.join(GAS_DIR, file);
    if (!fs.existsSync(full)) { violations.push(file + ': inventory trỏ tới file không tồn tại'); }
  });

  check(so, 'mọi file runtime có mutator đều nằm trong inventory cửa ghi', violations, []);
  check(so, 'inventory không bỏ sót file có mutator', writers.slice().sort(), Object.keys(RUNTIME_WRITERS).slice().sort());

  const requiredCommit = ['server/gate/WriteGate.js', 'server/gate/DeleteGate.js', 'server/config/ConfigSheetSetup.js', 'fbm_sync/SyncSchema.js'];
  requiredCommit.forEach((file) => {
    const source = fs.readFileSync(path.join(GAS_DIR, file), 'utf8');
    check(so, file + ' gọi hậu xử lý WriteCommit', source.indexOf('writeCommitAfterSuccess') >= 0, true);
  });

  const noDirectReload = ['server/gate/WriteGate.js', 'server/gate/DeleteGate.js', 'server/config/ConfigSheetSetup.js', 'fbm_sync/SyncSchema.js'];
  noDirectReload.forEach((file) => {
    const source = stripNonCode(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'));
    check(so, file + ' không tự gọi ReloadDecision/DirtyState/renderer', [
      /reloadDecisionForChange\s*\(/.test(source),
      /dirtyStateMarkDecision\s*\(/.test(source),
      /renderAllManagedViewsIfAllowed\s*\(/.test(source)
    ], [false, false, false]);
  });
}

module.exports = { chay };
