/**
 * Tra lại lệnh tạo mất phản hồi (FBM-027, thiết kế 5.8 cảnh báo FBM-027): dòng `đang đẩy` chưa có ID FBM là lệnh tạo không biết kết quả. Không bao giờ tạo lại khi chưa tra theo khóa của chính bản ghi: Customer theo MST, Activity theo dấu `#SC-<mã>`. Tra thấy thì nối ID FBM, không thấy thì dòng về lệnh tạo thường.
 * Không có sổ chờ riêng: trạng thái trên dòng là dấu duy nhất. Khe còn lại chỉ ở Activity (FBM nhận lệnh tạo rất trễ, sau lần tra) và được giảm bằng `BUDGET.recoverWaitMinutes`; Customer không có khe này vì FBM chặn trùng MST.
 * Như mọi bước của ứng viên đẩy: sửa trên ô lượt của chặng (bản sao), không ghi Log thẳng. Người gọi: `pushNext` (lượt sau), `pushErrorDecide` (cùng lần gửi), `pushOperationStep` (bước kết).
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Tra lại một lệnh tạo không biết kết quả theo khóa của chính bản ghi (FBM-027), không bao giờ gửi lại lệnh ghi khi chưa tra: Customer theo MST (FBM bắt buộc và chặn trùng MST), Activity theo dấu `#SC-<mã>` trong giao dịch của đúng khách cha.
 * `rejected` là lý do FBM trả khi từ chối rõ ràng (lỗi nghiệp vụ, FBM đã trả lời nên không còn xử lý trễ): tra không thấy thì kết luận chưa tạo. Trả request đọc, hoặc `null` khi thiếu khóa để tra (Customer không còn MST, Activity chưa có ID FBM của khách cha).
 */
FbmSync.createRecoveryRequest = function (state, cursor, settings, rejected) {
  var candidate = FbmSync.hydratePushCandidate(cursor && cursor.candidate || {}), extra = rejected ? { rejected: String(rejected) } : {};
  return String(candidate.entity || '') === 'activity' ? FbmSync.activityRecoveryRequest(state, cursor, candidate, extra, null, settings) : FbmSync.customerCreateRecoveryRequest(state, cursor, candidate, extra, settings);
};
/** Request tra Customer theo MST (lọc FBM là "chứa", bước kết lọc lại đúng bằng). */
FbmSync.customerCreateRecoveryRequest = function (state, cursor, candidate, extra, settings) {
  var taxNumber = String(candidate.record && candidate.record.taxNumber || '').trim();
  if (!taxNumber) { return null; }
  state.cursor = FbmSync.pushCursor(cursor, Object.assign({ kind: 'push_wait', operation: 'customer_create_recover', entity: 'customer', candidate: FbmSync.pushCandidateForState(candidate) }, extra));
  state.message = 'Đang tìm trên FBM Customer ' + candidate.id + ' theo Mã số thuế sau khi lệnh tạo không có kết quả; không gửi lại lệnh ghi.';
  return FbmSync.customerGridRequest({ type: 0, count: 20, gridPageIndex: -2, gridRefresh: false, scope: null, filter: ['ma_so_thue:**' + taxNumber] }, settings);
};
/** Request tra giao dịch của khách cha theo mã khách, từng trang `activityCustomerRows` dòng; `page` là trang kế (`activityPageNext` kèm `sourceFields` của trang đầu), `null` là trang đầu. */
FbmSync.activityRecoveryRequest = function (state, cursor, candidate, extra, page, settings) {
  var sttRec = String(candidate.record && candidate.record.stt_rec || '').trim(), count = FbmSync.BUDGET.activityCustomerRows;
  if (!sttRec) { return null; }
  state.cursor = FbmSync.pushCursor(cursor, Object.assign({ kind: 'push_wait', operation: 'activity_create_recover', entity: 'activity', candidate: FbmSync.pushCandidateForState(candidate), page: page }, extra));
  state.message = 'Đang tìm trên FBM giao dịch ' + candidate.id + ' theo dấu #SC sau khi lệnh tạo không có kết quả; không gửi lại lệnh ghi.';
  return FbmSync.activityGridRequest(sttRec, page ? { type: 1, count: count, gridPageIndex: page.pageIndex, gridPageValue: page.pageValue, pageItems: page.pageItems, gridRefresh: false, sourceFields: page.sourceFields } : { type: 0, count: count, gridPageIndex: -1, gridRefresh: false }, settings);
};
/** Lượt tra trong cùng lần gửi mà FBM đã từ chối rõ ràng và tra không thấy gì: lệnh tạo chưa tạo ra bản ghi nào, dòng thành lỗi thường (không giữ `đang đẩy`), người sửa theo lý do FBM rồi đẩy lại. */
FbmSync.PUSH_CREATE_REJECTED = 'PUSH_CREATE_REJECTED';
FbmSync.createRejected = function (cursor) {
  var error = new Error('FBM từ chối lệnh tạo: ' + String(cursor.rejected).replace(/\.?\s*$/, '.') + ' Đã tra lại trên FBM, không có bản ghi nào được tạo; sửa theo lỗi rồi lượt sau đẩy lại.');
  error.code = FbmSync.PUSH_CREATE_REJECTED;
  return error;
};
/**
 * Kết luận tra lại ở lượt sau (`recover`), một chỗ cho hai bảng: thấy bản ghi (`ids`) thì nối ID FBM như phép ghép của chiều kéo về, mốc để rỗng (`09/04` bước 5) để lần quét lại mở form so hai bên (chưa có mốc thì không bao giờ lưu đè); không thấy thì dòng về `chờ đối soát` chưa có ID và lần quét lại chọn nó như một lệnh tạo thường. Nhả bản ghi, gỡ khỏi sổ lỗi đẩy, sang ứng viên kế.
 */
