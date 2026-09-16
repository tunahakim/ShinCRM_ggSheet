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
