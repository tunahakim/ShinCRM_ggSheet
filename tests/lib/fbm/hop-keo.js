/**
 * Hộp cát GAS cho các ca kiểm chặng kéo về (`reconcile/Pull.js`): hai bộ tệp khác nhau vì chặng quét cần thêm các tệp luồng, còn ca cạnh biên chỉ cần cửa ghi kéo về. Kho thuộc tính là kho chung, không tự dựng.
 */
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { taoPropertiesService } = require('../gas/kho-thuoc-tinh');

/**
 * Hộp đủ chặng quét và kéo. `xacThuc.value` là giá trị Xác thực ngầm định mà ngầm định kéo của Cài đặt trả; `permission` và `activityPermission` là giá trị Cho phép đồng bộ FBM của khách và giao dịch (mặc định "Cho phép"). Trường nào để rỗng thì chặng kéo bản ghi mới của thực thể đó dừng.
 */
function hopKeoVe(xacThuc) {
  const chon = xacThuc || { value: 'Chưa xác thực' };
  const hop = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    // Ngầm định kéo từ FBM đã kiểm với Category (bộ kiểm thật ở `tests/cases/settings.js`); `PullDefaults.js` thật quyết định thiếu thì ném.
    settingsDefaultsChecked: (section) => {
      if (section !== 'defaults_fbm_pull') { return {}; }
      const khach = {}, giaoDich = {}, quyenKhach = chon.permission === undefined ? 'Cho phép' : chon.permission, quyenGiaoDich = chon.activityPermission === undefined ? 'Cho phép' : chon.activityPermission;
      if (chon.value) { khach.verifyStatus = chon.value; }
      if (quyenKhach) { khach.fbmSyncPermission = quyenKhach; }
      if (quyenGiaoDich) { giaoDich.fbmSyncPermission = quyenGiaoDich; }
      return { customer: khach, activity: giaoDich };
    }, categoryReadAll: () => ({ categories: {} }),
    PropertiesService: taoPropertiesService({}),
    shinOpenBook: () => ({ getId: () => 'sheet-pull-test' })
  });
  napServer(hop, 'server/data/DataSchema.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/RecordMap.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/state/PullDefaults.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/write/SheetSave.js');
  return hop;
}

/** Hộp chỉ có cửa ghi kéo về và các tệp cạnh nó, cho ca cạnh biên (dấu vân, sổ đã thấy, bản ghi bị giữ, ứng viên đẩy). */
function hopKeoBien() {
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: taoPropertiesService({}) });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/RecordMap.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js');
  return hop;
}

/** Bảng danh mục thử: một giá trị Tỉnh thành và nó đúng khi chọn theo tên hoặc theo mã. Test được sửa bảng này thì tự lấy bản riêng mỗi lần gọi. */
function congDanhMucThu() {
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  return gate;
}

module.exports = { hopKeoVe, hopKeoBien, congDanhMucThu };
