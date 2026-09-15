const { napServer, taoHopCat } = require('../../lib/load-gas');
const { section, check } = require('../../lib/assert');

function chay(so) {
  section('FBM sync - tham số DocumentProperties');
  const data = {}, legacy = { FBM_MA_KH_PREFIX: 'KH-', FBM_MA_KH_LENGTH: '8', FBM_ACTIVITY_SINCE: '2026-01-01', FBM_SYNC_APPROVAL_THRESHOLD: '12' };
  const props = { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  const hop = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => props }, configGet: (name, fallback) => legacy[name] === undefined ? fallback : legacy[name] });
  napServer(hop, 'fbm_sync/state/SyncSettings.js');
  const first = hop.FbmSync.syncSettingsRead();
  const writesAfterMigration = Object.keys(data).length;
  legacy.FBM_MA_KH_PREFIX = 'CHANGED-'; legacy.FBM_SYNC_APPROVAL_THRESHOLD = '99';
  const second = hop.FbmSync.syncSettingsRead();
  check(so, 'migration doc Config cu mot lan va doc lai tu kho moi', [first.customerPrefix, first.customerCodeLength, first.activitySince, first.approvalThreshold, writesAfterMigration, second.customerPrefix, second.approvalThreshold], ['KH-', '8', '2026-01-01', 12, 1, 'KH-', 12]);
  const invalid = hop.FbmSync.syncSettingsSave({ customerPrefix: 'KH-', customerCodeLength: 0, activitySince: '01/01/2026', approvalThreshold: -1 });
  check(so, 'tham so sai bi tu choi truoc khi ghi DocumentProperties', [invalid.ok, invalid.code, data.FBM_SYNC_SETTINGS_V1.indexOf('CHANGED-') >= 0], [false, 'FBM_CUSTOMER_CODE_LENGTH_INVALID', false]);
  const saved = hop.FbmSync.syncSettingsSave({ customerPrefix: 'CRM-', customerCodeLength: 10, activitySince: '', approvalThreshold: 0 });
  check(so, 'luu tham so hop le va cho phep nguong 0', [saved.ok, saved.settings.customerPrefix, saved.settings.customerCodeLength, saved.settings.approvalThreshold, hop.FbmSync.syncSettingsRead().approvalThreshold], [true, 'CRM-', '10', 0, 0]);
}

module.exports = { chay };
