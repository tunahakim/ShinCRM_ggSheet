/** Dieu phoi chieu day ShinCRM sang FBM. */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc companion và lookup một lần trước chiều đẩy; mismatch chỉ chặn push. */
FbmSync.prepareCategoryGate = function (state) {
  var gate = { map: {}, names: {}, valid: {}, warnings: [] }, blocks = [], logged = {};
  try {
    gate = FbmSync.readCategoryGate();
    blocks = FbmSync.needsFbmLookups(state) ? FbmSync.validateLookupGate(state, gate) : [];
  } catch (err) {
    blocks = [{ source: 'Category', reason: 'Không đọc được bảng Category: ' + String(err && err.message || err) }];
  }
  state.metadata = state.metadata || {};
  // Chiều đẩy kiểm lại danh mục giữa các lô: chỉ Log khối chặn mới để Log không lặp cùng một mã mỗi lô.
  (state.metadata.categoryBlocks || []).forEach(function (block) { logged[FbmSync.categoryBlockKey(block)] = true; });
  state.metadata.categoryBlocks = blocks;
  FbmSync.stateCategoryGate(state, gate);
  FbmSync.logCategoryBlocks(blocks.filter(function (block) { return !logged[FbmSync.categoryBlockKey(block)]; }));
  if (state.session) { state.session.lookups = {}; }
  return blocks;
};
FbmSync.categoryBlockKey = function (block) { return [block.source, block.code || '', block.reason].join(''); };

/** FBM có thể đổi danh mục giữa lượt: kiểm lại trước mỗi `pushBatchRecords` bản ghi đẩy hoặc khi lần đọc trước quá `lookupMaxAgeMs`. */
FbmSync.pushLookupDue = function (state, now) {
  var check = state.metadata && state.metadata.categoryCheck;
  if (!check) { return true; }
  return Number(check.pushed || 0) >= FbmSync.BUDGET.pushBatchRecords || Number(now || Date.now()) - Number(check.at || 0) >= FbmSync.BUDGET.lookupMaxAgeMs;
};
/** Đối chiếu lại Category bằng lô vừa đọc rồi quay về đúng mã đang chờ đẩy trong danh sách; không lấy được danh mục thì `nextPushRequest` dừng `paused`. */
FbmSync.continuePushLookup = function (state, cursor) {
  FbmSync.prepareCategoryGate(state);
  state.cursor = FbmSync.pushCursor(cursor);
  FbmSync.stateWrite(state);
  var next = FbmSync.nextPushRequest(state);
  return { ok: true, request: next ? FbmSync.nextEnvelope(next) : null, status: FbmSync.statusView() };
};
/** Tài liệu 09/03: mã danh mục bị chặn phải vào Log kèm tên FBM hiện tại, không chỉ nằm trong state; thiếu danh sách FBM thì chặn cả chiều đẩy nên là lỗi. */
FbmSync.logCategoryBlocks = function (blocks) {
  if (typeof logEvent !== 'function') { return; }
  (blocks || []).forEach(function (block) {
    var whole = !block.code;
    logEvent({ source: 'fbm_sync', action: 'category_block', outcome: whole ? (typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error') : (typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn'), entity: 'category', recordId: String(block.code || ''), reason: String(block.source || '') + (whole ? '' : ' ' + String(block.code)) + ': ' + String(block.reason || '').replace(/\.?\s*$/, '.') + (whole ? ' Bỏ toàn bộ chiều đẩy kỳ này.' : ' Bản ghi dùng mục này không được đẩy lên FBM cho đến khi sửa Category.'), detail: { source: String(block.source || ''), code: String(block.code || '') } });
  });
};
/** Push thành công chỉ cộng vào số liệu bước; lỗi và bỏ qua vào bộ gom Log của lát. */
FbmSync.logPushRecord = function (candidate, operation, outcome, reason, detail) {
  var ok = typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok';
  if (!outcome || outcome === ok) { return null; }
  return FbmSync.recordIssueAdd('push', String(candidate && candidate.entity || ''), String(detail && detail.syncStatus || ''), String(candidate && candidate.id || ''), reason, outcome);
};
/** Ghi trạng thái kỹ thuật sau push; baseline chỉ cập nhật sau bước đọc xác nhận. */
FbmSync.markPushResult = function (candidate, response, operation) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {}, current = typeof FbmSync.stateRead === 'function' ? FbmSync.stateRead() : {}, gate = FbmSync.stateCategoryGate(current);
  data = data.d || data;
  var patch = { id: record.id, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: String(record.fbmHash || '').trim() };
  if (candidate.entity === 'customer') {
    patch.fbmId = String(values.stt_rec_kh || values.stt_rec_kh0 || record.fbmId || '').trim();
    patch.fbmCustomerCode = String(values.ma_kh || record.fbmCustomerCode || candidate.autoCode || '').trim();
    if (!patch.fbmId || !patch.fbmCustomerCode) { throw new Error('FBM không trả đủ stt_rec_kh/ma_kh sau khi ghi Customer.'); }
  } else {
    var activityId = values.id || (data && data.id) || record.fbmId || '';
    patch.fbmId = String(activityId).trim();
    if (!patch.fbmId) { throw new Error('FBM không trả id sau khi ghi Activity.'); }
  }
  // Giữ baseline cũ; hash payload gửi được lưu riêng để kỳ đọc nhận ra chính lần ghi này.
  // Fingerprint Activity có `id` FBM nên phải tính sau khi gắn ID vừa nhận; tính trên bản ghi lúc tạo (chưa có ID) thì mọi lệnh tạo đọc xác nhận lệch thành xung đột giả (FBM-050).
  var sentHash = FbmSync.hash(Object.assign({}, record, { fbmId: patch.fbmId }), candidate.entity, gate);
  FbmSync.pushRowChange(candidate.entity, record.id, { build: function () { return { patch: patch }; } });
  // Hash chờ xác nhận chỉ lưu trong state server, không ghi vào Sheet.
  try {
    FbmSync.pendingPushSet(candidate.entity, record.id, { hSHIN: sentHash, sentAt: Date.now(), fbmId: patch.fbmId });
  } catch (pendingError) {
    throw new Error('Không ghi được hash đang chờ xác nhận sau push: ' + String(pendingError && pendingError.message || pendingError));
  }
  FbmSync.logPushRecord(candidate, operation, typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', 'Đã gửi request ghi; đang đọc xác nhận trực tiếp.', { fbmId: patch.fbmId, fbmCustomerCode: patch.fbmCustomerCode || '', hPUSH: sentHash });
  return patch;
};

