/**
 * Bản đọc Sheet chung của một lần gọi (`server/sheet/SheetReadCopy.js`, tài liệu 06 Phần 2).
 *
 * Nhánh hỏng âm thầm cần chốt: nhớ ngoài lần gọi (đọc hàng mã cũ ở lần gọi sau), không bỏ khi vừa cầm khóa (đọc số dòng cũ do tiến trình khác vừa ghi), và writer ghi xong mà lần đọc sau trong cùng lần gọi vẫn thấy số dòng cũ.
 */
const { dungHop, ghiO } = require('../lib/dung-hop');
const { napServer } = require('../lib/load-gas');
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

/** Hộp cát có phần đồng bộ FBM: nạp các tệp đọc/ghi của `fbm_sync` và thêm cột đồng bộ vào hàng mã Customer như `SyncColumnSetup` làm trên tệp thật. */
function taoHopFbm() {
  const nen = taoHop();
  napServer(nen.hop, 'fbm_sync/SyncSchema.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/state/State.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/SheetSave.js', 'server/service/FbmSyncService.js');
  const sync = Object.keys(nen.hop.SYNC_SCHEMA.customer).map((name) => nen.hop.SYNC_SCHEMA.customer[name].code).filter((code) => nen.Customer.codes.indexOf(code) < 0);
  nen.Customer.codes = nen.Customer.codes.concat(sync);
  nen.Customer.sheet.getRange(1, 1, 1, nen.Customer.codes.length).setValues([nen.Customer.codes]);
  return nen;
}

