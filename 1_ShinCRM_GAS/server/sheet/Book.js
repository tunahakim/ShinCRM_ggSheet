/**
 * Cửa duy nhất lấy tệp Sheet để làm việc. Mọi hàm phải lấy tệp qua đây, không gọi thẳng `SpreadsheetApp`.
 *
 * Code không chứa mã Sheet nào: code đi theo mọi bản sao, nên một mã viết cứng hoặc chặn bản sao, hoặc tệ hơn là cho Web App của bản sao ghi vào Sheet gốc.
 */

/** Khóa ScriptProperties giữ cặp {mã Sheet, mã script}. Bản sao mang theo ScriptProperties của script gốc, nên cặp chỉ có giá trị khi mã script khớp. */
var BOOK_BINDING_KEY = 'SHIN_BOOK_BINDING_V1';

/** Tệp đã mở theo cặp trong lần chạy này; đường gọi từ ngoài gọi `shinOpenBook` nhiều lần, chỉ đọc kho một lần. */
var BOOK_OPENED_BY_BINDING = null;

/** Cặp đã ghi trong kho, `null` khi chưa ghi, `false` khi hỏng. */
function shinBookBindingParse(props) {
  var raw = String(props.getProperty(BOOK_BINDING_KEY) || '');
  if (!raw) { return null; }
  var value = null;
  try { value = JSON.parse(raw); } catch (notJson) { value = null; }
  return value && typeof value === 'object' ? value : false;
}

/** Mã Sheet script này đã ghi, rỗng khi chưa ghi hoặc cặp thuộc script khác (kho mang theo từ Sheet gốc). Hỏng thì báo lỗi, không đoán. */
function shinBookBindingRead(props) {
  var value = shinBookBindingParse(props);
  if (value === false) { throw new Error('Cặp mã Sheet trong ScriptProperties (' + BOOK_BINDING_KEY + ') bị hỏng; mở Sidebar trên Sheet này để ghi lại.'); }
  return value && value.scriptId === ScriptApp.getScriptId() ? String(value.spreadsheetId || '') : '';
}

/** Ghi Sheet đang mở làm Sheet của script này. Chỉ gọi từ đường có Sheet đang mở, nơi biết chắc giá trị đúng, nên cặp hỏng cũng được ghi đè. Chỉ ghi khi khác, nên lượt mở Sidebar thường chỉ tốn một lần đọc. */
function shinBookBindingRecord(book, props) {
  var id = book.getId(), value = shinBookBindingParse(props);
  if (value && value.scriptId === ScriptApp.getScriptId() && String(value.spreadsheetId || '') === id) { return { spreadsheetId: id, changed: false }; }
  props.setProperty(BOOK_BINDING_KEY, JSON.stringify({ spreadsheetId: id, scriptId: ScriptApp.getScriptId(), at: Date.now() }));
  logEvent({ source: 'core', action: 'bookBindingRecorded', outcome: LOG_OK, reason: value === false ? 'Cặp mã Sheet trong kho bị hỏng, đã ghi lại theo Sheet đang mở.' : 'Đã ghi Sheet của script này cho các lời gọi từ ngoài (Web App, đồng bộ nền).', detail: { sheetName: book.getName() } });
  return { spreadsheetId: id, changed: true };
}

/**
 * Trả về tệp Sheet để làm việc.
 *
 * Có hai đường gọi hàm. Mở Sidebar, menu, trigger hay bấm Run trong editor thì có "tệp đang mở": script gắn với Sheet nên đó luôn là Sheet của chính nó.
 * Gọi từ bên ngoài (Web App, cửa chạy hàm) thì KHÔNG có tệp đang mở, và `SpreadsheetApp.getActiveSpreadsheet()` lúc đó ném lỗi "reading from storage ... NOT_FOUND"
 * chứ không trả về null. Đường này mở theo cặp `shinBookBindingRecord` đã ghi lúc mở Sidebar; chưa có thì dừng hẳn, không đoán Sheet nào.
 */
function shinOpenBook() {
  var active = null;
  var activeId = '';

  // Cả phép lấy tệp lẫn phép đọc ID đều phải nằm trong try. Chạy không có tệp đang mở thì Google có thể trả về một đối tượng
  // trông như tệp nhưng đụng vào là ném lỗi storage, nên bọc mỗi lời gọi getActiveSpreadsheet là không đủ.
  try {
    active = SpreadsheetApp.getActiveSpreadsheet();
    activeId = active ? active.getId() : '';
  } catch (khongCoTepDangMo) {
    active = null;
    activeId = '';
  }
  if (active && activeId) { return active; }

  if (BOOK_OPENED_BY_BINDING) { return BOOK_OPENED_BY_BINDING; }
  var boundId = shinBookBindingRead(PropertiesService.getScriptProperties());
  if (!boundId) {
    throw new Error('Script này chưa biết Sheet của nó (Sheet mới nhân bản hoặc chưa từng mở Sidebar). Mở Sidebar ShinCRM trên Sheet này một lần rồi thử lại.');
  }
  BOOK_OPENED_BY_BINDING = SpreadsheetApp.openById(boundId);
  return BOOK_OPENED_BY_BINDING;
}

/** Lấy một sheet theo tên, ném lỗi nói rõ tên nào thiếu thay vì trả về null cho bên gọi tự đoán. */
function shinOpenSheet(sheetName) {
  var sheet = sheetReadSheet(sheetName);
  if (!sheet) {
    throw new Error('Không thấy sheet "' + sheetName + '" trong tệp. Chạy setupSheets trước.');
  }
  return sheet;
}

/** Tên mọi sheet quản trị (bắt đầu bằng `!`) theo thứ tự tab. */
function shinViewSheetNames(book) {
  return book.getSheets().map(function (sheet) { return sheet.getName(); }).filter(function (name) { return name.charAt(0) === '!'; });
}
