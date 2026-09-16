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
  check(so, 'migration loai bo tham so ma khach va moc Activity, giu nguong phe duyet', [Object.keys(first).sort(), first.approvalThreshold, writesAfterMigration, Object.keys(second).sort(), second.approvalThreshold], [['approvalThreshold'], 12, 1, ['approvalThreshold'], 12]);
  const invalid = hop.FbmSync.syncSettingsSave({ approvalThreshold: -1 });
  check(so, 'nguong phe duyet am bi tu choi truoc khi ghi DocumentProperties', [invalid.ok, invalid.code, data.FBM_SYNC_SETTINGS_V1.indexOf('CHANGED-') >= 0], [false, 'FBM_APPROVAL_THRESHOLD_INVALID', false]);
  const invalidText = hop.FbmSync.syncSettingsSave({ approvalThreshold: 'khong-phai-so' });
  check(so, 'nguong phe duyet khong phai so bi tu choi', [invalidText.ok, invalidText.code], [false, 'FBM_APPROVAL_THRESHOLD_INVALID']);
  const saved = hop.FbmSync.syncSettingsSave({ approvalThreshold: 0 });
  check(so, 'luu nguong phe duyet hop le va cho phep nguong 0', [saved.ok, Object.keys(saved.settings), saved.settings.approvalThreshold, hop.FbmSync.syncSettingsRead().approvalThreshold], [true, ['approvalThreshold'], 0, 0]);
}

module.exports = { chay };
