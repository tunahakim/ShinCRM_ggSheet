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
  hop.FbmSync.pushCandidates = (entity) => entity === 'activity' ? [{ kind: 'edit', id: 'ACT-1', record: { id: 'ACT-1', syncStatus: hop.FbmSync.SYNC_STATUS.conflict, taskType: 'Gọi điện chăm sóc' } }] : [];

  const write = hop.FbmSync.runPreflight({ mode: 'write' });
  check(so, 'preflight write chặn Config tài khoản thiếu', [write.ok, write.blocking.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [false, true]);
  check(so, 'preflight write báo conflict và mapping theo mã riêng', [write.issues.some((item) => item.code === 'FBM_RECORD_CONFLICT_PENDING'), write.issues.some((item) => item.code === 'FBM_CATEGORY_MAPPING_MISSING')], [true, true]);

  const read = hop.FbmSync.runPreflight({ mode: 'read' });
  check(so, 'preflight read vẫn cho phép đọc nhưng giữ cảnh báo', [read.ok, read.warnings.some((item) => item.code === 'FBM_ACCOUNT_NAME_MISSING')], [true, true]);
}

module.exports = { chay };
