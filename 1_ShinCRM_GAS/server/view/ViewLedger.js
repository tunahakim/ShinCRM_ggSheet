/**
 * Sổ trạng thái của sheet quản trị: mỗi sheet `!` một mục ghi lượt thử vẽ gần nhất — với revision dữ liệu nào, dấu vân tay ô điều khiển nào, kết quả ra sao.
 *
 * Vì sao là một sổ: kênh báo thay đổi đánh thức GAS cả khi chính GAS vừa ghi (Log, note, lượt vẽ). Phản ứng chỉ hội tụ khi GAS nhớ "đầu vào này đã xét, kết quả thế này" — kể cả khi hỏng. Hai sổ cũ chỉ ghi khi vẽ thành công nên lượt hỏng bị thử lại ở mọi lần đánh thức, và mỗi lần thử lại ghi Log, note, thành vòng lặp.
 *
 * Mục sổ: `{ data, input, ok, error, at, revision, blocker }`.
 * - `data`: `ReloadState.revision` đọc lúc bắt đầu lượt thử; tín hiệu đến giữa lượt vẽ để sheet vẫn cũ.
 * - `input`: dấu vân tay ô điều khiển lúc thử. `revision`: bộ đếm cho Sidebar biết metadata hàng điều khiển đổi.
 * - `blocker`: ô công thức chặn lượt vẽ; người dùng gỡ công thức không đổi dấu vân tay nên phải dò riêng đúng ô đó.
 *
 * Theo tên sheet chứ không theo sheetId để lời hỏi của Sidebar quyết mà không phải mở bảng tính; đổi tên sheet chỉ làm sheet đó vẽ lại một lần.
 * Tệp này không chạm Sheet trừ một lần đọc công thức ô `blocker`; ghi sổ chỉ gọi trong DocumentLock.
 */

var VIEW_LEDGER_KEY = 'viewLedger';

function viewLedgerRead() {
  try {
    var parsed = JSON.parse(documentProps().getProperty(VIEW_LEDGER_KEY) || '{}');
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
  } catch (khongDocDuoc) {
    return {};
  }
}

function viewLedgerEntry(sheetName) {
  var entry = viewLedgerRead()[String(sheetName)];
  return entry && typeof entry === 'object' ? entry : null;
}

function viewLedgerWrite(sheetName, entry) {
  var map = viewLedgerRead();
  map[String(sheetName)] = entry;
  documentProps().setProperty(VIEW_LEDGER_KEY, JSON.stringify(map));
}

/** Nội dung sheet chưa khớp dữ liệu: chưa từng vẽ, lượt thử gần nhất hỏng, hoặc dữ liệu đổi sau lượt vẽ. Dùng cho tô tab và báo Sidebar. */
function viewLedgerStale(entry, viewsStaleRevision) {
  if (!entry) { return true; }
  return entry.ok !== true || Number(entry.data) < Number(viewsStaleRevision || 0);
}

/** Lượt hỏng đã đủ cũ để thử lại: lưới an toàn cho lỗi tạm của Google, không phụ thuộc người dùng sửa gì. */
function viewLedgerRetryDue(entry, now) {
  return !!entry && entry.ok !== true && now - (Number(entry.at) || 0) >= SETTINGS.VIEW_FAILED_RETRY_MS;
}

/** Phần dữ liệu cần thử: dữ liệu đổi sau lượt thử, hoặc lượt hỏng đã đến hạn thử lại. Không đọc Sheet nên lời hỏi của Sidebar dùng được. */
function viewLedgerDataNeedsAttempt(entry, viewsStaleRevision, now) {
  if (!entry) { return true; }
  return Number(entry.data) < Number(viewsStaleRevision || 0) || viewLedgerRetryDue(entry, now);
}

/** Phần điều khiển cần thử: dấu vân tay khác lượt thử, ô công thức chặn đã được gỡ, hoặc lượt hỏng đến hạn thử lại. */
function viewLedgerControlsNeedAttempt(entry, sheet, input, now) {
  if (!entry || entry.input !== input || viewLedgerRetryDue(entry, now)) { return true; }
  if (entry.ok === true || !entry.blocker) { return false; }
  return !sheet.getRange(entry.blocker.row, entry.blocker.column).getFormula();
}

function viewIsStale(sheetName) {
  return viewLedgerStale(viewLedgerEntry(sheetName), reloadStateRead().viewsStaleRevision);
}

/** Tên các sheet đang mới theo sổ, chỉ đọc kho: bước ghi nhận thay đổi gọi trước khi nâng mốc view cũ để biết đúng những sheet sắp thành cũ mà không quét danh sách tab. */
function viewLedgerFreshNames() {
  var ledger = viewLedgerRead();
  var staleRevision = reloadStateRead().viewsStaleRevision;
  return Object.keys(ledger).filter(function (name) { return !viewLedgerStale(ledger[name], staleRevision); });
}
