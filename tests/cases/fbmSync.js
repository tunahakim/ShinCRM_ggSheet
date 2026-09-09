/** Kiểm tra rủi ro cao của protocol, fingerprint và cursor khởi động FBM. */
const { section, check } = require('../lib/assert');
const { taoHopCat, napServer } = require('../lib/load-gas');

async function chay(so) {
  // Fixture chỉ chạy offline; không gửi request hoặc ghi dữ liệu FBM thật.
  section('FBM sync - protocol, fingerprint va ba chieu');
  const hop = taoHopCat({ FbmSync: {} });
  napServer(hop, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Reconcile.js');

  const parsed = hop.FbmSync.protocol.parse('{"d":{"Bugs":{"FieldName":"x","Message":"bad"}}}');
  check(so, 'body Login.aspx voi HTTP 200 bi nhan la het phien', hop.FbmSync.protocol.isSessionExpired({ ok: true, status: 200, body: '<html><form action="Login.aspx"><input name="username"></form></html>' }), true);
  check(so, 'loi nghiep vu khong retry tu dong', hop.FbmSync.protocol.classifyFailure({ ok: true, status: 200, body: '{"d":{"Bugs":{"Message":"Sai du lieu"}}}' }).retryable, false);
  check(so, 'loi HTTP co the retry', hop.FbmSync.protocol.classifyFailure({ ok: false, status: 503, body: '' }).retryable, true);
  check(so, 'SYNC_STATUS co du 11 gia tri hop dong', Object.keys(hop.FbmSync.SYNC_STATUS).length, 11);
  check(so, 'parse response FBM va doc Bugs', parsed.d.Bugs.Message, 'bad');
  check(so, 'Bugs khong bi coi la thanh cong', hop.FbmSync.protocol.assertSuccess(parsed).ok, false);
  check(so, 'response hong JSON bi chan', hop.FbmSync.protocol.assertSuccess('{not-json}').ok, false);
  const httpError = hop.FbmSync.protocol.parse({ ok: false, status: 401, body: '', transport: { payloadCookie: 'cookie-1' } });
  check(so, 'HTTP error van giu transport cookie', httpError._transport.payloadCookie, 'cookie-1');
  const httpBug = hop.FbmSync.protocol.parse({ ok: false, status: 500, body: '{"d":{"Bugs":{"Message":"Sai tham so"}}}' });
  check(so, 'HTTP error giu chi tiet Bugs tu FBM', httpBug.Bugs.Message, 'HTTP 500: Sai tham so');

  const fbm = { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Test', ma_so_thue: '001', ong_ba: 'A', dien_thoai: '0123', email: '', dc_lh: 'HN', dc_lh_tinh: 'HNI', nguon_dm: 'X', ghi_chu: 'a\r\nb' };
  const same = hop.FbmSync.customerRecord(fbm);
  const local = Object.assign({}, same, { id: 'CUS-1' });
  check(so, 'hash FBM va local dung cung khong gian', hop.FbmSync.hash(fbm, 'customer'), hop.FbmSync.hash(local, 'customer'));
  check(so, 'doi dinh danh FBM khong bi coi la doi noi dung Customer', hop.FbmSync.hash(Object.assign({}, fbm, { stt_rec_kh: 'A2', ma_kh: 'ALT00011' }), 'customer'), hop.FbmSync.hash(fbm, 'customer'));
  check(so, 'ba chieu khong doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, same, 'customer').unchanged, true);
  check(so, 'ba chieu bat conflict hai phia', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), Object.assign({}, same, { companyName: 'fbm' }), 'customer').conflict, true);
  check(so, 'chi Shin thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, Object.assign({}, local, { companyName: 'shin' }), same, 'customer').shinChanged, true);
  check(so, 'chi FBM thay doi', hop.FbmSync.threeWay({ hBASE: same.fbmHash }, local, Object.assign({}, same, { companyName: 'fbm' }), 'customer').fbmChanged, true);
  check(so, 'parse malformed tra loi co cau truc', !!hop.FbmSync.protocol.parse('{').parseError, true);

  const builders = taoHopCat({
    FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {},
    PropertiesService: { getScriptProperties: () => ({ getProperty: (key) => ({ FBM_BASE_URL: 'https://fbm.test', FBM_COOKIE: '461020379855cFHN_CRM_App', FBM_AUTH_CUSTOMER: 'auth-c', FBM_AUTH_ACTIVITY: 'auth-a', FBM_SYNC_TEST_CUSTOMER_CODE: 'ALT00010' }[key] || '') }) }
  });
  napServer(builders, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/reconcile/CategoryGate.js', 'fbm_sync/reconcile/CategorySync.js', 'fbm_sync/write/RequestBuilders.js');
  const gate = { map: { '@CAT_TINH_THANH\u001fHà Nội': 'HNI' }, valid: { '@CAT_TINH_THANH': { 'Hà Nội': true, HNI: true } } };
  check(so, 'danh mục FBM tạo đúng companion có dấu chính', builders.FbmSync.categoryCompanionText('HNI', 'Hà Nội', true), 'HNI. Hà Nội #');

  const sheetGate = taoHopCat({ SpreadsheetApp: { flush: () => {} } });
  napServer(sheetGate, 'server/gate/SheetWriteGate.js');
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
  let recoveryWrite;
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: '', customerId: 'KH-1', syncStatus: builders.FbmSync.SYNC_STATUS.pushing }];
  builders.writeGateSave = (request) => { recoveryWrite = request; return { ok: true }; };
  const recovered = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 77, ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung #SC-ACT-9' }, gate)], 'write');
  check(so, 'Activity marker recovery vá FBM ID không tạo dòng mới', [recovered.written, recoveryWrite.records[0].id, recoveryWrite.records[0].fbmId], [1, 'ACT-9', '77']);
  let markerConflictWrite, markerState = { metadata: { categoryGate: gate, seen: { customer: {}, activity: {} }, conflicts: [] }, locks: {}, counts: { conflict: 0 } };
  builders.FbmSync.stateRead = () => markerState;
  builders.FbmSync.stateWrite = (next) => { markerState = next; return next; };
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'KH-1', fbmCustomerCode: 'ALT99999' }] : [{ id: 'ACT-9', fbmId: 'OLD-FBM', customerId: 'KH-1', content: 'Nội dung cũ', taskType: 'Gọi', workDate: '/Date(1757386800000)/', fbmHash: 'old-hash' }];
  builders.writeGateSave = (request) => { markerConflictWrite = request; return { ok: true }; };
  const markerConflict = builders.FbmSync.pullWrite('activity', [builders.FbmSync.activityRecord({ id: 'NEW-FBM', ma_kh: 'ALT99999', end_date: '/Date(1757386800000)/', ten_cv: 'Gọi', details: 'Nội dung mới #SC-ACT-9' }, gate)]);
  check(so, 'Activity marker trỏ FBM ID khác tạo conflict và khóa', [markerConflict.conflicts, markerState.metadata.conflicts.length, markerConflictWrite.records[0].syncStatus, markerState.locks['activity:ACT-9'].owner], [1, 1, builders.FbmSync.SYNC_STATUS.conflict, 'sync']);
  const edit = builders.FbmSync.customerEditRequest({ fbmId: 'A1', companyName: 'Đổi tên' }, { stt_rec_kh: 'A1', ma_kh: 'ALT00010', ten_kh: 'Cũ', dien_thoai: '0123' }, gate);
  check(so, 'Customer sửa giữ OldValue field không đụng tới', edit.body.memvars.filter((item) => item.Name === 'dien_thoai')[0].NewValue, '0123');
  check(so, 'Customer grid gắn điều kiện phân quyền theo userId trong payload cookie', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[0].Name, "stt_rec_kh in (select stt_rec_kh from dbo.zcFastBusiness$Function$GetCustomerValidate('2037')) and 1");
  check(so, 'Customer grid giới hạn đúng mã live test', builders.FbmSync.customerGridRequest({ type: 0 }).body.externalKey[1].Value, 'ALT00010');
  const lookupState = { session: { lookups: { '@CAT_TINH_THANH': [['HNI', 'Hà Nội']], '@CAT_NGUON_KH': [['HNI', 'Nguồn khác']], '@CAT_CONG_VIEC': [['HNI', 'Công việc khác']], '@CAT_SAN_PHAM': [['HNI', 'Sản phẩm khác']] } } };
  const lookupGate = { namesBySource: { '@CAT_TINH_THANH': { HNI: 'Hà Nội' }, '@CAT_NGUON_KH': { HNI: 'Nguồn khác' }, '@CAT_CONG_VIEC': { HNI: 'Công việc khác' }, '@CAT_SAN_PHAM': { HNI: 'Sản phẩm khác' } } };
  check(so, 'lookup danh mục không lẫn mã trùng giữa các nguồn', builders.FbmSync.validateLookupGate(lookupState, lookupGate).length, 0);

  let identityWrite;
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmId: 'OLD-ID', fbmCustomerCode: 'ALT99999', companyName: 'Cũ' }] : [];
  builders.writeGateSave = (request) => { identityWrite = request; return { ok: true }; };
  const identityIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-ID', ma_kh: 'ALT99999', ten_kh: 'Mới' }, gate);
  const identityResult = builders.FbmSync.pullWrite('customer', [identityIncoming]);
  check(so, 'Customer lech stt_rec_kh van cap nhat dung dong theo ma_kh', [identityResult.written, identityWrite.records[0].id, identityWrite.records[0].fbmId], [1, 'CUS-1', 'NEW-ID']);

  let taxWrite;
  let taxState = { metadata: { categoryGate: gate } };
  builders.FbmSync.stateRead = () => taxState;
  builders.FbmSync.stateWrite = (next) => { taxState = next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST', taxNumber: '010.012 3456', fbmId: '', fbmCustomerCode: '', note: 'Nội bộ' }];
  builders.writeGateSave = (request) => { taxWrite = request; return { ok: true }; };
  const taxIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'MST-ID', ma_kh: 'ALT00011', ma_so_thue: '0100123456', ten_kh: 'FBM cùng MST' }, gate);
  const taxResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer cùng MST nối vào dòng ShinCRM chưa liên kết', [taxResult.written, taxWrite.records[0].id, taxWrite.records[0].fbmId, taxWrite.records[0].note], [1, 'CUS-MST', 'MST-ID', 'Nội bộ']);

  let ambiguousWrite = false;
  taxState = { metadata: { categoryGate: gate } };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-MST-1', taxNumber: '0100123456' }, { id: 'CUS-MST-2', taxNumber: '0100123456' }];
  builders.writeGateSave = () => { ambiguousWrite = true; return { ok: true }; };
  const ambiguousResult = builders.FbmSync.pullWrite('customer', [taxIncoming]);
  check(so, 'Customer trùng MST nhiều dòng thì fail-closed không tạo bản ghi', [ambiguousResult.written, ambiguousResult.skipped, ambiguousWrite, taxState.metadata.identityBlocks[0].reason], [0, 1, false, 'duplicate_tax_number']);
  let baselineWrite;
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.readLocal = () => [{ id: 'CUS-BASE', fbmId: 'FBM-BASE', companyName: 'Baseline' }];
  builders.writeGateSave = (request) => { baselineWrite = request; return { ok: true }; };
  const baselineResult = builders.FbmSync.recalculateBaseline('customer');
  check(so, 'tinh lai baseline chi ghi cot sync noi bo', [baselineResult.ok, baselineResult.written, baselineWrite.records[0].fbmHash !== '', baselineWrite.source], [true, 1, true, 'pull']);
  let newPullWrite, dirtyIds = [];
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate } });
  builders.FbmSync.readLocal = () => [];
  builders.dirtyStateMarkRecords = (ids) => { dirtyIds = ids; };
  builders.writeGateSave = (request) => { newPullWrite = request; return { ok: true, fields: ['id'], rows: [['CUS-NEW']] }; };
  const newPullResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'NEW-C', ma_kh: 'ALT00012', ten_kh: 'Khách mới', ma_so_thue: '001' }, gate)]);
  check(so, 'Customer pull moi ghi ca dinh danh baseline va dirty marker', [newPullResult.written, newPullWrite.source, newPullWrite.schemas.length, newPullWrite.records[0].fbmId, newPullWrite.records[0].fbmHash !== '', dirtyIds[0]], [1, 'pull', 2, 'NEW-C', true, 'CUS-NEW']);
  let reconcileWrite;
  const reconcileIncoming = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'Gốc' }, gate);
  const reconcileLocal = Object.assign({}, reconcileIncoming, { id: 'CUS-REC', syncStatus: builders.FbmSync.SYNC_STATUS.synced });
  reconcileLocal.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate }, locks: {} });
  builders.FbmSync.stateWrite = () => {};
  builders.FbmSync.readLocal = () => [reconcileLocal];
  builders.writeGateSave = (request) => { reconcileWrite = request; return { ok: true }; };
  const unchangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'ba hash khong doi khong ghi noi dung', [unchangedResult.written, reconcileWrite], [0, undefined]);
  builders.FbmSync.readLocal = () => [Object.assign({}, reconcileLocal, { fbmHash: '' })];
  const healedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'baseline rong tu lanh chi ghi hash', [healedResult.written, reconcileWrite.records[0].fbmHash !== '', reconcileWrite.records[0].companyName], [0, true, undefined]);
  const fbmChanged = builders.FbmSync.customerRecord({ stt_rec_kh: 'REC-1', ma_kh: 'ALT00013', ten_kh: 'FBM đổi' }, gate);
  builders.FbmSync.readLocal = () => [reconcileLocal];
  const fbmChangedResult = builders.FbmSync.pullWrite('customer', [fbmChanged]);
  check(so, 'chi FBM doi thi pull noi dung', [fbmChangedResult.written, reconcileWrite.records[0].companyName], [1, 'FBM đổi']);
  const shinChanged = Object.assign({}, reconcileLocal, { companyName: 'Shin đổi' });
  shinChanged.fbmHash = builders.FbmSync.hash(reconcileIncoming, 'customer', gate);
  builders.FbmSync.readLocal = () => [shinChanged];
  const shinChangedResult = builders.FbmSync.pullWrite('customer', [reconcileIncoming]);
  check(so, 'chi ShinCRM doi thi khong pull de', [shinChangedResult.written, reconcileWrite.records[0].syncStatus], [0, builders.FbmSync.SYNC_STATUS.pending]);
  let conflictState = { metadata: { categoryGate: gate, conflicts: [] }, counts: { conflict: 0 } }, conflictWrite, conflictLog = [];
  builders.LOG_CONFLICT = 'conflict';
  builders.logEvent = (event) => { conflictLog.push(event); };
  builders.FbmSync.stateRead = () => conflictState;
  builders.FbmSync.stateWrite = (next) => { conflictState = next; return next; };
  builders.FbmSync.readLocal = () => [{ id: 'CUS-2', fbmId: 'C-2', fbmCustomerCode: 'ALT99999', companyName: 'Shin', fbmHash: builders.FbmSync.hash({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'Base' }, 'customer', gate) }];
  builders.writeGateSave = (request) => { conflictWrite = request; return { ok: true }; };
  const conflictResult = builders.FbmSync.pullWrite('customer', [builders.FbmSync.customerRecord({ stt_rec_kh: 'C-2', ma_kh: 'ALT99999', ten_kh: 'FBM' }, gate)]);
  check(so, 'conflict luu diff va khong ghi noi dung', [conflictResult.conflicts, conflictState.metadata.conflicts.length, conflictWrite.records[0].syncStatus], [1, 1, builders.FbmSync.SYNC_STATUS.conflict]);
  check(so, 'conflict ghi log diff co cau truc', [conflictLog.length, conflictLog[0].action, conflictLog[0].detail.fields.length > 0], [1, 'conflict', true]);
  check(so, 'conflict tao khoa sync', conflictState.locks['customer:CUS-2'].owner, 'sync');
  const resolved = builders.FbmSync.resolveConflict('customer', 'CUS-2', 'fbm');
  check(so, 'resolve conflict theo FBM cap nhat baseline va xoa hang doi', [resolved.ok, conflictState.metadata.conflicts.length, conflictWrite.records[0].fbmHash !== '', conflictState.locks['customer:CUS-2']], [true, 0, true, undefined]);

  const edges = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(edges, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/reconcile/CategoryGate.js');
  check(so, 'normalize placeholder 1999 thanh rong', edges.FbmSync.normalize('/Date(915123600000)/'), '');
  check(so, 'normalize Date co offset chi dung timestamp chinh', edges.FbmSync.normalize('/Date(1757386800000+0700)/'), edges.FbmSync.normalize('/Date(1757386800000)/'));
  check(so, 'normalize Date khong hop le khong nem loi', edges.FbmSync.normalize(new Date(NaN)), '');
  check(so, 'Activity id 0 khong lam thay fingerprint', edges.FbmSync.hash({ id: 0, ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'), edges.FbmSync.hash({ id: '', ma_cv: 'CALL', details: 'Gọi', end_date: '/Date(1757386800000)/' }, 'activity'));

  let lockedWrite = false;
  const lockedState = { mode: 'write', metadata: { categoryGate: {}, seen: { customer: {}, activity: {} } }, locks: { 'customer:C-LOCK': { owner: 'user', revision: 'r1' } } };
  edges.FbmSync.stateRead = () => lockedState;
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.validateIncomingCategories = () => [];
  edges.FbmSync.readLocal = () => [{ id: 'C-LOCK', fbmId: 'FBM-LOCK', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', fbmHash: '' }];
  edges.writeGateSave = () => { lockedWrite = true; return { ok: true }; };
  const lockedPull = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord({ stt_rec_kh: 'FBM-LOCK', ma_kh: 'ALT00010', ten_kh: 'Mới' }, {})]);
  check(so, 'pull khong ghi record dang bi user khoa', [lockedPull.written, lockedPull.skipped, lockedWrite], [0, 1, false]);

  let missingWrite = false;
  const missingState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: { 'customer:C-MISSING': { owner: 'user' } } };
  edges.FbmSync.stateRead = () => missingState;
  edges.FbmSync.readLocal = () => [{ id: 'C-MISSING', fbmId: 'FBM-MISSING', recordStatus: 'active' }];
  edges.writeGateSave = () => { missingWrite = true; return { ok: true }; };
  check(so, 'missing scan bo qua record dang user sua', [edges.FbmSync.markMissingAfterFullScan('customer', missingState).written, missingWrite], [0, false]);
  let missingBatch;
  const fullScanState = { mode: 'write', metadata: { seen: { customer: {} } }, locks: {} };
  edges.FbmSync.scriptSettings = () => ({ testCustomerCode: '' });
  edges.FbmSync.stateRead = () => fullScanState;
  edges.FbmSync.readLocal = () => [{ id: 'C-MISSING', fbmId: 'FBM-MISSING', recordStatus: 'active' }, { id: 'C-TOMBSTONE', fbmId: 'FBM-TOMBSTONE', recordStatus: 'deleted' }];
  edges.writeGateSave = (request) => { missingBatch = request; return { ok: true }; };
  const missingResult = edges.FbmSync.markMissingAfterFullScan('customer', fullScanState);
  check(so, 'Customer vang chi danh dau missing va bo qua tombstone', [missingResult.written, missingBatch.records.length, missingBatch.records[0].id, missingBatch.records[0].syncStatus], [1, 1, 'C-MISSING', edges.FbmSync.SYNC_STATUS.missing]);
  let activityPullWrite;
  edges.FbmSync.stateRead = () => ({ metadata: { categoryGate: gate, seen: { customer: {}, activity: {} } }, locks: {} });
  edges.FbmSync.stateWrite = () => {};
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  edges.writeGateSave = (request) => { activityPullWrite = request; return { ok: true }; };
  const newActivity = edges.FbmSync.activityRecord({ id: 88, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Nội dung', end_date: '/Date(1757386800000)/' }, gate);
  const activityPull = edges.FbmSync.pullWrite('activity', [newActivity]);
  check(so, 'Activity pull moi noi dung vao Customer noi bo', [activityPull.written, activityPullWrite.records[0].customerId, activityPullWrite.records[0].fbmId], [1, 'CUS-ACT', 88]);
  edges.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-ACT', fbmCustomerCode: 'ALT00014' }] : [];
  const orphanActivity = edges.FbmSync.activityRecord({ id: 89, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Mồ côi #SC-ACT-UNKNOWN', end_date: '/Date(1757386800000)/' }, gate);
  const orphanActivityResult = edges.FbmSync.pullWrite('activity', [orphanActivity]);
  check(so, 'Activity marker mo coi khong tao dong moi', orphanActivityResult.written, 0);
  const invalidActivity = edges.FbmSync.activityRecord({ id: 90, ma_kh: 'ALT00014', ten_cv: 'Gọi', details: 'Thiếu ngày', end_date: '' }, gate);
  const invalidActivityResult = edges.FbmSync.pullWrite('activity', [invalidActivity]);
  check(so, 'Activity thieu ngay bi chan an toan', invalidActivityResult.written, 0);

  const failedRecord = { id: 'C-FAIL', fbmId: 'FBM-FAIL', fbmCustomerCode: 'ALT00010', companyName: 'Cũ', allowFbmPush: 'Cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.error };
  const failedHash = edges.FbmSync.hash(failedRecord, 'customer', {});
  const failedState = { metadata: { categoryGate: {}, pushFailures: { 'customer:C-FAIL': failedHash } } };
  edges.FbmSync.stateRead = () => failedState;
  edges.FbmSync.readLocal = () => [failedRecord];
  check(so, 'push loi cung hash khong bi lap lai', edges.FbmSync.pushCandidates('customer').length, 0);
  edges.FbmSync.readLocal = () => [Object.assign({}, failedRecord, { companyName: 'Đã sửa' })];
  check(so, 'push loi duoc phep thu lai khi hash doi', edges.FbmSync.pushCandidates('customer').length, 1);

  let notAppliedWrite;
  const pushedRecord = { id: 'C-PUSHED', fbmId: 'FBM-PUSHED', fbmCustomerCode: 'ALT00010', companyName: 'Mới ở Shin', allowFbmPush: 'Chưa cho phép', syncStatus: edges.FbmSync.SYNC_STATUS.pushed };
  const oldFbm = { stt_rec_kh: 'FBM-PUSHED', ma_kh: 'ALT00010', ten_kh: 'Cũ ở FBM' };
  pushedRecord.fbmHash = edges.FbmSync.hash(oldFbm, 'customer', {});
  const notAppliedState = { metadata: { categoryGate: {}, seen: { customer: {}, activity: {} } }, locks: {} };
  edges.FbmSync.stateRead = () => notAppliedState;
  edges.FbmSync.stateWrite = (next) => { Object.assign(notAppliedState, next); return notAppliedState; };
  edges.FbmSync.readLocal = () => [pushedRecord];
  edges.writeGateSave = (request) => { notAppliedWrite = request; return { ok: true }; };
  const notApplied = edges.FbmSync.pullWrite('customer', [edges.FbmSync.customerRecord(oldFbm, {})]);
  check(so, 'FBM khong doi sau push thanh notApplied va khoa record', [notApplied.skipped, notAppliedWrite.records[0].syncStatus, notAppliedState.locks['customer:C-PUSHED'].reason], [1, edges.FbmSync.SYNC_STATUS.notApplied, 'not_applied']);

  const pushed = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {} });
  napServer(pushed, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/reconcile/CategoryGate.js');
  pushed.FbmSync.readLocal = () => [{ id: 'CUS-1', fbmId: 'A1', fbmCustomerCode: 'ALT1', companyName: 'X', allowFbmPush: 'Cho phép', syncStatus: pushed.FbmSync.SYNC_STATUS.pushed, fbmHash: '' }];
  check(so, 'bản ghi đã đẩy chờ xác nhận không bị đẩy lặp', pushed.FbmSync.pushCandidates('customer').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Ngừng đồng bộ' }]
    : [{ id: 'ACT-STOP', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer ngừng đồng bộ chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: 'FBM-PARENT', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Chưa cho phép' }]
    : [{ id: 'ACT-NO-PERM', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer chưa cho phép chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);
  pushed.FbmSync.readLocal = (entity) => entity === 'customer'
    ? [{ id: 'CUS-PARENT', fbmId: '', fbmCustomerCode: 'ALT-PARENT', allowFbmPush: 'Cho phép' }]
    : [{ id: 'ACT-NO-ID', customerId: 'CUS-PARENT', allowFbmPush: 'Cho phép', taskType: 'Gọi', content: 'Nội dung', workDate: '2026-09-09' }];
  check(so, 'Customer thiếu FBM ID chặn Activity push', pushed.FbmSync.pushCandidates('activity').length, 0);

  pushed.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-KEEP', fbmId: 'FBM-1' }] : [];
  check(so, 'beforeHardDelete chan xoa cung record co FBM ID', pushed.beforeHardDelete('customer', 'CUS-KEEP').allowed, false);
  check(so, 'beforeHardDelete cho xoa cung record chua co FBM ID', pushed.beforeHardDelete('customer', 'CUS-MISSING').allowed, true);

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
  const retrySlice = orchestration.FbmSync.continue({ ok: false, status: 503, body: '' });
  check(so, 'loi doc tam thoi duoc retry co gioi han', [retrySlice.ok, retrySlice.retrying, retrySlice.request.meta.kind, orchestration.FbmSync.stateRead().retryCount], [true, true, 'authorize', 1]);
  const resumed = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'start thu lai tiep tuc dung authorize Customer ban dau', [resumed.ok, resumed.resumed, resumed.request.meta.entity], [true, true, 'customer']);
  const staleState = JSON.parse(props.data[orchestration.FbmSync.STATE_KEY]);
  staleState.runId = 'old-run'; staleState.updatedAt = Date.now() - 120000;
  props.data[orchestration.FbmSync.STATE_KEY] = JSON.stringify(staleState);
  const restarted = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'authorize cu qua mot phut duoc thay bang phien moi', [restarted.ok, restarted.resumed, orchestration.FbmSync.stateRead().runId === 'old-run'], [true, undefined, false]);
  check(so, 'lookup san pham dung controller FBM that', orchestration.FbmSync.SYNC_LOOKUPS.filter((item) => item.key === '@CAT_SAN_PHAM')[0].controller, 'crdmsp');
  const previewState = { metadata: {} };
  orchestration.FbmSync.previewRecords(previewState, 'customer', [{ fbmCustomerCode: 'ALT00010', companyName: 'Test', fbmId: 'A1' }]);
  check(so, 'preview luu ma va ten Customer doc tu FBM', previewState.metadata.preview.customers[0].code, 'ALT00010');
  const pullStatus = orchestration.FbmSync.stateRead();
  pullStatus.phase = 'pull_customer'; pullStatus.entity = 'customer'; pullStatus.mode = 'read'; orchestration.FbmSync.stateWrite(pullStatus);
  const pullView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu FBM ve ShinCRM', pullView.direction, 'FBM → ShinCRM');
  check(so, 'status noi ro dang dong bo khach hang', pullView.entityLabel, 'Khách hàng');
  const resumeState = orchestration.FbmSync.stateRead();
  resumeState.runId = 'resume-run'; resumeState.phase = 'pull_customer'; resumeState.cursor = { kind: 'customer_grid', type: 1, pageIndex: 2, pageValue: ['d', 't', 'x'], count: 2000 };
  orchestration.FbmSync.stateWrite(resumeState);
  const resumedGrid = orchestration.FbmSync.start({ mode: 'read' });
  check(so, 'Sidebar mo lai tiep tuc cursor doc Customer dang do', [resumedGrid.ok, resumedGrid.resumed, resumedGrid.request.meta.kind, resumedGrid.request.body.type], [true, true, 'grid', 1]);
  const pushStatus = orchestration.FbmSync.stateRead();
  pushStatus.phase = 'push'; pushStatus.entity = 'activity'; pushStatus.mode = 'write'; orchestration.FbmSync.stateWrite(pushStatus);
  const pushView = orchestration.FbmSync.statusView();
  check(so, 'status noi ro chieu ShinCRM sang FBM', pushView.direction, 'ShinCRM → FBM');
  check(so, 'status noi ro dang dong bo giao dich', pushView.entityLabel, 'Giao dịch');

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
  recordLocks.FbmSync.lockRecord('customer', 'C-2', 'h2', 'user');
  recordLocks.FbmSync.stateStart('', 'checking_session', 0);
  check(so, 'phien sync moi giu khoa cua form nguoi dung', recordLocks.FbmSync.stateRead().locks['customer:C-2'].owner, 'user');

  const pushProps = { data: {} };
  const pushPropertyApi = { getProperty: (key) => pushProps.data[key] || null, setProperty: (key, value) => { pushProps.data[key] = String(value); } };
  const push = taoHopCat({ FbmSync: {}, DATA_SCHEMA: {}, SYNC_SCHEMA: {}, PropertiesService: { getDocumentProperties: () => pushPropertyApi, getScriptProperties: () => pushPropertyApi }, writeGateSave: () => ({ ok: true }) });
  napServer(push, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/protocol/Protocol.js', 'fbm_sync/state/State.js', 'fbm_sync/state/RecordLocks.js', 'fbm_sync/read/GridRead.js', 'fbm_sync/reconcile/Reconcile.js', 'fbm_sync/report/Report.js', 'fbm_sync/transport/Transport.js');
  push.FbmSync.scriptSettings = () => ({ accountName: 'Lê Tuấn Anh', customerPrefix: 'ALT', customerCodeLength: 8 });
  push.FbmSync.pushCandidates = () => [{ kind: 'edit', id: 'C-1', record: { id: 'C-1', fbmId: 'A-1', fbmHash: 'h1' } }];
  push.FbmSync.validatePushCategories = () => [];
  push.FbmSync.pushEligibilityErrors = () => [];
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
  let pushPatch;
  push.writeGateSave = (request) => { pushPatch = request.records[0]; return { ok: true }; };
  push.FbmSync.markPushResult({ entity: 'customer', record: { id: 'C-OLD', fbmId: 'A-OLD', fbmCustomerCode: 'ALT00010', fbmHash: 'BASE' } }, { d: { InternalValues: [{ Name: 'stt_rec_kh', Value: 'A-OLD' }, { Name: 'ma_kh', Value: 'ALT00010' }] } }, 'customer_edit_save');
  check(so, 'push thanh cong giu baseline cu cho ky xac nhan', pushPatch.fbmHash, 'BASE');
  const errorState = { counts: { error: 0 }, metadata: { categoryGate: {}, pushFailures: {} }, locks: {} };
  push.FbmSync.unlockRecord = () => ({ locks: {} });
  push.FbmSync.markPushError(errorState, { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', companyName: 'Lỗi' } }, 'FBM từ chối');
  check(so, 'push loi luu hash local de chan lap lai', errorState.metadata.pushFailures['customer:C-ERR'], push.FbmSync.hash({ id: 'C-ERR', companyName: 'Lỗi' }, 'customer', {}));
  push.FbmSync.pushCandidates = () => [
    { kind: 'edit', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } },
    { kind: 'edit', id: 'C-NEXT', record: { id: 'C-NEXT', fbmId: 'A-NEXT', fbmHash: 'h-next' } }
  ];
  const pushErrorProps = push.FbmSync.stateStart('', 'push', 0);
  pushErrorProps.metadata.categoryGate = {};
  pushErrorProps.cursor = { kind: 'push_wait', entity: 'customer', index: 0, operation: 'customer_edit_save', candidate: { entity: 'customer', id: 'C-ERR', record: { id: 'C-ERR', fbmId: 'A-ERR', fbmHash: 'h-err' } } };
  push.FbmSync.stateWrite(pushErrorProps);
  const continuedPush = push.FbmSync.continueAfterPushError(push.FbmSync.stateRead(), push.FbmSync.stateRead().cursor, 'Owner sai');
  check(so, 'push loi mot record van tiep tuc record ke', [continuedPush.continued, continuedPush.request.meta.kind, push.FbmSync.stateRead().cursor.index, push.FbmSync.stateRead().counts.error], [true, 'customer_edit_open', 1, 1]);
  pushedState.locks['customer:C-2'] = { owner: 'user', revision: 'h2' };
  push.FbmSync.stateWrite(pushedState);
  push.fbmSyncCancel();
  const cancelled = push.FbmSync.stateRead();
  check(so, 'dung phien nha khoa sync nhung giu khoa user', Object.keys(cancelled.locks).sort().join(','), 'customer:C-2');

  const audit = taoHopCat({ FbmSync: {}, LOG_OK: 'ok', LOG_ERROR: 'error', FbmSyncLog: [] });
  napServer(audit, 'fbm_sync/schema/FbmFields.js', 'fbm_sync/report/Probe.js');
  audit.FbmSync.stateRead = () => ({ mode: 'read', phase: 'done', runId: 'run-1' });
  audit.FbmSync.readLocal = (entity) => entity === 'customer' ? [{ id: 'CUS-1', fbmCustomerCode: 'ALT00010', fbmId: 'A1' }] : [{ id: 'ACT-1', fbmId: '7', customerId: 'CUS-1' }];
  audit.logEvent = (event) => audit.FbmSyncLog.push(event);
  audit.flushLog = () => {};
  const auditResult = audit.fbmAuditAltState();
  check(so, 'nghiệm thu ALT00010 có case PASS', auditResult.ok, true);
  check(so, 'nghiệm thu ghi từng case vào Log', audit.FbmSyncLog.length >= 6, true);
}

module.exports = { chay };