/** Đếm lệnh đọc nhiều cột ở vùng dữ liệu (đọc dòng); ghi một ô hay đọc một cột không tính. */
function demDocDong(nen, tenSheet) {
  const sheet = nen[tenSheet].sheet;
  const dem = { n: 0 };
  const layVung = sheet.getRange.bind(sheet);
  sheet.getRange = function (row, col, rows, cols) { if (row >= nen.hop.SHEET_FIRST_DATA_ROW && cols > 1) { dem.n += 1; } return layVung.apply(null, arguments); };
  return dem;
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

  hop.beforeHardDelete = (entity, ids) => ({ soft: ids.indexOf('KH000002') >= 0 ? { KH000002: 'thử xóa mềm' } : {} });
  const sauXoa = trongLanGoi(hop, () => {
    const kq = hop.deleteGateRemove({ entity: 'customer', ids: ['KH000001', 'KH000002'] });
    return [kq.ok, kq.hard, kq.soft.rows.length, hop.entityRowCount('customer')];
  });
  check(so, 'cửa xóa: xóa hẳn một dòng rồi đọc lại dòng xóa mềm đúng, số dòng sau đó giảm một', sauXoa, [true, ['KH000001'], 1, 3]);

  section('Bản đọc Sheet chung — đọc tập dòng, cửa ghi sửa bản đọc, gộp lệnh ghi');

  const nenDong = taoHop();
  ghiO(nenDong, 'Customer', 6, '@CUS_MA_KH', 'KH000003');
  ghiO(nenDong, 'Customer', 7, '@CUS_MA_KH', 'KH000004');
  ghiO(nenDong, 'Customer', 20, '@CUS_MA_KH', 'KH000020');
  const hd = nenDong.hop;
  const sheetDong = nenDong.Customer.sheet;
  const doc = { n: 0 };
  const layVung = sheetDong.getRange.bind(sheetDong);
  sheetDong.getRange = function (row, col, rows, cols) { if (row >= hd.SHEET_FIRST_DATA_ROW && cols > 1) { doc.n += 1; } return layVung.apply(null, arguments); };
  const nguongCu = hd.SETTINGS.SHEET_READ_MERGE_GAP_ROWS;
  hd.SETTINGS.SHEET_READ_MERGE_GAP_ROWS = 3;
  const cotMa = nenDong.Customer.codes.indexOf('@CUS_MA_KH');
  const docDong = trongLanGoi(hd, () => {
    const lan1 = hd.sheetReadRows(sheetDong, [20, 4, 7]).map((row) => row[cotMa]);
    const lenh1 = doc.n;
    hd.sheetReadRows(sheetDong, [5, 6, 20]);
    return [lan1, lenh1, doc.n];
  });
  hd.SETTINGS.SHEET_READ_MERGE_GAP_ROWS = nguongCu;
  check(so, 'đọc tập dòng: dòng cách nhau không quá ngưỡng gộp một lệnh (4..7), dòng xa đọc riêng (20); dòng đã có (kể cả dòng giữa) không đọc lại; đúng thứ tự xin',
    docDong, [['KH000020', 'KH000001', 'KH000004'], 2, 2]);

  doc.n = 0;
  // Đọc và lưu trong cùng một khóa: bản đọc lấy ngoài khóa bị bỏ lúc cầm khóa.
  const sauLuu = trongLanGoi(hd, () => hd.documentLockRun(() => {
    hd.sheetReadDataRows(sheetDong, hd.SHEET_FIRST_DATA_ROW);
    const truoc = doc.n;
    const kq = hd.writeGateSave({ entity: 'customer', records: [{ id: 'KH000002', phone: '0987000999' }], source: 'pull' });
    const sauGhi = doc.n;
    const cotPhone = nenDong.Customer.codes.indexOf(hd.DATA_SCHEMA.customer.phone.code);
    const phone = hd.sheetReadRows(sheetDong, [5])[0][cotPhone];
    hd.sheetReadDataRows(sheetDong, hd.SHEET_FIRST_DATA_ROW);
    return [kq.ok, truoc, sauGhi - truoc, String(phone).replace(/^'/, ''), doc.n - sauGhi];
  }));
  check(so, 'đã có cả sheet: cửa ghi chụp trước không tốn lệnh, chỉ đọc lại đúng dòng vừa ghi; sau đó bản đọc mang giá trị mới và đọc cả sheet không tốn lệnh nào',
    sauLuu, [true, 1, 1, '0987000999', 0]);

  const nenGop = taoHop();
  ghiO(nenGop, 'Customer', 6, '@CUS_MA_KH', 'KH000003');
  const gop = trongLanGoi(nenGop.hop, () => {
    const truoc = nenGop.dem.setValues;
    nenGop.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000002', phone: '0987000001' }, { id: 'KH000001', phone: '0987000002' }], source: 'pull' });
    const lienNhau = nenGop.dem.setValues - truoc;
    nenGop.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000003' }, { id: 'KH000003', phone: '0987000004' }], source: 'pull' });
    return [lienNhau, nenGop.dem.setValues - truoc - lienNhau];
  });
  check(so, 'gộp ghi: hai bản ghi dòng liền nhau cùng tập cột ghi một lệnh; hai dòng cách nhau thì mỗi dòng một lệnh, không ghi đè dòng giữa', gop, [1, 2]);
  const cotPhoneGop = nenGop.Customer.codes.indexOf(nenGop.hop.DATA_SCHEMA.customer.phone.code) + 1;
  check(so, 'gộp ghi: mỗi dòng nhận đúng giá trị của bản ghi mình, dòng giữa giữ nguyên',
    [4, 5, 6].map((row) => String(nenGop.Customer.sheet.getRange(row, cotPhoneGop).getValue()).replace(/^'/, '')), ['0987000003', '0987000001', '0987000004']);

  section('Bản đọc Sheet chung — đồng bộ FBM đọc qua bản chung');

  let fbm;
  try { fbm = taoHopFbm(); } catch (err) { return ghiLoiNap(so, 'dựng hộp cát FBM trên bản đọc Sheet', err); }
  const hf = fbm.hop;
  ghiO(fbm, 'Customer', 5, hf.SYNC_SCHEMA.customer.syncStatus.code, hf.FbmSync.SYNC_STATUS.conflict);
  ghiO(fbm, 'Category', hf.SHEET_FIRST_DATA_ROW, fbm.Category.codes[0], 'Hà Nội');
  const docKhach = demDocDong(fbm, 'Customer');
  const docDanhMuc = demDocDong(fbm, 'Category');
  const motLanGoi = trongLanGoi(hf, () => {
    const dau = hf.FbmSync.readLocal('customer');
    dau[0].id = 'BẨN';
    const lai = hf.FbmSync.readLocal('customer')[0].id;
    hf.FbmSync.readCategoryGate();
    hf.FbmSync.readCategoryGate();
    return [lai, docKhach.n, docDanhMuc.n];
  });
  check(so, 'trong một lần gọi: readLocal và danh mục gọi nhiều lần chỉ đọc mỗi sheet một lần; bên gọi sửa record không làm bẩn lần đọc sau', motLanGoi, ['KH000001', 1, 1]);

  docKhach.n = 0;
  const snapshot = hf.FbmSync.withLocalSnapshot(() => { hf.FbmSync.readLocal('customer'); hf.FbmSync.readLocal('customer'); return docKhach.n; });
  hf.FbmSync.readLocal('customer');
  check(so, 'preflight ngoài lần gọi (withLocalSnapshot) đọc Sheet một lần, hết khối thì lần sau đọc mới', [snapshot, docKhach.n], [1, 2]);

  docKhach.n = 0;
  const sauGhiFbm = trongLanGoi(hf, () => hf.documentLockRun(() => {
    hf.FbmSync.readLocal('customer');
    hf.FbmSync.recordChange(() => ({ save: [{ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000555' }], source: 'pull' }] }));
    const truoc = docKhach.n;
    const phone = hf.FbmSync.readLocal('customer')[0].phone;
    return [String(phone).replace(/^'/, ''), docKhach.n - truoc];
  }));
  check(so, 'cửa ghi FBM: đọc lại sau khi ghi thấy giá trị mới mà không đọc lại sheet', sauGhiFbm, ['0987000555', 0]);


  ghiO(fbm, 'Customer', 5, hf.SYNC_SCHEMA.customer.syncStatus.code, '');
  docKhach.n = 0;
  const luu = trongLanGoi(hf, () => {
    const khoaTruoc = fbm.stubs._khoa.dem;
    const ra = hf.FbmSync.recordChange((gate) => {
      const local = gate.readById('customer', hf.FbmSync.recordSchemas(), 'KH000002');
      return { save: [{ entity: 'customer', records: [{ id: local.id, phone: '0987000666' }], source: 'pull' }] };
    });
    return [ra.ok, fbm.stubs._khoa.dem - khoaTruoc, docKhach.n];
  });
  check(so, 'Cửa bản ghi: đọc dòng, quyết và ghi trong một lần cầm khóa tài liệu, dòng đọc trong cửa được cửa ghi dùng lại (chỉ thêm một lần đọc lại sau ghi)', luu, [true, 1, 2]);

  const tz = { n: 0 };
  const goc = nen.book.getSpreadsheetTimeZone.bind(nen.book);
  nen.book.getSpreadsheetTimeZone = () => { tz.n += 1; return goc(); };
  trongLanGoi(hop, () => { hop.entityReadContext('customer'); hop.entityReadContext('activity'); hop.documentLockRun(() => hop.entityReadContext('customer')); });
  check(so, 'múi giờ tệp hỏi một lần cho cả lần gọi, kể cả sau khi cầm khóa', tz.n, 1);

  section('Bản đọc Sheet chung — đọc một sheet theo yêu cầu dạng dữ liệu');
  {
    const nb = taoHop();
    const hb = nb.hop;
    const kh = nb.book.getSheetByName('Customer');
    const lenh = nb.dem.doc;
    const cotMa = nb.Customer.codes.indexOf('@CUS_MA_KH');
    const t0 = Object.assign({}, lenh);
    const khoi = trongLanGoi(hb, () => hb.documentLockRun(() => {
      const a = hb.sheetReadBlock(kh, { data: 'all' });
      const lenhSauKhoi = lenh.getValues - t0.getValues;
      const lai = hb.sheetReadBlock(kh, { data: 'all' });
      const map = hb.readColumnMap('Customer');
      const dong = hb.sheetReadRows(kh, [5])[0];
      const lenhTruocGhi = [lenh.getValues - t0.getValues, lenh.getLastRow - t0.getLastRow, lenh.getLastColumn - t0.getLastColumn];
      a.rows[5][cotMa] = 'sửa bản sao';
      hb.sheetCellsWrite(kh, 5, cotMa + 1, [['KH000009']]);
      const sauGhi = hb.sheetReadBlock(kh, { data: 'all' });
      return [a.lastRow, a.header.length, lenhSauKhoi, lai.rows[5][cotMa], map.map['@CUS_MA_KH'], dong[cotMa], lenhTruocGhi, sauGhi.rows[5][cotMa], lenh.getValues - t0.getValues];
    }));
    check(so, 'data all: một lệnh getDataRange cho hàng 1, dòng cuối và mọi dòng; hỏi lại khối, hàng mã, dòng lẻ không tốn lệnh; sửa mảng trả về không bẩn tờ nháp; ghi xong đọc lại thấy giá trị mới',
      khoi, [5, nb.Customer.codes.length, 1, 'KH000002', cotMa + 1, 'KH000002', [1, 0, 0], 'KH000009', 2]);

    const trong = nb.book.insertSheet('Trống');
    check(so, 'sheet trắng: getDataRange trả ô A1 rỗng nhưng khối là không cột, không dòng', [hb.sheetReadBlock(trong, { data: 'all' }).header, hb.sheetReadBlock(trong, { data: 'all' }).lastRow], [[], 0]);

    const xem = nb.book.insertSheet('!Xem');
    xem.getRange(1, 1, 1, 2).setValues([['@CUS_MA_KH', '@CUS_TEN_CTY']]);
    xem.getRange(3, 2).setValue('Hai');
    xem.getRange(20, 1).setValue('dòng vẽ cũ');
    const t1 = Object.assign({}, lenh);
    const tren = hb.sheetReadBlock(xem, { rows: [3, 13], lastRow: true });
    check(so, 'vài hàng đầu: một lệnh đọc từ hàng 1 tới hàng xa nhất cộng một getLastRow, hàng 1 bỏ ô trống cuối, không đọc vùng dữ liệu cũ',
      [tren.header, tren.rows[3][1], tren.rows[13].length > 2, tren.lastRow, lenh.getValues - t1.getValues, lenh.getLastRow - t1.getLastRow, lenh.getLastColumn - t1.getLastColumn],
      [['@CUS_MA_KH', '@CUS_TEN_CTY'], 'Hai', true, 20, 1, 1, 0]);

    const hangLoi = (ten, hang) => { try { hb.sheetControlRow(ten, hang); return 'không ném'; } catch (err) { return 'ném'; } };
    check(so, 'dịch hàng điều khiển theo tên: sheet kho có hàng mã và nhãn, sheet `!` có thêm hàng lọc; hàng không khai thì ném chứ không đoán',
      [hb.sheetControlRow('Customer', 'label'), hb.sheetControlRow('!Xem', 'filter'), hangLoi('Customer', 'filter'), hangLoi('Log', 'label'), hangLoi('Trống', 'header')],
      [2, 3, 'ném', 'ném', 'ném']);
  }
}

module.exports = { chay };
