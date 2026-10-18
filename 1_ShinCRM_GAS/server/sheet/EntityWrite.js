/**
 * Ghi và xóa bản ghi của một thực thể (tầng 3 đọc/ghi Sheet, tài liệu 06 Phần 2 và Phần 3): nhận mã và giá trị theo tên trường đã ép kiểu, tự tra mã ra dòng ngay lúc làm, tự định vị cột, gom vùng và gọi công cụ tầng 1. Số dòng sinh ra và chết trong từng lời gọi, không ra ngoài.
 * Không kiểm gì và không cầm khóa: chỉ người điều phối tầng 4 gọi, sau khi đã kiểm trong cùng lần cầm khóa; gọi ngoài khóa thì công cụ tầng 1 ném lỗi.
 */

/**
 * Ghi `writes` (`[{ id, values, append }]`, `values` khóa theo tên trường trong `fields`), trả `{ gone, rows }`: `rows` là bản ghi đọc lại theo vị trí ở đúng các dòng vừa ghi, cùng thứ tự `writes`, để người điều phối xác nhận sau ghi (dòng vừa ghi đang mang mã gì) mà không tra lại mã.
 * Mã sửa nào không còn trên sheet thì không ghi gì cả và trả mã đó trong `gone`: ghi một phần lô là phá luật "trọn vẹn hoặc không xảy ra".
 * `append` nối thành một khối liền ngay dưới dòng cuối của `context`; tập cột của khối là hợp các khóa trong lô và ô thiếu khóa ghi rỗng — đúng vì dòng đang dựng mới. Bản ghi sửa chỉ ghi đúng khóa nó mang (Phần 3). Bản ghi sửa ở dòng liền nhau cùng tập cột gom thành một lô, mỗi dải cột liền nhau một lệnh.
 */
function entityWriteRecords(context, fields, writes) {
  var located = entityLocate(context, writes.filter(function (write) { return !write.append; }).map(function (write) { return write.id; }));
  if (located.gone.length) { return { gone: located.gone, rows: [] }; }
  var columns = entityWriteColumns(context, fields);
  var rows = located.rows;

  var appends = writes.filter(function (write) { return write.append; });
  if (appends.length) {
    var firstRow = SHEET_FIRST_DATA_ROW + context.rowCount;
    sheetGridEnsureRoom(context.sheet, firstRow + appends.length - 1, SHEET_GRID_SLACK);
    var keys = {};
    appends.forEach(function (write) { Object.keys(write.values).forEach(function (name) { keys[name] = true; }); });
    entityWriteBlock(context, columns, firstRow, appends, Object.keys(keys).map(function (name) { return columns.at[name]; }), true);
    appends.forEach(function (write, i) { rows[write.id] = firstRow + i; });
  }

  var lots = [];
  writes.filter(function (write) { return !write.append && Object.keys(write.values).length > 0; })
    .map(function (write) { return { write: write, row: rows[write.id] }; })
    .sort(function (a, b) { return a.row - b.row; })
    .forEach(function (item) {
      var cols = Object.keys(item.write.values).map(function (name) { return columns.at[name]; }).sort(function (a, b) { return a - b; });
      var key = cols.join(',');
      var last = lots[lots.length - 1];
      if (last && last.key === key && last.lastRow === item.row - 1) { last.writes.push(item.write); last.lastRow = item.row; return; }
      lots.push({ key: key, cols: cols, firstRow: item.row, lastRow: item.row, writes: [item.write] });
    });
  lots.forEach(function (lot) { entityWriteBlock(context, columns, lot.firstRow, lot.writes, lot.cols, false); });

  var raws = writes.length ? sheetReadRows(context.sheet, writes.map(function (write) { return rows[write.id]; })) : [];
  return { gone: [], rows: raws.map(function (raw) { return entityReadRecord(context, raw); }) };
}

/** Xóa hẳn các bản ghi theo mã, tra mã ngay trên lần đọc trong khóa rồi xóa dòng: `{ deleted, gone }`. Mã không còn trên sheet thì không có gì để xóa, trả trong `gone`. */
function entityDeleteRecords(context, ids) {
  var located = entityLocate(context, ids);
  var deleted = ids.filter(function (id) { return !!located.rows[id]; });
  sheetRowsDelete(context.sheet, deleted.map(function (id) { return located.rows[id]; }));
  return { deleted: deleted, gone: located.gone };
}

/** Định vị cột của mọi trường sẽ ghi: chỉ số cột 0-based theo tên, tên theo chỉ số, và cột nào là cột chữ. */
function entityWriteColumns(context, fields) {
  var columns = { at: {}, nameAt: {}, text: {} };
  Object.keys(fields).forEach(function (name) {
    var at = columnIndex(context.columnMap, fields[name].code) - 1;
    columns.at[name] = at;
    columns.nameAt[at] = name;
    if (columnFormatIsText(fields[name])) { columns.text[at] = true; }
  });
  return columns;
}

/**
 * Ghi một khối dòng liền nhau trên các cột `cols`: đặt lại khuôn chữ cho ô cột chữ rồi ghi từng dải cột liền nhau.
 * Đặt lại khuôn mỗi lần ghi vì người dùng đổi khuôn cột được bằng hai cú bấm, và ghi `'0101243150'` vào ô số thì mất số 0 đầu không lấy lại được. Chỉ cột chữ, chỉ ô sắp ghi, để không xóa khuôn hiển thị người dùng tự chọn.
 * `fillMissing`: khối dòng mới, ô thiếu khóa ghi rỗng; khối dòng cũ thì mọi bản ghi trong lô mang đủ khóa của lô.
 */
function entityWriteBlock(context, columns, firstRow, writes, cols, fillMissing) {
  sheetRegionsSpans(cols.filter(function (at) { return columns.text[at]; })).forEach(function (span) {
    sheetCellsFormat(context.sheet, firstRow, span[0] + 1, writes.length, span.length, COLUMN_FORMAT_TEXT);
  });
  sheetRegionsSpans(cols).forEach(function (span) {
    var matrix = writes.map(function (write) {
      return span.map(function (at) {
        var name = columns.nameAt[at];
        var value = !fillMissing || Object.prototype.hasOwnProperty.call(write.values, name) ? write.values[name] : '';
        return columns.text[at] ? entityWriteQuoteText(value) : value;
      });
    });
    sheetCellsWrite(context.sheet, firstRow, span[0] + 1, matrix);
  });
}

/**
 * Dấu nháy đơn trước mọi chuỗi ghi vào cột chữ (quyết định của chủ dự án 08/09/2026): khuôn `@` không giữ được số 0 đầu khi người dùng đổi khuôn ô rồi gõ lại; ô mang dấu nháy thì `getValue` vẫn đọc về chuỗi không dấu nháy, nên đường nạp và phép kiểm trùng không bị lệch.
 * Thêm ở đây, sau mọi phép kiểm: kiểm phải chạy trên giá trị sạch. Chuỗi rỗng giữ rỗng.
 */
function entityWriteQuoteText(value) {
  if (typeof value !== 'string' || value === '') { return value; }
  return "'" + value;
}