/** Khi New Customer mất response, chỉ đọc lại theo mã tự sinh để xác định có ghi thành công hay chưa. */
FbmSync.customerCreateRecoveryRequest = function (state, cursor) {
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate || {}, record = candidate.record || {}, taxNumber = String(record.taxNumber || '').trim();
  if (!taxNumber || typeof FbmSync.customerGridRequest !== 'function') { return null; }
  state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_wait', operation: 'customer_create_recover', entity: 'customer', candidate: FbmSync.pushCandidateForState(candidate) });
  state.message = 'Đang kiểm tra Customer vừa tạo sau khi mất phản hồi; không gửi lại lệnh ghi.';
  FbmSync.stateWrite(state);
  return FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -2, gridRefresh: false, includeScope: false, filter: ['ma_so_thue:**' + taxNumber] });
};
/**
 * Đối chiếu đúng một dòng Customer sau create mất response rồi vá ID/baseline.
 * Cùng phiên thì còn mã tự sinh để khớp kèm MST và so dữ liệu đã gửi. Phiên sau (`recover`) mã tự sinh đã mất và người dùng có thể đã sửa bản ghi, nên chỉ khớp MST rồi vá hai mã FBM, baseline để rỗng như `09/04` bước 5: lần quét lại của chặng đẩy chọn lại dòng và bước mở form so hai bên (chưa có mốc thì không bao giờ lưu đè), ghi baseline hoặc báo xung đột.
 */
FbmSync.finishCustomerCreateRecovery = function (state, response) {
  var cursor = state.cursor || {}, candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor.candidate || {}) : cursor.candidate || {}, record = candidate.record || {}, grid = FbmSync.rowsToRecords('customer', response, state.metadata && state.metadata.customerFields), taxNumber = String(record.taxNumber || '').trim(), autoCode = String(candidate.autoCode || '').trim(), laterRun = candidate.kind === 'recover', rows = grid.rows.filter(function (row) { return String(row.ma_so_thue || '').trim() === taxNumber && (laterRun || String(row.ma_kh || '').trim() === autoCode); }), gate = FbmSync.stateCategoryGate(state), id = String(candidate.id || '');
  // Đọc dòng, so và vá trong cùng một lần qua cửa; mọi lỗi ném ra từ hàm quyết thì cửa không ghi gì.
  var done = FbmSync.pushRowChange('customer', id, { allowGone: true, release: true, build: function (local) {
    if (laterRun && rows.length === 0) { throw new Error('Customer đang đẩy từ lần trước nhưng FBM không có khách cùng Mã số thuế; lần tạo trước có thể chưa thành công. Không tự tạo lại; kiểm tra trên FBM rồi bấm Mở lại bản ghi lỗi nếu cần tạo lại.'); }
    if (rows.length !== 1) { throw new Error('CREATE_RECOVERY_NOT_EXACT: không xác định duy nhất Customer vừa tạo; không gửi lại request ghi.'); }
    if (laterRun) {
      var found = FbmSync.customerRecord(rows[0], gate);
      return { patch: { id: local.id, fbmId: found.fbmId, fbmCustomerCode: found.fbmCustomerCode, fbmHash: '', syncStatus: FbmSync.SYNC_STATUS.pending } };
    }
    var incoming = FbmSync.customerRecord(rows[0], gate), localHash = FbmSync.hash(local, 'customer', gate), incomingHash = FbmSync.hash(incoming, 'customer', gate), sentHash = FbmSync.hash(candidate.record || {}, 'customer', gate);
    if (incomingHash !== sentHash || localHash !== sentHash) { throw new Error('CREATE_RECOVERY_MISMATCH: Customer tìm thấy không khớp chính xác dữ liệu đã gửi.'); }
    return { patch: { id: local.id, fbmId: incoming.fbmId, fbmCustomerCode: incoming.fbmCustomerCode, fbmHash: incomingHash, syncStatus: FbmSync.SYNC_STATUS.synced, syncedAt: new Date() } };
  } });
  if (done.status === 'gone') { throw new Error('CREATE_RECOVERY_NOT_EXACT: không xác định duy nhất Customer vừa tạo; không gửi lại request ghi.'); }
  if (done.status === 'busy') { throw new Error('Customer ' + id + ' đang bị tiến trình khác giữ (' + done.busy.reason + '); chưa vá mã FBM.'); }
  var local = done.local;
  if (laterRun) {
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_customer', { written: 1, sheetWriteBatches: 1 }); }
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã tìm thấy trên FBM Customer ' + local.id + ' tạo ở lần trước; đã vá mã FBM, sẽ so hai bên trước khi ghi.'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
  }
  state.counts.pushed += 1;
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_customer', { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 }); }
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã xác nhận Customer tạo thành công sau khi mất phản hồi.'; FbmSync.stateWrite(state); return FbmSync.nextPushRequest(state);
};

/** Kiểm tra response mở form có đủ trường fingerprint trước khi xác nhận. */
FbmSync.verifyFormValues = function (response, entity) {
  return FbmSync.requireFormFields(FbmSync.extractFormValues(response, entity), entity);
};
/** Giá trị form thiếu trường fingerprint thì hash bản FBM sai, nên không được dùng để so hay dựng lệnh lưu. */
FbmSync.requireFormFields = function (values, entity) {
  var required = entity === 'activity' ? ['id', 'ma_cv', 'details', 'end_date'] : ['stt_rec_kh', 'ma_kh', 'ten_kh', 'ma_so_thue', 'ong_ba', 'dien_thoai', 'email', 'dc_lh'];
  var missing = required.filter(function (name) { return !Object.prototype.hasOwnProperty.call(values, name); });
  if (missing.length) { throw new Error('FBM_VERIFY_INCOMPLETE: thiếu trường ' + missing.join(', ') + ' trong response mở form FBM.'); }
  return values;
};
/** Câu nêu tên các trường lệch giữa hai bản cho Log; không kèm giá trị vì nội dung có thể dài, giá trị hai bên xem ở màn xung đột. */
FbmSync.diffFieldText = function (entity, left, right, gate) {
  var fields = FbmSync.diff(entity, left, right, gate).map(function (item) { return item.field; });
  return fields.length ? ' ở trường ' + fields.join(', ') : '';
};

