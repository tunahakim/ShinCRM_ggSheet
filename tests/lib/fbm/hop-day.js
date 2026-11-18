/**
 * Hộp thử chặng đẩy cho các tệp ca `Push*`: hộp GAS nạp đủ tệp đồng bộ thật, state có phiên đã xác thực, ứng viên đẩy và cài đặt tài khoản định sẵn. Mỗi tệp ca dựng một hộp mới nên không tệp nào dựa vào thứ tự chạy của tệp khác.
 *
 * Cạm bẫy: `pushEligibilityErrors` được thay bằng hàm rỗng để ca hàng đợi không vướng phép kiểm đủ trường; ca kiểm phép đó lấy bản thật ở `dieuKienThat`.
 */
const { taoHopCat, napServer, TEP_KHUNG_LUOT } = require('../load-gas');
const { taoKhoThuocTinh } = require('../gas/kho-thuoc-tinh');
const { datState } = require('./dat-state');
const { datUngVienDay } = require('./ung-vien-day');

const TEP_GAS = ['fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', ...TEP_KHUNG_LUOT, 'fbm_sync/state/RunPlan.js', 'fbm_sync/diagnostic/Trace.js', 'fbm_sync/state/PropertyBuffer.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/ConflictStage.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/RecordMap.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/write/FormValues.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/Budget.js', 'fbm_sync/transport/TransportCore.js', 'fbm_sync/transport/PushFlow.js', 'fbm_sync/transport/PushRecover.js', 'fbm_sync/transport/PushApply.js', 'fbm_sync/transport/PushStage.js', 'fbm_sync/transport/PullFlow.js', 'fbm_sync/transport/ScanJob.js', 'fbm_sync/read/CustomerScan.js', 'fbm_sync/transport/CustomerCount.js', 'fbm_sync/state/Scheduler.js', 'fbm_sync/state/BackgroundMachine.js', 'fbm_sync/state/Heartbeat.js', 'fbm_sync/transport/ActivityBatch.js', 'fbm_sync/read/ActivityLayers.js', 'fbm_sync/transport/ActivityScan.js', 'fbm_sync/transport/EntryPoints.js', 'fbm_sync/control/PushCommands.js', 'fbm_sync/write/SheetSave.js'];

const PHIEN = { expired: false, sessionId: 'verified-session', identityVerified: true, identitySessionId: 'verified-session' };

function dungHopDay() {
  const kho = taoKhoThuocTinh({});
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => kho, getScriptProperties: () => kho }, writeGateSave: () => ({ ok: true }) });
  napServer(push, ...TEP_GAS);
  const F = push.FbmSync;
  datState(F, { session: PHIEN });
  const dieuKienThat = F.pushEligibilityErrors;
  // Hộp này kiểm hàng đợi đẩy; lịch kiểm lại danh mục có test riêng.
  F.pushLookupDue = () => false;
  F.scriptSettings = () => ({ cookie: '', customerAuthorized: '', activityAuthorized: '', accountName: 'Lê Tuấn Anh' });
  datUngVienDay(push, () => [{ kind: 'edit', id: 'C-1', position: 0, record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }]);
  F.categoryGateCheck = () => [];
  F.pushEligibilityErrors = () => [];
  F.customerEditOpenRequest = () => ({ url: 'https://fbm.test/edit', body: {}, meta: { kind: 'customer_edit_open' } });
  F.readLocal = (entity) => entity === 'customer' ? [{ id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' }, { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' }, { id: 'C-ERR', companyName: 'Lỗi' }, { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' }] : [{ id: 'ACT-NEW', fbmId: '', content: 'Tạo từ ShinCRM', taskType: 'CV1', workDate: '2026-10-07' }];
  return { push, F, session: PHIEN, dieuKienThat };
}

/** Mở một lượt đẩy đang ở đầu lần quét `entity` (mặc định Khách), qua đúng cổng `runOpen` và `stateWrite`; `them` ghi thêm vào state trước khi lưu. */
function moQuetDay(hop, entity, them) {
  const st = hop.F.runOpen({ phase: 'push' });
  st.session = hop.session;
  st.cursor = { kind: 'push_scan', entity: entity || 'customer', index: 0 };
  Object.assign(st, them || {});
  hop.F.stateWrite(st);
  return st;
}

/** Ứng viên tạo Activity dùng chung cho ca dọn dấu #SC và ca cứu lệnh tạo mất phản hồi. */
function activityMoi(F) {
  return { entity: 'activity', kind: 'create', id: 'ACT-NEW', position: 0, record: { id: 'ACT-NEW', fbmId: '', customerFbmCode: 'ALT00010', stt_rec: 'A-CUS', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09', fbmSyncPermission: 'Cho phép' } };
}

module.exports = { dungHopDay, moQuetDay, activityMoi };
