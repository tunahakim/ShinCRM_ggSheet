/**
 * Chặng đẩy theo hợp đồng chung (thiết kế 3.1, 5.8): người điều phối của hai kiểu dấu chờ response `push_wait` (một bước của một ứng viên) và `push_lookup` (kiểm lại danh mục giữa chặng), cùng lối mở chặng từ chiều đọc.
 * Chặng chạy trên bản sao ô lượt: không đọc hay ghi ô lượt, không dựng phong bì, không ghi Log thẳng. Request đi ra trong `next`, dòng Log trong `patch.logs`, kết thúc trong `end`; khung lát (`stageRun`) gộp patch, phát request và giao `end` cho `pushEnd`, nơi duy nhất chốt lượt của chặng.
 * `end` có ba dạng: `done` (`remaining` số bản ghi chưa xong, `mark` dấu bốn phần khi lần quét vừa rồi sạch, `note` lời nối), `pause` (`message`, `code` khi là lỗi cần người dùng xử lý), `fail` (`code`, `message`).
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Trường ô lượt chặng đẩy được sửa; patch mang đúng các trường này từ bản sao, `metadata` gộp nông ở `stagePatchApply`. */
FbmSync.PUSH_PATCH_FIELDS = ['cursor', 'counts', 'metadata', 'session', 'message', 'phase', 'entity', 'current', 'lastError'];
FbmSync.pushPatch = function (state, logs) {
  var patch = { logs: logs };
  FbmSync.PUSH_PATCH_FIELDS.forEach(function (key) { if (state[key] !== undefined) { patch[key] = state[key]; } });
  return patch;
};

/**
 * Chặng đẩy nhận response: `push_lookup` nạp lô danh mục rồi đối chiếu lại Category, quay về đúng mã đang chờ trong danh sách; `push_wait` là một bước của ứng viên đang đẩy (`pushCandidateRun`).
 * Phần tử danh mục nghi phiên thì nhường cổng phiên probe lại, cursor còn nguyên nên dựng lại đúng lô. `push_wait` không bao giờ nhường cổng phiên: lệnh ghi không được phát lại.
 */
FbmSync.pushStage = function (ctx) {
  var state = ctx.state, logs = [], step;
  if (state.cursor.kind === 'push_lookup') {
    if (!FbmSync.lookupBatchApply(state, ctx.reply)) { return { patch: {}, session: { suspected: 'Phản hồi FBM đáng ngờ khi đọc danh mục; chưa đối chiếu gì, đang probe lại phiên.' } }; }
    FbmSync.prepareCategoryGate(state, logs);
    state.cursor = FbmSync.pushCursor(state.cursor);
    step = FbmSync.pushNext(state, ctx.settings, logs, ctx.inputs.threshold);
  } else {
    step = FbmSync.pushCandidateRun(state, ctx, logs);
  }
  return Object.assign({ patch: FbmSync.pushPatch(state, logs) }, step);
};

/** Đầu vào của chặng đọc qua cổng chủ: ngưỡng chấp thuận (cổng cài đặt). */
FbmSync.pushInputs = function () { return { threshold: settingsValue(FbmSync.SETTING_SECTIONS.run, 'approvalThreshold') }; };

/** Bước kết của chặng trong bảng cursor: chốt lượt rồi nối bước đếm khách. */
FbmSync.pushEnd = function (state, end) {
  return FbmSync.runTail(FbmSync.pushEndApply(state, end));
};

/**
 * Chốt lượt khi chặng đẩy kết thúc, một chỗ cho mọi lối ra: xóa danh sách đẩy (lượt sau quét lại); lần quét vừa rồi sạch (`mark`) thì ghi cổng `clean` và gỡ thông báo chờ duyệt.
 * Bản ghi còn giữ trong sổ bận lúc này là bản ghi mất phản hồi khi ghi (bản ghi xong đã nhả cùng lần ghi), nên `keepRecords` giữ chúng tới lượt mở sau.
 */
