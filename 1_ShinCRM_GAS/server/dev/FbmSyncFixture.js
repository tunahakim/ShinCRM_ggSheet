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

/** Chọn ngầm định Xác thực khi kéo từ FBM (ưu tiên giá trị "chưa xác thực" của danh mục DEV) qua đúng cổng lưu cài đặt, để chiều lấy trên DEV không bị preflight chặn. */
function fbmDevSetVerifyStatusDefault() {
  var values = categoryReadAll().categories[DATA_SCHEMA.customer.verifyStatus.source] || [];
  var value = values.filter(function (item) { return String(item).normalize('NFC').toLowerCase().indexOf('chưa'.normalize('NFC')) === 0; })[0] || values[0] || '';
  if (!value) { throw new Error('Category chưa có giá trị Xác thực nào để chọn làm ngầm định.'); }
  var saved = settingsSave('defaults_fbm_pull', { values: { customer: { verifyStatus: value } } });
  if (!saved.ok) { throw new Error('Không lưu được ngầm định kéo FBM: ' + saved.problems.map(function (p) { return p.reason; }).join(' ')); }
  return { ok: true, value: saved.values.values.customer.verifyStatus };
}

/** Đặt ngưỡng chấp thuận đẩy về mặc định của code qua đúng cửa lưu cài đặt đồng bộ mà Sidebar dùng. */
function fbmDevResetApprovalThreshold() {
  var saved = FbmSync.syncSettingsSave({ approvalThreshold: FbmSync.SYNC_SETTINGS_DEFAULT.approvalThreshold });
  if (!saved.ok) { throw new Error(saved.message); }
  return { approvalThreshold: saved.settings.approvalThreshold };
}

