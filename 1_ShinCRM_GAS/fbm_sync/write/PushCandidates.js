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

/** Đọc các bản ghi local cần đẩy; không bao giờ chọn bản ghi đã xóa hoặc bị cấm. */
FbmSync.pushCandidates = function (entity) {
  var records = FbmSync.readLocal(entity), customers = {}, state = {}, pushFailures = {};
  var categoryGate = {};
  var testCustomerCode = '';
  try {
    state = FbmSync.stateRead();
    categoryGate = state.metadata && state.metadata.categoryGate || (typeof FbmSync.readCategoryGate === 'function' ? FbmSync.readCategoryGate() : {});
    pushFailures = state.metadata && state.metadata.pushFailures || {};
  } catch (ignore) {}
  try { testCustomerCode = typeof FbmSync.scriptSettings === 'function' ? String(FbmSync.scriptSettings().testCustomerCode || '').trim() : ''; } catch (ignoreSettings) {}
  if (entity === 'activity') {
    FbmSync.readLocal('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; });
  }
  return records.filter(function (record) {
    if (FbmSync.isTemporaryRecord(entity, record)) { return false; }
    if (String(record.recordStatus || 'active') === 'deleted') { return false; }
    var customer = entity === 'activity' ? customers[String(record.customerId || '')] : null;
    // Keep live writes inside the configured test customer until the gate is cleared.
    if (testCustomerCode && (entity === 'customer' ? String(record.fbmCustomerCode || '').trim() !== testCustomerCode : !customer || String(customer.fbmCustomerCode || '').trim() !== testCustomerCode)) { return false; }
    if (entity === 'activity' && !FbmSync.activityParentReady(customer)) { return false; }
    if (!FbmSync.pushPermission(record, entity, customer).push) { return false; }
    var status = String(record.syncStatus || ''), failureKey = entity + ':' + String(record.id || '');
    if (status === FbmSync.SYNC_STATUS.pushed || status === FbmSync.SYNC_STATUS.notApplied) { return false; }
    var currentHash = FbmSync.hash(record, entity, categoryGate);
    if (String(pushFailures[failureKey] || '') === currentHash) { return false; }
    var hasFbm = String(record.fbmId || '').trim() !== '';
    var changed = !String(record.fbmHash || '').trim() || currentHash !== String(record.fbmHash || '').trim();
    return !hasFbm || changed || String(record.syncStatus || '') === FbmSync.SYNC_STATUS.pending;
  }).map(function (record) {
    var customer = entity === 'activity' ? customers[String(record.customerId || '')] : null;
    var candidate = { kind: String(record.fbmId || '').trim() ? 'edit' : 'create', id: String(record.id || ''), record: record };
    if (customer) {
      candidate.record = Object.assign({}, record, { customerFbmCode: customer.fbmCustomerCode || '', stt_rec: customer.fbmId || '' });
    }
    return candidate;
  });
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
