/** Chuẩn hóa, fingerprint và ghi pull có kiểm tra thay đổi cục bộ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa chuỗi, dòng mới và ngày .NET về cùng một dạng so sánh. */
FbmSync.isDate = function (value) { return Object.prototype.toString.call(value) === '[object Date]'; };
FbmSync.normalize = function (value) {
  if (value === null || value === undefined) { return ''; }
  if (FbmSync.isDate(value)) { return isNaN(value.getTime()) ? '' : value.toISOString(); }
  var text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  var dateMatch = text.match(/^\/Date\((-?\d+)(?:[+-]\d+)?\)\/$/);
  if (dateMatch) {
    var ms = Number(dateMatch[1]), date = new Date(ms);
    if (!isFinite(ms) || isNaN(date.getTime()) || FbmSync.isEmptyFbmDate(date)) { return ''; }
    return date.toISOString();
  }
  return text;
};

/** FBM dùng hai mốc giả cho ô ngày chưa có giá trị. */
FbmSync.isEmptyFbmDate = function (value) {
  if (!FbmSync.isDate(value) || isNaN(value.getTime())) { return false; }
  // Mốc 1999 tính theo ngày Việt Nam, không theo nửa đêm UTC.
  var localDate = new Date(value.getTime() + 7 * 60 * 60 * 1000), year = localDate.getUTCFullYear(), month = localDate.getUTCMonth(), day = localDate.getUTCDate();
  return year <= 1900 || (year === 1999 && month === 0 && day === 1);
};

/** Chuẩn hóa ngày làm việc theo ngày Việt Nam, không để giờ FBM gây lệch hash. */
FbmSync.normalizeFingerprintValue = function (entity, field, value) {
  if (entity === 'activity' && field === 'end_date') {
    var date = FbmSync.isDate(value) ? value : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value);
    if (FbmSync.isDate(date) && !FbmSync.isEmptyFbmDate(date)) {
      return typeof Utilities !== 'undefined' && Utilities.formatDate ? Utilities.formatDate(date, 'Asia/Ho_Chi_Minh', 'yyyy-MM-dd') : new Date(date.getTime() + 7 * 60 * 60 * 1000).toISOString().slice(0, 10);
    }
  }
  return FbmSync.normalize(value);
};

/** Bỏ lịch sử Activity trước mốc cấu hình mà không coi đó là bản ghi bị mất. */
FbmSync.activitySinceAllows = function (record, state) {
  var since = '';
  try { since = String(FbmSync.scriptSettings().activitySince || '').trim(); } catch (ignore) {}
  if (!since) { return true; }
  var date = record && FbmSync.isDate(record.workDate) ? record.workDate : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(record && record.workDate) : record && record.workDate);
  var floor = new Date(since);
  if (!FbmSync.isDate(date) || isNaN(date.getTime()) || isNaN(floor.getTime())) { return true; }
  return date.getTime() >= floor.getTime();
};

/** Bỏ dấu nhận diện do ShinCRM gắn vào Activity trước khi so fingerprint. */
FbmSync.stripActivityMarker = function (value) {
  return String(value === null || value === undefined ? '' : value).replace(FbmSync.ACTIVITY_MARKER_RE, '').trim();
};

/** Lấy mã Activity nội bộ từ dấu nhận diện để khôi phục phản hồi bị mất. */
FbmSync.activityMarkerId = function (value) {
  var match = String(value === null || value === undefined ? '' : value).match(FbmSync.ACTIVITY_MARKER_RE);
  return match ? String(match[1]).trim() : '';
};

