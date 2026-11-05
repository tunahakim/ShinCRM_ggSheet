/** Chuan bi candidate va kiem dieu kien truoc khi day FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Thứ phép xét một dòng cần, đọc một lần cho cả lần quét hoặc cả một lần gọi của chặng đẩy. `scan` là bản đọc `localScan` khi xét trên lần quét (băm có nhớ), thiếu thì băm thẳng dòng đọc theo mã; `settings` là cấu hình bên gọi đã đọc, thiếu thì đọc khi một Giao dịch cần so người phụ trách.
 * Đọc hỏng thì ném lên cổng báo lỗi chung: coi sổ lỗi đẩy là rỗng sẽ đẩy lại âm thầm bản ghi từng lỗi.
 */
FbmSync.pushReviewContext = function (state, scan, settings) {
  var categoryGate = FbmSync.stateCategoryGate(state || FbmSync.stateRead()), cached = settings;
  return {
    categoryGate: categoryGate,
    pushFailures: FbmSync.pushFailuresRead().hashes,
    scope: typeof FbmSync.scope === 'function' ? FbmSync.scope() : null,
    hash: function (record, entity) { return scan ? scan.hash(record, entity, categoryGate) : FbmSync.hash(record, entity, categoryGate); },
    settings: function () { if (!cached) { cached = FbmSync.scriptSettings(); } return cached; }
  };
};

/**
 * Dòng có được đẩy không, và vì sao: phép xét duy nhất của chiều đẩy, dùng cho lần quét cả sheet, cho từng bước đẩy trên dòng đọc lại theo mã và cho số liệu của preflight, nên ba nơi không thể quyết khác nhau. `customer` là khách cha của Giao dịch. Chỉ xét, không ghi gì.
 * Trả `{ eligible, kind, reason }`: `reason` là mã lý do không đẩy (theo thứ tự xét: `temporary`, `deleted`, `conflict`, `outOfScope`, `parentNotReady`, `permissionInvalid`, `noPermission`, `frozen`, `pushFailed`, `awaitingConfirmation`, `unchanged`); được đẩy thì `kind` là `edit`, `create`, `recover` hoặc `stuck`.
 * Bản ghi `đang đẩy` chưa có ID FBM là lệnh tạo đã phát mà không biết kết quả; tạo lại có thể sinh bản ghi trùng (`09/04`, FBM-027). Customer đi đường tra theo MST (`recover`), Activity không có đường tra nên chỉ báo người dùng (`stuck`).
 */
FbmSync.pushEligible = function (entity, record, customer, context) {
  var no = function (reason) { return { eligible: false, kind: '', reason: reason }; };
  if (FbmSync.isTemporaryRecord(entity, record)) { return no('temporary'); }
  if (String(record.recordStatus || 'active') === 'deleted') { return no('deleted'); }
  if (FbmSync.isConflictPending(record)) { return no('conflict'); }
  if (!FbmSync.inScope(entity === 'customer' ? record : customer, context.scope)) { return no('outOfScope'); }
  if (entity === 'activity' && !FbmSync.activityParentReady(customer)) { return no('parentNotReady'); }
  var permission = FbmSync.syncPermission(record, entity, customer);
  if (!permission.push) { return no(permission.invalid ? 'permissionInvalid' : 'noPermission'); }
  if (FbmSync.isPushFrozen(record, customer)) { return no('frozen'); }
  var status = String(record.syncStatus || ''), unconfirmed = FbmSync.isUnconfirmedCreate(record), currentHash = context.hash(record, entity);
  // Sổ lỗi đẩy áp cả cho lệnh tạo chưa xác nhận: đã báo lỗi thì chờ người xử lý, lần quét lại trong chặng không chọn lại để báo lỗi lần nữa.
  if (String(context.pushFailures[entity + ':' + String(record.id || '')] || '') === currentHash) { return no('pushFailed'); }
  if (!unconfirmed) {
    if (status === FbmSync.SYNC_STATUS.pushed || status === FbmSync.SYNC_STATUS.notApplied) { return no('awaitingConfirmation'); }
    if (String(record.fbmId || '').trim() && !FbmSync.pushChanged(record, currentHash)) { return no('unchanged'); }
  }
  return { eligible: true, kind: unconfirmed ? (entity === 'customer' ? 'recover' : 'stuck') : String(record.fbmId || '').trim() ? 'edit' : 'create', reason: '' };
};

/** Dòng có nội dung ShinCRM chưa lên FBM: chưa có mốc, dấu vân khác mốc, hoặc đang chờ đối soát. `currentHash` là dấu vân bên gọi đã tính. */
FbmSync.pushChanged = function (record, currentHash) {
  var baseline = String(record && record.fbmHash || '').trim();
  return !baseline || currentHash !== baseline || String(record && record.syncStatus || '') === FbmSync.SYNC_STATUS.pending;
};