FbmSync.pushEndApply = function (state, end) {
  FbmSync.pushListClear();
  if (end.kind === 'fail') {
    FbmSync.runFail(state, end.code, end.message, { keepRecords: true });
    FbmSync.stateWrite(state);
    return { ok: false, code: end.code, request: null, status: FbmSync.statusView(), error: end.message };
  }
  if (end.mark) {
    FbmSync.pushGateWrite({ status: 'clean', mark: end.mark, at: Date.now() });
    noticeResolve(FbmSync.PUSH_APPROVAL_TOPIC, '');
  }
  if (end.kind === 'pause') {
    FbmSync.runClose(state, 'paused', end.code ? { code: end.code, message: end.message, error: end.message } : { message: end.message });
  } else {
    FbmSync.runClose(state, 'done', { message: FbmSync.runDoneMessage(state) + (end.remaining ? ' Còn ' + end.remaining + ' bản ghi chưa đẩy xong; lượt sau làm tiếp.' : '') + (end.note || ''), keepRecords: true });
  }
  FbmSync.stateWrite(state);
  return { ok: true, request: null, status: FbmSync.statusView() };
};

/** Một chỗ mở chặng đẩy cho mọi chiều (người điều phối của chiều đọc gọi): dấu trang chưa có danh sách nên bước đầu tiên quét cả hai sheet. Trả request đầu tiên, hoặc `null` khi lượt đã chốt. */
FbmSync.pushStageOpen = function (state) {
  // Cổng do `preflightLocalStep` quyết một lần cho lượt; thiếu nghĩa là mở. Đóng thì giữ nguyên dấu cổng, vì nó vẫn đúng.
  if (state.pushGate && state.pushGate.open === false) { FbmSync.pushEndApply(state, { kind: 'done', remaining: 0 }); return null; }
  state.phase = 'push'; state.entity = 'customer'; state.current = ''; state.cursor = FbmSync.pushCursor({});
  state.message = 'Đang chuẩn bị các bản ghi ShinCRM cần đẩy lên FBM...';
  return FbmSync.pushStageResume(state);
};

/** Chạy tiếp chặng đẩy từ dấu trang hiện tại khi không có response nào để đọc (mở chặng): `pushNext` chạy trên bản sao như mọi chặng, `end` thì chốt lượt. */
FbmSync.pushStageResume = function (state) {
  var settings = FbmSync.scriptSettings(state), threshold = FbmSync.pushInputs().threshold;
  var out = FbmSync.stageCall(state, function (copy) { var logs = [], step = FbmSync.pushNext(copy, settings, logs, threshold); return Object.assign({ patch: FbmSync.pushPatch(copy, logs) }, step); });
  if (out.next) { return out.next; }
  FbmSync.pushEndApply(state, out.end);
  return null;
};

/**
 * Hết danh sách: quét lại cả hai sheet bằng đúng phép quét của đầu chặng. Không còn ứng viên thì chặng sạch. Lần quét đầu (`pass` 0) qua cổng chấp thuận (`pushGateDecide`). Lần quét lại mà phần còn lại dưới ngưỡng thì nhận hết như một lượt mới; chạm ngưỡng thì chỉ giữ ứng viên có đúng mã và dấu vân trong danh sách trước, nên không bao giờ đẩy một tập chạm ngưỡng chưa qua cổng: phần mới để lượt sau hỏi. Còn ứng viên thì ghi danh sách mới và làm tiếp, trừ khi vòng vừa rồi đi hết danh sách mà không xử lý xong mã nào (mọi mã hoãn vì bận hoặc vừa sửa) hoặc đã đủ `pushPassesMax` lần quét: khi đó dừng không sạch và ghi Log số bản ghi còn lại, lượt sau làm tiếp.
 * `pass` 0 là chưa có danh sách (đầu chặng, state của bản cũ); danh sách thiếu hay hỏng giữa vòng thì `at` chưa tới `size`; hai trường hợp này không phải vòng đứng yên và đều xét lại cổng chấp thuận.
 * `threshold` là ngưỡng chấp thuận bên gọi đã đọc. Trả `{ list }` (danh sách mới) hoặc `{ end }`.
 */
