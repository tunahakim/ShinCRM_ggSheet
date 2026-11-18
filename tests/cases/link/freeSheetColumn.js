/**
 * Sheet xem tự do chứa nhiều danh sách cạnh nhau: luật chọn cột mã cho ô đang nhấp có hai bản chạy ở hai môi trường (GAS khi vắng Extension, Sidebar khi có Extension). Một bảng ca chạy qua cả hai, nên hai bản lệch nhau là đỏ ngay.
 */

const { dungHop, TEP_NEN } = require('../../lib/dung-hop');
const { dungHopLienKet, batDauLienKet } = require('../../lib/sidebar/hop-lien-ket');
const { section, check, ghiLoiNap } = require('../../lib/assert');

const MAU_VIEW = [
  { token: '!:@CUS_MA_KH', headerAddress: 'A1', expectedValue: '@CUS_MA_KH', valueAddressTemplate: 'A{row}' },
  { token: '!:@ACT_MA_KH', headerAddress: 'B1', expectedValue: '@ACT_MA_KH', valueAddressTemplate: 'B{row}' }];

/** Hàng 1 (theo cột, '' là ô trống), cột đang nhấp, cột mã mong đợi (0 là không có cột mã). */
const BANG = [
  { ten: 'Kanban: nhấp cột mã khối 1', hang1: ['@CUS_MA_KH', 'Tên', 'GD cuối', '', '@CUS_MA_KH', 'Tên', '', '@ACT_MA_KH', 'Tiền'], cot: 1, mong: 1 },
  { ten: 'Kanban: nhấp giữa khối 1', hang1: ['@CUS_MA_KH', 'Tên', 'GD cuối', '', '@CUS_MA_KH', 'Tên', '', '@ACT_MA_KH', 'Tiền'], cot: 3, mong: 1 },
  { ten: 'Kanban: cột trống ngăn khối thuộc khối bên trái', hang1: ['@CUS_MA_KH', 'Tên', 'GD cuối', '', '@CUS_MA_KH', 'Tên', '', '@ACT_MA_KH', 'Tiền'], cot: 4, mong: 1 },
  { ten: 'Kanban: nhấp khối 2', hang1: ['@CUS_MA_KH', 'Tên', 'GD cuối', '', '@CUS_MA_KH', 'Tên', '', '@ACT_MA_KH', 'Tiền'], cot: 6, mong: 5 },
  { ten: 'Kanban: khối 3 mở bằng @ACT_MA_KH, nhấp ngoài mép phải', hang1: ['@CUS_MA_KH', 'Tên', 'GD cuối', '', '@CUS_MA_KH', 'Tên', '', '@ACT_MA_KH', 'Tiền'], cot: 12, mong: 8 },
  { ten: 'chỉ một cột mã: ô bên trái cột mã vẫn dùng cột mã đó', hang1: ['Ghi chú', 'Tên', '@CUS_MA_KH', 'GD cuối'], cot: 1, mong: 3 },
  { ten: 'chỉ một cột mã: ô bên phải cột mã dùng cột mã đó', hang1: ['Ghi chú', '@ACT_MA_KH', 'Tiền'], cot: 3, mong: 2 },
  { ten: 'từ hai cột mã: ô trước cột mã đầu tiên không thuộc cột nào', hang1: ['Ghi chú', '@CUS_MA_KH', 'Tên', '@CUS_MA_KH'], cot: 1, mong: 0 },
  { ten: 'không có cột mã', hang1: ['Tên', 'Ghi chú'], cot: 2, mong: 0 }
];

