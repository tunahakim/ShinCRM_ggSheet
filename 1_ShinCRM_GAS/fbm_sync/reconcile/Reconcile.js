/** Chuẩn hóa, fingerprint và ghi pull có kiểm tra thay đổi cục bộ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa chuỗi, dòng mới và ngày .NET về cùng một dạng so sánh. */
FbmSync.normalize = function (value) {
  if (value === null || value === undefined) { return ''; }
  if (value instanceof Date) { return value.toISOString(); }
  var text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (/^\/Date\(-?\d+(?:[+-]\d+)?\)\/$/.test(text)) {
    var ms = Number(text.replace(/[^\d-]/g, ''));
    if (!isNaN(ms) && FbmSync.isEmptyFbmDate(new Date(ms))) { return ''; }
    if (!isNaN(ms)) { return new Date(ms).toISOString(); }
  }
  return text;
};

/** FBM dùng hai mốc giả cho ô ngày chưa có giá trị. */
FbmSync.isEmptyFbmDate = function (value) {
  if (!(value instanceof Date) || isNaN(value.getTime())) { return false; }
  var year = value.getUTCFullYear(), month = value.getUTCMonth(), day = value.getUTCDate();
  return year <= 1900 || (year === 1999 && month === 0 && day === 1);
};

/** Chuẩn hóa ngày làm việc theo ngày Việt Nam, không để giờ FBM gây lệch hash. */
FbmSync.normalizeFingerprintValue = function (entity, field, value) {
  if (entity === 'activity' && field === 'end_date') {
    var date = value instanceof Date ? value : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(value) : value);
    if (date instanceof Date && !FbmSync.isEmptyFbmDate(date)) {
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
  var date = record && record.workDate instanceof Date ? record.workDate : (typeof FbmSync.fbDate === 'function' ? FbmSync.fbDate(record && record.workDate) : record && record.workDate);
  var floor = new Date(since);
  if (!(date instanceof Date) || isNaN(date.getTime()) || isNaN(floor.getTime())) { return true; }
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
  state.counts.conflict = Math.max(0, Number(state.counts.conflict || 0) - 1);
  state.phase = state.metadata.conflicts.length ? 'conflict' : (state.phase === 'conflict' ? 'done' : state.phase);
  state.message = 'Đã quyết conflict ' + entity + ' ' + target + ' theo ' + choice + '.';
  FbmSync.stateWrite(state);
  return { ok: true, entity: entity, id: target, choice: choice, status: FbmSync.SYNC_STATUS.synced };
};

/** Hợp nhất định danh FBM theo mã khách, tránh tạo dòng trùng khi stt_rec_kh đổi. */
FbmSync.findCustomerByIdentity = function (localById, localByCode, incoming) {
  var key = String(incoming && incoming.fbmId || '').trim(), code = String(incoming && incoming.fbmCustomerCode || '').trim();
  if (key && localById[key]) { return localById[key]; }
  if (code && localByCode[code] && localByCode[code].length === 1) { return localByCode[code][0]; }
  return null;
};

/** Đánh dấu bản ghi local vắng khỏi một lượt quét full; không suy ra xóa FBM. */
FbmSync.markMissingAfterFullScan = function (entity, state) {
  var settings = typeof FbmSync.scriptSettings === 'function' ? FbmSync.scriptSettings() : {};
  if (!state || state.mode !== 'write' || String(settings.testCustomerCode || '').trim()) { return { written: 0, skipped: true }; }
  var seen = state.metadata && state.metadata.seen && state.metadata.seen[entity] || {}, local = FbmSync.readLocal(entity), missing = [];
  local.forEach(function (record) {
    var fbmId = String(record.fbmId || '').trim();
    if (!fbmId || seen[fbmId] || String(record.recordStatus || 'active') === 'deleted') { return; }
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
  var local = {}, localById = {}, localByCode = {};
  FbmSync.readLocal(entity).forEach(function (record) {
    if (record.fbmId) { local[String(record.fbmId).trim()] = record; localById[String(record.fbmId).trim()] = record; }
    if (record.id) { localById[String(record.id).trim()] = record; }
    if (entity === 'customer' && record.fbmCustomerCode) { var code = String(record.fbmCustomerCode).trim(); (localByCode[code] || (localByCode[code] = [])).push(record); }
  });
  var writes = [], statusWrites = [], conflicts = 0, skipped = 0;
  records.filter(function (incoming) { return !FbmSync.isTemporaryRecord(entity, incoming); }).forEach(function (incoming) {
    var key = String(incoming.fbmId || '').trim();
    var current = local[key];
    var identityMatched = false;
    if (entity === 'customer' && !current) {
      current = FbmSync.findCustomerByIdentity(localById, localByCode, incoming);
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
        if (String(marked.fbmId || '').trim() && String(marked.fbmId).trim() !== key) {
          conflicts += 1;
          statusWrites.push({ id: marked.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
        } else {
          writes.push(Object.assign({}, incoming, { id: marked.id, fbmId: key, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: '' }));
        }
        return;
      }
      if (markerId) { skipped += 1; return; }
    }
    var mergedIncoming = current ? FbmSync.preserveLocalFields(entity, current, incoming) : incoming;
    if (current && FbmSync.pushPermission && FbmSync.pushPermission(current, entity).stop) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.skipped });
      return;
    }
    var categoryErrors = typeof FbmSync.validateIncomingCategories === 'function' ? FbmSync.validateIncomingCategories(incoming, entity, categoryGate) : [];
    if (entity === 'activity' && !String(incoming.workDate || '').trim()) {
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
      var pushedEqual = FbmSync.hash(current, entity, categoryGate) === FbmSync.hash(incoming, entity, categoryGate);
      if (pushedEqual) {
        writes.push(Object.assign({}, mergedIncoming, { id: current.id, fbmHash: FbmSync.hash(incoming, entity, categoryGate), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
      } else {
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
        conflicts += 1;
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
  (data.InternalValues || []).forEach(function (item) { if (item && item.Name) { values[item.Name] = item.NewValue; } });
  return values;
};

/** Lấy OldValue và ticket từ response mở form; ticket phải quay lại khi sửa Activity. */
FbmSync.extractFormValues = function (response) {
  var parsed = FbmSync.protocol.parse(response) || {}, data = parsed.d || parsed, values = FbmSync.extractInternalValues(response);
  if (typeof data === 'string') { data = FbmSync.protocol.parse(data) || {}; }
  var row = data && (data.Row || data.row);
  var rowFields = data && data.Controller === FbmSync.CONTROLLERS.activity ? FbmSync.ACTIVITY_FORM_ROW_FIELDS : FbmSync.CUSTOMER_FORM_ROW_FIELDS;
  if (Array.isArray(row)) {
    rowFields.forEach(function (name, index) { if (name && row[index] !== undefined && row[index] !== null) { values[name] = FbmSync.fbDate(row[index]); } });
  }
  var showing = data && (data.Showing || data.showing);
  if (showing && typeof showing === 'object' && showing._ticket !== undefined) { values.fileticket = showing._ticket; }
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
  var records = FbmSync.readLocal(entity), customers = {};
  var categoryGate = {};
  var testCustomerCode = '';
  try { categoryGate = FbmSync.stateRead().metadata.categoryGate || (typeof FbmSync.readCategoryGate === 'function' ? FbmSync.readCategoryGate() : {}); } catch (ignore) {}
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
    if (String(record.syncStatus || '') === FbmSync.SYNC_STATUS.pushed) { return false; }
    var currentHash = FbmSync.hash(record, entity, categoryGate);
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
