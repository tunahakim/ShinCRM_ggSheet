/**
 * Hộp cát của các ca preflight: nạp đủ tệp GAS, Core giả chỉ cấp giá trị cài đặt và Category, rồi đặt nền chung (tài khoản đúng, không giới hạn phạm vi, cổng Category rỗng, đã gắn liên kết trống, một khách và một Activity chờ đối soát).
 * Dòng định sẵn qua `ungVien` được thêm vào lần duyệt và được `pushEligible` cho qua với `kind` định sẵn; dựng ứng viên và phép chờ sửa (`pushHold`) vẫn là code thật, nên preflight báo đúng dòng mà chặng đẩy sẽ đánh dấu.
 * Mỗi ca tự ghi đè `readLocal`, `scriptSettings`... cho đúng việc của mình; không ca nào được dựa vào nền mà ca trước để lại.
 */
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');

function hopPreflight() {
  // Ngầm định kéo từ FBM đọc qua cổng cài đặt; bộ kiểm thật của cổng nằm ở `tests/cases/settings.js`, ở đây chỉ cấp giá trị đang lưu và kết quả kiểm theo Category để kiểm cách preflight phân biệt thiếu và lệch.
  const coreXacThuc = { stored: 'Chưa xác thực', category: { categories: { '@CAT_XAC_THUC': ['Chưa xác thực', 'Đã xác thực'] } } };
  const hop = taoHopCat({ FbmSync: {}, DATA_SCHEMA: { customer: { verifyStatus: { source: '@CAT_XAC_THUC' } } }, shinCorePreflight: () => ({
    category: coreXacThuc.category,
    issues: []
  }),
  settingsValue: (section, field) => (section === 'defaults_fbm_pull' && field === 'values' ? { customer: { verifyStatus: coreXacThuc.stored } } : undefined),
  settingsDefaultsChecked: (section, category) => (category.categories['@CAT_XAC_THUC'].indexOf(coreXacThuc.stored) >= 0 ? { customer: { verifyStatus: coreXacThuc.stored } } : {}) });
  napServer(hop, 'server/gate/IdGate.js', 'fbm_sync/transport/Budget.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/report/Preflight.js', 'fbm_sync/report/PreflightPush.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/report/Report.js', 'fbm_sync/write/SheetSave.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js');
  const goc = { scanRows: hop.FbmSync.pushScanRows, eligible: hop.FbmSync.pushEligible, readLocal: hop.FbmSync.readLocal };
  const ungVien = (danhSach) => {
    const preset = { customer: danhSach('customer'), activity: danhSach('activity') };
    hop.FbmSync.pushScanRows = (entity, scan) => goc.scanRows(entity, scan).concat(preset[entity].map((c) => ({ record: c.record, parent: null })));
    hop.FbmSync.pushEligible = (entity, record, parent, context) => { const c = preset[entity].find((item) => item.id === record.id); return c ? { eligible: true, kind: c.kind, reason: '' } : goc.eligible(entity, record, parent, context); };
  };
  hop.FbmSync.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Owner đúng' });
  // Các ca khác không xét phạm vi thử; ca phạm vi thử tự đặt lại.
  hop.FbmSync.scope = () => null;
  hop.FbmSync.readCategoryGate = () => ({ map: {}, valid: {} });
  hop.FbmSync.currentSpreadsheetId = () => 'sheet-a';
  hop.FbmSync.bindingRead = () => ({});
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813', fbmHash: 'old', fbmSyncPermission: 'Chỉ lấy từ FBM', syncStatus: 'chờ đối soát', taskType: 'Gọi điện chăm sóc', content: 'Nội dung mới' }] : [{ id: 'CUS-1', fbmId: 'FBM-1', fbmCustomerCode: 'ALT00010', fbmSyncPermission: 'Cho phép' }, { id: 'CUS-2', fbmId: 'FBM-2', fbmSyncPermission: 'Cho phép', syncStatus: hop.FbmSync.SYNC_STATUS.conflict }, { id: 'CUS-3', fbmId: 'FBM-3', fbmSyncPermission: 'Cho phép', syncStatus: hop.FbmSync.SYNC_STATUS.conflict }];
  ungVien((entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.pending, taskType: 'Gọi điện chăm sóc', owner: '' } }] : []);
  return { hop, ungVien, coreXacThuc, goc };
}

module.exports = { hopPreflight };