/** Chọn đúng field FBM để fingerprint, bỏ qua các alias chỉ dùng hiển thị. */
FbmSync.canonical = function (entity, record, categoryGate) {
  // So sánh bằng tên field FBM để đổi tên cột Sheet không đổi baseline.
  var aliases = FbmSync.FIELD_ALIASES[entity] || {};
  var result = {};
  (FbmSync.FINGERPRINT_FIELDS[entity] || []).forEach(function (alias) {
    var key = alias;
    var syncKey = (entity === 'customer' && alias === 'stt_rec_kh') ? 'fbmId' : (entity === 'customer' && alias === 'ma_kh') ? 'fbmCustomerCode' : (entity === 'activity' && alias === 'id') ? 'fbmId' : '';
    if (syncKey) { key = syncKey; }
    else {
      Object.keys(aliases).some(function (localName) {
        if (aliases[localName] === alias) { key = localName; return true; }
        return false;
      });
    }
    var raw = FbmSync.value(record, key, FbmSync.value(record, alias, ''));
    if (entity === 'activity' && alias === 'details') { raw = FbmSync.stripActivityMarker(raw); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'dc_lh_tinh') { raw = FbmSync.value(record, 'ten_dclh_tinh', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'customer' && alias === 'nguon_dm') { raw = FbmSync.value(record, 'ten_nguon_dm', ''); }
    if ((raw === '' || raw === null || raw === undefined) && entity === 'activity' && alias === 'ma_cv') { raw = FbmSync.value(record, 'ten_cv', ''); }
    // FBM dùng id=0 cho Activity chưa lưu; đây không phải định danh ổn định.
    if (entity === 'activity' && alias === 'id' && (raw === 0 || String(raw).trim() === '0')) { raw = ''; }
    // Fingerprint SELECT values in FBM-code space, never display-name space.
    var toFbmCode = typeof FbmSync.categoryCode === 'function' ? FbmSync.categoryCode : function (gate, source, value) { return value; };
    if (entity === 'customer' && alias === 'dc_lh_tinh') { raw = toFbmCode(categoryGate || {}, '@CAT_TINH_THANH', raw); }
    if (entity === 'customer' && alias === 'nguon_dm') { raw = toFbmCode(categoryGate || {}, '@CAT_NGUON_KH', raw); }
    if (entity === 'customer' && alias === 'ma_sp') { raw = toFbmCode(categoryGate || {}, '@CAT_SAN_PHAM', raw); }
    if (entity === 'activity' && alias === 'ma_cv') { raw = toFbmCode(categoryGate || {}, '@CAT_CONG_VIEC', raw); }
    if (entity === 'activity' && alias === 'ma_sp') { raw = toFbmCode(categoryGate || {}, '@CAT_SAN_PHAM', raw); }
    result[alias] = FbmSync.normalizeFingerprintValue(entity, alias, raw);
  });
  return result;
};

/** Tạo fingerprint ổn định, độc lập với thứ tự thuộc tính. */
FbmSync.hash = function (record, entity, categoryGate) {
  var value = entity ? FbmSync.canonical(entity, record || {}, categoryGate) : record || {};
  var keys = Object.keys(value).sort();
  var text = keys.map(function (key) { return key + '=' + FbmSync.normalize(value[key]); }).join('\u001f');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return ('00000000' + hash.toString(16)).slice(-8);
};

/** Đối chiếu baseline, Sheet và FBM để phát hiện thay đổi hoặc conflict. */
FbmSync.threeWay = function (base, shin, fbm, entity, categoryGate) {
  // Baseline rỗng vẫn có nghĩa; hai giá trị đầu tiên khác nhau là conflict.
  var hBase = base && Object.prototype.hasOwnProperty.call(base, 'hBASE') ? String(base.hBASE || '') : FbmSync.hash(base || {}, entity);
  var hShin = shin && Object.prototype.hasOwnProperty.call(shin, 'hSHIN') ? String(shin.hSHIN || '') : FbmSync.hash(shin || {}, entity, categoryGate);
  var hFbm = fbm && Object.prototype.hasOwnProperty.call(fbm, 'hFBM') ? String(fbm.hFBM || '') : FbmSync.hash(fbm || {}, entity, categoryGate);
  return { hBASE: hBase, hSHIN: hShin, hFBM: hFbm, unchanged: hShin === hBase && hFbm === hBase, shinChanged: hShin !== hBase, fbmChanged: hFbm !== hBase, conflict: hShin !== hBase && hFbm !== hBase && hShin !== hFbm };
};

/** Trả về các field khác nhau để màn hình conflict không phải đoán từ ba hash. */
FbmSync.diff = function (entity, left, right, categoryGate) {
  var a = FbmSync.canonical(entity, left || {}, categoryGate), b = FbmSync.canonical(entity, right || {}, categoryGate), fields = [];
  Object.keys(a).sort().forEach(function (field) { if (a[field] !== b[field]) { fields.push({ field: field, left: a[field], right: b[field] }); } });
  return fields;
};

/** Ghi conflict có giới hạn vào state để người dùng xem và quyết định sau. */
FbmSync.rememberConflict = function (state, entity, current, incoming, decision, categoryGate) {
  state.metadata = state.metadata || {};
  state.metadata.conflicts = Array.isArray(state.metadata.conflicts) ? state.metadata.conflicts : [];
  state.metadata.conflicts.push({ entity: entity, id: String(current && current.id || ''), fbmId: String(incoming && incoming.fbmId || current && current.fbmId || ''), hBASE: decision.hBASE, hSHIN: decision.hSHIN, hFBM: decision.hFBM, fields: FbmSync.diff(entity, current, incoming, categoryGate), shinRecord: Object.assign({}, current || {}), fbmRecord: Object.assign({}, incoming || {}), at: Date.now() });
  state.locks = state.locks || {};
  state.locks[entity + ':' + String(current && current.id || '')] = { revision: String(decision.hSHIN || ''), owner: 'sync', reason: 'conflict', at: Date.now() };
  if (state.metadata.conflicts.length > 100) { state.metadata.conflicts = state.metadata.conflicts.slice(-100); }
};

/** Chốt conflict theo phía được chọn; baseline mới chỉ ghi sau quyết định rõ ràng. */
FbmSync.resolveConflict = function (entity, id, choice, merged) {
  var state = FbmSync.stateRead(), conflicts = state.metadata && state.metadata.conflicts || [], target = String(id || '').trim(), item = conflicts.filter(function (entry) { return entry.entity === entity && String(entry.id) === target; })[0];
  if (!item) { return { ok: false, code: 'CONFLICT_NOT_FOUND', message: 'Không tìm thấy conflict cần xử lý.' }; }
  var record;
  if (choice === 'fbm') { record = Object.assign({}, item.fbmRecord); }
  else if (choice === 'shin') { record = Object.assign({}, item.shinRecord); }
  else if (choice === 'manual' && merged && typeof merged === 'object') { record = Object.assign({}, item.shinRecord, merged); }
  else { return { ok: false, code: 'CONFLICT_CHOICE_INVALID', message: 'Cách xử lý conflict không hợp lệ.' }; }
  record.id = target;
  record.fbmHash = choice === 'fbm' ? item.hFBM : (choice === 'shin' ? item.hSHIN : FbmSync.hash(record, entity, state.metadata.categoryGate || {}));
  record.syncStatus = FbmSync.SYNC_STATUS.synced;
  if (typeof writeGateSave !== 'function') { return { ok: false, code: 'WRITE_GATE_UNAVAILABLE', message: 'Không có cửa ghi để chốt conflict.' }; }
  var saved = writeGateSave({ entity: entity, records: [record], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { return { ok: false, code: 'CONFLICT_WRITE_FAILED', result: saved }; }
  state.metadata.conflicts = conflicts.filter(function (entry) { return entry !== item; });
  var lockKey = entity + ':' + target;
  if (state.locks && state.locks[lockKey] && state.locks[lockKey].owner === 'sync') { delete state.locks[lockKey]; }
  state.counts.conflict = Math.max(0, Number(state.counts.conflict || 0) - 1);
  state.phase = state.metadata.conflicts.length ? 'conflict' : (state.phase === 'conflict' ? 'done' : state.phase);
  state.message = 'Đã quyết conflict ' + entity + ' ' + target + ' theo ' + choice + '.';
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: target, choice: choice, status: FbmSync.SYNC_STATUS.synced };
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
FbmSync.linkActivityCustomers = function (records, customers, categoryGate) {
  var byFbm = {}, orphaned = 0, blocked = 0;
  (customers || []).forEach(function (customer) {
    var code = String(customer.fbmCustomerCode || '').trim();
    if (code) { byFbm[code] = customer; }
  });
  var linked = (records || []).map(function (record) {
    var customerCode = String(record.customerFbmCode || record.customerId || '').trim(), customer = byFbm[customerCode];
    if (!customer) { orphaned += 1; return null; }
    if (FbmSync.pushPermission && FbmSync.pushPermission(customer, 'customer').stop) { blocked += 1; return null; }
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

/** Đọc dữ liệu cục bộ kèm cột sync để phục vụ reconcile. */
FbmSync.readLocal = function (entity) {
  var block = typeof entityReadAllCombined === 'function' ? entityReadAllCombined(entity, [DATA_SCHEMA, SYNC_SCHEMA]) : entityReadAll(entity);
  return block.rows.map(function (row) {
    var record = {};
    block.fields.forEach(function (field, index) { record[field] = row[index]; });
    return record;
  });
};

/** Pull chỉ ghi record mới/thay đổi an toàn; không bao giờ xóa. */
FbmSync.pullWrite = function (entity, records) {
  // Pull không ghi đè thay đổi cục bộ; chỉ đánh dấu pending hoặc conflict.
  if (!records || !records.length) { return { ok: true, written: 0, conflicts: 0, skipped: 0 }; }
  var state = FbmSync.stateRead();
  var orphaned = 0;
  var categoryGate = state.metadata && state.metadata.categoryGate || {};
  var sourceRecords = records;
  if (entity === 'activity') {
    state.metadata = state.metadata || {};
    state.metadata.seen = state.metadata.seen || { customer: {}, activity: {} };
    (sourceRecords || []).forEach(function (incoming) { var sourceId = String(incoming && incoming.fbmId || '').trim(); if (sourceId) { state.metadata.seen.activity[sourceId] = true; } });
    records = (sourceRecords || []).filter(function (incoming) { return FbmSync.activitySinceAllows(incoming, state); });
  }
  if (entity === 'activity') {
    var linked = FbmSync.linkActivityCustomers(records, FbmSync.readLocal('customer'), categoryGate);
    records = linked.records;
    orphaned = linked.orphaned + Number(linked.blocked || 0);
  }
  var local = {}, localById = {}, localByCode = {}, localByTaxNumber = {};
  FbmSync.readLocal(entity).forEach(function (record) {
    if (record.fbmId) { local[String(record.fbmId).trim()] = record; localById[String(record.fbmId).trim()] = record; }
    if (record.id) { localById[String(record.id).trim()] = record; }
    if (entity === 'customer' && record.fbmCustomerCode) { var code = String(record.fbmCustomerCode).trim(); (localByCode[code] || (localByCode[code] = [])).push(record); }
    if (entity === 'customer') { var tax = FbmSync.customerTaxKey(record.taxNumber || record.ma_so_thue); if (tax) { (localByTaxNumber[tax] || (localByTaxNumber[tax] = [])).push(record); } }
  });
  var writes = [], statusWrites = [], conflicts = 0, skipped = 0;
  records.filter(function (incoming) { return !FbmSync.isTemporaryRecord(entity, incoming); }).forEach(function (incoming) {
    var key = String(incoming.fbmId || '').trim();
    var current = local[key];
    var identityMatched = false;
    if (entity === 'customer' && !current) {
      var taxIssue = FbmSync.customerTaxIdentityIssue(localByTaxNumber, incoming);
      if (taxIssue) {
        skipped += 1;
        state.metadata = state.metadata || {};
        state.metadata.identityBlocks = Array.isArray(state.metadata.identityBlocks) ? state.metadata.identityBlocks : [];
        state.metadata.identityBlocks.push({ entity: 'customer', taxNumber: taxIssue.tax, fbmCustomerCode: String(incoming.fbmCustomerCode || ''), reason: taxIssue.reason, at: Date.now() });
        if (taxIssue.records.length === 1) { statusWrites.push({ id: taxIssue.records[0].id, syncStatus: FbmSync.SYNC_STATUS.error }); }
        return;
      }
      current = FbmSync.findCustomerByIdentity(localById, localByCode, incoming, localByTaxNumber);
      if (current) { local[key] = current; identityMatched = String(current.fbmId || '').trim() !== key; }
    }
    if (key) {
      state.metadata = state.metadata || {};
      state.metadata.seen = state.metadata.seen || { customer: {}, activity: {} };
      state.metadata.seen[entity] = state.metadata.seen[entity] || {};
      state.metadata.seen[entity][key] = true;
    }
    if (entity === 'activity' && !current) {
      var markerId = String(incoming.markerId || '').trim(), marked = markerId ? localById[markerId] : null;
      if (marked) {
        var markedLock = state.locks && state.locks[entity + ':' + String(marked.id || '')];
        if (markedLock && markedLock.owner === 'user') { skipped += 1; return; }
        if (String(marked.fbmId || '').trim() && String(marked.fbmId).trim() !== key) {
          conflicts += 1;
          FbmSync.rememberConflict(state, entity, marked, incoming, { hBASE: String(marked.fbmHash || ''), hSHIN: FbmSync.hash(marked, entity, categoryGate), hFBM: FbmSync.hash(incoming, entity, categoryGate) }, categoryGate);
          statusWrites.push({ id: marked.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
        } else {
          writes.push(Object.assign({}, incoming, { id: marked.id, fbmId: key, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: '' }));
        }
        return;
      }
      if (markerId) { skipped += 1; return; }
    }
    var currentLock = current && state.locks && state.locks[entity + ':' + String(current.id || '')];
    if (currentLock && currentLock.owner === 'user') { skipped += 1; return; }
    var mergedIncoming = current ? FbmSync.preserveLocalFields(entity, current, incoming) : incoming;
    if (current && FbmSync.pushPermission && FbmSync.pushPermission(current, entity).stop) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.skipped });
      return;
    }
    var categoryErrors = typeof FbmSync.validateIncomingCategories === 'function' ? FbmSync.validateIncomingCategories(incoming, entity, categoryGate) : [];
    if (entity === 'activity' && (!String(incoming.workDate || '').trim() || (FbmSync.isDate(incoming.workDate) && isNaN(incoming.workDate.getTime())))) {
      skipped += 1;
      if (current) { statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.error }); }
      return;
    }
    if (!current) {
      // Mã lạ không được tạo dòng thiếu dữ liệu; người dùng bổ sung Category rồi chạy lại.
      if (categoryErrors.length) { skipped += 1; return; }
      writes.push(incoming);
      return;
    }
    if (categoryErrors.length) {
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.unknownCategory });
      skipped += 1;
      return;
    }
    if (identityMatched) {
      writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmId: key, fbmCustomerCode: incoming.fbmCustomerCode || current.fbmCustomerCode, fbmHash: FbmSync.hash(incoming, entity, categoryGate), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
      return;
    }
    if (String(current.syncStatus || '') === FbmSync.SYNC_STATUS.pushed) {
      var localHash = FbmSync.hash(current, entity, categoryGate), incomingHash = FbmSync.hash(incoming, entity, categoryGate), previousHash = String(current.fbmHash || '').trim();
      if (incomingHash === localHash) {
        writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
      } else if (previousHash && incomingHash === previousHash) {
        skipped += 1;
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.notApplied });
        state.locks = state.locks || {};
        state.locks[entity + ':' + String(current.id)] = { revision: localHash, owner: 'sync', reason: 'not_applied', at: Date.now() };
      } else {
        conflicts += 1;
        FbmSync.rememberConflict(state, entity, current, incoming, { hBASE: previousHash, hSHIN: localHash, hFBM: incomingHash }, categoryGate);
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
      }
      return;
    }
    var decision = FbmSync.threeWay({ hBASE: current.fbmHash || '' }, current, incoming, entity, categoryGate);
    if (decision.conflict) {
      conflicts += 1;
      FbmSync.rememberConflict(state, entity, current, incoming, decision, categoryGate);
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
      return;
    }
    if (decision.shinChanged && !decision.fbmChanged) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.pending });
      return;
    }
    writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: decision.hFBM, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
  });
  var result = { ok: true, written: 0, conflicts: conflicts, skipped: skipped + orphaned };
  var schemas = [DATA_SCHEMA, SYNC_SCHEMA];
  var allWrites = writes.concat(statusWrites);
  if (allWrites.length) {
    var saved = writeGateSave({ entity: entity, records: allWrites, source: 'pull', schemas: schemas });
    result.ok = !!saved.ok; result.written = saved.ok ? writes.length : 0; result.writeResult = saved;
  }
  if (typeof FbmSync.stateWrite === 'function') { FbmSync.stateWrite(state); }
  return result;
};