FbmSync.pushPassNext = function (state, settings, logs, threshold) {
  var cursor = FbmSync.pushCursor(state.cursor), stalled = cursor.pass > 0 && cursor.at >= cursor.size && !cursor.progress;
  // Đọc trước khi đọc Sheet: lần quét này sạch thì dấu là đúng bản này, mọi sửa sau lúc đọc đều làm dấu lệch.
  var mark = FbmSync.pushGateMark();
  var found = FbmSync.withLocalSnapshot(function () { var scan = FbmSync.localScan(); return FbmSync.pushCandidatesAll(scan, FbmSync.pushReviewContext(state, scan, settings)); });
  ['customer', 'activity'].forEach(function (entity) {
    var step = 'push_' + entity;
    FbmSync.businessStepStart(state, step, { mode: state.mode, scan: state.scan, entity: entity });
    FbmSync.businessStepAdd(state, step, { candidateCount: found.filter(function (item) { return item.entity === entity; }).length });
  });
  if (!found.length) { return { end: { kind: 'done', remaining: 0, mark: mark } }; }
  var admitted = found;
  // Danh sách mất hay hỏng giữa vòng (`at` chưa tới `size`) thì không còn biết tập đã qua cổng: xét lại cổng như đầu chặng, cổng đã chuyển sang mở nên tập chạm ngưỡng phải hỏi lại.
  if (cursor.pass === 0 || cursor.at < cursor.size) {
    var decision = FbmSync.pushGateDecide({ candidates: found, threshold: threshold, approved: String(state.approvedFingerprint || '') });
    if (decision.code === 'PUSH_AWAITING_APPROVAL') { return { end: FbmSync.pushApprovalAwait(decision, mark, logs) }; }
    if (decision.code === 'PUSH_APPROVED_RUN') { logs.push({ action: 'push_batch_approved', outcome: LOG_OK, reason: 'Người dùng chấp thuận ' + decision.count + ' bản ghi; tập dựng lại khớp tập đã duyệt, đẩy ngay.', detail: { count: decision.count, fingerprint: decision.fingerprint } }); }
    FbmSync.pushGateWrite({ status: 'open', at: Date.now() });
    noticeResolve(FbmSync.PUSH_APPROVAL_TOPIC, '');
  } else {
    var listed = {};
    FbmSync.pushListLoad(state, logs).forEach(function (item) { listed[FbmSync.pushCandidateKey(item)] = true; });
    var fresh = found.some(function (item) { return !listed[FbmSync.pushCandidateKey(item)]; });
    // Phần còn lại dưới ngưỡng thì như một lượt mới: không cần duyệt, nhận cả phần mới. Chạm ngưỡng mà có phần chưa qua cổng thì chỉ giữ phần đã qua.
    if (fresh && FbmSync.pushGateDecide({ candidates: found, threshold: threshold, approved: '' }).code !== 'PUSH_RUN') {
      admitted = found.filter(function (item) { return listed[FbmSync.pushCandidateKey(item)]; });
    }
  }
  if (!admitted.length || stalled || cursor.pass >= FbmSync.BUDGET.pushPassesMax) {
    var why = !admitted.length ? '(các bản ghi còn lại là phần mới hoặc vừa sửa sau lúc qua cổng chấp thuận)' : stalled ? '(vòng vừa rồi mọi bản ghi đều hoãn vì đang bận hoặc vừa sửa)' : '(đã quét đủ ' + FbmSync.BUDGET.pushPassesMax + ' lần)';
    logs.push({ action: 'push_unfinished', outcome: LOG_WARN, reason: 'Chặng đẩy dừng khi còn ' + found.length + ' bản ghi chưa xong ' + why + '; lượt sau làm tiếp.', detail: { remaining: found.length, admitted: admitted.length, passes: cursor.pass, stalled: stalled } });
    return { end: { kind: 'done', remaining: found.length } };
  }
  var size = FbmSync.pushListWrite(admitted);
  state.cursor = FbmSync.pushCursor({ pass: cursor.pass + 1, size: size });
  return { list: admitted.slice(0, size).map(function (item) { return { entity: item.entity, id: item.id, hash: item.hash }; }) };
};