FbmSync.createRecoveryApply = function (state, cursor, candidate, ids) {
  var entity = String(candidate.entity || ''), id = String(candidate.id || '');
  var done = FbmSync.pushRowChange(entity, id, { allowGone: true, releaseGone: true, release: true, must: 'chưa ghi kết quả tra lại', build: function (local) {
    return FbmSync.createRecoveryPatch(local, ids);
  } });
  if (done.status !== 'gone') {
    FbmSync.pushFailuresRemove([entity + ':' + id]);
    FbmSync.businessStepAdd(state, 'push_' + entity, { written: 1, sheetWriteBatches: 1 });
  }
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = '';
  state.message = done.status === 'gone' ? 'Bỏ ' + entity + ' ' + id + ': dòng không còn trên Sheet.'
    : ids ? 'Đã tìm thấy trên FBM ' + entity + ' ' + id + ' tạo ở lần trước; đã nối mã FBM, sẽ so hai bên trước khi ghi.'
    : 'FBM chưa có ' + entity + ' ' + id + ' của lần tạo trước; tạo lại ở lần quét kế.';
};
/**
 * Bước kết tra Customer. Cùng lần gửi (`create`) còn mã tự sinh để khớp kèm MST và so dữ liệu đã gửi; không thấy mà FBM đã từ chối rõ ràng thì là lỗi thường (`createRejected`), không thấy vì mất phản hồi thì ném để dòng giữ `đang đẩy` và lượt sau tra lại. Lượt sau (`recover`) mã tự sinh đã mất và người dùng có thể đã sửa bản ghi, nên chỉ khớp MST rồi kết luận ở `createRecoveryApply`.
 */