/** Tính lại baseline theo luật hiện tại; chỉ ghi cột sync, không gọi FBM. */
FbmSync.recalculateBaseline = function (entity) {
  var state = FbmSync.stateRead(), gate = state.metadata && state.metadata.categoryGate || {};
  var records = FbmSync.readLocal(entity), patches = records.filter(function (record) {
    return !FbmSync.isTemporaryRecord(entity, record) && String(record.fbmId || '').trim();
  }).map(function (record) {
    return { id: record.id, fbmHash: FbmSync.hash(record, entity, gate), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() };
  });
  if (!patches.length) { return { ok: true, written: 0, reason: 'Không có bản ghi đã liên kết để tính baseline.' }; }
  if (typeof writeGateSave !== 'function') { return { ok: false, written: 0, reason: 'Thiếu cửa ghi nội bộ.' }; }
  var saved = writeGateSave({ entity: entity, records: patches, source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  return { ok: !!(saved && saved.ok), written: saved && saved.ok ? patches.length : 0, result: saved };
};

/** Giữ tombstone có FBM ID; bản ghi chưa từng đẩy vẫn được xóa cứng bình thường. */
function beforeHardDelete(entity, id) {
  var target = String(id || '').trim(), records = FbmSync.readLocal(entity);
  var found = records.filter(function (record) { return String(record.id || '').trim() === target; })[0];
  if (found && String(found.fbmId || '').trim()) { return { allowed: false, reason: 'Bản ghi đã có ID FBM nên chỉ được xóa mềm để giữ tombstone.' }; }
  return { allowed: true, reason: '' };
}

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
    if (!FbmSync.pushPermission(record, entity, customer).push) { return false; }
    var status = String(record.syncStatus || ''), failureKey = entity + ':' + String(record.id || '');
    if (status === FbmSync.SYNC_STATUS.pushed || status === FbmSync.SYNC_STATUS.notApplied) { return false; }
    var currentHash = FbmSync.hash(record, entity, categoryGate);
    if (status === FbmSync.SYNC_STATUS.error && String(pushFailures[failureKey] || '') === currentHash) { return false; }
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
