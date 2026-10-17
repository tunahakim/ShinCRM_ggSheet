const fs = require('fs');
const { trongLanChay } = require('../lib/load-gas');
const path = require('path');
const { dungHop, ghiO } = require('../lib/dung-hop');
const { section, check, ghiLoiNap } = require('../lib/assert');

const GAS = path.join(__dirname, '..', '..', '1_ShinCRM_GAS');
// Cửa kho chính nó, và bộ đo DEV bọc khóa giả để đếm thời gian.
const NGOAI_LE = ['server/state/DocumentStore.js', 'server/dev/FbmPerfProbe.js'];

function taoHop() {
  const nen = dungHop({ sheets: ['Customer', 'Activity', 'Category', 'Config', 'Log'] });
  ghiO(nen, 'Customer', 4, '@CUS_MA_KH', 'KH000001');
  nen.hop.shinViewSheetNames = () => ['!Lead'];
  return nen;
}

function cacTepJs(thuMuc, goc) {
  return fs.readdirSync(thuMuc, { withFileTypes: true }).flatMap((muc) => {
    const day = path.join(thuMuc, muc.name);
    if (muc.isDirectory()) { return cacTepJs(day, goc); }
    return muc.name.endsWith('.js') ? [path.relative(goc, day).split(path.sep).join('/')] : [];
  });
}

