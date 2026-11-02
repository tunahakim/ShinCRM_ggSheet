/**
 * Canh request GAS phát cho Extension trong một lời gọi: nhớ request đang chờ, request đã được trả lời và lần nộp lặp; request quá hạn bị bỏ mà không có trả lời thì ghi phát hiện để người điều phối ghi Log lúc đóng lời gọi.
 * Cửa ghi ô lượt (`stateStore`) gọi `requestWatchCheck` và `requestWatchNote`; tệp này không đọc hay ghi kho.
 */
if (typeof FbmSync === 'undefined' || !FbmSync) { FbmSync = {}; }

/**
 * Luật chung cho mọi request GAS phát cho Extension (Giữ phiên, lượt nền, lượt bấm tay, đăng nhập): request đã quá hạn chờ mà rời khỏi state không qua trả lời thì có một dòng Log lỗi. Phát hiện nằm ở `findings`; người điều phối lấy qua `requestWatchTake` lúc đóng lời gọi và ghi Log.
 * Đặt ở cửa đọc/ghi state vì mọi đường bỏ request (cấp request mới đè lên, mở lượt mới, đóng lượt, dừng) đều phải ghi state; đường mới thêm sau này cũng không lọt.
 * Chỉ nhớ trong RAM của lần gọi: request đang chờ theo lần đọc/ghi gần nhất, các request đã được trả lời (kể cả trả lời muộn) và hộp đen Extension gửi kèm lần hỏi nền. Không tốn thêm lần đọc kho.
 * Bỏ request khi còn trong hạn (dừng, cổng phiên chặn) là GAS chủ động, không ghi ở đây.
 */
FbmSync.requestWatch = { open: null, answered: {}, lastAnswered: '', trail: undefined, findings: [] };
/** Trả các dòng Log đã phát hiện và xóa sổ, để mỗi phát hiện chỉ được ghi một lần. */
FbmSync.requestWatchTake = function () { var taken = FbmSync.requestWatch.findings; FbmSync.requestWatch.findings = []; return taken; };
FbmSync.requestWatchNote = function (state) {
  // Bước và lượt lấy lúc request mới xuất hiện: về sau GAS có thể đổi cursor (chọn tiến trình, đóng lượt) khi request cũ vẫn nằm đó.
  var id = String(state && state.activeRequestId || ''), seen = FbmSync.requestWatch.open && FbmSync.requestWatch.open.id === id ? FbmSync.requestWatch.open : null;
  FbmSync.requestWatch.open = id ? { id: id, deadlineAt: Number(state.deadlineAt || 0), kind: seen ? seen.kind : String(state.cursor && state.cursor.kind || ''), runId: seen ? seen.runId : String(state.runId || '') } : null;
};
/**
 * Cổng duy nhất nhận ra response thuộc request đang chờ; đánh dấu đã trả lời để luật request quá hạn không báo nhầm trả lời muộn.
 * Ghi `resubmit.answered` để nhận ra lần nộp lặp của chính request này (relay thử lại khi lần đầu GAS đã xử lý nhưng câu trả lời không về tới Extension). Nơi gọi luôn ghi state ngay sau đó vì còn phải bỏ request đang chờ.
 */
FbmSync.requestAnswered = function (state, responseRequestId) {
  var id = String(state && state.activeRequestId || '');
  if (!id || !responseRequestId || String(responseRequestId) !== id) { return false; }
  FbmSync.requestWatch.answered[id] = true;
  FbmSync.requestWatch.lastAnswered = id;
  state.resubmit = { answered: id, issued: '' };
  return true;
};
/**
 * Lần nộp (kết quả hoặc lỗi) mang mã request vừa được trả lời, trong khi request đang chờ đúng là request GAS cấp ngay sau câu trả lời đó (hoặc lượt đã đóng, không cấp gì): đây là nộp lặp, không phải response cũ.
 * Điều kiện `issued` chặn response thật sự cũ của lượt trước: request đang chờ đã khác thứ cấp sau câu trả lời thì không coi là nộp lặp.
 */
FbmSync.submitResubmitted = function (state, requestId) {
  var mark = state && state.resubmit || {};
  return !!requestId && !!mark.answered && String(requestId) === String(mark.answered) && String(state.activeRequestId || '') === String(mark.issued || '');
};
/** Hộp đen Extension gửi kèm lần hỏi nền; chỉ lần gọi đến từ Extension mới có, nên dòng Log của lượt Sidebar không nhắc hộp đen. */
FbmSync.requestWatchTrail = function (trail) { FbmSync.requestWatch.trail = trail || null; };
FbmSync.requestWatchCheck = function (next, now) {
  var open = FbmSync.requestWatch.open, at = Number(now || Date.now());
  if (!open || String(next && next.activeRequestId || '') === open.id || FbmSync.requestWatch.answered[open.id] || at < open.deadlineAt) { return; }
  FbmSync.requestWatch.answered[open.id] = true;
  var trail = FbmSync.requestWatch.trail, overdue = open.deadlineAt ? Math.max(0, Math.round((at - open.deadlineAt) / 60000)) : 0;
  FbmSync.requestWatch.findings.push({ source: 'fbm_sync', action: 'request_unanswered', outcome: LOG_ERROR, cycleId: open.runId, reason: (open.id.indexOf(FbmSync.PICKUP_PREFIX) === 0 ? 'Lượt ' + open.runId + ' chờ Extension máy được giao đến nhận nhưng Extension không hỏi GAS lần nào, đã quá hạn ' + overdue + ' phút; GAS đóng lượt, chưa có request nào sang FBM.' : 'Request FBM ' + open.id + (open.kind ? ' (bước ' + open.kind + ')' : '') + ' không nhận được trả lời từ Extension, đã quá hạn chờ ' + overdue + ' phút; GAS bỏ request này.') + (trail !== undefined ? ' ' + FbmSync.extensionTrailText(trail, at) : ''), detail: { code: 'REQUEST_UNANSWERED', requestId: open.id, kind: open.kind, runId: open.runId, extensionTrail: trail !== undefined ? FbmSync.extensionTrailSafe(trail) : undefined } });
};
