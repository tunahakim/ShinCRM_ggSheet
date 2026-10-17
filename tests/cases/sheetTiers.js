/**
 * Tầng 1–2 đọc/ghi Sheet (tài liệu 06 Phần 2): gom vùng, định vị dòng theo mã, chính sách loại sheet, công cụ ghi ô tự quên tờ nháp.
 *
 * Nhánh hỏng âm thầm cần chốt: ghi sheet kho ngoài khóa, ghi vào sheet tự do của người dùng, đọc lại sau ghi trong cùng lần gọi mà thấy giá trị cũ hoặc số dòng cuối cũ, và hai dòng cùng mã bị định vị lặng lẽ vào một dòng.
 */
const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

function trongLanGoi(hop, fn) {
  hop.documentStoreBegin();
  hop.pendingChangesBegin();
  try { return fn(); } finally { hop.pendingChangesEnd(); hop.documentStoreEnd(); }
}

function loiCua(fn) {
  try { fn(); return ''; } catch (err) { return String(err && err.message || err); }
}

function chay(so) {
  section('Tầng 1–2 đọc/ghi Sheet');

  let nen;
  try {
    nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] });
    ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
    ghiO(nen, 'Customer', 5, '@CUS_MA_KH', 'KH000002');
    nen.hop.shinViewSheetNames = () => [];
  } catch (err) { return ghiLoiNap(so, 'dựng hộp cát tầng đọc/ghi Sheet', err); }
  const hop = nen.hop;

  check(so, 'gom dải liền nhau, bỏ số trùng, không chèn số không xin', JSON.stringify(hop.sheetRegionsSpans([5, 0, 1, 2, 6, 18, 1])), JSON.stringify([[0, 1, 2], [5, 6], [18]]));
  check(so, 'gom dòng đọc theo ngưỡng cách dòng', JSON.stringify(hop.sheetRegionsReadGroups([10, 4, 400, 12], 300)), JSON.stringify([[4, 12], [400, 400]]));

  check(so, 'định vị dòng theo mã, bỏ ô mã rỗng', JSON.stringify(hop.sheetLocateRowMap(['KH1', '', ' KH2 '], 4, 'Customer')), JSON.stringify({ KH1: 4, KH2: 6 }));
  check(so, 'hai dòng cùng mã thì ném lỗi chỉ rõ hai dòng', /hai dòng cùng mã "KH1" \(dòng 4 và dòng 6\)/.test(loiCua(() => hop.sheetLocateRowMap(['KH1', 'KH2', 'KH1'], 4, 'Customer'))), true);

  check(so, 'chính sách loại sheet', ['Customer', 'Log', '!Khách', 'Nháp'].map((ten) => hop.sheetPolicy(ten).kind).join(','), 'store,log,view,free');

  const customer = nen.Customer.sheet;
  const cotMa = nen.Customer.codes.indexOf('@CUS_MA_KH') + 1;
  check(so, 'ghi sheet kho ngoài khóa tài liệu thì ném lỗi, không ghi gì', [/ngoài khóa tài liệu/.test(loiCua(() => hop.sheetCellsWrite(customer, 6, cotMa, [['KH000009']]))), customer.getRange(6, cotMa).getValue()], [true, '']);
  const nhap = nen.book.insertSheet('Nháp');
  check(so, 'ghi sheet tự do của người dùng thì ném lỗi kể cả trong khóa', /sheet tự do/.test(loiCua(() => trongLanGoi(hop, () => hop.documentLockRun(() => hop.sheetCellsWrite(nhap, 1, 1, [['x']]))))), true);
  check(so, 'sheet Log ghi được ngoài khóa', loiCua(() => hop.sheetCellsWrite(nen.Log.sheet, 2, 1, [['x']])), '');

  let soFlush = 0;
  const flushGoc = hop.SpreadsheetApp.flush;
  hop.SpreadsheetApp.flush = () => { soFlush += 1; };
  let soLastRow = 0;
  const lastRowGoc = customer.getLastRow.bind(customer);
  customer.getLastRow = () => { soLastRow += 1; return lastRowGoc(); };
  const ketQua = trongLanGoi(hop, () => hop.documentLockRun(() => {
    const truoc = hop.sheetReadRows(customer, [4])[0][cotMa - 1];
    const dongCuoiTruoc = hop.sheetReadLastRow(customer);
    const flushTruocGhi = soFlush;
    hop.sheetCellsWrite(customer, 4, cotMa, [['KH000101']]);
    hop.sheetCellsWrite(customer, 7, cotMa, [['KH000107']]);
    const sau = hop.sheetReadRows(customer, [4])[0][cotMa - 1];
    const flushSauDoc = soFlush;
    const dongCuoiSauGhi = hop.sheetReadLastRow(customer);
    const lastRowSauGhi = soLastRow;
    hop.sheetCellsClear(customer, 7, cotMa, 1, 1);
    const dongCuoiSauXoa = hop.sheetReadLastRow(customer);
    return { truoc, sau, dongCuoiTruoc, dongCuoiSauGhi, dongCuoiSauXoa, flushGhi: flushSauDoc - flushTruocGhi, hoiLaiSauGhi: lastRowSauGhi - 1, hoiLaiSauXoa: soLastRow - lastRowSauGhi };
  }));
  hop.SpreadsheetApp.flush = flushGoc;
  check(so, 'đọc lại sau ghi trong cùng lần gọi thấy giá trị mới', [ketQua.truoc, ketQua.sau], ['KH000001', 'KH000101']);
  check(so, 'hai lệnh ghi liền nhau chỉ ép xuống một lần trước lần đọc kế', ketQua.flushGhi, 1);
  check(so, 'ghi nối dài sheet thì nâng dòng cuối đã nhớ mà không hỏi lại Sheet', [ketQua.dongCuoiTruoc, ketQua.dongCuoiSauGhi, ketQua.hoiLaiSauGhi], [5, 7, 0]);
  check(so, 'xóa nội dung thì quên dòng cuối đã nhớ và hỏi lại Sheet', [ketQua.dongCuoiSauXoa, ketQua.hoiLaiSauXoa], [5, 1]);

  const sauXoaDong = trongLanGoi(hop, () => hop.documentLockRun(() => {
    hop.sheetReadRows(customer, [4, 5]);
    hop.sheetRowsDelete(customer, [4]);
    return hop.sheetReadRows(customer, [4])[0][cotMa - 1];
  }));
  check(so, 'xóa dòng thì bỏ tờ nháp của sheet, dòng dưới dịch lên được đọc lại', sauXoaDong, 'KH000002');

  section('Tầng 3 ghi bản ghi');
  const ctx = trongLanGoi(hop, () => hop.documentLockRun(() => hop.entityReadContext('customer')));
  check(so, 'định vị mã không có trên sheet thì ném lỗi, không coi là bản ghi mới', /Không tìm thấy mã "KH999"/.test(loiCua(() => trongLanGoi(hop, () => hop.documentLockRun(() => hop.entityPlace(hop.entityReadContext('customer'), ['KH999']))))), true);
  check(so, 'ghi bản ghi ngoài khóa thì ném lỗi', /ngoài khóa tài liệu/.test(loiCua(() => hop.entityWriteRecords(ctx, { note: hop.DATA_SCHEMA.customer.note }, { sheetName: 'Customer', rows: { KH000002: 4 } }, [{ id: 'KH000002', values: { note: 'x' } }]))), true);
  const doc = trongLanGoi(hop, () => hop.documentLockRun(() => {
    const c = hop.entityReadContext('customer');
    const fields = { id: hop.DATA_SCHEMA.customer.id, note: hop.DATA_SCHEMA.customer.note };
    const placement = hop.entityPlace(c, ['KH000002']);
    const written = hop.entityWriteRecords(c, fields, placement, [{ id: 'KH000002', values: { note: 'sửa' } }, { id: 'KH000300', values: { id: 'KH000300', note: '0123' }, append: true }]);
    const at = c.names.indexOf('note');
    return hop.entityReadPlaced(c, written, ['KH000300', 'KH000002']).rows.map((row) => row[c.idAt] + ':' + row[at]);
  }));
  check(so, 'ghi sửa và nối thêm rồi đọc lại theo vị trí, đúng thứ tự mã, cột chữ giữ số 0 đầu', doc, ['KH000300:0123', 'KH000002:sửa']);
}

module.exports = { chay };
