/**
 * Lập kế hoạch vùng (tầng 2 đọc/ghi Sheet, tài liệu 06 Phần 2): hàm thuần biến danh sách số hàng hoặc số cột thành các vùng gộp. Mọi nơi gom dải đều gọi đây, không tự viết vòng gom riêng.
 */

/**
 * Gom số nguyên thành các dải liền nhau, bỏ số trùng. Vào `[0,1,2,5,6,18]`, ra `[[0,1,2],[5,6],[18]]`.
 * Dải ghi **chỉ chứa phần tử có trong danh sách**: chèn một cột không ghi vào giữa dải là ghi rỗng lên nó, mà cột đó có thể là cột công thức của người dùng (tài liệu 06 Phần 3).
 */
function sheetRegionsSpans(indexes) {
  var sorted = indexes.slice().sort(function (a, b) { return a - b; });
  var spans = [];
  sorted.forEach(function (index) {
    var last = spans[spans.length - 1];
    if (last && index === last[last.length - 1]) { return; }
    if (last && index === last[last.length - 1] + 1) { last.push(index); return; }
    spans.push([index]);
  });
  return spans;
}

/**
 * Gom số hàng cần đọc thành các khối `[đầu, cuối]`: hai hàng cách nhau không quá `gap` đọc chung một lệnh (đọc luôn các hàng xen giữa), vì phí cố định của một lệnh đọc đắt hơn phí các hàng thừa. Ngưỡng ở `SETTINGS.SHEET_READ_MERGE_GAP_ROWS`.
 */
function sheetRegionsReadGroups(rowNumbers, gap) {
  var groups = [];
  rowNumbers.slice().sort(function (a, b) { return a - b; }).forEach(function (row) {
    var last = groups[groups.length - 1];
    if (last && row - last[1] <= gap) { if (row > last[1]) { last[1] = row; } return; }
    groups.push([row, row]);
  });
  return groups;
}