/**
 * Ứng viên của chặng đẩy: `pushEligible` cho qua thì dựng `{ kind, entity, id, record, raw }`, không thì `null`.
 * Ứng viên mang `hold` là dòng chờ người sửa chưa mang trạng thái đó, việc của nó là ghi trạng thái và Log một lần. Đã mang đúng trạng thái thì không có việc, nên lần quét lại không chọn lại và phiên vẫn sạch; sửa dữ liệu hoặc Category thì dòng qua phép xét và được đẩy bất kể trạng thái cũ. Lệnh tạo chưa xác nhận không qua phép chờ sửa vì không dựng lệnh ghi.
 */
FbmSync.pushReview = function (entity, record, customer, context) {
  var verdict = FbmSync.pushEligible(entity, record, customer, context);
  return verdict.eligible ? FbmSync.pushCandidateBuild(entity, record, customer, verdict, context) : null;
};

/** Dựng ứng viên từ dòng `pushEligible` đã cho qua (`verdict`); `null` khi dòng đã mang đúng trạng thái chờ sửa. */
FbmSync.pushCandidateBuild = function (entity, record, customer, verdict, context) {
  // `raw` là dòng Sheet lúc chọn, chỉ sống trong bộ nhớ: bước ghi so nó với dòng đọc lại trong cửa để không đẩy dòng vừa có người sửa.
  var candidate = { kind: verdict.kind, entity: entity, id: String(record.id || ''), record: record, raw: record };
  if (customer && entity === 'activity') { candidate.record = Object.assign({}, record, { customerFbmCode: customer.fbmCustomerCode || '', stt_rec: customer.fbmId || '' }); }
  if (verdict.kind === 'recover' || verdict.kind === 'stuck') { return candidate; }
  var hold = FbmSync.pushHold(candidate, context);
  if (!hold) { return candidate; }
  if (String(record.syncStatus || '') === hold.status) { return null; }
  candidate.hold = hold;
  return candidate;
};

/** Các phép xét không cần FBM của bước đẩy, theo thứ tự: người phụ trách, danh mục, đủ trường. Trả `{ code, status, reason, cause }` hoặc `null`; `reason` nêu mã bản ghi, `cause` là cùng câu đó không nêu mã để Log gom cả nhóm thành một dòng. */
FbmSync.pushHold = function (candidate, context) {
  var entity = candidate.entity, head = 'Bỏ qua ' + entity + ' ' + candidate.id + ': ';
  var ownerError = entity === 'activity' ? FbmSync.ownerCheck(candidate.record, context.settings().accountName) : '';
  if (ownerError) { return { code: 'owner', status: FbmSync.SYNC_STATUS.skipped, reason: head + ownerError, cause: 'Bỏ qua ' + entity + ': ' + ownerError }; }
  var categoryErrors = FbmSync.categoryGateCheck(candidate.record, entity, context.categoryGate);
  if (categoryErrors.length) { return { code: 'category', status: FbmSync.SYNC_STATUS.unknownCategory, reason: head + categoryErrors[0].result.reason, cause: 'Bỏ qua ' + entity + ': ' + categoryErrors[0].result.reason }; }
  var eligibilityErrors = FbmSync.pushEligibilityErrors(candidate.record, entity);
  if (eligibilityErrors.length) { return { code: 'eligibility', status: FbmSync.SYNC_STATUS.skipped, reason: head + eligibilityErrors.join(' '), cause: 'Bỏ qua ' + entity + ': ' + eligibilityErrors.join(' ') }; }
  return null;
};

