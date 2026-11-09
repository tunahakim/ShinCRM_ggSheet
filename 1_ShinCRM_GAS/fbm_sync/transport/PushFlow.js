/**
 * Các bước của một ứng viên trong chặng đẩy (`pushCandidateRun`, thiết kế 5.8) và các công cụ chúng dùng: mở form, so ba bản, lưu, áp kết quả hai pha (`pushResultSent`, `pushResultVerify`), tra lại lệnh tạo khách mất phản hồi, dọn dấu `#SC`, quyết khi một bước lỗi (`pushErrorDecide`).
 * Mọi hàm ở đây sửa trên ô lượt của chặng (bản sao do khung lát cấp), không đọc hay ghi ô lượt, không dựng phong bì, không ghi Log thẳng (lỗi và bỏ qua vào bộ gom Log của lát). Người điều phối chặng ở `PushStage.js`.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đọc companion và lookup một lần trước chiều đẩy; mismatch chỉ chặn push. Dòng Log của khối chặn mới đưa vào `logs` của bên gọi. */
FbmSync.prepareCategoryGate = function (state, logs) {
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
  Array.prototype.push.apply(logs, FbmSync.categoryBlockLines(blocks.filter(function (block) { return !logged[FbmSync.categoryBlockKey(block)]; })));
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
/** Tài liệu 09/03: mã danh mục bị chặn phải vào Log kèm tên FBM hiện tại, không chỉ nằm trong state; thiếu danh sách FBM thì chặn cả chiều đẩy nên là lỗi. Trả dòng Log, bên gọi ghi. */
FbmSync.categoryBlockLines = function (blocks) {
  return (blocks || []).map(function (block) {
    var whole = !block.code;
    return { action: 'category_block', outcome: whole ? LOG_ERROR : LOG_WARN, entity: 'category', recordId: String(block.code || ''), reason: String(block.source || '') + (whole ? '' : ' ' + String(block.code)) + ': ' + String(block.reason || '').replace(/\.?\s*$/, '.') + (whole ? ' Bỏ toàn bộ chiều đẩy kỳ này.' : ' Bản ghi dùng mục này không được đẩy lên FBM cho đến khi sửa Category.'), detail: { source: String(block.source || ''), code: String(block.code || '') } };
  });
};
/** Push thành công chỉ cộng vào số liệu bước; lỗi và bỏ qua vào bộ gom Log của lát. */
FbmSync.logPushRecord = function (candidate, operation, outcome, reason, detail) {
  var ok = typeof LOG_OK !== 'undefined' ? LOG_OK : 'ok';
  if (!outcome || outcome === ok) { return null; }
  return FbmSync.recordIssueAdd('push', String(candidate && candidate.entity || ''), String(detail && detail.syncStatus || ''), String(candidate && candidate.id || ''), reason, outcome);
};
/**
 * Pha 1 của áp kết quả đẩy (`pushResultApply`): lệnh lưu đã trả thành công. Lấy ID FBM (thiếu thì ném `FBM_PUSH_RESPONSE_INCOMPLETE`), băm bản đã gửi, ghi sổ chờ xác nhận rồi mới ghi dòng `đã đẩy chờ xác nhận`. Baseline chỉ đổi ở pha 2, sau bước đọc lại.
 * `gate` là cổng danh mục của chặng. Trả patch đã ghi lên dòng (có `fbmId` để mở form đọc lại).
 */
FbmSync.pushResultSent = function (candidate, response, operation, gate) {
  var record = candidate.record || {}, values = FbmSync.extractInternalValues(response), data = FbmSync.protocol.parse(response) || {};
  data = data.d || data;
  var patch = { id: record.id, syncStatus: FbmSync.SYNC_STATUS.pushed, fbmHash: String(record.fbmHash || '').trim() };
  if (candidate.entity === 'customer') {
    patch.fbmId = String(values.stt_rec_kh || values.stt_rec_kh0 || record.fbmId || '').trim();
    patch.fbmCustomerCode = String(values.ma_kh || record.fbmCustomerCode || candidate.autoCode || '').trim();
    if (!patch.fbmId || !patch.fbmCustomerCode) { throw FbmSync.pushResponseIncomplete('FBM không trả đủ stt_rec_kh/ma_kh sau khi ghi Customer.'); }
  } else {
    var activityId = values.id || (data && data.id) || record.fbmId || '';
    patch.fbmId = String(activityId).trim();
    if (!patch.fbmId) { throw FbmSync.pushResponseIncomplete('FBM không trả id sau khi ghi Activity.'); }
  }
  // Giữ baseline cũ; hash payload gửi được lưu riêng để kỳ đọc nhận ra chính lần ghi này.
  // Fingerprint Activity có `id` FBM nên phải tính sau khi gắn ID vừa nhận; tính trên bản ghi lúc tạo (chưa có ID) thì mọi lệnh tạo đọc xác nhận lệch thành xung đột giả (FBM-050).
  var sentHash = FbmSync.hash(Object.assign({}, record, { fbmId: patch.fbmId }), candidate.entity, gate);
  // Sổ chờ ghi TRƯỚC, Sheet sau: lệnh ghi đã tới FBM nên mục chờ phải còn kể cả khi ghi Sheet hỏng, không thì lượt sau mất dấu và có thể tạo trùng (FBM-027). Mục chờ không bao giờ xóa theo tuổi. Hash chờ xác nhận chỉ lưu trong state server, không ghi vào Sheet.
  try {
    FbmSync.pendingPushSet(candidate.entity, record.id, { hSHIN: sentHash, sentAt: Date.now(), fbmId: patch.fbmId });
  } catch (pendingError) {
    throw new Error('Không ghi được hash đang chờ xác nhận sau push: ' + String(pendingError && pendingError.message || pendingError));
  }
  FbmSync.pushRowChange(candidate.entity, record.id, { build: function () { return { patch: patch }; } });
  return patch;
};
/** FBM báo lưu thành công mà không trả ID: không biết bản ghi nằm đâu trên FBM nên không đọc xác nhận được. */
FbmSync.pushResponseIncomplete = function (message) {
  var error = new Error(message);
  error.code = 'FBM_PUSH_RESPONSE_INCOMPLETE';
  return error;
};

/** Khi New Customer mất response, chỉ đọc lại theo mã tự sinh để xác định có ghi thành công hay chưa. */
FbmSync.customerCreateRecoveryRequest = function (state, cursor, settings) {
  var candidate = FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}), record = candidate.record || {}, taxNumber = String(record.taxNumber || '').trim();
  if (!taxNumber) { return null; }
  state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_wait', operation: 'customer_create_recover', entity: 'customer', candidate: FbmSync.pushCandidateForState(candidate) });
  state.message = 'Đang kiểm tra Customer vừa tạo sau khi mất phản hồi; không gửi lại lệnh ghi.';
  return FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -2, gridRefresh: false, scope: null, filter: ['ma_so_thue:**' + taxNumber] }, settings);
};
/**
 * Đối chiếu đúng một dòng Customer sau create mất response rồi vá ID/baseline.
 * Cùng phiên thì còn mã tự sinh để khớp kèm MST và so dữ liệu đã gửi. Phiên sau (`recover`) mã tự sinh đã mất và người dùng có thể đã sửa bản ghi, nên chỉ khớp MST rồi vá hai mã FBM, baseline để rỗng như `09/04` bước 5: lần quét lại của chặng đẩy chọn lại dòng và bước mở form so hai bên (chưa có mốc thì không bao giờ lưu đè), ghi baseline hoặc báo xung đột.
 */
