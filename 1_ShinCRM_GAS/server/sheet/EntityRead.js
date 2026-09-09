/**
 * Đọc bản ghi của một thực thể từ sheet ra dạng truyền được sang client. Tài liệu 05 Phần 11 và Phần 12.
 *
 * Tệp này biết về **thực thể và cột**: bảng khai trường nào, mã cột `@` nào, kiểu gì. Nó không biết về lưới (chuyện đó ở `SheetGrid.gs`) và không biết về trình tự khởi động hay cỡ gói (chuyện đó ở `LoadService.gs`).
 *
 * **Dạng truyền là Array of Arrays**, không phải mảng object: `{ fields, rows }`. Lý do là kích thước. Một object có hai mươi khóa nhắc lại tên khóa ở từng bản ghi; với 1.700 khách thì tên trường được gửi 1.700 lần. Gửi bảng tên **một lần** ở `fields` rồi gửi các hàng giá trị thuần cắt payload xuống khoảng một phần ba, và payload là thứ quyết định lượt mở sidebar mất hai giây hay tám giây.
 *
 * `fields` chứa **tên trường**, tuyệt đối không chứa mã cột `@`. Mã cột chỉ tồn tại ở `DataSchema.gs` và ở hàng 1 của sheet; để nó lọt sang client là mở đường cho client tự đọc sheet theo mã, và khi đó bảng khai không còn là bản gốc duy nhất nữa.
 *
 */

/** Tên các trường của một thực thể, theo đúng thứ tự khai. Đây là bảng `fields` gửi kèm mỗi gói. */
function entityReadFields(entity, schema) {
  var fields = schema || DATA_SCHEMA[entity];
  if (!fields) {
    throw new Error('Không có thực thể "' + entity + '" trong DATA_SCHEMA. Chỉ có: ' + Object.keys(DATA_SCHEMA).join(', ') + '.');
  }
  return Object.keys(fields);
}

/**
 * Số hàng dữ liệu của một thực thể, không đọc ô nào.
 *
 * Có hàm riêng thay vì hỏi `entityReadContext(entity).rowCount` vì `loadCore` chỉ cần **con số** để báo cho dải tiến trình biết mẫu số, mà dựng cả bối cảnh thì tốn thêm một lệnh đọc hàng 1 và một lệnh hỏi múi giờ — hai lệnh gọi mạng cho một câu hỏi đã trả lời được bằng `getLastRow`.
 */
function entityRowCount(entity) {
  var sheetName = ENTITY_SHEETS[entity];
  if (!sheetName) {
    throw new Error('Không có sheet khai cho thực thể "' + entity + '" trong ENTITY_SHEETS.');
  }
  return sheetGridDataRowCount(shinOpenSheet(sheetName), SHEET_FIRST_DATA_ROW);
}

/**
 * Gom sẵn mọi thứ cần cho việc đọc một thực thể: sheet, bảng tra mã cột, múi giờ tệp, và bảng chỉ số cột theo tên trường.
 *
 * Tách ra thành một hàm riêng vì đây là phần **đắt và không đổi** của phép đọc: mở sheet, đọc cả hàng 1, hỏi múi giờ tệp. Nạp giao dịch chia thành nhiều gói, nên nếu mỗi gói tự dựng lại mấy thứ này thì một tệp mười gói tốn thêm ba mươi lệnh gọi mạng cho cùng một câu trả lời. Dựng một lần rồi truyền vào từng gói.
 *
 * Múi giờ lấy từ tệp Sheet chứ không chốt cứng trong code — lý do ở `DateText.gs`.
 */
function entityReadContext(entity, schema) {
  var fields = schema || DATA_SCHEMA[entity];
  var names = entityReadFields(entity, fields);
  var sheetName = ENTITY_SHEETS[entity];

  if (!sheetName) {
    throw new Error('Không có sheet khai cho thực thể "' + entity + '" trong ENTITY_SHEETS.');
  }

  var sheet = shinOpenSheet(sheetName);
  var columnMap = readColumnMap(sheetName);

  return {
    entity: entity,
    sheetName: sheetName,
    sheet: sheet,
    columnMap: columnMap,
    timezone: shinOpenBook().getSpreadsheetTimeZone(),
    names: names,
    specs: names.map(function (name) { return fields[name]; }),
    indexes: names.map(function (name) { return columnIndex(columnMap, fields[name].code) - 1; }),
    idAt: names.indexOf('id'),
    rowCount: sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW)
  };
}

