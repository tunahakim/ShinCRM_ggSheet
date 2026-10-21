/**
 * Màu tab sheet quản trị là hình chiếu của trạng thái cũ/mới trong sổ vẽ view: cũ thì cam, mới thì màu gốc người dùng tự đặt (kể cả "không màu"). Tài liệu 07 Phần 8.
 *
 * Chỉ đổi màu đúng lúc trạng thái một sheet đổi, qua một hàm `viewTabColorSync`: dữ liệu đổi (bước ghi nhận thay đổi sau khi ghi đưa các sheet đang mới vào), lượt vẽ một sheet kết thúc, và trigger báo có sheet `!` mới. Không quét danh sách tab: sheet đang mới tính từ sổ vẽ view trong kho, nên lần ghi không có sheet nào vừa thành cũ không gọi Sheet lệnh nào.
 *
 * Thứ duy nhất phải nhớ là màu gốc bị cam che, lưu theo `sheetId` để đổi tên sheet lúc đang cam vẫn trả đúng màu. Cạm bẫy: Google không báo việc đổi màu tab bằng tay, nên trước khi trả màu luôn đọc màu thật — tab không còn cam nghĩa là người dùng đã tự tô, giữ màu đó làm màu gốc mới thay vì đè bằng màu cũ đã cất.
 *
 * Tệp này không tự `flush` và không tự gửi kho: người giữ khóa làm cả hai trước khi nhả, nên màu gốc đi chung một lệnh ghi với sổ nạp lại.
 */

var VIEW_TAB_TINT_KEY = 'viewTabTint';

/** Bảng màu gốc `{ sheetId: màu }` của các tab đang bị cam che. */
function viewTabTintRead() {
  var parsed = documentMemoRead(documentProps(), VIEW_TAB_TINT_KEY, 'màu gốc tab sheet quản trị', 'object');
  return parsed && parsed.sheets && typeof parsed.sheets === 'object' && !Array.isArray(parsed.sheets) ? parsed.sheets : {};
}

function viewTabTintIsStaleColor(color) {
  return String(color || '').toLowerCase() === String(SETTINGS.VIEW_STALE_TAB_COLOR).toLowerCase();
}

/**
 * Đặt màu tab theo trạng thái cho đúng các sheet được đưa vào, trong khóa tài liệu (gọi lồng thì chạy tiếp). Trả về số tab đã đổi màu.
 *
 * `fromSidebar`: lượt ghi do người đang mở Sidebar bấm. Người đó đang đứng trên một sheet `!` và bật tự làm mới thì Sidebar vẽ lại sheet đó ngay, nên không tô để tab không nháy cam rồi tắt. Chỉ hỏi tab đang đứng khi có sheet cần tô.
 */
function viewTabColorSync(sheets, options) {
  var list = (sheets || []).filter(function (sheet) { return !!sheet; });
  if (!list.length) { return 0; }
  return documentLockRun(function () {
    var original = viewTabTintRead();
    var changed = 0;
    var dirty = false;
    var viewing = null;
    list.forEach(function (sheet) {
      var name = sheet.getName();
      var id = String(sheet.getSheetId());
      var current = sheetTabColorRead(sheet);
      var orange = viewTabTintIsStaleColor(current);
      if (viewIsStale(name)) {
        if (orange) { return; }
        if (viewing === null) { viewing = options && options.fromSidebar ? viewTabTintViewingSheet(shinOpenBook()) : ''; }
        if (name === viewing) { return; }
        original[id] = current || '';
        sheetTabColorWrite(sheet, SETTINGS.VIEW_STALE_TAB_COLOR);
        changed += 1;
        dirty = true;
        return;
      }
      var had = Object.prototype.hasOwnProperty.call(original, id);
      if (orange) {
        sheetTabColorWrite(sheet, had ? original[id] || null : null);
        changed += 1;
      }
      if (had) { delete original[id]; dirty = true; }
    });
    if (dirty) { documentProps().setProperty(VIEW_TAB_TINT_KEY, JSON.stringify({ sheets: original })); }
    return changed;
  });
}

/** Đặt màu theo tên sheet; tên không còn sheet (đã xóa) thì bỏ qua. Mỗi tên một lệnh mở sheet, nên bên gọi chỉ đưa vào sheet vừa đổi trạng thái. */
function viewTabColorSyncNames(names, options) {
  if (!names || !names.length) { return 0; }
  var book = shinOpenBook();
  return viewTabColorSync(names.map(function (name) { return book.getSheetByName(name); }), options);
}

/** Sheet `!` chưa có mục trong sổ vẽ view (vừa thêm, hoặc vừa đổi tên vì sổ giữ theo tên) là sheet cũ từ lúc sinh ra; trigger gọi để tab của nó cũng mang màu cũ. */
function viewTabColorSyncUnrendered(names) {
  var ledger = viewLedgerRead();
  return viewTabColorSyncNames((names || []).filter(function (name) { return !ledger[name]; }));
}

/** Sheet `!` người dùng hiện tại đang đứng, nếu công tắc tự làm mới của họ bật; rỗng nếu không. */
function viewTabTintViewingSheet(book) {
  if (userPrefsRead().autoRenderView === false) { return ''; }
  var active = book.getActiveSheet();
  var name = active ? active.getName() : '';
  return name.charAt(0) === '!' ? name : '';
}