/** Mọi dòng của một thực thể trên bản đọc `scan` kèm khách cha, theo thứ tự dòng: lần duyệt duy nhất mà chặng đẩy và preflight cùng dùng. */
FbmSync.pushScanRows = function (entity, scan) {
  var customers = {};
  if (entity === 'activity') { scan.records('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; }); }
  return scan.records(entity).map(function (record) { return { record: record, parent: entity === 'activity' ? customers[String(record.customerId || '')] || null : null }; });
};

/** Quét một thực thể trên bản đọc `scan` (đọc cả sheet một lần): mọi dòng có việc theo `pushReview`, theo thứ tự dòng. */
FbmSync.pushCandidates = function (entity, scan, context) {
  var local = scan || FbmSync.localScan(), review = context || FbmSync.pushReviewContext(FbmSync.stateRead(), local);
  return FbmSync.pushScanRows(entity, local).map(function (row) { return FbmSync.pushReview(entity, row.record, row.parent, review); }).filter(Boolean);
};

/** Cổng của chặng đẩy, thuần: `options` là chiều và loại quét của lượt, `mark` là dấu đã lưu, `now` là dấu hiện tại. Trả `{ open, reason }`; đóng chỉ khi lượt nền không thuộc loại bỏ qua và bốn phần đều khớp. */
FbmSync.pushGateDecide = function (options, mark, now) {
  var opt = options || {};
  if (opt.origin !== 'background') { return { open: true, reason: 'manual' }; }
  if (FbmSync.PUSH_GATE_BYPASS_SCANS.indexOf(String(opt.scan || '')) >= 0) { return { open: true, reason: 'bypass_scan' }; }
  if (!mark) { return { open: true, reason: 'no_mark' }; }
  var changed = ['rev', 'failures', 'scope', 'account'].filter(function (part) { return String(mark[part]) !== String(now[part]); });
  return changed.length ? { open: true, reason: 'changed:' + changed.join(',') } : { open: false, reason: 'clean' };
};

/** Quét cả hai thực thể, Khách trước Giao dịch: Giao dịch của khách mới chỉ đẩy được sau khi khách có mã FBM. */
FbmSync.pushCandidatesAll = function (scan, context) {
  return FbmSync.pushCandidates('customer', scan, context).concat(FbmSync.pushCandidates('activity', scan, context));
};

/** Đọc một dòng theo mã qua tầng đọc; `null` khi mã không còn trên Sheet. */
FbmSync.readLocalById = function (entity, id) {
  return entityBlockRecords(entityReadRecordById(entity, FbmSync.recordSchemas(), id))[0] || null;
};

/** Khách thuộc phạm vi chiều ghi; Activity xét theo khách cha. */
FbmSync.inScope = function (customer, scope) {
  if (!scope) { return true; }
  return !!customer && scope.shin.indexOf(String(customer.id || '').trim()) >= 0;
};

/** Lệnh tạo đã phát nhưng chưa biết FBM có lưu hay không; bản ghi sửa (đã có ID FBM) gửi lại không sinh trùng nên không thuộc nhóm này. */
FbmSync.isUnconfirmedCreate = function (record) {
  return String(record && record.syncStatus || '') === FbmSync.SYNC_STATUS.pushing && !String(record && record.fbmId || '').trim();
};

/** Chỉ lưu khóa cần để dựng lại candidate; payload đầy đủ phải đọc lại từ Sheet. */
FbmSync.pushCandidateForState = function (candidate) {
  var value = candidate || {};
  return {
    kind: String(value.kind || ''),
    id: String(value.id || ''),
    entity: String(value.entity || ''),
    autoCode: String(value.autoCode || '')
  };
};

/** Dựng lại payload candidate từ Sheet theo mã sau khi state đã bỏ payload để không vượt quota; Activity kèm mã FBM của khách cha. */
FbmSync.hydratePushCandidate = function (candidate) {
  var value = candidate || {}, entity = String(value.entity || ''), id = String(value.id || ''), record = value.record;
  if (record && typeof record === 'object') { return value; }
  if (!id) { return value; }
  record = FbmSync.readLocalById(entity, id);
  if (!record) { return value; }
  if (entity === 'activity') {
    var customer = FbmSync.readLocalById('customer', record.customerId);
    if (customer) { record = Object.assign({}, record, { customerFbmCode: customer.fbmCustomerCode || '', stt_rec: customer.fbmId || '' }); }
  }
  return Object.assign({}, value, { record: record });
};

/** Kiểm đủ dữ liệu và giới hạn trước khi dựng request ghi FBM. */
FbmSync.pushEligibilityErrors = function (record, entity) {
  var errors = [], required = entity === 'customer'
    ? [['companyName', 'Tên khách hàng'], ['taxNumber', 'Mã số thuế'], ['contactPerson', 'Người liên hệ'], ['phone', 'Điện thoại'], ['leadSource', 'Nguồn khách'], ['address', 'Địa chỉ'], ['province', 'Tỉnh thành']]
    : [['taskType', 'Công việc'], ['content', 'Nội dung công việc'], ['workDate', 'Ngày làm việc']];
  required.forEach(function (item) { if (!String(FbmSync.value(record, item[0], '')).trim()) { errors.push('Thiếu ' + item[1] + '.'); } });
  var limits = entity === 'customer' ? { companyName: 1000, taxNumber: 32, contactPerson: 256, phone: 52, email: 256 } : { content: 4000 };
  Object.keys(limits).forEach(function (field) {
    var value = String(FbmSync.value(record, field, '') || '');
    if (entity === 'activity' && field === 'content') { value = FbmSync.stripActivityMarker(value); }
    if (value.length > limits[field]) { errors.push((field === 'content' ? 'Nội dung công việc' : field) + ' vượt quá ' + limits[field] + ' ký tự.'); }
  });
  return errors;
};
