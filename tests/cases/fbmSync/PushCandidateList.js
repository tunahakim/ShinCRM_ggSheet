/** Danh sách ứng viên đẩy: quyền đồng bộ, dòng vừa thành xung đột, lỗi đọc state, giao dịch theo khách cha, phạm vi giới hạn và bản ghi đóng băng. */
const { section, check } = require('../../lib/assert');
const { ungVienDay } = require('../../lib/fbm/buoc-day');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { datPhan } = require('../../lib/fbm/cai-dat-thu');

async function chay(so) {
  section('FBM sync — danh sách ứng viên đẩy');
  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  // Ngoài ca phạm vi thử bên dưới, hộp này đẩy mọi dòng có việc: lưu qua cổng cài đặt rằng không giới hạn phạm vi khách.
  datPhan(pushed, 'run', { scopeLimited: false });
  // pushCandidates không còn nuốt lỗi đọc state, nên hộp thử phải có state và sổ lỗi đẩy dù rỗng.
  pushed.FbmSync.stateRead = () => ({ metadata: {} });
  pushed.FbmSync.pushFailuresRead = () => ({ hashes: {}, details: {} });
  // Phép xét một dòng so người phụ trách Giao dịch với tài khoản đã liên kết; hộp này không nạp tệp cấu hình.
  pushed.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: '' });
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', fbmSyncPermission: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-NEW', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: 'Chỉ lấy từ FBM' }]
    : [];
  check(so, 'Customer moi chua cho phep chi pull khong push', ungVienDay(pushed.FbmSync, 'customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-XUNGDOT', fbmId: 'F1', fbmCustomerCode: 'ALT2', fbmSyncPermission: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.conflict, companyName: 'Sửa', fbmHash: 'cu' }, { id: 'CUS-KHAC', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: 'Cho phép', companyName: 'Mới' }]
    : [];
  check(so, 'dòng vừa thành xung đột bị pushCandidates loại vì đọc lại trạng thái trên dòng; bản ghi khác vẫn vào danh sách đẩy', ungVienDay(pushed.FbmSync, 'customer').map((item) => item.id), ['CUS-KHAC']);
  pushed.FbmSync.stateRead = () => { throw new Error('Không đọc được state'); };
  let stateReadFailure = '';
  try { ungVienDay(pushed.FbmSync, 'customer'); } catch (error) { stateReadFailure = String(error && error.message || error); }
  check(so, 'pushCandidates không nuốt lỗi đọc state: ném lỗi rõ thay vì coi sổ lỗi đẩy là rỗng', stateReadFailure, 'Không đọc được state');
  pushed.FbmSync.stateRead = () => ({ metadata: {} });
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', fbmSyncPermission: pushed.FbmSync.pullDefaultPermission() }]
    : [{ id: 'ACT-NEW', customerId: 'CUS-PARENT', fbmId: '', fbmSyncPermission: pushed.FbmSync.pullDefaultPermission(), taskType: 'Goi', content: 'Noi dung', workDate: '2026-09-09' }];
  check(so, 'Activity moi co Customer cha lien ket duoc dua vao queue', ungVienDay(pushed.FbmSync, 'activity').length, 1);
  {
    const allow = pushed.FbmSync.pullDefaultPermission(), savedScope = pushed.FbmSync.scope;
    pushed.FbmSync.scope = () => ({ codes: ['ALT00010', 'CUS-NEW'], fbm: ['ALT00010'], shin: ['CUS-ALT', 'CUS-NEW'], notFound: [] });
    pushed.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [
        { id: 'CUS-ALT', fbmId: 'FBM-ALT', fbmCustomerCode: 'ALT00010', fbmSyncPermission: allow, syncStatus: pushed.FbmSync.SYNC_STATUS.pending },
        { id: 'CUS-NEW', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: allow, companyName: 'Khách mới' },
        { id: 'CUS-KHAC', fbmId: '', fbmCustomerCode: '', fbmSyncPermission: allow, companyName: 'Khách ngoài phạm vi' },
        { id: 'CUS-THAT', fbmId: 'FBM-THAT', fbmCustomerCode: 'ALT00999', fbmSyncPermission: allow }
      ]
      : [
        { id: 'ACT-ALT', customerId: 'CUS-ALT', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'A', workDate: '2026-10-07' },
        { id: 'ACT-THAT', customerId: 'CUS-THAT', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'B', workDate: '2026-10-07' }
      ];
    check(so, 'Phạm vi giới hạn: chiều đẩy chỉ xét khách GAS đã đổi ra từ danh sách (khách ghép cặp và khách mới chưa có mã FBM), khách ngoài danh sách và Activity của nó bị chặn',
      [ungVienDay(pushed.FbmSync, 'customer').map((c) => c.kind + ':' + c.id), ungVienDay(pushed.FbmSync, 'activity').map((c) => c.id)],
      [['edit:CUS-ALT', 'create:CUS-NEW'], ['ACT-ALT']]);
    pushed.FbmSync.scope = savedScope;
  }
  {
    // 09/05 Phần 9: bản ghi vắng hoặc đã chuyển cho người khác, và giao dịch của khách mang hai trạng thái đó, sửa trên Sheet cũng không được đẩy.
    const allow = pushed.FbmSync.pullDefaultPermission(), sync = pushed.FbmSync.SYNC_STATUS;
    pushed.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [
        { id: 'CUS-MAT', fbmId: 'FBM-MAT', fbmCustomerCode: 'ALT00011', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, companyName: 'Sửa khi vắng' },
        { id: 'CUS-CHUYEN', fbmId: 'FBM-CHUYEN', fbmCustomerCode: 'ALT00012', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.transferred, companyName: 'Sửa khi đã chuyển' },
        { id: 'CUS-OK', fbmId: 'FBM-OK', fbmCustomerCode: 'ALT00013', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.synced, companyName: 'Sửa bình thường' }
      ]
      : [
        { id: 'ACT-CUA-CHUYEN', customerId: 'CUS-CHUYEN', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'Mới dưới khách đã chuyển', workDate: '2026-10-16' },
        { id: 'ACT-MAT', customerId: 'CUS-OK', fbmId: '200001', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, taskType: 'Goi', content: 'Sửa khi vắng', workDate: '2026-10-16' },
        { id: 'ACT-OK', customerId: 'CUS-OK', fbmId: '', fbmSyncPermission: allow, taskType: 'Goi', content: 'Mới', workDate: '2026-10-16' }
      ];
    check(so, 'Đóng băng: bản ghi mang "không thấy bên FBM" hoặc "đã chuyển cho người khác" và giao dịch của khách đã chuyển không vào danh sách đẩy dù đã sửa',
      [ungVienDay(pushed.FbmSync, 'customer').map((c) => c.id), ungVienDay(pushed.FbmSync, 'activity').map((c) => c.id)],
      [['CUS-OK'], ['ACT-OK']]);
  }
  return so;
}

module.exports = { chay };
