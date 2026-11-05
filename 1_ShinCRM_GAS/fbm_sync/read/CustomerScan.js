/**
 * Chặng quét khách: đọc danh sách toàn bộ khách theo gói, chỉ đánh dấu khách cần đọc chi tiết, không ghi Sheet.
 * Chặng chạy trên bản sao ô lượt và trả `{ patch, next | end }`; số khách FBM báo chỉ thành số khách mốc khi `runClose` đóng lượt xong, lượt hỏng ở chặng sau thì mốc cũ còn nguyên để lần đếm sau không bỏ quét nhầm.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/** Đầu vào của chặng, đọc qua cổng chủ một lần mỗi lát. Phạm vi chỉ cần ở gói đầu của trang đầu, khi chặng bắt đầu dò mã chỉ định. */
FbmSync.customerScanInputs = function (state) {
  var cursor = state.cursor || {}, all = state.scanPack === 'all', gate = FbmSync.stateCategoryGate(state);
  var firstChunk = Number(cursor.page || 0) === 0 && Number(cursor.next || 0) === 0;
  return { customers: FbmSync.readLocal('customer'), gate: gate, all: all, last: all ? null : FbmSync.lastActivityIndex(gate), pullAllowed: FbmSync.pullAllowedReader('customer'), scope: firstChunk ? FbmSync.scope() : null };
};

/**
 * Một gói Customer của việc quét. Đánh dấu khách (đã thấy, danh sách đọc, thứ tự lớp top) trước khi tiến cursor: đánh dấu hỏng thì lát lỗi và cursor còn ở gói cũ.
 * Hết gói của trang thì xin trang kế tới khi đủ tổng FBM báo ở trang đầu; hết trang thì kiểm đủ số, xét khách vắng và trả `end`.
 */
FbmSync.customerScanStage = function (ctx) {
  var check = FbmSync.replyCheck(ctx.reply);
  if (check.suspected) { return { patch: {}, session: { suspected: check.suspected } }; }
  var state = ctx.state, cursor = state.cursor, input = ctx.inputs, logs = [];
  var accepted = FbmSync.scanReplyCheck(ctx.reply, cursor);
  if (accepted.duplicate) {
    logs.push({ action: 'scan_chunk_duplicate', outcome: LOG_WARN, reason: 'Extension trả lại gói quét đã nhận (gói ' + accepted.duplicate + '); xin lại gói ' + Number(cursor.next || 0) + '.' });
    return { patch: { logs: logs }, next: FbmSync.scanJobRequest(state) };
  }
  var chunk = accepted.chunk, grid = FbmSync.rowsToRecords('customer', FbmSync.protocol.parse(ctx.reply));
  var firstPage = Number(cursor.page || 0) === 0 && chunk.index === 0;
  var live = grid.rows.filter(function (row) { return !FbmSync.isTemporaryRecord('customer', row); });
  var scan = FbmSync.customerScanRecord(firstPage ? null : state.metadata.customerScan, grid.rows, chunk.totalRowCount, firstPage && input.scope ? input.scope.fbmNew : null);
  var reasons = FbmSync.readReasonOf(live, input);
  FbmSync.seenStoreMark('customer', input.customers, live.map(function (row) { return { fbmId: row.stt_rec_kh }; }));
  var added = FbmSync.readListAdd(reasons.marked);
  if (!input.all) { FbmSync.topOrderAppend(reasons.order); }
  if (added) { logs.push({ action: 'read_list_mark', outcome: LOG_OK, reason: added + ' khách được đánh dấu để đọc chi tiết (khách mới, sửa, cờ cần xét lại hoặc lệch giao dịch cuối với FBM).', detail: { count: added, reasons: reasons.reasons, sample: reasons.sample } }); }
  state.metadata.customerScan = scan;
  if (chunk.index === 0) {
    cursor.pageFirst = FbmSync.customerPageItem(grid.rows[0]);
    if (chunk.oversize.length) { state.metadata.scanOversize = Number(state.metadata.scanOversize || 0) + chunk.oversize.length; logs = logs.concat(FbmSync.scanOversizeLogs('customer', chunk.oversize)); }
  }
  if (grid.rows.length) { var lastRow = grid.rows[grid.rows.length - 1]; cursor.pageLast = FbmSync.customerPageItem(lastRow); cursor.pageLastValue = FbmSync.customerPageValue(lastRow); }
  var patch = { metadata: { customerScan: scan, scanOversize: state.metadata.scanOversize }, logs: logs };
  if (firstPage) { patch.progress = { done: 0, total: scan.total }; }
  if (!FbmSync.scanJobAdvance(cursor, chunk)) { patch.cursor = cursor; return { patch: patch, next: FbmSync.scanJobRequest(state) }; }
  if (FbmSync.customerNext(state, { length: chunk.rowCount, firstItem: cursor.pageFirst || '', lastItem: cursor.pageLast || '', lastValue: cursor.pageLastValue || [] }, scan.total)) {
    var nextPage = state.cursor;
    nextPage.page = Number(nextPage.page || 0) + 1; nextPage.attempt = 0; nextPage.restarts = 0;
    FbmSync.scanJobOpen(state, nextPage);
    patch.cursor = state.cursor;
    return { patch: patch, next: FbmSync.scanJobRequest(state) };
  }
  patch.cursor = cursor;
  return FbmSync.customerScanFinish(state, scan, patch);
};

