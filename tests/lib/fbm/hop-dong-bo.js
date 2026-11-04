/**
 * Hộp cát GAS của đồng bộ FBM: nạp đủ các tệp `fbm_sync` thật cùng kho thuộc tính, khóa script và cửa vào giả. Mọi tệp ca FBM dựng hộp từ đây, không lấy bộ dựng từ tệp ca khác.
 */

const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { taoKhoThuocTinh } = require('../gas/kho-thuoc-tinh');

/** Kho thuộc tính dùng chung; `data` là chính đối tượng kho giữ, để ca kiểm soi khóa mà không tốn lượt đọc. */
function khoDongBo() {
  const data = {};
  const kho = taoKhoThuocTinh(data);
  kho.data = data;
  return kho;
}

/** Hằng số `SETTINGS` của code thật, để ngưỡng trong test luôn khớp file cấu hình. */
function settingsThat() {
  const settings = taoHopCat({});
  napServer(settings, 'server/config/Settings.js');
  return settings.SETTINGS;
}

function workflowGas(options) {
  const opt = options || {};
  const documentProperties = opt.documentProperties || khoDongBo();
  const scriptProperties = opt.scriptProperties || khoDongBo();
  const scriptLock = { held: false, tryLock() { if (this.held) { return false; } this.held = true; return true; }, releaseLock() { this.held = false; } };
  const hop = taoHopCat(Object.assign({
    // Chỗ giữ trước khi nạp Trace.js thật (bản thật đè hàm giả này); đóng lượt luôn ghi dòng đóng bước nên bộ dựng chung nạp sổ bước.
    FbmSync: { traceImport() {} },
    DATA_SCHEMA: {},
    SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => documentProperties, getScriptProperties: () => scriptProperties },
    Utilities: { getUuid: () => 'workflow-uuid', newBlob: (value) => ({ getBytes: () => Buffer.from(String(value), 'utf8') }) },
    shinOpenBook: () => ({ getId: () => 'sheet-workflow' }),
    LOG_OK: 'ok', LOG_ERROR: 'error', LOG_CONFLICT: 'conflict',
    logEvent: () => {},
    logTrace: () => {},
    runEntryPoint: (name, source, fn) => fn(),
    // Khóa script giả của hộp cát; `scriptLock.held` cho ca kiểm giữ khóa sẵn để thử nhánh bận.
    LockService: { getScriptLock: () => scriptLock },
    // Chỉ lấy hằng số `SETTINGS` thật, không nạp cả Settings.js vì nó kéo theo đường đọc sheet Config.
    SETTINGS: settingsThat()
  }, opt));
  napServer(hop,
    'fbm_sync/schema/FbmFields.js',
    'fbm_sync/protocol/Protocol.js',
    ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js',
    'fbm_sync/control/ControlPort.js',
    'fbm_sync/control/SettingsCommands.js',
    'fbm_sync/state/Scheduler.js',
    'fbm_sync/reconcile/Identity.js',
    'fbm_sync/reconcile/CategoryGate.js',
    'fbm_sync/reconcile/Fingerprint.js',
    'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/Conflict.js',
    'fbm_sync/report/Report.js',
    'fbm_sync/read/GridRead.js',
    'fbm_sync/write/PushCandidates.js',
    'fbm_sync/write/RequestBuilders.js',
    'fbm_sync/auth/AutoLogin.js',
    'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js',
    'fbm_sync/transport/PushFlow.js',
    'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js',
    'fbm_sync/transport/EntryPoints.js',
    'server/service/FbmSyncService.js',
    'server/dev/FbmSyncStateProbe.js'
  , 'fbm_sync/write/SheetSave.js', ...(opt.extraFiles || []));
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-workflow';
  hop.FbmSync.configValue = () => '';
  // `readLocal: 'sheet'` giữ readLocal thật (đi qua bản chụp Sheet) để đếm số lần đọc Sheet.
  if (opt.readLocal !== 'sheet') { hop.FbmSync.readLocal = opt.readLocal || (() => []); }
  return { hop, documentProperties, scriptProperties, scriptLock };
}

module.exports = { workflowGas, khoDongBo };