FbmSync.finishCustomerCreateRecovery = function (state, response) {
  var cursor = state.cursor || {}, candidate = FbmSync.hydratePushCandidate(cursor.candidate || {}), record = candidate.record || {}, grid = FbmSync.rowsToRecords('customer', response), taxNumber = String(record.taxNumber || '').trim(), autoCode = String(candidate.autoCode || '').trim(), laterRun = candidate.kind === 'recover', rows = grid.rows.filter(function (row) { return String(row.ma_so_thue || '').trim() === taxNumber && (laterRun || String(row.ma_kh || '').trim() === autoCode); }), gate = FbmSync.stateCategoryGate(state), id = String(candidate.id || '');
  if (rows.length > 1) { throw new Error('CREATE_RECOVERY_NOT_EXACT: FBM có ' + rows.length + ' khách cùng Mã số thuế ' + taxNumber + '; không tự nối, không gửi lại lệnh ghi.'); }
  if (laterRun) {
    var found = rows.length ? FbmSync.customerRecord(rows[0], gate) : null;
    FbmSync.createRecoveryApply(state, cursor, candidate, found ? { fbmId: found.fbmId, fbmCustomerCode: found.fbmCustomerCode } : null);
    return;
  }
  if (!rows.length) { throw cursor.rejected ? FbmSync.createRejected(cursor) : new Error('CREATE_RECOVERY_NOT_EXACT: chưa thấy Customer vừa tạo; không gửi lại lệnh ghi, lượt sau tra lại.'); }
  // Đọc dòng, so và vá trong cùng một lần qua cửa; mọi lỗi ném ra từ hàm quyết thì cửa không ghi gì.
  var done = FbmSync.pushRowChange('customer', id, { allowGone: true, release: true, must: 'chưa vá mã FBM', build: function (local) {
    var incoming = FbmSync.customerRecord(rows[0], gate), localHash = FbmSync.hash(local, 'customer', gate), sentHash = FbmSync.hash(candidate.record || {}, 'customer', gate);
    if (incoming.incomingHash !== sentHash || localHash !== sentHash) { throw new Error('CREATE_RECOVERY_MISMATCH: Customer tìm thấy không khớp chính xác dữ liệu đã gửi.'); }
    return FbmSync.createdCustomerPatch(local, incoming);
  } });
  if (done.status === 'gone') { throw new Error('CREATE_RECOVERY_NOT_EXACT: không xác định duy nhất Customer vừa tạo; không gửi lại request ghi.'); }
  FbmSync.pushFailuresRemove(['customer:' + id]);
  state.counts.pushed += 1;
  FbmSync.businessStepAdd(state, 'push_customer', { verified: 1, pushed: 1, written: 1, sheetWriteBatches: 1 });
  state.cursor = FbmSync.pushCursorNext(cursor, true); state.current = ''; state.message = 'Đã xác nhận Customer tạo thành công sau khi mất phản hồi.';
};
/**
 * Bước kết tra giao dịch: tìm dấu `#SC-<mã>` (`activityMarkerId`, đúng phép nhận diện của chiều kéo về) trong trang vừa đọc; trang đầy mà chưa thấy thì xin trang kế, hết trang mới kết luận. Cùng lần gửi (`create`, FBM đã từ chối rõ ràng) không thấy thì là lỗi thường; thấy thì nối như lượt sau. Trả `{ next }` khi còn trang, `{}` khi đã kết luận.
 */
FbmSync.finishActivityCreateRecovery = function (state, response, settings) {
  var cursor = state.cursor || {}, candidate = FbmSync.hydratePushCandidate(cursor.candidate || {}), id = String(candidate.id || ''), page = cursor.page || null;
  var grid = FbmSync.rowsToRecords('activity', response), count = FbmSync.BUDGET.activityCustomerRows;
  var rows = grid.rows.filter(function (row) { return FbmSync.activityMarkerId(row.details) === id; });
  if (rows.length > 1) { throw new Error('CREATE_RECOVERY_NOT_EXACT: FBM có ' + rows.length + ' giao dịch cùng dấu #SC-' + id + '; không tự nối, không gửi lại lệnh ghi.'); }
  if (!rows.length && grid.rows.length >= count) {
    var next = FbmSync.activityPageNext(page, grid.rows, grid.total);
    if (!next) { throw new Error('FBM trả lại đúng trang giao dịch đã đọc khi xin trang kế; chưa tra hết giao dịch của khách nên không tạo lại.'); }
    next.sourceFields = grid.sourceFields || (page && page.sourceFields) || null;
    return { next: FbmSync.activityRecoveryRequest(state, cursor, candidate, cursor.rejected ? { rejected: cursor.rejected } : {}, next, settings) };
  }
  if (!rows.length && candidate.kind !== 'recover') { throw FbmSync.createRejected(cursor); }
  FbmSync.createRecoveryApply(state, cursor, candidate, rows.length ? { fbmId: String(rows[0].id || '').trim() } : null);
  return {};
};
