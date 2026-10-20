/** Chuan bi candidate va kiem dieu kien truoc khi day FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Lấy InternalValues để dùng cho bước ghi tiếp theo. */
FbmSync.extractInternalValues = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed, values = {};
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  FbmSync.extractNamedValues(data, ['InternalValues', 'internalValues'], values, false);
  return values;
};

/** Đọc danh sách field-value của FBM; API có thể đổi kiểu viết tên thuộc tính. */
FbmSync.extractNamedValues = function (data, names, target, preferNew) {
  var list = [], fields = {};
  (FbmSync.CUSTOMER_MEMVARS || []).concat(FbmSync.ACTIVITY_MEMVARS || []).forEach(function (name) { fields[String(name).toLowerCase()] = name; });
  (names || []).forEach(function (name) {
    var source = data && data[name];
    if (Array.isArray(source)) { list = list.concat(source); }
    else if (source && typeof source === 'object') { Object.keys(source).forEach(function (key) { list.push({ Name: key, Value: source[key] }); }); }
  });
  list.forEach(function (item) {
    if (!item) { return; }
    var rawName = item.Name !== undefined ? item.Name : item.name, key = String(rawName || '').trim();
    if (!key) { return; }
    key = fields[key.toLowerCase()] || key;
    var hasNew = Object.prototype.hasOwnProperty.call(item, 'NewValue') || Object.prototype.hasOwnProperty.call(item, 'newValue');
    var hasValue = Object.prototype.hasOwnProperty.call(item, 'Value') || Object.prototype.hasOwnProperty.call(item, 'value');
    var hasOld = Object.prototype.hasOwnProperty.call(item, 'OldValue') || Object.prototype.hasOwnProperty.call(item, 'oldValue');
    var value = preferNew && hasNew ? (item.NewValue !== undefined ? item.NewValue : item.newValue) : hasValue ? (item.Value !== undefined ? item.Value : item.value) : hasNew ? (item.NewValue !== undefined ? item.NewValue : item.newValue) : hasOld ? (item.OldValue !== undefined ? item.OldValue : item.oldValue) : undefined;
    if (value !== undefined) { target[key] = FbmSync.fbDate(value); }
  });
  return target;
};

/** Lấy OldValue và ticket từ response mở form; entity truyền từ cursor để tránh đoán sai Row thưa. */
FbmSync.extractFormValues = function (response, entity) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed, values = FbmSync.extractInternalValues(response);
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var row = data && (data.Row || data.row);
  var controller = String(data && (data.Controller || data.controller || data.GridController || data.gridController) || '').toLowerCase();
  var activityController = String(FbmSync.CONTROLLERS && FbmSync.CONTROLLERS.activity || 'zccrAccountTask').toLowerCase();
  var activityHint = Object.keys(values).some(function (name) { return ['end_time', 'details', 'owner', 'fileticket'].indexOf(name) >= 0; });
  var useActivity = String(entity || '').toLowerCase() === 'activity' || controller === activityController || (!entity && (activityHint || (Array.isArray(row) && row.length > 0 && (row[15] !== undefined || row[21] !== undefined))));
  var rowFields = useActivity ? FbmSync.ACTIVITY_FORM_ROW_FIELDS : FbmSync.CUSTOMER_FORM_ROW_FIELDS;
  if (Array.isArray(row)) {
    rowFields.forEach(function (name, index) { if (name && row[index] !== undefined) { values[name] = FbmSync.fbDate(row[index]); } });
  } else if (row && typeof row === 'object') {
    FbmSync.extractNamedValues({ Row: row }, ['Row'], values, false);
  }
  FbmSync.extractNamedValues(data, ['FieldValues', 'fieldValues'], values, true);
  var showing = data && (data.Showing || data.showing);
  if (showing && typeof showing === 'object' && showing._ticket !== undefined) { values.fileticket = showing._ticket; }
  if (showing && typeof showing === 'object' && showing.fileticket !== undefined) { values.fileticket = showing.fileticket; }
  if (showing && typeof showing !== 'object') {
    var ticket = String(showing).match(/_ticket\s*(?:=|:)\s*["']([^"']+)["']/i);
    if (ticket) { values.fileticket = ticket[1]; }
  }
  return values;
};

/** Trích mã khách tự sinh từ ClientScript của response mở form New. */
FbmSync.extractAutoCustomerCode = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed, script = String(data.ClientScript || data.clientScript || '');
  var match = script.match(/_ma_kh_auto\s*=\s*['"]([^'"]+)['"]/);
  return match ? String(match[1]) : '';
};

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
 * Phép xét một dòng, dùng chung cho lần quét cả sheet và cho từng bước đẩy trên dòng đọc lại theo mã, nên hai nơi không thể quyết khác nhau. Không bao giờ chọn bản ghi đã xóa hoặc bị cấm. `customer` là khách cha của Giao dịch.
 * Trả `null` khi dòng không có việc, hoặc ứng viên `{ kind, entity, id, record, raw }`; ứng viên mang `hold` là dòng chờ người sửa chưa mang trạng thái đó, việc của nó là ghi trạng thái và Log một lần. Đã mang đúng trạng thái thì không có việc, nên lần quét lại không chọn lại và phiên vẫn sạch; sửa dữ liệu hoặc Category thì dòng qua phép xét và được đẩy bất kể trạng thái cũ.
 * Bản ghi `đang đẩy` chưa có ID FBM là lệnh tạo đã phát mà không biết kết quả; tạo lại có thể sinh bản ghi trùng (`09/04`, FBM-027). Customer đi đường tra theo MST (`recover`), Activity không có đường tra nên chỉ báo người dùng (`stuck`); hai loại này không qua phép xét chờ sửa vì không dựng lệnh ghi.
 */
