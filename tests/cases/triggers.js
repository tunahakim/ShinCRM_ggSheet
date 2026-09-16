const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

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
  section('Trigger làm mới sheet quản trị — sửa cấu hình làm mới ngay, sửa kho đánh dấu mọi view');

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
  hop.renderViewIfDirty = (name) => { rendered.push(name); return { ok: true, sheetName: name }; };
  hop.runEntryPoint = (name, source, channel, fn) => fn();

  hop.shinOnEdit({ range: eventRange(lead, 3, 2) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 3) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 2) });
  hop.shinOnEdit({ range: eventRange(lead, 3, 5) });
  check(so, 'hàng lọc dưới mã @ và cột sắp xếp làm mới toàn bộ view; ô dữ liệu cùng hàng 3 dưới cột thường thì không', rendered, ['!Lead', '!Chăm sóc', '!Lead', '!Chăm sóc']);

  const defaultSheets = ['Customer', 'Activity', 'Category', 'Config'];
  const schemaResults = defaultSheets.map((name) => {
    hop.dirtyStateClear();
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 1, 1) });
    const state = hop.reloadStateRead();
    return [name, state.schema, state.allCore, state.allViews];
  });
  check(so, 'sửa hàng 1 ở đủ bốn sheet mặc định luôn phát schema, full core và toàn bộ view', schemaResults,
    defaultSheets.map((name) => [name, true, true, true]));

  hop.dirtyStateClear();
  defaultSheets.forEach((name) => {
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 2, 1) });
    hop.shinOnEdit({ range: eventRange(nen.sheet(name), 3, 1) });
  });
  const defaultNoopState = hop.reloadStateRead();
  check(so, 'hàng 2 và hàng 3 của bốn sheet mặc định chỉ là nhãn/ghi chú nên không tạo dirty',
    [defaultNoopState.viewSheets, defaultNoopState.records, defaultNoopState.category, defaultNoopState.config,
      defaultNoopState.schema, defaultNoopState.allCore, defaultNoopState.allViews],
    [[], [], false, false, false, false, false]);

  hop.dirtyStateClear();
  const invalidColumn = Object.keys(hop.DATA_SCHEMA.customer).length + 1;
  nen.sheet('Customer').getRange(1, invalidColumn).setValue('Cột thường');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 4, invalidColumn) });
  const invalidDataState = hop.reloadStateRead();
  check(so, 'sửa dữ liệu Customer dưới cột không có mã hợp lệ không phát dirty',
    [invalidDataState.viewSheets, invalidDataState.records, invalidDataState.category, invalidDataState.config,
      invalidDataState.schema, invalidDataState.allCore, invalidDataState.allViews],
    [[], [], false, false, false, false, false]);

  hop.dirtyStateClear();
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'GD000001');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Activity'), 4, 1) });
  check(so, 'sửa dữ liệu Activity dưới cột mã hợp lệ đánh dấu đúng mã giao dịch', hop.dirtyStateRead().records, ['GD000001']);

  rendered.length = 0;
  hop.shinOnEdit({ range: eventRange(lead, 1, 1) });
  check(so, 'sửa hàng 1 view, kể cả thêm/đổi/xóa mã @, gọi vẽ toàn bộ view', rendered, ['!Lead', '!Chăm sóc']);

  hop.dirtyStateClear();
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  hop.shinOnEdit({ range: eventRange(nen.sheet('Customer'), 4, 2) });
  const dirty = hop.dirtyStateRead();
  check(so, 'sửa trực tiếp kho đánh dấu bản ghi và tất cả sheet quản trị cần làm mới',
    [dirty.records, dirty.viewSheets.sort()],
    [['KH000001'], ['!Chăm sóc', '!Lead']]);

  const config = nen.sheet('Config');
  hop.dirtyStateClear();
  hop.shinOnEdit({ range: eventRange(config, 4, 2) });
  check(so, 'sửa Config đánh dấu nạp lại cấu hình và tất cả sheet quản trị',
    hop.dirtyStateRead(),
    { viewSheets: ['!Lead', '!Chăm sóc'], records: [], config: true, all: false });

  hop.dirtyStateClear();
  hop.shinOnEdit({ range: eventRange(nen.sheet('Category'), 4, 2) });
  check(so, 'sửa Category đánh dấu nạp lại danh mục và toàn bộ sheet quản trị',
    hop.dirtyStateRead(),
    { viewSheets: ['!Lead', '!Chăm sóc'], records: [], config: true, all: false });

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
  check(so, 'onEdit Customer vẽ cả view active và view không active',
    [renderLead.getRange(4, 1).getValue(), renderCare.getRange(4, 1).getValue(), renderNen.hop.reloadStateRead().allViews],
    ['KH000001', 'KH000001', false]);

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
  controlLead.getRange(3, 2).setValue('Hai');
  const controlResult = controlNen.hop.shinOnEdit({ range: eventRange(controlLead, 3, 2) });
  check(so, 'onEdit điều khiển view bypass autoRenderView=false và vẫn vẽ ngay',
    [controlResult.ok, controlLead.getRange(4, 1).getValue(), controlNen.hop.reloadStateRead().allViews],
    [true, 'KH000002', false]);
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