/** Lát cuối của chặng: đủ số khách thì để tổng làm số khách mốc chờ `runClose`, ghi chú mã chỉ định FBM không trả, xét khách vắng. Thiếu số thì ném `FBM_SCAN_INCOMPLETE` khi chưa ghi gì. */
FbmSync.customerScanFinish = function (state, scan, patch) {
  var problem = FbmSync.scanCompleteCheck(scan.seen, scan.total);
  if (problem) { var incomplete = new Error(problem); incomplete.code = 'FBM_SCAN_INCOMPLETE'; incomplete.logs = patch.logs; throw incomplete; }
  patch.metadata.customerTotal = scan.total;
  var note = FbmSync.scopeUnseenNote(scan.scopeUnseen);
  if (note) { patch.metadata.preflightIssues = (state.metadata.preflightIssues || []).concat([note.issue]); patch.logs.push(note.log); }
  FbmSync.customerAbsentMark(state);
  return { patch: patch, end: { customerTotal: scan.total } };
};

/** Bước kết của chặng: mở chặng đọc kế của lượt; lượt xong ngay thì nối bước đếm khách như mọi lượt có ghi Sheet. */
FbmSync.customerScanEnd = function (state) {
  return FbmSync.runTail(FbmSync.activityStagesContinue(state, {}));
};

/** Thiếu tổng hoặc nhận chưa đủ số FBM báo ở trang đầu: trả chữ lỗi; đủ thì `null`. Lượt dừng sớm vì phân trang hỏng mà vẫn xét vắng thì mọi khách chưa quét tới bị coi là vắng (gặp thật 2026-10-07: 1.262/1.312 khách). */
FbmSync.scanCompleteCheck = function (seen, total) {
  if (!(seen < total || (!total && seen > 0))) { return null; }
  return 'Lượt quét chỉ nhận ' + seen + '/' + (total || '?') + ' khách FBM nên đã dừng trước khi đọc chi tiết và chưa ghi gì. Báo người phụ trách kỹ thuật kiểm tra phân trang Customer.';
};

/**
 * Sổ đếm của việc quét sau một gói: tổng lấy ở trang đầu vì FBM chỉ đếm `TotalRowCount` ở trang đầu, trang sau trả 0 (Nghiên cứu FBM ch03 mục 3.3). `previous` rỗng là gói đầu của lượt.
 * Mã chỉ định chưa có trên Sheet (`scopeNew`): FBM lọc `ma_kh in (...)` nên mã gõ sai trả về không dòng nào mà không báo lỗi; gạch dần các mã FBM có trả để cuối danh sách biết mã nào không có.
 */
