/** Noi dinh danh va anh xa ban ghi FBM sang schema noi bo. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Khóa liên kết Spreadsheet ↔ tài khoản FBM; không lưu cookie hay mật khẩu. */
FbmSync.BINDING_KEY = 'FBM_SYNC_BINDING_V1';
FbmSync.BINDING_CLEAR_KEY = 'FBM_SYNC_BINDING_CLEAR_V1';
FbmSync.currentSpreadsheetId = function () {
  try { return String(shinOpenBook().getId() || ''); } catch (ignore) { return ''; }
};
/** Bản lưu thô của liên kết; kho hỏng thì ném lỗi có mã, không coi như chưa liên kết (trả rỗng sẽ mở đường đọc khách không lọc quyền và hiện sai "chưa liên kết"). */
FbmSync.bindingRead = function () {
  return FbmSync.documentPropertyJson(FbmSync.BINDING_KEY, 'liên kết tài khoản FBM') || {};
};
/** Bốn trường nhận diện ở dạng chuẩn; giữ nguyên văn (không trim, không đổi hoa thường) vì mọi phép đối chiếu so nguyên văn. */
FbmSync.identityNormalize = function (value) {
  var input = value && typeof value === 'object' ? value : {};
  return { spreadsheetId: String(input.spreadsheetId || ''), userId: String(input.userId || ''), username: String(input.username || ''), accountName: String(input.accountName || '') };
};
/** Danh tính tài khoản đã liên kết: giá trị chủ dự án khai báo, chỉ dùng để đối chiếu với danh tính đọc từ FBM. Request nghiệp vụ dùng danh tính phiên đã xác minh (`sessionVerifiedIdentity`), không dùng giá trị này. */
FbmSync.boundIdentity = function () {
  return FbmSync.identityNormalize(FbmSync.bindingRead());
};
FbmSync.bindingCanUpgradeUsername = function (previous, next) {
  var oldValue = previous || {}, newValue = next || {};
  return !!oldValue.spreadsheetId && !String(oldValue.username || '') && !!String(newValue.username || '') &&
    String(oldValue.spreadsheetId) === String(newValue.spreadsheetId || '') &&
    String(oldValue.userId || '') === String(newValue.userId || '') &&
    String(oldValue.accountName || '') === String(newValue.accountName || '');
};
/** Hủy liên kết không đụng dữ liệu Sheet; cấm khi một request FBM đang bay để không đổi danh tính giữa phiên. */
FbmSync.bindingClear = function () {
  var state = typeof FbmSync.stateRead === 'function' ? FbmSync.stateRead() : {}, phase = String(state && state.phase || '');
  var active = !!(state && state.activeRequestId) || (!!(state && state.runId) && ['idle', 'done', 'error', 'paused', 'conflict'].indexOf(phase) < 0);
  if (active) { return { ok: false, code: 'SYNC_ALREADY_RUNNING', message: 'Đang có phiên đồng bộ; hãy dừng phiên trước khi hủy liên kết tài khoản.' }; }
  var props = FbmSync.props(), previous = FbmSync.bindingRead();
  if (previous.spreadsheetId) {
    props.setProperty(FbmSync.BINDING_CLEAR_KEY, JSON.stringify({ spreadsheetId: String(previous.spreadsheetId || ''), userId: String(previous.userId || ''), username: String(previous.username || ''), accountName: String(previous.accountName || ''), clearedAt: Date.now() }));
  }
  if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.BINDING_KEY); }
  else { props.setProperty(FbmSync.BINDING_KEY, ''); }
  var status = FbmSync.identityStatus();
  return { ok: true, code: 'IDENTITY_BINDING_CLEARED', binding: {}, identityStatus: status, message: 'Đã hủy liên kết tài khoản. Đồng bộ bị khóa cho đến khi liên kết lại.' };
};
FbmSync.bindingWrite = function (binding) {
  var value = binding || {}, spreadsheetId = String(value.spreadsheetId || '').trim(), userId = String(value.userId || '').trim(), username = String(value.username || '').trim(), accountName = String(value.accountName || '');
  if (!spreadsheetId && !userId && !username && !accountName) { return FbmSync.bindingClear(); }
  if (!spreadsheetId || !userId || !username || !accountName) { return { ok: false, code: 'IDENTITY_BINDING_INCOMPLETE', message: 'Thiếu SpreadsheetId, mã số user, tên đăng nhập hoặc tên đầy đủ FBM.' }; }
  var actual = FbmSync.currentSpreadsheetId();
  if (actual && actual !== spreadsheetId) { return { ok: false, code: 'SPREADSHEET_MISMATCH', message: 'SpreadsheetId liên kết không khớp file đang chạy.' }; }
  var previous = FbmSync.bindingRead();
  var nextIdentity = { spreadsheetId: spreadsheetId, userId: userId, username: username, accountName: accountName };
  var cleared = {};
  try { cleared = JSON.parse(FbmSync.props().getProperty(FbmSync.BINDING_CLEAR_KEY) || '{}') || {}; } catch (ignoreClear) { cleared = {}; }
  var sameBinding = previous.spreadsheetId === spreadsheetId && previous.userId === userId && String(previous.username || '') === username && previous.accountName === accountName;
  var rebindBlocked = FbmSync.bindingHasLinkedData() && !sameBinding && !FbmSync.bindingCanUpgradeUsername(previous, nextIdentity) && (previous.spreadsheetId || cleared.spreadsheetId);
  if (rebindBlocked) {
    return { ok: false, code: 'REBIND_REQUIRED', message: 'Spreadsheet còn dữ liệu đã liên kết FBM; xử lý dữ liệu cũ rồi kiểm tra lại trước khi đổi tài khoản.' };
  }
  var saved = { spreadsheetId: spreadsheetId, userId: userId, username: username, accountName: accountName, updatedAt: Date.now() };
  var props = FbmSync.props();
  props.setProperty(FbmSync.BINDING_KEY, JSON.stringify(saved));
  if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.BINDING_CLEAR_KEY); }
  return { ok: true, binding: { spreadsheetId: saved.spreadsheetId, userId: saved.userId, username: saved.username, accountName: saved.accountName, updatedAt: saved.updatedAt } };
};
/* Lưu cả nhận diện và credential dưới cùng lock; không để hệ thống rơi vào trạng thái nửa A nửa B. */
FbmSync.connectionSave = function (input) {
  var value = input || {}, binding = value.binding || {}, credential = value.credential || {}, props = FbmSync.props();
  var loginKey = FbmSync.LOGIN_CONFIG_KEY || 'FBM_LOGIN_CONFIG_V1', oldBindingRaw = props.getProperty(FbmSync.BINDING_KEY), oldLoginRaw = props.getProperty(loginKey), oldClearRaw = props.getProperty(FbmSync.BINDING_CLEAR_KEY);
  var identity = { spreadsheetId: String(binding.spreadsheetId || '').trim(), userId: String(binding.userId || '').trim(), username: String(binding.username || '').trim(), accountName: String(binding.accountName || '').trim() };
  var allEmpty = !identity.spreadsheetId && !identity.userId && !identity.username && !identity.accountName;
  if (!allEmpty && (!identity.spreadsheetId || !identity.userId || !identity.username || !identity.accountName)) {
    return { ok: false, code: 'IDENTITY_BINDING_INCOMPLETE', message: 'Thiếu SpreadsheetId, mã số user, tên đăng nhập hoặc tên đầy đủ FBM.' };
  }
  var previous = FbmSync.bindingRead(), changed = !previous.spreadsheetId || allEmpty || previous.spreadsheetId !== identity.spreadsheetId || previous.userId !== identity.userId || String(previous.username || '') !== identity.username || previous.accountName !== identity.accountName;
  var mode = String(credential.mode || 'preserve');
  if (['preserve', 'save', 'clear'].indexOf(mode) < 0) { return { ok: false, code: 'LOGIN_CREDENTIAL_MODE_INVALID', message: 'Cách lưu credential không hợp lệ.' }; }
  if (mode === 'save' && allEmpty) { return { ok: false, code: 'IDENTITY_BINDING_REQUIRED', message: 'Phải có nhận diện tài khoản trước khi lưu credential.' }; }
  if (changed && mode === 'preserve' && credential.keepOnIdentityChange !== true) { mode = 'clear'; }
  try {
    var bindingResult = allEmpty ? FbmSync.bindingClear() : FbmSync.bindingWrite(identity);
    if (!bindingResult || bindingResult.ok === false) { return bindingResult; }
    var loginResult;
    if (mode === 'save') {
      if (typeof FbmSync.loginConfigSave !== 'function') { throw new Error('Kho credential chưa được nạp.'); }
      loginResult = FbmSync.loginConfigSave({ enabled: credential.enabled !== false, credentialRef: credential.credentialRef, envelope: credential.envelope, public: credential.public || {} });
      if (!loginResult || loginResult.ok === false) { throw new Error(loginResult && (loginResult.message || loginResult.code) || 'Không lưu được credential.'); }
    } else if (mode === 'clear' && typeof FbmSync.loginConfigClearCredential === 'function') {
      loginResult = FbmSync.loginConfigClearCredential();
    } else {
      loginResult = typeof FbmSync.loginConfigPublic === 'function' ? FbmSync.loginConfigPublic() : { ok: true };
    }
    return { ok: true, binding: allEmpty ? {} : bindingResult.binding, identityStatus: FbmSync.identityStatus(), login: loginResult, credentialMode: mode };
  } catch (error) {
    try {
      if (oldBindingRaw === null || oldBindingRaw === undefined || oldBindingRaw === '') { if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.BINDING_KEY); } else { props.setProperty(FbmSync.BINDING_KEY, ''); } }
      else { props.setProperty(FbmSync.BINDING_KEY, oldBindingRaw); }
      if (oldLoginRaw === null || oldLoginRaw === undefined || oldLoginRaw === '') { if (typeof props.deleteProperty === 'function') { props.deleteProperty(loginKey); } else { props.setProperty(loginKey, ''); } }
      else { props.setProperty(loginKey, oldLoginRaw); }
      if (oldClearRaw === null || oldClearRaw === undefined || oldClearRaw === '') { if (typeof props.deleteProperty === 'function') { props.deleteProperty(FbmSync.BINDING_CLEAR_KEY); } else { props.setProperty(FbmSync.BINDING_CLEAR_KEY, ''); } }
      else { props.setProperty(FbmSync.BINDING_CLEAR_KEY, oldClearRaw); }
    } catch (rollbackError) {}
    return { ok: false, code: 'CONNECTION_SAVE_ROLLED_BACK', message: String(error && error.message || error) };
  }
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
/**
 * Phép so danh tính duy nhất: trả lý do lệch giữa danh tính kỳ vọng và danh tính đang chạy, so nguyên văn (không trim, không đổi hoa thường).
 * So mọi trường mà danh tính đang chạy có mặt (`undefined` là bên gọi không muốn so trường đó), kể cả khi trường kỳ vọng trống: liên kết cũ thiếu tên đăng nhập phải ra lệch chứ không ra khớp. SpreadsheetId đang chạy trống thì không so, vì trống nghĩa là không đọc được file.
 */
