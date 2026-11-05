/** Khách mới kéo từ FBM: ghi định danh, baseline và quyền đẩy qua một lượt cửa ghi, giá trị Xác thực theo Cài đặt, không ghi Log từng bản ghi. */
const { section, check } = require('../../lib/assert');
const { keoVe } = require('../../lib/fbm/keo-ve');
const { hopKeoVe, congDanhMucThu } = require('../../lib/fbm/hop-keo');

function chay(so) {
  section('FBM sync — Khách mới kéo từ FBM');
  const xacThuc = { value: 'Chưa xác thực' };
  const builders = hopKeoVe(xacThuc);
  const gate = congDanhMucThu();
  builders.FbmSync.readCategoryGate = () => gate;
  let newPullWrite, newPullCalls = 0, dirtyMarkCalls = 0;
  builders.FbmSync.stateRead = () => ({ metadata: {} });
  builders.FbmSync.readLocal = () => [];
  builders.dirtyStateMarkSignal = () => { dirtyMarkCalls += 1; };
  builders.writeGateSave = (request) => { newPullCalls += 1; newPullWrite = request; return { ok: true, fields: ['id'], rows: [['CUS-NEW']] }; };
  const newPullResult = keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-C', ma_kh: 'ALT00012', ten_kh: 'Khách mới', ma_so_thue: '001' }, gate)]);
  check(so, 'Customer pull mới ghi cả định danh baseline và quyền đẩy qua cửa ghi',
    [newPullResult.written, newPullWrite.source, newPullWrite.schemas.length, newPullWrite.records[0].fbmId, newPullWrite.records[0].fbmHash !== '', newPullWrite.records[0].parentCompanyName, newPullWrite.records[0].fbmSyncPermission, dirtyMarkCalls],
    [1, 'pull', 2, 'NEW-C', true, '', builders.FbmSync.pullDefaultPermission(), 0]);
  check(so, 'Pull gộp nội dung và trạng thái vào một lượt cửa ghi', newPullCalls, 1);
  // Đổi tên giá trị ở Category rồi chọn lại trong Cài đặt: khách mới mang đúng tên mới, không còn chuỗi gõ cứng nào.
  xacThuc.value = 'Đã kiểm tra tên mới';
  keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-V', ma_kh: 'ALT00013', ten_kh: 'Khách đổi tên', ma_so_thue: '002' }, gate)]);
  check(so, 'khách mới kéo từ FBM mang giá trị Xác thực đang chọn trong Cài đặt',
    newPullWrite.records[0].verifyStatus,
    'Đã kiểm tra tên mới');
  const oldVerify = builders.FbmSync.customerRecord({ stt_rec_kh: 'OLD-V', ma_kh: 'ALT00014', ten_kh: 'Cũ', ma_so_thue: '003' }, gate);
  builders.FbmSync.readLocal = () => [Object.assign({}, oldVerify, { id: 'CUS-OLD', fbmHash: oldVerify.fbmHash, syncStatus: 'đã đồng bộ', verifyStatus: 'Đã xác minh tay' })];
  newPullWrite = null;
  keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'OLD-V', ma_kh: 'ALT00014', ten_kh: 'Cũ đổi tên', ma_so_thue: '003' }, gate)]);
  check(so, 'khách đã có giữ giá trị Xác thực của mình khi lấy từ FBM',
    [newPullWrite && newPullWrite.records[0].companyName, newPullWrite && newPullWrite.records[0].verifyStatus],
    ['Cũ đổi tên', 'Đã xác minh tay']);
  xacThuc.value = '';
  builders.FbmSync.readLocal = () => [];
  newPullCalls = 0;
  let verifyMissing = null;
  try { keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-E', ma_kh: 'ALT00015', ten_kh: 'Khách thiếu cài đặt', ma_so_thue: '004' }, gate)]); } catch (error) { verifyMissing = error; }
  check(so, 'chưa chọn Xác thực kéo từ FBM thì chiều lấy dừng, không ghi khách mới',
    [verifyMissing && verifyMissing.code, newPullCalls],
    ['FBM_VERIFY_STATUS_DEFAULT_MISSING', 0]);
  xacThuc.value = 'Chưa xác thực';
  const pullLogs = [];
  builders.logEvent = (event) => pullLogs.push(event);
  builders.FbmSync.readLocal = () => [];
  builders.writeGateSave = () => ({ ok: true });
  keoVe(builders.FbmSync, 'customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'LOG-C', ma_kh: 'ALT00015', ten_kh: 'Có log', ma_so_thue: '002' }, gate)]);
  check(so, 'Pull không ghi Log từng record; PullFlow sẽ tổng hợp tại bước nghiệp vụ', pullLogs.length, 0);

  return so;
}

module.exports = { chay };
