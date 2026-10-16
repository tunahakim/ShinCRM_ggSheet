/**
 * Bản đọc Sheet chung của một lần gọi (`server/sheet/SheetReadCopy.js`, tài liệu 06 Phần 2).
 *
 * Nhánh hỏng âm thầm cần chốt: nhớ ngoài lần gọi (đọc hàng mã cũ ở lần gọi sau), không bỏ khi vừa cầm khóa (đọc số dòng cũ do tiến trình khác vừa ghi), và writer ghi xong mà lần đọc sau trong cùng lần gọi vẫn thấy số dòng cũ.
 */
const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

/** Đếm số lần hỏi `getLastColumn`/`getLastRow` trên một sheet giả: mỗi lần là một lần đọc thật từ Sheet. */
function demLenh(sheet) {
  const dem = { cot: 0, dong: 0 };
  const lastColumn = sheet.getLastColumn.bind(sheet);
  const lastRow = sheet.getLastRow.bind(sheet);
  sheet.getLastColumn = () => { dem.cot += 1; return lastColumn(); };
  sheet.getLastRow = () => { dem.dong += 1; return lastRow(); };
  return dem;
}

/** Mở hai phạm vi mà `runEntryPoint` mở cho một lần gọi: bản đọc kho (kèm bản đọc Sheet) và danh sách thay đổi chờ ghi nhận. */
function trongLanGoi(hop, fn) {
  hop.documentStoreBegin();
  hop.pendingChangesBegin();
  try { return fn(); } finally { hop.pendingChangesEnd(); hop.documentStoreEnd(); }
}

function taoHop() {
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] });
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  ghiO(nen, 'Customer', 5, '@CUS_MA_KH', 'KH000002');
  nen.hop.shinViewSheetNames = () => [];
  return nen;
}

function chay(so) {
  section('Bản đọc Sheet chung của một lần gọi');

  let nen;
  try { nen = taoHop(); } catch (err) { return ghiLoiNap(so, 'dựng hộp cát bản đọc Sheet', err); }
  const hop = nen.hop;
  const dem = demLenh(nen.Customer.sheet);

  hop.readColumnMap('Customer');
  hop.readColumnMap('Customer');
  check(so, 'ngoài lần gọi không nhớ: hai lần tra cột là hai lần đọc hàng mã', dem.cot, 2);

  dem.cot = 0;
  trongLanGoi(hop, () => {
    hop.readColumnMap('Customer');
    hop.entityReadContext('customer');
    hop.selectionColumnIndex(nen.Customer.sheet, '@CUS_MA_KH');
  });
  check(so, 'trong một lần gọi: tra cột, dựng bối cảnh và tìm cột cho Selection chỉ đọc hàng mã một lần', dem.cot, 1);

  dem.cot = 0;
  trongLanGoi(hop, () => { hop.readColumnMap('Customer'); });
  check(so, 'lần gọi sau đọc lại hàng mã, không dùng bản của lần gọi trước', dem.cot, 1);

  const header = trongLanGoi(hop, () => { const h = hop.sheetReadHeader(nen.Customer.sheet); h[0] = 'BẨN'; return hop.sheetReadHeader(nen.Customer.sheet)[0]; });
  check(so, 'bên gọi sửa mảng hàng mã không làm bẩn bản đọc', header, nen.Customer.codes[0]);

  dem.dong = 0;
  const truocVaSauKhoa = trongLanGoi(hop, () => {
    const truoc = hop.entityRowCount('customer');
    // Tiến trình khác thêm một dòng trong lúc lần gọi này chờ khóa.
    ghiO(nen, 'Customer', 6, '@CUS_MA_KH', 'KH000003');
    const vanCu = hop.entityRowCount('customer');
    const trongKhoa = hop.documentLockRun(() => hop.entityRowCount('customer'));
    return [truoc, vanCu, trongKhoa];
  });
  check(so, 'vừa cầm khóa thì bỏ bản đọc: số dòng trong khóa thấy dòng tiến trình khác vừa thêm', truocVaSauKhoa, [2, 2, 3]);

  const sauGhi = trongLanGoi(hop, () => {
    const truoc = hop.entityRowCount('customer');
    const kq = hop.writeGateSave({ entity: 'customer', records: [{ companyName: 'Khách mới', phone: '0987000115' }], source: 'pull' });
    return [kq.ok, truoc, hop.entityRowCount('customer'), hop.entityReadContext('customer').rowCount];
  });
  check(so, 'cửa ghi thêm dòng xong thì lần đọc sau trong cùng lần gọi thấy số dòng mới', sauGhi, [true, 3, 4, 4]);

  hop.beforeHardDelete = (entity, id) => ({ allowed: id !== 'KH000002', reason: 'thử xóa mềm' });
  const sauXoa = trongLanGoi(hop, () => {
    const kq = hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001', 'KH000002'] });
    return [kq.ok, kq.hard, kq.soft.rows.length, hop.entityRowCount('customer')];
  });
  check(so, 'cửa xóa: xóa hẳn một dòng rồi đọc lại dòng xóa mềm đúng, số dòng sau đó giảm một', sauXoa, [true, ['KH000001'], 1, 3]);

  const tz = { n: 0 };
  const goc = nen.book.getSpreadsheetTimeZone.bind(nen.book);
  nen.book.getSpreadsheetTimeZone = () => { tz.n += 1; return goc(); };
  trongLanGoi(hop, () => { hop.entityReadContext('customer'); hop.entityReadContext('activity'); hop.documentLockRun(() => hop.entityReadContext('customer')); });
  check(so, 'múi giờ tệp hỏi một lần cho cả lần gọi, kể cả sau khi cầm khóa', tz.n, 1);
}

module.exports = { chay };
