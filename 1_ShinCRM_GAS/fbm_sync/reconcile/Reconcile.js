/** Chuẩn hóa, fingerprint và ghi pull có kiểm tra thay đổi cục bộ. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chuẩn hóa chuỗi, dòng mới và ngày .NET về cùng một dạng so sánh. */
FbmSync.normalize = function (value) {
  if (value === null || value === undefined) { return ''; }
  if (value instanceof Date) { return value.toISOString(); }
  var text = String(value).replace(/\r\n/g, '\n').replace(/\r/g, '\n').trim();
  if (/^\/Date\(-?\d+(?:[+-]\d+)?\)\/$/.test(text)) {
    var ms = Number(text.replace(/[^\d-]/g, ''));
    if (!isNaN(ms) && new Date(ms).getFullYear() <= 1900) { return ''; }
    if (!isNaN(ms)) { return new Date(ms).toISOString(); }
  }
  return text;
};

/** Bỏ dấu nhận diện do ShinCRM gắn vào Activity trước khi so fingerprint. */
FbmSync.stripActivityMarker = function (value) {
  return String(value === null || value === undefined ? '' : value).replace(FbmSync.ACTIVITY_MARKER_RE, '').trim();
};

/** Chọn đúng field FBM để fingerprint, bỏ qua các alias chỉ dùng hiển thị. */
FbmSync.canonical = function (entity, record) {
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
    result[alias] = FbmSync.normalize(raw);
  });
  return result;
};

/** Tạo fingerprint ổn định, độc lập với thứ tự thuộc tính. */
FbmSync.hash = function (record, entity) {
  var value = entity ? FbmSync.canonical(entity, record || {}) : record || {};
  var keys = Object.keys(value).sort();
  var text = keys.map(function (key) { return key + '=' + FbmSync.normalize(value[key]); }).join('\u001f');
  var hash = 2166136261;
  for (var i = 0; i < text.length; i++) { hash ^= text.charCodeAt(i); hash = (hash * 16777619) >>> 0; }
  return ('00000000' + hash.toString(16)).slice(-8);
};

/** Đối chiếu baseline, Sheet và FBM để phát hiện thay đổi hoặc conflict. */
FbmSync.threeWay = function (base, shin, fbm, entity) {
  // Baseline rỗng vẫn có nghĩa; hai giá trị đầu tiên khác nhau là conflict.
  var hBase = base && Object.prototype.hasOwnProperty.call(base, 'hBASE') ? String(base.hBASE || '') : FbmSync.hash(base || {}, entity);
  var hShin = shin && Object.prototype.hasOwnProperty.call(shin, 'hSHIN') ? String(shin.hSHIN || '') : FbmSync.hash(shin || {}, entity);
  var hFbm = fbm && Object.prototype.hasOwnProperty.call(fbm, 'hFBM') ? String(fbm.hFBM || '') : FbmSync.hash(fbm || {}, entity);
  return { hBASE: hBase, hSHIN: hShin, hFBM: hFbm, unchanged: hShin === hBase && hFbm === hBase, shinChanged: hShin !== hBase, fbmChanged: hFbm !== hBase, conflict: hShin !== hBase && hFbm !== hBase && hShin !== hFbm };
};

/** Đổi record Customer FBM sang schema nội bộ của Sheet. */
FbmSync.customerRecord = function (fbm) {
  var record = { companyName: fbm.ten_kh || '', taxNumber: fbm.ma_so_thue || '', phone: fbm.dien_thoai || '', email: fbm.email || '', address: fbm.dc_lh || '', province: fbm.dc_lh_tinh || fbm.ten_dclh_tinh || '', website: fbm.website || '', contactPerson: fbm.ong_ba || '', leadSource: fbm.nguon_dm || fbm.ten_nguon_dm || '', fbmCustomerCode: fbm.ma_kh || '', fbmId: fbm.stt_rec_kh || '', syncedAt: new Date(), syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'customer');
  return record;
};
/** Đổi record Activity FBM sang schema nội bộ của Sheet. */
FbmSync.activityRecord = function (fbm) {
  var record = { customerId: fbm.ma_kh || '', workDate: fbm.end_date || '', taskType: fbm.ma_cv || fbm.ten_cv || '', content: FbmSync.stripActivityMarker(fbm.details || ''), owner: fbm.owner || '', fbmId: fbm.id || '', syncStatus: FbmSync.SYNC_STATUS.synced };
  record.fbmHash = FbmSync.hash(fbm, 'activity');
  return record;
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
  var local = {};
  FbmSync.readLocal(entity).forEach(function (record) { if (record.fbmId) { local[String(record.fbmId).trim()] = record; } });
  var writes = [], statusWrites = [], conflicts = 0, skipped = 0;
  records.forEach(function (incoming) {
    var key = String(incoming.fbmId || '').trim();
    var current = local[key];
    if (!current) { writes.push(incoming); return; }
    if (String(current.syncStatus || '') === FbmSync.SYNC_STATUS.pushed) {
      var pushedEqual = FbmSync.hash(current, entity) === FbmSync.hash(incoming, entity);
      if (pushedEqual) {
        writes.push(Object.assign({}, incoming, { id: current.id, fbmHash: FbmSync.hash(incoming, entity), syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
      } else {
        statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
        conflicts += 1;
      }
      return;
    }
    var decision = FbmSync.threeWay({ hBASE: current.fbmHash || '' }, current, incoming, entity);
    if (decision.conflict) {
      conflicts += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.conflict });
      return;
    }
    if (decision.shinChanged && !decision.fbmChanged) {
      skipped += 1;
      statusWrites.push({ id: current.id, syncStatus: FbmSync.SYNC_STATUS.pending });
      return;
    }
    writes.push(Object.assign({}, incoming, { id: current.id, fbmHash: decision.hFBM, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() }));
  });
  var result = { ok: true, written: 0, conflicts: conflicts, skipped: skipped };
  var schemas = [DATA_SCHEMA, SYNC_SCHEMA];
  if (writes.length) {
    var saved = writeGateSave({ entity: entity, records: writes, source: 'pull', schemas: schemas });
    result.ok = !!saved.ok; result.written = saved.ok ? writes.length : 0; result.writeResult = saved;
  }
  if (statusWrites.length && result.ok) {
    var statuses = writeGateSave({ entity: entity, records: statusWrites, source: 'pull', schemas: schemas });
    result.ok = result.ok && !!statuses.ok; result.statusResult = statuses;
  }
  return result;
};

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
  var showing = data && (data.Showing || data.showing);
  if (showing && showing._ticket !== undefined) { values.fileticket = showing._ticket; }
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
  if (entity === 'activity') {
    FbmSync.readLocal('customer').forEach(function (customer) { customers[String(customer.id || '')] = customer; });
  }
  return records.filter(function (record) {
    if (String(record.recordStatus || 'active') === 'deleted') { return false; }
    var customer = entity === 'activity' ? customers[String(record.customerId || '')] : null;
    if (!FbmSync.pushPermission(record, entity, customer).push) { return false; }
    if (String(record.syncStatus || '') === FbmSync.SYNC_STATUS.pushed) { return false; }
    var currentHash = FbmSync.hash(record, entity);
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