FbmSync.customerScanRecord = function (previous, rows, total, scopeNew) {
  var scan = previous ? { total: Number(previous.total || 0), seen: Number(previous.seen || 0), scopeUnseen: (previous.scopeUnseen || []).slice() } : { total: Number(total || 0), seen: 0, scopeUnseen: (scopeNew || []).slice() };
  var list = rows || [];
  scan.seen += list.length;
  if (scan.scopeUnseen.length && list.length) {
    var returned = {};
    list.forEach(function (row) { returned[String(row.ma_kh || '').trim().toUpperCase()] = true; });
    scan.scopeUnseen = scan.scopeUnseen.filter(function (code) { return !returned[String(code).trim().toUpperCase()]; });
  }
  if (!scan.scopeUnseen.length) { delete scan.scopeUnseen; }
  return scan;
};

/**
 * Lý do đọc chi tiết từng khách của gói: mới, Quét toàn bộ, cờ cần xét lại, dấu vân khác, mã khách khác, lệch giao dịch cuối (lớp 2). Kèm thứ tự số CUS theo đúng thứ tự FBM trả cho lớp top.
 * Khách chặn chiều lấy về không vào lớp 2 lẫn thứ tự lớp top. Không đọc kho: mọi chỉ mục do người gọi truyền vào.
 */
FbmSync.readReasonOf = function (rows, input) {
  var byFbmId = {}, all = input.all, gate = input.gate, marked = [], order = [], reasons = {}, sample = [];
  input.customers.forEach(function (record) { var id = String(record.fbmId || '').trim(); if (id) { byFbmId[id] = record; } });
  rows.forEach(function (row) {
    var sttRec = String(row.stt_rec_kh || '').trim(), local = byFbmId[sttRec], reason = '';
    if (!sttRec) { return; }
    if (!local) { reason = 'new'; }
    else if (all) { reason = 'all'; }
    else if (FbmSync.readAgainStatus(local)) { reason = 'status'; }
    else if (String(local.fbmHash || '') !== FbmSync.hash(row, 'customer', gate)) { reason = 'changed'; }
    else if (String(row.ma_kh || '').trim() !== String(local.fbmCustomerCode || '').trim()) { reason = 'code'; }
    if (local && !all && input.pullAllowed(local)) {
      var index = FbmSync.seenStoreIndex(FbmSync.READ_LIST_STORE, local);
      if (index >= 0) { order.push(index); }
      if (!reason && FbmSync.lastActivityDiff(row, input.last[String(local.id)], gate).length) { reason = 'activity'; }
    }
    if (!reason) { return; }
    marked.push(sttRec);
    reasons[reason] = Number(reasons[reason] || 0) + 1;
    if (sample.length < 20) { sample.push({ customer: String(local && local.id || sttRec), reason: reason }); }
  });
  return { marked: marked, order: order, reasons: reasons, sample: sample };
};

/** Mã khách chỉ định mà danh sách khách FBM không trả về: cảnh báo không chặn ở kết quả phiên kèm dòng Log; phiên vẫn chạy cho các khách còn lại. `null` khi không có mã nào. */
FbmSync.scopeUnseenNote = function (codes) {
  if (!(codes || []).length) { return null; }
  var message = 'FBM không trả về khách nào có mã: ' + codes.join(', ') + '. Kiểm tra lại mã trong danh sách khách chỉ định (đủ ký tự, đúng tiền tố) hoặc quyền xem của tài khoản FBM.';
  return { issue: { code: 'FBM_SCOPE_CODE_NOT_ON_FBM', severity: 'warn', scope: 'fbm_sync', message: message, blocking: false }, log: { action: 'scope_code_not_on_fbm', outcome: LOG_WARN, reason: message, detail: { codes: codes.slice() } } };
};
