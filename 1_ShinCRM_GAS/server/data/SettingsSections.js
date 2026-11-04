/**
 * Bảng khai các phần cài đặt người dùng chỉnh được, và danh sách gom phần của mọi module cho cổng cài đặt. Tài liệu 01 Phần 2.8.
 *
 * Một phần là dữ liệu: `name` (tên phần, cũng là đuôi khóa kho), `owner` (module sở hữu), `label`, `fields` theo tên trường; `sidebarConfig: true` khi phần nằm trong gói `config` của Sidebar (lưu xong phải nạp lại); `check` (tùy chọn, thuần) nhận giá trị hiệu lực cả phần, trả danh sách `{ field, reason }` cho ràng buộc giữa các trường. Mỗi trường có `kind` (một kiểu của `SETTINGS_KINDS`), `label`, `hint` (hướng dẫn cho màn Cài đặt), `default` (tùy chọn: giá trị khi để trống, nơi duy nhất giữ mặc định) và thuộc tính riêng của kiểu (`options` + `empty`, `min`, `max`, `entities`, `pattern`, `maxItems`).
 *
 * Ngầm định gõ tay gắn với kênh nhập: mỗi kênh một phần riêng (`defaults_sidebar` của lõi, `defaults_fbm_pull` của `fbm_sync`, sau này kênh bot có phần của bot), cùng kiểu `fieldDefaults` nên cùng một bộ kiểm.
 *
 * Gõ sai mà làm hỏng code thì không thuộc đây mà thuộc `SETTINGS` (tài liệu 01 Phần 2.8).
 */

/** Nguồn log có thể bật vết; `all` và tổ hợp là lựa chọn vận hành, không phải nguồn mới. */
var LOG_TRACE_SOURCE_OPTIONS = ['off', 'all', 'core', 'sidebar', 'fbm_sync', 'core,sidebar'];

/** Tên trường của phần `core_ops`; mỗi tên đặt cạnh chỗ đọc nó để bên đọc không gõ chuỗi tay. */
var LOG_TRACE_SETTING = 'LOG_TRACE';
var CELL_BUDGET_SETTING = 'CELL_BUDGET';
var USER_NAME_SETTING = 'USER_NAME';

function coreSettingsSections() {
  return [
    {
      name: 'core_ops',
      owner: 'core',
      label: 'Vận hành',
      sidebarConfig: true,
      fields: {
        [LOG_TRACE_SETTING]: {
          kind: 'select', label: 'Ghi log chi tiết', options: LOG_TRACE_SOURCE_OPTIONS, empty: 'off',
          hint: 'Bật ghi log chi tiết ra sheet Log. off = tắt; all = mọi nguồn; hoặc chọn nguồn. Chỉ bật trong lúc chẩn đoán: mật khẩu, cookie, token luôn bị che nhưng dữ liệu khách ghi nguyên văn. Tắt trước khi chia sẻ tệp.'
        },
        [CELL_BUDGET_SETTING]: {
          kind: 'number', label: 'Trần số ô của tệp', min: 1,
          hint: 'Trần tổng số ô của cả tệp, tính cả ô rỗng. Vượt trần thì Sidebar chặn, không nạp dữ liệu. Để trống = dùng mặc định ' + CELL_BUDGET_DEFAULT + ' ô.'
        },
        [USER_NAME_SETTING]: {
          kind: 'text', label: 'Tên người dùng', max: 100,
          hint: 'Tự điền vào cột "Người tạo trên FBM" của giao dịch tạo mới. Gõ đúng tên đầy đủ của tài khoản FBM để giao dịch chưa và đã đồng bộ hiện cùng một tên. Để trống = cột này trống cho tới khi giao dịch được đồng bộ.'
        }
      }
    },
    {
      name: 'core_data',
      owner: 'core',
      label: 'Dữ liệu',
      sidebarConfig: true,
      fields: {
        columnTypes: {
          kind: 'columnTypes', label: 'Kiểu cột tự thêm',
          hint: 'Kiểu của cột người dùng tự thêm vào sheet Customer/Activity (theo mã cột @). Cột không khai ở đây được đọc là chữ.'
        },
        sort: {
          kind: 'sortLevels', label: 'Sắp xếp chung',
          hint: 'Thứ tự sắp xếp mặc định của sheet quản trị, cấp trên ưu tiên trước. Sheet quản trị có ô sắp xếp riêng thì dùng ô riêng.'
        }
      }
    },
    {
      name: 'defaults_sidebar',
      owner: 'core',
      sidebarConfig: true,
      label: 'Ngầm định khi nhập trên Sidebar',
      fields: {
        values: {
          kind: 'fieldDefaults', label: 'Giá trị điền sẵn',
          hint: 'Giá trị điền sẵn vào form thêm mới trên Sidebar. Giá trị không còn hợp lệ (ví dụ đã xóa khỏi Category) thì không điền và Sidebar báo để sửa.'
        }
      }
    }
  ];
}

/**
 * Module có phần cài đặt riêng tự đăng ký hàm trả danh sách phần ở tệp của mình, khóa là tên module; lõi không biết module nào tồn tại. Module không có trong bản cài thì không đăng ký, nên không có phần của nó.
 * Khai báo dạng `var ... typeof` vì GAS nạp tệp không theo thứ tự cố định: tệp đăng ký có thể chạy trước tệp này.
 */
var SETTINGS_SECTION_PROVIDERS = typeof SETTINGS_SECTION_PROVIDERS !== 'undefined' ? SETTINGS_SECTION_PROVIDERS : {};

/** Mọi phần cài đặt đang có. Hai phần trùng tên là lỗi lập trình (hai module tranh một khóa kho), ném ngay. */
function settingsSectionList() {
  var list = coreSettingsSections();
  Object.keys(SETTINGS_SECTION_PROVIDERS).forEach(function (owner) { list = list.concat(SETTINGS_SECTION_PROVIDERS[owner]()); });
  var seen = {};
  list.forEach(function (section) {
    if (seen[section.name]) { throw new Error('Hai module cùng khai phần cài đặt "' + section.name + '" (' + seen[section.name] + ', ' + section.owner + ').'); }
    seen[section.name] = section.owner;
  });
  return list;
}
