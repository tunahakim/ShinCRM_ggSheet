/** Điều phối từng slice ở GAS; cursor luôn được lưu trước request kế tiếp. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Chỉ cho phép ghi khi caller chọn write và cờ an toàn đã bật. */
FbmSync.writeEnabled = function (mode) {
  if (mode !== 'write') { return false; }
  try { return PropertiesService.getScriptProperties().getProperty('FBM_SYNC_ALLOW_WRITES') === 'true'; } catch (err) { return false; }
};
/** Bọc request nội bộ thành envelope gửi qua Extension. */
FbmSync.nextEnvelope = function (request) {
  return request ? FbmSync.protocol.request(Date.now().toString(36), request.url, request.body, request.meta) : null;
};
/** Cập nhật state dùng chung cho các bước orchestration. */
FbmSync.saveStatus = function (patch) { return FbmSync.stateWrite(Object.assign(FbmSync.stateRead(), patch || {})); };

/** Đọc companion và lookup một lần trước chiều đẩy; mismatch chỉ chặn push. */
FbmSync.prepareCategoryGate = function (state) {
  var gate = { map: {}, names: {}, valid: {}, warnings: [] }, blocks = [];
  try {
    gate = FbmSync.readCategoryGate();
    blocks = FbmSync.validateLookupGate(state, gate);
  } catch (err) {
    blocks = [{ source: 'Category', reason: 'Không đọc được bảng Category: ' + String(err && err.message || err) }];
  }
  state.metadata = state.metadata || {};
  state.metadata.categoryGate = gate;
  state.metadata.categoryBlocks = blocks;
  return blocks;
};

/** Ghi trạng thái kỹ thuật sau push; baseline chỉ cập nhật khi pull sau đó xác nhận bằng nhau. */
FbmSync.markPushResult = function (candidate, response, operation) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {};
  data = data.d || data;
  var patch = { id: record.id, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: '' };
  if (candidate.entity === 'customer') {
    patch.fbmId = String(values.stt_rec_kh || values.stt_rec_kh0 || record.fbmId || '').trim();
    patch.fbmCustomerCode = String(values.ma_kh || record.fbmCustomerCode || candidate.autoCode || '').trim();
    if (!patch.fbmId || !patch.fbmCustomerCode) { throw new Error('FBM không trả đủ stt_rec_kh/ma_kh sau khi ghi Customer.'); }
  } else {
    var activityId = values.id || (data && data.id) || record.fbmId || '';
    patch.fbmId = String(activityId).trim();
    if (!patch.fbmId) { throw new Error('FBM không trả id sau khi ghi Activity.'); }
  }
  var saved = writeGateSave({ entity: candidate.entity, records: [patch], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] });
  if (!saved || !saved.ok) { throw new Error('Không ghi được trạng thái chờ xác nhận sau push.'); }
  return patch;
};

/** Nhả khóa push và nhập lại các khóa mới nhất để caller không ghi đè khóa khác. */
FbmSync.releasePushLock = function (state, entity, id) {
  var key = String(entity) + ':' + String(id), latest;
  if (state && state.locks) { delete state.locks[key]; }
  if (typeof FbmSync.unlockRecord !== 'function') { return state; }
  latest = FbmSync.unlockRecord(entity, id);
  if (latest && latest.locks) { state.locks = latest.locks; }
  return state;
};