var FBM_FAKE_DELETED_CODE = 'ALTFAKE01';
// Phạm vi live chủ dự án cho phép trên DEV: khách FBM ALT00010 và khách đã tạo thật CUS-020061.
var FBM_DEV_DEFAULT_TEST_CODES = ['ALT00010', 'CUS-020061'];
/** Đặt phạm vi khách chỉ định qua đúng cửa lưu cài đặt mà Sidebar dùng, để dò DEV không có đường tắt riêng. */
function fbmDevSetTestCodes(codes) {
  var saved = FbmSync.syncSettingsSave({ scopeLimited: true, scopeCodes: codes });
  if (!saved.ok) { throw new Error(saved.message); }
  return saved.settings.scopeCodes;
}
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
  var saved = fbmFixtureSave('customer', [fake], 'pull');
  fbmDevSetTestCodes([FBM_FAKE_DELETED_CODE]);
  return { ok: true, recordIds: saved.recordIds, scope: FBM_FAKE_DELETED_CODE };
}
/** Kết thúc dò mã bị xóa: xóa mềm dòng giả (có ID FBM nên không xóa cứng được) và trả phạm vi live về mặc định ALT00010. */
function fbmEndFakeDeletedCustomer() {
  var fakes = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === FBM_FAKE_DELETED_CODE; });
  if (fakes.length) { fbmFixtureSave('customer', fakes.map(function (record) { return { id: record.id, recordStatus: 'deleted' }; }), 'pull'); }
  fbmDevSetTestCodes(FBM_DEV_DEFAULT_TEST_CODES);
  return { ok: true, softDeleted: fakes.map(function (record) { return record.id + ': ' + record.syncStatus; }), scope: FbmSync.syncSettingsRead().scopeCodes };
}
/** Dò luồng xung đột (G10.7): sửa Website của ALT00010 bên ShinCRM và thay baseline bằng giá trị giả, nên lượt kéo thấy cả hai phía khác baseline và khác nhau. Không ghi FBM. */
function fbmSeedConflict() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var website = 'Website xung đột ShinCRM ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  fbmFixtureSave('customer', [{ id: source.id, website: website, fbmHash: 'baseline-gia-xung-dot', syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return { ok: true, id: source.id, website: website };
}
/** Dò so trước khi đẩy với Activity: sửa nội dung một Activity mang ID FBM của ALT00010 và thay baseline bằng giá trị giả, nên bước mở form của lượt "Chỉ đẩy" thấy FBM khác baseline và khác ShinCRM, không được gửi lệnh lưu. Không ghi FBM. */
function fbmSeedActivityConflict() {
  var customer = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!customer) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var source = FbmSync.readLocal('activity').filter(function (record) { return String(record.customerId || '') === String(customer.id) && String(record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'ALT00010 chưa có Activity mang ID FBM.' }; }
  var content = 'Nội dung xung đột ShinCRM ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  fbmFixtureSave('activity', [{ id: source.id, content: content, fbmHash: 'baseline-gia-xung-dot', syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return { ok: true, id: source.id, fbmId: source.fbmId, oldContent: source.content, content: content };
}
/** Nghiệm thu "khách đang xung đột chờ quyết vẫn lưu được và xóa được từ Sidebar": tạo một khách thử quyền "Chỉ lấy từ FBM" (không bao giờ đi lên FBM) rồi đặt nó sang "xung đột chờ quyết". Sidebar không xóa khách, nên dọn bằng `fbmDevClearConflict`. */
var FBM_DEV_CONFLICT_NAME = 'THỬ XUNG ĐỘT — xóa được';
function fbmDevMarkConflict() {
  var danhMuc = categoryReadAll().categories;
  var them = saveRecord('customer', { id: '', companyName: FBM_DEV_CONFLICT_NAME, taxNumber: '0101243150', phone: '0912345678', leadSource: danhMuc[DATA_SCHEMA.customer.leadSource.source][0] || '', verifyStatus: danhMuc[DATA_SCHEMA.customer.verifyStatus.source][0] || '', fbmSyncPermission: 'Chỉ lấy từ FBM' });
  if (!them.ok) { return { ok: false, reason: 'Không tạo được khách thử', invalid: them.invalid }; }
  var id = them.rows[0][them.fields.indexOf('id')];
  fbmFixtureSave('customer', [{ id: id, syncStatus: FbmSync.SYNC_STATUS.conflict }], 'pull');
  return { ok: true, id: id };
}
/** Báo lại khách thử của `fbmDevMarkConflict` (trạng thái, Website, giao dịch còn lại) để nghiệm thu, rồi xóa khách và giao dịch còn sót. */
function fbmDevClearConflict() {
  var khach = FbmSync.readLocal('customer').filter(function (record) { return record.companyName === FBM_DEV_CONFLICT_NAME; });
  var ids = khach.map(function (record) { return record.id; });
  var giaoDich = FbmSync.readLocal('activity').filter(function (record) { return ids.indexOf(record.customerId) >= 0; });
  var seen = khach.map(function (record) { return { id: record.id, syncStatus: record.syncStatus, website: record.website }; });
  var xoaGd = giaoDich.length ? deleteRecords('activity', giaoDich.map(function (record) { return record.id; })) : { ok: true };
  var xoaKh = ids.length ? deleteRecords('customer', ids) : { ok: true };
  return { seen: seen, activitiesLeft: giaoDich.map(function (record) { return record.id; }), activityDelete: xoaGd.ok, customerDelete: xoaKh.ok };
}
/** Dò ca "ShinCRM đổi trong lúc đang xem xung đột": đổi Website của ALT00010 trên Sheet, giữ nguyên trạng thái đồng bộ, nên bước Lưu kế tiếp của màn xung đột phải hỏi bằng popup xung đột của form. Không chạm FBM. */
function fbmDevEditAltWebsite() {
  var source = FbmSync.readLocal('customer').filter(function (record) { return String(record.fbmCustomerCode || '').trim() === 'ALT00010' && String(record.recordStatus || 'active') !== 'deleted'; })[0];
  if (!source) { return { ok: false, reason: 'Chưa có khách ALT00010 trên Sheet DEV.' }; }
  var website = 'Website ShinCRM sửa giữa chừng ' + Utilities.formatDate(new Date(), 'Asia/Ho_Chi_Minh', 'HH:mm');
  fbmFixtureSave('customer', [{ id: source.id, website: website }], 'pull');
  return { ok: true, id: source.id, before: source.website, website: website, syncStatus: source.syncStatus };
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
  fbmFixtureSave('activity', [{ id: source.id, content: 'Sửa từ ShinCRM ' + stamp, syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  var saved = fbmFixtureSave('activity', [created], 'pull');
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
    scope: FbmSync.syncSettingsRead().scopeCodes, candidates: FbmSync.pushCandidates('customer').map(function (item) { return item.kind + ':' + item.id; })
  };
}
/** Mở phạm vi ghi thử cho đúng khách được phép tạo thật, cạnh mã FBM `ALT00010`. */
function fbmAllowTestCreateCustomer() {
  fbmDevSetTestCodes(FBM_DEV_DEFAULT_TEST_CODES);
  return fbmProbeCreateCustomer();
}
/** Đưa CUS-020061 về `chờ đối soát` để lượt hai chiều đẩy lại và Log ghi tên trường FBM không nhận. */
function fbmRequeueCreateCustomerPush() {
  fbmFixtureSave('customer', [{ id: FBM_TEST_CREATE_CUSTOMER_ID, syncStatus: FbmSync.SYNC_STATUS.pending }], 'pull');
  return fbmProbeCreateCustomer();
}
/** Trả CUS-020061 về hàng đợi xung đột sau khi FBM-052 chuyển nhầm sang `không thấy bên FBM`; bản FBM vẫn còn, cần đọc lại để xem trường lệch. */
function fbmRequeueCreateCustomerConflict() {
  fbmFixtureSave('customer', [{ id: FBM_TEST_CREATE_CUSTOMER_ID, syncStatus: FbmSync.SYNC_STATUS.conflict }], 'pull');
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
  var state = FbmSync.stateRead();
  return { pending: FbmSync.pendingPushesRead(), cursor: state.cursor, conflictRefresh: state.metadata.conflictRefresh };
}

/** Tạm thu phạm vi live (đọc và đẩy) về khách CUS-020061 đã tạo thật, để lượt hai chiều đọc được Activity của khách này (G12.5). Trả về ALT00010 bằng `fbmScopeDefaultCustomer`. */
function fbmScopeCreatedCustomer() {
  var record = FbmSync.readLocal('customer').filter(function (item) { return String(item.id || '') === FBM_TEST_CREATE_CUSTOMER_ID; })[0];
  var code = record ? String(record.fbmCustomerCode || '').trim() : '';
  if (!code) { return { ok: false, reason: FBM_TEST_CREATE_CUSTOMER_ID + ' chưa có mã FBM trên Sheet DEV.' }; }
  fbmDevSetTestCodes([code]);
  return { ok: true, scope: FbmSync.syncSettingsRead().scopeCodes };
}
/** Trả phạm vi live về mặc định của DEV. */
function fbmScopeDefaultCustomer() {
  fbmDevSetTestCodes(FBM_DEV_DEFAULT_TEST_CODES);
  return { ok: true, scope: FbmSync.syncSettingsRead().scopeCodes };
}

/**
 * Sửa dữ liệu sau lỗi phân trang Customer ngày 2026-10-07: lượt quét dừng ở 50/1.312 khách nhưng vẫn đánh "không thấy bên FBM" cho phần còn lại.
 * Chỉ trả về "đã đồng bộ" cho Customer đang mang trạng thái đó mà có baseline (đã từng đọc khớp FBM); `apply` khác true thì chỉ đếm, không ghi.
 */
function fbmRepairFalseMissing(apply) {
  var sync = FbmSync.SYNC_STATUS, targets = FbmSync.readLocal('customer').filter(function (record) {
    return String(record.syncStatus || '') === sync.missing && String(record.fbmHash || '').trim() && String(record.fbmId || '').trim();
  }).map(function (record) { return { id: record.id, syncStatus: sync.synced }; });
  if (apply !== true || !targets.length) { return { apply: apply === true, count: targets.length, sample: targets.slice(0, 3).map(function (item) { return item.id; }) }; }
  var saved = fbmFixtureSave('customer', targets, 'pull');
  return { apply: true, count: targets.length, ok: saved && saved.ok !== false };
}
function fbmRepairFalseMissingApply() { return fbmRepairFalseMissing(true); }

/** Ghi dữ liệu thử qua Cửa bản ghi với chủ `fbm`: dữ liệu thử đặt thẳng giá trị đã biết, không cần đọc lại dòng. Chỉ DEV. */
function fbmFixtureSave(entity, records, source) {
  return FbmSync.recordChange(function () { return { save: [{ entity: entity, records: records, source: source }] }; }).saves[0];
}

/** Mở ngay một lượt nền chỉ đọc trong khóa điều phối và ranh giới lát như cửa lệnh làm (lệnh `start` của Sidebar chỉ mở lượt tay), để nghiệm thu nút dừng nền mà không chờ nhịp hỏi của Extension. Lượt nằm ở bước kiểm phiên tới khi Extension hỏi; chế độ đọc nên không gửi gì lên FBM. Chỉ DEV. */
function fbmDevOpenBackgroundRun() {
  var opened = FbmSync.withOrchestrationLock(function () { return FbmSync.runSlice(function () { return FbmSync.start({ mode: 'read', scan: 'full', origin: 'background', manual: false }); }); });
  var status = FbmSync.statusView();
  return { ok: opened && opened.ok !== false, code: opened && opened.code || '', running: status.running, origin: status.origin, phase: status.phase, message: status.message };
}

/** Nghiệm thu dừng nền bằng đúng các hàm Sidebar gọi: mở lượt nền, lệnh tay bị chặn bằng `SYNC_BACKGROUND_RUNNING`, dừng nền thì kênh rảnh ngay, lệnh tay gọi lại mở được lượt tay; cuối cùng hủy lượt tay để DEV về rảnh. Chế độ đọc nên không gửi gì lên FBM. Chỉ DEV. */
function fbmDevProbeStopBackground() {
  var view = function (status) { var s = status || {}; return { running: s.running, origin: s.origin, phase: s.phase }; };
  var opened = fbmDevOpenBackgroundRun();
  var blocked = fbmStartSync('read');
  var stopped = fbmStopBackground();
  var restarted = fbmStartSync('read');
  var cancelled = fbmCancelSync();
  var released = fbmDevReleaseUnsentRequest();
  return {
    opened: opened,
    blocked: { ok: blocked.ok, code: blocked.code || '', status: view(blocked.status) },
    stopped: { ok: stopped.ok, code: stopped.code || '', status: view(stopped.status) },
    restarted: { ok: restarted.ok, code: restarted.code || '', status: view(restarted.status), firstRequest: restarted.request && restarted.request.meta && restarted.request.meta.kind || '' },
    cancelled: { ok: cancelled.ok, code: cancelled.code || '', status: view(cancelled.status || cancelled) },
    released: released
  };
}

/** Request do hàm dò dòng lệnh cấp không có Extension nào gửi đi; báo lỗi truyền tải qua đúng cửa Sidebar dùng để lượt đang chờ đóng lại thay vì treo. Chỉ DEV. */
function fbmDevReleaseUnsentRequest() {
  var requestId = String(FbmSync.stateRead().activeRequestId || '');
  if (!requestId) { return { released: false, status: FbmSync.statusView().phase }; }
  var result = fbmReportSyncTransportFailure(requestId, 'DEV_PROBE_NOT_SENT', 'Hàm dò DEV cấp request nhưng không gửi qua Extension.');
  var status = result && (result.status || result) || {};
  return { released: true, code: result && result.code || '', running: status.running, phase: status.phase };
}