FbmSync.finishCustomerCreateRecovery = function (state, response) {
  var cursor = state.cursor || {}, candidate = FbmSync.hydratePushCandidate(cursor.candidate || {}), record = candidate.record || {}, grid = FbmSync.rowsToRecords('customer', response), taxNumber = String(record.taxNumber || '').trim(), autoCode = String(candidate.autoCode || '').trim(), laterRun = candidate.kind === 'recover', rows = grid.rows.filter(function (row) { return String(row.ma_so_thue || '').trim() === taxNumber && (laterRun || String(row.ma_kh || '').trim() === autoCode); }), gate = FbmSync.stateCategoryGate(state), id = String(candidate.id || '');
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
    FbmSync.businessStepAdd(state, 'push_customer', { written: 1, sheetWriteBatches: 1 });
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã tìm thấy trên FBM Customer ' + local.id + ' tạo ở lần trước; đã vá mã FBM, sẽ so hai bên trước khi ghi.';
    return;
  }
  state.counts.pushed += 1;
  FbmSync.businessStepAdd(state, 'push_customer', { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 });
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã xác nhận Customer tạo thành công sau khi mất phản hồi.';
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
  var decision = FbmSync.threeWay(String(record && record.fbmHash || '').trim(), FbmSync.hash(record, entity, gate), FbmSync.hash(formValues, entity, gate));
  var markerLeft = entity === 'activity' && !!FbmSync.activityMarkerId(formValues && formValues.details);
  var action = decision.hFBM === decision.hSHIN ? (markerLeft ? 'save' : 'settled') : !decision.fbmChanged ? 'save' : decision.shinChanged ? 'conflict' : 'fbmOnly';
  return { action: action, hFBM: decision.hFBM, hSHIN: decision.hSHIN, hBASE: decision.hBASE };
};

