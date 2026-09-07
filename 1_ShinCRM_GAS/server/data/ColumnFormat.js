/**
 * Khuôn hiển thị (number format) của từng cột trên sheet.
 *
 * Đây không phải chuyện thẩm mỹ mà là chuyện mất dữ liệu: ghi chuỗi `'0101243150'` vào một ô đang ở khuôn General thì Sheets tự hiểu đó là số và cắt luôn số 0 đầu, thành `101243150` — mã số thuế và số điện thoại sai vĩnh viễn mà không có thông báo nào. Bản cũ chống đúng chỗ này bằng `setNumberFormat("@")` trước từng lượt ghi mã số thuế.
 *
 * Bảng nằm riêng ở `server/data/` vì ba nơi cùng hỏi nó: `SetupSheets.js` đặt khuôn lúc dựng khung, `verifySheets` kiểm lại, và `WriteGate.js` đặt lại khuôn cột chữ trước mỗi lệnh ghi.
 */

/** Ô văn bản thuần. Tách thành hằng số vì cửa ghi phải nhận ra "cột này là cột chữ" chứ không chỉ đặt khuôn cho nó. */
var COLUMN_FORMAT_TEXT = '@';

/** Khuôn theo kiểu khai của trường. */
var COLUMN_FORMAT_BY_TYPE = { TEXT: COLUMN_FORMAT_TEXT, SELECT: COLUMN_FORMAT_TEXT, NUMBER: '#,##0.###' };

/** Khuôn của cột `DATE`, tra theo `precision`. Khuôn ngày cũng là khuôn người đọc: chủ dự án đọc thẳng trên sheet nên `dd/mm/yyyy` dễ nhìn hơn con số ngày tháng thô. */
var COLUMN_FORMAT_BY_PRECISION = { day: 'dd/mm/yyyy', minute: 'dd/mm/yyyy HH:mm' };

/**
 * Sheet khai cột thẳng ở `SHEET_LAYOUT` thì khuôn khai ở đây, một khuôn cho cả sheet.
 *
 * `Category` là văn bản thuần toàn bộ: giá trị danh mục có thứ trông như số (`01`, mã FBM), và một danh mục mất số 0 đầu thì giá trị đã lưu trong bản ghi khách không còn khớp dòng nào trong danh sách chọn nữa.
 *
 * `Config` và `Log` cố ý không có mặt. Cột `Giá trị` của `Config` là ô người dùng tự vặn núm, và khối bộ đếm thì cửa cấp mã đọc ghi bằng số — ép cả sheet thành chữ ở đó là đổi cách hiện của một sheet chủ dự án đọc hằng ngày để đổi lấy một chỗ chưa hỏng. `Log` chỉ có máy ghi vào.
 */
var COLUMN_FORMAT_WHOLE_SHEET = { Category: COLUMN_FORMAT_TEXT };

/** Khuôn của một trường. Ném lỗi thay vì đoán, vì đoán sai khuôn ngày là một cột hiện sai suốt đời mà không ai để ý. */
function columnFormatOf(entity, name, spec) {
  if (spec.type === 'DATE') {
    var format = COLUMN_FORMAT_BY_PRECISION[spec.precision];
    if (!format) {
      throw new Error('Trường "' + entity + '.' + name + '" kiểu DATE nhưng precision là "' + spec.precision + '" — chỉ có: ' + Object.keys(COLUMN_FORMAT_BY_PRECISION).join(', ') + '.');
    }
    return format;
  }

  var byType = COLUMN_FORMAT_BY_TYPE[spec.type];
  if (!byType) {
    throw new Error('Trường "' + entity + '.' + name + '" khai kiểu "' + spec.type + '", không có khuôn hiển thị cho kiểu này.');
  }
  return byType;
}

/**
 * Bảng `mã cột → khuôn` của một sheet, hoặc `null` khi sheet đó không đặt khuôn.
 *
 * Trả về theo **mã cột** chứ không theo tên trường, vì hai bên gọi ngoài cửa ghi đều làm việc với hàng 1 của sheet.
 */
function columnFormatMap(sheetName) {
  var layout = SHEET_LAYOUT[sheetName];
  if (!layout) {
    throw new Error('Không có khai hình dáng cho sheet "' + sheetName + '" trong SHEET_LAYOUT.');
  }

  var caSheet = COLUMN_FORMAT_WHOLE_SHEET[sheetName];
  if (caSheet) {
    var raCa = {};
    sheetCoreColumns(sheetName).forEach(function (pair) { raCa[pair[0]] = caSheet; });
    return raCa;
  }

  if (!layout.entity) { return null; }

  var fields = DATA_SCHEMA[layout.entity];
  var ra = {};
  Object.keys(fields).forEach(function (ten) { ra[fields[ten].code] = columnFormatOf(layout.entity, ten, fields[ten]); });
  return ra;
}

/** Tên các sheet có đặt khuôn, theo đúng thứ tự của `SHEET_LAYOUT`. Cả `setupColumnFormats` và `verifySheets` chạy theo danh sách này nên không thể lệch nhau. */
function columnFormatSheets() {
  return Object.keys(SHEET_LAYOUT).filter(function (sheetName) { return !!columnFormatMap(sheetName); });
}

/** Trường này có ghi vào ô văn bản thuần không. Kiểu lạ trả về `false` chứ không ném lỗi: cửa ghi nhận cả bảng khai của module ngoài, mà một kiểu chưa biết không được làm hỏng lượt lưu. */
function columnFormatIsText(spec) {
  return COLUMN_FORMAT_BY_TYPE[spec && spec.type] === COLUMN_FORMAT_TEXT;
}
