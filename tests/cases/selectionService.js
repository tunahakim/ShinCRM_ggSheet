/**
 * Ca rủi ro cao của SelectionService: cùng một số hàng phải tra theo đúng sheet, còn vùng không chắc chắn phải trả rỗng thay vì mở nhầm khách.
 */

const { dungHop, ghiO, TEP_NEN } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function ganLuaChon(nen, state) {
  const gids = { Customer: 101, Activity: 102, Category: 103, '!Lead': 104 };
  nen.book.getActiveSheet = function () {
    const sheet = nen.sheet(state.sheetName);
    sheet.getSheetId = () => gids[state.sheetName] || 999;
    sheet.getActiveRange = () => ({
      getA1Notation: () => state.cellRef || 'A' + state.row,
      getRow: () => state.row,
      getColumn: () => state.col || 1,
      getLastRow: () => state.rowEnd || state.row,
      getLastColumn: () => state.colEnd || state.col || 1
    });
    return sheet;
  };
}

function chay(so) {
  section('SelectionService — không được dùng cùng số hàng để mở nhầm khách ở sheet khác');

  let nen;
  try {
    nen = dungHop({ sheets: ['Customer', 'Activity', 'Category'], tep: TEP_NEN.concat(['server/service/SelectionService.js']) });
    nen.book.insertSheet('!Lead');
  } catch (err) {
    return ghiLoiNap(so, 'nạp được SelectionService', err);
  }

  const hop = nen.hop;
  const state = { sheetName: 'Customer', row: 4, col: 2 };
  ganLuaChon(nen, state);

  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'CUS-000004');
  ghiO(nen, 'Customer', 6, '@CUS_MA_KH', 'CUS-000006');
  ghiO(nen, 'Activity', 4, '@ACT_MA_GD', 'ACT-000004');
  ghiO(nen, 'Activity', 4, '@ACT_MA_KH', 'CUS-000099');
  const lead = nen.book.getSheetByName('!Lead');
  lead.getRange(1, 1).setValue('@CUS_MA_KH');
  lead.getRange(7, 1).setValue('CUS-000007');

  check(so, 'Customer tra cột mã khách của Customer', hop.probeSelectionFull().customerId, 'CUS-000004');

  state.sheetName = 'Activity';
  check(so, 'Activity tra @ACT_MA_KH, không lấy khách cùng số hàng bên Customer', hop.probeSelectionFull().customerId, 'CUS-000099');

  state.sheetName = 'Customer';
  state.row = 2;
  check(so, 'hàng tiêu đề 1-3 luôn rỗng', hop.probeSelectionFull().customerId, '');

  state.sheetName = 'Category';
  state.row = 4;
  check(so, 'sheet ngoài kho trả rỗng, không dùng nhầm dữ liệu Customer', hop.probeSelectionFull({ Category: { '4': 'CUS-SAI' } }).customerId, '');

  state.sheetName = 'Customer';
  state.row = 5;
  check(so, 'hàng dữ liệu trống trả rỗng', hop.probeSelectionFull().customerId, '');

  state.sheetName = '!Lead';
  state.row = 7;
  const rendered = [];
  hop.renderViewIfDirty = (sheetName) => { rendered.push(sheetName); };
  const viewSelection = hop.probeSelectionFull({ '!Lead': { '7': 'CUS-SAI' } });
  check(so, 'polling trên sheet quản trị đọc trực tiếp cột mã sau khi render',
    [viewSelection.customerId, rendered],
    ['CUS-000007', ['!Lead']]);

  state.sheetName = 'Customer';
  state.row = 6;
  state.col = 3;
  state.rowEnd = 6;
  state.colEnd = 3;
  const snapshot = hop.selectionSnapshot();
  check(so, 'snapshot dùng gắn vào phản hồi không tự mang dirty, ms hay ok', Object.keys(snapshot).sort(), ['cellRef', 'col', 'colEnd', 'gid', 'row', 'rowEnd', 'selectionKind', 'sheetName', 'spreadsheetId'].sort());

  const calls = [];
  hop.runEntryPoint = function (name, source, channel, fn) {
    calls.push([name, source, channel]);
    return fn();
  };
  const full = hop.probeSelectionFull();
  hop.probeSelectionCheap();
  hop.viewProbeSelection();
  check(so, 'ba cửa mỗi cửa chỉ mở một runEntryPoint và phản hồi đầy đủ báo ms bằng số', [calls, typeof full.ms], [[['probeSelectionFull', 'sidebar', 'throw'], ['probeSelectionCheap', 'sidebar', 'throw'], ['viewProbeSelection', 'sidebar', 'throw']], 'number']);

  return so;
}

module.exports = { chay };