/**
 * So ba bản trước khi lưu lên FBM (`09/04` "So trước khi đẩy"): `record` là đúng bản ghi dùng dựng lệnh lưu, `formValues` là bản FBM vừa mở, mốc là `record.fbmHash`.
 * Trả `action`: `save` (FBM còn bằng mốc, hoặc còn dấu #SC cần bỏ), `settled` (hai bên đã bằng nhau), `conflict` (cả hai cùng đổi, hoặc chưa có mốc mà khác nhau), `fbmOnly` (chỉ FBM đổi, để chiều lấy về kéo).
 */
FbmSync.pushOpenDecision = function (entity, record, formValues, gate) {
  var decision = FbmSync.threeWay({ hBASE: String(record && record.fbmHash || '').trim() }, { hSHIN: FbmSync.hash(record, entity, gate) }, { hFBM: FbmSync.hash(formValues, entity, gate) });
  var markerLeft = entity === 'activity' && !!FbmSync.activityMarkerId(formValues && formValues.details);
  var action = decision.hFBM === decision.hSHIN ? (markerLeft ? 'save' : 'settled') : !decision.fbmChanged ? 'save' : decision.shinChanged ? 'conflict' : 'fbmOnly';
  return { action: action, hFBM: decision.hFBM, hSHIN: decision.hSHIN, hBASE: decision.hBASE };
};

/**
 * Bước mở form quyết không lưu: ghi kết quả lên dòng trong Cửa bản ghi, nhả bản ghi rồi sang ứng viên kế, không dừng phiên.
 * Dòng đọc lại trong cửa khác bản đã so thì không ghi kết quả so, chỉ đưa về `chờ đối soát` để lượt sau so lại.
 */
FbmSync.finishPushOpenWithoutSave = function (state, cursor, candidate, formValues, decision, gate) {
  var entity = String(cursor.entity || candidate.entity || ''), id = String(candidate.id || ''), sync = FbmSync.SYNC_STATUS;
  var done = FbmSync.pushRowChange(entity, id, { allowGone: true, releaseGone: true, release: true, build: function (local) {
    if (FbmSync.hash(local, entity, gate) !== decision.hSHIN) { return { patch: { id: local.id, syncStatus: sync.pending }, value: 'changed' }; }
    if (decision.action === 'settled') { return { patch: { id: local.id, fbmHash: decision.hFBM, syncStatus: sync.synced, syncedAt: new Date() }, value: 'settled' }; }
    if (decision.action === 'conflict') { return { patch: { id: local.id, syncStatus: sync.conflict }, value: 'conflict' }; }
    return { patch: { id: local.id, syncStatus: sync.synced }, value: 'fbmOnly' };
  } });
  if (done.status === 'busy') { throw new Error('Bản ghi ' + entity + ' ' + id + ' đang bị tiến trình khác giữ (' + done.busy.reason + '); chưa ghi kết quả so với FBM.'); }
  var outcome = done.status === 'gone' ? 'gone' : done.value, message;
  if (outcome !== 'gone' && outcome !== 'changed') { FbmSync.pushFailuresRemove([entity + ':' + id]); }
  if (typeof FbmSync.businessStepAdd === 'function' && outcome !== 'gone') { FbmSync.businessStepAdd(state, 'push_' + entity, { written: 1, sheetWriteBatches: 1 }); }
  if (outcome === 'conflict') {
    state.counts.conflict += 1;
    state.metadata.conflictCount = Number(state.metadata.conflictCount || 0) + 1;
    FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_CONFLICT !== 'undefined' ? LOG_CONFLICT : 'conflict', 'FBM đã đổi sau lần đồng bộ trước và khác ShinCRM' + FbmSync.diffFieldText(entity, done.local, formValues, gate) + '; không ghi đè FBM, chờ quyết định xung đột.', { syncStatus: sync.conflict });
    message = 'Không đẩy ' + entity + ' ' + id + ': FBM đã đổi, chuyển xung đột chờ quyết.';
  } else if (outcome === 'settled') {
    message = 'FBM đã có đúng dữ liệu ' + entity + ' ' + id + '; cập nhật mốc, không gửi lệnh lưu.';
  } else if (outcome === 'fbmOnly') {
    message = 'Không đẩy ' + entity + ' ' + id + ': chỉ FBM đổi, chờ chiều lấy về.';
  } else if (outcome === 'changed') {
    message = 'Hoãn ' + entity + ' ' + id + ': dòng vừa được sửa, lượt sau so lại.';
  } else {
    message = 'Bỏ ' + entity + ' ' + id + ': dòng không còn trên Sheet.';
  }
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = message; FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};

/**
 * Hoàn tất ghi chỉ sau khi đọc lại đúng bản ghi và so hash với payload đã gửi. Dòng cục bộ đọc trong cửa cùng lần ghi kết quả; bản ghi được nhả trong cùng lần ghi đó, trừ khi còn bước dọn dấu #SC.
 */
