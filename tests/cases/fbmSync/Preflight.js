/** Preflight: ngầm định kéo từ FBM (Xác thực, Cho phép đồng bộ FBM của khách và giao dịch), cảnh báo và đếm theo từng bản ghi (ánh xạ danh mục, xung đột chờ quyết, quyền đẩy, đóng băng, ô Cho phép đồng bộ). */
const { section, check } = require('../../lib/assert');
const { hopPreflight } = require('../../lib/fbm/hop-preflight');

async function chay(so) {
  section("FBM sync — preflight");
  const { hop, coreXacThuc } = hopPreflight();
  const xacThucIssue = (mode) => hop.FbmSync.runPreflight({ mode: mode }).issues.filter((item) => /^FBM_PULL_DEFAULT/.test(item.code)).map((item) => [item.code, item.blocking]);
  check(so, 'ngầm định Xác thực kéo từ FBM hợp lệ thì preflight không chặn',
    [xacThucIssue('read'), xacThucIssue('write')],
    [[], []]);
  coreXacThuc.stored = '';
  check(so, 'chưa chọn ngầm định Xác thực kéo từ FBM thì preflight chặn chiều lấy và hai chiều, chiều đẩy không cần',
    [xacThucIssue('read'), xacThucIssue('write'), xacThucIssue('push')],
    [[['FBM_PULL_DEFAULT_MISSING', true]], [['FBM_PULL_DEFAULT_MISSING', true]], []]);
  coreXacThuc.stored = 'Tên cũ đã đổi';
  check(so, 'ngầm định Xác thực kéo từ FBM không còn trong Category thì preflight chặn trước khi ghi',
    xacThucIssue('read'),
    [['FBM_PULL_DEFAULT_INVALID', true]]);
  coreXacThuc.stored = 'Chưa xác thực';
  const loiQuyen = (mode) => hop.FbmSync.runPreflight({ mode: mode }).issues.filter((item) => /^FBM_PULL_DEFAULT/.test(item.code)).map((item) => [item.code, item.blocking, /Cho phép đồng bộ FBM/.test(item.message), /giao dịch/.test(item.message)]);
  coreXacThuc.quyen.activity = '';
  check(so, 'chưa chọn Cho phép đồng bộ FBM cho giao dịch kéo từ FBM thì preflight chặn chiều lấy, lời báo nêu tên trường và thực thể; chiều đẩy không cần',
    [loiQuyen('read'), loiQuyen('push')],
    [[['FBM_PULL_DEFAULT_MISSING', true, true, true]], []]);
  coreXacThuc.quyen.activity = 'Cho phép';
  coreXacThuc.quyen.customer = '';
  check(so, 'chưa chọn Cho phép đồng bộ FBM cho khách kéo từ FBM thì preflight chặn, lời báo không nhắc giao dịch',
    loiQuyen('write'),
    [['FBM_PULL_DEFAULT_MISSING', true, true, false]]);
  coreXacThuc.quyen.customer = 'Cho phép';
  const write = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight write khong dung Config ten tai khoan cu lam cong chan',
    write.issues.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING'),
    false);
  const perRecordCodes = ['FBM_RECORD_CONFLICT_PENDING', 'FBM_PREVIOUS_PUSH_FAILURE', 'FBM_CATEGORY_MAPPING_MISSING', 'FBM_ACTIVITY_OWNER_MISMATCH'];
  const mappingIssues = write.issues.filter((item) => item.code === 'FBM_CATEGORY_MAPPING_MISSING');
  check(so, 'thiếu ánh xạ danh mục của một bản ghi là cảnh báo nêu mã bản ghi, không chặn phiên',
    [mappingIssues.length > 0, mappingIssues.every((item) => !item.blocking && item.severity === 'warn'), /ACT-1/.test(mappingIssues[0] && mappingIssues[0].message), write.blocking.some((item) => perRecordCodes.indexOf(item.code) >= 0)],
    [true, true, true, false]);
  check(so, 'FBM-024: hai dòng xung đột chờ quyết không chặn phiên ghi; preflight chỉ trả số đếm (không issue) để người điều phối ghi Log một lần',
    [write.conflictPending, write.issues.some((item) => item.code === 'FBM_RECORD_CONFLICT_PENDING'), write.blocking.some((item) => perRecordCodes.indexOf(item.code) >= 0)],
    [2, false, false]);
  check(so, 'bản ghi bị cảnh báo thiếu ánh xạ danh mục không tính vào số ứng viên đẩy', write.candidateCount, 0);
  check(so, 'preflight báo Activity đổi nhưng chưa bật quyền đẩy',
    write.issues.some((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING'),
    true);
  {
    const allow = 'Cho phép', sync = hop.FbmSync.SYNC_STATUS, readBefore = hop.FbmSync.readLocal;
    hop.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [{ id: 'CUS-CHUYEN', fbmId: 'A1', fbmCustomerCode: 'ALT00012', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.transferred, companyName: 'Sửa' }, { id: 'CUS-YEN', fbmId: 'A2', fbmCustomerCode: 'ALT00013', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.synced }]
      : [{ id: 'ACT-MAT', customerId: 'CUS-YEN', fbmId: '200001', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, content: 'Sửa' }];
    const frozen = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_RECORD_PUSH_FROZEN');
    hop.FbmSync.readLocal = readBefore;
    check(so, 'Đóng băng: preflight cảnh báo không chặn, nêu mã bản ghi đã sửa mà không được đẩy vì vắng hoặc đã chuyển cho người khác',
      frozen.map((item) => [item.scope, item.blocking, (/CUS-CHUYEN|ACT-MAT/.exec(item.message) || [''])[0], /Nội dung sửa vẫn giữ trên Sheet/.test(item.message)]),
      [['customer', false, 'CUS-CHUYEN', true], ['activity', false, 'ACT-MAT', true]]);
  }
  check(so, 'preflight gộp cảnh báo quyền đẩy theo tổng số',
    write.issues.filter((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING').length,
    1);
  const docCu = hop.FbmSync.readLocal;
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [] : [{ id: 'CUS-TRONG', fbmSyncPermission: '' }, { id: 'CUS-SAI', fbmSyncPermission: 'Ngừng đồng bộ' }, { id: 'CUS-DUNG', fbmSyncPermission: 'Cho phép' }];
  const sai = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_SYNC_PERMISSION_INVALID');
  hop.FbmSync.readLocal = docCu;
  check(so, 'preflight chiều có đẩy cảnh báo ô Cho phép đồng bộ FBM trống hoặc sai, nêu đúng mã bản ghi, không chặn phiên',
    [sai.length, sai[0] && sai[0].severity, sai[0] && sai[0].blocking, /CUS-TRONG, CUS-SAI./.test(sai[0] && sai[0].message), /CUS-DUNG/.test(sai[0] && sai[0].message)],
    [1, 'warn', false, true, false]);
}

module.exports = { chay };
