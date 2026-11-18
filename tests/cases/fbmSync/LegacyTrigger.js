/** Lịch nền mặc định, và code đồng bộ không cài trigger hẹn giờ nào phía GAS. */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../../lib/load-gas');
const { taoPropertiesService } = require('../../lib/gas/kho-thuoc-tinh');

function chay(so) {
  section('FBM sync — lịch nền mặc định và không cài trigger');
  const schedulerData = {};
  const scheduler = taoHopCat({ FbmSync: {}, SETTINGS: { LOCK_WAIT_MS: 1 }, PropertiesService: taoPropertiesService({ doc: schedulerData }), LockService: { getDocumentLock: () => ({ tryLock: () => true, releaseLock: () => {} }) }, runEntryPoint: (name, source, fn) => fn() });
  napServer(scheduler, 'fbm_sync/schema/FbmFields.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js');
  const schedule = scheduler.FbmSync.scheduleShape(scheduler.settingsValues(scheduler.FbmSync.SETTING_SECTIONS.background));
  check(so, 'Lấy toàn bộ giao dịch chạy nền mặc định chu kỳ 8 giờ; chưa từng chạy xong thì đến hạn ngay',
    [schedule.activityFull.minutes, scheduler.FbmSync.processDueAt('activityFull', schedule, scheduler.FbmSync.processBookRead())],
    [480, 0]);
  // Nhịp nền chỉ do alarm `gas_poll` của Extension (09/02): code đồng bộ không được cài trigger hẹn giờ nào.
  const fbmSources = require('fs').readdirSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync'), { recursive: true }).filter((file) => /\.js$/.test(file)).map((file) => require('fs').readFileSync(require('path').join(__dirname, '../../../1_ShinCRM_GAS/fbm_sync', file), 'utf8'));
  check(so, 'Code đồng bộ FBM không cài trigger hẹn giờ nào phía GAS', fbmSources.filter((source) => /newTrigger\(|timeBased\(/.test(source)).length, 0);

  return so;
}

module.exports = { chay };
