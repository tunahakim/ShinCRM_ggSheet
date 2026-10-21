/**
 * Test quét mã của tầng 1 đọc/ghi Sheet (tài liệu 06 Phần 2): mọi lệnh Google đọc hoặc ghi ô, cấu trúc, kích thước lưới chỉ được nằm trong bốn tệp tầng 1. Nơi khác phải gọi công cụ tầng 1, để chính sách theo loại sheet (khóa tài liệu, sheet tự do) và tờ nháp của lần gọi không ai phải nhớ.
 * Ngoại lệ có tên: `server/dev/` (chỉ DEV) và tệp dựng sheet `Config` (hết hạn ở phiên chuyển Config vào Sidebar).
 */

const fs = require('fs');
const path = require('path');
const { section, check } = require('../lib/assert');

const GAS_DIR = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');

const LAYER1_FILES = ['server/sheet/SheetCellWrite.js', 'server/sheet/SheetGrid.js', 'server/sheet/SheetReadCopy.js', 'server/sheet/SheetStructure.js'];
const NAMED_EXCEPTIONS = ['server/config/ConfigSheetSetup.js'];
const isExempt = (file) => file.startsWith('server/dev/') || LAYER1_FILES.indexOf(file) >= 0 || NAMED_EXCEPTIONS.indexOf(file) >= 0;

/** Lệnh đọc ô, cấu trúc và kích thước lưới. `getSheets`, `getSheetByName`, `getName` không ở đây: chúng chỉ hỏi tệp có những sheet nào. */
const READER_NAMES = [
  'getValue', 'getValues', 'getDisplayValue', 'getDisplayValues', 'getNote', 'getNotes',
  'getFormula', 'getFormulas', 'getFormulaR1C1', 'getFormulasR1C1', 'getNumberFormat', 'getNumberFormats',
  'getRichTextValue', 'getRichTextValues', 'getBackground', 'getBackgrounds', 'getFontWeight', 'getFontWeights',
  'getLastRow', 'getLastColumn', 'getMaxRows', 'getMaxColumns', 'getFrozenRows', 'getFrozenColumns',
  'getDataRange', 'getTabColor', 'getDataValidation', 'getDataValidations'
];

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
  'setVerticalAlignment', 'setVerticalAlignments', 'setTextDirection', 'setTextDirections', 'setTabColor',
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