FbmSync.finishPushVerification = function (state, response) {
  var cursor = state.cursor || {}, candidate = cursor.candidate || {}, entity = String(cursor.entity || candidate.entity || ''), id = String(candidate.id || ''), pending = FbmSync.pendingPushGet(entity, id), pendingHash = String(pending && (pending.hSHIN || pending.hash) || '').trim(), gate = FbmSync.stateCategoryGate(state);
  if (!pendingHash) { throw new Error('FBM_VERIFY_STATE_MISSING: không còn hash của lần ghi cần xác nhận.'); }
  var values = FbmSync.verifyFormValues(response, entity), incomingHash = FbmSync.hash(values, entity, gate), sentHash = pendingHash;
  // Lệnh sửa không mang dấu mà FBM vẫn còn dấu: coi là đẩy không ăn để không xếp dọn lại mỗi lượt (G12).
  var markerLeft = entity === 'activity' && !!FbmSync.activityMarkerId(values.details);
  if (incomingHash === sentHash && markerLeft && candidate.kind !== 'create') { incomingHash = ''; }
  var sync = FbmSync.SYNC_STATUS;
  var done = FbmSync.pushRowChange(entity, id, { allowGone: true, releaseGone: true, build: function (local) {
    var localHash = FbmSync.hash(local, entity, gate), previousHash = String(local.fbmHash || '').trim();
    if (incomingHash === sentHash) {
      var status = localHash === sentHash ? sync.synced : sync.pending, cleaning = markerLeft && status === sync.synced;
      return { patch: { id: local.id, fbmHash: incomingHash, syncStatus: status, syncedAt: new Date() }, release: !cleaning, value: { outcome: 'confirmed', status: status, cleaning: cleaning } };
    }
    if ((previousHash && incomingHash === previousHash) || (markerLeft && !incomingHash)) {
      return { patch: { id: local.id, syncStatus: sync.notApplied }, release: true, value: { outcome: 'notApplied' } };
    }
    // Sheet là nguồn của hàng đợi xung đột nên ghi trạng thái cùng lần nhả: dòng `xung đột chờ quyết` đã bị khóa đồng bộ.
    return { patch: { id: local.id, syncStatus: sync.conflict }, release: true, value: { outcome: 'conflict' } };
  } });
  if (done.status === 'gone') { FbmSync.pendingPushClear(entity, id); throw new Error('FBM_VERIFY_RECORD_MISSING: bản ghi không còn tồn tại trong ShinCRM.'); }
  if (done.status === 'busy') { throw new Error('Bản ghi ' + entity + ' ' + id + ' đang bị tiến trình khác giữ (' + done.busy.reason + '); chưa ghi kết quả xác nhận.'); }
  var local = done.local, outcome = done.value;
  FbmSync.pendingPushClear(entity, id);
  if (outcome.outcome === 'confirmed') {
    FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', outcome.status === sync.synced ? 'FBM đã xác nhận đúng dữ liệu vừa ghi.' : 'FBM đã xác nhận; ShinCRM đã sửa tiếp nên chờ lượt đẩy mới.', { hPUSH: sentHash, hFBM: incomingHash, syncStatus: outcome.status });
    state.counts.pushed += 1;
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + entity, { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 }); }
    // G12: dấu #SC chỉ cần tới lúc có ID FBM nên bỏ ngay bằng một lệnh sửa dựng từ form vừa đọc, không mở form thêm. ShinCRM đã sửa tiếp thì để lệnh đẩy kế tiếp (không mang dấu) bỏ hộ.
    if (outcome.cleaning) {
      cursor.operation = 'activity_marker_clean'; state.cursor = cursor; state.message = 'Đang bỏ dấu nhận diện của giao dịch ' + id + ' trên FBM...'; FbmSync.stateWrite(state);
      return FbmSync.activityEditRequest(Object.assign({}, local, { fbmId: values.id }), values, gate);
    }
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã xác nhận ' + entity + ' ' + id + '.'; FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  var differing = FbmSync.diffFieldText(entity, local, values, gate);
  if (markerLeft && !incomingHash) { differing = ' (FBM vẫn giữ dấu nhận diện #SC sau lệnh sửa không mang dấu)'; FbmSync.markerCleanCount(state); }
  if (outcome.outcome === 'notApplied') {
    state.counts.skipped += 1;
    FbmSync.logPullRecord(entity, values, local, sync.notApplied, 'FBM không đổi sau lần ghi' + differing + '; đọc xác nhận trực tiếp.');
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'FBM chưa áp dụng ' + entity + ' ' + id + '.'; FbmSync.stateWrite(state);
    return FbmSync.nextPushRequest(state);
  }
  // Xung đột không dừng phiên (`09/02` bước 3): dòng đã thành `xung đột chờ quyết` và được nhả, các bản ghi sau vẫn đẩy.
  FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_CONFLICT !== 'undefined' ? LOG_CONFLICT : 'conflict', 'Đọc xác nhận khác dữ liệu vừa ghi' + differing + '; chờ quyết định xung đột.', { syncStatus: sync.conflict });
  state.metadata.conflictCount = Number(state.metadata.conflictCount || 0) + 1;
  state.counts.conflict += 1;
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đọc xác nhận ' + entity + ' ' + id + ' khác dữ liệu vừa ghi; chuyển xung đột chờ quyết.'; FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};

