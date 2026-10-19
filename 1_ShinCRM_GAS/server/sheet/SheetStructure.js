/**
 * Thao tác cấu trúc của tầng 1 đọc/ghi Sheet (tài liệu 06 Phần 2): tạo, xóa, chuyển tới sheet, cố định hàng, màu tab. Chỉ biết tên sheet và con số; chính sách theo loại sheet tự áp như công cụ ghi ô, nên tạo sheet kho hay sheet quản trị ngoài khóa tài liệu không có đường chạy.
 */

/** Tạo sheet tên `sheetName` ở cuối tệp. Tên rơi vào loại sheet tự do thì từ chối, vì ShinCRM chỉ dựng sheet của mình. */
function sheetBookCreate(sheetName) {
  sheetPolicyAssertNameWritable(sheetName);
  return shinOpenBook().insertSheet(sheetName);
}

/**
 * Xóa một sheet, chỉ khi nó trắng hoàn toàn (không ô nào có giá trị), để xóa nhầm dữ liệu không có đường xảy ra. Sheet tự do cũng xóa được vì trắng thì không còn gì của người dùng; sheet của ShinCRM vẫn phải đang cầm khóa.
 */
function sheetBookDeleteBlank(sheet) {
  var name = sheet.getName();
  if (sheetPolicy(name).kind !== 'free') { sheetPolicyAssertWritable(sheet); }
  sheetReadCopyBeforeRead();
  if (sheet.getLastRow() !== 0 || sheet.getLastColumn() !== 0) {
    throw new Error('Sheet "' + name + '" còn dữ liệu, ShinCRM không xóa.');
  }
  shinOpenBook().deleteSheet(sheet);
  sheetReadCopyDrop(name);
}

/** Đưa người dùng tới sheet này. Chỉ đổi chỗ đang xem, không đổi dữ liệu, nên không áp chính sách ghi. */
function sheetActivate(sheet) {
  shinOpenBook().setActiveSheet(sheet);
}

function sheetFrozenRowsRead(sheet) {
  sheetReadCopyBeforeRead();
  return sheet.getFrozenRows();
}

function sheetFrozenRowsSet(sheet, count) {
  sheetPolicyAssertWritable(sheet);
  sheet.setFrozenRows(count);
}

/** Màu tab hiện tại, `null` khi tab không có màu. */
function sheetTabColorRead(sheet) {
  return sheet.getTabColor();
}

/** Đặt màu tab; `null` là gỡ màu. */
function sheetTabColorWrite(sheet, color) {
  sheetPolicyAssertWritable(sheet);
  sheet.setTabColor(color);
}