function chay(so) {
  section('Cửa kho DocumentProperties dùng chung — bản đọc theo lần gọi, ghi thẳng ở lõi, khóa luôn đọc lại');

  let nen;
  try { nen = taoHop(); } catch (err) { return ghiLoiNap(so, 'dựng hộp cát cửa kho', err); }

  // Ghi một khách mới trong một lần gọi: cấp mã + phát tín hiệu reload trước đây đọc kho khoảng 150 lần mỗi lần ghi.
  nen.hop.documentStoreBegin();
  const docTruoc = nen.stubs._khoDem.doc;
  const saved = trongLanChay(nen.hop, () => nen.hop.writeGateSave({ entity: 'customer', records: [{ companyName: 'Khách mới', phone: '0987000115' }], source: 'pull' }));
  const soLanDoc = nen.stubs._khoDem.doc - docTruoc;
  nen.hop.documentStoreEnd();
  check(so, 'cửa kho: writeGateSave ghi khách mới trong một lần gọi chỉ đọc kho thật tối đa 3 lần',
    [saved.ok, soLanDoc <= 3], [true, true]);

  // Lõi ghi thẳng: tín hiệu reload phải nằm trong kho thật lúc nhả khóa tài liệu, để Sidebar/lượt khác đọc ngay sau khi khóa nhả thấy được.
  const signalEnv = taoHop();
  const layKhoa = signalEnv.hop.LockService.getDocumentLock;
  let revisionLucNha = null;
  signalEnv.hop.LockService.getDocumentLock = () => {
    const khoa = layKhoa();
    const nha = khoa.releaseLock;
    khoa.releaseLock = () => { revisionLucNha = signalEnv.stubs._props.reloadJournal ? JSON.parse(signalEnv.stubs._props.reloadJournal).rev : null; return nha(); };
    return khoa;
  };
  signalEnv.hop.documentStoreBegin();
  trongLanChay(signalEnv.hop, () => signalEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000111' }], source: 'pull' }));
  signalEnv.hop.documentStoreEnd();
  check(so, 'cửa kho: tín hiệu reload của lõi đã ở kho thật trước khi nhả khóa tài liệu', revisionLucNha, 1);

  section('Người giữ khóa tài liệu — một chỗ cầm, gọi lồng không tự khóa, trả khóa luôn qua flush rồi gửi kho');

  const giu = dungHop({ sheets: ['Config', 'Log'] });
  const thuTu = [];
  const flushGoc = giu.hop.SpreadsheetApp.flush;
  giu.hop.SpreadsheetApp.flush = () => { thuTu.push('flush'); return flushGoc(); };
  const layKhoaGiu = giu.hop.LockService.getDocumentLock;
  giu.hop.LockService.getDocumentLock = () => {
    const khoa = layKhoaGiu();
    const nha = khoa.releaseLock;
    khoa.releaseLock = () => { thuTu.push('nha:' + (giu.stubs._props.khoaA || '-') + (giu.stubs._props.khoaB || '-')); return nha(); };
    return khoa;
  };
  const dem = giu.stubs._khoDem;
  const ghiTruoc = dem.ghi;
  let trongKhoKhiDangGiu = null;
  const ra = giu.hop.documentLockRun(() => {
    giu.hop.documentProps().setProperty('khoaA', '1');
    giu.hop.documentLockRun(() => { giu.hop.documentProps().setProperty('khoaB', '2'); });
    trongKhoKhiDangGiu = [giu.stubs._props.khoaA, giu.hop.documentProps().getProperty('khoaB')];
    return 'xong';
  });
  check(so, 'người giữ khóa: gọi lồng chạy tiếp, chỉ cầm khóa một lần (khóa Google không tái nhập)', [ra, giu.stubs._khoa.dem, giu.stubs._khoa.demNha], ['xong', 1, 1]);
  check(so, 'người giữ khóa: trong khóa, ghi kho chờ (kho thật chưa có) nhưng đọc lại trong lần chạy thấy ngay', trongKhoKhiDangGiu, [undefined, '2']);
  check(so, 'người giữ khóa: trước khi nhả thì flush Sheet rồi gửi mọi khóa đã ghi bằng đúng một lệnh kho', [thuTu, dem.ghi - ghiTruoc], [['flush', 'nha:12'], 1]);

  const loiGiu = dungHop({ sheets: ['Config', 'Log'] });
  let loiRa = null;
  try { loiGiu.hop.documentLockRun(() => { loiGiu.hop.documentProps().setProperty('khoaA', 'truoc-loi'); throw new Error('lỗi giữa chừng'); }); } catch (e) { loiRa = e.message; }
  check(so, 'người giữ khóa: việc ném lỗi thì phần đã ghi trước lỗi vẫn được gửi, khóa vẫn nhả, lỗi gốc ném ra',
    [loiRa, loiGiu.stubs._props.khoaA, loiGiu.stubs._khoa.dangGiu], ['lỗi giữa chừng', 'truoc-loi', false]);

  const ban = dungHop({ sheets: ['Config', 'Log'] });
  ban.stubs._khoa.chanKhoa = true;
  let daChay = false;
  let banRa = null;
  try { ban.hop.documentLockRun(() => { daChay = true; }, 'Bận riêng.'); } catch (e) { banRa = e.message; }
  check(so, 'người giữ khóa: hết giờ chờ thì ném câu bận của bên gọi và không chạy việc', [banRa, daChay], ['Bận riêng.', false]);

  const lop = dungHop({ sheets: ['Config', 'Log'] });
  lop.hop.withDocumentStoreDeferred(() => {
    lop.hop.documentPropsDeferred().setProperty('dongBo', 'x');
    lop.hop.documentLockRun(() => { lop.hop.documentProps().setProperty('loi', 'y'); });
    check(so, 'người giữ khóa: nhả khóa tài liệu chỉ gửi phần ghi trong khóa đó, phần chờ của khóa điều phối đồng bộ vẫn chờ',
      [lop.stubs._props.loi, lop.stubs._props.dongBo], ['y', undefined]);
  });
  check(so, 'người giữ khóa: phần của đồng bộ được gửi khi nhả khóa điều phối', lop.stubs._props.dongBo, 'x');

  // Quét chống tái phạm: chỉ cửa kho được gọi thẳng DocumentProperties và lấy khóa.
  const viPham = cacTepJs(GAS, GAS).filter((tep) => NGOAI_LE.indexOf(tep) < 0).filter((tep) => {
    // Bỏ chú thích: docstring được phép nhắc tên hàm cũ (ví dụ con số `waitLock(15000)` của bản cũ trong Settings.js).
    const nguon = fs.readFileSync(path.join(GAS, tep), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /getDocumentProperties\s*\(/.test(nguon) || /\.(tryLock|waitLock)\s*\(/.test(nguon);
  });
  check(so, 'cửa kho: không tệp GAS nào gọi thẳng getDocumentProperties() hoặc tryLock/waitLock ngoài server/state/DocumentStore.js', viPham, []);

  // Khóa tài liệu chỉ cầm qua documentLockRun. Ngoại lệ: khóa điều phối của đồng bộ chỉ lùi về khóa tài liệu khi môi trường không có khóa script (Google luôn có).
  const NGOAI_LE_KHOA = NGOAI_LE.concat(['fbm_sync/state/State.js']);
  const tuCamKhoa = cacTepJs(GAS, GAS).filter((tep) => NGOAI_LE_KHOA.indexOf(tep) < 0).filter((tep) => {
    const nguon = fs.readFileSync(path.join(GAS, tep), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /getDocumentLock\s*\(/.test(nguon);
  });
  check(so, 'người giữ khóa: không tệp GAS nào tự lấy khóa tài liệu ngoài documentLockRun', tuCamKhoa, []);
}

module.exports = { chay };
