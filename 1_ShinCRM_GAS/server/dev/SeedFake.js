/**
 * Sinh dữ liệu giả cho sheet `Customer` và `Activity`, **để lại trên sheet** để người ngồi ngoài mở ra xem được.
 *
 * Khác `MeasureChunk.gs` ở đúng một điểm và đó là điểm quan trọng: tệp kia ghi rồi xóa ngay trong cùng một lượt chạy, nên nhìn vào sheet sau đó thì thấy trắng. Tệp này ghi rồi để nguyên.
 *
 * **Mọi cột `@` đều có giá trị**, vì vòng sinh đi theo `DATA_SCHEMA` chứ không theo danh sách gõ tay — thêm một trường vào bảng khai thì trường đó tự có dữ liệu giả, không có đường nào bỏ sót một cột.
 *
 * Tệp này bị xóa cùng cả thư mục `server/dev/` trước khi Sheet chứa dữ liệu khách thật.
 */

/** Số bản ghi giả. Lấy đúng cỡ thật đang chờ: khoảng 1.700 khách, và mười nghìn giao dịch. */
var SEED_FAKE_CUSTOMERS = 1700;
var SEED_FAKE_ACTIVITIES = 10000;

/** Giá trị giả cho các trường SELECT, tra theo mã danh mục nguồn. Trường nào có `options` khai sẵn thì dùng `options`, không tra bảng này. */
var SEED_FAKE_SELECT = {
  '@CAT_TINH_THANH': ['Hà Nội', 'Hải Phòng', 'Đà Nẵng', 'TP Hồ Chí Minh', 'Cần Thơ'],
  '@CAT_NHOM_KH': ['Nhóm A', 'Nhóm B', 'Nhóm C'],
  '@CAT_SAN_PHAM': ['Thép hộp', 'Thép tấm', 'Tôn mạ kẽm', 'Ống thép'],
  '@CAT_NGUON_KH': ['FBM', 'Giới thiệu', 'Tự tìm', 'Hội chợ'],
  '@CAT_XAC_THUC': ['Đã xác thực', 'Chưa xác thực'],
  '@CAT_CHO_PHEP_FBM': ['Cho phép', 'Chưa cho phép', 'Ngừng đồng bộ'],
  '@CAT_CONG_VIEC': ['Gọi điện', 'Gặp mặt', 'Gửi báo giá', 'Chốt đơn'],
  '@CAT_UU_TIEN': ['Cao', 'Thường', 'Thấp'],
  '@CAT_NGUOI_NHAP_LIEU': ['Hakim', 'Trợ lý 1', 'Trợ lý 2']
};

/** Giá trị giả cho những trường TEXT cần trông ra hình dáng thật, vì mã số thuế hay email mà là "Nhãn giả 7" thì phép kiểm định dạng không thử được gì. */
var SEED_FAKE_TEXT = {
  companyName: function (i) { return 'Công ty ' + ['Xây dựng', 'Thương mại', 'Cơ khí', 'Kỹ thuật'][i % 4] + ' ' + ['Đông Á', 'Hải Phòng', 'Minh Long', 'Tân Tiến', 'Phú Thịnh'][i % 5] + ' ' + (i + 1); },
  taxNumber: function (i) { return String(100000000 + i * 7); },
  phone: function (i) { return '09' + String(10000000 + i * 13).slice(0, 8); },
  email: function (i) { return 'lienhe' + (i + 1) + '@congtygia.vn'; },
  address: function (i) { return 'Số ' + (i % 300 + 1) + ' đường Giả, phường ' + (i % 20 + 1); },
  website: function (i) { return 'https://congtygia' + (i + 1) + '.vn'; },
  contactPerson: function (i) { return ['Anh', 'Chị'][i % 2] + ' ' + ['Nam', 'Hương', 'Tuấn', 'Lan', 'Dũng'][i % 5] + ' ' + (i + 1); },
  parentCompanyName: function (i) { return 'Tập đoàn Giả ' + (i % 40 + 1); },
  note: function (i) { return 'Ghi chú giả cho bản ghi thứ ' + (i + 1) + ', dòng này cố ý dài để thử ô nội dung nhiều chữ.'; },
  searchAliases: function (i) { return 'kh' + (i + 1) + ' giả test'; },
  content: function (i) { return 'Nội dung công việc giả số ' + (i + 1) + '. Trao đổi về đơn hàng, chờ khách phản hồi.'; }
};

