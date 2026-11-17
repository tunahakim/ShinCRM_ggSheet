/** Cửa ghi Sheet không có luật nào từ chối nội dung trường kéo từ FBM về (Customer và Activity). */
const { section, check } = require('../../lib/assert');
const { taoHopCat, napServer } = require('../../lib/load-gas');
const { TEP_NEN } = require('../../lib/dung-hop');

function chay(so) {
  section('FBM sync — Cửa ghi Sheet không có luật nào từ chối nội dung trường kéo từ FBM về ');
  // FBM-023 (chủ dự án chốt 2026-10-06): khi cửa ghi Sheet từ chối một bản ghi kéo về, pull chặn CẢ TRANG chứ không bỏ riêng bản ghi đó.
  // Chặn cả trang chỉ an toàn vì cửa ghi hiện KHÔNG có luật nào từ chối được nội dung một trường FBM (chỉ dữ liệu người dùng nhập mới bị kiểm bắt buộc/định dạng/trùng).
  // Nếu test này đỏ: ai đó vừa thêm luật kiểm (ví dụ đổi một trường FBM sang kiểu số, hoặc bật kiểm trùng cho nguồn pull). Khi đó một khách FBM có dữ liệu "lạ" sẽ chặn đồng bộ nền mãi mãi.
  // Đừng chỉ sửa test cho xanh: phải quyết định lại FBM-023 — bỏ luật kiểm đó cho nguồn pull, hoặc làm phương án (b) "bỏ riêng bản ghi lỗi, ghi phần còn lại, đặt trạng thái lỗi" kèm ngưỡng dừng đặt trong file config.
  const gateBox = napServer(taoHopCat({ FbmSync: {} }), ...TEP_NEN, 'fbm_sync/SyncSchema.js', 'fbm_sync/schema/FbmFields.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategoryLookup.js', 'fbm_sync/reconcile/SyncPermission.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/ConnectionSave.js', 'fbm_sync/auth/LoginStores.js');
  const strangeText = 'abc ### 12,3,4 ngày 99/99 xyz';
  const strangeFbm = {};
  gateBox.FbmSync.GRID_FIELDS.customer.concat(gateBox.FbmSync.GRID_FIELDS.activity, Object.values(gateBox.FbmSync.FIELD_ALIASES.customer), Object.values(gateBox.FbmSync.FIELD_ALIASES.activity)).forEach((field) => { strangeFbm[field] = strangeText; });
  const pullRejects = (entity, record) => {
    const fields = gateBox.writeGateFields(entity, [gateBox.DATA_SCHEMA, gateBox.SYNC_SCHEMA]);
    const names = Object.keys(record).filter((name) => fields[name]);
    const strange = {};
    names.forEach((name) => { strange[name] = strangeText; });
    const invalid = [];
    const plans = [record, strange].map((source) => ({ record: source, values: {}, moi: true, row: 0 }));
    plans.forEach((plan) => gateBox.writeGateBuild(plan, names, fields, 'pull', invalid, null));
    gateBox.writeGateUniqueCheck(plans, names, fields, 'pull', { sheetName: entity, rowCount: 0 }, invalid);
    return invalid.map((item) => item.field + ': ' + item.reason);
  };
  check(so, 'FBM-023: cửa ghi Sheet không có luật nào từ chối nội dung trường kéo từ FBM về (Customer và Activity, kể cả giá trị lạ và hai bản ghi trùng nhau) — đỏ thì phải quyết lại FBM-023, xem chú thích',
    [pullRejects('customer', gateBox.FbmSync.customerRecord(strangeFbm, { map: {} })), pullRejects('activity', gateBox.FbmSync.activityRecord(strangeFbm, { map: {} }, null))], [[], []]);

  return so;
}

module.exports = { chay };