/** Thông báo chờ duyệt: một việc, một thông báo; phát lại cùng tập thì cổng thông báo không ghi lại. */
FbmSync.PUSH_APPROVAL_TOPIC = 'fbm_push_approval';

/** Đọc cổng chặng đẩy; hỏng thì ghi Log cảnh báo và coi như chưa có cổng (quét, hỏi lại), không im lặng. */
FbmSync.pushGateLoad = function (logs) {
  try { return FbmSync.pushGateRead(); } catch (gateError) {
    logs.push({ action: 'push_gate_read', outcome: LOG_WARN, reason: String(gateError && gateError.message || gateError) + ' Quét lại cả hai sheet.' });
    return null;
  }
};

/**
 * Tập ứng viên chạm ngưỡng mà chưa có lời duyệt gắn đúng dấu tập: không phát lệnh ghi nào, ghi cổng `pending` (dấu tập, số, dấu bốn phần đọc trước lần quét), phát thông báo nút Chấp thuận và kết thúc lượt bình thường. Nút đó mở lượt tay mang dấu tập (`approvedFingerprint` của ô lượt); lượt đó dựng lại tập, dấu còn khớp mới đẩy. Trả `end` của chặng.
 */
FbmSync.pushApprovalAwait = function (decision, mark, logs) {
  FbmSync.pushGateWrite({ status: 'pending', mark: mark, fingerprint: decision.fingerprint, count: decision.count, at: Date.now() });
  noticeRaise({
    topic: FbmSync.PUSH_APPROVAL_TOPIC, scope: '', source: 'fbm_sync',
    title: decision.count + ' bản ghi ShinCRM chờ chấp thuận trước khi đẩy lên FBM',
    lines: ['Số bản ghi sắp đẩy chạm ngưỡng chấp thuận trong Cài đặt đồng bộ; chưa bản ghi nào được gửi lên FBM.'],
    hint: 'Chấp thuận thì ShinCRM mở ngay một lượt đồng bộ chiều Đẩy và đẩy đúng các bản ghi này. Có người sửa thêm trên Sheet từ lúc hiện thông báo thì lượt đó không đẩy gì và hỏi lại với số mới.',
    actions: [{ label: 'Chấp thuận', action: 'fbmPushApprove', value: decision.fingerprint }]
  });
  logs.push({ action: 'push_awaiting_approval', outcome: LOG_WARN, reason: 'Có ' + decision.count + ' bản ghi sắp đẩy, chạm ngưỡng chấp thuận; chờ người dùng chấp thuận.', detail: { count: decision.count, fingerprint: decision.fingerprint } });
  return { kind: 'done', remaining: 0, note: ' Có ' + decision.count + ' bản ghi chờ chấp thuận; chưa đẩy lên FBM.' };
};

/** Đọc danh sách của dấu trang; khóa hỏng thì ghi Log lỗi, khóa thiếu hay lệch số mã (state bản cũ, khóa đã xóa) thì trả rỗng để quét lại. */
FbmSync.pushListLoad = function (state, logs) {
  var list = [];
  try { list = FbmSync.pushListRead(); } catch (listError) {
    logs.push({ action: 'push_list_read', outcome: LOG_ERROR, reason: String(listError && listError.message || listError) + ' Quét lại cả hai sheet.' });
    return [];
  }
  return list.length === FbmSync.pushCursor(state.cursor).size ? list : [];
};

/** Cầu dao lỗi đẩy: chạm `pushFailuresMax` thì dừng cả chiều đẩy, đến khi người dùng sửa nguyên nhân và mở lại các bản ghi lỗi. Trả `end` của chặng, hoặc `null` khi chưa chạm. */
FbmSync.pushFailuresTripped = function (logs) {
  var count = Object.keys(FbmSync.pushFailuresRead().hashes).length;
  if (count < FbmSync.BUDGET.pushFailuresMax) { return null; }
  var message = 'Đã có ' + count + ' bản ghi đẩy lỗi chưa xử lý; dừng chiều đẩy để không tốn thêm lượt gọi FBM. Xem tab Lỗi và Log, sửa nguyên nhân rồi bấm "Mở lại bản ghi lỗi".';
  logs.push({ action: 'push_failures_limit', outcome: LOG_ERROR, reason: message, detail: { count: count, max: FbmSync.BUDGET.pushFailuresMax } });
  return { kind: 'pause', code: 'PUSH_FAILURES_LIMIT', message: message };
};

