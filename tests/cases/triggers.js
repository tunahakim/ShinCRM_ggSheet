const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');
const fs = require('fs');
const path = require('path');

function eventRange(sheet, row, column, rows, columns) {
  return {
    getSheet: () => sheet,
    getRow: () => row,
    getLastRow: () => row + (rows || 1) - 1,
    getColumn: () => column,
    getLastColumn: () => column + (columns || 1) - 1
  };
}

function chay(so) {
  section('Trigger — sửa bộ điều khiển vẽ đúng sheet, sửa kho chỉ làm mọi view cũ');

  let nen;
  try {
    nen = dungHop({
      sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'],
      tep: TEP_NEN.concat(['server/Triggers.js'])
    });
  } catch (err) {
    return ghiLoiNap(so, 'nạp server/Triggers.js', err);
  }

  const hop = nen.hop;
  const lead = nen.book.insertSheet('!Lead');
  nen.book.insertSheet('!Chăm sóc');
  lead.getRange(1, 1, 1, 5).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL', 'Ghi chú thường']]);
  const rendered = [];
  hop.renderAllManagedViews = (names) => { rendered.push(names ? names.join(',') : 'ALL'); return { ok: true }; };
  hop.runEntryPoint = (name, source, channel, fn) => fn();
  hop.userPrefsRead = () => { throw new Error('Trigger không được đọc núm người dùng'); };
  // Xóa cả mốc cũ của view để `viewsStaleRevision > 0` nghĩa là signal sau lần xóa đã làm view cũ.
  const clearState = () => { hop.dirtyStateClear(); hop.documentProps().deleteProperty('viewsStaleRevision'); };

  hop.shinOnEdit({ range: eventRange(lead, 3, 2) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 3) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 2) });
  hop.shinOnEdit({ range: eventRange(lead, 3, 5) });
  check(so, 'hàng lọc dưới mã @ và cột sắp xếp vẽ đúng sheet bị sửa, không vẽ sheet khác, không đọc núm người dùng; ô dưới cột thường thì không vẽ', rendered, ['!Lead', '!Lead']);

  const defaultSheets = ['Customer', 'Activity', 'Category', 'Config'];
  const schemaResults = defaultSheets.map((name) => {
    clearState();
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 1, 1) });
    const state = hop.reloadStateRead();
    return [name, state.schema, state.allCore, (state.viewsStaleRevision > 0)];
  });
  check(so, 'sửa hàng 1 ở đủ bốn sheet mặc định luôn phát schema, full core và toàn bộ view', schemaResults,
    defaultSheets.map((name) => [name, true, true, true]));
  clearState();
  const scratch = nen.book.insertSheet('Nháp');
  scratch.getRange(1, 1).setValue('x');
  hop.shinOnEdit({ range: eventRange(scratch, 1, 1), value: 'x' });
  check(so, 'gõ hàng 1 của sheet ngoài hệ thống chưa có ảnh chụp hàng 1 không phát signal', hop.reloadStateRead().viewsStaleRevision, 0);

  clearState();
  defaultSheets.forEach((name) => {
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 2, 1) });
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 3, 1) });
  });
  const ordinarySchemaColumn = Object.keys(hop.DATA_SCHEMA.customer).length + 1;
  nen.sheet('Customer').getRange(1, ordinarySchemaColumn).setValue('Ghi chu');
  clearState();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 1, ordinarySchemaColumn), oldValue: 'Ghi chu', value: 'Khac' });
  const ordinarySchemaState = hop.reloadStateRead();
  check(so, 'sua mot o hang 1 thuong khong phat schema khi oldValue va value deu khong hop le',
    [ordinarySchemaState.records, ordinarySchemaState.category, ordinarySchemaState.config,
      ordinarySchemaState.schema, ordinarySchemaState.allCore, (ordinarySchemaState.viewsStaleRevision > 0), ordinarySchemaState.all],
    [[], false, false, false, false, false, false]);

  const schemaCell = nen.sheet('Customer').getRange(1, 1);
  const schemaCode = schemaCell.getValue();
  schemaCell.setValue('Ma khach');
  clearState();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 1, 1), oldValue: schemaCode, value: 'Ma khach' });
  check(so, 'doi ma @ hop le thanh gia tri thuong van phat schema',
    [hop.reloadStateRead().schema, hop.reloadStateRead().allCore, (hop.reloadStateRead().viewsStaleRevision > 0)],
    [true, true, true]);
  schemaCell.setValue(schemaCode);
  clearState();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 1, 1), oldValue: '', value: schemaCode });
  check(so, 'them ma @ hop le vao hang 1 van phat schema', hop.reloadStateRead().schema, true);
  schemaCell.setValue('');
  clearState();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 1, 1), oldValue: schemaCode });
  check(so, 'xoa ma @ hop le o hang 1 van phat schema', hop.reloadStateRead().schema, true);
  schemaCell.setValue(schemaCode);
  clearState();

  const defaultNoopState = hop.reloadStateRead();
  check(so, 'hàng 2 và hàng 3 của bốn sheet mặc định chỉ là nhãn/ghi chú nên không tạo dirty',
    [defaultNoopState.records, defaultNoopState.category, defaultNoopState.config,
      defaultNoopState.schema, defaultNoopState.allCore, (defaultNoopState.viewsStaleRevision > 0)],
    [[], false, false, false, false, false]);

  clearState();
  const invalidColumn = Object.keys(hop.DATA_SCHEMA.customer).length + 1;
  nen.sheet('Customer').getRange(1, invalidColumn).setValue('Cột thường');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 4, invalidColumn) });
  const invalidDataState = hop.reloadStateRead();
  check(so, 'sửa dữ liệu Customer dưới cột không có mã hợp lệ không phát dirty',
    [invalidDataState.records, invalidDataState.category, invalidDataState.config,
      invalidDataState.schema, invalidDataState.allCore, (invalidDataState.viewsStaleRevision > 0)],
    [[], false, false, false, false, false]);

  clearState();
  const moduleColumn = invalidColumn + 1;
  nen.sheet('Customer').getRange(1, moduleColumn).setValue('@CUS_MODULE_DIEM');
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000009');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 4, moduleColumn) });
  const moduleState = hop.reloadStateRead();
  check(so, 'sửa ô Customer dưới cột module @CUS_* ngoài DATA_SCHEMA chỉ làm view cũ: không records, không allCore, không schema',
    [moduleState.records, moduleState.allCore, moduleState.schema, moduleState.category, moduleState.config, (moduleState.viewsStaleRevision > 0)],
    [[], false, false, false, false, true]);

  clearState();
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'GD000001');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Activity'), 4, 1) });
  check(so, 'sửa dữ liệu Activity dưới cột mã hợp lệ đánh dấu đúng mã giao dịch', hop.dirtyStateRead().records, ['GD000001']);

  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(lead, 1, 1) });
  check(so, 'sửa hàng 1 view, kể cả thêm/đổi/xóa mã @, vẽ đúng sheet đó', rendered, ['!Lead']);

  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(lead, 1, 5), oldValue: 'Ghi chú thường', value: 'Nhãn thường' });
  check(so, 'sửa tiêu đề thường ở hàng 1 view không liên quan mã hợp lệ thì không vẽ', rendered, []);

  rendered.length = 0;
  lead.getRange(1, 6).setValue('Ghi chu 2');
  hop.shinOnEdit({ range: eventRange(lead, 1, 5, 1, 2) });
  check(so, 'sua ca vung hang 1 thuong sang thuong khong ve', rendered, []);

  const customerHeader = nen.sheet('Customer').getRange(1, 1);
  const customerCodeBeforeRange = customerHeader.getValue();
  hop.shinHeaderSnapshotWrite(nen.sheet('Customer'));
  customerHeader.setValue('Nhan thuong');
  clearState();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 1, 1) });
  check(so, 'sua mot o hang 1 tu ma hop le sang thuong van phat schema', hop.reloadStateRead().schema, true);
  customerHeader.setValue(customerCodeBeforeRange);
  hop.shinHeaderSnapshotWrite(nen.sheet('Customer'));

  clearState();
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 4, 2) });
  const dirty = hop.reloadStateRead();
  check(so, 'sửa trực tiếp kho đánh dấu bản ghi, làm mọi view cũ và không gọi bộ vẽ',
    [dirty.records, dirty.viewsStaleRevision === dirty.revision, rendered],
    [['KH000001'], true, []]);

  const config = nen.sheet('Config');
  const configCodes = config.getRange(1, 1, 1, config.getLastColumn()).getValues()[0];
  const configParamColumn = configCodes.indexOf('@CFG_THAM_SO') + 1;
  const configSortColumn = configCodes.indexOf('@CFG_SORT_COL') + 1;
  const configLevelColumn = configCodes.indexOf('@CFG_SORT_LEVEL') + 1;
  clearState();
  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(config, 4, configParamColumn) });
  check(so, 'sửa tham số Config đánh dấu nạp lại cấu hình và làm mọi view cũ, không vẽ',
    [hop.dirtyStateRead(), hop.reloadStateRead().viewsStaleRevision > 0, rendered],
    [{ records: [], config: true, all: false }, true, []]);

  [configSortColumn, configLevelColumn].forEach((column) => {
    clearState();
    hop.shinOnEdit({ range: eventRange(config, 4, column) });
  });
  check(so, 'sửa @CFG_SORT_COL hoặc @CFG_SORT_LEVEL trong Config vẽ mọi sheet quản trị, kể cả khi không đọc núm người dùng',
    [configSortColumn > 0, configLevelColumn > 0, rendered, hop.dirtyStateRead().config],
    [true, true, ['ALL', 'ALL'], true]);

  clearState();
  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(nen.sheet('Category'), 4, 2) });
  check(so, 'sửa Category đánh dấu nạp lại danh mục và làm mọi view cũ, không vẽ',
    [hop.dirtyStateRead(), hop.reloadStateRead().viewsStaleRevision > 0, rendered],
    [{ records: [], config: true, all: false }, true, []]);

  const realRun = hop.runEntryPoint;
  const realOpen = hop.shinOpenBook;
  const realProps = hop.documentProps;
  const onChangeCalls = [];
  hop.runEntryPoint = () => { onChangeCalls.push('runEntryPoint'); return null; };
  hop.shinOpenBook = () => { onChangeCalls.push('shinOpenBook'); return realOpen(); };
  hop.documentProps = () => { onChangeCalls.push('documentProps'); return realProps(); };
  ['EDIT', 'FORMAT', 'edit'].forEach((changeType) => hop.shinOnChange({ changeType }));
  check(so, 'onChange loại EDIT/FORMAT trả về trước runEntryPoint, không mở bảng tính, không đọc DocumentProperties', onChangeCalls, []);
  hop.shinOnChange({ changeType: 'OTHER' });
  check(so, 'onChange loại khác vẫn vào runEntryPoint', onChangeCalls, ['runEntryPoint']);
  hop.runEntryPoint = realRun;
  hop.shinOpenBook = realOpen;
  hop.documentProps = realProps;

  const triggerList = [
    { getHandlerFunction: () => 'shinOnEdit' },
    { getHandlerFunction: () => 'shinOnChange' },
    { getHandlerFunction: () => 'unrelatedTrigger' }
  ];
  const deletedTriggers = [];
  const createdTriggers = [];
  const makeTrigger = (handler) => ({ getHandlerFunction: () => handler });
  hop.ScriptApp = {
    getProjectTriggers: () => triggerList.slice(),
    deleteTrigger: (trigger) => {
      deletedTriggers.push(trigger.getHandlerFunction());
      const index = triggerList.indexOf(trigger);
      if (index >= 0) { triggerList.splice(index, 1); }
    },
    newTrigger: (handler) => {
      const builder = {
        forSpreadsheet: () => builder,
        onEdit: () => builder,
        onChange: () => builder,
        create: () => { createdTriggers.push(handler); triggerList.push(makeTrigger(handler)); }
      };
      return builder;
    }
  };
  const installOnce = hop.shinInstallTriggers();
  const installTwice = hop.shinInstallTriggers();
  check(so, 'cai trigger installable hai lan khong sinh ban sao va luon giu dung hai handler',
    [installOnce, installTwice, triggerList.map((trigger) => trigger.getHandlerFunction()).sort(), deletedTriggers.length, createdTriggers.length],
    [['shinOnEdit', 'shinOnChange'], ['shinOnEdit', 'shinOnChange'], ['shinOnChange', 'shinOnEdit', 'unrelatedTrigger'], 4, 4]);

  const rendererSource = fs.readFileSync(path.join(__dirname, '..', '..', '1_ShinCRM_GAS', 'server', 'view', 'ViewSheetRenderer.js'), 'utf8');
  check(so, 'renderer ghi view khong goi nguoc trigger shinOnEdit', /\bshinOnEdit\s*\(/.test(rendererSource), false);

  let renderNen;
  try {
    renderNen = dungHop({
      sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'],
      tep: TEP_RENDER
    });
  } catch (err) { return ghiLoiNap(so, 'nạp trigger cùng renderer', err); }
  const renderLead = renderNen.book.insertSheet('!Lead');
  const renderCare = renderNen.book.insertSheet('!Chăm sóc');
  [renderLead, renderCare].forEach((sheet) => {
    sheet.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  });
  ghiO(renderNen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  ghiO(renderNen, 'Customer', 4, '@CUS_TEN_CTY', 'Mot');
  renderNen.hop.shinOnEdit({ range: eventRange(renderNen.sheet('Customer'), 4, 2) });
  check(so, 'onEdit Customer không chạm sheet quản trị nào, mọi view thành cũ',
    [renderLead.getRange(4, 1).getValue(), renderCare.getRange(4, 1).getValue(), renderNen.hop.viewIsStale('!Lead'), renderNen.hop.viewIsStale('!Chăm sóc')],
    ['', '', true, true]);

  let controlNen;
  try {
    controlNen = dungHop({
      sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'],
      userProps: { prefAutoRenderView: 'false' },
      tep: TEP_RENDER
    });
  } catch (err) { return ghiLoiNap(so, 'nạp trigger view-control', err); }
  const controlLead = controlNen.book.insertSheet('!Lead');
  controlLead.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  ghiO(controlNen, 'Customer', 4, '@CUS_MA_KH', 'KH000002');
  ghiO(controlNen, 'Customer', 4, '@CUS_TEN_CTY', 'Hai');
  const controlCare = controlNen.book.insertSheet('!Chăm sóc');
  controlCare.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
  controlLead.getRange(3, 2).setValue('Hai');
  const controlResult = controlNen.hop.shinOnEdit({ range: eventRange(controlLead, 3, 2) });
  check(so, 'onEdit điều khiển view vẽ ngay đúng sheet đó dù autoRenderView=false, sheet khác không bị chạm',
    [controlResult.ok, controlLead.getRange(4, 1).getValue(), controlNen.hop.viewIsStale('!Lead'), controlCare.getRange(4, 1).getValue()],
    [true, 'KH000002', false, '']);
}

const TEP_RENDER = TEP_NEN.concat([
  'server/view/FilterMessages.js',
  'server/view/FilterParser.js',
  'server/view/SortSpec.js',
  'server/view/ViewSheetSetup.js',
  'server/view/ViewSheetRenderer.js',
  'server/Triggers.js'
]);

module.exports = { chay };
