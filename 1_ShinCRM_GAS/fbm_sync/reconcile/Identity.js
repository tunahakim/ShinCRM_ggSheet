/** Noi dinh danh va anh xa ban ghi FBM sang schema noi bo. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa liên kết Spreadsheet ↔ tài khoản FBM; không lưu cookie hay mật khẩu. */
FbmSync.BINDING_KEY = 'FBM_SYNC_BINDING_V1';
FbmSync.currentSpreadsheetId = function () {
  try { return String(shinOpenBook().getId() || ''); } catch (ignore) { return ''; }
};
FbmSync.bindingRead = function () {
  try {
    var raw = PropertiesService.getDocumentProperties().getProperty(FbmSync.BINDING_KEY);
    var value = raw ? JSON.parse(raw) : {};
    return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
  } catch (ignore) { return {}; }
};
FbmSync.bindingCanUpgradeUsername = function (previous, next) {
  var oldValue = previous || {}, newValue = next || {};
  return !!oldValue.spreadsheetId && !String(oldValue.username || '') && !!String(newValue.username || '') &&
    String(oldValue.spreadsheetId) === String(newValue.spreadsheetId || '') &&
    String(oldValue.userId || '') === String(newValue.userId || '') &&
    String(oldValue.accountName || '') === String(newValue.accountName || '');
};
FbmSync.bindingWrite = function (binding) {
  var value = binding || {}, spreadsheetId = String(value.spreadsheetId || '').trim(), userId = String(value.userId || '').trim(), username = String(value.username || '').trim(), accountName = String(value.accountName || '');
  if (!spreadsheetId || !userId || !username || !accountName) { return { ok: false, code: 'IDENTITY_BINDING_INCOMPLETE', message: 'Thiếu SpreadsheetId, mã số user, tên đăng nhập hoặc tên đầy đủ FBM.' }; }
  var actual = FbmSync.currentSpreadsheetId();
  if (actual && actual !== spreadsheetId) { return { ok: false, code: 'SPREADSHEET_MISMATCH', message: 'SpreadsheetId liên kết không khớp file đang chạy.' }; }
  var previous = FbmSync.bindingRead();
  var nextIdentity = { spreadsheetId: spreadsheetId, userId: userId, username: username, accountName: accountName };
  if (previous.spreadsheetId && (previous.spreadsheetId !== spreadsheetId || previous.userId !== userId || String(previous.username || '') !== username || previous.accountName !== accountName) && !FbmSync.bindingCanUpgradeUsername(previous, nextIdentity) && FbmSync.bindingHasLinkedData()) {
    return { ok: false, code: 'REBIND_REQUIRED', message: 'Spreadsheet còn dữ liệu đã liên kết FBM; xử lý dữ liệu cũ rồi kiểm tra lại trước khi đổi tài khoản.' };
  }
  var saved = { spreadsheetId: spreadsheetId, userId: userId, username: username, accountName: accountName, updatedAt: Date.now() };
  PropertiesService.getDocumentProperties().setProperty(FbmSync.BINDING_KEY, JSON.stringify(saved));
  return { ok: true, binding: { spreadsheetId: saved.spreadsheetId, userId: saved.userId, username: saved.username, accountName: saved.accountName, updatedAt: saved.updatedAt } };
};
FbmSync.bindingHasLinkedData = function () {
  try {
    return ['customer', 'activity'].some(function (entity) {
      return (FbmSync.readLocal(entity) || []).some(function (record) {
        return String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted';
      });
    });
  } catch (ignore) { return true; }
};
/** Đối chiếu nguyên văn nhận diện; không trim/đổi hoa thường khi so hai giá trị đã lưu. */
FbmSync.identityStatus = function (runtime) {
  var actual = String((runtime && runtime.spreadsheetId) || FbmSync.currentSpreadsheetId() || ''), current = FbmSync.bindingRead(), incoming = runtime || {}, expectedAccount = String(FbmSync.configValue('FBM_ACCOUNT_NAME') || '');
  var hasData = FbmSync.bindingHasLinkedData(), reasons = [];
  if (!current.spreadsheetId) { if (hasData) { reasons.push('missing_binding_with_linked_data'); } }
  else {
    if (actual && current.spreadsheetId !== actual) { reasons.push('spreadsheet_mismatch'); }
    if (incoming.userId !== undefined && String(incoming.userId) !== current.userId) { reasons.push('user_mismatch'); }
    if (incoming.username !== undefined && String(incoming.username) !== String(current.username || '')) { reasons.push('username_mismatch'); }
    if (incoming.accountName !== undefined && String(incoming.accountName) !== current.accountName) { reasons.push('account_mismatch'); }
  }
  if (incoming.accountName !== undefined && expectedAccount && String(incoming.accountName) !== expectedAccount) { reasons.push('configured_account_mismatch'); }
  var expectedId = String(FbmSync.configValue('FBM_SPREADSHEET_ID') || '');
  if (expectedId && actual && expectedId !== actual) { reasons.push('configured_spreadsheet_mismatch'); }
  var status = reasons.length ? 'REBIND_REQUIRED' : (current.spreadsheetId ? 'BOUND' : 'UNBOUND');
  return { ok: status !== 'REBIND_REQUIRED', status: status, code: status === 'REBIND_REQUIRED' ? 'REBIND_REQUIRED' : '', spreadsheetId: actual, hasLinkedData: hasData, binding: { spreadsheetId: current.spreadsheetId || '', userId: current.userId || '', username: current.username || '', accountName: current.accountName || '' }, reasons: reasons };
};
FbmSync.identityPreflight = function (mode) {
  var status = FbmSync.identityStatus(), write = mode === 'write' || mode === 'push' || mode === 'background';
  var identityCheck = mode === 'identity_check';
  return { status: status, blocking: !identityCheck && status.status === 'REBIND_REQUIRED', message: status.status === 'REBIND_REQUIRED' ? 'Cần kiểm tra lại liên kết tài khoản FBM trước khi chạy đồng bộ.' : '' };
};

