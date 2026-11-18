/** Preflight: Log xung đột chỉ ghi khi số đổi; đọc Sheet lỗi thì chặn có mã; một lượt preflight đọc Sheet và tính hash tối thiểu; chiều Lấy không dựng ứng viên đẩy. */
const { section, check } = require('../../lib/assert');
const { hopPreflight } = require('../../lib/fbm/hop-preflight');

async function chay(so) {
  section("FBM sync — preflight đọc Sheet và Log");
  const { hop, ungVien, goc } = hopPreflight();
  // Log xung đột chỉ khi số đổi so với lượt trước.
  const conflictState = { runId: 'r1', metadata: {} };
  const conflictNotes = [2, 2, 2, 1, 0].map((count) => hop.FbmSync.conflictPendingNote(conflictState, count)), conflictLogs = conflictNotes.filter(Boolean);
  check(so, 'Log xung đột chỉ ghi khi số khác lượt trước (2, 2, 2, 1, 0), số hiện cho Sidebar luôn cập nhật',
    [conflictNotes.map(Boolean), conflictLogs.map((event) => event.detail.count), conflictState.metadata.conflictCount, conflictState.metadata.conflictLogged],
    [[true, false, false, true, true], [2, 1, 0], 0, 0]);
  const quiet = { runId: 'r2', metadata: {} };
  check(so, 'chưa từng có xung đột thì không có dòng Log', hop.FbmSync.conflictPendingNote(quiet, 0), null);

  // FBM-022: đọc Sheet lỗi thì preflight chặn có mã, không báo 0 bản ghi như Sheet trống; Sheet và hash chỉ tính một lần mỗi lượt preflight.
  const savedReadLocal = hop.FbmSync.readLocal, savedHash = hop.FbmSync.hash, savedIdentityPreflight = hop.FbmSync.identityPreflight;
  hop.FbmSync.readLocal = () => { throw new Error('Exception: Service Spreadsheets timed out'); };
  // Sheet chưa liên kết thì kiểm liên kết phải đọc Sheet tìm ID FBM cũ: đọc lỗi thì ném cho cửa vào ghi Log, không giả làm "cần liên kết lại".
  let unboundReadError = '';
  try { hop.FbmSync.identityStatus(); } catch (err) { unboundReadError = String(err && err.message); }
  check(so, 'Sheet chưa liên kết mà đọc Sheet lỗi thì kiểm liên kết ném lỗi thật, không trả REBIND_REQUIRED',
    /timed out/.test(unboundReadError),
    true);
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
  check(so, 'FBM-022: một lượt preflight đọc Sheet một lần cho cả quyền đẩy lẫn tóm tắt hash, tính hash nhiều nhất một lần cho mỗi bản ghi (phép xét đẩy và tóm tắt dùng chung dấu vân)',
    [localReads, hashCalls, scanned.hashSummary.localRecords, scanned.hashSummary.changed, scanned.hashSummary.newRecords, scanned.issues.filter((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING').length],
    [{ customer: 2, activity: 1 }, 3, 3, 2, 1, 1]);
  const sheetReads = { customer: 0, activity: 0 };
  hop.SYNC_SCHEMA = {};
  hop.entityReadAllCombined = (entity) => { sheetReads[entity] += 1; return { fields: ['id', 'fbmSyncPermission'], rows: [[entity === 'activity' ? 'ACT-1' : 'CUS-1', 'Cho phép']] }; };
  hop.FbmSync.readLocal = goc.readLocal;
  const candidateCalls = { read: 0, check: 0 };
  let candidateMode = 'read';
  hop.FbmSync.pushEligible = goc.eligible;
  hop.FbmSync.pushScanRows = (entity, scan) => { candidateCalls[candidateMode] += 1; return goc.scanRows(entity, scan); };
  hop.FbmSync.runPreflight({ mode: 'read' });
  candidateMode = 'check';
  hop.FbmSync.runPreflight({ mode: 'check' });
  check(so, 'đợt 1 bước C: preflight chiều Lấy từ FBM → ShinCRM không dựng ứng viên đẩy; "Kiểm tra an toàn" vẫn dựng cho cả Customer và Activity',
    [candidateCalls],
    [{ read: 0, check: 2 }]);
  hop.FbmSync.readLocal = savedReadLocal; hop.FbmSync.hash = savedHash;
}

module.exports = { chay };
