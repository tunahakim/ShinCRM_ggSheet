const { napServer, taoHopCat } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');

function chay(so) {
  section('FBM sync - tham số DocumentProperties');
  const data = {}, legacy = { FBM_MA_KH_PREFIX: 'KH-', FBM_MA_KH_LENGTH: '8', FBM_ACTIVITY_SINCE: '2026-01-01', FBM_SYNC_APPROVAL_THRESHOLD: '12' };
  const props = { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, configGet: (name, fallback) => legacy[name] === undefined ? fallback : legacy[name] });
  napServer(hop, 'fbm_sync/state/State.js', 'fbm_sync/state/SyncSettings.js', 'fbm_sync/state/AccountSettings.js', 'fbm_sync/reconcile/Fingerprint.js');
  const first = hop.FbmSync.accountSettingsRead();
  const syncFirst = hop.FbmSync.syncSettingsRead();
  const writesAfterMigration = Object.keys(data).length;
  legacy.FBM_MA_KH_PREFIX = 'CHANGED-'; legacy.FBM_SYNC_APPROVAL_THRESHOLD = '99';
  const second = hop.FbmSync.accountSettingsRead();
  const syncSecond = hop.FbmSync.syncSettingsRead();
  check(so, 'migration tach cau hinh tai khoan FBM khoi tham so phien', [Object.keys(first).sort(), first.customerPrefix, first.customerCodeLength, first.activitySince, writesAfterMigration, Object.keys(second).sort(), second.customerPrefix, Object.keys(syncFirst).sort(), syncSecond.approvalThreshold], [['activitySince', 'customerCodeLength', 'customerPrefix'], 'KH-', '8', '2026-01-01', 2, ['activitySince', 'customerCodeLength', 'customerPrefix'], 'KH-', ['approvalThreshold', 'testCodes', 'testMode'], 12]);
  check(so, 'luu cau hinh tai khoan FBM hop le', [hop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-02-01' }).ok, hop.FbmSync.accountSettingsRead()], [true, { customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-02-01' }]);
  const invalidAccount = hop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '', activitySince: '2026-02-31' });
  check(so, 'cau hinh tai khoan FBM chan cap thieu va ngay sai', [invalidAccount.ok, invalidAccount.code], [false, 'FBM_CUSTOMER_CODE_CONFIG_INCOMPLETE']);
  hop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-01-01' });
  hop.FbmSync.activityDateKey = (value) => {
    const date = value instanceof Date ? new Date(value.getTime() + 7 * 60 * 60 * 1000) : new Date(value);
    return date.toISOString().slice(0, 10);
  };
  check(so, 'moc Activity bo qua ngay truoc moc nhung giu ngay tu moc', [hop.FbmSync.activitySinceAllows({ workDate: new Date('2025-12-31T00:00:00Z') }), hop.FbmSync.activitySinceAllows({ workDate: new Date('2025-12-31T17:00:00Z') }), hop.FbmSync.activitySinceAllows({ workDate: new Date('2026-01-01T00:00:00Z') })], [false, true, true]);
  const invalid = hop.FbmSync.syncSettingsSave({ approvalThreshold: -1 });
  check(so, 'nguong phe duyet am bi tu choi truoc khi ghi DocumentProperties', [invalid.ok, invalid.code, data.FBM_SYNC_SETTINGS_V1.indexOf('CHANGED-') >= 0], [false, 'FBM_APPROVAL_THRESHOLD_INVALID', false]);
  const invalidText = hop.FbmSync.syncSettingsSave({ approvalThreshold: 'khong-phai-so' });
  check(so, 'nguong phe duyet khong phai so bi tu choi', [invalidText.ok, invalidText.code], [false, 'FBM_APPROVAL_THRESHOLD_INVALID']);
  const saved = hop.FbmSync.syncSettingsSave({ approvalThreshold: 0 });
  check(so, 'luu nguong phe duyet hop le va cho phep nguong 0', [saved.ok, Object.keys(saved.settings), saved.settings.approvalThreshold, hop.FbmSync.syncSettingsRead().approvalThreshold], [true, ['approvalThreshold', 'testMode', 'testCodes'], 0, 0]);

  check(so, 'Chế độ thử mặc định bật với danh sách rỗng, nên tệp chưa cấu hình không quét toàn bộ', [hop.FbmSync.SYNC_SETTINGS_DEFAULT.testMode, hop.FbmSync.SYNC_SETTINGS_DEFAULT.testCodes], [true, []]);
  const codes = hop.FbmSync.syncSettingsSave({ approvalThreshold: 0, testMode: true, testCodes: 'ALT00010, CUS-020061\nALT00010' });
  check(so, 'Danh sách mã thử nhận chuỗi ngăn bởi phẩy/xuống dòng, bỏ trùng, giữ thứ tự', [codes.ok, codes.settings.testCodes, hop.FbmSync.testScopeCodes()], [true, ['ALT00010', 'CUS-020061'], ['ALT00010', 'CUS-020061']]);
  const quoteCode = hop.FbmSync.syncSettingsSave({ approvalThreshold: 0, testMode: true, testCodes: ["ALT'1", 'Mã có dấu'] });
  check(so, 'Mã thử có dấu nháy hoặc ký tự lạ bị từ chối trước khi ghi, nên không lọt vào điều kiện grid FBM', [quoteCode.ok, quoteCode.code, hop.FbmSync.testScopeCodes()], [false, 'FBM_TEST_CODE_INVALID', ['ALT00010', 'CUS-020061']]);
  const tooMany = hop.FbmSync.syncSettingsSave({ approvalThreshold: 0, testMode: true, testCodes: Array.from({ length: hop.FbmSync.TEST_CODES_MAX + 1 }, (_, i) => 'A' + i) });
  check(so, 'Danh sách mã thử vượt trần bị từ chối', [tooMany.ok, tooMany.code], [false, 'FBM_TEST_CODES_TOO_MANY']);
  hop.FbmSync.syncSettingsSave({ approvalThreshold: 0, testMode: false, testCodes: ['ALT00010'] });
  check(so, 'Tắt chế độ thử thì phạm vi là null (chạy toàn bộ) dù danh sách còn mã', hop.FbmSync.testScopeCodes(), null);
  hop.FbmSync.syncSettingsSave({ approvalThreshold: 3 });
  check(so, 'Lưu riêng ngưỡng chấp thuận giữ nguyên công tắc và danh sách mã thử đang lưu', [hop.FbmSync.syncSettingsRead().testMode, hop.FbmSync.syncSettingsRead().testCodes], [false, ['ALT00010']]);

  const quotaData = {};
  let quotaFull = false;
  const quotaLogs = [];
  const quotaProps = {
    getProperty: (key) => quotaData[key] || null,
    setProperty: (key, value) => {
      if (quotaFull) { throw new Error('DocumentProperties quota exceeded'); }
      quotaData[key] = String(value);
    },
    deleteProperty: (key) => { delete quotaData[key]; }
  };
  const quotaHop = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => quotaProps },
    logEvent: (event) => quotaLogs.push(event),
    LOG_ERROR: 'error',
    configGet: () => ''
  });
  napServer(quotaHop, 'fbm_sync/state/State.js', 'fbm_sync/state/SyncSettings.js', 'fbm_sync/state/AccountSettings.js');
  quotaHop.FbmSync.stateWrite({ runId: 'before-quota', cursor: { pageIndex: 2, pageValue: ['2026-09-20', 'CUS-000002'] }, metadata: { pushFailureDetails: { 'customer:CUS-000001': { reason: 'x'.repeat(200) } } }, locks: { 'customer:CUS-000001': { owner: 'sync', revision: 'r1' } } });
  const previousState = quotaData.FBM_SYNC_STATE_V1;
  quotaFull = true;
  let quotaError = null;
  try {
    quotaHop.FbmSync.stateWrite({ runId: 'too-large', cursor: { pageIndex: 3 }, metadata: { pushFailureDetails: Object.fromEntries(Array.from({ length: 120 }, (_, index) => ['customer:CUS-' + String(index).padStart(6, '0'), { reason: 'x'.repeat(200) }])) }, locks: { 'customer:CUS-000001': { owner: 'sync', revision: 'r2' } } });
  } catch (error) { quotaError = error; }
  const syncQuota = quotaHop.FbmSync.syncSettingsSave({ approvalThreshold: 4 });
  const accountQuota = quotaHop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-01-01' });
  check(so, 'DocumentProperties đầy giữ nguyên state cursor/conflict/RecordLocks và không ghi dở JSON', [quotaError && quotaError.code, quotaData.FBM_SYNC_STATE_V1 === previousState, syncQuota.code, accountQuota.code, quotaLogs.some((event) => event.reason === 'FBM_DOCUMENT_PROPERTIES_QUOTA')], ['FBM_DOCUMENT_PROPERTIES_QUOTA', true, 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', true]);

  const brokenData = { FBM_ACCOUNT_SETTINGS_V1: '{"customerPrefix":"ALT"', FBM_SYNC_SETTINGS_V1: '{"approvalThreshold":' };
  const brokenProps = { getProperty: (key) => brokenData[key] || null, setProperty: (key, value) => { brokenData[key] = String(value); } };
  const brokenHop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => brokenProps }, configGet: () => 'LEGACY-' });
  napServer(brokenHop, 'fbm_sync/state/State.js', 'fbm_sync/state/SyncSettings.js', 'fbm_sync/state/AccountSettings.js');
  const brokenCode = (work) => { try { work(); return 'không ném'; } catch (error) { return error.code; } };
  check(so, 'FBM-025: cài đặt tài khoản/đồng bộ JSON hỏng thì ném FBM_DOCUMENT_PROPERTY_CORRUPT, không rơi về giá trị cũ rồi ghi đè cài đặt người dùng',
    [brokenCode(() => brokenHop.FbmSync.accountSettingsRead()), brokenCode(() => brokenHop.FbmSync.syncSettingsRead()), brokenData.FBM_ACCOUNT_SETTINGS_V1, brokenData.FBM_SYNC_SETTINGS_V1],
    ['FBM_DOCUMENT_PROPERTY_CORRUPT', 'FBM_DOCUMENT_PROPERTY_CORRUPT', '{"customerPrefix":"ALT"', '{"approvalThreshold":']);

  // FBM-044: đóng phiên mà state đầy đủ không ghi được thì ghi bản rút gọn để màn đồng bộ thoát khỏi pha đang chạy.
  const escData = {}, escLogs = [];
  const escProps = { getProperty: (key) => escData[key] || null, setProperty: (key, value) => { escData[key] = String(value); }, deleteProperty: (key) => { delete escData[key]; } };
  const escHop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => escProps }, logEvent: (event) => escLogs.push(event), LOG_ERROR: 'error', LOG_WARN: 'warn', configGet: () => '', runEntryPoint: (name, source, channel, fn) => fn() });
  napServer(escHop, 'fbm_sync/state/State.js', 'server/service/FbmSyncService.js');
  const bloated = Object.fromEntries(Array.from({ length: 120 }, (_, index) => ['customer:CUS-' + String(index).padStart(6, '0'), { reason: 'x'.repeat(200) }]));
  escHop.FbmSync.stateWrite({ runId: 'r-push', phase: 'push', cursor: { kind: 'push_wait' }, locks: { 'customer:CUS-000001': { owner: 'sync' } } });
  const closed = escHop.FbmSync.stateWrite(Object.assign(escHop.FbmSync.stateRead(), { phase: 'error', lastError: 'Lỗi khi ghi FBM', message: 'Lỗi khi ghi FBM', metadata: { pushFailureDetails: bloated } }));
  const escSaved = escHop.FbmSync.stateRead();
  check(so, 'FBM-044: đóng phiên mà state phình quá giới hạn thì lưu bản rút gọn ở phase lỗi, giữ cursor/khóa ghi, báo Log và Sidebar',
    [escSaved.phase, escSaved.runId, escSaved.cursor.kind, !!escSaved.locks['customer:CUS-000001'], Object.keys(escSaved.metadata.pushFailureDetails).length, escSaved.message.indexOf('bản rút gọn') > 0, closed.phase, escLogs.some((event) => event.action === 'state_write_minimal' && event.outcome === 'warn')],
    ['error', 'r-push', 'push_wait', true, 0, true, 'error', true]);
  let midRunError = null;
  try { escHop.FbmSync.stateWrite(Object.assign(escHop.FbmSync.stateRead(), { phase: 'push', metadata: { pushFailureDetails: bloated } })); } catch (error) { midRunError = error; }
  check(so, 'FBM-044: lát giữa chừng ghi state hỏng vẫn ném lỗi, không lặng lẽ thay bằng bản rút gọn', [midRunError && midRunError.code, escHop.FbmSync.stateRead().phase], ['FBM_DOCUMENT_PROPERTIES_QUOTA', 'error']);

  // State hỏng: status trả snapshot kẹt kèm cờ mở nút đặt lại thay vì ném; đặt lại xóa riêng state phiên.
  escData.FBM_SYNC_STATE_V1 = '{"phase":"push"';
  escData.FBM_SYNC_PENDING_PUSHES_V1 = '{"activity:ACT-1":{"hash":"h"}}';
  escLogs.length = 0;
  const stuck = escHop.fbmGetSyncStatus();
  check(so, 'FBM-044: state hỏng thì status trả "kẹt" kèm nút đặt lại và ghi Log, không ném lỗi', [stuck.code, stuck.resetOffered, stuck.phase, escLogs.some((event) => event.action === 'state_stuck')], ['SYNC_STATE_STUCK', true, 'error', true]);
  const escReset = escHop.FbmSync.stateReset();
  check(so, 'FBM-044: đặt lại xóa state phiên hỏng, giữ hash chờ xác nhận và ghi Log', [escReset.ok, escData.FBM_SYNC_STATE_V1, escData.FBM_SYNC_PENDING_PUSHES_V1, escHop.FbmSync.stateRead().phase, escLogs.some((event) => event.action === 'state_reset')], [true, undefined, '{"activity:ACT-1":{"hash":"h"}}', 'idle', true]);
  escHop.FbmSync.stateWrite({ runId: 'r-live', phase: 'pull_customer' });
  const refused = escHop.FbmSync.stateReset();
  const staleAllowed = escHop.FbmSync.stateReset(Date.now() + escHop.FbmSync.STALE_RUN_MS + 1000);
  check(so, 'FBM-044: phiên đang chạy bình thường thì từ chối đặt lại, phiên treo quá hạn thì cho', [refused.code, staleAllowed.ok, escData.FBM_SYNC_STATE_V1], ['SYNC_RESET_RUNNING', true, undefined]);
}

module.exports = { chay };
