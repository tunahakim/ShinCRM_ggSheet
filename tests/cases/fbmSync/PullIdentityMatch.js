/** Nối khách FBM vào dòng Sheet: lệch stt_rec_kh theo mã khách, mã khách FBM đổi, cùng MST, MST trùng nhiều dòng thì không tạo bản ghi, khách bị chặn danh tính giữ trong ô lượt. */
const { section, check } = require('../../lib/assert');
const { keoVe, keoLo } = require('../../lib/fbm/keo-ve');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Nối khách FBM vào dòng Sheet');
  const builders = hopKeoVe();
  const gate = congDanhMucThu();
  builders.FbmSync.readCategoryGate = () => gate;
  let identityWrite;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmId: 'OLD-ID', fbmCustomerCode: 'ALT99999', companyName: 'Cũ' }] : [];
  builders.writeGateSave = (request) => { identityWrite = request; return { ok: true }; };
  const identityIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-ID', ma_kh: 'ALT99999', ten_kh: 'Mới' }, gate);
  const identityResult = keoVe(builders.FbmSync, 'customer', [identityIncoming]);
  check(so, 'Customer lech stt_rec_kh van cap nhat dung dong theo ma_kh',
    [identityResult.written, identityWrite.records[0].id, identityWrite.records[0].fbmId],
    [1, 'CUS-1', 'NEW-ID']);

  // FBM đổi ma_kh mà nội dung giữ nguyên: hash không đổi nhưng mã FBM phải theo FBM, nếu không Activity mới mang mã mới sẽ mồ côi.
  let codeWrite;
  const codeIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'CODE-ID', ma_kh: 'ALT00777', ten_kh: 'Giữ nguyên' }, gate);
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [Object.assign({}, codeIncoming, { id: 'CUS-CODE', fbmCustomerCode: 'ALT00111', fbmHash: codeIncoming.fbmHash, syncStatus: 'đã đồng bộ' })] : [];
  builders.writeGateSave = (request) => { codeWrite = request; return { ok: true }; };
  keoVe(builders.FbmSync, 'customer', [codeIncoming]);
  check(so, 'FBM-054: FBM đổi ma_kh mà nội dung không đổi thì lượt kéo vẫn ghi mã FBM mới xuống ShinCRM',
    [codeWrite && codeWrite.records.length, codeWrite && codeWrite.records[0].id, codeWrite && codeWrite.records[0].fbmCustomerCode],
    [1, 'CUS-CODE', 'ALT00777']);
  let taxWrite;
  let taxState = { metadata: {} };
  builders.FbmSync.stateRead = () => taxState;
  builders.FbmSync.stateWrite = (next) => { taxState = next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST', taxNumber: '010.012 3456', fbmId: '', fbmCustomerCode: '', note: 'Nội bộ' }];
  builders.writeGateSave = (request) => { taxWrite = request; return { ok: true }; };
  const taxIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'MST-ID', ma_kh: 'ALT00011', ma_so_thue: '0100123456', ten_kh: 'FBM cùng MST' }, gate);
  const taxResult = keoVe(builders.FbmSync, 'customer', [taxIncoming]);
  check(so, 'Customer cùng MST nối vào dòng ShinCRM chưa liên kết',
    [taxResult.written, taxWrite.records[0].id, taxWrite.records[0].fbmId, taxWrite.records[0].note],
    [1, 'CUS-MST', 'MST-ID', 'Nội bộ']);

  let ambiguousWrite = false;
  taxState = { metadata: {} };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST-1', taxNumber: '0100123456' }, { id: 'CUS-MST-2', taxNumber: '0100123456' }];
  builders.writeGateSave = () => { ambiguousWrite = true; return { ok: true }; };
  const ambiguousResult = keoVe(builders.FbmSync, 'customer', [taxIncoming]);
  check(so, 'Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi',
    [ambiguousResult.written, ambiguousResult.skipped, ambiguousWrite, ambiguousResult.identityBlocks[0].reason],
    [0, 1, false, 'duplicate_tax_number']);
  check(so, 'pullPageApply không tự ghi ô lượt; khách bị chặn danh tính chỉ trả về cho người điều phối',
    taxState.metadata.identityBlocks,
    undefined);
  // Kho thật trả bản sao mỗi lần đọc: cửa ghi từng ghi bản riêng rồi người điều phối ghi bản cũ của nó đè lên, nên khách chặn danh tính biến mất.
  let storedState = JSON.stringify({ mode: 'read', counts: { completed: 0, total: 0, succeeded: 0, conflict: 0, skipped: 0 }, metadata: { identityBlocks: [{ fbmCustomerCode: 'CU' }] } });
  builders.FbmSync.stateRead = () => JSON.parse(storedState);
  builders.FbmSync.stateWrite = (next) => { storedState = JSON.stringify(next); };
  keoLo(builders.FbmSync, 'customer', [taxIncoming], 'read');
  check(so, 'Lượt kéo giữ khách bị chặn danh tính trong ô lượt, nối sau các mục cũ',
    JSON.parse(storedState).metadata.identityBlocks.map((item) => item.fbmCustomerCode),
    ['CU', 'ALT00011']);

  return so;
}

module.exports = { chay };
