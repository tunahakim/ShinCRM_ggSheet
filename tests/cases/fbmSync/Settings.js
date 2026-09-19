const { napServer, taoHopCat } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');

function chay(so) {
  section('FBM sync - tham số DocumentProperties');
  const data = {}, legacy = { FBM_MA_KH_PREFIX: 'KH-', FBM_MA_KH_LENGTH: '8', FBM_ACTIVITY_SINCE: '2026-01-01', FBM_SYNC_APPROVAL_THRESHOLD: '12' };
  const props = { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, configGet: (name, fallback) => legacy[name] === undefined ? fallback : legacy[name] });
  napServer(hop, 'fbm_sync/state/SyncSettings.js', 'fbm_sync/state/AccountSettings.js', 'fbm_sync/reconcile/Fingerprint.js');
  const first = hop.FbmSync.accountSettingsRead();
  const syncFirst = hop.FbmSync.syncSettingsRead();
  const writesAfterMigration = Object.keys(data).length;
  legacy.FBM_MA_KH_PREFIX = 'CHANGED-'; legacy.FBM_SYNC_APPROVAL_THRESHOLD = '99';
  const second = hop.FbmSync.accountSettingsRead();
  const syncSecond = hop.FbmSync.syncSettingsRead();
  check(so, 'migration tach cau hinh tai khoan FBM khoi tham so phien', [Object.keys(first).sort(), first.customerPrefix, first.customerCodeLength, first.activitySince, writesAfterMigration, Object.keys(second).sort(), second.customerPrefix, Object.keys(syncFirst).sort(), syncSecond.approvalThreshold], [['activitySince', 'customerCodeLength', 'customerPrefix'], 'KH-', '8', '2026-01-01', 2, ['activitySince', 'customerCodeLength', 'customerPrefix'], 'KH-', ['approvalThreshold'], 12]);
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
  check(so, 'luu nguong phe duyet hop le va cho phep nguong 0', [saved.ok, Object.keys(saved.settings), saved.settings.approvalThreshold, hop.FbmSync.syncSettingsRead().approvalThreshold], [true, ['approvalThreshold'], 0, 0]);

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
  quotaHop.FbmSync.stateWrite({ runId: 'before-quota', cursor: { pageIndex: 2, pageValue: ['2026-09-20', 'CUS-000002'] }, metadata: { conflicts: [{ entity: 'customer', id: 'CUS-000001', fields: { companyName: 'x'.repeat(200) } }] }, locks: { 'customer:CUS-000001': { owner: 'sync', revision: 'r1' } } });
  const previousState = quotaData.FBM_SYNC_STATE_V1;
  quotaFull = true;
  let quotaError = null;
  try {
    quotaHop.FbmSync.stateWrite({ runId: 'too-large', cursor: { pageIndex: 3 }, metadata: { conflicts: Array.from({ length: 120 }, (_, index) => ({ entity: 'customer', id: 'CUS-' + String(index).padStart(6, '0'), fields: { companyName: 'x'.repeat(200) } })) }, locks: { 'customer:CUS-000001': { owner: 'sync', revision: 'r2' } } });
  } catch (error) { quotaError = error; }
  const syncQuota = quotaHop.FbmSync.syncSettingsSave({ approvalThreshold: 4 });
  const accountQuota = quotaHop.FbmSync.accountSettingsSave({ customerPrefix: 'ALT', customerCodeLength: '8', activitySince: '2026-01-01' });
  check(so, 'DocumentProperties đầy giữ nguyên state cursor/conflict/RecordLocks và không ghi dở JSON', [quotaError && quotaError.code, quotaData.FBM_SYNC_STATE_V1 === previousState, syncQuota.code, accountQuota.code, quotaLogs.some((event) => event.reason === 'FBM_DOCUMENT_PROPERTIES_QUOTA')], ['FBM_DOCUMENT_PROPERTIES_QUOTA', true, 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', 'FBM_DOCUMENT_PROPERTIES_WRITE_FAILED', true]);
}

module.exports = { chay };