const MUTATOR_RE = new RegExp('\\.(' + MUTATOR_NAMES.concat(READER_NAMES).join('|') + ')\\s*\\(', 'g');

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
  section('Tầng 1 đọc/ghi Sheet — lệnh Google chạm ô hoặc cấu trúc chỉ nằm ở tầng 1');

  const files = listJsFiles(GAS_DIR, '');
  const runtime = files.filter((file) => !file.startsWith('server/dev/'));
  const read = (file) => fs.readFileSync(path.join(GAS_DIR, file), 'utf8');

  const violations = [];
  files.filter((file) => !isExempt(file)).forEach((file) => {
    const calls = mutatorsIn(read(file));
    if (calls.length) { violations.push(file + ': ' + calls.map((item) => item.name + '@' + item.line).join(', ')); }
  });
  check(so, 'ngoài tầng 1 và ngoại lệ có tên, không tệp nào gọi thẳng lệnh Google chạm ô hoặc cấu trúc', violations, []);
  check(so, 'tệp tầng 1 và ngoại lệ có tên đều tồn tại', LAYER1_FILES.concat(NAMED_EXCEPTIONS).filter((file) => !fs.existsSync(path.join(GAS_DIR, file))), []);
  const fixture = mutatorsIn("function fixture(sheet) { var n = sheet.getLastRow(); sheet.getRange('A1').setValue(n); }");
  check(so, 'phép quét tự bắt được cả lệnh đọc lẫn lệnh ghi trong mã vi phạm mẫu', fixture.map((item) => item.name), ['getLastRow', 'setValue']);
  check(so, 'chỉ tầng 1 và ngoại lệ có tên quên hay bỏ tờ nháp', runtime.filter((file) => LAYER1_FILES.indexOf(file) < 0 && NAMED_EXCEPTIONS.indexOf(file) < 0
    && /\bsheetReadCopy(?:Forget|Drop)\s*\(/.test(stripNonCode(read(file)))), []);

  // Cửa bản ghi là đường duy nhất đổi dòng Customer/Activity (tài liệu 06 Phần 1): gọi thẳng cửa ghi hay cửa xóa là đi vòng sổ bận và đọc ngoài khóa. Quét cả `server/dev/` vì hàm dò cũng ghi lên Sheet DEV.
  const callersOf = (ten) => files.filter((file) => new RegExp('(?<![\\w.])(?<!function )' + ten + '\\s*\\(').test(stripNonCode(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'))));
  check(so, 'chỉ Cửa bản ghi gọi cửa ghi và cửa xóa', [callersOf('writeGateSave'), callersOf('deleteGateRemove')], [['server/gate/RecordGate.js'], ['server/gate/RecordGate.js']]);
  check(so, 'sổ bận chỉ được Cửa bản ghi đọc/ghi, và khóa kho của sổ chỉ nằm trong tệp sổ bận',
    [['recordHoldsRead', 'recordHoldsWrite', 'recordHoldsApply', 'recordHoldsBusy', 'recordHoldsWithoutOwner', 'recordHoldsPeekOwner'].reduce((out, ten) => out.concat(callersOf(ten).filter((file) => file !== 'server/state/RecordHolds.js' && file !== 'server/gate/RecordGate.js')), []),
      files.filter((file) => file !== 'server/state/RecordHolds.js' && /SHIN_RECORD_HOLDS_V1|\bRECORD_HOLDS_KEY\b/.test(stripNonCode(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'))))],
    [[], []]);

  const requiredCommit = ['server/gate/WriteGate.js', 'server/gate/DeleteGate.js', 'server/config/ConfigSheetSetup.js', 'server/sheet/SyncColumnSetup.js'];
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

  const noDirectReload = ['server/gate/WriteGate.js', 'server/gate/DeleteGate.js', 'server/config/ConfigSheetSetup.js', 'server/sheet/SyncColumnSetup.js'];
  noDirectReload.forEach((file) => {
    const source = stripNonCode(fs.readFileSync(path.join(GAS_DIR, file), 'utf8'));
    check(so, file + ' không tự gọi ReloadDecision/DirtyState và không vẽ sheet quản trị', [
      /reloadDecisionForChange\s*\(/.test(source),
      /dirtyStateMarkDecision\s*\(/.test(source),
      /render(?:AllManagedViews|ViewSheet|ViewIfDirty)\s*\(/.test(source)
    ], [false, false, false]);
  });

  const pullSource = stripNonCode(fs.readFileSync(path.join(GAS_DIR, 'fbm_sync/reconcile/Pull.js'), 'utf8'));
  check(so, 'Pull không tự đánh dấu dirty sau khi WriteGate đã commit', /dirtyStateMark(?:Records|Decision|Signal)\s*\(/.test(pullSource), false);
  section('Cửa ghi — trường có danh sách cố định trong schema');
  const { taoHopCat, napServer } = require('../lib/load-gas');
  const hop = taoHopCat({});
  napServer(hop, 'server/data/DataSchema.js', 'server/gate/FieldLogic.js', 'server/gate/WriteGate.js');
  const ghiQuyen = (value) => { const plan = { moi: false, record: { fbmSyncPermission: value }, values: {} }, invalid = []; hop.writeGateBuild(plan, ['fbmSyncPermission'], hop.DATA_SCHEMA.customer, 'user', invalid, {}); return [plan.values.fbmSyncPermission === undefined ? null : plan.values.fbmSyncPermission, invalid.length]; };
  check(so, 'ô Cho phép đồng bộ FBM chỉ nhận đúng chữ của năm giá trị; giá trị cũ hoặc lệch hoa thường bị từ chối', [ghiQuyen('Cho phép'), ghiQuyen('Cấm đồng bộ'), ghiQuyen('Ngừng đồng bộ'), ghiQuyen('cho phép')], [['Cho phép', 0], ['Cấm đồng bộ', 0], [null, 1], [null, 1]]);

  section('Cửa ghi — chỉ đọc danh mục của trường SELECT bản ghi gửi lên');
  let catReads = 0;
  hop.categoryReadAll = () => { catReads++; return { categories: { '@CAT_TINH_THANH': ['Hà Nội'], '@CAT_NHOM_KH': ['VIP'] } }; };
  const catalog = (records) => { catReads = 0; const allowed = hop.writeGateSelectCatalog(hop.DATA_SCHEMA.customer, records.map((record) => ({ record }))); return [catReads, Object.keys(allowed).sort()]; };
  check(so, 'lượt sửa không có trường SELECT không đọc sheet Category', catalog([{ name: 'A' }, { phone: '0901' }]), [0, []]);
  check(so, 'có trường SELECT (kể cả ô gửi rỗng) thì đọc một lần và chỉ lấy danh mục của trường đó', catalog([{ name: 'A' }, { province: '' }, { province: 'Hà Nội' }]), [1, ['@CAT_TINH_THANH']]);
  check(so, 'nhiều trường SELECT trong lô vẫn chỉ đọc Category một lần', catalog([{ province: 'Hà Nội', customerGroup: 'VIP' }]), [1, ['@CAT_NHOM_KH', '@CAT_TINH_THANH']]);
}

module.exports = { chay };