/** Dọn dấu chỉ là việc làm gọn: hỏng thì cảnh báo ở Log và câu chốt phiên trên Sidebar, giao dịch vẫn đã đồng bộ và lượt kéo sau xếp dọn lại. */
FbmSync.markerCleanCount = function (state) {
  state.metadata = state.metadata || {};
  state.metadata.markerCleanFailed = Number(state.metadata.markerCleanFailed || 0) + 1;
};
FbmSync.finishMarkerClean = function (state, cursor, candidate, failure) {
  var id = String(candidate && candidate.id || '');
  if (failure) {
    FbmSync.markerCleanCount(state);
    FbmSync.logPushRecord(candidate, 'activity_marker_clean', typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', 'Chưa bỏ được dấu nhận diện #SC trên FBM: ' + FbmSync.pushFailureDetail(failure).reason + '. Giao dịch vẫn đã đồng bộ; lượt sau sẽ thử lại.', { failureCode: 'ACTIVITY_MARKER_CLEAN_FAILED' });
  } else {
    FbmSync.logPushRecord(candidate, 'activity_marker_clean', typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok', 'Đã bỏ dấu nhận diện #SC khỏi nội dung giao dịch trên FBM.');
  }
  FbmSync.pushRelease('activity', id);
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.phase = 'push'; state.lastError = ''; state.message = failure ? 'Chưa bỏ được dấu nhận diện của giao dịch ' + id + '; đang xử lý bản ghi tiếp theo.' : 'Đã bỏ dấu nhận diện của giao dịch ' + id + '.'; FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};

/** Xử lý lỗi đọc xác nhận mà không lặp lại request ghi. */
FbmSync.continueAfterPushVerificationError = function (state, cursor, failure) {
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate, entity = String(cursor && cursor.entity || ''), id = String(candidate && candidate.id || '');
  state.counts.error += 1; state.phase = 'error'; state.lastFailureCode = 'FBM_VERIFY_FAILED'; state.retryable = false;
  state.message = 'Đã ghi FBM nhưng chưa xác nhận được ' + entity + ' ' + id + ': ' + String(failure && failure.message || failure || 'Lỗi đọc xác nhận.') + '. Không tự ghi lại.';
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + entity, { errors: 1 }); }
  FbmSync.stateWrite(state);
  if (typeof FbmSync.logPushRecord === 'function') { FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', state.message, { failureCode: 'FBM_VERIFY_FAILED' }); }
  return { ok: false, status: FbmSync.statusView(), error: state.message };
};

/** Nhả bản ghi đồng bộ đang giữ khi bước cuối không ghi gì thêm (dọn dấu #SC). Bước cuối có ghi thì nhả trong cùng lần ghi đó. */
FbmSync.pushRelease = function (entity, id) {
  return FbmSync.recordChange(function () { return { release: [{ entity: entity, ids: [String(id)] }] }; });
};

/** Chuẩn hóa lỗi để Sidebar/Log luôn giữ được mã và nguyên nhân, không giữ payload. */
FbmSync.pushFailureDetail = function (failure) {
  if (failure && typeof failure === 'object') {
    return { code: String(failure.code || 'PUSH_ERROR'), status: Number(failure.status || 0) || 0, fieldName: String(failure.fieldName || failure.FieldName || ''), reason: String(failure.reason || failure.message || failure.Message || 'Không thể đẩy bản ghi.') };
  }
  return { code: 'PUSH_ERROR', status: 0, fieldName: '', reason: String(failure || 'Không thể đẩy bản ghi.') };
};

/**
 * Form sửa phải trả đúng bản ghi đang đẩy. FBM không còn bản ghi (xóa, chuyển quyền) mà vẫn phát lệnh Edit thì có thể ghi rác lên CRM thật,
 * nên chặn ngay tại đây; bản ghi chuyển sang "không thấy bên FBM" như vắng mặt khi quét (09/05).
 */
FbmSync.requireOpenedRecord = function (values, entity, candidate) {
  var key = entity === 'activity' ? 'id' : 'stt_rec_kh', expected = String(FbmSync.value(candidate && candidate.record || {}, 'fbmId', '') || '').trim();
  var opened = values && values[key] !== undefined && values[key] !== null ? String(values[key]).trim() : '';
  if (expected && opened === expected) { return values; }
  var error = new Error('FBM không trả bản ghi ' + (expected || '(thiếu ID FBM)') + ' khi mở form sửa, có thể đã bị xóa hoặc chuyển quyền; không gửi lệnh lưu, kiểm tra bản ghi này trên FBM.');
  error.code = FbmSync.PUSH_RECORD_NOT_FOUND;
  throw error;
};
FbmSync.PUSH_RECORD_NOT_FOUND = 'FBM_RECORD_NOT_FOUND';

/** Ghi trạng thái kỹ thuật và nhả bản ghi khi một bản ghi không thể đẩy. Trả trạng thái của `pushRowChange`: khác `ok` là chưa ghi gì (dòng vừa đổi, đã vắng hoặc đang bận) và lượt sau xét lại. */
FbmSync.markPushError = function (state, candidate, failure, operation) {
  var detail = FbmSync.pushFailureDetail(failure);
  state.counts.error += 1;
  state.message = 'Lỗi đẩy ' + String(candidate && candidate.entity || '') + ':' + String(candidate && candidate.id || '') + ': ' + detail.reason;
  var gate = FbmSync.stateCategoryGate(state), localHash = typeof FbmSync.hash === 'function' ? FbmSync.hash(candidate.record || {}, candidate.entity, gate) : '';
  FbmSync.pushFailureAdd(candidate.entity + ':' + String(candidate.id || ''), localHash, Object.assign({}, detail, { requestKind: String(operation || candidate.kind || '') }));
  // Lệnh tạo đã có thể tới FBM thì giữ `đang đẩy` để không bị tạo lại (FBM-027); lỗi ở bước mở form thì lệnh lưu chưa phát nên an toàn để đẩy lại.
  var waitingForMarker = candidate.kind === 'recover' || candidate.kind === 'stuck' || (candidate.kind === 'create' && operation !== 'customer_create_open');
  var failedStatus = detail.code === FbmSync.PUSH_RECORD_NOT_FOUND ? FbmSync.SYNC_STATUS.missing : FbmSync.SYNC_STATUS.error;
  var done = FbmSync.pushRowChange(candidate.entity, String(candidate.id || ''), { expect: FbmSync.pushCandidateExpect(candidate), allowGone: true, releaseGone: true, build: function () {
    return { patch: { id: candidate.id, syncStatus: waitingForMarker ? FbmSync.SYNC_STATUS.pushing : failedStatus }, release: !waitingForMarker };
  } });
  if (done.status !== 'ok') { return done.status; }
  FbmSync.logPushRecord(candidate, operation || candidate.kind, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', detail.reason, { syncStatus: failedStatus, failureCode: detail.code, httpStatus: detail.status, fieldName: detail.fieldName });
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { errors: 1 }); }
  return done.status;
};

/** Ứng viên vừa chọn (còn `raw`) thì bước ghi phải thấy đúng dòng lúc chọn; ứng viên dựng lại từ state là dòng đồng bộ đang giữ nên không so. */
FbmSync.pushCandidateExpect = function (candidate) {
  return candidate && candidate.raw ? FbmSync.recordSignature(candidate.raw) : undefined;
};

/** Ghi lý do bản ghi bị bỏ qua mà không phát request ghi ra FBM, chỉ khi dòng còn đúng như lúc chọn. */
FbmSync.markPushSkipped = function (state, candidate, status, reason) {
  var done = FbmSync.pushRowChange(candidate.entity, String(candidate.id || ''), { expect: FbmSync.pushCandidateExpect(candidate), allowGone: true, build: function () {
    return { patch: { id: candidate.id, syncStatus: status || FbmSync.SYNC_STATUS.skipped } };
  } });
  if (done.status !== 'ok') { return done.status; }
  state.counts.skipped += 1;
  state.message = String(reason || 'Bản ghi chưa đủ điều kiện đẩy.');
  FbmSync.logPushRecord(candidate, candidate.kind, typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', reason, { syncStatus: status || FbmSync.SYNC_STATUS.skipped });
  if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { skipped: 1 }); }
  return done.status;
};

/** Bỏ qua một record push lỗi và tiếp tục candidate kế tiếp, không lặp request đã gửi. */
FbmSync.continueAfterPushError = function (state, cursor, failure) {
  if (cursor && cursor.operation === 'activity_marker_clean') {
    var cleanNext = FbmSync.finishMarkerClean(state, cursor, typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor.candidate || {}) : cursor.candidate, failure || 'Lỗi không rõ.');
    return { ok: true, request: cleanNext ? FbmSync.nextEnvelope(cleanNext) : null, status: FbmSync.statusView(), continued: true };
  }
  var candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}) : cursor && cursor.candidate;
  if (candidate) { FbmSync.markPushError(state, candidate, failure, cursor.operation); }
  state.cursor = FbmSync.pushCursorNext(cursor, true);
  state.current = '';
  state.phase = 'push';
  state.lastError = '';
  state.message = 'Đã ghi nhận lỗi đẩy ' + String(cursor.entity || '') + ' ' + String(candidate && candidate.id || '') + '; đang xử lý bản ghi tiếp theo.';
  FbmSync.stateWrite(state);
  var next = FbmSync.nextPushRequest(state);
  return { ok: true, request: next ? FbmSync.nextEnvelope(next) : null, status: FbmSync.statusView(), continued: true };
};

