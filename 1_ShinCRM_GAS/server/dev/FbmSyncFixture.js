/** Chuẩn bị Sheet DEV cho live test ALT00010; không xóa dữ liệu hay gửi request FBM. */
function fbmPrepareAltTest() {
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(); }
  var cases = [
    'Đọc phiên Customer/Activity qua Extension; chỉ nhận ALT00010.',
    'Nhập ba danh mục live vào Category và bỏ qua mã companion giả.',
    'Kéo Customer về Customer, giữ nguyên ghi chú nội bộ.',
    'Kéo Activity về Activity và nối đúng Customer.id nội bộ.',
    'Không đổi dữ liệu: hash ba chiều phải giữ trạng thái đã đồng bộ.',
    'Đổi một trường Customer được phép: đẩy sửa lên FBM, không gửi ghi chú nội bộ.',
    'Tạo một Activity mới thuộc ALT00010 và kiểm tra dấu #SC-.',
    'Đổi đồng thời hai phía: ghi conflict, không ghi đè im lặng.',
    'Đang sửa trên Sidebar: bản ghi bị hoãn, không ghi đè bản nháp.',
    'Lỗi HTTP/Bugs/Extension: giải phóng khóa và ghi lỗi vào Log.',
    'Xác nhận không phát sinh request xóa.'
  ];
  if (typeof logEvent === 'function' && typeof flushLog === 'function') {
    logEvent({ source: 'fbm_sync', action: 'prepare_test', outcome: LOG_OK, entity: 'customer', recordId: 'ALT00010', reason: 'Chuẩn bị live test; chỉ giới hạn mã ALT00010.', detail: { cases: cases } });
    flushLog();
  }
  return { ok: true, customerCode: 'ALT00010', deleted: false, writesToFbm: 0, cases: cases };
}

