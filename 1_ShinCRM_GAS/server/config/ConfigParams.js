/** Danh mục tham số là nguồn duy nhất cho tên, quyền sở hữu, kiểu, mặc định, lựa chọn và hướng dẫn trên sheet `Config`. */

var CONFIG_PARAM_OWNER_USER = 'user';
var CONFIG_PARAM_OWNER_SYSTEM = 'system';
var SORT_LEVEL_OPTIONS = ['Tăng dần (A → Z)', 'Giảm dần (Z → A)'];

/** Hai bộ đếm dùng chung cặp cột tham số nhưng vẫn là trạng thái do cửa cấp mã sở hữu. */
var ID_COUNTER_CONFIG_NAMES = {
  customer: 'ID_COUNTER_CUSTOMER',
  activity: 'ID_COUNTER_ACTIVITY'
};

/**
 * Danh mục theo thứ tự gieo xuống sheet.
 *
 * Là hàm chứ không phải hằng vì nó nhắc tới hằng của tệp khác, mà Apps Script tự chọn thứ tự nạp tệp. `note` đi vào ghi chú của ô tên — khối chỉ có hai cột nên không có cột mô tả để thêm.
 */
function configParamCatalog() {
  return [
    {
      name: LOG_TRACE_CONFIG_NAME,
      owner: CONFIG_PARAM_OWNER_USER,
      type: 'TEXT',
      defaultValue: '',
      note: 'Bật chế độ ghi log chi tiết ra sheet Log.\n\n'
        + 'Để trống = tắt. Ngày thường để trống.\n'
        + '"all" = bật cho mọi nguồn.\n'
        + 'Hoặc kể tên nguồn, cách nhau bằng dấu phẩy: core, sidebar, fbm_sync, bot.\n\n'
        + 'CẢNH BÁO: đang bật thì log ghi cả bí mật ra nguyên văn. Tắt trước khi chia sẻ tệp.'
    },
    {
      name: CELL_BUDGET_CONFIG_NAME,
      owner: CONFIG_PARAM_OWNER_USER,
      type: 'NUMBER',
      minimum: 1,
      defaultValue: '',
      note: 'Trần tổng số ô của cả tệp, tính cả ô rỗng. Vượt trần thì sidebar chặn hẳn, không nạp dữ liệu.\n\n'
        + 'Để trống = dùng mặc định ' + CELL_BUDGET_DEFAULT + ' ô.\n'
        + 'Gõ số bình thường; dấu chấm hay dấu phẩy phân cách nghìn cũng đọc được.'
    },
    {
      name: ID_COUNTER_CONFIG_NAMES.customer,
      owner: CONFIG_PARAM_OWNER_SYSTEM,
      type: 'NUMBER',
      minimum: 0,
      defaultValue: 0,
      note: 'Bộ đếm cấp mã khách hàng do ShinCRM tự quản lý.\n\n'
        + 'Giá trị là phần số lớn nhất đã cấp. Không sửa bằng tay; cửa cấp mã luôn đối chiếu với mã lớn nhất trong sheet Customer trước khi cấp mã mới.'
    },
    {
      name: ID_COUNTER_CONFIG_NAMES.activity,
      owner: CONFIG_PARAM_OWNER_SYSTEM,
      type: 'NUMBER',
      minimum: 0,
      defaultValue: 0,
      note: 'Bộ đếm cấp mã lần làm việc do ShinCRM tự quản lý.\n\n'
        + 'Giá trị là phần số lớn nhất đã cấp. Không sửa bằng tay; cửa cấp mã luôn đối chiếu với mã lớn nhất trong sheet Activity trước khi cấp mã mới.'
    }
  ];
}

/** Tên các tham số theo thứ tự gieo. Phép gieo và phép nghiệm thu dùng chung hàm này nên không có hai bản sao lệch nhau. */
function configParamNames() {
  return configParamCatalog().map(function (item) { return item.name; });
}

function configParamByName(name) {
  var wanted = String(name || '').trim();
  var found = null;
  configParamCatalog().some(function (item) {
    if (item.name !== wanted) { return false; }
    found = item;
    return true;
  });
  return found;
}

/** Tham số gửi cho client: giữ mọi tên không phải trạng thái hệ thống để không làm mất núm do module khác bổ sung sau này. */
function configUserParams(allParams) {
  var source = allParams || {};
  var result = {};
  Object.keys(source).forEach(function (name) {
    var item = configParamByName(name);
    if (!item || item.owner !== CONFIG_PARAM_OWNER_SYSTEM) { result[name] = source[name]; }
  });
  return result;
}

/** Giữ hợp đồng RAM `{ customer, activity }` dù vị trí lưu vật lý đã chuyển vào khối tham số. */
function configCounterValues(allParams) {
  var source = allParams || {};
  return {
    customer: Object.prototype.hasOwnProperty.call(source, ID_COUNTER_CONFIG_NAMES.customer) ? source[ID_COUNTER_CONFIG_NAMES.customer] : '',
    activity: Object.prototype.hasOwnProperty.call(source, ID_COUNTER_CONFIG_NAMES.activity) ? source[ID_COUNTER_CONFIG_NAMES.activity] : ''
  };
}
