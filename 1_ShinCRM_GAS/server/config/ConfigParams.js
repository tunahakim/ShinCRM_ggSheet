/** Danh mục tham số là nguồn duy nhất cho tên, quyền sở hữu, kiểu, mặc định, lựa chọn và hướng dẫn trên sheet `Config`. */

var CONFIG_PARAM_OWNER_USER = 'user';
var CONFIG_PARAM_OWNER_SYSTEM = 'system';
var SORT_LEVEL_OPTIONS = ['Tăng dần (A → Z)', 'Giảm dần (Z → A)'];
/** Nguồn log đang có trong bản ShinCRM độc lập; `all` và tổ hợp hiện tại là lựa chọn vận hành, không phải nguồn mới. */
var LOG_TRACE_SOURCE_OPTIONS = ['off', 'all', 'core', 'sidebar', 'fbm_sync', 'core,sidebar'];

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
      options: LOG_TRACE_SOURCE_OPTIONS,
      defaultValue: 'off',
      note: 'Bật chế độ ghi log chi tiết ra sheet Log.\n\n'
        + 'off = tắt. Giá trị trống của Config cũ vẫn được hiểu là tắt và sẽ được chuẩn hóa thành off khi chạy chuẩn bị/reset Config.\n'
        + '"all" = bật cho mọi nguồn.\n'
        + 'Hoặc kể tên nguồn, cách nhau bằng dấu phẩy: core, sidebar, fbm_sync, bot.\n\n'
        + 'CẢNH BÁO: chỉ bật trong lúc chẩn đoán. Password, cookie, token và envelope đăng nhập luôn bị che; payload FBM/GAS chỉ ghi tóm tắt. Tắt sau khi kiểm tra xong trước khi chia sẻ tệp.'
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
      name: WRITE_GATE_CREATOR_CONFIG_NAME,
      owner: CONFIG_PARAM_OWNER_USER,
      type: 'TEXT',
      defaultValue: '',
      note: 'Tên người dùng ShinCRM, tự điền vào cột "Người tạo trên FBM" của giao dịch tạo mới.\n\n'
        + 'Gõ đúng tên đầy đủ của tài khoản FBM (ví dụ: Lê Tuấn Anh) để giao dịch chưa đồng bộ và đã đồng bộ hiện cùng một tên; giao dịch đã đồng bộ luôn lấy tên người tạo thật trên FBM.\n'
        + 'Để trống = cột này trống cho tới khi giao dịch được đồng bộ FBM.'
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