/** Kiểm tra các núm an toàn trước khi phát request ghi đầu tiên. */
FbmSync.pushConfigErrors = function (candidate, settings) {
  var cfg = settings || FbmSync.scriptSettings();
  if (!String(cfg.accountName || '').trim()) { return 'Phiên FBM chưa có tên đầy đủ của tài khoản đã xác minh; chiều đẩy đã bị dừng.'; }
  if (candidate.kind === 'create' && candidate.entity === 'customer' && (!String(cfg.customerPrefix || '').trim() || !String(cfg.customerCodeLength || '').trim())) { return 'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.'; }
  return '';
};

/** Kiểm tra mã ma_kh FBM tự sinh trước khi gửi lệnh lưu Customer mới. */
FbmSync.validateAutoCustomerCode = function (code, settings) {
  var cfg = settings || FbmSync.scriptSettings(), value = String(code || '').trim(), prefix = String(cfg.customerPrefix || '').trim(), length = Number(cfg.customerCodeLength || 0);
  if (!prefix || !length) { return { ok: false, reason: 'Thiếu tiền tố hoặc độ dài mã khách FBM.' }; }
  if (value.indexOf(prefix) !== 0 || value.length !== length) { return { ok: false, reason: 'Mã khách FBM tự sinh không khớp tiền tố/độ dài đã cấu hình: ' + value }; }
  return { ok: true };
};

/** Cầu dao lỗi đẩy: chạm `pushFailuresMax` thì dừng cả chiều đẩy, đến khi người dùng sửa nguyên nhân và mở lại các bản ghi lỗi. */
FbmSync.pushFailuresGuard = function (state) {
  var count = Object.keys(FbmSync.pushFailuresRead().hashes).length;
  if (count < FbmSync.BUDGET.pushFailuresMax) { return false; }
  var message = 'Đã có ' + count + ' bản ghi đẩy lỗi chưa xử lý; dừng chiều đẩy để không tốn thêm lượt gọi FBM. Xem tab Lỗi và Log, sửa nguyên nhân rồi bấm "Mở lại bản ghi lỗi".';
  state.phase = 'paused'; state.entity = ''; state.current = ''; state.cursor = {}; state.retryable = false;
  state.lastFailureCode = 'PUSH_FAILURES_LIMIT'; state.lastError = message; state.message = message;
  FbmSync.stateWrite(state);
  if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_failures_limit', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: message, detail: { count: count, max: FbmSync.BUDGET.pushFailuresMax } }); }
  return true;
};

/** Câu cho người dùng vì sao một ứng viên đẩy để lượt sau. */
FbmSync.pushDeferReason = function (change) {
  if (change.status === 'gone') { return 'dòng không còn trên Sheet'; }
  if (change.status === 'busy') { return String(change.busy && change.busy.reason || 'bản ghi đang bận'); }
  return 'dòng vừa được sửa sau lúc chọn';
};

/**
 * Dấu trang của chặng đẩy: `at` là vị trí trong danh sách đẩy có `size` mã, `pass` là số lần đã quét, `progress` là số mã vòng này đã xử lý xong. Mọi kiểu dấu của chặng đẩy (`push_scan`, `push_wait`, `push_lookup`) mang đủ bốn số này.
 * Dấu không mang số dòng Sheet: mã là địa chỉ duy nhất ngoài tầng đọc.
 */
FbmSync.pushCursor = function (cursor, extra) {
  var value = cursor || {};
  return Object.assign({ kind: 'push_scan', at: Number(value.at || 0), size: Number(value.size || 0), pass: Number(value.pass || 0), progress: Number(value.progress || 0) }, extra || {});
};
/** Sang mã kế; `done` là mã vừa xử lý xong, khác với mã hoãn vì bận hoặc vừa sửa. */
FbmSync.pushCursorNext = function (cursor, done) {
  var next = FbmSync.pushCursor(cursor);
  next.at += 1;
  if (done) { next.progress += 1; }
  return next;
};

/** Một chỗ mở chặng đẩy cho mọi chiều: dấu trang chưa có danh sách nên bước đầu tiên quét cả hai sheet (`pushPassNext`). */
FbmSync.pushStageBegin = function (state) {
  // Cổng do `preflightLocalStep` quyết một lần cho lượt; thiếu nghĩa là mở. Đóng thì giữ nguyên dấu, vì nó vẫn đúng.
  if (state.pushGate && state.pushGate.open === false) { return FbmSync.pushStageEnd(state, 0, null); }
  FbmSync.pushCleanClear();
  state.phase = 'push'; state.entity = 'customer'; state.current = ''; state.cursor = FbmSync.pushCursor({});
  state.message = 'Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...';
  FbmSync.stateWrite(state);
  return FbmSync.nextPushRequest(state);
};

/**
 * Hết danh sách: quét lại cả hai sheet bằng đúng phép quét của đầu chặng. Không còn ứng viên thì chặng sạch. Còn thì ghi danh sách mới và làm tiếp, trừ khi vòng vừa rồi đi hết danh sách mà không xử lý xong mã nào (mọi mã hoãn vì bận hoặc vừa sửa) hoặc đã đủ `pushPassesMax` lần quét: khi đó dừng không sạch và ghi Log số bản ghi còn lại, lượt sau làm tiếp.
 * `pass` 0 là chưa có danh sách (đầu chặng, state của bản cũ); danh sách thiếu hay hỏng giữa vòng thì `at` chưa tới `size`; hai trường hợp này không phải vòng đứng yên.
 * Trả danh sách mới, hoặc `null` khi chặng đã kết thúc và state đã chốt.
 */
FbmSync.pushPassNext = function (state) {
  var cursor = FbmSync.pushCursor(state.cursor), stalled = cursor.pass > 0 && cursor.at >= cursor.size && !cursor.progress;
  // Đọc trước khi đọc Sheet: lần quét này sạch thì dấu là đúng bản này, mọi sửa sau lúc đọc đều làm dấu lệch.
  var mark = FbmSync.pushCleanNow();
  var found = FbmSync.withLocalSnapshot(function () { var scan = FbmSync.localScan(); return FbmSync.pushCandidatesAll(scan, FbmSync.pushReviewContext(state, scan)); });
  ['customer', 'activity'].forEach(function (entity) {
    var step = 'push_' + entity;
    if (typeof FbmSync.businessStepStart !== 'function') { return; }
    FbmSync.businessStepStart(state, step, { mode: state.mode, scan: state.scan, entity: entity });
    FbmSync.businessStepAdd(state, step, { candidateCount: found.filter(function (item) { return item.entity === entity; }).length });
  });
  if (!found.length) { return FbmSync.pushStageEnd(state, 0, mark); }
  if (stalled || cursor.pass >= FbmSync.BUDGET.pushPassesMax) {
    var reason = 'Chặng đẩy dừng khi còn ' + found.length + ' bản ghi chưa xong ' + (stalled ? '(vòng vừa rồi mọi bản ghi đều hoãn vì đang bận hoặc vừa sửa)' : '(đã quét đủ ' + FbmSync.BUDGET.pushPassesMax + ' lần)') + '; lượt sau làm tiếp.';
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_unfinished', outcome: typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', cycleId: String(state.runId || ''), reason: reason, detail: { remaining: found.length, passes: cursor.pass, stalled: stalled } }); }
    return FbmSync.pushStageEnd(state, found.length);
  }
  var size = FbmSync.pushListWrite(found);
  state.cursor = FbmSync.pushCursor({ pass: cursor.pass + 1, size: size });
  FbmSync.stateWrite(state);
  return found.slice(0, size).map(function (item) { return { entity: item.entity, id: item.id }; });
};

