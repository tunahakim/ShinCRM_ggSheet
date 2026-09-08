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
  lead.getRange(1, 1, 1, 4).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY', '@VIEW_SORT_COL', '@VIEW_SORT_LEVEL']]);
  const rendered = [];
  hop.renderViewIfDirty = (name) => { rendered.push(name); return { ok: true, sheetName: name }; };
  hop.runEntryPoint = (name, source, channel, fn) => fn();

  hop.shinOnEdit({ range: eventRange(lead, 3, 2) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 3) });
  hop.shinOnEdit({ range: eventRange(lead, 4, 2) });
  check(so, 'hàng lọc và cột sắp xếp làm mới ngay; ô dữ liệu thường không làm mới', rendered, ['!Lead', '!Lead']);

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
  check(so, 'sửa Category chỉ đánh dấu nạp lại cấu hình, không làm bẩn sheet quản trị',
    hop.dirtyStateRead(),
    { viewSheets: [], records: [], config: true, all: false });
}

module.exports = { chay };
