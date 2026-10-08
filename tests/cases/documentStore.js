const fs = require('fs');
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
  nen.hop.renderAllManagedViewsIfAllowed = () => ({ ok: true, rendered: 0 });
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
  const saved = nen.hop.writeGateSave({ entity: 'customer', records: [{ companyName: 'Khách mới', phone: '0987000115' }], source: 'pull' });
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
    khoa.releaseLock = () => { revisionLucNha = signalEnv.stubs._props.reloadRevision || null; return nha(); };
    return khoa;
  };
  signalEnv.hop.documentStoreBegin();
  signalEnv.hop.writeGateSave({ entity: 'customer', records: [{ id: 'KH000001', phone: '0987000111' }], source: 'pull' });
  signalEnv.hop.documentStoreEnd();
  check(so, 'cửa kho: tín hiệu reload của lõi đã ở kho thật trước khi nhả khóa tài liệu', revisionLucNha, '1');

  // Quét chống tái phạm: chỉ cửa kho được gọi thẳng DocumentProperties và lấy khóa.
  const viPham = cacTepJs(GAS, GAS).filter((tep) => NGOAI_LE.indexOf(tep) < 0).filter((tep) => {
    // Bỏ chú thích: docstring được phép nhắc tên hàm cũ (ví dụ con số `waitLock(15000)` của bản cũ trong Settings.js).
    const nguon = fs.readFileSync(path.join(GAS, tep), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /getDocumentProperties\s*\(/.test(nguon) || /\.(tryLock|waitLock)\s*\(/.test(nguon);
  });
  check(so, 'cửa kho: không tệp GAS nào gọi thẳng getDocumentProperties() hoặc tryLock/waitLock ngoài server/state/DocumentStore.js', viPham, []);
}

module.exports = { chay };