var FBM_FAKE_DELETED_CODE = 'ALTFAKE01';
/** Dò luồng "mã bị xóa" (FBM-048): nhân bản khách ALT00010 thành dòng mang ID/mã FBM không tồn tại và tạm thu phạm vi live về mã giả. Chỉ đọc form FBM, không ghi FBM. */
function fbmSeedFakeDeletedCustomer() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var existing = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === FBM_FAKE_DELETED_CODE; })[0];
  var fake = {};
  Object.keys(source).forEach(function (key) { if (key !== 'id') { fake[key] = source[key]; } });
  fake.id = existing ? existing.id : '';
  fake.companyName = 'Khách giả mã FBM đã xóa';
  fake.fbmId = 'A999999999'; fake.fbmCustomerCode = FBM_FAKE_DELETED_CODE;
  fake.fbmHash = 'baseline-gia'; fake.syncStatus = FbmSync.SYNC_STATUS.synced; fake.recordStatus = 'active';
  var saved = FbmSync.sheetSave('customer', [fake], 'pull');
  PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_TEST_CUSTOMER_CODE', FBM_FAKE_DELETED_CODE);
  return { ok: true, recordIds: saved.recordIds, scope: FBM_FAKE_DELETED_CODE };
}
/** Kết thúc dò mã bị xóa: xóa mềm dòng giả (có ID FBM nên không xóa cứng được) và trả phạm vi live về mặc định ALT00010. */
function fbmEndFakeDeletedCustomer() {
  var fakes = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === FBM_FAKE_DELETED_CODE; });
  if (fakes.length) { FbmSync.sheetSave('customer', fakes.map(function (record) { return { id: record.id, recordStatus: 'deleted' }; }), 'pull'); }
  PropertiesService.getDocumentProperties().deleteProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  return { ok: true, softDeleted: fakes.map(function (record) { return record.id + ': ' + record.syncStatus; }), scope: FbmSync.scriptSettings().testCustomerCode };
}
/** Dò luồng xung đột (G10.7): sửa Website của ALT00010 bên ShinCRM và thay baseline bằng giá trị giả, nên lượt kéo thấy cả hai phía khác baseline và khác nhau. Không ghi FBM. */
function fbmSeedConflict() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var website = 'Website xung đột ShinCRM ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  FbmSync.sheetSave('customer', [{ id: source.id, website: website, fbmHash: 'baseline-gia-xung-dot', syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return { ok: true, id: source.id, website: website };
}
/** Dò ca "FBM đổi giữa chừng" (G10.7f): sau khi Sidebar đã mở xem xung đột, làm lệch hash FBM chốt lúc mở; bước Lưu kế tiếp phải thấy khác và trả về xem lại thay vì chốt. Không chạm FBM. */
function fbmTamperConflictOpenedHash() {
  var state = FbmSync.stateRead(), refresh = state.metadata && state.metadata.conflictRefresh;
  if (!refresh || refresh.stage !== 'review') { return { ok: false, reason: 'Chưa mở xem xung đột nào trên Sidebar.' }; }
  refresh.openedHash = 'fbm-doi-giua-chung';
  FbmSync.stateWrite(state);
  return { ok: true, id: refresh.id };
}
/** Dò đẩy Activity (G10.4): sửa nội dung Activity đang có của ALT00010 và nhân bản nó thành một Activity mới chưa có ID FBM, nên lượt đẩy kế tiếp có một lệnh sửa và một lệnh tạo. */
function fbmSeedActivityPush() {
  var customer = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!customer) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var source = FbmSync.readLocal('activity').filter(function (record) { return String(record.customerId || '') === String(customer.id) && String(record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'ALT00010 chưa có Activity mang ID FBM.' }; }
  var stamp = Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  var created = {};
  Object.keys(source).forEach(function (key) { if (['id', 'fbmId', 'fbmHash', 'syncStatus', 'syncedAt'].indexOf(key) < 0) { created[key] = source[key]; } });
  created.id = ''; created.content = 'Activity tạo từ ShinCRM ' + stamp; created.syncStatus = FbmSync.SYNC_STATUS.pending; created.recordStatus = 'active';
  FbmSync.sheetSave('activity', [{ id: source.id, content: 'Sửa từ ShinCRM ' + stamp, syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  var saved = FbmSync.sheetSave('activity', [created], 'pull');
  return { ok: true, edited: source.id, created: saved.recordIds };
}
/** Khách chủ dự án cho phép tạo thật trên FBM (G10.8c, 2026-10-07). */
var FBM_TEST_CREATE_CUSTOMER_ID = 'CUS-020061';
/** Dò trước khi tạo khách thật: đủ trường bắt buộc, quyền đẩy, danh mục và có lọt vào danh sách đẩy không. Chỉ đọc. */
function fbmProbeCreateCustomer() {
  var record = FbmSync.readLocal('customer').filter(function (item) { return String(item.id || '') === FBM_TEST_CREATE_CUSTOMER_ID; })[0];
  if (!record) { return { ok: false, reason: 'Không thấy ' + FBM_TEST_CREATE_CUSTOMER_ID + ' trên Sheet DEV.' }; }
  var gate = FbmSync.stateCategoryGate(FbmSync.stateRead());
  return {
    ok: true, id: record.id, companyName: record.companyName || '', fbmId: record.fbmId || '', fbmCustomerCode: record.fbmCustomerCode || '',
    syncStatus: record.syncStatus || '', recordStatus: record.recordStatus || '', fbmSyncPermission: record.fbmSyncPermission || '',
    permission: FbmSync.syncPermission(record, 'customer'), eligibilityErrors: FbmSync.pushEligibilityErrors(record, 'customer'),
    categoryErrors: FbmSync.validatePushCategories(record, 'customer', gate), canonical: FbmSync.canonical('customer', record, gate),
    scope: FbmSync.scriptSettings().testCustomerCode, candidates: FbmSync.pushCandidates('customer').map(function (item) { return item.kind + ':' + item.id; })
  };
}
/** Mở phạm vi ghi thử cho đúng khách được phép tạo thật; phạm vi theo mã FBM `ALT00010` giữ nguyên. */
function fbmAllowTestCreateCustomer() {
  PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_TEST_CUSTOMER_IDS', FBM_TEST_CREATE_CUSTOMER_ID);
  return fbmProbeCreateCustomer();
}
/** Đưa CUS-020061 về `chờ đối soát` để lượt hai chiều đẩy lại và Log ghi tên trường FBM không nhận. */
function fbmRequeueCreateCustomerPush() {
  FbmSync.sheetSave('customer', [{ id: FBM_TEST_CREATE_CUSTOMER_ID, syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return fbmProbeCreateCustomer();
}
/** Trả CUS-020061 về hàng đợi xung đột sau khi FBM-052 chuyển nhầm sang `không thấy bên FBM`; bản FBM vẫn còn, cần đọc lại để xem trường lệch. */
function fbmRequeueCreateCustomerConflict() {
  FbmSync.sheetSave('customer', [{ id: FBM_TEST_CREATE_CUSTOMER_ID, syncStatus: FbmSync.SYNC_STATUS.conflict }], 'pull');
  var state = FbmSync.stateRead();
  state.phase = 'conflict'; state.metadata.conflictCount = FbmSync.conflictQueue().length; state.message = 'Có xung đột chờ quyết.';
  FbmSync.stateWrite(state);
  return fbmProbeCreateCustomer();
}

/** Dò FBM-044 trên DEV: ghi tạm state hỏng, đọc status như Sidebar, đặt lại, rồi trả nguyên state cũ. Không gửi request FBM. */
function fbmProbeStuckState() {
  var props = FbmSync.props(), original = props.getProperty(FbmSync.STATE_KEY), out = {};
  try {
    props.setProperty(FbmSync.STATE_KEY, '{"phase":"push"');
    var stuck = fbmGetSyncStatus();
    out.stuck = { code: stuck.code, resetOffered: stuck.resetOffered, phase: stuck.phase, message: stuck.message };
    var reset = fbmResetSyncState();
    out.reset = { ok: reset.ok !== false, phase: reset.phase, message: reset.message, stateAfter: props.getProperty(FbmSync.STATE_KEY) };
  } finally {
    if (original === null) { props.deleteProperty(FbmSync.STATE_KEY); } else { props.setProperty(FbmSync.STATE_KEY, original); }
    out.restored = props.getProperty(FbmSync.STATE_KEY) === original;
  }
  return out;
}

/** Dò hash chờ xác nhận và khóa ghi (không chứa cookie hay mật khẩu) để điều tra lệch dữ liệu sau lệnh ghi FBM. */
function fbmProbePendingPushes() {
  return { pending: FbmSync.pendingPushesRead(), cursor: FbmSync.stateRead().cursor, conflictRefresh: FbmSync.stateRead().metadata.conflictRefresh };
}

/** Tạm thu phạm vi live (đọc và đẩy) về khách CUS-020061 đã tạo thật, để lượt hai chiều đọc được Activity của khách này (G12.5). Trả về ALT00010 bằng `fbmScopeDefaultCustomer`. */
function fbmScopeCreatedCustomer() {
  var record = FbmSync.readLocal('customer').filter(function (item) { return String(item.id || '') === FBM_TEST_CREATE_CUSTOMER_ID; })[0];
  var code = record ? String(record.fbmCustomerCode || '').trim() : '';
  if (!code) { return { ok: false, reason: FBM_TEST_CREATE_CUSTOMER_ID + ' chưa có mã FBM trên Sheet DEV.' }; }
  PropertiesService.getDocumentProperties().setProperty('FBM_SYNC_TEST_CUSTOMER_CODE', code);
  return { ok: true, scope: FbmSync.scriptSettings().testCustomerCode };
}
/** Trả phạm vi live về mặc định ALT00010. */
function fbmScopeDefaultCustomer() {
  PropertiesService.getDocumentProperties().deleteProperty('FBM_SYNC_TEST_CUSTOMER_CODE');
  return { ok: true, scope: FbmSync.scriptSettings().testCustomerCode };
}