/**
 * Bước mở form quyết không lưu: ghi kết quả lên dòng trong Cửa bản ghi, nhả bản ghi và dời dấu trang sang ứng viên kế, không dừng phiên.
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
  if (outcome !== 'gone') { FbmSync.businessStepAdd(state, 'push_' + entity, { written: 1, sheetWriteBatches: 1 }); }
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
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = message;
};

/**
 * Pha 2 của áp kết quả đẩy (`pushResultApply`): đọc lại đúng bản ghi và so hash với payload đã gửi. Dòng cục bộ đọc trong cửa cùng lần ghi kết quả; bản ghi được nhả trong cùng lần ghi đó, trừ khi còn bước dọn dấu #SC.
 * Trả `{ next }` khi còn bước dọn dấu, ngược lại `{}` (dấu trang đã sang ứng viên kế).
 */
FbmSync.pushResultVerify = function (state, response, settings) {
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
    FbmSync.businessStepAdd(state, 'push_' + entity, { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 });
    // G12: dấu #SC chỉ cần tới lúc có ID FBM nên bỏ ngay bằng một lệnh sửa dựng từ form vừa đọc, không mở form thêm. ShinCRM đã sửa tiếp thì để lệnh đẩy kế tiếp (không mang dấu) bỏ hộ.
    if (outcome.cleaning) {
      cursor.operation = 'activity_marker_clean'; state.cursor = cursor; state.message = 'Đang bỏ dấu nhận diện của giao dịch ' + id + ' trên FBM...';
      return { next: FbmSync.activityEditRequest(Object.assign({}, local, { fbmId: values.id }), values, gate, settings) };
    }
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã xác nhận ' + entity + ' ' + id + '.';
    return {};
  }
  var differing = FbmSync.diffFieldText(entity, local, values, gate);
  if (markerLeft && !incomingHash) { differing = ' (FBM vẫn giữ dấu nhận diện #SC sau lệnh sửa không mang dấu)'; FbmSync.markerCleanCount(state); }
  if (outcome.outcome === 'notApplied') {
    state.counts.skipped += 1;
    FbmSync.logPullRecord(entity, values, local, sync.notApplied, 'FBM không đổi sau lần ghi' + differing + '; đọc xác nhận trực tiếp.');
    state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'FBM chưa áp dụng ' + entity + ' ' + id + '.';
    return {};
  }
  // Xung đột không dừng phiên (`09/02` bước 3): dòng đã thành `xung đột chờ quyết` và được nhả, các bản ghi sau vẫn đẩy.
  FbmSync.logPushRecord(candidate, cursor.operation, typeof LOG_CONFLICT !== 'undefined' ? LOG_CONFLICT : 'conflict', 'Đọc xác nhận khác dữ liệu vừa ghi' + differing + '; chờ quyết định xung đột.', { syncStatus: sync.conflict });
  state.metadata.conflictCount = Number(state.metadata.conflictCount || 0) + 1;
  state.counts.conflict += 1;
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đọc xác nhận ' + entity + ' ' + id + ' khác dữ liệu vừa ghi; chuyển xung đột chờ quyết.';
  return {};
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
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.phase = 'push'; state.lastError = ''; state.message = failure ? 'Chưa bỏ được dấu nhận diện của giao dịch ' + id + '; đang xử lý bản ghi tiếp theo.' : 'Đã bỏ dấu nhận diện của giao dịch ' + id + '.';
};