FbmSync.pushReview = function (entity, record, customer, context) {
  if (FbmSync.isTemporaryRecord(entity, record)) { return null; }
  if (String(record.recordStatus || 'active') === 'deleted') { return null; }
  if (FbmSync.isConflictPending(record)) { return null; }
  if (!FbmSync.inScope(entity === 'customer' ? record : customer, context.scope)) { return null; }
  if (entity === 'activity' && !FbmSync.activityParentReady(customer)) { return null; }
  if (!FbmSync.syncPermission(record, entity, customer).push) { return null; }
  if (FbmSync.isPushFrozen(record, customer)) { return null; }
  var status = String(record.syncStatus || ''), unconfirmed = FbmSync.isUnconfirmedCreate(record), currentHash = context.hash(record, entity);
  // Sổ lỗi đẩy áp cả cho lệnh tạo chưa xác nhận: đã báo lỗi thì chờ người xử lý, lần quét lại trong chặng không chọn lại để báo lỗi lần nữa.
  if (String(context.pushFailures[entity + ':' + String(record.id || '')] || '') === currentHash) { return null; }
  if (!unconfirmed) {
    if (status === FbmSync.SYNC_STATUS.pushed || status === FbmSync.SYNC_STATUS.notApplied) { return null; }
    var hasFbm = String(record.fbmId || '').trim() !== '', changed = !String(record.fbmHash || '').trim() || currentHash !== String(record.fbmHash || '').trim();
    if (hasFbm && !changed && status !== FbmSync.SYNC_STATUS.pending) { return null; }
  }
  var kind = unconfirmed ? (entity === 'customer' ? 'recover' : 'stuck') : String(record.fbmId || '').trim() ? 'edit' : 'create';
  // `raw` là dòng Sheet lúc chọn, chỉ sống trong bộ nhớ: bước ghi so nó với dòng đọc lại trong cửa để không đẩy dòng vừa có người sửa.
  var candidate = { kind: kind, entity: entity, id: String(record.id || ''), record: record, raw: record };
  if (customer && entity === 'activity') { candidate.record = Object.assign({}, record, { customerFbmCode: customer.fbmCustomerCode || '', stt_rec: customer.fbmId || '' }); }
  if (unconfirmed) { return candidate; }
  var hold = FbmSync.pushHold(candidate, context);
  if (!hold) { return candidate; }
  if (status === hold.status) { return null; }
  candidate.hold = hold;
  return candidate;
};

/** Các phép xét không cần FBM của bước đẩy, theo thứ tự: người phụ trách, danh mục, đủ trường. Trả `{ code, status, reason }` hoặc `null`. */
FbmSync.pushHold = function (candidate, context) {
  var entity = candidate.entity, head = 'Bỏ qua ' + entity + ' ' + candidate.id + ': ';
  var ownerError = entity === 'activity' ? FbmSync.pushOwnerError(candidate, context.settings()) : '';
  if (ownerError) { return { code: 'owner', status: FbmSync.SYNC_STATUS.skipped, reason: head + ownerError }; }
  var categoryErrors = FbmSync.validatePushCategories(candidate.record, entity, context.categoryGate);
  if (categoryErrors.length) { return { code: 'category', status: FbmSync.SYNC_STATUS.unknownCategory, reason: head + categoryErrors[0].result.reason }; }
  var eligibilityErrors = FbmSync.pushEligibilityErrors(candidate.record, entity);
  if (eligibilityErrors.length) { return { code: 'eligibility', status: FbmSync.SYNC_STATUS.skipped, reason: head + eligibilityErrors.join(' ') }; }
  return null;
};

/** Owner của Activity phải khớp binding đã xác nhận trước khi cấp bất kỳ request push nào. */
FbmSync.pushOwnerError = function (candidate, settings) {
  if (!candidate || candidate.entity !== 'activity') { return ''; }
  var cfg = settings || FbmSync.scriptSettings(), configured = String(cfg.accountName || '');
  var owner = String(candidate.record && candidate.record.owner || '');
  if (!configured) { return ''; }
  if (owner && owner !== configured) {
    return 'Activity ' + String(candidate.id || '') + ' thuộc owner FBM "' + owner + '", khác tài khoản FBM đã liên kết "' + configured + '".';
  }
  return '';
};

/** Quét một thực thể trên bản đọc `scan` (đọc cả sheet một lần): mọi dòng có việc theo `pushReview`, theo thứ tự dòng. */
FbmSync.pushCandidates = function (entity, scan, context) {
  var local = scan || FbmSync.localScan(), review = context || FbmSync.pushReviewContext(FbmSync.stateRead(), local), customers = {};
  if (entity === 'activity') {
    local.records('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; });
  }
  return local.records(entity).map(function (record) {
    return FbmSync.pushReview(entity, record, entity === 'activity' ? customers[String(record.customerId || '')] || null : null, review);
  }).filter(Boolean);
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
