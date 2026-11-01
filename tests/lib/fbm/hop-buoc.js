/**
 * Hộp cát của sổ bước nghiệp vụ: một lượt đang mở, đã xong bước kiểm phiên, đang ở bước kéo khách và đối soát. Dùng để kiểm mỗi đường đóng lượt đóng đúng bước đang mở và ghi đúng dòng Log.
 * Hủy phiên trả status công khai; các ca này chỉ kiểm sổ bước nên `statusView` là bản giả.
 */
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { taoKhoThuocTinh } = require('../gas/kho-thuoc-tinh');

function hopBuoc() {
  const kho = taoKhoThuocTinh({}), dong = [];
  const nen = taoHopCat({
    FbmSync: {}, LOG_OK: 'ok', LOG_WARN: 'warn', LOG_ERROR: 'error',
    LockService: { getScriptLock: () => ({ tryLock: () => true, releaseLock() {} }) },
    PropertiesService: { getDocumentProperties: () => kho },
    logTrace: (entry) => dong.push(entry), logEvent: (entry) => dong.push(entry)
  });
  napServer(nen, ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/write/SheetSave.js');
  nen.FbmSync.statusView = () => ({ ok: true });
  const st = nen.FbmSync.runOpen({ phase: 'checking_session' });
  nen.FbmSync.businessStepStart(st, 'run', {});
  nen.FbmSync.businessStepStart(st, 'session', {});
  nen.FbmSync.businessStepFinish(st, 'session', 'ok', {});
  nen.FbmSync.businessStepStart(st, 'pull_customer', {});
  nen.FbmSync.businessStepStart(st, 'reconcile_customer', {});
  nen.FbmSync.businessStepAdd(st, 'pull_customer', { received: 50 });
  st.phase = 'pull_customer';
  return { nen, dong, st: nen.FbmSync.stateWrite(st) };
}

/** Các dòng kết thúc bước, rút gọn thành `bước|mức|câu đầu`. */
function dongDong(dong) {
  return dong.filter((e) => /_finished$/.test(e.action)).map((e) => e.detail.step + '|' + e.outcome + '|' + e.reason.split(' - ')[0]);
}

module.exports = { hopBuoc, dongDong };