/**
 * Bước đọc xác nhận lỗi (FBM báo lỗi, form thiếu trường): lệnh ghi đã tới FBM nên không bao giờ gửi lại; mục chờ xác nhận giữ nguyên để kỳ đọc sau nhận ra lần ghi này. Lượt dừng lỗi, bản ghi giữ trong sổ bận. Trả `end` của chặng.
 */
FbmSync.pushVerifyFailed = function (state, cursor, failure) {
  var candidate = FbmSync.hydratePushCandidate(cursor.candidate || {}), entity = String(cursor.entity || ''), id = String(candidate.id || '');
  var message = 'Đã ghi FBM nhưng chưa xác nhận được ' + entity + ' ' + id + ': ' + FbmSync.pushFailureDetail(failure).reason + '. Không tự ghi lại.';
  state.counts.error += 1;
  FbmSync.businessStepAdd(state, 'push_' + entity, { errors: 1 });
  FbmSync.logPushRecord(candidate, cursor.operation, LOG_ERROR, message, { failureCode: 'FBM_VERIFY_FAILED' });
  return { kind: 'fail', code: 'FBM_VERIFY_FAILED', message: message };
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
  var gate = FbmSync.stateCategoryGate(state), localHash = FbmSync.hash(candidate.record || {}, candidate.entity, gate);
  FbmSync.pushFailureAdd(candidate.entity + ':' + String(candidate.id || ''), localHash, Object.assign({}, detail, { requestKind: String(operation || candidate.kind || '') }));
  // Lệnh tạo đã có thể tới FBM thì giữ `đang đẩy` để không bị tạo lại (FBM-027); lỗi ở bước mở form thì lệnh lưu chưa phát nên an toàn để đẩy lại.
  var waitingForMarker = candidate.kind === 'recover' || candidate.kind === 'stuck' || (candidate.kind === 'create' && operation !== 'customer_create_open');
  var failedStatus = detail.code === FbmSync.PUSH_RECORD_NOT_FOUND ? FbmSync.SYNC_STATUS.missing : FbmSync.SYNC_STATUS.error;
  var done = FbmSync.pushRowChange(candidate.entity, String(candidate.id || ''), { expect: FbmSync.pushCandidateExpect(candidate), allowGone: true, releaseGone: true, build: function () {
    return { patch: { id: candidate.id, syncStatus: waitingForMarker ? FbmSync.SYNC_STATUS.pushing : failedStatus }, release: !waitingForMarker };
  } });
  // Lỗi đã vào sổ lỗi và số đếm ở trên nên mọi nhánh đều phải có Log; dòng chưa ghi được thì Log nói rõ vì sao và không khẳng định trạng thái dòng.
  var written = done.status === 'ok';
  FbmSync.logPushRecord(candidate, operation || candidate.kind, typeof LOG_ERROR !== 'undefined' ? LOG_ERROR : 'error', written ? detail.reason : detail.reason + ' (chưa ghi trạng thái lỗi lên dòng: ' + FbmSync.pushDeferReason(done) + '; lượt sau xét lại)', { syncStatus: written ? failedStatus : '', writeStatus: done.status, failureCode: detail.code, httpStatus: detail.status, fieldName: detail.fieldName });
  FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { errors: 1 });
  return done.status;
};

