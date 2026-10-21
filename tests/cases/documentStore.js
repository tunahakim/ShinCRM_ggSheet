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

  section('Đọc JSON từ kho — hỏng không bao giờ thành rỗng im lặng');

  const json = dungHop({ sheets: ['Config', 'Log'] });
  const jh = json.hop;
  const maLoi = (work) => { try { work(); return 'không ném'; } catch (error) { return error.code || error.message; } };
  const khoDoc = (data) => ({ getProperty: (key) => (key in data ? data[key] : null) });
  check(so, 'công cụ đọc JSON: chưa có khóa thì null; đúng dạng thì trả object hoặc mảng',
    [jh.documentPropertyJson(khoDoc({}), 'k', 'thử', 'object'), jh.documentPropertyJson(khoDoc({ k: '{"a":1}' }), 'k', 'thử', 'object').a, jh.documentPropertyJson(khoDoc({ k: '[1]' }), 'k', 'thử', 'array').length],
    [null, 1, 1]);
  const loiHong = (() => { try { jh.documentPropertyJson(khoDoc({ k: '{"matKhau":"bi-mat"' }), 'k', 'thử', 'object'); } catch (error) { return error; } return null; })();
  check(so, 'công cụ đọc JSON: JSON hỏng, sai dạng hay đọc kho lỗi đều ném lỗi có mã; câu lỗi không chứa giá trị khóa',
    [loiHong.code, loiHong.message.indexOf('bi-mat'), maLoi(() => jh.documentPropertyJson(khoDoc({ k: '[1]' }), 'k', 'thử', 'object')), maLoi(() => jh.documentPropertyJson(khoDoc({ k: '{}' }), 'k', 'thử', 'array')),
      maLoi(() => jh.documentPropertyJson({ getProperty: () => { throw new Error('dịch vụ lỗi'); } }, 'k', 'thử', 'object'))],
    ['DOCUMENT_PROPERTY_CORRUPT', -1, 'DOCUMENT_PROPERTY_CORRUPT', 'DOCUMENT_PROPERTY_CORRUPT', 'DOCUMENT_PROPERTIES_READ_FAILED']);

  json.stubs._props.reloadJournal = '{hỏng';
  json.stubs._props.SHIN_RECORD_HOLDS_V1 = '[]';
  check(so, 'nguồn sự thật hỏng thì dừng hẳn: sổ nạp lại và sổ bận ném DOCUMENT_PROPERTY_CORRUPT, khóa giữ nguyên để khôi phục',
    [maLoi(() => jh.reloadJournalRead()), maLoi(() => jh.documentLockRun(() => jh.recordHoldsRead())), json.stubs._props.reloadJournal, json.stubs._props.SHIN_RECORD_HOLDS_V1],
    ['DOCUMENT_PROPERTY_CORRUPT', 'DOCUMENT_PROPERTY_CORRUPT', '{hỏng', '[]']);
  delete json.stubs._props.reloadJournal;
  delete json.stubs._props.SHIN_RECORD_HOLDS_V1;

  jh.logResetBuffers();
  json.stubs._props.viewLedger = '{hỏng';
  json.stubs._props.entryFailures = '[]';
  const soVe = jh.viewLedgerRead();
  const nhoLoi = jh.entryFailuresRead();
  const dongLog = jh.LOG_BUFFER.filter((line) => line.reason === 'DOCUMENT_PROPERTY_CORRUPT').length;
  const cauCho = JSON.parse(json.stubs._props.LOG_PENDING || '[]');
  check(so, 'bộ nhớ phụ hỏng thì báo rồi tự lành: trả rỗng, mỗi khóa một dòng Log lỗi và một câu chờ cho người dùng, khóa hỏng bị xóa',
    [soVe, nhoLoi, dongLog, cauCho.length, cauCho.every((cau) => cau.indexOf('bị hỏng') >= 0), 'viewLedger' in json.stubs._props, 'entryFailures' in json.stubs._props],
    [{}, {}, 2, 2, true, false, false]);

  jh.logResetBuffers();
  json.stubs._props.LOG_PENDING = '{hỏng';
  const layHong = jh.takePendingMessages();
  check(so, 'kho câu chờ hỏng: mở Sidebar vẫn nhận câu báo các câu cũ đã mất, có dòng Log lỗi, kho được dọn',
    [layHong, jh.LOG_BUFFER.some((line) => line.reason === 'DOCUMENT_PROPERTY_CORRUPT'), 'LOG_PENDING' in json.stubs._props],
    [[jh.ERROR_PENDING_LOST_MESSAGE], true, false]);
  json.stubs._props.LOG_PENDING = '"không phải mảng"';
  jh.errorPendingPush('Lỗi mới.');
  const khoMoi = JSON.parse(json.stubs._props.LOG_PENDING);
  check(so, 'kho câu chờ hỏng lúc thêm câu: bắt đầu danh sách mới, câu đầu nói các câu cũ đã mất, câu mới vẫn được giữ',
    [khoMoi.length, khoMoi[0].indexOf(jh.ERROR_PENDING_LOST_MESSAGE) >= 0, /Lỗi mới\.$/.test(khoMoi[1])], [2, true, true]);
  jh.errorPendingPush('Lỗi mới.');
  jh.errorPendingPush('Lỗi khác.');
  check(so, 'kho câu chờ: câu đã có trong kho không thêm lần nữa, câu khác vẫn vào',
    JSON.parse(json.stubs._props.LOG_PENDING).length, 3);
  // Trigger không có người nhìn: lỗi phải vào kho chờ để Sidebar hiện, không chỉ nằm ở Log.
  const nguonTrigger = fs.readFileSync(path.join(GAS, 'server/Triggers.js'), 'utf8');
  check(so, 'trigger sửa ô và thêm/xóa sheet báo lỗi qua kho chờ',
    ['shinOnEdit', 'shinOnChange'].map((ten) => new RegExp("runEntryPoint\\('" + ten + "', 'core', ERROR_CHANNEL_PENDING").test(nguonTrigger)), [true, true]);

  // Quét chống tái phạm: JSON trong kho chỉ đọc qua công cụ chung, nên không còn đường "hỏng thì coi là rỗng" tự viết.
  // Ngoại lệ: chính công cụ; EntryPoints.js (địa chỉ Web App, JSON thân request) và Book.js (cặp mã Sheet) đọc ScriptProperties, không phải DocumentProperties.
  const NGOAI_LE_JSON = ['server/state/DocumentStore.js', 'fbm_sync/transport/EntryPoints.js', 'server/sheet/Book.js'];
  const tuParse = cacTepJs(GAS, GAS).filter((tep) => !tep.startsWith('server/dev/') && NGOAI_LE_JSON.indexOf(tep) < 0).filter((tep) => {
    const nguon = fs.readFileSync(path.join(GAS, tep), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
    return /\.getProperty\s*\(/.test(nguon) && /JSON\.parse\s*\(/.test(nguon);
  });
  check(so, 'đọc JSON kho: không tệp GAS nào vừa đọc kho vừa tự JSON.parse ngoài công cụ documentPropertyJson', tuParse, []);

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
