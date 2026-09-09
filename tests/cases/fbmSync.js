/** Kiểm tra rủi ro cao của protocol, fingerprint và cursor khởi động FBM. */
const { section, check } = require('../lib/assert');
const { taoHopCat, napServer } = require('../lib/load-gas');

async function chay(so) {
  // Fixture chỉ chạy offline; không gửi request hoặc ghi dữ liệu FBM thật.
  section('FBM sync - protocol, fingerprint va ba chieu');
  const hop = taoHopCat({ FbmSync: {} });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Reconcile.js');

  const parsed = hop.FbmSync.protocol.parse('{"d":{"Bugs":{"FieldName":"x","Message":"bad"}}}');
  check(so, 'parse response FBM va doc Bugs', parsed.d.Bugs.Message, 'bad');
  check(so, 'Bugs khong bi coi la thanh cong', hop.FbmSync.protocol.assertSuccess(parsed).ok, false);
  check(so, 'response hong JSON bi chan', hop.FbmSync.protocol.assertSuccess('{not-json}').ok, false);
  const httpError = hop.FbmSync.protocol.parse({ ok: false, status: 401, body: '', transport: { payloadCookie: 'cookie-1' } });
  check(so, 'HTTP error van giu transport cookie', httpError._transport.payloadCookie, 'cookie-1');

  const fbm = { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Test', ma_so_thue: '001', ong_ba: 'A', dien_thoai: '0123', email: '', dc_lh: 'HN', dc_lh_tinh: 'HNI', nguon_dm: 'X', ghi_chu: 'a\r\nb' };
  const same = hop.FbmSync.customerRecord(fbm);
  const local = Object.assign({}, same, { id: 'CUS-1' });
  check(so, 'hash FBM va local dung cung khong gian', hop.FbmSync.hash(fbm, 'customer'), hop.FbmSync.hash(local, 'customer'));
  check(so, 'ba chieu khong doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, same, 'customer').unchanged, true);
  check(so, 'ba chieu bat conflict hai phia', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), Object.assign({}, same, { companyName: 'fbm' }), 'customer').conflict, true);
  check(so, 'chi Shin thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), same, 'customer').shinChanged, true);
  check(so, 'chi FBM thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, Object.assign({}, same, { companyName: 'fbm' }), 'customer').fbmChanged, true);
  check(so, 'parse malformed tra loi co cau truc', !!hop.FbmSync.protocol.parse('{').parseError, true);

  const builders = taoHopCat({
    FbmSync: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => ({ FBM_BASE_URL: 'https://fbm.test', FBM_COOKIE: '461020379855cFHN_CRM_App', FBM_AUTH_CUSTOMER: 'auth-c', FBM_AUTH_ACTIVITY: 'auth-a', FBM_SYNC_TEST_CUSTOMER_CODE: 'ALT00010' }[key] || '') }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/write/RequestBuilders.js');
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  const newCustomer = builders.FbmSync.customerCreateRequest({ companyName: 'Mới', province: 'Hà Nội', note: 'nội bộ' }, 'ALT99999', '', gate);
  check(so, 'mở form tạo Customer dùng type 0', builders.FbmSync.customerCreateOpenRequest().body.type, 0);
  check(so, 'ghi chú nội bộ không vào memvars FBM', newCustomer.body.memvars.some((item) => item.Name === 'ghi_chu'), false);
  check(so, 'SELECT Customer đổi sang mã FBM', newCustomer.body.memvars.filter((item) => item.Name === 'dc_lh_tinh')[0].NewValue, 'HNI');
  const activity = builders.FbmSync.activityCreateRequest({ id: 'ACT-9', customerFbmCode: 'ALT99999', taskType: 'Gọi', content: 'Nội dung' }, gate);
  check(so, 'Activity mới gắn dấu nhận diện', activity.body.memvars.filter((item) => item.Name === 'details')[0].NewValue, 'Nội dung #SC-ACT-9');
  const edit = builders.FbmSync.customerEditRequest({ fbmId: 'A1', companyName: 'Đổi tên' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Cũ', dien_thoai: '0123' }, gate);
  check(so, 'Customer sửa giữ OldValue field không đụng tới', edit.body.memvars.filter((item) => item.Name === 'dien_thoai')[0].NewValue, '0123');
  check(so, 'Customer grid gắn điều kiện phân quyền theo userId trong payload cookie', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[0].Name, "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1");
  check(so, 'Customer grid giới hạn đúng mã live test', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[1].Value, 'ALT00010');
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn', builders.FbmSync.validateLookupGate(lookupState, lookupGate).length, 0);

  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/reconcile/CategoryGate.js');
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', allowFbmPush: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  check(so, 'bản ghi đã đẩy chờ xác nhận không bị đẩy lặp', pushed.FbmSync.pushCandidates('customer').length, 0);

  const props = { data: {} };
  const propertyApi = { getProperty: (key) => props.data[key] || null, setProperty: (key, value) => { props.data[key] = String(value); } };
  const orchestration = taoHopCat({
    FbmSync: {},
    PropertiesService: { getDocumentProperties: () => propertyApi, getScriptProperties: () => propertyApi }
  });
  napServer(orchestration, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/report/Report.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/write/RequestBuilders.js', 'fbm_sync/transport/Transport.js');
  const started = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start bat dau bang bootstrap Customer', started.request.meta.kind, 'authorize');
  check(so, 'bootstrap dung viewPage false', started.request.body.viewPage, false);
  check(so, 'bootstrap khong gui authorized cu', started.request.body.authorized, null);
  const previewState = { metadata: {} };
  orchestration.FbmSync.previewRecords(previewState, 'customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM', previewState.metadata.preview.customers[0].code, 'ALT00010');

  const guards = taoHopCat({ FbmSync: {}, PropertiesService: { getScriptProperties: () => ({ getProperty: () => '' }), getDocumentProperties: () => ({ getProperty: () => null, setProperty: () => {} }) } });
  napServer(guards, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/transport/Transport.js');
  check(so, 'push config chan account rong', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'edit' }, { accountName: '' }), 'Thiếu FBM_ACCOUNT_NAME; chiều đẩy đã bị dừng.');
  check(so, 'push config chan prefix va do dai khi tao customer', guards.FbmSync.pushConfigErrors({ entity: 'customer', kind: 'create' }, { accountName: 'Lê Tuấn Anh', customerPrefix: '', customerCodeLength: 8 }), 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH; không tạo khách mới.');
  check(so, 'push config cho activity sua khi account co', guards.FbmSync.pushConfigErrors({ entity: 'activity', kind: 'edit' }, { accountName: 'Lê Tuấn Anh' }), '');
  check(so, 'ma customer tu sinh hop le', guards.FbmSync.validateAutoCustomerCode('ALT00010', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, true);
  check(so, 'ma customer tu sinh sai tien to', guards.FbmSync.validateAutoCustomerCode('KH000010', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, false);
  check(so, 'ma customer tu sinh sai do dai', guards.FbmSync.validateAutoCustomerCode('ALT10', { customerPrefix: 'ALT', customerCodeLength: 8 }).ok, false);

  const lockState = { locks: { 'customer:C-1': { owner: 'sync' }, 'customer:C-2': { owner: 'user' } } };
  guards.FbmSync.unlockRecord = () => ({ locks: { 'customer:C-2': { owner: 'user' }, 'activity:A-1': { owner: 'sync' } } });
  guards.FbmSync.releasePushLock(lockState, 'customer', 'C-1');
  check(so, 'nha khoa push giu khoa khac', Object.keys(lockState.locks).sort().join(','), 'activity:A-1,customer:C-2');

  const recordLocks = taoHopCat({ FbmSync: {}, PropertiesService: { getDocumentProperties: () => {
    const data = recordLocks._props || (recordLocks._props = {});
    return { getProperty: (key) => data[key] || null, setProperty: (key, value) => { data[key] = String(value); } };
  } } });
  napServer(recordLocks, 'fbm_sync/state/State.js', 'fbm_sync/state/RecordLocks.js');
  recordLocks.FbmSync.stateStart('', 'idle', 0);
  recordLocks.FbmSync.lockRecord('customer', 'C-1', 'h1', 'sync');
  check(so, 'save bi chan khi record dang bi sync khoa', recordLocks.FbmSync.saveAllowed('customer', 'C-1', 'h1').code, 'RECORD_BUSY');
  check(so, 'edit begin bi chan khi record dang bi sync khoa', recordLocks.FbmSync.editBegin('customer', 'C-1', 'h1').code, 'RECORD_BUSY');
  recordLocks.FbmSync.unlockRecord('customer', 'C-1');
  check(so, 'save duoc phep sau khi nha khoa sync', recordLocks.FbmSync.saveAllowed('customer', 'C-1', 'h1').ok, true);

  const pushProps = { data: {} };
  const pushPropertyApi = { getProperty: (key) => pushProps.data[key] || null, setProperty: (key, value) => { pushProps.data[key] = String(value); } };
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => pushPropertyApi, getScriptProperties: () => pushPropertyApi }, writeGateSave: () => ({ ok: true }) });
  napServer(push, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/RecordLocks.js', 'fbm_sync/transport/Transport.js');
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
  push.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'C-1', record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }];
  push.FbmSync.validatePushCategories = () => [];
  push.FbmSync.customerEditOpenRequest = () => ({ url: 'https://fbm.test/edit', body: {}, meta: { kind: 'customer_edit_open' } });
  const pushState = push.FbmSync.stateStart('', 'push', 0);
  pushState.metadata.categoryGate = {};
  pushState.cursor = { kind: 'push_scan', entity: 'customer', index: 0 };
  push.FbmSync.stateWrite(pushState);
  const pushRequest = push.FbmSync.nextPushRequest(pushState);
  const pushedState = push.FbmSync.stateRead();
  check(so, 'push status danh dau dang day truoc request', pushedState.locks['customer:C-1'].owner, 'sync');
  check(so, 'push request luu dung cursor cho phan hoi tiep', pushedState.cursor.kind, 'push_wait');
  check(so, 'push request co envelope protocol', pushRequest.meta.kind, 'customer_edit_open');
  pushedState.locks['customer:C-2'] = { owner: 'user', revision: 'h2' };
  push.FbmSync.stateWrite(pushedState);
  push.fbmSyncCancel();
  const cancelled = push.FbmSync.stateRead();
  check(so, 'dung phien nha khoa sync nhung giu khoa user', Object.keys(cancelled.locks).sort().join(','), 'customer:C-2');
}

module.exports = { chay };
