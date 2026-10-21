/**
 * Sổ trạng thái của sheet quản trị: mỗi sheet `!` một mục ghi lượt thử vẽ gần nhất — với revision dữ liệu nào, kết quả ra sao — và cờ ô điều khiển vừa đổi.
 *
 * Vì sao là một sổ: kênh báo thay đổi đánh thức GAS cả khi chính GAS vừa ghi (Log, lượt vẽ). Phản ứng chỉ hội tụ khi GAS nhớ "đầu vào này đã xét, kết quả thế này" — kể cả khi hỏng; lượt hỏng chỉ thử lại khi dữ liệu đổi, người dùng sửa sheet đó (cờ `controls`) hoặc đến hạn thử lại.
 *
 * Mục sổ: `{ data, ok, problems, at, revision, controls }`.
 * - `data`: `ReloadState.revision` đọc lúc bắt đầu lượt thử; tín hiệu đến giữa lượt vẽ để sheet vẫn cũ.
 * - `problems`: các khối lỗi `{ title, lines }` của lượt hỏng, để Sidebar hiện mà không phải vẽ lại. `revision`: số lượt vẽ thành công.
 * - `controls`: trigger thấy người dùng sửa ô điều khiển (hoặc sửa bất kỳ ô nào trên sheet đang lỗi). Chỉ trigger bật, chỉ lượt thử vẽ tắt; cờ bật thì vẽ cả khi người dùng tắt tự làm mới, vì đó là lệnh trực tiếp.
 *
 * Theo tên sheet chứ không theo sheetId để lời hỏi của Sidebar quyết mà không phải mở bảng tính; đổi tên sheet chỉ làm sheet đó vẽ lại một lần, tên cũ dọn bằng `viewLedgerPrune`.
 * Tệp này không chạm Sheet; ghi sổ chỉ gọi trong DocumentLock.
 */

var VIEW_LEDGER_KEY = 'viewLedger';

function viewLedgerRead() {
  return documentMemoRead(documentProps(), VIEW_LEDGER_KEY, 'sổ vẽ sheet quản trị', 'object') || {};
}

function viewLedgerEntry(sheetName) {
  var entry = viewLedgerRead()[String(sheetName)];
  return entry && typeof entry === 'object' ? entry : null;
}

function viewLedgerSave(map) {
  documentProps().setProperty(VIEW_LEDGER_KEY, JSON.stringify(map));
}

function viewLedgerWrite(sheetName, entry) {
  var map = viewLedgerRead();
  map[String(sheetName)] = entry;
  viewLedgerSave(map);
}

/** Bật cờ ô điều khiển cho các sheet đã có mục. Sheet chưa có mục vốn đã cần vẽ nên không thêm mục rỗng. */
function viewLedgerMarkControls(sheetNames) {
  var map = viewLedgerRead();
  var changed = false;
  (sheetNames || []).forEach(function (name) {
    var entry = map[String(name)];
    if (!entry || entry.controls === true) { return; }
    entry.controls = true;
    changed = true;
  });
  if (changed) { viewLedgerSave(map); }
  return changed;
}

/** Bỏ mục của tên không còn là sheet `!` (đã xóa hoặc đổi tên). Không có gì để bỏ thì không ghi. */
function viewLedgerPrune(liveNames) {
  var live = {};
  (liveNames || []).forEach(function (name) { live[String(name)] = true; });
  var map = viewLedgerRead();
  var gone = Object.keys(map).filter(function (name) { return !live[name]; });
  if (!gone.length) { return []; }
  gone.forEach(function (name) { delete map[name]; });
  viewLedgerSave(map);
  return gone;
}

/** Nội dung sheet chưa khớp dữ liệu hoặc ô điều khiển: chưa từng vẽ, ô điều khiển vừa đổi, lượt thử gần nhất hỏng, hoặc dữ liệu đổi sau lượt vẽ. Dùng cho tô tab và báo Sidebar. */
function viewLedgerStale(entry, viewsStaleRevision) {
  if (!entry) { return true; }
  return entry.controls === true || entry.ok !== true || Number(entry.data) < Number(viewsStaleRevision || 0);
}

/** Lượt hỏng đã đủ cũ để thử lại: lưới an toàn cho lỗi tạm của Google, không phụ thuộc người dùng sửa gì. */
function viewLedgerRetryDue(entry, now) {
  return !!entry && entry.ok !== true && now - (Number(entry.at) || 0) >= SETTINGS.VIEW_FAILED_RETRY_MS;
}

/** Cần thử vẽ: chưa có mục, cờ ô điều khiển bật, dữ liệu đổi sau lượt thử, hoặc lượt hỏng đến hạn thử lại. Không đọc Sheet nên lời hỏi của Sidebar dùng được. */
function viewLedgerNeedsAttempt(entry, viewsStaleRevision, now) {
  if (!entry) { return true; }
  return entry.controls === true || Number(entry.data) < Number(viewsStaleRevision || 0) || viewLedgerRetryDue(entry, now);
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