/** Chuẩn bị bảng đối chiếu ID Customer mà không đưa danh sách lên Sidebar. */
FbmSync.identityCheckBegin = function (state) {
  var local = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal('customer') : [], sample = [];
  (local || []).forEach(function (record) {
    var fbmId = String(record && record.fbmId || '').trim();
    if (!fbmId || String(record.recordStatus || 'active') === 'deleted' || FbmSync.isTemporaryRecord('customer', record)) { return; }
    if (sample.length < 50) { sample.push({ id: String(record.id || ''), code: String(record.fbmCustomerCode || ''), fbmId: fbmId, seen: false }); }
  });
  state.metadata = state.metadata || {};
  state.metadata.identityCheck = {
    total: (local || []).filter(function (record) {
      return String(record && record.fbmId || '').trim() && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('customer', record);
    }).length,
    matched: 0, scanned: 0, pages: 0, missing: 0, missingSample: [], sample: sample,
    userId: String(state.session && state.session.userId || ''), accountName: String(state.session && state.session.accountName || '')
  };
  return state.metadata.identityCheck;
};

/** Ghi nhận một trang Customer cho luồng kiểm tra, không ghi Sheet/FBM. */
FbmSync.identityCheckPage = function (state, rows) {
  var result = state.metadata && state.metadata.identityCheck || {}, page = rows || [], local = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal('customer') : [], localById = {};
  (local || []).forEach(function (record) {
    var fbmId = String(record && record.fbmId || '').trim();
    if (fbmId && String(record.recordStatus || 'active') !== 'deleted' && !FbmSync.isTemporaryRecord('customer', record)) { localById[fbmId] = record; }
  });
  page.forEach(function (row) {
    var fbmId = String(row && row.stt_rec_kh || '').trim();
    if (!fbmId) { return; }
    result.scanned = Number(result.scanned || 0) + 1;
    if (localById[fbmId]) { result.matched = Number(result.matched || 0) + 1; }
    (result.sample || []).forEach(function (item) { if (item.fbmId === fbmId) { item.seen = true; } });
  });
  result.pages = Number(result.pages || 0) + 1;
  state.metadata.identityCheck = result;
  return result;
};