FbmSync.identityMismatches = function (expected, runtime) {
  var want = expected || {}, got = runtime || {}, reasons = [];
  if (got.spreadsheetId && String(got.spreadsheetId) !== String(want.spreadsheetId || '')) { reasons.push('spreadsheet_mismatch'); }
  [['userId', 'user_mismatch'], ['username', 'username_mismatch'], ['accountName', 'account_mismatch']].forEach(function (pair) {
    if (got[pair[0]] !== undefined && String(got[pair[0]]) !== String(want[pair[0]] || '')) { reasons.push(pair[1]); }
  });
  return reasons;
};
/** Bản nháp kỳ vọng có thể điền dở (đăng nhập thử trước khi lưu liên kết): chỉ đưa vào phép so các trường bản nháp đã điền. */
FbmSync.identityFilledFields = function (expected, runtime) {
  var want = expected || {}, got = runtime || {}, picked = {};
  ['spreadsheetId', 'userId', 'username', 'accountName'].forEach(function (name) { if (want[name]) { picked[name] = got[name]; } });
  return picked;
};
/** Trạng thái liên kết của file đang chạy, kèm đối chiếu danh tính đang chạy (nếu đưa vào) với liên kết qua `identityMismatches`. */
FbmSync.identityStatus = function (runtime) {
  var actual = String((runtime && runtime.spreadsheetId) || FbmSync.currentSpreadsheetId() || ''), current = FbmSync.bindingRead(), incoming = runtime || {};
  var reasons = [];
  // Chỉ khi chưa có liên kết mới cần biết Sheet đã có ID FBM chưa; đã liên kết thì không đọc cả Sheet Customer/Activity mỗi lần Sidebar mở.
  if (!current.spreadsheetId) { if (FbmSync.bindingHasLinkedData()) { reasons.push('missing_binding_with_linked_data'); } }
  else { reasons = reasons.concat(FbmSync.identityMismatches(current, Object.assign({}, incoming, { spreadsheetId: actual }))); }
  var expectedId = String(FbmSync.configValue('FBM_SPREADSHEET_ID') || '');
  if (expectedId && actual && expectedId !== actual) { reasons.push('configured_spreadsheet_mismatch'); }
  var status = reasons.length ? 'REBIND_REQUIRED' : (current.spreadsheetId ? 'BOUND' : 'UNBOUND');
  return { ok: status !== 'REBIND_REQUIRED', status: status, code: status === 'REBIND_REQUIRED' ? 'REBIND_REQUIRED' : '', spreadsheetId: actual, binding: { spreadsheetId: current.spreadsheetId || '', userId: current.userId || '', username: current.username || '', accountName: current.accountName || '' }, reasons: reasons };
};
FbmSync.identityPreflight = function (mode) {
  var status = FbmSync.identityStatus(), identityRecovery = mode === 'identity_check' || mode === 'identity_probe';
  var blocking = !identityRecovery && status.status !== 'BOUND';
  var message = status.status === 'UNBOUND'
    ? 'Chưa có liên kết tài khoản FBM. Hãy tự động điền hoặc nhập thông tin rồi lưu liên kết trước khi chạy đồng bộ.'
    : status.status === 'REBIND_REQUIRED'
      ? 'Cần kiểm tra lại liên kết tài khoản FBM trước khi chạy đồng bộ.'
      : '';
  return { status: status, blocking: blocking, message: message };
};

