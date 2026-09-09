/** Noi dinh danh va anh xa ban ghi FBM sang schema noi bo. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa MST cho phép nối record; giữ dấu gạch chi nhánh nhưng bỏ dấu chấm, phẩy và khoảng trắng. */
FbmSync.customerTaxKey = function (value) {
  return FbmSync.normalize(value).replace(/[.,\s]/g, '');
};

/** Báo MST không thể dùng để nối an toàn vì trùng hoặc dòng đã liên kết. */
FbmSync.customerTaxIdentityIssue = function (localByTaxNumber, incoming) {
  var tax = FbmSync.customerTaxKey(incoming && (incoming.taxNumber || incoming.ma_so_thue));
  var matches = tax && localByTaxNumber && localByTaxNumber[tax] || [];
  if (!matches.length) { return null; }
  if (matches.length !== 1) { return { tax: tax, reason: 'duplicate_tax_number', records: matches }; }
  var record = matches[0];
  if (String(record.fbmId || '').trim() || String(record.fbmCustomerCode || '').trim()) { return { tax: tax, reason: 'already_linked', records: matches }; }
  return null;
};

/** Hợp nhất định danh FBM theo ID, mã khách hoặc MST duy nhất của dòng chưa liên kết. */
FbmSync.findCustomerByIdentity = function (localById, localByCode, incoming, localByTaxNumber) {
  var key = String(incoming && incoming.fbmId || '').trim(), code = String(incoming && incoming.fbmCustomerCode || '').trim();
  if (key && localById[key]) { return localById[key]; }
  if (code && localByCode[code] && localByCode[code].length === 1) { return localByCode[code][0]; }
  var tax = FbmSync.customerTaxKey(incoming && (incoming.taxNumber || incoming.ma_so_thue)), matches = tax && localByTaxNumber && localByTaxNumber[tax] || [];
  if (matches.length === 1 && !String(matches[0].fbmId || '').trim() && !String(matches[0].fbmCustomerCode || '').trim()) { return matches[0]; }
  return null;
};

/** Đánh dấu bản ghi local vắng khỏi một lượt quét full; không suy ra xóa FBM. */
FbmSync.markMissingAfterFullScan = function (entity, state) {
  var settings = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {};
  if (!state || state.mode !== 'write' || String(settings.testCustomerCode || '').trim()) { return { written: 0, skipped: true }; }
  var seen = state.metadata && state.metadata.seen && state.metadata.seen[entity] || {}, local = FbmSync.readLocal(entity), missing = [];
  local.forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    var lock = state.locks && state.locks[entity + ':' + String(record.id || '')];
    if (!fbmId || seen[fbmId] || String(record.recordStatus || 'active') === 'deleted' || (lock && lock.owner === 'user')) { return; }
    missing.push({ id: record.id, syncStatus: FbmSync.SYNC_STATUS.missing });
  });
  if (!missing.length || typeof writeGateSave !== 'function') { return { written: 0 }; }
  var saved = writeGateSave({ entity: entity, records: missing, source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  return { written: saved && saved.ok ? missing.length : 0, result: saved };
};

/** Đổi record Customer FBM sang schema nội bộ của Sheet. */
FbmSync.customerRecord = function (fbm, categoryGate) {
  var record = { companyName: fbm.ten_kh || '', taxNumber: fbm.ma_so_thue || '', phone: fbm.dien_thoai || '', email: fbm.email || '', address: fbm.dc_lh || '', province: fbm.ten_dclh_tinh || fbm.dc_lh_tinh || '', website: fbm.website || '', contactPerson: fbm.ong_ba || '', leadSource: fbm.ten_nguon_dm || fbm.nguon_dm || '', product: fbm.ten_sp || fbm.ma_sp || '', verifyStatus: 'Chưa xác thực', allowFbmPush: 'Chưa cho phép', fbmCustomerCode: fbm.ma_kh || '', fbmId: fbm.stt_rec_kh || '', syncedAt: new Date(), syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'customer', categoryGate);
  return record;
};
/** Đổi record Activity FBM sang schema nội bộ của Sheet. */
FbmSync.activityRecord = function (fbm, categoryGate, parent) {
  var parentCode = fbm.ma_kh || (parent && (parent.ma_kh || parent.maKh)) || '';
  var details = fbm.details || '', record = { customerId: parentCode, customerFbmCode: parentCode, workDate: fbm.end_date || '', taskType: fbm.ten_cv || fbm.ma_cv || '', content: FbmSync.stripActivityMarker(details), markerId: FbmSync.activityMarkerId(details), owner: fbm.owner || '', allowFbmPush: 'Chưa cho phép', fbmId: fbm.id || '', syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'activity', categoryGate);
  return record;
};

/** Nối Activity FBM vào mã Customer nội bộ và giữ hash ổn định sau khi đổi khóa ngoại. */
FbmSync.logActivityDecision = function (action, record, reason, outcome, detail) {
  if (typeof logEvent !== 'function') { return; }
  logEvent({ source: 'fbm_sync', action: action || 'activity_pull', outcome: outcome || (typeof LOG_TRACE !== 'undefined' ? LOG_TRACE : 'trace'), entity: 'activity', recordId: String(record && (record.fbmId || record.id) || ''), reason: String(reason || ''), detail: Object.assign({ customerCode: String(record && (record.customerFbmCode || record.customerId) || '') }, detail || {}) });
};

FbmSync.linkActivityCustomers = function (records, customers, categoryGate) {
  var byFbm = {}, orphaned = 0, blocked = 0;
  (customers || []).forEach(function (customer) {
    var code = String(customer.fbmCustomerCode || '').trim();
    if (code) { byFbm[code] = customer; }
  });
  var linked = (records || []).map(function (record) {
    var customerCode = String(record.customerFbmCode || record.customerId || '').trim(), customer = byFbm[customerCode];
    if (!customer) { orphaned += 1; FbmSync.logActivityDecision('activity_pull_skipped', record, 'Khong tim thay Customer cha trong ShinCRM.'); return null; }
    if (FbmSync.pushPermission && FbmSync.pushPermission(customer, 'customer').stop) { blocked += 1; FbmSync.logActivityDecision('activity_pull_skipped', record, 'Customer cha da ngung dong bo.'); return null; }
    var linkedRecord = Object.assign({}, record, { customerId: String(customer.id || '').trim(), customerFbmCode: customerCode });
    linkedRecord.fbmHash = FbmSync.hash(linkedRecord, 'activity', categoryGate);
    return linkedRecord;
  }).filter(Boolean);
  return { records: linked, orphaned: orphaned, blocked: blocked };
};

/** Giữ trường chỉ thuộc ShinCRM khi FBM trả lại bản ghi đã tồn tại. */
FbmSync.preserveLocalFields = function (entity, current, incoming) {
  var fields = entity === 'customer'
    ? ['note', 'allowFbmPush', 'verifyStatus', 'customerGroup', 'searchAliases', 'bidClosingDate']
    : ['allowFbmPush', 'enteredBy', 'contractValue', 'priority', 'dueAt'];
  var merged = Object.assign({}, incoming);
  fields.forEach(function (field) {
    if (current && Object.prototype.hasOwnProperty.call(current, field)) { merged[field] = current[field]; }
    else { delete merged[field]; }
  });
  return merged;
};