/** Chốt tổng hợp n/N và mẫu dòng local không còn thấy bên FBM. */
FbmSync.identityCheckFinish = function (state) {
  var result = state.metadata && state.metadata.identityCheck || {}, sample = result.sample || [];
  result.total = Number(result.total || 0);
  result.matched = Math.min(result.total, Number(result.matched || 0));
  result.missing = Math.max(0, result.total - result.matched);
  result.missingSample = sample.filter(function (item) { return !item.seen; }).slice(0, 20).map(function (item) {
    return { id: item.id, code: item.code, fbmId: item.fbmId };
  });
  delete result.sample;
  state.metadata.identityCheck = result;
  return result;
};

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
  var canWriteSheet = state && (typeof FbmSync.canWriteSheet === 'function' ? FbmSync.canWriteSheet(state.mode) : state.mode === 'read' || state.mode === 'write');
  if (!state || !canWriteSheet || String(settings.testCustomerCode || '').trim()) { return { written: 0, skipped: true }; }
  var local = FbmSync.readLocal(entity), missing = [];
  local.forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    var lock = state.locks && state.locks[entity + ':' + String(record.id || '')];
    if (!fbmId || FbmSync.seenStoreHas(entity, record) || String(record.recordStatus || 'active') === 'deleted' || (lock && lock.owner === 'user')) { return; }
    missing.push({ id: record.id, syncStatus: FbmSync.SYNC_STATUS.missing });
    if (FbmSync.logPullRecord) { FbmSync.logPullRecord(entity, { fbmId: fbmId }, record, FbmSync.SYNC_STATUS.missing, 'Không thấy ID trong lượt quét FBM; không suy ra xóa.'); }
  });
  if (!missing.length) { FbmSync.seenStoreClear(entity); return { written: 0 }; }
  if (typeof writeGateSave !== 'function') { return { written: 0 }; }
  var saved = writeGateSave({ entity: entity, records: missing, source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (saved && saved.ok) { FbmSync.seenStoreClear(entity); }
  return { written: saved && saved.ok ? missing.length : 0, result: saved };
};

/** Đổi record Customer FBM sang schema nội bộ của Sheet. */
FbmSync.customerRecord = function (fbm, categoryGate) {
  var record = { companyName: fbm.ten_kh || '', taxNumber: fbm.ma_so_thue || '', phone: fbm.dien_thoai || '', email: fbm.email || '', address: fbm.dc_lh || '', province: fbm.ten_dclh_tinh || fbm.dc_lh_tinh || '', website: fbm.website || '', contactPerson: fbm.ong_ba || '', leadSource: fbm.ten_nguon_dm || fbm.nguon_dm || '', product: fbm.ten_sp || fbm.ma_sp || '', verifyStatus: 'Chưa xác thực', allowFbmPush: FbmSync.PUSH_ALLOW_VALUE, fbmCustomerCode: fbm.ma_kh || '', fbmId: fbm.stt_rec_kh || '', syncedAt: new Date(), syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'customer', categoryGate);
  return record;
};
/** Đổi record Activity FBM sang schema nội bộ của Sheet. */
FbmSync.activityRecord = function (fbm, categoryGate, parent) {
  var parentCode = fbm.ma_kh || (parent && (parent.ma_kh || parent.maKh)) || '';
  var details = fbm.details || '', record = { customerId: parentCode, customerFbmCode: parentCode, workDate: fbm.end_date || '', taskType: fbm.ten_cv || fbm.ma_cv || '', content: FbmSync.stripActivityMarker(details), markerId: FbmSync.activityMarkerId(details), owner: fbm.owner || '', allowFbmPush: FbmSync.PUSH_ALLOW_VALUE, fbmId: fbm.id || '', syncStatus: FbmSync.SYNC_STATUS.synced };
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
    if (!customer) {
      orphaned += 1;
      FbmSync.logActivityDecision('activity_pull_skipped', record, 'Khong tim thay Customer cha trong ShinCRM.');
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, null, FbmSync.SYNC_STATUS.skipped, 'Không tìm thấy Customer cha trong ShinCRM.'); }
      return null;
    }
    if (FbmSync.pushPermission && FbmSync.pushPermission(customer, 'customer').stop) {
      blocked += 1;
      FbmSync.logActivityDecision('activity_pull_skipped', record, 'Customer cha da ngung dong bo.');
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, customer, FbmSync.SYNC_STATUS.skipped, 'Customer cha đã ngừng đồng bộ.'); }
      return null;
    }
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