/** Chuẩn bị bảng đối chiếu ID Customer mà không đưa danh sách lên Sidebar. */
FbmSync.identityCheckBegin = function (state) {
  var local = typeof FbmSync.readLocal === 'function' ? FbmSync.readLocal('customer') : [], sample = [], target = state.identityTarget || {};
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
    spreadsheetId: String(target.spreadsheetId || ''), userId: String(target.userId || state.session && state.session.userId || ''), username: String(target.username || ''), accountName: String(target.accountName || state.session && state.session.accountName || '')
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

/**
 * Giá trị "Xác thực" cho khách mới kéo từ FBM, đọc từ ô Config. FBM không có trường này nên chỉ gán lúc tạo khách mới; khách đã có giữ giá trị của mình.
 * Preflight đã chặn ô trống hoặc giá trị không còn trong Category; ô trống mà vẫn tới đây thì ném lỗi chứ không ghi chuỗi đoán.
 */
FbmSync.pullVerifyStatus = function () {
  var value = String(configGet(FBM_VERIFY_STATUS_CONFIG_NAME, '') || '').trim();
  if (!value) { var error = new Error('Chưa chọn giá trị Xác thực mặc định cho khách kéo từ FBM (Config ' + FBM_VERIFY_STATUS_CONFIG_NAME + ').'); error.code = 'FBM_VERIFY_STATUS_DEFAULT_MISSING'; throw error; }
  return value;
};

/** Đổi record Customer FBM sang schema nội bộ của Sheet. */
FbmSync.customerRecord = function (fbm, categoryGate) {
  var record = { companyName: fbm.ten_kh || '', taxNumber: fbm.ma_so_thue || '', phone: fbm.dien_thoai || '', email: fbm.email || '', address: fbm.dc_lh || '', province: fbm.ten_dclh_tinh || fbm.dc_lh_tinh || '', website: fbm.website || '', contactPerson: fbm.ong_ba || '', leadSource: fbm.ten_nguon_dm || fbm.nguon_dm || '', fbmSyncPermission: FbmSync.pullDefaultPermission(), fbmCustomerCode: fbm.ma_kh || '', fbmId: fbm.stt_rec_kh || '', syncedAt: new Date(), syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'customer', categoryGate);
  return record;
};
/** Đổi record Activity FBM sang schema nội bộ của Sheet. */
FbmSync.activityRecord = function (fbm, categoryGate, parent) {
  var parentCode = fbm.ma_kh || (parent && (parent.ma_kh || parent.maKh)) || '';
  // `customerFbmId` là `stt_rec_kh` của khách vừa đọc, khóa nối khách cha; mã khách `ma_kh` chỉ để hiển thị vì có thể đổi hoặc trùng.
  var details = fbm.details || '', record = { customerId: parentCode, customerFbmCode: parentCode, customerFbmId: String(parent && parent.sttRec || '').trim(), workDate: fbm.end_date || '', taskType: fbm.ten_cv || fbm.ma_cv || '', content: FbmSync.stripActivityMarker(details), markerId: FbmSync.activityMarkerId(details), owner: fbm.owner || '', enteredBy: fbm.owner || '', fbmSyncPermission: FbmSync.pullDefaultPermission(), fbmId: fbm.id || '', syncedAt: new Date(), syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'activity', categoryGate);
  return record;
};

/** Nối Activity FBM vào mã Customer nội bộ theo `stt_rec_kh` của khách đã đọc (09/05 Phần 9), không qua `ma_kh`, và giữ hash ổn định sau khi đổi khóa ngoại. */
FbmSync.linkActivityCustomers = function (records, customers, categoryGate) {
  var byFbm = {}, orphaned = 0, blocked = 0;
  (customers || []).forEach(function (customer) {
    var fbmId = String(customer.fbmId || '').trim();
    if (fbmId) { byFbm[fbmId] = customer; }
  });
  var linked = (records || []).map(function (record) {
    var customerCode = String(record.customerFbmCode || '').trim(), customer = byFbm[String(record.customerFbmId || '').trim()];
    if (!customer) {
      orphaned += 1;
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, null, FbmSync.SYNC_STATUS.skipped, 'Không tìm thấy Customer cha trong ShinCRM.', { issue: true }); }
      return null;
    }
    var parentPermission = FbmSync.syncPermission(customer, 'customer');
    if (!parentPermission.pull) {
      blocked += 1;
      if (FbmSync.logPullRecord) { FbmSync.logPullRecord('activity', record, customer, FbmSync.SYNC_STATUS.skipped, 'Customer cha ' + String(customer.id || '') + ' không cho phép lấy từ FBM: ' + parentPermission.reason, { issue: parentPermission.invalid }); }
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
    ? ['note', 'fbmSyncPermission', 'verifyStatus', 'customerGroup', 'searchAliases', 'bidClosingDate']
    : ['fbmSyncPermission', 'contractValue', 'priority', 'dueAt'];
  var merged = Object.assign({}, incoming);
  fields.forEach(function (field) {
    if (current && Object.prototype.hasOwnProperty.call(current, field)) { merged[field] = current[field]; }
    else { delete merged[field]; }
  });
  return merged;
};
