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
  'server/sheet/SheetGrid.js': 'helper/grid',
  'server/sheet/SetupSheets.js': 'infrastructure/setup',
  'server/view/ViewSheetRenderer.js': 'view/renderer',
  'server/view/ViewSheetSetup.js': 'view/setup',
  'fbm_sync/SyncSchema.js': 'sync/schema'
};

const MUTATOR_NAMES = [
  'setValue', 'setValues', 'clear', 'clearContent', 'clearDataValidations',
  'clearContents', 'clearFormats', 'clearNotes', 'clearFormat', 'clearNote',
  'setNote', 'setNotes', 'setFormula', 'setFormulas', 'setFormulaR1C1', 'setFormulasR1C1',
  'setNumberFormat', 'setNumberFormats', 'setDataValidation', 'setDataValidations',
  'setRichTextValue', 'setRichTextValues', 'setFontWeight', 'setFontWeights',
  'setFontColor', 'setFontColors', 'setFontFamily', 'setFontFamilies',
  'setFontLine', 'setFontLines', 'setFontSize', 'setFontSizes',
  'setFontStyle', 'setFontStyles', 'setBackground', 'setBackgrounds',
  'setBorder', 'setHorizontalAlignment', 'setHorizontalAlignments',
  'setVerticalAlignment', 'setVerticalAlignments', 'setTextDirection', 'setTextDirections',
  'setTextRotation', 'setTextRotations', 'setWrap', 'setWraps',
  'setWrapStrategy', 'setWrapStrategies', 'setShowHyperlink', 'setShowHyperlinks',
  'setFrozenRows', 'setFrozenColumns', 'setHiddenGridlines', 'setTabColor',
  'setRowHeight', 'setRowHeights', 'setColumnWidth', 'setColumnWidths',
  'autoResizeColumn', 'autoResizeColumns', 'insertCheckboxes', 'removeCheckboxes',
  'setConditionalFormatRules', 'setName', 'setActiveSheet', 'setActiveRange',
  'setActiveSelection', 'copyTo',
  'insertSheet', 'deleteSheet', 'insertRows', 'insertRowsAfter',
  'insertRowsBefore', 'deleteRows', 'insertColumns', 'insertColumnsAfter',
  'insertColumnsBefore', 'deleteColumn', 'deleteColumns', 'moveRows', 'moveColumns',
  'appendRow', 'hideSheet', 'showSheet'
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
    check(so, file + ' chặn ghi khi thiếu hậu xử lý reload', source.indexOf('writeCommitAssertAvailable') >= 0, true);
  });

  check(so, 'không còn file SheetColumnWriter mồ côi', fs.existsSync(path.join(GAS_DIR, 'server/sheet/SheetColumnWriter.js')), false);
  check(so, 'không còn caller runtime của SheetColumnWriter', files.filter((file) => {
    if (file.startsWith('server/dev/')) { return false; }
    return fs.readFileSync(path.join(GAS_DIR, file), 'utf8').indexOf('sheetWriteColumns') >= 0;
  }), []);

  const noDirectReload = ['server/gate/WriteGate.js', 'server/gate/DeleteGate.js', 'server/config/ConfigSheetSetup.js', 'fbm_sync/SyncSchema.js'];
  noDirectReload.forEach((file) => {
    const source = stripNonCode(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'));
    check(so, file + ' không tự gọi ReloadDecision/DirtyState/renderer', [
      /reloadDecisionForChange\s*\(/.test(source),
      /dirtyStateMarkDecision\s*\(/.test(source),
      /renderAllManagedViewsIfAllowed\s*\(/.test(source)
    ], [false, false, false]);
  });

  const pullSource = stripNonCode(fs.readFileSync(path.join(GAS_DIR, 'fbm_sync/reconcile/Pull.js'), 'utf8'));
  check(so, 'Pull không tự đánh dấu dirty sau khi WriteGate đã commit', /dirtyStateMark(?:Records|Decision|Signal)\s*\(/.test(pullSource), false);
}

module.exports = { chay };
