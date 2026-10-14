/**
 * Tô cam tab sheet quản trị đang cũ, để người mở bảng tính lúc Sidebar đóng vẫn thấy view chưa cập nhật; vẽ xong thì trả lại màu người dùng tự đặt (kể cả "không màu").
 *
 * Ranh giới: chỉ gọi từ điểm commit signal (trigger và cửa ghi) và từ lượt vẽ; `DirtyState`/`ReloadDecision` không chạm Sheet nên không gọi tệp này. Cờ "đã tô" và màu cũ là đọc–sửa–ghi chung với lượt vẽ, nên mọi thao tác chạy trong DocumentLock.
 *
 * Chi phí: chỉ quét danh sách sheet khi `viewsStaleRevision` tăng so với lần quét trước, và chỉ gọi `setTabColor` cho sheet cũ chưa tô — signal thứ hai liên tiếp không tô lại. Tệp này không tự `flush`: cửa ghi flush trước khi nhả khóa, trigger được Apps Script flush khi kết thúc.
 *
 * Màu cũ lưu theo `sheetId` để đổi tên sheet lúc đang cam vẫn trả đúng màu.
 */

var VIEW_TAB_TINT_KEY = 'viewTabTint';

function viewTabTintRead() {
  try {
    var parsed = JSON.parse(documentProps().getProperty(VIEW_TAB_TINT_KEY) || '{}');
    var sheets = parsed && parsed.sheets && typeof parsed.sheets === 'object' && !Array.isArray(parsed.sheets) ? parsed.sheets : {};
    return { staleRevision: Number(parsed && parsed.staleRevision) || 0, sheets: sheets };
  } catch (khongDocDuoc) {
    return { staleRevision: 0, sheets: {} };
  }
}

function viewTabTintWrite(state) {
  documentProps().setProperty(VIEW_TAB_TINT_KEY, JSON.stringify(state));
}

/** Gọi trong DocumentLock, sau khi signal đã ghi. Trả về số sheet vừa tô. */
function viewTabTintStaleLocked(book) {
  var staleRevision = Number(reloadStateRead().viewsStaleRevision) || 0;
  var state = viewTabTintRead();
  if (staleRevision <= state.staleRevision) { return 0; }
  var rendered = viewRenderedRead();
  var tinted = 0;
  (book || shinOpenBook()).getSheets().forEach(function (sheet) {
    var name = sheet.getName();
    if (name.charAt(0) !== '!') { return; }
    var id = String(sheet.getSheetId());
    if (Object.prototype.hasOwnProperty.call(state.sheets, id) || !reloadDecisionViewStale(staleRevision, rendered[name])) { return; }
    state.sheets[id] = sheet.getTabColor() || '';
    sheet.setTabColor(SETTINGS.VIEW_STALE_TAB_COLOR);
    tinted += 1;
  });
  state.staleRevision = staleRevision;
  viewTabTintWrite(state);
  return tinted;
}

/** Bản tự lấy khóa cho trigger, nơi signal được ghi ngoài khóa. */
function viewTabTintStale() {
  var lock = LockService.getDocumentLock();
  if (!documentStoreTryLock(lock, SETTINGS.LOCK_WAIT_MS)) { throw new Error('Hệ thống bận, chưa tô được tab sheet quản trị đang cũ.'); }
  try {
    return viewTabTintStaleLocked();
  } finally {
    lock.releaseLock();
  }
}

/** Gọi trong DocumentLock sau khi lượt vẽ đã ghi revision. Signal đến giữa lượt vẽ để sheet vẫn cũ thì giữ cam. */
function viewTabTintRestoreLocked(sheet, name) {
  if (viewIsStale(name)) { return false; }
  var state = viewTabTintRead();
  var id = String(sheet.getSheetId());
  if (!Object.prototype.hasOwnProperty.call(state.sheets, id)) { return false; }
  sheet.setTabColor(state.sheets[id] || null);
  delete state.sheets[id];
  viewTabTintWrite(state);
  return true;
}