/** Kết thúc chặng đẩy (sạch hoặc dừng không sạch): xóa danh sách, chốt lượt. `mark` chỉ có khi lần quét vừa rồi không còn ứng viên: ghi làm dấu lần đẩy sạch. */
FbmSync.pushStageEnd = function (state, remaining, mark) {
  FbmSync.pushListClear();
  if (mark) { FbmSync.pushCleanWrite(mark); }
  state.phase = 'done'; state.entity = ''; state.current = ''; state.cursor = {};
  state.message = FbmSync.runDoneMessage(state) + (remaining ? ' Còn ' + remaining + ' bản ghi chưa đẩy xong; lượt sau làm tiếp.' : '');
  FbmSync.stateWrite(state);
  return null;
};

/** Tạm dừng chiều đẩy giữa chặng: danh sách bỏ đi, lượt sau quét lại từ đầu. */
FbmSync.pushStagePause = function (state, message) {
  FbmSync.pushListClear();
  state.phase = 'paused'; state.message = message; FbmSync.stateWrite(state);
  return null;
};

/** Đọc danh sách của dấu trang; khóa hỏng thì ghi Log lỗi, khóa thiếu hay lệch số mã (state bản cũ, khóa đã xóa) thì trả rỗng để quét lại. */
FbmSync.pushListLoad = function (state) {
  var list = [];
  try { list = FbmSync.pushListRead(); } catch (listError) {
    if (typeof logEvent === 'function') { logEvent({ source: 'fbm_sync', action: 'push_list_read', outcome: typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', cycleId: String(state.runId || ''), reason: String(listError && listError.message || listError) + ' Quét lại cả hai sheet.' }); }
    return [];
  }
  return list.length === FbmSync.pushCursor(state.cursor).size ? list : [];
};

/**
 * Tạo request kế tiếp của chặng đẩy từ state, không giữ hàng đợi trong Extension. Mỗi mã trong danh sách: đọc lại đúng dòng theo mã (Giao dịch kèm khách cha), xét bằng `pushReview`, có việc thì làm; hết danh sách thì `pushPassNext` quét lại.
 */
FbmSync.nextPushRequest = function (state) {
  var globalCategoryBlock = state.metadata && (state.metadata.categoryLookupFailed || (state.metadata.categoryBlocks || []).some(function (block) { return !block.code; }));
  if (globalCategoryBlock) { return FbmSync.pushStagePause(state, 'Đã đọc xong nhưng tạm dừng chiều đẩy vì danh mục chưa khớp FBM.'); }
  var context = FbmSync.pushReviewContext(state), list = FbmSync.pushListLoad(state);
  for (;;) {
    var cursor = FbmSync.pushCursor(state.cursor);
    if (cursor.at >= list.length) {
      list = FbmSync.pushPassNext(state);
      if (!list) { return null; }
      continue;
    }
    if (FbmSync.pushFailuresGuard(state)) { FbmSync.pushListClear(); return null; }
    var item = list[cursor.at], entity = item.entity, pushStep = 'push_' + entity;
    var record = FbmSync.readLocalById(entity, item.id);
    var parent = record && entity === 'activity' && String(record.customerId || '').trim() ? FbmSync.readLocalById('customer', record.customerId) : null;
    var candidate = record ? FbmSync.pushReview(entity, record, parent, context) : null;
    state.entity = entity;
    if (!candidate) { state.cursor = FbmSync.pushCursorNext(cursor, true); continue; }
    if (candidate.kind === 'stuck') {
      var stuck = FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Hoạt động đang đẩy từ lần trước mà mất phản hồi; FBM không có đường tra lại nên không tự gửi lại để tránh tạo trùng. Kiểm tra trên FBM: chưa có thì bấm Mở lại bản ghi lỗi để tạo lại.' }, 'activity_create');
      state.cursor = FbmSync.pushCursorNext(cursor, stuck === 'ok'); FbmSync.stateWrite(state); continue;
    }
    var configError = FbmSync.pushConfigErrors(candidate, context.settings());
    if (configError) { return FbmSync.pushStagePause(state, configError); }
    if (candidate.kind === 'recover') {
      // Tra là request đọc nên không qua kiểm danh mục/điều kiện đẩy; không có MST thì không tra được và không được tạo lại.
      state.current = candidate.id;
      var recovery = FbmSync.customerCreateRecoveryRequest(state, Object.assign({}, cursor, { candidate: candidate }));
      if (recovery) { return recovery; }
      var lost = FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Customer đang đẩy từ lần trước nhưng không còn Mã số thuế để tra trên FBM; không tự tạo lại. Kiểm tra trên FBM rồi bấm Mở lại bản ghi lỗi nếu cần tạo lại.' }, 'customer_create_recover');
      state.cursor = FbmSync.pushCursorNext(cursor, lost === 'ok'); FbmSync.stateWrite(state); continue;
    }
    // Phép xét danh mục cần danh mục FBM còn mới; lệch người phụ trách thì không cần.
    if (!(candidate.hold && candidate.hold.code === 'owner') && FbmSync.pushLookupDue(state)) {
      state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_lookup' });
      state.message = 'Đang kiểm lại danh mục FBM trước khi đẩy tiếp...'; FbmSync.stateWrite(state);
      return FbmSync.lookupBatchRequest();
    }
    if (candidate.hold) {
      var held = FbmSync.markPushSkipped(state, candidate, candidate.hold.status, candidate.hold.reason);
      state.cursor = FbmSync.pushCursorNext(cursor, held === 'ok'); FbmSync.stateWrite(state); continue;
    }
    var request;
    if (entity === 'customer') {
      request = candidate.kind === 'create' ? FbmSync.customerCreateOpenRequest() : FbmSync.customerEditOpenRequest(candidate.record.fbmId);
    } else {
      request = candidate.kind === 'create' ? FbmSync.activityCreateRequest(candidate.record, context.categoryGate) : FbmSync.activityEditOpenRequest(candidate.record.fbmId);
    }
    if (state.metadata.categoryCheck) { state.metadata.categoryCheck.pushed = Number(state.metadata.categoryCheck.pushed || 0) + 1; }
    state.phase = 'push'; state.current = candidate.id; state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_wait', operation: request.meta.kind, entity: entity, candidate: FbmSync.pushCandidateForState(candidate) });
    state.message = 'Đang đẩy ' + (entity === 'customer' ? 'khách hàng' : 'giao dịch') + ' ' + candidate.id + '...'; FbmSync.stateWrite(state);
    // `09/04` bước 1: state chốt cursor trước, rồi ghi `đang đẩy` và giữ bản ghi trong sổ bận trong cùng một lần qua cửa, chỉ khi dòng còn đúng như lúc chọn, rồi mới phát lệnh; ghi Sheet không được thì ném lỗi và lệnh ghi FBM không được phát (FBM-002).
    var started = FbmSync.pushRowChange(entity, candidate.id, { expect: FbmSync.pushCandidateExpect(candidate), allowGone: true, build: function () {
      return { patch: { id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.pushing }, hold: FbmSync.PUSH_HOLD_REASON };
    } });
    if (started.status === 'ok') { return request; }
    // Dòng vừa đổi, đã vắng hoặc đang bận: chưa phát gì, sang mã kế và để lần quét lại xét lại.
    if (state.metadata.categoryCheck) { state.metadata.categoryCheck.pushed -= 1; }
    state.current = ''; state.cursor = FbmSync.pushCursorNext(cursor, false);
    state.counts.skipped += 1; state.message = 'Hoãn ' + entity + ' ' + candidate.id + ' tới lượt sau: ' + FbmSync.pushDeferReason(started) + '.';
    if (typeof FbmSync.businessStepAdd === 'function') { FbmSync.businessStepAdd(state, pushStep, { skipped: 1 }); }
    FbmSync.stateWrite(state);
  }
};

/** Xử lý bước mở form và bước lưu của một candidate push. */
FbmSync.continuePush = function (state, response) {
  var cursor = state.cursor, candidate = typeof FbmSync.hydratePushCandidate === 'function' ? FbmSync.hydratePushCandidate(cursor.candidate) : cursor.candidate, gate = FbmSync.stateCategoryGate(state);
  if (cursor.operation === 'customer_create_recover') {
    return FbmSync.finishCustomerCreateRecovery(state, response);
  }
  if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') {
    return FbmSync.finishPushVerification(state, response);
  }
  if (cursor.operation === 'activity_marker_clean') {
    return FbmSync.finishMarkerClean(state, cursor, candidate, null);
  }
  if (cursor.operation === 'customer_create_open') {
    var autoCode = FbmSync.extractAutoCustomerCode(response);
    var codeCheck = FbmSync.validateAutoCustomerCode(autoCode);
    if (!codeCheck.ok) { throw new Error(codeCheck.reason); }
    if (!autoCode) { throw new Error('Không lấy được _ma_kh_auto từ form tạo Customer.'); }
    candidate.autoCode = autoCode; cursor.candidate = typeof FbmSync.pushCandidateForState === 'function' ? FbmSync.pushCandidateForState(candidate) : candidate; cursor.operation = 'customer_create_save'; state.cursor = cursor; FbmSync.stateWrite(state);
    return FbmSync.customerCreateRequest(candidate.record, autoCode, '', gate);
  }
  if (cursor.operation === 'customer_edit_open') {
    var customerOldValues = FbmSync.requireFormFields(FbmSync.requireOpenedRecord(FbmSync.extractFormValues(response, 'customer'), 'customer', candidate), 'customer');
    var customerDecision = FbmSync.pushOpenDecision('customer', candidate.record, customerOldValues, gate);
    if (customerDecision.action !== 'save') { return FbmSync.finishPushOpenWithoutSave(state, cursor, candidate, customerOldValues, customerDecision, gate); }
    var customerSaveRequest = FbmSync.customerEditRequest(candidate.record, customerOldValues, gate);
    cursor.operation = 'customer_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor; FbmSync.stateWrite(state);
    return customerSaveRequest;
  }
  if (cursor.operation === 'activity_edit_open') {
    var activityOldValues = FbmSync.requireOpenedRecord(FbmSync.extractFormValues(response, 'activity'), 'activity', candidate);
    var configuredOwner = String(FbmSync.scriptSettings().accountName || ''), currentOwner = String(activityOldValues.owner || '');
    if (!configuredOwner || (currentOwner && currentOwner !== configuredOwner)) { throw new Error('Hoạt động thuộc owner FBM khác tài khoản đã cấu hình.'); }
    FbmSync.requireFormFields(activityOldValues, 'activity');
    var activityDecision = FbmSync.pushOpenDecision('activity', candidate.record, activityOldValues, gate);
    if (activityDecision.action !== 'save') { return FbmSync.finishPushOpenWithoutSave(state, cursor, candidate, activityOldValues, activityDecision, gate); }
    var activitySaveRequest = FbmSync.activityEditRequest(candidate.record, activityOldValues, gate);
    cursor.operation = 'activity_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor; FbmSync.stateWrite(state);
    return activitySaveRequest;
  }
  if (cursor.operation === 'activity_create' || cursor.operation === 'customer_create_save' || cursor.operation === 'customer_edit_save' || cursor.operation === 'activity_edit_save') {
    var pushed = FbmSync.markPushResult(candidate, response, cursor.operation);
  } else {
    throw new Error('Không nhận diện được bước push: ' + cursor.operation);
  }
  state = FbmSync.stateRead();
  FbmSync.pushFailuresRemove([cursor.entity + ':' + String(candidate.id || '')]);
  cursor.operation = cursor.entity === 'customer' ? 'customer_verify' : 'activity_verify';
  state.cursor = cursor; state.message = 'Đã ghi ' + cursor.entity + ' ' + candidate.id + '; đang đọc xác nhận FBM...'; FbmSync.stateWrite(state);
  return cursor.entity === 'customer' ? FbmSync.customerEditOpenRequest(pushed.fbmId) : FbmSync.activityEditOpenRequest(pushed.fbmId);
};
