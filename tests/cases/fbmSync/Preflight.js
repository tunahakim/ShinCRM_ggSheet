/** Kiểm tra ranh giới Core -> module và các lỗi phải báo trước phiên FBM. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — preflight");
  const hop = taoHopCat({ FbmSync: {}, shinCorePreflight: () => ({
    params: {},
    category: { categories: { '@CAT_CHO_PHEP_FBM': [] } },
    issues: []
  }) });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/report/Preflight.js');
  hop.FbmSync.scriptSettings = () => ({ accountName: '', customerPrefix: '', customerCodeLength: '' });
  hop.FbmSync.readCategoryGate = () => ({ valid: {} });
  hop.FbmSync.readLocal = (entity) => entity === 'activity' ? [{ id: 'ACT-NOPERM', customerId: 'CUS-1', fbmId: '174813', fbmHash: 'old', allowFbmPush: 'Chưa cho phép', syncStatus: 'chờ đối soát', taskType: 'Gọi điện chăm sóc', content: 'Nội dung mới' }] : [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', allowFbmPush: 'Cho phép' }];
  hop.FbmSync.pushPermission = (record) => ({ push: String(record.allowFbmPush || '') === 'Cho phép' });
  hop.FbmSync.pushCandidates = (entity) => entity === 'activity' ? [{ entity: 'activity', kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.conflict, taskType: 'Gọi điện chăm sóc', owner: 'Owner khác' } }] : [];

  const write = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight write chặn Config tài khoản thiếu', [write.ok, write.blocking.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [false, true]);
  check(so, 'preflight write báo conflict và mapping theo mã riêng', [write.issues.some((item) => item.code === 'FBM_RECORD_CONFLICT_PENDING'), write.issues.some((item) => item.code === 'FBM_CATEGORY_MAPPING_MISSING')], [true, true]);
  check(so, 'preflight báo Activity đổi nhưng chưa bật quyền đẩy', write.issues.some((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING'), true);
  check(so, 'preflight gộp cảnh báo quyền đẩy theo tổng số', write.issues.filter((item) => item.code === 'FBM_RECORD_PUSH_PERMISSION_MISSING').length, 1);

  const read = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read vẫn cho phép đọc nhưng giữ cảnh báo', [read.ok, read.warnings.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [true, true]);
  const push = hop.FbmSync.runPreflight({ mode: 'push' });
  check(so, 'preflight mode push vẫn fail-closed như mode write', [push.ok, push.blocking.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [false, true]);

  hop.FbmSync.pushOwnerError = (candidate, settings) => candidate.entity === 'activity' && candidate.record.owner && candidate.record.owner !== settings.accountName
    ? 'Activity ' + candidate.id + ' thuộc owner FBM khác.' : '';
  hop.FbmSync.scriptSettings = () => ({ accountName: 'Owner đúng', customerPrefix: '', customerCodeLength: '' });
  const owner = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight chặn toàn bộ ứng viên Activity lệch owner trước khi cấp request', [owner.ok, owner.blocking.some((item) => item.code === 'FBM_ACTIVITY_OWNER_MISMATCH')], [false, true]);
}

module.exports = { chay };