function chay(so) {
  section('Sheet tự do nhiều danh sách — GAS và Sidebar chọn cùng một cột mã cho ô đang nhấp');

  let nen;
  try { nen = dungHop({ sheets: ['Customer', 'Activity', 'Category'], tep: TEP_NEN.concat(['server/service/SelectionService.js']) }); }
  catch (err) { return ghiLoiNap(so, 'nạp được SelectionService', err); }
  const lienKet = dungHopLienKet(); batDauLienKet(lienKet);
  lienKet.SHEET_LINK_READ_PLAN = { Customer: [], Activity: [], Category: [], '!': MAU_VIEW };

  BANG.forEach((ca, i) => {
    const sheet = nen.book.insertSheet('Bang ' + i);
    ca.hang1.forEach((ma, cot) => { if (ma) { sheet.getRange(1, cot + 1).setValue(ma); } });
    const gas = nen.hop.selectionFreeSheetColumn(sheet, ca.cot);
    const rawHeaderRow = ca.hang1.map((ma, cot) => ma ? { address: lienKet.sheetLinkColumnLetters(cot + 1) + '1', column: cot + 1, value: ma } : null).filter(Boolean);
    const sidebar = lienKet.sheetLinkFreeSheetCodeColumn({ sheetName: 'Bang ' + i, cellRef: lienKet.sheetLinkColumnLetters(ca.cot) + '7', row: 7, col: ca.cot, rawHeaderRow });
    check(so, ca.ten, [gas, sidebar], [ca.mong, ca.mong]);
  });

  section('Sheet tự do nhiều danh sách — Sidebar đọc mọi cột mã và mở đúng khách của khối đang nhấp');
  const hang1 = [
    { address: 'A1', column: 1, value: '@CUS_MA_KH' },
    { address: 'E1', column: 5, value: '@CUS_MA_KH' },
    { address: 'H1', column: 8, value: '@ACT_MA_KH' }];
  const hop = dungHopLienKet(); batDauLienKet(hop); hop._calls = [];
  hop.SHEET_LINK_READ_PLAN = { Customer: [], Activity: [], Category: [], Config: [], '!': JSON.parse(JSON.stringify(MAU_VIEW)) };
  hop.SHEET_LINK_LAST_ACK = 5000; hop._clock.now = 5001;
  hop.Store = { hasCustomer: (id) => /^CUS-00000[4-6]$/.test(id) };
  const picked = [];
  const misses = [];
  hop.ACTIONS.setCurrentCustomer = (input) => { picked.push(input.pick); hop.ScreenState.currentCustomerId = input.pick; };
  hop.screenViewSetSelectionMiss = (miss) => { misses.push(miss); hop.ScreenState.selectionMiss = miss; };
  hop.callServer = (name, args, options) => { hop._calls.push({ name, args, options }); return { then() { return this; } }; };
  let seq = 0;
  const read = (cot, value) => ({ token: 'x', status: 'ok', matched: true, valueAddress: cot + '7', value });
  const gui = (cellRef, reads) => hop.sheetLinkOnMessage({ origin: hop.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: hop.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: ++seq, gid: '9', sheetName: 'Kanban', cellRef, row: 7, readStatus: 'ok', readReason: '', rawHeaderRow: hang1, reads } });

  // Plan còn là bản mẫu `!` (chỉ cột A, B): nhấp khối 2 thì chưa biết, không được mở khách khối 1.
  gui('F7', [read('A', 'CUS-000004')]);
  check(so, 'plan chưa theo kịp hàng 1: nhấp khối 2 không mở khách khối 1, không báo gì; plan đổi thành đủ ba cột mã',
    [picked, misses, hop.sheetLinkPlanForSheet('Kanban').map((item) => item.valueAddressTemplate)],
    [[], [], ['A{row}', 'E{row}', 'H{row}']]);
  const du = [read('A', 'CUS-000004'), read('E', 'CUS-000005'), read('H', 'CUS-000006')];
  gui('F7', du);
  gui('C7', du);
  gui('J7', du);
  check(so, 'nhấp khối 2, khối 1, ngoài mép phải khối 3: mở đúng khách từng khối, 0 lời hỏi GAS', [picked, hop._calls.length], [['CUS-000005', 'CUS-000004', 'CUS-000006'], 0]);
  gui('F7', [read('A', 'CUS-000004'), read('E', ''), read('H', 'CUS-000006')]);
  check(so, 'ô mã khối đang nhấp trống (danh sách ngắn hơn khối bên cạnh): báo hàng không có khách, không lấy khách khối khác',
    [picked.length, misses], [3, [{ kind: 'empty' }]]);

  section('Sheet `!` và sheet kho chỉ được một cột mã: nhân đôi thì không đọc, ở cả GAS và Sidebar');
  const viewTrung = nen.book.insertSheet('!Trung');
  ['@CUS_MA_KH', '@ACT_MA_KH', 'Tên', '', '@CUS_MA_KH'].forEach((ma, cot) => { if (ma) { viewTrung.getRange(1, cot + 1).setValue(ma); } });
  viewTrung.getRange(4, 1).setValue('CUS-000004');
  viewTrung.getRange(4, 5).setValue('CUS-000005');
  const khoTrung = nen.book.getSheetByName('Customer');
  const cuoi = khoTrung.getLastColumn() + 1;
  khoTrung.getRange(1, cuoi).setValue('@CUS_MA_KH');
  khoTrung.getRange(4, cuoi).setValue('CUS-000005');
  check(so, 'GAS: sheet `!` và sheet Customer có @CUS_MA_KH nhân đôi thì ô mã rỗng, không đoán cột',
    [nen.hop.selectionCustomerCell({ sheet: viewTrung }, { sheetName: '!Trung', row: 4, col: 3 }).value, nen.hop.selectionCustomerCell({ sheet: khoTrung }, { sheetName: 'Customer', row: 4, col: 3 }).value],
    ['', '']);
  const view = dungHopLienKet(); batDauLienKet(view);
  view.SHEET_LINK_READ_PLAN = { Customer: [], Activity: [], Category: [], Config: [], '!': JSON.parse(JSON.stringify(MAU_VIEW)) };
  view.SHEET_LINK_LAST_ACK = 5000; view._clock.now = 5001;
  view.callServer = () => ({ then() { return this; } });
  view.sheetLinkOnMessage({ origin: view.SHEET_LINK_ORIGIN, data: { action: 'CRM_CONTEXT', nonce: view.SHEET_LINK_NONCE, spreadsheetId: 'sheet-1', seq: 1, gid: '11', sheetName: '!Trung', cellRef: 'C4', row: 4, readStatus: 'ok', readReason: '', rawHeaderRow: [{ address: 'A1', column: 1, value: '@CUS_MA_KH' }, { address: 'B1', column: 2, value: '@ACT_MA_KH' }, { address: 'E1', column: 5, value: '@CUS_MA_KH' }], reads: [] } });
  check(so, 'Sidebar: sheet `!` có @CUS_MA_KH nhân đôi thì plan bỏ mã đó, chỉ giữ mã có đúng một cột',
    view.sheetLinkPlanForSheet('!Trung').map((item) => item.expectedValue + '@' + item.valueAddressTemplate),
    ['@ACT_MA_KH@B{row}']);
}

module.exports = { chay };
