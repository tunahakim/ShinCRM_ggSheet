/**
 * Cửa duy nhất lấy tệp Sheet để làm việc, kèm cổng chặn chạy nhầm tệp. Mọi hàm phải lấy tệp qua đây, không gọi thẳng `SpreadsheetApp`.
 *
 * Tách riêng thành một tệp vì hai lý do. Một, nó là thứ mọi tệp khác đều cần, nên nằm chung với code dựng khung thì nó bị lôi theo
 * số phận của code dựng khung. Hai, ID tệp là hằng số phải có đúng một chỗ; hai chỗ là hai chỗ để sửa một quên một.
 */

/** ID tệp Sheet mới. Chốt cứng làm cổng chặn: chạy nhầm trên tệp đang đi bán hàng thì dừng ngay. */
var SETUP_EXPECTED_SPREADSHEET_ID = '1jEQMWMn5jRUBDGXrQxbK0hpld6gGwlAXSZpoRQm8lpI';

/**
 * Trả về tệp Sheet để làm việc.
 *
 * Có hai đường gọi hàm và chúng khác nhau ở một điểm chí tử. Mở từ menu hoặc bấm Run trong editor thì có "tệp đang mở".
 * Gọi từ bên ngoài để chạy khi không có ai ngồi trước máy thì KHÔNG có tệp đang mở, và
 * `SpreadsheetApp.getActiveSpreadsheet()` lúc đó ném lỗi "reading from storage ... NOT_FOUND"
 * chứ không lịch sự trả về null. Nên phải bọc try rồi mở thẳng theo ID.
 *
 * Cổng chặn tệp sai vẫn còn nguyên tác dụng ở đường thứ nhất: nếu bản code này bị dán vào tệp đang đi bán hàng
 * thì tệp đang mở không khớp ID và hàm ném lỗi ngay. Đường thứ hai mở đúng một ID nên không có đường đi nhầm.
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

  if (!active || !activeId) {
    return SpreadsheetApp.openById(SETUP_EXPECTED_SPREADSHEET_ID);
  }

  if (activeId !== SETUP_EXPECTED_SPREADSHEET_ID) {
    throw new Error('Dừng lại: đang chạy trên tệp "' + active.getName() + '" (ID ' + activeId + '), không phải tệp dành cho bản mới. Không làm gì cả.');
  }

  return active;
}

/** Lấy một sheet theo tên, ném lỗi nói rõ tên nào thiếu thay vì trả về null cho bên gọi tự đoán. */
function shinOpenSheet(sheetName) {
  var sheet = shinOpenBook().getSheetByName(sheetName);
  if (!sheet) {
    throw new Error('Không thấy sheet "' + sheetName + '" trong tệp. Chạy setupSheets trước.');
  }
  return sheet;
}
