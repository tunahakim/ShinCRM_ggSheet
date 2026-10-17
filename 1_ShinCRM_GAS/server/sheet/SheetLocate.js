/**
 * Định vị (tầng 2 đọc/ghi Sheet, tài liệu 06 Phần 2): hàm thuần đổi mã bản ghi ra số dòng từ cột mã đã đọc. Không chạm Sheet; cột mã do bên gọi đọc trong khóa rồi truyền vào, để số dòng chỉ sống trong đúng lần cầm khóa đó.
 */

/**
 * Bảng tra mã bản ghi sang số dòng: `{ '<mã>': số dòng }`. Ô mã rỗng bỏ qua.
 * Hai dòng cùng mã thì ném lỗi: mỗi lần sửa sẽ sửa một dòng và bỏ dòng kia, người dùng thấy sửa xong mở lại giá trị cũ quay về — không triệu chứng nào khó tìm hơn.
 */
function sheetLocateRowMap(idValues, firstDataRow, sheetName) {
  var rows = {};
  for (var i = 0; i < idValues.length; i++) {
    var id = String(idValues[i] === null || idValues[i] === undefined ? '' : idValues[i]).trim();
    if (!id) { continue; }
    if (rows[id]) {
      throw new Error('Sheet "' + sheetName + '" có hai dòng cùng mã "' + id + '" (dòng ' + rows[id] + ' và dòng ' + (firstDataRow + i) + '). Sửa trên sheet trước khi lưu.');
    }
    rows[id] = firstDataRow + i;
  }
  return rows;
}
