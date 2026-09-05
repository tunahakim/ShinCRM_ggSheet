/**
 * Ca kiểm cho `server/sheet/SheetGrid.js`: sự thật về **lưới** của một sheet.
 *
 * Tệp code này ra đời từ một lỗi thật đã làm sheet `Log` trên tệp thật co xuống 7 hàng rồi tắt log trong im lặng. Nên nhóm ca này canh đúng bốn điều đã gây ra lỗi đó: lưới là hữu hạn, `setValues` không tự nới, `deleteRows` làm lưới co, và `getRange` hỏi ra ngoài lưới thì ném lỗi kể cả khi chỉ đọc.
 *
 * Ba ca rỗng ở `sheetGridReadBlock` là phần đáng kiểm nhất, vì **ca rỗng là ca thường xuyên** chứ không phải ca ngoại lệ: sheet trắng lúc mở sidebar lần đầu, gói giao dịch cuối đúng bằng số dòng còn lại, khách chưa có giao dịch nào — cả ba đều đi qua đó. Một hàm đọc chỉ hỏng ở ca rỗng thì sẽ hỏng đúng lần chạy đầu tiên.
 */

const { dungHop } = require('../lib/dung-hop');
const { section, check, checkThrows, ghiLoiNap } = require('../lib/assert');

function chay(so) {
  section('Lưới sheet — hữu hạn, không tự nới, và ca rỗng là ca thường xuyên');

  let nen;
  try {
    nen = dungHop({ sheets: ['Customer'] });
  } catch (err) {
    return ghiLoiNap(so, 'nạp được server/sheet/SheetGrid.js', err);
  }

  const hop = nen.hop;
  const sheet = nen.Customer.sheet;
  const hangDau = hop.SHEET_FIRST_DATA_ROW;

  // `dungHop` vừa ghi hàng 1, nên sheet đang ở đúng trạng thái "có tiêu đề, chưa có bản ghi".
  // Đây là trạng thái mà `getLastRow()` trả về 1 chứ không trả về 0, và là lý do hàm này tồn tại.
  check(so, 'sheet chỉ có hàng mã thì số hàng dữ liệu là 0, không phải số âm', hop.sheetGridDataRowCount(sheet, hangDau), 0);
  check(so, 'getLastRow của chính sheet đó lại trả về 1 — đúng thứ khiến phép trừ này phải nằm một chỗ', sheet.getLastRow(), 1);

  sheet.getRange(hangDau, 1).setValue('KH0001');
  sheet.getRange(hangDau + 2, 1).setValue('KH0003');
  check(so, 'có bản ghi ở hàng 4 và hàng 6 thì đếm được 3 hàng dữ liệu, tính cả hàng trắng ở giữa', hop.sheetGridDataRowCount(sheet, hangDau), 3);

  const sheetTrang = nen.book.insertSheet('SheetTrangHoanToan');
  check(so, 'sheet trắng hoàn toàn cũng ra 0 chứ không ra số âm', hop.sheetGridDataRowCount(sheetTrang, hangDau), 0);

  // Ba ca rỗng của `sheetGridReadBlock`. Cả ba phải trả về mảng rỗng, không ném lỗi và không cắt sai.
  check(so, 'ca rỗng 1 — hỏi 0 hàng thì ra mảng rỗng', hop.sheetGridReadBlock(sheet, hangDau, 0, 5), []);
  check(so, 'ca rỗng 2 — hỏi số hàng âm cũng ra mảng rỗng', hop.sheetGridReadBlock(sheet, hangDau, -5, 5), []);
  check(so, 'ca rỗng 3 — hàng đầu nằm ngoài lưới thì ra mảng rỗng chứ không ném lỗi', hop.sheetGridReadBlock(sheet, sheet.getMaxRows() + 10, 5, 5), []);
  check(so, 'ca rỗng 4 — hỏi 0 cột cũng ra mảng rỗng', hop.sheetGridReadBlock(sheet, hangDau, 5, 0), []);
  check(so, 'ca rỗng 5 — hàng đầu là 0 thì ra mảng rỗng, không đi hỏi Google bằng chỉ số sai', hop.sheetGridReadBlock(sheet, 0, 5, 5), []);

  // Cắt gọn theo lưới chứ không ném lỗi: bên gọi tính vùng đọc từ `getLastRow()` còn lưới thì do `getMaxRows()` quyết định,
  // và hai con số đó lệch nhau là chuyện thường. Ném lỗi ở đây là bắt mọi bên gọi phải tự biết lưới rộng bao nhiêu.
  const hangCuoi = sheet.getMaxRows() - 1;
  check(so, 'đọc quá tay thì cắt gọn theo lưới, không ném lỗi', hop.sheetGridReadBlock(sheet, hangCuoi, 500, 5).length, 2);
  check(so, 'cắt gọn cả theo số cột của lưới', hop.sheetGridReadBlock(sheet, hangDau, 1, 500)[0].length, sheet.getMaxColumns());
  checkThrows(so, 'tệp giả vẫn ném lỗi khi hỏi thẳng getRange quá lưới — đúng như Google',
    () => sheet.getRange(sheet.getMaxRows() + 1, 1, 1, 1), 'chỉ có');

  // Nới lưới. Trả về con số chứ không trả về `undefined` để phép nghiệm thu đo được — một luật không đo được là một lời hứa.
  check(so, 'lưới đã đủ chỗ thì nới thêm 0 hàng', hop.sheetGridEnsureRoom(sheet, 10), 0);

  const truocKhiNoi = sheet.getMaxRows();
  const daNoi = hop.sheetGridEnsureRoom(sheet, truocKhiNoi + 1);
  check(so, 'thiếu 1 hàng thì nới 1 cộng SHEET_GRID_SLACK, chứ không nới vừa đủ', daNoi, 1 + hop.SHEET_GRID_SLACK);
  check(so, 'lưới sau khi nới đúng bằng lưới cũ cộng số đã nới', sheet.getMaxRows(), truocKhiNoi + daNoi);
  check(so, 'nới thừa nên lượt ghi ngay sau đó không phải nới lại', hop.sheetGridEnsureRoom(sheet, truocKhiNoi + 2), 0);
  check(so, 'nới lưới tốn đúng 1 lệnh insertRows cho cả hai lượt gọi', nen.dem.insertRows, 1);

  // Nới thừa 0 hàng là quyền của bên gọi, và có một bên gọi cần nó: phép đo lưới không muốn phình sheet thêm 500 hàng.
  const truocKhiNoiSat = sheet.getMaxRows();
  check(so, 'nới sát không thừa hàng nào khi bên gọi truyền slack bằng 0', hop.sheetGridEnsureRoom(sheet, truocKhiNoiSat + 3, 0), 3);

  return so;
}

module.exports = { chay };