/**
 * Request kế tiếp của chặng đẩy, dựng từ dấu trang chứ không giữ hàng đợi trong Extension. Mỗi mã trong danh sách: đọc lại đúng dòng theo mã (Giao dịch kèm khách cha), xét bằng `pushReview`, có việc thì làm; hết danh sách thì `pushPassNext` quét lại.
 * Sửa trên ô lượt của chặng (bản sao); trả `{ next }` hoặc `{ end }`.
 */
FbmSync.pushNext = function (state, settings, logs, threshold) {
  var globalCategoryBlock = state.metadata && (state.metadata.categoryLookupFailed || (state.metadata.categoryBlocks || []).some(function (block) { return !block.code; }));
  if (globalCategoryBlock) { return { end: { kind: 'pause', message: 'Đã đọc xong nhưng tạm dừng chiều đẩy vì danh mục chưa khớp FBM.' } }; }
  var context = FbmSync.pushReviewContext(state, null, settings), list = FbmSync.pushListLoad(state, logs), waiting = [], cursor;
  // Ứng viên bị giữ chỉ xếp hàng chờ; một lần ghi Sheet cho cả lô được xả trước MỌI lối ra khỏi vòng và trước mọi lần ghi Sheet khác trong vòng (kể cả quét lại danh sách, vì lần quét phải thấy trạng thái mới). Xả xong dấu trang đã có `progress` mới nên đọc lại.
  var flush = function () {
    if (!waiting.length) { return; }
    var batch = waiting; waiting = [];
    FbmSync.markPushSkippedBatch(state, batch);
    cursor = FbmSync.pushCursor(state.cursor);
  };
  for (;;) {
    cursor = FbmSync.pushCursor(state.cursor);
    if (cursor.at >= list.length) {
      flush();
      var pass = FbmSync.pushPassNext(state, settings, logs, threshold);
      if (pass.end) { return pass; }
      list = pass.list;
      continue;
    }
    var tripped = FbmSync.pushFailuresTripped(logs);
    if (tripped) { flush(); return { end: tripped }; }
    var item = list[cursor.at], entity = item.entity;
    var record = FbmSync.readLocalById(entity, item.id);
    var parent = record && entity === 'activity' && String(record.customerId || '').trim() ? FbmSync.readLocalById('customer', record.customerId) : null;
    var candidate = record ? FbmSync.pushReview(entity, record, parent, context) : null;
    state.entity = entity;
    if (!candidate) { state.cursor = FbmSync.pushCursorNext(cursor, true); continue; }
    // Dòng đã đổi nội dung từ lúc qua cổng chấp thuận: không đẩy nội dung chưa ai duyệt, để lần quét lại hoặc lượt sau xét.
    if (candidate.hash !== item.hash) { flush(); FbmSync.pushDefer(state, cursor, entity, candidate.id, { status: 'changed' }); continue; }
    if (candidate.kind === 'stuck') {
      flush();
      var stuck = FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Hoạt động đang đẩy từ lần trước mà mất phản hồi; FBM không có đường tra lại nên không tự gửi lại để tránh tạo trùng. Kiểm tra trên FBM: chưa có thì bấm Mở lại bản ghi lỗi để tạo lại.' }, 'activity_create');
      state.cursor = FbmSync.pushCursorNext(cursor, stuck === 'ok'); continue;
    }
    var configError = FbmSync.pushConfigErrors(candidate, settings);
    if (configError) { flush(); return { end: { kind: 'pause', message: configError } }; }
    if (candidate.kind === 'recover') {
      flush();
      // Tra là request đọc nên không qua kiểm danh mục/điều kiện đẩy; không có MST thì không tra được và không được tạo lại.
      state.current = candidate.id;
      var recovery = FbmSync.customerCreateRecoveryRequest(state, Object.assign({}, cursor, { candidate: candidate }), settings);
      if (recovery) { return { next: recovery }; }
      var lost = FbmSync.markPushError(state, candidate, { code: 'PUSH_CREATE_UNCONFIRMED', reason: 'Customer đang đẩy từ lần trước nhưng không còn Mã số thuế để tra trên FBM; không tự tạo lại. Kiểm tra trên FBM rồi bấm Mở lại bản ghi lỗi nếu cần tạo lại.' }, 'customer_create_recover');
      state.cursor = FbmSync.pushCursorNext(cursor, lost === 'ok'); continue;
    }
    // Phép xét danh mục cần danh mục FBM còn mới; lệch người phụ trách thì không cần.
    if (!(candidate.hold && candidate.hold.code === 'owner') && FbmSync.pushLookupDue(state)) {
      flush();
      state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_lookup' });
      state.message = 'Đang kiểm lại danh mục FBM trước khi đẩy tiếp...';
      return { next: FbmSync.lookupBatchRequest(settings) };
    }
    if (candidate.hold) { waiting.push(candidate); state.cursor = FbmSync.pushCursorNext(cursor, false); continue; }
    flush();
    var request;
    if (entity === 'customer') {
      request = candidate.kind === 'create' ? FbmSync.customerCreateOpenRequest(settings) : FbmSync.customerEditOpenRequest(candidate.record.fbmId, settings);
    } else {
      request = candidate.kind === 'create' ? FbmSync.activityCreateRequest(candidate.record, context.categoryGate, settings) : FbmSync.activityEditOpenRequest(candidate.record.fbmId, settings);
    }
    // `09/04` bước 1: ghi `đang đẩy` và giữ bản ghi trong sổ bận trong cùng một lần qua cửa, chỉ khi dòng còn đúng như lúc chọn, rồi mới phát lệnh; ghi Sheet không được thì ném lỗi và lệnh ghi FBM không được phát (FBM-002). Ô lượt mang cursor chờ ghi được khung lát ghi cùng lần phát.
    var started = FbmSync.pushRowChange(entity, candidate.id, { expect: FbmSync.pushCandidateExpect(candidate), allowGone: true, build: function () {
      return { patch: { id: candidate.id, syncStatus: FbmSync.SYNC_STATUS.pushing }, hold: FbmSync.PUSH_HOLD_REASON };
    } });
    if (started.status !== 'ok') {
      // Dòng vừa đổi, đã vắng hoặc đang bận: chưa phát gì, sang mã kế và để lần quét lại xét lại.
      FbmSync.pushDefer(state, cursor, entity, candidate.id, started);
      continue;
    }
    if (state.metadata.categoryCheck) { state.metadata.categoryCheck.pushed = Number(state.metadata.categoryCheck.pushed || 0) + 1; }
    state.phase = 'push'; state.current = candidate.id; state.cursor = FbmSync.pushCursor(cursor, { kind: 'push_wait', operation: request.meta.kind, entity: entity, candidate: FbmSync.pushCandidateForState(candidate) });
    state.message = 'Đang đẩy ' + (entity === 'customer' ? 'khách hàng' : 'giao dịch') + ' ' + candidate.id + '...';
    return { next: request };
  }
};

/** Hoãn một mã chưa phát lệnh nào: sang mã kế (không tính là xong), đếm bỏ qua và ghi lý do cho người dùng. */
FbmSync.pushDefer = function (state, cursor, entity, id, change) {
  state.current = ''; state.cursor = FbmSync.pushCursorNext(cursor, false);
  state.counts.skipped += 1; state.message = 'Hoãn ' + entity + ' ' + id + ' tới lượt sau: ' + FbmSync.pushDeferReason(change) + '.';
  FbmSync.businessStepAdd(state, 'push_' + entity, { skipped: 1 });
};