/** Một giá trị giả cho một trường, theo kiểu khai của trường. Đây là chỗ duy nhất quyết định hình dáng dữ liệu giả. */
function seedFakeValue(name, field, i) {
  if (field.type === 'DATE') {
    var ngay = new Date(2026, 0, 1 + (i % 300));
    if (field.precision === 'day') { return ngay; }
    return new Date(2026, 0, 1 + (i % 300), 8 + (i % 10), (i * 7) % 60);
  }

  if (field.type === 'NUMBER') { return (i % 97 + 1) * 1000000; }

  if (field.type === 'SELECT') {
    if (name === 'recordStatus') { return i % 50 === 0 ? 'deleted' : 'active'; }
    var chon = field.options || SEED_FAKE_SELECT[field.source] || ['Giá trị giả'];
    return chon[i % chon.length];
  }

  if (SEED_FAKE_TEXT[name]) { return SEED_FAKE_TEXT[name](i); }
  return field.label + ' giả ' + (i + 1);
}

/** Mã bản ghi giả, sáu số cho dễ đọc trên sheet. */
function seedFakeCode(entity, i) {
  return (entity === 'customer' ? 'KH' : 'GD') + String(1000001 + i).slice(1);
}

/**
 * Những mã cột có ở hàng 1 của sheet mà vòng sinh **không** điền, vì lõi không khai chúng ở `DATA_SCHEMA`.
 *
 * Có hàm này để báo ra chứ không để im lặng: chủ dự án yêu cầu mọi cột `@` đều có dữ liệu, nên chỗ nào không có thì phải nói rõ là chỗ nào và vì sao, thay vì để người mở sheet tự phát hiện một cột trắng.
 */
function seedFakeUnfilled(context) {
  var daDien = {};
  context.indexes.forEach(function (at) { daDien[at] = true; });

  return context.columnMap.headerRow.filter(function (code, at) {
    return code && !daDien[at];
  });
}

/**
 * Dựng khối hàng giả cho một thực thể, rộng đúng bằng lưới cột thật.
 *
 * `ghiDe` là bảng chèn giá trị riêng theo tên trường, dùng cho hai trường không sinh máy móc được: mã bản ghi phải theo bộ đếm, và mã khách của giao dịch phải trỏ vào một khách có thật.
 */
function seedFakeRows(context, count, ghiDe) {
  var rows = [];

  for (var i = 0; i < count; i++) {
    var hang = new Array(context.columnMap.lastColumn);
    for (var c = 0; c < hang.length; c++) { hang[c] = ''; }

    for (var k = 0; k < context.names.length; k++) {
      var name = context.names[k];
      hang[context.indexes[k]] = ghiDe[name] ? ghiDe[name](i) : seedFakeValue(name, context.specs[k], i);
    }

    rows.push(hang);
  }

  return rows;
}

/** Ghi một khối hàng vào sheet từ hàng dữ liệu đầu, nới lưới trước. Trả về số ms. */
function seedFakeWrite(sheet, rows) {
  var batDau = Date.now();
  sheetGridEnsureRoom(sheet, SHEET_FIRST_DATA_ROW + rows.length - 1);
  sheet.getRange(SHEET_FIRST_DATA_ROW, 1, rows.length, rows[0].length).setValues(rows);
  SpreadsheetApp.flush();
  return Date.now() - batDau;
}

/**
 * Ghi danh mục giả vào sheet `Category`, lấy giá trị từ **cùng bảng** `SEED_FAKE_SELECT` mà hai sheet dữ liệu dùng.
 *
 * Dùng chung một bảng là chỗ đáng nói: nếu danh mục và dữ liệu lấy từ hai nguồn khác nhau thì mọi ô SELECT trên sheet sẽ là một giá trị ngoài danh mục, và lúc dựng ô chọn ở chặng 1.3 thì không phân biệt được đó là lỗi code hay là dữ liệu giả đặt lệch.
 *
 * Cột đi kèm `_FBM` nhận mã giả dạng `FBM-1`, xếp đúng hàng với danh mục gốc. Nhận diện cột đi kèm bằng `categoryIsCompanion` chứ không tự xét hậu tố, vì `@CAT_CHO_PHEP_FBM` cũng kết thúc bằng `_FBM` mà nó là một danh mục thật.
 */
function seedFakeCategory() {
  var sheet = shinOpenSheet('Category');
  var columnMap = readColumnMap('Category');

  var lists = {};
  var caoNhat = 0;

  CATEGORY_COLUMNS.forEach(function (pair) {
    var code = pair[0];
    var goc = categoryIsCompanion(code) ? code.slice(0, code.length - CATEGORY_FBM_SUFFIX.length) : code;
    var giaTri = SEED_FAKE_SELECT[goc] || ['Giá trị giả'];

    lists[code] = categoryIsCompanion(code)
      ? giaTri.map(function (item, i) { return 'FBM-' + (i + 1); })
      : giaTri.slice();

    caoNhat = Math.max(caoNhat, lists[code].length);
  });

  var rows = [];
  for (var r = 0; r < caoNhat; r++) {
    var hang = new Array(columnMap.lastColumn);
    for (var c = 0; c < hang.length; c++) { hang[c] = ''; }
    CATEGORY_COLUMNS.forEach(function (pair) {
      var at = columnIndex(columnMap, pair[0]) - 1;
      hang[at] = lists[pair[0]][r] === undefined ? '' : lists[pair[0]][r];
    });
    rows.push(hang);
  }

  var con = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
  if (con > 0) { sheet.deleteRows(SHEET_FIRST_DATA_ROW, con); }
  var ms = seedFakeWrite(sheet, rows);

  return 'Category: ghi ' + rows.length + ' hàng cho ' + CATEGORY_COLUMNS.length + ' cột (' + categoryCodes().length + ' danh mục thật, ' + (CATEGORY_COLUMNS.length - categoryCodes().length) + ' cột đi kèm FBM), ' + ms + ' ms';
}