/**
 * Một giá trị ô thành giá trị truyền được, theo kiểu khai của trường.
 *
 * Ba kiểu ra ba đường, và cả ba đều **không phán xét dữ liệu** — ô gõ lạ đi qua nguyên văn để nó hiện lên form và sửa được, chứ không làm vỡ lượt nạp. Lý do đầy đủ ở `DateText.gs`.
 *
 * TEXT và SELECT có cắt khoảng trắng hai đầu, và đây là phép chuẩn hóa **duy nhất** của đường đọc. Nó cần thiết vì hai giá trị chỉ khác nhau một dấu cách cuối là hai giá trị khác nhau với phép kiểm trùng mã số thuế và với chỉ mục tìm kiếm, trong khi với người dùng chúng là một. Mọi phép chuẩn hóa khác (`codeLike`, `newlineLf`) thuộc cửa ghi, không thuộc đây.
 */
function entityReadCell(value, field, timezone) {
  if (field.type === 'DATE') { return dateToText(value, field.precision, timezone); }

  if (field.type === 'NUMBER') {
    if (value === null || value === undefined || value === '') { return ''; }
    if (typeof value === 'number') { return value; }
    return String(value).trim();
  }

  if (value === null || value === undefined) { return ''; }
  return String(value).trim();
}

/**
 * Đọc `rowCount` hàng kể từ hàng `firstRow`, dùng bối cảnh đã dựng sẵn. Trả về `{ entity, fields, rows, blankRows }`.
 *
 * **Bỏ qua hàng không có mã bản ghi**, và đếm số hàng đã bỏ vào `blankRows`. Đây không phải phép lọc theo nội dung — máy chủ vẫn gửi mọi bản ghi, kể cả bản ghi đã xóa mềm, đúng theo ràng buộc cứng của tài liệu 05 Phần 4. Đây là phép loại hàng **không phải bản ghi**: người dùng xóa nội dung một hàng mà không xóa hàng thì để lại một hàng trắng, và một hàng trắng đi tới client sẽ thành một khách có mã rỗng, ghi đè lên đúng ô `customers[""]` mà hàng trắng tiếp theo cũng nhắm vào. Đếm số hàng bỏ qua để con số đó hiện ra ở log thay vì biến mất trong im lặng.
 *
 * **Không đảo thứ tự trong gói.** Luật nạp ngược của tài liệu 05 Phần 4 nói về **gói nào đọc trước**, và việc chọn gói là của `LoadService.gs`. Trong một gói, hàng vẫn xếp từ trên xuống để giữ thứ tự đọc ổn định.
 */
function entityReadRange(context, firstRow, rowCount) {
  var block = sheetGridReadBlock(context.sheet, firstRow, rowCount, context.columnMap.lastColumn);
  var rows = [];
  var blankRows = 0;

  block.forEach(function (raw, offset) {
    var record = context.indexes.map(function (at, k) { return entityReadCell(raw[at], context.specs[k], context.timezone); });

    if (!record[context.idAt]) {
      blankRows += 1;
      return;
    }

    rows.push(record);
  });

  return { entity: context.entity, fields: context.names, rows: rows, blankRows: blankRows };
}

/** Đọc trọn một thực thể trong một lượt. Dùng cho `customer`, thứ tài liệu 05 Phần 4 yêu cầu nạp hết ngay ở `loadCore`. */
function entityReadAll(entity, schema) {
  var context = entityReadContext(entity, schema);
  return entityReadRange(context, SHEET_FIRST_DATA_ROW, context.rowCount);
}

/**
 * Đọc một thực thể với tập schema mở rộng do module gọi truyền vào.
 * Tầng đọc chỉ biết cách hợp nhất khai báo; nó không biết module nào sở hữu schema đó.
 */
function entityReadAllCombined(entity, schemas) {
  var danhSach = Array.isArray(schemas) ? schemas : [];
  var fields = {};
  danhSach.forEach(function (schema) {
    var phan = schema && schema[entity];
    if (!phan) { return; }
    Object.keys(phan).forEach(function (name) {
      if (fields[name]) { throw new Error('Trường "' + name + '" khai trùng trong schema đọc.'); }
      fields[name] = phan[name];
    });
  });
  if (!Object.keys(fields).length) { return entityReadAll(entity); }

  return entityReadAll(entity, fields);
}

/** Phép nghiệm thu chạy được trên Google: đọc thử cả hai thực thể trên tệp thật và in ra bảng tên trường cùng vài hàng đầu. */
function probeEntityRead() {
  var report = [];

  Object.keys(ENTITY_SHEETS).forEach(function (entity) {
    var goi = entityReadAll(entity);

    report.push(entity + ' (' + ENTITY_SHEETS[entity] + '): ' + goi.rows.length + ' bản ghi, ' + goi.blankRows + ' hàng trắng bỏ qua');
    report.push('  fields (' + goi.fields.length + '): ' + goi.fields.join(', '));
    report.push('  không có mã cột @ nào lọt vào fields? ' + !goi.fields.some(function (name) { return name.indexOf('@') === 0; }));
    goi.rows.slice(0, 3).forEach(function (row) { report.push('  hàng mẫu: ' + JSON.stringify(row)); });
  });

  report.forEach(function (line) { Logger.log(line); });
  return report;
}