/** Ghi trạng thái kỹ thuật và giải phóng khóa khi một bản ghi không thể đẩy. */
FbmSync.markPushError = function (state, candidate, reason) {
  state.counts.error += 1;
  state.message = String(reason || 'Không thể đẩy bản ghi.');
  if (typeof writeGateSave === 'function') {
    try { writeGateSave({ entity: candidate.entity, records: [{ id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.error }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
  }
  FbmSync.releasePushLock(state, candidate.entity, candidate.id);
};

/** Kiểm tra các núm an toàn trước khi phát request ghi đầu tiên. */
FbmSync.pushConfigErrors = function (candidate, settings) {
  var cfg = settings || FbmSync.scriptSettings();
  if (!String(cfg.accountName || '').trim()) { return 'Thiếu FBM_ACCOUNT_NAME; chiều đẩy đã bị dừng.'; }
  if (candidate.kind === 'create' && candidate.entity === 'customer' && (!String(cfg.customerPrefix || '').trim() || !String(cfg.customerCodeLength || '').trim())) { return 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH; không tạo khách mới.'; }
  return '';
};

/** Đảm bảo mã khách FBM tự sinh đúng cấu hình trước khi lưu Customer mới. */
FbmSync.validateAutoCustomerCode = function (code, settings) {
  var cfg = settings || FbmSync.scriptSettings(), value = String(code || '').trim(), prefix = String(cfg.customerPrefix || '').trim(), length = Number(cfg.customerCodeLength || 0);
  if (!prefix || !length) { return { ok: false, reason: 'Thiếu FBM_MA_KH_PREFIX hoặc FBM_MA_KH_LENGTH.' }; }
  if (value.indexOf(prefix) !== 0 || value.length !== length) { return { ok: false, reason: 'Mã khách FBM tự sinh không khớp tiền tố/độ dài đã cấu hình: ' + value }; }
  return { ok: true };
};

/** Tạo request kế tiếp của queue push từ state, không giữ queue trong Extension. */
FbmSync.nextPushRequest = function (state) {
  if (state.metadata && state.metadata.categoryBlocks && state.metadata.categoryBlocks.length) {
    state.phase = 'paused'; state.message = 'Đã đọc xong nhưng tạm dừng chiều đẩy vì danh mục chưa khớp FBM.'; FbmSync.stateWrite(state); return null;
  }
  var entity = state.cursor.entity || 'customer', index = Number(state.cursor.index || 0), candidates = FbmSync.pushCandidates(entity);
  while (index < candidates.length) {
    var candidate = candidates[index];
    var configError = FbmSync.pushConfigErrors(candidate);
    if (configError) { state.phase = 'paused'; state.message = configError; FbmSync.stateWrite(state); return null; }
    if (typeof FbmSync.isRecordLocked === 'function' && FbmSync.isRecordLocked(entity, candidate.id)) {
      state.counts.skipped += 1; state.message = 'Hoãn ' + entity + ' ' + candidate.id + ' vì đang được người dùng chỉnh sửa.';
      index += 1; state.cursor.index = index; FbmSync.stateWrite(state); continue;
    }
    var categoryErrors = FbmSync.validatePushCategories(candidate.record, entity, state.metadata.categoryGate || {});
    if (categoryErrors.length) {
      state.counts.skipped += 1; state.message = 'Bỏ qua ' + entity + ' ' + candidate.id + ': ' + categoryErrors[0].result.reason;
      index += 1; state.cursor.index = index; FbmSync.stateWrite(state); continue;
    }
    candidate.entity = entity;
    var request;
    if (entity === 'customer') {
      request = candidate.kind === 'create' ? FbmSync.customerCreateOpenRequest() : FbmSync.customerEditOpenRequest(candidate.record.fbmId);
    } else {
      request = candidate.kind === 'create' ? FbmSync.activityCreateRequest(candidate.record, state.metadata.categoryGate) : FbmSync.activityEditOpenRequest(candidate.record.fbmId);
    }
    if (typeof FbmSync.lockRecord === 'function') { state = FbmSync.lockRecord(entity, candidate.id, candidate.record.fbmHash || '', 'sync'); }
    if (typeof writeGateSave === 'function') {
      try { writeGateSave({ entity: entity, records: [{ id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.pushing }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
    }
    state.phase = 'push'; state.entity = entity; state.current = candidate.id; state.cursor = { kind: 'push_wait', operation: request.meta.kind, entity: entity, index: index, candidate: candidate };
    state.message = 'Đang đẩy ' + (entity === 'customer' ? 'khách hàng' : 'giao dịch') + ' ' + candidate.id + '...'; FbmSync.stateWrite(state);
    return request;
  }
  if (entity === 'customer') {
    state.cursor = { kind: 'push_scan', entity: 'activity', index: 0 }; state.entity = 'activity'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
  }
  state.phase = 'done'; state.entity = ''; state.current = ''; state.message = 'Đồng bộ hoàn tất; bản ghi vừa đẩy đang chờ kỳ đọc xác nhận.'; state.cursor = {}; FbmSync.stateWrite(state); return null;
};

/** Xử lý bước mở form và bước lưu của một candidate push. */
FbmSync.continuePush = function (state, response) {
  var cursor = state.cursor, candidate = cursor.candidate, gate = state.metadata.categoryGate || {};
  if (cursor.operation === 'customer_create_open') {
    var autoCode = FbmSync.extractAutoCustomerCode(response);
    var codeCheck = FbmSync.validateAutoCustomerCode(autoCode);
    if (!codeCheck.ok) { throw new Error(codeCheck.reason); }
    if (!autoCode) { throw new Error('Không lấy được _ma_kh_auto từ form tạo Customer.'); }
    candidate.autoCode = autoCode; cursor.operation = 'customer_create_save'; state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.customerCreateRequest(candidate.record, autoCode, '', gate);
  }
  if (cursor.operation === 'customer_edit_open') {
    cursor.oldValues = FbmSync.extractFormValues(response); cursor.operation = 'customer_edit_save'; state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.customerEditRequest(candidate.record, cursor.oldValues, gate);
  }
  if (cursor.operation === 'activity_edit_open') {
    cursor.oldValues = FbmSync.extractFormValues(response); cursor.operation = 'activity_edit_save'; state.cursor = cursor; FbmSync.stateWrite(state);
    var configuredOwner = String(FbmSync.scriptSettings().accountName || '').trim(), currentOwner = String(cursor.oldValues.owner || '').trim();
    if (!configuredOwner || (currentOwner && currentOwner.toLowerCase() !== configuredOwner.toLowerCase())) { throw new Error('Hoạt động thuộc owner FBM khác tài khoản đã cấu hình.'); }
    return FbmSync.activityEditRequest(candidate.record, cursor.oldValues, gate);
  }
  if (cursor.operation === 'activity_create') {
    FbmSync.markPushResult(candidate, response, cursor.operation);
  } else if (cursor.operation === 'customer_create_save' || cursor.operation === 'customer_edit_save' || cursor.operation === 'activity_edit_save') {
    FbmSync.markPushResult(candidate, response, cursor.operation);
  } else {
    throw new Error('Không nhận diện được bước push: ' + cursor.operation);
  }
  state.counts.succeeded += 1; FbmSync.releasePushLock(state, cursor.entity, candidate.id); state.cursor = { kind: 'push_scan', entity: cursor.entity, index: Number(cursor.index || 0) + 1 }; state.current = ''; FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};

/** Mở phiên, kiểm tra khóa phiên và trả về request đầu tiên. */
FbmSync.start = function (options) {
  // Mỗi call chỉ trả một request; ngữ cảnh nhiều bước nằm trong DocumentProperties.
  var current = FbmSync.stateRead();
  if (current.runId && ['idle', 'done', 'error'].indexOf(current.phase) < 0) {
    return { ok: false, code: 'SYNC_ALREADY_RUNNING', status: FbmSync.statusView() };
  }
  if (typeof fbmEnsureSyncColumns === 'function') { fbmEnsureSyncColumns(); }
  var opt = options || {}, state = FbmSync.stateStart('', 'checking_session', 0);
  state.mode = opt.mode === 'write' ? 'write' : 'read';
  state.cursor = { kind: 'authorize_customer' };
  state.message = 'Dang kiem tra phien FBM...';
  FbmSync.stateWrite(state);
  return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authorizeRequest('customer')), status: FbmSync.statusView() };
};

/** Xử lý một trang pull; read mode chỉ preview, write mode qua WriteGate. */
FbmSync.pullRecords = function (entity, records, mode) {
  var state = FbmSync.stateRead(), count = (records || []).length;
  state.counts.completed += count;
  state.counts.total = Math.max(Number(state.counts.total || 0), Number(state.counts.completed || 0));
  if (!FbmSync.writeEnabled(mode)) {
    state.counts.skipped += count;
    state.message = 'Da doc ' + count + ' ban ghi (che do xem truoc, chua ghi Sheet).';
    FbmSync.stateWrite(state);
    return { ok: true, preview: true, written: 0, skipped: count };
  }
  var result = FbmSync.pullWrite(entity, records || []);
  state.counts.succeeded += Number(result.written || 0);
  state.counts.conflict += Number(result.conflicts || 0);
  state.counts.skipped += Number(result.skipped || 0);
  state.counts.error += result.ok ? 0 : count;
  FbmSync.stateWrite(state);
  return result;
};

/** Nhận token bootstrap và chuyển sang lookup hoặc đọc grid. */
FbmSync.authContinue = function (entity, response) {
  // Token gắn với phiên và phải lưu trước mọi request ghi.
  var auth = FbmSync.extractAuthorized(response), state = FbmSync.stateRead();
  if (!auth) { throw new Error('FBM khong tra ma authorized cho ' + entity + '.'); }
  state.session[entity === 'customer' ? 'customerAuthorized' : 'activityAuthorized'] = auth;
  if (entity === 'customer') {
    state.cursor = { kind: 'authorize_activity' };
    state.message = 'Da xac thuc Customer; dang xac thuc Activity...';
    FbmSync.stateWrite(state);
    return FbmSync.authorizeRequest('activity');
  }
  if (state.mode === 'write') {
    state.cursor = { kind: 'lookup', index: 0 };
    state.message = 'Dang nap danh muc FBM truoc khi ghi...';
    FbmSync.stateWrite(state);
    return FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[0].controller, FbmSync.SYNC_LOOKUPS[0].key);
  }
  state.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 };
  state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Dang doc khach hang tu FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 0, count: 2000, gridPageIndex: -1, gridRefresh: false });
};

/** Tạo request trang Customer tiếp theo từ khóa cuối trang trước. */
FbmSync.customerNext = function (state, rows, total) {
  var cursor = state.cursor || {}, count = Number(cursor.count || 2000);
  if (!rows.length || rows.length < count || (total && Number(cursor.seen || 0) + rows.length >= total)) { return null; }
  var last = rows[rows.length - 1];
  cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
  cursor.pageValue = [last.ngay_gd || '', last.datetime0 || '', last.xorder || ''];
  cursor.seen = Number(cursor.seen || 0) + rows.length;
  state.cursor = cursor;
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 1, count: count, gridPageIndex: cursor.pageIndex, gridPageValue: cursor.pageValue, gridRefresh: false });
};

/** Khởi tạo cursor Activity cho danh sách Customer vừa đọc. */
FbmSync.activityForCustomers = function (state, customerIds, customerNext, customerSeen) {
  state.phase = 'pull_activity'; state.entity = 'activity';
  state.cursor = { kind: 'activity_grid', customerIds: customerIds, customerIndex: 0, pageIndex: -1, pageValue: null, count: 100, customerNext: customerNext || null, customerSeen: Number(customerSeen || 0) };
  state.message = 'Dang doc giao dich cua khach hang...';
  FbmSync.stateWrite(state);
  return customerIds.length ? FbmSync.activityGridRequest(customerIds[0], { type: 0, count: 100, gridPageIndex: -1, gridRefresh: false }) : null;
};

/** Tiếp tục đúng một bước từ response Extension và lưu cursor trước khi trả về. */
FbmSync.continue = function (rawResponse) {
  // Tiến đúng một bước cursor và lưu state trước khi trả request kế tiếp.
  var state = FbmSync.stateRead(), cursor = state.cursor || {}, response = FbmSync.protocol.parse(rawResponse);
  if (response && response._transport && response._transport.payloadCookie) {
    state.session.cookie = String(response._transport.payloadCookie);
    var compact = state.session.cookie.indexOf('FHN_CRM_App') >= 0 ? state.session.cookie.slice(0, state.session.cookie.indexOf('FHN_CRM_App')) : '';
    if (!state.session.userId && compact.length > 9) { state.session.userId = compact.slice(4, -5); }
    FbmSync.stateWrite(state);
  }
  var success = FbmSync.protocol.assertSuccess(response);
  if (!success.ok) {
    if (cursor.kind === 'push_wait' && cursor.candidate && typeof writeGateSave === 'function') {
      try { writeGateSave({ entity: cursor.entity, records: [{ id: cursor.candidate.id, syncStatus: FbmSync.SYNC_STATUS.error }], source: 'pull', schemas: [DATA_SCHEMA, SYNC_SCHEMA] }); } catch (ignore) {}
    }
    if (cursor.kind === 'push_wait' && cursor.candidate) { FbmSync.releasePushLock(state, cursor.entity, cursor.candidate.id); }
    state.phase = 'error'; state.lastError = (success.bug && (success.bug.Message || success.bug.message)) || 'FBM tra ve loi nghiep vu'; state.message = state.lastError; FbmSync.stateWrite(state);
    return { ok: false, status: FbmSync.statusView(), error: success.bug };
  }

  if (cursor.kind === 'push_wait') {
    try {
      var pushRequest = FbmSync.continuePush(state, response);
      return { ok: true, request: FbmSync.nextEnvelope(pushRequest), status: FbmSync.statusView() };
    } catch (pushError) {
      FbmSync.markPushError(state, cursor.candidate, pushError && pushError.message || pushError);
      state.phase = 'error'; state.lastError = String(pushError && pushError.message || pushError); state.message = state.lastError; FbmSync.stateWrite(state);
      return { ok: false, status: FbmSync.statusView(), error: { FieldName: '$PUSH', Message: state.lastError } };
    }
  }

  // Hai bước đầu chỉ lấy authorized token cho từng controller.
  if (cursor.kind === 'authorize_customer') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('customer', response)), status: FbmSync.statusView() };
  }
  if (cursor.kind === 'authorize_activity') {
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.authContinue('activity', response)), status: FbmSync.statusView() };
  }
  // Write mode phải nạp danh mục trước khi dựng payload ghi.
  if (cursor.kind === 'lookup') {
    var lookup = FbmSync.SYNC_LOOKUPS[Number(cursor.index || 0)], parsedLookup = FbmSync.protocol.parse(response) || {}, lookupData = parsedLookup.d || parsedLookup;
    if (typeof lookupData === 'string') { lookupData = FbmSync.protocol.parse(lookupData) || []; }
    state.session.lookups[lookup.key] = Array.isArray(lookupData) ? lookupData : [];
    var lookupIndex = Number(cursor.index || 0) + 1;
    if (lookupIndex < FbmSync.SYNC_LOOKUPS.length) {
      state.cursor.index = lookupIndex; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.completionRequest(FbmSync.SYNC_LOOKUPS[lookupIndex].controller, FbmSync.SYNC_LOOKUPS[lookupIndex].key)), status: FbmSync.statusView() };
    }
    FbmSync.prepareCategoryGate(state);
    state.cursor = { kind: 'customer_grid', type: 0, pageIndex: -1, pageValue: null, count: 2000 }; state.phase = 'pull_customer'; state.entity = 'customer'; state.message = 'Dang doc khach hang tu FBM...'; FbmSync.stateWrite(state);
    return { ok: true, request: FbmSync.nextEnvelope(FbmSync.customerGridRequest({ type: 0, count: 2000, gridPageIndex: -1, gridRefresh: false })), status: FbmSync.statusView() };
  }
  // Customer là grid cha; mỗi trang xong sẽ mở Activity con của trang đó.
  if (cursor.kind === 'customer_grid') {
    var customerGrid = FbmSync.rowsToRecords('customer', response), customerRecords = customerGrid.rows.map(FbmSync.customerRecord);
    state.metadata.customerFields = customerGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('customer', customerRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'customer', customerRecords);
    FbmSync.stateWrite(state);
    var ids = customerGrid.rows.map(function (row) { return String(row.stt_rec_kh || '').trim(); }).filter(Boolean);
    var nextCustomer = FbmSync.customerNext(state, customerGrid.rows, customerGrid.total);
    var activityRequest = FbmSync.activityForCustomers(state, ids, nextCustomer, state.cursor.seen);
    if (activityRequest) { return { ok: true, request: FbmSync.nextEnvelope(activityRequest), status: FbmSync.statusView(), imported: customerRecords.length }; }
    if (nextCustomer) { state.cursor = { kind: 'customer_grid', type: 1, pageIndex: nextCustomer.body.gridPageIndex, pageValue: nextCustomer.body.gridPageValue, count: nextCustomer.body.count, seen: Number(state.cursor.customerSeen || 0) }; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(nextCustomer), status: FbmSync.statusView() }; }
    if (state.mode === 'write' && FbmSync.writeEnabled(state.mode)) { state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; FbmSync.stateWrite(state); return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView() }; }
    state.phase = 'done'; state.message = 'Dong bo hoan tat.'; FbmSync.stateWrite(state); return { ok: true, status: FbmSync.statusView() };
  }
  // Activity được quét theo từng stt_rec, rồi mới quay lại trang Customer kế.
  if (cursor.kind === 'activity_grid') {
    var activityGrid = FbmSync.rowsToRecords('activity', response), activityRecords = activityGrid.rows.map(FbmSync.activityRecord);
    state.metadata.activityFields = activityGrid.fields;
    FbmSync.stateWrite(state);
    FbmSync.pullRecords('activity', activityRecords, state.mode);
    state = FbmSync.stateRead();
    FbmSync.previewRecords(state, 'activity', activityRecords);
    FbmSync.stateWrite(state);
    var hasNext = activityGrid.rows.length >= Number(cursor.count || 100) && activityGrid.rows.length > 0;
    if (hasNext) {
      var lastActivity = activityGrid.rows[activityGrid.rows.length - 1];
      state.cursor.pageIndex = Number(cursor.pageIndex || -1) + 1;
      state.cursor.pageValue = [lastActivity.end_date || '', lastActivity.datetime0 || '', lastActivity.id || '', lastActivity.line_nbr || 0];
      FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerIds[cursor.customerIndex], { type: 1, count: cursor.count, gridPageIndex: state.cursor.pageIndex, gridPageValue: state.cursor.pageValue, gridRefresh: false })), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    var nextIndex = Number(cursor.customerIndex || 0) + 1;
    if (nextIndex < cursor.customerIds.length) {
      state.cursor.customerIndex = nextIndex; state.cursor.pageIndex = -1; state.cursor.pageValue = null; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.activityGridRequest(cursor.customerIds[nextIndex], { type: 0, count: cursor.count, gridPageIndex: -1, gridRefresh: false })), status: FbmSync.statusView() };
    }
    if (cursor.customerNext) {
      var next = cursor.customerNext; state.cursor = { kind: 'customer_grid', type: 1, pageIndex: next.body.gridPageIndex, pageValue: next.body.gridPageValue, count: next.body.count, seen: Number(cursor.customerSeen || 0) }; state.phase = 'pull_customer'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(next), status: FbmSync.statusView() };
    }
    if (state.mode === 'write' && FbmSync.writeEnabled(state.mode)) {
      state.cursor = { kind: 'push_scan', entity: 'customer', index: 0 }; state.phase = 'push'; state.entity = 'customer'; FbmSync.stateWrite(state);
      return { ok: true, request: FbmSync.nextEnvelope(FbmSync.nextPushRequest(state)), status: FbmSync.statusView(), imported: activityRecords.length };
    }
    state.phase = 'done'; state.entity = ''; state.message = 'Dong bo hoan tat.'; FbmSync.stateWrite(state);
    return { ok: true, status: FbmSync.statusView(), imported: activityRecords.length };
  }
  state.phase = 'error'; state.lastError = 'Khong nhan dien duoc cursor dong bo.'; FbmSync.stateWrite(state);
  return { ok: false, status: FbmSync.statusView(), error: state.lastError };
};

