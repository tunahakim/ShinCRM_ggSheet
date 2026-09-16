/** Kho cài đặt cấp hệ thống FBM trong DocumentProperties. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SYNC_SETTINGS_KEY = 'FBM_SYNC_SETTINGS_V1';
FbmSync.SYNC_SETTINGS_DEFAULT = { approvalThreshold: 10 };

function fbmSyncSettingsCloneDefault() {
  return { approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold };
}

function fbmSyncSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties) { return PropertiesService.getDocumentProperties(); }
  return null;
}

function fbmSyncSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmSyncSettingsCloneDefault() : {};
  var raw = source.approvalThreshold;
  var threshold = raw === '' || raw === null || raw === undefined ? (allowDefaults ? FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold : NaN) : Number(raw);
  if (isFinite(threshold)) { result.approvalThreshold = Math.floor(threshold); }
  return result;
}

function fbmSyncSettingsValidate(input) {
  var source = input && typeof input === 'object' ? input : {}, raw = source.approvalThreshold, normalized = fbmSyncSettingsNormalize(source, true), threshold = Number(normalized.approvalThreshold);
  if (raw !== undefined && raw !== null && raw !== '' && !isFinite(Number(raw))) { threshold = NaN; }
  if (!isFinite(threshold) || threshold < 0 || Math.floor(threshold) !== threshold) {
    return { ok: false, code: 'FBM_APPROVAL_THRESHOLD_INVALID', message: 'Ngưỡng yêu cầu chấp thuận phải là số nguyên không âm.' };
  }
  normalized.approvalThreshold = threshold;
  return { ok: true, settings: normalized };
}

function fbmSyncSettingsLegacy() {
  var result = fbmSyncSettingsCloneDefault(), raw = '';
  try { raw = typeof configGet === 'function' ? configGet('FBM_SYNC_APPROVAL_THRESHOLD', '') : ''; } catch (ignore) { raw = ''; }
  var threshold = Number(raw);
  if (isFinite(threshold) && threshold >= 0) { result.approvalThreshold = Math.floor(threshold); }
  return result;
}

FbmSync.syncSettingsRead = function () {
  var props = fbmSyncSettingsProps(), raw = '';
  try { raw = props && props.getProperty(FbmSync.SYNC_SETTINGS_KEY) || ''; } catch (ignoreRead) { raw = ''; }
  if (raw) {
    try {
      var parsed = JSON.parse(raw), valid = fbmSyncSettingsValidate(fbmSyncSettingsNormalize(parsed, true));
      if (valid.ok) {
        // Ghi lại dạng tối giản để loại bỏ các key cài đặt cũ khỏi kho hiện tại.
        if (props && JSON.stringify(parsed) !== JSON.stringify(valid.settings)) { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(valid.settings)); }
        return valid.settings;
      }
    } catch (ignoreJson) {}
  }
  var migrated = fbmSyncSettingsLegacy();
  try { if (props) { props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(migrated)); } } catch (ignoreWrite) {}
  return migrated;
};

FbmSync.syncSettingsSave = function (input) {
  var check = fbmSyncSettingsValidate(input || {});
  if (!check.ok) { return check; }
  var props = fbmSyncSettingsProps(), previous = FbmSync.syncSettingsRead();
  if (!props) { return { ok: false, code: 'FBM_SYNC_SETTINGS_STORAGE_UNAVAILABLE', message: 'Không truy cập được DocumentProperties.' }; }
  props.setProperty(FbmSync.SYNC_SETTINGS_KEY, JSON.stringify(check.settings));
  return { ok: true, settings: check.settings, previous: previous };
};

FbmSync.syncSettingsPublic = function () {
  return FbmSync.syncSettingsRead();
};
