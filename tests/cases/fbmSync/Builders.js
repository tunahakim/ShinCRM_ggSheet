/** Kiểm tra builder request, metadata và danh mục. */
const { section, check } = require("../../lib/assert");
const { taoHopCat, napServer } = require("../../lib/load-gas");

async function chay(so) {
  section("FBM sync — builder và metadata");
  const builders = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: { getDocumentProperties: () => ({ getProperty: (key) => ({ FBM_SYNC_TEST_CUSTOMER_CODE: 'ALT00010' }[key] || '') }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Fingerprint.js', 'fbm_sync/reconcile/Conflict.js', 'fbm_sync/reconcile/Identity.js', 'fbm_sync/reconcile/Pull.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategorySync.js', 'fbm_sync/write/PushCandidates.js', 'fbm_sync/write/RequestBuilders.js');
  builders.FbmSync.stateRead = () => ({ session: { cookie: '461020379855cFHN_CRM_App', userId: '2037', customerAuthorized: 'auth-c', activityAuthorized: 'auth-a' } });
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  check(so, 'danh mục FBM tạo đúng companion có dấu chính', builders.FbmSync.categoryCompanionText('HNI', 'Hà Nội', true), 'HNI. Hà Nội #');

  const sheetGate = taoHopCat({ SpreadsheetApp: { flush: () => {} } });
  napServer(sheetGate, 'server/sheet/SheetColumnWriter.js');
  const writtenColumns = {};
  sheetGate.sheetGridEnsureRoom = () => {};
  sheetGate.columnIndex = (columnMap, code) => columnMap.map[code];
  const fakeSheet = { getRange: (row, col) => ({ setValues: (values) => { writtenColumns[col] = values; }, setNumberFormat: () => {} }) };
  const gateResult = sheetGate.sheetWriteColumns(fakeSheet, { map: { '@CAT_X': 2 }, headerRow: [], lastColumn: 2 }, 4, 2, { '@CAT_X': ['A', 'B'] }, { '@CAT_X': true });
  check(so, 'Category đi qua cổng ghi kho dùng chung', [gateResult.ok, gateResult.written, writtenColumns[2][1][0]], [true, 1, 'B']);
  check(so, 'category live thay companion giả DEV bằng mã thật', builders.FbmSync.mergeLiveCategoryCell('FBM-1. Hà Nội #', 'HNI', 'Hà Nội'), 'HNI. Hà Nội #');
  check(so, 'category live giữ mã khác nhưng chọn mã thật làm chính', builders.FbmSync.mergeLiveCategoryCell('CUS. Tùy chọn | FBM-2. Hệ giả #', 'HNI', 'Hà Nội'), 'CUS. Tùy chọn | HNI. Hà Nội #');
  const newCustomer = builders.FbmSync.customerCreateRequest({ companyName: 'Mới', province: 'Hà Nội', note: 'nội bộ' }, 'ALT99999', '', gate);
  check(so, 'mở form tạo Customer dùng type 0', builders.FbmSync.customerCreateOpenRequest().body.type, 0);
  check(so, 'ghi chú nội bộ không vào memvars FBM', newCustomer.body.memvars.some((item) => item.Name === 'ghi_chu'), false);
  check(so, 'SELECT Customer đổi sang mã FBM', newCustomer.body.memvars.filter((item) => item.Name === 'dc_lh_tinh')[0].NewValue, 'HNI');
  const activity = builders.FbmSync.activityCreateRequest({ id: 'ACT-9', customerFbmCode: 'ALT99999', taskType: 'Gọi', content: 'Nội dung' }, gate);
  check(so, 'Activity mới gắn dấu nhận diện', activity.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, 'Nội dung #SC-ACT-9');
  check(so, 'Activity không đẩy product nội bộ lên FBM', activity.body.memvars.filter((item) => item.Name === 'ma_sp')[0].NewValue, '');
  const linkedActivity = builders.FbmSync.linkActivityCustomers([{ customerId: 'ALT99999', fbmHash: 'old' }], [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }]);
  check(so, 'Activity FBM nối về mã Customer nội bộ', [linkedActivity.records[0].customerId, linkedActivity.orphaned], ['KH-1', 0]);
  const stoppedActivity = builders.FbmSync.linkActivityCustomers([{ customerId: 'ALT-STOP', fbmHash: 'old' }], [{ id: 'KH-STOP', fbmCustomerCode: 'ALT-STOP', allowFbmPush: 'Ngừng đồng bộ' }]);
  check(so, 'Customer ngừng đồng bộ chặn Activity con ở chiều pull', [stoppedActivity.records.length, stoppedActivity.blocked], [0, 1]);
  const activityWithParent = builders.FbmSync.activityRecord({ id: 7, details: 'Gọi', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi điện' }, gate, { maKh: 'ALT99999' });
  check(so, 'Activity giữ mã Customer cha khi grid không trả ma_kh', activityWithParent.customerFbmCode, 'ALT99999');
  const originalScriptSettings = builders.FbmSync.scriptSettings;
  builders.FbmSync.scriptSettings = () => Object.assign({}, originalScriptSettings(), { activitySince: '2026-01-01' });
  check(so, 'FBM_ACTIVITY_SINCE bo Activity lich su nhung giu Activity moi', [builders.FbmSync.activitySinceAllows({ workDate: new Date('2025-12-31T00:00:00Z') }, {}), builders.FbmSync.activitySinceAllows({ workDate: new Date('2026-01-02T00:00:00Z') }, {})], [false, true]);
  builders.FbmSync.scriptSettings = originalScriptSettings;
  check(so, 'Activity đọc dấu nhận diện để recovery', builders.FbmSync.activityMarkerId('Nội dung #SC-ACT-9'), 'ACT-9');
  check(so, 'Activity fingerprint không phụ thuộc khóa nối nội bộ', builders.FbmSync.hash(Object.assign({}, activityWithParent, { customerId: 'CUS-1' }), 'activity', gate), builders.FbmSync.hash(Object.assign({}, activityWithParent, { customerId: 'CUS-2' }), 'activity', gate));
  const form = builders.FbmSync.extractFormValues({ d: { Row: (function () { const row = []; row[3] = 'ALT00010'; row[4] = 'Tên cũ'; row[8] = '001'; row[11] = '0900'; return row; }()), Showing: "var _ticket = 'ticket-1';" } });
  check(so, 'Customer edit lấy OldValue từ Row', [form.ma_kh, form.ten_kh, form.dien_thoai], ['ALT00010', 'Tên cũ', '0900']);
  check(so, 'Activity edit lấy ticket từ script Showing', builders.FbmSync.extractFormValues({ d: { Row: [], Showing: "_ticket = \"ticket-2\";" } }).fileticket, 'ticket-2');
  const activityForm = builders.FbmSync.extractFormValues({ d: { controller: 'zccrAccountTask', Row: null, InternalValues: [{ name: 'end_time', Value: '01:00' }, { Name: 'owner', NewValue: 'Lê Tuấn Anh' }], FieldValues: [{ Name: 'fileticket', Value: 'ticket-3' }] } });
  check(so, 'Activity form Row null vẫn lấy end_time và owner', [activityForm.end_time, activityForm.owner], ['01:00', 'Lê Tuấn Anh']);
  check(so, 'Activity form lấy fileticket từ FieldValues', activityForm.fileticket, 'ticket-3');
  const objectForm = builders.FbmSync.extractFormValues({ d: { Controller: 'zccrAccountTask', Row: { END_TIME: '02:00', owner: 'Lê Tuấn Anh' } } });
  check(so, 'Activity form Row object không phụ thuộc hoa thường', [objectForm.end_time, objectForm.owner], ['02:00', 'Lê Tuấn Anh']);
  const explicitActivity = builders.FbmSync.extractFormValues({ d: { Row: (function () { const row = []; row[11] = '03:00'; return row; }()) } }, 'activity');
  check(so, 'Activity form Row thưa dùng entity từ cursor', explicitActivity.end_time, '03:00');
  check(so, 'Customer fingerprint có mã sản phẩm', builders.FbmSync.FINGERPRINT_FIELDS.customer.indexOf('ma_sp') >= 0, true);
  check(so, 'TMP- bị loại khỏi ứng viên push', builders.FbmSync.isTemporaryRecord('customer', { fbmCustomerCode: 'TMP-001' }), true);
  check(so, 'thiếu field Customer bị chặn trước request', builders.FbmSync.pushEligibilityErrors({ companyName: 'X' }, 'customer').length > 0, true);
  const blockedGate = { map: { '@CAT_CONG_VIEC\u001fGọi': 'CALL' }, valid: { '@CAT_CONG_VIEC': { Gọi: true } }, blocked: { '@CAT_CONG_VIEC\u001fCALL': 'Tên danh mục trên FBM khác Category.' } };
  check(so, 'Category lệch chỉ chặn record dùng đúng mã', builders.FbmSync.validatePushCategories({ taskType: 'Gọi' }, 'activity', blockedGate).length, 1);
  let metadataFailed = false;
  try { builders.FbmSync.rowsToRecords('customer', { d: { Rows: [[]] } }); } catch (error) { metadataFailed = true; }
  check(so, 'metadata Customer thiếu thì fail-closed', metadataFailed, true);
}

module.exports = { chay };