/** API bắt đầu phiên cho Sidebar hoặc DEV runner. */
function fbmSyncStart(mode) { return FbmSync.start({ mode: mode }); }
/** API nhận response Extension và trả request kế tiếp. */
function fbmSyncContinue(rawResponse) { return FbmSync.continue(rawResponse); }
/** Dừng phiên lỗi; chỉ nhả khóa sync, giữ khóa user đang sửa. */
function fbmSyncCancel() {
  var state = FbmSync.stateRead(), locks = state.locks || {}, kept = {};
  Object.keys(locks).forEach(function (key) { if (locks[key] && locks[key].owner === 'user') { kept[key] = locks[key]; } });
  state.runId = ''; state.phase = 'idle'; state.entity = ''; state.cursor = {}; state.current = ''; state.locks = kept; state.message = 'Đã dừng phiên đồng bộ.'; state.lastError = '';
  return FbmSync.stateWrite(state);
}
/** Bật/tắt ghi thật; mặc định luôn tắt để bảo vệ dữ liệu FBM. */
function fbmSyncSetWriteMode(enabled) { PropertiesService.getScriptProperties().setProperty('FBM_SYNC_ALLOW_WRITES', enabled ? 'true' : 'false'); return { enabled: !!enabled }; }

/** Cổng HTTP tùy chọn cho runner; bắt buộc khóa trước khi xử lý. */
function doPost(event) {
  try {
    var body = event && event.postData && event.postData.contents ? JSON.parse(event.postData.contents) : {}, expected = String(PropertiesService.getScriptProperties().getProperty('FBM_SYNC_KEY') || '');
    if (!expected || body.key !== expected) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: 'unauthorized' })).setMimeType(ContentService.MimeType.JSON); }
    var result = body.response === undefined ? fbmSyncStart(body.mode) : fbmSyncContinue(body.response);
    return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
  } catch (err) { return ContentService.createTextOutput(JSON.stringify({ ok: false, error: String(err && err.message || err) })).setMimeType(ContentService.MimeType.JSON); }
}
