/** Kho tham số vận hành FBM trong DocumentProperties; Config cũ chỉ được đọc một lần để migration. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

FbmSync.SYNC_SETTINGS_KEY = 'FBM_SYNC_SETTINGS_V1';
FbmSync.SYNC_SETTINGS_DEFAULT = {
  customerPrefix: '',
  customerCodeLength: '',
  activitySince: '',
  approvalThreshold: 10
};

function fbmSyncSettingsCloneDefault() {
  return {
    customerPrefix: FbmSync.SYNC_SETTINGS_DEFAULT.customerPrefix,
    customerCodeLength: FbmSync.SYNC_SETTINGS_DEFAULT.customerCodeLength,
    activitySince: FbmSync.SYNC_SETTINGS_DEFAULT.activitySince,
    approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold
  };
}

function fbmSyncSettingsProps() {
  if (typeof FbmSync.props === 'function') { return FbmSync.props(); }
  if (typeof PropertiesService !== 'undefined' && PropertiesService.getDocumentProperties) { return PropertiesService.getDocumentProperties(); }
  return null;
}

function fbmSyncSettingsText(value, maxLength) {
  var text = String(value === undefined || value === null ? '' : value).trim();
  return maxLength && text.length > maxLength ? text.slice(0, maxLength) : text;
}

function fbmSyncSettingsNormalize(input, allowDefaults) {
  var source = input && typeof input === 'object' ? input : {}, result = allowDefaults ? fbmSyncSettingsCloneDefault() : {};
  var prefix = fbmSyncSettingsText(source.customerPrefix, 64);
  var lengthText = fbmSyncSettingsText(source.customerCodeLength, 16);
  var since = fbmSyncSettingsText(source.activitySince, 32);
  var thresholdRaw = source.approvalThreshold;
  var threshold = thresholdRaw === '' || thresholdRaw === null || thresholdRaw === undefined ? (allowDefaults ? 10 : NaN) : Number(thresholdRaw);
  if (prefix || source.customerPrefix !== undefined) { result.customerPrefix = prefix; }
  if (lengthText || source.customerCodeLength !== undefined) { result.customerCodeLength = lengthText; }
  if (since || source.activitySince !== undefined) { result.activitySince = since; }
  if (isFinite(threshold)) { result.approvalThreshold = Math.floor(threshold); }
  return result;
}

function fbmSyncSettingsValidate(input) {
  var source = input && typeof input === 'object' ? input : {}, normalized = fbmSyncSettingsNormalize(source, true), lengthText = normalized.customerCodeLength;
  if (lengthText && (!/^\d+$/.test(lengthText) || Number(lengthText) < 1 || Number(lengthText) > 32)) {
    return { ok: false, code: 'FBM_CUSTOMER_CODE_LENGTH_INVALID', message: 'Độ dài mã khách phải là số nguyên từ 1 đến 32, hoặc để trống.' };
  }
  if (normalized.activitySince && !/^\d{4}-\d{2}-\d{2}$/.test(normalized.activitySince)) {
    return { ok: false, code: 'FBM_ACTIVITY_SINCE_INVALID', message: 'Mốc Activity phải có dạng YYYY-MM-DD, hoặc để trống.' };
  }
  if (!isFinite(Number(source.approvalThreshold)) || Number(source.approvalThreshold) < 0 || Math.floor(Number(source.approvalThreshold)) !== Number(source.approvalThreshold)) {
    return { ok: false, code: 'FBM_APPROVAL_THRESHOLD_INVALID', message: 'Ngưỡng yêu cầu chấp thuận phải là số nguyên không âm.' };
  }
  normalized.approvalThreshold = Number(source.approvalThreshold);
  return { ok: true, settings: normalized };
}

function fbmSyncSettingsLegacy() {
  var result = fbmSyncSettingsCloneDefault();
  var read = function (name) {
    try { return typeof configGet === 'function' ? configGet(name, '') : ''; } catch (ignore) { return ''; }
  };
  result.customerPrefix = fbmSyncSettingsText(read('FBM_MA_KH_PREFIX'), 64);
  result.customerCodeLength = fbmSyncSettingsText(read('FBM_MA_KH_LENGTH'), 16);
  result.activitySince = fbmSyncSettingsText(read('FBM_ACTIVITY_SINCE'), 32);
  var threshold = Number(read('FBM_SYNC_APPROVAL_THRESHOLD'));
  if (isFinite(threshold) && threshold >= 0) { result.approvalThreshold = Math.floor(threshold); }
  return result;
}

FbmSync.syncSettingsRead = function () {
  var props = fbmSyncSettingsProps(), raw = '';
  try { raw = props && props.getProperty(FbmSync.SYNC_SETTINGS_KEY) || ''; } catch (ignoreRead) { raw = ''; }
  if (raw) {
    try {
      var parsed = JSON.parse(raw), valid = fbmSyncSettingsValidate(fbmSyncSettingsNormalize(parsed, true));
      if (valid.ok) { return valid.settings; }
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
