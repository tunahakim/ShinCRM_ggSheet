/**
 * Dựng hai sheet xem tự do trên Sheet DEV để nghiệm thu luật cột mã bằng tay trên Sidebar: `Kanban thử` (ba danh sách cạnh nhau) và `Một cột thử` (một cột mã nằm giữa).
 * Mã khách lấy từ các dòng Customer đang có nên Sidebar tra được trong RAM. Chỉ ghi vào đúng hai sheet tên riêng này; sheet trùng tên được xóa sạch rồi dựng lại.
 */

var FREE_SHEET_FIXTURE_NAMES = { kanban: 'Kanban thử', single: 'Một cột thử' };

function devSeedFreeSheets() {
  var book = shinOpenBook();
  var customer = book.getSheetByName(ENTITY_SHEETS.customer);
  var idColumn = Number(readColumnMap(ENTITY_SHEETS.customer).map[DATA_SCHEMA.customer.id.code] || 0);
  if (!idColumn) { throw new Error('Customer thiếu cột ' + DATA_SCHEMA.customer.id.code + '.'); }
  var rows = Math.max(0, customer.getLastRow() - SHEET_FIRST_DATA_ROW + 1);
  var ids = rows ? customer.getRange(SHEET_FIRST_DATA_ROW, idColumn, Math.min(rows, 6), 1).getValues().map(function (row) { return String(row[0] || '').trim(); }).filter(Boolean) : [];
  if (ids.length < 6) { throw new Error('Cần ít nhất 6 khách trong Customer, đang có ' + ids.length + '. Chạy seedFakeData trước.'); }
  var cus = DATA_SCHEMA.customer.id.code;
  var act = DATA_SCHEMA.activity.customerId.code;

  var kanban = [
    [cus, '', '', '', cus, '', '', act, ''],
    ['Dưới 5 GD/30 ngày', '', '', '', 'Đã gửi HĐ dự thảo', '', '', 'Cần theo dõi', ''],
    ['Mã KH', 'Ghi chú', 'Hạng', '', 'Mã KH', 'Ghi chú', '', 'Mã KH', 'Ghi chú'],
    [ids[0], 'khối 1 dòng 4', 'A', '', ids[3], 'khối 2 dòng 4', '', ids[5], 'khối 3 dòng 4'],
    [ids[1], 'khối 1 dòng 5', 'B', '', ids[4], 'khối 2 dòng 5', '', '', ''],
    [ids[2], 'khối 1 dòng 6', 'C', '', '', '', '', '', '']
  ];
  var single = [
    ['', '', cus, ''],
    ['Ghi chú', 'Hạng', 'Mã KH', 'Sau mã'],
    ['trái mã', 'A', ids[0], 'phải mã'],
    ['trái mã', 'B', ids[1], 'phải mã']
  ];
  devFreeSheetWrite(book, FREE_SHEET_FIXTURE_NAMES.kanban, kanban);
  devFreeSheetWrite(book, FREE_SHEET_FIXTURE_NAMES.single, single);

  return [
    'OK — đã dựng hai sheet xem tự do.',
    FREE_SHEET_FIXTURE_NAMES.kanban + ': khối 1 cột A–C (' + ids.slice(0, 3).join(', ') + '), khối 2 cột E–F (' + ids.slice(3, 5).join(', ') + ', dòng 6 trống), khối 3 cột H–I mở bằng ' + act + ' (' + ids[5] + ', dòng 5–6 trống).',
    'Mong đợi Kanban: C4 → ' + ids[0] + '; D5 (cột trống) → ' + ids[1] + '; F5 → ' + ids[4] + '; F6 → hàng không có khách; I4 → ' + ids[5] + '; K4 → ' + ids[5] + '.',
    FREE_SHEET_FIXTURE_NAMES.single + ': một cột mã ở C. Mong đợi A3 → ' + ids[0] + '; D4 → ' + ids[1] + '.'
  ];
}

function devFreeSheetWrite(book, name, values) {
  var sheet = book.getSheetByName(name) || book.insertSheet(name);
  sheet.clear();
  sheet.getRange(1, 1, values.length, values[0].length).setValues(values);
}