/**
 * Sinh dữ liệu giả cho cả hai sheet dữ liệu và **để lại trên sheet**.
 *
 * **Chặn cứng:** sheet nào đã có hàng dữ liệu thì ném lỗi và không ghi gì. Muốn chạy lại thì gọi `wipeFakeData` trước — bắt gọi tay như vậy để không có đường nào một hàm sinh dữ liệu tự tay xóa dữ liệu đang có.
 */
function seedFakeData() {
  var khach = entityReadContext('customer');
  var gd = entityReadContext('activity');

  if (khach.rowCount !== 0 || gd.rowCount !== 0) {
    throw new Error('Customer đang có ' + khach.rowCount + ' hàng, Activity đang có ' + gd.rowCount + ' hàng. Gọi wipeFakeData trước rồi chạy lại. Không ghi gì cả.');
  }

  var lines = [
    'ShinCRM — sinh dữ liệu giả và ĐỂ LẠI trên sheet',
    'Customer: ' + khach.names.length + ' trường, lưới ' + khach.columnMap.lastColumn + ' cột. Activity: ' + gd.names.length + ' trường, lưới ' + gd.columnMap.lastColumn + ' cột.',
    'Mọi cột @ đều có giá trị, vì vòng sinh đi theo DATA_SCHEMA chứ không theo danh sách gõ tay.',
    ''
  ];

  lines.push(seedFakeCategory());

  var hangKhach = seedFakeRows(khach, SEED_FAKE_CUSTOMERS, {
    id: function (i) { return seedFakeCode('customer', i); }
  });
  lines.push('Ghi ' + hangKhach.length + ' khách: ' + seedFakeWrite(khach.sheet, hangKhach) + ' ms');

  var hangGd = seedFakeRows(gd, SEED_FAKE_ACTIVITIES, {
    id: function (i) { return seedFakeCode('activity', i); },
    customerId: function (i) { return seedFakeCode('customer', i % SEED_FAKE_CUSTOMERS); }
  });
  lines.push('Ghi ' + hangGd.length + ' giao dịch: ' + seedFakeWrite(gd.sheet, hangGd) + ' ms');

  [khach, gd].forEach(function (context) {
    var thieu = seedFakeUnfilled(context);
    lines.push(context.sheetName + ': cột @ có ở hàng 1 mà lõi không khai, nên để trắng — ' + (thieu.length ? thieu.join(', ') : 'không có cột nào'));
  });

  var ns = cellBudgetMeasure(shinOpenBook());
  lines.push('');
  lines.push('Sheet đang có: Customer ' + entityRowCount('customer') + ' hàng, Activity ' + entityRowCount('activity') + ' hàng.');
  lines.push('Ngân sách ô sau khi ghi: ' + ns.total + ' / trần ' + ns.ceiling + (ns.exceeded ? ' — VƯỢT TRẦN' : ' — trong ngưỡng'));
  lines.push('Dữ liệu giả ĐỂ NGUYÊN trên sheet. Xóa bằng cách chạy wipeFakeData.');

  var report = lines.join('\n');
  console.log(report);
  return report;
}

/** Xóa hết hàng dữ liệu của `Customer`, `Activity` và `Category`, giữ nguyên ba hàng tiêu đề. Không chạm `Config` và `Log`. */
function wipeFakeData() {
  var lines = ['ShinCRM — xóa dữ liệu giả khỏi Customer, Activity, Category'];

  ['Customer', 'Activity', 'Category'].forEach(function (sheetName) {
    var sheet = shinOpenSheet(sheetName);
    var con = sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW);
    if (con > 0) { sheet.deleteRows(SHEET_FIRST_DATA_ROW, con); }
    SpreadsheetApp.flush();
    lines.push('  ' + sheetName + ': xóa ' + con + ' hàng, còn lại ' + sheetGridDataRowCount(sheet, SHEET_FIRST_DATA_ROW));
  });

  var report = lines.join('\n');
  console.log(report);
  return report;
}