/** Ứng viên vừa chọn (còn `raw`) thì bước ghi phải thấy đúng dòng lúc chọn; ứng viên dựng lại từ state là dòng đồng bộ đang giữ nên không so. */
FbmSync.pushCandidateExpect = function (candidate) {
  return candidate && candidate.raw ? FbmSync.recordSignature(candidate.raw) : undefined;
};

/**
 * Ghi lý do các ứng viên bị giữ (`candidate.hold`) lên dòng bằng MỘT lần ghi Sheet cho cả lô, không phát request ghi ra FBM; dòng đã đổi sau lúc chọn, vắng hoặc đang bận thì không ghi và không tính, lượt sau xét lại.
 * Đúng dòng thì cộng `progress` của dấu trang, số bỏ qua, số liệu bước, Log. `hold.reason` là câu cho người dùng (nêu mã bản ghi, vào `state.message`); `hold.cause` là câu chung cho cả nhóm không nêu mã, nên bộ gom Log ra một dòng mỗi nhóm kèm danh sách mã. Trả số dòng đã ghi.
 */
FbmSync.markPushSkippedBatch = function (state, candidates) {
  var results = FbmSync.pushRowsChange(candidates.map(function (candidate) {
    return { entity: candidate.entity, id: String(candidate.id || ''), expect: FbmSync.pushCandidateExpect(candidate), patch: { id: candidate.id, syncStatus: candidate.hold.status || FbmSync.SYNC_STATUS.skipped } };
  })), written = 0;
  candidates.forEach(function (candidate, index) {
    if (results[index].status !== 'ok') { return; }
    written += 1;
    state.counts.skipped += 1;
    state.message = String(candidate.hold.reason || 'Bản ghi chưa đủ điều kiện đẩy.');
    FbmSync.logPushRecord(candidate, candidate.kind, typeof LOG_WARN !== 'undefined' ? LOG_WARN : 'warn', candidate.hold.cause || candidate.hold.reason, { syncStatus: candidate.hold.status || FbmSync.SYNC_STATUS.skipped });
    FbmSync.businessStepAdd(state, 'push_' + String(candidate.entity || ''), { skipped: 1 });
  });
  if (written) { state.cursor = Object.assign({}, state.cursor, { progress: FbmSync.pushCursor(state.cursor).progress + written }); }
  return written;
};

/**
 * Một bước của ứng viên lỗi (`fromReply`: FBM trả lỗi; ngược lại bước xử lý response ném): không bao giờ phát lại lệnh đã gửi.
 * Đọc xác nhận lỗi thì dừng lượt (`pushVerifyFailed`); lệnh tạo khách FBM báo lỗi thì có thể đã tạo nên tra theo MST trước (FBM-027); dọn dấu `#SC` lỗi chỉ cảnh báo; còn lại ghi lỗi lên dòng (`markPushError`) rồi sang ứng viên kế. Trả `{ next }`, `{ end }` hoặc `{}` (dấu trang đã sang ứng viên kế).
 */
FbmSync.pushErrorDecide = function (state, failure, fromReply, settings) {
  var cursor = state.cursor || {};
  if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') { return { end: FbmSync.pushVerifyFailed(state, cursor, failure) }; }
  if (cursor.operation === 'activity_marker_clean') { FbmSync.finishMarkerClean(state, cursor, FbmSync.hydratePushCandidate(cursor.candidate || {}), failure || 'Lỗi không rõ.'); return {}; }
  if (fromReply && cursor.operation === 'customer_create_save' && cursor.candidate && cursor.candidate.kind === 'create') {
    var recovery = FbmSync.customerCreateRecoveryRequest(state, cursor, settings);
    if (recovery) { return { next: recovery }; }
  }
  var candidate = FbmSync.hydratePushCandidate(cursor.candidate || {});
  FbmSync.markPushError(state, candidate, failure, cursor.operation);
  state.cursor = FbmSync.pushCursorNext(cursor, true);
  state.current = '';
  state.phase = 'push';
  state.lastError = '';
  state.message = 'Đã ghi nhận lỗi đẩy ' + String(cursor.entity || '') + ' ' + String(candidate.id || '') + '; đang xử lý bản ghi tiếp theo.';
  return {};
};

