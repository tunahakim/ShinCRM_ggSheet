/** Kiểm tra ranh giới Core -> module và các lỗi phải báo trước phiên FBM. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — preflight");
  const coreXacThuc = { params: { FBM_VERIFY_STATUS_DEFAULT: 'Chưa xác thực' }, category: { categories: { '@CAT_XAC_THUC': ['Chưa xác thực', 'Đã xác thực'] } } };
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: { customer: { verifyStatus: { source: '@CAT_XAC_THUC' } } }, shinCorePreflight: () => ({
    params: coreXacThuc.params,
    category: coreXacThuc.category,
    issues: []
  }) });
  napServer(hop, 'server/gate/IdGate.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/state/State.js', 'fbm_sync/state/SyncSettings.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/write/PushCandidates.js');
  // Định sẵn các dòng có việc nhưng giữ phép xét chờ sửa thật (`pushHold`): preflight phải báo đúng dòng mà chặng đẩy sẽ đánh dấu.
  const pushCandidatesAllGoc = hop.FbmSync.pushCandidatesAll;
  const ungVien = (danhSach) => { const ds = danhSach('customer').concat(danhSach('activity')); hop.FbmSync.pushCandidatesAll = (scan, context) => ds.map((c) => { const hold = hop.FbmSync.pushHold(c, context); return hold ? Object.assign({}, c, { hold }) : c; }); };
  const realReadLocal = hop.FbmSync.readLocal;
  hop.FbmSync.scriptSettings = () => ({ accountName: '' });
  // Các ca khác không xét phạm vi thử; ca phạm vi thử tự đặt lại.
  hop.FbmSync.scope = () => null;
  hop.FbmSync.readCategoryGate = () => ({ valid: {} });
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-a';
  hop.FbmSync.configValue = () => '';
  hop.FbmSync.bindingRead = () => ({});
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813', fbmHash: 'old', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: 'chờ đối soát', taskType: 'Gọi điện chăm sóc', content: 'Nội dung mới' }] : [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', fbmSyncPermission: 'Cho phép' }, { id: 'CUS-2', fbmId: 'FBM-2', fbmSyncPermission: 'Cho phép', syncStatus: hop.FbmSync.SYNC_STATUS.conflict }, { id: 'CUS-3', fbmId: 'FBM-3', fbmSyncPermission: 'Cho phép', syncStatus: hop.FbmSync.SYNC_STATUS.conflict }];
  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.pending, taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }] : []);

  const xacThucIssue = (mode) => hop.FbmSync.runPreflight({ mode: mode }).issues.filter((item) => /^FBM_VERIFY_STATUS_DEFAULT/.test(item.code)).map((item) => [item.code, item.blocking]);
  check(so, 'ô Xác thực mặc định hợp lệ thì preflight không chặn', [xacThucIssue('read'), xacThucIssue('write')], [[], []]);
  coreXacThuc.params.FBM_VERIFY_STATUS_DEFAULT = '';
  check(so, 'ô Xác thực mặc định trống thì preflight chặn chiều lấy và hai chiều, chiều đẩy không cần', [xacThucIssue('read'), xacThucIssue('write'), xacThucIssue('push')], [[['FBM_VERIFY_STATUS_DEFAULT_MISSING', true]], [['FBM_VERIFY_STATUS_DEFAULT_MISSING', true]], []]);
  coreXacThuc.params.FBM_VERIFY_STATUS_DEFAULT = 'Tên cũ đã đổi';
  check(so, 'giá trị Xác thực mặc định không còn trong Category thì preflight chặn trước khi ghi', xacThucIssue('read'), [['FBM_VERIFY_STATUS_DEFAULT_INVALID', true]]);
  coreXacThuc.params.FBM_VERIFY_STATUS_DEFAULT = 'Chưa xác thực';
  const write = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight write khong dung Config ten tai khoan cu lam cong chan', write.issues.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING'), false);
  const perRecordCodes = ['FBM_RECORD_CONFLICT_PENDING', 'FBM_PREVIOUS_PUSH_FAILURE', 'FBM_CATEGORY_MAPPING_MISSING', 'FBM_ACTIVITY_OWNER_MISMATCH'];
  const mappingIssues = write.issues.filter((item) => item.code === 'FBM_CATEGORY_MAPPING_MISSING');
  check(so, 'thiếu ánh xạ danh mục của một bản ghi là cảnh báo nêu mã bản ghi, không chặn phiên', [mappingIssues.length > 0, mappingIssues.every((item) => !item.blocking && item.severity === 'warn'), /ACT-1/.test(mappingIssues[0] && mappingIssues[0].message), write.blocking.some((item) => perRecordCodes.indexOf(item.code) >= 0)], [true, true, true, false]);
  check(so, 'FBM-024: hai dòng xung đột chờ quyết không chặn phiên ghi; preflight chỉ trả số đếm (không issue) để người điều phối ghi Log một lần', [write.conflictPending, write.issues.some((item) => item.code === 'FBM_RECORD_CONFLICT_PENDING'), write.blocking.some((item) => perRecordCodes.indexOf(item.code) >= 0)], [2, false, false]);
  check(so, 'bản ghi bị cảnh báo thiếu ánh xạ danh mục không tính vào số ứng viên đẩy', write.candidateCount, 0);
  check(so, 'preflight báo Activity đổi nhưng chưa bật quyền đẩy', write.issues.some((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING'), true);
  {
    const allow = hop.FbmSync.pullDefaultPermission(), sync = hop.FbmSync.SYNC_STATUS, readBefore = hop.FbmSync.readLocal;
    hop.FbmSync.readLocal = (entity) => entity === 'customer'
      ? [{ id: 'CUS-CHUYEN', fbmId: 'A1', fbmCustomerCode: 'ALT00012', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.transferred, companyName: 'Sửa' }, { id: 'CUS-YEN', fbmId: 'A2', fbmCustomerCode: 'ALT00013', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.synced }]
      : [{ id: 'ACT-MAT', customerId: 'CUS-YEN', fbmId: '200001', fbmHash: 'cu', fbmSyncPermission: allow, syncStatus: sync.missing, content: 'Sửa' }];
    const frozen = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_RECORD_PUSH_FROZEN');
    hop.FbmSync.readLocal = readBefore;
    check(so, 'Đóng băng: preflight cảnh báo không chặn, nêu mã bản ghi đã sửa mà không được đẩy vì vắng hoặc đã chuyển cho người khác',
      frozen.map((item) => [item.scope, item.blocking, (/CUS-CHUYEN|ACT-MAT/.exec(item.message) || [''])[0], /Nội dung sửa vẫn giữ trên Sheet/.test(item.message)]),
      [['customer', false, 'CUS-CHUYEN', true], ['activity', false, 'ACT-MAT', true]]);
  }
  check(so, 'preflight gộp cảnh báo quyền đẩy theo tổng số', write.issues.filter((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING').length, 1);
  // Chủ dự án chốt 2026-10-07: năm giá trị cố định, so khớp đúng chữ; ô trống hoặc sai thì không đẩy, vẫn kéo về, và bị cảnh báo kèm mã.
  const quyen = (value, entity, parent) => { const r = hop.FbmSync.syncPermission({ fbmSyncPermission: value }, entity || 'customer', parent); return [r.push, r.pull, r.invalid]; };
  check(so, 'Cho phép đồng bộ FBM: năm giá trị cố định cho đúng quyền đẩy/kéo; ô trống, sai chữ hoặc lệch hoa thường là không hợp lệ: không đẩy, vẫn kéo',
    [quyen('Cho phép'), quyen('Chỉ lấy từ FBM'), quyen('Chờ đồng bộ'), quyen('Không đồng bộ'), quyen('Cấm đồng bộ'), quyen(''), quyen('cho phép'), quyen('Ngừng đồng bộ'), hop.FbmSync.pullDefaultPermission()],
    [[true, true, false], [false, true, false], [false, false, false], [false, false, false], [false, false, false], [false, true, true], [false, true, true], [false, true, true], 'Cho phép']);
  check(so, 'Activity bị chặn theo Customer cha: cha chỉ lấy thì con không đẩy, cha cấm thì con không kéo',
    [quyen('Cho phép', 'activity', { fbmSyncPermission: 'Chỉ lấy từ FBM' }), quyen('Cho phép', 'activity', { fbmSyncPermission: 'Cấm đồng bộ' })], [[false, true, false], [false, false, false]]);
  const docCu = hop.FbmSync.readLocal;
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [] : [{ id: 'CUS-TRONG', fbmSyncPermission: '' }, { id: 'CUS-SAI', fbmSyncPermission: 'Ngừng đồng bộ' }, { id: 'CUS-DUNG', fbmSyncPermission: 'Cho phép' }];
  const sai = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_SYNC_PERMISSION_INVALID');
  hop.FbmSync.readLocal = docCu;
  check(so, 'preflight chiều có đẩy cảnh báo ô Cho phép đồng bộ FBM trống hoặc sai, nêu đúng mã bản ghi, không chặn phiên', [sai.length, sai[0] && sai[0].severity, sai[0] && sai[0].blocking, /CUS-TRONG, CUS-SAI./.test(sai[0] && sai[0].message), /CUS-DUNG/.test(sai[0] && sai[0].message)], [1, 'warn', false, true, false]);

  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '' }] : [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', fbmSyncPermission: 'Cho phép' }];
  const read = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read chan truoc khi lien ket tai khoan FBM nhung khong can Config ten tai khoan', [read.ok, read.blocking.some((item) => item.code === 'FBM_IDENTITY_UNBOUND'), read.warnings.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [false, true, false]);
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813' }] : [{ id: 'CUS-1', fbmId: 'FBM-CU', fbmCustomerCode: 'ALT00010' }];
  const rebindRead = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read chặn khi file có FBM ID nhưng chưa kiểm tra liên kết', [rebindRead.ok, rebindRead.blocking.some((item) => item.code === 'REBIND_REQUIRED')], [false, true]);
  const identityCheck = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_check' });
  check(so, 'preflight identity check được phép chạy để xử lý REBIND', [identityCheck.ok, identityCheck.blocking.some((item) => item.code === 'REBIND_REQUIRED')], [true, false]);
  {
    const savedScope = hop.FbmSync.scope;
    hop.FbmSync.scope = () => ({ codes: [], fbm: [], shin: [], notFound: [] });
    const emptyRead = hop.FbmSync.runPreflight({ mode: 'read' }), emptyPush = hop.FbmSync.runPreflight({ mode: 'push' }), emptyIdentity = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_check' });
    check(so, 'Phạm vi giới hạn mà danh sách khách chỉ định trống: chặn cả lượt lấy lẫn lượt đẩy trước request FBM đầu tiên, lệnh kiểm liên kết vẫn chạy',
      [emptyRead.ok, emptyRead.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY'), emptyPush.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY'), emptyIdentity.blocking.some((item) => item.code === 'FBM_SCOPE_EMPTY')], [false, true, true, false]);
    hop.FbmSync.scope = () => ({ codes: ['ALT00099'], fbm: ['ALT00099'], shin: [], notFound: [] });
    const fbmOnly = hop.FbmSync.runPreflight({ mode: 'write' });
    check(so, 'Danh sách chỉ có mã FBM chưa có trên Sheet: lượt hai chiều không bị chặn vì phạm vi (chiều đẩy chỉ không có khách nào)', fbmOnly.issues.some((item) => /^FBM_SCOPE_/.test(item.code)), false);
    hop.FbmSync.scope = () => ({ codes: ['ALT00010', 'CUS-000009'], fbm: ['ALT00010'], shin: ['CUS-1'], notFound: ['CUS-000009'] });
    const gone = hop.FbmSync.runPreflight({ mode: 'read' }).issues.filter((item) => item.code === 'FBM_SCOPE_CODE_NOT_FOUND');
    check(so, 'Mã ShinCRM trong danh sách đã mất khỏi Sheet Customer: preflight cảnh báo kèm mã, không chặn phần khách còn lại', [gone.length, gone[0] && gone[0].blocking, gone[0] && gone[0].message.indexOf('CUS-000009') >= 0], [1, false, true]);
    hop.FbmSync.scope = () => null;
    check(so, 'Không giới hạn phạm vi: không có lỗi phạm vi', hop.FbmSync.runPreflight({ mode: 'read' }).issues.some((item) => /^FBM_SCOPE_/.test(item.code)), false);
    hop.FbmSync.scope = savedScope;
  }
  const identityProbe = hop.FbmSync.runPreflight({ mode: 'check', scan: 'identity_probe' });
  check(so, 'preflight identity probe được phép chạy để tự điền liên kết', [identityProbe.ok, identityProbe.blocking.some((item) => item.code === 'REBIND_REQUIRED')], [true, false]);

  const push = hop.FbmSync.runPreflight({ mode: 'push' });
  check(so, 'preflight mode push van fail-closed theo binding va cac cong thuc te', [push.ok, push.blocking.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [false, false]);

  hop.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', customerPrefix: '', customerCodeLength: '' });
  ungVien((entity) => entity === 'customer' ? [{ entity: 'customer', kind: 'create', id: 'CUS-NEW', record: { id: 'CUS-NEW', fbmSyncPermission: 'Cho phép' } }] : []);
  const missingCustomerCode = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight chan Customer moi khi thieu prefix va do dai ma khach FBM', missingCustomerCode.blocking.some((item) => item.code === 'FBM_CUSTOMER_CODE_CONFIG_MISSING'), true);
  hop.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: '8' });
  const configuredCustomerCode = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight cho Customer moi khi du cau hinh ma khach FBM', configuredCustomerCode.blocking.some((item) => item.code === 'FBM_CUSTOMER_CODE_CONFIG_MISSING'), false);

  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.conflict, taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }] : []);
  hop.FbmSync.pushOwnerError = (candidate, settings) => candidate.entity === 'activity' && candidate.record.owner && candidate.record.owner !== settings.accountName
    ? 'Activity ' + candidate.id + ' thuộc owner FBM khác.' : '';
  hop.FbmSync.scriptSettings = () => ({ accountName: 'Owner đúng' });
  const owner = hop.FbmSync.runPreflight({ mode: 'write' });
  const ownerWarn = owner.warnings.filter((item) => item.code === 'FBM_ACTIVITY_OWNER_MISMATCH');
  check(so, 'Activity lệch owner: preflight cảnh báo không chặn và loại khỏi số ứng viên; việc bỏ qua thật do markPushSkipped lúc đẩy', [owner.blocking.some((item) => item.code === 'FBM_ACTIVITY_OWNER_MISMATCH'), ownerWarn.length, owner.candidateCount], [false, 1, 0]);
  // Bản ghi hợp lệ cạnh bản ghi lỗi riêng vẫn vào danh sách đẩy.
  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-LECH', record: { id: 'ACT-LECH', taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }, { entity: 'activity', kind: 'edit', id: 'ACT-OK', record: { id: 'ACT-OK', owner: 'Owner đúng', taskType: 'Gọi điện', content: 'Gọi lại', workDate: '2026-10-01' } }] : []);
  const gateTruoc = hop.FbmSync.readCategoryGate;
  hop.FbmSync.readCategoryGate = () => ({ valid: { '@CAT_CONG_VIEC': { 'Gọi điện': true } } });
  check(so, 'một Activity lệch owner bị loại riêng, Activity khác vẫn là ứng viên đẩy', hop.FbmSync.runPreflight({ mode: 'write' }).candidateCount, 1);
  hop.FbmSync.readCategoryGate = gateTruoc;
  // Lỗi chung vẫn chặn: đọc cài đặt hỏng không còn bị nuốt, đọc sổ lỗi đẩy hỏng chặn.
  const settingsBefore = hop.FbmSync.scriptSettings;
  hop.FbmSync.scriptSettings = () => { throw new Error('Không đọc được Config'); };
  const settingsBroken = hop.FbmSync.runPreflight({ mode: 'write' }).blocking.filter((item) => item.code === 'FBM_SETTINGS_READ_FAILED');
  hop.FbmSync.scriptSettings = settingsBefore;
  check(so, 'đọc cài đặt đồng bộ hỏng: preflight chặn bằng FBM_SETTINGS_READ_FAILED nêu nguyên nhân, không coi cài đặt là rỗng', [settingsBroken.length, /Không đọc được Config/.test(settingsBroken[0] && settingsBroken[0].message)], [1, true]);
  const failuresBefore = hop.FbmSync.pushFailuresRead;
  hop.FbmSync.pushFailuresRead = () => { throw new Error('Sổ lỗi hỏng'); };
  check(so, 'đọc sổ lỗi đẩy hỏng: preflight chặn bằng FBM_FAILURE_STATE_READ_FAILED', hop.FbmSync.runPreflight({ mode: 'write' }).blocking.some((item) => item.code === 'FBM_FAILURE_STATE_READ_FAILED'), true);
  hop.FbmSync.pushFailuresRead = () => ({ hashes: { 'activity:ACT-LOI': 'h' }, details: { 'activity:ACT-LOI': { reason: 'Lỗi cũ' } } });
  const oldFailure = hop.FbmSync.runPreflight({ mode: 'write' }).issues.filter((item) => item.code === 'FBM_PREVIOUS_PUSH_FAILURE');
  hop.FbmSync.pushFailuresRead = failuresBefore;
  check(so, 'bản ghi từng đẩy lỗi: cảnh báo nêu mã bản ghi, không chặn phiên', [oldFailure.length, oldFailure[0] && oldFailure[0].blocking, /ACT-LOI/.test(oldFailure[0] && oldFailure[0].message)], [1, false, true]);
  // Log xung đột chỉ khi số đổi so với lượt trước.
  const conflictLogs = [];
  hop.logEvent = (event) => conflictLogs.push(event);
  const conflictState = { runId: 'r1', metadata: {} };
  const conflictNotes = [2, 2, 2, 1, 0].map((count) => hop.FbmSync.conflictPendingNote(conflictState, count));
  check(so, 'Log xung đột chỉ ghi khi số khác lượt trước (2, 2, 2, 1, 0), số hiện cho Sidebar luôn cập nhật', [conflictNotes, conflictLogs.map((event) => event.detail.count), conflictState.metadata.conflictCount, conflictState.metadata.conflictLogged], [[true, false, false, true, true], [2, 1, 0], 0, 0]);
  const quiet = { runId: 'r2', metadata: {} };
  conflictLogs.length = 0;
  hop.FbmSync.conflictPendingNote(quiet, 0);
  check(so, 'chưa từng có xung đột thì không ghi Log', conflictLogs.length, 0);

  // FBM-022: đọc Sheet lỗi thì preflight chặn có mã, không báo 0 bản ghi như Sheet trống; Sheet và hash chỉ tính một lần mỗi lượt preflight.
  const savedReadLocal = hop.FbmSync.readLocal, savedHash = hop.FbmSync.hash, savedIdentityPreflight = hop.FbmSync.identityPreflight;
  hop.FbmSync.readLocal = () => { throw new Error('Exception: Service Spreadsheets timed out'); };
  // Sheet chưa liên kết thì kiểm liên kết phải đọc Sheet tìm ID FBM cũ: đọc lỗi thì ném cho cửa vào ghi Log, không giả làm "cần liên kết lại".
  let unboundReadError = '';
  try { hop.FbmSync.identityStatus(); } catch (err) { unboundReadError = String(err && err.message); }
  check(so, 'Sheet chưa liên kết mà đọc Sheet lỗi thì kiểm liên kết ném lỗi thật, không trả REBIND_REQUIRED', /timed out/.test(unboundReadError), true);
  hop.FbmSync.identityPreflight = () => ({ blocking: false, status: { status: 'BOUND' }, message: '' });
  const readFailed = hop.FbmSync.runPreflight({ mode: 'write' }), readModeSkips = hop.FbmSync.runPreflight({ mode: 'read' });
  const readFailedIssue = readFailed.blocking.find((item) => item.code === 'FBM_LOCAL_READ_FAILED');
  check(so, 'FBM-022: đọc Sheet Customer/Activity lỗi thì preflight chiều có đẩy chặn bằng FBM_LOCAL_READ_FAILED, không trả tóm tắt 0 bản ghi; chiều Lấy không quét hai Sheet này nên không có lỗi quét',
    [readFailed.ok, !!readFailedIssue, /timed out/.test(readFailedIssue && readFailedIssue.message), readFailed.hashSummary, readModeSkips.issues.some((item) => item.code === 'FBM_LOCAL_READ_FAILED'), readModeSkips.hashSummary], [false, true, true, null, false, null]);
  hop.FbmSync.identityPreflight = savedIdentityPreflight;
  const localReads = { customer: 0, activity: 0 };
  let hashCalls = 0;
  hop.FbmSync.readLocal = (entity) => { localReads[entity] += 1; return entity === 'activity'
    ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813', fbmHash: 'old', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: 'đã đồng bộ' }]
    : [{ id: 'CUS-1', fbmId: 'FBM-CU', fbmCustomerCode: 'ALT00010', fbmHash: 'old', fbmSyncPermission: 'Cho phép' }, { id: 'CUS-2', fbmSyncPermission: 'Cho phép' }]; };
  ungVien(() => []);
  hop.FbmSync.hash = (...args) => { hashCalls += 1; return savedHash(...args); };
  const scanned = hop.FbmSync.runPreflight({ mode: 'write' });
  // Customer: bản đọc chung của phần quét + kiểm tra liên kết tài khoản; Activity: bản đọc chung. Hàng đợi xung đột và ứng viên đẩy dùng chung bản đọc. Trước FBM-022 là 5 và 3.
  check(so, 'FBM-022: một lượt preflight đọc Sheet một lần cho cả quyền đẩy lẫn tóm tắt hash, tính hash một lần cho mỗi bản ghi có baseline',
    [localReads, hashCalls, scanned.hashSummary.localRecords, scanned.hashSummary.changed, scanned.hashSummary.newRecords, scanned.issues.filter((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING').length],
    [{ customer: 2, activity: 1 }, 2, 3, 2, 1, 1]);
  const sheetReads = { customer: 0, activity: 0 };
  hop.DATA_SCHEMA = { customer: { verifyStatus: { source: '@CAT_XAC_THUC' } } }; hop.SYNC_SCHEMA = {};
  hop.entityReadAllCombined = (entity) => { sheetReads[entity] += 1; return { fields: ['id', 'fbmSyncPermission'], rows: [[entity === 'activity' ? 'ACT-1' : 'CUS-1', 'Cho phép']] }; };
  hop.FbmSync.readLocal = realReadLocal;
  const candidateCalls = { read: 0, check: 0 };
  let candidateMode = 'read';
  hop.FbmSync.pushCandidatesAll = pushCandidatesAllGoc;
  hop.FbmSync.pushCandidates = () => { candidateCalls[candidateMode] += 1; return []; };
  hop.FbmSync.runPreflight({ mode: 'read' });
  candidateMode = 'check';
  hop.FbmSync.runPreflight({ mode: 'check' });
  check(so, 'đợt 1 bước C: preflight chiều Lấy từ FBM → ShinCRM không dựng ứng viên đẩy; "Kiểm tra an toàn" vẫn dựng cho cả Customer và Activity', [candidateCalls], [{ read: 0, check: 2 }]);
  hop.FbmSync.readLocal = savedReadLocal; hop.FbmSync.hash = savedHash;
}

module.exports = { chay };