/** Kiểm tra các núm an toàn trước khi phát request ghi đầu tiên. `cfg` là `scriptSettings(state)` bên gọi đã đọc. */
FbmSync.pushConfigErrors = function (candidate, cfg) {
  if (!cfg || typeof cfg !== 'object') { throw new Error('pushConfigErrors thiếu cài đặt (cfg); người điều phối phải đọc cài đặt của lát và truyền vào.'); }
  if (!String(cfg.accountName || '').trim()) { return 'Phiên FBM chưa có tên đầy đủ của tài khoản đã xác minh; chiều đẩy đã bị dừng.'; }
  if (candidate.kind === 'create' && candidate.entity === 'customer' && (!String(cfg.customerPrefix || '').trim() || !String(cfg.customerCodeLength || '').trim())) { return 'Thiếu tiền tố hoặc độ dài mã khách FBM; không tạo Customer mới.'; }
  return '';
};

/** Kiểm tra mã ma_kh FBM tự sinh trước khi gửi lệnh lưu Customer mới. `cfg` là `scriptSettings(state)` bên gọi đã đọc. */
FbmSync.validateAutoCustomerCode = function (code, cfg) {
  if (!cfg || typeof cfg !== 'object') { throw new Error('validateAutoCustomerCode thiếu cài đặt (cfg); người điều phối phải đọc cài đặt của lát và truyền vào.'); }
  var value = String(code || '').trim(), prefix = String(cfg.customerPrefix || '').trim(), length = Number(cfg.customerCodeLength || 0);
  if (!prefix || !length) { return { ok: false, reason: 'Thiếu tiền tố hoặc độ dài mã khách FBM.' }; }
  if (value.indexOf(prefix) !== 0 || value.length !== length) { return { ok: false, reason: 'Mã khách FBM tự sinh không khớp tiền tố/độ dài đã cấu hình: ' + value }; }
  return { ok: true };
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

/**
 * Người điều phối một bước của ứng viên đang đẩy (`pushCandidateRun`, cấp 4): `push_wait` tự đọc lỗi response của request nó gửi, không probe phiên và không đăng nhập rồi phát lại (lệnh ghi có thể đã tới FBM); lỗi đi `pushErrorDecide`.
 * Bước xong mà không còn request cho ứng viên này thì sang ứng viên kế (`pushNext`). Trả `{ next }` hoặc `{ end }`.
 */
FbmSync.pushCandidateRun = function (state, ctx, logs) {
  var success = FbmSync.protocol.assertSuccess(ctx.reply), step;
  if (!success.ok) {
    step = FbmSync.pushErrorDecide(state, { code: success.code, status: success.status, fieldName: success.bug && success.bug.FieldName, reason: (success.bug && (success.bug.Message || success.bug.message)) || 'FBM trả về lỗi nghiệp vụ' }, true, ctx.settings);
  } else {
    // Mọi lỗi của bước xử lý response là lỗi của bản ghi này: ghi lỗi lên dòng và đi tiếp, giữ object lỗi có mã để `markPushError` chọn đúng trạng thái (ví dụ FBM_RECORD_NOT_FOUND).
    try { step = FbmSync.pushOperationStep(state, FbmSync.protocol.parse(ctx.reply), ctx.settings); }
    catch (pushError) { step = FbmSync.pushErrorDecide(state, pushError && pushError.code ? pushError : (pushError && pushError.message || pushError), false, ctx.settings); }
  }
  return step.next || step.end ? step : FbmSync.pushNext(state, ctx.settings, logs, ctx.inputs.threshold);
};

/** Một bước của ứng viên theo `cursor.operation`: mở form, lưu, tra lại, đọc xác nhận, dọn dấu. Trả `{ next }` khi ứng viên còn bước, `{}` khi đã xong và dấu trang đã sang ứng viên kế; lỗi thì ném. */
FbmSync.pushOperationStep = function (state, response, cfg) {
  var cursor = state.cursor, candidate = FbmSync.hydratePushCandidate(cursor.candidate), gate = FbmSync.stateCategoryGate(state);
  if (cursor.operation === 'customer_create_recover') { FbmSync.finishCustomerCreateRecovery(state, response); return {}; }
  if (cursor.operation === 'customer_verify' || cursor.operation === 'activity_verify') { return FbmSync.pushResultVerify(state, response, cfg); }
  if (cursor.operation === 'activity_marker_clean') { FbmSync.finishMarkerClean(state, cursor, candidate, null); return {}; }
  if (cursor.operation === 'customer_create_open') {
    var autoCode = FbmSync.extractAutoCustomerCode(response);
    var codeCheck = FbmSync.validateAutoCustomerCode(autoCode, cfg);
    if (!codeCheck.ok) { throw new Error(codeCheck.reason); }
    if (!autoCode) { throw new Error('Không lấy được _ma_kh_auto từ form tạo Customer.'); }
    candidate.autoCode = autoCode; cursor.candidate = FbmSync.pushCandidateForState(candidate); cursor.operation = 'customer_create_save'; state.cursor = cursor;
    return { next: FbmSync.customerCreateRequest(candidate.record, autoCode, '', gate, cfg) };
  }
  if (cursor.operation === 'customer_edit_open') {
    var customerOldValues = FbmSync.requireFormFields(FbmSync.requireOpenedRecord(FbmSync.extractFormValues(response, 'customer'), 'customer', candidate), 'customer');
    var customerDecision = FbmSync.pushOpenDecision('customer', candidate.record, customerOldValues, gate);
    if (customerDecision.action !== 'save') { FbmSync.finishPushOpenWithoutSave(state, cursor, candidate, customerOldValues, customerDecision, gate); return {}; }
    var customerSaveRequest = FbmSync.customerEditRequest(candidate.record, customerOldValues, gate, cfg);
    cursor.operation = 'customer_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor;
    return { next: customerSaveRequest };
  }
  if (cursor.operation === 'activity_edit_open') {
    var activityOldValues = FbmSync.requireOpenedRecord(FbmSync.extractFormValues(response, 'activity'), 'activity', candidate);
    var openedOwnerError = FbmSync.ownerCheck(activityOldValues, cfg.accountName);
    if (openedOwnerError) { throw new Error(openedOwnerError); }
    FbmSync.requireFormFields(activityOldValues, 'activity');
    var activityDecision = FbmSync.pushOpenDecision('activity', candidate.record, activityOldValues, gate);
    if (activityDecision.action !== 'save') { FbmSync.finishPushOpenWithoutSave(state, cursor, candidate, activityOldValues, activityDecision, gate); return {}; }
    var activitySaveRequest = FbmSync.activityEditRequest(candidate.record, activityOldValues, gate, cfg);
    cursor.operation = 'activity_edit_save';
    delete cursor.oldValues;
    state.cursor = cursor;
    return { next: activitySaveRequest };
  }
  if (cursor.operation === 'activity_create' || cursor.operation === 'customer_create_save' || cursor.operation === 'customer_edit_save' || cursor.operation === 'activity_edit_save') {
    var pushed = FbmSync.pushResultSent(candidate, response, cursor.operation, gate);
  } else {
    throw new Error('Không nhận diện được bước push: ' + cursor.operation);
  }
  FbmSync.pushFailuresRemove([cursor.entity + ':' + String(candidate.id || '')]);
  cursor.operation = cursor.entity === 'customer' ? 'customer_verify' : 'activity_verify';
  state.cursor = cursor; state.message = 'Đã ghi ' + cursor.entity + ' ' + candidate.id + '; đang đọc xác nhận FBM...';
  return { next: cursor.entity === 'customer' ? FbmSync.customerEditOpenRequest(pushed.fbmId, cfg) : FbmSync.activityEditOpenRequest(pushed.fbmId, cfg) };
};
